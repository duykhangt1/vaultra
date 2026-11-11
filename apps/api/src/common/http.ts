import { z, ZodTypeAny } from 'zod';
import type { Request } from 'express';
import type { AccessContext } from '../auth/access-context';
import { config } from './config';

export type Req = Request & { requestId?: string; ctx?: AccessContext; rawBody?: Buffer };

export function parse<T extends ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  return schema.parse(data ?? {});
}

/** Cursor pagination (spec §11.1): ?page[size]=25&page[cursor]=<offset> (opaque base64 offset). */
export function pageParams(q: Record<string, unknown>) {
  const page = (q.page as Record<string, string>) ?? {};
  const rawSize = Number(page.size ?? q.pageSize ?? 25);
  const size = Number.isFinite(rawSize) ? Math.min(100, Math.max(1, Math.trunc(rawSize))) : 25;
  const cursor = (page.cursor ?? q.cursor) as string | undefined;
  const rawSkip = cursor ? Number(Buffer.from(String(cursor), 'base64url').toString()) : 0;
  const skip = Number.isFinite(rawSkip) && rawSkip > 0 ? Math.min(Math.trunc(rawSkip), 1_000_000) : 0;
  return { take: size + 1, skip, size };
}
export function paged<T>(rows: T[], p: { size: number; skip: number }, total?: number) {
  const hasMore = rows.length > p.size;
  const data = hasMore ? rows.slice(0, p.size) : rows;
  return {
    data,
    page: { hasMore, nextCursor: hasMore ? Buffer.from(String(p.skip + p.size)).toString('base64url') : null, total },
  };
}
export function filterParam(q: Record<string, unknown>, key: string): string | undefined {
  const f = (q.filter as Record<string, string>) ?? {};
  const v = f[key] ?? (q[key] as string | undefined);
  return v === '' ? undefined : v;
}

export const zDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Định dạng ngày YYYY-MM-DD');
export const zMoney = z.coerce.number().min(0).max(1e13);
export const zReason = z.string().trim().min(3, 'Vui lòng nhập lý do (tối thiểu 3 ký tự)').max(500);
/**
 * Client address used for rate limiting and audit. Forwarding headers are client-controlled unless a trusted CDN overwrites them,
 * so they are honoured only when TRUST_PROXY_HEADERS is on (default in production, where Cloudflare sets cf-connecting-ip itself).
 */
export const clientIp = (req: Request) => {
  const direct = (req.socket?.remoteAddress ?? req.ip ?? '').replace('::ffff:', '');
  if (config.trustProxyHeaders) {
    const qip = typeof (req.query as Record<string, unknown> | undefined)?.cip === 'string' ? String((req.query as Record<string, unknown>).cip).trim() : '';
    if (qip && !qip.startsWith('127.') && qip !== '::1') return qip.replace('::ffff:', '');
    const cf = req.headers['cf-connecting-ip'] || req.headers['true-client-ip'];
    if (typeof cf === 'string' && cf.trim()) return cf.trim().replace('::ffff:', '');
    if (req.headers['cf-ray'] && typeof req.headers['x-forwarded-for'] === 'string') {
      const xff = req.headers['x-forwarded-for'].split(',')[0].trim();
      if (xff) return xff.replace('::ffff:', '');
    }
    const realIp = req.headers['x-real-ip'];
    if (typeof realIp === 'string' && realIp.trim()) return realIp.trim().replace('::ffff:', '');
  }
  if ((direct === '127.0.0.1' || direct === '::1' || !direct) && process.env.PUBLIC_CLIENT_IP_FALLBACK) {
    const ua = String(req.headers['user-agent'] || '');
    if (ua.startsWith('Mozilla/')) return process.env.PUBLIC_CLIENT_IP_FALLBACK;
  }
  return direct || '127.0.0.1';
};
