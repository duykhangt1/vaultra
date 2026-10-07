import { Injectable } from '@nestjs/common';
import { PrismaService, Tx } from '../common/prisma.service';
import { AppError, forbidden, notFound, validation } from '../common/errors';
import { D, DecimalValue, newId, vnd } from '../common/util';
import { addDays, addMonths, diffDays, monthsBetween } from '../common/dates';
import { CoreService, fmt, fmtD } from '../domain/core.service';
import { PricingService } from '../domain/pricing.service';
import { NotificationService } from '../notifications/notification.service';
import { AuditService } from '../audit/audit.service';
import { PdfService } from '../media/pdf.service';
import { MediaService } from '../media/media.service';
import type { AccessContext } from '../auth/access-context';
import { Prisma } from '../generated/prisma/client';

/** Billing (spec module 19, §6.3 3A, §6.4 4C): schedules, recurring invoices, charges, credit notes, waivers. */

function normalizeScopedDiscountMediaListForQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 15)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

interface CorePortalProrationBillingSnapshot {
  readonly channelTag: string;
}
@Injectable()
export class BillingService {
  constructor(
    private prisma: PrismaService,
    private core: CoreService,
    private pricing: PricingService,
    private notify: NotificationService,
    private audit: AuditService,
    private pdf: PdfService,
    private media: MediaService,
  ) {}

  async mediaListFor(relatedType: string, ids: bigint[]) {
    return this.media.listFor(relatedType, ids);
  }

  /** Fee amount by calc type (FIXED / PERCENT_OF_RENT / GREATER_OF, capped). */
  feeAmount(ft: { calc_type: string; amount: DecimalValue; percent: DecimalValue | null; cap_amount: DecimalValue | null }, rent: DecimalValue) {
    const fixed = D(ft.amount);
    const pct = vnd(D(rent).mul(D(ft.percent ?? 0)).div(100));
    let v = ft.calc_type === 'FIXED' ? fixed : ft.calc_type === 'PERCENT_OF_RENT' ? pct : Prisma.Decimal.max(fixed, pct);
    if (ft.cap_amount !== null && ft.cap_amount !== undefined) v = Prisma.Decimal.min(v, D(ft.cap_amount));
    return vnd(v);
  }

  /** Daily job (§6.3 3A step 2): RECURRING invoices invoice_lead_days before each period, once only. */
  async runRecurring() {
    const today = this.core.today();
    const due = await this.prisma.billingSchedule.findMany({ where: { status: 'ACTIVE', next_invoice_date: { lte: today } }, include: { contract: { include: { facility: true } } }, take: 500 });
    let n = 0;
    for (const s of due) {
      await this.prisma.tx(async (tx) => {
        const sch = await tx.billingSchedule.findUniqueOrThrow({ where: { id: s.id } });
        if (sch.status !== 'ACTIVE' || sch.next_invoice_date > today) return;
        const c = await tx.contract.findUniqueOrThrow({ where: { id: sch.contract_id }, include: { unit_type: true } });
        if (!['ACTIVE', 'MOVE_OUT_SCHEDULED', 'EXPIRED'].includes(c.status)) {
          await tx.billingSchedule.update({ where: { id: sch.id }, data: { status: 'ENDED' } });
          return;
        }
        const effEnd = c.effective_end_date;
        if (effEnd && sch.next_period_start >= effEnd) {
          await tx.billingSchedule.update({ where: { id: sch.id }, data: { status: c.is_holdover ? 'ACTIVE' : 'PAUSED' } });
          if (!c.is_holdover) return;
        }
        const periodStart = sch.next_period_start;
        // anchored on the contract start: 31 Jan -> 28 Feb -> 31 Mar (a chained addMonths would drift to the 28th for good)
        const periodEnd = addMonths(c.start_date, monthsBetween(c.start_date, periodStart) + sch.period_months);
        const exists = await tx.invoice.findFirst({ where: { contract_id: c.id, type: { in: ['RECURRING', 'RENEWAL'] }, period_start: periodStart, status: { not: 'VOID' } } });
        if (!exists) {
          const policy = await this.core.policyById(c.policy_version_id, tx);
          const items: Parameters<CoreService['createInvoice']>[1]['items'] = [
            { item_type: 'RENT', description: `Tiền thuê kho ${fmtD(periodStart)} – ${fmtD(addDays(periodEnd, -1))}`, amount: vnd(D(c.monthly_rent).mul(sch.period_months)), service_period_start: periodStart, service_period_end: addDays(periodEnd, -1) },
          ];
          const promo = (c.snapshot as { promotion?: { id: string; type: string; value: number; periods: number } | null }).promotion;
          if (promo) {
            const periodIndex = Math.round(diffDays(periodStart, c.start_date) / 30.4);
            const disc = this.pricing.discountFor({ type: promo.type, value: promo.value, applies_to_periods: promo.periods }, D(c.monthly_rent), periodIndex, sch.period_months);
            if (disc.gt(0)) items.push({ item_type: 'DISCOUNT', description: 'Khuyến mãi theo hợp đồng', amount: disc.neg(), promotion_id: BigInt(promo.id) });
          }
          await this.core.createInvoice(tx, { customerId: c.customer_id, facilityId: c.facility_id, contractId: c.id, type: 'RECURRING', dueDate: periodStart, periodStart, periodEnd, vatRate: policy.vat_rate, pricesIncludeVat: policy.prices_include_vat, items, actor: null });
          n += 1;
        }
        const nextStart = periodEnd;
        const policy = await this.core.policyById(c.policy_version_id, tx);
        const stop = !c.is_holdover && effEnd && nextStart >= effEnd;
        await tx.billingSchedule.update({ where: { id: sch.id }, data: { next_period_start: nextStart, next_invoice_date: addDays(nextStart, -policy.invoice_lead_days), amount: c.monthly_rent, status: stop ? 'PAUSED' : 'ACTIVE' } });
      });
    }
    return n;
  }

  /** invoice.due_soon at T−3 (§6.3 notifications). */
  async dueSoonReminders() {
    const today = this.core.today();
    const target = addDays(today, 3);
    const rows = await this.prisma.invoice.findMany({ where: { status: { in: ['ISSUED', 'PARTIALLY_PAID'] }, due_date: target } });
    for (const i of rows) {
      const uid = await this.core.customerUser(this.prisma, i.customer_id);
      if (uid) await this.notify.notify({ users: [uid], event: 'invoice.due_soon', vars: { code: i.code, amount: fmt(D(i.total).sub(i.amount_paid).sub(i.amount_credited)), dueDate: fmtD(i.due_date) }, link: `/app/billing/invoices/${i.public_id}`, related: { type: 'invoice', id: i.id }, email: true, dedupeKey: `invoice.due_soon:${i.id}` });
    }
    return rows.length;
  }

  /** POST /invoices/:id/charges — fee from catalog as AD_HOC invoice (§6.3 3A step 4). */
  async addCharge(ctx: AccessContext, contractPublicId: string, d: { feeTypeId: string; amount?: number; quantity?: number; note?: string; ticketId?: bigint | null }, tx?: Tx) {
    ctx.require('charge.adjust');
    const c = await this.prisma.contract.findUnique({ where: { public_id: contractPublicId }, include: { customer: true } });
    ctx.assertScope('charge.adjust', c, 'Hợp đồng', true);
    ctx.assertNotOwnContract(c!.customer.user_id);
    const ft = await this.prisma.feeType.findUnique({ where: { id: BigInt(d.feeTypeId) } });
    if (!ft || !ft.active || ft.deleted_at) throw notFound('Loại phí');
    const allowed = (ft.allowed_roles as string[]) ?? [];
    if (allowed.length && !ctx.roles.some((r) => allowed.includes(r))) throw forbidden('Vai trò của bạn không được áp loại phí này');
    const def = this.feeAmount(ft, c!.monthly_rent);
    let amount = def;
    if (d.amount !== undefined && !D(d.amount).eq(def)) {
      if (!ft.editable_amount) throw validation('Loại phí này không cho sửa số tiền');
      if (!ctx.hasRole('FACILITY_MANAGER') && !ctx.hasRole('BUSINESS_OPS_MANAGER')) throw forbidden('Sửa số tiền phụ phí cần quyền Quản lý cơ sở');
      amount = vnd(d.amount);
    }
    const qty = d.quantity ?? 1;
    const run = async (t: Tx) => {
      const policy = await this.core.policyById(c!.policy_version_id, t);
      const inv = await this.core.createInvoice(t, {
        customerId: c!.customer_id, facilityId: c!.facility_id, contractId: c!.id, type: 'AD_HOC', dueDate: addDays(this.core.today(), 7), vatRate: policy.vat_rate, pricesIncludeVat: policy.prices_include_vat,
        items: [{ item_type: ft.code === 'DAMAGE_FEE' ? 'DAMAGE' : 'FEE', fee_type_id: ft.id, description: `${ft.name}${d.note ? ` — ${d.note}` : ''}`, amount: amount.mul(qty), quantity: qty, unit_price: amount, taxable: ft.taxable, source_type: d.ticketId ? 'ticket' : undefined, source_id: d.ticketId ?? undefined }],
        actor: ctx.userId, notify: false,
      });
      const uid = c!.customer.user_id;
      if (uid) await this.notify.notify({ users: [uid], event: 'charge.added', vars: { fee: ft.name, amount: fmt(inv.total), code: inv.code, dueDate: fmtD(inv.due_date) }, link: `/app/billing/invoices/${inv.public_id}`, related: { type: 'invoice', id: inv.id }, email: true }, t);
      await this.audit.log(ctx, { action: 'charge.add', entityType: 'invoice', entityId: inv.id, entityRef: inv.code, facilityId: c!.facility_id, after: { fee: ft.code, amount: inv.total.toString() }, reason: d.note }, t);
      return inv;
    };
    return tx ? run(tx) : this.prisma.tx(run);
  }

  async issueCreditNote(ctx: AccessContext, invoicePublicId: string, amount: number, reason: string) {
    ctx.require('charge.adjust');
    if (!ctx.hasRole('FACILITY_MANAGER') && !ctx.hasRole('BUSINESS_OPS_MANAGER')) throw forbidden('Ghi có cần quyền Quản lý cơ sở hoặc BOM');
    const inv = await this.prisma.invoice.findUnique({ where: { public_id: invoicePublicId }, include: { customer: true } });
    ctx.assertScope('charge.adjust', inv, 'Hóa đơn', true);
    ctx.assertNotOwnContract(inv!.customer.user_id);
    const open = D(inv!.total).sub(inv!.amount_paid).sub(inv!.amount_credited);
    if (D(amount).gt(open)) throw validation(`Số tiền ghi có vượt số còn phải trả (${fmt(open)})`);
    const policy = await this.core.activePolicy(inv!.facility_id);
    if (ctx.grant('charge.adjust')!.scope === 'FACILITY' && D(amount).gt(policy.params.fm_waiver_limit)) throw forbidden(`Vượt hạn mức ${fmt(policy.params.fm_waiver_limit)} của quản lý cơ sở — hãy tạo đề xuất miễn giảm để BOM duyệt`);
    return this.prisma.tx(async (tx) => {
      const cn = await this.core.creditNote(tx, inv!.id, amount, reason, ctx.userId);
      await this.audit.log(ctx, { action: 'invoice.credit_note', entityType: 'invoice', entityId: inv!.id, entityRef: inv!.code, facilityId: inv!.facility_id, reason, after: { amount, creditNote: cn.code } }, tx);
      return cn;
    });
  }

  async writeOff(ctx: AccessContext, invoicePublicId: string, reason: string) {
    if (!ctx.hasRole('BUSINESS_OPS_MANAGER')) throw forbidden('Chỉ Business Operations Manager được xóa nợ khó đòi');
    const inv = await this.prisma.invoice.findUnique({ where: { public_id: invoicePublicId } });
    if (!inv) throw notFound('Hóa đơn');
    if (!['ISSUED', 'PARTIALLY_PAID'].includes(inv.status)) throw new AppError('INVALID_STATUS_TRANSITION', 'Chỉ xóa nợ hóa đơn còn công nợ');
    return this.prisma.tx(async (tx) => {
      const open = D(inv.total).sub(inv.amount_paid).sub(inv.amount_credited);
      await tx.invoice.update({ where: { id: inv.id }, data: { status: 'WRITTEN_OFF', amount_credited: { increment: open } } });
      await this.core.ledger(tx, { customerId: inv.customer_id, contractId: inv.contract_id, type: 'WRITE_OFF', amount: open.neg(), sourceType: 'invoice', sourceId: inv.id, description: `Xóa nợ ${inv.code}`, actor: ctx.userId });
      await this.audit.log(ctx, { action: 'invoice.write_off', entityType: 'invoice', entityId: inv.id, entityRef: inv.code, facilityId: inv.facility_id, reason, after: { amount: open.toString() } }, tx);
      return tx.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    });
  }

  // ------------------------------------------------------------------ fee waivers (§6.4 4C)
  async requestWaiver(ctx: AccessContext, d: { invoiceItemId: string; amount: number; reason: string; ticketId?: bigint | null }, tx?: Tx) {
    ctx.require('fee_waiver.request');
    const item = await this.prisma.invoiceItem.findUnique({ where: { id: BigInt(d.invoiceItemId) }, include: { invoice: { include: { customer: true } } } });
    if (!item) throw notFound('Dòng hóa đơn');
    ctx.assertScope('fee_waiver.request', item.invoice, 'Hóa đơn', true);
    if (!['FEE', 'DAMAGE'].includes(item.item_type)) throw validation('Chỉ miễn giảm phụ phí / phí hư hại / phí trễ hạn');
    const open = D(item.invoice.total).sub(item.invoice.amount_paid).sub(item.invoice.amount_credited);
    const earlier = await this.prisma.feeWaiver.findMany({ where: { invoice_item_id: item.id, status: { in: ['PENDING', 'APPROVED', 'PARTIALLY_APPROVED'] } } });
    const already = earlier.reduce((s, w) => s.add(w.status === 'PENDING' ? w.requested_amount : (w.approved_amount ?? w.requested_amount)), D(0));
    if (D(d.amount).gt(D(item.amount).sub(already)) || D(d.amount).gt(open) || d.amount <= 0) throw validation('Số tiền miễn giảm không hợp lệ hoặc vượt phần còn có thể miễn của khoản phí này');
    const policy = await this.core.activePolicy(item.invoice.facility_id);
    const role = D(d.amount).gt(policy.params.fm_waiver_limit) ? 'BUSINESS_OPS_MANAGER' : 'FACILITY_MANAGER';
    const run = async (t: Tx) => {
      const w = await t.feeWaiver.create({ data: { public_id: newId(), invoice_item_id: item.id, facility_id: item.invoice.facility_id, requested_amount: vnd(d.amount), reason: d.reason.slice(0, 500), ticket_id: d.ticketId ?? null, status: 'PENDING', required_approver_role: role, requested_by: ctx.userId } });
      const approvers = role === 'FACILITY_MANAGER' ? await this.core.facilityManagers(t, item.invoice.facility_id) : await this.core.businessOpsManagers(t);
      await this.notify.notify({ users: approvers, event: 'waiver.requested', vars: { amount: fmt(d.amount), item: item.description, reason: d.reason }, link: role === 'FACILITY_MANAGER' ? '/manage/approvals' : '/ops/approvals', related: { type: 'invoice', id: item.invoice.id }, email: false }, t);
      await this.audit.log(ctx, { action: 'fee_waiver.request', entityType: 'fee_waiver', entityId: w.id, entityRef: w.public_id, facilityId: w.facility_id, reason: d.reason, after: { amount: d.amount, role } }, t);
      return w;
    };
    return tx ? run(tx) : this.prisma.tx(run);
  }

  async decideWaiver(ctx: AccessContext, publicId: string, d: { approve: boolean; amount?: number; note?: string }) {
    ctx.require('fee_waiver.approve');
    const w = await this.prisma.feeWaiver.findUnique({ where: { public_id: publicId } });
    ctx.assertScope('fee_waiver.approve', w, 'Đề xuất miễn giảm', true);
    if (w!.status !== 'PENDING') throw new AppError('INVALID_STATUS_TRANSITION', 'Đề xuất đã được xử lý');
    const policy = await this.core.activePolicy(w!.facility_id);
    const amount = D(d.amount ?? w!.requested_amount);
    if (amount.gt(w!.requested_amount)) throw validation('Không duyệt quá số tiền đề xuất');
    if (ctx.grant('fee_waiver.approve')!.scope === 'FACILITY' && d.approve && amount.gt(policy.params.fm_waiver_limit)) throw forbidden(`Vượt hạn mức ${fmt(policy.params.fm_waiver_limit)} — cần BOM duyệt`);
    if (w!.requested_by === ctx.userId) throw forbidden('Không tự duyệt đề xuất của chính mình');
    const item = await this.prisma.invoiceItem.findUniqueOrThrow({ where: { id: w!.invoice_item_id }, include: { invoice: { include: { customer: true } } } });
    ctx.assertNotOwnContract(item.invoice.customer.user_id);
    return this.prisma.tx(async (tx) => {
      const status = !d.approve ? 'REJECTED' : amount.lt(w!.requested_amount) ? 'PARTIALLY_APPROVED' : 'APPROVED';
      const u = await tx.feeWaiver.update({ where: { id: w!.id }, data: { status, approved_amount: d.approve ? amount : null, decided_by: ctx.userId, decided_at: this.core.now(), decision_note: d.note?.slice(0, 500) } });
      if (d.approve && amount.gt(0)) await this.core.creditNote(tx, item.invoice_id, amount, `Miễn giảm: ${w!.reason}`, ctx.userId, w!.id);
      if (w!.requested_by) await this.notify.notify({ users: [w!.requested_by], event: 'waiver.decided', vars: { amount: fmt(amount), decision: d.approve ? 'duyệt' : 'từ chối' }, related: { type: 'invoice', id: item.invoice_id }, email: false }, tx);
      await this.audit.log(ctx, { action: d.approve ? 'fee_waiver.approve' : 'fee_waiver.reject', entityType: 'fee_waiver', entityId: w!.id, entityRef: w!.public_id, facilityId: w!.facility_id, reason: d.note, after: { amount: amount.toString(), status } }, tx);
      return u;
    });
  }

  /** Receipt PDF (payments.code = receipt number). */
  async receiptPdf(paymentId: bigint) {
    const p = await this.prisma.payment.findUniqueOrThrow({ where: { id: paymentId }, include: { customer: true, allocations: { include: { invoice: true } } } });
    const f = await this.prisma.facility.findUniqueOrThrow({ where: { id: p.facility_id } });
    return this.pdf.render(`BIÊN NHẬN THANH TOÁN ${p.code}`, `${f.name}`, [
      { heading: 'Thông tin', rows: [['Khách hàng', `${p.customer.full_name} (${p.customer.code})`], ['Số tiền', fmt(p.amount)], ['Phương thức', p.method], ['Thời điểm', p.paid_at ? p.paid_at.toISOString() : ''], ['Mã giao dịch', p.provider_txn_id ?? p.bank_reference ?? '—'], ['Trạng thái', p.status]] },
      { heading: 'Phân bổ vào hóa đơn', table: { headers: ['Hóa đơn', 'Loại', 'Số tiền'], widths: [200, 150, 149], rows: p.allocations.map((a) => [a.invoice.code, a.invoice.type, fmt(a.amount)]) } },
    ]);
  }
}

function computeBranchMoveoutBillingServiceBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeScopedOccupancyMetricRunRecurringQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 30)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}
const hasGuardGuardEscalationBillingRef = (v: string): boolean => v.trim().length > 0;
