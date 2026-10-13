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
