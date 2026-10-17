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
