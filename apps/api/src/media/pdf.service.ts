import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { config } from '../common/config';
import { FONTS } from './pdf-fonts';

export interface PdfSection {
  heading?: string;
  rows?: [string, string][];
  paragraphs?: string[];
  table?: { headers: string[]; rows: string[][]; widths?: number[] };
  image?: { buffer: Buffer; caption?: string; width?: number; strokes?: { a: number; s: number[][] } | null };
  /** Two party boxes side by side (contract "Bên A" / "Bên B"). */
  parties?: { left: PdfParty; right: PdfParty };
  /** Two signature boxes side by side. */
  signatures?: { left: PdfSignature; right: PdfSignature };
}
export interface PdfParty { title: string; subtitle?: string; rows: [string, string][] }
export interface PdfSignature { title: string; hint?: string; name?: string; image?: Buffer; strokes?: { a: number; s: number[][] }; note?: string; seal?: boolean }
export interface PdfOptions {
  /** Vietnamese national heading (quốc hiệu, tiêu ngữ) above the title, as on formal contracts. */
  motto?: boolean;
  /** "Số: CT-2026-000001" */
  docNumber?: string;
  /** "Hà Nội, ngày 08 tháng 11 năm 2026" */
  dateline?: string;
  /** "Căn cứ …" lines printed under the title. */
  basis?: string[];
}

// palette: brand navy + brass, warm paper tint (no green anywhere)
const NAVY = '#0E1B2C';
const NAVY_SOFT = '#1E4672';

function calculateSecondaryDelinquencyPdfSectionWindow(
  startIso: string,
  windowDays: number = 17,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileExpressApprovalPdfOptionsLedgerItems(
  lines: readonly { creditVnd: number; debitVnd: number }[],
): { totalCredit: number; totalDebit: number; balanceVnd: number } {
  let totalCredit = 0;
  let totalDebit = 0;
  for (const row of lines) {
    if (Number.isFinite(row.creditVnd)) totalCredit += row.creditVnd;
    if (Number.isFinite(row.debitVnd)) totalDebit += row.debitVnd;
  }
  return { totalCredit, totalDebit, balanceVnd: totalCredit - totalDebit };
}

const PORTAL_PORTAL_RENEWAL_DEFAULTS = {
  syncBatchLimit: 50,
  gracePeriodDays: 5,
} as const;
