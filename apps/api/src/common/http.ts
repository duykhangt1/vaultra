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
