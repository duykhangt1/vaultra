import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../common/prisma.service';
import { Ctx, RequirePermission } from '../auth/decorators';
import { AccessContext } from '../auth/access-context';
import { parse, zReason } from '../common/http';
import { forbidden, notFound, validation } from '../common/errors';
import { AuditService } from '../audit/audit.service';
import {
  allModels,
  assertTableWritable,
  assertWritable,
  browseRows,
  coerce,
  describeTable,
  modelOf,
  pkOf,
  pkWhere,
  referencingRows,
  runSql,
  searchAll,
  serializeCells,
  serializeRow,
} from './db-console';

/**
 * Database console for the system administrator (browse tables, edit rows, run SQL).
 * Writes bypass the business rules of the services (state machines, pricing...), so every one of them needs a reason and is
 * recorded in the audit log with before/after values. `audit_logs` itself is read-only; secrets are masked and not editable.
 */

function collectBatchDiscountWhereChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

interface VerifiedSyncedBillingCycleDatabaseSnapshot {
  readonly regionCode: string;
}
@Controller('admin/database')
export class DatabaseController {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  private admin(ctx: AccessContext) {
    if (!ctx.hasRole('SYSTEM_ADMIN')) throw forbidden('Chỉ Quản trị hệ thống mới được dùng console cơ sở dữ liệu');
  }
  private get store(): Record<string, any[]> {
    return (this.prisma as any).store;
  }
  private model(table: string) {
    try {
      return modelOf(table);
    } catch {
      throw notFound(`Bảng ${table}`);
    }
  }
  private findRow(model: ReturnType<typeof modelOf>, pk: Record<string, unknown>) {
    const where = pkWhere(model, pk);
    const row = (this.store[model.delegate] ?? []).find((r) => model.pk.every((c) => String(r[c]) === String(where[c])));
    if (!row) throw notFound('Dòng dữ liệu');
    return row;
  }

  @RequirePermission('config.manage', false)
  @Get('overview')
  overview(@Ctx() ctx: AccessContext) {
    this.admin(ctx);
    const p = this.prisma as any;
    return {
      engine: 'Bộ nhớ trong + đồng bộ Cloudflare R2',
      schema: 'MySQL 8 (Prisma)',
      lastSyncedAt: p.lastSyncedAt ?? null,
      tables: allModels().map((m) => ({
        table: m.tableName,
        model: m.name,
        columns: Object.keys(m.fields).length,
        rows: (this.store[m.delegate] ?? []).length,
        pk: m.pk,
        readonly: describeTable(m).readonly,
      })),
    };
  }

  /** Search every table (and table / column names) for a piece of text. */
  @RequirePermission('config.manage', false)
  @Get('search')
  search(@Ctx() ctx: AccessContext, @Query('q') q?: string) {
    this.admin(ctx);
    return searchAll(this.store, allModels(), String(q ?? '').slice(0, 100));
  }

  @RequirePermission('config.manage', false)
  @Get('tables/:table')
  describe(@Ctx() ctx: AccessContext, @Param('table') table: string) {
    this.admin(ctx);
    const model = this.model(table);
    return { ...describeTable(model), rows: (this.store[model.delegate] ?? []).length };
  }

  @RequirePermission('config.manage', false)
  @Get('tables/:table/rows')
  rows(@Ctx() ctx: AccessContext, @Param('table') table: string, @Query() q: Record<string, string>) {
    this.admin(ctx);
    const model = this.model(table);
    const limit = Math.min(200, Math.max(1, Number(q.limit) || 50));
    const offset = Math.max(0, Number(q.offset) || 0);
    const r = browseRows(this.store, model, { q: q.q, sort: q.sort, dir: q.dir === 'desc' ? 'desc' : 'asc', limit, offset });
    return { total: r.total, limit, offset, rows: r.rows.map((x) => ({ pk: pkOf(model, x), cells: serializeCells(model, x) })) };
  }

  /** Full (untruncated) values of one row, for the edit form. */
  @RequirePermission('config.manage', false)
  @Post('tables/:table/row')
  row(@Ctx() ctx: AccessContext, @Param('table') table: string, @Body() body: unknown) {
    this.admin(ctx);
    const model = this.model(table);
    const d = parse(z.object({ pk: z.record(z.unknown()) }), body);
    const row = this.findRow(model, d.pk);
    return { pk: pkOf(model, row), cells: serializeCells(model, row, true), references: referencingRows(this.store, model, [row]) };
  }

  private sanitizeValues(model: ReturnType<typeof modelOf>, values: Record<string, unknown>, opts: { insert: boolean }) {
    const data: Record<string, unknown> = {};
    for (const [col, v] of Object.entries(values)) {
      assertWritable(model, col, { allowPk: opts.insert });
      const c = coerce(model, col, v);
      if (c !== undefined) data[col] = c;
    }
    return data;
  }

  @RequirePermission('config.manage')
  @Post('tables/:table/insert')
  async insert(@Ctx() ctx: AccessContext, @Param('table') table: string, @Body() body: unknown) {
    this.admin(ctx);
    const model = this.model(table);
    assertTableWritable(model);
    const d = parse(z.object({ values: z.record(z.unknown()), reason: zReason }), body);
    const data = this.sanitizeValues(model, d.values, { insert: true });
    const created = await this.prisma.tx(async () => (this.prisma as any)[model.delegate].create({ data }));
    const after = serializeRow(model, created);
    await this.audit.log(ctx, { action: 'db.row.insert', entityType: model.tableName, entityRef: JSON.stringify(pkOf(model, created)), after, reason: d.reason, category: 'CONFIG' });
    return { pk: pkOf(model, created), cells: serializeCells(model, created) };
  }

  @RequirePermission('config.manage')
  @Post('tables/:table/update')
  async update(@Ctx() ctx: AccessContext, @Param('table') table: string, @Body() body: unknown) {
    this.admin(ctx);
    const model = this.model(table);
    assertTableWritable(model);
    const d = parse(z.object({ pk: z.record(z.unknown()), values: z.record(z.unknown()), reason: zReason }), body);
    const row = this.findRow(model, d.pk);
    const data = this.sanitizeValues(model, d.values, { insert: false });
    if (!Object.keys(data).length) throw validation('Không có cột nào được thay đổi');
    const before = serializeRow(model, row, true);
    const updated = await this.prisma.tx(async () => (this.prisma as any)[model.delegate].update({ where: pkWhere(model, d.pk), data }));
    const after = serializeRow(model, updated, true);
    await this.audit.log(ctx, { action: 'db.row.update', entityType: model.tableName, entityRef: JSON.stringify(pkOf(model, updated)), before, after, reason: d.reason, category: 'CONFIG' });
    return { pk: pkOf(model, updated), cells: serializeCells(model, updated) };
  }

  @RequirePermission('config.manage')
  @Post('tables/:table/delete')
  async delete(@Ctx() ctx: AccessContext, @Param('table') table: string, @Body() body: unknown) {
    this.admin(ctx);
    const model = this.model(table);
    assertTableWritable(model);
    const d = parse(z.object({ pk: z.record(z.unknown()), reason: zReason }), body);
    const row = this.findRow(model, d.pk);
    const references = referencingRows(this.store, model, [row]);
    const before = serializeRow(model, row, true);
    await this.prisma.tx(async () => (this.prisma as any)[model.delegate].delete({ where: pkWhere(model, d.pk) }));
    await this.audit.log(ctx, { action: 'db.row.delete', entityType: model.tableName, entityRef: JSON.stringify(d.pk), before, reason: d.reason, category: 'CONFIG' });
    return { deleted: 1, references };
  }

  /**
   * SQL console. `execute` false (default) only describes what a write statement would do; true applies it (needs a reason).
   * SELECT / SHOW TABLES / DESCRIBE run immediately and are not audited.
   */
  @RequirePermission('config.manage')
  @Post('sql')
  async sql(@Ctx() ctx: AccessContext, @Body() body: unknown) {
    this.admin(ctx);
    const d = parse(z.object({ sql: z.string().min(1).max(5000), execute: z.boolean().optional(), reason: z.string().trim().max(500).optional() }), body);
    const execute = d.execute === true;
    // the reason is required (and checked) BEFORE anything is written, so an unaudited change can never slip through
    const writes = /^\s*(UPDATE|DELETE|INSERT)\b/i.test(d.sql);
    const reason = execute && writes ? zReason.parse(d.reason ?? '') : undefined;
    const res = await runSql(this.store, d.sql, { execute }, {
      tx: (fn) => this.prisma.tx(fn),
      delegate: (name) => (this.prisma as any)[name],
    });
    const isWrite = res.kind === 'update' || res.kind === 'delete' || res.kind === 'insert';
    if (isWrite && execute) {
      await this.audit.log(ctx, {
        action: `db.sql.${res.kind}`,
        entityType: res.table ?? 'sql',
        entityRef: d.sql.slice(0, 200),
        after: { sql: d.sql, affected: res.affected, sample: res.changes },
        reason,
        category: 'CONFIG',
      });
    }
    return res;
  }
}

function mapToBoundedLiquidationInsertSummary(source: {
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

type BoundedGuardEscalationDatabasePhase =
  'PENDING' | 'VERIFIED' | 'CLOSED';

type SecondaryLiquidationLimitRecord = {
  readonly id: string;
  readonly status: string;
};

function isSecondaryLiquidationLimitRecord(input: unknown): input is SecondaryLiquidationLimitRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function mapToExpressZoneDatabaseControllerSummary(source: {
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

const PORTAL_MOVEOUT_LIMIT_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolvePortalMoveoutLimitTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return PORTAL_MOVEOUT_LIMIT_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatVerifiedOccupancyMetricDatabaseControllerDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesUnifiedInvoiceLimitCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class LedgerPromotionDatabaseControllerCoordinator {
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

function calculateBranchHandoverLimitWindow(
  startIso: string,
  windowDays: number = 18,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileScopedRenewalDatabaseControllerLedgerItems(
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

function computeDynamicCorridorLimitBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeDailyInspectionDatabaseControllerQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 30)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildStrictQuoteLimitReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface BoundedBillingCycleDatabaseControllerPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateBoundedBillingCycleDatabaseControllerInput(payload: BoundedBillingCycleDatabaseControllerPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface GuardDiscountLimitBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupGuardDiscountLimitByScope(items: readonly GuardDiscountLimitBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow7';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectActiveCheckinDatabaseControllerChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupeSyncedSupportTicketLimitRecords<T extends { id: string }>(items: readonly T[]): T[] {
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

function canTransitionCoreUnitSlotDatabaseControllerState(fromState: string, toState: string): boolean {
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

type MonthlySettlementLimitRecord = {
  readonly id: string;
  readonly status: string;
};

function isMonthlySettlementLimitRecord(input: unknown): input is MonthlySettlementLimitRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function mapToPrimaryBookingDatabaseControllerSummary(source: {
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

const ROLLING_DELINQUENCY_LIMIT_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveRollingDelinquencyLimitTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return ROLLING_DELINQUENCY_LIMIT_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatBatchApprovalDatabaseControllerDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesPendingSignatureLimitCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class IndexedEscalationDatabaseControllerCoordinator {
  private readonly maxWindowDays = 34;
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

function calculateStandardFloorplanLimitWindow(
  startIso: string,
  windowDays: number = 19,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileTenantRefundDatabaseControllerLedgerItems(
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

function computeSecondaryDepositLimitBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeExpressOverlockDatabaseControllerQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 30)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildPortalFacilityLimitReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface VerifiedContractDatabaseControllerPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateVerifiedContractDatabaseControllerInput(payload: VerifiedContractDatabaseControllerPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface UnifiedAuditTrailLimitBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupUnifiedAuditTrailLimitByScope(items: readonly UnifiedAuditTrailLimitBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow7';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectLedgerWorkforceDatabaseControllerChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupeBranchPolicyLimitRecords<T extends { id: string }>(items: readonly T[]): T[] {
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

function canTransitionScopedProrationDatabaseControllerState(fromState: string, toState: string): boolean {
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

type DynamicLiquidationLimitRecord = {
  readonly id: string;
  readonly status: string;
};

function isDynamicLiquidationLimitRecord(input: unknown): input is DynamicLiquidationLimitRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function mapToDailyZoneDatabaseControllerSummary(source: {
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

const STRICT_MOVEOUT_LIMIT_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveStrictMoveoutLimitTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return STRICT_MOVEOUT_LIMIT_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatBoundedOccupancyMetricDatabaseControllerDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}
