/**
 * Read-only audit of the seeded overdue contracts against the app's own rules:
 *   - the contract uses the policy version that is ACTIVE for its facility
 *   - the stored stage equals DelinquencyService.targetStage for the days the oldest invoice is overdue
 *   - rent = the unit type's online price, every rent invoice = rent, VAT contained (header tax_total 0, total = subtotal - discount)
 *   - the late-fee invoice exists exactly when days > grace, with the amount DelinquencyService.lateFee gives, due the day LATE was entered
 *   - the invoices issued are exactly the periods whose (due date - lead days) is not in the future
 *   - the customer's cached balance equals their open invoices
 *
 *   npx tsx prisma/tools/verify-overdue.ts            (reads apps/api/storage/r2-db-backup.json)
 *   npx tsx prisma/tools/verify-overdue.ts --r2       (reads the live snapshot from R2 instead)
 */
import '../../src/common/prisma.service';
import * as fs from 'fs';
import * as path from 'path';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { config } from '../../src/common/config';

type Row = Record<string, any>;
const DAY = 86400000;
const addMonths = (d: Date, m: number) => { const x = new Date(d); x.setUTCMonth(x.getUTCMonth() + m); return x; };
const today = (() => { const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date()); return new Date(`${p}T00:00:00.000Z`); })();
const days = (a: Date, b: Date) => Math.round((a.getTime() - b.getTime()) / DAY);

async function load(): Promise<Record<string, Row[]>> {
  if (process.argv.includes('--r2')) {
    const s3 = new S3Client({ region: 'auto', endpoint: `https://${config.storage.r2AccountId}.r2.cloudflarestorage.com`, credentials: { accessKeyId: config.storage.r2AccessKeyId!, secretAccessKey: config.storage.r2SecretAccessKey! } });
    const res = await s3.send(new GetObjectCommand({ Bucket: config.storage.r2PublicBucket || 'vaultra', Key: '_db/vaultra-diff-v1.json' }));
    return JSON.parse((await res.Body!.transformToString()));
  }
  return JSON.parse(fs.readFileSync(path.resolve(config.storage.localDir, 'r2-db-backup.json'), 'utf8'));
}

(async () => {
  const snap = await load();
  const T = (n: string) => snap[n] ?? [];
  const activeFor = (facilityId: string) => {
    const pick = (scope: string) => T('policyVersion').filter((v) => v.status === 'ACTIVE' && Date.parse(v.effective_from) <= Date.now() && (() => { const p = T('policy').find((x) => x.id === v.policy_id); return scope === 'FACILITY' ? p?.scope === 'FACILITY' && p.facility_id === facilityId : p?.scope === 'GLOBAL'; })()).sort((a, b) => Date.parse(b.effective_from) - Date.parse(a.effective_from))[0];
    return pick('FACILITY') ?? pick('GLOBAL');
  };
  const seededUsers = new Set(T('user').filter((u) => /@(late|debt)\.vaultra\.test$/.test(String(u.email))).map((u) => u.id));
  const customers = new Set(T('customer').filter((c) => seededUsers.has(c.user_id)).map((c) => c.id));
  const contracts = T('contract').filter((c) => customers.has(c.customer_id) || c.snapshot?.demoOverdueFor);
  let bad = 0;
  const problems: string[] = [];
  for (const c of contracts) {
    const ex: string[] = [];
    const v = activeFor(c.facility_id);
    const P = v.params;
    const prices = (T('unitType').find((u) => u.id === c.unit_type_id) ?? {}) as Row;
    if (c.policy_version_id !== v.id) ex.push(`policy ${c.policy_version_id} != active ${v.id}`);
    if (Number(c.monthly_rent) !== Number(prices.online_price)) ex.push(`rent ${c.monthly_rent} != online price ${prices.online_price}`);
    const invs = T('invoice').filter((i) => i.contract_id === c.id && i.status !== 'VOID');
    for (const i of invs) {
      if (Number(i.tax_total) !== 0) ex.push(`${i.code} header tax_total ${i.tax_total} (VAT is contained: must be 0)`);
      if (Math.round(Number(i.subtotal) - Number(i.discount_total) + Number(i.tax_total)) !== Math.round(Number(i.total))) ex.push(`${i.code} total != subtotal - discount + tax`);
      if (Math.round(Number(i.total) - Number(i.amount_paid) - Number(i.amount_credited)) !== Math.round(Number(i.balance_due))) ex.push(`${i.code} balance_due wrong`);
    }
    if (c.status === 'ACTIVE' && c.delinquency_status !== 'DEFAULTED') {
      const open = invs.filter((i) => ['ISSUED', 'PARTIALLY_PAID'].includes(i.status) && new Date(i.due_date) < today).sort((a, b) => Date.parse(a.due_date) - Date.parse(b.due_date) || Number(a.id) - Number(b.id));
      const oldest = open[0];
      const d = oldest ? days(today, new Date(oldest.due_date)) : 0;
      const target = d <= 0 ? 'CURRENT' : d <= P.grace_days ? 'GRACE' : d < P.lockout_day ? 'LATE' : d < P.final_notice_day ? 'LOCKED_OUT' : d < P.default_day ? 'FINAL_NOTICE' : 'DEFAULT_PENDING';
      if (target !== c.delinquency_status) ex.push(`stage ${c.delinquency_status} but ${d} days overdue gives ${target}`);
      if (oldest) {
        const fee = invs.find((i) => i.type === 'AD_HOC' && i.status !== 'VOID' && T('invoiceItem').some((it) => it.invoice_id === i.id && it.source_type === 'late_fee' && String(it.source_id) === String(oldest.id)));
        const rent = Number(c.monthly_rent), pct = Math.round(rent * P.late_fee_pct / 100);
        const want = Math.min(P.late_fee_type === 'FIXED' ? P.late_fee_fixed : P.late_fee_type === 'PERCENT_OF_RENT' ? pct : Math.max(P.late_fee_fixed, pct), P.late_fee_cap);
        if (d > P.grace_days) {
          if (!fee) ex.push(`${d} days late (> grace ${P.grace_days}) but no late-fee invoice`);
          else {
            if (Number(fee.total) !== want) ex.push(`late fee ${fee.total} != ${want}`);
            const expectedDue = new Date(new Date(oldest.due_date).getTime() + (P.grace_days + 1) * DAY).toISOString().slice(0, 10);
            if (String(fee.due_date).slice(0, 10) !== expectedDue) ex.push(`late fee due ${String(fee.due_date).slice(0, 10)} != ${expectedDue}`);
            if (!oldest.late_fee_applied) ex.push('late_fee_applied not set on the oldest invoice');
          }
        } else if (fee) ex.push(`late-fee invoice present although ${d} days <= grace ${P.grace_days}`);
      }
      if (c.snapshot?.demoOverdueFor || String(c.snapshot?.customer?.email ?? '').endsWith('@late.vaultra.test')) {
        const rec = invs.filter((i) => i.type === 'RECURRING');
        const first = rec.map((i) => new Date(i.due_date)).sort((a, b) => +a - +b)[0];
        if (first) {
          let n = 0; for (let k = 0; ; k++) { const due = addMonths(first, k); if (due.getTime() - (P.invoice_lead_days ?? 7) * DAY > today.getTime()) break; n++; }
          if (rec.length !== n) ex.push(`${rec.length} rent invoices but ${n} periods are due for invoicing`);
        }
      }
    }
    const cust = T('customer').find((x) => x.id === c.customer_id)!;
    const debt = T('invoice').filter((i) => T('contract').some((k) => k.id === i.contract_id && k.customer_id === cust.id) && ['ISSUED', 'PARTIALLY_PAID'].includes(i.status)).reduce((s, i) => s + Number(i.total) - Number(i.amount_paid) - Number(i.amount_credited), 0);
    if (Math.round(Number(cust.balance_cached)) !== Math.round(debt)) ex.push(`customer balance_cached ${cust.balance_cached} != open invoices ${debt}`);
    if (ex.length) { bad++; problems.push(`${c.code} (${c.status}/${c.delinquency_status}): ${ex.join('; ')}`); }
  }
  console.log(`Checked ${contracts.length} seeded contracts: ${contracts.length - bad} consistent, ${bad} with problems`);
  problems.slice(0, 40).forEach((p) => console.log(' - ' + p));
  if (problems.length > 40) console.log(` ... and ${problems.length - 40} more`);
  process.exit(bad ? 1 : 0);
})();
