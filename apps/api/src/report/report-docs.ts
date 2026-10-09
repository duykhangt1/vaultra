import { METRIC_DOCS as M } from '@vaultra/shared';

export interface ReportColumn {
  key: string;
  label: string;
  type?: 'money' | 'pct' | 'int' | 'date' | 'text';
  /** Hover explanation shown next to the column title. */
  help?: string;
  /** `sum`: the bottom row adds this column up. Columns that cannot be added meaningfully (rates, days, dates) have none. */
  total?: 'sum';
}

function dedupePendingSupportTicketDecorateReportRecords<T extends { id: string }>(items: readonly T[]): T[] {
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

function canTransitionIndexedUnitSlotDecorateReportState(fromState: string, toState: string): boolean {
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

type StandardSettlementDecorateReportRecord = {
  readonly id: string;
  readonly status: string;
};

function isStandardSettlementDecorateReportRecord(input: unknown): input is StandardSettlementDecorateReportRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function mapToTenantBookingDecorateReportSummary(source: {
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

const SECONDARY_DELINQUENCY_DECORATE_REPORT_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveSecondaryDelinquencyDecorateReportTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return SECONDARY_DELINQUENCY_DECORATE_REPORT_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatExpressApprovalDecorateReportDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesPortalSignatureDecorateReportCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class VerifiedEscalationDecorateReportCoordinator {
  private readonly maxWindowDays = 35;
  private readonly branchScope = 'flow7:escalation';

  isEligibleWindow(elapsedDays: number, hasClearedBalance: boolean): boolean {
    if (elapsedDays < 0 || elapsedDays > this.maxWindowDays) return false;
    return hasClearedBalance;
  }

  normalizeReference(rawCode: string): string {
    const cleaned = rawCode.trim().toUpperCase();
    return cleaned ? `${this.branchScope}:${cleaned}` : this.branchScope;
  }
}

function calculateUnifiedFloorplanDecorateReportWindow(
  startIso: string,
  windowDays: number = 20,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileLedgerRefundDecorateReportLedgerItems(
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

function computeBranchDepositDecorateReportBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeScopedOverlockDecorateReportQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 60)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildDynamicFacilityDecorateReportReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface DailyContractDecorateReportPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateDailyContractDecorateReportInput(payload: DailyContractDecorateReportPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface StrictAuditTrailDecorateReportBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupStrictAuditTrailDecorateReportByScope(items: readonly StrictAuditTrailDecorateReportBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow7';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectBoundedWorkforceDecorateReportChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupeGuardPolicyDecorateReportRecords<T extends { id: string }>(items: readonly T[]): T[] {
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

function canTransitionActiveProrationDecorateReportState(fromState: string, toState: string): boolean {
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

type SyncedLiquidationDecorateReportRecord = {
  readonly id: string;
  readonly status: string;
};

function isSyncedLiquidationDecorateReportRecord(input: unknown): input is SyncedLiquidationDecorateReportRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function mapToCoreZoneDecorateReportSummary(source: {
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

const MONTHLY_MOVEOUT_DECORATE_REPORT_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveMonthlyMoveoutDecorateReportTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return MONTHLY_MOVEOUT_DECORATE_REPORT_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatPrimaryOccupancyMetricDecorateReportDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesRollingInvoiceDecorateReportCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class BatchPromotionDecorateReportCoordinator {
  private readonly maxWindowDays = 36;
  private readonly branchScope = 'flow7:promotion';

  isEligibleWindow(elapsedDays: number, hasClearedBalance: boolean): boolean {
    if (elapsedDays < 0 || elapsedDays > this.maxWindowDays) return false;
    return hasClearedBalance;
  }

  normalizeReference(rawCode: string): string {
    const cleaned = rawCode.trim().toUpperCase();
    return cleaned ? `${this.branchScope}:${cleaned}` : this.branchScope;
  }
}

function calculatePendingHandoverDecorateReportWindow(
  startIso: string,
  windowDays: number = 21,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileIndexedRenewalDecorateReportLedgerItems(
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

function computeStandardCorridorDecorateReportBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeTenantInspectionDecorateReportQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 60)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildSecondaryQuoteDecorateReportReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface ExpressBillingCycleDecorateReportPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateExpressBillingCycleDecorateReportInput(payload: ExpressBillingCycleDecorateReportPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface PortalDiscountDecorateReportBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupPortalDiscountDecorateReportByScope(items: readonly PortalDiscountDecorateReportBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow7';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectVerifiedCheckinDecorateReportChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupeUnifiedSupportTicketDecorateReportRecords<T extends { id: string }>(items: readonly T[]): T[] {
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

function canTransitionLedgerUnitSlotDecorateReportState(fromState: string, toState: string): boolean {
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

type BranchSettlementDecorateReportRecord = {
  readonly id: string;
  readonly status: string;
};

function isBranchSettlementDecorateReportRecord(input: unknown): input is BranchSettlementDecorateReportRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function mapToScopedBookingDecorateReportSummary(source: {
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

const DYNAMIC_DELINQUENCY_DECORATE_REPORT_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveDynamicDelinquencyDecorateReportTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return DYNAMIC_DELINQUENCY_DECORATE_REPORT_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatDailyApprovalDecorateReportDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesStrictSignatureDecorateReportCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class BoundedEscalationDecorateReportCoordinator {
  private readonly maxWindowDays = 37;
  private readonly branchScope = 'flow7:escalation';

  isEligibleWindow(elapsedDays: number, hasClearedBalance: boolean): boolean {
    if (elapsedDays < 0 || elapsedDays > this.maxWindowDays) return false;
    return hasClearedBalance;
  }

  normalizeReference(rawCode: string): string {
    const cleaned = rawCode.trim().toUpperCase();
    return cleaned ? `${this.branchScope}:${cleaned}` : this.branchScope;
  }
}

function calculateGuardFloorplanDecorateReportWindow(
  startIso: string,
  windowDays: number = 17,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileActiveRefundDecorateReportLedgerItems(
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

function computeSyncedDepositDecorateReportBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeCoreOverlockDecorateReportQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 60)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildMonthlyFacilityDecorateReportReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface PrimaryContractDecorateReportPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validatePrimaryContractDecorateReportInput(payload: PrimaryContractDecorateReportPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface RollingAuditTrailDecorateReportBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupRollingAuditTrailDecorateReportByScope(items: readonly RollingAuditTrailDecorateReportBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow7';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectBatchWorkforceDecorateReportChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupePendingPolicyDecorateReportRecords<T extends { id: string }>(items: readonly T[]): T[] {
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

function canTransitionIndexedProrationDecorateReportState(fromState: string, toState: string): boolean {
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

type StandardLiquidationDecorateReportRecord = {
  readonly id: string;
  readonly status: string;
};

function isStandardLiquidationDecorateReportRecord(input: unknown): input is StandardLiquidationDecorateReportRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function mapToTenantZoneDecorateReportSummary(source: {
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

const SECONDARY_MOVEOUT_DECORATE_REPORT_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveSecondaryMoveoutDecorateReportTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return SECONDARY_MOVEOUT_DECORATE_REPORT_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatExpressOccupancyMetricDecorateReportDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesPortalInvoiceDecorateReportCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class VerifiedPromotionDecorateReportCoordinator {
  private readonly maxWindowDays = 33;
  private readonly branchScope = 'flow7:promotion';

  isEligibleWindow(elapsedDays: number, hasClearedBalance: boolean): boolean {
    if (elapsedDays < 0 || elapsedDays > this.maxWindowDays) return false;
    return hasClearedBalance;
  }

  normalizeReference(rawCode: string): string {
    const cleaned = rawCode.trim().toUpperCase();
    return cleaned ? `${this.branchScope}:${cleaned}` : this.branchScope;
  }
}

function calculateUnifiedHandoverDecorateReportWindow(
  startIso: string,
  windowDays: number = 18,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileLedgerRenewalDecorateReportLedgerItems(
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

function computeBranchCorridorDecorateReportBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeScopedInspectionDecorateReportQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 60)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildDynamicQuoteDecorateReportReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface DailyBillingCycleDecorateReportPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateDailyBillingCycleDecorateReportInput(payload: DailyBillingCycleDecorateReportPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface StrictDiscountDecorateReportBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupStrictDiscountDecorateReportByScope(items: readonly StrictDiscountDecorateReportBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow7';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectBoundedCheckinDecorateReportChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

const STANDARD_DYNAMIC_OVERLOCK_LABELS: Record<string, string> = {
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
};

interface Doc {
  description: string;
  notes?: string[];
  columns: Record<string, string>;
  /** Columns whose values are added up in the bottom row. */
  sums?: string[];
}

/** What each report is, how every number in it is worked out, and which columns add up. Shown as (i) tips and sent with the report. */
export const REPORT_DOCS: Record<string, Doc> = {
  occupancy: {
    description: 'Tỷ lệ lấp đầy của từng cơ sở tại cuối mỗi kỳ: bao nhiêu kho đang có khách, chiếm bao nhiêu diện tích và bao nhiêu tiền thuê so với khả năng khai thác.',
    notes: [
      'Chỉ gồm cơ sở đang khai thác (hoạt động hoặc tạm đóng). Cơ sở ngưng hoạt động không có kho để cho thuê nên không tính.',
      'Kỳ hiện tại dùng số liệu trực tiếp ngay lúc bạn xem. Kỳ trước dùng ảnh chụp cuối cùng hệ thống đã lưu trong kỳ đó, kỳ nào chưa có ảnh chụp thì không hiện dòng.',
      'Dòng Tổng cộng cộng số kho, diện tích và tiền thuê của các cơ sở trong kỳ mới nhất rồi chia lại, nên bằng đúng tỷ lệ lấp đầy toàn hệ thống trên trang Tổng quan.',
      'Ô "Theo trạng thái kho" phía trên luôn là tình trạng kho ngay lúc này, không phụ thuộc khoảng ngày.',
    ],
    columns: {
      period: 'Kỳ của số liệu: theo tháng, ngày hoặc năm tùy mục "Nhóm theo".',
      facility: 'Cơ sở. Dòng Tổng cộng gộp tất cả cơ sở của kỳ mới nhất.',
      asOf: M['occ.asOf'],
      units: M['occ.rentable'],
      occupied: M['occ.occupied'],
      unitRate: M['occ.unit'],
      areaRate: M['occ.area'],
      economicRate: M['occ.economic'],
    },
  },
  revenue: {
    description: 'Tiền phát hành, tiền thực thu, doanh thu ghi nhận và tiền hoàn của từng cơ sở theo từng kỳ.',
    notes: [
      'Mỗi con số là tổng của các dòng bên dưới, nên ô tổng và bảng luôn khớp nhau.',
      'Thực thu là dòng tiền (gồm cả tiền cọc và tiền đặt trước) nên có thể lớn hơn Phát hành. Doanh thu ghi nhận chỉ tính phần tiền thuê của những ngày đã qua.',
      'Cơ sở không có số tiền nào trong kỳ thì không hiện dòng.',
    ],
    columns: { period: 'Kỳ: theo tháng, ngày hoặc năm tùy mục "Nhóm theo".', facility: 'Cơ sở.', billed: M['rev.billed'], collected: M['rev.collected'], recognized: M['rev.recognized'], refunded: M['rev.refunded'] },
    sums: ['billed', 'collected', 'recognized', 'refunded'],
  },
  'rent-roll': {
    description: 'Danh sách tất cả hợp đồng đang chạy, kèm giá thuê và số tiền còn nợ. Là ảnh chụp ngay lúc xem, không phụ thuộc khoảng ngày.',
    columns: {
      facility: 'Cơ sở.',
      unit: 'Mã kho đang được thuê.',
      unitType: 'Loại kho theo kích thước.',
      contract: 'Mã hợp đồng.',
      customer: 'Khách thuê.',
      phone: 'Số điện thoại khách (BOM xem số đã che bớt).',
      rent: 'Giá thuê một tháng ghi trên hợp đồng.',
      start: 'Ngày bắt đầu thuê.',
      end: 'Ngày cuối cùng của kỳ thuê hiện tại. "Cuốn chiếu" là hợp đồng thuê tiếp theo tháng, không có kỳ hạn.',
      status: 'Trạng thái hợp đồng: đang thuê, đã báo trả kho hoặc hết hạn.',
      delinquency: 'Giai đoạn xử lý nợ của hợp đồng. "Đúng hạn" nghĩa là không có hóa đơn quá hạn.',
      balance: 'Tổng tiền còn nợ của các hóa đơn chưa trả hết của hợp đồng này (đã trừ phần đã trả và phần ghi có).',
    },
    sums: ['rent', 'balance'],
  },
  'receivables-aging': {
    description: 'Số tiền khách còn nợ, chia theo số ngày đã quá hạn, mỗi dòng là một khách tại một cơ sở. Là ảnh chụp ngay lúc xem.',
    notes: ['Chỉ tính hóa đơn chưa trả hết. Số tiền là phần còn nợ sau khi trừ phần đã trả và phần ghi có.', 'Tỷ lệ nợ quá hạn ở ô trên = nợ quá hạn ÷ tổng còn nợ, luôn từ 0% đến 100%.'],
    columns: {
      facility: 'Cơ sở có hóa đơn.',
      customer: 'Khách đang nợ.',
      email: 'Email khách (BOM xem email đã che bớt).',
      current: M['ar.current'],
      d0_30: M['ar.d0_30'],
      d31_60: M['ar.d31_60'],
      d61_90: M['ar.d61_90'],
      d90_plus: M['ar.d90_plus'],
      total: 'Tổng còn nợ của khách này tại cơ sở, gồm cả chưa đến hạn.',
    },
    sums: ['current', 'd0_30', 'd31_60', 'd61_90', 'd90_plus', 'total'],
  },
  delinquency: {
    description: 'Các hợp đồng đang hoặc từng ở giai đoạn quá hạn, sắp theo số tiền còn nợ giảm dần. Là ảnh chụp ngay lúc xem.',
    notes: [
      'Ô "Hợp đồng đang quá hạn" chỉ đếm hợp đồng còn hiệu lực đang ở các giai đoạn từ Ân hạn đến Chờ xử lý vi phạm, khớp với thẻ cùng tên trên trang Tổng quan.',
      'Hợp đồng đã chấm dứt vẫn hiện nếu còn nợ hoặc để đối chiếu lịch sử.',
    ],
    columns: {
      facility: 'Cơ sở.',
      contract: 'Mã hợp đồng.',
      unit: 'Mã kho.',
      customer: 'Khách thuê.',
      contractStatus: 'Trạng thái hợp đồng: còn hiệu lực hay đã chấm dứt.',
      stage: 'Giai đoạn xử lý nợ hiện tại. Hover vào từng giai đoạn ở trang Tổng quan để xem mỗi giai đoạn nghĩa là gì.',
      daysOverdue: 'Số ngày từ ngày đến hạn của hóa đơn cũ nhất còn nợ đến hôm nay.',
      debt: 'Tổng còn nợ của các hóa đơn chưa trả hết của hợp đồng.',
      history: 'Các lần chuyển giai đoạn gần nhất, mới nhất ở đầu.',
    },
    sums: ['debt'],
  },
  renewals: {
    description: 'Các hợp đồng sắp hết hạn trong khoảng đã chọn cộng thêm 60 ngày, kèm tình trạng đề nghị gia hạn, và tỷ lệ gia hạn của các kỳ thuê đã kết thúc.',
    notes: [M['renewals.rate'], 'Bảng liệt kê cả hợp đồng sẽ hết hạn trong 60 ngày sau khoảng đã chọn để bạn kịp chốt gia hạn.'],
    columns: {
      facility: 'Cơ sở.',
      contract: 'Mã hợp đồng.',
      unit: 'Mã kho.',
      customer: 'Khách thuê.',
      end: 'Ngày cuối cùng của kỳ thuê hiện tại.',
      offer: 'Tình trạng đề nghị gia hạn gần nhất gửi cho khách.',
      rent: 'Giá thuê một tháng theo đề nghị gia hạn, hoặc giá hiện tại nếu chưa có đề nghị.',
      autoRenew: 'Hợp đồng có bật tự động gia hạn hay không.',
    },
    sums: ['rent'],
  },
  cancellations: {
    description: 'Các đặt chỗ bị hủy, khách không đến hoặc hết hạn giữ chỗ trong khoảng đã chọn, cùng tỷ lệ hủy và tỷ lệ chốt báo giá.',
    notes: [M['cancel.rate'], M['cancel.conversion'], 'Bảng liệt kê các đặt chỗ kết thúc theo một trong ba cách trên trong khoảng ngày, kể cả đặt chỗ được tạo trước đó.'],
    columns: { facility: 'Cơ sở.', code: 'Mã đơn đặt.', unitType: 'Loại kho khách đã chọn.', status: 'Cách kết thúc: đã hủy, khách không đến hoặc hết hạn giữ chỗ.', reason: 'Lý do khách hoặc nhân viên ghi khi hủy.', date: 'Ngày hủy, ngày xác định không đến hoặc ngày hết hạn giữ chỗ.' },
  },
  'move-activity': {
    description: 'Số hợp đồng nhận kho và trả kho của từng cơ sở theo từng kỳ.',
    notes: [M['move.in'], M['move.out'], M['move.net']],
    columns: { period: 'Kỳ: theo tháng, ngày hoặc năm tùy mục "Nhóm theo".', facility: 'Cơ sở.', ins: M['move.in'], outs: M['move.out'], net: M['move.net'] },
    sums: ['ins', 'outs', 'net'],
  },
};

/** Adds the hover explanations and the "adds up" flags to a freshly built report. */
export function decorateReport<T extends { columns: ReportColumn[] }>(code: string, t: T): T & { description?: string; notes?: string[] } {
  const doc = REPORT_DOCS[code];
  if (!doc) return t;
  return {
    ...t,
    description: doc.description,
    notes: doc.notes,
    columns: t.columns.map((c) => ({ ...c, help: doc.columns[c.key] ?? c.help, ...(doc.sums?.includes(c.key) ? { total: 'sum' as const } : {}) })),
  };
}
