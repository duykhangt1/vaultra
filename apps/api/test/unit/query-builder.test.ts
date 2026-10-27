import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../../src/common/prisma.service';
import { EdgePrismaService } from '../../src/common/r2-prisma';
import { runSql, describeTable, modelOf } from '../../src/admin/db-console';
import { buildSql, describeSpec, emptySpec, opsFor, type QCol, type Spec } from '../../../web/src/pages/admin/query-builder';

const edge = new EdgePrismaService();
const store = (edge as any).store as Record<string, any[]>;
const hooks = { tx: <T>(fn: () => Promise<T>) => edge.tx(async () => fn()), delegate: (n: string) => (edge as any)[n] };
const cols = (table: string): QCol[] => describeTable(modelOf(table)).columns.map((c) => ({ name: c.name, type: c.type, sensitive: c.sensitive, pk: c.pk, fk: c.fk }));
const run = (spec: Spec) => { const b = buildSql(spec, cols(spec.table)); assert.deepEqual(b.errors, [], b.sql); return runSql(store, b.sql, { execute: false }, hooks); };
const spec = (table: string, patch: Partial<Spec>): Spec => ({ ...emptySpec(table), ...patch });

test('builder: text "contains" is case-insensitive and treats null cells as empty', async () => {
  const code = String(store.invoice.find((i: any) => i.code).code);
  const r = await run(spec('invoices', { conds: [{ id: 1, column: 'code', op: 'contains', value: code.slice(2, 9).toLowerCase() }] }));
  assert.ok(r.rowCount >= 1);
  const nulls = await run(spec('reservations', { conds: [{ id: 1, column: 'notes', op: 'contains', value: 'zzz-not-there' }] }));
  assert.equal(nulls.rowCount, 0);
});
