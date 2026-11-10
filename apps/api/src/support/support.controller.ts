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
}
