import { Injectable, OnModuleInit } from '@nestjs/common';
import { DELINQUENCY_STAGES, DelinquencyStage, PolicyParams } from '@vaultra/shared';
import { PrismaService, Tx } from '../common/prisma.service';
import { AppError, forbidden, notFound, validation } from '../common/errors';
import { D, newId, vnd } from '../common/util';
import { addDays, dateOnly, diffDays } from '../common/dates';
import { CoreService, fmt, fmtD } from '../domain/core.service';
import { AccessService } from '../access/access.service';
import { PaymentService } from '../billing/payment.service';
import { ContractService } from '../contract/contract.service';
import { MediaService } from '../media/media.service';
import { NotificationService } from '../notifications/notification.service';
import { AuditService } from '../audit/audit.service';
import type { AccessContext } from '../auth/access-context';

const ORDER: DelinquencyStage[] = [...DELINQUENCY_STAGES];
const LIVE = ['ACTIVE', 'MOVE_OUT_SCHEDULED', 'EXPIRED'] as const;

/**
 * Overdue handling (spec §6.6 6B): hourly idempotent job computes the target stage from the oldest
 * unpaid due invoice, walks stage by stage (no skipped notices), applies actions; payment restores.
 * Termination and goods disposal are never automatic (FM confirm + BOM approval).
 */
@Injectable()
export class DelinquencyService implements OnModuleInit {
  constructor(
    private prisma: PrismaService,
    private core: CoreService,
    private access: AccessService,
    private payments: PaymentService,
    private contracts: ContractService,
    private media: MediaService,
    private notify: NotificationService,
    private audit: AuditService,
  ) {}

  onModuleInit() {
    this.payments.onPaymentSucceeded(async (tx, p, actor) => {
      const contracts = await tx.contract.findMany({ where: { customer_id: p.customer_id, status: { in: [...LIVE] }, delinquency_status: { not: 'CURRENT' } } });
      for (const c of contracts) await this.evaluate(tx, c.id, actor, true);
    });
  }

  targetStage(days: number, p: PolicyParams): DelinquencyStage {
    if (days <= 0) return 'CURRENT';
    if (days <= p.grace_days) return 'GRACE';
    if (days < p.lockout_day) return 'LATE';
    if (days < p.final_notice_day) return 'LOCKED_OUT';
    if (days < p.default_day) return 'FINAL_NOTICE';
    return 'DEFAULT_PENDING';
  }

  lateFee(p: PolicyParams, rent: ReturnType<typeof D>) {
    const fixed = D(p.late_fee_fixed);
    const pct = vnd(rent.mul(p.late_fee_pct).div(100));
    const v = p.late_fee_type === 'FIXED' ? fixed : p.late_fee_type === 'PERCENT_OF_RENT' ? pct : (fixed.gt(pct) ? fixed : pct);
    return vnd(v.gt(p.late_fee_cap) ? D(p.late_fee_cap) : v);
  }

  async runJob() {
    const today = this.core.today();
    const withOverdue = await this.prisma.invoice.findMany({ where: { status: { in: ['ISSUED', 'PARTIALLY_PAID'] }, due_date: { lt: today }, contract_id: { not: null } }, select: { contract_id: true }, distinct: ['contract_id'] });
    const nonCurrent = await this.prisma.contract.findMany({ where: { delinquency_status: { notIn: ['CURRENT', 'DEFAULTED'] } }, select: { id: true } });
    const ids = [...new Set([...withOverdue.map((x) => x.contract_id!), ...nonCurrent.map((x) => x.id)].map(String))].map((x) => BigInt(x));
    let changed = 0;
    for (const id of ids) {
      const r = await this.prisma.tx((tx) => this.evaluate(tx, id, null, false)).catch((e) => { console.error('[delinquency] evaluate failed for contract', String(id), (e as Error).message); return false; });
      if (r) changed += 1;
    }
    // GRACE reminders D+1 and D+3 (dedupe)
    const grace = await this.prisma.contract.findMany({ where: { delinquency_status: 'GRACE' } });
    for (const c of grace) {
      const inv = await this.oldestOverdue(this.prisma, c.id);
      if (!inv) continue;
      const days = diffDays(today, inv.due_date);
      if (days === 1 || days === 3) {
        const uid = await this.core.customerUser(this.prisma, c.customer_id);
        const p = await this.core.policyById(c.policy_version_id);
        if (uid) await this.notify.notify({ users: [uid], event: 'invoice.overdue', vars: { code: inv.code, days, amount: fmt(D(inv.total).sub(inv.amount_paid).sub(inv.amount_credited)), lateFeeDate: fmtD(addDays(inv.due_date, p.grace_days + 1)) }, link: `/app/billing/invoices/${inv.public_id}`, related: { type: 'invoice', id: inv.id }, email: true, dedupeKey: `invoice.overdue:${inv.id}:D+${days}` });
      }
    }
    // safety net: lift stale booking blocks (e.g. debt cleared by deposit, or by a payment that did not go through restore)
    const blocked = await this.prisma.customer.findMany({ where: { booking_blocked: true }, select: { id: true } });
    for (const b of blocked) await this.syncBookingBlock(this.prisma, b.id).catch(() => undefined);
    return changed;
  }

  async oldestOverdue(db: Tx | PrismaService, contractId: bigint) {
    return db.invoice.findFirst({ where: { contract_id: contractId, status: { in: ['ISSUED', 'PARTIALLY_PAID'] }, due_date: { lt: this.core.today() } }, orderBy: [{ due_date: 'asc' }, { id: 'asc' }] });
  }

  /** Computes and applies the stage for one contract. Returns true if it changed. */
  async evaluate(tx: Tx, contractId: bigint, actor: bigint | null, fromPayment: boolean): Promise<boolean> {
    const c = await tx.contract.findUniqueOrThrow({ where: { id: contractId }, include: { unit: true, customer: true, facility: true } });
    if (!LIVE.includes(c.status as (typeof LIVE)[number]) || c.delinquency_status === 'DEFAULTED') return false;
    const p = await this.core.policyById(c.policy_version_id, tx);
    const today = this.core.today(c.facility.timezone);
    const oldest = await this.oldestOverdue(tx, c.id);
    let target: DelinquencyStage = oldest ? this.targetStage(diffDays(today, oldest.due_date), p) : 'CURRENT';
    // Restoring from LOCKED_OUT+ requires every due invoice paid (incl. late & overlock fees) — §6.6 "Thanh toán để khôi phục".
    if (target === 'CURRENT' && ORDER.indexOf(c.delinquency_status) >= ORDER.indexOf('LOCKED_OUT')) {
      const dueToday = await tx.invoice.count({ where: { contract_id: c.id, status: { in: ['ISSUED', 'PARTIALLY_PAID'] }, due_date: { lte: today } } });
      if (dueToday) target = c.delinquency_status;
    }
    // Disputed invoice or active promise-to-pay: no lockout (§6.6 rule 2)
    if (oldest && ORDER.indexOf(target) >= ORDER.indexOf('LOCKED_OUT')) {
      const promise = await tx.promiseToPay.findFirst({ where: { contract_id: c.id, status: 'ACTIVE', promised_date: { gte: today } } });
      // A dispute only pauses the chain while it is genuinely being handled: an OPEN PAYMENT ticket on this invoice, opened < 7 days ago.
      // Otherwise a customer could freeze lock-out and termination forever by opening a ticket and never answering it.
      const liveDispute = oldest.dispute_hold
        ? await tx.supportTicket.count({ where: { invoice_id: oldest.id, category: 'PAYMENT', status: { in: ['NEW', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'REOPENED'] }, created_at: { gt: addDays(this.core.now(), -7) } } })
        : 0;
      if (liveDispute || promise) target = ORDER.indexOf(c.delinquency_status) > ORDER.indexOf('LATE') ? c.delinquency_status : 'LATE';
    }
    const from = c.delinquency_status;
    if (target === from) return false;
    if (target !== 'CURRENT' && from === 'DEFAULT_PENDING' && (await tx.terminationRequest.count({ where: { contract_id: c.id, bom_decision: 'PENDING' } }))) return false; // a pending termination request keeps the case in DEFAULT_PENDING
    if (target === 'CURRENT') {
      await tx.terminationRequest.updateMany({ where: { contract_id: c.id, bom_decision: 'PENDING' }, data: { bom_decision: 'REJECTED', note: 'Khách đã thanh toán đủ — yêu cầu thu hồi tự đóng' } });
      await this.restore(tx, c.id, from, oldest?.id ?? null, actor);
      return true;
    }
    if (fromPayment && ORDER.indexOf(target) > ORDER.indexOf(from)) return false;
    if (ORDER.indexOf(target) < ORDER.indexOf(from)) {
      // partial payment moved the clock to a newer invoice: step back without re-running actions
      await this.setStage(tx, c.id, from, target, oldest!.id, diffDays(today, oldest!.due_date), { recalculated: true }, actor);
      return true;
    }
    // walk forward one stage at a time so every notice is sent (§6.6 rule 1)
    let cur: DelinquencyStage = from;
    for (let i = ORDER.indexOf(from) + 1; i <= ORDER.indexOf(target); i++) {
      const next = ORDER[i];
      const ok = await this.enterStage(tx, c.id, next, oldest!, p, actor);
      if (!ok) break;
      await this.setStage(tx, c.id, cur, next, oldest!.id, diffDays(today, oldest!.due_date), ok === true ? {} : ok, actor);
      cur = next;
    }
    return cur !== from;
  }

  private async setStage(tx: Tx, contractId: bigint, from: DelinquencyStage, to: DelinquencyStage, invoiceId: bigint, days: number, actions: object, actor: bigint | null) {
    await tx.contract.update({ where: { id: contractId }, data: { delinquency_status: to, version: { increment: 1 } } });
    await tx.delinquencyEvent.create({ data: { contract_id: contractId, invoice_id: invoiceId, from_stage: from, to_stage: to, days_overdue: days, actions } });
    await tx.contractStatusHistory.create({ data: { contract_id: contractId, field: 'DELINQUENCY', from_status: from, to_status: to, actor_user_id: actor, reason: `Quá hạn ${days} ngày` } });
  }

  /** Actions on entering a stage. Returns false to stop (e.g. no evidence of final notice). */
  private async enterStage(tx: Tx, contractId: bigint, stage: DelinquencyStage, inv: { id: bigint; code: string; public_id: string; due_date: Date; total: unknown; amount_paid: unknown; amount_credited: unknown; late_fee_applied: boolean }, p: PolicyParams, actor: bigint | null): Promise<false | true | object> {
    const c = await tx.contract.findUniqueOrThrow({ where: { id: contractId }, include: { unit: true, customer: true } });
    const uid = c.customer.user_id;
    const fms = await this.core.facilityManagers(tx, c.facility_id);
    const days = diffDays(this.core.today(), inv.due_date);
    const debt = await this.debt(tx, c.id);
    switch (stage) {
      case 'GRACE':
        if (uid) await this.notify.notify({ users: [uid], event: 'invoice.overdue', vars: { code: inv.code, days, amount: fmt(debt), lateFeeDate: fmtD(addDays(inv.due_date, p.grace_days + 1)) }, link: `/app/billing/invoices/${inv.public_id}`, related: { type: 'invoice', id: inv.id }, email: true, dedupeKey: `invoice.overdue:${inv.id}:D+1` }, tx);
        return true;
      case 'LATE': {
        let fee = D(0);
        if (!inv.late_fee_applied) {
          fee = this.lateFee(p, D(c.monthly_rent));
          const ft = await tx.feeType.findUnique({ where: { code: 'LATE_FEE' } });
          // Issued invoices are immutable (§7.1): late fee is a supplementary invoice linked to the overdue one.
          const lf = await this.core.createInvoice(tx, { customerId: c.customer_id, facilityId: c.facility_id, contractId: c.id, type: 'AD_HOC', dueDate: this.core.today(), vatRate: p.vat_rate, pricesIncludeVat: p.prices_include_vat, items: [{ item_type: 'FEE', fee_type_id: ft?.id, description: `Phí trễ hạn hóa đơn ${inv.code}`, amount: fee, source_type: 'late_fee', source_id: inv.id }], actor, notify: false });
          await tx.invoice.update({ where: { id: inv.id }, data: { late_fee_applied: true } });
          if (uid) await this.notify.notify({ users: [uid], event: 'late_fee.applied', vars: { code: inv.code, lateFeeCode: lf.code, amount: fmt(fee), unitCode: c.unit.code }, link: `/app/billing/invoices/${lf.public_id}`, related: { type: 'invoice', id: lf.id }, email: true }, tx);
        }
        await tx.customer.update({ where: { id: c.customer_id }, data: { booking_blocked: true, booking_blocked_reason: 'Có hợp đồng quá hạn thanh toán' } });
        await this.core.createTask(tx, { facilityId: c.facility_id, type: 'COLLECTION_CALL', title: `Gọi nhắc nợ ${c.code} (${c.unit.code}) — ${fmt(debt.add(fee))}`, related: { type: 'contract', id: c.id }, dueAt: addDays(this.core.now(), 1), dedupeKey: `COLLECT:${c.id}:${inv.id}` });
        await this.notify.notify({ users: fms, event: 'invoice.overdue', vars: { code: inv.code, days, amount: fmt(debt.add(fee)), lateFeeDate: '' }, link: `/manage/delinquency`, related: { type: 'invoice', id: inv.id }, email: false, dedupeKey: `fm.late:${inv.id}` }, tx);
        return { lateFee: Number(fee) };
      }
      case 'LOCKED_OUT': {
        const n = await this.access.suspendAll(tx, c.id, `Quá hạn ${days} ngày`);
        await this.core.createTask(tx, { facilityId: c.facility_id, type: 'OVERLOCK', title: `Gắn khóa chặn kho ${c.unit.code} (${c.code})`, related: { type: 'contract', id: c.id }, unitId: c.unit_id, priority: 'HIGH', dueAt: addDays(this.core.now(), 1), dedupeKey: `OVERLOCK:contract:${c.id}:inv:${inv.id}`, requiresPhoto: true });
        if (uid) await this.notify.notify({ users: [uid], event: 'access.suspended', vars: { code: c.code, unitCode: c.unit.code, days, amount: fmt(debt) }, link: '/app/billing', priority: 'HIGH', related: { type: 'contract', id: c.id }, email: true }, tx);
        await this.notify.notify({ users: [...fms, ...(await this.core.facilityStaff(tx, c.facility_id))], event: 'overlock.task_created', vars: { code: c.code, unitCode: c.unit.code }, link: '/staff/tasks', related: { type: 'contract', id: c.id }, email: false }, tx);
        return { credentialsSuspended: n.count };
      }
      case 'FINAL_NOTICE': {
        const deadline = addDays(inv.due_date, p.default_day);
        const doc = await this.contracts.generateDocument(tx, c.id, 'FINAL_NOTICE', [
          { heading: 'Thông báo cuối', paragraphs: [`Hợp đồng ${c.code} (kho ${c.unit.code}) quá hạn thanh toán ${days} ngày với tổng nợ ${fmt(debt)}.`, `Hạn cuối thanh toán: ${fmtD(deadline)}. Sau thời hạn này, hợp đồng có thể bị chấm dứt do vi phạm theo điều khoản đã ký; tài sản trong kho được kiểm kê có người làm chứng và lưu giữ ${p.abandoned_goods_hold_days} ngày trước khi xử lý theo quy định pháp luật.`] },
        ], `THÔNG BÁO CUỐI — HỢP ĐỒNG ${c.code}`);
        if (uid) await this.notify.notify({ users: [uid], event: 'final_notice.sent', vars: { code: c.code, unitCode: c.unit.code, days, amount: fmt(debt), deadline: fmtD(deadline) }, link: '/app/billing', priority: 'HIGH', related: { type: 'contract', id: c.id }, email: true, dedupeKey: `final_notice:${c.id}:${inv.id}` }, tx);
        return { finalNoticeDoc: doc.sha256 };
      }
      case 'DEFAULT_PENDING': {
        // Evidence that the final notice was delivered (§6.6 exceptions)
        const sent = await tx.notificationDelivery.findMany({ where: { status: { in: ['SENT', 'DELIVERED'] }, notification: { event_code: 'final_notice.sent', user_id: uid ?? BigInt(0) } }, include: { notification: true } });
        if (!sent.length) {
          await this.notify.notify({ users: fms, event: 'default.approval_required', vars: { code: c.code, days }, link: '/manage/delinquency', related: { type: 'contract', id: c.id }, email: false, dedupeKey: `default.noevidence:${c.id}` }, tx);
          return false;
        }
        const existing = await tx.terminationRequest.findFirst({ where: { contract_id: c.id, bom_decision: 'PENDING' } });
        if (!existing) {
          await tx.terminationRequest.create({ data: { public_id: newId(), contract_id: c.id, reason: 'DEFAULT', evidence: sent.map((s) => ({ delivery: s.id.toString(), recipient: s.recipient, sentAt: s.sent_at, event: s.notification.event_code })) } });
        }
        await this.notify.notify({ users: fms, event: 'default.approval_required', vars: { code: c.code, days }, link: '/manage/delinquency', related: { type: 'contract', id: c.id }, email: false, dedupeKey: `default.pending:${c.id}` }, tx);
        return { terminationRequest: true };
      }
      default:
        return true;
    }
  }

  async debt(db: Tx | PrismaService, contractId: bigint) {
    const open = await db.invoice.findMany({ where: { contract_id: contractId, status: { in: ['ISSUED', 'PARTIALLY_PAID'] } } });
    return open.reduce((s, i) => s.add(D(i.total).sub(i.amount_paid).sub(i.amount_credited)), D(0));
  }

  /**
   * Where a contract's debt comes from: every unpaid invoice with its lines, and the same money grouped by kind
   * (rent, late fee, overlock fee, damage...). `parts` always adds up to exactly `total` (= debt()): whatever the
   * lines do not explain (VAT added on top, rounding) is shown as its own "Thuế & điều chỉnh khác" part.
   */
  async debtBreakdown(db: Tx | PrismaService, contractId: bigint) {
    const open = await db.invoice.findMany({ where: { contract_id: contractId, status: { in: ['ISSUED', 'PARTIALLY_PAID'] } }, include: { items: true }, orderBy: [{ due_date: 'asc' }, { id: 'asc' }] });
    const feeTypes = new Map((await db.feeType.findMany()).map((f) => [f.id.toString(), f.code]));
    const today = this.core.today();
    const kindOf = (it: { item_type: string; source_type: string | null; fee_type_id: bigint | null }) => {
      if (it.source_type === 'late_fee') return 'LATE_FEE';
      const code = it.fee_type_id ? feeTypes.get(it.fee_type_id.toString()) : undefined;
      if (code === 'LATE_FEE' || code === 'OVERLOCK_FEE') return code;
      return it.item_type === 'RENT' || it.item_type === 'PRORATION' ? 'RENT' : it.item_type === 'DAMAGE' ? 'DAMAGE' : it.item_type === 'DISCOUNT' ? 'DISCOUNT' : it.item_type === 'ADJUSTMENT' ? 'ADJUSTMENT' : 'FEE';
    };
    const sums = new Map<string, ReturnType<typeof D>>();
    const put = (k: string, v: ReturnType<typeof D>) => sums.set(k, (sums.get(k) ?? D(0)).add(v));
    const invoices = open.map((i) => {
      const lines = i.items.map((it) => ({ kind: kindOf(it), description: it.description, amount: Number(it.amount) }));
      const paid = D(i.amount_paid);
      const credited = D(i.amount_credited);
      const outstanding = D(i.total).sub(paid).sub(credited);
      let explained = D(0);
      for (const it of i.items) { put(kindOf(it), D(it.amount)); explained = explained.add(it.amount); }
      if (paid.gt(0)) put('PAID', paid.neg());
      if (credited.gt(0)) put('CREDITED', credited.neg());
      const other = outstanding.sub(explained.sub(paid).sub(credited)); // VAT added on top, rounding
      if (!other.isZero()) put('OTHER', other);
      return {
        id: i.public_id, code: i.code, type: i.type, dueDate: i.due_date, daysOverdue: diffDays(today, i.due_date), status: i.status,
        total: Number(i.total), paid: Number(paid), credited: Number(credited), outstanding: Number(outstanding), otherAdjust: Number(other), lines,
      };
    });
    const order = ['RENT', 'LATE_FEE', 'OVERLOCK_FEE', 'DAMAGE', 'FEE', 'ADJUSTMENT', 'DISCOUNT', 'OTHER', 'PAID', 'CREDITED'];
    const parts = order.filter((k) => sums.has(k) && !sums.get(k)!.isZero()).map((kind) => ({ kind, amount: Number(sums.get(kind)!) }));
    return { total: invoices.reduce((t, i) => t + i.outstanding, 0), parts, invoices };
  }

  /** A customer is blocked from new bookings only while an invoice of theirs is overdue and unpaid; once every such invoice is settled (paid, or covered by the deposit on termination) the block lifts. */
  async syncBookingBlock(db: Tx | PrismaService, customerId: bigint) {
    const c = await db.customer.findUnique({ where: { id: customerId }, select: { booking_blocked: true, booking_blocked_reason: true } });
    if (!c?.booking_blocked || !(c.booking_blocked_reason ?? '').includes('quá hạn')) return;
    const overdue = await db.invoice.count({ where: { customer_id: customerId, status: { in: ['ISSUED', 'PARTIALLY_PAID'] }, due_date: { lt: this.core.today() } } });
    if (!overdue) await db.customer.update({ where: { id: customerId }, data: { booking_blocked: false, booking_blocked_reason: null } });
  }

  private async restore(tx: Tx, contractId: bigint, from: DelinquencyStage, invoiceId: bigint | null, actor: bigint | null) {
    const c = await tx.contract.findUniqueOrThrow({ where: { id: contractId }, include: { unit: true, customer: true } });
    const lastInv = invoiceId ?? (await tx.invoice.findFirst({ where: { contract_id: c.id }, orderBy: { due_date: 'desc' } }))?.id;
    await this.setStage(tx, c.id, from, 'CURRENT', lastInv!, 0, { restored: true }, actor);
    const restored = await this.access.restoreAll(tx, c.id);
    const lock = await tx.overlock.findFirst({ where: { contract_id: c.id, removed_at: null } });
    if (lock) {
      await this.core.createTask(tx, { facilityId: c.facility_id, type: 'REMOVE_OVERLOCK', title: `Tháo khóa chặn kho ${c.unit.code} — khách đã thanh toán`, related: { type: 'contract', id: c.id }, unitId: c.unit_id, priority: 'HIGH', dueAt: new Date(this.core.now().getTime() + 4 * 3600000), dedupeKey: `REMOVE_OVERLOCK:${lock.id}`, requiresPhoto: true });
    }
    await tx.workTask.updateMany({ where: { related_type: 'contract', related_id: c.id, type: { in: ['OVERLOCK', 'COLLECTION_CALL'] }, status: { in: ['OPEN', 'ASSIGNED'] } }, data: { status: 'CANCELLED' } });
    await tx.terminationRequest.updateMany({ where: { contract_id: c.id, bom_decision: 'PENDING' }, data: { bom_decision: 'REJECTED', note: 'Khách đã thanh toán đủ' } });
    await this.syncBookingBlock(tx, c.customer_id);
    if (c.customer.user_id && ORDER.indexOf(from) >= ORDER.indexOf('LOCKED_OUT')) await this.notify.notify({ users: [c.customer.user_id], event: 'access.restored', vars: { code: c.code, unitCode: c.unit.code }, link: `/app/units/${c.public_id}`, related: { type: 'contract', id: c.id }, email: true }, tx);
    return restored;
  }

  // ------------------------------------------------------------------ human actions
  async list(ctx: AccessContext, q: { stage?: string; facilityId?: bigint }) {
    ctx.require('delinquency.manage', false);
    const rows = await this.prisma.contract.findMany({
      where: { ...ctx.scope('delinquency.manage'), delinquency_status: q.stage ? (q.stage as DelinquencyStage) : { not: 'CURRENT' }, status: { in: [...LIVE, 'TERMINATED'] }, ...(q.facilityId ? { facility_id: q.facilityId } : {}) },
      include: { customer: true, unit: true, facility: { select: { name: true, public_id: true } }, collection_notes: { orderBy: { created_at: 'desc' }, take: 1 } },
      orderBy: { updated_at: 'desc' },
    });
    const out = [];
    for (const c of rows) {
      const oldest = await this.oldestOverdue(this.prisma, c.id);
      const termination = await this.prisma.terminationRequest.findFirst({ where: { contract_id: c.id }, orderBy: { id: 'desc' } });
      const overlock = await this.prisma.overlock.findFirst({ where: { contract_id: c.id, removed_at: null } });
      const promise = await this.prisma.promiseToPay.findFirst({ where: { contract_id: c.id, status: 'ACTIVE' } });
      const breakdown = await this.debtBreakdown(this.prisma, c.id);
      out.push({ ...c, debt: breakdown.total, debtParts: breakdown.parts, debtInvoices: breakdown.invoices, daysOverdue: oldest ? diffDays(this.core.today(), oldest.due_date) : 0, oldestInvoice: oldest ? { id: oldest.public_id, code: oldest.code } : null, termination, overlock, promise, lastContact: c.collection_notes[0] ?? null });
    }
    return out;
  }

  async addNote(ctx: AccessContext, contractPublicId: string, d: { channel: 'CALL' | 'SMS' | 'EMAIL' | 'IN_PERSON' | 'LETTER'; outcome: string; note?: string; evidenceMediaId?: string; evidenceIds?: string[] }) {
    ctx.require('delinquency.manage');
    const c = await this.contracts.findForCtx(ctx, contractPublicId, 'delinquency.manage', true);
    const allPubIds = [...new Set([...(d.evidenceMediaId ? [d.evidenceMediaId] : []), ...(d.evidenceIds ?? [])])].filter(Boolean);
    const media = allPubIds[0] ? await this.prisma.mediaFile.findUnique({ where: { public_id: allPubIds[0] } }) : null;
    const n = await this.prisma.tx(async (tx) => {
      const created = await tx.collectionNote.create({ data: { contract_id: c.id, channel: d.channel, outcome: d.outcome.slice(0, 100), note: d.note, evidence_media_id: media?.id ?? null, created_by: ctx.userId } });
      if (allPubIds.length) {
        await this.media.attach(tx, ctx, allPubIds, 'collection_note', created.id, c.facility_id);
      }
      const uid = c.customer.user_id;
      if (uid && (d.channel === 'EMAIL' || d.channel === 'LETTER' || allPubIds.length > 0)) {
        const totalDebt = await this.debt(tx, c.id);
        await this.notify.notify(
          {
            users: [uid],
            event: 'collection.notice_recorded',
            vars: {
              code: c.code,
              unitCode: c.unit.code,
              facility: c.facility.name,
              channel: d.channel,
              outcome: d.outcome,
              note: d.note ?? '',
              amount: fmt(totalDebt),
            },
            link: '/app/billing',
            related: { type: 'collection_note', id: created.id },
            email: true,
          },
          tx,
        );
      }
      return created;
    });
    await this.core.completeTasksFor(this.prisma as unknown as Tx, 'contract', c.id, ['COLLECTION_CALL'], ctx.userId, d.outcome);
    return n;
  }

  async promise(ctx: AccessContext, contractPublicId: string, d: { amount: number; date: string }) {
    ctx.require('delinquency.manage');
    if (!ctx.hasRole('FACILITY_MANAGER')) throw forbidden('Chỉ quản lý cơ sở ghi cam kết trả');
    const c = await this.contracts.findForCtx(ctx, contractPublicId, 'delinquency.manage', true);
    const date = dateOnly(d.date);
    const today = this.core.today();
    if (diffDays(date, today) > 7 || date < today) throw validation('Cam kết trả kéo dài tối đa 7 ngày');
    const recent = await this.prisma.promiseToPay.count({ where: { contract_id: c.id, created_at: { gt: addDays(this.core.now(), -60) } } });
    if (recent) throw validation('Tối đa 1 cam kết trả trong 60 ngày');
    const pr = await this.prisma.promiseToPay.create({ data: { contract_id: c.id, promised_amount: vnd(d.amount), promised_date: date, created_by: ctx.userId } });
    await this.audit.log(ctx, { action: 'delinquency.promise_to_pay', entityType: 'contract', entityId: c.id, entityRef: c.code, facilityId: c.facility_id, after: d });
    return pr;
  }

  async placeOverlock(ctx: AccessContext, d: { contractId: string; lockSerial: string; photoId?: string; photoIds?: string[] }) {
    ctx.require('delinquency.manage');
    const c = await this.contracts.findForCtx(ctx, d.contractId, 'delinquency.manage', true);
    if (!['LOCKED_OUT', 'FINAL_NOTICE', 'DEFAULT_PENDING'].includes(c.delinquency_status)) throw new AppError('INVALID_STATUS_TRANSITION', 'Hợp đồng chưa đến mốc khóa chặn');
    const allPhotoIds = [...new Set([...(d.photoId ? [d.photoId] : []), ...(d.photoIds ?? [])])].filter(Boolean);
    if (!allPhotoIds.length) throw validation('Cần ảnh khóa chặn làm bằng chứng');
    return this.prisma.tx(async (tx) => {
      const exists = await tx.overlock.findFirst({ where: { contract_id: c.id, removed_at: null } });
      if (exists) throw new AppError('CONFLICT', 'Kho đã được gắn khóa chặn');
      const ol = await tx.overlock.create({ data: { contract_id: c.id, unit_id: c.unit_id, lock_serial: d.lockSerial.slice(0, 64), placed_by: ctx.userId, placed_at: this.core.now() } });
      const ids = await this.media.attach(tx, ctx, allPhotoIds, 'overlock', ol.id, c.facility_id, true);
      await tx.overlock.update({ where: { id: ol.id }, data: { placed_photo_id: ids[0] } });
      await this.core.transitionUnit(tx, c.unit_id, 'OVERLOCKED', { reason: `Khóa chặn ${d.lockSerial}`, actor: ctx.userId, related: { type: 'contract', id: c.id } });
      const p = await this.core.policyById(c.policy_version_id, tx);
      const ft = await tx.feeType.findUnique({ where: { code: 'OVERLOCK_FEE' } });
      if (p.overlock_fee > 0) await this.core.createInvoice(tx, { customerId: c.customer_id, facilityId: c.facility_id, contractId: c.id, type: 'AD_HOC', dueDate: this.core.today(), vatRate: p.vat_rate, pricesIncludeVat: p.prices_include_vat, items: [{ item_type: 'FEE', fee_type_id: ft?.id, description: 'Phí mở khóa chặn', amount: p.overlock_fee, source_type: 'overlock', source_id: ol.id }], actor: ctx.userId });
      const uid = c.customer.user_id;
      if (uid) {
        const totalDebt = await this.debt(tx, c.id);
        await this.notify.notify(
          {
            users: [uid],
            event: 'overlock.placed',
            vars: {
              unitCode: c.unit.code,
              code: c.code,
              lockSerial: ol.lock_serial ?? d.lockSerial.slice(0, 64),
              facility: c.facility.name,
              amount: fmt(totalDebt),
              fee: fmt(p.overlock_fee),
            },
            link: '/app/billing',
            priority: 'HIGH',
            related: { type: 'overlock', id: ol.id },
            email: true,
          },
          tx,
        );
      }
      await this.core.completeTasksFor(tx, 'contract', c.id, ['OVERLOCK'], ctx.userId, d.lockSerial);
      await this.audit.log(ctx, { action: 'overlock.place', entityType: 'contract', entityId: c.id, entityRef: c.code, facilityId: c.facility_id, after: { serial: d.lockSerial } }, tx);
      return ol;
    });
  }

  async removeOverlock(ctx: AccessContext, overlockId: string, photoId?: string, photoIds?: string[]) {
    ctx.require('delinquency.manage');
    const ol = await this.prisma.overlock.findUnique({ where: { id: BigInt(overlockId) } });
    if (!ol) throw notFound('Khóa chặn');
    const c = await this.prisma.contract.findUniqueOrThrow({ where: { id: ol.contract_id }, include: { customer: true, unit: true, facility: true } });
    ctx.assertScope('delinquency.manage', c, 'Hợp đồng', true);
    if (ol.removed_at) throw new AppError('CONFLICT', 'Khóa chặn đã được tháo');
    if (c.delinquency_status !== 'CURRENT' && c.status !== 'TERMINATED') throw new AppError('CONFLICT', 'Khách chưa thanh toán đủ — không thể tháo khóa chặn');
    const allPhotoIds = [...new Set([...(photoId ? [photoId] : []), ...(photoIds ?? [])])].filter(Boolean);
    return this.prisma.tx(async (tx) => {
      let pid: bigint | null = null;
      if (allPhotoIds.length) pid = (await this.media.attach(tx, ctx, allPhotoIds, 'overlock', ol.id, c.facility_id, true))[0];
      await tx.overlock.update({ where: { id: ol.id }, data: { removed_at: this.core.now(), removed_by: ctx.userId, removed_photo_id: pid } });
      const unit = await tx.unit.findUniqueOrThrow({ where: { id: ol.unit_id } });
      if (unit.status === 'OVERLOCKED' && c.status !== 'TERMINATED') await this.core.transitionUnit(tx, ol.unit_id, 'OCCUPIED', { reason: 'Tháo khóa chặn', actor: ctx.userId, related: { type: 'contract', id: c.id } });
      const uid = c.customer.user_id;
      if (uid) {
        await this.notify.notify(
          {
            users: [uid],
            event: 'overlock.removed',
            vars: {
              unitCode: c.unit.code,
              code: c.code,
              facility: c.facility.name,
              lockSerial: ol.lock_serial ?? '',
            },
            link: '/app/contracts/' + c.public_id,
            related: { type: 'overlock', id: ol.id },
            email: true,
          },
          tx,
        );
      }
      await this.core.completeTasksFor(tx, 'contract', c.id, ['REMOVE_OVERLOCK'], ctx.userId);
      await this.audit.log(ctx, { action: 'overlock.remove', entityType: 'contract', entityId: c.id, entityRef: c.code, facilityId: c.facility_id }, tx);
      return tx.overlock.findUniqueOrThrow({ where: { id: ol.id } });
    });
  }

  /** Facility manager starts the recovery (termination) process at any time for a delinquent contract; BOM still decides. */
  async requestTermination(ctx: AccessContext, contractPublicId: string, note?: string) {
    ctx.require('delinquency.manage');
    if (!ctx.hasRole('FACILITY_MANAGER')) throw forbidden('Chỉ quản lý cơ sở đề xuất thu hồi kho');
    const c = await this.contracts.findForCtx(ctx, contractPublicId, 'delinquency.manage', true);
    if (!LIVE.includes(c.status as (typeof LIVE)[number]) || c.delinquency_status === 'CURRENT' || c.delinquency_status === 'DEFAULTED') throw new AppError('INVALID_STATUS_TRANSITION', 'Chỉ đề xuất thu hồi với hợp đồng đang quá hạn');
    return this.prisma.tx(async (tx) => {
      if (await tx.terminationRequest.findFirst({ where: { contract_id: c.id, bom_decision: 'PENDING' } })) throw new AppError('CONFLICT', 'Đã có yêu cầu thu hồi đang chờ xử lý');
      const oldest = await this.oldestOverdue(tx, c.id);
      const tr = await tx.terminationRequest.create({ data: { public_id: newId(), contract_id: c.id, reason: 'DEFAULT', note, fm_confirmed_by: ctx.userId, fm_confirmed_at: this.core.now(), evidence: { manual: true, requestedBy: ctx.userPublicId, stage: c.delinquency_status } } });
      if (c.delinquency_status !== 'DEFAULT_PENDING') {
        await tx.contract.update({ where: { id: c.id }, data: { delinquency_status: 'DEFAULT_PENDING' } });
        if (oldest) await tx.delinquencyEvent.create({ data: { contract_id: c.id, invoice_id: oldest.id, from_stage: c.delinquency_status, to_stage: 'DEFAULT_PENDING', days_overdue: diffDays(this.core.today(), oldest.due_date), actions: { manualTerminationRequest: ctx.userPublicId } } });
      }
      await this.notify.notify({ users: await this.core.businessOpsManagers(tx), event: 'default.approval_required', vars: { code: c.code, days: oldest ? diffDays(this.core.today(), oldest.due_date) : '' }, link: '/ops/approvals', related: { type: 'contract', id: c.id }, email: false }, tx);
      await this.audit.log(ctx, { action: 'termination.fm_request', entityType: 'contract', entityId: c.id, entityRef: c.code, facilityId: c.facility_id, reason: note }, tx);
      return tr;
    });
  }

  async confirmTermination(ctx: AccessContext, publicId: string, note?: string) {
    ctx.require('delinquency.manage');
    if (!ctx.hasRole('FACILITY_MANAGER')) throw forbidden('Chỉ quản lý cơ sở xác nhận chấm dứt');
    const tr = await this.prisma.terminationRequest.findUnique({ where: { public_id: publicId } });
    if (!tr) throw notFound('Yêu cầu chấm dứt');
    const c = await this.prisma.contract.findUniqueOrThrow({ where: { id: tr.contract_id } });
    ctx.assertScope('delinquency.manage', c, 'Yêu cầu chấm dứt', true);
    if (tr.fm_confirmed_at) throw new AppError('CONFLICT', 'Đã xác nhận');
    const u = await this.prisma.terminationRequest.update({ where: { id: tr.id }, data: { fm_confirmed_by: ctx.userId, fm_confirmed_at: this.core.now(), note } });
    await this.notify.notify({ users: await this.core.businessOpsManagers(this.prisma), event: 'default.approval_required', vars: { code: c.code, days: '' }, link: '/ops/approvals', related: { type: 'contract', id: c.id }, email: false });
    await this.audit.log(ctx, { action: 'termination.fm_confirm', entityType: 'contract', entityId: c.id, entityRef: c.code, facilityId: c.facility_id, reason: note });
    return u;
  }

  /** BOM decision (§6.6): APPROVED → TERMINATED, deposit applied to debt, access revoked, DEFAULTED. */
  async decideTermination(ctx: AccessContext, publicId: string, approve: boolean, note?: string) {
    if (!ctx.hasRole('BUSINESS_OPS_MANAGER')) throw forbidden('Chỉ Business Operations Manager phê duyệt chấm dứt');
    const tr = await this.prisma.terminationRequest.findUnique({ where: { public_id: publicId } });
    if (!tr) throw notFound('Yêu cầu chấm dứt');
    if (!tr.fm_confirmed_at) throw new AppError('CONFLICT', 'Quản lý cơ sở chưa xác nhận');
    if (tr.bom_decision !== 'PENDING') throw new AppError('CONFLICT', 'Đã có quyết định');
    return this.prisma.tx(async (tx) => {
      await tx.terminationRequest.update({ where: { id: tr.id }, data: { bom_decision: approve ? 'APPROVED' : 'REJECTED', bom_decided_by: ctx.userId, bom_decided_at: this.core.now(), note: note ?? tr.note } });
      const c = await tx.contract.findUniqueOrThrow({ where: { id: tr.contract_id }, include: { unit: true, customer: true } });
      if (approve) {
        await this.core.setContractStatus(tx, c.id, 'TERMINATED', ctx.userId, 'Chấm dứt do vi phạm thanh toán', { termination_reason: 'DEFAULT', ended_at: this.core.now(), delinquency_status: 'DEFAULTED' });
        await tx.delinquencyEvent.create({ data: { contract_id: c.id, invoice_id: (await this.oldestOverdue(tx, c.id))?.id ?? (await tx.invoice.findFirstOrThrow({ where: { contract_id: c.id } })).id, from_stage: c.delinquency_status, to_stage: 'DEFAULTED', days_overdue: 0, actions: { approvedBy: ctx.userPublicId } } });
        await this.access.revokeAll(tx, c.id, ctx.userId, 'Chấm dứt do vi phạm');
        await tx.billingSchedule.updateMany({ where: { contract_id: c.id }, data: { status: 'ENDED' } });
        const dep = await tx.deposit.findFirst({ where: { contract_id: c.id } });
        const open = await tx.invoice.findMany({ where: { contract_id: c.id, status: { in: ['ISSUED', 'PARTIALLY_PAID'] } }, orderBy: { due_date: 'asc' } });
        const outstanding = open.reduce((s, i) => s.add(D(i.total).sub(i.amount_paid).sub(i.amount_credited)), D(0));
        if (dep && D(dep.held_amount).gt(0) && outstanding.gt(0)) {
          const apply = D(dep.held_amount).lt(outstanding) ? D(dep.held_amount) : outstanding;
          await this.payments.applyDeposit(tx, c.customer_id, c.facility_id, open.map((i) => i.id), apply, ctx.userId);
          await tx.deposit.update({ where: { id: dep.id }, data: { applied_amount: { increment: apply }, held_amount: { decrement: apply }, status: 'APPLIED' } });
        }
        await this.syncBookingBlock(tx, c.customer_id);
        await this.contracts.generateDocument(tx, c.id, 'TERMINATION_NOTICE', [{ heading: 'Chấm dứt hợp đồng', paragraphs: [`Hợp đồng ${c.code} chấm dứt do vi phạm nghĩa vụ thanh toán, được phê duyệt bởi ${ctx.fullName}.`, `Tài sản trong kho ${c.unit.code} sẽ được kiểm kê có hai nhân viên làm chứng, lưu giữ theo quy định trước khi xử lý.`] }], `THÔNG BÁO CHẤM DỨT HỢP ĐỒNG ${c.code}`);
        if (c.customer.user_id) await this.notify.notify({ users: [c.customer.user_id], event: 'contract.terminated', vars: { code: c.code, unitCode: c.unit.code, reason: 'vi phạm nghĩa vụ thanh toán' }, link: '/app/units', related: { type: 'contract', id: c.id }, email: true }, tx);
      }
      const fms = await this.core.facilityManagers(tx, c.facility_id);
      await this.notify.notify({ users: fms, event: 'termination.decided', vars: { code: c.code, decision: approve ? 'phê duyệt' : 'từ chối', note: note ?? '' }, link: '/manage/delinquency', related: { type: 'contract', id: c.id }, email: false }, tx);
      await this.audit.log(ctx, { action: approve ? 'contract.terminate_default' : 'termination.reject', entityType: 'contract', entityId: c.id, entityRef: c.code, facilityId: c.facility_id, reason: note }, tx);
      return tx.terminationRequest.findUniqueOrThrow({ where: { id: tr.id } });
    });
  }

  async createAbandonedGoods(ctx: AccessContext, d: { contractId: string; inventory: { item: string; qty: number; note?: string }[]; witness1: string; witness2: string; location?: string; photoIds?: string[] }) {
    ctx.require('delinquency.manage');
    if (!ctx.hasRole('FACILITY_MANAGER')) throw forbidden('Chỉ quản lý cơ sở lập hồ sơ tài sản tồn đọng');
    const c = await this.contracts.findForCtx(ctx, d.contractId, 'delinquency.manage', true);
    if (c.status !== 'TERMINATED') throw new AppError('INVALID_STATUS_TRANSITION', 'Hợp đồng chưa chấm dứt');
    const resolveWitness = async (q: string) =>
      (await this.prisma.user.findUnique({ where: { public_id: q } })) ??
      (await this.prisma.user.findUnique({ where: { email: q } })) ??
      (await this.prisma.user.findFirst({ where: { full_name: { contains: q } } }));
    const [w1, w2] = await Promise.all([resolveWitness(d.witness1), resolveWitness(d.witness2)]);
    if (!w1 || !w2 || w1.id === w2.id) throw validation('Cần hai nhân viên khác nhau làm chứng');
    const p = await this.core.policyById(c.policy_version_id);
    return this.prisma.tx(async (tx) => {
      const rec = await tx.abandonedGoodsRecord.create({ data: { public_id: newId(), contract_id: c.id, unit_id: c.unit_id, inventory_list: d.inventory, witness_1_user_id: w1.id, witness_2_user_id: w2.id, stored_location: d.location, hold_until: addDays(this.core.today(), p.abandoned_goods_hold_days) } });
      if (d.photoIds?.length) await this.media.attach(tx, ctx, d.photoIds, 'abandoned_goods', rec.id, c.facility_id, true);
      const unit = await tx.unit.findUniqueOrThrow({ where: { id: c.unit_id } });
      if (['OCCUPIED', 'OVERLOCKED'].includes(unit.status)) await this.core.transitionUnit(tx, c.unit_id, 'PENDING_INSPECTION', { reason: 'Đã dọn kho sau chấm dứt', actor: ctx.userId, related: { type: 'contract', id: c.id } });
      await tx.overlock.updateMany({ where: { contract_id: c.id, removed_at: null }, data: { removed_at: this.core.now(), removed_by: ctx.userId } });
      await tx.depositSettlement.upsert({ where: { contract_id: c.id }, update: {}, create: { public_id: newId(), contract_id: c.id, deposit_amount: 0, net_amount: 0, status: 'FINALIZED', dispute_deadline: this.core.now(), finalized_at: this.core.now(), finalized_by: ctx.userId } });
      const invVars = {
        code: c.code,
        unitCode: c.unit.code,
        facility: c.facility.name,
        witness1: w1.full_name || d.witness1,
        witness2: w2.full_name || d.witness2,
        location: d.location ?? '',
        itemCount: d.inventory.length,
        holdUntil: fmtD(rec.hold_until),
      };
      if (c.customer.user_id) {
        await this.notify.notify(
          {
            users: [c.customer.user_id],
            event: 'abandoned_goods.inventoried',
            vars: invVars,
            link: '/app/contracts/' + c.public_id,
            priority: 'HIGH',
            related: { type: 'abandoned_goods', id: rec.id },
            email: true,
          },
          tx,
        );
      }
      const fms = await this.core.facilityManagers(tx, c.facility_id);
      if (fms.length) {
        await this.notify.notify(
          {
            users: fms,
            event: 'abandoned_goods.inventoried',
            vars: invVars,
            link: '/manage/delinquency',
            related: { type: 'abandoned_goods', id: rec.id },
            email: true,
          },
          tx,
        );
      }
      await this.audit.log(ctx, { action: 'abandoned_goods.create', entityType: 'contract', entityId: c.id, entityRef: c.code, facilityId: c.facility_id, after: { items: d.inventory.length } }, tx);
      return rec;
    });
  }

  async decideAbandonedGoods(ctx: AccessContext, publicId: string, d: { disposition: 'RETURNED_TO_TENANT' | 'DISPOSED' | 'SOLD'; proceeds?: number }) {
    if (!ctx.hasRole('BUSINESS_OPS_MANAGER')) throw forbidden('Xử lý tài sản cuối cùng cần Business Operations Manager duyệt');
    const rec = await this.prisma.abandonedGoodsRecord.findUnique({ where: { public_id: publicId } });
    if (!rec) throw notFound('Hồ sơ tài sản');
    if (rec.disposition !== 'PENDING') throw new AppError('CONFLICT', 'Đã có quyết định');
    // Demo: the retention period (hold_until) is informational only; BOM may decide at any time.
    const u = await this.prisma.abandonedGoodsRecord.update({ where: { id: rec.id }, data: { disposition: d.disposition, disposition_approved_by: ctx.userId, disposition_at: this.core.now(), proceeds_amount: d.proceeds ? vnd(d.proceeds) : null } });
    const c = await this.prisma.contract.findUniqueOrThrow({ where: { id: rec.contract_id }, include: { customer: true, unit: true, facility: true } });
    const dispositionMap: Record<'RETURNED_TO_TENANT' | 'DISPOSED' | 'SOLD', string> = {
      RETURNED_TO_TENANT: 'Hoàn trả lại tài sản cho khách thuê',
      DISPOSED: 'Tiêu hủy / Xử lý tài sản tồn đọng theo quy định',
      SOLD: 'Thanh lý tài sản để đối trừ công nợ',
    };
    const dispositionLabel = dispositionMap[d.disposition] ?? d.disposition;
    const proceedsStr = d.proceeds ? fmt(vnd(d.proceeds)) : fmt(0);
    if (c.customer.user_id) {
      await this.notify.notify({
        users: [c.customer.user_id],
        event: 'abandoned_goods.disposed',
        vars: {
          code: c.code,
          unitCode: c.unit.code,
          facility: c.facility.name,
          disposition: d.disposition,
          dispositionLabel,
          proceeds: proceedsStr,
        },
        link: '/app/contracts/' + c.public_id,
        priority: 'HIGH',
        related: { type: 'abandoned_goods', id: rec.id },
        email: true,
      });
    }
    await this.audit.log(ctx, { action: 'abandoned_goods.decide', entityType: 'abandoned_goods_record', entityId: rec.id, entityRef: rec.public_id, after: d });
    return u;
  }
}
