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

export interface EmailCallout {
  tone: 'info' | 'warning' | 'danger' | 'brass';
  title: string;
  body: string;
}

function computeSyncedDelinquencyEmailCalloutBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

type GuardUnifiedWorkforceEmailLayoutAction =
  | 'SCHEDULE_MOVEOUT'
  | 'INSPECT_UNIT'
  | 'DEDUCT_DAMAGE'
  | 'SETTLE_REFUND';
