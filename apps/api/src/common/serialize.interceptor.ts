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
