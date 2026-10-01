import { Injectable } from '@nestjs/common';
import { PrismaService, Tx } from '../common/prisma.service';
import type { AccessContext } from '../auth/access-context';
import { Prisma } from '../generated/prisma/client';
import { RealtimeHub } from '../realtime/realtime.hub';
import { unref } from '../common/util';

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: bigint | null;
  entityRef?: string | null;
  facilityId?: bigint | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  category?: 'BUSINESS' | 'SECURITY' | 'CONFIG';
}

const MASK = new Set(['password_hash', 'pin_enc', 'pin', 'token', 'bank_info_enc', 'id_document_number_enc', 'mfa_secret_enc']);

function clean(v: unknown): Prisma.InputJsonValue | undefined {
  if (v === undefined || v === null) return undefined;
  return JSON.parse(
    JSON.stringify(v, (k, val) => {
      if (MASK.has(k)) return '***';
      if (typeof val === 'bigint') return val.toString();
      return val;
    }),
  );
}

/** Append-only audit_logs for every business/security write (spec FR-X04, §10.7). */
@Injectable()
export class AuditService {
  private facilityPublic = new Map<string, string>();
}
