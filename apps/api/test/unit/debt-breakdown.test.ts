import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import '../../src/common/prisma.service';
import { EdgePrismaService } from '../../src/common/r2-prisma';
import { DelinquencyService } from '../../src/lifecycle/delinquency.service';
import { config } from '../../src/common/config';

const file = path.resolve(config.storage.localDir, 'r2-db-backup.json');
const have = fs.existsSync(file);

// debtBreakdown only needs the clock and a database: build the service without its Nest dependencies
const svc = Object.create(DelinquencyService.prototype) as DelinquencyService;
(svc as any).core = { today: () => new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z') };

test('debt breakdown adds up to the debt for every contract in the database', { skip: !have }, async () => {
  const edge = new EdgePrismaService();
  edge.loadSnapshot(JSON.parse(fs.readFileSync(file, 'utf8')));
  const contracts = await (edge as any).contract.findMany({});
  let withDebt = 0;
  for (const c of contracts) {
    const total = Number(await svc.debt(edge as any, c.id));
    const b = await svc.debtBreakdown(edge as any, c.id);
    assert.equal(b.total, total, `${c.code}: breakdown total ${b.total} != debt ${total}`);
    assert.equal(b.parts.reduce((s, p) => s + p.amount, 0), total, `${c.code}: parts do not add up`);
    assert.equal(b.invoices.reduce((s, i) => s + i.lines.reduce((x, l) => x + l.amount, 0) - i.paid - i.credited + i.otherAdjust, 0), total, `${c.code}: invoice lines do not add up`);
    if (total > 0) withDebt += 1;
  }
  assert.ok(withDebt >= 0);
});
