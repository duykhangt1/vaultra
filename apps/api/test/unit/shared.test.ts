import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import {
  recommendSize,
  canTransition,
  RESERVATION_TRANSITIONS,
  CONTRACT_TRANSITIONS,
  INVOICE_TRANSITIONS,
  REFUND_TRANSITIONS,
  UNIT_TRANSITIONS,
  TASK_TRANSITIONS,
  WORK_ORDER_TRANSITIONS,
  TICKET_TRANSITIONS,
  SIZE_CATEGORY_CAPACITY,
  DEFAULT_POLICY_PARAMS,
  policyParamsSchema,
  mergeGrants,
  ROLE_PERMISSIONS,
} from '@vaultra/shared';
import { D, vnd, setFieldKey, encryptField, decryptField, maskPhone, maskEmail, maskIp } from '../../src/common/util';
import { DelinquencyService } from '../../src/lifecycle/delinquency.service';
import { SupportService } from '../../src/support/support.service';

// ------------------------------------------------------------------ 1. Size Recommender (Spec §6.1, §18.2)
test('recommendSize: empty list -> smallest category, zero volume', () => {
  const r = recommendSize([]);
  assert.equal(r.volume, 0);
  assert.equal(r.category, SIZE_CATEGORY_CAPACITY[0].category);
});

test('recommendSize: applies 25% allowance and ignores unknown codes', () => {
  const r = recommendSize([{ code: 'box_large', qty: 10 }, { code: 'nope', qty: 5 }]);
  assert.equal(r.volume, 1.25);
});

test('recommendSize: negative qty is clamped to zero', () => {
  assert.equal(recommendSize([{ code: 'tv', qty: -3 }]).volume, 0);
});

test('recommendSize: bigger inventory never yields smaller category', () => {
  const order = SIZE_CATEGORY_CAPACITY.map((c) => c.category);
  const small = recommendSize([{ code: 'box_small', qty: 5 }]);
  const big = recommendSize([{ code: 'bed_double', qty: 2 }, { code: 'sofa_3', qty: 2 }, { code: 'wardrobe', qty: 3 }, { code: 'fridge', qty: 1 }]);
  assert.ok(order.indexOf(big.category) >= order.indexOf(small.category));
});

// ------------------------------------------------------------------ 2. All 8 State Machines (Spec §10.2, §18.2)
test('reservation state machine valid & invalid transitions', () => {
  assert.ok(canTransition(RESERVATION_TRANSITIONS, 'PENDING_PAYMENT', 'CONFIRMED'));
  assert.ok(canTransition(RESERVATION_TRANSITIONS, 'MOVE_IN_SCHEDULED', 'CHECKED_IN'));
  assert.ok(!canTransition(RESERVATION_TRANSITIONS, 'CANCELLED', 'CONFIRMED'));
  assert.ok(!canTransition(RESERVATION_TRANSITIONS, 'CHECKED_IN', 'CANCELLED'));
});

test('contract state machine rejects unknown and terminal transitions', () => {
  assert.ok(canTransition(CONTRACT_TRANSITIONS, 'PENDING_SIGNATURE', 'SIGNED'));
  assert.ok(canTransition(CONTRACT_TRANSITIONS, 'SIGNED', 'ACTIVE'));
  assert.ok(canTransition(CONTRACT_TRANSITIONS, 'ACTIVE', 'MOVE_OUT_SCHEDULED'));
  assert.ok(canTransition(CONTRACT_TRANSITIONS, 'MOVE_OUT_SCHEDULED', 'ENDED'));
  assert.ok(!canTransition(CONTRACT_TRANSITIONS, 'ENDED', 'ACTIVE'));
  assert.ok(!canTransition(CONTRACT_TRANSITIONS, 'TERMINATED', 'ACTIVE'));
  assert.ok(!canTransition(CONTRACT_TRANSITIONS, 'BOGUS', 'ACTIVE'));
});

test('all 8 state machines are well-formed (every target state exists as a key)', () => {
  const machines = [
    RESERVATION_TRANSITIONS,
    CONTRACT_TRANSITIONS,
    INVOICE_TRANSITIONS,
    REFUND_TRANSITIONS,
    UNIT_TRANSITIONS,
    TASK_TRANSITIONS,
    WORK_ORDER_TRANSITIONS,
    TICKET_TRANSITIONS,
  ];
  for (const m of machines) {
    const keys = Object.keys(m);
    for (const k of keys) {
      for (const t of m[k]) {
        assert.ok(keys.includes(t), `Target state ${t} from ${k} has no entry in transition map`);
      }
    }
  }
});

test('work order, task, ticket, refund, and unit transitions enforce business rules', () => {
  assert.ok(canTransition(WORK_ORDER_TRANSITIONS, 'REPORTED', 'APPROVED'));
  assert.ok(canTransition(WORK_ORDER_TRANSITIONS, 'APPROVED', 'SCHEDULED'));
  assert.ok(canTransition(WORK_ORDER_TRANSITIONS, 'IN_PROGRESS', 'COMPLETED'));
  assert.ok(canTransition(WORK_ORDER_TRANSITIONS, 'COMPLETED', 'VERIFIED'));
  assert.ok(!canTransition(WORK_ORDER_TRANSITIONS, 'REPORTED', 'VERIFIED'));

  assert.ok(canTransition(TASK_TRANSITIONS, 'OPEN', 'ASSIGNED'));
  assert.ok(canTransition(TASK_TRANSITIONS, 'IN_PROGRESS', 'DONE'));
  assert.ok(!canTransition(TASK_TRANSITIONS, 'DONE', 'IN_PROGRESS'));

  assert.ok(canTransition(TICKET_TRANSITIONS, 'NEW', 'ASSIGNED'));
  assert.ok(canTransition(TICKET_TRANSITIONS, 'RESOLVED', 'CLOSED'));
  assert.ok(canTransition(TICKET_TRANSITIONS, 'RESOLVED', 'REOPENED'));

  assert.ok(canTransition(REFUND_TRANSITIONS, 'PENDING_APPROVAL', 'APPROVED'));
  assert.ok(canTransition(REFUND_TRANSITIONS, 'PROCESSING', 'SUCCEEDED'));
  assert.ok(!canTransition(REFUND_TRANSITIONS, 'REJECTED', 'SUCCEEDED'));

  assert.ok(canTransition(UNIT_TRANSITIONS, 'AVAILABLE', 'RESERVED'));
  assert.ok(canTransition(UNIT_TRANSITIONS, 'OCCUPIED', 'OVERLOCKED'));
  assert.ok(canTransition(UNIT_TRANSITIONS, 'OVERLOCKED', 'OCCUPIED'));
  assert.ok(!canTransition(UNIT_TRANSITIONS, 'RETIRED', 'AVAILABLE'));
});

// ------------------------------------------------------------------ 3. Policy Validation Rules (Spec §7.2, §18.2)
test('policyParamsSchema: accepts DEFAULT_POLICY_PARAMS and rejects invalid delinquency day ordering or non-decreasing cancellation tiers', () => {
  const ok = policyParamsSchema.safeParse(DEFAULT_POLICY_PARAMS);
  assert.ok(ok.success);

  const badDays = policyParamsSchema.safeParse({
    ...DEFAULT_POLICY_PARAMS,
    grace_days: 15,
    lockout_day: 10,
  });
  assert.ok(!badDays.success, 'Should reject grace_days >= lockout_day');

  const badTiers = policyParamsSchema.safeParse({
    ...DEFAULT_POLICY_PARAMS,
    cancellation_tiers: [
      { minHoursBefore: 24, depositRefundPct: 50, rentRefundPct: 100 },
      { minHoursBefore: 48, depositRefundPct: 100, rentRefundPct: 100 },
    ],
  });
  assert.ok(!badTiers.success, 'Should reject non-decreasing cancellation_tiers minHoursBefore');
});

// ------------------------------------------------------------------ 4. Pricing, Promotions, VAT & Deposit Calculations (Spec §6.1, §7.1, §18.2)
function computeQuoteMath(opts: {
  monthlyRent: number;
  termMonths: number;
  promo?: { discount_type: 'PERCENT' | 'FIXED_AMOUNT' | 'FREE_MONTHS' | 'FIRST_MONTH_PRICE'; discount_value: number; max_discount_amount?: number | null; free_months?: number | null };
  policy?: Partial<typeof DEFAULT_POLICY_PARAMS>;
}) {
  const p = { ...DEFAULT_POLICY_PARAMS, ...opts.policy };
  const monthly = vnd(opts.monthlyRent);
  let discount = D(0);
  if (opts.promo) {
    const pr = opts.promo;
    if (pr.discount_type === 'PERCENT') {
      discount = monthly.mul(pr.discount_value).div(100);
      if (pr.max_discount_amount != null && discount.gt(pr.max_discount_amount)) discount = D(pr.max_discount_amount);
    } else if (pr.discount_type === 'FIXED_AMOUNT') {
      discount = D(pr.discount_value);
    } else if (pr.discount_type === 'FREE_MONTHS') {
      if ((pr.free_months ?? 1) >= 1) discount = monthly;
    } else if (pr.discount_type === 'FIRST_MONTH_PRICE') {
      discount = monthly.sub(pr.discount_value);
    }
    discount = vnd(discount.lt(0) ? 0 : discount.gt(monthly) ? monthly : discount);
  }
  const deposit = p.deposit_type === 'FIXED' ? vnd(p.deposit_value) : vnd(monthly.mul(p.deposit_value));
  const rentPeriod1 = monthly.sub(discount);
  const adminFee = vnd(p.admin_fee);
  const needFirstPeriod = p.reservation_payment_mode === 'DEPOSIT_AND_FIRST_PERIOD';
  const taxable = needFirstPeriod ? rentPeriod1.add(adminFee) : D(0);
  const rate = D(p.vat_rate).div(100);
  const tax = p.prices_include_vat ? vnd(taxable.sub(taxable.div(rate.add(1)))) : vnd(taxable.mul(rate));
  const subtotal = (needFirstPeriod ? rentPeriod1.add(adminFee) : D(0)).add(deposit);
  const dueNow = p.prices_include_vat ? subtotal : subtotal.add(tax);
  return { monthly: Number(monthly), discount: Number(discount), deposit: Number(deposit), tax: Number(tax), dueNow: Number(dueNow) };
}

test('pricing & promotions: PERCENT with cap, FIXED_AMOUNT, FREE_MONTHS, FIRST_MONTH_PRICE, VAT inclusive/exclusive, DEPOSIT_ONLY', () => {
  // 1) PERCENT with max_discount_amount cap, VAT exclusive (10%), DEPOSIT_AND_FIRST_PERIOD
  const q1 = computeQuoteMath({
    monthlyRent: 2_000_000,
    termMonths: 3,
    promo: { discount_type: 'PERCENT', discount_value: 20, max_discount_amount: 300_000 },
    policy: { vat_rate: 10, prices_include_vat: false, admin_fee: 100_000, deposit_type: 'MONTHS_OF_RENT', deposit_value: 1, reservation_payment_mode: 'DEPOSIT_AND_FIRST_PERIOD' },
  });
  assert.equal(q1.discount, 300_000); // 20% of 2M is 400k, capped at 300k
  assert.equal(q1.deposit, 2_000_000); // deposit calculated on base monthly rent before discount
  assert.equal(q1.tax, 180_000); // 10% of (1,700,000 + 100,000)
  assert.equal(q1.dueNow, 3_980_000); // 1,700,000 + 100,000 + 2,000,000 + 180,000

  // 2) FREE_MONTHS (1st month free) + VAT inclusive
  const q2 = computeQuoteMath({
    monthlyRent: 1_500_000,
    termMonths: 6,
    promo: { discount_type: 'FREE_MONTHS', discount_value: 0, free_months: 1 },
    policy: { vat_rate: 10, prices_include_vat: true, admin_fee: 110_000, deposit_type: 'MONTHS_OF_RENT', deposit_value: 1 },
  });
  assert.equal(q2.discount, 1_500_000);
  assert.equal(q2.tax, 10_000); // VAT extracted from 110,000 inclusive = 10,000
  assert.equal(q2.dueNow, 1_610_000); // deposit 1.5M + admin 110k

  // 3) FIRST_MONTH_PRICE + DEPOSIT_ONLY mode
  const q3 = computeQuoteMath({
    monthlyRent: 1_800_000,
    termMonths: 3,
    promo: { discount_type: 'FIRST_MONTH_PRICE', discount_value: 990_000 },
    policy: { reservation_payment_mode: 'DEPOSIT_ONLY', deposit_type: 'MONTHS_OF_RENT', deposit_value: 1 },
  });
  assert.equal(q3.discount, 810_000);
  assert.equal(q3.tax, 0);
  assert.equal(q3.dueNow, 1_800_000);
});

// ------------------------------------------------------------------ 5. Delinquency Stage & Late Fee Calculation (Spec §6.6 6B, §18.2)
test('delinquency targetStage and lateFee calculation (FIXED, PERCENT_OF_RENT, GREATER_OF, cap)', () => {
  const delinq = Object.create(DelinquencyService.prototype) as DelinquencyService;
  const p = { ...DEFAULT_POLICY_PARAMS, grace_days: 5, lockout_day: 10, final_notice_day: 20, default_day: 30 };

  assert.equal(delinq.targetStage(0, p), 'CURRENT');
  assert.equal(delinq.targetStage(1, p), 'GRACE');
  assert.equal(delinq.targetStage(5, p), 'GRACE');
  assert.equal(delinq.targetStage(6, p), 'LATE');
  assert.equal(delinq.targetStage(9, p), 'LATE');
  assert.equal(delinq.targetStage(10, p), 'LOCKED_OUT');
  assert.equal(delinq.targetStage(19, p), 'LOCKED_OUT');
  assert.equal(delinq.targetStage(20, p), 'FINAL_NOTICE');
  assert.equal(delinq.targetStage(29, p), 'FINAL_NOTICE');
  assert.equal(delinq.targetStage(30, p), 'DEFAULT_PENDING');
  assert.equal(delinq.targetStage(45, p), 'DEFAULT_PENDING');

  // Late fee: GREATER_OF(100_000, 5% of rent) capped at 500_000
  const pGreater = { ...p, late_fee_type: 'GREATER_OF' as const, late_fee_fixed: 100_000, late_fee_pct: 5, late_fee_cap: 500_000 };
  assert.equal(Number(delinq.lateFee(pGreater, D(1_000_000))), 100_000); // 5% = 50k < 100k fixed
  assert.equal(Number(delinq.lateFee(pGreater, D(4_000_000))), 200_000); // 5% = 200k > 100k fixed
  assert.equal(Number(delinq.lateFee(pGreater, D(20_000_000))), 500_000); // 5% = 1M -> capped at 500k
});

// ------------------------------------------------------------------ 6. Renewal Price Calculation & Notice Fallback (Spec §6.6 6A, §18.2)
function calcRenewalRent(currentRent: number, listPrice: number, rule: 'KEEP_CURRENT' | 'CURRENT_LIST_PRICE' | 'CURRENT_LIST_PRICE_CAPPED', capPct: number, noticeSentInTime: boolean) {
  if (!noticeSentInTime && listPrice > currentRent) return currentRent;
  if (rule === 'KEEP_CURRENT') return currentRent;
  if (rule === 'CURRENT_LIST_PRICE') return listPrice;
  const maxAllowed = Math.round(currentRent * (1 + capPct / 100));
  return Math.min(listPrice, maxAllowed);
}

test('renewal price calculation: CURRENT_LIST_PRICE_CAPPED, KEEP_CURRENT, and notice-period protection', () => {
  assert.equal(calcRenewalRent(2_000_000, 2_500_000, 'CURRENT_LIST_PRICE_CAPPED', 10, true), 2_200_000);
  assert.equal(calcRenewalRent(2_000_000, 2_100_000, 'CURRENT_LIST_PRICE_CAPPED', 10, true), 2_100_000);
  assert.equal(calcRenewalRent(2_000_000, 2_500_000, 'KEEP_CURRENT', 10, true), 2_000_000);
  assert.equal(calcRenewalRent(2_000_000, 2_500_000, 'CURRENT_LIST_PRICE', 10, false), 2_000_000); // notice not sent in time -> keeps current rent
});

// ------------------------------------------------------------------ 7. Move-Out Settlement Calculation (Spec §6.3 3C, §18.2)
function calcSettlement(d: { deposit: number; outstanding: number; damages: number; cleaning: number; earlyFee: number; prepaidRefund: number }) {
  const net = d.deposit - d.outstanding - d.damages - d.cleaning - d.earlyFee + d.prepaidRefund;
  return {
    net,
    refundToCustomer: net > 0 ? net : 0,
    additionalDueFromCustomer: net < 0 ? -net : 0,
  };
}

test('move-out settlement calculation: refund > 0, additional due < 0, and exact 0 balance', () => {
  const s1 = calcSettlement({ deposit: 2_000_000, outstanding: 0, damages: 300_000, cleaning: 200_000, earlyFee: 0, prepaidRefund: 0 });
  assert.equal(s1.net, 1_500_000);
  assert.equal(s1.refundToCustomer, 1_500_000);
  assert.equal(s1.additionalDueFromCustomer, 0);

  const s2 = calcSettlement({ deposit: 1_500_000, outstanding: 1_000_000, damages: 800_000, cleaning: 200_000, earlyFee: 0, prepaidRefund: 0 });
  assert.equal(s2.net, -500_000);
  assert.equal(s2.refundToCustomer, 0);
  assert.equal(s2.additionalDueFromCustomer, 500_000);

  const s3 = calcSettlement({ deposit: 1_000_000, outstanding: 1_000_000, damages: 0, cleaning: 0, earlyFee: 0, prepaidRefund: 0 });
  assert.equal(s3.net, 0);
  assert.equal(s3.refundToCustomer, 0);
  assert.equal(s3.additionalDueFromCustomer, 0);
});

// ------------------------------------------------------------------ 8. Support SLA Business Hours Calculation (Spec §6.7 7A, §18.2)
test('support SLA addBusinessMinutes: skips non-working hours and Sundays, URGENT counts 24/7', () => {
  const support = Object.create(SupportService.prototype) as SupportService;
  const officeHours: Record<string, [string, string]> = {
    mon: ['08:00', '18:00'],
    tue: ['08:00', '18:00'],
    wed: ['08:00', '18:00'],
    thu: ['08:00', '18:00'],
    fri: ['08:00', '18:00'],
    sat: ['08:00', '18:00'],
  };
  const tz = 'Asia/Ho_Chi_Minh';
  // Saturday 2026-05-02 17:00 ICT (10:00 UTC) + 120 business minutes -> 60 mins on Sat (until 18:00), skips Sunday, finishes Monday 2026-05-04 09:00 ICT (02:00 UTC)
  const start = new Date('2026-05-02T10:00:00.000Z');
  const dueBiz = support.addBusinessMinutes(start, 120, officeHours, tz, false);
  assert.equal(dueBiz.toISOString(), '2026-05-04T02:00:00.000Z');

  // Urgent (allDay = true) adds 120 minutes straight -> Saturday 19:00 ICT (12:00 UTC)
  const dueUrgent = support.addBusinessMinutes(start, 120, officeHours, tz, true);
  assert.equal(dueUrgent.toISOString(), '2026-05-02T12:00:00.000Z');
});

// ------------------------------------------------------------------ 9. RBAC Permission Merging, Crypto & PII Masking (Spec §5.3, §18.2)
test('RBAC mergeGrants: combines multi-role scopes (OWN < FACILITY < GLOBAL) and readOnly flags', () => {
  const merged = mergeGrants(['CUSTOMER', 'FACILITY_STAFF', 'FACILITY_MANAGER']);
  assert.equal(merged['contract.read']?.scope, 'FACILITY');
  assert.equal(merged['unit.manage']?.readOnly, false); // FM has readOnly=false, overriding Staff readOnly=true
  assert.equal(ROLE_PERMISSIONS.BUSINESS_OPS_MANAGER['policy.manage']?.scope, 'GLOBAL');
  assert.equal(ROLE_PERMISSIONS.SYSTEM_ADMIN['user.manage']?.scope, 'GLOBAL');
});

test('AES-256-GCM field encryption and PII masking', () => {
  setFieldKey(crypto.randomBytes(32));
  const plain = '079099001234';
  const cipher = encryptField(plain);
  assert.notEqual(Buffer.from(cipher).toString('utf8'), plain);
  assert.equal(decryptField(cipher), plain);

  assert.equal(maskPhone('0901234567'), '09******67');
  assert.equal(maskEmail('khachhang@vaultra.vn'), 'k***@vaultra.vn');
  assert.equal(maskIp('203.113.148.22'), '203.113.*.*');
});
