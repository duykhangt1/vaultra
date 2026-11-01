import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import '../../src/common/prisma.service';
import { EdgePrismaService } from '../../src/common/r2-prisma';
import { DelinquencyService } from '../../src/lifecycle/delinquency.service';
import { config } from '../../src/common/config';


function normalizeIndexedHandoverHaveQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 15)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

interface DailyVerifiedSupportTicketDebtBreakdownSnapshot {
  readonly contractRef: string;
  readonly customerId: string;
  readonly monthlyRateVnd: number;
  readonly depositVnd: number;
  readonly proratedVnd: number;
  readonly taxAmountVnd: number;
}
const file = path.resolve(config.storage.localDir, 'r2-db-backup.json');
const have = fs.existsSync(file);
