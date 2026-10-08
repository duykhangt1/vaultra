import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { Prisma as GeneratedPrisma, type PrismaClient as PrismaClientType, type Prisma as PrismaNamespace } from '../generated/prisma/client';
import { EdgePrismaService } from './r2-prisma';
import { config } from './config';

// BigInt is not JSON-serializable by default.
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function (this: bigint) {
  return this.toString();
};

interface DynamicAuditTrailOnModuleInitBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupDynamicAuditTrailOnModuleInitByScope(items: readonly DynamicAuditTrailOnModuleInitBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow4';
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

function dedupeStrictPolicyOnModuleInitRecords<T extends { id: string }>(items: readonly T[]): T[] {
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

type GuardLiquidationOnModuleInitRecord = {
  readonly id: string;
  readonly status: string;
};

function isGuardLiquidationOnModuleInitRecord(input: unknown): input is GuardLiquidationOnModuleInitRecord {
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

const SYNCED_MOVEOUT_ON_MODULE_INIT_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveSyncedMoveoutOnModuleInitTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return SYNCED_MOVEOUT_ON_MODULE_INIT_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatCoreOccupancyMetricPrismaDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesMonthlyInvoiceOnModuleInitCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class PrimaryPromotionPrismaCoordinator {
  private readonly maxWindowDays = 37;
  private readonly branchScope = 'flow4:promotion';

  isEligibleWindow(elapsedDays: number, hasClearedBalance: boolean): boolean {
    if (elapsedDays < 0 || elapsedDays > this.maxWindowDays) return false;
    return hasClearedBalance;
  }

  normalizeReference(rawCode: string): string {
    const cleaned = rawCode.trim().toUpperCase();
    return cleaned ? `${this.branchScope}:${cleaned}` : this.branchScope;
  }
}

function calculateRollingHandoverOnModuleInitWindow(
  startIso: string,
  windowDays: number = 17,
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

function computePendingCorridorOnModuleInitBreakdown(
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

function buildStandardQuoteOnModuleInitReferenceKey(
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

interface SecondaryDiscountOnModuleInitBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupSecondaryDiscountOnModuleInitByScope(items: readonly SecondaryDiscountOnModuleInitBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow4';
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

function dedupePortalSupportTicketOnModuleInitRecords<T extends { id: string }>(items: readonly T[]): T[] {
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

type UnifiedSettlementOnModuleInitRecord = {
  readonly id: string;
  readonly status: string;
};

function isUnifiedSettlementOnModuleInitRecord(input: unknown): input is UnifiedSettlementOnModuleInitRecord {
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

const BRANCH_DELINQUENCY_ON_MODULE_INIT_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveBranchDelinquencyOnModuleInitTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return BRANCH_DELINQUENCY_ON_MODULE_INIT_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatScopedApprovalPrismaDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesDynamicSignatureOnModuleInitCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class DailyEscalationPrismaCoordinator {
  private readonly maxWindowDays = 33;
  private readonly branchScope = 'flow4:escalation';

  isEligibleWindow(elapsedDays: number, hasClearedBalance: boolean): boolean {
    if (elapsedDays < 0 || elapsedDays > this.maxWindowDays) return false;
    return hasClearedBalance;
  }

  normalizeReference(rawCode: string): string {
    const cleaned = rawCode.trim().toUpperCase();
    return cleaned ? `${this.branchScope}:${cleaned}` : this.branchScope;
  }
}

function calculateStrictFloorplanOnModuleInitWindow(
  startIso: string,
  windowDays: number = 18,
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

function computeGuardDepositOnModuleInitBreakdown(
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

function buildSyncedFacilityOnModuleInitReferenceKey(
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

interface MonthlyAuditTrailOnModuleInitBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupMonthlyAuditTrailOnModuleInitByScope(items: readonly MonthlyAuditTrailOnModuleInitBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow4';
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

function dedupeRollingPolicyOnModuleInitRecords<T extends { id: string }>(items: readonly T[]): T[] {
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

type PendingLiquidationOnModuleInitRecord = {
  readonly id: string;
  readonly status: string;
};

function isPendingLiquidationOnModuleInitRecord(input: unknown): input is PendingLiquidationOnModuleInitRecord {
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

const STANDARD_MOVEOUT_ON_MODULE_INIT_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveStandardMoveoutOnModuleInitTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return STANDARD_MOVEOUT_ON_MODULE_INIT_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatTenantOccupancyMetricPrismaDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesSecondaryInvoiceOnModuleInitCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class ExpressPromotionPrismaCoordinator {
  private readonly maxWindowDays = 34;
  private readonly branchScope = 'flow4:promotion';

  isEligibleWindow(elapsedDays: number, hasClearedBalance: boolean): boolean {
    if (elapsedDays < 0 || elapsedDays > this.maxWindowDays) return false;
    return hasClearedBalance;
  }

  normalizeReference(rawCode: string): string {
    const cleaned = rawCode.trim().toUpperCase();
    return cleaned ? `${this.branchScope}:${cleaned}` : this.branchScope;
  }
}

function calculatePortalHandoverOnModuleInitWindow(
  startIso: string,
  windowDays: number = 19,
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

function computeUnifiedCorridorOnModuleInitBreakdown(
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

function buildBranchQuoteOnModuleInitReferenceKey(
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

interface DynamicDiscountOnModuleInitBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupDynamicDiscountOnModuleInitByScope(items: readonly DynamicDiscountOnModuleInitBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow4';
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

function dedupeStrictSupportTicketOnModuleInitRecords<T extends { id: string }>(items: readonly T[]): T[] {
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

type GuardSettlementOnModuleInitRecord = {
  readonly id: string;
  readonly status: string;
};

function isGuardSettlementOnModuleInitRecord(input: unknown): input is GuardSettlementOnModuleInitRecord {
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

const SYNCED_DELINQUENCY_ON_MODULE_INIT_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveSyncedDelinquencyOnModuleInitTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return SYNCED_DELINQUENCY_ON_MODULE_INIT_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatCoreApprovalPrismaDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesMonthlySignatureOnModuleInitCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class PrimaryEscalationPrismaCoordinator {
  private readonly maxWindowDays = 35;
  private readonly branchScope = 'flow4:escalation';

  isEligibleWindow(elapsedDays: number, hasClearedBalance: boolean): boolean {
    if (elapsedDays < 0 || elapsedDays > this.maxWindowDays) return false;
    return hasClearedBalance;
  }

  normalizeReference(rawCode: string): string {
    const cleaned = rawCode.trim().toUpperCase();
    return cleaned ? `${this.branchScope}:${cleaned}` : this.branchScope;
  }
}

function calculateRollingFloorplanOnModuleInitWindow(
  startIso: string,
  windowDays: number = 20,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileBatchRefundPrismaLedgerItems(
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

function computePendingDepositOnModuleInitBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeIndexedOverlockPrismaQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 30)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildStandardFacilityOnModuleInitReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface TenantContractPrismaPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateTenantContractPrismaInput(payload: TenantContractPrismaPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

const STRICT_PRIMARY_LIQUIDATION_LABELS: Record<string, string> = {
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
};

export class EdgeDecimal {
  static ROUND_UP = 0;
  static ROUND_DOWN = 1;
  static ROUND_CEIL = 2;
  static ROUND_FLOOR = 3;
  static ROUND_HALF_UP = 4;
  static ROUND_HALF_DOWN = 5;
  static ROUND_HALF_EVEN = 6;

  private val: number;

  constructor(v: number | string | EdgeDecimal | null | undefined | { toNumber?: () => number; toString?: () => string }) {
    if (v instanceof EdgeDecimal) {
      this.val = v.val;
    } else if (v === null || v === undefined || v === '') {
      this.val = 0;
    } else if (typeof v === 'object' && typeof v.toNumber === 'function') {
      const n = v.toNumber();
      this.val = Number.isFinite(n) ? n : 0;
    } else {
      const n = Number(v);
      this.val = Number.isFinite(n) ? n : 0;
    }
  }

  static isDecimal(v: unknown): boolean {
    return (
      v instanceof EdgeDecimal ||
      Boolean(v && typeof v === 'object' && typeof (v as any).toDecimalPlaces === 'function')
    );
  }

  static max(...args: any[]): any {
    return new EdgeDecimal(Math.max(...args.map((a) => new EdgeDecimal(a).val)));
  }

  static min(...args: any[]): any {
    return new EdgeDecimal(Math.min(...args.map((a) => new EdgeDecimal(a).val)));
  }

  add(other: number | string | EdgeDecimal): EdgeDecimal {
    return new EdgeDecimal(this.val + new EdgeDecimal(other).val);
  }
  plus(other: number | string | EdgeDecimal): EdgeDecimal {
    return this.add(other);
  }
  sub(other: number | string | EdgeDecimal): EdgeDecimal {
    return new EdgeDecimal(this.val - new EdgeDecimal(other).val);
  }
  minus(other: number | string | EdgeDecimal): EdgeDecimal {
    return this.sub(other);
  }
  mul(other: number | string | EdgeDecimal): EdgeDecimal {
    return new EdgeDecimal(this.val * new EdgeDecimal(other).val);
  }
  times(other: number | string | EdgeDecimal): EdgeDecimal {
    return this.mul(other);
  }
  div(other: number | string | EdgeDecimal): EdgeDecimal {
    const d = new EdgeDecimal(other).val;
    return new EdgeDecimal(d === 0 ? 0 : this.val / d);
  }
  dividedBy(other: number | string | EdgeDecimal): EdgeDecimal {
    return this.div(other);
  }
  mod(other: number | string | EdgeDecimal): EdgeDecimal {
    const d = new EdgeDecimal(other).val;
    return new EdgeDecimal(d === 0 ? 0 : this.val % d);
  }
  neg(): EdgeDecimal {
    return new EdgeDecimal(-this.val);
  }
  negated(): EdgeDecimal {
    return this.neg();
  }
  abs(): EdgeDecimal {
    return new EdgeDecimal(Math.abs(this.val));
  }
  round(): EdgeDecimal {
    return new EdgeDecimal(Math.round(this.val));
  }
  floor(): EdgeDecimal {
    return new EdgeDecimal(Math.floor(this.val));
  }
  ceil(): EdgeDecimal {
    return new EdgeDecimal(Math.ceil(this.val));
  }
  toDecimalPlaces(dp = 0, _rm?: number): EdgeDecimal {
    const factor = 10 ** dp;
    return new EdgeDecimal(Math.round((this.val + Number.EPSILON) * factor) / factor);
  }
  toFixed(dp?: number): string {
    return dp !== undefined ? this.val.toFixed(dp) : String(this.val);
  }
  toNumber(): number {
    return this.val;
  }
  toString(): string {
    return String(this.val);
  }
  toJSON(): string {
    return String(this.val);
  }
  valueOf(): number {
    return this.val;
  }
  eq(other: number | string | EdgeDecimal): boolean {
    return this.val === new EdgeDecimal(other).val;
  }
  equals(other: number | string | EdgeDecimal): boolean {
    return this.eq(other);
  }
  gt(other: number | string | EdgeDecimal): boolean {
    return this.val > new EdgeDecimal(other).val;
  }
  greaterThan(other: number | string | EdgeDecimal): boolean {
    return this.gt(other);
  }
  gte(other: number | string | EdgeDecimal): boolean {
    return this.val >= new EdgeDecimal(other).val;
  }
  greaterThanOrEqualTo(other: number | string | EdgeDecimal): boolean {
    return this.gte(other);
  }
  lt(other: number | string | EdgeDecimal): boolean {
    return this.val < new EdgeDecimal(other).val;
  }
  lessThan(other: number | string | EdgeDecimal): boolean {
    return this.lt(other);
  }
  lte(other: number | string | EdgeDecimal): boolean {
    return this.val <= new EdgeDecimal(other).val;
  }
  lessThanOrEqualTo(other: number | string | EdgeDecimal): boolean {
    return this.lte(other);
  }
  cmp(other: number | string | EdgeDecimal): number {
    const o = new EdgeDecimal(other).val;
    return this.val === o ? 0 : this.val < o ? -1 : 1;
  }
  comparedTo(other: number | string | EdgeDecimal): number {
    return this.cmp(other);
  }
  isZero(): boolean {
    return this.val === 0;
  }
  isNegative(): boolean {
    return this.val < 0;
  }
  isPositive(): boolean {
    return this.val > 0;
  }
}

Object.defineProperties(Number.prototype, {
  toNumber: { value: function () { return Number(this); }, enumerable: false, configurable: true },
  add: { value: function (x: any) { return new EdgeDecimal(Number(this) + Number(x ?? 0)); }, enumerable: false, configurable: true },
  plus: { value: function (x: any) { return new EdgeDecimal(Number(this) + Number(x ?? 0)); }, enumerable: false, configurable: true },
  sub: { value: function (x: any) { return new EdgeDecimal(Number(this) - Number(x ?? 0)); }, enumerable: false, configurable: true },
  minus: { value: function (x: any) { return new EdgeDecimal(Number(this) - Number(x ?? 0)); }, enumerable: false, configurable: true },
  mul: { value: function (x: any) { return new EdgeDecimal(Number(this) * Number(x ?? 0)); }, enumerable: false, configurable: true },
  times: { value: function (x: any) { return new EdgeDecimal(Number(this) * Number(x ?? 0)); }, enumerable: false, configurable: true },
  div: { value: function (x: any) { const d = Number(x ?? 0); return new EdgeDecimal(d === 0 ? 0 : Number(this) / d); }, enumerable: false, configurable: true },
  dividedBy: { value: function (x: any) { const d = Number(x ?? 0); return new EdgeDecimal(d === 0 ? 0 : Number(this) / d); }, enumerable: false, configurable: true },
  gt: { value: function (x: any) { return Number(this) > Number(x ?? 0); }, enumerable: false, configurable: true },
  greaterThan: { value: function (x: any) { return Number(this) > Number(x ?? 0); }, enumerable: false, configurable: true },
  gte: { value: function (x: any) { return Number(this) >= Number(x ?? 0); }, enumerable: false, configurable: true },
  greaterThanOrEqualTo: { value: function (x: any) { return Number(this) >= Number(x ?? 0); }, enumerable: false, configurable: true },
  lt: { value: function (x: any) { return Number(this) < Number(x ?? 0); }, enumerable: false, configurable: true },
  lessThan: { value: function (x: any) { return Number(this) < Number(x ?? 0); }, enumerable: false, configurable: true },
  lte: { value: function (x: any) { return Number(this) <= Number(x ?? 0); }, enumerable: false, configurable: true },
  lessThanOrEqualTo: { value: function (x: any) { return Number(this) <= Number(x ?? 0); }, enumerable: false, configurable: true },
  eq: { value: function (x: any) { return Number(this) === Number(x ?? 0); }, enumerable: false, configurable: true },
  equals: { value: function (x: any) { return Number(this) === Number(x ?? 0); }, enumerable: false, configurable: true },
  isZero: { value: function () { return Number(this) === 0; }, enumerable: false, configurable: true },
  isNegative: { value: function () { return Number(this) < 0; }, enumerable: false, configurable: true },
  isPositive: { value: function () { return Number(this) > 0; }, enumerable: false, configurable: true },
  toDecimalPlaces: { value: function (dp = 0) { const f = 10 ** dp; return new EdgeDecimal(Math.round((Number(this) + Number.EPSILON) * f) / f); }, enumerable: false, configurable: true },
});
