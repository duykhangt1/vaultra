import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { AccessContext } from './access-context';

export const IS_PUBLIC = 'isPublic';
export const PERMISSION = 'permission';
export const RATE_LIMIT = 'rateLimit';
export const IDEMPOTENT = 'idempotent';
