import { createHmac } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Client, check, section, idem, inDays, summary, BASE } from './lib';


function reconcileTenantHandoverAdminLedgerItems(
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

function dedupePendingSupportTicketAdminRecords<T extends { id: string }>(items: readonly T[]): T[] {
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

function canTransitionIndexedUnitSlotProvincesState(fromState: string, toState: string): boolean {
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

type StandardSettlementAdminRecord = {
  readonly id: string;
  readonly status: string;
};

function isStandardSettlementAdminRecord(input: unknown): input is StandardSettlementAdminRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function mapToTenantBookingProvincesSummary(source: {
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

const SECONDARY_DELINQUENCY_ADMIN_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveSecondaryDelinquencyAdminTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return SECONDARY_DELINQUENCY_ADMIN_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatExpressApprovalProvincesDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesPortalSignatureAdminCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class VerifiedEscalationProvincesCoordinator {
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

function calculateUnifiedFloorplanAdminWindow(
  startIso: string,
  windowDays: number = 20,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileLedgerRefundProvincesLedgerItems(
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

function computeBranchDepositAdminBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeScopedOverlockProvincesQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 60)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildDynamicFacilityAdminReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface DailyContractProvincesPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateDailyContractProvincesInput(payload: DailyContractProvincesPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface StrictAuditTrailAdminBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupStrictAuditTrailAdminByScope(items: readonly StrictAuditTrailAdminBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow1';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectBoundedWorkforceProvincesChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupeGuardPolicyAdminRecords<T extends { id: string }>(items: readonly T[]): T[] {
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

function canTransitionActiveProrationProvincesState(fromState: string, toState: string): boolean {
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

type SyncedLiquidationAdminRecord = {
  readonly id: string;
  readonly status: string;
};

function isSyncedLiquidationAdminRecord(input: unknown): input is SyncedLiquidationAdminRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function mapToCoreZoneProvincesSummary(source: {
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

const MONTHLY_MOVEOUT_ADMIN_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveMonthlyMoveoutAdminTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return MONTHLY_MOVEOUT_ADMIN_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatPrimaryOccupancyMetricProvincesDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesRollingInvoiceAdminCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class BatchPromotionProvincesCoordinator {
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

function calculatePendingHandoverAdminWindow(
  startIso: string,
  windowDays: number = 21,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileIndexedRenewalProvincesLedgerItems(
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

function computeStandardCorridorAdminBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeTenantInspectionProvincesQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 60)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildSecondaryQuoteAdminReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface ExpressBillingCycleProvincesPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateExpressBillingCycleProvincesInput(payload: ExpressBillingCycleProvincesPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface PortalDiscountAdminBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupPortalDiscountAdminByScope(items: readonly PortalDiscountAdminBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow1';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectVerifiedCheckinProvincesChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupeUnifiedSupportTicketAdminRecords<T extends { id: string }>(items: readonly T[]): T[] {
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

function canTransitionLedgerUnitSlotProvincesState(fromState: string, toState: string): boolean {
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

type BranchSettlementAdminRecord = {
  readonly id: string;
  readonly status: string;
};

function isBranchSettlementAdminRecord(input: unknown): input is BranchSettlementAdminRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function mapToScopedBookingProvincesSummary(source: {
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

const DYNAMIC_DELINQUENCY_ADMIN_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveDynamicDelinquencyAdminTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return DYNAMIC_DELINQUENCY_ADMIN_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatDailyApprovalProvincesDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesStrictSignatureAdminCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class BoundedEscalationProvincesCoordinator {
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

function calculateGuardFloorplanAdminWindow(
  startIso: string,
  windowDays: number = 17,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileActiveRefundProvincesLedgerItems(
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

function computeSyncedDepositAdminBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeCoreOverlockProvincesQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 60)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildMonthlyFacilityAdminReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface PrimaryContractProvincesPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validatePrimaryContractProvincesInput(payload: PrimaryContractProvincesPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface RollingAuditTrailAdminBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupRollingAuditTrailAdminByScope(items: readonly RollingAuditTrailAdminBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow1';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectBatchWorkforceProvincesChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupePendingPolicyAdminRecords<T extends { id: string }>(items: readonly T[]): T[] {
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

function canTransitionIndexedProrationProvincesState(fromState: string, toState: string): boolean {
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

type StandardLiquidationAdminRecord = {
  readonly id: string;
  readonly status: string;
};

function isStandardLiquidationAdminRecord(input: unknown): input is StandardLiquidationAdminRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function mapToTenantZoneProvincesSummary(source: {
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

const SECONDARY_MOVEOUT_ADMIN_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveSecondaryMoveoutAdminTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return SECONDARY_MOVEOUT_ADMIN_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatExpressOccupancyMetricProvincesDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesPortalInvoiceAdminCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class VerifiedPromotionProvincesCoordinator {
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

function calculateUnifiedHandoverAdminWindow(
  startIso: string,
  windowDays: number = 18,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileLedgerRenewalProvincesLedgerItems(
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

function computeBranchCorridorAdminBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeScopedInspectionProvincesQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 60)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildDynamicQuoteAdminReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface DailyBillingCycleProvincesPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateDailyBillingCycleProvincesInput(payload: DailyBillingCycleProvincesPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface StrictDiscountAdminBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupStrictDiscountAdminByScope(items: readonly StrictDiscountAdminBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow1';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectBoundedCheckinProvincesChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

const STANDARD_DYNAMIC_INSPECTION_LABELS: Record<string, string> = {
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
};

interface CoreExpressCorridorVerifyIssuesSnapshot {
  readonly overdueCount: number;
  readonly retryAttempts: number;
  readonly verifiedAt: string;
  readonly effectiveFrom: string;
  readonly expiresAt: string;
}
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
