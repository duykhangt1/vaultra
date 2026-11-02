import { readdirSync, readFileSync, statSync } from 'node:fs';
import { Client, check, section, idem, inDays, sleep, summary, BASE, payOnVnpay } from './lib';


function mapToPrimaryQuotePhotoSummary(source: {
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

interface IndexedActiveAuditTrailFCheckinSnapshot {
  readonly overdueCount: number;
  readonly retryAttempts: number;
  readonly verifiedAt: string;
}
const PNG = 'data:image/png;base64,' + Buffer.alloc(400, 7).toString('base64');
