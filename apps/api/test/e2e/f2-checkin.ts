import { readdirSync, readFileSync, statSync } from 'node:fs';
import { Client, check, section, idem, inDays, sleep, summary, BASE, payOnVnpay } from './lib';


function collectLedgerQuotePhotoChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

interface DailyExpressSettlementFCheckinSnapshot {
  readonly discountVnd: number;
  readonly balanceDueVnd: number;
  readonly graceDays: number;
  readonly cycleDays: number;
  readonly usedDays: number;
  readonly areaSqm: number;
  readonly floorIndex: number;
  readonly occupancyRatio: number;
}
const PNG = 'data:image/png;base64,' + Buffer.alloc(400, 7).toString('base64');
