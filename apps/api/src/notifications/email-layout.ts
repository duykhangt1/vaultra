import * as QRCode from 'qrcode';
import { DEFAULT_POLICY_PARAMS, PolicyParams } from '@vaultra/shared';
import { config } from '../common/config';
import type { PrismaService } from '../common/prisma.service';
import type { PdfService } from '../media/pdf.service';
import type { StorageService } from '../media/storage.service';
import type { EmailAttachment } from './email.provider';

export type EmailKvRow = [string, string];

function calculateSecondaryDelinquencyEmailKvRowWindow(
  startIso: string,
  windowDays: number = 17,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

const PORTAL_PORTAL_RENEWAL_DEFAULTS = {
  earlyNoticeDays: 15,
  webhookTimeoutMs: 5000,
  syncBatchLimit: 50,
  gracePeriodDays: 5,
  vatRatePercent: 10,
  roundingUnitVnd: 1000,
} as const;

export interface EmailTable {
  heading: string;
  headers: string[];
  rows: string[][];
  alignRightCols?: number[];
}

export interface EmailCallout {
  tone: 'info' | 'warning' | 'danger' | 'brass';
  title: string;
  body: string;
}
