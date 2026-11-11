import { z } from 'zod';

/** Policy parameters (spec §6.4.1). Stored in policy_versions.params, validated before save. */
export const cancellationTierSchema = z.object({
  minHoursBefore: z.number().int().min(0),
  depositRefundPct: z.number().min(0).max(100),
  rentRefundPct: z.number().min(0).max(100),
});

/** Discount on the monthly rate for committing to a longer term (`months` = term in months, `pct` = % off the list price). */
export const termDiscountSchema = z.object({
  months: z.number().int().min(1).max(36),
  pct: z.number().min(0).max(60),
});

export const policyParamsSchema = z
  .object({
    hold_minutes: z.number().int().min(5).max(120),
    max_advance_booking_days: z.number().int().min(1).max(365),
    allowed_terms_months: z.array(z.number().int().min(1).max(36)).min(1),
    reservation_payment_mode: z.enum(['DEPOSIT_ONLY', 'DEPOSIT_AND_FIRST_PERIOD']),
    move_in_window_days: z.number().int().min(1).max(60),
    no_show_days: z.number().int().min(1).max(60),
    max_pending_reservations: z.number().int().min(1).max(20),
    allocation_lead_days: z.number().int().min(0).max(90),
    allocation_sla_hours: z.number().int().min(1).max(168),
    deposit_type: z.enum(['MONTHS_OF_RENT', 'FIXED']),
    deposit_value: z.number().min(0),
    admin_fee: z.number().min(0),
    term_discounts: z.array(termDiscountSchema),
    prepaid_discount_pct: z.number().min(0).max(30),
    cancellation_tiers: z.array(cancellationTierSchema).min(1),
    admin_fee_refundable: z.boolean(),
    renewal_window_days: z.number().int().min(1).max(120),
    renewal_fee: z.number().min(0),
    renewal_price_rule: z.enum(['CURRENT_LIST_PRICE_CAPPED', 'KEEP_CURRENT', 'CURRENT_LIST_PRICE']),
    renewal_max_increase_pct: z.number().min(0).max(100),
    auto_renew_default: z.boolean(),
    auto_renew_term_months: z.number().int().min(1).max(12),
    price_change_notice_days: z.number().int().min(0).max(120),
    on_expiry_action: z.enum(['HOLDOVER_MONTHLY', 'REQUIRE_MOVE_OUT']),
    move_out_notice_days: z.number().int().min(0).max(60),
    early_termination_refund: z.enum(['NONE', 'UNUSED_FULL_MONTHS']),
    early_termination_fee: z.number().min(0),
    dispute_days: z.number().int().min(0).max(30),
    deposit_refund_days: z.number().int().min(1).max(60),
    damage_approval_threshold: z.number().min(0),
    invoice_lead_days: z.number().int().min(0).max(30),
    grace_days: z.number().int().min(0).max(30),
    late_fee_type: z.enum(['FIXED', 'PERCENT_OF_RENT', 'GREATER_OF']),
    late_fee_fixed: z.number().min(0),
    late_fee_pct: z.number().min(0).max(100),
    late_fee_cap: z.number().min(0),
    lockout_day: z.number().int().min(1).max(90),
    overlock_fee: z.number().min(0),
    final_notice_day: z.number().int().min(1).max(180),
    default_day: z.number().int().min(1).max(365),
    abandoned_goods_hold_days: z.number().int().min(0).max(180),
    fm_refund_limit: z.number().min(0),
    fm_waiver_limit: z.number().min(0),
    vat_rate: z.number().min(0).max(30),
    prices_include_vat: z.boolean(),
    min_handover_photos: z.number().int().min(0).max(20),
    entry_notice_hours: z.number().int().min(0).max(168),
    occupancy_alert_pct: z.number().min(0).max(100),
    delinquency_alert_pct: z.number().min(0).max(100),
  })
  .superRefine((p, ctx) => {
    // grace_days < lockout_day < final_notice_day < default_day (spec 4A step 2)
    if (!(p.grace_days < p.lockout_day)) ctx.addIssue({ code: 'custom', path: ['grace_days'], message: 'grace_days phải nhỏ hơn lockout_day' });
    if (!(p.lockout_day < p.final_notice_day)) ctx.addIssue({ code: 'custom', path: ['lockout_day'], message: 'lockout_day phải nhỏ hơn final_notice_day' });
    if (!(p.final_notice_day < p.default_day)) ctx.addIssue({ code: 'custom', path: ['final_notice_day'], message: 'final_notice_day phải nhỏ hơn default_day' });
    if (p.renewal_window_days < 1) ctx.addIssue({ code: 'custom', path: ['renewal_window_days'], message: 'renewal_window_days ≥ 1' });
    const seen = new Set<number>();
    p.term_discounts.forEach((t, i) => {
      if (seen.has(t.months)) ctx.addIssue({ code: 'custom', path: ['term_discounts', i, 'months'], message: `Kỳ hạn ${t.months} tháng bị lặp` });
      seen.add(t.months);
    });
    for (let i = 1; i < p.cancellation_tiers.length; i++) {
      if (!(p.cancellation_tiers[i].minHoursBefore < p.cancellation_tiers[i - 1].minHoursBefore)) {
        ctx.addIssue({ code: 'custom', path: ['cancellation_tiers', i, 'minHoursBefore'], message: 'cancellation_tiers phải giảm dần theo minHoursBefore' });
      }
    }
  });

export type PolicyParams = z.infer<typeof policyParamsSchema>;

export const DEFAULT_POLICY_PARAMS: PolicyParams = {
  hold_minutes: 15,
  max_advance_booking_days: 60,
  allowed_terms_months: [1, 3, 6, 12],
  reservation_payment_mode: 'DEPOSIT_AND_FIRST_PERIOD',
  move_in_window_days: 7,
  no_show_days: 7,
  max_pending_reservations: 3,
  allocation_lead_days: 14,
  allocation_sla_hours: 24,
  deposit_type: 'MONTHS_OF_RENT',
  deposit_value: 1,
  admin_fee: 100000,
  term_discounts: [
    { months: 1, pct: 0 },
    { months: 3, pct: 5 },
    { months: 6, pct: 10 },
    { months: 12, pct: 15 },
  ],
  prepaid_discount_pct: 3,
  cancellation_tiers: [
    { minHoursBefore: 168, depositRefundPct: 100, rentRefundPct: 100 },
    { minHoursBefore: 48, depositRefundPct: 50, rentRefundPct: 100 },
    { minHoursBefore: 0, depositRefundPct: 0, rentRefundPct: 100 },
  ],
  admin_fee_refundable: false,
  renewal_window_days: 30,
  renewal_fee: 0,
  renewal_price_rule: 'CURRENT_LIST_PRICE_CAPPED',
  renewal_max_increase_pct: 10,
  auto_renew_default: false,
  auto_renew_term_months: 1,
  price_change_notice_days: 30,
  on_expiry_action: 'HOLDOVER_MONTHLY',
  move_out_notice_days: 7,
  early_termination_refund: 'NONE',
  early_termination_fee: 0,
  dispute_days: 3,
  deposit_refund_days: 7,
  damage_approval_threshold: 1000000,
  invoice_lead_days: 7,
  grace_days: 5,
  late_fee_type: 'GREATER_OF',
  late_fee_fixed: 50000,
  late_fee_pct: 10,
  late_fee_cap: 500000,
  lockout_day: 10,
  overlock_fee: 100000,
  final_notice_day: 30,
  default_day: 45,
  abandoned_goods_hold_days: 30,
  fm_refund_limit: 5000000,
  fm_waiver_limit: 1000000,
  vat_rate: 10,
  prices_include_vat: true,
  min_handover_photos: 4,
  entry_notice_hours: 24,
  occupancy_alert_pct: 70,
  delinquency_alert_pct: 8,
};

export const POLICY_PARAM_GROUPS: { group: string; keys: (keyof PolicyParams)[] }[] = [
  { group: 'Đặt thuê', keys: ['hold_minutes', 'max_advance_booking_days', 'allowed_terms_months', 'term_discounts', 'prepaid_discount_pct', 'reservation_payment_mode', 'move_in_window_days', 'no_show_days', 'max_pending_reservations', 'allocation_lead_days', 'allocation_sla_hours', 'admin_fee'] },
  { group: 'Cọc & hủy', keys: ['deposit_type', 'deposit_value', 'cancellation_tiers', 'admin_fee_refundable'] },
  { group: 'Gia hạn', keys: ['renewal_window_days', 'renewal_fee', 'renewal_price_rule', 'renewal_max_increase_pct', 'auto_renew_default', 'auto_renew_term_months', 'price_change_notice_days', 'on_expiry_action'] },
  { group: 'Trả kho', keys: ['move_out_notice_days', 'early_termination_refund', 'early_termination_fee', 'dispute_days', 'deposit_refund_days', 'damage_approval_threshold', 'min_handover_photos', 'entry_notice_hours'] },
  { group: 'Hóa đơn & quá hạn', keys: ['invoice_lead_days', 'grace_days', 'late_fee_type', 'late_fee_fixed', 'late_fee_pct', 'late_fee_cap', 'lockout_day', 'overlock_fee', 'final_notice_day', 'default_day', 'abandoned_goods_hold_days'] },
  { group: 'Duyệt, thuế & cảnh báo', keys: ['fm_refund_limit', 'fm_waiver_limit', 'vat_rate', 'prices_include_vat', 'occupancy_alert_pct', 'delinquency_alert_pct'] },
];

export type BillingMode = 'MONTHLY' | 'PREPAID_TERM';

/**
 * Monthly rate a customer actually pays. The list price is the 1-month, pay-monthly rate; a longer term
 * takes `term_discounts[months]` off it, and paying the whole term up front takes a further
 * `prepaid_discount_pct` (only meaningful for terms longer than one month). Single source of truth for
 * quotes, renewals, check-in repricing and the price table shown on the booking page.
 */
export function termRate(params: Pick<PolicyParams, 'term_discounts' | 'prepaid_discount_pct'>, listMonthly: number, termMonths: number, mode: BillingMode) {
  const termPct = (params.term_discounts ?? []).find((t) => t.months === termMonths)?.pct ?? 0;
  const prepaidPct = mode === 'PREPAID_TERM' && termMonths > 1 ? params.prepaid_discount_pct ?? 0 : 0;
  const monthly = Math.round((listMonthly * (100 - termPct) * (100 - prepaidPct)) / 10000);
  return { monthly, termPct, prepaidPct, listMonthly };
}
