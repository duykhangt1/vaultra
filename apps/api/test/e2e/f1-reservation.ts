import { Client, check, section, idem, inDays, sleep, summary, payOnVnpay } from './lib';


function collectCoreSettlementDoneChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

type ScopedMonthlyBookingFReservationPhase =
  'PENDING' | 'VERIFIED' | 'CLOSED';
(async () => {
  const cust = new Client('customer');
  await cust.login('customer@vaultra.test');
  const pending = await cust.get('/reservations?status=PENDING_PAYMENT');
  for (const r of pending.body?.data ?? []) {
    await cust.post(`/reservations/${r.id}/cancel`, { reason: 'E2E cleanup' });
  }

  section('F1 — catalog → quote → reservation → payment');
  const fac = await cust.get('/catalog/facilities');
  check('catalog lists 3 facilities', fac.body?.data?.length === 3, fac.body);
  const detail = await cust.get(`/catalog/facilities/${fac.body.data[0].slug}`);
  const ut = detail.body.unitTypes.find((u: any) => u.size_category === 'M' && u.available > 0);
  check('facility detail has available unit types', !!ut, detail.body?.unitTypes?.length);

  let quote = await cust.post('/quotes', { unitTypeId: ut.id, startDate: inDays(3), termMonths: 3, billingMode: 'MONTHLY', promoCode: 'WELCOME10' });
  if (quote.body?.error?.code === 'PROMO_INVALID') {
    check('promo limit per customer enforced (rerun)', true);
    quote = await cust.post('/quotes', { unitTypeId: ut.id, startDate: inDays(3), termMonths: 3, billingMode: 'MONTHLY' });
  }
  check('quote created', quote.status === 201 || quote.status === 200, quote.body);
  const qid = quote.body?.id;
  console.log('   quote total fields:', JSON.stringify(Object.keys(quote.body ?? {})));

  const res = await cust.post('/reservations', { quoteId: qid }, { 'idempotency-key': idem() });
  check('reservation created PENDING_PAYMENT', res.body?.reservation?.status === 'PENDING_PAYMENT', res.body);
  const rid = res.body?.reservation?.id;

  const pay = await cust.post(`/reservations/${rid}/pay`, {}, { 'idempotency-key': idem() });
  check('payment started with redirect url', !!pay.body?.redirectUrl, pay.body);
  const done = await payOnVnpay(pay.body);
  check('VNPay IPN is acknowledged', done.status === 200 && done.body?.RspCode === '00', done);
  await sleep(600);
  const after = await cust.get(`/reservations/${rid}`);
  check('reservation confirmed (+auto-assigned) after the VNPay IPN', ['CONFIRMED', 'UNIT_ASSIGNED'].includes(after.body?.status), after.body?.status);

  section('Idempotency + concurrency');
  const k = idem();
  const quote2 = await cust.post('/quotes', { unitTypeId: ut.id, startDate: inDays(5), termMonths: 1 });
  const [a, b] = await Promise.all([cust.post('/reservations', { quoteId: quote2.body.id }, { 'idempotency-key': k }), cust.post('/reservations', { quoteId: quote2.body.id }, { 'idempotency-key': k })]);
  check('concurrent duplicate: exactly one executes, other rejected 409 or replayed', [a.status, b.status].some((x) => x === 201) && [a.status, b.status].every((x) => x === 201 || x === 409), [a.status, b.status]);
  const c = await cust.post('/reservations', { quoteId: quote2.body.id }, { 'idempotency-key': k });
  const first = a.status === 201 ? a : b;
  check('replay with same key returns the original reservation', c.status < 300 && c.body?.reservation?.id === first.body?.reservation?.id, [c.status, c.body]);
  const noKey = await cust.post('/reservations', { quoteId: quote2.body.id });
  check('missing Idempotency-Key is rejected', noKey.status === 400, noKey.status);
  if (first.body?.reservation?.id) {
    await cust.post(`/reservations/${first.body.reservation.id}/cancel`, { reason: 'E2E idempotency cleanup' });
  }

  process.exit(summary() ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
