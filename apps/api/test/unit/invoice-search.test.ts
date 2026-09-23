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
