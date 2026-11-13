/**
 * Adds 20 "overdue only" demo contracts to the live database snapshot: each one has nothing but late invoices, spread
 * over every lateness band (1 .. 90 days). It does NOT perform any step of the debt-collection screen: no contact note,
 * no promise to pay, no overlock, no termination request, no abandoned-goods record, no payments. The only things written
 * besides the late invoice are what the daily job would derive by itself from the number of days (stage, late fee,
 * stage history, suspended gate PIN, booking block).
 *
 *   npx tsx prisma/tools/seed-overdue-days.ts --dry      -> build + validate in memory, write nothing
 *   npx tsx prisma/tools/seed-overdue-days.ts --apply    -> back up, then write apps/api/storage + Cloudflare R2
 *   npx tsx prisma/tools/seed-overdue-days.ts --remove   -> take exactly these contracts out again (and free their units)
 *
 * The backend keeps the whole database in memory and re-uploads it on every change, so it MUST be stopped
 * before --apply / --remove. Every row hangs off a user whose e-mail ends with `@late.vaultra.test`.
 *
 * Single-account mode: `--email someone@x.com --days 60 [--fac 1]` adds ONE overdue contract to an EXISTING customer account
 * (nothing else of that account is touched); `--remove --email someone@x.com` takes exactly that contract out again.
 */
import '../../src/common/prisma.service'; // load order: prisma.service before r2-prisma (circular import)
import * as fs from 'fs';
import * as net from 'net';
import * as path from 'path';
import { ulid } from 'ulid';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { config } from '../../src/common/config';
import { EdgePrismaService } from '../../src/common/r2-prisma';

type Row = Record<string, any>;
type Snap = Record<string, Row[]>;

const KEY = '_db/vaultra-diff-v1.json';
const LOCAL = path.resolve(config.storage.localDir, 'r2-db-backup.json');
const DOMAIN = '@late.vaultra.test';
const flag = (n: string) => process.argv.includes(n);
const arg = (n: string) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : undefined; };
const BATCH = arg('--batch');   // 'td': 24 more customers at Vaultra Thủ Đức
const ONLY = arg('--email')?.trim().toLowerCase();   // single existing account instead of the 20 new ones

// ------------------------------------------------------------------------------------------------ snapshot io
const s3 = config.storage.r2AccountId && config.storage.r2AccessKeyId && config.storage.r2SecretAccessKey
  ? new S3Client({ region: 'auto', endpoint: `https://${config.storage.r2AccountId}.r2.cloudflarestorage.com`, credentials: { accessKeyId: config.storage.r2AccessKeyId, secretAccessKey: config.storage.r2SecretAccessKey } })
  : null;
const bucket = config.storage.r2PublicBucket || 'vaultra';

/** Same choice the backend makes at start-up: the fuller local backup wins, otherwise R2. */
async function readBase(): Promise<{ snap: Snap; from: string }> {
  let r2: Snap | null = null;
  if (s3) {
    try {
      const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: KEY }));
      const raw = await res.Body?.transformToString();
      if (raw) r2 = JSON.parse(raw);
    } catch (e: any) { console.warn(`R2 not readable (${e?.message ?? e}); using the local backup`); }
  }
  const local: Snap | null = fs.existsSync(LOCAL) ? JSON.parse(fs.readFileSync(LOCAL, 'utf8')) : null;
  if (local && (!r2 || (local.contract ?? []).length > (r2.contract ?? []).length || Object.keys(local).length > Object.keys(r2).length)) return { snap: local, from: 'local backup' };
  if (r2) return { snap: r2, from: 'R2' };
  throw new Error('No snapshot found (neither R2 nor apps/api/storage/r2-db-backup.json)');
}

function portBusy(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.connect({ port, host: '127.0.0.1' });
    s.once('connect', () => { s.destroy(); resolve(true); });
    s.once('error', () => resolve(false));
    s.setTimeout(800, () => { s.destroy(); resolve(false); });
  });
}

// ------------------------------------------------------------------------------------------------ helpers
const DAY = 86400000;
/** Today as a calendar date in Vietnam, as UTC midnight (the way date-only columns are stored). */
function vnToday(): Date {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
  return new Date(`${p}T00:00:00.000Z`);
}
const TODAY = vnToday();
const dOff = (base: Date, days: number) => new Date(base.getTime() + days * DAY);
const iso = (d: Date) => d.toISOString();
const addMonths = (d: Date, m: number) => { const x = new Date(d); x.setUTCMonth(x.getUTCMonth() + m); return x; };
const hex = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '');

// Everything below follows the policy version that is ACTIVE for the facility (the same one the app picks for a new contract):
// grace / lock-out / final notice / default days, late-fee rule and VAT all come from it, never from numbers typed here.
type PP = { grace: number; lockout: number; final: number; def: number; lateType: string; lateFixed: number; latePct: number; lateCap: number; vat: number; inclVat: boolean; lead: number };
type Stage = 'GRACE' | 'LATE' | 'LOCKED_OUT' | 'FINAL_NOTICE' | 'DEFAULT_PENDING';
const STAGES: Stage[] = ['GRACE', 'LATE', 'LOCKED_OUT', 'FINAL_NOTICE', 'DEFAULT_PENDING'];
const ppOf = (x: Row): PP => ({ grace: x.grace_days, lockout: x.lockout_day, final: x.final_notice_day, def: x.default_day, lateType: x.late_fee_type, lateFixed: x.late_fee_fixed, latePct: x.late_fee_pct, lateCap: x.late_fee_cap, vat: x.vat_rate, inclVat: x.prices_include_vat, lead: x.invoice_lead_days ?? 7 });
/** CoreService.activePolicy: the facility's own ACTIVE version if it has one, otherwise the global one; latest effective_from wins. */
function activePolicy(snap: Snap, facilityId: string) {
  const T = (n: string) => snap[n] ?? [];
  const pick = (scope: 'FACILITY' | 'GLOBAL') => T('policyVersion')
    .filter((v) => v.status === 'ACTIVE' && Date.parse(v.effective_from) <= Date.now() && (() => { const p = T('policy').find((x) => x.id === v.policy_id); return scope === 'FACILITY' ? p?.scope === 'FACILITY' && p.facility_id === facilityId : p?.scope === 'GLOBAL'; })())
    .sort((a, b) => Date.parse(b.effective_from) - Date.parse(a.effective_from))[0];
  const v = pick('FACILITY') ?? pick('GLOBAL');
  if (!v) throw new Error(`No active policy for facility ${facilityId}`);
  const P = ppOf(v.params ?? {});
  if (!P.inclVat) throw new Error('The seed assumes VAT-inclusive prices; this policy is VAT-exclusive');
  return { v, P };
}
/** DelinquencyService.targetStage */
const stageOf = (days: number, P: PP): Stage => (days <= P.grace ? 'GRACE' : days < P.lockout ? 'LATE' : days < P.final ? 'LOCKED_OUT' : days < P.def ? 'FINAL_NOTICE' : 'DEFAULT_PENDING');
/** day on which the job moves a contract into each stage */
const enterDay = (st: Stage, P: PP) => ({ GRACE: 1, LATE: P.grace + 1, LOCKED_OUT: P.lockout, FINAL_NOTICE: P.final, DEFAULT_PENDING: P.def })[st];
/** DelinquencyService.lateFee: fixed / percent of the monthly rent / the greater of both, capped */
function lateFeeOf(P: PP, rent: number) {
  const pct = Math.round((rent * P.latePct) / 100);
  const v = P.lateType === 'FIXED' ? P.lateFixed : P.lateType === 'PERCENT_OF_RENT' ? pct : Math.max(P.lateFixed, pct);
  return Math.min(v, P.lateCap);
}
const fmtD = (d: Date) => `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
const fmtVnd = (n: number) => `${new Intl.NumberFormat('vi-VN').format(n)} ₫`;
const diffDays = (a: Date, b: Date) => Math.round((a.getTime() - b.getTime()) / DAY);

interface Spec { name: string; fac: number; ut: number; days: number; months?: number; email?: string }

/** 20 contracts, one per lateness value, covering every stage band (GRACE 1-5, LATE 6-9, LOCKED_OUT 10-29, FINAL_NOTICE 30-44, DEFAULT_PENDING 45+). */
const SPECS: Spec[] = [
  { name: 'Vũ Thanh Hải', fac: 1, ut: 1, days: 1 },
  { name: 'Nguyễn Khánh Linh', fac: 2, ut: 7, days: 2 },
  { name: 'Trần Đức Thịnh', fac: 3, ut: 13, days: 3 },
  { name: 'Lê Bảo Châu', fac: 1, ut: 2, days: 4 },
  { name: 'Phạm Gia Bảo', fac: 2, ut: 8, days: 5 },
  { name: 'Hoàng Thu Trang', fac: 3, ut: 14, days: 6 },
  { name: 'Đinh Quốc Việt', fac: 1, ut: 3, days: 7 },
  { name: 'Lâm Phương Nhi', fac: 2, ut: 9, days: 9 },
  { name: 'Kiều Minh Nhật', fac: 3, ut: 15, days: 10 },
  { name: 'Tô Ngọc Mai', fac: 1, ut: 4, days: 12 },
  { name: 'Quách Văn Long', fac: 2, ut: 10, days: 15 },
  { name: 'Thái Hồng Nhung', fac: 3, ut: 16, days: 20 },
  { name: 'Âu Thế Vinh', fac: 1, ut: 5, days: 25 },
  { name: 'Văn Cẩm Tú', fac: 2, ut: 11, days: 29 },
  { name: 'La Đình Phong', fac: 3, ut: 17, days: 30 },
  { name: 'Mạc Thùy Dung', fac: 1, ut: 6, days: 35, months: 2 },
  { name: 'Tăng Bá Cường', fac: 2, ut: 7, days: 40 },
  { name: 'Ung Hoài Thương', fac: 3, ut: 18, days: 45 },
  { name: 'Khúc Anh Dũng', fac: 1, ut: 1, days: 60, months: 2 },
  { name: 'Giang Tuyết Mai', fac: 2, ut: 8, days: 90, months: 3 },
];

/** second batch: 24 more customers, all at Vaultra Thủ Đức (facility 2), every one a different number of days late */
const TD_DAYS = [2, 4, 6, 8, 11, 13, 14, 16, 18, 19, 21, 23, 26, 28, 31, 33, 36, 38, 42, 44, 47, 50, 55, 70];
const TD_NAMES = ['Nguyễn Hoài Nam', 'Trần Thị Kim Ngân', 'Lê Văn Hậu', 'Phạm Quỳnh Anh', 'Hoàng Đức Minh', 'Vũ Thị Thanh Tâm', 'Đặng Quốc Khánh', 'Bùi Ngọc Diệp', 'Đỗ Mạnh Cường', 'Ngô Thùy Linh', 'Dương Văn Tuấn', 'Lý Bảo Ngọc', 'Phan Hữu Nghĩa', 'Võ Thị Mỹ Duyên', 'Trương Gia Huy', 'Cao Thị Lan Anh', 'Tạ Quang Vinh', 'Đinh Hồng Phúc', 'Lâm Thanh Bình', 'Mai Văn Đạt', 'Hà Thu Phương', 'Chu Minh Hiếu', 'Kiều Thị Hạnh', 'Lương Đình Trọng'];
const TD_TYPES = [7, 8, 7, 9, 8, 10, 7, 8, 11, 9, 8, 7, 10, 8, 9, 11, 7, 8, 12, 9, 10, 8, 11, 12];
const SPECS_TD: Spec[] = TD_DAYS.map((days, i) => ({ name: TD_NAMES[i], fac: 2, ut: TD_TYPES[i], days, months: days >= 40 ? 2 : days >= 30 && i % 2 ? 2 : 1 }));
const batchEmails = new Set(SPECS_TD.map((s) => `${slug(s.name)}${DOMAIN}`));

// ------------------------------------------------------------------------------------------------ build
function build(snap: Snap) {
  const T = (n: string) => (snap[n] ??= []);
  const nextId: Record<string, number> = {};
  const idOf = (t: string) => (nextId[t] ??= Math.max(0, ...T(t).map((r) => Number(r.id))) + 1);
  const add = (t: string, row: Row) => { const id = idOf(t); nextId[t] = id + 1; const r = { ...row, id: String(id) }; T(t).push(r); return r; };
  const num = (code: string) => Number(code.split('-').pop());
  const maxNum = (t: string, prefix: string) => Math.max(0, ...T(t).filter((r) => String(r.code).startsWith(prefix)).map((r) => num(r.code)));
  let nCust = maxNum('customer', 'CUS-'), nCt = maxNum('contract', 'CT-2026-'), nInv = maxNum('invoice', 'INV-2026-'), nRcp = maxNum('payment', 'RCP-2026-');
  const created = { contracts: [] as string[] };

  const tplUser = T('user').find((u) => u.id === '11') ?? T('user').find((u) => (u.password_hash ?? '').startsWith('$pbkdf2'));
  const tplCust = T('customer')[0];
  const tplCred = T('accessCredential').find((c) => c.status === 'ACTIVE') ?? T('accessCredential')[0];
  const tplSnapshot = T('contract').find((c) => c.snapshot && c.snapshot.facility)?.snapshot;
  if (!tplUser || !tplCust || !tplCred || !tplSnapshot) throw new Error('Template rows missing in the snapshot');
  const customerRole = T('role').find((r) => r.code === 'CUSTOMER')!;
  const staff = { fm: '5', bom: '2', w1: '6', w2: '5' };
  for (const u of Object.values(staff)) if (!T('user').some((x) => x.id === u)) throw new Error(`Staff user ${u} not found`);
  const lateFeeType = T('feeType').find((f) => f.code === 'LATE_FEE')!;
  const takenUnits = new Set<string>();

  const out: { name: string; code: string; stage: string; days: number; debt: number }[] = [];
  const specs: Spec[] = ONLY
    ? String(arg('--days') ?? '60').split(',').map((d) => ({ name: '', email: ONLY, fac: Number(arg('--fac') ?? 1), ut: 7 + (Number(d) % 6), days: Number(d), months: Number(arg('--months') ?? 1) }))
    : BATCH === 'td' ? SPECS_TD : SPECS;
  specs.forEach((sp, idx) => {
    const fac = T('facility').find((f) => f.id === String(sp.fac))!;
    // the preferred unit type first, then any other type of the facility that still has a free unit
    const freeOf = (utId: string) => T('unit').filter((u) => u.facility_id === String(sp.fac) && u.unit_type_id === utId && u.status === 'AVAILABLE' && !u.deleted_at && !takenUnits.has(u.id)).sort((a, b) => Number(a.id) - Number(b.id))[0];
    const types = T('unitType').filter((u) => u.facility_id === String(sp.fac) && !u.deleted_at && u.status === 'ACTIVE' && ['XS1', 'S2', 'M5', 'M6G', 'L10', 'XL20'].includes(String(u.code))).sort((a, b) => (a.id === String(sp.ut) ? -1 : b.id === String(sp.ut) ? 1 : Number(a.id) - Number(b.id)));
    const ut = types.find((u) => freeOf(u.id));
    if (!ut) throw new Error(`No free unit left in ${fac.name}`);
    const unit = freeOf(ut.id)!;
    takenUnits.add(unit.id);
    const zone = T('zone').find((z) => z.id === unit.zone_id);
    const rent = Number(ut.online_price);
    const { v: pv, P } = activePolicy(snap, String(sp.fac));
    const stage = stageOf(sp.days, P);
    const nowIso = iso(new Date());
    const stamp = (daysAgo: number, hour = 9) => iso(new Date(dOff(TODAY, -daysAgo).getTime() + hour * 3600000));

    // ---- user + customer (single-account mode reuses the existing ones)
    let email: string, phone: string, user: Row, customer: Row;
    if (sp.email) {
      user = T('user').find((u) => String(u.email).toLowerCase() === sp.email)!;
      if (!user) throw new Error(`No account with e-mail ${sp.email}`);
      customer = T('customer').find((c) => c.user_id === user.id && !c.deleted_at)!;
      if (!customer) throw new Error(`${sp.email} has no customer profile`);
      email = user.email; phone = customer.phone ?? user.phone ?? '';
      sp.name = customer.full_name;
    } else {
      email = `${slug(sp.name)}${DOMAIN}`;
      phone = `09${String(10000000 + idx * 1234567).slice(0, 8)}`;
      user = add('user', { ...tplUser, public_id: ulid(), email, full_name: sp.name, phone, created_at: nowIso, updated_at: nowIso, last_login_at: null, locale: 'vi', token_version: 0, failed_login_count: 0 });
      add('userRole', { user_id: user.id, role_id: customerRole.id, facility_id: null, facility_key: '0', assigned_by: null, assigned_at: nowIso, revoked_at: null, revoked_by: null, active_key: 1 });
      nCust += 1;
      customer = add('customer', { ...tplCust, public_id: ulid(), code: `CUS-${String(nCust).padStart(6, '0')}`, user_id: user.id, full_name: sp.name, email, phone, id_document_last4: String(1000 + idx * 37).slice(0, 4), booking_blocked: false, booking_blocked_reason: null, balance_cached: 0, created_at: nowIso, updated_at: nowIso });
    }

    // ---- timeline: the first period was paid when the contract was signed; from then on one invoice is issued `lead` days before every
    // monthly period starts (calendar months anchored on the contract start, like the billing job). The oldest unpaid one is `days` overdue.
    const oldestDue = dOff(TODAY, -sp.days);
    const start = addMonths(oldestDue, -1);
    const end = addMonths(start, 12);
    const billingDay = Math.min(28, start.getUTCDate());
    const periods: Date[] = [];
    for (let k = 0; ; k++) { const due = addMonths(oldestDue, k); if (due.getTime() - P.lead * DAY > TODAY.getTime()) break; periods.push(due); }
    const nextPeriod = addMonths(oldestDue, periods.length);   // first period not yet invoiced

    // ---- deposit + contract
    nCt += 1;
    const deposit = add('deposit', { customer_id: customer.id, reservation_id: null, contract_id: null, facility_id: String(sp.fac), amount: rent, held_amount: rent, applied_amount: 0, refunded_amount: 0, forfeited_amount: 0, status: 'HELD', source_payment_id: null, created_at: iso(start), updated_at: iso(start) });
    const snapshot = JSON.parse(JSON.stringify(tplSnapshot));
    Object.assign(snapshot.customer, { name: sp.name, email, phone, address: '', code: customer.code });
    Object.assign(snapshot.facility, { name: fac.name, address: [fac.address_line, fac.district].filter(Boolean).join(', '), phone: fac.phone ?? snapshot.facility.phone });
    Object.assign(snapshot.unit, { code: unit.code, zone: zone?.name ?? snapshot.unit.zone, floor: zone?.floor ?? snapshot.unit.floor, type: ut.name });
    Object.assign(snapshot.price, { monthlyRent: rent, deposit: rent, termMonths: 12, billingMode: 'MONTHLY' });
    snapshot.policyVersionId = pv.id;
    if (sp.email) snapshot.demoOverdueFor = sp.email;   // marker so --remove --email finds exactly this contract
    const contract = add('contract', {
      public_id: ulid(), code: `CT-2026-${String(nCt).padStart(6, '0')}`, customer_id: customer.id, facility_id: String(sp.fac), unit_id: unit.id, unit_type_id: ut.id, reservation_id: null,
      status: 'ACTIVE', delinquency_status: stage,
      start_date: iso(start), current_end_date: iso(end), effective_end_date: iso(end), billing_mode: 'MONTHLY', billing_day: billingDay, monthly_rent: rent, deposit_id: deposit.id,
      policy_version_id: pv.id, auto_renew: false, renewal_blocked: false, renewal_blocked_reason: null, is_holdover: false,
      signed_at: iso(start), activated_at: iso(start), ended_at: null, closed_at: null, termination_reason: null,
      snapshot, created_at: iso(start), updated_at: nowIso,
    });
    deposit.contract_id = contract.id;
    created.contracts.push(contract.code);
    add('contractTerm', { contract_id: contract.id, sequence_no: 1, type: 'INITIAL', start_date: iso(start), end_date: iso(end), monthly_rent: rent, term_months: 12, policy_version_id: pv.id, renewal_offer_id: null, status: 'ACTIVE', created_at: iso(start) });
    add('billingSchedule', { contract_id: contract.id, next_period_start: iso(nextPeriod), next_invoice_date: iso(dOff(nextPeriod, -P.lead)), period_months: 1, amount: rent, status: 'ACTIVE', updated_at: nowIso });
    const dep0 = add('customerLedgerEntry', { customer_id: customer.id, contract_id: contract.id, entry_type: 'DEPOSIT_HELD', amount: 0, source_type: 'deposit', source_id: deposit.id, description: `Tiền cọc ${contract.code}`, occurred_at: iso(start), created_by: null });
    void dep0;

    // ---- invoices (VAT is contained in the price: the header tax_total is 0, each item carries the VAT share, exactly as CoreService.createInvoice stores it)
    const vatShare = (amount: number) => Math.round((amount * P.vat) / (100 + P.vat));
    const mkInvoice = (type: 'RECURRING' | 'AD_HOC', due: Date, total: number, items: Row[]) => {
      nInv += 1;
      const issue = type === 'RECURRING' ? dOff(due, -P.lead) : due;
      const overdue = due.getTime() < TODAY.getTime();
      const inv = add('invoice', {
        public_id: ulid(), code: `INV-2026-${String(nInv).padStart(6, '0')}`, customer_id: customer.id, facility_id: String(sp.fac), contract_id: contract.id, reservation_id: null, type,
        period_start: type === 'RECURRING' ? iso(due) : null, period_end: type === 'RECURRING' ? iso(addMonths(due, 1)) : null,
        issue_date: iso(issue), due_date: iso(due), status: 'ISSUED', subtotal: total, discount_total: 0, tax_total: 0, total, amount_paid: 0, amount_credited: 0, balance_due: total, currency: 'VND',
        late_fee_applied: false, dispute_hold: false, move_in_due: false, pdf_media_id: null, paid_at: null, voided_at: null, void_reason: null, version: 0, created_at: iso(issue), updated_at: nowIso,
      });
      void overdue;
      items.forEach((it) => add('invoiceItem', { invoice_id: inv.id, fee_type_id: null, quantity: 1, tax_rate: P.vat, promotion_id: null, source_type: null, source_id: null, created_by: null, service_period_start: null, service_period_end: null, created_at: iso(issue), ...it }));
      add('customerLedgerEntry', { customer_id: customer.id, contract_id: contract.id, entry_type: 'INVOICE', amount: total, source_type: 'invoice', source_id: inv.id, description: inv.code, occurred_at: iso(issue), created_by: null });
      return inv;
    };
    const rentInvoices = periods.map((due) => {
      const pEnd = addMonths(due, 1);
      return mkInvoice('RECURRING', due, rent, [{ item_type: 'RENT', description: `Tiền thuê kho ${fmtD(due)} – ${fmtD(dOff(pEnd, -1))}`, unit_price: rent, amount: rent, tax_amount: vatShare(rent), service_period_start: iso(due), service_period_end: iso(dOff(pEnd, -1)) }]);
    });
    const oldest = rentInvoices[0];

    // late fee once the grace period is over: one supplementary invoice, issued and due the day the job entered the LATE stage, on the oldest invoice only
    const lateFee = lateFeeOf(P, rent);
    if (sp.days > P.grace) {
      oldest.late_fee_applied = true;
      mkInvoice('AD_HOC', dOff(oldestDue, P.grace + 1), lateFee, [{ item_type: 'FEE', fee_type_id: lateFeeType.id, description: `Phí trễ hạn hóa đơn ${oldest.code}`, unit_price: lateFee, amount: lateFee, tax_amount: vatShare(lateFee), source_type: 'late_fee', source_id: oldest.id }]);
    }

    // ---- stage history: one event per stage, dated the day the job crossed the threshold (what the daily job writes by itself)
    const reached = STAGES.slice(0, STAGES.indexOf(stage) + 1);
    let prev: string = 'CURRENT';
    for (const st of reached) {
      const at = stamp(sp.days - enterDay(st, P));
      const actions: Row = st === 'LATE' ? { lateFee } : st === 'LOCKED_OUT' ? { credentialsSuspended: 1 } : st === 'FINAL_NOTICE' ? { finalNoticeSent: true } : {};
      add('delinquencyEvent', { contract_id: contract.id, invoice_id: oldest.id, from_stage: prev, to_stage: st, days_overdue: enterDay(st, P), actions, created_at: at });
      add('contractStatusHistory', { contract_id: contract.id, field: 'DELINQUENCY', from_status: prev, to_status: st, reason: `Quá hạn ${enterDay(st, P)} ngày`, actor_user_id: null, created_at: at });
      prev = st;
    }

    // ---- work items the daily job opens by itself when a stage is entered (DelinquencyService.enterStage). They are only OPENED here, staff still do them.
    const debtNow = T('invoice').filter((i) => i.contract_id === contract.id && ['ISSUED', 'PARTIALLY_PAID'].includes(i.status)).reduce((s, i) => s + Number(i.total) - Number(i.amount_paid) - Number(i.amount_credited), 0);
    const openTask = (type: 'COLLECTION_CALL' | 'OVERLOCK', title: string, enteredDaysAgo: number, dedupe: string) => {
      const created_at = stamp(enteredDaysAgo, 9);
      const due = new Date(Date.parse(created_at) + DAY);
      const task = add('workTask', { public_id: ulid(), facility_id: String(sp.fac), type, title, description: null, related_type: 'contract', related_id: contract.id, unit_id: type === 'OVERLOCK' ? unit.id : null, priority: type === 'OVERLOCK' ? 'HIGH' : 'MEDIUM', status: 'OPEN', assignee_id: null, due_at: iso(due), started_at: null, completed_at: null, is_overdue: due.getTime() < Date.now(), requires_photo: type === 'OVERLOCK', completion_note: null, blocked_reason: null, source: 'SYSTEM', dedupe_key: dedupe, version: 0, created_at, updated_at: created_at });
      add('taskEvent', { task_id: task.id, event: 'CREATED', from_user_id: null, to_user_id: null, note: null, actor_user_id: null, created_at });
    };
    if (reached.includes('LATE')) openTask('COLLECTION_CALL', `Gọi nhắc nợ ${contract.code} (${unit.code}) — ${fmtVnd(debtNow)}`, sp.days - enterDay('LATE', P), `COLLECT:${contract.id}:${oldest.id}`);
    if (reached.includes('LOCKED_OUT')) openTask('OVERLOCK', `Gắn khóa chặn kho ${unit.code} (${contract.code})`, sp.days - enterDay('LOCKED_OUT', P), `OVERLOCK:contract:${contract.id}:inv:${oldest.id}`);

    // ---- gate PIN: the job suspends it when the lock-out stage is reached
    const locked = ['LOCKED_OUT', 'FINAL_NOTICE', 'DEFAULT_PENDING'].includes(stage);
    const hash = hex(64);
    add('accessCredential', {
      ...tplCred, public_id: ulid(), contract_id: contract.id, facility_id: String(sp.fac), holder_name: sp.name, pin_lookup_hash: hash,
      status: locked ? 'SUSPENDED' : 'ACTIVE', active_pin_key: hash, active_contract_key: locked ? null : contract.id,
      valid_from: iso(start), valid_to: iso(end), issued_by: staff.w1, issued_at: iso(start), revoked_by: null, revoked_at: null,
      status_reason: locked ? `Quá hạn ${P.lockout} ngày` : null,
    });

    // ---- unit: stays occupied (placing an overlock is a manual step and is NOT done here)
    const unitFrom = unit.status;
    unit.status = 'OCCUPIED';
    unit.updated_at = nowIso;
    unit.version = Number(unit.version ?? 0) + 1;
    add('unitStatusHistory', { unit_id: unit.id, from_status: unitFrom, to_status: 'OCCUPIED', from_flag: 'NONE', to_flag: 'NONE', reason: `Bàn giao ${contract.code}`, related_type: 'contract', related_id: contract.id, actor_user_id: staff.w1, created_at: iso(start) });

    // ---- customer flags and balance
    const custContracts = new Set(T('contract').filter((c) => c.customer_id === customer.id).map((c) => c.id));
    const debt = T('invoice').filter((i) => custContracts.has(i.contract_id) && ['ISSUED', 'PARTIALLY_PAID'].includes(i.status)).reduce((s, i) => s + Number(i.total) - Number(i.amount_paid) - Number(i.amount_credited), 0);
    customer.balance_cached = debt;
    customer.booking_blocked = customer.booking_blocked || stage !== 'GRACE';
    customer.booking_blocked_reason = customer.booking_blocked ? 'Có hợp đồng quá hạn thanh toán' : null;
    out.push({ name: sp.name, code: contract.code, stage, days: sp.days, debt });
  });

  // sequences: leave room so the app never reissues one of these numbers
  const seq = (name: string, year: number, v: number) => { const s = T('sequence').find((x) => x.name === name && Number(x.year) === year); if (s && Number(s.next_value) <= v) s.next_value = v + 1; };
  seq('CT', 2026, nCt); seq('INV', 2026, nInv); seq('CUS', 2026, nCust); seq('RCP', 2026, nRcp);
  return { out, created };
}

// ------------------------------------------------------------------------------------------------ remove
const CONTRACT_CHILDREN = ['invoice', 'billingSchedule', 'deposit', 'customerLedgerEntry', 'accessCredential', 'delinquencyEvent', 'contractStatusHistory', 'overlock', 'promiseToPay', 'terminationRequest', 'abandonedGoodsRecord', 'collectionNote', 'contractTerm'];
function remove(snap: Snap) {
  const T = (n: string) => (snap[n] ??= []);
  // single-account mode: only the contract(s) carrying the marker go, the user and customer stay
  const users = ONLY ? [] : T('user').filter((u) => String(u.email).endsWith(DOMAIN) && (BATCH !== 'td' || batchEmails.has(String(u.email))));
  const userIds = new Set(users.map((u) => u.id));
  const customers = ONLY ? [] : T('customer').filter((c) => userIds.has(String(c.user_id)));
  const custIds = new Set(customers.map((c) => c.id));
  const contracts = ONLY ? T('contract').filter((c) => c.snapshot?.demoOverdueFor === ONLY) : T('contract').filter((c) => custIds.has(String(c.customer_id)));
  const ctIds = new Set(contracts.map((c) => c.id));
  const unitIds = new Set(contracts.map((c) => c.unit_id));
  const invIds = new Set(T('invoice').filter((i) => ctIds.has(String(i.contract_id))).map((i) => i.id));
  const payIds = new Set(T('payment').filter((p) => custIds.has(String(p.customer_id))).map((p) => p.id));
  const touched = new Set(contracts.map((c) => c.customer_id));
  const counts: Record<string, number> = {};
  const drop = (t: string, pred: (r: Row) => boolean) => { const before = T(t).length; snap[t] = T(t).filter((r) => !pred(r)); counts[t] = before - snap[t].length; };
  const taskIds = new Set(T('workTask').filter((w) => w.related_type === 'contract' && ctIds.has(String(w.related_id))).map((w) => w.id));
  drop('taskEvent', (r) => taskIds.has(String(r.task_id)));
  drop('workTask', (r) => taskIds.has(r.id));
  drop('invoiceItem', (r) => invIds.has(String(r.invoice_id)));
  drop('paymentAllocation', (r) => payIds.has(String(r.payment_id)) || invIds.has(String(r.invoice_id)));
  drop('payment', (r) => payIds.has(r.id));
  drop('customerLedgerEntry', (r) => custIds.has(String(r.customer_id)) || ctIds.has(String(r.contract_id)));
  for (const t of CONTRACT_CHILDREN) if (t !== 'customerLedgerEntry') drop(t, (r) => ctIds.has(String(r.contract_id)));
  drop('unitStatusHistory', (r) => unitIds.has(String(r.unit_id)) && String(r.related_type) === 'contract' && ctIds.has(String(r.related_id)));
  for (const u of T('unit')) if (unitIds.has(u.id)) { u.status = 'AVAILABLE'; u.updated_at = new Date().toISOString(); u.version = Number(u.version ?? 0) + 1; }
  drop('contract', (r) => ctIds.has(r.id));
  drop('userRole', (r) => userIds.has(String(r.user_id)));
  drop('customer', (r) => custIds.has(r.id));
  drop('user', (r) => userIds.has(r.id));
  if (ONLY) for (const c of T('customer')) if (touched.has(c.id)) { // keep the existing customer's cached balance and booking block honest
    const own = new Set(T('contract').filter((x) => x.customer_id === c.id).map((x) => x.id));
    c.balance_cached = T('invoice').filter((i) => own.has(i.contract_id) && ['ISSUED', 'PARTIALLY_PAID'].includes(i.status)).reduce((s, i) => s + Number(i.total) - Number(i.amount_paid) - Number(i.amount_credited), 0);
  }
  return { counts, contracts: contracts.length };
}

// ------------------------------------------------------------------------------------------------ main
async function main() {
  const mode = flag('--remove') ? 'remove' : flag('--apply') ? 'apply' : 'dry';
  if (mode !== 'dry' && !flag('--force') && (await portBusy(4000))) {
    console.error('Something is listening on port 4000 (the backend). Stop it first: it keeps the database in memory and would overwrite what this script writes. Use --force only if you know it is not the live backend.');
    process.exit(2);
  }
  const { snap, from } = await readBase();
  const baseSnap: Snap = JSON.parse(JSON.stringify(snap));
  console.log(`Base snapshot: ${from} — ${snap.contract.length} contracts, ${snap.invoice.length} invoices, ${snap.user.length} users`);
  const exists = !ONLY && snap.user.some((u) => (BATCH === 'td' ? batchEmails.has(String(u.email)) : String(u.email).endsWith(DOMAIN) && !batchEmails.has(String(u.email))));

  if (flag('--selftest')) { // build then remove in memory: every table must come back to its original size and every unit to its original status
    const orig: Snap = JSON.parse(JSON.stringify(snap));
    build(snap);
    const r = remove(snap);
    const diff = Object.keys(orig).filter((t) => (snap[t] ?? []).length !== orig[t].length);
    const units = orig.unit.filter((u) => snap.unit.find((x) => x.id === u.id)?.status !== u.status).length;
    console.log(`selftest: removed ${r.contracts} contracts; tables whose size differs from the original: ${diff.join(', ') || 'none'}; units whose status differs: ${units}`);
    if (diff.length || units) process.exit(1);
    return;
  }

  let summary: unknown;
  if (mode === 'remove') {
    const r = remove(snap);
    console.log(`Removed ${r.contracts} contracts:`, r.counts);
  } else {
    if (exists) throw new Error(`The ${DOMAIN} demo cases already exist. Run --remove first if you want to rebuild them.`);
    const r = build(snap);
    summary = r.out;
    console.table(r.out);
  }

  // let the engine's own loader validate and normalise it: its integrity pass deletes dangling rows, so compare
  // what it deletes from the untouched base with what it deletes after our change - they must be the same
  const countsAfterLoad = (data: Snap) => {
    const e = new EdgePrismaService();
    e.loadSnapshot(JSON.parse(JSON.stringify(data)));
    const before = Object.fromEntries(Object.entries(data).map(([t, rows]) => [t, rows.length]));
    const st = (e as any).store as Record<string, any[]>; // hydrated lazily: read the row counts only after the integrity pass
    const changed = e.repairIntegrity();
    const after = Object.fromEntries(Object.keys(before).map((t) => [t, (st[t] ?? []).length]));
    return { e, before, after, changed };
  };
  const base0 = countsAfterLoad(JSON.parse(JSON.stringify(baseSnap)));
  const next = countsAfterLoad(snap);
  const edge = next.e;
  const lost = Object.keys(next.after).filter((t) => (next.after[t] - next.before[t]) !== ((base0.after[t] ?? 0) - (base0.before[t] ?? 0)));
  // when REMOVING, rows the running app generated for these accounts (notifications, final-notice documents, settlements ...) go with them
  if (lost.length && mode !== 'remove') throw new Error(`Integrity repair removed generated rows in: ${lost.join(', ')}; the data is not consistent, nothing was written`);
  if (lost.length) console.log(`Rows that hung off the removed accounts and went with them: ${lost.join(', ')}`);
  console.log(`Integrity check passed: contracts ${next.after.contract}, invoices ${next.after.invoice}, customers ${next.after.customer}, delinquency events ${next.after.delinquencyEvent}`);
  void summary;
  if (mode === 'dry') { console.log('Dry run: nothing written.'); return; }

  const payload = edge.exportSnapshot();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = path.resolve(path.dirname(LOCAL), `backup-before-${mode}-delinquency-${stamp}.json`);
  if (fs.existsSync(LOCAL)) fs.copyFileSync(LOCAL, backup);
  console.log(`Local backup kept at ${backup}`);
  fs.writeFileSync(`${LOCAL}.tmp`, payload, 'utf8');
  fs.renameSync(`${LOCAL}.tmp`, LOCAL);
  if (s3) {
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: KEY, Body: payload, ContentType: 'application/json' }));
    console.log('Uploaded to R2.');
  } else console.warn('No R2 credentials: only the local file was written.');
  console.log('Done. Start the backend again.');
}

main().catch((e) => { console.error(e?.message ?? e); process.exit(1); });
