import { Client, check, section, summary, inDays, idem, BASE } from './lib';

const PNG = 'data:image/png;base64,' + Buffer.alloc(400, 7).toString('base64');
const TINY = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
async function photo(c: Client, facilityId: string) {
  const up = await c.post('/media/upload-url', { purpose: 'INSPECTION_PHOTO', mimeType: 'image/png', sizeBytes: TINY.length, facilityId });
  const url = up.body.uploadUrl.startsWith('http') ? up.body.uploadUrl.replace('http://localhost:4000/v1', BASE) : BASE.replace(/\/v1$/, '') + up.body.uploadUrl;
  await fetch(url, { method: 'PUT', headers: { 'content-type': 'image/png' }, body: TINY });
  await c.post(`/media/${up.body.id}/complete`, {});
  return up.body.id as string;
}

(async () => {
  const cust = new Client('customer'); await cust.login('customer@vaultra.test');
  const staff = new Client('staff'); await staff.login('staff.hn@vaultra.test');
  const fm = new Client('fm'); await fm.login('fm.hn@vaultra.test');

  section('F3 — move-out request → inspection → settlement → completion');
  const list = await cust.get('/contracts?status=ACTIVE');
  const c = list.body?.data?.find((x: any) => (x.facility?.name ?? '').includes('Cầu Giấy')) ?? list.body?.data?.[0];
  check('an ACTIVE contract exists (run f2 first)', !!c, list.body);
  if (!c) process.exit(1);
  const date = inDays(8);
  const est = await cust.get(`/contracts/${c.id}/move-out-estimate?date=${date}`);
  check('move-out estimate returns amounts', est.status === 200, est.body);
  console.log('   estimate:', JSON.stringify(est.body).slice(0, 300));
  const past = await cust.post(`/contracts/${c.id}/move-out`, { date: inDays(-3) });
  check('move-out date in the past rejected', [400, 409, 422].includes(past.status), past.body);
  const tooSoon = await cust.post(`/contracts/${c.id}/move-out`, { date: inDays(2) });
  check('date inside the notice period rejected', tooSoon.status === 400 || tooSoon.status === 422, tooSoon.body);
  const mo = await cust.post(`/contracts/${c.id}/move-out`, { date });
  check('move-out requested (SCHEDULED)', mo.status < 300 && mo.body?.status === 'SCHEDULED', mo.body);
  const dup = await cust.post(`/contracts/${c.id}/move-out`, { date });
  check('second open request rejected (409)', dup.status === 409, dup.body);
  const cc = await cust.get(`/contracts/${c.id}`);
  check('contract now MOVE_OUT_SCHEDULED', cc.body?.status === 'MOVE_OUT_SCHEDULED', cc.body?.status);
  if (!mo.body?.id) process.exit(summary() ? 1 : 0);
  const mid = mo.body.id;

  const facId = cc.body.facility?.id ?? c.facility?.id;
  const ph = await photo(staff, facId); const ph2 = await photo(staff, facId);
  const items = ['DOOR', 'LOCK_HASP', 'WALLS', 'FLOOR'].map((code, i) => ({ code, condition: 'OK' as const, photoIds: i === 0 ? [ph] : i === 1 ? [ph2] : [] }));
  const insp = await staff.post(`/move-out-requests/${mid}/inspection`, { items, overall: 'GOOD', leftItems: false, cleaningRequired: false });
  check('staff records move-out inspection', insp.status < 300, insp.body);
  const st = await cust.get(`/contracts/${c.id}/settlement`);
  check('settlement computed and visible to customer', st.status === 200, st.body);
  console.log('   settlement:', JSON.stringify(st.body).slice(0, 400));
  const noSig = await staff.post(`/move-out-requests/${mid}/complete`, { agree: true });
  check('completion without signature rejected', [400, 422].includes(noSig.status), noSig.body);
  const done = await staff.post(`/move-out-requests/${mid}/complete`, { agree: true, signature: PNG });
  check('move-out completed with customer agreement', done.status < 300, done.body);
  const after = await cust.get(`/contracts/${c.id}`);
  check('contract ENDED (or terminal) after completion', ['ENDED', 'TERMINATED', 'COMPLETED', 'CLOSED'].includes(after.body?.status), after.body?.status);
  const unitId = cc.body.unit?.id;
  const fc = await staff.post(`/units/${unitId}/final-check`, { cleaned: true, result: 'AVAILABLE' });
  check('final unit check returns unit to AVAILABLE', fc.status < 300, fc.body);
  const st2 = await cust.get(`/contracts/${c.id}/settlement`);
  check('settlement record exists after completion', !!st2.body?.settlement, st2.body);
  console.log('   settlement:', JSON.stringify(st2.body?.settlement ?? null).slice(0, 300));
  const refunds = await fm.get('/refunds?page[size]=5');
  check('refund list readable by FM', refunds.status === 200);
  process.exit(summary() ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
