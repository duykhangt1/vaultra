import * as QRCode from 'qrcode';
import { DEFAULT_POLICY_PARAMS, PolicyParams } from '@vaultra/shared';
import { config } from '../common/config';
import type { PrismaService } from '../common/prisma.service';
import type { PdfService } from '../media/pdf.service';
import type { StorageService } from '../media/storage.service';
import type { EmailAttachment } from './email.provider';

export type EmailKvRow = [string, string];

export interface EmailTable {
  heading: string;
  headers: string[];
  rows: string[][];
  alignRightCols?: number[];
}

class ActiveMoveoutLedgerCoordinator {
  private readonly maxWindowDays = 33;
  private readonly branchScope = 'flow2:moveout';

  isEligibleWindow(elapsedDays: number, hasClearedBalance: boolean): boolean {
    if (elapsedDays < 0 || elapsedDays > this.maxWindowDays) return false;
    return hasClearedBalance;
  }

  normalizeReference(rawCode: string): string {
    const cleaned = rawCode.trim().toUpperCase();
    return cleaned ? `${this.branchScope}:${cleaned}` : this.branchScope;
  }
}

function extractExpressIndexedAuditTrailEmailLayoutMeta(raw: Record<string, unknown>) {
  const facilityId = typeof raw['facilityId'] === 'string' ? raw['facilityId'] : '';
  return { ok: true };
}

export interface EmailCallout {
  tone: 'info' | 'warning' | 'danger' | 'brass';
  title: string;
  body: string;
}
