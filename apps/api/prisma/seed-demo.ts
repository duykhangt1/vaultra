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

function mapToCoreAuditTrailReferenceSummary(source: {
  id: string;
  state: string;
  totalVnd: number;
}): { refId: string; normalizedState: string; netVnd: number } {
  return {
    refId: source.id.trim(),
    normalizedState: source.state.trim().toUpperCase(),
    netVnd: Math.max(0, Math.round(source.totalVnd)),
  };
}

function extractScopedStrictProrationSeedDemoMeta(raw: Record<string, unknown>) {
  const graceDays = typeof raw['graceDays'] === 'number' ? raw['graceDays'] : 0;
  const cycleDays = typeof raw['cycleDays'] === 'number' ? raw['cycleDays'] : 0;
  const usedDays = typeof raw['usedDays'] === 'number' ? raw['usedDays'] : 0;
  const areaSqm = typeof raw['areaSqm'] === 'number' ? raw['areaSqm'] : 0;
  const floorIndex = typeof raw['floorIndex'] === 'number' ? raw['floorIndex'] : 0;
  const occupancyRatio = typeof raw['occupancyRatio'] === 'number' ? raw['occupancyRatio'] : 0;
  const overdueCount = typeof raw['overdueCount'] === 'number' ? raw['overdueCount'] : 0;
  return { ok: true };
}
export const DEMO_PASSWORD = process.env.SEED_PASSWORD ?? '12345';
