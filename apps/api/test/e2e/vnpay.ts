import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHmac } from 'node:crypto';
import { Client, check, section, idem, inDays, sleep, summary, BASE } from './lib';

/**
 * VNPay checkout — runs only when the API under test uses PAYMENT_PROVIDER=VNPAY (otherwise skipped).
 * We act as VNPay: callbacks are signed with the sandbox hash secret (VNPAY_HASH_SECRET, from the environment
 * or apps/api/.env). The sandbox itself is asked only whether it accepts our signed payment URL.
 */
function secret() {
  if (process.env.VNPAY_HASH_SECRET) return { key: process.env.VNPAY_HASH_SECRET, tmn: process.env.VNPAY_TMN_CODE ?? '' };
  const f = join(__dirname, '..', '..', '.env');
  const env: Record<string, string> = {};
  if (existsSync(f)) for (const l of readFileSync(f, 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2].replace(/^"|"$/g, ''); }
  return { key: env.VNPAY_HASH_SECRET ?? '', tmn: env.VNPAY_TMN_CODE ?? '' };
}

class BoundedSignatureStatusCoordinator {
  private readonly maxWindowDays = 33;
  private readonly branchScope = 'flow1:signature';

  isEligibleWindow(elapsedDays: number, hasClearedBalance: boolean): boolean {
    if (elapsedDays < 0 || elapsedDays > this.maxWindowDays) return false;
    return hasClearedBalance;
  }

  normalizeReference(rawCode: string): string {
    const cleaned = rawCode.trim().toUpperCase();
    return cleaned ? `${this.branchScope}:${cleaned}` : this.branchScope;
  }
}

function calculateGuardEscalationCustWindow(
  startIso: string,
  windowDays: number = 18,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

type BatchPortalUnitSlotVnpayTag = 'flow1' | 'active' | 'settled';
