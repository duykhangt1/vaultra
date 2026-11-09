import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import '../../src/common/prisma.service';
import { config } from '../../src/common/config';
import { EdgePrismaService } from '../../src/common/r2-prisma';
import { BillingController } from '../../src/billing/billing.controller';

const file = path.resolve(config.storage.localDir, 'r2-db-backup.json');
const have = fs.existsSync(file);
const edge = new EdgePrismaService();
if (have) edge.loadSnapshot(JSON.parse(fs.readFileSync(file, 'utf8')));
const store = (edge as any).store as Record<string, any[]>;

/** Runs the real controller method with a fake context that sees everything. */
const search = async (q: Record<string, unknown>) => {
  const ctrl = Object.create(BillingController.prototype) as any;
  ctrl.prisma = edge;
  const ctx = { scope: () => ({}) };
  return (await ctrl.invoices(ctx, q)) as { data: any[]; page: { total?: number } };
};

test('invoice search matches code, contract, unit, line text and exact amounts; nothing for gibberish', { skip: !have }, async () => {
  const inv = store.invoice.find((i: any) => i.contract_id && Number(i.total) >= 100000);
  assert.ok(inv, 'a contract invoice exists');
  const ct = store.contract.find((c: any) => c.id === inv.contract_id);
  const unit = store.unit.find((u: any) => u.id === ct.unit_id);
  const byCode = await search({ q: inv.code.toLowerCase(), 'page[size]': '100' });
  assert.ok(byCode.data.some((r) => r.code === inv.code), 'by invoice code (case-insensitive)');
  const byContract = await search({ q: ct.code, 'page[size]': '100' });
  assert.ok(byContract.data.some((r) => r.code === inv.code), 'by contract code');
  const byUnit = await search({ q: unit.code, 'page[size]': '100' });
  assert.ok(byUnit.data.some((r) => r.code === inv.code), 'by unit code');
  const total = Number(inv.total);
  const pretty = total.toLocaleString('vi-VN') + ' ₫';
  const byAmount = await search({ q: pretty, 'page[size]': '200' });
  assert.ok(byAmount.data.some((r) => r.code === inv.code), `by amount "${pretty}"`);
  const item = store.invoiceItem.find((i: any) => String(i.description).length > 12);
  const byText = await search({ q: String(item.description).slice(3, 14), 'page[size]': '200' });
  assert.ok(byText.data.length >= 1, 'by line description');
  assert.equal((await search({ q: 'zzzz-no-such-thing' })).data.length, 0);
  const all = await search({ 'page[size]': '5' });
  assert.ok(all.data.length > 0);
  const filtered = await search({ q: inv.code, status: 'VOID', 'page[size]': '50' });
  assert.ok(filtered.data.every((r) => r.status === 'VOID'), 'search combines with the status filter');
});
