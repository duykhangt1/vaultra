/**
 * Default notification templates (spec §16.3, §16.5). Seeded into notification_templates; BOM/Admin
 * can edit them in the UI (DB version wins). Variables use {{name}}.
 * group -> notification_preferences.event_group; mandatory -> cannot be disabled; email -> also email.
 */

function computeDynamicCorridorTEMPLATESBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeDailyInspectionTemplateDefQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 30)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildStrictQuoteTEMPLATESReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface BoundedBillingCycleTemplateDefPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateBoundedBillingCycleTemplateDefInput(payload: BoundedBillingCycleTemplateDefPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface GuardDiscountTEMPLATESBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupGuardDiscountTEMPLATESByScope(items: readonly GuardDiscountTEMPLATESBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow7';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectActiveCheckinTemplateDefChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupeSyncedSupportTicketTEMPLATESRecords<T extends { id: string }>(items: readonly T[]): T[] {
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

function canTransitionCoreUnitSlotTemplateDefState(fromState: string, toState: string): boolean {
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

type MonthlySettlementTEMPLATESRecord = {
  readonly id: string;
  readonly status: string;
};

function isMonthlySettlementTEMPLATESRecord(input: unknown): input is MonthlySettlementTEMPLATESRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function mapToPrimaryBookingTemplateDefSummary(source: {
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

const ROLLING_DELINQUENCY_TEMPLATES_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveRollingDelinquencyTEMPLATESTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return ROLLING_DELINQUENCY_TEMPLATES_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatBatchApprovalTemplateDefDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesPendingSignatureTEMPLATESCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class IndexedEscalationTemplateDefCoordinator {
  private readonly maxWindowDays = 36;
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

function calculateStandardFloorplanTEMPLATESWindow(
  startIso: string,
  windowDays: number = 21,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileTenantRefundTemplateDefLedgerItems(
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

function computeSecondaryDepositTEMPLATESBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeExpressOverlockTemplateDefQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 30)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildPortalFacilityTEMPLATESReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface VerifiedContractTemplateDefPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateVerifiedContractTemplateDefInput(payload: VerifiedContractTemplateDefPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface UnifiedAuditTrailTEMPLATESBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupUnifiedAuditTrailTEMPLATESByScope(items: readonly UnifiedAuditTrailTEMPLATESBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow7';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectLedgerWorkforceTemplateDefChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupeBranchPolicyTEMPLATESRecords<T extends { id: string }>(items: readonly T[]): T[] {
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

function canTransitionScopedProrationTemplateDefState(fromState: string, toState: string): boolean {
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

type DynamicLiquidationTEMPLATESRecord = {
  readonly id: string;
  readonly status: string;
};

function isDynamicLiquidationTEMPLATESRecord(input: unknown): input is DynamicLiquidationTEMPLATESRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function mapToDailyZoneTemplateDefSummary(source: {
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

const STRICT_MOVEOUT_TEMPLATES_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveStrictMoveoutTEMPLATESTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return STRICT_MOVEOUT_TEMPLATES_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatBoundedOccupancyMetricTemplateDefDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesGuardInvoiceTEMPLATESCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class ActivePromotionTemplateDefCoordinator {
  private readonly maxWindowDays = 37;
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

function calculateSyncedHandoverTEMPLATESWindow(
  startIso: string,
  windowDays: number = 17,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileCoreRenewalTemplateDefLedgerItems(
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

function computeMonthlyCorridorTEMPLATESBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizePrimaryInspectionTemplateDefQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 30)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildRollingQuoteTEMPLATESReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface BatchBillingCycleTemplateDefPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateBatchBillingCycleTemplateDefInput(payload: BatchBillingCycleTemplateDefPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface PendingDiscountTEMPLATESBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupPendingDiscountTEMPLATESByScope(items: readonly PendingDiscountTEMPLATESBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow7';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectIndexedCheckinTemplateDefChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupeStandardSupportTicketTEMPLATESRecords<T extends { id: string }>(items: readonly T[]): T[] {
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

function canTransitionTenantUnitSlotTemplateDefState(fromState: string, toState: string): boolean {
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

type SecondarySettlementTEMPLATESRecord = {
  readonly id: string;
  readonly status: string;
};

function isSecondarySettlementTEMPLATESRecord(input: unknown): input is SecondarySettlementTEMPLATESRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function mapToExpressBookingTemplateDefSummary(source: {
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

const PORTAL_DELINQUENCY_TEMPLATES_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolvePortalDelinquencyTEMPLATESTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return PORTAL_DELINQUENCY_TEMPLATES_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatVerifiedApprovalTemplateDefDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesUnifiedSignatureTEMPLATESCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class LedgerEscalationTemplateDefCoordinator {
  private readonly maxWindowDays = 33;
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

function calculateBranchFloorplanTEMPLATESWindow(
  startIso: string,
  windowDays: number = 18,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileScopedRefundTemplateDefLedgerItems(
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

function computeDynamicDepositTEMPLATESBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeDailyOverlockTemplateDefQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 30)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildStrictFacilityTEMPLATESReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface BoundedContractTemplateDefPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateBoundedContractTemplateDefInput(payload: BoundedContractTemplateDefPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface GuardAuditTrailTEMPLATESBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupGuardAuditTrailTEMPLATESByScope(items: readonly GuardAuditTrailTEMPLATESBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow7';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectActiveWorkforceTemplateDefChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupeSyncedPolicyTEMPLATESRecords<T extends { id: string }>(items: readonly T[]): T[] {
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

function canTransitionCoreProrationTemplateDefState(fromState: string, toState: string): boolean {
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

type MonthlyLiquidationTEMPLATESRecord = {
  readonly id: string;
  readonly status: string;
};

function isMonthlyLiquidationTEMPLATESRecord(input: unknown): input is MonthlyLiquidationTEMPLATESRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function mapToPrimaryZoneTemplateDefSummary(source: {
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

const ROLLING_MOVEOUT_TEMPLATES_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveRollingMoveoutTEMPLATESTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return ROLLING_MOVEOUT_TEMPLATES_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatBatchOccupancyMetricTemplateDefDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesPendingInvoiceTEMPLATESCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class IndexedPromotionTemplateDefCoordinator {
  private readonly maxWindowDays = 34;
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

function calculateStandardHandoverTEMPLATESWindow(
  startIso: string,
  windowDays: number = 19,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileTenantRenewalTemplateDefLedgerItems(
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

const STRICT_BOUNDED_FLOORPLAN_LABELS: Record<string, string> = {
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
};
export type TemplateDef = {
  group: 'BILLING' | 'CONTRACT' | 'RENEWAL' | 'SUPPORT' | 'OPERATIONS' | 'MARKETING' | 'ACCOUNT';
  mandatory: boolean;
  email: boolean;
  subject: string;
  body: string;
};

export const TEMPLATES: Record<string, TemplateDef> = {
  // A. Account & security
  'assistant.handoff_anonymous': {
    group: 'OPERATIONS',
    mandatory: false,
    email: false,
    subject: 'Yêu cầu tư vấn mới từ khách truy cập website',
    body: 'Khách hàng để lại địa chỉ liên hệ {{email}} qua trợ lý trực tuyến. Tóm tắt nội dung: {{transcript}}',
  },
  'contact.request': {
    group: 'OPERATIONS',
    mandatory: false,
    email: true,
    subject: 'Yêu cầu liên hệ tư vấn mới{{facility}}',
    body: 'Khách hàng {{name}} ({{email}}{{phone}}) đã gửi yêu cầu tư vấn từ trang Liên hệ: {{message}}',
  },
  'auth.verify_email': {
    group: 'ACCOUNT',
    mandatory: true,
    email: true,
    subject: 'Xác minh địa chỉ email tài khoản {{brand}}',
    body: 'Xin chào {{name}}, vui lòng xác minh địa chỉ email trong vòng 24 giờ để hoàn tất kích hoạt tài khoản thuê kho tại {{brand}}. Nếu Quý khách không thực hiện yêu cầu này, vui lòng bỏ qua thông báo.',
  },
  'auth.welcome': {
    group: 'ACCOUNT',
    mandatory: true,
    email: true,
    subject: 'Chào mừng Quý khách đến với {{brand}}',
    body: 'Tài khoản {{brand}} của Quý khách đã được kích hoạt thành công. Quý khách có thể tra cứu cơ sở lưu trữ, chọn diện tích kho phù hợp, thanh toán trực tuyến và đặt lịch nhận kho bất cứ lúc nào.',
  },
  'auth.account_exists': {
    group: 'ACCOUNT',
    mandatory: true,
    email: true,
    subject: 'Thông báo đăng ký trên địa chỉ email đã có tài khoản {{brand}}',
    body: 'Hệ thống vừa ghi nhận yêu cầu đăng ký mới bằng địa chỉ email này. Tài khoản của Quý khách đã tồn tại trên {{brand}} — vui lòng đăng nhập hoặc sử dụng chức năng Đặt lại mật khẩu nếu cần hỗ trợ.',
  },
  'auth.password_reset': {
    group: 'ACCOUNT',
    mandatory: true,
    email: true,
    subject: 'Yêu cầu đặt lại mật khẩu tài khoản {{brand}}',
    body: 'Hệ thống nhận được yêu cầu đặt lại mật khẩu từ thiết bị {{device}} (IP: {{ip}}). Liên kết xác thực có hiệu lực trong 30 phút và chỉ sử dụng một lần.',
  },
  'auth.password_changed': {
    group: 'ACCOUNT',
    mandatory: true,
    email: true,
    subject: 'Xác nhận thay đổi mật khẩu tài khoản {{brand}}',
    body: 'Mật khẩu tài khoản của Quý khách đã được cập nhật lúc {{time}}. Toàn bộ các phiên đăng nhập trước đó đã được đăng xuất để bảo vệ an toàn. Nếu không phải Quý khách thực hiện, vui lòng khôi phục mật khẩu ngay lập tức.',
  },
  'auth.new_device_login': {
    group: 'ACCOUNT',
    mandatory: true,
    email: true,
    subject: 'Cảnh báo bảo mật: Đăng nhập từ thiết bị mới',
    body: 'Tài khoản {{brand}} của Quý khách vừa đăng nhập trên {{device}} (IP: {{ip}}) vào lúc {{time}}. Nếu Quý khách không nhận ra hoạt động này, vui lòng thu hồi phiên đăng nhập và đổi mật khẩu ngay.',
  },
  'auth.account_locked': {
    group: 'ACCOUNT',
    mandatory: true,
    email: true,
    subject: 'Tạm khóa bảo vệ tài khoản {{brand}}',
    body: 'Tài khoản của Quý khách tạm thời khóa đăng nhập trong {{minutes}} phút do nhập sai mật khẩu quá số lần quy định. Quý khách có thể chờ hết thời gian tạm khóa hoặc đặt lại mật khẩu mới.',
  },
  'auth.token_reuse_detected': {
    group: 'ACCOUNT',
    mandatory: true,
    email: true,
    subject: 'Cảnh báo an toàn: Phát hiện bất thường phiên đăng nhập',
    body: 'Hệ thống bảo mật phát hiện dấu hiệu sử dụng lại mã phiên đăng nhập và đã chủ động ngắt phiên đó để bảo vệ tài khoản của Quý khách. Khuyến nghị Quý khách kiểm tra thiết bị và đổi mật khẩu.',
  },
  'auth.google_link_code': {
    group: 'ACCOUNT',
    mandatory: true,
    email: true,
    subject: 'Mã xác thực liên kết tài khoản Google ({{code}})',
    body: 'Mã xác thực một lần để liên kết đăng nhập Google với tài khoản {{brand}} của Quý khách là {{code}} (hiệu lực trong 10 phút). Tuyệt đối không chia sẻ mã này cho bất kỳ ai.',
  },
  'auth.google_linked': {
    group: 'ACCOUNT',
    mandatory: true,
    email: false,
    subject: 'Đã liên kết đăng nhập Google thành công',
    body: 'Tài khoản Google {{googleEmail}} đã được liên kết với hồ sơ {{brand}} của Quý khách.',
  },
  'auth.google_unlinked': {
    group: 'ACCOUNT',
    mandatory: true,
    email: false,
    subject: 'Đã hủy liên kết đăng nhập Google',
    body: 'Phương thức đăng nhập qua Google đã được gỡ khỏi tài khoản {{brand}} của Quý khách.',
  },
  'user.invited': {
    group: 'ACCOUNT',
    mandatory: true,
    email: true,
    subject: 'Lời mời kích hoạt tài khoản trên hệ thống {{brand}}',
    body: 'Xin chào {{name}}, bạn được cấp tài khoản truy cập hệ thống {{brand}} với phân quyền {{roles}}{{facilityText}}. Vui lòng bấm nút bên dưới để thiết lập mật khẩu và kích hoạt tài khoản.',
  },
  'user.role_changed': {
    group: 'ACCOUNT',
    mandatory: true,
    email: true,
    subject: 'Thông báo cập nhật phân quyền tài khoản {{brand}}',
    body: 'Phân quyền truy cập tài khoản của bạn trên hệ thống {{brand}} vừa được quản trị viên cập nhật. Các phiên làm việc cũ đã được làm mới — vui lòng đăng nhập lại để tiếp tục.',
  },
  'user.disabled': {
    group: 'ACCOUNT',
    mandatory: true,
    email: true,
    subject: 'Thông báo ngừng kích hoạt tài khoản {{brand}}',
    body: 'Tài khoản truy cập hệ thống {{brand}} của Quý khách hiện đã tạm ngừng hoạt động. Vui lòng liên hệ bộ phận Quản trị hoặc Chăm sóc khách hàng nếu cần hỗ trợ.',
  },
  'privacy.data_export_ready': {
    group: 'ACCOUNT',
    mandatory: true,
    email: true,
    subject: 'Hồ sơ dữ liệu cá nhân của Quý khách đã sẵn sàng tải xuống',
    body: 'Bản trích xuất dữ liệu cá nhân theo yêu cầu của Quý khách đã được chuẩn bị xong và lưu trữ bảo mật trong 24 giờ. Vui lòng đăng nhập ứng dụng để tải tệp.',
  },

  // B. Reservation & Appointments
  'reservation.pending_payment': {
    group: 'BILLING',
    mandatory: false,
    email: true,
    subject: 'Xác nhận giữ chỗ đặt kho {{code}} (Kèm phiếu & mã QR Check-in)',
    body: 'Đơn đặt kho {{code}} của Quý khách đang được giữ chỗ đến {{holdUntil}}. Vui lòng hoàn tất thanh toán trực tuyến hoặc mang theo CCCD kèm mã QR đơn hàng {{code}} khi đến quầy lễ tân check-in.',
  },
  'reservation.confirmed': {
    group: 'CONTRACT',
    mandatory: true,
    email: true,
    subject: 'Xác nhận đặt kho thành công {{code}} (Kèm phiếu PDF & mã QR Check-in)',
    body: 'Đơn đặt kho {{code}} tại {{facility}} (bắt đầu từ {{startDate}}, thời hạn {{term}} tháng) đã được xác nhận thanh toán. Quý khách vui lòng mang theo CCCD bản gốc và xuất trình mã QR đơn {{code}} để làm thủ tục nhận kho.',
  },
  'reservation.confirmed_fm': {
    group: 'OPERATIONS',
    mandatory: false,
    email: false,
    subject: 'Đơn đặt kho mới {{code}} đã xác nhận thanh toán',
    body: 'Đơn {{code}} ({{unitType}}, bắt đầu {{startDate}}) đã hoàn tất thanh toán và sẵn sàng chuẩn bị bàn giao.',
  },
  'reservation.expired': {
    group: 'CONTRACT',
    mandatory: true,
    email: true,
    subject: 'Thông báo hết thời gian giữ chỗ đơn đặt kho {{code}}',
    body: 'Đơn đặt kho {{code}} đã hết thời hạn giữ chỗ tạm thời do chưa ghi nhận thanh toán. Quý khách có thể thực hiện đặt kho mới bất cứ lúc nào trên hệ thống {{brand}}.',
  },
  'reservation.cancelled': {
    group: 'CONTRACT',
    mandatory: true,
    email: true,
    subject: 'Xác nhận hủy đơn đặt kho {{code}}',
    body: 'Đơn đặt kho {{code}} đã được hủy theo ghi nhận trên hệ thống. Khoản tiền hoàn trả dự kiến theo chính sách hiện hành: {{refund}}.',
  },
  'reservation.no_show': {
    group: 'CONTRACT',
    mandatory: true,
    email: true,
    subject: 'Thông báo quá thời hạn nhận kho — Đơn {{code}}',
    body: 'Đơn đặt kho {{code}} đã quá khung thời gian nhận kho theo quy định và được chuyển sang trạng thái quá hạn nhận kho. Tiền đặt cọc được đối soát theo chính sách; số tiền hoàn dự kiến: {{refund}}.',
  },
  'allocation.required': {
    group: 'OPERATIONS',
    mandatory: false,
    email: false,
    subject: 'Cần phân bổ kho cho đơn {{code}}',
    body: 'Đơn {{code}} ({{unitType}}) cần được gán kho cụ thể trước {{dueAt}}.',
  },
  'allocation.sla_breached': {
    group: 'OPERATIONS',
    mandatory: false,
    email: false,
    subject: 'Quá hạn SLA phân bổ kho — Đơn {{code}}',
    body: 'Đơn {{code}} đã vượt mốc thời gian cam kết phân bổ kho, đề nghị xử lý ngay.',
  },
  'unit.assigned': {
    group: 'CONTRACT',
    mandatory: true,
    email: true,
    subject: 'Thông báo phân bổ kho {{unitCode}} — Đơn {{code}}',
    body: 'Đơn đặt kho {{code}} của Quý khách tại {{facility}} đã được bố trí kho {{unitCode}} ({{zone}}, tầng {{floor}}). Vui lòng xem chi tiết vị trí kho và phiếu xác nhận đính kèm.',
  },
  'allocation.changed': {
    group: 'CONTRACT',
    mandatory: true,
    email: true,
    subject: 'Thông báo cập nhật kho lưu trữ sang {{unitCode}} — Đơn {{code}}',
    body: 'Đơn đặt kho {{code}} đã được điều chuyển sang kho {{unitCode}} ({{zone}}) để đảm bảo điều kiện lưu trữ tốt nhất. Lý do cập nhật: {{reason}}.',
  },
  'unit.unfit_reassigned': {
    group: 'CONTRACT',
    mandatory: true,
    email: true,
    subject: 'Thông báo kiểm tra & bố trí kho thay thế — Đơn {{code}}',
    body: 'Qua kiểm tra kỹ thuật trước bàn giao đối với đơn {{code}}, kho dự kiến cần bảo trì đột xuất nên cơ sở đã ghi nhận hiện trạng (đính kèm hình ảnh) và ưu tiên bố trí kho thay thế đạt chuẩn cho Quý khách.',
  },
  'appointment.booked': {
    group: 'CONTRACT',
    mandatory: true,
    email: true,
    subject: 'Xác nhận lịch hẹn {{typeLabel}} lúc {{when}} (Đơn {{code}})',
    body: 'Lịch hẹn {{typeLabel}} của Quý khách vào lúc {{when}} tại {{facility}} (Đơn {{code}}) đã được ghi nhận. Vui lòng mang theo CCCD và xuất trình mã QR {{code}} tại quầy lễ tân khi đến cơ sở.',
  },
  'appointment.reminder': {
    group: 'CONTRACT',
    mandatory: true,
    email: true,
    subject: 'Nhắc lịch hẹn {{typeLabel}} vào lúc {{when}} tại {{facility}}',
    body: 'Nhắc lịch Quý khách có hẹn {{typeLabel}} vào lúc {{when}} tại {{facility}}. Vui lòng mang theo giấy tờ tùy thân để nhân viên cơ sở đón tiếp nhanh chóng.',
  },
  'appointment.staff': {
    group: 'OPERATIONS',
    mandatory: false,
    email: false,
    subject: 'Lịch hẹn khách {{typeLabel}} — {{when}}',
    body: 'Khách hàng {{customer}} có lịch hẹn {{typeLabel}} vào lúc {{when}}.',
  },
  'appointment.missed': {
    group: 'CONTRACT',
    mandatory: false,
    email: true,
    subject: 'Thông báo lỡ lịch hẹn {{typeLabel}} tại {{facility}}',
    body: 'Lịch hẹn {{typeLabel}} vào lúc {{when}} của Quý khách chưa được thực hiện. Quý khách vui lòng đặt lại khung giờ hẹn mới phù hợp trên cổng khách hàng.',
  },

  // C. Check-in, Contract & Handover
  'contract.signed': {
    group: 'CONTRACT',
    mandatory: true,
    email: true,
    subject: 'Hợp đồng thuê kho {{code}} đã ký điện tử thành công',
    body: 'Hợp đồng thuê kho {{code}} đã được ký xác thực điện tử đầy đủ pháp lý (mã băm SHA-256: {{hash}}). Bản hợp đồng PDF chính thức được đính kèm trong email này để Quý khách lưu trữ.',
  },
  'renewal.otp': {
    group: 'CONTRACT',
    mandatory: true,
    email: true,
    subject: 'Mã OTP xác nhận gia hạn hợp đồng {{code}} ({{otp}})',
    body: 'Mã OTP ký xác nhận phụ lục gia hạn hợp đồng {{code}} thêm {{term}} tháng của Quý khách là {{otp}} (có hiệu lực trong 10 phút). Vui lòng không chia sẻ mã này cho người khác.',
  },
  'contract.sign_otp': {
    group: 'CONTRACT',
    mandatory: true,
    email: true,
    subject: 'Mã OTP ký điện tử hợp đồng thuê kho {{code}} ({{otp}})',
    body: 'Mã xác thực OTP để ký điện tử hợp đồng thuê kho {{code}} của Quý khách là {{otp}} (hiệu lực trong 10 phút). Vì lý do bảo mật, tuyệt đối không cung cấp mã này cho bất kỳ ai.',
  },
  'contract.sign_email': {
    group: 'CONTRACT',
    mandatory: true,
    email: true,
    subject: 'Mời xem dự thảo & ký điện tử hợp đồng thuê kho {{code}}',
    body: 'Nhân viên tại {{facility}} đã hoàn tất đối soát hồ sơ, bố trí kho {{unitCode}} và khởi tạo hợp đồng {{code}} cho Quý khách. Vui lòng kiểm tra bản dự thảo PDF đính kèm và bấm nút bên dưới để ký hợp đồng điện tử.',
  },
  'access.issued': {
    group: 'CONTRACT',
    mandatory: true,
    email: false,
    subject: 'Mã PIN ra vào kho {{unitCode}} đã sẵn sàng trên cổng Web',
    body: 'Mã PIN truy cập kho {{unitCode}} đã được kích hoạt và chỉ hiển thị bảo mật trên giao diện Web (mục Hợp đồng → Truy cập). Vì an toàn tài sản, hệ thống tuyệt đối không gửi mã PIN qua email.',
  },
  'handover.completed': {
    group: 'CONTRACT',
    mandatory: true,
    email: true,
    subject: 'Hoàn tất bàn giao nhận kho {{unitCode}} — Hợp đồng {{code}}',
    body: 'Chúc mừng Quý khách đã hoàn tất nhận bàn giao kho {{unitCode}} (khung giờ ra vào: {{accessHours}}). Biên bản bàn giao PDF, hợp đồng đã ký và toàn bộ hình ảnh hiện trạng kho ban đầu được đính kèm đầy đủ trong email này.',
  },
  'checkin.completed': {
    group: 'OPERATIONS',
    mandatory: false,
    email: false,
    subject: 'Hoàn tất check-in bàn giao kho {{unitCode}}',
    body: 'Khách hàng {{customer}} đã ký nhận bàn giao kho {{unitCode}} (Hợp đồng {{code}}).',
  },
  'checkin.aborted': {
    group: 'OPERATIONS',
    mandatory: false,
    email: false,
    subject: 'Phiên check-in đơn {{code}} đã dừng',
    body: 'Phiên làm thủ tục nhận kho của đơn {{code}} đã hủy bỏ. Lý do: {{reason}}.',
  },

  // D. Billing, Payments & Refunds
  'invoice.issued': {
    group: 'BILLING',
    mandatory: true,
    email: true,
    subject: 'Thông báo phát hành hóa đơn {{code}} ({{amount}})',
    body: 'Hóa đơn điện tử {{code}} với tổng số tiền {{amount}} đã được phát hành (hạn thanh toán: {{dueDate}}). Quý khách vui lòng xem chi tiết bảng kê và tệp PDF hóa đơn đính kèm.',
  },
  'invoice.due_soon': {
    group: 'BILLING',
    mandatory: true,
    email: true,
    subject: 'Nhắc hạn thanh toán hóa đơn {{code}} — Đến hạn {{dueDate}}',
    body: 'Hóa đơn {{code}} (số tiền cần thanh toán: {{amount}}) sẽ đến hạn vào ngày {{dueDate}}. Quý khách vui lòng thanh toán đúng hạn để duy trì quyền ra vào kho liên tục.',
  },
  'invoice.overdue': {
    group: 'BILLING',
    mandatory: true,
    email: true,
    subject: 'Thông báo hóa đơn {{code}} quá hạn thanh toán ({{days}} ngày)',
    body: 'Hóa đơn {{code}} hiện đã quá hạn {{days}} ngày với dư nợ {{amount}}. Phí chậm thanh toán theo hợp đồng sẽ áp dụng từ ngày {{lateFeeDate}} — kính mong Quý khách sớm tất toán.',
  },
  'payment.succeeded': {
    group: 'BILLING',
    mandatory: true,
    email: true,
    subject: 'Xác nhận thanh toán thành công — Biên nhận {{code}} ({{amount}})',
    body: '{{brand}} trân trọng xác nhận đã nhận khoản thanh toán {{amount}} của Quý khách (Mã biên nhận: {{code}}). Biên nhận điện tử và hóa đơn PDF được đính kèm để Quý khách đối chiếu.',
  },
  'payment.failed': {
    group: 'BILLING',
    mandatory: true,
    email: true,
    subject: 'Thông báo giao dịch thanh toán {{amount}} chưa thành công',
    body: 'Giao dịch thanh toán số tiền {{amount}} chưa thể hoàn tất ({{reason}}). Quý khách vui lòng kiểm tra lại phương thức thanh toán hoặc thực hiện lại trên cổng khách hàng.',
  },
  'refund.succeeded': {
    group: 'BILLING',
    mandatory: true,
    email: true,
    subject: 'Xác nhận hoàn tiền thành công ({{amount}})',
    body: 'Khoản hoàn tiền {{amount}} của Quý khách đã được xử lý hoàn tất. Chứng từ xác nhận hoàn tiền PDF được đính kèm trong email này.',
  },
  'refund.failed': {
    group: 'BILLING',
    mandatory: true,
    email: true,
    subject: 'Thông báo xử lý hoàn tiền chuyển khoản ({{amount}})',
    body: 'Khoản hoàn tiền {{amount}} đang được chuyển sang bộ phận kế toán để hỗ trợ chuyển khoản trực tiếp cho Quý khách trong thời gian sớm nhất.',
  },
  'refund.approval_required': {
    group: 'OPERATIONS',
    mandatory: false,
    email: false,
    subject: 'Yêu cầu phê duyệt hoàn tiền {{amount}}',
    body: 'Có đề xuất hoàn tiền {{amount}} (lý do: {{reason}}) đang chờ cấp quản lý phê duyệt.',
  },
  'waiver.requested': {
    group: 'OPERATIONS',
    mandatory: false,
    email: false,
    subject: 'Đề xuất miễn giảm phí {{amount}} chờ duyệt',
    body: 'Có yêu cầu miễn giảm {{amount}} đối với khoản "{{item}}". Lý do: {{reason}}.',
  },
  'waiver.decided': {
    group: 'OPERATIONS',
    mandatory: false,
    email: false,
    subject: 'Kết quả xét duyệt miễn giảm phí: {{decision}}',
    body: 'Đề xuất miễn giảm {{amount}} đã được {{decision}}.',
  },
  'damage.approval_required': {
    group: 'OPERATIONS',
    mandatory: false,
    email: false,
    subject: 'Cần phê duyệt chi phí hư hại {{amount}} tại kho {{unitCode}}',
    body: 'Chi phí bồi thường hư hại {{amount}} tại kho {{unitCode}} vượt ngưỡng tự động, cần Quản lý cơ sở kiểm tra hình ảnh và phê duyệt.',
  },

  // E. Rented unit & Facility operations
  'charge.added': {
    group: 'BILLING',
    mandatory: true,
    email: true,
    subject: 'Thông báo khoản phí phát sinh {{amount}} — Hóa đơn {{code}}',
    body: 'Khoản phí "{{fee}}" với số tiền {{amount}} vừa được ghi nhận vào hóa đơn {{code}}. Vui lòng xem chi tiết hóa đơn PDF đính kèm.',
  },
  'access.changed': {
    group: 'CONTRACT',
    mandatory: true,
    email: false,
    subject: 'Cập nhật phương thức truy cập kho {{unitCode}}',
    body: 'Phương tiện kiểm soát ra vào của kho {{unitCode}} vừa được cập nhật: {{change}}.',
  },
};
