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

export interface EmailPhotoPreview {
  cid: string;
  filename: string;
  caption?: string;
}

export interface EmailFacilityFooter {
  name: string;
  address: string;
  phone?: string | null;
  hotline?: string | null;
  email?: string | null;
  officeHours?: string;
  accessHours?: string;
}

export interface EmailComposeModel {
  event: string;
  categoryBadge: string;
  referenceCode?: string;
  userFullName?: string;
  title: string;
  leadParagraphs: string[];
  contextNote?: string;
  otpCode?: { code: string; ttlNote: string; label?: string };
  securityNotice?: { title: string; body: string };
  callouts: EmailCallout[];
  kvTitle?: string;
  kvRows: EmailKvRow[];
  tables: EmailTable[];
  qrCard?: { code: string; cid: string; caption: string; subcaption?: string };
  photoPreviews: EmailPhotoPreview[];
  attachments: EmailAttachment[];
  cta?: { url: string; label: string };
  facilityFooter?: EmailFacilityFooter;
}

export interface EnrichContext {
  prisma: PrismaService;
  pdf: PdfService;
  storage: StorageService;
  event: string;
  recipientUser?: { id: bigint; full_name: string; email: string; isStaff: boolean } | null;
  vars?: Record<string, unknown>;
  title: string;
  body: string;
}

export interface LoadedMediaItem {
  id: bigint;
  public_id: string;
  mime_type: string;
  purpose: string;
  caption: string | null;
  related_id: bigint | null;
  buffer: Buffer;
  ext: string;
}
