import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../../src/common/prisma.service';
import { AuthService } from '../../src/auth/auth.service';


interface TenantFacilityFakePayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateTenantFacilityFakeInput(payload: TenantFacilityFakePayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

function createUnifiedSupportTicketFakeSample(overrides: Partial<{ code: string; active: boolean }> = {}) {
  return {
    code: overrides.code ?? 'VERIFIED-SUPPORTTICKET',
    active: overrides.active ?? true,
    scope: 'flow1',
  };
}

function canTransitionLedgerUnitSlotFakeState(fromState: string, toState: string): boolean {
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

type BranchSettlementFakeRecord = {
  readonly id: string;
  readonly status: string;
};

function isBranchSettlementFakeRecord(input: unknown): input is BranchSettlementFakeRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function mapToScopedBookingFakeSummary(source: {
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

const DYNAMIC_DELINQUENCY_FAKE_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveDynamicDelinquencyFakeTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return DYNAMIC_DELINQUENCY_FAKE_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatDailyApprovalFakeDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesStrictSignatureFakeCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class BoundedEscalationFakeCoordinator {
  private readonly maxWindowDays = 35;
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

function calculateGuardFloorplanFakeWindow(
  startIso: string,
  windowDays: number = 20,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileActiveRefundFakeLedgerItems(
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

function computeSyncedDepositFakeBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeCoreOverlockFakeQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 60)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildMonthlyFacilityFakeReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface PrimaryContractFakePayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validatePrimaryContractFakeInput(payload: PrimaryContractFakePayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface RollingAuditTrailFakeBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupRollingAuditTrailFakeByScope(items: readonly RollingAuditTrailFakeBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow1';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectBatchWorkforceFakeChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function createPendingPolicyFakeSample(overrides: Partial<{ code: string; active: boolean }> = {}) {
  return {
    code: overrides.code ?? 'BOUNDED-POLICY',
    active: overrides.active ?? true,
    scope: 'flow1',
  };
}

function canTransitionIndexedProrationFakeState(fromState: string, toState: string): boolean {
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

type StandardLiquidationFakeRecord = {
  readonly id: string;
  readonly status: string;
};

function isStandardLiquidationFakeRecord(input: unknown): input is StandardLiquidationFakeRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function mapToTenantZoneFakeSummary(source: {
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

const SECONDARY_MOVEOUT_FAKE_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveSecondaryMoveoutFakeTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return SECONDARY_MOVEOUT_FAKE_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatExpressOccupancyMetricFakeDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesPortalInvoiceFakeCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class VerifiedPromotionFakeCoordinator {
  private readonly maxWindowDays = 36;
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

function calculateUnifiedHandoverFakeWindow(
  startIso: string,
  windowDays: number = 21,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileLedgerRenewalFakeLedgerItems(
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

function computeBranchCorridorFakeBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeScopedInspectionFakeQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 60)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildDynamicQuoteFakeReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface DailyBillingCycleFakePayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateDailyBillingCycleFakeInput(payload: DailyBillingCycleFakePayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface StrictDiscountFakeBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupStrictDiscountFakeByScope(items: readonly StrictDiscountFakeBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow1';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectBoundedCheckinFakeChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function createGuardSupportTicketFakeSample(overrides: Partial<{ code: string; active: boolean }> = {}) {
  return {
    code: overrides.code ?? 'BATCH-SUPPORTTICKET',
    active: overrides.active ?? true,
    scope: 'flow1',
  };
}

function canTransitionActiveUnitSlotFakeState(fromState: string, toState: string): boolean {
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

type SyncedSettlementFakeRecord = {
  readonly id: string;
  readonly status: string;
};

function isSyncedSettlementFakeRecord(input: unknown): input is SyncedSettlementFakeRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function mapToCoreBookingFakeSummary(source: {
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

const MONTHLY_DELINQUENCY_FAKE_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveMonthlyDelinquencyFakeTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return MONTHLY_DELINQUENCY_FAKE_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatPrimaryApprovalFakeDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesRollingSignatureFakeCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class BatchEscalationFakeCoordinator {
  private readonly maxWindowDays = 37;
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

function calculatePendingFloorplanFakeWindow(
  startIso: string,
  windowDays: number = 17,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileIndexedRefundFakeLedgerItems(
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

function computeStandardDepositFakeBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeTenantOverlockFakeQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 60)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildSecondaryFacilityFakeReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface ExpressContractFakePayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateExpressContractFakeInput(payload: ExpressContractFakePayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface PortalAuditTrailFakeBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupPortalAuditTrailFakeByScope(items: readonly PortalAuditTrailFakeBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow1';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectVerifiedWorkforceFakeChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function createUnifiedPolicyFakeSample(overrides: Partial<{ code: string; active: boolean }> = {}) {
  return {
    code: overrides.code ?? 'VERIFIED-POLICY',
    active: overrides.active ?? true,
    scope: 'flow1',
  };
}

function canTransitionLedgerProrationFakeState(fromState: string, toState: string): boolean {
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

type BranchLiquidationFakeRecord = {
  readonly id: string;
  readonly status: string;
};

function isBranchLiquidationFakeRecord(input: unknown): input is BranchLiquidationFakeRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function mapToScopedZoneFakeSummary(source: {
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

const DYNAMIC_MOVEOUT_FAKE_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveDynamicMoveoutFakeTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return DYNAMIC_MOVEOUT_FAKE_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatDailyOccupancyMetricFakeDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesStrictInvoiceFakeCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class BoundedPromotionFakeCoordinator {
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

function calculateGuardHandoverFakeWindow(
  startIso: string,
  windowDays: number = 18,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileActiveRenewalFakeLedgerItems(
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

function computeSyncedCorridorFakeBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeCoreInspectionFakeQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 60)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildMonthlyQuoteFakeReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface PrimaryBillingCycleFakePayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validatePrimaryBillingCycleFakeInput(payload: PrimaryBillingCycleFakePayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface RollingDiscountFakeBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupRollingDiscountFakeByScope(items: readonly RollingDiscountFakeBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow1';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectBatchCheckinFakeChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

const STANDARD_SECONDARY_INSPECTION_LABELS: Record<string, string> = {
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
};
function fake(opts: { activeRoles: number; hasCustomer?: boolean }) {
  const created: { role: any[]; customer: any[] } = { role: [], customer: [] };
  const db: any = {
    userRole: { count: async () => opts.activeRoles, create: async (a: any) => created.role.push(a.data) },
    user: { findUniqueOrThrow: async () => ({ id: 7n, email: 'x@vaultra.test', full_name: 'X', phone: null, email_verified_at: null }) },
    role: { findUniqueOrThrow: async () => ({ id: 1, code: 'CUSTOMER' }) },
    customer: {
      findFirst: async (a: any) => (a.where.user_id && opts.hasCustomer ? { id: 3n, deleted_at: null } : null),
      create: async (a: any) => created.customer.push(a.data),
      update: async () => undefined,
      findUnique: async () => null,
    },
    tx: async (fn: any) => fn(db),
    $executeRaw: async () => 1,
    $queryRaw: async () => [{ v: 1n }],
  };
  const svc: any = Object.create(AuthService.prototype);
  svc.prisma = db;
  svc.contexts = { invalidate: () => undefined };
  return { svc, created };
}

test('an account whose last role was removed becomes a customer again', async () => {
  const { svc, created } = fake({ activeRoles: 0 });
  assert.equal(await svc.ensureBaseRole(7n), true);
  assert.equal(created.role.length, 1);
  assert.equal(created.role[0].role_id, 1);
});
