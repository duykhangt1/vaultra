import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService, Tx } from '../common/prisma.service';
import { AppError, forbidden, notFound, validation } from '../common/errors';
import { D, newId, nextCode, nextCustomerCode, vnd } from '../common/util';
import { addDays, addMonths, dateOnly, diffDays, timeIn, weekdayIn, ymd, zonedToUtc } from '../common/dates';
import { CoreService, fmt, fmtD, fmtDT } from '../domain/core.service';
import { PricingService, QuoteLine } from '../domain/pricing.service';
import { PaymentService } from '../billing/payment.service';
import { ContractService } from '../contract/contract.service';
import { NotificationService } from '../notifications/notification.service';
import { AuditService } from '../audit/audit.service';
import { EventsService } from '../common/events.service';
import { ContextService } from '../auth/context.service';
import type { AccessContext } from '../auth/access-context';
import { Prisma } from '../generated/prisma/client';

const OPEN_RES = ['CONFIRMED', 'UNIT_ASSIGNED', 'MOVE_IN_SCHEDULED'] as const;

@Injectable()
export class ReservationService implements OnModuleInit {
  constructor(
    private prisma: PrismaService,
    private core: CoreService,
    private pricing: PricingService,
    private payments: PaymentService,
    private contracts: ContractService,
    private notify: NotificationService,
    private audit: AuditService,
    private events: EventsService,
    private contexts: ContextService,
  ) {}

  onModuleInit() {
    this.payments.onInvoicePaid(async (tx, inv, actor) => {
      if (inv.type === 'RESERVATION' && inv.reservation_id) await this.confirm(tx, inv.reservation_id, actor);
    });
    this.payments.onPaymentSucceeded(async (tx, p, actor) => this.handleLatePayment(tx, p, actor));
  }

  // ------------------------------------------------------------------ create (F1 step 4)
  async create(
    ctx: AccessContext,
    d: {
      quoteId: string;
      customerId?: string;
      notes?: string;
      channel?: 'ONLINE' | 'COUNTER' | 'PHONE';
      paymentChoice?: 'ONLINE' | 'COUNTER';
      appointment?: { date: string; slotId: string; notes?: string };
    },
  ) {
    ctx.require('reservation.create');
    const grant = ctx.grant('reservation.create')!;
    let customerId: bigint;
    let channel: 'ONLINE' | 'COUNTER' | 'PHONE' = d.paymentChoice === 'COUNTER' || d.channel === 'COUNTER' ? 'COUNTER' : 'ONLINE';
    if (grant.scope === 'OWN' || !d.customerId) {
      if (ctx.customerId) {
        customerId = ctx.customerId;
      } else {
        let existingCustomer = await this.prisma.customer.findFirst({ where: { user_id: ctx.userId, deleted_at: null } });
        if (!existingCustomer) {
          const usr = await this.prisma.user.findUnique({ where: { id: ctx.userId } });
          if (!usr) throw validation('Vui lòng đăng nhập lại để đặt kho');
          existingCustomer = await this.prisma.tx(async (tx) =>
            tx.customer.create({
              data: {
                public_id: newId(),
                code: await nextCustomerCode(tx),
                user_id: usr.id,
                full_name: usr.full_name,
                email: usr.email,
                phone: usr.phone ?? '0900000000',
              },
            }),
          );
        }
        customerId = existingCustomer.id;
        ctx.customerId = customerId;
        this.contexts.invalidate(ctx.userId);
      }
    } else {
      const c = await this.prisma.customer.findUnique({ where: { public_id: d.customerId } });
      if (!c) throw notFound('Khách hàng');
      customerId = c.id;
      channel = d.channel === 'PHONE' ? 'PHONE' : 'COUNTER';
    }
    const quote = await this.prisma.quote.findUnique({ where: { public_id: d.quoteId }, include: { unit_type: { include: { facility: true } } } });
    if (!quote) throw notFound('Báo giá');
    if (quote.customer_id && quote.customer_id !== customerId && grant.scope === 'OWN') throw notFound('Báo giá');
    if (quote.status !== 'ACTIVE' || quote.expires_at < this.core.now()) throw new AppError('QUOTE_EXPIRED', 'Báo giá đã hết hạn, vui lòng tạo lại để cập nhật giá');
    const fac = quote.unit_type.facility;
    if (grant.scope === 'FACILITY' && d.customerId && !ctx.facilitiesFor('reservation.create').includes(fac.id)) throw notFound('Cơ sở');
    if (fac.status !== 'ACTIVE' || !fac.accepts_bookings) throw validation('Cơ sở tạm ngừng nhận đặt kho');
    const customer = await this.prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
    // Blocked only while a real overdue unpaid invoice exists: a terminated (DEFAULTED) contract whose debt is settled no longer counts.
    const delinquent = await this.prisma.invoice.count({ where: { customer_id: customerId, status: { in: ['ISSUED', 'PARTIALLY_PAID'] }, due_date: { lt: this.core.today() } } });
    if (customer.booking_blocked || delinquent > 0) throw new AppError('BOOKING_BLOCKED', customer.booking_blocked_reason ?? 'Tài khoản đang có công nợ quá hạn, vui lòng thanh toán trước khi đặt kho mới');
    const policy = await this.core.policyById(quote.policy_version_id).catch(async () => (await this.core.activePolicy(fac.id)).params);
    const endDate = addMonths(quote.start_date, quote.term_months);

    // Cheap lock-free pre-check: once the last unit is gone, late arrivals fail fast instead of queueing on the row lock.
    // The authoritative check is re-done under SELECT … FOR UPDATE below.
    if ((await this.core.available(this.prisma, quote.unit_type_id, quote.start_date, endDate)) <= 0) {
      throw new AppError('UNIT_TYPE_SOLD_OUT', 'Loại kho này vừa hết chỗ trong khoảng thời gian bạn chọn', { alternatives: await this.alternatives(quote.unit_type_id, quote.start_date, endDate) });
    }
    try {
      return await this.prisma.tx(async (tx) => {
        await this.core.lockUnitType(tx, quote.unit_type_id);
        const pending = await tx.reservation.count({ where: { customer_id: customerId, status: 'PENDING_PAYMENT', channel: 'ONLINE', hold_expires_at: { gt: this.core.now() } } });
        const maxPending = policy.max_pending_reservations;
        if (pending >= maxPending) throw validation(`Bạn đang có ${pending} đơn chờ thanh toán (tối đa ${maxPending})`);
        const available = await this.core.available(tx, quote.unit_type_id, quote.start_date, endDate);
        if (available <= 0) throw new AppError('UNIT_TYPE_SOLD_OUT', 'Loại kho này vừa hết chỗ trong khoảng thời gian bạn chọn');
        const used = await tx.quote.updateMany({ where: { id: quote.id, status: 'ACTIVE' }, data: { status: 'USED', customer_id: customerId } });
        if (used.count !== 1) throw new AppError('QUOTE_EXPIRED', 'Báo giá đã được sử dụng');
        const now = this.core.now();
        const res = await tx.reservation.create({
          data: {
            public_id: newId(),
            code: await nextCode(tx, 'RSV', now.getFullYear()),
            customer_id: customerId,
            facility_id: fac.id,
            unit_type_id: quote.unit_type_id,
            quote_id: quote.id,
            start_date: quote.start_date,
            end_date: endDate,
            term_months: quote.term_months,
            billing_mode: quote.billing_mode,
            status: 'PENDING_PAYMENT',
            hold_expires_at: new Date(now.getTime() + policy.hold_minutes * 60000),
            channel,
            created_by_user_id: ctx.userId,
            notes: d.notes?.slice(0, 500),
          },
        });
        await tx.reservationStatusHistory.create({ data: { reservation_id: res.id, to_status: 'PENDING_PAYMENT', actor_user_id: ctx.userId } });
        if (quote.promotion_id) {
          await tx.$queryRaw`SELECT id FROM promotions WHERE id = ${quote.promotion_id} FOR UPDATE`;
          const promo = await tx.promotion.findUniqueOrThrow({ where: { id: quote.promotion_id } });
          const held = await tx.promotionRedemption.count({ where: { promotion_id: promo.id, status: { in: ['HELD', 'CONSUMED'] } } });
          if (promo.max_redemptions !== null && held >= promo.max_redemptions) throw new AppError('PROMO_INVALID', 'Mã giảm giá vừa hết lượt sử dụng');
          // Guest quotes skip per-customer checks (§6.1 rule 8) — re-check them now that the customer is known.
          const mine = await tx.promotionRedemption.count({ where: { promotion_id: promo.id, customer_id: customerId, status: { in: ['HELD', 'CONSUMED'] } } });
          if (mine >= promo.max_per_customer) throw new AppError('PROMO_INVALID', 'Bạn đã dùng hết lượt của mã giảm giá này');
          if (promo.new_customers_only && (await tx.contract.count({ where: { customer_id: customerId, status: { notIn: ['CANCELLED'] } } })) > 0) throw new AppError('PROMO_INVALID', 'Mã giảm giá chỉ dành cho khách mới');
          await tx.promotionRedemption.create({ data: { promotion_id: promo.id, customer_id: customerId, reservation_id: res.id, status: 'HELD', discount_amount: quote.discount_total } });
        }
        const li = quote.line_items as unknown as { lines: QuoteLine[] };
        const items = li.lines.filter((l) => l.dueNow).map((l) => this.lineToItem(l, quote.promotion_id));
        const isCounter = channel === 'COUNTER';
        let appt = null;
        if (d.appointment) {
          appt = await this.bookAppointment(
            ctx,
            {
              reservationId: res.public_id,
              type: 'MOVE_IN',
              slotId: d.appointment.slotId,
              date: d.appointment.date,
              notes: d.appointment.notes ?? d.notes,
            },
            tx,
          );
        }
        let finalRes = res;
        if (isCounter) {
          const counterHoldUntil = appt ? appt.scheduled_end : addDays(quote.start_date, 1);
          const holdUntil = new Date(Math.max(res.hold_expires_at!.getTime(), counterHoldUntil.getTime()));
          finalRes = await tx.reservation.update({ where: { id: res.id }, data: { hold_expires_at: holdUntil } });
        }
        const inv = await this.core.createInvoice(tx, {
          customerId,
          facilityId: fac.id,
          reservationId: res.id,
          type: 'RESERVATION',
          dueDate: isCounter ? quote.start_date : this.core.today(fac.timezone),
          moveInDue: isCounter,
          vatRate: policy.vat_rate,
          pricesIncludeVat: policy.prices_include_vat,
          items,
          actor: ctx.userId,
          notify: true,
        });
        const uid = await this.core.customerUser(tx, customerId);
        if (uid) {
          await this.notify.notify(
            {
              users: [uid],
              event: 'reservation.pending_payment',
              vars: {
                code: finalRes.code,
                holdUntil: fmtDT(finalRes.hold_expires_at!),
                facility: fac.name,
                unitType: quote.unit_type.name,
                startDate: fmtD(finalRes.start_date),
                term: finalRes.term_months,
                amount: fmt(inv.total),
              },
              link: `/app/reservations/${finalRes.public_id}`,
              related: { type: 'reservation', id: finalRes.id },
              email: true,
            },
            tx,
          );
        }
        await this.audit.log(ctx, { action: 'reservation.create', entityType: 'reservation', entityId: finalRes.id, entityRef: finalRes.code, facilityId: fac.id, after: { invoice: inv.code, channel, appointment: appt?.public_id ?? null } }, tx);
        return { reservation: finalRes, invoice: inv, appointment: appt };
      });
    } catch (e) {
      if (e instanceof AppError && e.code === 'UNIT_TYPE_SOLD_OUT') {
        e.details = { alternatives: await this.alternatives(quote.unit_type_id, quote.start_date, endDate) };
      }
      throw e;
    }
  }

  lineToItem(l: QuoteLine, promotionId: bigint | null) {
    const map: Record<QuoteLine['type'], Prisma.InvoiceItemCreateWithoutInvoiceInput['item_type']> = { RENT: 'RENT', DISCOUNT: 'DISCOUNT', ADMIN_FEE: 'FEE', DEPOSIT: 'DEPOSIT', RENEWAL_FEE: 'FEE' };
    return {
      item_type: map[l.type],
      description: l.description,
      amount: l.amount,
      taxable: l.type === 'RENT' || l.type === 'DISCOUNT' || l.type === 'ADMIN_FEE' || l.type === 'RENEWAL_FEE',
      service_period_start: l.periodStart ? dateOnly(l.periodStart) : null,
      service_period_end: l.periodEnd ? dateOnly(l.periodEnd) : null,
      promotion_id: l.type === 'DISCOUNT' ? promotionId : null,
      source_type: l.type === 'ADMIN_FEE' ? 'fee:ADMIN_FEE' : undefined,
    };
  }

  /** Sold out: nearest alternatives — other types at the facility, same size elsewhere (§6.1 exceptions). */
  async alternatives(unitTypeId: bigint, s: Date, e: Date) {
    const ut = await this.prisma.unitType.findUniqueOrThrow({ where: { id: unitTypeId } });
    const cands = await this.prisma.unitType.findMany({
      where: { id: { not: unitTypeId }, status: 'ACTIVE', is_bookable: true, deleted_at: null, OR: [{ facility_id: ut.facility_id }, { size_category: ut.size_category }] },
      include: { facility: { select: { name: true, slug: true, public_id: true } } },
      take: 20,
    });
    const out = [];
    for (const c of cands) {
      const a = await this.core.available(this.prisma, c.id, s, e);
      if (a > 0) out.push({ id: c.public_id, name: c.name, facility: c.facility.name, facilitySlug: c.facility.slug, onlinePrice: Number(c.online_price), available: a });
      if (out.length >= 4) break;
    }
    return out;
  }

  // ------------------------------------------------------------------ confirm on payment (F1 step 6–7)
  async confirm(tx: Tx, reservationId: bigint, actor: bigint | null) {
    const r = await tx.reservation.findUniqueOrThrow({ where: { id: reservationId }, include: { quote: true, facility: true, unit_type: true } });
    if (!['PENDING_PAYMENT', 'EXPIRED'].includes(r.status)) return;
    if (r.status === 'EXPIRED') {
      await this.core.lockUnitType(tx, r.unit_type_id);
      const a = await this.core.available(tx, r.unit_type_id, r.start_date, r.end_date, r.id);
      if (a <= 0) return; // handled by handleLatePayment -> full refund
    }
    const policy = await this.core.policyById(r.quote.policy_version_id, tx);
    await this.core.setReservationStatus(tx, r.id, 'CONFIRMED', actor, r.status === 'EXPIRED' ? 'Webhook đến trễ, còn khả dụng' : 'Thanh toán thành công', { hold_expires_at: null, confirmed_at: this.core.now() });
    const inv = await tx.invoice.findFirst({ where: { reservation_id: r.id, type: 'RESERVATION' }, include: { allocations: true } });
    await tx.deposit.create({ data: { customer_id: r.customer_id, reservation_id: r.id, amount: r.quote.deposit_amount, held_amount: r.quote.deposit_amount, status: 'HELD', source_payment_id: inv?.allocations[0]?.payment_id ?? null } });
    await this.core.ledger(tx, { customerId: r.customer_id, type: 'DEPOSIT_HELD', amount: 0, sourceType: 'reservation', sourceId: r.id, description: `Giữ cọc ${fmt(r.quote.deposit_amount)}`, actor });
    const red = await tx.promotionRedemption.findUnique({ where: { reservation_id: r.id } });
    if (red && red.status === 'HELD') {
      await tx.promotionRedemption.update({ where: { id: red.id }, data: { status: 'CONSUMED' } });
      await tx.promotion.update({ where: { id: red.promotion_id }, data: { redeemed_count: { increment: 1 } } });
    }
    const li = r.quote.line_items as unknown as { lines: QuoteLine[] };
    const later = li.lines.filter((l) => !l.dueNow);
    if (later.length) {
      await this.core.createInvoice(tx, {
        customerId: r.customer_id, facilityId: r.facility_id, reservationId: r.id, type: 'MOVE_IN', dueDate: r.start_date, moveInDue: true,
        vatRate: policy.vat_rate, pricesIncludeVat: policy.prices_include_vat, items: later.map((l) => this.lineToItem(l, r.quote.promotion_id)), actor,
      });
    }
    const uid = await this.core.customerUser(tx, r.customer_id);
    if (uid) {
      await this.notify.notify(
        {
          users: [uid],
          event: 'reservation.confirmed',
          vars: { code: r.code, facility: r.facility.name, unitType: r.unit_type.name, startDate: fmtD(r.start_date), term: r.term_months },
          link: `/app/reservations/${r.public_id}`,
          related: { type: 'reservation', id: r.id },
          email: true,
        },
        tx,
      );
    }
    await this.notify.notify({ users: await this.core.facilityManagers(tx, r.facility_id), event: 'reservation.confirmed_fm', vars: { code: r.code, unitType: r.unit_type.name, startDate: fmtD(r.start_date) }, link: `/manage/reservations?focus=${r.public_id}`, related: { type: 'reservation', id: r.id }, email: false }, tx);
    await this.events.emit(tx, 'reservation.changed', { type: 'reservation', id: r.id }, { facility: r.facility.public_id, reservation: r.public_id, status: 'CONFIRMED' });
    await this.scheduleAllocation(tx, r.id, actor);
  }

  /** Do not auto-assign units on online payment: wait until check-in day for staff to verify reservation slip, assign unit, and initialize contract. */
  async scheduleAllocation(tx: Tx, reservationId: bigint, actor: bigint | null) {
    const r = await tx.reservation.findUniqueOrThrow({ where: { id: reservationId }, include: { facility: true, quote: true, unit_type: true } });
    if (!['CONFIRMED', 'MOVE_IN_SCHEDULED'].includes(r.status)) return;
    const appt = await tx.appointment.findFirst({ where: { reservation_id: r.id, type: 'MOVE_IN', status: 'BOOKED' } });
    if (appt && r.status === 'CONFIRMED') {
      await this.core.setReservationStatus(tx, r.id, 'MOVE_IN_SCHEDULED', actor, 'Đã xác nhận thanh toán & lịch hẹn nhận kho — chờ nhân viên đối soát và gán kho khi check-in');
    }
  }

  // ------------------------------------------------------------------ allocation (§6.5 5B)
  async suggestions(db: Tx | PrismaService, reservationId: bigint) {
    const r = await db.reservation.findUniqueOrThrow({ where: { id: reservationId } });
    const units = await db.unit.findMany({
      where: {
        facility_id: r.facility_id, unit_type_id: r.unit_type_id, status: 'AVAILABLE', operational_flag: 'NONE', deleted_at: null,
        allocations: { none: { status: 'ACTIVE' } },
        work_orders: { none: { status: { in: ['REPORTED', 'APPROVED', 'SCHEDULED', 'IN_PROGRESS'] } } },
      },
      include: { zone: true },
      orderBy: [{ allocation_priority: 'asc' }, { last_vacated_at: { sort: 'asc', nulls: 'first' } }, { code: 'asc' }],
      take: 20,
    });
    return units.map((u, i) => ({
      unitId: u.id,
      id: u.public_id,
      code: u.code,
      zone: u.zone.name,
      floor: u.zone.floor,
      rank: i + 1,
      reasons: [
        `Ưu tiên phân bổ ${u.allocation_priority}${u.allocation_priority < 100 ? ' (được ưu tiên)' : ''}`,
        u.last_vacated_at ? `Trống từ ${fmtD(u.last_vacated_at)}` : 'Chưa từng cho thuê',
        u.zone.floor === 1 ? 'Tầng trệt' : `Tầng ${u.zone.floor}${u.zone.has_elevator ? ', có thang máy' : ''}`,
      ],
    }));
  }

  async assign(tx: Tx, reservationId: bigint, unitId: bigint, method: 'AUTO' | 'MANUAL', actor: bigint | null, reason?: string) {
    const r = await tx.reservation.findUniqueOrThrow({ where: { id: reservationId }, include: { facility: true } });
    if (!['PENDING_PAYMENT', ...OPEN_RES].includes(r.status as string)) throw new AppError('INVALID_STATUS_TRANSITION', `Đơn ở trạng thái ${r.status} không thể phân bổ`);
    await tx.$queryRaw`SELECT id FROM units WHERE id = ${unitId} FOR UPDATE`;
    const unit = await tx.unit.findUniqueOrThrow({ where: { id: unitId }, include: { zone: true } });
    if (unit.facility_id !== r.facility_id || unit.unit_type_id !== r.unit_type_id) throw validation('Kho phải cùng cơ sở và cùng loại kho với đơn');
    if (unit.status !== 'AVAILABLE' || unit.operational_flag !== 'NONE') throw new AppError('UNIT_HAS_OPEN_ALLOCATION', `Kho ${unit.code} không còn trống`);
    const openWork = await tx.workOrder.count({ where: { unit_id: unitId, status: { in: ['REPORTED', 'APPROVED', 'SCHEDULED', 'IN_PROGRESS'] } } });
    if (openWork) throw new AppError('UNIT_HAS_OPEN_ALLOCATION', `Kho ${unit.code} đang có phiếu bảo trì chưa xong`);
    const prev = await tx.unitAllocation.findFirst({ where: { reservation_id: r.id, status: 'ACTIVE' }, include: { unit: true } });
    if (prev) await this.release(tx, prev.id, 'TRANSFERRED', actor, reason ?? 'Đổi kho');
    try {
      await tx.unitAllocation.create({ data: { unit_id: unitId, reservation_id: r.id, contract_id: r.contract_id, status: 'ACTIVE', assigned_by: actor, assigned_at: this.core.now(), assignment_method: method } });
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') throw new AppError('UNIT_HAS_OPEN_ALLOCATION', `Kho ${unit.code} vừa được phân bổ cho đơn khác`);
      throw e;
    }
    await this.core.transitionUnit(tx, unitId, 'RESERVED', { reason: `Phân bổ cho ${r.code}`, actor, related: { type: 'reservation', id: r.id } });
    const appt = await tx.appointment.findFirst({ where: { reservation_id: r.id, type: 'MOVE_IN', status: 'BOOKED' } });
    if (r.status === 'CONFIRMED' || r.status === 'UNIT_ASSIGNED') await this.core.setReservationStatus(tx, r.id, appt ? 'MOVE_IN_SCHEDULED' : 'UNIT_ASSIGNED', actor, reason);
    const contract = await this.contracts.ensureDraft(tx, r.id, unitId, actor);
    await tx.unitAllocation.updateMany({ where: { reservation_id: r.id, status: 'ACTIVE' }, data: { contract_id: contract.id } });
    await this.core.completeTasksFor(tx, 'reservation', r.id, ['ALLOCATE_UNIT'], actor, `Đã phân bổ ${unit.code}`);
    const uid = await this.core.customerUser(tx, r.customer_id);
    if (uid) {
      await this.notify.notify(
        {
          users: [uid],
          event: prev ? 'allocation.changed' : 'unit.assigned',
          vars: { code: r.code, unitCode: unit.code, zone: unit.zone.name, floor: unit.zone.floor, facility: r.facility.name, reason: reason || (prev ? 'Đổi kho' : '') },
          link: `/app/reservations/${r.public_id}`,
          related: { type: 'reservation', id: r.id },
          email: true,
        },
        tx,
      );
    }
    await this.events.emit(tx, 'reservation.changed', { type: 'reservation', id: r.id }, { facility: r.facility.public_id, reservation: r.public_id, status: 'UNIT_ASSIGNED' });
    return { unit, contract };
  }

  async release(tx: Tx, allocationId: bigint, reason: 'CANCELLED' | 'NO_SHOW' | 'TRANSFERRED' | 'MOVED_OUT' | 'TERMINATED' | 'UNIT_UNFIT', actor: bigint | null, note?: string) {
    const a = await tx.unitAllocation.update({ where: { id: allocationId }, data: { status: 'RELEASED', released_at: this.core.now(), release_reason: reason } });
    const unit = await tx.unit.findUniqueOrThrow({ where: { id: a.unit_id } });
    if (unit.status === 'RESERVED') {
      await this.core.transitionUnit(tx, a.unit_id, reason === 'UNIT_UNFIT' ? 'MAINTENANCE' : 'AVAILABLE', { reason: note ?? `Giải phóng (${reason})`, actor, related: { type: 'reservation', id: a.reservation_id } });
    }
    return a;
  }

  // ------------------------------------------------------------------ cancellation (§6.4.1 cancellation_tiers)
  async cancellationPreview(db: Tx | PrismaService, reservationId: bigint, waiveFees = false, noShow = false) {
    const r = await db.reservation.findUniqueOrThrow({ where: { id: reservationId }, include: { quote: true, facility: true, invoices: { include: { items: true } } } });
    const policy = await this.core.policyById(r.quote.policy_version_id, db);
    const startInstant = zonedToUtc(ymd(r.start_date)!, '00:00', r.facility.timezone);
    const hours = (startInstant.getTime() - this.core.now().getTime()) / 3600000;
    const tiers = [...policy.cancellation_tiers].sort((a, b) => b.minHoursBefore - a.minHoursBefore);
    const tier = waiveFees ? { minHoursBefore: 0, depositRefundPct: 100, rentRefundPct: 100 } : noShow ? tiers[tiers.length - 1] : tiers.find((t) => hours >= t.minHoursBefore) ?? tiers[tiers.length - 1];
    const resInv = r.invoices.find((i) => i.type === 'RESERVATION');
    const paid = resInv && ['PAID', 'PARTIALLY_PAID'].includes(resInv.status);
    let rentPaid = D(0);
    let adminPaid = D(0);
    let depositPaid = D(0);
    if (paid && resInv) {
      for (const it of resInv.items) {
        if (it.item_type === 'RENT' || it.item_type === 'DISCOUNT') rentPaid = rentPaid.add(it.amount);
        else if (it.item_type === 'DEPOSIT') depositPaid = depositPaid.add(it.amount);
        else if (it.item_type === 'FEE') adminPaid = adminPaid.add(it.amount);
      }
    }
    const rentRefund = vnd(rentPaid.mul(tier.rentRefundPct).div(100));
    const depositRefund = vnd(depositPaid.mul(tier.depositRefundPct).div(100));
    const adminRefund = policy.admin_fee_refundable || waiveFees ? adminPaid : D(0);
    return {
      hoursBeforeStart: Math.round(hours),
      tier,
      paid: !!paid,
      rentRefund: Number(rentRefund),
      depositRefund: Number(depositRefund),
      adminRefund: Number(adminRefund),
      depositForfeit: Number(depositPaid.sub(depositRefund)),
      totalRefund: Number(rentRefund.add(depositRefund).add(adminRefund)),
    };
  }

  async cancel(ctx: AccessContext | null, reservationId: bigint, reason: string, opts: { waiveFees?: boolean; system?: 'NO_SHOW' | 'EXPIRED' | 'CONTRACT_DECLINED' } = {}) {
    return this.prisma.tx(async (tx) => {
      const r = await tx.reservation.findUniqueOrThrow({ where: { id: reservationId }, include: { facility: true, invoices: true } });
      const target = opts.system === 'NO_SHOW' ? 'NO_SHOW' : 'CANCELLED';
      if (!['PENDING_PAYMENT', ...OPEN_RES].includes(r.status)) throw new AppError('INVALID_STATUS_TRANSITION', `Không thể hủy đơn ở trạng thái ${r.status}`);
      if (target === 'NO_SHOW' && r.status === 'PENDING_PAYMENT') throw new AppError('INVALID_STATUS_TRANSITION', 'Đơn chưa thanh toán');
      const actor = ctx?.userId ?? null;
      if (opts.waiveFees && ctx) {
        const policy = await this.core.activePolicy(r.facility_id, tx);
        const pv = await this.cancellationPreview(tx, r.id, false);
        if (pv.depositForfeit > policy.params.fm_waiver_limit && !ctx.hasRole('BUSINESS_OPS_MANAGER')) throw forbidden('Miễn phí hủy vượt hạn mức của quản lý cơ sở');
      }
      const preview = await this.cancellationPreview(tx, r.id, opts.waiveFees, target === 'NO_SHOW');
      await this.core.setReservationStatus(tx, r.id, target, actor, reason, { cancelled_at: this.core.now(), cancel_reason: reason.slice(0, 255), cancelled_by: actor, hold_expires_at: null });
      for (const inv of r.invoices) {
        if (['ISSUED'].includes(inv.status) && D(inv.amount_paid).eq(0)) await this.voidInvoice(tx, inv.id, `Hủy đơn ${r.code}`, actor);
      }
      const allocs = await tx.unitAllocation.findMany({ where: { reservation_id: r.id, status: 'ACTIVE' } });
      for (const a of allocs) await this.release(tx, a.id, target === 'NO_SHOW' ? 'NO_SHOW' : 'CANCELLED', actor, reason);
      if (r.contract_id) {
        const c = await tx.contract.findUniqueOrThrow({ where: { id: r.contract_id } });
        if (['PENDING_SIGNATURE', 'SIGNED'].includes(c.status)) await this.core.setContractStatus(tx, c.id, 'CANCELLED', actor, reason);
      }
      await tx.appointment.updateMany({ where: { reservation_id: r.id, status: 'BOOKED' }, data: { status: 'CANCELLED' } });
      await tx.workTask.updateMany({ where: { related_type: 'reservation', related_id: r.id, status: { notIn: ['DONE', 'CANCELLED'] } }, data: { status: 'CANCELLED' } });
      const red = await tx.promotionRedemption.findUnique({ where: { reservation_id: r.id } });
      if (red && red.status !== 'RELEASED') {
        await tx.promotionRedemption.update({ where: { id: red.id }, data: { status: 'RELEASED' } });
        if (red.status === 'CONSUMED') await tx.promotion.update({ where: { id: red.promotion_id }, data: { redeemed_count: { decrement: 1 } } });
      }
      const dep = await tx.deposit.findUnique({ where: { reservation_id: r.id } });
      let refund = null;
      if (preview.paid && preview.totalRefund > 0) {
        const resInv = r.invoices.find((i) => i.type === 'RESERVATION')!;
        const nonDeposit = preview.rentRefund + preview.adminRefund;
        if (nonDeposit > 0) await this.core.creditNote(tx, resInv.id, nonDeposit, `Hoàn tiền hủy đơn ${r.code}`, actor);
        const alloc = await tx.paymentAllocation.findFirst({ where: { invoice_id: resInv.id }, orderBy: { id: 'asc' } });
        refund = await this.payments.createRefund(tx, {
          customerId: r.customer_id, facilityId: r.facility_id, paymentId: alloc?.payment_id ?? null, reservationId: r.id, reason: 'CANCELLATION',
          amount: D(preview.totalRefund), depositPortion: D(preview.depositRefund), requestedBy: actor, autoApprove: true, note: reason,
        });
      }
      if (dep && preview.depositForfeit > 0) {
        await tx.deposit.update({ where: { id: dep.id }, data: { forfeited_amount: { increment: preview.depositForfeit }, held_amount: { decrement: preview.depositForfeit }, status: preview.depositRefund > 0 ? 'PARTIALLY_REFUNDED' : 'FORFEITED' } });
        await this.core.ledger(tx, { customerId: r.customer_id, type: 'DEPOSIT_FORFEITED', amount: 0, sourceType: 'reservation', sourceId: r.id, description: `Mất cọc ${fmt(preview.depositForfeit)}`, actor });
      }
      const uid = await this.core.customerUser(tx, r.customer_id);
      if (uid) {
        await this.notify.notify(
          {
            users: [uid],
            event: target === 'NO_SHOW' ? 'reservation.no_show' : 'reservation.cancelled',
            vars: { code: r.code, facility: r.facility.name, refund: fmt(preview.totalRefund), reason },
            link: `/app/reservations/${r.public_id}`,
            related: { type: 'reservation', id: r.id },
            email: true,
          },
          tx,
        );
      }
      await this.notify.notify({ users: await this.core.facilityManagers(tx, r.facility_id), event: target === 'NO_SHOW' ? 'reservation.no_show' : 'reservation.cancelled', vars: { code: r.code, facility: r.facility.name, refund: fmt(preview.totalRefund), reason }, link: `/manage/reservations?focus=${r.public_id}`, related: { type: 'reservation', id: r.id }, email: false }, tx);
      await this.audit.log(ctx, { action: target === 'NO_SHOW' ? 'reservation.no_show' : 'reservation.cancel', entityType: 'reservation', entityId: r.id, entityRef: r.code, facilityId: r.facility_id, reason, after: preview }, tx);
      return { reservation: await tx.reservation.findUniqueOrThrow({ where: { id: r.id } }), preview, refundId: refund?.public_id ?? null, refundDbId: refund?.id ?? null };
    }).then(async (out) => {
      if (out.refundDbId) await this.payments.processRefund(out.refundDbId, ctx?.userId ?? null);
      const { refundDbId, ...rest } = out;
      void refundDbId;
      return rest;
    });
  }

  async voidInvoice(tx: Tx, invoiceId: bigint, reason: string, actor: bigint | null) {
    const inv = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    if (inv.status !== 'ISSUED' || D(inv.amount_paid).gt(0)) throw new AppError('INVALID_STATUS_TRANSITION', 'Chỉ hủy được hóa đơn chưa có thanh toán');
    await tx.invoice.update({ where: { id: invoiceId }, data: { status: 'VOID', voided_at: this.core.now(), void_reason: reason.slice(0, 255) } });
    await this.core.ledger(tx, { customerId: inv.customer_id, contractId: inv.contract_id, type: 'ADJUSTMENT', amount: D(inv.total).neg(), sourceType: 'invoice_void', sourceId: inv.id, description: `Hủy ${inv.code}: ${reason}`, actor });
  }

  /** Webhook after EXPIRED (§6.1 exceptions): reinstate if still available, else full automatic refund. */
  async handleLatePayment(tx: Tx, p: Prisma.PaymentGetPayload<object>, actor: bigint | null) {
    const intended = ((p.intended_invoice_ids as string[] | null) ?? []).map((x) => BigInt(x));
    if (!intended.length) return;
    const voided = await tx.invoice.findMany({ where: { id: { in: intended }, status: 'VOID', type: 'RESERVATION' } });
    for (const inv of voided) {
      const r = await tx.reservation.findUniqueOrThrow({ where: { id: inv.reservation_id! } });
      if (r.status !== 'EXPIRED') continue;
      await this.core.lockUnitType(tx, r.unit_type_id);
      const a = await this.core.available(tx, r.unit_type_id, r.start_date, r.end_date, r.id);
      const allocated = await tx.paymentAllocation.aggregate({ where: { payment_id: p.id }, _sum: { amount: true } });
      const unallocated = D(p.amount).sub(allocated._sum.amount ?? 0);
      if (a > 0 && unallocated.gte(inv.total)) {
        await tx.invoice.update({ where: { id: inv.id }, data: { status: 'ISSUED', voided_at: null, void_reason: null } });
        await this.core.ledger(tx, { customerId: inv.customer_id, type: 'ADJUSTMENT', amount: inv.total, sourceType: 'invoice_reinstate', sourceId: inv.id, description: `Khôi phục ${inv.code}`, actor });
        await tx.paymentAllocation.create({ data: { payment_id: p.id, invoice_id: inv.id, amount: inv.total } });
        await tx.invoice.update({ where: { id: inv.id }, data: { amount_paid: inv.total } });
        await this.core.refreshInvoiceStatus(tx, inv.id);
        await this.confirm(tx, r.id, actor);
        await this.audit.log(null, { action: 'reservation.restored_late_webhook', entityType: 'reservation', entityId: r.id, entityRef: r.code, facilityId: r.facility_id }, tx);
      } else if (unallocated.gt(0)) {
        const refund = await this.payments.createRefund(tx, { customerId: r.customer_id, facilityId: r.facility_id, paymentId: p.id, reservationId: r.id, reason: 'LATE_WEBHOOK', amount: unallocated, requestedBy: null, autoApprove: true, note: 'Thanh toán đến sau khi hết hạn giữ chỗ và đã hết kho' });
        await this.audit.log(null, { action: 'refund.auto_late_webhook', entityType: 'refund', entityId: refund.id, entityRef: refund.public_id, facilityId: r.facility_id }, tx);
        await tx.refund.update({ where: { id: refund.id }, data: { status: 'MANUAL_REQUIRED', attempts: { increment: 1 } } }); // same transaction: no timer racing the commit
      }
    }
  }

  // ------------------------------------------------------------------ jobs
  async expireHolds() {
    const now = this.core.now();
    const due = await this.prisma.reservation.findMany({ where: { status: 'PENDING_PAYMENT', hold_expires_at: { lte: now } }, select: { id: true }, take: 500 });
    for (const { id } of due) {
      await this.prisma.tx(async (tx) => {
        const r = await tx.reservation.findUniqueOrThrow({ where: { id }, include: { invoices: true, facility: true } });
        if (r.status !== 'PENDING_PAYMENT') return;
        await this.core.setReservationStatus(tx, r.id, 'EXPIRED', null, 'Hết hạn giữ chỗ');
        for (const inv of r.invoices) if (inv.status === 'ISSUED' && D(inv.amount_paid).eq(0)) await this.voidInvoice(tx, inv.id, 'Hết hạn giữ chỗ', null);
        await tx.promotionRedemption.updateMany({ where: { reservation_id: r.id, status: 'HELD' }, data: { status: 'RELEASED' } });
        await tx.payment.updateMany({ where: { customer_id: r.customer_id, status: 'PENDING', expires_at: { lte: now } }, data: { status: 'EXPIRED' } });
        const uid = await this.core.customerUser(tx, r.customer_id);
        if (uid) {
          await this.notify.notify(
            {
              users: [uid],
              event: 'reservation.expired',
              vars: { code: r.code, facility: r.facility.name },
              link: `/app/reservations/${r.public_id}`,
              related: { type: 'reservation', id: r.id },
              email: true,
            },
            tx,
          );
        }
      });
    }
    return due.length;
  }

  async processNoShows() {
    const rows = await this.prisma.reservation.findMany({ where: { status: { in: [...OPEN_RES] } }, include: { quote: true, facility: true }, take: 1000 });
    let n = 0;
    for (const r of rows) {
      const p = await this.core.policyById(r.quote.policy_version_id);
      if (diffDays(this.core.today(r.facility.timezone), r.start_date) > p.no_show_days) {
        await this.cancel(null, r.id, `Không đến nhận kho sau ${p.no_show_days} ngày`, { system: 'NO_SHOW' }).catch(() => undefined);
        n += 1;
      }
    }
    return n;
  }

  // ------------------------------------------------------------------ appointments (module 15)
  async slots(facilityId: bigint, date: string, type: 'MOVE_IN' | 'MOVE_OUT') {
    const f = await this.prisma.facility.findUniqueOrThrow({ where: { id: facilityId } });
    const day = dateOnly(date);
    const closed = await this.prisma.facilityClosure.findUnique({ where: { facility_id_date: { facility_id: f.id, date: day } } });
    if (closed) return { date, closed: true, reason: closed.reason, slots: [] };
    const weekday = weekdayIn(zonedToUtc(date, '12:00', f.timezone), f.timezone);
    let rules = await this.prisma.appointmentSlot.findMany({ where: { facility_id: f.id, weekday, active: true, type: { in: [type, 'BOTH'] } }, orderBy: { start_time: 'asc' } });
    if (!rules.length) {
      await this.prisma.appointmentSlot.createMany({
        data: [
          { facility_id: f.id, weekday, start_time: '09:00', end_time: '12:00', capacity: 3, type: 'BOTH', active: true },
          { facility_id: f.id, weekday, start_time: '13:30', end_time: '17:30', capacity: 3, type: 'BOTH', active: true },
        ],
        skipDuplicates: true,
      });
      rules = await this.prisma.appointmentSlot.findMany({ where: { facility_id: f.id, weekday, active: true, type: { in: [type, 'BOTH'] } }, orderBy: { start_time: 'asc' } });
    }
    const now = this.core.now();
    const today = this.core.today(f.timezone);
    const out = [];
    for (const s of rules) {
      const start = zonedToUtc(date, s.start_time, f.timezone);
      const end = zonedToUtc(date, s.end_time, f.timezone);
      const booked = await this.prisma.appointment.count({ where: { facility_id: f.id, slot_id: s.id, scheduled_start: start, status: { in: ['BOOKED', 'ARRIVED'] } } });
      out.push({ slotId: s.id.toString(), start, end, label: `${s.start_time}–${s.end_time}`, capacity: s.capacity, remaining: Math.max(0, s.capacity - booked), past: day < today || end.getTime() <= now.getTime() });
    }
    return { date, closed: false, slots: out };
  }

  async bookAppointment(ctx: AccessContext, d: { reservationId?: string; contractId?: string; moveOutRequestId?: bigint; type: 'MOVE_IN' | 'MOVE_OUT'; slotId: string; date: string; notes?: string }, txIn?: Tx) {
    ctx.require('appointment.manage');
    const run = async (tx: Tx) => {
      let facilityId: bigint;
      let customerId: bigint;
      let reservation = null as Prisma.ReservationGetPayload<{ include: { quote: true } }> | null;
      let contract = null as Prisma.ContractGetPayload<{ include: { unit: true } }> | null;
      if (d.type === 'MOVE_IN') {
        reservation = await tx.reservation.findUnique({ where: { public_id: d.reservationId ?? '' }, include: { quote: true } });
        ctx.assertScope('appointment.manage', reservation, 'Đơn đặt thuê', true);
        if (!['PENDING_PAYMENT', 'CONFIRMED', 'UNIT_ASSIGNED', 'MOVE_IN_SCHEDULED'].includes(reservation!.status)) throw new AppError('INVALID_STATUS_TRANSITION', 'Đơn chưa xác nhận thanh toán hoặc đã kết thúc');
        facilityId = reservation!.facility_id;
        customerId = reservation!.customer_id;
      } else {
        contract = await tx.contract.findUnique({ where: { public_id: d.contractId ?? '' }, include: { unit: true } });
        ctx.assertScope('appointment.manage', contract, 'Hợp đồng', true);
        if (!['ACTIVE', 'EXPIRED', 'MOVE_OUT_SCHEDULED'].includes(contract!.status)) throw new AppError('INVALID_STATUS_TRANSITION', `Hợp đồng ở trạng thái ${contract!.status} không thể đặt lịch trả kho`);
        facilityId = contract!.facility_id;
        customerId = contract!.customer_id;
      }
      const f = await tx.facility.findUniqueOrThrow({ where: { id: facilityId } });
      if (!d.slotId || !/^\d+$/.test(String(d.slotId))) throw validation('Vui lòng chọn khung giờ hẹn hợp lệ');
      const slot = await tx.appointmentSlot.findUnique({ where: { id: BigInt(d.slotId) } });
      if (!slot || slot.facility_id !== facilityId || !slot.active) throw notFound('Khung giờ');
      await tx.$queryRaw`SELECT id FROM appointment_slots WHERE id = ${slot.id} FOR UPDATE`;
      const day = dateOnly(d.date);
      if (await tx.facilityClosure.findUnique({ where: { facility_id_date: { facility_id: facilityId, date: day } } })) throw validation('Cơ sở nghỉ ngày này');
      const start = zonedToUtc(d.date, slot.start_time, f.timezone);
      const end = zonedToUtc(d.date, slot.end_time, f.timezone);
      if (weekdayIn(start, f.timezone) !== slot.weekday) throw validation('Khung giờ không áp dụng cho ngày đã chọn');
      const today = this.core.today(f.timezone);
      if (day < today) throw validation('Không thể đặt lịch trong quá khứ');
      if (end.getTime() <= this.core.now().getTime()) throw validation('Khung giờ này đã kết thúc, vui lòng chọn khung khác');
      if (reservation) {
        const p = await this.core.policyById(reservation.quote.policy_version_id, tx).catch(async () => (await this.core.activePolicy(facilityId, tx)).params);
        const lastDay = addDays(reservation.start_date, Math.max(p.move_in_window_days, 30));
        const minDay = today < reservation.start_date ? today : reservation.start_date;
        if (day < minDay || day > lastDay) throw validation(`Ngày nhận kho phải trong khoảng ${fmtD(minDay)} – ${fmtD(lastDay)}`, [{ field: 'date', message: 'out of window' }]);
      }
      const booked = await tx.appointment.count({ where: { facility_id: facilityId, slot_id: slot.id, scheduled_start: start, status: { in: ['BOOKED', 'ARRIVED'] } } });
      if (booked >= slot.capacity) throw new AppError('CONFLICT', 'Khung giờ đã đầy, vui lòng chọn khung khác');
      const existing = await tx.appointment.findFirst({ where: { ...(reservation ? { reservation_id: reservation.id } : { contract_id: contract!.id }), type: d.type, status: 'BOOKED' } });
      if (existing) await tx.appointment.update({ where: { id: existing.id }, data: { status: 'RESCHEDULED' } });
      const appt = await tx.appointment.create({
        data: { public_id: newId(), facility_id: facilityId, type: d.type, reservation_id: reservation?.id ?? null, contract_id: contract?.id ?? reservation?.contract_id ?? null, customer_id: customerId, slot_id: slot.id, scheduled_start: start, scheduled_end: end, notes: d.notes?.slice(0, 500), assigned_staff_id: existing?.assigned_staff_id ?? null },
      });
      if (reservation && (reservation.status === 'UNIT_ASSIGNED' || reservation.status === 'CONFIRMED')) await this.core.setReservationStatus(tx, reservation.id, 'MOVE_IN_SCHEDULED', ctx.userId, 'Đặt lịch nhận kho');
      const taskType = d.type === 'MOVE_IN' ? 'HANDOVER' : 'MOVE_OUT_INSPECTION';
      if (existing) {
        await tx.workTask.updateMany({ where: { related_type: 'appointment', related_id: existing.id, status: { notIn: ['DONE', 'CANCELLED'] } }, data: { status: 'CANCELLED' } });
      }
      const code = reservation?.code ?? contract?.code ?? '';
      await this.core.createTask(tx, { facilityId, type: taskType, title: `${d.type === 'MOVE_IN' ? 'Bàn giao' : 'Kiểm tra trả kho'} ${code} lúc ${timeIn(start, f.timezone)} ${fmtD(dateOnly(d.date))}`, related: { type: 'appointment', id: appt.id }, dueAt: end, assigneeId: appt.assigned_staff_id, dedupeKey: `${taskType}:appt:${appt.id}`, priority: 'MEDIUM', source: 'SYSTEM', requiresPhoto: true });
      const typeLabel = d.type === 'MOVE_IN' ? 'nhận kho' : 'trả kho';
      const uid = await this.core.customerUser(tx, customerId);
      if (uid) {
        await this.notify.notify(
          {
            users: [uid],
            event: 'appointment.booked',
            vars: {
              typeLabel,
              when: fmtDT(start),
              facility: f.name,
              code,
              reservationCode: reservation?.code ?? '',
              contractCode: contract?.code ?? '',
              unitCode: contract?.unit?.code ?? '',
            },
            link: reservation ? `/app/reservations/${reservation.public_id}` : `/app/units/${contract!.public_id}`,
            related: { type: 'appointment', id: appt.id },
            email: true,
          },
          tx,
        );
      }
      await this.events.emit(tx, 'appointment.changed', { type: 'appointment', id: appt.id }, { facility: f.public_id, appointment: appt.public_id });
      await this.audit.log(ctx, { action: 'appointment.book', entityType: 'appointment', entityId: appt.id, entityRef: appt.public_id, facilityId, after: { type: d.type, start } }, tx);
      return appt;
    };
    return txIn ? run(txIn) : this.prisma.tx(run);
  }

  async cancelAppointment(ctx: AccessContext, publicId: string) {
    const a = await this.prisma.appointment.findUnique({ where: { public_id: publicId } });
    ctx.assertScope('appointment.manage', a, 'Lịch hẹn', true);
    if (a!.status !== 'BOOKED') throw new AppError('INVALID_STATUS_TRANSITION', 'Lịch hẹn không thể hủy');
    return this.prisma.tx(async (tx) => {
      await tx.appointment.update({ where: { id: a!.id }, data: { status: 'CANCELLED' } });
      await tx.workTask.updateMany({ where: { related_type: 'appointment', related_id: a!.id, status: { notIn: ['DONE', 'CANCELLED'] } }, data: { status: 'CANCELLED' } });
      if (a!.reservation_id) {
        const r = await tx.reservation.findUniqueOrThrow({ where: { id: a!.reservation_id } });
        if (r.status === 'MOVE_IN_SCHEDULED') {
          const alloc = await tx.unitAllocation.count({ where: { reservation_id: r.id, status: 'ACTIVE' } });
          await this.core.setReservationStatus(tx, r.id, alloc ? 'UNIT_ASSIGNED' : 'CONFIRMED', ctx.userId, 'Hủy lịch nhận kho');
        }
      }
      return tx.appointment.findUniqueOrThrow({ where: { id: a!.id } });
    });
  }

  async assignAppointment(ctx: AccessContext, publicId: string, staffPublicId: string) {
    ctx.require('task.assign');
    const a = await this.prisma.appointment.findUnique({ where: { public_id: publicId } });
    ctx.assertScope('task.assign', a, 'Lịch hẹn', true);
    const staff = await this.prisma.user.findUnique({ where: { public_id: staffPublicId } });
    if (!staff) throw notFound('Nhân viên');
    const inFacility = await this.prisma.userRole.count({ where: { user_id: staff.id, facility_id: a!.facility_id, revoked_at: null, role: { code: { in: ['FACILITY_STAFF', 'FACILITY_MANAGER'] } } } });
    if (!inFacility) throw new AppError('ASSIGNEE_NOT_IN_FACILITY', 'Nhân viên không thuộc cơ sở này');
    return this.prisma.tx(async (tx) => {
      await tx.appointment.update({ where: { id: a!.id }, data: { assigned_staff_id: staff.id } });
      const tasks = await tx.workTask.findMany({ where: { related_type: 'appointment', related_id: a!.id, status: { in: ['OPEN', 'ASSIGNED'] } } });
      for (const t of tasks) {
        await tx.workTask.update({ where: { id: t.id }, data: { assignee_id: staff.id, status: 'ASSIGNED', version: { increment: 1 } } });
        await tx.taskEvent.create({ data: { task_id: t.id, event: t.assignee_id ? 'REASSIGNED' : 'ASSIGNED', from_user_id: t.assignee_id, to_user_id: staff.id, actor_user_id: ctx.userId } });
        await this.notify.notify({ users: [staff.id], event: 'task.assigned', vars: { title: t.title, due: t.due_at ? fmtDT(t.due_at) : '' }, link: `/staff/tasks/${t.public_id}`, related: { type: 'task', id: t.id }, email: false }, tx);
      }
      return tx.appointment.findUniqueOrThrow({ where: { id: a!.id } });
    });
  }

  /** 18:00 the day before: auto-assign HANDOVER tasks round-robin to staff on shift (§6.2 step 0). */
  async autoAssignHandovers() {
    const now = this.core.now();
    const tomorrowEnd = new Date(now.getTime() + 36 * 3600000);
    const tasks = await this.prisma.workTask.findMany({ where: { type: { in: ['HANDOVER', 'MOVE_OUT_INSPECTION'] }, status: 'OPEN', due_at: { lte: tomorrowEnd } }, take: 200 });
    let n = 0;
    for (const t of tasks) {
      const appt = t.related_type === 'appointment' && t.related_id ? await this.prisma.appointment.findUnique({ where: { id: t.related_id } }) : null;
      if (!appt) continue;
      const hour = Number(timeIn(now, 'Asia/Ho_Chi_Minh').slice(0, 2));
      const isEve = hour >= 18 || appt.scheduled_start.getTime() - now.getTime() < 12 * 3600000;
      if (!isEve) continue;
      const shifts = await this.prisma.staffShift.findMany({ where: { facility_id: t.facility_id, status: 'PUBLISHED', starts_at: { lte: appt.scheduled_start }, ends_at: { gte: appt.scheduled_end } } });
      if (!shifts.length) continue;
      const loads = await Promise.all(shifts.map(async (s) => ({ u: s.user_id, n: await this.prisma.workTask.count({ where: { assignee_id: s.user_id, status: { in: ['ASSIGNED', 'IN_PROGRESS'] } } }) })));
      loads.sort((a, b) => a.n - b.n);
      await this.prisma.tx(async (tx) => {
        await tx.workTask.update({ where: { id: t.id }, data: { assignee_id: loads[0].u, status: 'ASSIGNED' } });
        await tx.taskEvent.create({ data: { task_id: t.id, event: 'ASSIGNED', to_user_id: loads[0].u, note: 'Tự giao (18:00 hôm trước)' } });
        await tx.appointment.update({ where: { id: appt.id }, data: { assigned_staff_id: loads[0].u } });
        await this.notify.notify({ users: [loads[0].u], event: 'task.assigned', vars: { title: t.title, due: fmtDT(appt.scheduled_start) }, link: `/staff/tasks/${t.public_id}`, related: { type: 'task', id: t.id }, email: false }, tx);
      });
      n += 1;
    }
    return n;
  }

  async appointmentReminders() {
    const now = this.core.now();
    const soon = await this.prisma.appointment.findMany({
      where: { status: 'BOOKED', scheduled_start: { gt: now, lte: new Date(now.getTime() + 24 * 3600000) } },
      include: { facility: true, reservation: true, contract: { include: { unit: true } }, customer: true },
    });
    let n = 0;
    for (const a of soon) {
      const hours = (a.scheduled_start.getTime() - now.getTime()) / 3600000;
      const which = hours <= 2 ? '2h' : '24h';
      if ((which === '2h' && a.reminded_2h_at) || (which === '24h' && (a.reminded_24h_at || hours <= 2))) continue;
      const uid = a.customer.user_id;
      const typeLabel = a.type === 'MOVE_IN' ? 'nhận kho' : a.type === 'MOVE_OUT' ? 'trả kho' : 'kiểm tra';
      const code = a.reservation?.code ?? a.contract?.code ?? '';
      const link = a.reservation ? `/app/reservations/${a.reservation.public_id}` : a.contract ? `/app/units/${a.contract.public_id}` : '/app';
      await this.prisma.tx(async (tx) => {
        if (uid) {
          await this.notify.notify(
            {
              users: [uid],
              event: 'appointment.reminder',
              vars: {
                typeLabel,
                when: fmtDT(a.scheduled_start),
                facility: a.facility.name,
                code,
                reservationCode: a.reservation?.code ?? '',
                contractCode: a.contract?.code ?? '',
                unitCode: a.contract?.unit?.code ?? '',
              },
              link,
              related: { type: 'appointment', id: a.id },
              email: true,
              dedupeKey: `appointment.reminder:${a.id}:${which}`,
            },
            tx,
          );
        }
        if (a.assigned_staff_id) {
          await this.notify.notify(
            {
              users: [a.assigned_staff_id],
              event: 'appointment.staff',
              vars: { typeLabel, when: fmtDT(a.scheduled_start), customer: a.customer.full_name, code },
              link: '/staff',
              related: { type: 'appointment', id: a.id },
              email: false,
              dedupeKey: `appointment.staff:${a.id}:${which}`,
            },
            tx,
          );
        }
        await tx.appointment.update({ where: { id: a.id }, data: which === '2h' ? { reminded_2h_at: now } : { reminded_24h_at: now } });
      });
      n += 1;
    }
    return n;
  }

  async markMissedAppointments() {
    const now = this.core.now();
    const rows = await this.prisma.appointment.findMany({
      where: { status: 'BOOKED', scheduled_end: { lt: new Date(now.getTime() - 2 * 3600000) } },
      include: { facility: true, reservation: true, contract: { include: { unit: true } } },
    });
    for (const a of rows) {
      await this.prisma.tx(async (tx) => {
        await tx.appointment.update({ where: { id: a.id }, data: { status: 'MISSED' } });
        if (a.reservation_id) {
          const r = await tx.reservation.findUniqueOrThrow({ where: { id: a.reservation_id } });
          if (r.status === 'MOVE_IN_SCHEDULED') {
            // Booked before allocation → the order was still CONFIRMED (§6.1), so go back there, not to UNIT_ASSIGNED.
            const alloc = await tx.unitAllocation.count({ where: { reservation_id: r.id, status: 'ACTIVE' } });
            await this.core.setReservationStatus(tx, r.id, alloc ? 'UNIT_ASSIGNED' : 'CONFIRMED', null, 'Lỡ lịch nhận kho');
          }
        }
        const uid = await this.core.customerUser(tx, a.customer_id);
        const typeLabel = a.type === 'MOVE_IN' ? 'nhận kho' : 'trả kho';
        const code = a.reservation?.code ?? a.contract?.code ?? '';
        const link = a.reservation ? `/app/reservations/${a.reservation.public_id}` : a.contract ? `/app/units/${a.contract.public_id}` : '/app';
        if (uid) {
          await this.notify.notify(
            {
              users: [uid],
              event: 'appointment.missed',
              vars: {
                typeLabel,
                when: fmtDT(a.scheduled_start),
                facility: a.facility.name,
                code,
                reservationCode: a.reservation?.code ?? '',
                contractCode: a.contract?.code ?? '',
                unitCode: a.contract?.unit?.code ?? '',
              },
              link,
              related: { type: 'appointment', id: a.id },
              email: true,
            },
            tx,
          );
        }
        await this.notify.notify(
          {
            users: await this.core.facilityManagers(tx, a.facility_id),
            event: 'appointment.missed',
            vars: { typeLabel, when: fmtDT(a.scheduled_start), facility: a.facility.name, code },
            related: { type: 'appointment', id: a.id },
            email: false,
          },
          tx,
        );
      });
    }
    return rows.length;
  }
}
