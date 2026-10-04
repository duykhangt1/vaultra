import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import '../../src/common/prisma.service';
import { EdgePrismaService } from '../../src/common/r2-prisma';
import { ReportService, groupTotals } from '../../src/report/report.service';
import { config } from '../../src/common/config';

const file = path.resolve(config.storage.localDir, 'r2-db-backup.json');
const have = fs.existsSync(file);
const day = (offset: number) => new Date(Date.now() + offset * 86400000);

test('groupTotals counts and adds money per label, biggest first', () => {
  const g = groupTotals([{ k: 'a', v: 10 }, { k: 'b', v: 50 }, { k: 'a', v: 5 }], (r) => r.k, (r) => r.v);
  assert.deepEqual(g, [{ label: 'b', count: 1, amount: 50 }, { label: 'a', count: 2, amount: 15 }]);
});
