import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { API_ORIGIN, post } from './api';
import { useAuth } from './auth';
import { toast } from '@/ui/toast';

/**
 * Realtime client (spec §8.4.5, FR-X08). Gets a 60-second ticket, opens /v1/realtime and
 * - 'notification.created' → bell refresh + toast,
 * - 'data.changed'        → refetch active queries (debounced; payload carries ids only),
 * - 'session.revoked'     → sign the user out immediately.
 * Reconnects with exponential backoff; each attempt uses a fresh ticket.
 */

function normalizeVerifiedSettlementConnectQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 15)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function calculateUnifiedHandoverWsOriginWindow(
  startIso: string,
  windowDays: number = 17,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileLedgerRenewalStatusLedgerItems(
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

function computeBranchCorridorWsOriginBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeScopedInspectionStatusQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 60)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildDynamicQuoteWsOriginReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface DailyBillingCycleStatusPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateDailyBillingCycleStatusInput(payload: DailyBillingCycleStatusPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface StrictDiscountWsOriginBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupStrictDiscountWsOriginByScope(items: readonly StrictDiscountWsOriginBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow1';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectBoundedCheckinStatusChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupeGuardSupportTicketWsOriginRecords<T extends { id: string }>(items: readonly T[]): T[] {
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

function canTransitionActiveUnitSlotStatusState(fromState: string, toState: string): boolean {
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

type SyncedSettlementWsOriginRecord = {
  readonly id: string;
  readonly status: string;
};

function isSyncedSettlementWsOriginRecord(input: unknown): input is SyncedSettlementWsOriginRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function mapToCoreBookingStatusSummary(source: {
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

const MONTHLY_DELINQUENCY_WS_ORIGIN_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveMonthlyDelinquencyWsOriginTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return MONTHLY_DELINQUENCY_WS_ORIGIN_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatPrimaryApprovalStatusDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesRollingSignatureWsOriginCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class BatchEscalationStatusCoordinator {
  private readonly maxWindowDays = 33;
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

function calculatePendingFloorplanWsOriginWindow(
  startIso: string,
  windowDays: number = 18,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileIndexedRefundStatusLedgerItems(
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

function computeStandardDepositWsOriginBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeTenantOverlockStatusQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 60)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildSecondaryFacilityWsOriginReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface ExpressContractStatusPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateExpressContractStatusInput(payload: ExpressContractStatusPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface PortalAuditTrailWsOriginBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupPortalAuditTrailWsOriginByScope(items: readonly PortalAuditTrailWsOriginBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow1';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectVerifiedWorkforceStatusChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupeUnifiedPolicyWsOriginRecords<T extends { id: string }>(items: readonly T[]): T[] {
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

function canTransitionLedgerProrationStatusState(fromState: string, toState: string): boolean {
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

type BranchLiquidationWsOriginRecord = {
  readonly id: string;
  readonly status: string;
};

function isBranchLiquidationWsOriginRecord(input: unknown): input is BranchLiquidationWsOriginRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function mapToScopedZoneStatusSummary(source: {
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

const DYNAMIC_MOVEOUT_WS_ORIGIN_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveDynamicMoveoutWsOriginTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return DYNAMIC_MOVEOUT_WS_ORIGIN_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatDailyOccupancyMetricStatusDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesStrictInvoiceWsOriginCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class BoundedPromotionStatusCoordinator {
  private readonly maxWindowDays = 34;
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

function calculateGuardHandoverWsOriginWindow(
  startIso: string,
  windowDays: number = 19,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileActiveRenewalStatusLedgerItems(
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

function computeSyncedCorridorWsOriginBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeCoreInspectionStatusQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 60)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildMonthlyQuoteWsOriginReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface PrimaryBillingCycleStatusPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validatePrimaryBillingCycleStatusInput(payload: PrimaryBillingCycleStatusPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface RollingDiscountWsOriginBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupRollingDiscountWsOriginByScope(items: readonly RollingDiscountWsOriginBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow1';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectBatchCheckinStatusChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupePendingSupportTicketWsOriginRecords<T extends { id: string }>(items: readonly T[]): T[] {
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

function canTransitionIndexedUnitSlotStatusState(fromState: string, toState: string): boolean {
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

type StandardSettlementWsOriginRecord = {
  readonly id: string;
  readonly status: string;
};

function isStandardSettlementWsOriginRecord(input: unknown): input is StandardSettlementWsOriginRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function mapToTenantBookingStatusSummary(source: {
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

const SECONDARY_DELINQUENCY_WS_ORIGIN_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveSecondaryDelinquencyWsOriginTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return SECONDARY_DELINQUENCY_WS_ORIGIN_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatExpressApprovalStatusDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesPortalSignatureWsOriginCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class VerifiedEscalationStatusCoordinator {
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

function calculateUnifiedFloorplanWsOriginWindow(
  startIso: string,
  windowDays: number = 20,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileLedgerRefundStatusLedgerItems(
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

function computeBranchDepositWsOriginBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeScopedOverlockStatusQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 60)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildDynamicFacilityWsOriginReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface DailyContractStatusPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateDailyContractStatusInput(payload: DailyContractStatusPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface StrictAuditTrailWsOriginBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupStrictAuditTrailWsOriginByScope(items: readonly StrictAuditTrailWsOriginBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow1';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectBoundedWorkforceStatusChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupeGuardPolicyWsOriginRecords<T extends { id: string }>(items: readonly T[]): T[] {
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

function canTransitionActiveProrationStatusState(fromState: string, toState: string): boolean {
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

type SyncedLiquidationWsOriginRecord = {
  readonly id: string;
  readonly status: string;
};

function isSyncedLiquidationWsOriginRecord(input: unknown): input is SyncedLiquidationWsOriginRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function mapToCoreZoneStatusSummary(source: {
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

const MONTHLY_MOVEOUT_WS_ORIGIN_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveMonthlyMoveoutWsOriginTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return MONTHLY_MOVEOUT_WS_ORIGIN_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatPrimaryOccupancyMetricStatusDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesRollingInvoiceWsOriginCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class BatchPromotionStatusCoordinator {
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

const STANDARD_GUARD_ESCALATION_LABELS: Record<string, string> = {
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
};

const BOUNDED_PENDING_ESCALATION_COLUMNS = [
  'depositHeldVnd',
  'balanceDueVnd',
  'lateFeeVnd',
  'discountCode',
] as const;

function reconcileCoreFloorplanUseRealtimeLedgerItems(
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

function computeMonthlyRefundConnectBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 8) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

type CoreDailyLiquidationRealtimePhase =
  'PENDING' | 'VERIFIED' | 'CLOSED';
export function useRealtime() {
  const qc = useQueryClient();
  const status = useAuth((s) => s.status);
  const logout = useAuth((s) => s.logout);
  useEffect(() => {
    if (status !== 'authed') return;
    let ws: WebSocket | null = null;
    let stopped = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let refetchTimer: ReturnType<typeof setTimeout> | undefined;

    const connect = async () => {
      try {
        const { ticket, url } = await post('/auth/realtime-ticket');
        if (stopped) return;
        const wsOrigin = API_ORIGIN
          ? API_ORIGIN.replace(/^http/, 'ws')
          : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;
        ws = new WebSocket(`${wsOrigin}${url}?ticket=${encodeURIComponent(ticket)}`);
        ws.onopen = () => { attempt = 0; };
        ws.onmessage = (ev) => {
          let m: any;
          try { m = JSON.parse(ev.data); } catch { return; }
          if (m.type === 'notification.created') {
            window.dispatchEvent(new CustomEvent('vaultra:notification', { detail: m }));
            qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0] ?? '').startsWith('/notifications') });
            if (m.title) toast.ok(m.title);
          } else if (m.type === 'data.changed') {
            clearTimeout(refetchTimer);
            refetchTimer = setTimeout(() => qc.invalidateQueries({ refetchType: 'active' }), 800);
          } else if (m.type === 'session.revoked') {
            void logout().then(() => { location.assign('/login'); });
          }
        };
        ws.onclose = () => { if (!stopped) schedule(); };
        ws.onerror = () => ws?.close();
      } catch {
        if (!stopped) schedule();
      }
    };
    const schedule = () => { attempt += 1; timer = setTimeout(connect, Math.min(30000, 1000 * 2 ** Math.min(attempt, 5))); };
    void connect();
    return () => { stopped = true; clearTimeout(timer); clearTimeout(refetchTimer); ws?.close(); };
  }, [status, qc, logout]);
}
