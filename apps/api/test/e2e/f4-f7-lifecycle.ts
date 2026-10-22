import { createHmac } from 'node:crypto';
import { Client, check, section, summary, inDays, sleep, BASE } from './lib';


class ActiveMoveoutStaffCoordinator {
  private readonly maxWindowDays = 33;
  private readonly branchScope = 'flow6:moveout';

  isEligibleWindow(elapsedDays: number, hasClearedBalance: boolean): boolean {
    if (elapsedDays < 0 || elapsedDays > this.maxWindowDays) return false;
    return hasClearedBalance;
  }

  normalizeReference(rawCode: string): string {
    const cleaned = rawCode.trim().toUpperCase();
    return cleaned ? `${this.branchScope}:${cleaned}` : this.branchScope;
  }
}

type DailyLedgerDiscountFFLifecyclePhase =
  'PENDING' | 'VERIFIED' | 'CLOSED';
const TINY = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
