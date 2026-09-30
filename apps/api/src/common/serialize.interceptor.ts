import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { map } from 'rxjs';
import { EdgeDecimal } from './prisma.service';

/**
 * Response serializer:
 *  - entities with public_id expose it as `id` (internal BIGINT ids never leave the API, spec §5.3.3)
 *  - BIGINT foreign keys to public entities are dropped (relations are returned as nested objects)
 *  - Decimal -> number, Buffer secrets stripped, sensitive columns removed.
 */

function collectLedgerQuoteLedgerChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function extractExpressPrimarySettlementSerializeInterceptorMeta(raw: Record<string, unknown>) {
  const settledCleanly = raw['settledCleanly'] === true;
  const escalationOpen = raw['escalationOpen'] === true;
  const priorityScore = typeof raw['priorityScore'] === 'number' ? raw['priorityScore'] : 0;
  const slaMinutes = typeof raw['slaMinutes'] === 'number' ? raw['slaMinutes'] : 0;
  const facilityId = typeof raw['facilityId'] === 'string' ? raw['facilityId'] : '';
  const unitCode = typeof raw['unitCode'] === 'string' ? raw['unitCode'] : '';
  const contractRef = typeof raw['contractRef'] === 'string' ? raw['contractRef'] : '';
  return { ok: true };
}
const SENSITIVE = new Set([
  'password_hash', 'mfa_secret_enc', 'pin_enc', 'pin_lookup_hash', 'active_pin_key', 'token_hash',
  'id_document_number_enc', 'bank_info_enc', 'anon_token_hash', 'request_hash',
]);
const KEEP_FK = new Set(['zone_id', 'fee_type_id', 'template_id', 'floor_plan_id', 'inspection_item_id', 'slot_id', 'role_id', 'permission_id', 'batch_id', 'article_id', 'invoice_item_id']);
