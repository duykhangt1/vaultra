import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHmac } from 'node:crypto';
import { Client, check, section, idem, inDays, sleep, summary, BASE } from './lib';

/**
 * VNPay checkout — runs only when the API under test uses PAYMENT_PROVIDER=VNPAY (otherwise skipped).
 * We act as VNPay: callbacks are signed with the sandbox hash secret (VNPAY_HASH_SECRET, from the environment
 * or apps/api/.env). The sandbox itself is asked only whether it accepts our signed payment URL.
 */
function secret() {
  if (process.env.VNPAY_HASH_SECRET) return { key: process.env.VNPAY_HASH_SECRET, tmn: process.env.VNPAY_TMN_CODE ?? '' };
  const f = join(__dirname, '..', '..', '.env');
  const env: Record<string, string> = {};
  if (existsSync(f)) for (const l of readFileSync(f, 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2].replace(/^"|"$/g, ''); }
  return { key: env.VNPAY_HASH_SECRET ?? '', tmn: env.VNPAY_TMN_CODE ?? '' };
}
const canon = (p: Record<string, string>) => Object.keys(p).sort().map((k) => `${k}=${encodeURIComponent(p[k]).replace(/%20/g, '+')}`).join('&');

(async () => {
  const cust = new Client('customer');
  await cust.login('customer@vaultra.test');
  const { key, tmn } = secret();
  const fac = await cust.get('/catalog/facilities');
  const detail = await cust.get(`/catalog/facilities/${fac.body.data[0].slug}`);
  const ut = [...detail.body.unitTypes].sort((a: any, b: any) => b.available - a.available)[0];

  async function start(days: number) {
    const q = await cust.post('/quotes', { unitTypeId: ut.id, startDate: inDays(days), termMonths: 1, billingMode: 'MONTHLY' });
    const res = await cust.post('/reservations', { quoteId: q.body.id }, { 'idempotency-key': idem() });
    const rid = res.body?.reservation?.id;
    const pay = await cust.post(`/reservations/${rid}/pay`, {}, { 'idempotency-key': idem() });
    return { rid, pay, url: pay.body?.redirectUrl as string | undefined };
  }
  const status = async (rid: string) => (await cust.get(`/reservations/${rid}`)).body?.status;
  const callbackQuery = (url: string, over: Record<string, string> = {}) => {
    const u = new URL(url);
    const p: Record<string, string> = { vnp_Amount: u.searchParams.get('vnp_Amount')!, vnp_BankCode: 'NCB', vnp_CardType: 'ATM', vnp_OrderInfo: u.searchParams.get('vnp_OrderInfo')!, vnp_PayDate: '20261108120000', vnp_ResponseCode: '00', vnp_TmnCode: tmn, vnp_TransactionNo: String(Date.now()).slice(-8), vnp_TransactionStatus: '00', vnp_TxnRef: u.searchParams.get('vnp_TxnRef')!, ...over };
    const hash = createHmac('sha512', key).update(Buffer.from(canon(p), 'utf-8')).digest('hex');
    return { good: `${canon(p)}&vnp_SecureHashType=SHA512&vnp_SecureHash=${hash}`, forged: `${canon(p)}&vnp_SecureHash=${'0'.repeat(128)}` };
  };
  const root = BASE.replace(/\/v1$/, '') + '/v1';

  section('VNPay — payment URL');
  const a = await start(3);
  if (a.pay.body?.payment?.provider !== 'VNPAY') {
    console.log('   (API is not running with PAYMENT_PROVIDER=VNPAY — suite skipped)');
    if (a.rid) await cust.post(`/reservations/${a.rid}/cancel`, { reason: 'E2E cleanup' });
    process.exit(0);
  }
  check('redirects to the VNPay sandbox payment page', !!a.url && new URL(a.url).host === 'sandbox.vnpayment.vn', a.pay.body);
  const vn = await fetch(a.url!, { redirect: 'manual', headers: { 'user-agent': 'Mozilla/5.0' } });
  check('VNPay sandbox accepts our signed request', vn.status === 302 && /PaymentMethod/.test(vn.headers.get('location') ?? ''), [vn.status, vn.headers.get('location')]);

  section('VNPay — callbacks');
  const q = callbackQuery(a.url!);
  const forged = await fetch(`${root}/payments/vnpay/return?${q.forged}`, { redirect: 'manual' });
  check('forged return is refused (status=INVALID)', forged.status === 302 && /status=INVALID/.test(forged.headers.get('location') ?? ''), forged.headers.get('location'));
  check('forged return confirms nothing', (await status(a.rid)) === 'PENDING_PAYMENT', await status(a.rid));
  const bad = await (await fetch(`${root}/payments/vnpay/ipn?${q.forged}`)).json();
  check('IPN with a bad signature answers 97', bad.RspCode === '97', bad);
  const wrongAmount = callbackQuery(a.url!, { vnp_Amount: '100' });
  const amt = await (await fetch(`${root}/payments/vnpay/ipn?${wrongAmount.good}`)).json();
  check('IPN with a different amount answers 04', amt.RspCode === '04', amt);
  const ok1 = await (await fetch(`${root}/payments/vnpay/ipn?${q.good}`)).json();
  const ok2 = await (await fetch(`${root}/payments/vnpay/ipn?${q.good}`)).json();
  check('genuine IPN confirms (00)', ok1.RspCode === '00', ok1);
  check('IPN replay answers 02 (already confirmed)', ok2.RspCode === '02', ok2);
  await sleep(400);
  check('reservation confirmed once', ['CONFIRMED', 'UNIT_ASSIGNED'].includes(await status(a.rid)), await status(a.rid));
  const back = await fetch(`${root}/payments/vnpay/return?${q.good}`, { redirect: 'manual' });
  check('return lands in the app with status SUCCEEDED', /\/app\/reservations\/.*status=SUCCEEDED/.test(back.headers.get('location') ?? ''), back.headers.get('location'));

  section('VNPay — customer cancels / bank declines');
  const b = await start(4);
  const cancelQ = callbackQuery(b.url!, { vnp_ResponseCode: '24', vnp_TransactionStatus: '02' });
  const cx = await fetch(`${root}/payments/vnpay/return?${cancelQ.good}`, { redirect: 'manual' });
  check('cancel (24) returns status=CANCELLED', /status=CANCELLED/.test(cx.headers.get('location') ?? ''), cx.headers.get('location'));
  check('reservation still waiting for payment', (await status(b.rid)) === 'PENDING_PAYMENT', await status(b.rid));
  const c = await start(5);
  const declined = callbackQuery(c.url!, { vnp_ResponseCode: '51', vnp_TransactionStatus: '02' });
  const dc = await fetch(`${root}/payments/vnpay/return?${declined.good}`, { redirect: 'manual' });
  check('declined (51) returns status=FAILED', /status=FAILED/.test(dc.headers.get('location') ?? ''), dc.headers.get('location'));

  for (const rid of [a.rid, b.rid, c.rid]) await cust.post(`/reservations/${rid}/cancel`, { reason: 'E2E cleanup' });
  process.exit(summary() ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
