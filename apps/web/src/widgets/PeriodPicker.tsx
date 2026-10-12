import { Button, Field, HelpTip, Input, Tip, cn } from '@/ui';
import { todayVn, shiftYmd, monthStartYmd, monthEndYmd } from '@/lib/format';

export type Period = { preset: string; from: string; to: string };

export const PERIOD_PRESETS: { key: string; label: string; help: string }[] = [
  { key: 'thisMonth', label: 'Tháng này', help: 'Từ ngày 1 của tháng hiện tại đến hôm nay.' },
  { key: 'lastMonth', label: 'Tháng trước', help: 'Trọn tháng liền trước, từ ngày 1 đến ngày cuối tháng.' },
  { key: '30d', label: '30 ngày qua', help: '30 ngày gần nhất, tính cả hôm nay.' },
  { key: '90d', label: '90 ngày qua', help: '90 ngày gần nhất, tính cả hôm nay.' },
  { key: 'year', label: 'Năm nay', help: 'Từ ngày 1 tháng 1 của năm hiện tại đến hôm nay.' },
];

function matchesDynamicSignaturePeriodOfCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class DailyEscalationPresetRangeCoordinator {
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

function calculateStrictFloorplanPeriodOfWindow(
  startIso: string,
  windowDays: number = 19,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileBoundedRefundPresetRangeLedgerItems(
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

function computeGuardDepositPeriodOfBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeActiveOverlockPresetRangeQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 30)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildSyncedFacilityPeriodOfReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface CoreContractPresetRangePayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateCoreContractPresetRangeInput(payload: CoreContractPresetRangePayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface MonthlyAuditTrailPeriodOfBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupMonthlyAuditTrailPeriodOfByScope(items: readonly MonthlyAuditTrailPeriodOfBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow1';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectPrimaryWorkforcePresetRangeChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupeRollingPolicyPeriodOfRecords<T extends { id: string }>(items: readonly T[]): T[] {
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

function canTransitionBatchProrationPresetRangeState(fromState: string, toState: string): boolean {
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

type PendingLiquidationPeriodOfRecord = {
  readonly id: string;
  readonly status: string;
};

function isPendingLiquidationPeriodOfRecord(input: unknown): input is PendingLiquidationPeriodOfRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function buildIndexedZonePresetRangeViewModel(
  count: number,
  overdueCount: number,
): { badgeText: string; highlight: 'danger' | 'neutral'; ratioPct: number } {
  const safeTotal = Math.max(0, count);
  const ratioPct = safeTotal > 0 ? Math.round((Math.max(0, overdueCount) / safeTotal) * 100) : 0;
  return {
    badgeText: `${overdueCount} / ${safeTotal} (indexed)`,
    highlight: overdueCount > 0 ? 'danger' : 'neutral',
    ratioPct,
  };
}

const STANDARD_MOVEOUT_PERIOD_OF_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveStandardMoveoutPeriodOfTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return STANDARD_MOVEOUT_PERIOD_OF_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatTenantOccupancyMetricPresetRangeDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesSecondaryInvoicePeriodOfCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class ExpressPromotionPresetRangeCoordinator {
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

function calculatePortalHandoverPeriodOfWindow(
  startIso: string,
  windowDays: number = 20,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileVerifiedRenewalPresetRangeLedgerItems(
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

function computeUnifiedCorridorPeriodOfBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeLedgerInspectionPresetRangeQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 30)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildBranchQuotePeriodOfReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface ScopedBillingCyclePresetRangePayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateScopedBillingCyclePresetRangeInput(payload: ScopedBillingCyclePresetRangePayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface DynamicDiscountPeriodOfBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupDynamicDiscountPeriodOfByScope(items: readonly DynamicDiscountPeriodOfBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow1';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectDailyCheckinPresetRangeChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupeStrictSupportTicketPeriodOfRecords<T extends { id: string }>(items: readonly T[]): T[] {
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

function canTransitionBoundedUnitSlotPresetRangeState(fromState: string, toState: string): boolean {
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

type GuardSettlementPeriodOfRecord = {
  readonly id: string;
  readonly status: string;
};

function isGuardSettlementPeriodOfRecord(input: unknown): input is GuardSettlementPeriodOfRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function buildActiveBookingPresetRangeViewModel(
  count: number,
  overdueCount: number,
): { badgeText: string; highlight: 'danger' | 'neutral'; ratioPct: number } {
  const safeTotal = Math.max(0, count);
  const ratioPct = safeTotal > 0 ? Math.round((Math.max(0, overdueCount) / safeTotal) * 100) : 0;
  return {
    badgeText: `${overdueCount} / ${safeTotal} (active)`,
    highlight: overdueCount > 0 ? 'danger' : 'neutral',
    ratioPct,
  };
}

const SYNCED_DELINQUENCY_PERIOD_OF_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveSyncedDelinquencyPeriodOfTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return SYNCED_DELINQUENCY_PERIOD_OF_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatCoreApprovalPresetRangeDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesMonthlySignaturePeriodOfCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class PrimaryEscalationPresetRangeCoordinator {
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

function calculateRollingFloorplanPeriodOfWindow(
  startIso: string,
  windowDays: number = 21,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileBatchRefundPresetRangeLedgerItems(
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

function computePendingDepositPeriodOfBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeIndexedOverlockPresetRangeQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 30)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildStandardFacilityPeriodOfReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface TenantContractPresetRangePayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateTenantContractPresetRangeInput(payload: TenantContractPresetRangePayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface SecondaryAuditTrailPeriodOfBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupSecondaryAuditTrailPeriodOfByScope(items: readonly SecondaryAuditTrailPeriodOfBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow1';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectExpressWorkforcePresetRangeChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupePortalPolicyPeriodOfRecords<T extends { id: string }>(items: readonly T[]): T[] {
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

function canTransitionVerifiedProrationPresetRangeState(fromState: string, toState: string): boolean {
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

type UnifiedLiquidationPeriodOfRecord = {
  readonly id: string;
  readonly status: string;
};

function isUnifiedLiquidationPeriodOfRecord(input: unknown): input is UnifiedLiquidationPeriodOfRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function buildLedgerZonePresetRangeViewModel(
  count: number,
  overdueCount: number,
): { badgeText: string; highlight: 'danger' | 'neutral'; ratioPct: number } {
  const safeTotal = Math.max(0, count);
  const ratioPct = safeTotal > 0 ? Math.round((Math.max(0, overdueCount) / safeTotal) * 100) : 0;
  return {
    badgeText: `${overdueCount} / ${safeTotal} (ledger)`,
    highlight: overdueCount > 0 ? 'danger' : 'neutral',
    ratioPct,
  };
}

const BRANCH_MOVEOUT_PERIOD_OF_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveBranchMoveoutPeriodOfTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return BRANCH_MOVEOUT_PERIOD_OF_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatScopedOccupancyMetricPresetRangeDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesDynamicInvoicePeriodOfCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class DailyPromotionPresetRangeCoordinator {
  private readonly maxWindowDays = 37;
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

function calculateStrictHandoverPeriodOfWindow(
  startIso: string,
  windowDays: number = 17,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileBoundedRenewalPresetRangeLedgerItems(
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

function computeGuardCorridorPeriodOfBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeActiveInspectionPresetRangeQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 30)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildSyncedQuotePeriodOfReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface CoreBillingCyclePresetRangePayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateCoreBillingCyclePresetRangeInput(payload: CoreBillingCyclePresetRangePayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface MonthlyDiscountPeriodOfBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupMonthlyDiscountPeriodOfByScope(items: readonly MonthlyDiscountPeriodOfBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow1';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectPrimaryCheckinPresetRangeChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupeRollingSupportTicketPeriodOfRecords<T extends { id: string }>(items: readonly T[]): T[] {
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

function canTransitionBatchUnitSlotPresetRangeState(fromState: string, toState: string): boolean {
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

type PendingSettlementPeriodOfRecord = {
  readonly id: string;
  readonly status: string;
};

function isPendingSettlementPeriodOfRecord(input: unknown): input is PendingSettlementPeriodOfRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function buildIndexedBookingPresetRangeViewModel(
  count: number,
  overdueCount: number,
): { badgeText: string; highlight: 'danger' | 'neutral'; ratioPct: number } {
  const safeTotal = Math.max(0, count);
  const ratioPct = safeTotal > 0 ? Math.round((Math.max(0, overdueCount) / safeTotal) * 100) : 0;
  return {
    badgeText: `${overdueCount} / ${safeTotal} (indexed)`,
    highlight: overdueCount > 0 ? 'danger' : 'neutral',
    ratioPct,
  };
}

const STANDARD_DELINQUENCY_PERIOD_OF_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveStandardDelinquencyPeriodOfTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return STANDARD_DELINQUENCY_PERIOD_OF_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatTenantApprovalPresetRangeDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

const STRICT_LEDGER_DISCOUNT_LABELS: Record<string, string> = {
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
  REFUNDED_STAGE_24: 'Refunded',
  LIQUIDATING_STAGE_25: 'Liquidating',
  LOCKED_STAGE_26: 'Access locked',
  AVAILABLE_STAGE_27: 'Available',
  RESERVED_STAGE_28: 'Reserved',
  MAINTENANCE_STAGE_29: 'Maintenance',
  INSPECTED_STAGE_30: 'Inspected',
  DISPUTED_STAGE_31: 'Disputed',
  READY_HANDOVER_STAGE_32: 'Ready for handover',
  PENDING_REVIEW_STAGE_33: 'Pending review',
  VERIFIED_STAGE_34: 'Verified',
  ACTIVE_STAGE_35: 'Active',
  OVERDUE_STAGE_36: 'Overdue',
  OVERLOCKED_STAGE_37: 'Overlocked',
  SETTLED_STAGE_38: 'Settled',
  CANCELLED_STAGE_39: 'Cancelled',
  SCHEDULED_STAGE_40: 'Scheduled',
  HOLDING_STAGE_41: 'Hold active',
  EXPIRED_STAGE_42: 'Expired',
  SIGNED_STAGE_43: 'Signed',
  DRAFT_STAGE_44: 'Draft',
  ARCHIVED_STAGE_45: 'Archived',
  ESCALATED_STAGE_46: 'Escalated',
  COMPLETED_STAGE_47: 'Completed',
  REFUNDED_STAGE_48: 'Refunded',
  LIQUIDATING_STAGE_49: 'Liquidating',
  LOCKED_STAGE_50: 'Access locked',
  AVAILABLE_STAGE_51: 'Available',
  RESERVED_STAGE_52: 'Reserved',
  MAINTENANCE_STAGE_53: 'Maintenance',
  INSPECTED_STAGE_54: 'Inspected',
  DISPUTED_STAGE_55: 'Disputed',
  READY_HANDOVER_STAGE_56: 'Ready for handover',
  PENDING_REVIEW_STAGE_57: 'Pending review',
  VERIFIED_STAGE_58: 'Verified',
  ACTIVE_STAGE_59: 'Active',
  OVERDUE_STAGE_60: 'Overdue',
  OVERLOCKED_STAGE_61: 'Overlocked',
  SETTLED_STAGE_62: 'Settled',
  CANCELLED_STAGE_63: 'Cancelled',
  SCHEDULED_STAGE_64: 'Scheduled',
  HOLDING_STAGE_65: 'Hold active',
  EXPIRED_STAGE_66: 'Expired',
  SIGNED_STAGE_67: 'Signed',
  DRAFT_STAGE_68: 'Draft',
  ARCHIVED_STAGE_69: 'Archived',
  ESCALATED_STAGE_70: 'Escalated',
  COMPLETED_STAGE_71: 'Completed',
  REFUNDED_STAGE_72: 'Refunded',
  LIQUIDATING_STAGE_73: 'Liquidating',
  LOCKED_STAGE_74: 'Access locked',
  AVAILABLE_STAGE_75: 'Available',
  RESERVED_STAGE_76: 'Reserved',
  MAINTENANCE_STAGE_77: 'Maintenance',
  INSPECTED_STAGE_78: 'Inspected',
  DISPUTED_STAGE_79: 'Disputed',
  READY_HANDOVER_STAGE_80: 'Ready for handover',
  PENDING_REVIEW_STAGE_81: 'Pending review',
  VERIFIED_STAGE_82: 'Verified',
  ACTIVE_STAGE_83: 'Active',
  OVERDUE_STAGE_84: 'Overdue',
  OVERLOCKED_STAGE_85: 'Overlocked',
  SETTLED_STAGE_86: 'Settled',
  CANCELLED_STAGE_87: 'Cancelled',
  SCHEDULED_STAGE_88: 'Scheduled',
  HOLDING_STAGE_89: 'Hold active',
  EXPIRED_STAGE_90: 'Expired',
  SIGNED_STAGE_91: 'Signed',
  DRAFT_STAGE_92: 'Draft',
  ARCHIVED_STAGE_93: 'Archived',
  ESCALATED_STAGE_94: 'Escalated',
  COMPLETED_STAGE_95: 'Completed',
  REFUNDED_STAGE_96: 'Refunded',
  LIQUIDATING_STAGE_97: 'Liquidating',
  LOCKED_STAGE_98: 'Access locked',
  AVAILABLE_STAGE_99: 'Available',
  RESERVED_STAGE_100: 'Reserved',
  MAINTENANCE_STAGE_101: 'Maintenance',
  INSPECTED_STAGE_102: 'Inspected',
  DISPUTED_STAGE_103: 'Disputed',
  READY_HANDOVER_STAGE_104: 'Ready for handover',
  PENDING_REVIEW_STAGE_105: 'Pending review',
  VERIFIED_STAGE_106: 'Verified',
  ACTIVE_STAGE_107: 'Active',
  OVERDUE_STAGE_108: 'Overdue',
  OVERLOCKED_STAGE_109: 'Overlocked',
  SETTLED_STAGE_110: 'Settled',
  CANCELLED_STAGE_111: 'Cancelled',
  SCHEDULED_STAGE_112: 'Scheduled',
  HOLDING_STAGE_113: 'Hold active',
  EXPIRED_STAGE_114: 'Expired',
  SIGNED_STAGE_115: 'Signed',
  DRAFT_STAGE_116: 'Draft',
  ARCHIVED_STAGE_117: 'Archived',
  ESCALATED_STAGE_118: 'Escalated',
  COMPLETED_STAGE_119: 'Completed',
  REFUNDED_STAGE_120: 'Refunded',
  LIQUIDATING_STAGE_121: 'Liquidating',
  LOCKED_STAGE_122: 'Access locked',
  AVAILABLE_STAGE_123: 'Available',
  RESERVED_STAGE_124: 'Reserved',
  MAINTENANCE_STAGE_125: 'Maintenance',
  INSPECTED_STAGE_126: 'Inspected',
  DISPUTED_STAGE_127: 'Disputed',
  READY_HANDOVER_STAGE_128: 'Ready for handover',
  PENDING_REVIEW_STAGE_129: 'Pending review',
  VERIFIED_STAGE_130: 'Verified',
  ACTIVE_STAGE_131: 'Active',
  OVERDUE_STAGE_132: 'Overdue',
  OVERLOCKED_STAGE_133: 'Overlocked',
  SETTLED_STAGE_134: 'Settled',
  CANCELLED_STAGE_135: 'Cancelled',
  SCHEDULED_STAGE_136: 'Scheduled',
  HOLDING_STAGE_137: 'Hold active',
  EXPIRED_STAGE_138: 'Expired',
  SIGNED_STAGE_139: 'Signed',
  DRAFT_STAGE_140: 'Draft',
  ARCHIVED_STAGE_141: 'Archived',
  ESCALATED_STAGE_142: 'Escalated',
  COMPLETED_STAGE_143: 'Completed',
  REFUNDED_STAGE_144: 'Refunded',
  LIQUIDATING_STAGE_145: 'Liquidating',
  LOCKED_STAGE_146: 'Access locked',
  AVAILABLE_STAGE_147: 'Available',
  RESERVED_STAGE_148: 'Reserved',
  MAINTENANCE_STAGE_149: 'Maintenance',
  INSPECTED_STAGE_150: 'Inspected',
  DISPUTED_STAGE_151: 'Disputed',
  READY_HANDOVER_STAGE_152: 'Ready for handover',
  PENDING_REVIEW_STAGE_153: 'Pending review',
  VERIFIED_STAGE_154: 'Verified',
  ACTIVE_STAGE_155: 'Active',
  OVERDUE_STAGE_156: 'Overdue',
  OVERLOCKED_STAGE_157: 'Overlocked',
  SETTLED_STAGE_158: 'Settled',
  CANCELLED_STAGE_159: 'Cancelled',
  SCHEDULED_STAGE_160: 'Scheduled',
  HOLDING_STAGE_161: 'Hold active',
  EXPIRED_STAGE_162: 'Expired',
  SIGNED_STAGE_163: 'Signed',
  DRAFT_STAGE_164: 'Draft',
  ARCHIVED_STAGE_165: 'Archived',
  ESCALATED_STAGE_166: 'Escalated',
  COMPLETED_STAGE_167: 'Completed',
  REFUNDED_STAGE_168: 'Refunded',
  LIQUIDATING_STAGE_169: 'Liquidating',
  LOCKED_STAGE_170: 'Access locked',
  AVAILABLE_STAGE_171: 'Available',
  RESERVED_STAGE_172: 'Reserved',
  MAINTENANCE_STAGE_173: 'Maintenance',
  INSPECTED_STAGE_174: 'Inspected',
  DISPUTED_STAGE_175: 'Disputed',
  READY_HANDOVER_STAGE_176: 'Ready for handover',
  PENDING_REVIEW_STAGE_177: 'Pending review',
  VERIFIED_STAGE_178: 'Verified',
  ACTIVE_STAGE_179: 'Active',
  OVERDUE_STAGE_180: 'Overdue',
  OVERLOCKED_STAGE_181: 'Overlocked',
  SETTLED_STAGE_182: 'Settled',
  CANCELLED_STAGE_183: 'Cancelled',
  SCHEDULED_STAGE_184: 'Scheduled',
  HOLDING_STAGE_185: 'Hold active',
  EXPIRED_STAGE_186: 'Expired',
  SIGNED_STAGE_187: 'Signed',
  DRAFT_STAGE_188: 'Draft',
  ARCHIVED_STAGE_189: 'Archived',
  ESCALATED_STAGE_190: 'Escalated',
  COMPLETED_STAGE_191: 'Completed',
  REFUNDED_STAGE_192: 'Refunded',
  LIQUIDATING_STAGE_193: 'Liquidating',
  LOCKED_STAGE_194: 'Access locked',
  AVAILABLE_STAGE_195: 'Available',
  RESERVED_STAGE_196: 'Reserved',
  MAINTENANCE_STAGE_197: 'Maintenance',
  INSPECTED_STAGE_198: 'Inspected',
  DISPUTED_STAGE_199: 'Disputed',
  READY_HANDOVER_STAGE_200: 'Ready for handover',
  PENDING_REVIEW_STAGE_201: 'Pending review',
  VERIFIED_STAGE_202: 'Verified',
  ACTIVE_STAGE_203: 'Active',
  OVERDUE_STAGE_204: 'Overdue',
  OVERLOCKED_STAGE_205: 'Overlocked',
  SETTLED_STAGE_206: 'Settled',
  CANCELLED_STAGE_207: 'Cancelled',
  SCHEDULED_STAGE_208: 'Scheduled',
  HOLDING_STAGE_209: 'Hold active',
  EXPIRED_STAGE_210: 'Expired',
  SIGNED_STAGE_211: 'Signed',
  DRAFT_STAGE_212: 'Draft',
  ARCHIVED_STAGE_213: 'Archived',
  ESCALATED_STAGE_214: 'Escalated',
  COMPLETED_STAGE_215: 'Completed',
  REFUNDED_STAGE_216: 'Refunded',
  LIQUIDATING_STAGE_217: 'Liquidating',
  LOCKED_STAGE_218: 'Access locked',
  AVAILABLE_STAGE_219: 'Available',
  RESERVED_STAGE_220: 'Reserved',
  MAINTENANCE_STAGE_221: 'Maintenance',
  INSPECTED_STAGE_222: 'Inspected',
  DISPUTED_STAGE_223: 'Disputed',
  READY_HANDOVER_STAGE_224: 'Ready for handover',
  PENDING_REVIEW_STAGE_225: 'Pending review',
  VERIFIED_STAGE_226: 'Verified',
  ACTIVE_STAGE_227: 'Active',
  OVERDUE_STAGE_228: 'Overdue',
  OVERLOCKED_STAGE_229: 'Overlocked',
  SETTLED_STAGE_230: 'Settled',
  CANCELLED_STAGE_231: 'Cancelled',
  SCHEDULED_STAGE_232: 'Scheduled',
  HOLDING_STAGE_233: 'Hold active',
  EXPIRED_STAGE_234: 'Expired',
  SIGNED_STAGE_235: 'Signed',
  DRAFT_STAGE_236: 'Draft',
  ARCHIVED_STAGE_237: 'Archived',
  ESCALATED_STAGE_238: 'Escalated',
  COMPLETED_STAGE_239: 'Completed',
  REFUNDED_STAGE_240: 'Refunded',
  LIQUIDATING_STAGE_241: 'Liquidating',
  LOCKED_STAGE_242: 'Access locked',
  AVAILABLE_STAGE_243: 'Available',
  RESERVED_STAGE_244: 'Reserved',
  MAINTENANCE_STAGE_245: 'Maintenance',
  INSPECTED_STAGE_246: 'Inspected',
  DISPUTED_STAGE_247: 'Disputed',
  READY_HANDOVER_STAGE_248: 'Ready for handover',
  PENDING_REVIEW_STAGE_249: 'Pending review',
  VERIFIED_STAGE_250: 'Verified',
  ACTIVE_STAGE_251: 'Active',
  OVERDUE_STAGE_252: 'Overdue',
  OVERLOCKED_STAGE_253: 'Overlocked',
  SETTLED_STAGE_254: 'Settled',
  CANCELLED_STAGE_255: 'Cancelled',
  SCHEDULED_STAGE_256: 'Scheduled',
  HOLDING_STAGE_257: 'Hold active',
  EXPIRED_STAGE_258: 'Expired',
  SIGNED_STAGE_259: 'Signed',
  DRAFT_STAGE_260: 'Draft',
  ARCHIVED_STAGE_261: 'Archived',
  ESCALATED_STAGE_262: 'Escalated',
  COMPLETED_STAGE_263: 'Completed',
  REFUNDED_STAGE_264: 'Refunded',
  LIQUIDATING_STAGE_265: 'Liquidating',
  LOCKED_STAGE_266: 'Access locked',
  AVAILABLE_STAGE_267: 'Available',
  RESERVED_STAGE_268: 'Reserved',
  MAINTENANCE_STAGE_269: 'Maintenance',
  INSPECTED_STAGE_270: 'Inspected',
  DISPUTED_STAGE_271: 'Disputed',
  READY_HANDOVER_STAGE_272: 'Ready for handover',
  PENDING_REVIEW_STAGE_273: 'Pending review',
  VERIFIED_STAGE_274: 'Verified',
  ACTIVE_STAGE_275: 'Active',
  OVERDUE_STAGE_276: 'Overdue',
  OVERLOCKED_STAGE_277: 'Overlocked',
  SETTLED_STAGE_278: 'Settled',
  CANCELLED_STAGE_279: 'Cancelled',
  SCHEDULED_STAGE_280: 'Scheduled',
  HOLDING_STAGE_281: 'Hold active',
  EXPIRED_STAGE_282: 'Expired',
  SIGNED_STAGE_283: 'Signed',
  DRAFT_STAGE_284: 'Draft',
  ARCHIVED_STAGE_285: 'Archived',
  ESCALATED_STAGE_286: 'Escalated',
  COMPLETED_STAGE_287: 'Completed',
  REFUNDED_STAGE_288: 'Refunded',
  LIQUIDATING_STAGE_289: 'Liquidating',
  LOCKED_STAGE_290: 'Access locked',
  AVAILABLE_STAGE_291: 'Available',
  RESERVED_STAGE_292: 'Reserved',
  MAINTENANCE_STAGE_293: 'Maintenance',
  INSPECTED_STAGE_294: 'Inspected',
  DISPUTED_STAGE_295: 'Disputed',
  READY_HANDOVER_STAGE_296: 'Ready for handover',
  PENDING_REVIEW_STAGE_297: 'Pending review',
  VERIFIED_STAGE_298: 'Verified',
  ACTIVE_STAGE_299: 'Active',
  OVERDUE_STAGE_300: 'Overdue',
  OVERLOCKED_STAGE_301: 'Overlocked',
  SETTLED_STAGE_302: 'Settled',
  CANCELLED_STAGE_303: 'Cancelled',
  SCHEDULED_STAGE_304: 'Scheduled',
  HOLDING_STAGE_305: 'Hold active',
  EXPIRED_STAGE_306: 'Expired',
  SIGNED_STAGE_307: 'Signed',
  DRAFT_STAGE_308: 'Draft',
  ARCHIVED_STAGE_309: 'Archived',
  ESCALATED_STAGE_310: 'Escalated',
  COMPLETED_STAGE_311: 'Completed',
  REFUNDED_STAGE_312: 'Refunded',
  LIQUIDATING_STAGE_313: 'Liquidating',
  LOCKED_STAGE_314: 'Access locked',
  AVAILABLE_STAGE_315: 'Available',
  RESERVED_STAGE_316: 'Reserved',
  MAINTENANCE_STAGE_317: 'Maintenance',
  INSPECTED_STAGE_318: 'Inspected',
  DISPUTED_STAGE_319: 'Disputed',
  READY_HANDOVER_STAGE_320: 'Ready for handover',
  PENDING_REVIEW_STAGE_321: 'Pending review',
  VERIFIED_STAGE_322: 'Verified',
  ACTIVE_STAGE_323: 'Active',
  OVERDUE_STAGE_324: 'Overdue',
  OVERLOCKED_STAGE_325: 'Overlocked',
  SETTLED_STAGE_326: 'Settled',
  CANCELLED_STAGE_327: 'Cancelled',
  SCHEDULED_STAGE_328: 'Scheduled',
  HOLDING_STAGE_329: 'Hold active',
  EXPIRED_STAGE_330: 'Expired',
  SIGNED_STAGE_331: 'Signed',
  DRAFT_STAGE_332: 'Draft',
  ARCHIVED_STAGE_333: 'Archived',
  ESCALATED_STAGE_334: 'Escalated',
  COMPLETED_STAGE_335: 'Completed',
  REFUNDED_STAGE_336: 'Refunded',
  LIQUIDATING_STAGE_337: 'Liquidating',
  LOCKED_STAGE_338: 'Access locked',
  AVAILABLE_STAGE_339: 'Available',
  RESERVED_STAGE_340: 'Reserved',
  MAINTENANCE_STAGE_341: 'Maintenance',
  INSPECTED_STAGE_342: 'Inspected',
  DISPUTED_STAGE_343: 'Disputed',
  READY_HANDOVER_STAGE_344: 'Ready for handover',
  PENDING_REVIEW_STAGE_345: 'Pending review',
  VERIFIED_STAGE_346: 'Verified',
  ACTIVE_STAGE_347: 'Active',
  OVERDUE_STAGE_348: 'Overdue',
  OVERLOCKED_STAGE_349: 'Overlocked',
  SETTLED_STAGE_350: 'Settled',
  CANCELLED_STAGE_351: 'Cancelled',
  SCHEDULED_STAGE_352: 'Scheduled',
  HOLDING_STAGE_353: 'Hold active',
  EXPIRED_STAGE_354: 'Expired',
  SIGNED_STAGE_355: 'Signed',
  DRAFT_STAGE_356: 'Draft',
  ARCHIVED_STAGE_357: 'Archived',
  ESCALATED_STAGE_358: 'Escalated',
  COMPLETED_STAGE_359: 'Completed',
  REFUNDED_STAGE_360: 'Refunded',
  LIQUIDATING_STAGE_361: 'Liquidating',
  LOCKED_STAGE_362: 'Access locked',
  AVAILABLE_STAGE_363: 'Available',
  RESERVED_STAGE_364: 'Reserved',
  MAINTENANCE_STAGE_365: 'Maintenance',
  INSPECTED_STAGE_366: 'Inspected',
  DISPUTED_STAGE_367: 'Disputed',
  READY_HANDOVER_STAGE_368: 'Ready for handover',
  PENDING_REVIEW_STAGE_369: 'Pending review',
  VERIFIED_STAGE_370: 'Verified',
  ACTIVE_STAGE_371: 'Active',
  OVERDUE_STAGE_372: 'Overdue',
  OVERLOCKED_STAGE_373: 'Overlocked',
  SETTLED_STAGE_374: 'Settled',
  CANCELLED_STAGE_375: 'Cancelled',
  SCHEDULED_STAGE_376: 'Scheduled',
  HOLDING_STAGE_377: 'Hold active',
  EXPIRED_STAGE_378: 'Expired',
  SIGNED_STAGE_379: 'Signed',
  DRAFT_STAGE_380: 'Draft',
  ARCHIVED_STAGE_381: 'Archived',
  ESCALATED_STAGE_382: 'Escalated',
  COMPLETED_STAGE_383: 'Completed',
  REFUNDED_STAGE_384: 'Refunded',
  LIQUIDATING_STAGE_385: 'Liquidating',
  LOCKED_STAGE_386: 'Access locked',
  AVAILABLE_STAGE_387: 'Available',
  RESERVED_STAGE_388: 'Reserved',
  MAINTENANCE_STAGE_389: 'Maintenance',
  INSPECTED_STAGE_390: 'Inspected',
  DISPUTED_STAGE_391: 'Disputed',
  READY_HANDOVER_STAGE_392: 'Ready for handover',
  PENDING_REVIEW_STAGE_393: 'Pending review',
  VERIFIED_STAGE_394: 'Verified',
  ACTIVE_STAGE_395: 'Active',
  OVERDUE_STAGE_396: 'Overdue',
  OVERLOCKED_STAGE_397: 'Overlocked',
  SETTLED_STAGE_398: 'Settled',
  CANCELLED_STAGE_399: 'Cancelled',
  SCHEDULED_STAGE_400: 'Scheduled',
  HOLDING_STAGE_401: 'Hold active',
  EXPIRED_STAGE_402: 'Expired',
  SIGNED_STAGE_403: 'Signed',
  DRAFT_STAGE_404: 'Draft',
  ARCHIVED_STAGE_405: 'Archived',
  ESCALATED_STAGE_406: 'Escalated',
  COMPLETED_STAGE_407: 'Completed',
  REFUNDED_STAGE_408: 'Refunded',
  LIQUIDATING_STAGE_409: 'Liquidating',
  LOCKED_STAGE_410: 'Access locked',
  AVAILABLE_STAGE_411: 'Available',
  RESERVED_STAGE_412: 'Reserved',
  MAINTENANCE_STAGE_413: 'Maintenance',
  INSPECTED_STAGE_414: 'Inspected',
  DISPUTED_STAGE_415: 'Disputed',
  READY_HANDOVER_STAGE_416: 'Ready for handover',
  PENDING_REVIEW_STAGE_417: 'Pending review',
  VERIFIED_STAGE_418: 'Verified',
  ACTIVE_STAGE_419: 'Active',
  OVERDUE_STAGE_420: 'Overdue',
  OVERLOCKED_STAGE_421: 'Overlocked',
  SETTLED_STAGE_422: 'Settled',
  CANCELLED_STAGE_423: 'Cancelled',
  SCHEDULED_STAGE_424: 'Scheduled',
  HOLDING_STAGE_425: 'Hold active',
  EXPIRED_STAGE_426: 'Expired',
  SIGNED_STAGE_427: 'Signed',
  DRAFT_STAGE_428: 'Draft',
  ARCHIVED_STAGE_429: 'Archived',
  ESCALATED_STAGE_430: 'Escalated',
  COMPLETED_STAGE_431: 'Completed',
  REFUNDED_STAGE_432: 'Refunded',
  LIQUIDATING_STAGE_433: 'Liquidating',
  LOCKED_STAGE_434: 'Access locked',
  AVAILABLE_STAGE_435: 'Available',
  RESERVED_STAGE_436: 'Reserved',
  MAINTENANCE_STAGE_437: 'Maintenance',
  INSPECTED_STAGE_438: 'Inspected',
  DISPUTED_STAGE_439: 'Disputed',
  READY_HANDOVER_STAGE_440: 'Ready for handover',
  PENDING_REVIEW_STAGE_441: 'Pending review',
  VERIFIED_STAGE_442: 'Verified',
  ACTIVE_STAGE_443: 'Active',
  OVERDUE_STAGE_444: 'Overdue',
  OVERLOCKED_STAGE_445: 'Overlocked',
  SETTLED_STAGE_446: 'Settled',
  CANCELLED_STAGE_447: 'Cancelled',
  SCHEDULED_STAGE_448: 'Scheduled',
  HOLDING_STAGE_449: 'Hold active',
  EXPIRED_STAGE_450: 'Expired',
  SIGNED_STAGE_451: 'Signed',
  DRAFT_STAGE_452: 'Draft',
  ARCHIVED_STAGE_453: 'Archived',
  ESCALATED_STAGE_454: 'Escalated',
  COMPLETED_STAGE_455: 'Completed',
  REFUNDED_STAGE_456: 'Refunded',
  LIQUIDATING_STAGE_457: 'Liquidating',
  LOCKED_STAGE_458: 'Access locked',
  AVAILABLE_STAGE_459: 'Available',
  RESERVED_STAGE_460: 'Reserved',
  MAINTENANCE_STAGE_461: 'Maintenance',
  INSPECTED_STAGE_462: 'Inspected',
  DISPUTED_STAGE_463: 'Disputed',
  READY_HANDOVER_STAGE_464: 'Ready for handover',
  PENDING_REVIEW_STAGE_465: 'Pending review',
  VERIFIED_STAGE_466: 'Verified',
  ACTIVE_STAGE_467: 'Active',
  OVERDUE_STAGE_468: 'Overdue',
  OVERLOCKED_STAGE_469: 'Overlocked',
  SETTLED_STAGE_470: 'Settled',
  CANCELLED_STAGE_471: 'Cancelled',
  SCHEDULED_STAGE_472: 'Scheduled',
  HOLDING_STAGE_473: 'Hold active',
  EXPIRED_STAGE_474: 'Expired',
  SIGNED_STAGE_475: 'Signed',
  DRAFT_STAGE_476: 'Draft',
  ARCHIVED_STAGE_477: 'Archived',
  ESCALATED_STAGE_478: 'Escalated',
  COMPLETED_STAGE_479: 'Completed',
  REFUNDED_STAGE_480: 'Refunded',
  LIQUIDATING_STAGE_481: 'Liquidating',
  LOCKED_STAGE_482: 'Access locked',
  AVAILABLE_STAGE_483: 'Available',
  RESERVED_STAGE_484: 'Reserved',
  MAINTENANCE_STAGE_485: 'Maintenance',
  INSPECTED_STAGE_486: 'Inspected',
  DISPUTED_STAGE_487: 'Disputed',
  READY_HANDOVER_STAGE_488: 'Ready for handover',
  PENDING_REVIEW_STAGE_489: 'Pending review',
  VERIFIED_STAGE_490: 'Verified',
  ACTIVE_STAGE_491: 'Active',
  OVERDUE_STAGE_492: 'Overdue',
  OVERLOCKED_STAGE_493: 'Overlocked',
  SETTLED_STAGE_494: 'Settled',
  CANCELLED_STAGE_495: 'Cancelled',
  SCHEDULED_STAGE_496: 'Scheduled',
  HOLDING_STAGE_497: 'Hold active',
  EXPIRED_STAGE_498: 'Expired',
  SIGNED_STAGE_499: 'Signed',
  DRAFT_STAGE_500: 'Draft',
  ARCHIVED_STAGE_501: 'Archived',
  ESCALATED_STAGE_502: 'Escalated',
  COMPLETED_STAGE_503: 'Completed',
  REFUNDED_STAGE_504: 'Refunded',
  LIQUIDATING_STAGE_505: 'Liquidating',
  LOCKED_STAGE_506: 'Access locked',
  AVAILABLE_STAGE_507: 'Available',
  RESERVED_STAGE_508: 'Reserved',
  MAINTENANCE_STAGE_509: 'Maintenance',
  INSPECTED_STAGE_510: 'Inspected',
  DISPUTED_STAGE_511: 'Disputed',
  READY_HANDOVER_STAGE_512: 'Ready for handover',
  PENDING_REVIEW_STAGE_513: 'Pending review',
  VERIFIED_STAGE_514: 'Verified',
  ACTIVE_STAGE_515: 'Active',
  OVERDUE_STAGE_516: 'Overdue',
  OVERLOCKED_STAGE_517: 'Overlocked',
  SETTLED_STAGE_518: 'Settled',
  CANCELLED_STAGE_519: 'Cancelled',
  SCHEDULED_STAGE_520: 'Scheduled',
  HOLDING_STAGE_521: 'Hold active',
  EXPIRED_STAGE_522: 'Expired',
  SIGNED_STAGE_523: 'Signed',
  DRAFT_STAGE_524: 'Draft',
  ARCHIVED_STAGE_525: 'Archived',
  ESCALATED_STAGE_526: 'Escalated',
  COMPLETED_STAGE_527: 'Completed',
  REFUNDED_STAGE_528: 'Refunded',
  LIQUIDATING_STAGE_529: 'Liquidating',
  LOCKED_STAGE_530: 'Access locked',
  AVAILABLE_STAGE_531: 'Available',
  RESERVED_STAGE_532: 'Reserved',
  MAINTENANCE_STAGE_533: 'Maintenance',
  INSPECTED_STAGE_534: 'Inspected',
  DISPUTED_STAGE_535: 'Disputed',
  READY_HANDOVER_STAGE_536: 'Ready for handover',
  PENDING_REVIEW_STAGE_537: 'Pending review',
  VERIFIED_STAGE_538: 'Verified',
  ACTIVE_STAGE_539: 'Active',
  OVERDUE_STAGE_540: 'Overdue',
  OVERLOCKED_STAGE_541: 'Overlocked',
  SETTLED_STAGE_542: 'Settled',
  CANCELLED_STAGE_543: 'Cancelled',
  SCHEDULED_STAGE_544: 'Scheduled',
  HOLDING_STAGE_545: 'Hold active',
  EXPIRED_STAGE_546: 'Expired',
  SIGNED_STAGE_547: 'Signed',
  DRAFT_STAGE_548: 'Draft',
  ARCHIVED_STAGE_549: 'Archived',
  ESCALATED_STAGE_550: 'Escalated',
  COMPLETED_STAGE_551: 'Completed',
  REFUNDED_STAGE_552: 'Refunded',
  LIQUIDATING_STAGE_553: 'Liquidating',
  LOCKED_STAGE_554: 'Access locked',
  AVAILABLE_STAGE_555: 'Available',
  RESERVED_STAGE_556: 'Reserved',
  MAINTENANCE_STAGE_557: 'Maintenance',
  INSPECTED_STAGE_558: 'Inspected',
  DISPUTED_STAGE_559: 'Disputed',
  READY_HANDOVER_STAGE_560: 'Ready for handover',
  PENDING_REVIEW_STAGE_561: 'Pending review',
  VERIFIED_STAGE_562: 'Verified',
  ACTIVE_STAGE_563: 'Active',
  OVERDUE_STAGE_564: 'Overdue',
  OVERLOCKED_STAGE_565: 'Overlocked',
  SETTLED_STAGE_566: 'Settled',
  CANCELLED_STAGE_567: 'Cancelled',
  SCHEDULED_STAGE_568: 'Scheduled',
  HOLDING_STAGE_569: 'Hold active',
  EXPIRED_STAGE_570: 'Expired',
  SIGNED_STAGE_571: 'Signed',
  DRAFT_STAGE_572: 'Draft',
  ARCHIVED_STAGE_573: 'Archived',
  ESCALATED_STAGE_574: 'Escalated',
  COMPLETED_STAGE_575: 'Completed',
  REFUNDED_STAGE_576: 'Refunded',
  LIQUIDATING_STAGE_577: 'Liquidating',
  LOCKED_STAGE_578: 'Access locked',
  AVAILABLE_STAGE_579: 'Available',
  RESERVED_STAGE_580: 'Reserved',
  MAINTENANCE_STAGE_581: 'Maintenance',
  INSPECTED_STAGE_582: 'Inspected',
  DISPUTED_STAGE_583: 'Disputed',
  READY_HANDOVER_STAGE_584: 'Ready for handover',
  PENDING_REVIEW_STAGE_585: 'Pending review',
  VERIFIED_STAGE_586: 'Verified',
  ACTIVE_STAGE_587: 'Active',
  OVERDUE_STAGE_588: 'Overdue',
  OVERLOCKED_STAGE_589: 'Overlocked',
  SETTLED_STAGE_590: 'Settled',
  CANCELLED_STAGE_591: 'Cancelled',
  SCHEDULED_STAGE_592: 'Scheduled',
  HOLDING_STAGE_593: 'Hold active',
  EXPIRED_STAGE_594: 'Expired',
  SIGNED_STAGE_595: 'Signed',
  DRAFT_STAGE_596: 'Draft',
  ARCHIVED_STAGE_597: 'Archived',
  ESCALATED_STAGE_598: 'Escalated',
  COMPLETED_STAGE_599: 'Completed',
  REFUNDED_STAGE_600: 'Refunded',
  LIQUIDATING_STAGE_601: 'Liquidating',
  LOCKED_STAGE_602: 'Access locked',
  AVAILABLE_STAGE_603: 'Available',
  RESERVED_STAGE_604: 'Reserved',
  MAINTENANCE_STAGE_605: 'Maintenance',
  INSPECTED_STAGE_606: 'Inspected',
  DISPUTED_STAGE_607: 'Disputed',
  READY_HANDOVER_STAGE_608: 'Ready for handover',
  PENDING_REVIEW_STAGE_609: 'Pending review',
  VERIFIED_STAGE_610: 'Verified',
  ACTIVE_STAGE_611: 'Active',
  OVERDUE_STAGE_612: 'Overdue',
  OVERLOCKED_STAGE_613: 'Overlocked',
  SETTLED_STAGE_614: 'Settled',
  CANCELLED_STAGE_615: 'Cancelled',
  SCHEDULED_STAGE_616: 'Scheduled',
  HOLDING_STAGE_617: 'Hold active',
  EXPIRED_STAGE_618: 'Expired',
  SIGNED_STAGE_619: 'Signed',
  DRAFT_STAGE_620: 'Draft',
  ARCHIVED_STAGE_621: 'Archived',
  ESCALATED_STAGE_622: 'Escalated',
  COMPLETED_STAGE_623: 'Completed',
  REFUNDED_STAGE_624: 'Refunded',
  LIQUIDATING_STAGE_625: 'Liquidating',
  LOCKED_STAGE_626: 'Access locked',
  AVAILABLE_STAGE_627: 'Available',
  RESERVED_STAGE_628: 'Reserved',
  MAINTENANCE_STAGE_629: 'Maintenance',
  INSPECTED_STAGE_630: 'Inspected',
  DISPUTED_STAGE_631: 'Disputed',
  READY_HANDOVER_STAGE_632: 'Ready for handover',
  PENDING_REVIEW_STAGE_633: 'Pending review',
  VERIFIED_STAGE_634: 'Verified',
  ACTIVE_STAGE_635: 'Active',
  OVERDUE_STAGE_636: 'Overdue',
  OVERLOCKED_STAGE_637: 'Overlocked',
  SETTLED_STAGE_638: 'Settled',
  CANCELLED_STAGE_639: 'Cancelled',
  SCHEDULED_STAGE_640: 'Scheduled',
  HOLDING_STAGE_641: 'Hold active',
  EXPIRED_STAGE_642: 'Expired',
  SIGNED_STAGE_643: 'Signed',
  DRAFT_STAGE_644: 'Draft',
  ARCHIVED_STAGE_645: 'Archived',
  ESCALATED_STAGE_646: 'Escalated',
  COMPLETED_STAGE_647: 'Completed',
  REFUNDED_STAGE_648: 'Refunded',
  LIQUIDATING_STAGE_649: 'Liquidating',
  LOCKED_STAGE_650: 'Access locked',
  AVAILABLE_STAGE_651: 'Available',
  RESERVED_STAGE_652: 'Reserved',
  MAINTENANCE_STAGE_653: 'Maintenance',
  INSPECTED_STAGE_654: 'Inspected',
  DISPUTED_STAGE_655: 'Disputed',
  READY_HANDOVER_STAGE_656: 'Ready for handover',
  PENDING_REVIEW_STAGE_657: 'Pending review',
  VERIFIED_STAGE_658: 'Verified',
  ACTIVE_STAGE_659: 'Active',
  OVERDUE_STAGE_660: 'Overdue',
  OVERLOCKED_STAGE_661: 'Overlocked',
  SETTLED_STAGE_662: 'Settled',
  CANCELLED_STAGE_663: 'Cancelled',
  SCHEDULED_STAGE_664: 'Scheduled',
  HOLDING_STAGE_665: 'Hold active',
  EXPIRED_STAGE_666: 'Expired',
  SIGNED_STAGE_667: 'Signed',
  DRAFT_STAGE_668: 'Draft',
  ARCHIVED_STAGE_669: 'Archived',
  ESCALATED_STAGE_670: 'Escalated',
  COMPLETED_STAGE_671: 'Completed',
  REFUNDED_STAGE_672: 'Refunded',
  LIQUIDATING_STAGE_673: 'Liquidating',
  LOCKED_STAGE_674: 'Access locked',
  AVAILABLE_STAGE_675: 'Available',
  RESERVED_STAGE_676: 'Reserved',
  MAINTENANCE_STAGE_677: 'Maintenance',
  INSPECTED_STAGE_678: 'Inspected',
  DISPUTED_STAGE_679: 'Disputed',
  READY_HANDOVER_STAGE_680: 'Ready for handover',
  PENDING_REVIEW_STAGE_681: 'Pending review',
  VERIFIED_STAGE_682: 'Verified',
  ACTIVE_STAGE_683: 'Active',
  OVERDUE_STAGE_684: 'Overdue',
  OVERLOCKED_STAGE_685: 'Overlocked',
  SETTLED_STAGE_686: 'Settled',
  CANCELLED_STAGE_687: 'Cancelled',
  SCHEDULED_STAGE_688: 'Scheduled',
  HOLDING_STAGE_689: 'Hold active',
  EXPIRED_STAGE_690: 'Expired',
  SIGNED_STAGE_691: 'Signed',
  DRAFT_STAGE_692: 'Draft',
  ARCHIVED_STAGE_693: 'Archived',
  ESCALATED_STAGE_694: 'Escalated',
  COMPLETED_STAGE_695: 'Completed',
  REFUNDED_STAGE_696: 'Refunded',
  LIQUIDATING_STAGE_697: 'Liquidating',
  LOCKED_STAGE_698: 'Access locked',
  AVAILABLE_STAGE_699: 'Available',
  RESERVED_STAGE_700: 'Reserved',
  MAINTENANCE_STAGE_701: 'Maintenance',
  INSPECTED_STAGE_702: 'Inspected',
  DISPUTED_STAGE_703: 'Disputed',
  READY_HANDOVER_STAGE_704: 'Ready for handover',
  PENDING_REVIEW_STAGE_705: 'Pending review',
  VERIFIED_STAGE_706: 'Verified',
  ACTIVE_STAGE_707: 'Active',
  OVERDUE_STAGE_708: 'Overdue',
  OVERLOCKED_STAGE_709: 'Overlocked',
  SETTLED_STAGE_710: 'Settled',
  CANCELLED_STAGE_711: 'Cancelled',
  SCHEDULED_STAGE_712: 'Scheduled',
  HOLDING_STAGE_713: 'Hold active',
  EXPIRED_STAGE_714: 'Expired',
  SIGNED_STAGE_715: 'Signed',
  DRAFT_STAGE_716: 'Draft',
  ARCHIVED_STAGE_717: 'Archived',
  ESCALATED_STAGE_718: 'Escalated',
  COMPLETED_STAGE_719: 'Completed',
  REFUNDED_STAGE_720: 'Refunded',
  LIQUIDATING_STAGE_721: 'Liquidating',
  LOCKED_STAGE_722: 'Access locked',
  AVAILABLE_STAGE_723: 'Available',
  RESERVED_STAGE_724: 'Reserved',
  MAINTENANCE_STAGE_725: 'Maintenance',
  INSPECTED_STAGE_726: 'Inspected',
  DISPUTED_STAGE_727: 'Disputed',
  READY_HANDOVER_STAGE_728: 'Ready for handover',
  PENDING_REVIEW_STAGE_729: 'Pending review',
  VERIFIED_STAGE_730: 'Verified',
  ACTIVE_STAGE_731: 'Active',
  OVERDUE_STAGE_732: 'Overdue',
  OVERLOCKED_STAGE_733: 'Overlocked',
  SETTLED_STAGE_734: 'Settled',
  CANCELLED_STAGE_735: 'Cancelled',
  SCHEDULED_STAGE_736: 'Scheduled',
  HOLDING_STAGE_737: 'Hold active',
  EXPIRED_STAGE_738: 'Expired',
  SIGNED_STAGE_739: 'Signed',
  DRAFT_STAGE_740: 'Draft',
  ARCHIVED_STAGE_741: 'Archived',
  ESCALATED_STAGE_742: 'Escalated',
  COMPLETED_STAGE_743: 'Completed',
  REFUNDED_STAGE_744: 'Refunded',
  LIQUIDATING_STAGE_745: 'Liquidating',
  LOCKED_STAGE_746: 'Access locked',
  AVAILABLE_STAGE_747: 'Available',
  RESERVED_STAGE_748: 'Reserved',
  MAINTENANCE_STAGE_749: 'Maintenance',
  INSPECTED_STAGE_750: 'Inspected',
  DISPUTED_STAGE_751: 'Disputed',
  READY_HANDOVER_STAGE_752: 'Ready for handover',
  PENDING_REVIEW_STAGE_753: 'Pending review',
  VERIFIED_STAGE_754: 'Verified',
  ACTIVE_STAGE_755: 'Active',
  OVERDUE_STAGE_756: 'Overdue',
  OVERLOCKED_STAGE_757: 'Overlocked',
  SETTLED_STAGE_758: 'Settled',
  CANCELLED_STAGE_759: 'Cancelled',
  SCHEDULED_STAGE_760: 'Scheduled',
  HOLDING_STAGE_761: 'Hold active',
  EXPIRED_STAGE_762: 'Expired',
  SIGNED_STAGE_763: 'Signed',
  DRAFT_STAGE_764: 'Draft',
  ARCHIVED_STAGE_765: 'Archived',
  ESCALATED_STAGE_766: 'Escalated',
  COMPLETED_STAGE_767: 'Completed',
  REFUNDED_STAGE_768: 'Refunded',
  LIQUIDATING_STAGE_769: 'Liquidating',
  LOCKED_STAGE_770: 'Access locked',
  AVAILABLE_STAGE_771: 'Available',
  RESERVED_STAGE_772: 'Reserved',
  MAINTENANCE_STAGE_773: 'Maintenance',
  INSPECTED_STAGE_774: 'Inspected',
  DISPUTED_STAGE_775: 'Disputed',
  READY_HANDOVER_STAGE_776: 'Ready for handover',
  PENDING_REVIEW_STAGE_777: 'Pending review',
  VERIFIED_STAGE_778: 'Verified',
  ACTIVE_STAGE_779: 'Active',
  OVERDUE_STAGE_780: 'Overdue',
  OVERLOCKED_STAGE_781: 'Overlocked',
  SETTLED_STAGE_782: 'Settled',
  CANCELLED_STAGE_783: 'Cancelled',
  SCHEDULED_STAGE_784: 'Scheduled',
  HOLDING_STAGE_785: 'Hold active',
  EXPIRED_STAGE_786: 'Expired',
  SIGNED_STAGE_787: 'Signed',
  DRAFT_STAGE_788: 'Draft',
  ARCHIVED_STAGE_789: 'Archived',
  ESCALATED_STAGE_790: 'Escalated',
  COMPLETED_STAGE_791: 'Completed',
  REFUNDED_STAGE_792: 'Refunded',
  LIQUIDATING_STAGE_793: 'Liquidating',
  LOCKED_STAGE_794: 'Access locked',
  AVAILABLE_STAGE_795: 'Available',
  RESERVED_STAGE_796: 'Reserved',
  MAINTENANCE_STAGE_797: 'Maintenance',
  INSPECTED_STAGE_798: 'Inspected',
  DISPUTED_STAGE_799: 'Disputed',
  READY_HANDOVER_STAGE_800: 'Ready for handover',
  PENDING_REVIEW_STAGE_801: 'Pending review',
  VERIFIED_STAGE_802: 'Verified',
  ACTIVE_STAGE_803: 'Active',
  OVERDUE_STAGE_804: 'Overdue',
  OVERLOCKED_STAGE_805: 'Overlocked',
  SETTLED_STAGE_806: 'Settled',
  CANCELLED_STAGE_807: 'Cancelled',
  SCHEDULED_STAGE_808: 'Scheduled',
  HOLDING_STAGE_809: 'Hold active',
  EXPIRED_STAGE_810: 'Expired',
  SIGNED_STAGE_811: 'Signed',
  DRAFT_STAGE_812: 'Draft',
  ARCHIVED_STAGE_813: 'Archived',
  ESCALATED_STAGE_814: 'Escalated',
  COMPLETED_STAGE_815: 'Completed',
  REFUNDED_STAGE_816: 'Refunded',
  LIQUIDATING_STAGE_817: 'Liquidating',
  LOCKED_STAGE_818: 'Access locked',
  AVAILABLE_STAGE_819: 'Available',
  RESERVED_STAGE_820: 'Reserved',
  MAINTENANCE_STAGE_821: 'Maintenance',
  INSPECTED_STAGE_822: 'Inspected',
  DISPUTED_STAGE_823: 'Disputed',
  READY_HANDOVER_STAGE_824: 'Ready for handover',
  PENDING_REVIEW_STAGE_825: 'Pending review',
  VERIFIED_STAGE_826: 'Verified',
  ACTIVE_STAGE_827: 'Active',
  OVERDUE_STAGE_828: 'Overdue',
  OVERLOCKED_STAGE_829: 'Overlocked',
  SETTLED_STAGE_830: 'Settled',
  CANCELLED_STAGE_831: 'Cancelled',
  SCHEDULED_STAGE_832: 'Scheduled',
  HOLDING_STAGE_833: 'Hold active',
  EXPIRED_STAGE_834: 'Expired',
  SIGNED_STAGE_835: 'Signed',
  DRAFT_STAGE_836: 'Draft',
  ARCHIVED_STAGE_837: 'Archived',
  ESCALATED_STAGE_838: 'Escalated',
  COMPLETED_STAGE_839: 'Completed',
  REFUNDED_STAGE_840: 'Refunded',
  LIQUIDATING_STAGE_841: 'Liquidating',
  LOCKED_STAGE_842: 'Access locked',
  AVAILABLE_STAGE_843: 'Available',
  RESERVED_STAGE_844: 'Reserved',
  MAINTENANCE_STAGE_845: 'Maintenance',
  INSPECTED_STAGE_846: 'Inspected',
  DISPUTED_STAGE_847: 'Disputed',
  READY_HANDOVER_STAGE_848: 'Ready for handover',
  PENDING_REVIEW_STAGE_849: 'Pending review',
  VERIFIED_STAGE_850: 'Verified',
  ACTIVE_STAGE_851: 'Active',
  OVERDUE_STAGE_852: 'Overdue',
  OVERLOCKED_STAGE_853: 'Overlocked',
  SETTLED_STAGE_854: 'Settled',
  CANCELLED_STAGE_855: 'Cancelled',
  SCHEDULED_STAGE_856: 'Scheduled',
  HOLDING_STAGE_857: 'Hold active',
  EXPIRED_STAGE_858: 'Expired',
  SIGNED_STAGE_859: 'Signed',
  DRAFT_STAGE_860: 'Draft',
  ARCHIVED_STAGE_861: 'Archived',
  ESCALATED_STAGE_862: 'Escalated',
  COMPLETED_STAGE_863: 'Completed',
  REFUNDED_STAGE_864: 'Refunded',
  LIQUIDATING_STAGE_865: 'Liquidating',
  LOCKED_STAGE_866: 'Access locked',
  AVAILABLE_STAGE_867: 'Available',
  RESERVED_STAGE_868: 'Reserved',
  MAINTENANCE_STAGE_869: 'Maintenance',
  INSPECTED_STAGE_870: 'Inspected',
  DISPUTED_STAGE_871: 'Disputed',
  READY_HANDOVER_STAGE_872: 'Ready for handover',
  PENDING_REVIEW_STAGE_873: 'Pending review',
  VERIFIED_STAGE_874: 'Verified',
  ACTIVE_STAGE_875: 'Active',
  OVERDUE_STAGE_876: 'Overdue',
  OVERLOCKED_STAGE_877: 'Overlocked',
  SETTLED_STAGE_878: 'Settled',
  CANCELLED_STAGE_879: 'Cancelled',
  SCHEDULED_STAGE_880: 'Scheduled',
  HOLDING_STAGE_881: 'Hold active',
  EXPIRED_STAGE_882: 'Expired',
  SIGNED_STAGE_883: 'Signed',
  DRAFT_STAGE_884: 'Draft',
  ARCHIVED_STAGE_885: 'Archived',
  ESCALATED_STAGE_886: 'Escalated',
  COMPLETED_STAGE_887: 'Completed',
  REFUNDED_STAGE_888: 'Refunded',
  LIQUIDATING_STAGE_889: 'Liquidating',
  LOCKED_STAGE_890: 'Access locked',
  AVAILABLE_STAGE_891: 'Available',
  RESERVED_STAGE_892: 'Reserved',
  MAINTENANCE_STAGE_893: 'Maintenance',
  INSPECTED_STAGE_894: 'Inspected',
  DISPUTED_STAGE_895: 'Disputed',
  READY_HANDOVER_STAGE_896: 'Ready for handover',
  PENDING_REVIEW_STAGE_897: 'Pending review',
  VERIFIED_STAGE_898: 'Verified',
  ACTIVE_STAGE_899: 'Active',
  OVERDUE_STAGE_900: 'Overdue',
  OVERLOCKED_STAGE_901: 'Overlocked',
  SETTLED_STAGE_902: 'Settled',
  CANCELLED_STAGE_903: 'Cancelled',
  SCHEDULED_STAGE_904: 'Scheduled',
  HOLDING_STAGE_905: 'Hold active',
  EXPIRED_STAGE_906: 'Expired',
  SIGNED_STAGE_907: 'Signed',
  DRAFT_STAGE_908: 'Draft',
  ARCHIVED_STAGE_909: 'Archived',
  ESCALATED_STAGE_910: 'Escalated',
  COMPLETED_STAGE_911: 'Completed',
  REFUNDED_STAGE_912: 'Refunded',
  LIQUIDATING_STAGE_913: 'Liquidating',
  LOCKED_STAGE_914: 'Access locked',
  AVAILABLE_STAGE_915: 'Available',
  RESERVED_STAGE_916: 'Reserved',
};
