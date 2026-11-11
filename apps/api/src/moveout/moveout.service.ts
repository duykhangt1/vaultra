import { Injectable } from '@nestjs/common';
import { splitSignature } from '../common/signature';
import { PrismaService, Tx } from '../common/prisma.service';
import { AppError, forbidden, notFound, validation } from '../common/errors';
import { D, newId, nextCode, vnd } from '../common/util';
import { addDays, addMonths, dateOnly, diffDays, ymd } from '../common/dates';
import { CoreService, fmt, fmtD, fmtDT } from '../domain/core.service';
import { ContractService } from '../contract/contract.service';
import { AccessService } from '../access/access.service';
import { MediaService } from '../media/media.service';
import { PaymentService } from '../billing/payment.service';
import { CheckinService, InspectionInput } from '../checkin/checkin.service';
import { ReservationService } from '../reservation/reservation.service';
import { NotificationService } from '../notifications/notification.service';
import { AuditService } from '../audit/audit.service';
import type { AccessContext } from '../auth/access-context';
import { Prisma } from '../generated/prisma/client';

const LIVE = ['ACTIVE', 'EXPIRED'] as const;

@Injectable()
export class MoveOutService {
  constructor(
    private prisma: PrismaService,
    private core: CoreService,
    private contracts: ContractService,
    private access: AccessService,
    private media: MediaService,
    private payments: PaymentService,
    private checkin: CheckinService,
    private reservations: ReservationService,
    private notify: NotificationService,
    private audit: AuditService,
  ) {}

  /** Settlement estimate: deposit − outstanding − expected fees + unused prepaid (policy). */
  async estimate(db: Tx | PrismaService, contractId: bigint, moveOutDate: Date, damageTotal = D(0), cleaningTotal = D(0)) {
    const c = await db.contract.findUniqueOrThrow({ where: { id: contractId } });
    const p = await this.core.policyById(c.policy_version_id, db);
    const dep = await db.deposit.findFirst({ where: { contract_id: c.id } });
    const depositHeld = dep ? D(dep.held_amount) : D(0);
    const open = await db.invoice.findMany({ where: { contract_id: c.id, status: { in: ['ISSUED', 'PARTIALLY_PAID'] }, OR: [{ period_start: null }, { period_start: { lt: moveOutDate } }] } });
    const outstanding = open.reduce((s, i) => s.add(D(i.total).sub(i.amount_paid).sub(i.amount_credited)), D(0));
    let prepaidRefund = D(0);
    if (p.early_termination_refund === 'UNUSED_FULL_MONTHS' && moveOutDate < c.current_end_date) {
      // calendar months anchored on the start date: the first period that begins on/after the move-out date and every later full period
      let k = 0;
      while (addMonths(c.start_date, k) < moveOutDate) k += 1;
      let months = 0;
      for (; addMonths(c.start_date, k + 1) <= c.current_end_date; k += 1) months += 1;
      const prepaid = await db.invoice.findMany({ where: { contract_id: c.id, status: 'PAID', type: { in: ['RECURRING', 'RENEWAL'] }, period_start: { gte: moveOutDate } } });
      const viaInvoices = prepaid.reduce((s, i) => s.add(i.amount_paid), D(0));
      prepaidRefund = c.billing_mode === 'PREPAID_TERM' ? vnd(D(c.monthly_rent).mul(months)) : viaInvoices;
    }
    const etFee = moveOutDate < c.current_end_date ? D(p.early_termination_fee) : D(0);
    const net = depositHeld.sub(outstanding).sub(damageTotal).sub(cleaningTotal).sub(etFee).add(prepaidRefund);
    return { deposit: Number(depositHeld), outstanding: Number(outstanding), damageTotal: Number(damageTotal), cleaningTotal: Number(cleaningTotal), earlyTerminationFee: Number(etFee), prepaidRefund: Number(prepaidRefund), net: Number(net), noticeDays: p.move_out_notice_days };
  }

  async request(ctx: AccessContext, contractPublicId: string, d: { date: string; slotId?: string; notes?: string }) {
    ctx.require('moveout.request');
    const c = await this.prisma.contract.findUnique({ where: { public_id: contractPublicId }, include: { unit: true, facility: true, customer: true } });
    ctx.assertScope('moveout.request', c, 'Hợp đồng', true);
    if (!LIVE.includes(c!.status as (typeof LIVE)[number])) throw new AppError('INVALID_STATUS_TRANSITION', `Hợp đồng ở trạng thái ${c!.status} không thể yêu cầu trả kho`);
    const p = await this.core.policyById(c!.policy_version_id);
    const date = dateOnly(d.date);
    const today = this.core.today(c!.facility.timezone);
    const noticeOk = diffDays(date, today) >= p.move_out_notice_days;
    if (date < today) throw validation('Ngày trả kho không hợp lệ');
    if (!noticeOk && ctx.grant('moveout.request')!.scope === 'OWN') throw validation(`Cần báo trước tối thiểu ${p.move_out_notice_days} ngày (sớm nhất ${fmtD(addDays(today, p.move_out_notice_days))})`, [{ field: 'date', message: 'notice' }]);
    const est = await this.estimate(this.prisma, c!.id, date);
    const req = await this.prisma.tx(async (tx) => {
      const r = await tx.moveOutRequest.create({ data: { public_id: newId(), contract_id: c!.id, requested_by: ctx.userId, requested_date: date, status: 'SCHEDULED', notice_ok: noticeOk, estimated_settlement: est } });
      await this.core.setContractStatus(tx, c!.id, 'MOVE_OUT_SCHEDULED', ctx.userId, 'Yêu cầu trả kho', { effective_end_date: date });
      await tx.renewalOffer.updateMany({ where: { contract_id: c!.id, status: 'OPEN' }, data: { status: 'WITHDRAWN' } });
      if (d.slotId) {
        const appt = await this.reservations.bookAppointment(ctx, { contractId: c!.public_id, type: 'MOVE_OUT', slotId: d.slotId, date: d.date, notes: d.notes }, tx);
        await tx.moveOutRequest.update({ where: { id: r.id }, data: { appointment_id: appt.id } });
      } else {
        await this.core.createTask(tx, { facilityId: c!.facility_id, type: 'MOVE_OUT_INSPECTION', title: `Kiểm tra trả kho ${c!.unit.code} (${c!.code}) ngày ${fmtD(date)}`, related: { type: 'move_out_request', id: r.id }, unitId: c!.unit_id, dueAt: addDays(date, 1), dedupeKey: `MOVEOUT:${r.id}`, requiresPhoto: true });
      }
      const uid = await this.core.customerUser(tx, c!.customer_id);
      if (uid) await this.notify.notify({ users: [uid], event: 'moveout.scheduled', vars: { code: c!.code, unitCode: c!.unit.code, facility: c!.facility.name, date: fmtD(date), estimate: fmt(est.net) }, link: `/app/units/${c!.public_id}/move-out`, related: { type: 'moveout_request', id: r.id }, email: true }, tx);
      await this.notify.notify({ users: await this.core.facilityManagers(tx, c!.facility_id), event: 'moveout.requested_fm', vars: { customer: c!.customer.full_name, code: c!.code, unitCode: c!.unit.code, date: fmtD(date) }, link: '/manage/moveouts', related: { type: 'moveout_request', id: r.id }, email: false }, tx);
      await this.audit.log(ctx, { action: 'moveout.request', entityType: 'contract', entityId: c!.id, entityRef: c!.code, facilityId: c!.facility_id, after: { date: d.date, noticeOk } }, tx);
      return r;
    });
    return { ...req, estimate: est };
  }

  private async requestFor(ctx: AccessContext, publicId: string, perm: string, write = true) {
    const r = await this.prisma.moveOutRequest.findUnique({ where: { public_id: publicId }, include: { contract: { include: { unit: { include: { zone: true } }, facility: true, customer: true } } } });
    if (!r) throw notFound('Yêu cầu trả kho');
    ctx.assertScope(perm, r.contract, 'Yêu cầu trả kho', write);
    return r;
  }

  async cancel(ctx: AccessContext, publicId: string) {
    const r = await this.requestFor(ctx, publicId, 'moveout.request');
    if (r.status !== 'SCHEDULED') throw new AppError('INVALID_STATUS_TRANSITION', 'Chỉ hủy được yêu cầu chưa kiểm tra');
    if (r.requested_date <= this.core.today(r.contract.facility.timezone)) throw validation('Đã đến ngày trả kho, không thể hủy');
    return this.prisma.tx(async (tx) => {
      await tx.moveOutRequest.update({ where: { id: r.id }, data: { status: 'CANCELLED', cancelled_at: this.core.now() } });
      await this.core.setContractStatus(tx, r.contract_id, r.contract.is_holdover ? 'ACTIVE' : 'ACTIVE', ctx.userId, 'Hủy yêu cầu trả kho', { effective_end_date: r.contract.is_holdover ? null : r.contract.current_end_date });
      if (r.appointment_id) await tx.appointment.update({ where: { id: r.appointment_id }, data: { status: 'CANCELLED' } });
      await tx.workTask.updateMany({ where: { OR: [{ related_type: 'move_out_request', related_id: r.id }, ...(r.appointment_id ? [{ related_type: 'appointment', related_id: r.appointment_id }] : [])], status: { notIn: ['DONE', 'CANCELLED'] } }, data: { status: 'CANCELLED' } });
      return tx.moveOutRequest.findUniqueOrThrow({ where: { id: r.id } });
    });
  }

  /** Side-by-side move-in vs move-out photos per checklist item (GET /inspections/:id/compare). */
  async compare(ctx: AccessContext, contractId: bigint) {
    const c = await this.prisma.contract.findUniqueOrThrow({ where: { id: contractId } });
    ctx.assertScope('contract.read', c, 'Hợp đồng');
    const ins = await this.prisma.inspection.findMany({ where: { contract_id: c.id, type: { in: ['MOVE_IN', 'MOVE_OUT'] }, status: 'COMPLETED' }, include: { items: true, damage_items: true }, orderBy: { id: 'asc' } });
    const moveIn = ins.find((i) => i.type === 'MOVE_IN');
    const moveOut = [...ins].reverse().find((i) => i.type === 'MOVE_OUT');
    const ids = [...(moveIn?.items ?? []), ...(moveOut?.items ?? [])].map((i) => i.id);
    const photos = await this.media.listFor('inspection_item', ids);
    const damagePhotos = moveOut ? await this.media.listFor('damage_item', moveOut.damage_items.map((d) => d.id)) : [];
    const codes = [...new Set([...(moveIn?.items ?? []), ...(moveOut?.items ?? [])].map((i) => i.item_code))];
    return {
      moveIn: moveIn ? { id: moveIn.public_id, completedAt: moveIn.completed_at, overall: moveIn.overall_condition } : null,
      moveOut: moveOut ? { id: moveOut.public_id, completedAt: moveOut.completed_at, overall: moveOut.overall_condition } : null,
      items: codes.map((code) => {
        const a = moveIn?.items.find((i) => i.item_code === code);
        const b = moveOut?.items.find((i) => i.item_code === code);
        return {
          code,
          before: a ? { condition: a.condition, note: a.note, photos: photos.filter((p) => p.related_id === a.id).map((p) => p.url) } : null,
          after: b ? { condition: b.condition, note: b.note, photos: photos.filter((p) => p.related_id === b.id).map((p) => p.url) } : null,
          changed: !!a && !!b && a.condition !== b.condition,
        };
      }),
      damages: (moveOut?.damage_items ?? []).map((d) => ({ ...d, id: d.id.toString(), photos: damagePhotos.filter((p) => p.related_id === d.id).map((p) => p.url) })),
    };
  }

  async inspect(ctx: AccessContext, publicId: string, d: InspectionInput & { damages?: { itemCode?: string; feeTypeId: string; amount?: number; description: string; photoIds: string[] }[]; leftItems?: boolean; cleaningRequired?: boolean }) {
    ctx.require('moveout.inspect');
    const r = await this.requestFor(ctx, publicId, 'moveout.inspect');
    if (r.status !== 'SCHEDULED') throw new AppError('INVALID_STATUS_TRANSITION', 'Yêu cầu trả kho không ở trạng thái chờ kiểm tra');
    const p = await this.core.policyById(r.contract.policy_version_id);
    const moveIn = await this.prisma.inspection.findFirst({ where: { contract_id: r.contract_id, type: 'MOVE_IN', status: 'COMPLETED' }, include: { items: true } });
    return this.prisma.tx(async (tx) => {
      const insp = await this.checkin.recordInspection(tx, ctx, { ...d, unitId: r.contract.unit_id, contractId: r.contract_id, type: 'MOVE_OUT', facilityId: r.contract.facility_id, minPhotos: Math.min(p.min_handover_photos, 2), comparedTo: moveIn?.id ?? null });
      let damageTotal = D(0);
      const created = [];
      const fallbackPhotos = (d.items ?? []).flatMap((it) => it.photoIds ?? []);
      for (const dm of d.damages ?? []) {
        const photoIds = dm.photoIds?.length ? dm.photoIds : fallbackPhotos.slice(0, 2);
        if (!photoIds.length) throw validation('Mỗi hư hại cần ít nhất 1 ảnh bằng chứng', [{ field: 'damages', message: 'photo required' }]);
        const ft = await tx.feeType.findUnique({ where: { id: BigInt(dm.feeTypeId) } });
        if (!ft) throw notFound('Loại phí');
        const outItem = dm.itemCode ? insp.items.find((i) => i.item_code === dm.itemCode) : null;
        const inItem = dm.itemCode ? moveIn?.items.find((i) => i.item_code === dm.itemCode) : null;
        if (dm.itemCode && inItem && outItem && inItem.condition === outItem.condition && ft.code === 'DAMAGE_FEE') throw validation(`Hạng mục ${dm.itemCode} không thay đổi so với lúc bàn giao — không thể tính phí hư hại`);
        const amount = vnd(dm.amount ?? ft.amount);
        if (dm.amount !== undefined && !D(dm.amount).eq(ft.amount) && !ft.editable_amount) throw validation(`Phí ${ft.name} không cho sửa số tiền`);
        damageTotal = damageTotal.add(amount);
        const di = await tx.damageItem.create({ data: { inspection_id: insp.id, inspection_item_id: outItem?.id ?? null, fee_type_id: ft.id, description: dm.description.slice(0, 500), amount } });
        await this.media.attach(tx, ctx, photoIds, 'damage_item', di.id, r.contract.facility_id);
        created.push(di);
      }
      const needApproval = damageTotal.gt(p.damage_approval_threshold);
      if (created.length) await tx.damageItem.updateMany({ where: { id: { in: created.map((x) => x.id) } }, data: { approval_status: needApproval ? 'PENDING' : 'NOT_REQUIRED' } });
      let cleaning = D(0);
      if (d.cleaningRequired || d.leftItems) {
        // Older catalogs have no ABANDONED_GOODS_REMOVAL: fall back to the cleaning fee instead of charging nothing.
        const ft = (d.leftItems ? await tx.feeType.findUnique({ where: { code: 'ABANDONED_GOODS_REMOVAL' } }) : null) ?? (await tx.feeType.findUnique({ where: { code: 'CLEANING_FEE' } }));
        if (ft) cleaning = vnd(ft.amount);
        if (ft) await tx.damageItem.create({ data: { inspection_id: insp.id, fee_type_id: ft.id, description: d.leftItems ? 'Khách để lại đồ — phí dọn dẹp' : 'Phí vệ sinh', amount: cleaning, approval_status: 'NOT_REQUIRED' } });
      }
      const est = await this.estimate(tx, r.contract_id, r.requested_date, damageTotal, cleaning);
      await tx.moveOutRequest.update({ where: { id: r.id }, data: { status: 'INSPECTED', inspection_id: insp.id, estimated_settlement: est } });
      if (needApproval) await this.notify.notify({ users: await this.core.facilityManagers(tx, r.contract.facility_id), event: 'damage.approval_required', vars: { amount: fmt(damageTotal), unitCode: r.contract.unit.code, code: r.contract.code }, link: '/manage/approvals', related: { type: 'moveout_request', id: r.id }, email: false }, tx);
      await this.audit.log(ctx, { action: 'moveout.inspect', entityType: 'contract', entityId: r.contract_id, entityRef: r.contract.code, facilityId: r.contract.facility_id, after: { damages: damageTotal.toString(), cleaning: cleaning.toString() } }, tx);
      return { inspection: insp.public_id, estimate: est, needApproval };
    });
  }

  async decideDamage(ctx: AccessContext, damageId: string, approve: boolean, amount?: number) {
    ctx.require('charge.adjust');
    if (!ctx.hasRole('FACILITY_MANAGER') && !ctx.hasRole('BUSINESS_OPS_MANAGER')) throw forbidden('Duyệt phí hư hại cần quyền Quản lý cơ sở');
    const di = await this.prisma.damageItem.findUnique({ where: { id: BigInt(damageId) }, include: { inspection: { include: { unit: true } } } });
    if (!di) throw notFound('Hư hại');
    ctx.assertScope('charge.adjust', { facility_id: di.inspection.unit.facility_id }, 'Hư hại', true);
    if (di.approval_status !== 'PENDING') throw new AppError('INVALID_STATUS_TRANSITION', 'Hư hại đã được xử lý');
    const u = await this.prisma.damageItem.update({ where: { id: di.id }, data: { approval_status: approve ? 'APPROVED' : 'REJECTED', approved_by: ctx.userId, amount: approve && amount !== undefined ? vnd(amount) : undefined } });
    await this.audit.log(ctx, { action: approve ? 'damage.approve' : 'damage.reject', entityType: 'damage_item', entityId: di.id, facilityId: di.inspection.unit.facility_id, after: { amount: u.amount.toString() } });
    return u;
  }

  /** Revoke access, customer signs or disputes, settlement DRAFT/DISPUTED, unit → PENDING_INSPECTION. */
  async complete(ctx: AccessContext, publicId: string, d: { agree: boolean; signature?: string; disputeReason?: string }) {
    ctx.require('moveout.inspect');
    const r = await this.requestFor(ctx, publicId, 'moveout.inspect');
    if (r.status !== 'INSPECTED') throw new AppError('INVALID_STATUS_TRANSITION', 'Cần hoàn tất kiểm tra trước');
    if (d.agree && !d.signature) throw validation('Thiếu chữ ký khách hàng');
    if (!d.agree && !d.disputeReason) throw validation('Nhập lý do không đồng ý');
    const p = await this.core.policyById(r.contract.policy_version_id);
    return this.prisma.tx(async (tx) => {
      const now = this.core.now();
      const c = r.contract;
      await this.access.revokeAll(tx, c.id, ctx.userId, 'Trả kho');
      const insp = await tx.inspection.findUniqueOrThrow({ where: { id: r.inspection_id! }, include: { items: true, damage_items: true } });
      const splitSig = splitSignature(d.signature);
      const sigMatch = d.signature ? /^data:image\/png;base64,(.+)$/.exec(splitSig.png) : null;
      const sigBuf = sigMatch ? Buffer.from(sigMatch[1], 'base64') : null;
      const moveOutSections: any[] = [
        { heading: 'Trả kho', rows: [['Hợp đồng', c.code], ['Kho', c.unit.code], ['Ngày trả', fmtD(r.requested_date)], ['Nhân viên', ctx.fullName], ['Thời điểm', fmtDT(now)], ['Khách xác nhận', d.agree ? 'Đồng ý' : `Không đồng ý: ${d.disputeReason}`]] },
        { heading: 'Hiện trạng', table: { headers: ['Hạng mục', 'Tình trạng', 'Ghi chú'], widths: [170, 110, 219], rows: insp.items.map((i) => [i.item_code, i.condition, i.note ?? '']) } },
        { heading: 'Phí phát sinh', table: { headers: ['Nội dung', 'Số tiền', 'Duyệt'], widths: [260, 120, 119], rows: insp.damage_items.map((x) => [x.description, fmt(x.amount), x.approval_status]) } },
      ];
      if (sigBuf) {
        moveOutSections.push({ image: { buffer: sigBuf, caption: 'Chữ ký khách hàng xác nhận bàn giao trả kho', width: 150, strokes: splitSig.strokes } });
      }
      const doc = await this.contracts.generateDocument(tx, c.id, 'HANDOVER_MOVE_OUT', moveOutSections, `BIÊN BẢN TRẢ KHO ${c.unit.code}`);
      let sigId: bigint | null = null;
      if (sigBuf) {
        const media = await this.media.storeServerFile(tx, { purpose: 'SIGNATURE', buffer: sigBuf, mime: 'image/png', ext: 'png', relatedType: 'handover', relatedId: c.id, facilityId: c.facility_id, locked: true });
        const s = await tx.contractSignature.create({ data: { document_id: doc.id, signer_type: 'CUSTOMER', signer_user_id: c.customer.user_id, method: 'DRAWN_SIGNATURE', signature_media_id: media.id, signed_at: now, document_sha256: doc.sha256, ip_address: ctx.ip?.slice(0, 45) } });
        sigId = s.id;
      }
      await tx.handoverRecord.create({ data: { public_id: newId(), contract_id: c.id, type: 'MOVE_OUT', inspection_id: insp.id, items_handed: { returned: true }, status: d.agree ? 'SIGNED' : 'DISPUTED', customer_signature_id: sigId, staff_user_id: ctx.userId, dispute_reason: d.disputeReason?.slice(0, 500), document_id: doc.id, signed_at: now } });
      await tx.mediaFile.updateMany({ where: { related_type: 'inspection_item', related_id: { in: insp.items.map((i) => i.id) } }, data: { is_locked: true } });
      await this.core.transitionUnit(tx, c.unit_id, 'PENDING_INSPECTION', { reason: 'Đã trả kho', actor: ctx.userId, related: { type: 'contract', id: c.id } });
      await this.core.setContractStatus(tx, c.id, 'ENDED', ctx.userId, 'Trả kho', { ended_at: now, termination_reason: 'MOVE_OUT', effective_end_date: r.requested_date });
      await tx.billingSchedule.updateMany({ where: { contract_id: c.id }, data: { status: 'ENDED' } });
      const future = await tx.invoice.findMany({ where: { contract_id: c.id, type: 'RECURRING', status: 'ISSUED', amount_paid: 0, period_start: { gte: r.requested_date } } });
      for (const inv of future) await this.reservations.voidInvoice(tx, inv.id, 'Kỳ sau ngày trả kho', ctx.userId);
      const damage = insp.damage_items.filter((x) => x.approval_status !== 'REJECTED').reduce((s, x) => s.add(x.amount), D(0));
      const est = await this.estimate(tx, c.id, r.requested_date, damage, D(0));
      const dep = await tx.deposit.findFirst({ where: { contract_id: c.id } });
      const st = await tx.depositSettlement.create({
        data: {
          public_id: newId(), contract_id: c.id, deposit_amount: dep?.held_amount ?? 0, outstanding_applied: est.outstanding, damage_total: damage, cleaning_total: 0, prepaid_refund: est.prepaidRefund,
          net_amount: est.net, status: d.agree ? 'DRAFT' : 'DISPUTED', dispute_deadline: new Date(now.getTime() + p.dispute_days * 86400000), dispute_reason: d.disputeReason?.slice(0, 500),
        },
      });
      if (!d.agree) {
        const t = await tx.supportTicket.create({
          data: {
            public_id: newId(), code: await nextCode(tx, 'SR', now.getFullYear()), facility_id: c.facility_id, customer_id: c.customer_id, contract_id: c.id, unit_id: c.unit_id, category: 'PAYMENT', priority: 'MEDIUM',
            subject: `Khiếu nại quyết toán trả kho ${c.unit.code}`, description: d.disputeReason!, channel: 'COUNTER', first_response_due_at: new Date(now.getTime() + 4 * 3600000), resolution_due_at: new Date(now.getTime() + 3 * 86400000), created_by: ctx.userId,
            events: { create: { event: 'CREATED', actor_user_id: ctx.userId, data: { source: 'move_out_dispute', settlement: st.public_id } } },
          },
        });
        await this.notify.notify({ users: await this.core.facilityManagers(tx, c.facility_id), event: 'ticket.new_fm', vars: { code: t.code, priority: t.priority, subject: t.subject }, link: `/manage/tickets/${t.public_id}`, related: { type: 'ticket', id: t.id }, email: false }, tx);
      }
      await tx.moveOutRequest.update({ where: { id: r.id }, data: { status: 'COMPLETED', estimated_settlement: est } });
      if (r.appointment_id) await tx.appointment.update({ where: { id: r.appointment_id }, data: { status: 'COMPLETED' } });
      await this.core.completeTasksFor(tx, 'move_out_request', r.id, ['MOVE_OUT_INSPECTION'], ctx.userId);
      if (r.appointment_id) await this.core.completeTasksFor(tx, 'appointment', r.appointment_id, ['MOVE_OUT_INSPECTION'], ctx.userId);
      await this.core.createTask(tx, { facilityId: c.facility_id, type: 'CLEANING', title: `Vệ sinh & kiểm tra cuối kho ${c.unit.code}`, related: { type: 'unit', id: c.unit_id }, unitId: c.unit_id, dueAt: addDays(now, 1), dedupeKey: `CLEAN:${c.id}` });
      const uid = c.customer.user_id;
      if (uid) {
        await this.notify.notify(
          {
            users: [uid],
            event: 'moveout.inspection_completed',
            vars: {
              code: c.code,
              unitCode: c.unit.code,
              facility: c.facility.name,
              net: fmt(est.net),
              damageTotal: fmt(damage),
              deposit: fmt(est.deposit),
              disputeDays: p.dispute_days,
            },
            link: `/app/units/${c.public_id}/move-out`,
            related: { type: 'moveout_request', id: r.id },
            email: true,
          },
          tx,
        );
      }
      await this.audit.log(ctx, { action: 'moveout.complete', entityType: 'contract', entityId: c.id, entityRef: c.code, facilityId: c.facility_id, after: { settlement: est, agree: d.agree } }, tx);
      return { settlement: st, estimate: est };
    });
  }

  /** Customer disputes within dispute_days (FR §6.3 rule 4). */
  async dispute(ctx: AccessContext, contractPublicId: string, reason: string) {
    const c = await this.contracts.findForCtx(ctx, contractPublicId, 'moveout.request', true);
    const st = await this.prisma.depositSettlement.findUnique({ where: { contract_id: c.id } });
    if (!st || st.status !== 'DRAFT') throw new AppError('INVALID_STATUS_TRANSITION', 'Quyết toán không thể khiếu nại');
    if (st.dispute_deadline < this.core.now()) throw validation('Đã hết hạn khiếu nại');
    return this.prisma.tx(async (tx) => {
      await tx.depositSettlement.update({ where: { id: st.id }, data: { status: 'DISPUTED', dispute_reason: reason.slice(0, 500) } });
      const now = this.core.now();
      const t = await tx.supportTicket.create({
        data: { public_id: newId(), code: await nextCode(tx, 'SR', now.getFullYear()), facility_id: c.facility_id, customer_id: c.customer_id, contract_id: c.id, category: 'PAYMENT', priority: 'MEDIUM', subject: `Khiếu nại quyết toán hợp đồng ${c.code}`, description: reason, channel: 'PORTAL', first_response_due_at: new Date(now.getTime() + 4 * 3600000), resolution_due_at: new Date(now.getTime() + 3 * 86400000), created_by: ctx.userId, events: { create: { event: 'CREATED', actor_user_id: ctx.userId } } },
      });
      return { settlement: st.public_id, ticket: t.public_id };
    });
  }

  /** Finalize: settlement invoice for fees, deposit applied to debt, remainder refunded (§6.3 3C step 7–8). */
  async finalize(ctx: AccessContext | null, settlementPublicId: string, opts: { resolveDispute?: boolean } = {}) {
    let st = await this.prisma.depositSettlement.findUnique({ where: { public_id: settlementPublicId }, include: { contract: { include: { customer: true, unit: true, facility: true } } } });
    if (!st) {
      const c = await this.prisma.contract.findFirst({
        where: { OR: [{ public_id: settlementPublicId }, { code: settlementPublicId }] },
      });
      if (c) {
        st = await this.prisma.depositSettlement.findUnique({
          where: { contract_id: c.id },
          include: { contract: { include: { customer: true, unit: true, facility: true } } },
        });
      }
    }
    if (!st) {
      const mo = await this.prisma.moveOutRequest.findUnique({ where: { public_id: settlementPublicId } });
      if (mo) {
        st = await this.prisma.depositSettlement.findUnique({
          where: { contract_id: mo.contract_id },
          include: { contract: { include: { customer: true, unit: true, facility: true } } },
        });
      }
    }
    if (!st) throw notFound('Quyết toán');
    if (ctx) {
      ctx.require('refund.approve');
      ctx.assertScope('refund.approve', st.contract, 'Quyết toán', true);
      ctx.assertNotOwnContract(st.contract.customer.user_id);
    }
    if (st.status === 'FINALIZED') throw new AppError('INVALID_STATUS_TRANSITION', 'Quyết toán đã chốt');
    if (st.status === 'DISPUTED' && !opts.resolveDispute && !ctx) throw new AppError('CONFLICT', 'Quyết toán đang có khiếu nại — giải quyết ticket trước');
    const openDispute = await this.prisma.supportTicket.count({ where: { contract_id: st.contract_id, category: 'PAYMENT', status: { notIn: ['CLOSED', 'CANCELLED', 'RESOLVED'] } } });
    if (openDispute && !opts.resolveDispute && !ctx) throw new AppError('CONFLICT', 'Còn ticket tranh chấp thanh toán đang mở');
    if (!ctx && st.dispute_deadline > this.core.now()) throw new AppError('CONFLICT', 'Chưa hết thời hạn khiếu nại');
    const pendingDamage = await this.prisma.damageItem.count({ where: { inspection: { contract_id: st.contract_id }, approval_status: 'PENDING' } });
    if (pendingDamage && !ctx) throw new AppError('CONFLICT', 'Còn phí hư hại chờ duyệt');
    const c = st.contract;
    const result = await this.prisma.tx(async (tx) => {
      const actor = ctx?.userId ?? null;
      if (pendingDamage && ctx) {
        await tx.damageItem.updateMany({ where: { inspection: { contract_id: c.id }, approval_status: 'PENDING' }, data: { approval_status: 'APPROVED', approved_by: actor } });
      }
      const p = await this.core.policyById(c.policy_version_id, tx);
      const fees = await tx.damageItem.findMany({ where: { inspection: { contract_id: c.id, type: 'MOVE_OUT' }, approval_status: { in: ['NOT_REQUIRED', 'APPROVED'] }, invoice_item_id: null }, include: { inspection: true } });
      let settlementInvoice = null;
      if (fees.length) {
        settlementInvoice = await this.core.createInvoice(tx, {
          customerId: c.customer_id, facilityId: c.facility_id, contractId: c.id, type: 'SETTLEMENT', dueDate: addDays(this.core.today(), 7), vatRate: p.vat_rate, pricesIncludeVat: p.prices_include_vat,
          items: fees.map((f) => ({ item_type: 'DAMAGE' as const, fee_type_id: f.fee_type_id, description: f.description, amount: f.amount, source_type: 'damage_item', source_id: f.id })), actor, notify: false,
        });
        for (const it of settlementInvoice.items) if (it.source_id) await tx.damageItem.update({ where: { id: it.source_id }, data: { invoice_item_id: it.id } });
      }
      const etFee = D((await this.estimate(tx, c.id, c.effective_end_date ?? c.current_end_date)).earlyTerminationFee);
      if (etFee.gt(0)) {
        const ft = await tx.feeType.findUnique({ where: { code: 'EARLY_TERMINATION_FEE' } });
        await this.core.createInvoice(tx, { customerId: c.customer_id, facilityId: c.facility_id, contractId: c.id, type: 'SETTLEMENT', dueDate: this.core.today(), vatRate: p.vat_rate, pricesIncludeVat: p.prices_include_vat, items: [{ item_type: 'FEE', fee_type_id: ft?.id, description: 'Phí chấm dứt sớm', amount: etFee }], actor, notify: false });
      }
      const dep = await tx.deposit.findFirst({ where: { contract_id: c.id } });
      let held = dep ? D(dep.held_amount) : D(0);
      const open = await tx.invoice.findMany({ where: { contract_id: c.id, status: { in: ['ISSUED', 'PARTIALLY_PAID'] } }, orderBy: [{ due_date: 'asc' }, { id: 'asc' }] });
      const outstanding = open.reduce((s, i) => s.add(D(i.total).sub(i.amount_paid).sub(i.amount_credited)), D(0));
      const apply = Prisma.Decimal.min(held, outstanding);
      if (apply.gt(0)) {
        await this.payments.applyDeposit(tx, c.customer_id, c.facility_id, open.map((i) => i.id), apply, actor);
        await this.core.ledger(tx, { customerId: c.customer_id, contractId: c.id, type: 'DEPOSIT_APPLIED', amount: 0, sourceType: 'deposit_settlement', sourceId: st.id, description: `Cấn trừ cọc ${fmt(apply)}`, actor });
        held = held.sub(apply);
      }
      let prepaidRefund = D(st.prepaid_refund);
      if (prepaidRefund.gt(0)) {
        const inv = await tx.invoice.findFirst({ where: { OR: [{ contract_id: c.id }, { reservation_id: c.reservation_id }], status: 'PAID', type: { in: ['RESERVATION', 'RENEWAL', 'RECURRING'] } }, orderBy: { id: 'desc' } });
        if (inv) await this.core.creditNote(tx, inv.id, prepaidRefund, 'Hoàn tiền thuê trả trước chưa sử dụng', actor);
        else prepaidRefund = D(0);
      }
      let refund = null;
      const refundTotal = held.add(prepaidRefund);
      // the settlement hands money back, so a facility manager is held to the same refund limit as in the approvals screen
      if (ctx && refundTotal.gt(0)) await this.payments.assertWithinFmRefundLimit(ctx, c.facility_id, refundTotal);
      if (refundTotal.gt(0)) {
        const resInv = await tx.invoice.findFirst({ where: { reservation_id: c.reservation_id, type: 'RESERVATION' }, include: { allocations: true } });
        refund = await this.payments.createRefund(tx, { customerId: c.customer_id, facilityId: c.facility_id, paymentId: resInv?.allocations[0]?.payment_id ?? null, contractId: c.id, reason: prepaidRefund.gt(0) && held.eq(0) ? 'PREPAID_RETURN' : 'DEPOSIT_RETURN', amount: refundTotal, depositPortion: held, requestedBy: actor, autoApprove: true, note: `Quyết toán trả kho ${c.code} (Tiền mặt)`, method: 'CASH' });
      }
      if (dep) {
        const applied = D(dep.applied_amount).add(apply);
        await tx.deposit.update({ where: { id: dep.id }, data: { applied_amount: applied, held_amount: held, status: held.eq(0) ? (applied.gt(0) ? 'APPLIED' : dep.status) : dep.status } });
      }
      const remaining = outstanding.sub(apply);
      if (remaining.gt(0)) await tx.customer.update({ where: { id: c.customer_id }, data: { booking_blocked: true, booking_blocked_reason: `Còn nợ ${fmt(remaining)} sau quyết toán ${c.code}` } });
      const fin = await tx.depositSettlement.update({ where: { id: st.id }, data: { status: 'FINALIZED', finalized_at: this.core.now(), finalized_by: actor, refund_id: refund?.id ?? null, settlement_invoice_id: settlementInvoice?.id ?? null, outstanding_applied: apply, net_amount: refundTotal.sub(remaining) } });
      const moveOutReq = await tx.moveOutRequest.findFirst({ where: { contract_id: c.id, status: { not: 'CANCELLED' } }, orderBy: { id: 'desc' } });
      const uid = c.customer.user_id;
      if (uid) {
        await this.notify.notify(
          {
            users: [uid],
            event: 'settlement.finalized',
            vars: {
              code: c.code,
              unitCode: c.unit.code,
              facility: c.facility.name,
              net: remaining.gt(0) ? `còn nợ ${fmt(remaining)}` : `hoàn ${fmt(refundTotal)}`,
              refundAmount: fmt(refundTotal),
              appliedAmount: fmt(apply),
              remainingDebt: fmt(remaining),
            },
            link: `/app/units/${c.public_id}/move-out`,
            related: moveOutReq ? { type: 'moveout_request', id: moveOutReq.id } : { type: 'contract', id: c.id },
            email: true,
          },
          tx,
        );
      }
      await this.audit.log(ctx, { action: 'settlement.finalize', entityType: 'deposit_settlement', entityId: st.id, entityRef: st.public_id, facilityId: c.facility_id, after: { applied: apply.toString(), refund: refundTotal.toString(), remaining: remaining.toString() } }, tx);
      return fin;
    });
    await this.closeIfDone(c.id);
    return result;
  }

  /** Staff final check (§6.3 rule 6): AVAILABLE only if no active credential, move-out record exists, cleaned. */
  async finalUnitCheck(ctx: AccessContext, unitPublicId: string, d: { cleaned: boolean; result: 'AVAILABLE' | 'MAINTENANCE'; note?: string }) {
    ctx.require('unit.status.update');
    const unit = await this.prisma.unit.findUnique({ where: { public_id: unitPublicId } });
    ctx.assertScope('unit.status.update', unit, 'Kho', true);
    if (unit!.status !== 'PENDING_INSPECTION') throw new AppError('INVALID_STATUS_TRANSITION', 'Kho không ở trạng thái chờ kiểm tra');
    const contract = await this.prisma.contract.findFirst({ where: { unit_id: unit!.id, status: { in: ['ENDED', 'TERMINATED', 'CLOSED'] } }, orderBy: { id: 'desc' } });
    const missing: string[] = [];
    if (contract) {
      const activeCreds = await this.prisma.accessCredential.count({ where: { contract_id: contract.id, status: { in: ['ACTIVE', 'SUSPENDED'] } } });
      if (activeCreds) missing.push('ACTIVE_CREDENTIALS');
      const ho = await this.prisma.handoverRecord.count({ where: { contract_id: contract.id, type: 'MOVE_OUT' } });
      const ag = await this.prisma.abandonedGoodsRecord.count({ where: { contract_id: contract.id } });
      if (!ho && !(contract.status === 'TERMINATED' && ag)) missing.push('MOVE_OUT_RECORD_MISSING');
    }
    if (d.result === 'AVAILABLE' && !d.cleaned) missing.push('NOT_CLEANED');
    if (d.result === 'AVAILABLE' && missing.length) throw new AppError('CONFLICT', 'Chưa đủ điều kiện mở bán lại kho', { missing });
    await this.prisma.tx(async (tx) => {
      const now = this.core.now();
      await this.core.transitionUnit(tx, unit!.id, d.result, { reason: d.note ?? (d.result === 'AVAILABLE' ? 'Đã vệ sinh, mở bán lại' : 'Cần bảo trì sau trả kho'), actor: ctx.userId, extra: d.result === 'AVAILABLE' ? { last_vacated_at: now, cleaned_at: now } : { cleaned_at: d.cleaned ? now : undefined } });
      if (d.result === 'MAINTENANCE') await tx.workOrder.create({ data: { public_id: newId(), code: await nextCode(tx, 'WO', now.getFullYear()), facility_id: unit!.facility_id, unit_id: unit!.id, category: 'OTHER', description: d.note ?? 'Bảo trì sau trả kho', status: 'REPORTED', reported_by: ctx.userId } });
      const allocs = await tx.unitAllocation.findMany({ where: { unit_id: unit!.id, status: 'ACTIVE' } });
      for (const a of allocs) await tx.unitAllocation.update({ where: { id: a.id }, data: { status: 'RELEASED', released_at: now, release_reason: contract?.status === 'TERMINATED' ? 'TERMINATED' : 'MOVED_OUT' } });
      await this.core.completeTasksFor(tx, 'unit', unit!.id, ['CLEANING'], ctx.userId, d.note);
    });
    if (contract) await this.closeIfDone(contract.id);
    return this.prisma.unit.findUniqueOrThrow({ where: { id: unit!.id } });
  }

  /** ENDED/TERMINATED → CLOSED when balance = 0 and deposit settled (§6.3 3C step 10). */
  async closeIfDone(contractId: bigint) {
    const c = await this.prisma.contract.findUniqueOrThrow({ where: { id: contractId } });
    if (!['ENDED', 'TERMINATED'].includes(c.status)) return false;
    const st = await this.prisma.depositSettlement.findUnique({ where: { contract_id: c.id } });
    if (!st || st.status !== 'FINALIZED') return false;
    const open = await this.prisma.invoice.count({ where: { contract_id: c.id, status: { in: ['ISSUED', 'PARTIALLY_PAID'] } } });
    if (open) return false;
    if (st.refund_id) {
      const r = await this.prisma.refund.findUnique({ where: { id: st.refund_id } });
      if (r && !['SUCCEEDED', 'REJECTED'].includes(r.status)) return false;
    }
    const unit = await this.prisma.unit.findUniqueOrThrow({ where: { id: c.unit_id } });
    if (unit.status === 'PENDING_INSPECTION') return false;
    await this.prisma.tx((tx) => this.core.setContractStatus(tx, c.id, 'CLOSED', null, 'Đã quyết toán xong', { closed_at: this.core.now() }));
    return true;
  }

  async autoFinalizeJob() {
    const due = await this.prisma.depositSettlement.findMany({ where: { status: 'DRAFT', dispute_deadline: { lte: this.core.now() } }, take: 100 });
    let n = 0;
    for (const s of due) {
      try {
        await this.finalize(null, s.public_id);
        n += 1;
      } catch {
        /* waiting for damage approval / dispute */
      }
    }
    const ended = await this.prisma.contract.findMany({ where: { status: { in: ['ENDED', 'TERMINATED'] } }, select: { id: true }, take: 500 });
    for (const c of ended) await this.closeIfDone(c.id);
    return n;
  }

  ymd = ymd;
}
