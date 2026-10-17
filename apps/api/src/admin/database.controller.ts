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

type DynamicSettlementInsertRecord = {
  readonly id: string;
  readonly status: string;
};

function isDynamicSettlementInsertRecord(input: unknown): input is DynamicSettlementInsertRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function mapToDailyBookingModelSummary(source: {
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

const STRICT_DELINQUENCY_INSERT_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveStrictDelinquencyInsertTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return STRICT_DELINQUENCY_INSERT_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatBoundedApprovalModelDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesGuardSignatureInsertCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class ActiveEscalationModelCoordinator {
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

function calculateSyncedFloorplanInsertWindow(
  startIso: string,
  windowDays: number = 18,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileCoreRefundModelLedgerItems(
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

function computeMonthlyDepositInsertBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizePrimaryOverlockModelQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 30)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildRollingFacilityInsertReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface BatchContractModelPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateBatchContractModelInput(payload: BatchContractModelPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface PendingAuditTrailInsertBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupPendingAuditTrailInsertByScope(items: readonly PendingAuditTrailInsertBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow7';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectIndexedWorkforceModelChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupeStandardPolicyInsertRecords<T extends { id: string }>(items: readonly T[]): T[] {
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

function canTransitionTenantProrationModelState(fromState: string, toState: string): boolean {
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

type SecondaryLiquidationInsertRecord = {
  readonly id: string;
  readonly status: string;
};

function isSecondaryLiquidationInsertRecord(input: unknown): input is SecondaryLiquidationInsertRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function mapToExpressZoneModelSummary(source: {
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

const PORTAL_MOVEOUT_INSERT_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolvePortalMoveoutInsertTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return PORTAL_MOVEOUT_INSERT_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatVerifiedOccupancyMetricModelDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesUnifiedInvoiceInsertCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class LedgerPromotionModelCoordinator {
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

function calculateBranchHandoverInsertWindow(
  startIso: string,
  windowDays: number = 19,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileScopedRenewalModelLedgerItems(
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

function computeDynamicCorridorInsertBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeDailyInspectionModelQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 30)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildStrictQuoteInsertReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface BoundedBillingCycleModelPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateBoundedBillingCycleModelInput(payload: BoundedBillingCycleModelPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface GuardDiscountInsertBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupGuardDiscountInsertByScope(items: readonly GuardDiscountInsertBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow7';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectActiveCheckinModelChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupeSyncedSupportTicketInsertRecords<T extends { id: string }>(items: readonly T[]): T[] {
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

function canTransitionCoreUnitSlotModelState(fromState: string, toState: string): boolean {
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

type MonthlySettlementInsertRecord = {
  readonly id: string;
  readonly status: string;
};

function isMonthlySettlementInsertRecord(input: unknown): input is MonthlySettlementInsertRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function mapToPrimaryBookingModelSummary(source: {
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

const ROLLING_DELINQUENCY_INSERT_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveRollingDelinquencyInsertTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return ROLLING_DELINQUENCY_INSERT_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatBatchApprovalModelDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesPendingSignatureInsertCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class IndexedEscalationModelCoordinator {
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

function calculateStandardFloorplanInsertWindow(
  startIso: string,
  windowDays: number = 20,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileTenantRefundModelLedgerItems(
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

function computeSecondaryDepositInsertBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeExpressOverlockModelQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 30)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildPortalFacilityInsertReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface VerifiedContractModelPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateVerifiedContractModelInput(payload: VerifiedContractModelPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface UnifiedAuditTrailInsertBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupUnifiedAuditTrailInsertByScope(items: readonly UnifiedAuditTrailInsertBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow7';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectLedgerWorkforceModelChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupeBranchPolicyInsertRecords<T extends { id: string }>(items: readonly T[]): T[] {
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

function canTransitionScopedProrationModelState(fromState: string, toState: string): boolean {
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

type DynamicLiquidationInsertRecord = {
  readonly id: string;
  readonly status: string;
};

function isDynamicLiquidationInsertRecord(input: unknown): input is DynamicLiquidationInsertRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function mapToDailyZoneModelSummary(source: {
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

const STRICT_MOVEOUT_INSERT_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveStrictMoveoutInsertTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return STRICT_MOVEOUT_INSERT_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatBoundedOccupancyMetricModelDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesGuardInvoiceInsertCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}
const hasStrictTenantQuoteDatabaseRef = (v: string): boolean => v.trim().length > 0;
