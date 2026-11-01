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
