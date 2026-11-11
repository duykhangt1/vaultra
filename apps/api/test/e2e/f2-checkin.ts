import { readdirSync, readFileSync, statSync } from 'node:fs';
import { Client, check, section, idem, inDays, sleep, summary, BASE, payOnVnpay } from './lib';

const PNG = 'data:image/png;base64,' + Buffer.alloc(400, 7).toString('base64');
const mailDir = process.env.MAIL_DIR ?? `${process.cwd()}/storage/mails`;
const qp = (t: string) => Buffer.from(t.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))), 'latin1').toString('utf8');
/** Finds the newest mail to `to` whose decoded text part mentions an OTP and returns its 6-digit code. */
const latestOtp = (to: string, since = 0) => {
  const f = readdirSync(mailDir).map((n) => ({ n, t: statSync(`${mailDir}/${n}`).mtimeMs })).sort((a, b) => b.t - a.t);
  for (const x of f.slice(0, 60)) {
    if (x.t < since) continue;
    const raw = readFileSync(`${mailDir}/${x.n}`, 'utf8'); if (!raw.includes(to)) continue;
    const txt = qp(raw.split('Content-Type: text/plain')[1]?.split('Content-Type: text/html')[0] ?? '');
    if (/otp/i.test(txt)) { const m = /l\u00e0\s+(\d{6})\b/.exec(txt); if (m) return m[1]; }
  }
  return undefined;
};

const TINY_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
async function photo(c: Client, facilityId?: string) {
  const up = await c.post('/media/upload-url', { purpose: 'INSPECTION_PHOTO', mimeType: 'image/png', sizeBytes: TINY_PNG.length, facilityId });
  if (!up.body?.uploadUrl) throw new Error('upload-url: ' + up.text.slice(0, 200));
  const url = up.body.uploadUrl.startsWith('http') ? up.body.uploadUrl.replace('http://localhost:4000/v1', BASE) : BASE.replace(/\/v1$/, '') + up.body.uploadUrl;
  const put = await fetch(url, { method: 'PUT', headers: { 'content-type': 'image/png' }, body: TINY_PNG });
  if (!put.ok) throw new Error('PUT blob ' + put.status);
  const done = await c.post(`/media/${up.body.id}/complete`, {});
  if (done.status >= 300) throw new Error('complete: ' + done.text.slice(0, 200));
  return up.body.id as string;
}

(async () => {
  const cust = new Client('customer'); await cust.login('customer@vaultra.test');
  const staff = new Client('staff'); await staff.login('staff.hn@vaultra.test');
  const fm = new Client('fm'); await fm.login('fm.hn@vaultra.test');
  const pending = await cust.get('/reservations?status=PENDING_PAYMENT');
  for (const p of pending.body?.data ?? []) {
    await cust.post(`/reservations/${p.id}/cancel`, { reason: 'E2E cleanup' });
  }

  section('F2 setup — confirmed reservation at the staff member\'s facility');
  const fac = await cust.get('/catalog/facilities');
  const hn = fac.body.data.find((f: any) => f.code === 'HN-CG') ?? fac.body.data[0];
  const detail = await cust.get(`/catalog/facilities/${hn.slug}`);
  const ut = [...detail.body.unitTypes].sort((a: any, b: any) => b.available - a.available)[0];
  const start = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10); // facility-local today
  const quote = await cust.post('/quotes', { unitTypeId: ut.id, startDate: start, termMonths: 3, billingMode: 'MONTHLY' });
  const res = await cust.post('/reservations', { quoteId: quote.body.id }, { 'idempotency-key': idem() });
  const rid = res.body?.reservation?.id; check('reservation created', !!rid, res.body);
  const pay = await cust.post(`/reservations/${rid}/pay`, {}, { 'idempotency-key': idem() });
  await payOnVnpay(pay.body);
  await sleep(800);
  let r = await cust.get(`/reservations/${rid}`);
  check('paid → CONFIRMED/UNIT_ASSIGNED', ['CONFIRMED', 'UNIT_ASSIGNED'].includes(r.body.status), r.body.status);
  if (r.body.status === 'CONFIRMED') {
    const sug = await fm.get(`/reservations/${rid}/allocation-suggestions`);
    const first = sug.body?.[0] ?? sug.body?.suggestions?.[0] ?? sug.body?.data?.[0];
    const al = await fm.post(`/reservations/${rid}/allocate`, { unitId: first?.unit?.id ?? first?.id, reason: 'e2e' });
    check('manager allocates unit manually', al.status < 300, al.body);
    r = await cust.get(`/reservations/${rid}`);
  }
  const code = r.body.code;

  section('Appointment booking (separate reservation, starts tomorrow)');
  const q2 = await cust.post('/quotes', { unitTypeId: ut.id, startDate: inDays(2), termMonths: 1, billingMode: 'MONTHLY' });
  if (!q2.body?.id) console.log('   q2:', q2.status, JSON.stringify(q2.body));
  const r2 = await cust.post('/reservations', { quoteId: q2.body.id }, { 'idempotency-key': idem() });
  if (!r2.body?.reservation) console.log('   r2:', JSON.stringify(r2.body));
  const p2 = await cust.post(`/reservations/${r2.body.reservation.id}/pay`, {}, { 'idempotency-key': idem() });
  await payOnVnpay(p2.body);
  await sleep(800);
  let slots: any; let apDate = inDays(2);
  // first day in the move-in window with a slot that still has room (earlier runs may have filled some days)
  for (let d = 2; d < 9; d++) { apDate = inDays(d); slots = await cust.get(`/facilities/${hn.slug}/appointment-slots?date=${apDate}&type=MOVE_IN`); if (slots.body?.slots?.some?.((s: any) => s.remaining > 0 && !s.past)) break; }
  console.log('   slots:', JSON.stringify(slots.body).slice(0, 200));
  const slot = (slots.body?.slots ?? slots.body)?.find?.((s: any) => (s.available ?? s.remaining ?? 1) > 0 && !s.full);
  check('slots available for move-in date', !!slot, slots.body);
  if (slot) {
    const ap = await cust.post('/appointments', { reservationId: r2.body.reservation.id, type: 'MOVE_IN', slotId: String(slot.slotId ?? slot.id), date: apDate });
    check('customer books move-in appointment', ap.status < 300, ap.body);
  }

  section('Check-in wizard (staff)');
  const lk = await staff.get(`/ops/lookup?code=${code}`);
  check('lookup by reservation code', lk.status === 200 && lk.body?.reservation?.id === rid, lk.body);
  const ss = await staff.post('/checkin-sessions', { reservationId: rid });
  check('session started', ss.status < 300 && !!ss.body?.id, ss.body);
  const sid = ss.body.id;
  const early = await staff.post(`/checkin-sessions/${sid}/complete`, { signature: PNG });
  check('cannot complete before steps are done (409/422)', [409, 422, 400].includes(early.status), early.status);
  const vi = await staff.post(`/checkin-sessions/${sid}/verify-identity`, { documentType: 'CCCD', last4: '1234', nameMatched: true });
  check('identity verified', vi.status < 300, vi.body);
  const t0 = Date.now() - 1500;
  const otp = await staff.post(`/checkin-sessions/${sid}/sign-otp`, {});
  check('sign OTP sent', otp.status < 300, otp.body);
  let code6: string | undefined;
  for (let i = 0; i < 20 && !code6; i++) { await sleep(500); code6 = latestOtp('customer@vaultra.test', t0); }
  check('OTP found in mail sink', !!code6);
  const bad = await staff.post(`/checkin-sessions/${sid}/sign`, { otp: code6 === '000000' ? '111111' : '000000', signature: PNG });
  check('wrong OTP rejected', bad.status === 422 || bad.status === 400, bad.body);
  const sg = await staff.post(`/checkin-sessions/${sid}/sign`, { otp: code6, signature: PNG });
  check('contract signed', sg.status < 300, sg.body);
  const st = await staff.get(`/checkin-sessions/${sid}`);
  const facId = st.body.session?.reservation?.facility?.id ?? hn.id;
  const noInsp = await staff.post(`/checkin-sessions/${sid}/complete`, { signature: PNG });
  check('cannot hand over before the inspection report (hard gate)', [409, 422].includes(noInsp.status), noInsp.body);
  const noPhoto = await staff.post(`/checkin-sessions/${sid}/inspection`, { items: ['DOOR', 'LOCK_HASP', 'WALLS', 'FLOOR'].map((code) => ({ code, condition: 'OK' as const })), overall: 'GOOD' });
  check('inspection without enough photos rejected', noPhoto.status === 422 || noPhoto.status === 400, noPhoto.body);
  const ids = []; for (let i = 0; i < 4; i++) ids.push(await photo(staff, hn.id));
  const insp = await staff.post(`/checkin-sessions/${sid}/inspection`, { items: ['DOOR', 'LOCK_HASP', 'WALLS', 'FLOOR'].map((code, i) => ({ code, condition: 'OK' as const, photoIds: [ids[i]] })), overall: 'GOOD' });
  check('inspection with 4 photos recorded', insp.status < 300, insp.body);
  const acc = await staff.post(`/checkin-sessions/${sid}/issue-access`, { items: [{ type: 'PIN_CODE' }, { type: 'ACCESS_CARD', identifier: 'CARD-' + Date.now() % 100000 }] });
  check('access credentials issued', acc.status < 300, acc.body);
  const fin = await staff.post(`/checkin-sessions/${sid}/complete`, { signature: PNG, notes: 'e2e' });
  check('handover completed', fin.status < 300, fin.body);
  const cs = await staff.get(`/checkin-sessions/${sid}`);
  check('session COMPLETED', cs.body?.session?.status === 'COMPLETED', cs.body?.session?.status);
  const rAfter = await cust.get(`/reservations/${rid}`);
  check('reservation CHECKED_IN', rAfter.body.status === 'CHECKED_IN', rAfter.body.status);
  const cons = await cust.get('/contracts?status=ACTIVE');
  const mine = cons.body?.data?.find((c: any) => c.reservation_id === rid || c.reservation?.id === rid) ?? cons.body?.data?.[0];
  check('customer sees an ACTIVE contract', !!mine, cons.body);
  if (mine) {
    const det = await cust.get(`/contracts/${mine.id}`);
    check('contract detail loads for owner', det.status === 200 && det.body?.status === 'ACTIVE', det.body?.status);
    const cred = await cust.get(`/contracts/${mine.id}/access`);
    check('customer can view access credentials', cred.status === 200, cred.body);
    const other = new Client('other'); await other.login('fm.td@vaultra.test');
    const leak = await other.get(`/contracts/${mine.id}`);
    check('manager of another facility gets 404 (scope)', leak.status === 404, leak.status);
  }
  process.exit(summary() ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
