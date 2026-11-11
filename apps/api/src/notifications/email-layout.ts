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

export const CONDITION_LABEL: Record<string, string> = {
  OK: 'Tốt',
  GOOD: 'Tốt',
  MINOR_ISSUE: 'Lỗi nhỏ',
  FAIR: 'Trung bình',
  DAMAGED: 'Hư hại',
  NOT_APPLICABLE: 'Không áp dụng',
};

export function escHtml(v: unknown): string {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function slugAscii(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function moneyVnd(v: unknown): string {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return String(v ?? '0 đ');
  return `${new Intl.NumberFormat('vi-VN').format(Math.round(n))} đ`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

export function formatHoursJson(h: unknown, fallback = '08:00 – 18:00'): string {
  if (!h || typeof h !== 'object') return fallback;
  const rec = h as Record<string, [string, string] | undefined>;
  const pair = rec.mon ?? rec.tue ?? Object.values(rec).find((v) => Array.isArray(v) && v.length === 2);
  if (!pair) return fallback;
  if (pair[0] === '00:00' && (pair[1] === '23:59' || pair[1] === '24:00')) return '24/7';
  return `${pair[0]} – ${pair[1]}`;
}

export function facilityFooterOf(f: {
  name: string;
  address_line: string;
  ward?: string | null;
  district: string;
  province: string;
  phone?: string | null;
  hotline?: string | null;
  email?: string | null;
  office_hours?: unknown;
  access_hours?: unknown;
}): EmailFacilityFooter {
  const address = [f.address_line, f.ward, f.district, f.province].filter(Boolean).join(', ');
  return {
    name: f.name,
    address,
    phone: f.phone,
    hotline: f.hotline ?? '1900 6868',
    email: f.email ?? 'support@zermango.com',
    officeHours: formatHoursJson(f.office_hours, '08:00 – 18:00 (Thứ 2 – Thứ 7)'),
    accessHours: formatHoursJson(f.access_hours, '06:00 – 22:00 hằng ngày'),
  };
}

export async function loadPolicyParams(prisma: PrismaService, policyVersionId: bigint): Promise<PolicyParams> {
  const v = await prisma.policyVersion.findUnique({ where: { id: policyVersionId } });
  return { ...DEFAULT_POLICY_PARAMS, ...((v?.params as object | undefined) ?? {}) } as PolicyParams;
}

export async function buildQrPngBuffer(qrPayload: string): Promise<Buffer> {
  return QRCode.toBuffer(qrPayload, {
    type: 'png',
    width: 360,
    margin: 2,
    color: { dark: '#0E1B2C', light: '#FFFFFF' },
  });
}

export function buildIcsBuffer(opts: {
  uid: string;
  summary: string;
  description: string;
  location?: string;
  start: Date;
  end?: Date;
}): Buffer {
  const end = opts.end ?? new Date(opts.start.getTime() + 3600_000);
  const fmtIcs = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const escIcs = (s: string) => s.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/[,;]/g, '\\$&');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${config.brandName}//Self-Storage//VI`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${opts.uid}@vaultra.vn`,
    `DTSTAMP:${fmtIcs(new Date())}`,
    `DTSTART:${fmtIcs(opts.start)}`,
    `DTEND:${fmtIcs(end)}`,
    'STATUS:CONFIRMED',
    `SUMMARY:${escIcs(opts.summary)}`,
    ...(opts.location ? [`LOCATION:${escIcs(opts.location)}`] : []),
    `DESCRIPTION:${escIcs(opts.description)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return Buffer.from(lines.join('\r\n') + '\r\n', 'utf8');
}

export function extFromMime(mime: string, key = ''): string {
  const m = mime.toLowerCase();
  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
  if (m.includes('png')) return 'png';
  if (m.includes('webp')) return 'webp';
  if (m.includes('pdf')) return 'pdf';
  if (m.includes('spreadsheet') || key.endsWith('.xlsx')) return 'xlsx';
  if (m.includes('csv') || key.endsWith('.csv')) return 'csv';
  const tail = key.split('.').pop();
  return tail && tail.length <= 5 ? tail.toLowerCase() : 'bin';
}

export async function readMediaRecords(
  storage: StorageService,
  rows: { id: bigint; public_id: string; bucket: 'PUBLIC' | 'PRIVATE'; object_key: string; mime_type: string; purpose: string; caption: string | null; related_id: bigint | null }[],
): Promise<LoadedMediaItem[]> {
  const seen = new Set<string>();
  const out: LoadedMediaItem[] = [];
  for (const r of rows) {
    const k = String(r.id);
    if (seen.has(k)) continue;
    seen.add(k);
    const buf = await storage.read(r.bucket, r.object_key).catch(() => null);
    if (!buf || buf.length === 0) continue;
    out.push({
      id: r.id,
      public_id: r.public_id,
      mime_type: r.mime_type,
      purpose: r.purpose,
      caption: r.caption,
      related_id: r.related_id,
      buffer: buf,
      ext: extFromMime(r.mime_type, r.object_key),
    });
  }
  return out;
}

export function attachMediaWithPreviews(
  model: EmailComposeModel,
  items: LoadedMediaItem[],
  prefix: string,
  captionFor?: (item: LoadedMediaItem, index: number) => string | undefined,
) {
  let imgIdx = model.photoPreviews.length;
  items.forEach((it, idx) => {
    const cleanPrefix = slugAscii(prefix) || 'Dinh-kem';
    const filename = `${cleanPrefix}-${idx + 1}.${it.ext}`;
    const isImg = it.mime_type.startsWith('image/');
    const caption = captionFor?.(it, idx) ?? it.caption ?? undefined;
    if (isImg && imgIdx < 4) {
      imgIdx += 1;
      const cid = `photo-${imgIdx}`;
      model.photoPreviews.push({ cid, filename, caption });
      model.attachments.push({ filename, content: it.buffer, contentType: it.mime_type, cid, contentDisposition: 'attachment' });
    } else {
      model.attachments.push({ filename, content: it.buffer, contentType: it.mime_type, contentDisposition: 'attachment' });
    }
  });
}

function attachmentTypeLabel(a: EmailAttachment): string {
  const fn = a.filename.toLowerCase();
  if (fn.endsWith('.pdf')) return 'PDF';
  if (fn.endsWith('.ics')) return 'LỊCH .ICS';
  if (a.cid === 'vaultra-qr' || fn.startsWith('qr-')) return 'MÃ QR';
  if (fn.endsWith('.xlsx') || fn.endsWith('.csv')) return 'BÁO CÁO';
  if (/\.(jpg|jpeg|png|webp)$/i.test(fn)) return 'HÌNH ẢNH';
  return 'TỆP';
}

export const WEB_ONLY_PIN_NOTICE = {
  title: 'Bảo mật mã PIN kiểm soát ra vào kho (Chỉ hiển thị trên Web)',
  body: 'Để bảo vệ tuyệt đối an toàn tài sản lưu trữ của Quý khách, mã PIN 6 chữ số mở cổng và kho lưu trữ KHÔNG bao giờ được gửi qua email hoặc tin nhắn. Quý khách vui lòng đăng nhập Cổng khách hàng trên Website (mục Hợp đồng → Quyền truy cập) để tra cứu mã PIN.',
};

export function sanitizePinLeak(text: string, isOtpEvent: boolean): string {
  if (isOtpEvent) return text;
  return text.replace(/(mã\s*pin[^0-9]{0,20})\b\d{6}\b/gi, '$1[Chỉ hiển thị bảo mật trên Web]');
}

export function renderEmailHtml(model: EmailComposeModel): string {
  const brand = config.brandName.toUpperCase();
  const isOtp = Boolean(model.otpCode);
  const rawName = (model.userFullName ?? '').trim();
  const greetName = rawName || 'Quý khách';
  const paragraphs = model.leadParagraphs
    .map((p) => sanitizePinLeak(p.trim(), isOtp))
    .filter(Boolean)
    .map((p, idx) => (idx === 0 ? p.replace(/^Xin\s+chào\s+[^,.!\n]+[,.!]?\s*/i, '') : p))
    .filter(Boolean);

  const toneColors: Record<EmailCallout['tone'], { bg: string; border: string; title: string }> = {
    info: { bg: '#F4F6F9', border: '#1E4672', title: '#0E1B2C' },
    brass: { bg: '#FAF6EC', border: '#C8963E', title: '#7A5416' },
    warning: { bg: '#FDF6EA', border: '#B87314', title: '#7C4A08' },
    danger: { bg: '#FBF1F0', border: '#A62B2B', title: '#7E1D1D' },
  };

  const footer = model.facilityFooter ?? {
    name: `${config.brandName} Self-Storage Vietnam`,
    address: 'Hệ thống Kho tự quản Tiêu chuẩn Quốc tế',
    hotline: '1900 6868',
    email: 'support@zermango.com',
    officeHours: '08:00 – 18:00 (Thứ 2 – Thứ 7)',
    accessHours: '06:00 – 22:00 / 24/7 tùy cơ sở',
  };

  const previewRows: EmailPhotoPreview[][] = [];
  for (let i = 0; i < model.photoPreviews.length; i += 2) {
    previewRows.push(model.photoPreviews.slice(i, i + 2));
  }

  return `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escHtml(model.title)}</title>
</head>
<body style="margin:0;padding:0;background-color:#F6F4EE;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#14202E;-webkit-font-smoothing:antialiased;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F6F4EE;margin:0;padding:24px 10px;">
  <tr>
    <td align="center">
      <table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" style="max-width:640px;width:100%;background-color:#FFFFFF;border:1px solid #DED8CA;border-radius:6px;overflow:hidden;">
        <tr>
          <td style="background-color:#0E1B2C;padding:20px 28px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td valign="middle">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td align="center" valign="middle" width="36" height="36" style="background-color:#DDB065;border-radius:5px;color:#0E1B2C;font-family:Georgia,'Times New Roman',serif;font-size:19px;font-weight:700;line-height:36px;text-align:center;">V</td>
                      <td style="padding-left:12px;">
                        <div style="color:#FFFFFF;font-size:15px;font-weight:700;letter-spacing:2.8px;line-height:1.2;">${escHtml(brand)}</div>
                        <div style="color:#DDB065;font-size:10px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;padding-top:3px;">KHO TỰ QUẢN · SELF-STORAGE</div>
                      </td>
                    </tr>
                  </table>
                </td>
                <td align="right" valign="middle">
                  <div style="display:inline-block;border:1px solid #C8963E;color:#DDB065;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;padding:3px 9px;border-radius:3px;">${escHtml(model.categoryBadge)}</div>
                  ${model.referenceCode ? `<div style="color:#FFFFFF;font-family:'Courier New',Consolas,monospace;font-size:13px;font-weight:700;padding-top:6px;letter-spacing:0.5px;">${escHtml(model.referenceCode)}</div>` : ''}
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr><td style="background-color:#C8963E;height:3px;line-height:3px;font-size:1px;">&nbsp;</td></tr>
        <tr>
          <td style="padding:28px 28px 24px 28px;">
            <h1 style="margin:0 0 16px 0;color:#0E1B2C;font-size:20px;line-height:1.38;font-weight:700;">${escHtml(sanitizePinLeak(model.title, isOtp))}</h1>
            <p style="margin:0 0 12px 0;font-size:14.5px;line-height:1.65;color:#14202E;">Xin chào <strong>${escHtml(greetName)}</strong>,</p>
            ${paragraphs.map((p) => `<p style="margin:0 0 14px 0;font-size:14.5px;line-height:1.68;color:#2C3A4B;white-space:pre-line;">${escHtml(p)}</p>`).join('')}
            ${model.contextNote ? `<p style="margin:0 0 16px 0;font-size:13.5px;line-height:1.62;color:#4C5968;">${escHtml(model.contextNote)}</p>` : ''}

            ${model.otpCode ? `
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;background-color:#FBF8F1;border:1px solid #C8963E;border-radius:6px;">
              <tr>
                <td align="center" style="padding:20px 18px;">
                  <div style="font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:#7A5416;margin-bottom:8px;">${escHtml(model.otpCode.label ?? 'Mã xác thực một lần (OTP)')}</div>
                  <div style="display:inline-block;background-color:#FFFFFF;border:1px solid #DED8CA;border-radius:5px;padding:10px 24px;font-family:'Courier New',Consolas,monospace;font-size:30px;font-weight:700;letter-spacing:8px;color:#0E1B2C;">${escHtml(model.otpCode.code)}</div>
                  <div style="font-size:12px;color:#5C6776;margin-top:10px;line-height:1.5;">${escHtml(model.otpCode.ttlNote)}</div>
                </td>
              </tr>
            </table>` : ''}

            ${model.securityNotice ? `
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0;background-color:#F7F4EC;border:1px solid #DED8CA;border-left:4px solid #0E1B2C;border-radius:4px;">
              <tr>
                <td style="padding:14px 16px;">
                  <div style="font-size:13px;font-weight:700;color:#0E1B2C;margin-bottom:4px;">${escHtml(model.securityNotice.title)}</div>
                  <div style="font-size:13px;line-height:1.58;color:#394656;">${escHtml(model.securityNotice.body)}</div>
                </td>
              </tr>
            </table>` : ''}

            ${model.callouts.map((c) => {
              const st = toneColors[c.tone];
              return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0;background-color:${st.bg};border:1px solid #E5E0D4;border-left:4px solid ${st.border};border-radius:4px;">
                <tr><td style="padding:12px 16px;">
                  <div style="font-size:13px;font-weight:700;color:${st.title};margin-bottom:4px;">${escHtml(c.title)}</div>
                  <div style="font-size:13px;line-height:1.56;color:#2C3A4B;">${escHtml(c.body)}</div>
                </td></tr>
              </table>`;
            }).join('')}

            ${model.kvRows.length ? `
            <div style="margin:22px 0 8px 0;font-size:12px;font-weight:700;letter-spacing:1.1px;text-transform:uppercase;color:#8A621C;">${escHtml(model.kvTitle ?? 'Thông tin chi tiết')}</div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #E3DECFE6;border-collapse:collapse;margin-bottom:18px;">
              ${model.kvRows.filter(([, v]) => v !== '' && v !== undefined).map(([k, v], i) => `
              <tr style="background-color:${i % 2 === 0 ? '#FAF8F3' : '#FFFFFF'};">
                <td width="38%" valign="top" style="padding:9px 12px;border-bottom:1px solid #EAE5D9;font-size:13px;color:#5C6776;">${escHtml(k)}</td>
                <td width="62%" valign="top" style="padding:9px 12px;border-bottom:1px solid #EAE5D9;font-size:13px;font-weight:600;color:#14202E;">${escHtml(v)}</td>
              </tr>`).join('')}
            </table>` : ''}

            ${model.tables.map((t) => {
              const rightSet = new Set(t.alignRightCols ?? []);
              return `
              <div style="margin:20px 0 8px 0;font-size:12px;font-weight:700;letter-spacing:1.1px;text-transform:uppercase;color:#8A621C;">${escHtml(t.heading)}</div>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #DED8CA;border-collapse:collapse;margin-bottom:18px;">
                <tr style="background-color:#0E1B2C;">
                  ${t.headers.map((h, ci) => `<th align="${rightSet.has(ci) ? 'right' : 'left'}" style="padding:8px 10px;font-size:11px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;color:#FFFFFF;border-bottom:2px solid #C8963E;">${escHtml(h)}</th>`).join('')}
                </tr>
                ${t.rows.map((r, ri) => `
                <tr style="background-color:${ri % 2 === 1 ? '#FAF8F3' : '#FFFFFF'};">
                  ${r.map((cell, ci) => `<td align="${rightSet.has(ci) ? 'right' : 'left'}" valign="top" style="padding:8px 10px;font-size:12.5px;line-height:1.48;color:#14202E;border-bottom:1px solid #EAE5D9;">${escHtml(cell)}</td>`).join('')}
                </tr>`).join('')}
              </table>`;
            }).join('')}

            ${model.qrCard ? `
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;background-color:#FAF8F3;border:1px solid #D8C39A;border-radius:6px;">
              <tr>
                <td align="center" style="padding:20px 16px;">
                  <div style="font-size:11px;font-weight:700;letter-spacing:1.3px;text-transform:uppercase;color:#8A621C;margin-bottom:10px;">Mã QR Check-in tại Quầy Lễ tân</div>
                  <img src="cid:${escHtml(model.qrCard.cid)}" alt="QR ${escHtml(model.qrCard.code)}" width="176" height="176" style="display:block;margin:0 auto;border:1px solid #DED8CA;border-radius:6px;background-color:#FFFFFF;padding:6px;" />
                  <div style="font-family:'Courier New',Consolas,monospace;font-size:16px;font-weight:700;color:#0E1B2C;margin-top:10px;letter-spacing:1px;">${escHtml(model.qrCard.code)}</div>
                  ${model.qrCard.subcaption ? `<div style="font-size:12.5px;font-weight:600;color:#2C3A4B;margin-top:2px;">${escHtml(model.qrCard.subcaption)}</div>` : ''}
                  <div style="font-size:12px;color:#5C6776;margin-top:6px;max-width:440px;line-height:1.5;">${escHtml(model.qrCard.caption)}</div>
                </td>
              </tr>
            </table>` : ''}

            ${previewRows.length ? `
            <div style="margin:20px 0 8px 0;font-size:12px;font-weight:700;letter-spacing:1.1px;text-transform:uppercase;color:#8A621C;">Hình ảnh thực tế đính kèm</div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px;">
              ${previewRows.map((pair) => `
              <tr>
                ${pair.map((p) => `
                <td width="50%" valign="top" style="padding:4px;">
                  <div style="border:1px solid #DED8CA;border-radius:5px;background-color:#FAF8F3;padding:8px;">
                    <img src="cid:${escHtml(p.cid)}" alt="${escHtml(p.caption ?? p.filename)}" width="260" style="width:100%;max-width:260px;height:auto;display:block;border-radius:4px;" />
                    <div style="font-size:11.5px;font-weight:600;color:#14202E;padding-top:6px;">${escHtml(p.caption ?? p.filename)}</div>
                    <div style="font-size:11px;color:#6B7788;">${escHtml(p.filename)}</div>
                  </div>
                </td>`).join('')}
                ${pair.length === 1 ? '<td width="50%" style="padding:4px;">&nbsp;</td>' : ''}
              </tr>`).join('')}
            </table>` : ''}

            ${model.attachments.length ? `
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0;background-color:#F6F4EE;border:1px solid #DED8CA;border-radius:5px;">
              <tr>
                <td style="padding:14px 16px;">
                  <div style="font-size:12px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;color:#0E1B2C;margin-bottom:8px;">Tài liệu &amp; Hình ảnh đính kèm (${model.attachments.length} tệp)</div>
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                    ${model.attachments.map((a) => `
                    <tr>
                      <td style="padding:4px 0;font-size:12.5px;color:#14202E;">
                        <span style="display:inline-block;background-color:#0E1B2C;color:#DDB065;font-size:10px;font-weight:700;padding:2px 6px;border-radius:3px;margin-right:8px;letter-spacing:0.5px;">${escHtml(attachmentTypeLabel(a))}</span>
                        <span style="font-weight:600;">${escHtml(a.filename)}</span>
                      </td>
                      <td align="right" style="padding:4px 0;font-size:12px;color:#5C6776;white-space:nowrap;">${escHtml(formatBytes(a.content.length))}</td>
                    </tr>`).join('')}
                  </table>
                </td>
              </tr>
            </table>` : ''}

            ${model.cta?.url ? `
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 12px 0;">
              <tr>
                <td align="center" style="background-color:#0E1B2C;border-radius:5px;border-bottom:2px solid #C8963E;">
                  <a href="${escHtml(model.cta.url)}" target="_blank" style="display:inline-block;padding:12px 24px;color:#FFFFFF;font-size:14px;font-weight:700;text-decoration:none;letter-spacing:0.3px;">${escHtml(model.cta.label)}</a>
                </td>
              </tr>
            </table>
            <div style="font-size:11.5px;color:#6B7788;line-height:1.5;word-break:break-all;">Hoặc truy cập trực tiếp liên kết: <a href="${escHtml(model.cta.url)}" style="color:#1E4672;text-decoration:underline;">${escHtml(model.cta.url)}</a></div>` : ''}
          </td>
        </tr>
        <tr>
          <td style="background-color:#EFECE3;border-top:1px solid #DED8CA;padding:20px 28px;font-size:12px;line-height:1.6;color:#4C5968;">
            <div style="font-weight:700;color:#0E1B2C;font-size:13px;margin-bottom:4px;">${escHtml(footer.name)}</div>
            <div>Địa chỉ: ${escHtml(footer.address)}</div>
            <div>Điện thoại / Hotline: <strong>${escHtml(footer.phone || footer.hotline || '1900 6868')}</strong> · Email hỗ trợ: <a href="mailto:${escHtml(footer.email || 'support@zermango.com')}" style="color:#0E1B2C;text-decoration:underline;">${escHtml(footer.email || 'support@zermango.com')}</a></div>
            ${footer.officeHours ? `<div>Giờ văn phòng: ${escHtml(footer.officeHours)} · Giờ ra vào kho: ${escHtml(footer.accessHours ?? '06:00 – 22:00')}</div>` : ''}
            <div style="margin-top:10px;padding-top:10px;border-top:1px solid #DCD6C8;font-size:11.5px;color:#6B7788;">
              Đây là thông báo giao dịch điện tử từ hệ thống ${escHtml(config.brandName)}. Quý khách có thể quản lý tùy chọn nhận thông báo tại mục <a href="${escHtml(config.appOrigin)}/app/account" style="color:#0E1B2C;text-decoration:underline;">Tài khoản</a>.
            </div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

export function renderEmailText(model: EmailComposeModel): string {
  const isOtp = Boolean(model.otpCode);
  const greetName = (model.userFullName ?? '').trim() || 'Quý khách';
  const lines: string[] = [
    `${config.brandName.toUpperCase()} — ${model.categoryBadge}${model.referenceCode ? ` (${model.referenceCode})` : ''}`,
    '='.repeat(60),
    sanitizePinLeak(model.title, isOtp),
    '',
    `Xin chào ${greetName},`,
    '',
  ];
  model.leadParagraphs.forEach((p, idx) => {
    const clean = sanitizePinLeak(p.trim(), isOtp);
    lines.push(idx === 0 ? clean.replace(/^Xin\s+chào\s+[^,.!\n]+[,.!]?\s*/i, '') : clean, '');
  });
  if (model.contextNote) lines.push(model.contextNote, '');
  if (model.otpCode) lines.push(`[${model.otpCode.label ?? 'MÃ OTP'}]: ${model.otpCode.code}`, model.otpCode.ttlNote, '');
  if (model.securityNotice) lines.push(`[BẢO MẬT] ${model.securityNotice.title}: ${model.securityNotice.body}`, '');
  for (const c of model.callouts) lines.push(`[${c.title}] ${c.body}`, '');
  if (model.kvRows.length) {
    lines.push(`--- ${model.kvTitle ?? 'THÔNG TIN CHI TIẾT'} ---`);
    for (const [k, v] of model.kvRows) if (v) lines.push(`- ${k}: ${v}`);
    lines.push('');
  }
  for (const t of model.tables) {
    lines.push(`--- ${t.heading.toUpperCase()} ---`, t.headers.join(' | '));
    for (const r of t.rows) lines.push(r.join(' | '));
    lines.push('');
  }
  if (model.qrCard) lines.push(`Mã QR Check-in: ${model.qrCard.code} — ${model.qrCard.caption}`, '');
  if (model.attachments.length) {
    lines.push(`--- TÀI LIỆU & HÌNH ẢNH ĐÍNH KÈM (${model.attachments.length} TỆP) ---`);
    for (const a of model.attachments) lines.push(`* ${a.filename} (${formatBytes(a.content.length)})`);
    lines.push('');
  }
  if (model.cta?.url) lines.push(`${model.cta.label}: ${model.cta.url}`, '');
  if (model.facilityFooter) {
    lines.push('---', `${model.facilityFooter.name} — ${model.facilityFooter.address}`, `Hotline: ${model.facilityFooter.phone || model.facilityFooter.hotline || '1900 6868'} | Email: ${model.facilityFooter.email || 'support@zermango.com'}`);
  }
  return lines.join('\n');
}
