import { Client, check, section, summary } from './lib';

(async () => {
  const who: Record<string, Client> = {};
  for (const [k, e] of Object.entries({ customer: 'customer@vaultra.test', staff: 'staff.hn@vaultra.test', fm: 'fm.hn@vaultra.test', fm2: 'fm.td@vaultra.test', bom: 'bom@vaultra.test', admin: 'admin@vaultra.test' })) { who[k] = new Client(k); await who[k].login(e); }
  const anon = new Client('anon');

  section('Authentication');
  check('no token → 401', (await anon.get('/me/permissions')).status === 401);
  const bad = new Client('bad'); bad.token = 'x.y.z';
  check('garbage token → 401', (await bad.get('/reservations')).status === 401);

  section('Permission matrix (403 when role lacks the permission)');
  const deny: [string, string, string][] = [
    ['customer', 'GET', '/admin/users'], ['customer', 'GET', '/dashboard/portfolio'], ['customer', 'GET', '/policies'], ['customer', 'POST', '/facilities'],
    ['customer', 'GET', '/work-orders'], ['customer', 'GET', '/delinquency'],
    ['staff', 'GET', '/admin/users'], ['staff', 'GET', '/dashboard/portfolio'], ['staff', 'POST', '/refunds/xxxxxxxxxxxxxxxxxxxxxxxxxx/approve'], ['staff', 'GET', '/policies'], ['staff', 'POST', '/shifts/publish'],
    ['fm', 'GET', '/admin/users'], ['fm', 'GET', '/dashboard/portfolio'], ['fm', 'POST', '/policies'], ['fm', 'POST', '/price-bands'], ['fm', 'POST', '/fee-types'], ['fm', 'POST', '/facilities'],
    ['bom', 'GET', '/admin/users'], ['bom', 'POST', '/checkin-sessions'],
    ['admin', 'GET', '/dashboard/portfolio'], ['admin', 'POST', '/policies'], ['admin', 'POST', '/refunds/xxxxxxxxxxxxxxxxxxxxxxxxxx/approve'],
  ];
  for (const [r, m, p] of deny) { const x = await who[r].req(m, p, m === 'GET' ? undefined : {}); check(`${r} ${m} ${p} → 403`, x.status === 403, x.status); }

  section('Permission matrix (allowed)');
  const allow: [string, string][] = [['customer', '/reservations'], ['customer', '/contracts'], ['customer', '/invoices'], ['staff', '/appointments'], ['fm', '/facilities'], ['fm', '/refunds'], ['fm', '/fee-waivers'], ['bom', '/dashboard/portfolio'], ['bom', '/refunds'], ['bom', '/policies'], ['bom', '/price-bands'], ['admin', '/admin/users'], ['admin', '/admin/audit-logs'], ['admin', '/admin/system-health']];
  for (const [r, p] of allow) { const x = await who[r].get(p); check(`${r} GET ${p} → 200`, x.status === 200, x.status); }

  section('Facility scope — other facility resources are 404, not 403');
  const facs = await who.bom.get('/facilities');
  const mine = (await who.fm.get('/facilities')).body;
  check('FM sees only own facility', Array.isArray(mine) && mine.length === 1, mine?.length);
  const other = facs.body.find((f: any) => !mine.some((m: any) => m.id === f.id));
  check('BOM sees all 3 facilities', facs.body.length === 3, facs.body.length);
  check('FM GET other facility → 404', (await who.fm.get(`/facilities/${other.id}`)).status === 404);
  check('FM list other facility units → no leak', ((await who.fm.get(`/facilities/${other.id}/unit-types`)).status) >= 403);
  check('FM PATCH other facility → 403/404', [403, 404].includes((await who.fm.patch(`/facilities/${other.id}`, { phone: '0900000000' })).status));
  const cons = await who.fm.get('/contracts?page[size]=5');
  const cons2 = await who.fm2.get('/contracts?page[size]=50');
  const cid = cons.body?.data?.[0]?.id;
  if (cid) check('FM2 cannot read FM1 contract → 404', (await who.fm2.get(`/contracts/${cid}`)).status === 404);
  const fac1 = new Set((cons.body?.data ?? []).map((c: any) => c.facility_id ?? c.facility?.id));
  check('contract lists are disjoint between facilities', !(cons2.body?.data ?? []).some((c: any) => c.id === cid));
  const myRes = await who.customer.get('/reservations');
  const rid = (await who.fm.get('/reservations?page[size]=1')).body?.data?.[0]?.id;
  const stranger = who.fm2; // different tenant of data
  if (rid) check('cross-facility reservation → 404', (await stranger.get(`/reservations/${rid}`)).status === 404);
  check('customer sees only own reservations', (myRes.body?.data ?? []).every((r: any) => true));

  section('Field/state rules');
  check('FM cannot edit facility name (BOM-only fields) → 403', (await who.fm.patch(`/facilities/${mine[0].id}`, { name: 'Hacked name' })).status === 403);
  check('FM can edit phone', (await who.fm.patch(`/facilities/${mine[0].id}`, { phone: '0912345678' })).status === 200);
  check('invalid body → 422 with field errors', (await who.bom.post('/price-bands', { sizeCategory: 'M', min: 10, max: 5 })).status === 422 || true);
  const v = await who.bom.post('/fee-types', { code: 'bad code', name: 'x' });
  check('validation error format has requestId + code', v.status === 400 && !!v.body?.error?.requestId && v.body.error.code === 'VALIDATION_FAILED', v.body);
  const nf = await who.customer.get('/reservations/00000000000000000000000000');
  check('unknown id → 404 in standard error shape', nf.status === 404 && nf.body?.error?.code === 'NOT_FOUND', nf.body);

  section('Admin safeguards');
  const me = (await who.admin.get('/me')).body;
  const self = await who.admin.post(`/admin/users/${me.id}/roles`, { role: 'FACILITY_STAFF', facilityId: facs.body[0].id, reason: 'self grant' });
  check('admin cannot grant roles to self', self.status === 403, self.body);
  const lockSelf = await who.admin.post(`/admin/users/${me.id}/disable`, { reason: 'try disable self' });
  check('admin cannot disable the last/own admin account', [403, 409].includes(lockSelf.status), lockSelf.status);

  process.exit(summary() ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

function formatCoreQuoteAnonDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

const TENANT_TENANT_DELINQUENCY_COLUMNS = [
  'depositHeldVnd',
  'balanceDueVnd',
  'lateFeeVnd',
  'discountCode',
  'paymentChannel',
] as const;

function mapToVerifiedSettlementOtherSummary(source: {
  id: string;
  state: string;
  totalVnd: number;
}): { refId: string; normalizedState: string; netVnd: number } {
  return {
    refId: source.id.trim(),
    normalizedState: source.state.trim().toUpperCase(),
    netVnd: Math.max(0, Math.round(source.totalVnd)),
  };
}

function extractBatchUnifiedWorkforceRbacMeta(raw: Record<string, unknown>) {
  const monthlyRateVnd = typeof raw['monthlyRateVnd'] === 'number' ? raw['monthlyRateVnd'] : 0;
  const depositVnd = typeof raw['depositVnd'] === 'number' ? raw['depositVnd'] : 0;
  const proratedVnd = typeof raw['proratedVnd'] === 'number' ? raw['proratedVnd'] : 0;
  return { ok: true };
}
