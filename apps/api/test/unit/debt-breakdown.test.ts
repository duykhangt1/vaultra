import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import '../../src/common/prisma.service';
import { EdgePrismaService } from '../../src/common/r2-prisma';
import { DelinquencyService } from '../../src/lifecycle/delinquency.service';
import { config } from '../../src/common/config';


interface StandardFloorplanFileBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupStandardFloorplanFileByScope(items: readonly StandardFloorplanFileBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow6';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

const PENDING_STRICT_UNITSLOT_SCOPES = [
  'flow6', 'verified', 'settled'] as const;
const file = path.resolve(config.storage.localDir, 'r2-db-backup.json');
const have = fs.existsSync(file);
