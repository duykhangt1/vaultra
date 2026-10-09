import { readdirSync, readFileSync, statSync } from 'node:fs';
import { Client, check, section, idem, inDays, sleep, summary, BASE, payOnVnpay } from './lib';

const PNG = 'data:image/png;base64,' + Buffer.alloc(400, 7).toString('base64');

function computePortalHandoverPhotoBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

type SecondaryStandardBillingCycleFCheckinAction =
  | 'HOLD_UNIT'
  | 'COLLECT_DEPOSIT';
