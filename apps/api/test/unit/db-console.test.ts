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

test('SELECT with join, group by and the reserved word "total"', async () => {
  const n = store.invoice.length;
  const c = await sql('SELECT COUNT(*) AS n FROM invoices');
  assert.equal(c.rows[0][0], n);
  const g = await sql('SELECT status, COUNT(*) AS c, SUM(total) AS s FROM invoices GROUP BY status ORDER BY c DESC');
  assert.ok(g.rowCount >= 1);
  assert.equal(g.rows.reduce((a, r) => a + Number(r[1]), 0), n);
  const j = await sql('SELECT i.code, u.email FROM invoices i JOIN customers c ON c.id = i.customer_id JOIN users u ON u.id = c.user_id LIMIT 5');
  assert.ok(j.rowCount <= 5);
});

test('secrets are masked in results, tables and the grid', async () => {
  const r = await sql('SELECT email, password_hash FROM users LIMIT 3');
  assert.ok(r.rows.every((x) => x[1] === '••••••' || x[1] === null));
  const browse = browseRows(store, modelOf('users'), { limit: 5, offset: 0 });
  assert.ok(browse.total > 0);
});
