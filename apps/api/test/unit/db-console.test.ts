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

test('dangerous or unsupported SQL is rejected', async () => {
  for (const bad of [
    "SELECT * FROM CSV('/etc/passwd')",
    'SELECT * INTO CSV("x.csv") FROM users',
    'DROP TABLE users',
    'SELECT * FROM users; DELETE FROM users WHERE 1=1',
    'SELECT * FROM users -- x\n; DROP TABLE users',
    'SELECT JAVASCRIPT 1 FROM users',
    'SELECT * FROM ?',
    'SELECT @a FROM users',
    'SELECT * FROM nope_table',
    'UPDATE users SET email = 1',
    'DELETE FROM users',
    'UPDATE audit_logs SET action = \'x\' WHERE 1 = 1',
    "UPDATE users SET password_hash = 'x' WHERE id = 1",
  ]) {
    await assert.rejects(() => sql(bad), undefined, bad);
  }
  assert.equal(sanitizeSql('SELECT 1 -- comment').includes('comment'), false);
});

test('UPDATE previews first, then applies and keeps unique constraints', async () => {
  const target = store.promotion[0];
  assert.ok(target, 'seed has a promotion');
  const id = target.id;
  const old = target.name;
  const dry = await sql(`UPDATE promotions SET name = 'Tên mới' WHERE id = ${id}`);
  assert.equal(dry.dryRun, true);
  assert.equal(dry.affected, 1);
  assert.equal(store.promotion.find((p) => p.id === id).name, old, 'preview must not write');
  const done = await sql(`UPDATE promotions SET name = 'Tên mới' WHERE id = ${id}`, true);
  assert.equal(done.affected, 1);
  assert.equal(store.promotion.find((p) => p.id === id).name, 'Tên mới');
  assert.equal(done.changes?.[0].after?.[done.changes![0].cols.indexOf('name')], 'Tên mới');
  // unique violation rolls the whole statement back
  const other = store.promotion.find((p) => p.id !== id && p.code);
  if (other && target.code !== undefined) {
    await assert.rejects(() => sql(`UPDATE promotions SET code = '${other.code}' WHERE id = ${id}`, true));
    assert.notEqual(store.promotion.find((p) => p.id === id).code, other.code);
  }
  await sql(`UPDATE promotions SET name = '${String(old).replace(/'/g, "''")}' WHERE id = ${id}`, true);
});

test('rows keep both id and public_id in a SELECT (arrays, not objects)', async () => {
  const r = await sql('SELECT id, public_id, code FROM reservations LIMIT 2');
  assert.deepEqual(r.columns, ['id', 'public_id', 'code']);
  assert.equal(r.rows[0].length, 3);
  assert.equal(typeof r.rows[0][1], 'string');
});

test('INSERT and DELETE go through the store, DELETE warns about child rows', async () => {
  const before = store.supportTicket.length;
  const model = describeTable(modelOf('system_settings'));
  assert.ok(model.columns.length > 1);
  const ref = await sql('DELETE FROM customers WHERE id = ' + store.customer[0].id);
  assert.equal(ref.dryRun, true);
  assert.equal(ref.affected, 1);
  assert.ok((ref.references ?? []).length >= 1, 'customer has reservations/invoices pointing at it');
  assert.equal(store.supportTicket.length, before);
  await assert.rejects(() => sql("INSERT INTO promotions (name) VALUES ('x')", true), undefined, 'missing required columns');
});

test('controller: a write needs a reason BEFORE it runs, is audited, and is admin-only', async () => {
  const { DatabaseController } = await import('../../src/admin/database.controller');
  const logged: any[] = [];
  const ctl = new DatabaseController(edge as any, { log: async (_c: any, e: any) => void logged.push(e) } as any);
  const admin: any = { hasRole: (r: string) => r === 'SYSTEM_ADMIN' };
  const other: any = { hasRole: () => false };
  const p = store.promotion[0];
  const old = p.name;
  const q = `UPDATE promotions SET name = 'ZZZ' WHERE id = ${p.id}`;
  await assert.rejects(() => ctl.sql(other, { sql: 'SELECT 1' }), /Quản trị hệ thống/);
  await assert.rejects(() => ctl.sql(admin, { sql: q, execute: true }), /lý do/i);
  assert.equal(store.promotion[0].name, old, 'nothing written without a reason');
  assert.equal(logged.length, 0);
  const done: any = await ctl.sql(admin, { sql: q, execute: true, reason: 'kiểm thử console' });
  assert.equal(done.affected, 1);
  assert.equal(logged.length, 1);
  assert.equal(logged[0].action, 'db.sql.update');
  assert.equal(logged[0].reason, 'kiểm thử console');
  await ctl.sql(admin, { sql: `UPDATE promotions SET name = '${String(old).replace(/'/g, "''")}' WHERE id = ${p.id}`, execute: true, reason: 'khôi phục' });
  const sel: any = await ctl.sql(admin, { sql: 'SELECT COUNT(*) AS n FROM promotions', execute: true });
  assert.equal(sel.rows[0][0], store.promotion.length, 'SELECT with execute=true needs no reason');
  const row: any = ctl.rows(admin, 'reservations', { limit: '2' });
  assert.equal(row.rows[0].cells.length, Object.keys(modelOf('reservations').fields).length);
  await assert.rejects(() => ctl.update(admin, 'audit_logs', { pk: { id: '1' }, values: { action: 'x' }, reason: 'xx x' }), /chỉ ghi thêm/);
});

// ---- search across every table
import { searchAll, allModels } from '../../src/admin/db-console';

test('searchAll finds a value in the right table and reports table / column name matches', () => {
  const inv = store.invoice.find((i: any) => i.code);
  assert.ok(inv, 'the store has an invoice');
  const r = searchAll(store, allModels(), String(inv.code));
  const t = r.tables.find((x) => x.table === 'invoices');
  assert.ok(t && t.total >= 1, 'invoices matched by its code');
  assert.ok(t!.samples[0].hits.some((h) => h.column === 'code' && h.snippet.includes(String(inv.code))));
  assert.ok(r.scannedRows > 1000 && r.ms < 3000);
  assert.ok(searchAll(store, allModels(), 'contract').tableNames.includes('contracts'));
  assert.ok(searchAll(store, allModels(), 'late_fee').columnNames.some((c) => c.table === 'invoices'));
});

test('searchAll never looks inside secret columns and ignores one-character queries', () => {
  const u = store.user.find((x: any) => typeof x.password_hash === 'string' && x.password_hash.length > 20);
  if (u) {
    const needle = String(u.password_hash).slice(8, 30);
    const r = searchAll(store, allModels(), needle);
    assert.equal(r.tables.some((t) => t.table === 'users'), false, 'password hashes are not searchable');
  }
  assert.equal(searchAll(store, allModels(), 'a').tables.length, 0);
  assert.equal(searchAll(store, allModels(), '   ').tables.length, 0);
});
