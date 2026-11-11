/**
 * AUDIT REPRODUCTION SUITE (see /AUDIT_REPORT.md).
 *
 * Every check asserts the EXPECTED (correct) behaviour. A check that prints ✘ means the defect named in its label is
 * reproduced against the running API; after the fix the same check must turn ✔. Run against an isolated database:
 *
 *   API_URL=http://localhost:4100/v1 SERVICE_TOKEN_SECRET=<same as the API> npx tsx test/audit/audit-findings.ts
 *
 * The suite creates its own users / customers / reservations (unique e-mails per run) and never touches existing rows.
 * It advances the API's fake clock for the time-based checks and resets it at the end.
 */
import { createHmac } from 'node:crypto';
import { Client, BASE, check, section, idem, inDays, sleep, summary, payOnVnpay } from '../e2e/lib';

const RUN = Date.now().toString(36);
const ROOT = BASE.replace(/\/v1$/, '');
const PNG = 'data:image/png;base64,' + Buffer.alloc(400, 7).toString('base64');
const SECRET = process.env.SERVICE_TOKEN_SECRET ?? 'dev-service-token-secret-change-me';

const raw = async (method: string, path: string, opts: { headers?: Record<string, string>; body?: unknown } = {}) => {
  const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', ...(opts.headers ?? {}) }, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
  const text = await r.text();
  let json: any = null; try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: r.status, json, text, headers: r.headers };
};
const svc = async (method: string, path: string, body?: unknown) => {
  const full = `/v1${path}`;
  const ts = Math.floor(Date.now() / 1000).toString();
  const sig = createHmac('sha256', SECRET).update(`${ts}:${full}`).digest('hex');
  return raw(method, path, { headers: { 'x-service-token': `${ts}.${sig}` }, body });
};
const SKIP = (process.env.AUDIT_SKIP ?? '').split(',').filter(Boolean); // e.g. SEC-04,SEC-05 when every request shares one client IP (Worker sandbox)
const guard = async (name: string, fn: () => Promise<void>) => {
  if (SKIP.includes(name)) { console.log(`  - ${name} skipped`); return; }
  try { await fn(); } catch (e) { check(`${name} — test harness error`, false, (e as Error).message); }
};

async function makeActiveContract(tag: string, term = 1) {
  const cust = new Client('customer'); await cust.login('customer@vaultra.test');
  const staff = new Client('staff'); await staff.login('staff.hn@vaultra.test');
  const fm = new Client('fm'); await fm.login('fm.hn@vaultra.test');
  const fac = await cust.get('/catalog/facilities');
  const hn = fac.body.data.find((f: any) => f.code === 'HN-CG');
  const detail = await cust.get(`/catalog/facilities/${hn.slug}`);
  const ut = [...detail.body.unitTypes].sort((a: any, b: any) => b.available - a.available)[0];
  const start = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
  const quote = await cust.post('/quotes', { unitTypeId: ut.id, startDate: start, termMonths: term, billingMode: 'MONTHLY' });
  const res = await cust.post('/reservations', { quoteId: quote.body.id }, { 'idempotency-key': idem() });
  const rid = res.body?.reservation?.id as string;
  if (!rid) throw new Error(`reservation failed: ${JSON.stringify(res.body).slice(0, 200)}`);
  const pay = await cust.post(`/reservations/${rid}/pay`, {}, { 'idempotency-key': idem() });
  await payOnVnpay(pay.body);
  await sleep(900);
  const ss = await staff.post('/checkin-sessions', { reservationId: rid });
  const sid = ss.body.id as string;
  await staff.post(`/checkin-sessions/${sid}/verify-identity`, { documentType: 'CCCD', last4: '1234', nameMatched: true });
  const au = await staff.post(`/checkin-sessions/${sid}/assign-unit`, {});
  if (au.status >= 300) throw new Error(`assign-unit ${au.status} ${au.text.slice(0, 200)}`);
  await staff.post(`/checkin-sessions/${sid}/send-contract-email`, {});
  const st = await staff.get(`/checkin-sessions/${sid}`);
  // the customer (and only the customer) receives the signing link and signs it
  const mine = await cust.get(`/reservations/${rid}`);
  const m = /contractId=([^&]+)&token=([a-f0-9]+)/.exec(mine.body?.pendingContractSignUrl ?? '');
  if (!m) throw new Error('customer did not receive a signing link');
  const sign = await raw('POST', `/contracts/${m[1]}/sign-by-email`, { body: { token: m[2], signature: PNG } });
  if (sign.status >= 300) throw new Error(`customer signing failed ${sign.status}`);
  const st2 = await staff.get(`/checkin-sessions/${sid}`);
  return { cust, staff, fm, rid, sid, ut, hn, state: st2.body, staffViewBeforeSigning: st.body, tag };
}

const TINY_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
async function photo(c: Client, facilityId?: string) {
  const up = await c.post('/media/upload-url', { purpose: 'INSPECTION_PHOTO', mimeType: 'image/png', sizeBytes: TINY_PNG.length, facilityId });
  const url = up.body.uploadUrl.startsWith('http') ? up.body.uploadUrl.replace(/^http:\/\/localhost:4000\/v1/, BASE) : ROOT + up.body.uploadUrl;
  await fetch(url, { method: 'PUT', headers: { 'content-type': 'image/png' }, body: TINY_PNG });
  await c.post(`/media/${up.body.id}/complete`, {});
  return up.body.id as string;
}
/** Legitimate hand-over: condition report with 4 photos, then complete. */
async function finishCheckin(c: Awaited<ReturnType<typeof makeActiveContract>>) {
  const ids: string[] = []; for (let i = 0; i < 4; i++) ids.push(await photo(c.staff, c.hn.id));
  const items = ['DOOR', 'LOCK_HASP', 'WALLS', 'FLOOR'].map((code, i) => ({ code, condition: 'OK', photoIds: [ids[i]] }));
  const insp = await c.staff.post(`/checkin-sessions/${c.sid}/inspection`, { items, overall: 'GOOD' });
  if (insp.status >= 300) throw new Error('inspection ' + insp.text.slice(0, 200));
  return c.staff.post(`/checkin-sessions/${c.sid}/complete`, { signature: PNG });
}

(async () => {
  const bom = new Client('bom'); await bom.login('bom@vaultra.test');
  const admin = new Client('admin'); await admin.login('admin@vaultra.test');
  const cust = new Client('customer'); await cust.login('customer@vaultra.test');
  const staffHn = new Client('staff.hn'); await staffHn.login('staff.hn@vaultra.test');
  const staffQ7 = new Client('staff.q7'); await staffQ7.login('staff.q7@vaultra.test');

  // ------------------------------------------------------------------------------------------------ SECURITY
  section('SEC-01  CORS / CSRF trust any *.pages.dev / *.workers.dev origin with credentials');
  await guard('SEC-01', async () => {
    const evil = 'https://attacker-' + RUN + '.pages.dev';
    const r = await raw('GET', '/catalog/facilities', { headers: { origin: evil } });
    check('SEC-01a  untrusted origin is NOT echoed in Access-Control-Allow-Origin', r.headers.get('access-control-allow-origin') !== evil, { acao: r.headers.get('access-control-allow-origin'), creds: r.headers.get('access-control-allow-credentials') });
    const login = await fetch(BASE + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'customer@vaultra.test', password: '12345' }) });
    const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
    const ref = await fetch(BASE + '/auth/refresh', { method: 'POST', headers: { origin: evil, cookie } });
    check('SEC-01b  /auth/refresh with the session cookie from an attacker origin is refused (403)', ref.status === 403, { status: ref.status, acao: ref.headers.get('access-control-allow-origin') });
  });

  section('SEC-02  Pre-registration takeover: sign-up with an unverified e-mail links the existing customer record');
  await guard('SEC-02', async () => {
    const email = `victim-${RUN}@example.test`;
    const made = await staffHn.post('/customers', { fullName: 'Victim Counter Customer', phone: '0912345678', email });
    check('SEC-02 setup  staff created a counter customer', made.status < 300 && !!made.body?.id, made.body);
    const reg = await raw('POST', '/auth/register', { body: { fullName: 'Attacker', email, password: 'abc12345', acceptTerms: true } });
    check('SEC-02 setup  attacker registered the victim e-mail without verifying it', reg.status < 300, reg.text.slice(0, 150));
    const login = await raw('POST', '/auth/login', { body: { email, password: 'abc12345' } });
    const linked = login.json?.user?.customerId;
    check('SEC-02  unverified sign-up is NOT attached to the victim\'s existing customer record', !!login.json?.accessToken && linked !== made.body.id, { attackerCustomerId: linked, victimCustomerId: made.body?.id, emailVerified: login.json?.user?.emailVerified });
  });

  section('SEC-03  Secrets committed in source');
  await guard('SEC-03', async () => {
    const { readFileSync } = await import('node:fs');
    const cfg = readFileSync(new URL('../../src/common/config.ts', import.meta.url), 'utf8');
    check('SEC-03a  no Gemini API key literal in config.ts', !/AQ\.Ab8R/.test(cfg), 'config.ts contains 5 literal "AQ.Ab8R…" keys');
    check('SEC-03b  production boot refuses the default SERVICE_TOKEN_SECRET', /SERVICE_TOKEN_SECRET.*required in production|serviceTokenSecret.*isProd/.test(readFileSync(new URL('../../src/auth/jwt.service.ts', import.meta.url), 'utf8') + cfg), 'jwt.service.ts only validates JWT_* and FIELD_ENCRYPTION_KEY');
    const forged = await raw('GET', '/internal/jobs', { headers: { 'x-service-token': (() => { const ts = Math.floor(Date.now() / 1000).toString(); return `${ts}.${createHmac('sha256', 'dev-service-token-secret-change-me').update(`${ts}:/v1/internal/jobs`).digest('hex')}`; })() } });
    check('SEC-03c  a service token signed with the PUBLIC default secret is rejected', forged.status === 403, { status: forged.status, note: 'passes only because this instance sets its own secret' });
  });

  section('SEC-04  Rate limiting keyed on a client-controlled header');
  await guard('SEC-04', async () => {
    const hit = async (xff?: (i: number) => string) => { let limited = 0; for (let i = 0; i < 45; i++) { const r = await raw('POST', '/auth/refresh', { headers: xff ? { 'x-forwarded-for': xff(i) } : {} }); if (r.status === 429) limited++; } return limited; };
    const control = await hit();
    const spoofed = await hit((i) => `10.7.${i}.${i + 1}`);
    check('SEC-04  45 calls to a 30/min endpoint are limited even when X-Forwarded-For rotates (control run limited=' + control + ')', control > 0 && spoofed > 0, { controlLimited: control, spoofedLimited: spoofed });
  });

  section('SEC-05  Account lock-out bypass with parallel password guesses (risk probe)');
  await guard('SEC-05', async () => {
    const email = 'customer2@vaultra.test';
    const burst = await Promise.all(Array.from({ length: 12 }, (_, i) => raw('POST', '/auth/login', { headers: { 'x-forwarded-for': `10.8.0.${i + 1}` }, body: { email, password: 'wrong-' + i } })));
    const ok = await raw('POST', '/auth/login', { headers: { 'x-forwarded-for': '10.8.1.1' }, body: { email, password: '12345' } });
    check('SEC-05  after 12 failed guesses (limit 5) the account is locked', ok.status !== 200, { statuses: burst.map((b) => b.status).join(','), correctPasswordLogin: ok.status });
  });

  section('DB-01  Customer code sequences collide (counter customers vs self-registration)');
  await guard('DB-01', async () => {
    const a = await staffHn.post('/customers', { fullName: 'Counter A', phone: '0911000111', email: `seqa-${RUN}@example.test` });
    const b = await raw('POST', '/auth/register', { body: { fullName: 'Self Reg B', email: `seqb-${RUN}@example.test`, password: 'abc12345', acceptTerms: true } });
    check('DB-01  self-registration still works after a counter customer was created', b.status < 300, { counterCustomerCode: a.body?.code, registerStatus: b.status, message: b.json?.error?.message });
  });

  section('SEC-06  POST /customers discloses any customer record (IDOR)');
  await guard('SEC-06', async () => {
    const email = `idor-${RUN}@example.test`;
    const mine = await staffQ7.post('/customers', { fullName: 'Q7 Only Customer', phone: '0987654321', email });
    const stolen = await staffHn.post('/customers', { fullName: 'x x', phone: '0900000000', email });
    const direct = await staffHn.get(`/customers/${mine.body?.id}`);
    check('SEC-06  HN staff cannot read a Q7 customer through POST /customers (GET /customers/:id is ' + direct.status + ')', direct.status === 404 && stolen.body?.id !== mine.body?.id, { postStatus: stolen.status, returnedId: stolen.body?.id, ownerId: mine.body?.id, getStatus: direct.status });
  });

  section('SEC-07  Public sign-email-info leaks PII of a signed contract with any token');
  let ctx: Awaited<ReturnType<typeof makeActiveContract>> | null = null;
  await guard('SEC-07 setup', async () => { ctx = await makeActiveContract('main'); });
  if (ctx) {
    const c = ctx as Awaited<ReturnType<typeof makeActiveContract>>;
    const st = c.state;
    const contractId = st.contract?.id as string;
    await guard('BIZ-07', async () => {
      check('BIZ-07  staff view of the check-in session does not expose the customer signing token/URL', !c.staffViewBeforeSigning.signUrl, { signUrl: c.staffViewBeforeSigning.signUrl ? '<present>' : null });
    });
    await guard('SEC-07', async () => {
      const info = await raw('GET', `/contracts/${contractId}/sign-email-info?token=${'z'.repeat(24)}`);
      check('SEC-07  garbage token on a signed contract returns 4xx (not customer e-mail / phone)', info.status >= 400, { status: info.status, email: info.json?.customer?.email, phone: info.json?.customer?.phone });
    });

    section('BIZ-01  Check-in /complete bypasses inspection, photo minimum and the access hard-gate');
    await guard('BIZ-01', async () => {
      const done = await c.staff.post(`/checkin-sessions/${c.sid}/complete`, { signature: PNG });
      check('BIZ-01  /complete is refused while no inspection (min 4 photos) exists', done.status === 409 || done.status === 422, { status: done.status, body: JSON.stringify(done.body).slice(0, 160) });
      const fin = await finishCheckin(c);
      check('BIZ-01 control  hand-over succeeds after a proper inspection report', fin.status < 300, fin.body);
    });

    section('BIZ-03  POST /contracts/:id/terminate leaves unit, PIN and billing in force');
    await guard('BIZ-03', async () => {
      const cid = contractId;
      const before = await c.fm.get(`/contracts/${cid}`);
      if (before.body?.status !== 'ACTIVE') { check('BIZ-03 setup  contract is ACTIVE (previous step activated it)', false, before.body?.status); return; }
      const t = await c.fm.post(`/contracts/${cid}/terminate`, { reason: 'audit mutual termination', terminationReason: 'MUTUAL' });
      const after = await c.fm.get(`/contracts/${cid}`);
      const acc = await c.fm.get(`/contracts/${cid}/access`);
      const live = (acc.body?.credentials ?? []).filter((x: any) => ['ACTIVE', 'SUSPENDED'].includes(x.status)).length;
      check('BIZ-03a  contract TERMINATED', t.status < 300 && after.body?.status === 'TERMINATED', after.body?.status);
      check('BIZ-03b  unit leaves OCCUPIED (needs final inspection)', after.body?.unit?.status !== 'OCCUPIED', after.body?.unit?.status);
      check('BIZ-03c  every access credential is revoked', live === 0, { liveCredentials: live });
    });
  }

  // ------------------------------------------------------------------------------------------------ BUSINESS / MONEY
  section('BIZ-02  Staff booking without customerId is attached to the FIRST customer in the database');
  await guard('BIZ-02', async () => {
    const fac = await cust.get('/catalog/facilities');
    const hn = fac.body.data.find((f: any) => f.code === 'HN-CG');
    const detail = await cust.get(`/catalog/facilities/${hn.slug}`);
    const ut = [...detail.body.unitTypes].sort((a: any, b: any) => b.available - a.available)[0];
    const quote = await staffHn.post('/quotes', { unitTypeId: ut.id, startDate: inDays(1), termMonths: 1, billingMode: 'MONTHLY' });
    const res = await staffHn.post('/reservations', { quoteId: quote.body.id }, { 'idempotency-key': idem() });
    let owner: string | undefined;
    if (res.body?.reservation?.id) owner = (await staffHn.get(`/reservations/${res.body.reservation.id}`)).body?.customer?.code;
    check('BIZ-02  reservation without a customer is rejected (4xx) instead of silently using another person\'s account', res.status >= 400, { status: res.status, bookedForCustomerCode: owner });
  });

  section('BIZ-05  max_pending_reservations (policy = 3) is overridden by Math.max(policy, 20)');
  await guard('BIZ-05', async () => {
    const pol = await bom.get('/policies');
    const maxP = Number((pol.body as any[]).find((x) => x.scope === 'GLOBAL')?.active?.params?.max_pending_reservations ?? 3);
    const fac = await cust.get('/catalog/facilities');
    const f = fac.body.data.find((x: any) => x.code === 'HCM-TD');
    const detail = await cust.get(`/catalog/facilities/${f.slug}`);
    const ut = [...detail.body.unitTypes].sort((a: any, b: any) => b.available - a.available)[0];
    let created = 0; let rejected = 0;
    for (let i = 0; i < maxP + 3; i++) {
      const q = await cust.post('/quotes', { unitTypeId: ut.id, startDate: inDays(3), termMonths: 1, billingMode: 'MONTHLY' });
      const r = await cust.post('/reservations', { quoteId: q.body.id }, { 'idempotency-key': idem() });
      if (r.status < 300) created++; else rejected++;
    }
    check(`BIZ-05  customer cannot hold more than max_pending_reservations (${maxP}) unpaid reservations`, created <= maxP, { policyMax: maxP, created, rejected });
    const pend = await cust.get('/reservations?status=PENDING_PAYMENT');
    for (const p of pend.body?.data ?? []) await cust.post(`/reservations/${p.id}/cancel`, { reason: 'audit cleanup' });
  });

  section('FIN-01  VAT on VAT-inclusive invoices');
  await guard('FIN-01', async () => {
    const fac = await cust.get('/catalog/facilities');
    const f = fac.body.data.find((x: any) => x.code === 'HCM-Q7');
    const detail = await cust.get(`/catalog/facilities/${f.slug}`);
    const ut = [...detail.body.unitTypes].sort((a: any, b: any) => b.available - a.available)[0];
    const q = await cust.post('/quotes', { unitTypeId: ut.id, startDate: inDays(2), termMonths: 3, billingMode: 'MONTHLY' });
    const r = await cust.post('/reservations', { quoteId: q.body.id }, { 'idempotency-key': idem() });
    const inv = await cust.get(`/invoices/${r.body?.invoice?.public_id ?? r.body?.invoice?.id}`);
    check('FIN-01a  quote shows VAT > 0 under 10 % inclusive VAT', Number(q.body?.taxTotal) > 0, q.body?.taxTotal);
    const itemTaxSum = (inv.body?.items ?? []).reduce((s: number, i: any) => s + Number(i.tax_amount), 0);
    check('FIN-01b  VAT contained in the invoice lines equals the quote VAT', Math.abs(itemTaxSum - Number(q.body?.taxTotal)) < 2, { quoteTax: q.body?.taxTotal, itemTaxSum });
    if (r.body?.reservation?.id) await cust.post(`/reservations/${r.body.reservation.id}/cancel`, { reason: 'audit cleanup' });
  });

  section('FIN-02  VNPay IPN with a smaller amount settles the invoice in full');
  await guard('FIN-02', async () => {
    const fac = await cust.get('/catalog/facilities');
    const f = fac.body.data.find((x: any) => x.code === 'HCM-Q7');
    const detail = await cust.get(`/catalog/facilities/${f.slug}`);
    const ut = [...detail.body.unitTypes].sort((a: any, b: any) => b.available - a.available)[0];
    const q = await cust.post('/quotes', { unitTypeId: ut.id, startDate: inDays(2), termMonths: 1, billingMode: 'MONTHLY' });
    const r = await cust.post('/reservations', { quoteId: q.body.id }, { 'idempotency-key': idem() });
    const pay = await cust.post(`/reservations/${r.body.reservation.id}/pay`, {}, { 'idempotency-key': idem() });
    const wh = { json: (await payOnVnpay(pay.body, { amountVnd: 1000 })).body };
    await sleep(500);
    const after = await cust.get(`/reservations/${r.body.reservation.id}`);
    check('FIN-02  reservation stays PENDING_PAYMENT when only 1.000 ₫ of ' + pay.body.payment.amount + ' ₫ was received', after.body?.status === 'PENDING_PAYMENT', { webhook: wh.json, reservation: after.body?.status });
  });

  section('BIZ-04  Rescheduling an appointment cancels the original before the new slot is validated');
  await guard('BIZ-04', async () => {
    const fac = await cust.get('/catalog/facilities');
    const f = fac.body.data.find((x: any) => x.code === 'HN-CG');
    const detail = await cust.get(`/catalog/facilities/${f.slug}`);
    const ut = [...detail.body.unitTypes].sort((a: any, b: any) => b.available - a.available)[0];
    const q = await cust.post('/quotes', { unitTypeId: ut.id, startDate: inDays(2), termMonths: 1, billingMode: 'MONTHLY' });
    const r = await cust.post('/reservations', { quoteId: q.body.id }, { 'idempotency-key': idem() });
    const pay = await cust.post(`/reservations/${r.body.reservation.id}/pay`, {}, { 'idempotency-key': idem() });
    await payOnVnpay(pay.body); await sleep(900);
    let day = inDays(2); let slot: any;
    for (let d = 2; d < 9 && !slot; d++) { day = inDays(d); const s = await cust.get(`/facilities/${f.slug}/appointment-slots?date=${day}&type=MOVE_IN`); slot = (s.body?.slots ?? []).find((x: any) => x.remaining > 0 && !x.past); }
    const ap = await cust.post('/appointments', { reservationId: r.body.reservation.id, type: 'MOVE_IN', slotId: String(slot.slotId), date: day });
    const bad = await cust.req('PATCH', `/appointments/${ap.body.id}`, { slotId: String(slot.slotId), date: inDays(-3) });
    const list = await cust.get('/appointments?status=BOOKED');
    const still = (list.body?.data ?? []).some((a: any) => a.id === ap.body.id);
    check('BIZ-04  after a REFUSED reschedule (' + bad.status + ') the original appointment is still BOOKED', bad.status >= 400 && still, { rescheduleStatus: bad.status, originalStillBooked: still });
  });

  section('BIZ-08  Appointment can be booked in a slot that already ended today');
  await guard('BIZ-08', async () => {
    const off = await svc('POST', '/internal/clock', { advanceHours: 0 });
    // Move the fake clock to 17:45 facility time (UTC+7 → 10:45 UTC) on today's date
    const now = new Date(String(off.json?.now));
    const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 10, 45));
    const hours = (target.getTime() - now.getTime()) / 3600000 + (target.getTime() < now.getTime() ? 24 : 0);
    await svc('POST', '/internal/clock', { advanceHours: hours });
    const clock = await svc('POST', '/internal/clock', { advanceHours: 0 });
    const localToday = new Date(new Date(String(clock.json?.now)).getTime() + 7 * 3600000).toISOString().slice(0, 10);
    const fac = await cust.get('/catalog/facilities');
    const f = fac.body.data.find((x: any) => x.code === 'HN-CG');
    const detail = await cust.get(`/catalog/facilities/${f.slug}`);
    const ut = [...detail.body.unitTypes].sort((a: any, b: any) => b.available - a.available)[0];
    const q = await cust.post('/quotes', { unitTypeId: ut.id, startDate: localToday, termMonths: 1, billingMode: 'MONTHLY' });
    const r = await cust.post('/reservations', { quoteId: q.body.id }, { 'idempotency-key': idem() });
    const pay = await cust.post(`/reservations/${r.body.reservation.id}/pay`, {}, { 'idempotency-key': idem() });
    await payOnVnpay(pay.body); await sleep(900);
    const s = await cust.get(`/facilities/${f.slug}/appointment-slots?date=${localToday}&type=MOVE_IN`);
    const morning = (s.body?.slots ?? []).find((x: any) => x.label?.startsWith('09:00'));
    const flagged = morning?.past;
    const ap = await cust.post('/appointments', { reservationId: r.body.reservation.id, type: 'MOVE_IN', slotId: String(morning?.slotId), date: localToday });
    check('BIZ-08a  slot list marks the 09:00–12:00 slot as past at 17:45', flagged === true, { label: morning?.label, past: flagged });
    check('BIZ-08b  booking a slot that ended at 12:00 is refused at 17:45', ap.status >= 400, { status: ap.status });
    await svc('POST', '/internal/clock', { reset: true });
  });

  section('API-01  Pagination parameters');
  await guard('API-01', async () => {
    const r = await cust.get('/reservations?pageSize=abc');
    check('API-01a  non-numeric page size does not cause a 5xx', r.status < 500, { status: r.status });
    const c = await cust.get('/reservations?cursor=' + Buffer.from('-5').toString('base64url'));
    check('API-01b  negative cursor does not cause a 5xx', c.status < 500, { status: c.status });
  });

  section('API-02  Admin can list facilities but not open one');
  await guard('API-02', async () => {
    const list = await admin.get('/facilities');
    const first = list.body?.[0]?.public_id ?? list.body?.[0]?.id;
    const one = first ? await admin.get(`/facilities/${first}`) : { status: 0 };
    check('API-02  GET /facilities/:id succeeds for a role that sees it in GET /facilities', list.status === 200 && one.status === 200, { listStatus: list.status, listed: list.body?.length, detailStatus: one.status });
  });

  section('SEC-08  Any customer can upload to the PUBLIC bucket');
  await guard('SEC-08', async () => {
    const up = await cust.post('/media/upload-url', { purpose: 'FACILITY_PHOTO', mimeType: 'image/png', sizeBytes: 100 });
    check('SEC-08  FACILITY_PHOTO (public bucket) upload slot is refused to a CUSTOMER', up.status === 403, { status: up.status });
  });

  section('SEC-09  Password policy');
  await guard('SEC-09', async () => {
    const r = await raw('POST', '/auth/register', { body: { fullName: 'Weak Pass', email: `weak-${RUN}@example.test`, password: 'abc1234', acceptTerms: true } });
    check('SEC-09  a 7-character password is rejected at registration (minimum 8)', r.status >= 400, { status: r.status });
  });

  section('BIZ-11  Downgrade at check-in refunds the difference in CASH');
  await guard('BIZ-11', async () => {
    const fm = new Client('fm'); await fm.login('fm.hn@vaultra.test');
    const fac = await cust.get('/catalog/facilities');
    const hn = fac.body.data.find((f: any) => f.code === 'HN-CG');
    const detail = await cust.get(`/catalog/facilities/${hn.slug}`);
    const types = [...detail.body.unitTypes].filter((t: any) => t.available > 0).sort((a: any, b: any) => Number(b.onlinePrice ?? b.online_price) - Number(a.onlinePrice ?? a.online_price));
    const big = types[0]; const small = types[types.length - 1];
    const start = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
    const q = await cust.post('/quotes', { unitTypeId: big.id, startDate: start, termMonths: 1, billingMode: 'MONTHLY' });
    const r = await cust.post('/reservations', { quoteId: q.body.id }, { 'idempotency-key': idem() });
    const pay = await cust.post(`/reservations/${r.body.reservation.id}/pay`, {}, { 'idempotency-key': idem() });
    await payOnVnpay(pay.body); await sleep(900);
    const ss = await staffHn.post('/checkin-sessions', { reservationId: r.body.reservation.id });
    await staffHn.post(`/checkin-sessions/${ss.body.id}/verify-identity`, { documentType: 'CCCD', last4: '1234', nameMatched: true });
    const au = await staffHn.post(`/checkin-sessions/${ss.body.id}/assign-unit`, { unitTypeId: small.id });
    const refund = au.body?.downgradeRefund;
    check('BIZ-11a  downgrade returns a CASH refund for the price difference', au.status < 300 && refund?.method === 'CASH' && refund.amount > 0, { status: au.status, refund, big: big.name, small: small.name });
    const list = await fm.get('/refunds?status=PENDING_APPROVAL');
    const row = (list.body?.data ?? list.body ?? []).find((x: any) => x.id === refund?.id);
    check('BIZ-11b  the refund is waiting for manager approval with method CASH', row?.method === 'CASH', { found: !!row, method: row?.method });
    await staffHn.post(`/checkin-sessions/${ss.body.id}/abort`, { reason: 'CUSTOMER_LEFT' });
  });

  await svc('POST', '/internal/clock', { reset: true }); section('BIZ-06  A PAYMENT ticket (dispute_hold) freezes the overdue chain indefinitely');
  await guard('BIZ-06', async () => {
    const c2 = await makeActiveContract('dispute', 3);
    const cid = c2.state.contract.id as string;
    const done = await finishCheckin(c2);
    if (done.status >= 300) { check('BIZ-06 setup  second contract activated', false, done.body); return; }
    await svc('POST', '/internal/clock', { advanceDays: 24 });
    await svc('POST', '/internal/jobs/billing.recurring');
    const inv = await c2.cust.get(`/invoices?contractId=${cid}&status=ISSUED`);
    const target = (inv.body?.data ?? []).find((i: any) => i.type === 'RECURRING');
    if (!target) { check('BIZ-06 setup  recurring invoice issued', false, inv.body); await svc('POST', '/internal/clock', { reset: true }); return; }
    const tk = await c2.cust.post('/tickets', { contractId: cid, invoiceId: target.id, category: 'PAYMENT', subject: 'Em muốn hỏi về hóa đơn', description: 'Hỏi về hóa đơn này nhưng sẽ không trả' });
    check('BIZ-06 setup  customer opened a PAYMENT ticket on the overdue invoice', tk.status < 300, tk.body);
    await svc('POST', '/internal/clock', { advanceDays: 70 });
    await svc('POST', '/internal/jobs/delinquency.run');
    const after = await c2.fm.get(`/contracts/${cid}`);
    check('BIZ-06  66 days after the due date (lock-out day 10, default day 45) the contract is not still stuck at LATE', !['CURRENT', 'GRACE', 'LATE'].includes(after.body?.delinquency_status), { delinquency_status: after.body?.delinquency_status });
    await svc('POST', '/internal/clock', { reset: true });
  });

  process.exit(summary() ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
