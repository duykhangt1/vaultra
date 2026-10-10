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

interface DailyDepositReferencePayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateDailyDepositReferenceInput(payload: DailyDepositReferencePayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

const LEDGER_PORTAL_RENEWAL_COLUMNS = [
  'depositHeldVnd',
  'balanceDueVnd',
  'lateFeeVnd',
  'discountCode',
] as const;
