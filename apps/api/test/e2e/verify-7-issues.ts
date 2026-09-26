import { createHmac } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Client, check, section, idem, inDays, summary, BASE } from './lib';

function vnpSecret() {
  if (process.env.VNPAY_HASH_SECRET) return process.env.VNPAY_HASH_SECRET;
  const f = join(__dirname, '..', '..', '.env');
  if (existsSync(f)) {
    for (const l of readFileSync(f, 'utf8').split(/\r?\n/)) {
      const m = l.match(/^VNPAY_HASH_SECRET=(.*)$/);
      if (m) return m[1].replace(/^["']|["']$/g, '');
    }
  }
  return '';
}

const canon = (p: Record<string, string>) =>
  Object.keys(p)
    .sort()
    .map((k) => `${k}=${encodeURIComponent(p[k]).replace(/%20/g, '+')}`)
    .join('&');

(async () => {
  const admin = new Client('admin');
  const bom = new Client('bom');
  const fm = new Client('fm');
  const cust = new Client('cust');

  await admin.login('admin@vaultra.test');
  await bom.login('bom@vaultra.test');
  await fm.login('fm.hn@vaultra.test');
  await cust.login('customer@vaultra.test');

  // 1. Issue 4: Province deduplication on /catalog/facilities
  section('Issue 4 — /catalog/facilities province normalization & deduplication');
  const facRes = await cust.get('/catalog/facilities');
  check('GET /catalog/facilities returns 200', facRes.status === 200, facRes);
  const provinces = facRes.body?.provinces ?? [];
  const slugs = provinces.map((p: any) => p.slug);
  const names = provinces.map((p: any) => p.name);
  check(
    'provinces list has unique slugs & names (no duplicate TP. Hồ Chí Minh / Hồ Chí Minh)',
    new Set(slugs).size === slugs.length && new Set(names).size === names.length && !slugs.includes('tp-ho-chi-minh'),
    provinces,
  );
  const hcmFilter = await cust.get('/catalog/facilities?province=ho-chi-minh');
  const hcmProvEntry = provinces.find((p: any) => p.slug === 'ho-chi-minh');
  check(
    'filtering by province=ho-chi-minh returns all HCMC facilities matching province count',
    hcmFilter.status === 200 && hcmFilter.body?.data?.length === hcmProvEntry?.count,
    { filtered: hcmFilter.body?.data?.length, expected: hcmProvEntry?.count },
  );

  // 2. Issue 2: Admin Dashboard removes undemoable anomalies
  section('Issue 2 — GET /admin/dashboard returns 200 with empty anomalies');
  const dash = await admin.get('/admin/dashboard');
  check('GET /admin/dashboard returns 200', dash.status === 200, dash);
  check('dashboard anomalies is empty array', Array.isArray(dash.body?.anomalies) && dash.body.anomalies.length === 0, dash.body?.anomalies);

  // 3. Issue 3: Dynamic RBAC Permission Matrix CRUD + Scope Reallocation + Self-lockout protection
  section('Issue 3 — Dynamic RBAC Permission Matrix (create, conflict, reallocate, enforce, delete)');
  const permList = await admin.get('/admin/permissions');
  check('GET /admin/permissions returns permission rows with grants & isCustom', permList.status === 200 && permList.body.length >= 20, permList.status);

  const testPermCode = 'iot.locker_verify_e2e';
  // Clean up if left from any aborted run
  await admin.del(`/admin/permissions/${testPermCode}?reason=cleanup`);

  const badCreate = await admin.post('/admin/permissions', {
    code: 'INVALID CODE!!',
    module: 'iot',
    description: 'Invalid code format',
  });
  check('POST /admin/permissions rejects invalid code format (400)', badCreate.status === 400, badCreate);

  const nonAdminCreate = await bom.post('/admin/permissions', {
    code: testPermCode,
    module: 'iot',
    description: 'Should fail for non-SYSTEM_ADMIN',
  });
  check('POST /admin/permissions forbids non-SYSTEM_ADMIN (403)', nonAdminCreate.status === 403, nonAdminCreate);

  const createdPerm = await admin.post('/admin/permissions', {
    code: testPermCode,
    module: 'iot',
    description: 'Quản lý cảm biến khóa thông minh IoT',
    grants: {
      FACILITY_MANAGER: { scope: 'FACILITY', readOnly: true },
      SYSTEM_ADMIN: { scope: 'GLOBAL', readOnly: false },
    },
  });
  check('POST /admin/permissions creates custom permission (201)', createdPerm.status === 201 && createdPerm.body?.isCustom === true, createdPerm);

  const dupPerm = await admin.post('/admin/permissions', {
    code: testPermCode,
    module: 'iot',
    description: 'Duplicate permission',
  });
  check('POST /admin/permissions duplicate code returns 409 CONFLICT', dupPerm.status === 409, dupPerm);

  // Verify FM immediately receives read-only FACILITY grant on /me/permissions
  const fmMe1 = await fm.get('/me/permissions');
  check(
    'FM immediately sees custom permission with FACILITY readOnly=true on /me/permissions',
    fmMe1.body?.permissions?.[testPermCode]?.scope === 'FACILITY' && fmMe1.body?.permissions?.[testPermCode]?.readOnly === true,
    fmMe1.body?.permissions?.[testPermCode],
  );

  // Reallocate via PUT /admin/permissions/:code -> upgrade FM to write + grant BOM GLOBAL
  const updatedPerm = await admin.req('PUT', `/admin/permissions/${testPermCode}`, {
    module: 'iot',
    description: 'Quản lý cảm biến khóa thông minh IoT (đã cập nhật)',
    grants: {
      FACILITY_MANAGER: { scope: 'FACILITY', readOnly: false },
      BUSINESS_OPS_MANAGER: { scope: 'GLOBAL', readOnly: false },
      SYSTEM_ADMIN: { scope: 'GLOBAL', readOnly: false },
    },
    reason: 'Kiểm thử phân bổ lại quyền E2E',
  });
  check('PUT /admin/permissions/:code reallocates scopes (200)', updatedPerm.status === 200, updatedPerm);

  const fmMe2 = await fm.get('/me/permissions');
  const bomMe2 = await bom.get('/me/permissions');
  check(
    'FM & BOM immediately receive reallocated grants without DB restart',
    fmMe2.body?.permissions?.[testPermCode]?.scope === 'FACILITY' &&
      !fmMe2.body?.permissions?.[testPermCode]?.readOnly &&
      bomMe2.body?.permissions?.[testPermCode]?.scope === 'GLOBAL',
    { fm: fmMe2.body?.permissions?.[testPermCode], bom: bomMe2.body?.permissions?.[testPermCode] },
  );

  // Self-lockout protection on core permission `role.assign`
  const lockoutAttempt = await admin.req('PUT', '/admin/permissions/role.assign', {
    grants: { SYSTEM_ADMIN: null },
  });
  check('PUT /admin/permissions/role.assign blocks removing SYSTEM_ADMIN GLOBAL access (409/400)', [400, 409, 403].includes(lockoutAttempt.status), lockoutAttempt);

  const coreDeleteAttempt = await admin.del('/admin/permissions/role.assign?reason=test');
  check('DELETE /admin/permissions refuses deleting core architecture permission (409)', coreDeleteAttempt.status === 409, coreDeleteAttempt);

  const delCustom = await admin.del(`/admin/permissions/${testPermCode}?reason=E2E_cleanup`);
  check('DELETE /admin/permissions/:code deletes custom permission cleanly (200)', delCustom.status === 200, delCustom);

  // 4. Issue 6A & 6B: Promotions duplicate code 409 + full facility/fields edit & clear
  section('Issue 6A & 6B — Promotions duplicate code 409 & facility/full-field editing');
  const allFacs = await bom.get('/facilities');
  const firstFacId = allFacs.body?.[0]?.id;
  const secondFacId = allFacs.body?.[1]?.id ?? firstFacId;
  const promoCode = `E2E${String(Date.now()).slice(-6)}`;

  const p1 = await bom.post('/promotions', {
    name: 'Khuyến mãi kiểm thử E2E',
    code: promoCode,
    description: 'Mô tả ban đầu',
    type: 'PERCENT',
    value: 15,
    appliesToPeriods: 1,
    minTermMonths: 1,
    startsAt: new Date().toISOString(),
    endsAt: new Date(Date.now() + 86400_000 * 30).toISOString(),
    facilityIds: [firstFacId],
  });
  check('POST /promotions creates draft promotion with facilityIds (201)', p1.status === 201 && !!p1.body?.id, p1);

  const pDup = await bom.post('/promotions', {
    name: 'Khuyến mãi trùng mã',
    code: promoCode.toLowerCase(),
    type: 'PERCENT',
    value: 10,
    startsAt: new Date().toISOString(),
  });
  check(
    'POST /promotions with duplicate code (case-insensitive) returns 409 CONFLICT with clear Vietnamese message (NOT 500)',
    pDup.status === 409 && /đã tồn tại/i.test(pDup.body?.error?.message ?? ''),
    pDup,
  );

  const promoList1 = await bom.get('/promotions');
  const listedPromo = (promoList1.body ?? []).find((x: any) => x.id === p1.body.id);
  check(
    'GET /promotions returns facilityIds & facilities objects for Edit modal prefill',
    listedPromo?.facilityIds?.[0] === firstFacId && listedPromo?.facilities?.[0]?.id === firstFacId,
    listedPromo,
  );

  // Edit facility to secondFacId and update description/value
  const pEdit1 = await bom.patch(`/promotions/${p1.body.id}`, {
    name: 'Khuyến mãi kiểm thử E2E (Đã sửa)',
    description: 'Mô tả đã cập nhật',
    value: 20,
    facilityIds: [secondFacId],
  });
  check('PATCH /promotions/:id updates facility, name, description, value (200)', pEdit1.status === 200, pEdit1);

  // Clear facility back to system-wide (facilityIds: [])
  const pEditGlobal = await bom.patch(`/promotions/${p1.body.id}`, {
    facilityIds: [],
  });
  const promoList2 = await bom.get('/promotions');
  const listedGlobal = (promoList2.body ?? []).find((x: any) => x.id === p1.body.id);
  check(
    'PATCH /promotions/:id with facilityIds=[] resets scope back to Toàn hệ thống',
    pEditGlobal.status === 200 && (listedGlobal?.facilityIds?.length ?? 0) === 0,
    listedGlobal,
  );

  // Delete draft promo and verify code can be reused without 500/409
  const pDel = await bom.del(`/promotions/${p1.body.id}`);
  check('DELETE /promotions/:id soft-deletes draft & frees promo code (200)', pDel.status === 200, pDel);

  const pReuse = await bom.post('/promotions', {
    name: 'Khuyến mãi tái sử dụng mã sau xóa',
    code: promoCode,
    type: 'PERCENT',
    value: 10,
    startsAt: new Date().toISOString(),
  });
  check('Promo code can be reused cleanly after soft-deleting draft (201)', pReuse.status === 201, pReuse);
  if (pReuse.body?.id) await bom.del(`/promotions/${pReuse.body.id}`);

  // 5. Issue 7: Booking Step 6 VNPay return (returnPath=/book?reservationId=...&step=5, tunnel URL, unit_type details, alreadyPaid idempotency)
  section('Issue 7 — Booking wizard VNPay return, unit_type enrichment & alreadyPaid handling');
  const facSlug = facRes.body.data[0].slug;
  const facDetail = await cust.get(`/catalog/facilities/${facSlug}`);
  const availUt = [...facDetail.body.unitTypes].sort((a: any, b: any) => b.available - a.available)[0];
  const qRes = await cust.post('/quotes', {
    unitTypeId: availUt.id,
    startDate: inDays(5),
    termMonths: 3,
    billingMode: 'MONTHLY',
  });
  const createdRes = await cust.post(
    '/reservations',
    { quoteId: qRes.body.id, paymentChoice: 'ONLINE' },
    { 'idempotency-key': idem() },
  );
  const rid = createdRes.body?.reservation?.public_id ?? createdRes.body?.reservation?.id;
  check('Created test reservation for Step 6 flow', createdRes.status === 201 && !!rid, createdRes);

  // Initiate payment with forwarded tunnel headers & origin https://vaultra-844.pages.dev
  const payInit = await cust.post(
    `/reservations/${rid}/pay`,
    { returnPath: `/book?reservationId=${rid}&step=5` },
    {
      'idempotency-key': idem(),
      origin: 'https://vaultra-844.pages.dev',
      'x-forwarded-proto': 'https',
      'x-forwarded-host': 'processing-federal-junior-volunteers.trycloudflare.com',
    },
  );
  check('POST /reservations/:id/pay returns redirectUrl', payInit.status === 201 && !!payInit.body?.redirectUrl, payInit);

  const vnpUrl = new URL(payInit.body.redirectUrl);
  const vnpReturnParam = vnpUrl.searchParams.get('vnp_ReturnUrl') ?? '';
  check(
    'VNPay vnp_ReturnUrl uses active HTTPS tunnel URL instead of dead localhost',
    vnpReturnParam.startsWith('https://processing-federal-junior-volunteers.trycloudflare.com/v1/payments/vnpay/return'),
    vnpReturnParam,
  );

  // Simulate signed VNPay browser return BEFORE IPN arrives (just like real user redirect when localhost IPN couldn't be reached!)
  const key = vnpSecret();
  const cbParams: Record<string, string> = {
    vnp_Amount: vnpUrl.searchParams.get('vnp_Amount')!,
    vnp_BankCode: 'NCB',
    vnp_CardType: 'ATM',
    vnp_OrderInfo: vnpUrl.searchParams.get('vnp_OrderInfo')!,
    vnp_PayDate: '20261111132000',
    vnp_ResponseCode: '00',
    vnp_TmnCode: vnpUrl.searchParams.get('vnp_TmnCode')!,
    vnp_TransactionNo: '9' + String(Date.now()).slice(-9),
    vnp_TransactionStatus: '00',
    vnp_TxnRef: vnpUrl.searchParams.get('vnp_TxnRef')!,
  };
  const qs = canon(cbParams);
  const sig = createHmac('sha512', key).update(Buffer.from(qs, 'utf-8')).digest('hex');
  const rootV1 = BASE.replace(/\/v1$/, '') + '/v1';
  const retRes = await fetch(`${rootV1}/payments/vnpay/return?${qs}&vnp_SecureHashType=SHA512&vnp_SecureHash=${sig}`, {
    redirect: 'manual',
  });
  const redirectLoc = retRes.headers.get('location') ?? '';
  check(
    'VNPay /return redirects back to https://vaultra-844.pages.dev/book?reservationId=...&step=5&...&status=SUCCEEDED',
    retRes.status === 302 &&
      redirectLoc.startsWith(`https://vaultra-844.pages.dev/book?reservationId=${rid}&step=5`) &&
      redirectLoc.includes('status=SUCCEEDED'),
    redirectLoc,
  );

  // Verify GET /reservations/:id returns confirmed status AND full unit_type dimensions/price so Step 6 right column renders immediately!
  const afterPayDetail = await cust.get(`/reservations/${rid}`);
  check(
    'GET /reservations/:id returns paid/confirmed reservation with code & full unit_type details',
    afterPayDetail.status === 200 &&
      ['CONFIRMED', 'UNIT_ASSIGNED', 'MOVE_IN_SCHEDULED'].includes(afterPayDetail.body?.status) &&
      Boolean(afterPayDetail.body?.code) &&
      afterPayDetail.body?.unit_type?.width_m != null &&
      afterPayDetail.body?.unit_type?.online_price != null,
    {
      status: afterPayDetail.body?.status,
      code: afterPayDetail.body?.code,
      unit_type: afterPayDetail.body?.unit_type,
    },
  );

  // Verify calling POST /reservations/:id/pay AGAIN on an already-paid reservation returns { alreadyPaid: true } instead of 404!
  const payAgain = await cust.post(
    `/reservations/${rid}/pay`,
    { returnPath: `/book?reservationId=${rid}&step=5` },
    { 'idempotency-key': idem() },
  );
  check(
    'POST /reservations/:id/pay on already-paid reservation returns 201 { alreadyPaid: true } instead of 404 error',
    [200, 201].includes(payAgain.status) && payAgain.body?.alreadyPaid === true,
    payAgain,
  );

  // Cleanup test reservation
  await cust.post(`/reservations/${rid}/cancel`, { reason: 'E2E cleanup after verification' });

  // Also verify public Cloudflare tunnel + R2 origin config end-to-end
  section('Live Cloudflare Tunnel & R2 Origin Verification');
  const r2OriginRes = await fetch('https://pub-f7f8d059b55647939fcb0a260339fde0.r2.dev/_config/backend-origin.json?t=' + Date.now());
  const r2OriginJson: any = await r2OriginRes.json();
  check('R2 _config/backend-origin.json points to active HTTPS tunnel', r2OriginRes.status === 200 && r2OriginJson?.origin?.startsWith('https://'), r2OriginJson);

  const tunnelFac = await fetch(`${r2OriginJson.origin}/v1/catalog/facilities`);
  const tunnelFacBody: any = await tunnelFac.json();
  check(
    'Live HTTPS tunnel serves /v1/catalog/facilities with deduplicated provinces',
    tunnelFac.status === 200 &&
      new Set((tunnelFacBody?.provinces ?? []).map((p: any) => p.slug)).size === (tunnelFacBody?.provinces ?? []).length,
    tunnelFacBody?.provinces,
  );

  // Wait 2.5s so R2 database snapshot flushes clean state
  await new Promise((r) => setTimeout(r, 2500));

  process.exit(summary() ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

function reconcileTenantSupportTicketAdminLedgerItems(
  lines: readonly { creditVnd: number; debitVnd: number }[],
): { totalCredit: number; totalDebit: number; balanceVnd: number } {
  let totalCredit = 0;
  let totalDebit = 0;
  for (const row of lines) {
    if (Number.isFinite(row.creditVnd)) totalCredit += row.creditVnd;
    if (Number.isFinite(row.debitVnd)) totalDebit += row.debitVnd;
  }
  return { totalCredit, totalDebit, balanceVnd: totalCredit - totalDebit };
}

const TENANT_INDEXED_SIGNATURE_COLUMNS = [
  'depositHeldVnd',
  'balanceDueVnd',
] as const;
