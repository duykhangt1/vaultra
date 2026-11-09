import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService, Tx } from '../common/prisma.service';
import { AppError, forbidden, notFound, validation } from '../common/errors';
import * as crypto from 'crypto';
import { D, newId, sha256, vnd } from '../common/util';
import { addDays, addMonths, diffDays } from '../common/dates';
import { CoreService, fmt, fmtD } from '../domain/core.service';
import { PricingService } from '../domain/pricing.service';
import { ContractService } from '../contract/contract.service';
import { AccessService } from '../access/access.service';
import { PaymentService } from '../billing/payment.service';
import { NotificationService } from '../notifications/notification.service';
import { AuditService } from '../audit/audit.service';
import type { AccessContext } from '../auth/access-context';

const BAD_STAGES = ['LATE', 'LOCKED_OUT', 'FINAL_NOTICE', 'DEFAULT_PENDING', 'DEFAULTED'];

/** Renewal (spec §6.6 6A, module 21): offers T−30, reminders, price notice, auto-renew, holdover/expiry. */
@Injectable()
export class RenewalService implements OnModuleInit {
  constructor(
    private prisma: PrismaService,
    private core: CoreService,
    private pricing: PricingService,
    private contracts: ContractService,
    private access: AccessService,
    private payments: PaymentService,
    private notify: NotificationService,
    private audit: AuditService,
  ) {}

  onModuleInit() {
    this.payments.onInvoicePaid(async (tx, inv, actor) => {
      if (inv.type !== 'RENEWAL' || !inv.contract_id) return;
      const offer = await tx.renewalOffer.findFirst({ where: { contract_id: inv.contract_id, invoice_id: inv.id, status: 'OPEN' } });
      if (offer) await this.apply(tx, offer.id, actor);
    });
  }

  private async offerFor(tx: Tx | PrismaService, contractId: bigint) {
    const existing = await tx.renewalOffer.findFirst({ where: { contract_id: contractId, status: 'OPEN' }, orderBy: { id: 'desc' } });
    if (existing) return existing;
    const c = await tx.contract.findUnique({ where: { id: contractId }, include: { unit_type: true, facility: true } });
    if (!c || !['ACTIVE', 'EXPIRED'].includes(c.status) || c.renewal_blocked) return null;
    const active = await this.core.activePolicy(c.facility_id, tx);
    const today = this.core.today(c.facility.timezone);
    const daysLeft = diffDays(c.current_end_date, today);
    const noticeOk = daysLeft >= active.params.price_change_notice_days;
    const rent = this.pricing.renewalRent(active.params.renewal_price_rule, active.params.renewal_max_increase_pct, D(c.monthly_rent), this.pricing.currentListRate(active.params, c), noticeOk);
    return tx.renewalOffer.create({
      data: {
        public_id: newId(),
        contract_id: c.id,
        offered_monthly_rent: rent,
        allowed_terms: active.params.allowed_terms_months,
        renewal_fee: vnd(active.params.renewal_fee),
        expires_on: c.current_end_date,
        status: 'OPEN',
        price_change_notice_sent_at: rent.gt(c.monthly_rent) ? this.core.now() : null,
        reminders_sent: [],
      },
    });
  }

  /** Job: open renewal windows (T−renewal_window_days) and send reminders T−30/14/7/1. */
  async openWindowsAndRemind() {
    const contracts = await this.prisma.contract.findMany({ where: { status: 'ACTIVE', is_holdover: false }, include: { unit: true, unit_type: true, facility: true } });
    let opened = 0;
    for (const c of contracts) {
      const p = await this.core.policyById(c.policy_version_id);
      const today = this.core.today(c.facility.timezone);
      const daysLeft = diffDays(c.current_end_date, today);
      if (daysLeft > p.renewal_window_days || daysLeft < 0) continue;
      await this.prisma.tx(async (tx) => {
        let offer = await tx.renewalOffer.findFirst({ where: { contract_id: c.id, expires_on: c.current_end_date } });
        if (!offer && !c.renewal_blocked) {
          const active = await this.core.activePolicy(c.facility_id, tx);
          const noticeOk = daysLeft >= active.params.price_change_notice_days;
          const rent = this.pricing.renewalRent(active.params.renewal_price_rule, active.params.renewal_max_increase_pct, D(c.monthly_rent), this.pricing.currentListRate(active.params, c), noticeOk);
          offer = await tx.renewalOffer.create({
            data: { public_id: newId(), contract_id: c.id, offered_monthly_rent: rent, allowed_terms: active.params.allowed_terms_months, renewal_fee: vnd(active.params.renewal_fee), expires_on: c.current_end_date, status: 'OPEN', price_change_notice_sent_at: rent.gt(c.monthly_rent) ? this.core.now() : null, reminders_sent: [] },
          });
          opened += 1;
          const uid = await this.core.customerUser(tx, c.customer_id);
          if (uid) {
            await this.notify.notify({ users: [uid], event: 'renewal.window_opened', vars: { unitCode: c.unit.code, code: c.code, facility: c.facility.name, endDate: fmtD(addDays(c.current_end_date, -1)), rent: fmt(rent) }, link: `/app/contracts/${c.public_id}?tab=renew`, related: { type: 'contract', id: c.id }, email: true, dedupeKey: `renewal.window:${c.id}:${c.current_end_date.toISOString().slice(0, 10)}` }, tx);
            if (rent.gt(c.monthly_rent)) await this.notify.notify({ users: [uid], event: 'contract.price_change_notice', vars: { code: c.code, unitCode: c.unit.code, facility: c.facility.name, endDate: fmtD(addDays(c.current_end_date, -1)), rent: fmt(rent), oldRent: fmt(c.monthly_rent) }, link: `/app/contracts/${c.public_id}?tab=renew`, related: { type: 'contract', id: c.id }, email: true, dedupeKey: `price_notice:${c.id}:${offer.id}` }, tx);
          }
        }
        if (!offer || offer.status !== 'OPEN') return;
        const moveOut = await tx.moveOutRequest.count({ where: { contract_id: c.id, status: { in: ['SCHEDULED', 'INSPECTED'] } } });
        if (moveOut) return;
        const mark = [1, 7, 14, 30].find((m) => daysLeft <= m);
        if (mark) {
          const uid = await this.core.customerUser(tx, c.customer_id);
          if (uid) await this.notify.notify({ users: [uid], event: 'renewal.reminder', vars: { days: daysLeft, code: c.code, unitCode: c.unit.code, facility: c.facility.name, endDate: fmtD(addDays(c.current_end_date, -1)), rent: fmt(offer.offered_monthly_rent) }, link: `/app/contracts/${c.public_id}?tab=renew`, related: { type: 'contract', id: c.id }, email: true, dedupeKey: `renewal.reminder:${c.id}:${c.current_end_date.toISOString().slice(0, 10)}:T-${mark}` }, tx);
        }
        // Auto-renew at T−7 (§6.6 6A step 5)
        // Skipped (not thrown) when the customer owes money elsewhere, so one blocked contract doesn't stop the job.
        if (c.auto_renew && daysLeft <= 7 && c.delinquency_status === 'CURRENT' && !c.renewal_blocked) {
          const b = await this.blockers(tx, c.id);
          const term = (offer.allowed_terms as number[]).includes(p.auto_renew_term_months) ? p.auto_renew_term_months : (offer.allowed_terms as number[])[0];
          if (!b.list.length && term) await this.accept(tx, null, c.id, term, true);
        }
      }).catch((e) => console.error(`[renewal] contract ${c.id}:`, (e as Error).message));
    }
    return opened;
  }

  async preview(ctx: AccessContext, contractPublicId: string) {
    const c = await this.contracts.findForCtx(ctx, contractPublicId);
    const offer = await this.offerFor(this.prisma, c.id);
    const pendingInvoice = offer?.invoice_id ? await this.prisma.invoice.findUnique({ where: { id: offer.invoice_id } }) : null;
    const blockers = await this.blockers(this.prisma, c.id);
    const opensOn = c.start_date;
    return {
      offer,
      pendingInvoice: pendingInvoice && ['ISSUED', 'PARTIALLY_PAID'].includes(pendingInvoice.status) ? pendingInvoice : null,
      blockers,
      currentRent: Number(c.monthly_rent),
      currentEnd: addDays(c.current_end_date, -1),
      opensOn,
      autoRenew: c.auto_renew,
      renewalBlocked: c.renewal_blocked,
      quotes: offer ? (offer.allowed_terms as number[]).map((t) => ({ termMonths: t, newEnd: addDays(addMonths(c.current_end_date, t), -1), dueNow: Number(this.dueNow(c.billing_mode, D(offer.offered_monthly_rent), t, D(offer.renewal_fee))) })) : [],
    };
  }

  dueNow(_mode: string, rent: ReturnType<typeof D>, term: number, fee: ReturnType<typeof D>) {
    return vnd(fee.add(rent.mul(term)));
  }

  async blockers(db: Tx | PrismaService, contractId: bigint) {
    const c = await db.contract.findUniqueOrThrow({ where: { id: contractId } });
    const out: string[] = [];
    const today = this.core.today();
    const overdue = await db.invoice.findMany({
      where: {
        contract_id: c.id,
        type: { not: 'RENEWAL' },
        status: { in: ['ISSUED', 'PARTIALLY_PAID'] },
        due_date: { lt: today },
      },
    });
    if (overdue.length) out.push('RENEWAL_BLOCKED_OUTSTANDING_BALANCE');
    if (BAD_STAGES.includes(c.delinquency_status)) out.push('DELINQUENT');
    if (c.renewal_blocked) out.push('BLOCKED_BY_MANAGER');
    if (!['ACTIVE', 'EXPIRED'].includes(c.status)) out.push(`STATUS_${c.status}`);
    const mo = await db.moveOutRequest.count({ where: { contract_id: c.id, status: { in: ['SCHEDULED', 'INSPECTED'] } } });
    if (mo) out.push('MOVE_OUT_SCHEDULED');
    return { list: out, overdueInvoices: overdue.map((i) => ({ id: i.public_id, code: i.code, balance: Number(D(i.total).sub(i.amount_paid).sub(i.amount_credited)) })) };
  }

  /** POST /contracts/:id/renew/otp {termMonths} — OTP to the tenant's email to accept the renewal addendum (§6.6 6A step 4). */
  async sendOtp(ctx: AccessContext, contractPublicId: string, termMonths: number) {
    ctx.require('renewal.request');
    const c = await this.contracts.findForCtx(ctx, contractPublicId, 'renewal.request', true);
    if (!c.customer.user_id) throw validation('Khách chưa có tài khoản để nhận OTP — nhân viên xác nhận gia hạn tại quầy');
    const b = await this.blockers(this.prisma, c.id);
    if (b.list.includes('RENEWAL_BLOCKED_OUTSTANDING_BALANCE')) throw new AppError('RENEWAL_BLOCKED_OUTSTANDING_BALANCE', 'Vui lòng thanh toán các hóa đơn quá hạn trước khi gia hạn', { invoices: b.overdueInvoices });
    if (b.list.length) throw new AppError('CONFLICT', 'Hợp đồng chưa đủ điều kiện gia hạn', { blockers: b.list });
    const offer = await this.offerFor(this.prisma, c.id);
    if (!offer) throw new AppError('CONFLICT', 'Chưa mở cửa sổ gia hạn cho hợp đồng này');
    if (!(offer.allowed_terms as number[]).includes(termMonths)) throw validation('Thời hạn gia hạn không hợp lệ');
    const otp = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    const uid = c.customer.user_id;
    await this.prisma.authToken.updateMany({ where: { user_id: uid, purpose: 'SIGN_OTP', used_at: null }, data: { used_at: new Date() } });
    await this.prisma.authToken.create({ data: { user_id: uid, purpose: 'SIGN_OTP', token_hash: sha256(`renew:${c.id}:${otp}:${crypto.randomUUID()}`), payload: { kind: 'RENEWAL', contractId: c.id.toString(), termMonths, otpHash: sha256(`renew:${c.id}:${termMonths}:${otp}`), attempts: 0 }, expires_at: new Date(Date.now() + 10 * 60000) } });
    await this.notify.sendDirect(
      uid,
      'renewal.otp',
      { code: c.code, unitCode: c.unit.code, facility: c.facility.name, term: termMonths, otp, name: c.customer.full_name, rent: fmt(offer.offered_monthly_rent) },
      undefined,
      undefined,
      { type: 'contract', id: c.id },
    );
    return { message: 'Đã gửi mã OTP tới email khách hàng', email: c.customer.email };
  }

  private async verifyOtp(contractId: bigint, userId: bigint, termMonths: number, otp: string | undefined) {
    if (!otp) return null;
    const tok = await this.prisma.authToken.findFirst({ where: { user_id: userId, purpose: 'SIGN_OTP', used_at: null, expires_at: { gt: new Date() } }, orderBy: { id: 'desc' } });
    const p = tok?.payload as { kind?: string; contractId: string; termMonths: number; otpHash: string; attempts: number } | undefined;
    if (!tok || !p || p.kind !== 'RENEWAL' || p.contractId !== contractId.toString() || p.termMonths !== termMonths) throw validation('OTP đã hết hạn hoặc không khớp thời hạn đã chọn, vui lòng gửi lại', [{ field: 'otp', message: 'expired' }]);
    if (p.attempts >= 5) throw validation('Nhập sai OTP quá nhiều lần, vui lòng gửi lại mã');
    if (sha256(`renew:${contractId}:${termMonths}:${otp}`) !== p.otpHash) {
      await this.prisma.authToken.update({ where: { id: tok.id }, data: { payload: { ...p, attempts: p.attempts + 1 } } });
      throw validation('Mã OTP không đúng', [{ field: 'otp', message: 'invalid' }]);
    }
    return tok.id;
  }

  /** POST /contracts/:id/renew {termMonths, otp?} (idempotent at controller). */
  async renew(ctx: AccessContext, contractPublicId: string, termMonths: number, otp?: string) {
    ctx.require('renewal.request');
    const c = await this.contracts.findForCtx(ctx, contractPublicId, 'renewal.request', true);
    const tokenId = c.customer.user_id && otp ? await this.verifyOtp(c.id, c.customer.user_id, termMonths, otp) : null;
    return this.prisma.tx(async (tx) => {
      if (tokenId) await tx.authToken.update({ where: { id: tokenId }, data: { used_at: new Date() } });
      const out = await this.accept(tx, ctx, c.id, termMonths, false);
      await this.audit.log(ctx, { action: 'renewal.accept', entityType: 'contract', entityId: c.id, entityRef: c.code, facilityId: c.facility_id, after: { termMonths, otpVerified: !!tokenId } }, tx);
      return out;
    });
  }

  async accept(tx: Tx, ctx: AccessContext | null, contractId: bigint, termMonths: number, auto: boolean) {
    await tx.$queryRaw`SELECT id FROM contracts WHERE id = ${contractId} FOR UPDATE`; // two simultaneous accepts must not both create a renewal invoice
    const c = await tx.contract.findUniqueOrThrow({ where: { id: contractId }, include: { unit: true, facility: true } });
    const b = await this.blockers(tx, c.id);
    if (b.list.includes('RENEWAL_BLOCKED_OUTSTANDING_BALANCE')) throw new AppError('RENEWAL_BLOCKED_OUTSTANDING_BALANCE', 'Vui lòng thanh toán các hóa đơn quá hạn trước khi gia hạn', { invoices: b.overdueInvoices });
    if (b.list.length) throw new AppError('CONFLICT', 'Hợp đồng chưa đủ điều kiện gia hạn', { blockers: b.list });
    const offer = await this.offerFor(tx, c.id);
    if (!offer) throw new AppError('CONFLICT', 'Chưa mở cửa sổ gia hạn cho hợp đồng này');
    if (!(offer.allowed_terms as number[]).includes(termMonths)) throw validation('Thời hạn gia hạn không hợp lệ');
    if (offer.invoice_id) {
      const pending = await tx.invoice.findUnique({ where: { id: offer.invoice_id } });
      if (pending && ['ISSUED', 'PARTIALLY_PAID'].includes(pending.status)) {
        if (offer.accepted_term_months === termMonths) return { offer, invoice: pending, applied: false };
        await tx.invoice.update({ where: { id: pending.id }, data: { status: 'VOID', voided_at: this.core.now(), void_reason: 'Đổi thời hạn gia hạn' } });
        await this.core.ledger(tx, { customerId: pending.customer_id, contractId: c.id, type: 'ADJUSTMENT', amount: D(pending.total).neg(), sourceType: 'invoice_void', sourceId: pending.id, actor: ctx?.userId ?? null });
      }
    }
    const p = await this.core.activePolicy(c.facility_id, tx);
    const rent = D(offer.offered_monthly_rent);
    const due = this.dueNow(c.billing_mode, rent, termMonths, D(offer.renewal_fee));
    await tx.renewalOffer.update({ where: { id: offer.id }, data: { accepted_term_months: termMonths, accepted_by: ctx?.userId ?? null, auto } });
    if (due.lte(0)) {
      await this.apply(tx, offer.id, ctx?.userId ?? null);
      return { offer, invoice: null, applied: true };
    }
    const periodStart = c.current_end_date;
    const periodEnd = addDays(addMonths(c.current_end_date, termMonths), -1);
    const today = this.core.today();
    const targetDue = addDays(c.current_end_date, -1);
    const dueDate = targetDue > today ? targetDue : addDays(today, 3);
    const items = [] as Parameters<CoreService['createInvoice']>[1]['items'];
    if (D(offer.renewal_fee).gt(0)) {
      const ft = await tx.feeType.findUnique({ where: { code: 'RENEWAL_FEE' } });
      items.push({ item_type: 'FEE', fee_type_id: ft?.id, description: 'Phí gia hạn', amount: offer.renewal_fee });
    }
    items.push({
      item_type: 'RENT',
      description: `Tiền thuê gia hạn ${termMonths} tháng (${c.code})`,
      amount: rent.mul(termMonths),
      quantity: termMonths,
      unit_price: rent,
      service_period_start: periodStart,
      service_period_end: periodEnd,
    });
    const inv = await this.core.createInvoice(tx, {
      customerId: c.customer_id,
      facilityId: c.facility_id,
      contractId: c.id,
      type: 'RENEWAL',
      dueDate,
      periodStart,
      periodEnd,
      vatRate: p.params.vat_rate,
      pricesIncludeVat: p.params.prices_include_vat,
      items,
      actor: ctx?.userId ?? null,
    });
    await tx.renewalOffer.update({ where: { id: offer.id }, data: { invoice_id: inv.id } });
    if (auto) {
      const uid = await this.core.customerUser(tx, c.customer_id);
      if (uid) {
        await this.notify.notify(
          {
            users: [uid],
            event: 'renewal.auto_renewed',
            vars: { code: c.code, unitCode: c.unit.code, facility: c.facility.name, term: termMonths, invoice: inv.code, amount: fmt(inv.total), endDate: fmtD(periodEnd) },
            link: `/app/billing/invoices/${inv.public_id}`,
            related: { type: 'contract', id: c.id },
            email: true,
          },
          tx,
        );
      }
    }
    return { offer, invoice: inv, applied: false };
  }

  /** After payment (or zero due): new contract_term, end date, credentials, schedule, addendum PDF. */
  async apply(tx: Tx, offerId: bigint, actor: bigint | null) {
    const offer = await tx.renewalOffer.findUniqueOrThrow({ where: { id: offerId } });
    if (offer.status !== 'OPEN') return;
    const c = await tx.contract.findUniqueOrThrow({ where: { id: offer.contract_id }, include: { unit: true, terms: true, customer: true, facility: true } });
    const term = offer.accepted_term_months ?? 1;
    const p = await this.core.activePolicy(c.facility_id, tx);
    const start = c.current_end_date;
    const end = addMonths(start, term);
    const today = this.core.today();
    const seq = Math.max(0, ...c.terms.map((t) => t.sequence_no)) + 1;
    await tx.contractTerm.create({ data: { contract_id: c.id, sequence_no: seq, type: 'RENEWAL', start_date: start, end_date: end, monthly_rent: offer.offered_monthly_rent, term_months: term, policy_version_id: p.id, renewal_offer_id: offer.id, status: start <= today ? 'ACTIVE' : 'SCHEDULED' } });
    await tx.contract.update({
      where: { id: c.id },
      data: {
        status: 'ACTIVE',
        is_holdover: false,
        current_end_date: end,
        effective_end_date: end,
        monthly_rent: offer.offered_monthly_rent,
        policy_version_id: p.id,
        version: { increment: 1 },
      },
    });
    await tx.contractAmendment.create({ data: { contract_id: c.id, type: 'RENEWAL', before: { end: c.current_end_date.toISOString().slice(0, 10), rent: c.monthly_rent.toString() }, after: { end: end.toISOString().slice(0, 10), rent: offer.offered_monthly_rent.toString(), term }, reason: offer.auto ? 'Tự động gia hạn' : 'Khách gia hạn & thanh toán', effective_date: start, created_by: actor } });
    await this.access.extend(tx, c.id, end);
    const sch = await tx.billingSchedule.findUnique({ where: { contract_id: c.id } });
    if (sch) {
      await tx.billingSchedule.update({
        where: { id: sch.id },
        data: {
          amount: offer.offered_monthly_rent,
          next_period_start: end,
          next_invoice_date: addDays(end, -p.params.invoice_lead_days),
          status: c.billing_mode === 'MONTHLY' ? 'ACTIVE' : 'PAUSED',
        },
      });
    }
    await tx.renewalOffer.update({ where: { id: offer.id }, data: { status: 'ACCEPTED', accepted_at: this.core.now() } });
    const now = this.core.now();
    const doc = await this.contracts.generateDocument(
      tx,
      c.id,
      'RENEWAL_ADDENDUM',
      [
        {
          heading: 'Nội dung gia hạn',
          rows: [
            ['Hợp đồng', c.code],
            ['Kho', c.unit.code],
            ['Kỳ gia hạn mới', `${fmtD(start)} – ${fmtD(addDays(end, -1))} (${term} tháng)`],
            ['Giá thuê kỳ mới', `${fmt(offer.offered_monthly_rent)} / tháng`],
            ['Tổng tiền thuê gia hạn', fmt(D(offer.offered_monthly_rent).mul(term))],
            ['Phí gia hạn', fmt(offer.renewal_fee)],
            ['Hình thức xác nhận', offer.auto ? 'Tự động gia hạn' : 'Khách xác nhận & thanh toán trực tuyến'],
          ],
        },
      ],
      `PHỤ LỤC GIA HẠN HỢP ĐỒNG ${c.code}`,
      { signedAt: now, methodLabel: 'Xác nhận & thanh toán gia hạn trực tuyến', docHash: sha256(`${c.code}:renewal:${offer.id}`) },
    );
    await tx.contractSignature.create({ data: { document_id: doc.id, signer_type: 'CUSTOMER', signer_user_id: c.customer.user_id ?? actor, method: 'OTP_EMAIL', signed_at: now, document_sha256: doc.sha256 } });
    await tx.contractSignature.create({ data: { document_id: doc.id, signer_type: 'LESSOR', method: 'SYSTEM_SEAL', signed_at: now, document_sha256: doc.sha256 } });
    const uid = await this.core.customerUser(tx, c.customer_id);
    if (uid) {
      await this.notify.notify(
        {
          users: [uid],
          event: 'renewal.completed',
          vars: { code: c.code, unitCode: c.unit.code, facility: c.facility.name, term, rent: fmt(offer.offered_monthly_rent), endDate: fmtD(addDays(end, -1)) },
          link: `/app/contracts/${c.public_id}`,
          related: { type: 'contract', id: c.id },
          email: true,
        },
        tx,
      );
    }
    await this.audit.log(null, { action: 'contract.renewed', entityType: 'contract', entityId: c.id, entityRef: c.code, facilityId: c.facility_id, after: { end, term, doc: doc.sha256 } }, tx);
  }

  /** Job: activate scheduled terms; contracts reaching the end without renewal → holdover / expired. */
  async processExpiries() {
    const today = this.core.today();
    const sched = await this.prisma.contractTerm.findMany({ where: { status: 'SCHEDULED', start_date: { lte: today } } });
    for (const t of sched) {
      await this.prisma.$transaction([
        this.prisma.contractTerm.updateMany({ where: { contract_id: t.contract_id, status: 'ACTIVE', id: { not: t.id } }, data: { status: 'COMPLETED' } }),
        this.prisma.contractTerm.update({ where: { id: t.id }, data: { status: 'ACTIVE' } }),
      ]);
    }
    const due = await this.prisma.contract.findMany({ where: { status: 'ACTIVE', is_holdover: false, current_end_date: { lte: today } }, include: { unit: true, unit_type: true, facility: true } });
    for (const c of due) {
      await this.prisma.tx(async (tx) => {
        const p = await this.core.activePolicy(c.facility_id, tx);
        // Unpaid renewal invoices of a lapsed offer are voided: the renewal never happened, so it must not
        // feed the overdue chain or be payable later (§6.6 "Thanh toán gia hạn thất bại").
        const lapsing = await tx.renewalOffer.findMany({ where: { contract_id: c.id, status: 'OPEN', invoice_id: { not: null } } });
        for (const o of lapsing) {
          const inv = await tx.invoice.findUnique({ where: { id: o.invoice_id! } });
          if (inv && inv.status === 'ISSUED' && D(inv.amount_paid).eq(0)) {
            await tx.invoice.update({ where: { id: inv.id }, data: { status: 'VOID', voided_at: this.core.now(), void_reason: 'Đề nghị gia hạn hết hạn khi chưa thanh toán' } });
            await this.core.ledger(tx, { customerId: inv.customer_id, contractId: c.id, type: 'ADJUSTMENT', amount: D(inv.total).neg(), sourceType: 'invoice_void', sourceId: inv.id, description: `Hủy ${inv.code}: gia hạn không hoàn tất`, actor: null });
          }
        }
        await tx.renewalOffer.updateMany({ where: { contract_id: c.id, status: 'OPEN' }, data: { status: 'LAPSED' } });
        const uid = await this.core.customerUser(tx, c.customer_id);
        if (p.params.on_expiry_action === 'HOLDOVER_MONTHLY') {
          const terms = await tx.contractTerm.findMany({ where: { contract_id: c.id } });
          await tx.contractTerm.updateMany({ where: { contract_id: c.id, status: 'ACTIVE' }, data: { status: 'COMPLETED' } });
          await tx.contractTerm.create({ data: { contract_id: c.id, sequence_no: Math.max(0, ...terms.map((t) => t.sequence_no)) + 1, type: 'HOLDOVER', start_date: c.current_end_date, end_date: null, monthly_rent: c.unit_type.list_price, term_months: 1, policy_version_id: p.id, status: 'ACTIVE' } });
          await tx.contract.update({ where: { id: c.id }, data: { is_holdover: true, effective_end_date: null, monthly_rent: c.unit_type.list_price, current_end_date: addMonths(c.current_end_date, 1), version: { increment: 1 } } });
          await this.access.extend(tx, c.id, null);
          const sch = await tx.billingSchedule.findUnique({ where: { contract_id: c.id } });
          if (sch) await tx.billingSchedule.update({ where: { id: sch.id }, data: { status: 'ACTIVE', amount: c.unit_type.list_price, period_months: 1 } });
          await tx.contractStatusHistory.create({ data: { contract_id: c.id, field: 'STATUS', from_status: 'ACTIVE', to_status: 'ACTIVE', reason: 'Chuyển sang thuê cuốn chiếu (holdover)' } });
          if (uid) await this.notify.notify({ users: [uid], event: 'contract.holdover_started', vars: { code: c.code, unitCode: c.unit.code, facility: c.facility.name, rent: fmt(c.unit_type.list_price) }, link: `/app/contracts/${c.public_id}?tab=renew`, related: { type: 'contract', id: c.id }, email: true }, tx);
        } else {
          await this.core.setContractStatus(tx, c.id, 'EXPIRED', null, 'Hết hạn không gia hạn');
          await this.core.createTask(tx, { facilityId: c.facility_id, type: 'COLLECTION_CALL', title: `Liên hệ khách hợp đồng hết hạn ${c.code} (${c.unit.code})`, related: { type: 'contract', id: c.id }, dueAt: addDays(this.core.now(), 2), dedupeKey: `EXPIRED:${c.id}` });
          if (uid) await this.notify.notify({ users: [uid], event: 'contract.expired', vars: { code: c.code, unitCode: c.unit.code, facility: c.facility.name, endDate: fmtD(addDays(c.current_end_date, -1)) }, link: `/app/contracts/${c.public_id}?tab=renew`, related: { type: 'contract', id: c.id }, email: true }, tx);
        }
        await this.notify.notify({ users: await this.core.facilityManagers(tx, c.facility_id), event: p.params.on_expiry_action === 'HOLDOVER_MONTHLY' ? 'contract.holdover_started' : 'contract.expired', vars: { code: c.code, unitCode: c.unit.code, facility: c.facility.name, rent: fmt(c.unit_type.list_price), endDate: fmtD(addDays(c.current_end_date, -1)) }, link: `/manage/contracts/${c.public_id}`, related: { type: 'contract', id: c.id }, email: false }, tx);
      }).catch((e) => console.error(`[renewal] expiry ${c.id}:`, (e as Error).message));
    }
    // Holdover rolls: extend the rolling end month by month so billing continues
    const holds = await this.prisma.contract.findMany({ where: { status: 'ACTIVE', is_holdover: true, current_end_date: { lte: today } } });
    for (const h of holds) await this.prisma.contract.update({ where: { id: h.id }, data: { current_end_date: addMonths(h.current_end_date, 1) } });
    return due.length;
  }

  async setAutoRenew(ctx: AccessContext, contractPublicId: string, on: boolean) {
    const c = await this.contracts.findForCtx(ctx, contractPublicId, 'renewal.request', true);
    if (ctx.grant('renewal.request')!.scope !== 'OWN') throw forbidden('Chỉ khách thuê bật/tắt tự gia hạn');
    await this.prisma.tx(async (tx) => {
      await tx.contract.update({ where: { id: c.id }, data: { auto_renew: on } });
      await tx.contractAmendment.create({ data: { contract_id: c.id, type: 'AUTO_RENEW_TOGGLE', before: { autoRenew: c.auto_renew }, after: { autoRenew: on }, effective_date: this.core.today(), created_by: ctx.userId } });
    });
    return { autoRenew: on };
  }

  async setBlock(ctx: AccessContext, contractPublicId: string, blocked: boolean, reason: string) {
    ctx.require('contract.amend');
    const c = await this.contracts.findForCtx(ctx, contractPublicId, 'contract.amend', true);
    return this.prisma.tx(async (tx) => {
      await tx.contract.update({ where: { id: c.id }, data: { renewal_blocked: blocked, renewal_blocked_reason: blocked ? reason.slice(0, 255) : null } });
      if (blocked) await tx.renewalOffer.updateMany({ where: { contract_id: c.id, status: 'OPEN' }, data: { status: 'WITHDRAWN' } });
      await tx.contractAmendment.create({ data: { contract_id: c.id, type: 'RENEWAL_BLOCK', before: { blocked: c.renewal_blocked }, after: { blocked, reason }, reason, effective_date: this.core.today(), created_by: ctx.userId } });
      await this.audit.log(ctx, { action: blocked ? 'contract.renewal_block' : 'contract.renewal_unblock', entityType: 'contract', entityId: c.id, entityRef: c.code, facilityId: c.facility_id, reason }, tx);
      return { renewalBlocked: blocked };
    });
  }

  notFound = notFound;
}
