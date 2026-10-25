/**
 * Idempotent seed: reference data (roles, permissions, templates, fees, policy, settings) + a demo
 * dataset (3 facilities, unit types, ~110 units, floor plans, users for every role, KB, promotions).
 * Run: pnpm --filter @vaultra/api seed:demo   (safe to re-run)
 */
import '../src/common/config';
import { hash } from '@node-rs/argon2';
import { ulid } from 'ulid';
import { DEFAULT_POLICY_PARAMS, PERMISSIONS, ROLES, ROLE_META, ROLE_PERMISSIONS } from '@vaultra/shared';
import { createStandalonePrisma } from '../src/common/prisma.service';
import { TEMPLATES } from '../src/notifications/templates';
import { DEFAULT_SETTINGS } from '../src/config/settings.service';
import { chunkText, renderPolicyText } from '../src/assistant/kb.service';

const prisma = createStandalonePrisma();

function matchesSecondarySignatureReferenceCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class ExpressEscalationPrismaCoordinator {
  private readonly maxWindowDays = 34;
  private readonly branchScope = 'flow5:escalation';

  isEligibleWindow(elapsedDays: number, hasClearedBalance: boolean): boolean {
    if (elapsedDays < 0 || elapsedDays > this.maxWindowDays) return false;
    return hasClearedBalance;
  }

  normalizeReference(rawCode: string): string {
    const cleaned = rawCode.trim().toUpperCase();
    return cleaned ? `${this.branchScope}:${cleaned}` : this.branchScope;
  }
}

function calculatePortalFloorplanReferenceWindow(
  startIso: string,
  windowDays: number = 19,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileVerifiedRefundPrismaLedgerItems(
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

function computeUnifiedDepositReferenceBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeLedgerOverlockPrismaQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 30)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildBranchFacilityReferenceReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface ScopedContractPrismaPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateScopedContractPrismaInput(payload: ScopedContractPrismaPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface DynamicAuditTrailReferenceBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupDynamicAuditTrailReferenceByScope(items: readonly DynamicAuditTrailReferenceBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow5';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectDailyWorkforcePrismaChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupeStrictPolicyReferenceRecords<T extends { id: string }>(items: readonly T[]): T[] {
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

function canTransitionBoundedProrationPrismaState(fromState: string, toState: string): boolean {
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

type GuardLiquidationReferenceRecord = {
  readonly id: string;
  readonly status: string;
};

function isGuardLiquidationReferenceRecord(input: unknown): input is GuardLiquidationReferenceRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function mapToActiveZonePrismaSummary(source: {
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

const SYNCED_MOVEOUT_REFERENCE_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveSyncedMoveoutReferenceTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return SYNCED_MOVEOUT_REFERENCE_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatCoreOccupancyMetricPrismaDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesMonthlyInvoiceReferenceCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class PrimaryPromotionPrismaCoordinator {
  private readonly maxWindowDays = 35;
  private readonly branchScope = 'flow5:promotion';

  isEligibleWindow(elapsedDays: number, hasClearedBalance: boolean): boolean {
    if (elapsedDays < 0 || elapsedDays > this.maxWindowDays) return false;
    return hasClearedBalance;
  }

  normalizeReference(rawCode: string): string {
    const cleaned = rawCode.trim().toUpperCase();
    return cleaned ? `${this.branchScope}:${cleaned}` : this.branchScope;
  }
}

function calculateRollingHandoverReferenceWindow(
  startIso: string,
  windowDays: number = 20,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileBatchRenewalPrismaLedgerItems(
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

function computePendingCorridorReferenceBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeIndexedInspectionPrismaQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 30)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildStandardQuoteReferenceReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface TenantBillingCyclePrismaPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateTenantBillingCyclePrismaInput(payload: TenantBillingCyclePrismaPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface SecondaryDiscountReferenceBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupSecondaryDiscountReferenceByScope(items: readonly SecondaryDiscountReferenceBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow5';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectExpressCheckinPrismaChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupePortalSupportTicketReferenceRecords<T extends { id: string }>(items: readonly T[]): T[] {
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

function canTransitionVerifiedUnitSlotPrismaState(fromState: string, toState: string): boolean {
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

type UnifiedSettlementReferenceRecord = {
  readonly id: string;
  readonly status: string;
};

function isUnifiedSettlementReferenceRecord(input: unknown): input is UnifiedSettlementReferenceRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function mapToLedgerBookingPrismaSummary(source: {
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

const BRANCH_DELINQUENCY_REFERENCE_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveBranchDelinquencyReferenceTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return BRANCH_DELINQUENCY_REFERENCE_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatScopedApprovalPrismaDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesDynamicSignatureReferenceCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class DailyEscalationPrismaCoordinator {
  private readonly maxWindowDays = 36;
  private readonly branchScope = 'flow5:escalation';

  isEligibleWindow(elapsedDays: number, hasClearedBalance: boolean): boolean {
    if (elapsedDays < 0 || elapsedDays > this.maxWindowDays) return false;
    return hasClearedBalance;
  }

  normalizeReference(rawCode: string): string {
    const cleaned = rawCode.trim().toUpperCase();
    return cleaned ? `${this.branchScope}:${cleaned}` : this.branchScope;
  }
}

function calculateStrictFloorplanReferenceWindow(
  startIso: string,
  windowDays: number = 21,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileBoundedRefundPrismaLedgerItems(
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

function computeGuardDepositReferenceBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeActiveOverlockPrismaQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 30)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildSyncedFacilityReferenceReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface CoreContractPrismaPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateCoreContractPrismaInput(payload: CoreContractPrismaPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface MonthlyAuditTrailReferenceBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupMonthlyAuditTrailReferenceByScope(items: readonly MonthlyAuditTrailReferenceBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow5';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectPrimaryWorkforcePrismaChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupeRollingPolicyReferenceRecords<T extends { id: string }>(items: readonly T[]): T[] {
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

function canTransitionBatchProrationPrismaState(fromState: string, toState: string): boolean {
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

type PendingLiquidationReferenceRecord = {
  readonly id: string;
  readonly status: string;
};

function isPendingLiquidationReferenceRecord(input: unknown): input is PendingLiquidationReferenceRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function mapToIndexedZonePrismaSummary(source: {
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

const STANDARD_MOVEOUT_REFERENCE_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveStandardMoveoutReferenceTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return STANDARD_MOVEOUT_REFERENCE_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatTenantOccupancyMetricPrismaDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesSecondaryInvoiceReferenceCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class ExpressPromotionPrismaCoordinator {
  private readonly maxWindowDays = 37;
  private readonly branchScope = 'flow5:promotion';

  isEligibleWindow(elapsedDays: number, hasClearedBalance: boolean): boolean {
    if (elapsedDays < 0 || elapsedDays > this.maxWindowDays) return false;
    return hasClearedBalance;
  }

  normalizeReference(rawCode: string): string {
    const cleaned = rawCode.trim().toUpperCase();
    return cleaned ? `${this.branchScope}:${cleaned}` : this.branchScope;
  }
}

function calculatePortalHandoverReferenceWindow(
  startIso: string,
  windowDays: number = 17,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileVerifiedRenewalPrismaLedgerItems(
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

function computeUnifiedCorridorReferenceBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeLedgerInspectionPrismaQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 30)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildBranchQuoteReferenceReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface ScopedBillingCyclePrismaPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateScopedBillingCyclePrismaInput(payload: ScopedBillingCyclePrismaPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface DynamicDiscountReferenceBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupDynamicDiscountReferenceByScope(items: readonly DynamicDiscountReferenceBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow5';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectDailyCheckinPrismaChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupeStrictSupportTicketReferenceRecords<T extends { id: string }>(items: readonly T[]): T[] {
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

function canTransitionBoundedUnitSlotPrismaState(fromState: string, toState: string): boolean {
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

type GuardSettlementReferenceRecord = {
  readonly id: string;
  readonly status: string;
};

function isGuardSettlementReferenceRecord(input: unknown): input is GuardSettlementReferenceRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function mapToActiveBookingPrismaSummary(source: {
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

const SYNCED_DELINQUENCY_REFERENCE_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveSyncedDelinquencyReferenceTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return SYNCED_DELINQUENCY_REFERENCE_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatCoreApprovalPrismaDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

const STRICT_ACTIVE_DISCOUNT_LABELS: Record<string, string> = {
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
};
export const DEMO_PASSWORD = process.env.SEED_PASSWORD ?? '12345';
const log = (m: string) => console.log(`• ${m}`);
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const hoursOf = (open: string, close: string, days = DAYS) => Object.fromEntries(days.map((d) => [d, [open, close]]));

async function reference() {
  for (const [ri, r] of ROLES.entries()) {
    const m = ROLE_META[r];
    await prisma.role.upsert({ where: { code: r }, create: { id: ri + 1, code: r, name: m.name, description: m.nameEn, is_facility_scoped: m.facilityScoped }, update: { name: m.name, description: m.nameEn, is_facility_scoped: m.facilityScoped } });
  }
  for (const [pi, p] of PERMISSIONS.entries()) await prisma.permission.upsert({ where: { code: p.code }, create: { id: pi + 1, ...p }, update: { module: p.module, description: p.description } });
  const perms = new Map((await prisma.permission.findMany()).map((p) => [p.code, p.id]));
  for (const r of ROLES) {
    const role = await prisma.role.findUniqueOrThrow({ where: { code: r } });
    await prisma.rolePermission.deleteMany({ where: { role_id: role.id } });
    const rows = Object.entries(ROLE_PERMISSIONS[r]).filter(([c]) => perms.has(c)).map(([c, g]) => ({ role_id: role.id, permission_id: perms.get(c)!, scope: g.scope, read_only: !!g.readOnly }));
    if (rows.length) await prisma.rolePermission.createMany({ data: rows });
  }
  log(`roles ${ROLES.length}, permissions ${PERMISSIONS.length}`);

  for (const s of DEFAULT_SETTINGS) {
    await prisma.systemSetting.upsert({ where: { key: s.key }, create: { key: s.key, value: s.value as never, value_type: s.type, category: s.category, description: s.description }, update: s.key === 'security.password_min_length' ? { value: s.value as never } : {} });
  }
  let n = 0;
  for (const [event, t] of Object.entries(TEMPLATES)) {
    const exists = await prisma.notificationTemplate.findFirst({ where: { event_code: event, channel: 'EMAIL', locale: 'vi' } });
    if (!exists) { await prisma.notificationTemplate.create({ data: { event_code: event, channel: 'EMAIL', locale: 'vi', subject: t.subject, body: t.body, is_mandatory: t.mandatory, active: true } }); n++; }
  }
  log(`templates +${n}`);

  // Fee catalog of spec §6.4 4C (12 codes). The last flag = Facility Staff may apply it (service fees, §6.3 3A step 4);
  // system fees (late, overlock, renewal, admin, early termination) are only raised by the system or managers.
  const fees = [
    ['ADMIN_FEE', 'Phí quản trị', 'FIXED', 100000, null, null, false, false],
    ['LATE_FEE', 'Phí trễ hạn', 'GREATER_OF', 50000, 10, 500000, false, false],
    ['OVERLOCK_FEE', 'Phí mở khóa chặn', 'FIXED', 100000, null, null, false, false],
    ['RENEWAL_FEE', 'Phí gia hạn', 'FIXED', 0, null, null, false, false],
    ['KEY_REPLACEMENT', 'Phí thay khóa / làm lại chìa', 'FIXED', 150000, null, null, true, true],
    ['CARD_REPLACEMENT', 'Phí cấp lại thẻ ra vào', 'FIXED', 50000, null, null, false, true],
    ['LOCK_SALE', 'Bán ổ khóa', 'FIXED', 120000, null, null, true, true],
    ['CLEANING_FEE', 'Phí vệ sinh', 'FIXED', 200000, null, null, true, true],
    ['DAMAGE_FEE', 'Phí hư hại', 'FIXED', 0, null, null, true, true],
    ['EARLY_TERMINATION_FEE', 'Phí chấm dứt sớm', 'FIXED', 0, null, null, true, false],
    ['ABANDONED_GOODS_REMOVAL', 'Phí dọn tài sản bỏ lại', 'FIXED', 300000, null, null, true, true],
    ['OTHER_SERVICE', 'Phí dịch vụ khác', 'FIXED', 0, null, null, true, true],
  ] as const;
  for (const [code, name, calc, amount, percent, cap, editable, staff] of fees) {
    const ex = await prisma.feeType.findFirst({ where: { code } });
    const roles = staff ? ['FACILITY_STAFF', 'FACILITY_MANAGER', 'BUSINESS_OPS_MANAGER'] : ['FACILITY_MANAGER', 'BUSINESS_OPS_MANAGER'];
    if (!ex) await prisma.feeType.create({ data: { code, name, calc_type: calc, amount, percent, cap_amount: cap, editable_amount: editable, taxable: true, refundable: false, allowed_roles: roles } });
  }
  log('fee types');

  let pol = await prisma.policy.findFirst({ where: { scope: 'GLOBAL' } });
  if (!pol) pol = await prisma.policy.create({ data: { scope: 'GLOBAL', name: 'Chính sách thuê kho toàn hệ thống' } });
  if (!(await prisma.policyVersion.findFirst({ where: { policy_id: pol.id } }))) {
    await prisma.policyVersion.create({ data: { public_id: ulid(), policy_id: pol.id, version_no: 1, params: DEFAULT_POLICY_PARAMS as never, status: 'ACTIVE', effective_from: new Date('2026-01-01T00:00:00Z'), published_at: new Date(), change_reason: 'Phiên bản khởi tạo' } });
  }
  log('global policy v1 ACTIVE');

  const bands: [string, number, number][] = [['XS', 150000, 500000], ['S', 400000, 1200000], ['M', 900000, 2500000], ['L', 1800000, 4500000], ['XL', 3000000, 8000000], ['VEHICLE', 2000000, 6000000], ['LOCKER', 80000, 400000]];
  for (const [size, min, max] of bands) {
    if (!(await prisma.priceBand.findFirst({ where: { size_category: size as never, facility_id: null } }))) await prisma.priceBand.create({ data: { size_category: size as never, min_monthly_price: min, max_monthly_price: max } });
  }
}

type UT = { code: string; name: string; size: 'XS' | 'S' | 'M' | 'L' | 'XL'; w: number; d: number; h: number; price: number; climate?: boolean; ground?: boolean; drive?: boolean; count: number; fits: string };
const TYPES: UT[] = [
  { code: 'XS1', name: 'Tủ khóa 1m²', size: 'XS', w: 1, d: 1, h: 2, price: 290000, count: 10, fits: 'Vài thùng carton, vali, đồ mùa đông' },
  { code: 'S2', name: 'Kho nhỏ 2.5m²', size: 'S', w: 1.5, d: 1.7, h: 2.4, price: 690000, count: 12, fits: 'Nội thất phòng nhỏ, xe đạp, 10–15 thùng' },
  { code: 'M5', name: 'Kho vừa 5m²', size: 'M', w: 2, d: 2.5, h: 2.5, price: 1390000, climate: true, count: 8, fits: 'Nội thất studio hoặc căn hộ 1 phòng ngủ' },
  { code: 'M6G', name: 'Kho vừa 6m² tầng trệt', size: 'M', w: 2, d: 3, h: 2.5, price: 1590000, ground: true, count: 4, fits: 'Hàng tồn kho cửa hàng nhỏ, dễ bốc xếp' },
  { code: 'L10', name: 'Kho lớn 10m²', size: 'L', w: 2.5, d: 4, h: 2.7, price: 2690000, climate: true, count: 4, fits: 'Nội thất căn hộ 2 phòng ngủ' },
  { code: 'XL20', name: 'Kho cực lớn 20m²', size: 'XL', w: 4, d: 5, h: 3, price: 4990000, drive: true, ground: true, count: 2, fits: 'Hàng hóa kinh doanh, thiết bị lớn' },
];

const FACILITIES = [
  { code: 'HCM-Q7', name: 'Vaultra Quận 7', slug: 'vaultra-quan-7', district: 'Quận 7', province: 'TP. Hồ Chí Minh', pslug: 'ho-chi-minh', addr: '128 Nguyễn Thị Thập', lat: 10.7389, lng: 106.7197, phone: '028 7300 0007', amenities: ['camera_24_7', 'bao_ve', 'thang_may', 'dieu_hoa', 'bai_do_xe', 'xe_day'], zones: [['A', 'Khu A — Tầng 1', 1, true], ['B', 'Khu B — Tầng 2', 2, false]] },
  { code: 'HCM-TD', name: 'Vaultra Thủ Đức', slug: 'vaultra-thu-duc', district: 'TP. Thủ Đức', province: 'TP. Hồ Chí Minh', pslug: 'ho-chi-minh', addr: '56 Võ Văn Ngân', lat: 10.8506, lng: 106.7718, phone: '028 7300 0056', amenities: ['camera_24_7', 'bao_ve', 'bai_do_xe', 'xe_day', 'cua_lon'], zones: [['A', 'Khu A — Tầng 1', 1, true], ['B', 'Khu B — Tầng 2', 2, false]] },
  { code: 'HN-CG', name: 'Vaultra Cầu Giấy', slug: 'vaultra-cau-giay', district: 'Cầu Giấy', province: 'Hà Nội', pslug: 'ha-noi', addr: '19 Duy Tân', lat: 21.0307, lng: 105.7826, phone: '024 7300 0019', amenities: ['camera_24_7', 'bao_ve', 'thang_may', 'dieu_hoa', 'xe_day'], zones: [['A', 'Khu A — Tầng 1', 1, true], ['B', 'Khu B — Tầng 2', 2, false]] },
];

async function demo() {
  const pwd = await hash(DEMO_PASSWORD, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
  const facs: Record<string, { id: bigint; public_id: string }> = {};
  for (const f of FACILITIES) {
    let fac = await prisma.facility.findUnique({ where: { code: f.code } });
    if (!fac) {
      fac = await prisma.facility.create({
        data: {
          public_id: ulid(), code: f.code, name: f.name, slug: f.slug, address_line: f.addr, district: f.district, province: f.province, province_slug: f.pslug, latitude: f.lat, longitude: f.lng,
          status: 'ACTIVE', phone: f.phone, email: `${f.code.toLowerCase()}@vaultra.test`, hotline: '1900 6868', office_hours: hoursOf('08:00', '18:00', DAYS.slice(0, 6)), access_hours: hoursOf('06:00', '22:00'),
          amenities: f.amenities, description: `Cơ sở lưu trữ ${f.name}: camera 24/7, bảo vệ, kho sạch sẽ, ra vào bằng mã PIN cá nhân.`, opened_at: new Date('2025-06-01'), total_area_m2: 900,
        },
      });
      const zones: Record<string, bigint> = {};
      for (const [zc, zn, fl, drive] of f.zones as [string, string, number, boolean][]) {
        zones[zc] = (await prisma.zone.create({ data: { facility_id: fac.id, code: zc, name: zn, floor: fl, drive_up: drive, has_elevator: fl > 1, climate_controlled: fl > 1, sort_order: fl } })).id;
      }
      const zoneList = Object.entries(zones);
      let seq = 0;
      for (const t of TYPES) {
        const ut = await prisma.unitType.create({
          data: {
            public_id: ulid(), facility_id: fac.id, code: t.code, name: t.name, size_category: t.size, width_m: t.w, depth_m: t.d, height_m: t.h,
            climate_controlled: !!t.climate, indoor: true, drive_up: !!t.drive, ground_floor: t.ground ?? t.size === 'XS' ? false : !!t.ground, power_outlet: t.size === 'L' || t.size === 'XL',
            fits_description: t.fits, description: t.fits, status: 'ACTIVE', list_price: Math.round(t.price * 1.1 / 1000) * 1000, online_price: t.price,
            inspection_checklist: ['Sàn và tường', 'Cửa và bản lề', 'Khóa/ổ khóa', 'Đèn và ổ điện', 'Vệ sinh'],
          },
        });
        for (let i = 0; i < t.count; i++) {
          const [zc, zid] = zoneList[(t.ground || t.drive || t.size === 'XL' ? 0 : seq) % zoneList.length];
          seq++;
          await prisma.unit.create({ data: { public_id: ulid(), facility_id: fac.id, unit_type_id: ut.id, zone_id: zid, code: `${zc}-${String(seq).padStart(3, '0')}`, door_type: t.size === 'XS' ? 'LOCKER' : t.size === 'XL' ? 'ROLL_UP' : 'SWING', cleaned_at: new Date() } });
        }
      }
      // floor plans: lay each zone's units out on a grid
      for (const [zc, zid] of zoneList) {
        const plan = await prisma.floorPlan.create({ data: { facility_id: fac.id, zone_id: zid, name: `Sơ đồ ${f.name} — ${zc}`, width: 1200, height: 700, grid_size: 20, published_at: new Date() } });
        const units = await prisma.unit.findMany({ where: { zone_id: zid }, include: { unit_type: true }, orderBy: { code: 'asc' } });
        let x = 40; let y = 40; let rowH = 0;
        for (const u of units) {
          const w = Math.max(60, Math.round(Number(u.unit_type.width_m) * 40)); const h = Math.max(60, Math.round(Number(u.unit_type.depth_m) * 40));
          if (x + w > 1160) { x = 40; y += rowH + 24; rowH = 0; }
          await prisma.unitShape.create({ data: { floor_plan_id: plan.id, unit_id: u.id, x, y, w, h } });
          x += w + 16; rowH = Math.max(rowH, h);
        }
      }
      for (let wd = 1; wd <= 6; wd++) {
        for (const [s, e] of [['09:00', '12:00'], ['13:30', '17:30']]) await prisma.appointmentSlot.create({ data: { facility_id: fac.id, type: 'BOTH', weekday: wd, start_time: s, end_time: e, capacity: 3 } });
      }
      await prisma.facilityNotice.create({ data: { facility_id: fac.id, title: 'Giờ ra vào', body: 'Khách thuê ra vào kho từ 06:00 đến 22:00 hằng ngày bằng mã PIN. Cần hỗ trợ, liên hệ hotline 1900 6868.', severity: 'INFO', starts_at: new Date('2026-01-01') } });
      log(`facility ${f.code}: ${seq} units`);
    }
    facs[f.code] = fac;
  }

  const roleId = async (c: string) => (await prisma.role.findUniqueOrThrow({ where: { code: c as never } })).id;
  const mkUser = async (email: string, name: string, phone: string, role: string, facility?: string) => {
    let u = await prisma.user.findUnique({ where: { email } });
    if (!u) {
      u = await prisma.user.create({ data: { public_id: ulid(), email, full_name: name, phone, password_hash: pwd, status: 'ACTIVE', email_verified_at: new Date(), password_changed_at: new Date() } });
    } else {
      u = await prisma.user.update({ where: { id: u.id }, data: { password_hash: pwd, status: 'ACTIVE', failed_login_count: 0, locked_until: null } });
    }
    const rid = await roleId(role);
    const fid = facility ? facs[facility].id : null;
    const has = await prisma.userRole.findFirst({ where: { user_id: u.id, role_id: rid, facility_id: fid, revoked_at: null } });
    if (!has) await prisma.userRole.create({ data: { user_id: u.id, role_id: rid, facility_id: fid } });
    return u;
  };
  await mkUser('admin@vaultra.test', 'Quản trị Vaultra', '0900000001', 'SYSTEM_ADMIN');
  await mkUser('bom@vaultra.test', 'Lê Hoàng Vận hành', '0900000002', 'BUSINESS_OPS_MANAGER');
  await mkUser('fm.q7@vaultra.test', 'Trần Minh Quản (Q7)', '0900000003', 'FACILITY_MANAGER', 'HCM-Q7');
  await mkUser('staff.q7@vaultra.test', 'Nguyễn Thu Nhân viên (Q7)', '0900000004', 'FACILITY_STAFF', 'HCM-Q7');
  await mkUser('fm.td@vaultra.test', 'Phạm Quang Quản (Thủ Đức)', '0900000005', 'FACILITY_MANAGER', 'HCM-TD');
  await mkUser('staff.td@vaultra.test', 'Võ Thanh Nhân viên (Thủ Đức)', '0900000006', 'FACILITY_STAFF', 'HCM-TD');
  await mkUser('fm.hn@vaultra.test', 'Đỗ Hải Quản (Cầu Giấy)', '0900000007', 'FACILITY_MANAGER', 'HN-CG');
  await mkUser('staff.hn@vaultra.test', 'Bùi Lan Nhân viên (Cầu Giấy)', '0900000008', 'FACILITY_STAFF', 'HN-CG');

  const cust = [['customer@vaultra.test', 'Nguyễn Văn An', '0911111111'], ['customer2@vaultra.test', 'Trần Thị Bình', '0922222222']];
  let cn = 0;
  for (const [email, name, phone] of cust) {
    const u = await mkUser(email, name, phone, 'CUSTOMER');
    if (!(await prisma.customer.findFirst({ where: { user_id: u.id } }))) {
      cn++;
      await prisma.customer.create({ data: { public_id: ulid(), code: `CUS-SEED-${String(cn).padStart(4, '0')}`, user_id: u.id, full_name: name, email, phone, address_line: '12 Lê Lợi', district: 'Quận 1', province: 'TP. Hồ Chí Minh' } });
    }
  }
  await prisma.user.updateMany({ data: { password_hash: pwd, failed_login_count: 0, locked_until: null } });
  log('demo users (password: ' + DEMO_PASSWORD + ')');

  if (!(await prisma.promotion.findFirst({ where: { code: 'WELCOME10' } }))) {
    await prisma.promotion.create({ data: { public_id: ulid(), code: 'WELCOME10', name: 'Chào mừng — giảm 10% các kỳ đầu', description: 'Giảm 10% tiền thuê cho 3 kỳ đầu, khách mới', type: 'PERCENT', value: 10, applies_to_periods: 3, min_term_months: 1, new_customers_only: true, starts_at: new Date('2026-01-01'), status: 'ACTIVE' } });
    await prisma.promotion.create({ data: { public_id: ulid(), code: null, name: 'Ưu đãi thuê 6 tháng — tặng 1 tháng', description: 'Thuê từ 6 tháng tặng 1 tháng', type: 'FREE_MONTHS', value: 1, applies_to_periods: 1, min_term_months: 6, starts_at: new Date('2026-01-01'), status: 'ACTIVE' } });
  }

  // Knowledge base
  const kb: [string, string, string, string][] = [
    ['FAQ', 'PUBLIC', 'Thuê kho tự quản hoạt động thế nào?', 'Chọn cơ sở và loại kho, đặt giữ chỗ và thanh toán tiền cọc cùng kỳ đầu. Sau khi được phân bổ kho, bạn đặt lịch nhận kho, ký hợp đồng điện tử tại quầy hoặc trên ứng dụng, nhận mã PIN và bắt đầu sử dụng. Khi trả kho, nhân viên kiểm tra hiện trạng và hoàn cọc theo chính sách.'],
    ['FAQ', 'PUBLIC', 'Kho nào phù hợp với đồ của tôi?', 'Dùng công cụ gợi ý kích thước: nhập số lượng thùng, nội thất, xe máy... để ước tính thể tích. Tủ khóa 1m² phù hợp vài thùng đồ; kho 2.5m² cho nội thất phòng nhỏ; kho 5–6m² cho căn hộ studio hoặc 1 phòng ngủ; 10m² trở lên cho căn hộ 2 phòng ngủ hoặc hàng kinh doanh.'],
    ['RULES', 'PUBLIC', 'Nội quy và vật cấm lưu kho', 'Nghiêm cấm cất giữ chất dễ cháy nổ, hóa chất độc hại, vũ khí, chất cấm, thực phẩm tươi sống, động vật và bất kỳ hàng hóa vi phạm pháp luật. Không ở, ngủ hoặc kinh doanh trực tiếp trong kho. Khách chịu trách nhiệm về tài sản và nên mua bảo hiểm riêng.'],
    ['FAQ', 'CUSTOMER', 'Quên mã PIN thì làm gì?', 'Đăng nhập ứng dụng, vào Hợp đồng > Mã truy cập để xem hoặc đổi PIN. Vì lý do bảo mật, nhân viên và trợ lý AI không đọc PIN cho bạn qua tin nhắn.'],
    ['SOP', 'INTERNAL', 'Quy trình bàn giao kho', 'Kiểm tra giấy tờ tùy thân, đối chiếu hợp đồng, chụp tối thiểu số ảnh theo chính sách, lập biên bản hiện trạng, cấp PIN, hướng dẫn khách và lưu chữ ký trước khi chuyển kho sang OCCUPIED.'],
  ];
  for (const [cat, aud, title, body] of kb) {
    if (await prisma.kbArticle.findFirst({ where: { title } })) continue;
    const a = await prisma.kbArticle.create({ data: { public_id: ulid(), category: cat as never, audience: aud as never, title, body, status: 'PUBLISHED' } });
    await prisma.kbChunk.createMany({ data: chunkText(`${title}\n\n${body}`).map((content, i) => ({ article_id: a.id, chunk_no: i + 1, content, audience: a.audience })) });
  }
  const pv = await prisma.policyVersion.findFirstOrThrow({ where: { status: 'ACTIVE', policy: { scope: 'GLOBAL' } } });
  void renderPolicyText; void pv; // the API syncs the AUTO_POLICY article on startup
}

(async () => {
  await reference();
  if (process.env.SEED_REFERENCE_ONLY !== 'true') await demo();
  console.log('Seed complete.');
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});

function mapToVerifiedSettlementReferenceSummary(source: {
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

type VerifiedGuardCheckinSeedDemoTag = 'flow5' | 'active' | 'settled';
