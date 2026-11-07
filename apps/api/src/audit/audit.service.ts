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
  constructor(private prisma: PrismaService, private hub: RealtimeHub) {}

  /** Tells connected clients of a facility that data changed (ids only, spec §18.6) so open screens refetch. */
  private emit(facilityId: bigint | null | undefined, e: AuditEntry) {
    if (!facilityId || e.category === 'SECURITY') return;
    const key = facilityId.toString();
    unref(setTimeout(async () => {
      try {
        let pub = this.facilityPublic.get(key);
        if (!pub) {
          pub = (await this.prisma.facility.findUnique({ where: { id: facilityId }, select: { public_id: true } }))?.public_id;
          if (pub) this.facilityPublic.set(key, pub);
        }
        if (pub) this.hub.toFacility(pub, { type: 'data.changed', entity: e.entityType, action: e.action });
      } catch { /* realtime is best effort */ }
    }, 400));
  }

  async log(ctx: AccessContext | null, e: AuditEntry, tx?: Tx) {
    const db = tx ?? this.prisma;
    await db.auditLog.create({
      data: {
        actor_user_id: ctx?.userId ?? null,
        actor_role: ctx ? ctx.primaryRole : 'SYSTEM',
        facility_id: e.facilityId ?? null,
        action: e.action,
        entity_type: e.entityType,
        entity_id: e.entityId ?? null,
        entity_ref: e.entityRef ?? null,
        before: clean(e.before),
        after: clean(e.after),
        reason: e.reason ?? null,
        request_id: ctx?.requestId ?? null,
        ip_address: ctx?.ip?.slice(0, 45) ?? null,
        user_agent: ctx?.userAgent?.slice(0, 512) ?? null,
        category: e.category ?? 'BUSINESS',
      },
    });
    this.emit(e.facilityId, e);
  }
}
