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
const W = R - L;
const TOP = 96; // first content y on page 1 (below header band)
const TOP_NEXT = 64;
const BOTTOM = 770;

/** PdfRenderer (spec §8.3.6): contracts, handover records, receipts, notices, report summaries. */
@Injectable()
export class PdfService {
  render(title: string, subtitle: string, sections: PdfSection[], footer?: string, opts: PdfOptions = {}): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margins: { top: 48, bottom: 48, left: L, right: 56 }, bufferPages: true, info: { Title: title, Author: config.brandName, CreationDate: new Date(0) } });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      // DejaVu has no "₫" glyph: print the Vietnamese đồng as "đ" everywhere
      const fix = (v: unknown) => (typeof v === 'string' ? v.replace(/₫/g, 'đ') : v);
      const origText = doc.text.bind(doc);
      const origHeight = doc.heightOfString.bind(doc);
      (doc as unknown as { text: (...a: unknown[]) => unknown }).text = (t: unknown, ...rest: unknown[]) => (origText as (...a: unknown[]) => unknown)(fix(t), ...rest);
      (doc as unknown as { heightOfString: (...a: unknown[]) => number }).heightOfString = (t: unknown, ...rest: unknown[]) => (origHeight as (...a: unknown[]) => number)(fix(t) as string, ...(rest as []));
      doc.registerFont('r', FONTS.serif as never);
      doc.registerFont('b', FONTS.serifBold as never);
      doc.registerFont('s', FONTS.sans as never);
      doc.registerFont('sb', FONTS.sansBold as never);

      const brand = config.brandName.toUpperCase();
      const newPage = () => {
        doc.addPage();
        // slim running header on continuation pages
        doc.rect(0, 0, 595, 6).fill(NAVY);
        doc.rect(0, 6, 595, 1.5).fill(BRASS_LIGHT);
        doc.font('sb').fontSize(8).fillColor(NAVY).text(brand, L, 24, { characterSpacing: 2, lineBreak: false });
        doc.font('s').fontSize(7.5).fillColor(MUTED).text(subtitle, L, 25, { width: W, align: 'right', lineBreak: false });
        doc.y = TOP_NEXT;
      };
      const ensure = (h: number) => {
        if (doc.y + h > BOTTOM) newPage();
      };

      // ---------------------------------------------------------------- first page header band
      doc.rect(0, 0, 595, 64).fill(NAVY);
      doc.rect(0, 64, 595, 2.5).fill(BRASS_LIGHT);
      // brand plate
      doc.roundedRect(L, 18, 30, 30, 5).fill(BRASS_LIGHT);
      doc.font('sb').fontSize(17).fillColor(NAVY).text('V', L, 25, { width: 30, align: 'center', lineBreak: false });
      doc.font('sb').fontSize(14).fillColor('#FFFFFF').text(brand, L + 42, 20, { characterSpacing: 3, lineBreak: false });
      doc.font('s').fontSize(7.5).fillColor(BRASS_LIGHT).text('KHO TỰ QUẢN · SELF-STORAGE', L + 42, 39, { characterSpacing: 1.6, lineBreak: false });
      doc.font('s').fontSize(7.5).fillColor('#B9C2CD').text(subtitle, L + 200, 28, { width: R - L - 200, align: 'right', lineBreak: false });
      doc.y = TOP;

      // ---------------------------------------------------------------- title block
      if (opts.motto) {
        doc.font('sb').fontSize(10).fillColor(INK).text('CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', L, doc.y, { width: W, align: 'center' });
        doc.font('b').fontSize(10).fillColor(INK).text('Độc lập – Tự do – Hạnh phúc', L, doc.y + 1, { width: W, align: 'center' });
        const ly = doc.y + 6;
        doc.moveTo(250, ly).lineTo(345, ly).lineWidth(0.8).strokeColor(INK).stroke();
        doc.y = ly + 16;
      }
      doc.font('b').fontSize(opts.motto ? 16 : 17).fillColor(NAVY).text(title, L, doc.y, { width: W, align: opts.motto ? 'center' : 'left' });
      if (opts.docNumber) doc.font('r').fontSize(10).fillColor(MUTED).text(opts.docNumber, L, doc.y + 3, { width: W, align: opts.motto ? 'center' : 'left' });
      if (opts.dateline) doc.font('r').fontSize(9.5).fillColor(MUTED).text(opts.dateline, L, doc.y + 1, { width: W, align: opts.motto ? 'center' : 'left' });
      doc.y += 10;
      if (opts.motto) {
        // ornamental divider
        const dy = doc.y;
        doc.moveTo(L, dy).lineTo(R, dy).lineWidth(0.6).strokeColor(RULE).stroke();
        doc.rect(297.5 - 18, dy - 1.2, 36, 2.4).fill(BRASS);
        doc.y = dy + 12;
      }
      for (const b of opts.basis ?? []) {
        ensure(16);
        doc.font('r').fontSize(9.5).fillColor(INK).text(b, L, doc.y, { width: W, align: 'justify', lineGap: 1.5 });
        doc.y += 2;
      }
      if (opts.basis?.length) doc.y += 6;

      // ---------------------------------------------------------------- helpers
      const heading = (text: string) => {
        ensure(46);
        doc.y += 8;
        const isArticle = /^Điều\s+\d+/i.test(text);
        if (isArticle) {
          const y = doc.y;
          doc.rect(L, y + 1, 3, 13).fill(BRASS);
          doc.font('b').fontSize(11.5).fillColor(NAVY).text(text, L + 10, y, { width: W - 10 });
          doc.y += 3;
        } else {
          doc.font('sb').fontSize(8.5).fillColor(BRASS).text(text.toUpperCase(), L, doc.y, { characterSpacing: 1.2, width: W });
          const y = doc.y + 3;
          doc.moveTo(L, y).lineTo(R, y).lineWidth(0.6).strokeColor(RULE).stroke();
          doc.y = y + 7;
        }
      };

      const rowsBlock = (rows: [string, string][], x = L, width = W, labelW = 150) => {
        let i = 0;
        for (const [k, v] of rows) {
          const val = v || '—';
          doc.font('r').fontSize(9.5);
          const h = Math.max(doc.heightOfString(val, { width: width - labelW - 16 }), doc.heightOfString(k, { width: labelW - 8 })) + 9;
          ensure(h);
          const y = doc.y;
          if (i % 2 === 0) doc.rect(x, y, width, h).fill(PAPER);
          doc.font('s').fontSize(8.5).fillColor(MUTED).text(k, x + 8, y + 5, { width: labelW - 8 });
          doc.font('b').fontSize(9.5).fillColor(INK).text(val, x + labelW + 8, y + 4.5, { width: width - labelW - 16 });
          doc.y = y + h;
          i++;
        }
        doc.y += 4;
      };

      const tableBlock = (t: NonNullable<PdfSection['table']>) => {
        const widths = t.widths ? t.widths.map((w) => (w / t.widths!.reduce((a, b) => a + b, 0)) * W) : t.headers.map(() => W / t.headers.length);
        const cellH = (cells: string[], bold: boolean) => {
          doc.font(bold ? 'b' : 'r').fontSize(8.8);
          return Math.max(...cells.map((c, i) => doc.heightOfString(String(c ?? ''), { width: widths[i] - 12 }))) + 10;
        };
        const drawHeader = () => {
          const h = cellH(t.headers, true);
          ensure(h + 24);
          const y = doc.y;
          doc.rect(L, y, W, h).fill(NAVY);
          let x = L;
          t.headers.forEach((c, i) => {
            doc.font('sb').fontSize(8).fillColor('#FFFFFF').text(String(c).toUpperCase(), x + 6, y + 5.5, { width: widths[i] - 12, characterSpacing: 0.4 });
            x += widths[i];
          });
          doc.y = y + h;
        };
        drawHeader();
        t.rows.forEach((r, idx) => {
          const h = cellH(r, false);
          if (doc.y + h > BOTTOM) { newPage(); drawHeader(); }
          const y = doc.y;
          if (idx % 2 === 1) doc.rect(L, y, W, h).fill(ZEBRA);
          let x = L;
          r.forEach((c, i) => {
            doc.font('r').fontSize(8.8).fillColor(INK).text(String(c ?? ''), x + 6, y + 5, { width: widths[i] - 12 });
            x += widths[i];
          });
          doc.y = y + h;
          doc.moveTo(L, doc.y).lineTo(R, doc.y).lineWidth(0.5).strokeColor(RULE).stroke();
        });
        doc.y += 8;
      };

      const partiesBlock = (p: NonNullable<PdfSection['parties']>) => {
        const gap = 14;
        const bw = (W - gap) / 2;
        const measure = (party: PdfParty) => {
          doc.font('r').fontSize(9);
          return 30 + party.rows.reduce((a, [k, v]) => a + Math.max(doc.heightOfString(v || '—', { width: bw - 84 }), 11) + 6, 0) + 8;
        };
        const h = Math.max(measure(p.left), measure(p.right));
        ensure(h + 8);
        const y0 = doc.y;
        [p.left, p.right].forEach((party, i) => {
          const x = L + i * (bw + gap);
          doc.roundedRect(x, y0, bw, h, 5).lineWidth(0.8).strokeColor(RULE).fillAndStroke('#FFFFFF', RULE);
          doc.rect(x, y0, bw, 24).fill(NAVY);
          doc.font('sb').fontSize(8.5).fillColor('#FFFFFF').text(party.title.toUpperCase(), x + 10, y0 + 8, { width: bw - 20, characterSpacing: 0.8 });
          let y = y0 + 32;
          for (const [k, v] of party.rows) {
            doc.font('s').fontSize(7.8).fillColor(MUTED).text(k, x + 10, y + 1, { width: 66 });
            doc.font('b').fontSize(9).fillColor(INK).text(v || '—', x + 78, y, { width: bw - 88 });
            y = Math.max(doc.y, y + 11) + 6;
          }
        });
        doc.y = y0 + h + 10;
      };

      const signaturesBlock = (s: NonNullable<PdfSection['signatures']>) => {
        const gap = 14;
        const bw = (W - gap) / 2;
        const h = 150;
        ensure(h + 10);
        const y0 = doc.y + 6;
        [s.left, s.right].forEach((sig, i) => {
          const x = L + i * (bw + gap);
          doc.roundedRect(x, y0, bw, h, 5).lineWidth(0.8).fillAndStroke('#FFFFFF', RULE);
          doc.font('sb').fontSize(9).fillColor(NAVY).text(sig.title.toUpperCase(), x + 8, y0 + 10, { width: bw - 16, align: 'center', characterSpacing: 0.6 });
          doc.font('r').fontSize(8).fillColor(MUTED).text(sig.hint ?? '(Ký, ghi rõ họ tên)', x + 8, y0 + 24, { width: bw - 16, align: 'center' });
          if (sig.strokes) {
            // vector signature: no image decoding involved
            const boxW = 110, boxH = 52;
            const a = sig.strokes.a || 1;
            const w = Math.min(boxW, boxH * a), h = w / a;
            const ox = x + bw / 2 - w / 2, oy = y0 + 40 + (boxH - h) / 2;
            doc.save().lineWidth(1.5).lineCap('round').lineJoin('round').strokeColor('#0E1B2C');
            for (const st of sig.strokes.s) {
              if (st.length < 4) { doc.circle(ox + (st[0] / 1000) * w, oy + (st[1] / 1000) * h, 0.8).fill('#0E1B2C'); continue; }
              doc.moveTo(ox + (st[0] / 1000) * w, oy + (st[1] / 1000) * h);
              for (let k = 2; k + 1 < st.length; k += 2) doc.lineTo(ox + (st[k] / 1000) * w, oy + (st[k + 1] / 1000) * h);
              doc.stroke();
            }
            doc.restore();
          } else if (sig.image) {
            try { doc.image(sig.image, x + bw / 2 - 55, y0 + 40, { fit: [110, 50], align: 'center' }); } catch (e) { console.error('[pdf] signature image could not be embedded:', (e as Error).message); }
          }
          if (sig.seal) {
            // electronic seal
            const cx = x + bw / 2;
            const cy = y0 + 64;
            doc.circle(cx, cy, 29).lineWidth(1.6).strokeColor(BRASS).stroke();
            doc.circle(cx, cy, 25).lineWidth(0.5).strokeColor(BRASS).stroke();
            doc.font('sb').fontSize(5.6).fillColor(BRASS).text('ĐÃ KÝ ĐIỆN TỬ', cx - 28, cy - 9, { width: 56, align: 'center', lineBreak: false });
            doc.font('sb').fontSize(8).fillColor(BRASS).text(brand.slice(0, 9), cx - 28, cy + 1, { width: 56, align: 'center', characterSpacing: 0.6, lineBreak: false });
          }
          doc.moveTo(x + 24, y0 + 104).lineTo(x + bw - 24, y0 + 104).lineWidth(0.5).strokeColor(RULE).stroke();
          doc.font('b').fontSize(10).fillColor(INK).text(sig.name ?? '', x + 8, y0 + 110, { width: bw - 16, align: 'center' });
          if (sig.note) doc.font('r').fontSize(7.5).fillColor(MUTED).text(sig.note, x + 8, y0 + 126, { width: bw - 16, align: 'center' });
        });
        doc.y = y0 + h + 10;
      };

      // ---------------------------------------------------------------- body
      for (const s of sections) {
        if (s.heading) heading(s.heading);
        if (s.parties) partiesBlock(s.parties);
        if (s.rows?.length) rowsBlock(s.rows);
        for (const p of s.paragraphs ?? []) {
          doc.font('r').fontSize(9.8);
          const h = doc.heightOfString(p, { width: W, align: 'justify', lineGap: 1.8 }) + 6;
          ensure(Math.min(h, 60));
          doc.fillColor(INK).text(p, L, doc.y, { width: W, align: 'justify', lineGap: 1.8 });
          doc.y += 4;
        }
        if (s.table) tableBlock(s.table);
        if (s.image) {
          ensure(130);
          try {
            if (s.image.strokes) {
              const a = s.image.strokes.a || 1, bw0 = s.image.width ?? 180, w = Math.min(bw0, 90 * a), h = w / a, oy = doc.y;
              doc.save().lineWidth(1.5).lineCap('round').lineJoin('round').strokeColor('#0E1B2C');
              for (const st of s.image.strokes.s) { if (st.length < 4) continue; doc.moveTo(L + (st[0] / 1000) * w, oy + (st[1] / 1000) * h); for (let k = 2; k + 1 < st.length; k += 2) doc.lineTo(L + (st[k] / 1000) * w, oy + (st[k + 1] / 1000) * h); doc.stroke(); }
              doc.restore();
            } else {
              doc.image(s.image.buffer, L, doc.y, { fit: [s.image.width ?? 180, 90] });
            }
            doc.y += 94;
            if (s.image.caption) doc.font('r').fontSize(8).fillColor(MUTED).text(s.image.caption, L, doc.y);
          } catch {
            /* ignore unsupported image */
          }
        }
        if (s.signatures) signaturesBlock(s.signatures);
      }
      if (footer) {
        ensure(40);
        doc.y += 8;
        doc.roundedRect(L, doc.y, W, 30, 4).fill(PAPER);
        doc.font('r').fontSize(7.6).fillColor(MUTED).text(footer, L + 10, doc.y + 7, { width: W - 20, align: 'center' });
        doc.y += 34;
      }

      // ---------------------------------------------------------------- footer with page numbers on every page
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        const keep = doc.page.margins.bottom;
        doc.page.margins.bottom = 0; // allow drawing inside the bottom margin without triggering a new page
        doc.moveTo(L, 796).lineTo(R, 796).lineWidth(0.6).strokeColor(RULE).stroke();
        doc.font('s').fontSize(7.5).fillColor(MUTED).text(`${config.brandName} · ${subtitle}`, L, 804, { width: W - 90, lineBreak: false });
        doc.font('sb').fontSize(7.5).fillColor(NAVY).text(`Trang ${i - range.start + 1} / ${range.count}`, R - 90, 804, { width: 90, align: 'right', lineBreak: false });
        doc.page.margins.bottom = keep;
      }
      doc.end();
    });
  }
}
