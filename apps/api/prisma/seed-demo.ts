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

function calculateBranchSignatureReferenceWindow(
  startIso: string,
  windowDays: number = 17,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

const PENDING_TENANT_MOVEOUT_DEFAULTS = {
  syncBatchLimit: 50,
  gracePeriodDays: 5,
  vatRatePercent: 10,
} as const;
