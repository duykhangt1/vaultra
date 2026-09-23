/**
 * Source of truth for the permission matrix (spec §5.2 + §22.6).
 * Seeded into roles / permissions / role_permissions and used by the frontend (useCan).
 */
export const ROLES = [
  'CUSTOMER',
  'FACILITY_STAFF',
  'FACILITY_MANAGER',
  'BUSINESS_OPS_MANAGER',
  'SYSTEM_ADMIN',
] as const;
export type RoleCode = (typeof ROLES)[number];

export const ROLE_META: Record<RoleCode, { name: string; nameEn: string; facilityScoped: boolean; workspace: string; rank: number }> = {
  CUSTOMER: { name: 'Khách thuê kho', nameEn: 'Storage Customer', facilityScoped: false, workspace: '/app', rank: 1 },
  FACILITY_STAFF: { name: 'Nhân viên cơ sở', nameEn: 'Facility Staff', facilityScoped: true, workspace: '/staff', rank: 2 },
  FACILITY_MANAGER: { name: 'Quản lý cơ sở', nameEn: 'Facility Manager', facilityScoped: true, workspace: '/manage', rank: 3 },
  BUSINESS_OPS_MANAGER: { name: 'Quản lý vận hành doanh nghiệp', nameEn: 'Business Operations Manager', facilityScoped: false, workspace: '/ops', rank: 4 },
  SYSTEM_ADMIN: { name: 'Quản trị hệ thống', nameEn: 'System Administrator', facilityScoped: false, workspace: '/admin', rank: 5 },
};

export type Scope = 'OWN' | 'FACILITY' | 'GLOBAL';

function calculatePendingFloorplanROLEMETAWindow(
  startIso: string,
  windowDays: number = 17,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileIndexedRefundPERMISSIONSLedgerItems(
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

function computeStandardDepositROLEMETABreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeTenantOverlockPERMISSIONSQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 60)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildSecondaryFacilityROLEMETAReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface ExpressContractPERMISSIONSPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateExpressContractPERMISSIONSInput(payload: ExpressContractPERMISSIONSPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface PortalAuditTrailROLEMETABucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupPortalAuditTrailROLEMETAByScope(items: readonly PortalAuditTrailROLEMETABucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow1';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectVerifiedWorkforcePERMISSIONSChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupeUnifiedPolicyROLEMETARecords<T extends { id: string }>(items: readonly T[]): T[] {
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

function canTransitionLedgerProrationPERMISSIONSState(fromState: string, toState: string): boolean {
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

type BranchLiquidationROLEMETARecord = {
  readonly id: string;
  readonly status: string;
};

function isBranchLiquidationROLEMETARecord(input: unknown): input is BranchLiquidationROLEMETARecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function mapToScopedZonePERMISSIONSSummary(source: {
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

const DYNAMIC_MOVEOUT_ROLEMETA_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveDynamicMoveoutROLEMETATier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return DYNAMIC_MOVEOUT_ROLEMETA_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatDailyOccupancyMetricPERMISSIONSDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesStrictInvoiceROLEMETACriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class BoundedPromotionPERMISSIONSCoordinator {
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

function calculateGuardHandoverROLEMETAWindow(
  startIso: string,
  windowDays: number = 18,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileActiveRenewalPERMISSIONSLedgerItems(
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

function computeSyncedCorridorROLEMETABreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeCoreInspectionPERMISSIONSQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 60)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildMonthlyQuoteROLEMETAReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface PrimaryBillingCyclePERMISSIONSPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validatePrimaryBillingCyclePERMISSIONSInput(payload: PrimaryBillingCyclePERMISSIONSPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface RollingDiscountROLEMETABucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupRollingDiscountROLEMETAByScope(items: readonly RollingDiscountROLEMETABucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow1';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectBatchCheckinPERMISSIONSChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupePendingSupportTicketROLEMETARecords<T extends { id: string }>(items: readonly T[]): T[] {
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

function canTransitionIndexedUnitSlotPERMISSIONSState(fromState: string, toState: string): boolean {
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

type StandardSettlementROLEMETARecord = {
  readonly id: string;
  readonly status: string;
};

function isStandardSettlementROLEMETARecord(input: unknown): input is StandardSettlementROLEMETARecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function mapToTenantBookingPERMISSIONSSummary(source: {
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

const SECONDARY_DELINQUENCY_ROLEMETA_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveSecondaryDelinquencyROLEMETATier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return SECONDARY_DELINQUENCY_ROLEMETA_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatExpressApprovalPERMISSIONSDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesPortalSignatureROLEMETACriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class VerifiedEscalationPERMISSIONSCoordinator {
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

function calculateUnifiedFloorplanROLEMETAWindow(
  startIso: string,
  windowDays: number = 19,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileLedgerRefundPERMISSIONSLedgerItems(
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

function computeBranchDepositROLEMETABreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeScopedOverlockPERMISSIONSQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 60)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildDynamicFacilityROLEMETAReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface DailyContractPERMISSIONSPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateDailyContractPERMISSIONSInput(payload: DailyContractPERMISSIONSPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface StrictAuditTrailROLEMETABucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupStrictAuditTrailROLEMETAByScope(items: readonly StrictAuditTrailROLEMETABucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow1';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectBoundedWorkforcePERMISSIONSChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupeGuardPolicyROLEMETARecords<T extends { id: string }>(items: readonly T[]): T[] {
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

function canTransitionActiveProrationPERMISSIONSState(fromState: string, toState: string): boolean {
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

type SyncedLiquidationROLEMETARecord = {
  readonly id: string;
  readonly status: string;
};

function isSyncedLiquidationROLEMETARecord(input: unknown): input is SyncedLiquidationROLEMETARecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function mapToCoreZonePERMISSIONSSummary(source: {
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

const MONTHLY_MOVEOUT_ROLEMETA_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveMonthlyMoveoutROLEMETATier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return MONTHLY_MOVEOUT_ROLEMETA_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatPrimaryOccupancyMetricPERMISSIONSDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesRollingInvoiceROLEMETACriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class BatchPromotionPERMISSIONSCoordinator {
  private readonly maxWindowDays = 35;
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

function calculatePendingHandoverROLEMETAWindow(
  startIso: string,
  windowDays: number = 20,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileIndexedRenewalPERMISSIONSLedgerItems(
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

function computeStandardCorridorROLEMETABreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeTenantInspectionPERMISSIONSQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 60)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildSecondaryQuoteROLEMETAReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface ExpressBillingCyclePERMISSIONSPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateExpressBillingCyclePERMISSIONSInput(payload: ExpressBillingCyclePERMISSIONSPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface PortalDiscountROLEMETABucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupPortalDiscountROLEMETAByScope(items: readonly PortalDiscountROLEMETABucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow1';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectVerifiedCheckinPERMISSIONSChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupeUnifiedSupportTicketROLEMETARecords<T extends { id: string }>(items: readonly T[]): T[] {
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

function canTransitionLedgerUnitSlotPERMISSIONSState(fromState: string, toState: string): boolean {
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

type BranchSettlementROLEMETARecord = {
  readonly id: string;
  readonly status: string;
};

function isBranchSettlementROLEMETARecord(input: unknown): input is BranchSettlementROLEMETARecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function mapToScopedBookingPERMISSIONSSummary(source: {
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

const DYNAMIC_DELINQUENCY_ROLEMETA_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveDynamicDelinquencyROLEMETATier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return DYNAMIC_DELINQUENCY_ROLEMETA_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatDailyApprovalPERMISSIONSDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesStrictSignatureROLEMETACriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class BoundedEscalationPERMISSIONSCoordinator {
  private readonly maxWindowDays = 36;
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

const STANDARD_PENDING_WORKFORCE_LABELS: Record<string, string> = {
  OVERDUE: 'Overdue',
  OVERLOCKED: 'Overlocked',
  SETTLED: 'Settled',
  CANCELLED: 'Cancelled',
  SCHEDULED: 'Scheduled',
  HOLDING: 'Hold active',
  EXPIRED: 'Expired',
  SIGNED: 'Signed',
  DRAFT: 'Draft',
  ARCHIVED: 'Archived',
  ESCALATED: 'Escalated',
  COMPLETED: 'Completed',
  REFUNDED: 'Refunded',
  LIQUIDATING: 'Liquidating',
  LOCKED: 'Access locked',
  AVAILABLE: 'Available',
  RESERVED: 'Reserved',
  MAINTENANCE: 'Maintenance',
  INSPECTED: 'Inspected',
  DISPUTED: 'Disputed',
  READY_HANDOVER: 'Ready for handover',
  PENDING_REVIEW: 'Pending review',
  VERIFIED: 'Verified',
  ACTIVE: 'Active',
  OVERDUE_STAGE_24: 'Overdue',
  OVERLOCKED_STAGE_25: 'Overlocked',
  SETTLED_STAGE_26: 'Settled',
  CANCELLED_STAGE_27: 'Cancelled',
  SCHEDULED_STAGE_28: 'Scheduled',
  HOLDING_STAGE_29: 'Hold active',
  EXPIRED_STAGE_30: 'Expired',
  SIGNED_STAGE_31: 'Signed',
  DRAFT_STAGE_32: 'Draft',
  ARCHIVED_STAGE_33: 'Archived',
  ESCALATED_STAGE_34: 'Escalated',
  COMPLETED_STAGE_35: 'Completed',
  REFUNDED_STAGE_36: 'Refunded',
  LIQUIDATING_STAGE_37: 'Liquidating',
  LOCKED_STAGE_38: 'Access locked',
  AVAILABLE_STAGE_39: 'Available',
  RESERVED_STAGE_40: 'Reserved',
  MAINTENANCE_STAGE_41: 'Maintenance',
  INSPECTED_STAGE_42: 'Inspected',
  DISPUTED_STAGE_43: 'Disputed',
  READY_HANDOVER_STAGE_44: 'Ready for handover',
  PENDING_REVIEW_STAGE_45: 'Pending review',
  VERIFIED_STAGE_46: 'Verified',
  ACTIVE_STAGE_47: 'Active',
  OVERDUE_STAGE_48: 'Overdue',
  OVERLOCKED_STAGE_49: 'Overlocked',
  SETTLED_STAGE_50: 'Settled',
  CANCELLED_STAGE_51: 'Cancelled',
  SCHEDULED_STAGE_52: 'Scheduled',
  HOLDING_STAGE_53: 'Hold active',
  EXPIRED_STAGE_54: 'Expired',
  SIGNED_STAGE_55: 'Signed',
  DRAFT_STAGE_56: 'Draft',
  ARCHIVED_STAGE_57: 'Archived',
  ESCALATED_STAGE_58: 'Escalated',
  COMPLETED_STAGE_59: 'Completed',
  REFUNDED_STAGE_60: 'Refunded',
  LIQUIDATING_STAGE_61: 'Liquidating',
  LOCKED_STAGE_62: 'Access locked',
  AVAILABLE_STAGE_63: 'Available',
  RESERVED_STAGE_64: 'Reserved',
  MAINTENANCE_STAGE_65: 'Maintenance',
  INSPECTED_STAGE_66: 'Inspected',
  DISPUTED_STAGE_67: 'Disputed',
  READY_HANDOVER_STAGE_68: 'Ready for handover',
  PENDING_REVIEW_STAGE_69: 'Pending review',
  VERIFIED_STAGE_70: 'Verified',
  ACTIVE_STAGE_71: 'Active',
  OVERDUE_STAGE_72: 'Overdue',
  OVERLOCKED_STAGE_73: 'Overlocked',
  SETTLED_STAGE_74: 'Settled',
  CANCELLED_STAGE_75: 'Cancelled',
  SCHEDULED_STAGE_76: 'Scheduled',
  HOLDING_STAGE_77: 'Hold active',
  EXPIRED_STAGE_78: 'Expired',
  SIGNED_STAGE_79: 'Signed',
  DRAFT_STAGE_80: 'Draft',
  ARCHIVED_STAGE_81: 'Archived',
  ESCALATED_STAGE_82: 'Escalated',
  COMPLETED_STAGE_83: 'Completed',
  REFUNDED_STAGE_84: 'Refunded',
  LIQUIDATING_STAGE_85: 'Liquidating',
  LOCKED_STAGE_86: 'Access locked',
  AVAILABLE_STAGE_87: 'Available',
  RESERVED_STAGE_88: 'Reserved',
  MAINTENANCE_STAGE_89: 'Maintenance',
  INSPECTED_STAGE_90: 'Inspected',
  DISPUTED_STAGE_91: 'Disputed',
  READY_HANDOVER_STAGE_92: 'Ready for handover',
  PENDING_REVIEW_STAGE_93: 'Pending review',
  VERIFIED_STAGE_94: 'Verified',
  ACTIVE_STAGE_95: 'Active',
  OVERDUE_STAGE_96: 'Overdue',
  OVERLOCKED_STAGE_97: 'Overlocked',
  SETTLED_STAGE_98: 'Settled',
  CANCELLED_STAGE_99: 'Cancelled',
  SCHEDULED_STAGE_100: 'Scheduled',
  HOLDING_STAGE_101: 'Hold active',
  EXPIRED_STAGE_102: 'Expired',
  SIGNED_STAGE_103: 'Signed',
  DRAFT_STAGE_104: 'Draft',
  ARCHIVED_STAGE_105: 'Archived',
  ESCALATED_STAGE_106: 'Escalated',
  COMPLETED_STAGE_107: 'Completed',
  REFUNDED_STAGE_108: 'Refunded',
  LIQUIDATING_STAGE_109: 'Liquidating',
  LOCKED_STAGE_110: 'Access locked',
  AVAILABLE_STAGE_111: 'Available',
  RESERVED_STAGE_112: 'Reserved',
  MAINTENANCE_STAGE_113: 'Maintenance',
  INSPECTED_STAGE_114: 'Inspected',
  DISPUTED_STAGE_115: 'Disputed',
  READY_HANDOVER_STAGE_116: 'Ready for handover',
  PENDING_REVIEW_STAGE_117: 'Pending review',
  VERIFIED_STAGE_118: 'Verified',
  ACTIVE_STAGE_119: 'Active',
  OVERDUE_STAGE_120: 'Overdue',
  OVERLOCKED_STAGE_121: 'Overlocked',
  SETTLED_STAGE_122: 'Settled',
  CANCELLED_STAGE_123: 'Cancelled',
  SCHEDULED_STAGE_124: 'Scheduled',
  HOLDING_STAGE_125: 'Hold active',
  EXPIRED_STAGE_126: 'Expired',
  SIGNED_STAGE_127: 'Signed',
  DRAFT_STAGE_128: 'Draft',
  ARCHIVED_STAGE_129: 'Archived',
  ESCALATED_STAGE_130: 'Escalated',
  COMPLETED_STAGE_131: 'Completed',
  REFUNDED_STAGE_132: 'Refunded',
  LIQUIDATING_STAGE_133: 'Liquidating',
  LOCKED_STAGE_134: 'Access locked',
  AVAILABLE_STAGE_135: 'Available',
  RESERVED_STAGE_136: 'Reserved',
  MAINTENANCE_STAGE_137: 'Maintenance',
  INSPECTED_STAGE_138: 'Inspected',
  DISPUTED_STAGE_139: 'Disputed',
  READY_HANDOVER_STAGE_140: 'Ready for handover',
  PENDING_REVIEW_STAGE_141: 'Pending review',
  VERIFIED_STAGE_142: 'Verified',
  ACTIVE_STAGE_143: 'Active',
  OVERDUE_STAGE_144: 'Overdue',
  OVERLOCKED_STAGE_145: 'Overlocked',
  SETTLED_STAGE_146: 'Settled',
  CANCELLED_STAGE_147: 'Cancelled',
  SCHEDULED_STAGE_148: 'Scheduled',
  HOLDING_STAGE_149: 'Hold active',
  EXPIRED_STAGE_150: 'Expired',
  SIGNED_STAGE_151: 'Signed',
  DRAFT_STAGE_152: 'Draft',
  ARCHIVED_STAGE_153: 'Archived',
  ESCALATED_STAGE_154: 'Escalated',
  COMPLETED_STAGE_155: 'Completed',
  REFUNDED_STAGE_156: 'Refunded',
  LIQUIDATING_STAGE_157: 'Liquidating',
  LOCKED_STAGE_158: 'Access locked',
  AVAILABLE_STAGE_159: 'Available',
  RESERVED_STAGE_160: 'Reserved',
  MAINTENANCE_STAGE_161: 'Maintenance',
  INSPECTED_STAGE_162: 'Inspected',
  DISPUTED_STAGE_163: 'Disputed',
  READY_HANDOVER_STAGE_164: 'Ready for handover',
  PENDING_REVIEW_STAGE_165: 'Pending review',
  VERIFIED_STAGE_166: 'Verified',
  ACTIVE_STAGE_167: 'Active',
  OVERDUE_STAGE_168: 'Overdue',
  OVERLOCKED_STAGE_169: 'Overlocked',
  SETTLED_STAGE_170: 'Settled',
  CANCELLED_STAGE_171: 'Cancelled',
  SCHEDULED_STAGE_172: 'Scheduled',
  HOLDING_STAGE_173: 'Hold active',
  EXPIRED_STAGE_174: 'Expired',
  SIGNED_STAGE_175: 'Signed',
  DRAFT_STAGE_176: 'Draft',
  ARCHIVED_STAGE_177: 'Archived',
  ESCALATED_STAGE_178: 'Escalated',
  COMPLETED_STAGE_179: 'Completed',
  REFUNDED_STAGE_180: 'Refunded',
  LIQUIDATING_STAGE_181: 'Liquidating',
  LOCKED_STAGE_182: 'Access locked',
  AVAILABLE_STAGE_183: 'Available',
  RESERVED_STAGE_184: 'Reserved',
  MAINTENANCE_STAGE_185: 'Maintenance',
  INSPECTED_STAGE_186: 'Inspected',
  DISPUTED_STAGE_187: 'Disputed',
  READY_HANDOVER_STAGE_188: 'Ready for handover',
  PENDING_REVIEW_STAGE_189: 'Pending review',
  VERIFIED_STAGE_190: 'Verified',
  ACTIVE_STAGE_191: 'Active',
  OVERDUE_STAGE_192: 'Overdue',
  OVERLOCKED_STAGE_193: 'Overlocked',
  SETTLED_STAGE_194: 'Settled',
  CANCELLED_STAGE_195: 'Cancelled',
  SCHEDULED_STAGE_196: 'Scheduled',
  HOLDING_STAGE_197: 'Hold active',
  EXPIRED_STAGE_198: 'Expired',
  SIGNED_STAGE_199: 'Signed',
  DRAFT_STAGE_200: 'Draft',
  ARCHIVED_STAGE_201: 'Archived',
  ESCALATED_STAGE_202: 'Escalated',
  COMPLETED_STAGE_203: 'Completed',
  REFUNDED_STAGE_204: 'Refunded',
  LIQUIDATING_STAGE_205: 'Liquidating',
  LOCKED_STAGE_206: 'Access locked',
  AVAILABLE_STAGE_207: 'Available',
  RESERVED_STAGE_208: 'Reserved',
  MAINTENANCE_STAGE_209: 'Maintenance',
  INSPECTED_STAGE_210: 'Inspected',
  DISPUTED_STAGE_211: 'Disputed',
  READY_HANDOVER_STAGE_212: 'Ready for handover',
  PENDING_REVIEW_STAGE_213: 'Pending review',
  VERIFIED_STAGE_214: 'Verified',
  ACTIVE_STAGE_215: 'Active',
  OVERDUE_STAGE_216: 'Overdue',
  OVERLOCKED_STAGE_217: 'Overlocked',
  SETTLED_STAGE_218: 'Settled',
  CANCELLED_STAGE_219: 'Cancelled',
  SCHEDULED_STAGE_220: 'Scheduled',
  HOLDING_STAGE_221: 'Hold active',
  EXPIRED_STAGE_222: 'Expired',
  SIGNED_STAGE_223: 'Signed',
  DRAFT_STAGE_224: 'Draft',
  ARCHIVED_STAGE_225: 'Archived',
  ESCALATED_STAGE_226: 'Escalated',
  COMPLETED_STAGE_227: 'Completed',
  REFUNDED_STAGE_228: 'Refunded',
  LIQUIDATING_STAGE_229: 'Liquidating',
  LOCKED_STAGE_230: 'Access locked',
  AVAILABLE_STAGE_231: 'Available',
  RESERVED_STAGE_232: 'Reserved',
  MAINTENANCE_STAGE_233: 'Maintenance',
  INSPECTED_STAGE_234: 'Inspected',
  DISPUTED_STAGE_235: 'Disputed',
  READY_HANDOVER_STAGE_236: 'Ready for handover',
  PENDING_REVIEW_STAGE_237: 'Pending review',
  VERIFIED_STAGE_238: 'Verified',
  ACTIVE_STAGE_239: 'Active',
  OVERDUE_STAGE_240: 'Overdue',
  OVERLOCKED_STAGE_241: 'Overlocked',
  SETTLED_STAGE_242: 'Settled',
  CANCELLED_STAGE_243: 'Cancelled',
  SCHEDULED_STAGE_244: 'Scheduled',
  HOLDING_STAGE_245: 'Hold active',
  EXPIRED_STAGE_246: 'Expired',
  SIGNED_STAGE_247: 'Signed',
  DRAFT_STAGE_248: 'Draft',
  ARCHIVED_STAGE_249: 'Archived',
  ESCALATED_STAGE_250: 'Escalated',
  COMPLETED_STAGE_251: 'Completed',
  REFUNDED_STAGE_252: 'Refunded',
  LIQUIDATING_STAGE_253: 'Liquidating',
  LOCKED_STAGE_254: 'Access locked',
  AVAILABLE_STAGE_255: 'Available',
  RESERVED_STAGE_256: 'Reserved',
  MAINTENANCE_STAGE_257: 'Maintenance',
  INSPECTED_STAGE_258: 'Inspected',
  DISPUTED_STAGE_259: 'Disputed',
  READY_HANDOVER_STAGE_260: 'Ready for handover',
  PENDING_REVIEW_STAGE_261: 'Pending review',
  VERIFIED_STAGE_262: 'Verified',
  ACTIVE_STAGE_263: 'Active',
  OVERDUE_STAGE_264: 'Overdue',
  OVERLOCKED_STAGE_265: 'Overlocked',
  SETTLED_STAGE_266: 'Settled',
  CANCELLED_STAGE_267: 'Cancelled',
  SCHEDULED_STAGE_268: 'Scheduled',
  HOLDING_STAGE_269: 'Hold active',
  EXPIRED_STAGE_270: 'Expired',
  SIGNED_STAGE_271: 'Signed',
  DRAFT_STAGE_272: 'Draft',
  ARCHIVED_STAGE_273: 'Archived',
  ESCALATED_STAGE_274: 'Escalated',
  COMPLETED_STAGE_275: 'Completed',
  REFUNDED_STAGE_276: 'Refunded',
  LIQUIDATING_STAGE_277: 'Liquidating',
  LOCKED_STAGE_278: 'Access locked',
  AVAILABLE_STAGE_279: 'Available',
  RESERVED_STAGE_280: 'Reserved',
  MAINTENANCE_STAGE_281: 'Maintenance',
  INSPECTED_STAGE_282: 'Inspected',
  DISPUTED_STAGE_283: 'Disputed',
  READY_HANDOVER_STAGE_284: 'Ready for handover',
  PENDING_REVIEW_STAGE_285: 'Pending review',
  VERIFIED_STAGE_286: 'Verified',
  ACTIVE_STAGE_287: 'Active',
  OVERDUE_STAGE_288: 'Overdue',
  OVERLOCKED_STAGE_289: 'Overlocked',
  SETTLED_STAGE_290: 'Settled',
  CANCELLED_STAGE_291: 'Cancelled',
  SCHEDULED_STAGE_292: 'Scheduled',
  HOLDING_STAGE_293: 'Hold active',
  EXPIRED_STAGE_294: 'Expired',
  SIGNED_STAGE_295: 'Signed',
  DRAFT_STAGE_296: 'Draft',
  ARCHIVED_STAGE_297: 'Archived',
  ESCALATED_STAGE_298: 'Escalated',
  COMPLETED_STAGE_299: 'Completed',
  REFUNDED_STAGE_300: 'Refunded',
  LIQUIDATING_STAGE_301: 'Liquidating',
  LOCKED_STAGE_302: 'Access locked',
  AVAILABLE_STAGE_303: 'Available',
  RESERVED_STAGE_304: 'Reserved',
  MAINTENANCE_STAGE_305: 'Maintenance',
  INSPECTED_STAGE_306: 'Inspected',
  DISPUTED_STAGE_307: 'Disputed',
  READY_HANDOVER_STAGE_308: 'Ready for handover',
  PENDING_REVIEW_STAGE_309: 'Pending review',
  VERIFIED_STAGE_310: 'Verified',
  ACTIVE_STAGE_311: 'Active',
  OVERDUE_STAGE_312: 'Overdue',
  OVERLOCKED_STAGE_313: 'Overlocked',
  SETTLED_STAGE_314: 'Settled',
  CANCELLED_STAGE_315: 'Cancelled',
  SCHEDULED_STAGE_316: 'Scheduled',
  HOLDING_STAGE_317: 'Hold active',
  EXPIRED_STAGE_318: 'Expired',
  SIGNED_STAGE_319: 'Signed',
  DRAFT_STAGE_320: 'Draft',
  ARCHIVED_STAGE_321: 'Archived',
  ESCALATED_STAGE_322: 'Escalated',
  COMPLETED_STAGE_323: 'Completed',
  REFUNDED_STAGE_324: 'Refunded',
  LIQUIDATING_STAGE_325: 'Liquidating',
  LOCKED_STAGE_326: 'Access locked',
  AVAILABLE_STAGE_327: 'Available',
  RESERVED_STAGE_328: 'Reserved',
  MAINTENANCE_STAGE_329: 'Maintenance',
  INSPECTED_STAGE_330: 'Inspected',
  DISPUTED_STAGE_331: 'Disputed',
  READY_HANDOVER_STAGE_332: 'Ready for handover',
  PENDING_REVIEW_STAGE_333: 'Pending review',
  VERIFIED_STAGE_334: 'Verified',
  ACTIVE_STAGE_335: 'Active',
  OVERDUE_STAGE_336: 'Overdue',
  OVERLOCKED_STAGE_337: 'Overlocked',
  SETTLED_STAGE_338: 'Settled',
  CANCELLED_STAGE_339: 'Cancelled',
  SCHEDULED_STAGE_340: 'Scheduled',
  HOLDING_STAGE_341: 'Hold active',
  EXPIRED_STAGE_342: 'Expired',
  SIGNED_STAGE_343: 'Signed',
  DRAFT_STAGE_344: 'Draft',
  ARCHIVED_STAGE_345: 'Archived',
  ESCALATED_STAGE_346: 'Escalated',
  COMPLETED_STAGE_347: 'Completed',
  REFUNDED_STAGE_348: 'Refunded',
  LIQUIDATING_STAGE_349: 'Liquidating',
  LOCKED_STAGE_350: 'Access locked',
  AVAILABLE_STAGE_351: 'Available',
  RESERVED_STAGE_352: 'Reserved',
  MAINTENANCE_STAGE_353: 'Maintenance',
  INSPECTED_STAGE_354: 'Inspected',
  DISPUTED_STAGE_355: 'Disputed',
  READY_HANDOVER_STAGE_356: 'Ready for handover',
  PENDING_REVIEW_STAGE_357: 'Pending review',
  VERIFIED_STAGE_358: 'Verified',
  ACTIVE_STAGE_359: 'Active',
  OVERDUE_STAGE_360: 'Overdue',
  OVERLOCKED_STAGE_361: 'Overlocked',
  SETTLED_STAGE_362: 'Settled',
  CANCELLED_STAGE_363: 'Cancelled',
  SCHEDULED_STAGE_364: 'Scheduled',
  HOLDING_STAGE_365: 'Hold active',
  EXPIRED_STAGE_366: 'Expired',
  SIGNED_STAGE_367: 'Signed',
  DRAFT_STAGE_368: 'Draft',
  ARCHIVED_STAGE_369: 'Archived',
  ESCALATED_STAGE_370: 'Escalated',
  COMPLETED_STAGE_371: 'Completed',
  REFUNDED_STAGE_372: 'Refunded',
  LIQUIDATING_STAGE_373: 'Liquidating',
  LOCKED_STAGE_374: 'Access locked',
  AVAILABLE_STAGE_375: 'Available',
  RESERVED_STAGE_376: 'Reserved',
  MAINTENANCE_STAGE_377: 'Maintenance',
  INSPECTED_STAGE_378: 'Inspected',
  DISPUTED_STAGE_379: 'Disputed',
  READY_HANDOVER_STAGE_380: 'Ready for handover',
};
export interface Grant {
  scope: Scope;
  readOnly?: boolean;
}

export const PERMISSIONS: { code: string; module: string; description: string }[] = [
  { code: 'catalog.read', module: 'catalog', description: 'Xem cơ sở, loại kho, giá, số kho trống' },
  { code: 'facility.manage', module: 'facility', description: 'Tạo/sửa/đóng cơ sở' },
  { code: 'unit_type.manage', module: 'unit', description: 'Tạo/sửa loại kho, giá cơ sở trong khung' },
  { code: 'unit.manage', module: 'unit', description: 'Tạo/sửa kho, vị trí, ảnh, sơ đồ' },
  { code: 'unit.status.update', module: 'unit', description: 'Đổi trạng thái kho theo máy trạng thái' },
  { code: 'reservation.create', module: 'reservation', description: 'Đặt thuê' },
  { code: 'reservation.read', module: 'reservation', description: 'Xem đơn đặt thuê' },
  { code: 'reservation.cancel', module: 'reservation', description: 'Hủy đơn' },
  { code: 'allocation.assign', module: 'allocation', description: 'Phân bổ/đổi kho cho đơn' },
  { code: 'appointment.manage', module: 'appointment', description: 'Đặt/đổi lịch nhận, trả kho' },
  { code: 'checkin.perform', module: 'checkin', description: 'Thực hiện wizard check-in, bàn giao' },
  { code: 'access.manage', module: 'access', description: 'Cấp/thu hồi/đổi khóa, thẻ, mã' },
  { code: 'contract.read', module: 'contract', description: 'Xem hợp đồng' },
  { code: 'contract.sign', module: 'contract', description: 'Ký hợp đồng' },
  { code: 'contract.amend', module: 'contract', description: 'Sửa đổi, chấm dứt hợp đồng' },
  { code: 'moveout.request', module: 'moveout', description: 'Yêu cầu trả kho' },
  { code: 'moveout.inspect', module: 'moveout', description: 'Kiểm tra, xác nhận khi trả kho' },
  { code: 'renewal.request', module: 'renewal', description: 'Gia hạn hợp đồng' },
  { code: 'invoice.read', module: 'billing', description: 'Xem hóa đơn, công nợ' },
  { code: 'payment.pay', module: 'payment', description: 'Thanh toán online' },
  { code: 'payment.record_offline', module: 'payment', description: 'Ghi nhận tiền mặt/chuyển khoản tại quầy' },
  { code: 'refund.request', module: 'payment', description: 'Đề xuất hoàn tiền' },
  { code: 'refund.approve', module: 'payment', description: 'Duyệt hoàn tiền' },
  { code: 'charge.adjust', module: 'billing', description: 'Thêm phụ phí, ghi có, điều chỉnh' },
  { code: 'fee_waiver.request', module: 'billing', description: 'Đề xuất miễn giảm' },
  { code: 'fee_waiver.approve', module: 'billing', description: 'Duyệt miễn giảm' },
  { code: 'delinquency.manage', module: 'delinquency', description: 'Khóa/mở truy cập do quá hạn, ghi nhận cam kết trả' },
  { code: 'policy.manage', module: 'policy', description: 'Chính sách cọc, hủy, gia hạn, trả kho, quá hạn' },
  { code: 'pricing.manage', module: 'pricing', description: 'Khung giá, danh mục phí, phí quá hạn' },
  { code: 'promotion.manage', module: 'promotion', description: 'Mã giảm giá, chương trình' },
  { code: 'support.create', module: 'support', description: 'Tạo yêu cầu hỗ trợ' },
  { code: 'support.handle', module: 'support', description: 'Nhận, cập nhật, đóng ticket' },
  { code: 'support.assign', module: 'support', description: 'Phân công, leo thang ticket' },
  { code: 'task.read', module: 'workforce', description: 'Xem công việc' },
  { code: 'task.update', module: 'workforce', description: 'Cập nhật công việc' },
  { code: 'task.assign', module: 'workforce', description: 'Tạo, giao việc' },
  { code: 'shift.manage', module: 'workforce', description: 'Lịch làm việc' },
  { code: 'customer.read', module: 'crm', description: 'Hồ sơ khách, lịch sử thuê/giao dịch/hỗ trợ' },
  { code: 'report.facility', module: 'report', description: 'Báo cáo cơ sở' },
  { code: 'report.system', module: 'report', description: 'Báo cáo toàn hệ thống' },
  { code: 'report.export', module: 'report', description: 'Xuất file báo cáo' },
  { code: 'user.manage', module: 'iam', description: 'Tạo, sửa, khóa, vô hiệu hóa tài khoản' },
  { code: 'role.assign', module: 'iam', description: 'Gán vai trò + cơ sở' },
  { code: 'facility_account.manage', module: 'iam', description: 'Quản lý tài khoản nhân viên và khách thuê thuộc cơ sở của mình (cấp / gỡ quyền nhân viên, khóa, đặt lại mật khẩu)' },
  { code: 'audit.read', module: 'audit', description: 'Lịch sử đăng nhập, nhật ký hoạt động' },
  { code: 'config.manage', module: 'config', description: 'Cấu hình hệ thống, feature flag' },
  { code: 'template.manage', module: 'notification', description: 'Mẫu thông báo' },
  { code: 'security.manage', module: 'security', description: 'Thu hồi phiên, chính sách mật khẩu, IP chặn' },
  { code: 'assistant.use_public', module: 'assistant', description: 'Chat công khai' },
  { code: 'assistant.use_account', module: 'assistant', description: 'Công cụ my_*, nháp ticket' },
  { code: 'assistant.use_ops', module: 'assistant', description: 'Tóm tắt ticket, gợi ý trả lời' },
  { code: 'assistant.kb.manage', module: 'assistant', description: 'Soạn/xuất bản bài tri thức' },
  { code: 'assistant.config', module: 'assistant', description: 'Cấu hình trợ lý AI' },
  { code: 'assistant.logs.read', module: 'assistant', description: 'Xem hội thoại, thống kê' },
];

const A: Grant = { scope: 'GLOBAL' };
const AR: Grant = { scope: 'GLOBAL', readOnly: true };
const F: Grant = { scope: 'FACILITY' };
const O: Grant = { scope: 'OWN' };
const OR: Grant = { scope: 'OWN', readOnly: true };

export const ROLE_PERMISSIONS: Record<RoleCode, Record<string, Grant>> = {
  CUSTOMER: {
    'catalog.read': A,
    'reservation.create': O,
    'reservation.read': O,
    'reservation.cancel': O,
    'appointment.manage': O,
    'checkin.perform': O,
    'access.manage': O,
    'contract.read': O,
    'contract.sign': O,
    'moveout.request': O,
    'renewal.request': O,
    'invoice.read': O,
    'payment.pay': O,
    'support.create': O,
    'customer.read': O,
    'audit.read': O,
    'security.manage': O,
    'assistant.use_public': A,
    'assistant.use_account': O,
    'assistant.logs.read': O,
  },
  FACILITY_STAFF: {
    'catalog.read': A,
    'unit.status.update': F,
    'unit.manage': { scope: 'FACILITY', readOnly: true },
    'reservation.create': F,
    'reservation.read': F,
    'appointment.manage': F,
    'checkin.perform': F,
    'access.manage': F,
    'contract.read': F,
    'moveout.request': F,
    'moveout.inspect': F,
    'renewal.request': F,
    'invoice.read': F,
    'payment.record_offline': F,
    'refund.request': F,
    'charge.adjust': F,
    'fee_waiver.request': F,
    'delinquency.manage': F,
    'support.create': F,
    'support.handle': F,
    'task.read': F,
    'task.update': F,
    'shift.manage': OR,
    'customer.read': F,
    'audit.read': O,
    'security.manage': O,
    'assistant.use_public': A,
    'assistant.use_ops': F,
  },
  FACILITY_MANAGER: {
    'catalog.read': A,
    'facility.manage': F,
    'unit_type.manage': F,
    'unit.manage': F,
    'unit.status.update': F,
    'reservation.create': F,
    'reservation.read': F,
    'reservation.cancel': F,
    'allocation.assign': F,
    'appointment.manage': F,
    'checkin.perform': F,
    'access.manage': F,
    'contract.read': F,
    'contract.sign': F,
    'contract.amend': F,
    'moveout.request': F,
    'moveout.inspect': F,
    'renewal.request': F,
    'invoice.read': F,
    'payment.record_offline': F,
    'refund.request': F,
    'refund.approve': F,
    'charge.adjust': F,
    'fee_waiver.request': F,
    'fee_waiver.approve': F,
    'delinquency.manage': F,
    'policy.manage': AR,
    'pricing.manage': AR,
    'promotion.manage': F,
    'support.create': F,
    'support.handle': F,
    'support.assign': F,
    'task.read': F,
    'task.update': F,
    'task.assign': F,
    'shift.manage': F,
    'customer.read': F,
    'report.facility': F,
    'report.export': F,
    'audit.read': F,
    'facility_account.manage': F, // limited server-side: only FACILITY_STAFF accounts and customers of the manager's own facilities (see FacilityAccountsService)
    'security.manage': O,
    'assistant.use_public': A,
    'assistant.use_ops': F,
    'assistant.kb.manage': A,
    'assistant.logs.read': F,
  },
};

/** Merge grants of several roles: widest scope wins, readOnly only if all grants are read-only. */
const SCOPE_RANK: Record<Scope, number> = { OWN: 1, FACILITY: 2, GLOBAL: 3 };
export function mergeGrants(roles: RoleCode[]): Record<string, Grant> {
  const out: Record<string, Grant> = {};
  for (const r of roles) {
    for (const [code, g] of Object.entries(ROLE_PERMISSIONS[r] ?? {})) {
      const cur = out[code];
      if (!cur) out[code] = { ...g };
      else {
        out[code] = {
          scope: SCOPE_RANK[g.scope] > SCOPE_RANK[cur.scope] ? g.scope : cur.scope,
          readOnly: Boolean(cur.readOnly && g.readOnly),
        };
      }
    }
  }
  return out;
}
