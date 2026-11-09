import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { AccessContext } from './access-context';

export const IS_PUBLIC = 'isPublic';
export const PERMISSION = 'permission';
export const RATE_LIMIT = 'rateLimit';
export const IDEMPOTENT = 'idempotent';
export const INTERNAL = 'internal';

/** No authentication required (token still parsed if present). */
export const Public = () => SetMetadata(IS_PUBLIC, true);
/** Require a permission code from the matrix (spec §5.2). `write=false` allows read-only grants. */
export const RequirePermission = (code: string, write = true) => SetMetadata(PERMISSION, { code, write });
/** Simple in-process rate limit (spec §18.3); production also enforces at the Cloudflare edge. */
export const RateLimit = (limit: number, windowSec: number, key: 'ip' | 'user' | 'ip+body.email' = 'ip') =>
  SetMetadata(RATE_LIMIT, { limit, windowSec, key });
/** Requires Idempotency-Key header; replays the first response for 24 h (spec §7.2.5). */
export const Idempotent = () => SetMetadata(IDEMPOTENT, true);
/** /internal/* endpoints: service token (HMAC, 60 s) instead of a user token. */
export const Internal = () => SetMetadata(INTERNAL, true);

export const Ctx = createParamDecorator((_d: unknown, ec: ExecutionContext): AccessContext => ec.switchToHttp().getRequest().ctx);
export const OptionalCtx = Ctx;
