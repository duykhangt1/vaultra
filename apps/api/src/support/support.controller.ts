import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../common/prisma.service';
import { Ctx, RequirePermission } from '../auth/decorators';
import { AccessContext } from '../auth/access-context';
import { filterParam, pageParams, paged, parse, zMoney, zReason } from '../common/http';
import { forbidden, notFound } from '../common/errors';
import { SupportService } from './support.service';
import { AccessService } from '../access/access.service';
import { BillingService } from '../billing/billing.service';
import { PaymentService } from '../billing/payment.service';
import { WorkforceController } from '../workforce/workforce.controller';
import { vnd } from '../common/util';

const PRIORITY = z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']);

/** Support & incidents (spec §6.7 F7, §11.8). */
@Controller()
export class SupportController {
  constructor(private prisma: PrismaService, private svc: SupportService, private access: AccessService, private billing: BillingService, private payments: PaymentService, private work: WorkforceController) {}

  @RequirePermission('support.create')
  @Post('tickets')
  create(@Ctx() ctx: AccessContext, @Body() body: unknown) {
    const d = parse(
      z.object({
        facilityId: z.string().length(26).optional(),
        contractId: z.string().length(26).optional(),
        invoiceId: z.string().length(26).optional(),
        unitId: z.string().length(26).optional(),
        customerId: z.string().length(26).optional(),
        category: z.enum(['ACCESS_CODE', 'LOCK_KEY', 'UNIT_DAMAGE', 'STORED_ITEMS', 'PAYMENT', 'CONTRACT', 'OTHER']),
        priority: PRIORITY.optional(),
        subject: z.string().trim().min(4).max(200),
        description: z.string().trim().min(10).max(4000),
        attachmentIds: z.array(z.string().length(26)).max(10).optional(),
        channel: z.enum(['PORTAL', 'COUNTER', 'PHONE', 'STAFF_DETECTED']).optional(),
      }),
      body,
    );
    return this.svc.create(ctx, d);
  }

  @RequirePermission('support.create', false)
  @Get('tickets')
  async list(@Ctx() ctx: AccessContext, @Query() q: Record<string, unknown>) {
    const p = pageParams(q);
    const status = filterParam(q, 'status');
    const category = filterParam(q, 'category');
    const mine = filterParam(q, 'assignee') === 'me';
    const unassigned = filterParam(q, 'assignee') === 'none';
    const search = typeof q.q === 'string' ? q.q.trim() : '';
    const g = ctx.grant('support.create')!;
    const scope = g.scope === 'OWN' ? { customer_id: ctx.customerId ?? BigInt(0) } : g.scope === 'FACILITY' ? { facility_id: { in: ctx.facilitiesFor('support.create') } } : {};
    const where = {
      ...scope,
      ...(status ? { status: { in: status.split(',') } } : {}),
      ...(category ? { category: { in: category.split(',') } } : {}),
      ...(filterParam(q, 'escalated') === '1' ? { escalation_level: { gte: 1 } } : {}),
      ...(filterParam(q, 'breached') === '1' ? { sla_breached: true } : {}),
      ...(mine ? { assignee_id: ctx.userId } : {}),
      ...(unassigned ? { assignee_id: null } : {}),
      ...(search ? { OR: [{ code: { contains: search } }, { subject: { contains: search } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.supportTicket.findMany({
        where: where as never,
        include: { facility: { select: { public_id: true, name: true } }, customer: { select: { public_id: true, full_name: true } }, assignee: { select: { public_id: true, full_name: true } }, contract: { select: { public_id: true, code: true, unit: { select: { code: true } } } } },
        orderBy: [{ id: 'desc' }],
        take: p.take,
        skip: p.skip,
      }),
      this.prisma.supportTicket.count({ where: where as never }),
    ]);
    return paged(rows, p, total);
  }

  @RequirePermission('support.create', false)
  @Get('tickets/:id')
  detail(@Ctx() ctx: AccessContext, @Param('id') id: string) {
    return this.svc.detail(ctx, id);
  }

  @RequirePermission('support.create')
  @Post('tickets/:id/messages')
  message(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() body: unknown) {
    const d = parse(z.object({ body: z.string().trim().min(1).max(4000), isInternal: z.boolean().optional(), attachmentIds: z.array(z.string().length(26)).max(10).optional() }), body);
    return this.svc.message(ctx, id, d);
  }

  @RequirePermission('support.create')
  @Post('tickets/:id/:action')
  async act(@Ctx() ctx: AccessContext, @Param('id') id: string, @Param('action') action: string, @Body() body: unknown) {
    const allowed = ['claim', 'assign', 'priority', 'start', 'wait-customer', 'escalate', 'resolve', 'close', 'reopen', 'rate', 'cancel', 'merge'];
    if (!allowed.includes(action)) throw notFound('Hành động');
    const d = parse(
      z.object({
        assigneeId: z.string().length(26).optional(),
        priority: PRIORITY.optional(),
        note: z.string().max(1000).optional(),
        reason: z.string().max(500).optional(),
        resolutionCode: z.string().max(40).optional(),
        resolutionNote: z.string().max(1000).optional(),
        stars: z.number().int().min(1).max(5).optional(),
        comment: z.string().max(1000).optional(),
        intoTicketId: z.string().length(26).optional(),
      }).passthrough(),
      body,
    );
    return this.svc.action(ctx, id, action, d as Record<string, unknown>);
  }

  /** Linked actions (spec §6.7 step 6): reissue PIN, work order, fee waiver, refund — each under its own permission. */
  @RequirePermission('support.handle')
  @Post('tickets/:id/actions/:kind')
  async linked(@Ctx() ctx: AccessContext, @Param('id') id: string, @Param('kind') kind: string, @Body() body: unknown) {
    const t = await this.prisma.supportTicket.findUnique({ where: { public_id: id } });
    ctx.assertScope('support.handle', t, 'Ticket', true);
    switch (kind) {
      case 'reissue-pin': {
        ctx.require('access.manage');
        if (!t!.contract_id) throw notFound('Hợp đồng gắn với ticket');
        const out = await this.access.rotatePin(ctx, t!.contract_id);
        await this.prisma.tx((tx) => this.svc.logLinked(tx, t!.id, ctx.userId, 'reissue-pin', {}));
        return { ok: true, note: 'Mã PIN mới đã được tạo; khách xem trong ứng dụng', credential: out };
      }
      case 'work-order': {
        const d = parse(z.object({ category: z.enum(['DOOR', 'LOCK', 'ELECTRICAL', 'LEAK', 'PEST', 'CLEANING', 'FIRE_SAFETY', 'STRUCTURE', 'OTHER']), description: z.string().trim().min(5).max(1000), priority: PRIORITY.default('MEDIUM') }), body);
        return this.prisma.tx(async (tx) => {
          const wo = await this.work.createWorkOrder(tx, ctx, { facilityId: t!.facility_id, unitId: t!.unit_id, category: d.category, description: d.description, priority: d.priority, ticketId: t!.id });
          await this.svc.logLinked(tx, t!.id, ctx.userId, 'work-order', { code: (wo as { code?: string }).code });
          return wo;
        });
      }
      case 'charge': {
        // e.g. lock change / card reissue billed from the fee catalog, linked to the ticket (§6.7 step 5)
        if (!t!.contract_id) throw notFound('Hợp đồng gắn với ticket');
        const d = parse(z.object({ feeTypeId: z.string().min(1), amount: zMoney.optional(), quantity: z.number().int().min(1).max(20).optional(), note: z.string().max(255).optional() }), body);
        const c = await this.prisma.contract.findUniqueOrThrow({ where: { id: t!.contract_id } });
        return this.prisma.tx(async (tx) => {
          const inv = await this.billing.addCharge(ctx, c.public_id, { ...d, ticketId: t!.id }, tx);
          await this.svc.logLinked(tx, t!.id, ctx.userId, 'charge', { invoice: inv.code });
          return inv;
        });
      }
      case 'fee-waiver': {
        const d = parse(z.object({ invoiceItemId: z.string().min(1), amount: zMoney, reason: zReason }), body);
        const w = await this.billing.requestWaiver(ctx, { ...d, ticketId: t!.id });
        await this.prisma.tx((tx) => this.svc.logLinked(tx, t!.id, ctx.userId, 'fee-waiver', {}));
        return w;
      }
      case 'refund': {
        ctx.require('refund.request');
        const d = parse(z.object({ paymentId: z.string().length(26), amount: zMoney, note: zReason }), body);
        const pay = await this.prisma.payment.findUnique({ where: { public_id: d.paymentId } });
        if (!pay || pay.customer_id !== t!.customer_id) throw forbidden('Giao dịch không thuộc khách của ticket');
        return this.prisma.tx(async (tx) => {
          const r = await this.payments.createRefund(tx, { customerId: pay.customer_id, facilityId: pay.facility_id, paymentId: pay.id, reason: 'GOODWILL', amount: vnd(d.amount), requestedBy: ctx.userId, note: d.note, ticketId: t!.id });
          await this.svc.logLinked(tx, t!.id, ctx.userId, 'refund', { refund: r.public_id });
          return r;
        });
      }
      default:
        throw notFound('Hành động');
    }
  }
}
