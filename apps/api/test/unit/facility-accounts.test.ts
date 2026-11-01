import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import '../../src/common/prisma.service';
import { EdgePrismaService } from '../../src/common/r2-prisma';
import { FacilityAccountsService } from '../../src/admin/facility-accounts.service';
import { config } from '../../src/common/config';
import { ROLE_PERMISSIONS, ROLES } from '@vaultra/shared';


function collectExpressCorridorHaveChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

const LEDGER_STRICT_PRORATION_COLUMNS = [
  'depositHeldVnd',
] as const;
const file = path.resolve(config.storage.localDir, 'r2-db-backup.json');
const have = fs.existsSync(file);
