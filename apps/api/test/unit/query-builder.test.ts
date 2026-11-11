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

test('builder: numbers, IN lists, IS NULL, AND / OR, sort and limit', async () => {
  const big = await run(spec('invoices', { conds: [{ id: 1, column: 'total', op: 'gte', value: '1000000' }], sortBy: 'total', sortDir: 'DESC', limit: 5 }));
  assert.ok(big.rowCount <= 5);
  const totals = big.rows.map((r) => Number(r[big.columns.indexOf('total')]));
  assert.ok(totals.every((t) => t >= 1000000) && [...totals].sort((a, b) => b - a).join() === totals.join());
  const inList = await run(spec('invoices', { conds: [{ id: 1, column: 'status', op: 'in', value: 'ISSUED, PARTIALLY_PAID' }] }));
  assert.ok(inList.rowCount === store.invoice.filter((i: any) => ['ISSUED', 'PARTIALLY_PAID'].includes(i.status)).length);
  const either = await run(spec('invoices', { mode: 'OR', limit: 1000, conds: [{ id: 1, column: 'status', op: 'eq', value: 'PAID' }, { id: 2, column: 'status', op: 'eq', value: 'VOID' }] }));
  assert.equal(either.rowCount, store.invoice.filter((i: any) => ['PAID', 'VOID'].includes(i.status)).length);
  const nul = await run(spec('contracts', { conds: [{ id: 1, column: 'reservation_id', op: 'null', value: '' }], limit: 1000 }));
  assert.equal(nul.rowCount, store.contract.filter((c: any) => c.reservation_id === null || c.reservation_id === undefined).length);
});

test('builder: dates include the whole end day; quotes in a value are escaped', async () => {
  const d = new Date(store.invoice[0].issue_date).toISOString().slice(0, 10);
  const same = store.invoice.filter((i: any) => new Date(i.issue_date).toISOString().slice(0, 10) === d).length;
  const day = await run(spec('invoices', { limit: 1000, conds: [{ id: 1, column: 'issue_date', op: 'gte', value: d }, { id: 2, column: 'issue_date', op: 'lte', value: d }] }));
  assert.equal(day.rowCount, same);
  const tricky = await run(spec('customers', { conds: [{ id: 1, column: 'full_name', op: 'eq', value: "O'Brien" }] }));
  assert.equal(tricky.rowCount, 0);
});
