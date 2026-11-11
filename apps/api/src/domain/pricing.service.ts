import { Injectable } from '@nestjs/common';
import { PolicyParams, termRate } from '@vaultra/shared';
import { PrismaService, EdgeDecimal, Tx } from '../common/prisma.service';
import { AppError, validation } from '../common/errors';
import { D, Dec, DecimalValue, newId, sha256, randomToken, vnd } from '../common/util';
import { addDays, addMonths, dateOnly, diffDays, ymd } from '../common/dates';
import { CoreService, fmt } from './core.service';
import { Prisma } from '../generated/prisma/client';

type Db = Tx | PrismaService;

export interface QuoteLine {
  type: 'RENT' | 'DISCOUNT' | 'ADMIN_FEE' | 'DEPOSIT' | 'RENEWAL_FEE';
  description: string;
  amount: number;
  dueNow: boolean;
  periodStart?: string;
  periodEnd?: string;
}

/**
 * Pricing (spec module 10 + §6.1 step 2, §6.4 4B/4C): builds immutable quotes with rent, discount,
 * admin fee, deposit, VAT and "due today" according to reservation_payment_mode.
 */
@Injectable()
export class PricingService {
  constructor(private prisma: PrismaService, private core: CoreService) {}

  async validatePromotion(db: Db, code: string | undefined | null, ctx: { facilityId: bigint; unitTypeId: bigint; termMonths: number; customerId: bigint | null }, at: Date) {
    const trimmed = code ? code.trim() : '';
    if (!trimmed) return null;
    const all = await db.promotion.findMany({ where: { deleted_at: null } });
    const candidates = all.filter((p) => p.code && p.code.trim().toLowerCase() === trimmed.toLowerCase());
    const reasons: string[] = [];
    const ok = [] as typeof candidates;
    for (const p of candidates) {
      const bad = (r: string) => reasons.push(r);
      if (p.status !== 'ACTIVE') { bad('Mã giảm giá không còn hiệu lực'); continue; }
      if (p.starts_at > at || (p.ends_at && p.ends_at < at)) { bad('Mã giảm giá ngoài thời gian áp dụng'); continue; }
      const fids = Array.isArray(p.facility_ids) ? (p.facility_ids as unknown[]).map(String) : null;
      const tids = Array.isArray(p.unit_type_ids) ? (p.unit_type_ids as unknown[]).map(String) : null;
      if (fids && fids.length > 0 && !fids.includes(ctx.facilityId.toString())) { bad('Mã không áp dụng cho cơ sở này'); continue; }
      if (tids && tids.length > 0 && !tids.includes(ctx.unitTypeId.toString())) { bad('Mã không áp dụng cho loại kho này'); continue; }
      if (ctx.termMonths < p.min_term_months) { bad(`Mã yêu cầu thời hạn tối thiểu ${p.min_term_months} tháng`); continue; }
      if (p.max_redemptions !== null && p.redeemed_count >= p.max_redemptions) { bad('Mã đã hết lượt sử dụng'); continue; }
      if (ctx.customerId) {
        const used = await db.promotionRedemption.count({ where: { promotion_id: p.id, customer_id: ctx.customerId, status: { in: ['HELD', 'CONSUMED'] } } });
        if (used >= p.max_per_customer) { bad('Bạn đã dùng hết lượt của mã này'); continue; }
        if (p.new_customers_only) {
          const prior = await db.contract.count({ where: { customer_id: ctx.customerId, status: { notIn: ['CANCELLED'] } } });
          if (prior > 0) { bad('Mã chỉ dành cho khách mới'); continue; }
        }
      } else if (p.new_customers_only && code) {
        // guest: accepted provisionally, re-checked at reservation time
      }
      ok.push(p);
    }
    if (code && !ok.length) throw new AppError('PROMO_INVALID', reasons[0] ?? 'Mã giảm giá không hợp lệ');
    return ok[0] ?? null;
  }

  /** Discount for `periods` months of rent under a promotion (applies to the first N periods). */
  discountFor(p: { type: string; value: DecimalValue; applies_to_periods: number }, monthly: Dec, periodIndexFrom: number, periods: number): Dec {
    let total = D(0);
    for (let i = periodIndexFrom; i < periodIndexFrom + periods; i++) {
      if (i >= p.applies_to_periods && p.type !== 'FREE_MONTHS') break;
      switch (p.type) {
        case 'PERCENT':
          total = total.add(monthly.mul(D(p.value)).div(100));
          break;
        case 'FIXED_AMOUNT':
          total = total.add(EdgeDecimal.min(D(p.value), monthly));
          break;
        case 'FREE_MONTHS':
          if (i < Number(p.value)) total = total.add(monthly);
          break;
        case 'FIRST_MONTH_PRICE':
          if (i === 0) total = total.add(EdgeDecimal.max(D(0), monthly.sub(D(p.value))));
          break;
      }
    }
    return vnd(total);
  }

  depositFor(params: PolicyParams, monthly: Dec, override: DecimalValue | null) {
    if (override !== null && override !== undefined) return vnd(override);
    return params.deposit_type === 'FIXED' ? vnd(params.deposit_value) : vnd(monthly.mul(params.deposit_value));
  }

  async compute(db: Db, input: { unitTypeId: bigint; startDate: Date; termMonths: number; billingMode: 'MONTHLY' | 'PREPAID_TERM'; promoCode?: string | null; customerId: bigint | null; channel?: 'ONLINE' | 'COUNTER' | 'PHONE' }) {
    const ut = await db.unitType.findUnique({ where: { id: input.unitTypeId }, include: { facility: true } });
    if (!ut || ut.deleted_at || ut.status !== 'ACTIVE' || !ut.is_bookable) throw validation('Loại kho không khả dụng để đặt');
    const f = ut.facility;
    const policy = await this.core.activePolicy(f.id, db);
    const p = policy.params;
    const today = this.core.today(f.timezone);
    if (!p.allowed_terms_months.includes(input.termMonths)) throw validation(`Thời hạn phải là một trong: ${p.allowed_terms_months.join(', ')} tháng`, [{ field: 'termMonths', message: 'invalid' }]);
    const lead = diffDays(input.startDate, today);
    if (lead < 0 || lead > p.max_advance_booking_days) throw validation(`Ngày bắt đầu phải trong khoảng hôm nay đến ${p.max_advance_booking_days} ngày tới`, [{ field: 'startDate', message: 'out of range' }]);
    const listMonthly = D(input.channel === 'COUNTER' ? ut.list_price : ut.online_price);
    // the rate the customer pays: list price less the term discount and, when paying the whole term up front, the prepaid discount
    const rate = termRate(p, Number(listMonthly), input.termMonths, input.billingMode);
    const monthly = D(rate.monthly);
    const promo = await this.validatePromotion(db, input.promoCode, { facilityId: f.id, unitTypeId: ut.id, termMonths: input.termMonths, customerId: input.customerId }, this.core.now());
    const firstPeriods = input.billingMode === 'PREPAID_TERM' ? input.termMonths : 1;
    const endFirst = addMonths(input.startDate, firstPeriods);
    const rent = vnd(monthly.mul(firstPeriods));
    const discount = promo ? this.discountFor(promo, monthly, 0, firstPeriods) : D(0);
    const deposit = this.depositFor(p, listMonthly, ut.deposit_override); // the deposit follows the list price, not the discounted rate
    const adminFee = vnd(p.admin_fee);
    const payFirstNow = p.reservation_payment_mode === 'DEPOSIT_AND_FIRST_PERIOD';
    const lines: QuoteLine[] = [
      { type: 'RENT', description: `Tiền thuê ${ut.name} (${firstPeriods} tháng)${rate.termPct > 0 ? ` — giảm ${rate.termPct}% theo kỳ hạn ${input.termMonths} tháng` : ''}${rate.prepaidPct > 0 ? `, giảm thêm ${rate.prepaidPct}% khi trả trước cả kỳ` : ''}`, amount: Number(rent), dueNow: payFirstNow, periodStart: ymd(input.startDate)!, periodEnd: ymd(addDays(endFirst, -1))! },
    ];
    if (discount.gt(0)) lines.push({ type: 'DISCOUNT', description: `Khuyến mãi: ${promo!.name}`, amount: -Number(discount), dueNow: payFirstNow });
    if (adminFee.gt(0)) lines.push({ type: 'ADMIN_FEE', description: 'Phí quản trị (một lần)', amount: Number(adminFee), dueNow: payFirstNow });
    lines.push({ type: 'DEPOSIT', description: 'Tiền cọc (hoàn lại khi trả kho)', amount: Number(deposit), dueNow: true });
    const taxable = rent.sub(discount).add(adminFee);
    const tax = p.vat_rate > 0 ? (p.prices_include_vat ? vnd(taxable.mul(p.vat_rate).div(100 + p.vat_rate)) : vnd(taxable.mul(p.vat_rate).div(100))) : D(0);
    const nowSum = lines.filter((l) => l.dueNow).reduce((s, l) => s.add(l.amount), D(0));
    const dueNow = p.prices_include_vat ? nowSum : nowSum.add(payFirstNow ? tax : 0);
    const moveInDue = lines.filter((l) => !l.dueNow).reduce((s, l) => s.add(l.amount), D(0)).add(!payFirstNow && !p.prices_include_vat ? tax : 0);
    const total = rent.sub(discount).add(adminFee).add(deposit).add(p.prices_include_vat ? 0 : tax);
    const available = await this.core.available(db, ut.id, input.startDate, addMonths(input.startDate, input.termMonths));
    return {
      unitType: ut,
      facility: f,
      policyVersionId: policy.id,
      params: p,
      promo,
      monthly,
      listMonthly,
      termDiscountPct: rate.termPct,
      prepaidDiscountPct: rate.prepaidPct,
      rent,
      discount,
      adminFee,
      deposit,
      tax,
      dueNow,
      moveInDue,
      total,
      lines,
      endDate: addMonths(input.startDate, input.termMonths),
      available,
      pricesIncludeVat: p.prices_include_vat,
      vatRate: p.vat_rate,
    };
  }

  async createQuote(input: { unitTypeId: bigint; startDate: string; termMonths: number; billingMode: 'MONTHLY' | 'PREPAID_TERM'; promoCode?: string | null; customerId: bigint | null; channel?: 'ONLINE' | 'COUNTER' | 'PHONE' }) {
    const start = dateOnly(input.startDate);
    const c = await this.compute(this.prisma, { ...input, startDate: start });
    const anonToken = input.customerId ? null : randomToken(18);
    const q = await this.prisma.quote.create({
      data: {
        public_id: newId(),
        customer_id: input.customerId,
        facility_id: c.facility.id,
        unit_type_id: c.unitType.id,
        start_date: start,
        term_months: input.termMonths,
        billing_mode: input.billingMode,
        promotion_id: c.promo?.id ?? null,
        policy_version_id: c.policyVersionId,
        monthly_rent: c.monthly,
        discount_total: c.discount,
        admin_fee: c.adminFee,
        deposit_amount: c.deposit,
        tax_total: c.tax,
        due_now_total: c.dueNow,
        line_items: { lines: c.lines, moveInDue: Number(c.moveInDue), total: Number(c.total), pricesIncludeVat: c.pricesIncludeVat, vatRate: c.vatRate, channel: input.channel ?? 'ONLINE', listMonthly: Number(c.listMonthly), termDiscountPct: c.termDiscountPct, prepaidDiscountPct: c.prepaidDiscountPct } as object,
        anon_token_hash: anonToken ? sha256(anonToken) : null,
        expires_at: new Date(this.core.now().getTime() + 15 * 60000),
      },
    });
    return { quote: q, anonToken, computed: c };
  }

  present(q: Prisma.QuoteGetPayload<{ include: { unit_type: { include: { facility: true } } } }>, extra: Record<string, unknown> = {}) {
    const li = q.line_items as unknown as { lines: QuoteLine[]; moveInDue: number; total: number; pricesIncludeVat: boolean; vatRate: number; listMonthly?: number; termDiscountPct?: number; prepaidDiscountPct?: number };
    return {
      id: q.public_id,
      status: q.expires_at < this.core.now() && q.status === 'ACTIVE' ? 'EXPIRED' : q.status,
      expiresAt: q.expires_at,
      startDate: ymd(q.start_date),
      endDate: ymd(addMonths(q.start_date, q.term_months)),
      termMonths: q.term_months,
      billingMode: q.billing_mode,
      monthlyRent: Number(q.monthly_rent),
      listMonthlyRent: li.listMonthly ?? Number(q.monthly_rent),
      termDiscountPct: li.termDiscountPct ?? 0,
      prepaidDiscountPct: li.prepaidDiscountPct ?? 0,
      discountTotal: Number(q.discount_total),
      adminFee: Number(q.admin_fee),
      depositAmount: Number(q.deposit_amount),
      taxTotal: Number(q.tax_total),
      dueNowTotal: Number(q.due_now_total),
      moveInDue: li.moveInDue,
      total: li.total,
      pricesIncludeVat: li.pricesIncludeVat,
      vatRate: li.vatRate,
      lines: li.lines,
      unitType: { id: q.unit_type.public_id, name: q.unit_type.name, code: q.unit_type.code, sizeCategory: q.unit_type.size_category },
      facility: { id: q.unit_type.facility.public_id, name: q.unit_type.facility.name, slug: q.unit_type.facility.slug },
      ...extra,
    };
  }

  /** What a contract's rate would be if it were signed today (same term and billing mode), so renewals compare like with like. */
  currentListRate(params: PolicyParams, c: { unit_type: { list_price: DecimalValue }; billing_mode: string; snapshot: unknown }): Dec {
    const termMonths = Number((c.snapshot as { price?: { termMonths?: number } } | null)?.price?.termMonths ?? 1) || 1;
    return D(termRate(params, Number(c.unit_type.list_price), termMonths, c.billing_mode === 'PREPAID_TERM' ? 'PREPAID_TERM' : 'MONTHLY').monthly);
  }

  /** Renewal price (§6.4.1 renewal_price_rule; §6.6 6A step 1). */
  renewalRent(rule: PolicyParams['renewal_price_rule'], capPct: number, current: Dec, list: Dec, noticeOk: boolean) {
    if (rule === 'KEEP_CURRENT') return current;
    let next = list;
    if (rule === 'CURRENT_LIST_PRICE_CAPPED') next = Prisma.Decimal.min(list, vnd(current.mul(100 + capPct).div(100)));
    if (next.gt(current) && !noticeOk) return current; // price increase without enough notice -> keep old price
    return vnd(next);
  }

  fmt = fmt;
}
