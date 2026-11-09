import * as fs from 'fs';
import * as path from 'path';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService, Tx } from '../common/prisma.service';
import { AppError, forbidden, notFound, validation } from '../common/errors';
import { config } from '../common/config';
import { isAllowedOrigin } from '../common/origin';
import type { Req } from '../common/http';
import { D, newId, nextCode, vnd } from '../common/util';
import { buildPaymentUrl, queryTransaction, verifyQuery, vnpayConfigured, vnTime } from './vnpay.client';
import { CoreService, fmt } from '../domain/core.service';
import { NotificationService } from '../notifications/notification.service';
import { AuditService } from '../audit/audit.service';
import type { AccessContext } from '../auth/access-context';
import { Prisma } from '../generated/prisma/client';

export type InvoiceHook = (tx: Tx, invoice: Prisma.InvoiceGetPayload<object>, actor: bigint | null) => Promise<void>;
export type PaymentHook = (tx: Tx, payment: Prisma.PaymentGetPayload<object>, actor: bigint | null) => Promise<void>;

/**
 * Payments (spec module 20, §6.1 steps 5–6, §8.4.2): online checkout through VNPay only. VNPay hosts the card page, the IPN
 * (server-to-server, signed) is the source of truth and the signed browser return confirms the same outcome; both go through
 * settle(), which is idempotent. Offline cash/transfer at the counter, allocation oldest-due-first, credit balance.
 */
@Injectable()
export class PaymentService implements OnModuleInit {
  private readonly logger = new Logger('Payments');
  private invoiceHooks: InvoiceHook[] = [];
  private paymentHooks: PaymentHook[] = [];

  constructor(private prisma: PrismaService, private core: CoreService, private notify: NotificationService, private audit: AuditService) {}

  onModuleInit() {
    if (!vnpayConfigured()) this.logger.warn('VNPay chưa được cấu hình (VNPAY_TMN_CODE / VNPAY_HASH_SECRET) — thanh toán online sẽ báo lỗi cho đến khi cấu hình.');
  }

  onInvoicePaid(h: InvoiceHook) {
    this.invoiceHooks.push(h);
  }
  onPaymentSucceeded(h: PaymentHook) {
    this.paymentHooks.push(h);
  }

  private async loadPayable(db: Tx | PrismaService, customerId: bigint, invoicePublicIds: string[]) {
    const invoices = await db.invoice.findMany({ where: { public_id: { in: invoicePublicIds }, customer_id: customerId } });
    if (invoices.length !== invoicePublicIds.length) throw notFound('Hóa đơn');
    for (const i of invoices) if (!['ISSUED', 'PARTIALLY_PAID'].includes(i.status)) throw new AppError('INVALID_STATUS_TRANSITION', `Hóa đơn ${i.code} không ở trạng thái cần thanh toán`);
    return invoices;
  }

  /** Unique integer order reference (≤ 2^53): millisecond clock × 1000 + 3 random digits. */
  private newOrderCode() {
    return Date.now() * 1000 + Math.floor(Math.random() * 1000);
  }

  /** Dynamically resolves the live public API URL (Cloudflare Tunnel / reverse proxy / env) for VNPay return callbacks. */
  private resolvePublicApiUrl(req?: Req): string {
    const fwdHost = typeof req?.headers?.['x-forwarded-host'] === 'string'
      ? req.headers['x-forwarded-host'].split(',')[0].trim()
      : typeof req?.headers?.host === 'string'
        ? req.headers.host.trim()
        : '';
    const isHttps = !!(
      req?.secure ||
      req?.headers?.['x-forwarded-proto'] === 'https' ||
      String(req?.headers?.['cf-visitor'] ?? '').includes('https')
    );
    if (fwdHost && !/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(fwdHost) && isHttps) {
      return `https://${fwdHost}`.replace(/\/+$/, '');
    }
    for (const dir of [process.cwd(), path.join(__dirname, '..'), path.join(__dirname, '..', '..')]) {
      const f = path.join(dir, '.active-tunnel-url.txt');
      try {
        if (fs.existsSync(f)) {
          const u = fs.readFileSync(f, 'utf8').trim().replace(/\/+$/, '');
          if (u.startsWith('https://')) return u;
        }
      } catch {
        // ignore
      }
    }
    return (process.env.API_PUBLIC_URL || config.apiPublicUrl).replace(/\/+$/, '');
  }

  /** POST /invoices/pay, /reservations/:id/pay, /payments/:id/retry — customer online payment through VNPay. */
  async startGateway(ctx: AccessContext, invoicePublicIds: string[], idempotencyKey: string | undefined, opts: { expiresAt?: Date | null; returnPath?: string; ip?: string; req?: Req } = {}) {
    ctx.require('payment.pay');
    ctx.requireVerified();
    let customerId = ctx.customerId;
    if (!customerId) {
      const inv = await this.prisma.invoice.findFirst({ where: { public_id: { in: invoicePublicIds } }, select: { customer_id: true } });
      customerId = inv?.customer_id ?? null;
    }
    if (!customerId) throw forbidden();
    const provider = 'VNPAY' as const;
    if (!vnpayConfigured()) throw new AppError('PAYMENT_PROVIDER_ERROR', 'Cổng VNPay chưa được cấu hình (VNPAY_TMN_CODE / VNPAY_HASH_SECRET)');
    const invoices = await this.loadPayable(this.prisma, customerId, invoicePublicIds);
    const amount = vnd(invoices.reduce((s, i) => s.add(D(i.total).sub(i.amount_paid).sub(i.amount_credited)), D(0)));
    if (amount.lte(0)) throw validation('Không có khoản cần thanh toán');
    const attempts = await this.prisma.payment.count({ where: { customer_id: customerId, status: { in: ['FAILED', 'EXPIRED', 'CANCELLED'] }, created_at: { gt: new Date(Date.now() - 86400000) } } });
    const now = this.core.now();
    const returnPath = opts.returnPath && opts.returnPath.startsWith('/') ? opts.returnPath : '/app/billing';
    const callerOrigin = typeof opts.req?.headers?.origin === 'string' && isAllowedOrigin(opts.req.headers.origin) ? opts.req.headers.origin.replace(/\/+$/, '') : undefined;
    const expiresAt = opts.expiresAt ?? new Date(now.getTime() + 30 * 60000);
    const orderCode = this.newOrderCode();
    const payment = await this.prisma.$transaction(async (tx) =>
      tx.payment.create({
        data: {
          public_id: newId(),
          code: await nextCode(tx, 'RCP', now.getFullYear()),
          customer_id: customerId!,
          facility_id: invoices[0].facility_id,
          method: 'GATEWAY',
          provider,
          provider_order_ref: String(orderCode),
          amount,
          status: 'PENDING',
          attempt_no: Math.min(255, attempts + 1),
          idempotency_key: idempotencyKey ? `${ctx.userId}:${idempotencyKey}`.slice(0, 64) : null,
          intended_invoice_ids: invoices.map((i) => i.id.toString()).sort(),
          expires_at: expiresAt,
          raw_response: { return_path: returnPath, ...(callerOrigin ? { app_origin: callerOrigin } : {}) },
        },
      }),
    );
    // VNPay hosts the card page: we only build a signed URL; the money is confirmed by the IPN call (or the signed return)
    const base = `${this.resolvePublicApiUrl(opts.req)}/v1/payments`;
    const redirectUrl = buildPaymentUrl({ txnRef: String(orderCode), amountVnd: Number(amount), orderInfo: `Thanh toan ${payment.code}`, returnUrl: `${base}/vnpay/return`, ip: opts.ip, createdAt: now, expiresAt });
    const updated = await this.prisma.payment.update({
      where: { id: payment.id },
      data: { raw_response: { return_path: returnPath, ...(callerOrigin ? { app_origin: callerOrigin } : {}), checkout_url: redirectUrl, vnp_create_date: vnTime(now), vnp_order_info: `Thanh toan ${payment.code}` } },
    });
    return { payment: updated, redirectUrl };
  }

  /**
   * Applies a gateway outcome to a payment, once. Shared by the VNPay IPN and the signed return, so both
   * can run in any order or twice: the payment row is locked and settled payments are never re-applied.
   */
  private async settle(orderRef: string, out: { status: 'SUCCEEDED'; txnId: string; amount: number } | { status: 'CANCELLED' | 'EXPIRED' } | { status: 'FAILED'; code: string; message: string }, provider: 'VNPAY' = 'VNPAY') {
    return this.prisma.tx(async (tx) => {
      const rows = await tx.$queryRaw<{ id: bigint }[]>`SELECT id FROM payments WHERE provider = ${provider} AND provider_order_ref = ${orderRef} FOR UPDATE`;
      if (!rows.length) return 'IGNORED' as const;
      const payment = await tx.payment.findUniqueOrThrow({ where: { id: rows[0].id } });
      if (payment.status === 'SUCCEEDED' || payment.status === 'FAILED' || payment.status === 'REFUNDED' || payment.status === 'PARTIALLY_REFUNDED') return 'DUPLICATE' as const;
      if (out.status !== 'SUCCEEDED') {
        if (payment.status !== 'PENDING') return 'IGNORED' as const;
        await tx.payment.update({ where: { id: payment.id }, data: out.status === 'FAILED' ? { status: 'FAILED', failure_code: out.code, failure_message: out.message.slice(0, 250) } : { status: out.status } });
        if (out.status === 'FAILED') {
          const cust = await tx.customer.findUnique({ where: { id: payment.customer_id } });
          if (cust?.user_id) await this.notify.notify({ users: [cust.user_id], event: 'payment.failed', vars: { code: payment.code, amount: fmt(payment.amount), reason: out.message }, link: '/app/billing', related: { type: 'payment', id: payment.id }, email: true }, tx);
        }
        return 'PROCESSED' as const;
      }
      if (D(out.amount).lt(payment.amount)) {
        // Less money than the invoice asked for: never settle it as paid. Flag for manual reconciliation and leave the payment open.
        await tx.payment.update({ where: { id: payment.id }, data: { reconciliation_status: 'MISMATCH', raw_response: { ...((payment.raw_response as Record<string, unknown> | null) ?? {}), short_paid_amount: out.amount } } });
        return 'FAILED' as const;
      }
      if (!D(out.amount).eq(payment.amount)) await tx.payment.update({ where: { id: payment.id }, data: { reconciliation_status: 'MISMATCH' } });
      const dup = await tx.payment.findFirst({ where: { provider, provider_txn_id: out.txnId } });
      if (dup) return 'DUPLICATE' as const;
      const prev = (payment.raw_response as Record<string, unknown> | null) ?? {};
      const p = await tx.payment.update({ where: { id: payment.id }, data: { status: 'SUCCEEDED', provider_txn_id: out.txnId, paid_at: this.core.now(), raw_response: { ...prev, txn_id: out.txnId, paid_amount: out.amount } } });
      await this.applyPayment(tx, p, null);
      return 'PROCESSED' as const;
    });
  }

  /**
   * VNPay IPN (server-to-server, source of truth) and signed return (browser) both land here. The signature
   * is verified, the amount is compared with what we asked for, and settle() applies the outcome once —
   * so IPN and return can arrive in any order, or twice.
   */
  async vnpayCallback(query: Record<string, unknown>, via: 'ipn' | 'return') {
    const r = verifyQuery(query);
    if (!r.valid) return { code: 'INVALID_SIGNATURE' as const };
    const pay = await this.prisma.payment.findFirst({ where: { provider: 'VNPAY', provider_order_ref: r.txnRef } });
    if (!pay) return { code: 'ORDER_NOT_FOUND' as const };
    if (!D(r.amountVnd).eq(pay.amount)) return { code: 'INVALID_AMOUNT' as const, publicId: pay.public_id };
    const already = pay.status === 'SUCCEEDED';
    try {
      await this.prisma.paymentWebhookEvent.create({ data: { provider: 'VNPAY', event_id: `${via}:${r.txnRef}:${r.txnNo || r.responseCode}`.slice(0, 128), signature_valid: true, payload: query as object, processed_at: new Date() } });
    } catch { /* same notification delivered twice — settle() below is idempotent */ }
    if (r.success) await this.settle(r.txnRef, { status: 'SUCCEEDED', txnId: r.txnNo || `VNPAY-${r.txnRef}`, amount: r.amountVnd }, 'VNPAY');
    else if (r.responseCode === '24') await this.settle(r.txnRef, { status: 'CANCELLED' }, 'VNPAY'); // customer pressed "cancel" on VNPay's page
    else await this.settle(r.txnRef, { status: 'FAILED', code: `VNPAY_${r.responseCode}`, message: `VNPay từ chối giao dịch (mã ${r.responseCode})` }, 'VNPAY');
    const status = (await this.prisma.payment.findUnique({ where: { id: pay.id }, select: { status: true } }))?.status ?? pay.status;
    return { code: already ? ('ALREADY_CONFIRMED' as const) : ('OK' as const), publicId: pay.public_id, status };
  }

  /**
   * Statement rows for reconciliation, straight from VNPay: every online payment our system settled that day is looked up
   * (querydr) and reported with the amount VNPay says it took. A payment VNPay does not know / did not complete yields no row,
   * so it shows up as "thiếu ở cổng" for real instead of because nobody typed a statement.
   */
  async fetchVnpayStatement(day: Date) {
    if (!vnpayConfigured()) throw new AppError('PAYMENT_PROVIDER_ERROR', 'Cổng VNPay chưa được cấu hình');
    const next = new Date(day.getTime() + 86400000);
    const pays = await this.prisma.payment.findMany({ where: { method: 'GATEWAY', provider: 'VNPAY', status: { in: ['SUCCEEDED', 'PARTIALLY_REFUNDED', 'REFUNDED'] }, paid_at: { gte: day, lt: next } }, take: 200 });
    const rows: { txnId: string; amount: number }[] = [];
    for (const p of pays) {
      const raw = (p.raw_response as Record<string, string> | null) ?? {};
      // one failure (gateway unreachable) ends the lookup at once: the caller falls back instead of waiting on every payment
      const info = await queryTransaction({ txnRef: p.provider_order_ref ?? '', transactionDate: raw.vnp_create_date ?? vnTime(p.created_at), orderInfo: raw.vnp_order_info ?? `Thanh toan ${p.code}` });
      if (info.success) rows.push({ txnId: p.provider_txn_id ?? info.txnNo, amount: info.amountVnd });
    }
    return rows;
  }

  /** Allocates a succeeded payment to invoices (intended first, oldest due first); rest is credit. */
  async applyPayment(tx: Tx, payment: Prisma.PaymentGetPayload<object>, actor: bigint | null) {
    const intended = ((payment.intended_invoice_ids as string[] | null) ?? []).map((x) => BigInt(x));
    let invoices = await tx.invoice.findMany({ where: { id: { in: intended }, status: { in: ['ISSUED', 'PARTIALLY_PAID'] } }, orderBy: [{ due_date: 'asc' }, { id: 'asc' }] });
    let remaining = D(payment.amount);
    const paid: bigint[] = [];
    for (const inv of invoices) {
      if (remaining.lte(0)) break;
      const due = D(inv.total).sub(inv.amount_paid).sub(inv.amount_credited);
      if (due.lte(0)) continue;
      const take = Prisma.Decimal.min(due, remaining);
      await tx.paymentAllocation.create({ data: { payment_id: payment.id, invoice_id: inv.id, amount: take } });
      await tx.invoice.update({ where: { id: inv.id }, data: { amount_paid: { increment: take }, version: { increment: 1 } } });
      const after = await this.core.refreshInvoiceStatus(tx, inv.id);
      if (after.status === 'PAID') paid.push(inv.id);
      remaining = remaining.sub(take);
    }
    await this.core.ledger(tx, { customerId: payment.customer_id, type: 'PAYMENT', amount: D(payment.amount).neg(), sourceType: 'payment', sourceId: payment.id, description: payment.code, actor });
    const uid = await this.core.customerUser(tx, payment.customer_id);
    if (uid && payment.method !== 'CREDIT_BALANCE') {
      await this.notify.notify({ users: [uid], event: 'payment.succeeded', vars: { amount: fmt(payment.amount), code: payment.code }, link: `/app/billing?payment=${payment.public_id}`, related: { type: 'payment', id: payment.id }, email: true }, tx);
    }
    for (const id of paid) {
      const inv = await tx.invoice.findUniqueOrThrow({ where: { id } });
      for (const h of this.invoiceHooks) await h(tx, inv, actor);
    }
    for (const h of this.paymentHooks) await h(tx, payment, actor);
    invoices = [];
  }

  /** POST /payments/offline, check-in step 3 (FR-S counter payment). */
  async recordOffline(ctx: AccessContext, d: { customerPublicId?: string; invoicePublicIds: string[]; amount?: number; method: 'CASH' | 'BANK_TRANSFER'; reference?: string }, idemKey?: string) {
    ctx.require('payment.record_offline');
    const invoices = await this.prisma.invoice.findMany({ where: { public_id: { in: d.invoicePublicIds } }, include: { customer: true } });
    if (!invoices.length || invoices.length !== d.invoicePublicIds.length) throw notFound('Hóa đơn');
    const customerId = invoices[0].customer_id;
    for (const i of invoices) {
      ctx.assertScope('payment.record_offline', i, 'Hóa đơn', true);
      if (i.customer_id !== customerId) throw validation('Các hóa đơn phải cùng một khách hàng');
      if (!['ISSUED', 'PARTIALLY_PAID'].includes(i.status)) throw new AppError('INVALID_STATUS_TRANSITION', `Hóa đơn ${i.code} không cần thanh toán`);
    }
    ctx.assertNotOwnContract(invoices[0].customer.user_id);
    const due = invoices.reduce((s, i) => s.add(D(i.total).sub(i.amount_paid).sub(i.amount_credited)), D(0));
    const amount = vnd(d.amount ?? due);
    if (amount.lte(0)) throw validation('Số tiền không hợp lệ');
    return this.prisma.tx(async (tx) => {
      const now = this.core.now();
      const p = await tx.payment.create({
        data: {
          public_id: newId(), code: await nextCode(tx, 'RCP', now.getFullYear()), customer_id: customerId, facility_id: invoices[0].facility_id,
          method: d.method, amount, status: 'SUCCEEDED', paid_at: now, recorded_by: ctx.userId, bank_reference: d.reference?.slice(0, 100),
          idempotency_key: idemKey ? `${ctx.userId}:${idemKey}`.slice(0, 64) : null, intended_invoice_ids: invoices.map((i) => i.id.toString()), reconciliation_status: 'MATCHED',
        },
      });
      await this.applyPayment(tx, p, ctx.userId);
      await this.audit.log(ctx, { action: 'payment.record_offline', entityType: 'payment', entityId: p.id, entityRef: p.code, facilityId: p.facility_id, after: { amount: amount.toString(), method: d.method, invoices: invoices.map((i) => i.code) } }, tx);
      return tx.payment.findUniqueOrThrow({ where: { id: p.id }, include: { allocations: { include: { invoice: { select: { public_id: true, code: true, status: true } } } } } });
    });
  }

  /** Deposit applied to outstanding invoices at settlement / termination (method CREDIT_BALANCE). */
  async applyDeposit(tx: Tx, customerId: bigint, facilityId: bigint, invoiceIds: bigint[], amount: Prisma.Decimal, actor: bigint | null) {
    if (amount.lte(0) || !invoiceIds.length) return null;
    const p = await tx.payment.create({
      data: {
        public_id: newId(), code: await nextCode(tx, 'RCP', this.core.now().getFullYear()), customer_id: customerId, facility_id: facilityId,
        method: 'CREDIT_BALANCE', amount, status: 'SUCCEEDED', paid_at: this.core.now(), recorded_by: actor, intended_invoice_ids: invoiceIds.map(String), reconciliation_status: 'MATCHED',
      },
    });
    await this.applyPayment(tx, p, actor);
    return p;
  }

  // ------------------------------------------------------------------ refunds (§6.3 3C step 8, §7.1)
  async createRefund(
    tx: Tx,
    d: { customerId: bigint; facilityId: bigint; paymentId?: bigint | null; contractId?: bigint | null; reservationId?: bigint | null; reason: Prisma.RefundCreateInput['reason']; amount: Prisma.Decimal; depositPortion?: Prisma.Decimal; requestedBy: bigint | null; autoApprove?: boolean; note?: string; ticketId?: bigint | null; method?: 'ORIGINAL_METHOD' | 'BANK_TRANSFER' | 'CASH' },
  ) {
    const policy = await this.core.activePolicy(d.facilityId, tx);
    if (d.paymentId && (d.reason === 'CANCELLATION' || d.reason === 'LATE_WEBHOOK')) {
      // A refund can never exceed what that payment still holds (paid − already refunded − refunds in flight).
      const pay = await tx.payment.findUnique({ where: { id: d.paymentId } });
      const inFlight = await tx.refund.aggregate({ where: { payment_id: d.paymentId, status: { in: ['PENDING_APPROVAL', 'APPROVED', 'MANUAL_REQUIRED', 'PROCESSING'] } }, _sum: { amount: true } });
      const room = D(pay?.amount).sub(pay?.refunded_amount ?? 0).sub(inFlight._sum.amount ?? 0);
      if (pay && d.amount.gt(room)) throw validation('Số tiền hoàn vượt quá số đã thanh toán còn lại của giao dịch');
    }
    const role = d.amount.gt(policy.params.fm_refund_limit) ? 'BUSINESS_OPS_MANAGER' : 'FACILITY_MANAGER';
    const payment = d.paymentId ? await tx.payment.findUnique({ where: { id: d.paymentId } }) : null;
    // the gateway refund is not automated: money goes back to the customer by bank transfer recorded by staff
    const method = d.method ?? 'BANK_TRANSFER';
    void payment;
    const r = await tx.refund.create({
      data: {
        public_id: newId(), payment_id: d.paymentId ?? null, customer_id: d.customerId, facility_id: d.facilityId, contract_id: d.contractId ?? null, reservation_id: d.reservationId ?? null,
        reason: d.reason, amount: vnd(d.amount), deposit_portion: vnd(d.depositPortion ?? 0), method, required_approver_role: role, requested_by: d.requestedBy,
        status: d.autoApprove ? 'APPROVED' : 'PENDING_APPROVAL', approved_at: d.autoApprove ? this.core.now() : null, note: d.note, ticket_id: d.ticketId ?? null,
      },
    });
    if (!d.autoApprove) {
      const approvers = role === 'FACILITY_MANAGER' ? await this.core.facilityManagers(tx, d.facilityId) : await this.core.businessOpsManagers(tx);
      await this.notify.notify({ users: approvers, event: 'refund.approval_required', vars: { amount: fmt(d.amount), reason: d.reason }, link: role === 'FACILITY_MANAGER' ? '/manage/approvals' : '/ops/approvals', related: { type: 'refund', id: r.id }, email: false }, tx);
    }
    return r;
  }

  /** A facility manager may only release refunds up to the policy limit; anything above needs the Business Operations Manager (global scope). */
  async assertWithinFmRefundLimit(ctx: AccessContext, facilityId: bigint, amount: Prisma.Decimal | string | number) {
    if (!ctx.can('refund.approve', false) || ctx.grant('refund.approve')?.scope === 'GLOBAL') return;
    const policy = await this.core.activePolicy(facilityId);
    if (D(amount).gt(policy.params.fm_refund_limit)) throw forbidden(`Vượt hạn mức hoàn tiền của quản lý cơ sở (${fmt(policy.params.fm_refund_limit)}) — cần Business Operations Manager xử lý`);
  }

  async approveRefund(ctx: AccessContext, publicId: string, approve: boolean, note?: string) {
    ctx.require('refund.approve');
    const r = await this.prisma.refund.findUnique({ where: { public_id: publicId } });
    ctx.assertScope('refund.approve', r, 'Yêu cầu hoàn tiền', true);
    if (r!.status !== 'PENDING_APPROVAL') throw new AppError('INVALID_STATUS_TRANSITION', 'Yêu cầu hoàn tiền không ở trạng thái chờ duyệt');
    await this.assertWithinFmRefundLimit(ctx, r!.facility_id, r!.amount);
    const cust = await this.prisma.customer.findUnique({ where: { id: r!.customer_id } });
    ctx.assertNotOwnContract(cust?.user_id);
    await this.prisma.refund.update({ where: { id: r!.id }, data: approve ? { status: 'APPROVED', approved_by: ctx.userId, approved_at: this.core.now(), note: note ?? r!.note } : { status: 'REJECTED', approved_by: ctx.userId, approved_at: this.core.now(), note } });
    await this.audit.log(ctx, { action: approve ? 'refund.approve' : 'refund.reject', entityType: 'refund', entityId: r!.id, entityRef: r!.public_id, facilityId: r!.facility_id, reason: note, after: { amount: r!.amount.toString() } });
    if (approve) await this.processRefund(r!.id, ctx.userId);
    return this.prisma.refund.findUniqueOrThrow({ where: { id: r!.id } });
  }

  /** Gateway refunds are not automated, so every approved refund waits for staff to transfer the money back and record the reference. */
  async processRefund(refundId: bigint, actor: bigint | null) {
    void actor;
    const r = await this.prisma.refund.findUniqueOrThrow({ where: { id: refundId } });
    if (!['APPROVED', 'FAILED'].includes(r.status)) return r;
    return this.prisma.refund.update({ where: { id: r.id }, data: { status: 'MANUAL_REQUIRED', attempts: { increment: 1 } } });
  }

  async markManual(ctx: AccessContext, publicId: string, reference: string) {
    if (!ctx.can('refund.approve', false) && !ctx.can('moveout.inspect', false)) {
      ctx.require('refund.approve');
    }
    let r = await this.prisma.refund.findUnique({ where: { public_id: publicId } });
    if (!r) {
      const st = await this.prisma.depositSettlement.findUnique({ where: { public_id: publicId } });
      if (st?.refund_id) r = await this.prisma.refund.findUnique({ where: { id: st.refund_id } });
    }
    if (!r) {
      const c = await this.prisma.contract.findFirst({ where: { OR: [{ public_id: publicId }, { code: publicId }] } });
      if (c) r = await this.prisma.refund.findFirst({ where: { contract_id: c.id }, orderBy: { id: 'desc' } });
    }
    if (!r) throw notFound('Yêu cầu hoàn tiền');
    if (!ctx.can('refund.approve', false)) {
      ctx.assertScope('moveout.inspect', { facility_id: r.facility_id }, 'Yêu cầu hoàn tiền', true);
    } else {
      ctx.assertScope('refund.approve', r, 'Yêu cầu hoàn tiền', true);
    }
    if (!['MANUAL_REQUIRED', 'FAILED', 'APPROVED', 'PENDING_APPROVAL'].includes(r.status)) throw new AppError('INVALID_STATUS_TRANSITION', 'Không thể ghi hoàn thủ công ở trạng thái hiện tại');
    // a refund still waiting for approval can only be paid out by someone who may approve it, and only within their limit
    if (r.status === 'PENDING_APPROVAL') {
      if (!ctx.can('refund.approve', false)) throw forbidden('Khoản hoàn này đang chờ người có thẩm quyền duyệt');
      await this.assertWithinFmRefundLimit(ctx, r.facility_id, r.amount);
    }
    return this.prisma.tx(async (tx) => {
      const out = await this.markRefundSucceeded(tx, r.id, ctx.userId, null, reference);
      await this.audit.log(ctx, { action: 'refund.mark_manual', entityType: 'refund', entityId: r.id, entityRef: r.public_id, facilityId: r.facility_id, after: { reference } }, tx);
      return out;
    });
  }

  private async markRefundSucceeded(tx: Tx, refundId: bigint, actor: bigint | null, providerRefundId: string | null, manualRef?: string) {
    const r = await tx.refund.update({ where: { id: refundId }, data: { status: 'SUCCEEDED', processed_at: this.core.now(), provider_refund_id: providerRefundId, manual_reference: manualRef?.slice(0, 100) } });
    const nonDeposit = D(r.amount).sub(r.deposit_portion);
    if (nonDeposit.gt(0)) await this.core.ledger(tx, { customerId: r.customer_id, contractId: r.contract_id, type: 'REFUND', amount: nonDeposit, sourceType: 'refund', sourceId: r.id, description: `Hoàn tiền ${r.reason}`, actor });
    if (D(r.deposit_portion).gt(0)) {
      await this.core.ledger(tx, { customerId: r.customer_id, contractId: r.contract_id, type: 'DEPOSIT_REFUNDED', amount: 0, sourceType: 'refund', sourceId: r.id, description: `Hoàn cọc ${fmt(r.deposit_portion)}`, actor });
      const dep = r.reservation_id ? await tx.deposit.findUnique({ where: { reservation_id: r.reservation_id } }) : r.contract_id ? await tx.deposit.findFirst({ where: { contract_id: r.contract_id } }) : null;
      if (dep) {
        const refunded = D(dep.refunded_amount).add(r.deposit_portion);
        const used = refunded.add(dep.applied_amount).add(dep.forfeited_amount);
        await tx.deposit.update({ where: { id: dep.id }, data: { refunded_amount: refunded, held_amount: Prisma.Decimal.max(D(0), D(dep.amount).sub(used)), status: used.gte(dep.amount) ? (D(dep.applied_amount).gt(0) || D(dep.forfeited_amount).gt(0) ? 'PARTIALLY_REFUNDED' : 'REFUNDED') : 'PARTIALLY_REFUNDED' } });
      }
    }
    if (r.payment_id) {
      const p = await tx.payment.findUniqueOrThrow({ where: { id: r.payment_id } });
      const refunded = Prisma.Decimal.min(D(p.amount), D(p.refunded_amount).add(r.amount));
      await tx.payment.update({ where: { id: p.id }, data: { refunded_amount: refunded, status: refunded.gte(p.amount) ? 'REFUNDED' : 'PARTIALLY_REFUNDED' } });
    }
    if ((r.reason === 'CANCELLATION' || r.reason === 'LATE_WEBHOOK') && r.reservation_id) {
      const inv = await tx.invoice.findFirst({ where: { reservation_id: r.reservation_id, type: 'RESERVATION', status: 'PAID' } });
      if (inv) await tx.invoice.update({ where: { id: inv.id }, data: { status: D(r.amount).gte(inv.amount_paid) ? 'REFUNDED' : 'PARTIALLY_REFUNDED' } });
    }
    if (r.contract_id) {
      const c = await tx.contract.findUnique({ where: { id: r.contract_id } });
      if (c && ['ENDED', 'TERMINATED'].includes(c.status)) {
        const st = await tx.depositSettlement.findUnique({ where: { contract_id: c.id } });
        const open = await tx.invoice.count({ where: { contract_id: c.id, status: { in: ['ISSUED', 'PARTIALLY_PAID'] } } });
        const unit = await tx.unit.findUnique({ where: { id: c.unit_id } });
        if (st?.status === 'FINALIZED' && !open && unit?.status !== 'PENDING_INSPECTION') {
          await this.core.setContractStatus(tx, c.id, 'CLOSED', actor, 'Đã hoàn tiền mặt và quyết toán xong', { closed_at: this.core.now() });
        }
      }
    }
    const uid = await this.core.customerUser(tx, r.customer_id);
    if (uid) await this.notify.notify({ users: [uid], event: 'refund.succeeded', vars: { amount: fmt(r.amount), code: r.manual_reference ?? r.public_id, reason: r.reason }, link: '/app/billing', related: { type: 'refund', id: r.id }, email: true }, tx);
    return r;
  }
}
