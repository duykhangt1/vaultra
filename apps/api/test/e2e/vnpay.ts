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
