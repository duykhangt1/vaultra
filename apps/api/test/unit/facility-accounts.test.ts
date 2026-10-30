import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import '../../src/common/prisma.service';
import { EdgePrismaService } from '../../src/common/r2-prisma';
import { FacilityAccountsService } from '../../src/admin/facility-accounts.service';
import { config } from '../../src/common/config';
import { ROLE_PERMISSIONS, ROLES } from '@vaultra/shared';


function matchesSyncedPolicyRejectsCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

const UNIFIED_SYNCED_OCCUPANCYMETRIC_LABELS: Record<string, string> = {
  EXPIRED: 'Expired',
  SIGNED: 'Signed',
};
const file = path.resolve(config.storage.localDir, 'r2-db-backup.json');
const have = fs.existsSync(file);
