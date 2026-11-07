import { attach, loaders } from '../common/enrich';
import { Body, Controller, Get, Headers, Param, Patch, Post, Query, Req as R } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../common/prisma.service';
import { Ctx, Idempotent, Public, RequirePermission } from '../auth/decorators';
import { AccessContext } from '../auth/access-context';
import { clientIp, filterParam, pageParams, paged, parse, Req, zDate, zReason } from '../common/http';
import { AppError, notFound } from '../common/errors';
import { ReservationService } from './reservation.service';
import { CheckinService } from '../checkin/checkin.service';
import { CoreService } from '../domain/core.service';
import { AuditService } from '../audit/audit.service';
import { PaymentService } from '../billing/payment.service';

const inspectionSchema = z.object({
  items: z.array(z.object({ code: z.string().max(40), condition: z.enum(['OK', 'MINOR_ISSUE', 'DAMAGED', 'NOT_APPLICABLE']), note: z.string().max(500).optional(), photoIds: z.array(z.string().length(26)).max(20).optional() })).min(1),
  overall: z.enum(['GOOD', 'FAIR', 'DAMAGED']),
  notes: z.string().max(1000).optional(),
  recordedOffline: z.boolean().optional(),
});

export const RESERVATION_INCLUDE = {
  facility: { select: { public_id: true, name: true, slug: true, address_line: true, district: true, province: true, timezone: true, phone: true } },
  unit_type: {
    select: {
      public_id: true,
      name: true,
      code: true,
      area_m2: true,
      size_category: true,
      width_m: true,
      depth_m: true,
      height_m: true,
      volume_m3: true,
      online_price: true,
      list_price: true,
      climate_controlled: true,
      fits_description: true,
    },
  },
  customer: { select: { public_id: true, full_name: true, code: true, phone: true, email: true } },
  quote: { select: { monthly_rent: true, discount_total: true, admin_fee: true, deposit_amount: true, tax_total: true, due_now_total: true, line_items: true, policy_version_id: true } },
  allocations: { where: { status: 'ACTIVE' as const }, include: { unit: { select: { public_id: true, code: true, zone: { select: { code: true, name: true, floor: true } } } } } },
  appointments: { where: { status: { in: ['BOOKED' as const, 'ARRIVED' as const] } }, orderBy: { scheduled_start: 'asc' as const } },
  invoices: { select: { public_id: true, code: true, type: true, status: true, total: true, amount_paid: true, due_date: true } },
};

/** F1 (spec §6.1) reservations, allocation, appointments + F2 (§6.2) check-in sessions: §11.3, §11.4. */
@Controller()
export class ReservationController {
  constructor(private prisma: PrismaService, private svc: ReservationService, private checkin: CheckinService, private core: CoreService, private audit: AuditService, private payments: PaymentService) {}

  private async loadRes(ctx: AccessContext, id: string, perm = 'reservation.read', write = false) {
    const r = await this.prisma.reservation.findUnique({ where: { public_id: id }, include: RESERVATION_INCLUDE });
    ctx.assertScope(perm, r, 'Đơn đặt thuê', write);
    return r!;
  }

  @RequirePermission('reservation.create')
  @Idempotent()
  @Post('reservations')
  async create(@Ctx() ctx: AccessContext, @Body() body: unknown) {
    const d = parse(
      z.object({
        quoteId: z.string().min(10),
        customerId: z.string().length(26).optional(),
        notes: z.string().max(500).optional(),
        channel: z.enum(['ONLINE', 'COUNTER', 'PHONE']).optional(),
        paymentChoice: z.enum(['ONLINE', 'COUNTER']).optional(),
        appointment: z
          .object({
            date: zDate,
            slotId: z.string().min(1),
            notes: z.string().max(500).optional(),
          })
          .optional(),
      }),
      body,
    );
    const out = await this.svc.create(ctx, d);
    return { reservation: out.reservation, invoice: out.invoice, appointment: out.appointment ?? null };
  }

  @RequirePermission('reservation.read', false)
  @Get('reservations')
  async list(@Ctx() ctx: AccessContext, @Query() q: Record<string, unknown>) {
    const p = pageParams(q);
    const status = filterParam(q, 'status');
    const facilityId = filterParam(q, 'facilityId');
    const search = typeof q.q === 'string' ? q.q.trim() : '';
    const isOwn = ctx.grant('reservation.read')?.scope === 'OWN';
    const where: Record<string, unknown> = {
      ...ctx.scope('reservation.read'),
      ...(status ? { status: { in: status.split(',') } } : isOwn ? { status: { notIn: ['CHECKED_IN'] } } : {}),
      ...(facilityId ? { facility: { public_id: facilityId } } : {}),
      ...(search ? { OR: [{ code: { contains: search } }, { customer: { full_name: { contains: search } } }, { customer: { phone: { contains: search } } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.reservation.findMany({ where, include: RESERVATION_INCLUDE, orderBy: { id: 'desc' }, take: p.take, skip: p.skip }),
      this.prisma.reservation.count({ where }),
    ]);
    return paged(rows, p, total);
  }

  @RequirePermission('reservation.read', false)
  @Get('reservations/:id')
  async get(@Ctx() ctx: AccessContext, @Param('id') id: string) {
    const r = await this.loadRes(ctx, id);
    const [preview, history, contract, checkinMedia] = await Promise.all([
      ['CONFIRMED', 'UNIT_ASSIGNED', 'MOVE_IN_SCHEDULED', 'PENDING_PAYMENT'].includes(r.status) ? this.svc.cancellationPreview(this.prisma, r.id).catch(() => null) : null,
      this.prisma.reservationStatusHistory.findMany({ where: { reservation_id: r.id }, orderBy: { id: 'asc' } }),
      r.contract_id ? this.prisma.contract.findUnique({ where: { id: r.contract_id } }) : null,
      this.checkin.checkinMediaForReservation(r.id, r.customer_id).catch(() => null),
    ]);
    let pendingContractSignUrl: string | null = null;
    if (contract && contract.status === 'PENDING_SIGNATURE' && ctx.customerId === r.customer_id) {
      const cust = await this.prisma.customer.findUnique({ where: { id: r.customer_id } });
      if (cust?.user_id) {
        const tok = await this.prisma.authToken.findFirst({
          where: { user_id: cust.user_id, purpose: 'SIGN_OTP', used_at: null, expires_at: { gt: new Date() } },
          orderBy: { id: 'desc' },
        });
        const payload = tok?.payload as { contractId?: string; rawToken?: string } | undefined;
        if (payload?.contractId === contract.id.toString() && payload?.rawToken) {
          pendingContractSignUrl = `/sign-contract?contractId=${contract.public_id}&token=${payload.rawToken}`;
        }
      }
    }
    return {
      ...r,
      cancellationPreview: preview,
      history,
      qr: r.code,
      pendingContractSignUrl,
      contractPublicId: contract?.public_id ?? null,
      identityVerification: checkinMedia?.identityVerification ?? null,
      inspectionPhotos: checkinMedia?.inspectionPhotos ?? [],
    };
  }

  @Public()
  @Get('reservations/:id/checkout-summary')
  async checkoutSummary(@Param('id') id: string, @Query('payment') paymentPublicId?: string) {
    if (!paymentPublicId || paymentPublicId.trim().length < 10) throw notFound('Đơn đặt thuê');
    const [r, pay] = await Promise.all([
      this.prisma.reservation.findUnique({
        where: { public_id: id },
        include: {
          facility: RESERVATION_INCLUDE.facility,
          unit_type: RESERVATION_INCLUDE.unit_type,
          quote: { select: { monthly_rent: true, due_now_total: true, deposit_amount: true } },
          appointments: RESERVATION_INCLUDE.appointments,
          invoices: { select: { id: true, public_id: true, code: true, type: true, status: true, total: true, amount_paid: true, due_date: true } },
        },
      }),
      this.prisma.payment.findUnique({
        where: { public_id: paymentPublicId.trim() },
        select: { public_id: true, status: true, amount: true, intended_invoice_ids: true },
      }),
    ]);
    if (!r || !pay) throw notFound('Đơn đặt thuê');
    const intended = new Set(Array.isArray(pay.intended_invoice_ids) ? (pay.intended_invoice_ids as unknown[]).map(String) : []);
    const linked = r.invoices.some((inv) => intended.has(inv.id.toString()));
    if (!linked) throw notFound('Đơn đặt thuê');
    return {
      public_id: r.public_id,
      code: r.code,
      qr: r.code,
      status: r.status,
      start_date: r.start_date,
      end_date: r.end_date,
      term_months: r.term_months,
      billing_mode: r.billing_mode,
      hold_expires_at: r.hold_expires_at,
      facility: r.facility,
      unit_type: r.unit_type,
      quote: r.quote,
      appointments: r.appointments,
      invoices: r.invoices.map(({ id: _internalId, ...rest }) => rest),
      payment: { id: pay.public_id, status: pay.status, amount: pay.amount },
    };
  }

  @RequirePermission('reservation.read', false)
  @Get('reservations/:id/cancellation-preview')
  async preview(@Ctx() ctx: AccessContext, @Param('id') id: string) {
    const r = await this.loadRes(ctx, id);
    return this.svc.cancellationPreview(this.prisma, r.id);
  }

  @RequirePermission('payment.pay')
  @Idempotent()
  @Post('reservations/:id/pay')
  async pay(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') idem?: string, @R() req?: Req) {
    const d = parse(z.object({ returnPath: z.string().max(200).optional() }).optional(), body);
    const r = await this.loadRes(ctx, id, 'payment.pay', true);
    const ret = d?.returnPath && d.returnPath.startsWith('/') ? d.returnPath : `/app/reservations/${r.public_id}`;
    const resInv = r.invoices.find((i) => i.type === 'RESERVATION');
    const isAlreadyConfirmed =
      ['CONFIRMED', 'UNIT_ASSIGNED', 'MOVE_IN_SCHEDULED', 'CHECKED_IN', 'COMPLETED'].includes(r.status) ||
      resInv?.status === 'PAID' ||
      (r.invoices.length > 0 && r.invoices.every((i) => i.status === 'PAID'));
    if (isAlreadyConfirmed) {
      return {
        alreadyPaid: true,
        redirectUrl: `${ret}${ret.includes('?') ? '&' : '?'}status=SUCCEEDED`,
      };
    }
    if (r.status === 'EXPIRED' || r.status === 'CANCELLED') {
      throw new AppError(
        'CONFLICT',
        r.status === 'EXPIRED'
          ? 'Đơn đặt kho đã hết thời gian giữ chỗ, vui lòng tạo đơn đặt kho mới'
          : 'Đơn đặt kho này đã bị hủy',
      );
    }
    const inv =
      r.invoices.find((i) => i.type === 'RESERVATION' && ['ISSUED', 'PARTIALLY_PAID'].includes(i.status)) ??
      r.invoices.find((i) => ['ISSUED', 'PARTIALLY_PAID'].includes(i.status));
    if (!inv) {
      throw notFound('Hóa đơn cần thanh toán');
    }
    return this.payments.startGateway(ctx, [inv.public_id], idem, {
      expiresAt: r.hold_expires_at,
      returnPath: ret,
      ip: req ? clientIp(req) : undefined,
      req,
    });
  }

  @RequirePermission('reservation.cancel')
  @Post('reservations/:id/cancel')
  async cancel(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() body: unknown) {
    const d = parse(z.object({ reason: zReason, waiveFees: z.boolean().optional() }), body);
    const r = await this.loadRes(ctx, id, 'reservation.cancel', true);
    return this.svc.cancel(ctx, r.id, d.reason, { waiveFees: d.waiveFees && ctx.primaryRole !== 'CUSTOMER' });
  }

  @RequirePermission('allocation.assign', false)
  @Get('reservations/:id/allocation-suggestions')
  async suggestions(@Ctx() ctx: AccessContext, @Param('id') id: string) {
    const r = await this.loadRes(ctx, id, 'allocation.assign', false);
    return this.svc.suggestions(this.prisma, r.id);
  }

  @RequirePermission('allocation.assign')
  @Post('reservations/:id/allocate')
  async allocate(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() body: unknown) {
    const d = parse(z.object({ unitId: z.string().length(26), reason: z.string().trim().max(255).optional() }), body);
    const r = await this.loadRes(ctx, id, 'allocation.assign', true);
    const unit = await this.prisma.unit.findUnique({ where: { public_id: d.unitId } });
    ctx.assertScope('allocation.assign', unit, 'Kho', true);
    await this.prisma.tx((tx) => this.svc.assign(tx, r.id, unit!.id, 'MANUAL', ctx.userId, d.reason));
    return this.loadRes(ctx, id, 'allocation.assign', false);
  }

  // ---------------------------------------------------------------- appointments (F1 step 9, F3 move-out)
  @Public()
  @Get('facilities/:id/appointment-slots')
  async slots(@Ctx() _ctx: AccessContext, @Param('id') id: string, @Query('date') date: string, @Query('type') type = 'MOVE_IN') {
    parse(z.object({ date: zDate }), { date });
    const f = await this.prisma.facility.findFirst({ where: { OR: [{ public_id: id }, { slug: id }], deleted_at: null } });
    if (!f) throw notFound('Cơ sở');
    return this.svc.slots(f.id, date, type === 'MOVE_OUT' ? 'MOVE_OUT' : 'MOVE_IN');
  }

  @RequirePermission('appointment.manage')
  @Post('appointments')
  async book(@Ctx() ctx: AccessContext, @Body() body: unknown) {
    const d = parse(z.object({ reservationId: z.string().length(26).optional(), contractId: z.string().length(26).optional(), type: z.enum(['MOVE_IN', 'MOVE_OUT']), slotId: z.string().min(1), date: zDate, notes: z.string().max(500).optional() }), body);
    return this.svc.bookAppointment(ctx, d);
  }

  @RequirePermission('appointment.manage', false)
  @Get('appointments')
  async listAppointments(@Ctx() ctx: AccessContext, @Query() q: Record<string, unknown>) {
    const p = pageParams(q);
    const from = typeof q.from === 'string' ? new Date(q.from) : undefined;
    const to = typeof q.to === 'string' ? new Date(q.to) : undefined;
    const status = filterParam(q, 'status');
    const where = { ...ctx.scope('appointment.manage'), ...(status ? { status: { in: status.split(',') } } : {}), ...(from || to ? { scheduled_start: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } } : {}) };
    const rows = await this.prisma.appointment.findMany({
      where: where as never,
      include: { facility: { select: { public_id: true, name: true } }, customer: { select: { public_id: true, full_name: true, phone: true } }, reservation: { select: { public_id: true, code: true } }, contract: { select: { public_id: true, code: true } } },
      orderBy: { scheduled_start: 'asc' },
      take: p.take,
      skip: p.skip,
    }).then((r) => attach(r, 'assigned_staff_id', 'staff', loaders(this.prisma).users));
    return paged(rows, p);
  }

  @RequirePermission('appointment.manage')
  @Post('appointments/:id/cancel')
  cancelAppt(@Ctx() ctx: AccessContext, @Param('id') id: string) {
    return this.svc.cancelAppointment(ctx, id);
  }

  @RequirePermission('appointment.manage')
  @Patch('appointments/:id')
  async reschedule(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() body: unknown) {
    const d = parse(z.object({ slotId: z.string().min(1), date: zDate }), body);
    const a = await this.prisma.appointment.findUnique({ where: { public_id: id }, include: { reservation: true, contract: true } });
    ctx.assertScope('appointment.manage', a, 'Lịch hẹn', true);
    if (a!.status !== 'BOOKED') throw new AppError('INVALID_STATUS_TRANSITION', 'Lịch hẹn không thể đổi');
    // One transaction: bookAppointment marks the previous BOOKED appointment RESCHEDULED only after the new slot passed every check.
    return this.svc.bookAppointment(ctx, { type: a!.type === 'MOVE_OUT' ? 'MOVE_OUT' : 'MOVE_IN', slotId: d.slotId, date: d.date, reservationId: a!.reservation?.public_id, contractId: a!.contract?.public_id });
  }

  @RequirePermission('task.assign')
  @Post('appointments/:id/assign')
  assignAppt(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() body: unknown) {
    const d = parse(z.object({ staffId: z.string().length(26) }), body);
    return this.svc.assignAppointment(ctx, id, d.staffId);
  }

  // ---------------------------------------------------------------- check-in (F2)
  @RequirePermission('checkin.perform')
  @Get('ops/lookup')
  lookup(@Ctx() ctx: AccessContext, @Query('code') code: string) {
    return this.checkin.lookup(ctx, String(code ?? '').trim());
  }

  @RequirePermission('checkin.perform')
  @Post('checkin-sessions')
  start(@Ctx() ctx: AccessContext, @Body() body: unknown) {
    const d = parse(z.object({ reservationId: z.string().min(10), recordedOffline: z.boolean().optional() }), body);
    return this.checkin.start(ctx, d.reservationId, d.recordedOffline);
  }

  @RequirePermission('checkin.perform', false)
  @Get('checkin-sessions/:id')
  state(@Ctx() ctx: AccessContext, @Param('id') id: string) {
    return this.checkin.state(ctx, id);
  }

  @RequirePermission('checkin.perform')
  @Post('checkin-sessions/:id/verify-identity')
  verify(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() body: unknown) {
    const d = parse(
      z.object({
        documentType: z.enum(['CCCD', 'PASSPORT', 'OTHER']),
        last4: z.string().regex(/^[0-9A-Za-z]{4}$/),
        nameMatched: z.boolean(),
        notes: z.string().max(500).optional(),
        photoIds: z.array(z.string().length(26)).max(10).optional(),
      }),
      body,
    );
    return this.checkin.verifyIdentity(ctx, id, d);
  }

  @RequirePermission('payment.record_offline')
  @Idempotent()
  @Post('checkin-sessions/:id/record-payment')
  recordPayment(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() body: unknown) {
    const d = parse(z.object({ method: z.enum(['CASH', 'BANK_TRANSFER']) }), body);
    return this.checkin.recordPayment(ctx, id, d);
  }

  @RequirePermission('checkin.perform')
  @Post('checkin-sessions/:id/assign-unit')
  assignUnit(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() body: unknown) {
    const d = parse(z.object({ unitTypeId: z.string().min(10).optional(), unitId: z.string().min(10).optional() }).optional(), body);
    return this.checkin.assignUnitAndInitContract(ctx, id, d);
  }

  @RequirePermission('checkin.perform')
  @Post('checkin-sessions/:id/send-contract-email')
  sendContractEmail(@Ctx() ctx: AccessContext, @Param('id') id: string) {
    return this.checkin.sendContractEmail(ctx, id);
  }

  @RequirePermission('checkin.perform')
  @Post('checkin-sessions/:id/sign-otp')
  signOtp(@Ctx() ctx: AccessContext, @Param('id') id: string) {
    return this.checkin.sendSignOtp(ctx, id);
  }

  @RequirePermission('checkin.perform')
  @Post('checkin-sessions/:id/sign')
  sign(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() body: unknown) {
    const d = parse(z.object({ otp: z.string().regex(/^\d{6}$/), signature: z.string().min(50) }), body);
    return this.checkin.sign(ctx, id, d.otp, d.signature);
  }

  @RequirePermission('checkin.perform')
  @Post('checkin-sessions/:id/inspection')
  inspection(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() body: unknown) {
    return this.checkin.inspection(ctx, id, parse(inspectionSchema, body));
  }

  @RequirePermission('access.manage')
  @Post('checkin-sessions/:id/issue-access')
  issue(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() body: unknown) {
    const d = parse(z.object({ items: z.array(z.object({ type: z.enum(['PIN_CODE', 'ACCESS_CARD', 'FACILITY_LOCK', 'CUSTOMER_LOCK']), identifier: z.string().trim().max(64).optional() })).min(1) }), body);
    return this.checkin.issueAccess(ctx, id, d.items);
  }

  @RequirePermission('checkin.perform')
  @Post('checkin-sessions/:id/complete')
  complete(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() body: unknown) {
    const d = parse(z.object({ signature: z.string().min(50).optional(), notes: z.string().max(1000).optional() }).optional(), body);
    return this.checkin.complete(ctx, id, d?.signature, d?.notes);
  }

  @RequirePermission('checkin.perform')
  @Post('checkin-sessions/:id/abort')
  abort(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() body: unknown) {
    const d = parse(z.object({ reason: z.enum(['IDENTITY_MISMATCH', 'PAYMENT_NOT_COMPLETED', 'CONTRACT_DECLINED', 'UNIT_UNFIT', 'CUSTOMER_LEFT']), note: z.string().max(500).optional() }), body);
    return this.checkin.abort(ctx, id, d.reason, d.note);
  }

  @RequirePermission('checkin.perform')
  @Post('checkin-sessions/:id/unit-unfit')
  unfit(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() body: unknown) {
    const d = parse(z.object({ description: z.string().trim().min(5).max(500), photoIds: z.array(z.string().length(26)).max(10).optional() }), body);
    return this.checkin.markUnitUnfit(ctx, id, d.description, d.photoIds);
  }

  @RequirePermission('allocation.assign')
  @Post('checkin-sessions/:id/swap-unit')
  swap(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() body: unknown) {
    const d = parse(z.object({ unitId: z.string().length(26).optional(), reason: zReason }), body);
    return this.checkin.swapUnit(ctx, id, d.unitId, d.reason);
  }
}
