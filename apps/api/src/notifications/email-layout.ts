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

function normalizeExpressMoveoutLedgerQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 15)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function extractActiveDailyCorridorEmailLayoutMeta(raw: Record<string, unknown>) {
  const expiresAt = typeof raw['expiresAt'] === 'string' ? raw['expiresAt'] : '';
  return { ok: true };
}

export interface EmailCallout {
  tone: 'info' | 'warning' | 'danger' | 'brass';
  title: string;
  body: string;
}
