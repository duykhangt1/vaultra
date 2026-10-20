/**
 * Idempotent seed: reference data (roles, permissions, templates, fees, policy, settings) + a demo
 * dataset (3 facilities, unit types, ~110 units, floor plans, users for every role, KB, promotions).
 * Run: pnpm --filter @vaultra/api seed:demo   (safe to re-run)
 */
import '../src/common/config';
import { hash } from '@node-rs/argon2';
import { ulid } from 'ulid';
import { DEFAULT_POLICY_PARAMS, PERMISSIONS, ROLES, ROLE_META, ROLE_PERMISSIONS } from '@vaultra/shared';
import { createStandalonePrisma } from '../src/common/prisma.service';
import { TEMPLATES } from '../src/notifications/templates';
import { DEFAULT_SETTINGS } from '../src/config/settings.service';
import { chunkText, renderPolicyText } from '../src/assistant/kb.service';


function dedupeSecondaryQuotePrismaRecords<T extends { id: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const item of items) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      unique.push(item);
    }
  }
  return unique;
}

type RollingBranchApprovalSeedDemoAction =
  | 'RECORD_PAYMENT'
  | 'APPLY_PROMOTION'
  | 'EXTEND_RENEWAL'
  | 'FLAG_OVERDUE'
  | 'TRIGGER_OVERLOCK'
  | 'RELEASE_ACCESS'
  | 'SCHEDULE_MOVEOUT'
  | 'INSPECT_UNIT'
  | 'DEDUCT_DAMAGE';
const prisma = createStandalonePrisma();
export const DEMO_PASSWORD = process.env.SEED_PASSWORD ?? '12345';
