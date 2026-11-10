import { attach, loaders } from '../common/enrich';
import { Body, Controller, Get, Headers, Param, Post, Query, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { PrismaService } from '../common/prisma.service';
import { Ctx, Idempotent, Public, RateLimit, RequirePermission } from '../auth/decorators';
import { AccessContext } from '../auth/access-context';
import { filterParam, pageParams, paged, parse, zMoney, zReason } from '../common/http';
import { AppError, forbidden, notFound, validation } from '../common/errors';
import { Req as ReqT } from '../common/http';
import { config } from '../common/config';
import { D, maskEmail, maskPhone, newId, nextCustomerCode, vnd } from '../common/util';
import { BillingService } from './billing.service';
import { PaymentService } from './payment.service';
import { CoreService } from '../domain/core.service';
import { AuditService } from '../audit/audit.service';
import { PdfService } from '../media/pdf.service';
import { AuthService } from '../auth/auth.service';

const INVOICE_INCLUDE = {
  facility: { select: { public_id: true, name: true } },
  customer: { select: { public_id: true, full_name: true, code: true } },
  contract: { select: { public_id: true, code: true, unit: { select: { code: true } } } },
  items: { orderBy: { id: 'asc' as const } },
};

/** Billing & payments (spec §6.3 F3, §11.6): invoices, payments, refunds, waivers, ledger, reconciliation, customers. */
@Controller()
export class BillingController {
  constructor(
    private prisma: PrismaService,
    private billing: BillingService,
    private payments: PaymentService,
    private core: CoreService,
    private audit: AuditService,
    private pdf: PdfService,
    private auth: AuthService,
  ) {}

  // ---------------------------------------------------------------- invoices
  @RequirePermission('invoice.read', false)
  @Get('invoices')
  async invoices(@Ctx() ctx: AccessContext, @Query() q: Record<string, unknown>) {
    const p = pageParams(q);
    const status = filterParam(q, 'status');
    const type = filterParam(q, 'type');
    const contractId = filterParam(q, 'contractId');
    const customerId = filterParam(q, 'customerId');
    // the booking invoice is issued against the reservation before the contract exists: it belongs to the contract that grew out of that reservation
    let ctFilter: Record<string, unknown> | null = null;
    if (contractId) {
      const ct = await this.prisma.contract.findUnique({ where: { public_id: contractId }, select: { id: true, reservation_id: true } });
      ctFilter = ct ? { OR: [{ contract_id: ct.id }, ...(ct.reservation_id ? [{ reservation_id: ct.reservation_id }] : [])] } : { id: BigInt(0) };
    }
    // free-text search: invoice code, contract code, unit code, facility, a line description, or an exact amount (150000, 1.250.000 ₫)
    const text = String(q.q ?? '').trim().slice(0, 60);
    const digits = /^[\d.,\s₫đd]+$/i.test(text) ? text.replace(/\D/g, '') : '';
    const searchWhere = text
      ? {
          OR: [
            { code: { contains: text } },
            { contract: { code: { contains: text } } },
            { contract: { unit: { code: { contains: text } } } },
            { facility: { name: { contains: text } } },
            { items: { some: { description: { contains: text } } } },
            ...(digits.length >= 3 ? [{ total: Number(digits) }, { balance_due: Number(digits) }] : []),
          ],
        }
      : null;
    const and = [...(ctFilter ? [ctFilter] : []), ...(searchWhere ? [searchWhere] : [])];
    const where = {
      ...ctx.scope('invoice.read'),
      ...(status ? { status: { in: status.split(',') } } : {}),
      ...(type ? { type: { in: type.split(',') } } : {}),
      ...(and.length ? { AND: and } : {}),
      ...(customerId ? { customer: { public_id: customerId } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.invoice.findMany({ where: where as never, include: INVOICE_INCLUDE, orderBy: { id: 'desc' }, take: p.take, skip: p.skip }),
      this.prisma.invoice.count({ where: where as never }),
    ]);
    return paged(rows, p, total);
  }

  @RequirePermission('invoice.read', false)
  @Get('invoices/:id')
  async invoice(@Ctx() ctx: AccessContext, @Param('id') id: string) {
    const inv = await this.prisma.invoice.findUnique({
      where: { public_id: id },
      include: { ...INVOICE_INCLUDE, allocations: { include: { payment: { select: { public_id: true, code: true, method: true, paid_at: true } } } }, credit_notes: true },
    });
    ctx.assertScope('invoice.read', inv, 'Hóa đơn');
    return inv;
  }

  @RequirePermission('invoice.read', false)
  @Get('invoices/:id/pdf')
  async invoicePdf(@Ctx() ctx: AccessContext, @Param('id') id: string, @Res() res: Response) {
    const inv = await this.prisma.invoice.findUnique({ where: { public_id: id }, include: { items: true, customer: true, facility: true } });
    ctx.assertScope('invoice.read', inv, 'Hóa đơn');
    const fmt = (v: unknown) => new Intl.NumberFormat('vi-VN').format(Number(v)) + ' ₫';
    const buf = await this.pdf.render(`HÓA ĐƠN ${inv!.code}`, inv!.facility.name, [
      { heading: 'Thông tin', rows: [['Khách hàng', `${inv!.customer.full_name} (${inv!.customer.code})`], ['Loại', inv!.type], ['Hạn thanh toán', inv!.due_date.toISOString().slice(0, 10)], ['Trạng thái', inv!.status]] },
      { heading: 'Chi tiết', table: { headers: ['Nội dung', 'SL', 'Thành tiền'], widths: [300, 50, 149], rows: inv!.items.map((i) => [i.description, String(i.quantity), fmt(i.amount)]) } },
      { heading: 'Tổng cộng', rows: [['Thuế', fmt(inv!.tax_total)], ['Tổng', fmt(inv!.total)], ['Đã thanh toán', fmt(inv!.amount_paid)]] },
    ]);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${inv!.code}.pdf"`);
    res.send(buf);
  }

  @RequirePermission('payment.pay')
  @Idempotent()
  @Post('invoices/pay')
  pay(@Ctx() ctx: AccessContext, @Body() body: unknown, @Headers('idempotency-key') idem?: string, @Req() req?: ReqT) {
    const d = parse(z.object({ invoiceIds: z.array(z.string().length(26)).min(1).max(20), returnPath: z.string().max(200).optional() }), body);
    return this.payments.startGateway(ctx, d.invoiceIds, idem, { returnPath: d.returnPath, ip: req?.ip, req });
  }

  @RequirePermission('charge.adjust')
  @Post('contracts/:id/charges')
  charge(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() body: unknown) {
    const d = parse(z.object({ feeTypeId: z.string().min(1), amount: zMoney.optional(), quantity: z.number().int().min(1).max(100).optional(), note: z.string().max(300).optional() }), body);
    return this.billing.addCharge(ctx, id, d);
  }

  @RequirePermission('charge.adjust')
  @Post('invoices/:id/credit-notes')
  creditNote(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() body: unknown) {
    const d = parse(z.object({ amount: zMoney, reason: zReason }), body);
    return this.billing.issueCreditNote(ctx, id, d.amount, d.reason);
  }

  @RequirePermission('charge.adjust')
  @Post('invoices/:id/write-off')
  writeOff(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() body: unknown) {
    if (!ctx.hasRole('BUSINESS_OPS_MANAGER')) throw forbidden('Chỉ Business Operations Manager được xóa nợ khó đòi');
    return this.billing.writeOff(ctx, id, parse(z.object({ reason: zReason }), body).reason);
  }

  // ---------------------------------------------------------------- payments
  @RequirePermission('invoice.read', false)
  @Get('payments')
  async list(@Ctx() ctx: AccessContext, @Query() q: Record<string, unknown>) {
    const p = pageParams(q);
    const status = filterParam(q, 'status');
    const where = { ...ctx.scope('invoice.read'), ...(status ? { status: { in: status.split(',') } } : {}) };
    const [rows, total] = await Promise.all([
      this.prisma.payment.findMany({ where: where as never, include: { customer: { select: { public_id: true, full_name: true } }, allocations: { include: { invoice: { select: { public_id: true, code: true } } } } }, orderBy: { id: 'desc' }, take: p.take, skip: p.skip }),
      this.prisma.payment.count({ where: where as never }),
    ]);
    return paged(rows, p, total);
  }

  @RequirePermission('invoice.read', false)
  @Get('payments/:id')
  async one(@Ctx() ctx: AccessContext, @Param('id') id: string) {
    const pay = await this.prisma.payment.findUnique({ where: { public_id: id }, include: { allocations: { include: { invoice: { select: { public_id: true, code: true, type: true } } } }, refunds: true } });
    ctx.assertScope('invoice.read', pay, 'Giao dịch');
    return pay;
  }

  @RequirePermission('invoice.read', false)
  @Get('payments/:id/receipt')
  async receipt(@Ctx() ctx: AccessContext, @Param('id') id: string, @Res() res: Response) {
    const pay = await this.prisma.payment.findUnique({ where: { public_id: id } });
    ctx.assertScope('invoice.read', pay, 'Giao dịch');
    if (pay!.status !== 'SUCCEEDED' && pay!.status !== 'PARTIALLY_REFUNDED' && pay!.status !== 'REFUNDED') throw new AppError('CONFLICT', 'Giao dịch chưa thành công nên chưa có biên nhận');
    const buf = await this.billing.receiptPdf(pay!.id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${pay!.code}.pdf"`);
    res.send(buf);
  }

  @RequirePermission('payment.pay')
  @Idempotent()
  @Post('payments/:id/retry')
  async retry(@Ctx() ctx: AccessContext, @Param('id') id: string, @Headers('idempotency-key') idem?: string) {
    const pay = await this.prisma.payment.findUnique({ where: { public_id: id } });
    ctx.assertScope('payment.pay', pay, 'Giao dịch', true);
    if (!['FAILED', 'EXPIRED', 'CANCELLED'].includes(pay!.status)) throw new AppError('INVALID_STATUS_TRANSITION', 'Chỉ thanh toán lại khi giao dịch trước thất bại');
    const ids = ((pay!.intended_invoice_ids as string[] | null) ?? []).map((x) => BigInt(x));
    const invs = await this.prisma.invoice.findMany({ where: { id: { in: ids }, status: { in: ['ISSUED', 'PARTIALLY_PAID'] } } });
    if (!invs.length) throw new AppError('CONFLICT', 'Hóa đơn đã được thanh toán hoặc đã hủy');
    return this.payments.startGateway(ctx, invs.map((i) => i.public_id), idem);
  }

  @RequirePermission('payment.record_offline')
  @Idempotent()
  @Post('payments/offline')
  offline(@Ctx() ctx: AccessContext, @Body() body: unknown, @Headers('idempotency-key') idem?: string) {
    const d = parse(z.object({ customerId: z.string().length(26).optional(), invoiceIds: z.array(z.string().length(26)).min(1), amount: zMoney.optional(), method: z.enum(['CASH', 'BANK_TRANSFER']), reference: z.string().max(100).optional() }), body);
    return this.payments.recordOffline(ctx, { customerPublicId: d.customerId, invoicePublicIds: d.invoiceIds, amount: d.amount, method: d.method, reference: d.reference }, idem);
  }

  // ---------------------------------------------------------------- refunds & waivers
  @RequirePermission('refund.request|refund.approve', false)
  @Get('refunds')
  async refunds(@Ctx() ctx: AccessContext, @Query() q: Record<string, unknown>) {
    const p = pageParams(q);
    const status = filterParam(q, 'status');
    const where = { ...ctx.scope(ctx.can('refund.request', false) ? 'refund.request' : 'refund.approve', { customer: null }), ...(status ? { status: { in: status.split(',') } } : {}) };
    const rows = await this.prisma.refund.findMany({ where: where as never, include: { payment: { select: { public_id: true, code: true } } }, orderBy: { id: 'desc' }, take: p.take, skip: p.skip });
    return paged(rows, p);
  }

  @RequirePermission('refund.request')
  @Idempotent()
  @Post('refunds')
  async requestRefund(@Ctx() ctx: AccessContext, @Body() body: unknown) {
    const d = parse(z.object({ paymentId: z.string().length(26), amount: zMoney, reason: z.enum(['CANCELLATION', 'OVERPAYMENT', 'DEPOSIT_RETURN', 'DUPLICATE_CHARGE', 'GOODWILL', 'PREPAID_RETURN']), note: zReason, method: z.enum(['ORIGINAL_METHOD', 'BANK_TRANSFER', 'CASH']).optional() }), body);
    const pay = await this.prisma.payment.findUnique({ where: { public_id: d.paymentId } });
    ctx.assertScope('refund.request', pay ? { facility_id: pay.facility_id } : null, 'Giao dịch', true);
    const refundable = D(pay!.amount).sub(pay!.refunded_amount);
    if (D(d.amount).gt(refundable)) throw validation('Số tiền hoàn vượt số tiền có thể hoàn của giao dịch');
    return this.prisma.tx(async (tx) => {
      const r = await this.payments.createRefund(tx, { customerId: pay!.customer_id, facilityId: pay!.facility_id, paymentId: pay!.id, reason: d.reason, amount: vnd(d.amount), requestedBy: ctx.userId, note: d.note, method: d.method });
      await this.audit.log(ctx, { action: 'refund.request', entityType: 'refund', entityId: r.id, entityRef: r.public_id, facilityId: pay!.facility_id, after: { amount: d.amount, reason: d.reason }, reason: d.note }, tx);
      return r;
    });
  }

  @RequirePermission('refund.approve')
  @Post('refunds/:id/approve')
  approve(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() body: unknown) {
    return this.payments.approveRefund(ctx, id, true, parse(z.object({ note: z.string().max(300).optional() }), body).note);
  }

  @RequirePermission('refund.approve')
  @Post('refunds/:id/reject')
  reject(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() body: unknown) {
    return this.payments.approveRefund(ctx, id, false, parse(z.object({ note: zReason }), body).note);
  }

  @RequirePermission('refund.approve|moveout.inspect', false)
  @Post('refunds/:id/mark-manual')
  manual(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() body: unknown) {
    const d = parse(z.object({ reference: z.string().trim().min(2).max(100).optional() }), body);
    return this.payments.markManual(ctx, id, d.reference ?? 'Đã chi tiền mặt tại quầy');
  }

  @RequirePermission('fee_waiver.request|fee_waiver.approve', false)
  @Get('fee-waivers')
  async waivers(@Ctx() ctx: AccessContext, @Query() q: Record<string, unknown>) {
    const p = pageParams(q);
    const status = filterParam(q, 'status');
    const where = { ...ctx.scope(ctx.can('fee_waiver.request', false) ? 'fee_waiver.request' : 'fee_waiver.approve', { customer: null }), ...(status ? { status } : {}) };
    const rows = await this.prisma.feeWaiver.findMany({ where: where as never, orderBy: { id: 'desc' }, take: p.take, skip: p.skip }).then((r) => attach(r, 'invoice_item_id', 'invoice_item', loaders(this.prisma).invoiceItems));
    return paged(rows, p);
  }

  @RequirePermission('fee_waiver.request')
  @Post('fee-waivers')
  waiver(@Ctx() ctx: AccessContext, @Body() body: unknown) {
    const d = parse(z.object({ invoiceItemId: z.string().min(1), amount: zMoney, reason: zReason }), body);
    return this.billing.requestWaiver(ctx, d);
  }

  @RequirePermission('fee_waiver.approve')
  @Post('fee-waivers/:id/decide')
  decideWaiver(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() body: unknown) {
    const d = parse(z.object({ approve: z.boolean(), amount: zMoney.optional(), note: z.string().max(300).optional() }), body);
    return this.billing.decideWaiver(ctx, id, d);
  }

  // ---------------------------------------------------------------- ledger
  @RequirePermission('invoice.read', false)
  @Get('customers/:id/ledger')
  async ledger(@Ctx() ctx: AccessContext, @Param('id') id: string) {
    const c = await this.prisma.customer.findUnique({ where: { public_id: id } });
    const cid = id === 'me' ? ctx.customerId : c?.id;
    if (!cid) throw notFound('Khách hàng');
    const cust = c ?? (await this.prisma.customer.findUnique({ where: { id: cid } }));
    const facilityIds = await this.facilitiesOfCustomer(cid);
    if (ctx.grant('invoice.read')!.scope === 'OWN') {
      if (cust!.id !== ctx.customerId) throw notFound('Khách hàng');
    } else if (ctx.grant('invoice.read')!.scope === 'FACILITY') {
      const mine = ctx.facilitiesFor('invoice.read');
      if (!facilityIds.some((f) => mine.includes(f))) throw notFound('Khách hàng');
    }
    const [entries, balance, openInvoices, paidAgg, activeContracts] = await Promise.all([
      this.prisma.customerLedgerEntry.findMany({ where: { customer_id: cid }, orderBy: { id: 'desc' }, take: 200 }),
      this.core.balance(cid),
      this.prisma.invoice.findMany({ where: { customer_id: cid, status: { in: ['ISSUED', 'PARTIALLY_PAID'] } } }),
      this.prisma.payment.aggregate({ where: { customer_id: cid, status: 'SUCCEEDED' }, _sum: { amount: true } }),
      this.prisma.contract.findMany({ where: { customer_id: cid, status: { in: ['SIGNED', 'ACTIVE', 'MOVE_OUT_SCHEDULED', 'EXPIRED'] } }, select: { snapshot: true } }),
    ]);
    const today = this.core.today();
    const aging = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 };
    for (const i of openInvoices) {
      const due = Math.max(0, Number(D(i.total).sub(i.amount_paid).sub(i.amount_credited)));
      const days = Math.floor((today.getTime() - i.due_date.getTime()) / 86400000);
      if (days <= 0) aging.current += due;
      else if (days <= 30) aging.d1_30 += due;
      else if (days <= 60) aging.d31_60 += due;
      else if (days <= 90) aging.d61_90 += due;
      else aging.d90plus += due;
    }
    const paid = Number(paidAgg._sum.amount ?? 0);
    const deposits = activeContracts.reduce((s: number, ct: any) => s + Number((ct.snapshot as any)?.price?.deposit ?? 0), 0);
    return { customer: { id: cust!.public_id, name: cust!.full_name, code: cust!.code }, balance: Math.max(0, Number(balance)), outstanding: Math.max(0, Number(balance)), paid, deposits, aging, entries };
  }

  private async facilitiesOfCustomer(customerId: bigint) {
    const rows = await this.prisma.contract.findMany({ where: { customer_id: customerId }, select: { facility_id: true }, distinct: ['facility_id'] });
    const res = await this.prisma.reservation.findMany({ where: { customer_id: customerId }, select: { facility_id: true }, distinct: ['facility_id'] });
    return [...new Set([...rows, ...res].map((x) => x.facility_id))];
  }

  // ---------------------------------------------------------------- customers (FR-M04, FR-S01, §11.7)
  @RequirePermission('customer.read', false)
  @Get('customers')
  async customers(@Ctx() ctx: AccessContext, @Query() q: Record<string, unknown>) {
    const p = pageParams(q);
    const search = typeof q.q === 'string' ? q.q.trim() : '';
    const g = ctx.grant('customer.read')!;
    const scoped =
      g.scope === 'GLOBAL' || g.scope === 'FACILITY'
        ? g.scope === 'FACILITY'
          ? { OR: [{ contracts: { some: { facility_id: { in: ctx.facilitiesFor('customer.read') } } } }, { reservations: { some: { facility_id: { in: ctx.facilitiesFor('customer.read') } } } }, { created_by: ctx.userId }] }
          : {}
        : { id: ctx.customerId ?? BigInt(0) };
    const where = { deleted_at: null, ...scoped, ...(search ? { AND: [{ OR: [{ full_name: { contains: search } }, { phone: { contains: search } }, { email: { contains: search } }, { code: { contains: search } }] }] } : {}) };
    const [rows, total] = await Promise.all([
      this.prisma.customer.findMany({ where: where as never, orderBy: { id: 'desc' }, take: p.take, skip: p.skip, include: { _count: { select: { contracts: true } } } }),
      this.prisma.customer.count({ where: where as never }),
    ]);
    const mask = ctx.hasRole('BUSINESS_OPS_MANAGER') && !ctx.hasRole('FACILITY_MANAGER');
    return paged(rows.map((c) => (mask ? { ...c, phone: maskPhone(c.phone), email: maskEmail(c.email) } : c)), p, total);
  }

  @RequirePermission('customer.read', false)
  @Get('customers/:id')
  async customer(@Ctx() ctx: AccessContext, @Param('id') id: string) {
    const c = await this.prisma.customer.findUnique({
      where: { public_id: id },
      include: {
        contracts: { include: { unit: { select: { code: true } }, facility: { select: { public_id: true, name: true } } }, orderBy: { id: 'desc' } },
        reservations: { include: { facility: { select: { name: true } }, unit_type: { select: { name: true } } }, orderBy: { id: 'desc' }, take: 20 },
        tickets: { select: { public_id: true, code: true, subject: true, status: true, created_at: true }, orderBy: { id: 'desc' }, take: 20 },
      },
    });
    const facs = c ? await this.facilitiesOfCustomer(c.id) : [];
    const g = ctx.grant('customer.read')!;
    if (c && g.scope === 'FACILITY' && !(facs.some((f) => ctx.facilitiesFor('customer.read').includes(f)) || c.created_by === ctx.userId)) throw notFound('Khách hàng');
    if (c && g.scope === 'OWN' && c.id !== ctx.customerId) throw notFound('Khách hàng');
    if (!c) throw notFound('Khách hàng');
    const [balance, idvs] = await Promise.all([
      this.core.balance(c.id),
      this.prisma.identityVerification.findMany({ where: { customer_id: c.id }, orderBy: { id: 'desc' }, take: 10 }),
    ]);
    const idvPhotos = idvs.length ? await this.billing.mediaListFor('identity_verification', idvs.map((v) => v.id)) : [];
    const identityVerifications = idvs.map((v) => ({
      ...v,
      photos: idvPhotos
        .filter((p: any) => p.related_id === v.id)
        .map((p: any) => ({ id: p.public_id, url: p.url, mimeType: p.mime_type, caption: p.caption, takenAt: p.taken_at ?? p.created_at })),
    }));
    const mask = ctx.hasRole('BUSINESS_OPS_MANAGER') && !ctx.hasRole('FACILITY_MANAGER');
    return { ...(mask ? { ...c, phone: maskPhone(c.phone), email: maskEmail(c.email) } : c), balance: Number(balance), identityVerifications };
  }

  @RequirePermission('reservation.create')
  @Post('customers')
  async createCustomer(@Ctx() ctx: AccessContext, @Body() body: unknown) {
    if (ctx.primaryRole === 'CUSTOMER') throw forbidden();
    const d = parse(z.object({ fullName: z.string().trim().min(2).max(150), phone: z.string().trim().min(8).max(20), email: z.string().email().max(254).optional(), type: z.enum(['INDIVIDUAL', 'BUSINESS']).optional(), companyName: z.string().max(150).optional(), taxCode: z.string().max(20).optional(), addressLine: z.string().max(200).optional() }), body);
    return this.prisma.tx(async (tx) => {
      if (d.email) {
        const ex = await tx.customer.findFirst({ where: { email: d.email.toLowerCase(), deleted_at: null } });
        if (ex) {
          // Return the record only to a caller allowed to see it (same rule as GET /customers/:id); never leak another facility's customer.
          const g = ctx.grant('customer.read');
          const inScope = !!g && (g.scope === 'GLOBAL' || ex.created_by === ctx.userId || (g.scope === 'FACILITY' && (await this.facilitiesOfCustomer(ex.id)).some((f) => ctx.facilitiesFor('customer.read').includes(f))));
          if (!inScope) throw new AppError('CONFLICT', 'Email này đã gắn với một khách hàng khác trong hệ thống. Hãy dùng email khác hoặc nhờ quản lý xác minh.');
          return ex;
        }
      }
      const code = await nextCustomerCode(tx);
      const c = await tx.customer.create({ data: { public_id: newId(), code, full_name: d.fullName, phone: d.phone, email: d.email?.toLowerCase() ?? null, type: d.type ?? 'INDIVIDUAL', company_name: d.companyName, tax_code: d.taxCode, address_line: d.addressLine, created_by: ctx.userId } });
      await this.audit.log(ctx, { action: 'customer.create', entityType: 'customer', entityId: c.id, entityRef: c.code, after: { name: d.fullName } }, tx);
      return c;
    });
  }

  // ---------------------------------------------------------------- reconciliation (F4 BOM)
  @RequirePermission('report.system', false)
  @Get('reconciliations')
  async reconList() {
    return this.prisma.reconciliationBatch.findMany({ orderBy: { id: 'desc' }, take: 50 });
  }

  @RequirePermission('report.system')
  @Post('reconciliations')
  async reconRun(@Ctx() ctx: AccessContext, @Body() body: unknown) {
    if (!ctx.hasRole('BUSINESS_OPS_MANAGER')) throw forbidden();
    const d = parse(z.object({ provider: z.enum(['VNPAY', 'CASH']).default('VNPAY'), periodDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), rows: z.array(z.object({ txnId: z.string().min(1), amount: z.number().min(0) })).max(5000).optional() }), body);
    const day = new Date(`${d.periodDate}T00:00:00.000Z`);
    const next = new Date(day.getTime() + 86400000);
    const cash = d.provider === 'CASH'; // counter payments: cash and bank transfer recorded by staff
    const pays = await this.prisma.payment.findMany({
      where: cash
        ? { method: { in: ['CASH', 'BANK_TRANSFER'] }, status: { in: ['SUCCEEDED', 'PARTIALLY_REFUNDED', 'REFUNDED'] }, paid_at: { gte: day, lt: next } }
        : { method: 'GATEWAY', provider: 'VNPAY', status: { in: ['SUCCEEDED', 'PARTIALLY_REFUNDED', 'REFUNDED'] }, paid_at: { gte: day, lt: next } },
    });
    const keyOf = (p: { provider_txn_id: string | null; code: string }) => p.provider_txn_id ?? p.code;
    // Statement side: a pasted statement wins; otherwise VNPay is asked (querydr). The counter has no external statement and the demo
    // sandbox cannot always be reached, so both fall back to the system's own records ("đối soát nội bộ") instead of failing.
    let rows = d.rows;
    if (!rows && !cash && config.payments.vnpay.queryApi) rows = await this.payments.fetchVnpayStatement(day).catch(() => undefined);
    rows ??= pays.map((p) => ({ txnId: keyOf(p), amount: Number(p.amount) }));
    return this.prisma.tx(async (tx) => {
      const totalProvider = rows.reduce((s, r) => s.add(r.amount), D(0));
      const totalSystem = pays.reduce((s, p) => s.add(p.amount), D(0));
      const items: { payment_id?: bigint; provider_txn_id?: string; provider_amount?: ReturnType<typeof D>; system_amount?: ReturnType<typeof D>; result: 'MATCHED' | 'MISSING_IN_SYSTEM' | 'MISSING_IN_PROVIDER' | 'AMOUNT_MISMATCH' }[] = [];
      const byTxn = new Map(pays.map((p) => [keyOf(p), p]));
      const seen = new Set<string>();
      for (const r of rows) {
        const p = byTxn.get(r.txnId);
        seen.add(r.txnId);
        if (!p) items.push({ provider_txn_id: r.txnId, provider_amount: D(r.amount), result: 'MISSING_IN_SYSTEM' });
        else items.push({ payment_id: p.id, provider_txn_id: r.txnId, provider_amount: D(r.amount), system_amount: D(p.amount), result: D(p.amount).eq(r.amount) ? 'MATCHED' : 'AMOUNT_MISMATCH' });
      }
      for (const p of pays) if (!seen.has(keyOf(p))) items.push({ payment_id: p.id, provider_txn_id: keyOf(p), system_amount: D(p.amount), result: 'MISSING_IN_PROVIDER' });
      const mismatch = items.some((i) => i.result !== 'MATCHED');
      const batch = await tx.reconciliationBatch.create({ data: { public_id: newId(), provider: d.provider, period_date: day, total_provider: totalProvider, total_system: totalSystem, status: mismatch ? 'HAS_MISMATCH' : 'MATCHED', run_by: ctx.userId } });
      if (items.length) await tx.reconciliationItem.createMany({ data: items.map((i) => ({ ...i, batch_id: batch.id })) });
      for (const i of items) if (i.payment_id) await tx.payment.update({ where: { id: i.payment_id }, data: { reconciliation_status: i.result === 'MATCHED' ? 'MATCHED' : 'MISMATCH' } });
      await this.audit.log(ctx, { action: 'reconciliation.run', entityType: 'reconciliation_batch', entityId: batch.id, entityRef: batch.public_id, after: { provider: d.provider, items: items.length, mismatch } }, tx);
      return batch;
    });
  }

  @RequirePermission('report.system', false)
  @Get('reconciliations/:id')
  async reconOne(@Param('id') id: string) {
    const b = await this.prisma.reconciliationBatch.findUnique({ where: { public_id: id }, include: { items: { include: { } } } });
    if (!b) throw notFound('Đợt đối soát');
    return b;
  }

  @RequirePermission('report.system')
  @Post('reconciliation-items/:id')
  async reconNote(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() body: unknown) {
    const d = parse(z.object({ note: zReason }), body);
    const item = await this.prisma.reconciliationItem.findUnique({ where: { id: BigInt(id) } }).catch(() => null);
    if (!item) throw notFound('Dòng đối soát');
    const upd = await this.prisma.reconciliationItem.update({ where: { id: item.id }, data: { resolution_note: d.note } });
    const open = await this.prisma.reconciliationItem.count({ where: { batch_id: item.batch_id, result: { not: 'MATCHED' }, resolution_note: null } });
    if (!open) await this.prisma.reconciliationBatch.update({ where: { id: item.batch_id }, data: { status: 'RESOLVED' } });
    await this.audit.log(ctx, { action: 'reconciliation.explain', entityType: 'reconciliation_item', entityId: item.id, reason: d.note });
    return upd;
  }
}
