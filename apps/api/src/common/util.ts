import { ulid } from 'ulid';
import * as crypto from 'crypto';
import type { Prisma } from '../generated/prisma/client';
import { EdgeDecimal } from './prisma.service';
import type { Tx } from './prisma.service';
import { config } from './config';

export const newId = () => ulid();
/** Node timers can be unref()'d so they never keep the process alive; Workers return a plain number. Works on both. */
export const unref = <T>(t: T): T => { (t as unknown as { unref?: () => void })?.unref?.(); return t; };
export type DecimalValue = string | number | EdgeDecimal | Prisma.Decimal;
export const D = (v: DecimalValue | null | undefined) => new EdgeDecimal(v ?? 0) as unknown as Prisma.Decimal;
export type Dec = Prisma.Decimal;
/** VND rounding: ROUND_HALF_UP to whole đồng (spec §7.2). */
export const vnd = (v: DecimalValue) => new EdgeDecimal(v).toDecimalPlaces(0, EdgeDecimal.ROUND_HALF_UP) as unknown as Prisma.Decimal;
export const num = (v: DecimalValue | null | undefined) => Number(new EdgeDecimal(v ?? 0).toFixed(2));
export const fmtVnd = (v: DecimalValue) => new Intl.NumberFormat('vi-VN').format(Number(v)) + ' ₫';

const PREFIX_DELEGATE: Record<string, string> = {
  RSV: 'reservation',
  INV: 'invoice',
  CT: 'contract',
  RCP: 'payment',
  CN: 'creditNote',
  SR: 'supportTicket',
  WO: 'workOrder',
  CUS: 'customer',
};

/** Business code from `sequences` table: e.g. RSV-2026-000123 (spec §10.1). */
export async function nextCode(tx: Tx, prefix: string, year: number, pad = 6, withYear = true): Promise<string> {
  const delegateName = PREFIX_DELEGATE[prefix];
  const del = delegateName ? (tx as unknown as Record<string, { findUnique?: (args: unknown) => Promise<unknown> }>)[delegateName] : undefined;
  for (let i = 0; i < 500; i++) {
    await tx.$executeRaw`INSERT INTO sequences (name, year, next_value) VALUES (${prefix}, ${year}, 0) ON DUPLICATE KEY UPDATE name = name`;
    await tx.$executeRaw`UPDATE sequences SET next_value = LAST_INSERT_ID(next_value + 1) WHERE name = ${prefix} AND year = ${year}`;
    const rows = await tx.$queryRaw<{ v: bigint }[]>`SELECT LAST_INSERT_ID() AS v`;
    const n = Number(rows[0].v);
    const code = withYear ? `${prefix}-${year}-${String(n).padStart(pad, '0')}` : `${prefix}-${String(n).padStart(pad, '0')}`;
    if (!del?.findUnique) return code;
    const clash = await del.findUnique({ where: { code }, select: { id: true } });
    if (!clash) return code;
  }
  throw new Error(`Không sinh được mã ${prefix} duy nhất`);
}

/** Customer codes come from ONE sequence (counter-created and self-registered customers must never collide on the UNIQUE code). */
export async function nextCustomerCode(tx: Tx): Promise<string> {
  for (let i = 0; i < 100; i++) {
    const code = await nextCode(tx, 'CUS', 0, 6, false);
    const clash = await tx.customer.findUnique({ where: { code }, select: { id: true } });
    if (!clash) return code;
  }
  throw new Error('Không sinh được mã khách hàng duy nhất');
}

// ---------- crypto ----------
export const sha256 = (s: string | Buffer) => crypto.createHash('sha256').update(s).digest('hex');
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
export const hmac = (secret: string, data: string) => crypto.createHmac('sha256', secret).update(data).digest('hex');
export function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

let fieldKey: Buffer | null = null;
export function setFieldKey(k: Buffer) {
  fieldKey = k;
}
/** AES-256-GCM field encryption: [12-byte IV | 16-byte tag | ciphertext]. */
export function encryptField(plain: string): Uint8Array<ArrayBuffer> {
  if (!fieldKey) throw new Error('Field key not initialised');
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', fieldKey, iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return new Uint8Array(Buffer.concat([iv, c.getAuthTag(), enc]));
}
export function decryptField(buf: Uint8Array | Buffer): string {
  if (!fieldKey) throw new Error('Field key not initialised');
  const b = Buffer.from(buf);
  const d = crypto.createDecipheriv('aes-256-gcm', fieldKey, b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
}
export const pinLookupHash = (facilityId: bigint, pin: string) => hmac(config.serviceTokenSecret + ':pin', `${facilityId}:${pin}`);

// ---------- PII masking (spec §5.3.4) ----------
export function maskPhone(p?: string | null) {
  if (!p) return p ?? null;
  return p.length <= 4 ? '****' : p.slice(0, 2) + '*'.repeat(Math.max(2, p.length - 4)) + p.slice(-2);
}
export function maskEmail(e?: string | null) {
  if (!e) return e ?? null;
  const [u, d] = e.split('@');
  return `${u.slice(0, 1)}***@${d}`;
}
export function maskIp(ip?: string | null) {
  if (!ip) return ip ?? null;
  if (ip.includes('.')) return ip.split('.').slice(0, 2).join('.') + '.*.*';
  return ip.split(':').slice(0, 3).join(':') + ':****';
}

export function pick<T extends object, K extends keyof T>(o: T, keys: K[]): Pick<T, K> {
  const r = {} as Pick<T, K>;
  for (const k of keys) if (k in o) r[k] = o[k];
  return r;
}

export function deviceLabel(ua?: string) {
  if (!ua) return 'Thiết bị không xác định';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Trình duyệt';
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'thiết bị';
  return `${browser} trên ${os}`;
}

export function slugifyVi(s: string): string {
  return String(s ?? '')
    .normalize('NFC')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const CANONICAL_PROVINCES: Record<string, string> = {
  'ho-chi-minh': 'TP. Hồ Chí Minh',
  'ha-noi': 'Hà Nội',
  'da-nang': 'Đà Nẵng',
  'hai-phong': 'Hải Phòng',
  'can-tho': 'Cần Thơ',
};

/** Canonicalize Vietnamese province/city display name and URL slug so variants like "TP. Hồ Chí Minh" and "Hồ Chí Minh" never duplicate. */
export function normalizeProvince(rawProvince?: string | null, rawSlug?: string | null): { province: string; provinceSlug: string } {
  const cleaned = String(rawProvince ?? '')
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ');
  const stripped = cleaned.replace(/^(?:thành\s+phố|thanh\s+pho|tp\.?|tỉnh|tinh)\s+/iu, '').trim();
  let slug = slugifyVi(stripped || rawSlug || '');
  slug = slug.replace(/^(?:thanh-pho-|tp-|tinh-)/, '');
  if (slug === 'hcm' || slug === 'tphcm' || slug === 'sai-gon' || slug === 'saigon') {
    slug = 'ho-chi-minh';
  }
  if (!slug && rawSlug) {
    slug = slugifyVi(rawSlug).replace(/^(?:thanh-pho-|tp-|tinh-)/, '');
  }
  const canonicalName = CANONICAL_PROVINCES[slug] || stripped || cleaned;
  return {
    province: canonicalName,
    provinceSlug: slug || 'khac',
  };
}
