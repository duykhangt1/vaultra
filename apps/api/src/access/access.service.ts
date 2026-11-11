import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService, Tx } from '../common/prisma.service';
import { AppError, notFound, validation } from '../common/errors';
import { decryptField, encryptField, newId, pinLookupHash } from '../common/util';
import { CoreService } from '../domain/core.service';
import { NotificationService } from '../notifications/notification.service';
import { AuditService } from '../audit/audit.service';
import type { AccessContext } from '../auth/access-context';
import { Prisma } from '../generated/prisma/client';

type CredType = Prisma.AccessCredentialCreateInput['type'];

/**
 * Access control (spec module 18): issue/revoke/rotate locks, cards and 6-digit gate PINs.
 * PINs are AES-256-GCM encrypted, unique among ACTIVE/SUSPENDED credentials of a facility through
 * the generated `active_pin_key` UNIQUE column, never emailed, and every reveal is audited.
 * AccessControlProvider is simulated (POST /access/simulate) until smart locks are integrated.
 */
@Injectable()
export class AccessService {
  constructor(private prisma: PrismaService, private core: CoreService, private notify: NotificationService, private audit: AuditService) {}

  async issue(tx: Tx, contractId: bigint, type: CredType, opts: { identifier?: string | null; holderName?: string; holderType?: 'TENANT' | 'AUTHORIZED_USER'; actor: bigint | null; validFrom?: Date }) {
    const c = await tx.contract.findUniqueOrThrow({ where: { id: contractId }, include: { customer: true } });
    const validTo = c.current_end_date;
    const base = {
      contract_id: c.id, facility_id: c.facility_id, holder_type: opts.holderType ?? 'TENANT', holder_name: (opts.holderName ?? c.customer.full_name).slice(0, 150), type,
      status: 'ACTIVE' as const, valid_from: opts.validFrom ?? this.core.now(), valid_to: validTo, issued_by: opts.actor, issued_at: this.core.now(),
    };
    if (type !== 'PIN_CODE') {
      if (!opts.identifier && type !== 'CUSTOMER_LOCK') throw validation('Nhập số serial khóa / số thẻ', [{ field: 'identifier', message: 'required' }]);
      if (opts.identifier && type === 'ACCESS_CARD') {
        const dup = await tx.accessCredential.findFirst({ where: { facility_id: c.facility_id, type, identifier: opts.identifier, status: { in: ['ACTIVE', 'SUSPENDED'] } } });
        if (dup) throw new AppError('CONFLICT', `Thẻ ${opts.identifier} đang được sử dụng`);
      }
      return tx.accessCredential.create({ data: { ...base, public_id: newId(), identifier: opts.identifier ?? 'Khóa riêng của khách' } });
    }
    for (let attempt = 0; attempt < 8; attempt++) {
      const pin = String(crypto.randomInt(100000, 1000000));
      const hash = pinLookupHash(c.facility_id, pin);
      const clash = await tx.accessCredential.findUnique({ where: { active_pin_key: hash } });
      if (clash) continue;
      return tx.accessCredential.create({ data: { ...base, public_id: newId(), identifier: null, pin_enc: encryptField(pin), pin_lookup_hash: hash } });
    }
    throw new AppError('CONFLICT', 'Không sinh được mã PIN duy nhất, vui lòng thử lại');
  }

  list(contractId: bigint) {
    return this.prisma.accessCredential.findMany({ where: { contract_id: contractId }, orderBy: [{ status: 'asc' }, { issued_at: 'desc' }] });
  }

  /** OPEN / CLOSED from the unit's latest open/close event (a unit nobody opened is closed). */
  async lockState(unitId: bigint | null) {
    if (!unitId) return { state: 'CLOSED' as const, at: null };
    const last = await this.prisma.accessEvent.findFirst({ where: { unit_id: unitId, event: { in: ['UNIT_OPEN', 'UNIT_CLOSE'] } }, orderBy: { id: 'desc' } });
    return { state: last?.event === 'UNIT_OPEN' ? ('OPEN' as const) : ('CLOSED' as const), at: last?.occurred_at ?? null };
  }

  /** GET /contracts/:id/access — PIN decrypted only for the tenant (and facility staff), audited. */
  async forContract(ctx: AccessContext, contractId: bigint, reveal: boolean) {
    const c = await this.prisma.contract.findUniqueOrThrow({ where: { id: contractId } });
    ctx.assertScope('access.manage', c, 'Hợp đồng', false);
    const creds = await this.list(contractId);
    const delinquent = ['LOCKED_OUT', 'FINAL_NOTICE', 'DEFAULT_PENDING', 'DEFAULTED'].includes(c.delinquency_status);
    const out = [];
    for (const cr of creds) {
      let pin: string | null = null;
      if (reveal && cr.type === 'PIN_CODE' && cr.pin_enc && cr.status === 'ACTIVE') {
        try {
          pin = decryptField(cr.pin_enc);
        } catch {
          pin = null; // sealed with a key we no longer hold (seed data / key rotation): hide it, the tenant can rotate the PIN
        }
        if (pin) await this.audit.log(ctx, { action: 'access.pin_viewed', entityType: 'access_credential', entityId: cr.id, entityRef: cr.public_id, facilityId: cr.facility_id, category: 'SECURITY' });
      }
      out.push({ ...cr, pin, masked: cr.type === 'PIN_CODE' ? '••••••' : cr.identifier });
    }
    return { credentials: out, suspended: delinquent, lock: await this.lockState(c.unit_id) };
  }

  async rotatePin(ctx: AccessContext, contractId: bigint) {
    ctx.require('access.manage');
    const c = await this.prisma.contract.findUniqueOrThrow({ where: { id: contractId }, include: { unit: true } });
    ctx.assertScope('access.manage', c, 'Hợp đồng', true);
    if (!['ACTIVE', 'MOVE_OUT_SCHEDULED', 'EXPIRED'].includes(c.status)) throw new AppError('INVALID_STATUS_TRANSITION', 'Hợp đồng không còn hiệu lực');
    if (['LOCKED_OUT', 'FINAL_NOTICE', 'DEFAULT_PENDING', 'DEFAULTED'].includes(c.delinquency_status)) throw new AppError('CONFLICT', 'Truy cập đang bị tạm khóa do quá hạn thanh toán — vui lòng thanh toán để mở lại');
    return this.prisma.tx(async (tx) => {
      const old = await tx.accessCredential.findMany({ where: { contract_id: c.id, type: 'PIN_CODE', status: { in: ['ACTIVE', 'SUSPENDED'] }, holder_type: 'TENANT' } });
      for (const o of old) await tx.accessCredential.update({ where: { id: o.id }, data: { status: 'REVOKED', revoked_at: this.core.now(), revoked_by: ctx.userId, status_reason: 'Đổi PIN' } });
      const fresh = await this.issue(tx, c.id, 'PIN_CODE', { actor: ctx.userId });
      await this.audit.log(ctx, { action: 'access.pin_rotated', entityType: 'contract', entityId: c.id, entityRef: c.code, facilityId: c.facility_id, category: 'SECURITY' }, tx);
      const uid = await this.core.customerUser(tx, c.customer_id);
      if (uid) await this.notify.notify({ users: [uid], event: 'access.changed', vars: { unitCode: c.unit.code, change: 'đã đổi mã PIN cổng' }, link: `/app/contracts/${c.public_id}`, email: false }, tx);
      return { id: fresh.public_id, status: fresh.status, pin: fresh.pin_enc ? decryptField(fresh.pin_enc) : null };
    });
  }

  async revoke(ctx: AccessContext, credPublicId: string, reason: string, lost = false) {
    const cr = await this.prisma.accessCredential.findUnique({ where: { public_id: credPublicId }, include: { contract: { include: { unit: true } } } });
    if (!cr) throw notFound('Phương tiện truy cập');
    const g = ctx.assertScope('access.manage', { facility_id: cr.facility_id, customer_id: cr.contract.customer_id }, 'Phương tiện truy cập', true);
    if (g.scope === 'OWN' && !lost) throw notFound('Phương tiện truy cập');
    if (!['ACTIVE', 'SUSPENDED'].includes(cr.status)) throw new AppError('INVALID_STATUS_TRANSITION', 'Phương tiện truy cập đã bị thu hồi');
    return this.prisma.tx(async (tx) => {
      const u = await tx.accessCredential.update({ where: { id: cr.id }, data: { status: lost ? 'LOST' : 'REVOKED', revoked_at: this.core.now(), revoked_by: ctx.userId, status_reason: reason.slice(0, 255) } });
      await this.audit.log(ctx, { action: lost ? 'access.reported_lost' : 'access.revoke', entityType: 'access_credential', entityId: cr.id, entityRef: cr.public_id, facilityId: cr.facility_id, reason, category: 'SECURITY' }, tx);
      const uid = await this.core.customerUser(tx, cr.contract.customer_id);
      if (uid) await this.notify.notify({ users: [uid], event: 'access.changed', vars: { unitCode: cr.contract.unit.code, change: lost ? `báo mất ${cr.type === 'ACCESS_CARD' ? 'thẻ' : 'khóa'} ${cr.identifier ?? ''}` : `thu hồi ${cr.type}` }, link: `/app/units/${cr.contract.public_id}` }, tx);
      return u;
    });
  }

  async suspendAll(tx: Tx, contractId: bigint, reason: string) {
    return tx.accessCredential.updateMany({ where: { contract_id: contractId, status: 'ACTIVE' }, data: { status: 'SUSPENDED', status_reason: reason.slice(0, 255) } });
  }
  async restoreAll(tx: Tx, contractId: bigint) {
    return tx.accessCredential.updateMany({ where: { contract_id: contractId, status: 'SUSPENDED' }, data: { status: 'ACTIVE', status_reason: 'Khôi phục sau thanh toán' } });
  }
  async revokeAll(tx: Tx, contractId: bigint, actor: bigint | null, reason: string) {
    return tx.accessCredential.updateMany({ where: { contract_id: contractId, status: { in: ['ACTIVE', 'SUSPENDED'] } }, data: { status: 'REVOKED', revoked_at: this.core.now(), revoked_by: actor, status_reason: reason.slice(0, 255) } });
  }
  async extend(tx: Tx, contractId: bigint, validTo: Date | null) {
    return tx.accessCredential.updateMany({ where: { contract_id: contractId, status: { in: ['ACTIVE', 'SUSPENDED'] } }, data: { valid_to: validTo } });
  }

  /** Gate simulator: validates a PIN at a facility and records access_events (GATE_ENTRY / DENIED). */
  async simulateGate(facilityPublicId: string, pin: string) {
    const f = await this.core.facilityByPublic(facilityPublicId);
    const hash = pinLookupHash(f.id, pin);
    const cr = await this.prisma.accessCredential.findUnique({ where: { active_pin_key: hash }, include: { contract: true } });
    const now = this.core.now();
    let denied: string | null = null;
    if (!cr) denied = 'UNKNOWN_PIN';
    else if (cr.status !== 'ACTIVE') denied = cr.status === 'SUSPENDED' ? 'SUSPENDED_OVERDUE' : cr.status;
    else if (cr.valid_to && cr.valid_to < now && !cr.contract.is_holdover) denied = 'EXPIRED';
    await this.prisma.accessEvent.create({ data: { facility_id: f.id, credential_id: cr?.id ?? null, unit_id: cr?.contract.unit_id ?? null, event: denied ? 'DENIED' : 'GATE_ENTRY', deny_reason: denied, occurred_at: now, source: 'SIMULATOR' } });
    return { granted: !denied, reason: denied };
  }

  /**
   * Remote unlock: the tenant opens their own unit from the web. Same rules as the gate - the contract must be ACTIVE,
   * its credentials not suspended for arrears and not expired. Writes an UNIT_OPEN (or DENIED) access event and an audit entry.
   */
  async remoteUnlock(ctx: AccessContext, contractId: bigint) {
    const c = await this.prisma.contract.findUniqueOrThrow({ where: { id: contractId }, include: { unit: true } });
    ctx.assertScope('access.manage', c, 'Hợp đồng', true);
    const now = this.core.now();
    const creds = await this.prisma.accessCredential.findMany({ where: { contract_id: c.id, status: { in: ['ACTIVE', 'SUSPENDED'] } }, orderBy: { id: 'desc' } });
    const live = creds.find((x) => x.status === 'ACTIVE');
    let denied: string | null = null;
    if (c.status !== 'ACTIVE') denied = 'CONTRACT_NOT_ACTIVE';
    else if (!live) denied = creds.length ? 'SUSPENDED_OVERDUE' : 'NO_CREDENTIAL';
    else if (live.valid_to && live.valid_to < now && !c.is_holdover) denied = 'EXPIRED';
    await this.prisma.accessEvent.create({ data: { facility_id: c.facility_id, credential_id: live?.id ?? creds[0]?.id ?? null, unit_id: c.unit_id, event: denied ? 'DENIED' : 'UNIT_OPEN', deny_reason: denied, occurred_at: now, source: 'SIMULATOR' } });
    await this.audit.log(ctx, { action: denied ? 'access.remote_unlock_denied' : 'access.remote_unlock', entityType: 'contract', entityId: c.id, entityRef: c.code, facilityId: c.facility_id, reason: denied ?? undefined, category: 'SECURITY' });
    if (denied) {
      const msg: Record<string, string> = { CONTRACT_NOT_ACTIVE: 'Hợp đồng không ở trạng thái hiệu lực', SUSPENDED_OVERDUE: 'Quyền truy cập đang bị tạm khóa do hóa đơn quá hạn', NO_CREDENTIAL: 'Hợp đồng chưa có phương tiện truy cập', EXPIRED: 'Quyền truy cập đã hết hạn' };
      throw new AppError('FORBIDDEN', msg[denied] ?? 'Không thể mở kho', { reason: denied });
    }
    return { state: 'OPEN' as const, unit: c.unit.code, at: now.toISOString() };
  }

  /** Remote lock: closes the unit again; allowed even when access is suspended so a tenant can always secure their unit. */
  async remoteLock(ctx: AccessContext, contractId: bigint) {
    const c = await this.prisma.contract.findUniqueOrThrow({ where: { id: contractId }, include: { unit: true } });
    ctx.assertScope('access.manage', c, 'Hợp đồng', true);
    const now = this.core.now();
    const cur = await this.lockState(c.unit_id);
    if (cur.state === 'OPEN') {
      const cred = await this.prisma.accessCredential.findFirst({ where: { contract_id: c.id, status: { in: ['ACTIVE', 'SUSPENDED'] } }, orderBy: { id: 'desc' } });
      await this.prisma.accessEvent.create({ data: { facility_id: c.facility_id, credential_id: cred?.id ?? null, unit_id: c.unit_id, event: 'UNIT_CLOSE', occurred_at: now, source: 'SIMULATOR' } });
      await this.audit.log(ctx, { action: 'access.remote_lock', entityType: 'contract', entityId: c.id, entityRef: c.code, facilityId: c.facility_id, category: 'SECURITY' });
    }
    return { state: 'CLOSED' as const, unit: c.unit.code, at: now.toISOString() };
  }
}
