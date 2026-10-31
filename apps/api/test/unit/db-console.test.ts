import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../../src/common/prisma.service';
import { EdgePrismaService } from '../../src/common/r2-prisma';
import { runSql, sanitizeSql, browseRows, modelOf, describeTable } from '../../src/admin/db-console';

const edge = new EdgePrismaService();
const store = (edge as any).store as Record<string, any[]>;
const hooks = { tx: <T>(fn: () => Promise<T>) => edge.tx(async () => fn()), delegate: (n: string) => (edge as any)[n] };
const sql = (q: string, execute = false) => runSql(store, q, { execute }, hooks);

test('SHOW TABLES / DESCRIBE describe the MySQL schema', async () => {
  const t = await sql('SHOW TABLES');
  assert.ok(t.rowCount >= 100, 'about 105 tables');
  const d = await sql('DESCRIBE invoices');
  assert.ok(d.rows.some((r) => r[0] === 'total'));
  assert.ok(d.rows.some((r) => String(r[3]).startsWith('FK')));
});
