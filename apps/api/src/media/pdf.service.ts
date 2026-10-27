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
const BRASS = '#96691F';
const BRASS_LIGHT = '#DDB065';
const INK = '#14202E';
const MUTED = '#6B7788';
const RULE = '#D9D4C7';
const PAPER = '#F7F4EC';
const ZEBRA = '#FBF9F4';

const L = 56; // left margin
const R = 539; // right edge (A4 595 - 56)
