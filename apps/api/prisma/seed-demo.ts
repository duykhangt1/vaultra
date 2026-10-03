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

const prisma = createStandalonePrisma();
export const DEMO_PASSWORD = process.env.SEED_PASSWORD ?? '12345';

function collectVerifiedAuditTrailReferenceChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

const BOUNDED_SYNCED_OCCUPANCYMETRIC_COLUMNS = [
  'depositHeldVnd',
] as const;
