import { Injectable } from '@nestjs/common';
import { INSPECTION_ITEMS, INSPECTION_ITEM_LABEL } from '@vaultra/shared';
import { PrismaService, Tx } from '../common/prisma.service';
import { AppError, forbidden, notFound, validation } from '../common/errors';
import { D, decryptField, newId, nextCode, vnd } from '../common/util';
import { addDays, addMonths, diffDays } from '../common/dates';
import { CoreService, fmtD, fmtDT } from '../domain/core.service';
import { ReservationService } from '../reservation/reservation.service';
import { ContractService } from '../contract/contract.service';
import { AccessService } from '../access/access.service';
import { MediaService } from '../media/media.service';
import { PaymentService } from '../billing/payment.service';
import { NotificationService } from '../notifications/notification.service';
import { AuditService } from '../audit/audit.service';
import { EventsService } from '../common/events.service';
import type { AccessContext } from '../auth/access-context';
import { Prisma } from '../generated/prisma/client';

export interface InspectionInput {
  items: { code: string; condition: 'OK' | 'MINOR_ISSUE' | 'DAMAGED' | 'NOT_APPLICABLE'; note?: string; photoIds?: string[] }[];
  overall: 'GOOD' | 'FAIR' | 'DAMAGED';
  notes?: string;
  recordedOffline?: boolean;
}

/**
 * Check-in & handover wizard (spec §6.2, module 17): verify identity → collect move-in dues →
 * sign contract → inspection with photos → issue access → handover signature → atomic completion.
 */
@Injectable()
export class CheckinService {
  constructor(
    private prisma: PrismaService,
    private core: CoreService,
    private reservations: ReservationService,
    private contracts: ContractService,
    private access: AccessService,
    private media: MediaService,
    private payments: PaymentService,
    private notify: NotificationService,
    private audit: AuditService,
    private events: EventsService,
  ) {}

  /** GET /ops/lookup?code= — reservation by code / QR in the staff's facilities. */
  async lookup(ctx: AccessContext, code: string) {
    ctx.require('checkin.perform', false);
    const raw = code.trim();
    const rsvCodeMatch = /\b(RSV-\d{4}-\d+)\b/i.exec(raw);
    const ulidMatch = /\b([0-9A-HJKMNP-TV-Z]{26})\b/i.exec(raw);
    const normalizedCode = (rsvCodeMatch ? rsvCodeMatch[1] : raw).toUpperCase();
    const normalizedId = ulidMatch ? ulidMatch[1].toUpperCase() : raw;
    const r = await this.prisma.reservation.findFirst({
      where: { OR: [{ code: normalizedCode }, { public_id: normalizedId }, { code: raw.toUpperCase() }, { public_id: raw }] },
      include: { customer: true, unit_type: true, facility: true },
    });
    if (!r) throw notFound('Đơn đặt thuê');
    if (ctx.grant('checkin.perform')?.scope === 'FACILITY' && !ctx.facilitiesFor('checkin.perform').includes(r.facility_id)) {
      throw forbidden(`Đơn đặt chỗ ${r.code} thuộc cơ sở ${r.facility.name}. Nhân viên ở cơ sở nào chỉ nhận được đơn hàng của khách hàng tại cơ sở đó.`);
    }
    ctx.assertScope('checkin.perform', r, 'Đơn đặt thuê');
    const pre = await this.preconditions(r.id);
    const sessions = await this.prisma.checkinSession.findMany({ where: { reservation_id: r.id }, orderBy: { id: 'desc' }, take: 1 });
    return { reservation: r, preconditions: pre, activeSession: sessions[0]?.status === 'IN_PROGRESS' ? sessions[0] : null };
  }

  async preconditions(reservationId: bigint) {
    const r = await this.prisma.reservation.findUniqueOrThrow({ where: { id: reservationId }, include: { quote: true, facility: true } });
    const p = await this.core.policyById(r.quote.policy_version_id);
    const alloc = await this.prisma.unitAllocation.findFirst({ where: { reservation_id: r.id, status: 'ACTIVE' }, include: { unit: { include: { zone: true } } } });
    const contract = r.contract_id ? await this.prisma.contract.findUnique({ where: { id: r.contract_id } }) : null;
    const unpaid = await this.prisma.invoice.findMany({ where: { reservation_id: r.id, OR: [{ move_in_due: true }, { type: 'RESERVATION' }], status: { in: ['ISSUED', 'PARTIALLY_PAID'] } } });
    const appt = await this.prisma.appointment.findFirst({ where: { reservation_id: r.id, type: 'MOVE_IN', status: { in: ['BOOKED', 'ARRIVED'] } }, orderBy: { scheduled_start: 'desc' } });
    const windowEnd = addDays(r.start_date, p.move_in_window_days);
    const missing: string[] = [];
    if (!['PENDING_PAYMENT', 'CONFIRMED', 'MOVE_IN_SCHEDULED', 'UNIT_ASSIGNED'].includes(r.status)) missing.push(`STATUS_${r.status}`);
    return {
      ok: missing.length === 0,
      missing,
      unit: alloc?.unit ?? null,
      contractStatus: contract?.status ?? null,
      contractId: contract?.public_id ?? null,
      unpaidMoveIn: unpaid.map((i) => ({ id: i.public_id, code: i.code, type: i.type, balance: Number(D(i.total).sub(i.amount_paid).sub(i.amount_credited)) })),
      appointment: appt,
      window: { from: r.start_date, to: windowEnd },
      minPhotos: p.min_handover_photos,
    };
  }

  private async session(ctx: AccessContext, publicId: string, write = true) {
    const s = await this.prisma.checkinSession.findUnique({ where: { public_id: publicId }, include: { reservation: true } });
    if (!s) throw notFound('Phiên check-in');
    ctx.assertScope('checkin.perform', s.reservation, 'Phiên check-in', write);
    if (write && s.status !== 'IN_PROGRESS') throw new AppError('INVALID_STATUS_TRANSITION', 'Phiên check-in đã kết thúc');
    return s;
  }

  async start(ctx: AccessContext, reservationPublicId: string, recordedOffline = false) {
    ctx.require('checkin.perform');
    const r = await this.prisma.reservation.findUnique({ where: { public_id: reservationPublicId }, include: { facility: true } });
    if (!r) throw notFound('Đơn đặt thuê');
    if (ctx.grant('checkin.perform')?.scope === 'FACILITY' && !ctx.facilitiesFor('checkin.perform').includes(r.facility_id)) {
      throw forbidden(`Đơn đặt chỗ ${r.code} thuộc cơ sở ${r.facility.name}. Nhân viên ở cơ sở nào chỉ nhận được đơn hàng của khách hàng tại cơ sở đó.`);
    }
    ctx.assertScope('checkin.perform', r, 'Đơn đặt thuê', true);
    const pre = await this.preconditions(r.id);
    if (!pre.ok) throw new AppError('CHECKIN_PRECONDITION_FAILED', 'Chưa đủ điều kiện bắt đầu check-in', { missing: pre.missing });
    return this.prisma.tx(async (tx) => {
      const open = await tx.checkinSession.findFirst({ where: { reservation_id: r.id, status: 'IN_PROGRESS' } });
      if (open) return open;
      const s = await tx.checkinSession.create({ data: { public_id: newId(), reservation_id: r.id, staff_user_id: ctx.userId, recorded_offline: recordedOffline } });
      if (pre.appointment && pre.appointment.status === 'BOOKED') await tx.appointment.update({ where: { id: pre.appointment.id }, data: { status: 'ARRIVED' } });
      await this.audit.log(ctx, { action: 'checkin.start', entityType: 'checkin_session', entityId: s.id, entityRef: s.public_id, facilityId: r.facility_id }, tx);
      return s;
    });
  }

  async assignUnitAndInitContract(ctx: AccessContext, publicId: string, d?: { unitTypeId?: string; unitId?: string }) {
    ctx.require('checkin.perform');
    const s = await this.session(ctx, publicId);
    return this.prisma.tx(async (tx) => {
      const r = await tx.reservation.findUniqueOrThrow({
        where: { id: s.reservation_id },
        include: { quote: true, unit_type: true, facility: true },
      });
      let targetUnitTypeId = r.unit_type_id;
      let diffInvoice: { id: string; code: string; total: number } | null = null;
      let downgradeRefund: { id: string; amount: number; method: 'CASH' | 'CREDIT_NOTE' } | null = null;

      if (d?.unitTypeId && d.unitTypeId !== r.unit_type.public_id) {
        const newUt = await tx.unitType.findFirst({
          where: { public_id: d.unitTypeId, facility_id: r.facility_id, status: 'ACTIVE', deleted_at: null },
        });
        if (!newUt) throw notFound('Loại kho');
        targetUnitTypeId = newUt.id;
        const policy = await this.core.policyById(r.quote.policy_version_id, tx);
        const firstPeriods = r.billing_mode === 'PREPAID_TERM' ? r.term_months : 1;
        const qli = { termDiscountPct: 0, prepaidDiscountPct: 0, ...((r.quote.line_items as object | null) ?? {}) } as { termDiscountPct: number; prepaidDiscountPct: number };
        const monthly = D(r.channel === 'COUNTER' ? newUt.list_price : newUt.online_price);
        const rent = vnd(monthly.mul(100 - qli.termDiscountPct).mul(100 - qli.prepaidDiscountPct).div(10000)).mul(firstPeriods); // same term/prepaid discount the quote was given
        const deposit =
          newUt.deposit_override !== null && newUt.deposit_override !== undefined
            ? vnd(newUt.deposit_override)
            : policy.deposit_type === 'FIXED'
              ? vnd(policy.deposit_value)
              : vnd(monthly.mul(policy.deposit_value));
        const adminFee = D(r.quote.admin_fee);
        const discount = D(r.quote.discount_total);
        const taxable = Prisma.Decimal.max(D(0), rent.sub(discount).add(adminFee));
        const tax =
          policy.vat_rate > 0
            ? policy.prices_include_vat
              ? vnd(taxable.mul(policy.vat_rate).div(100 + policy.vat_rate))
              : vnd(taxable.mul(policy.vat_rate).div(100))
            : D(0);
        const newDueNow = policy.prices_include_vat
          ? rent.sub(discount).add(adminFee).add(deposit)
          : rent.sub(discount).add(adminFee).add(deposit).add(tax);
        const oldDueNow = D(r.quote.due_now_total);
        const diff = Prisma.Decimal.max(D(0), newDueNow.sub(oldDueNow));
        const overpaid = Prisma.Decimal.max(D(0), oldDueNow.sub(newDueNow));
        const oldDeposit = D(r.quote.deposit_amount);

        await tx.quote.update({
          where: { id: r.quote_id },
          data: {
            unit_type_id: newUt.id,
            monthly_rent: monthly,
            deposit_amount: deposit,
            tax_total: tax,
            due_now_total: Prisma.Decimal.max(oldDueNow, newDueNow),
          },
        });
        await tx.reservation.update({
          where: { id: r.id },
          data: { unit_type_id: newUt.id },
        });
        const existingDep = await tx.deposit.findUnique({ where: { reservation_id: r.id } });
        if (existingDep && deposit.gt(existingDep.amount)) {
          await tx.deposit.update({
            where: { id: existingDep.id },
            data: { amount: deposit, held_amount: deposit },
          });
        }
        if (overpaid.gt(0)) {
          // Customer reserved a bigger unit than the one handed over: the difference goes back in CASH at the counter
          // (or is credited when the reservation invoice is still unpaid), never silently kept.
          const resInv = await tx.invoice.findFirst({ where: { reservation_id: r.id, type: 'RESERVATION' }, include: { allocations: { orderBy: { id: 'asc' }, take: 1 } } });
          if (resInv && ['PAID', 'PARTIALLY_PAID'].includes(resInv.status)) {
            const depositPortion = Prisma.Decimal.min(overpaid, Prisma.Decimal.max(D(0), oldDeposit.sub(deposit)));
            const refund = await this.payments.createRefund(tx, {
              customerId: r.customer_id, facilityId: r.facility_id, paymentId: resInv.allocations[0]?.payment_id ?? null, reservationId: r.id, reason: 'OVERPAYMENT',
              amount: overpaid, depositPortion, requestedBy: ctx.userId, autoApprove: false, method: 'CASH', note: `Hoàn tiền mặt chênh lệch khi đổi sang ${newUt.name} lúc check-in`,
            });
            downgradeRefund = { id: refund.public_id, amount: Number(overpaid), method: 'CASH' };
          } else if (resInv && resInv.status === 'ISSUED') {
            await this.core.creditNote(tx, resInv.id, overpaid, `Giảm giá do đổi sang kho rẻ hơn (${newUt.name})`, ctx.userId);
            downgradeRefund = { id: resInv.public_id, amount: Number(overpaid), method: 'CREDIT_NOTE' };
          }
        }
        if (diff.gt(0)) {
          const inv = await this.core.createInvoice(tx, {
            customerId: r.customer_id,
            facilityId: r.facility_id,
            reservationId: r.id,
            type: 'MOVE_IN',
            dueDate: this.core.today(r.facility.timezone),
            moveInDue: true,
            vatRate: policy.vat_rate,
            pricesIncludeVat: policy.prices_include_vat,
            items: [
              {
                item_type: 'RENT',
                description: `Chênh lệch đổi kích thước kho khi check-in (${r.unit_type.name} → ${newUt.name})`,
                amount: diff,
                taxable: true,
              },
            ],
            actor: ctx.userId,
            notify: true,
          });
          diffInvoice = { id: inv.public_id, code: inv.code, total: Number(inv.total) };
        }
      }

      let unitId: bigint | null = null;
      if (d?.unitId) {
        const u = await tx.unit.findUnique({ where: { public_id: d.unitId } });
        if (u && u.facility_id === r.facility_id && u.unit_type_id === targetUnitTypeId) {
          unitId = u.id;
        }
      }
      if (!unitId) {
        const sug = await this.reservations.suggestions(tx, s.reservation_id);
        if (!sug.length) throw new AppError('CHECKIN_PRECONDITION_FAILED', 'Chưa có kho trống thuộc loại kho này để phân bổ', { missing: ['UNIT_NOT_ASSIGNED'] });
        unitId = sug[0].unitId;
      }
      const res = await this.reservations.assign(tx, s.reservation_id, unitId, 'MANUAL', ctx.userId, 'Nhân viên đối soát phiếu đặt chỗ, gán kho & khởi tạo hợp đồng khi check-in');
      await tx.checkinSession.update({ where: { id: s.id }, data: { current_step: diffInvoice ? 'IDENTITY_VERIFIED' : 'PAYMENT_DONE' } });
      return { unit: res.unit, contract: res.contract, diffInvoice, downgradeRefund };
    });
  }

  async sendContractEmail(ctx: AccessContext, publicId: string) {
    ctx.require('checkin.perform');
    const s = await this.session(ctx, publicId);
    if (!s.reservation.contract_id) throw new AppError('CONFLICT', 'Vui lòng gán mã kho và khởi tạo hợp đồng trước khi gửi mail');
    const out = await this.contracts.sendSignEmailLink(ctx, s.reservation.contract_id);
    await this.prisma.checkinSession.update({ where: { id: s.id }, data: { current_step: 'PAYMENT_DONE' } });
    return out;
  }

  async state(ctx: AccessContext, publicId: string) {
    const s = await this.session(ctx, publicId, false);
    const r = await this.prisma.reservation.findUniqueOrThrow({
      where: { id: s.reservation_id },
      include: {
        customer: true,
        unit_type: true,
        facility: true,
        quote: true,
        invoices: { orderBy: { id: 'asc' } },
        appointments: { where: { status: { in: ['BOOKED', 'ARRIVED'] } }, orderBy: { scheduled_start: 'desc' } },
      },
    });
    const pre = await this.preconditions(r.id);
    const availableUnits = await this.reservations.suggestions(this.prisma, r.id);
    const policy = await this.core.policyById(r.quote.policy_version_id);
    const allTypes = await this.prisma.unitType.findMany({
      where: { facility_id: r.facility_id, status: 'ACTIVE', is_bookable: true, deleted_at: null },
      orderBy: [{ online_price: 'asc' }, { id: 'asc' }],
    });
    const allAvailUnits = await this.prisma.unit.findMany({
      where: {
        facility_id: r.facility_id,
        status: 'AVAILABLE',
        operational_flag: 'NONE',
        deleted_at: null,
        allocations: { none: { status: 'ACTIVE' } },
        work_orders: { none: { status: { in: ['REPORTED', 'APPROVED', 'SCHEDULED', 'IN_PROGRESS'] } } },
      },
      include: { zone: true },
      orderBy: [{ allocation_priority: 'asc' }, { last_vacated_at: { sort: 'asc', nulls: 'first' } }, { code: 'asc' }],
    });
    const firstPeriods = r.billing_mode === 'PREPAID_TERM' ? r.term_months : 1;
        const qli = { termDiscountPct: 0, prepaidDiscountPct: 0, ...((r.quote.line_items as object | null) ?? {}) } as { termDiscountPct: number; prepaidDiscountPct: number };
    const oldDueNow = D(r.quote.due_now_total);
    const facilityUnitTypes = allTypes.map((ut) => {
      const monthly = D(r.channel === 'COUNTER' ? ut.list_price : ut.online_price);
      const rent = vnd(monthly.mul(100 - qli.termDiscountPct).mul(100 - qli.prepaidDiscountPct).div(10000)).mul(firstPeriods); // same term/prepaid discount the quote was given
      const deposit =
        ut.deposit_override !== null && ut.deposit_override !== undefined
          ? vnd(ut.deposit_override)
          : policy.deposit_type === 'FIXED'
            ? vnd(policy.deposit_value)
            : vnd(monthly.mul(policy.deposit_value));
      const adminFee = D(r.quote.admin_fee);
      const discount = D(r.quote.discount_total);
      const taxable = Prisma.Decimal.max(D(0), rent.sub(discount).add(adminFee));
      const tax =
        policy.vat_rate > 0
          ? policy.prices_include_vat
            ? vnd(taxable.mul(policy.vat_rate).div(100 + policy.vat_rate))
            : vnd(taxable.mul(policy.vat_rate).div(100))
          : D(0);
      const newDueNow = policy.prices_include_vat
        ? rent.sub(discount).add(adminFee).add(deposit)
        : rent.sub(discount).add(adminFee).add(deposit).add(tax);
      const diff = ut.id === r.unit_type_id ? D(0) : Prisma.Decimal.max(D(0), newDueNow.sub(oldDueNow));
      const utUnits = allAvailUnits
        .filter((u) => u.unit_type_id === ut.id)
        .slice(0, 20)
        .map((u, i) => ({ id: u.public_id, code: u.code, zone: u.zone.name, floor: u.zone.floor, rank: i + 1 }));
      return {
        id: ut.public_id,
        name: ut.name,
        code: ut.code,
        sizeCategory: ut.size_category,
        areaM2: Number(ut.area_m2 ?? 0),
        climateControlled: ut.climate_controlled,
        onlinePrice: Number(ut.online_price),
        dueNowTotal: Number(newDueNow),
        diffAmount: Number(diff),
        availableCount: utUnits.length,
        units: utUnits,
      };
    });

    const idv = await this.prisma.identityVerification.findFirst({ where: { checkin_session_id: s.id }, orderBy: { id: 'desc' } });
    const identityPhotos = idv ? await this.media.listFor('identity_verification', [idv.id]) : [];
    const insp = s.inspection_id ? await this.prisma.inspection.findUnique({ where: { id: s.inspection_id }, include: { items: true } }) : null;
    const photos = insp ? await this.media.listFor('inspection_item', insp.items.map((i) => i.id)) : [];
    const contract = r.contract_id ? await this.prisma.contract.findUnique({ where: { id: r.contract_id } }) : null;
    const creds = contract ? await this.prisma.accessCredential.findMany({ where: { contract_id: contract.id, status: 'ACTIVE' } }) : [];
    const handover = contract ? await this.prisma.handoverRecord.findUnique({ where: { contract_id_type: { contract_id: contract.id, type: 'MOVE_IN' } } }) : null;
    const checklist = (r.unit_type.inspection_checklist as string[] | null) ?? [...INSPECTION_ITEMS].filter((c) => c !== 'AC' || r.unit_type.climate_controlled);

    // The e-mailed signing link belongs to the customer: staff never see it (they could sign in the customer's name).
    let signUrl: string | null = null;
    if (contract && contract.status === 'PENDING_SIGNATURE' && r.customer.user_id) {
      const tok = await this.prisma.authToken.findFirst({
        where: { user_id: r.customer.user_id, purpose: 'SIGN_OTP', used_at: null, expires_at: { gt: new Date() } },
        orderBy: { id: 'desc' },
      });
      const payload = tok?.payload as { contractId?: string; rawToken?: string; mode?: string } | undefined;
      if (payload?.contractId === contract.id.toString() && payload?.rawToken) {
        signUrl = `/sign-contract?contractId=${contract.public_id}&token=${payload.rawToken}`;
      }
    }
    const waitingSignature = Boolean(contract && contract.status === 'PENDING_SIGNATURE' && signUrl);
    if (ctx.customerId == null || ctx.customerId !== r.customer_id) signUrl = null;
    const pinCred = creds.find((c) => c.type === 'PIN_CODE' && c.pin_enc);
    const pinCode = pinCred?.pin_enc ? decryptField(pinCred.pin_enc) : null;

    return {
      id: s.public_id,
      session: s,
      reservation: r,
      unit: pre.unit,
      availableUnits,
      facilityUnitTypes,
      contract,
      waitingSignature,
      signUrl,
      pinCode,
      steps: {
        identity: !!idv && idv.name_matched,
        unit: !!pre.unit && !!contract && pre.unpaidMoveIn.length === 0,
        payment: pre.unpaidMoveIn.length === 0,
        contract: !!pre.unit && (contract ? ['SIGNED', 'ACTIVE'].includes(contract.status) : false),
        inspection: !!insp && insp.status === 'COMPLETED',
        access: creds.length > 0,
        handover: handover?.status === 'SIGNED' || s.status === 'COMPLETED',
      },
      identityVerification: idv
        ? {
            ...idv,
            photos: identityPhotos.map((p) => ({
              id: p.public_id,
              url: p.url,
              mimeType: p.mime_type,
              caption: p.caption,
              takenAt: p.taken_at ?? p.created_at,
            })),
          }
        : null,
      unpaidMoveIn: pre.unpaidMoveIn,
      inspection: insp ? { ...insp, items: insp.items.map((i) => ({ ...i, photos: photos.filter((p) => p.related_id === i.id).map((p) => ({ id: p.public_id, url: p.url })) })) } : null,
      credentials: creds.map((c) => ({ id: c.public_id, type: c.type, identifier: c.identifier, status: c.status })),
      checklist: checklist.map((c) => ({ code: c, label: INSPECTION_ITEM_LABEL[c] ?? c })),
      minPhotos: pre.minPhotos,
    };
  }

  async verifyIdentity(ctx: AccessContext, publicId: string, d: { documentType: 'CCCD' | 'PASSPORT' | 'OTHER'; last4: string; nameMatched: boolean; notes?: string; photoIds?: string[] }) {
    const s = await this.session(ctx, publicId);
    if (!/^[0-9A-Z]{4}$/i.test(d.last4)) throw validation('Nhập 4 ký tự cuối giấy tờ', [{ field: 'last4', message: 'invalid' }]);
    return this.prisma.tx(async (tx) => {
      const idv = await tx.identityVerification.create({ data: { customer_id: s.reservation.customer_id, checkin_session_id: s.id, document_type: d.documentType, document_last4: d.last4.toUpperCase(), name_matched: d.nameMatched, verified_by: ctx.userId, notes: d.notes?.slice(0, 255) } });
      if (d.photoIds?.length) {
        await this.media.attach(tx, ctx, d.photoIds, 'identity_verification', idv.id, s.reservation.facility_id, true);
      }
      if (!d.nameMatched) return { ok: false, message: 'Tên trên giấy tờ không khớp chủ hợp đồng — chỉ chủ hợp đồng được nhận kho. Hãy hủy phiên với lý do IDENTITY_MISMATCH.' };
      await tx.customer.update({ where: { id: s.reservation.customer_id }, data: { id_document_type: d.documentType, id_document_last4: d.last4.toUpperCase() } });
      await tx.checkinSession.update({ where: { id: s.id }, data: { current_step: 'IDENTITY_VERIFIED' } });
      return { ok: true };
    });
  }

  async checkinMediaForReservation(reservationId: bigint, customerId: bigint) {
    const sessions = await this.prisma.checkinSession.findMany({ where: { reservation_id: reservationId }, orderBy: { id: 'desc' } });
    const sessionIds = sessions.map((s) => s.id);
    // Only this order's own check-in verifications: an ID photo taken for another order of the same customer must never show here.
    const idvs = sessionIds.length
      ? await this.prisma.identityVerification.findMany({ where: { checkin_session_id: { in: sessionIds } }, orderBy: { id: 'desc' } })
      : [];
    const idv = idvs[0] ?? null;
    const idvPhotos = idvs.length ? await this.media.listFor('identity_verification', idvs.map((v) => v.id)) : [];
    const inspIds = sessions.map((s) => s.inspection_id).filter((x): x is bigint => x != null);
    const insps = inspIds.length ? await this.prisma.inspection.findMany({ where: { id: { in: inspIds } }, include: { items: true } }) : [];
    const itemIds = insps.flatMap((i) => i.items.map((it) => it.id));
    const itemPhotos = itemIds.length ? await this.media.listFor('inspection_item', itemIds) : [];
    return {
      identityVerification: idv
        ? {
            ...idv,
            photos: idvPhotos.map((p) => ({
              id: p.public_id,
              url: p.url,
              mimeType: p.mime_type,
              caption: p.caption,
              takenAt: p.taken_at ?? p.created_at,
            })),
          }
        : null,
      inspectionPhotos: itemPhotos.map((p) => {
        const it = insps.flatMap((i) => i.items).find((x) => x.id === p.related_id);
        return {
          id: p.public_id,
          url: p.url,
          mimeType: p.mime_type,
          caption: p.caption,
          takenAt: p.taken_at ?? p.created_at,
          itemCode: it?.item_code,
          itemLabel: it ? INSPECTION_ITEM_LABEL[it.item_code] ?? it.item_code : undefined,
        };
      }),
    };
  }

  /** Staff records the money taken at the counter (cash or bank transfer); no reference number or receipt photo is asked for. */
  async recordPayment(ctx: AccessContext, publicId: string, d: { method: 'CASH' | 'BANK_TRANSFER' }, idem?: string) {
    const s = await this.session(ctx, publicId);
    const pre = await this.preconditions(s.reservation_id);
    if (!pre.unpaidMoveIn.length) return { message: 'Không còn khoản cần thu khi nhận kho' };
    const p = await this.payments.recordOffline(ctx, { invoicePublicIds: pre.unpaidMoveIn.map((i) => i.id), method: d.method }, idem);
    await this.prisma.checkinSession.update({ where: { id: s.id }, data: { current_step: 'PAYMENT_DONE' } });
    return p;
  }

  async sendSignOtp(ctx: AccessContext, publicId: string) {
    const s = await this.session(ctx, publicId);
    if (!s.reservation.contract_id) throw new AppError('CONFLICT', 'Chưa có hợp đồng nháp');
    return this.contracts.sendSignOtp(ctx, s.reservation.contract_id);
  }

  async sign(ctx: AccessContext, publicId: string, otp: string, signature: string) {
    const s = await this.session(ctx, publicId);
    if (!s.reservation.contract_id) throw new AppError('CONFLICT', 'Chưa có hợp đồng nháp');
    const c = await this.contracts.sign(ctx, s.reservation.contract_id, otp, signature);
    await this.prisma.checkinSession.update({ where: { id: s.id }, data: { current_step: 'CONTRACT_SIGNED' } });
    return c;
  }

  /** Records a completed inspection (shared with move-out/routine). Photos attach per checklist item. */
  async recordInspection(tx: Tx, ctx: AccessContext, d: InspectionInput & { unitId: bigint; contractId: bigint | null; type: 'MOVE_IN' | 'MOVE_OUT' | 'ROUTINE' | 'POST_MAINTENANCE'; facilityId: bigint; minPhotos: number; comparedTo?: bigint | null }) {
    const totalPhotos = d.items.reduce((n, i) => n + (i.photoIds?.length ?? 0), 0);
    if (totalPhotos < d.minPhotos) throw validation(`Cần tối thiểu ${d.minPhotos} ảnh hiện trạng (hiện có ${totalPhotos})`, [{ field: 'photos', message: 'min' }]);
    const insp = await tx.inspection.create({
      data: { public_id: newId(), unit_id: d.unitId, contract_id: d.contractId, type: d.type, performed_by: ctx.userId, status: 'COMPLETED', overall_condition: d.overall, notes: d.notes, recorded_offline: d.recordedOffline ?? false, completed_at: this.core.now(), compared_to_inspection_id: d.comparedTo ?? null },
    });
    for (const it of d.items) {
      const row = await tx.inspectionItem.create({ data: { inspection_id: insp.id, item_code: it.code.slice(0, 32), condition: it.condition, note: it.note?.slice(0, 500) } });
      if (it.photoIds?.length) await this.media.attach(tx, ctx, it.photoIds, 'inspection_item', row.id, d.facilityId);
    }
    return tx.inspection.findUniqueOrThrow({ where: { id: insp.id }, include: { items: true } });
  }

  async inspection(ctx: AccessContext, publicId: string, d: InspectionInput) {
    const s = await this.session(ctx, publicId);
    const pre = await this.preconditions(s.reservation_id);
    if (!pre.unit) throw new AppError('CONFLICT', 'Chưa có kho được phân bổ');
    if (d.overall === 'DAMAGED' || d.items.some((i) => i.condition === 'DAMAGED')) {
      throw new AppError('CONFLICT', 'Kho không đạt điều kiện bàn giao — đánh dấu UNIT_UNFIT để quản lý đổi kho', { action: 'MARK_UNIT_UNFIT' });
    }
    return this.prisma.tx(async (tx) => {
      const insp = await this.recordInspection(tx, ctx, { ...d, unitId: pre.unit!.id, contractId: s.reservation.contract_id, type: 'MOVE_IN', facilityId: s.reservation.facility_id, minPhotos: pre.minPhotos });
      await tx.checkinSession.update({ where: { id: s.id }, data: { inspection_id: insp.id, current_step: 'INSPECTED', recorded_offline: d.recordedOffline ?? undefined } });
      return insp;
    });
  }

  /** Hard gate (§6.2 rule 1): no credential while contract unsigned or move-in invoices unpaid. */
  async issueAccess(ctx: AccessContext, publicId: string, items: { type: 'PIN_CODE' | 'ACCESS_CARD' | 'FACILITY_LOCK' | 'CUSTOMER_LOCK'; identifier?: string }[]) {
    ctx.require('access.manage');
    const s = await this.session(ctx, publicId);
    const st = await this.state(ctx, publicId);
    const missing: string[] = [];
    if (!st.steps.identity) missing.push('IDENTITY_NOT_VERIFIED');
    if (!st.steps.contract) missing.push('CONTRACT_NOT_SIGNED');
    if (!st.steps.payment) missing.push('MOVE_IN_INVOICE_UNPAID');
    if (!st.steps.inspection) missing.push('INSPECTION_NOT_COMPLETED');
    if (missing.length) throw new AppError('CHECKIN_PRECONDITION_FAILED', 'Chưa đủ điều kiện cấp phương tiện truy cập', { missing });
    if (!items.length) throw validation('Chọn ít nhất một phương tiện truy cập');
    return this.prisma.tx(async (tx) => {
      const issued = [];
      for (const it of items) issued.push(await this.access.issue(tx, st.contract!.id, it.type, { identifier: it.identifier, actor: ctx.userId }));
      await tx.checkinSession.update({ where: { id: s.id }, data: { current_step: 'ACCESS_ISSUED' } });
      await this.audit.log(ctx, { action: 'access.issue', entityType: 'contract', entityId: st.contract!.id, entityRef: st.contract!.code, facilityId: s.reservation.facility_id, after: { items: items.map((i) => ({ type: i.type, identifier: i.identifier ?? null })) }, category: 'SECURITY' }, tx);
      return issued.map((c) => ({ id: c.public_id, type: c.type, identifier: c.identifier, status: c.status }));
    });
  }

  /** Step 4: handover + issue PIN code + single transaction activating the contract. */
  async complete(ctx: AccessContext, publicId: string, signaturePng?: string, notes?: string) {
    const s = await this.session(ctx, publicId);
    const st = await this.state(ctx, publicId);
    const missing: string[] = [];
    if (!st.steps.identity) missing.push('IDENTITY_NOT_VERIFIED');
    if (!st.steps.unit) missing.push('UNIT_OR_PAYMENT_INCOMPLETE');
    if (!st.steps.contract) missing.push('CONTRACT_NOT_SIGNED');
    // Hard gate (§6.2 rule 1): no hand-over / PIN without the signed-off condition report (>= min_handover_photos photos).
    if (!st.steps.inspection) missing.push('INSPECTION_NOT_COMPLETED');
    if (missing.length) throw new AppError('CHECKIN_PRECONDITION_FAILED', 'Chưa hoàn tất các bước rà soát, gán kho, ký hợp đồng hoặc biên bản hiện trạng', { missing });
    const m = signaturePng ? /^data:image\/png;base64,(.+)$/.exec(signaturePng) : null;
    const sig = m ? Buffer.from(m[1], 'base64') : null;
    const r = st.reservation;
    const contract = st.contract!;
    const unit = st.unit!;
    return this.prisma.tx(async (tx) => {
      const now = this.core.now();
      const policy = await this.core.policyById(contract.policy_version_id, tx);
      let creds = await tx.accessCredential.findMany({ where: { contract_id: contract.id, status: 'ACTIVE' } });
      if (!creds.some((c) => c.type === 'PIN_CODE')) {
        const issuedPin = await this.access.issue(tx, contract.id, 'PIN_CODE', { actor: ctx.userId });
        creds = [...creds, issuedPin];
      }
      const pinCred = creds.find((c) => c.type === 'PIN_CODE' && c.pin_enc);
      const pinCode = pinCred?.pin_enc ? decryptField(pinCred.pin_enc) : null;
      const itemsHanded = creds.map((c) => ({ type: c.type, identifier: c.type === 'PIN_CODE' ? 'PIN cổng (hiển thị trên web)' : c.identifier }));

      const inspId = s.inspection_id!; // guaranteed by the INSPECTION_NOT_COMPLETED gate above
      const insp = await tx.inspection.findUniqueOrThrow({ where: { id: inspId }, include: { items: true } });

      const docSections: any[] = [
        { heading: 'Thông tin bàn giao', rows: [['Hợp đồng', contract.code], ['Kho', `${unit.code} — ${unit.zone.name}`], ['Khách hàng', r.customer.full_name], ['Nhân viên', ctx.fullName], ['Thời điểm', fmtDT(now)], ['Ghi nhận offline', s.recorded_offline ? 'Có (FM xác nhận)' : 'Không']] },
        { heading: 'Hiện trạng', table: { headers: ['Hạng mục', 'Tình trạng', 'Ghi chú'], widths: [170, 110, 219], rows: insp.items.map((i) => [i.item_code, i.condition, i.note ?? '']) } },
        { heading: 'Phương tiện truy cập đã nhận', rows: itemsHanded.map((i) => [i.type, i.identifier ?? '']) },
      ];
      if (sig) {
        docSections.push({ image: { buffer: sig, caption: 'Chữ ký khách hàng xác nhận bàn giao', width: 150 } });
      }
      const doc = await this.contracts.generateDocument(tx, contract.id, 'HANDOVER_MOVE_IN', docSections, `BIÊN BẢN BÀN GIAO KHO ${unit.code}`);
      let csigId: bigint | null = null;
      if (sig) {
        const sigMedia = await this.media.storeServerFile(tx, { purpose: 'SIGNATURE', buffer: sig, mime: 'image/png', ext: 'png', relatedType: 'handover', relatedId: contract.id, facilityId: r.facility_id, uploadedBy: ctx.userId, locked: true });
        const csig = await tx.contractSignature.create({ data: { document_id: doc.id, signer_type: 'CUSTOMER', signer_user_id: r.customer.user_id, method: 'DRAWN_SIGNATURE', signature_media_id: sigMedia.id, ip_address: ctx.ip?.slice(0, 45), user_agent: ctx.userAgent?.slice(0, 512), signed_at: now, document_sha256: doc.sha256 } });
        csigId = csig.id;
      } else {
        const priorSig = await tx.contractSignature.findFirst({ where: { signer_type: 'CUSTOMER', document: { contract_id: contract.id } }, orderBy: { id: 'desc' } });
        if (priorSig) {
          const csig = await tx.contractSignature.create({
            data: {
              document_id: doc.id,
              signer_type: 'CUSTOMER',
              signer_user_id: priorSig.signer_user_id,
              method: priorSig.method,
              signature_media_id: priorSig.signature_media_id,
              signed_at: now,
              document_sha256: doc.sha256,
              ip_address: ctx.ip?.slice(0, 45),
              user_agent: ctx.userAgent?.slice(0, 512),
            },
          });
          csigId = csig.id;
        }
      }
      await tx.handoverRecord.create({ data: { public_id: newId(), contract_id: contract.id, type: 'MOVE_IN', inspection_id: insp.id, items_handed: itemsHanded, status: 'SIGNED', customer_signature_id: csigId, staff_user_id: ctx.userId, document_id: doc.id, signed_at: now } });
      await tx.mediaFile.updateMany({ where: { related_type: 'inspection_item', related_id: { in: insp.items.map((i) => i.id) } }, data: { is_locked: true } });
      // Activate
      await this.core.setContractStatus(tx, contract.id, 'ACTIVE', ctx.userId, 'Hoàn tất bàn giao & cấp mã PIN', { activated_at: now });
      await tx.unitAllocation.updateMany({ where: { reservation_id: r.id, status: 'ACTIVE' }, data: { contract_id: contract.id } });
      await this.core.transitionUnit(tx, unit.id, 'OCCUPIED', { reason: `Bàn giao ${contract.code}`, actor: ctx.userId, related: { type: 'contract', id: contract.id } });
      await this.core.setReservationStatus(tx, r.id, 'CHECKED_IN', ctx.userId, 'Nhận kho & cấp mã PIN', { checked_in_at: now });
      await tx.appointment.updateMany({ where: { reservation_id: r.id, type: 'MOVE_IN', status: { in: ['BOOKED', 'ARRIVED'] } }, data: { status: 'COMPLETED' } });
      await tx.checkinSession.update({ where: { id: s.id }, data: { status: 'COMPLETED', current_step: 'HANDOVER_SIGNED', completed_at: now } });
      await tx.contractTerm.create({ data: { contract_id: contract.id, sequence_no: 1, type: 'INITIAL', start_date: contract.start_date, end_date: contract.current_end_date, monthly_rent: contract.monthly_rent, term_months: r.term_months, policy_version_id: contract.policy_version_id, status: 'ACTIVE' } });
      const paidMonths = r.billing_mode === 'PREPAID_TERM' ? r.term_months : 1;
      const nextStart = addMonths(contract.start_date, paidMonths);
      await tx.billingSchedule.create({
        data: { contract_id: contract.id, next_period_start: nextStart, next_invoice_date: addDays(nextStart, -policy.invoice_lead_days), period_months: 1, amount: contract.monthly_rent, status: nextStart >= contract.current_end_date ? 'PAUSED' : 'ACTIVE' },
      });
      const appts = await tx.appointment.findMany({ where: { reservation_id: r.id, type: 'MOVE_IN' }, select: { id: true } });
      for (const a of appts) await this.core.completeTasksFor(tx, 'appointment', a.id, ['HANDOVER'], ctx.userId, 'Hoàn tất bàn giao');
      await this.audit.log(ctx, { action: 'checkin.complete', entityType: 'contract', entityId: contract.id, entityRef: contract.code, facilityId: r.facility_id, after: { unit: unit.code, credentials: creds.length }, reason: notes }, tx);
      const uid = r.customer.user_id;
      const ah = r.facility.access_hours as Record<string, [string, string]>;
      const accessHours = ah?.mon ? `${ah.mon[0]}–${ah.mon[1]}` : '24/7';
      if (uid) {
        await this.notify.notify({ users: [uid], event: 'access.issued', vars: { unitCode: unit.code, code: contract.code, facility: r.facility.name }, link: `/app/contracts/${contract.public_id}`, related: { type: 'contract', id: contract.id }, email: false }, tx);
        await this.notify.notify(
          {
            users: [uid],
            event: 'handover.completed',
            vars: {
              code: contract.code,
              unitCode: unit.code,
              zone: unit.zone.name,
              floor: unit.zone.floor,
              facility: r.facility.name,
              customer: r.customer.full_name,
              accessHours,
            },
            link: `/app/contracts/${contract.public_id}`,
            related: { type: 'contract', id: contract.id },
            email: true,
          },
          tx,
        );
      }
      await this.notify.notify({ users: await this.core.facilityManagers(tx, r.facility_id), event: 'checkin.completed', vars: { customer: r.customer.full_name, unitCode: unit.code, code: contract.code }, link: `/manage/contracts/${contract.public_id}`, related: { type: 'contract', id: contract.id }, email: false }, tx);
      return { contractId: contract.public_id, contractCode: contract.code, unitCode: unit.code, pinCode, status: 'ACTIVE' };
    });
  }

  async abort(ctx: AccessContext, publicId: string, reason: 'IDENTITY_MISMATCH' | 'PAYMENT_NOT_COMPLETED' | 'CONTRACT_DECLINED' | 'UNIT_UNFIT' | 'CUSTOMER_LEFT', note?: string) {
    const s = await this.session(ctx, publicId);
    await this.prisma.tx(async (tx) => {
      await tx.checkinSession.update({ where: { id: s.id }, data: { status: 'ABORTED', abort_reason: reason, completed_at: this.core.now() } });
      await tx.appointment.updateMany({ where: { reservation_id: s.reservation_id, status: 'ARRIVED' }, data: { status: 'BOOKED' } });
      // Nothing from an unfinished session may stay in effect (§6.2 "Thất bại"): revoke access issued in step 6.
      if (s.reservation.contract_id) {
        const c = await tx.contract.findUniqueOrThrow({ where: { id: s.reservation.contract_id } });
        if (c.status !== 'ACTIVE') await this.access.revokeAll(tx, c.id, ctx.userId, `Hủy phiên check-in (${reason})`);
      }
      await this.audit.log(ctx, { action: 'checkin.abort', entityType: 'checkin_session', entityId: s.id, entityRef: s.public_id, facilityId: s.reservation.facility_id, reason: `${reason}${note ? ': ' + note : ''}` }, tx);
      await this.notify.notify({ users: await this.core.facilityManagers(tx, s.reservation.facility_id), event: 'checkin.aborted', vars: { code: s.reservation.code, reason }, link: `/manage/reservations?focus=${s.reservation.public_id}`, related: { type: 'reservation', id: s.reservation_id }, email: false }, tx);
    });
    if (reason === 'CONTRACT_DECLINED') await this.reservations.cancel(ctx, s.reservation_id, 'Khách từ chối ký hợp đồng', { system: 'CONTRACT_DECLINED' });
    return { status: 'ABORTED', reason };
  }

  /** Staff: unit unfit during handover → MAINTENANCE + work order + urgent FM task (§6.2 exceptions). */
  async markUnitUnfit(ctx: AccessContext, publicId: string, description: string, photoIds: string[] = []) {
    const s = await this.session(ctx, publicId);
    const pre = await this.preconditions(s.reservation_id);
    if (!pre.unit) throw new AppError('CONFLICT', 'Chưa có kho được phân bổ');
    return this.prisma.tx(async (tx) => {
      const r = await tx.reservation.findUniqueOrThrow({ where: { id: s.reservation_id }, include: { customer: true, facility: true } });
      const wo = await tx.workOrder.create({ data: { public_id: newId(), code: await nextCode(tx, 'WO', this.core.now().getFullYear()), facility_id: s.reservation.facility_id, unit_id: pre.unit!.id, category: 'OTHER', description: `Phát hiện khi bàn giao: ${description}`, status: 'REPORTED', priority: 'HIGH', reported_by: ctx.userId } });
      if (photoIds.length) await this.media.attach(tx, ctx, photoIds, 'work_order', wo.id, s.reservation.facility_id);
      await this.core.setOperationalFlag(tx, pre.unit!.id, 'ISSUE_REPORTED', description, ctx.userId);
      await this.core.createTask(tx, { facilityId: s.reservation.facility_id, type: 'ALLOCATE_UNIT', title: `KHẨN: đổi kho cho ${s.reservation.code} (kho ${pre.unit!.code} không đạt)`, related: { type: 'reservation', id: s.reservation_id }, priority: 'URGENT', dueAt: new Date(this.core.now().getTime() + 30 * 60000), dedupeKey: `UNFIT:${s.id}:${pre.unit!.id}`, source: 'SYSTEM' });
      if (r.customer.user_id) {
        await this.notify.notify(
          {
            users: [r.customer.user_id],
            event: 'unit.unfit_reassigned',
            vars: {
              code: r.code,
              unitCode: pre.unit!.code,
              zone: pre.unit!.zone.name,
              facility: r.facility.name,
              reason: description,
              description,
              workOrderCode: wo.code,
            },
            link: `/app/reservations/${r.public_id}`,
            related: { type: 'work_order', id: wo.id },
            email: true,
          },
          tx,
        );
      }
      return { workOrder: wo.public_id, message: 'Đã báo quản lý cơ sở đổi kho trong phiên' };
    });
  }

  /** FM swaps the unit inside an open session: old allocation RELEASED (UNIT_UNFIT → MAINTENANCE). */
  async swapUnit(ctx: AccessContext, publicId: string, unitPublicId: string | undefined, reason: string) {
    ctx.require('allocation.assign');
    const s = await this.session(ctx, publicId);
    ctx.assertScope('allocation.assign', s.reservation, 'Đơn đặt thuê', true);
    return this.prisma.tx(async (tx) => {
      const prev = await tx.unitAllocation.findFirst({ where: { reservation_id: s.reservation_id, status: 'ACTIVE' } });
      if (prev) {
        await tx.unit.update({ where: { id: prev.unit_id }, data: { operational_flag: 'NONE' } });
        await this.reservations.release(tx, prev.id, 'UNIT_UNFIT', ctx.userId, reason);
      }
      let unitId: bigint;
      if (unitPublicId) {
        const u = await tx.unit.findUnique({ where: { public_id: unitPublicId } });
        if (!u) throw notFound('Kho');
        unitId = u.id;
      } else {
        const sug = await this.reservations.suggestions(tx, s.reservation_id);
        if (!sug.length) throw new AppError('CONFLICT', 'Không còn kho cùng loại — cân nhắc nâng hạng hoặc hủy hoàn 100%');
        unitId = sug[0].unitId;
      }
      const out = await this.reservations.assign(tx, s.reservation_id, unitId, 'MANUAL', ctx.userId, reason);
      if (s.inspection_id) await tx.checkinSession.update({ where: { id: s.id }, data: { inspection_id: null, current_step: 'CONTRACT_SIGNED' } });
      await this.audit.log(ctx, { action: 'allocation.swap_in_session', entityType: 'reservation', entityId: s.reservation_id, entityRef: s.reservation.code, facilityId: s.reservation.facility_id, reason, after: { unit: out.unit.code } }, tx);
      return { unit: out.unit.code };
    });
  }

  diffDays = diffDays;
  fmtD = fmtD;
  Prisma = Prisma;
}
