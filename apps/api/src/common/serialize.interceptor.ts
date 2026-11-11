import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { map } from 'rxjs';
import { EdgeDecimal } from './prisma.service';

/**
 * Response serializer:
 *  - entities with public_id expose it as `id` (internal BIGINT ids never leave the API, spec §5.3.3)
 *  - BIGINT foreign keys to public entities are dropped (relations are returned as nested objects)
 *  - Decimal -> number, Buffer secrets stripped, sensitive columns removed.
 */
const SENSITIVE = new Set([
  'password_hash', 'mfa_secret_enc', 'pin_enc', 'pin_lookup_hash', 'active_pin_key', 'token_hash',
  'id_document_number_enc', 'bank_info_enc', 'anon_token_hash', 'request_hash',
]);
const KEEP_FK = new Set(['zone_id', 'fee_type_id', 'template_id', 'floor_plan_id', 'inspection_item_id', 'slot_id', 'role_id', 'permission_id', 'batch_id', 'article_id', 'invoice_item_id']);

export function serialize(v: unknown, depth = 0): unknown {
  if (depth > 12) return null;
  if (v === null || v === undefined) return v;
  if (typeof v === 'bigint') return v.toString();
  if (v instanceof Date) return v.toISOString();
  if (EdgeDecimal.isDecimal(v)) return Number((v as EdgeDecimal).toString());
  if (Buffer.isBuffer(v) || v instanceof Uint8Array) return undefined;
  if (Array.isArray(v)) return v.map((x) => serialize(x, depth + 1));
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    const hasPublic = typeof o.public_id === 'string';
    for (const [k, val] of Object.entries(o)) {
      if (SENSITIVE.has(k)) continue;
      if (k === 'public_id') continue;
      if (k === 'id' && hasPublic) continue;
      if (k.endsWith('_id') && typeof val === 'bigint' && !KEEP_FK.has(k)) continue;
      if ((k === 'created_by' || k === 'updated_by' || k.endsWith('_by')) && typeof val === 'bigint') continue;
      const s = serialize(val, depth + 1);
      if (s !== undefined) out[k] = s;
    }
    if (hasPublic) out.id = o.public_id;
    return out;
  }
  return v;
}

@Injectable()
export class SerializeInterceptor implements NestInterceptor {
  intercept(_ctx: ExecutionContext, next: CallHandler) {
    return next.handle().pipe(map((data) => serialize(data)));
  }
}
