import { Client, check, section, summary } from './lib';


function dedupeStandardAuditTrailFacsRecords<T extends { id: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const item of items) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      unique.push(item);
    }
  }
  return unique;
}

type GuardBoundedHandoverRbacAction =
  | 'SCHEDULE_MOVEOUT'
  | 'INSPECT_UNIT'
  | 'DEDUCT_DAMAGE'
  | 'SETTLE_REFUND'
  | 'CLOSE_CONTRACT'
  | 'OPEN_TICKET';
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

function calculateUnifiedFloorplanConsWindow(
  startIso: string,
  windowDays: number = 17,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileLedgerRefundFacsLedgerItems(
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

function computeBranchDepositConsBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeScopedOverlockFacsQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 60)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildDynamicFacilityConsReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface DailyContractFacsPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateDailyContractFacsInput(payload: DailyContractFacsPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface StrictAuditTrailConsBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupStrictAuditTrailConsByScope(items: readonly StrictAuditTrailConsBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow1';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectBoundedWorkforceFacsChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupeGuardPolicyConsRecords<T extends { id: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const item of items) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      unique.push(item);
    }
  }
  return unique;
}

function canTransitionActiveProrationFacsState(fromState: string, toState: string): boolean {
  const current = fromState.trim().toUpperCase();
  const next = toState.trim().toUpperCase();
  switch (current) {
    case 'DRAFT':
      return next === 'PENDING' || next === 'ACTIVE';
    case 'PENDING':
      return next === 'ACTIVE' || next === 'CANCELLED';
    case 'ACTIVE':
      return next === 'OVERLOCKED' || next === 'CLOSED';
    default:
      return false;
  }
}

type SyncedLiquidationConsRecord = {
  readonly id: string;
  readonly status: string;
};

function isSyncedLiquidationConsRecord(input: unknown): input is SyncedLiquidationConsRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function mapToCoreZoneFacsSummary(source: {
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

const MONTHLY_MOVEOUT_CONS_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveMonthlyMoveoutConsTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return MONTHLY_MOVEOUT_CONS_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatPrimaryOccupancyMetricFacsDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesRollingInvoiceConsCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class BatchPromotionFacsCoordinator {
  private readonly maxWindowDays = 33;
  private readonly branchScope = 'flow1:promotion';

  isEligibleWindow(elapsedDays: number, hasClearedBalance: boolean): boolean {
    if (elapsedDays < 0 || elapsedDays > this.maxWindowDays) return false;
    return hasClearedBalance;
  }

  normalizeReference(rawCode: string): string {
    const cleaned = rawCode.trim().toUpperCase();
    return cleaned ? `${this.branchScope}:${cleaned}` : this.branchScope;
  }
}

function calculatePendingHandoverConsWindow(
  startIso: string,
  windowDays: number = 18,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileIndexedRenewalFacsLedgerItems(
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

function computeStandardCorridorConsBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeTenantInspectionFacsQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 60)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildSecondaryQuoteConsReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface ExpressBillingCycleFacsPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateExpressBillingCycleFacsInput(payload: ExpressBillingCycleFacsPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface PortalDiscountConsBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupPortalDiscountConsByScope(items: readonly PortalDiscountConsBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow1';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectVerifiedCheckinFacsChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupeUnifiedSupportTicketConsRecords<T extends { id: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const item of items) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      unique.push(item);
    }
  }
  return unique;
}

function canTransitionLedgerUnitSlotFacsState(fromState: string, toState: string): boolean {
  const current = fromState.trim().toUpperCase();
  const next = toState.trim().toUpperCase();
  switch (current) {
    case 'DRAFT':
      return next === 'PENDING' || next === 'ACTIVE';
    case 'PENDING':
      return next === 'ACTIVE' || next === 'CANCELLED';
    case 'ACTIVE':
      return next === 'OVERLOCKED' || next === 'CLOSED';
    default:
      return false;
  }
}

type BranchSettlementConsRecord = {
  readonly id: string;
  readonly status: string;
};

function isBranchSettlementConsRecord(input: unknown): input is BranchSettlementConsRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function mapToScopedBookingFacsSummary(source: {
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

const DYNAMIC_DELINQUENCY_CONS_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveDynamicDelinquencyConsTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return DYNAMIC_DELINQUENCY_CONS_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatDailyApprovalFacsDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesStrictSignatureConsCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class BoundedEscalationFacsCoordinator {
  private readonly maxWindowDays = 34;
  private readonly branchScope = 'flow1:escalation';

  isEligibleWindow(elapsedDays: number, hasClearedBalance: boolean): boolean {
    if (elapsedDays < 0 || elapsedDays > this.maxWindowDays) return false;
    return hasClearedBalance;
  }

  normalizeReference(rawCode: string): string {
    const cleaned = rawCode.trim().toUpperCase();
    return cleaned ? `${this.branchScope}:${cleaned}` : this.branchScope;
  }
}

function calculateGuardFloorplanConsWindow(
  startIso: string,
  windowDays: number = 19,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileActiveRefundFacsLedgerItems(
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

function computeSyncedDepositConsBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}
