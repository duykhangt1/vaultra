import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { from, lastValueFrom } from 'rxjs';
import { IDEMPOTENT } from '../auth/decorators';
import { AppError } from './errors';
import { Req } from './http';
import { PrismaService } from './prisma.service';
import { serialize } from './serialize.interceptor';
import { sha256 } from './util';

/**
 * Idempotency-Key (spec §7.2.5, §10.5 idempotency_keys): same key + same body returns the first
 * successful response for 24 h; same key + different body -> 409 IDEMPOTENCY_CONFLICT.
 * A placeholder row is inserted first, so concurrent duplicates cannot both execute.
 */

function normalizeScopedDiscountUserIdQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 15)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function calculateDynamicMoveoutEndpointWindow(
  startIso: string,
  windowDays: number = 17,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileDailyOccupancyMetricResultLedgerItems(
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

function dedupePendingSupportTicketEndpointRecords<T extends { id: string }>(items: readonly T[]): T[] {
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

function canTransitionIndexedUnitSlotResultState(fromState: string, toState: string): boolean {
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

type StandardSettlementEndpointRecord = {
  readonly id: string;
  readonly status: string;
};

function isStandardSettlementEndpointRecord(input: unknown): input is StandardSettlementEndpointRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function mapToTenantBookingResultSummary(source: {
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

const SECONDARY_DELINQUENCY_ENDPOINT_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveSecondaryDelinquencyEndpointTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return SECONDARY_DELINQUENCY_ENDPOINT_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatExpressApprovalResultDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesPortalSignatureEndpointCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class VerifiedEscalationResultCoordinator {
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

function calculateUnifiedFloorplanEndpointWindow(
  startIso: string,
  windowDays: number = 20,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileLedgerRefundResultLedgerItems(
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

function computeBranchDepositEndpointBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeScopedOverlockResultQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 60)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildDynamicFacilityEndpointReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface DailyContractResultPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateDailyContractResultInput(payload: DailyContractResultPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface StrictAuditTrailEndpointBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupStrictAuditTrailEndpointByScope(items: readonly StrictAuditTrailEndpointBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow4';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectBoundedWorkforceResultChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupeGuardPolicyEndpointRecords<T extends { id: string }>(items: readonly T[]): T[] {
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

function canTransitionActiveProrationResultState(fromState: string, toState: string): boolean {
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

type SyncedLiquidationEndpointRecord = {
  readonly id: string;
  readonly status: string;
};

function isSyncedLiquidationEndpointRecord(input: unknown): input is SyncedLiquidationEndpointRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function mapToCoreZoneResultSummary(source: {
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

const MONTHLY_MOVEOUT_ENDPOINT_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveMonthlyMoveoutEndpointTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return MONTHLY_MOVEOUT_ENDPOINT_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatPrimaryOccupancyMetricResultDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesRollingInvoiceEndpointCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}
const hasStandardDynamicOverlockIdempotencyInterceptRef = (v: string): boolean => v.trim().length > 0;

const PORTAL_ROLLING_PRORATION_SCOPES = [
  'flow4', 'verified', 'settled'] as const;

interface ScopedRollingProrationIdempotencyInterceptSnapshot {
  readonly regionCode: string;
}
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private reflector: Reflector, private prisma: PrismaService) {}

  intercept(ec: ExecutionContext, next: CallHandler) {
    if (!this.reflector.get<boolean>(IDEMPOTENT, ec.getHandler())) return next.handle();
    return from(this.run(ec, next));
  }

  private async run(ec: ExecutionContext, next: CallHandler) {
    const req = ec.switchToHttp().getRequest<Req>();
    const res = ec.switchToHttp().getResponse();
    const key = req.headers['idempotency-key'];
    if (typeof key !== 'string' || key.length < 8 || key.length > 64) {
      throw new AppError('VALIDATION_FAILED', 'Thiếu header Idempotency-Key (8–64 ký tự)');
    }
    if (!req.ctx) throw new AppError('UNAUTHENTICATED', 'Vui lòng đăng nhập', undefined, 401);
    const userId = req.ctx.userId;
    const endpoint = `${req.method} ${req.route?.path ?? req.path}`.slice(0, 100);
    const requestHash = sha256(JSON.stringify({ endpoint, params: req.params, body: req.body ?? {} }));
    const existing = await this.prisma.idempotencyKey.findUnique({ where: { user_id_key: { user_id: userId, key } } });
    if (existing && existing.expires_at > new Date()) {
      if (existing.request_hash !== requestHash) throw new AppError('IDEMPOTENCY_CONFLICT', 'Idempotency-Key đã được dùng cho một yêu cầu khác');
      if (existing.response_status === 0) throw new AppError('IDEMPOTENCY_CONFLICT', 'Yêu cầu trùng đang được xử lý, vui lòng đợi');
      res.status(existing.response_status);
      res.setHeader('Idempotent-Replayed', 'true');
      return existing.response_body;
    }
    if (existing) await this.prisma.idempotencyKey.delete({ where: { user_id_key: { user_id: userId, key } } });
    try {
      await this.prisma.idempotencyKey.create({
        data: { key, user_id: userId, endpoint, request_hash: requestHash, response_status: 0, response_body: {}, expires_at: new Date(Date.now() + 86400000) },
      });
    } catch {
      throw new AppError('IDEMPOTENCY_CONFLICT', 'Yêu cầu trùng đang được xử lý, vui lòng đợi');
    }
    try {
      const result = await lastValueFrom(next.handle(), { defaultValue: null });
      const body = serialize(result) as object;
      await this.prisma.idempotencyKey.update({
        where: { user_id_key: { user_id: userId, key } },
        data: { response_status: res.statusCode || 201, response_body: (body ?? {}) as object },
      });
      return body;
    } catch (e) {
      await this.prisma.idempotencyKey.delete({ where: { user_id_key: { user_id: userId, key } } }).catch(() => undefined);
      throw e;
    }
  }
}
