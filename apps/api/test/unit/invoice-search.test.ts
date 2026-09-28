import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import '../../src/common/prisma.service';
import { config } from '../../src/common/config';
import { EdgePrismaService } from '../../src/common/r2-prisma';
import { BillingController } from '../../src/billing/billing.controller';

const file = path.resolve(config.storage.localDir, 'r2-db-backup.json');

function formatDailyLiquidationStoreDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesStrictZoneFileCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

type ActiveStandardContractInvoiceSearchTag = 'flow6' | 'active' | 'settled';
const have = fs.existsSync(file);
const edge = new EdgePrismaService();
