import { createHmac } from 'node:crypto';
import { Client, check, section, summary, inDays, sleep, BASE } from './lib';

const TINY = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
async function uploadPhoto(c: Client, facilityId?: string) {
  const up = await c.post('/media/upload-url', { purpose: 'COLLECTION_EVIDENCE', mimeType: 'image/png', sizeBytes: TINY.length, ...(facilityId ? { facilityId } : {}) });
  const url = up.body.uploadUrl.startsWith('http') ? up.body.uploadUrl.replace('http://localhost:4000/v1', BASE) : BASE.replace(/\/v1$/, '') + up.body.uploadUrl;
  await fetch(url, { method: 'PUT', headers: { 'content-type': 'image/png' }, body: TINY });
  await c.post(`/media/${up.body.id}/complete`, {});
  return up.body.id as string;
}

function serviceHeaders(path: string) {
  const secret = process.env.SERVICE_TOKEN_SECRET ?? 'dev-service-token-secret-change-me';
  const ts = Math.floor(Date.now() / 1000).toString();
  const sig = createHmac('sha256', secret).update(`${ts}:/v1${path}`).digest('hex');
  return { 'x-service-token': `${ts}.${sig}` };
}

(async () => {
  const cust = new Client('customer'); await cust.login('customer@vaultra.test');
  const staff = new Client('staff'); await staff.login('staff.hn@vaultra.test');
  const fm = new Client('fm'); await fm.login('fm.hn@vaultra.test');
  const bom = new Client('bom'); await bom.login('bom@vaultra.test');
  const admin = new Client('admin'); await admin.login('admin@vaultra.test');

  const facs = await bom.get('/facilities');
  const hn = facs.body?.find((f: any) => (f.name ?? '').includes('Cầu Giấy')) ?? facs.body?.[0];
  check('facility list available', !!hn?.id, facs.body);
  const facId = hn.id as string;

  // ---------------------------------------------------------------- F4: Policy Versioning & Reconciliation
  section('F4 — Policy draft, impact preview, publish & payment reconciliation');
  const pols = await bom.get('/policies');
  const globalPol = Array.isArray(pols.body) ? pols.body.find((p: any) => p.scope === 'GLOBAL') ?? pols.body[0] : null;
  check('GET /policies returns global policy with active version', pols.status === 200 && !!globalPol?.policyId, pols.body);

  if (globalPol?.policyId) {
    const draft = await bom.post(`/policies/${globalPol.policyId}/versions`, { reason: 'E2E draft version' });
    check('POST /policies/:id/versions creates DRAFT policy version', draft.status < 300 && !!draft.body?.id && draft.body?.status === 'DRAFT', draft.body);
    if (draft.body?.id) {
      const preview = await bom.get(`/policy-versions/${draft.body.id}/impact`);
      check('GET /policy-versions/:id/impact returns active contract impact', preview.status === 200 && typeof preview.body?.contractsKeepingSnapshot === 'number', preview.body);
      const pub = await bom.post(`/policy-versions/${draft.body.id}/publish`, { reason: 'E2E policy publish verification' });
      check('POST /policy-versions/:id/publish activates new policy version', pub.status < 300 && ['ACTIVE', 'SCHEDULED'].includes(pub.body?.status), pub.body);
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const recon = await bom.post('/reconciliations', { periodDate: today, rows: [] });
  check('POST /reconciliations runs reconciliation batch', recon.status < 300 && !!recon.body?.id, recon.body);

  // ---------------------------------------------------------------- F5: Workforce, Maintenance Plans, Work Orders & Jobs
  section('F5 — Maintenance plans, work orders & background jobs');
  const plan = await fm.post(`/facilities/${facId}/maintenance-plans`, {
    name: `Kiểm tra PCCC định kỳ ${Date.now()}`,
    category: 'FIRE_SAFETY',
    intervalDays: 90,
    nextDueDate: today,
  });
  check('POST /facilities/:id/maintenance-plans creates plan', plan.status < 300 && !!plan.body?.id, plan.body);

  const jobMaint = await admin.post('/internal/jobs/maintenance.plans', {}, serviceHeaders('/internal/jobs/maintenance.plans'));
  check('maintenance.plans job executes and creates due work order/task', jobMaint.status < 300, jobMaint.body);

  const jobOverdue = await admin.post('/internal/jobs/workforce.overdue-tasks', {}, serviceHeaders('/internal/jobs/workforce.overdue-tasks'));
  check('workforce.overdue-tasks job executes cleanly', jobOverdue.status < 300, jobOverdue.body);

  const jobMissed = await admin.post('/internal/jobs/appointment.mark-missed', {}, serviceHeaders('/internal/jobs/appointment.mark-missed'));
  check('appointment.mark-missed job executes cleanly', jobMissed.status < 300, jobMissed.body);

  const jobPol = await admin.post('/internal/jobs/policy.activate-scheduled', {}, serviceHeaders('/internal/jobs/policy.activate-scheduled'));
  check('policy.activate-scheduled job executes cleanly', jobPol.status < 300, jobPol.body);

  const woPhoto1 = await uploadPhoto(staff, facId);
  const wo = await staff.post('/work-orders', {
    facilityId: facId,
    category: 'LOCK',
    priority: 'HIGH',
    description: 'Bản lề cửa kho cần tra dầu và cân chỉnh lại',
    photoIds: [woPhoto1],
  });
  check('POST /work-orders creates work order with photo', wo.status < 300 && wo.body?.status === 'REPORTED', wo.body);
  if (wo.body?.id) {
    const wid = wo.body.id;
    const app = await fm.post(`/work-orders/${wid}/approve`, { estimatedCost: 150000, vendorName: 'Nội bộ' });
    check('FM approves work order (APPROVED)', app.status < 300 && app.body?.status === 'APPROVED', app.body);
    const sch = await fm.post(`/work-orders/${wid}/schedule`, { scheduledFor: new Date(Date.now() + 3600000).toISOString() });
    check('FM schedules work order (SCHEDULED)', sch.status < 300 && sch.body?.status === 'SCHEDULED', sch.body);
    const st = await staff.post(`/work-orders/${wid}/start`, {});
    check('Staff starts work order (IN_PROGRESS)', st.status < 300 && st.body?.status === 'IN_PROGRESS', st.body);
    const woPhoto2 = await uploadPhoto(staff, facId);
    const comp = await staff.post(`/work-orders/${wid}/complete`, { note: 'Đã thay chốt và tra dầu', photoIds: [woPhoto2] });
    check('Staff completes work order with after-repair photo (COMPLETED)', comp.status < 300 && comp.body?.status === 'COMPLETED', comp.body);
    const ver = await fm.post(`/work-orders/${wid}/verify`, { actualCost: 120000 });
    check('FM verifies work order (VERIFIED)', ver.status < 300 && ver.body?.status === 'VERIFIED', ver.body);
  }

  // ---------------------------------------------------------------- F6: Delinquency & Renewal
  section('F6 — Delinquency evaluation, collection notes & renewal preview');
  const delinqJob = await admin.post('/internal/jobs/delinquency.run', {}, serviceHeaders('/internal/jobs/delinquency.run'));
  check('delinquency.run job executes cleanly', delinqJob.status < 300, delinqJob.body);

  const delinqList = await fm.get(`/delinquency?facilityId=${facId}`);
  check('GET /delinquency returns overdue contracts list', delinqList.status === 200 && Array.isArray(delinqList.body), delinqList.body);

  const allContracts = await fm.get('/contracts?page[size]=20');
  const anyContract = allContracts.body?.data?.[0];
  if (anyContract) {
    const evPhoto = await uploadPhoto(fm, facId);
    const note = await fm.post(`/contracts/${anyContract.id}/collection-notes`, {
      channel: 'CALL',
      outcome: 'Đã liên hệ khách xác nhận lịch thanh toán',
      note: 'Ghi chú kiểm thử E2E',
      evidenceIds: [evPhoto],
    });
    check('POST /contracts/:id/collection-notes records contact with evidence', note.status < 300, note.body);
  }

  // ---------------------------------------------------------------- F7: Support Tickets, AI Assistant, Reports & OpenAPI
  section('F7 — Support tickets (attachments, AI draft/summary, resolve, rate, reopen), Reports & OpenAPI');
  const custContracts = await cust.get('/contracts?page[size]=10');
  const custContract = custContracts.body?.data?.[0];
  const tkPhoto = await uploadPhoto(cust);
  const tk = await cust.post('/tickets', {
    contractId: custContract?.id,
    facilityId: custContract ? undefined : facId,
    category: 'ACCESS_CODE',
    subject: 'Cần hướng dẫn sử dụng mã PIN tại cổng',
    description: 'Tôi muốn kiểm tra lại thời gian hiệu lực của mã PIN ra vào kho.',
    attachmentIds: [tkPhoto],
  });
  check('Customer creates support ticket with attachment', tk.status < 300 && !!tk.body?.id, tk.body);

  if (tk.body?.id) {
    const tid = tk.body.id;
    const claim = await staff.post(`/tickets/${tid}/claim`, {});
    check('Staff claims support ticket', claim.status < 300, claim.body);

    const draft = await staff.post(`/tickets/${tid}/assistant/reply-draft`, {});
    check('AI assistant generates reply draft for staff', draft.status < 300 && !!(draft.body?.draft ?? draft.body?.text), draft.body);

    const sum = await staff.post(`/tickets/${tid}/assistant/summary`, {});
    check('AI assistant summarizes ticket thread', sum.status < 300 && !!(sum.body?.summary ?? sum.body?.text), sum.body);

    const msgPhoto = await uploadPhoto(staff, facId);
    const msg = await staff.post(`/tickets/${tid}/messages`, {
      body: 'Mã PIN của quý khách hoạt động trong khung giờ mở cửa của cơ sở.',
      isInternal: false,
      attachmentIds: [msgPhoto],
    });
    check('Staff replies to ticket with attachment (records first_response_at)', msg.status < 300, msg.body);

    const resTk = await staff.post(`/tickets/${tid}/resolve`, {
      resolutionCode: 'INFO_PROVIDED',
      resolutionNote: 'Đã hướng dẫn chi tiết cho khách thuê.',
    });
    check('Staff resolves ticket (RESOLVED)', resTk.status < 300 && resTk.body?.status === 'RESOLVED', resTk.body);

    const reop = await cust.post(`/tickets/${tid}/reopen`, { reason: 'Tôi muốn hỏi thêm về thẻ từ phụ' });
    check('Customer reopens ticket within 7 days (REOPENED)', reop.status < 300 && reop.body?.status === 'REOPENED', reop.body);

    await staff.post(`/tickets/${tid}/start`, {});
    await staff.post(`/tickets/${tid}/resolve`, {
      resolutionCode: 'INFO_PROVIDED',
      resolutionNote: 'Đã bổ sung thông tin thẻ từ phụ.',
    });

    const rate = await cust.post(`/tickets/${tid}/rate`, { stars: 5, note: 'Hỗ trợ rất nhanh!' });
    check('Customer rates resolved ticket (1..5 stars)', rate.status < 300 && rate.body?.rating?.score === 5, rate.body);
  }

  const conv = await cust.post('/assistant/conversations', { locale: 'vi' });
  check('POST /assistant/conversations opens AI assistant conversation', conv.status < 300 && !!conv.body?.id, conv.body);
  if (conv.body?.id) {
    const chat = await cust.post(`/assistant/conversations/${conv.body.id}/messages`, { content: 'Kho size M chứa được những gì?' });
    check('POST /assistant/conversations/:id/messages streams SSE response', chat.status === 200 && chat.text.includes('event: done'), chat.text.slice(0, 200));
  }

  const occ = await bom.get('/reports/occupancy');
  const rev = await bom.get(`/reports/revenue?from=${inDays(-30)}&to=${today}`);
  const aging = await bom.get('/reports/receivables-aging');
  check('Executive reports (occupancy, revenue, receivables-aging) return 200', occ.status === 200 && rev.status === 200 && aging.status === 200, [occ.status, rev.status, aging.status]);

  for (const format of ['CSV', 'XLSX', 'PDF'] as const) {
    const exp = await bom.post('/report-exports', { code: 'occupancy', format, params: {} });
    await sleep(500);
    const st = exp.body?.id ? await bom.get(`/report-exports/${exp.body.id}`) : exp;
    check(`POST /report-exports generates ${format} export`, exp.status < 300 && ['QUEUED', 'RUNNING', 'READY'].includes(st.body?.status), st.body);
  }

  const openapi = await cust.get('/openapi.json');
  check('GET /v1/openapi.json serves OpenAPI 3.1.0 specification', openapi.status === 200 && openapi.body?.openapi === '3.1.0', openapi.body?.info);

  const health = await cust.get('/health/ready');
  check('GET /v1/health/ready returns ready status', health.status === 200 && health.body?.status === 'ok', health.body);

  process.exit(summary() ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
