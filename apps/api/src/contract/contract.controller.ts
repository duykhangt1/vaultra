import { attach, loaders } from '../common/enrich';
import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../common/prisma.service';
import { Ctx, Idempotent, Public, RequirePermission } from '../auth/decorators';
import { AccessContext } from '../auth/access-context';
import { filterParam, pageParams, paged, parse, zDate, zMoney, zReason } from '../common/http';
import { AppError, forbidden, notFound } from '../common/errors';
import { ContractService } from './contract.service';
import { AccessService } from '../access/access.service';
import { MoveOutService } from '../moveout/moveout.service';
import { RenewalService } from '../lifecycle/renewal.service';
import { DelinquencyService } from '../lifecycle/delinquency.service';
import { CoreService } from '../domain/core.service';
import { AuditService } from '../audit/audit.service';
import { SettingsService } from '../config/settings.service';
import { NotificationService } from '../notifications/notification.service';
import { newId } from '../common/util';
import { addDays } from '../common/dates';
import { SupportService } from '../support/support.service';
import { BillingService } from '../billing/billing.service';

const CONTRACT_INCLUDE = {
  customer: { select: { public_id: true, full_name: true, code: true, phone: true, email: true } },
  facility: { select: { public_id: true, name: true, slug: true, address_line: true, district: true, province: true, phone: true, timezone: true } },
  unit: { select: { public_id: true, code: true, status: true, operational_flag: true, zone: { select: { code: true, name: true, floor: true } } } },
  unit_type: { select: { public_id: true, name: true, area_m2: true, size_category: true } },
  terms: { orderBy: { sequence_no: 'asc' as const } },
};

/** Contracts, access, move-out, renewal, delinquency (spec §6.2–6.6, §11.4–11.5). */
@Controller()
export class ContractController {
  constructor(
    private prisma: PrismaService,
    private contracts: ContractService,
    private access: AccessService,
    private moveout: MoveOutService,
    private renewal: RenewalService,
    private delinq: DelinquencyService,
    private core: CoreService,
    private audit: AuditService,
    private settings: SettingsService,
    private notify: NotificationService,
    private support: SupportService,
    private billing: BillingService,
  ) {}

  private async load(ctx: AccessContext, id: string, perm = 'contract.read', write = false) {
    const c = await this.prisma.contract.findUnique({ where: { public_id: id }, include: CONTRACT_INCLUDE });
    ctx.assertScope(perm, c, 'Hợp đồng', write);
    return c!;
  }

  // ---------------------------------------------------------------- contracts
  @RequirePermission('contract.read', false)
  @Get('contracts')
  async list(@Ctx() ctx: AccessContext, @Query() q: Record<string, unknown>) {
    const p = pageParams(q);
    const status = filterParam(q, 'status');
    const delinquency = filterParam(q, 'delinquency');
    const facilityId = filterParam(q, 'facilityId');
    const search = typeof q.q === 'string' ? q.q.trim() : '';
    const expiringDays = Number(filterParam(q, 'expiringInDays') ?? 0);
    const isOwn = ctx.grant('contract.read')?.scope === 'OWN';
    const requestedStatuses = status
      ? status.split(',').filter((s) => !(isOwn && ['PENDING_SIGNATURE', 'CANCELLED'].includes(s)))
      : null;
    const where: Record<string, unknown> = {
      ...ctx.scope('contract.read'),
      status: requestedStatuses?.length ? { in: requestedStatuses } : { notIn: ['PENDING_SIGNATURE', 'CANCELLED'] },
      ...(delinquency ? { delinquency_status: { in: delinquency.split(',') } } : {}),
      ...(facilityId ? { facility: { public_id: facilityId } } : {}),
      ...(expiringDays ? { current_end_date: { lte: new Date(this.core.today().getTime() + expiringDays * 86400000) }, status: { in: ['ACTIVE'] } } : {}),
      ...(search ? { OR: [{ code: { contains: search } }, { customer: { full_name: { contains: search } } }, { unit: { code: { contains: search } } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.contract.findMany({ where: where as never, include: CONTRACT_INCLUDE, orderBy: { id: 'desc' }, take: p.take, skip: p.skip }),
      this.prisma.contract.count({ where: where as never }),
    ]);
    return paged(rows, p, total);
  }

  @RequirePermission('contract.read', false)
  @Get('contracts/:id')
  async get(@Ctx() ctx: AccessContext, @Param('id') id: string) {
    const c = await this.load(ctx, id);
    if (ctx.grant('contract.read')?.scope === 'OWN' && ['PENDING_SIGNATURE', 'CANCELLED'].includes(c.status)) {
      throw notFound('Hợp đồng chưa có hiệu lực');
    }
    const [offer, nextInvoice, openInvoices, moveOut, history, debt, handover] = await Promise.all([
      this.prisma.renewalOffer.findFirst({ where: { contract_id: c.id, status: 'OPEN' }, orderBy: { id: 'desc' } }),
      this.prisma.invoice.findFirst({ where: { contract_id: c.id, status: { in: ['ISSUED', 'PARTIALLY_PAID'] } }, orderBy: { due_date: 'asc' }, select: { public_id: true, code: true, due_date: true, total: true, amount_paid: true, status: true } }),
      this.prisma.invoice.count({ where: { contract_id: c.id, status: { in: ['ISSUED', 'PARTIALLY_PAID'] } } }),
      this.prisma.moveOutRequest.findFirst({ where: { contract_id: c.id, status: { in: ['SCHEDULED', 'INSPECTED'] } }, orderBy: { id: 'desc' } }),
      this.prisma.contractStatusHistory.findMany({ where: { contract_id: c.id }, orderBy: { id: 'asc' } }),
      this.delinq.debt(this.prisma, c.id).catch(() => null),
      this.prisma.handoverRecord.findMany({ where: { contract_id: c.id }, select: { public_id: true, type: true, status: true, signed_at: true } }),
    ]);
    const ownerView = this.contracts.termsSummary(c as never, new Date()); // end date and days left matter for every status, not only before signing
    return { ...c, renewalOffer: offer, nextInvoice, openInvoices, moveOutRequest: moveOut, history, debt, handover, termsSummary: ownerView };
  }

  @RequirePermission('contract.read', false)
  @Get('contracts/:id/documents')
  documents(@Ctx() ctx: AccessContext, @Param('id') id: string) {
    return this.contracts.documents(ctx, id);
  }

  @RequirePermission('contract.read', false)
  @Get('contracts/:id/amendments')
  async amendments(@Ctx() ctx: AccessContext, @Param('id') id: string) {
    const c = await this.load(ctx, id);
    return this.prisma.contractAmendment.findMany({ where: { contract_id: c.id }, orderBy: { id: 'desc' } });
  }

  @Public()
  @Get('contracts/:id/sign-email-info')
  async signEmailInfo(@Param('id') id: string, @Query('token') token: string) {
    const d = parse(z.object({ token: z.string().min(10) }), { token });
    return this.contracts.getSignEmailInfo(id, d.token);
  }

  @Public()
  @Post('contracts/:id/sign-by-email')
  async signByEmail(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() body: unknown) {
    const d = parse(z.object({ token: z.string().min(10), signature: z.string().min(50) }), body);
    return this.contracts.signByEmail(id, d.token, d.signature, { ip: ctx?.ip, userAgent: ctx?.userAgent });
  }

  @RequirePermission('contract.sign')
  @Post('contracts/:id/sign/otp')
  async signOtp(@Ctx() ctx: AccessContext, @Param('id') id: string) {
    if (ctx.primaryRole === 'CUSTOMER' || !ctx.can('checkin.perform', true)) {
      throw forbidden('Khách hàng không được tự ý ký hợp đồng trực tuyến. Hợp đồng chỉ được ký tại quầy cùng nhân viên cơ sở khi check-in.');
    }
    const c = await this.load(ctx, id, 'contract.sign', true);
    await this.contracts.sendSignOtp(ctx, c.id);
    return { sent: true };
  }

  @RequirePermission('contract.sign')
  @Post('contracts/:id/sign')
  async sign(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() body: unknown) {
    if (ctx.primaryRole === 'CUSTOMER' || !ctx.can('checkin.perform', true)) {
      throw forbidden('Khách hàng không được tự ý ký hợp đồng trực tuyến. Hợp đồng chỉ được ký tại quầy cùng nhân viên cơ sở khi check-in.');
    }
    const d = parse(z.object({ otp: z.string().regex(/^\d{6}$/), signature: z.string().min(50) }), body);
    const c = await this.load(ctx, id, 'contract.sign', true);
    return this.contracts.sign(ctx, c.id, d.otp, d.signature);
  }

  @RequirePermission('renewal.request')
  @Patch('contracts/:id/auto-renew')
  autoRenew(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() body: unknown) {
    return this.renewal.setAutoRenew(ctx, id, parse(z.object({ enabled: z.boolean() }), body).enabled);
  }

  @RequirePermission('contract.amend')
  @Post('contracts/:id/terminate')
  async terminate(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() body: unknown) {
    const d = parse(z.object({ reason: zReason, terminationReason: z.enum(['MOVE_OUT', 'DEFAULT', 'FACILITY_CLOSURE', 'MUTUAL', 'OTHER']).default('OTHER') }), body);
    const c = await this.load(ctx, id, 'contract.amend', true);
    if (!['ACTIVE', 'EXPIRED', 'MOVE_OUT_SCHEDULED'].includes(c.status)) throw new AppError('INVALID_STATUS_TRANSITION', 'Hợp đồng không ở trạng thái có thể chấm dứt');
    // Termination for default goes through the delinquency flow (FM confirm + BOM decision, §6.6). Direct termination = mutual/closure exceptions by FM/BOM.
    if (d.terminationReason === 'DEFAULT') throw new AppError('CONFLICT', 'Chấm dứt do vi phạm phải đi qua quy trình xử lý quá hạn (xác nhận của FM, phê duyệt của BOM)');
    const before = { status: c.status };
    await this.prisma.tx(async (tx) => {
      // Same clean-up as the default flow: state machine, access, billing, renewal, open move-out, unit and tasks - not just a status flip.
      await this.core.setContractStatus(tx, c.id, 'TERMINATED', ctx.userId, d.reason, { termination_reason: d.terminationReason, ended_at: this.core.now() });
      await this.access.revokeAll(tx, c.id, ctx.userId, `Chấm dứt hợp đồng (${d.terminationReason})`);
      await tx.billingSchedule.updateMany({ where: { contract_id: c.id }, data: { status: 'ENDED' } });
      await tx.renewalOffer.updateMany({ where: { contract_id: c.id, status: 'OPEN' }, data: { status: 'WITHDRAWN' } });
      await tx.moveOutRequest.updateMany({ where: { contract_id: c.id, status: { in: ['SCHEDULED', 'INSPECTED'] } }, data: { status: 'CANCELLED', cancelled_at: this.core.now() } });
      const unit = await tx.unit.findUniqueOrThrow({ where: { id: c.unit_id } });
      if (['OCCUPIED', 'OVERLOCKED'].includes(unit.status)) await this.core.transitionUnit(tx, c.unit_id, 'PENDING_INSPECTION', { reason: `Chấm dứt hợp đồng ${c.code}`, actor: ctx.userId, related: { type: 'contract', id: c.id } });
      await this.core.createTask(tx, { facilityId: c.facility_id, type: 'MOVE_OUT_INSPECTION', title: `Kiểm tra & thu hồi kho ${c.unit.code} (hợp đồng ${c.code} đã chấm dứt)`, related: { type: 'contract', id: c.id }, unitId: c.unit_id, priority: 'HIGH', dueAt: addDays(this.core.now(), 1), dedupeKey: `TERMINATED:${c.id}`, requiresPhoto: true });
      await tx.contractAmendment.create({ data: { contract_id: c.id, type: 'TERMINATION', before, after: { status: 'TERMINATED' }, reason: d.reason, effective_date: this.core.today(c.facility.timezone), created_by: ctx.userId } });
      await this.audit.log(ctx, { action: 'contract.terminate', entityType: 'contract', entityId: c.id, entityRef: c.code, facilityId: c.facility_id, before, after: { status: 'TERMINATED' }, reason: d.reason }, tx);
    });
    return this.load(ctx, id, 'contract.read', false);
  }

  // ---------------------------------------------------------------- access credentials
  @RequirePermission('access.manage', false)
  @Get('contracts/:id/access')
  async accessList(@Ctx() ctx: AccessContext, @Param('id') id: string) {
    const c = await this.load(ctx, id, 'access.manage');
    const canReveal = ctx.customerId === c.customer_id || ctx.can('checkin.perform', false);
    return this.access.forContract(ctx, c.id, canReveal);
  }

  @RequirePermission('access.manage')
  @Post('contracts/:id/access/pin/rotate')
  async rotate(@Ctx() ctx: AccessContext, @Param('id') id: string) {
    const c = await this.load(ctx, id, 'access.manage', true);
    return this.access.rotatePin(ctx, c.id);
  }

  /** Remote unlock / lock of the tenant's own unit: records an access event. */
  @RequirePermission('access.manage')
  @Post('contracts/:id/access/remote-unlock')
  async remoteUnlock(@Ctx() ctx: AccessContext, @Param('id') id: string) {
    const c = await this.load(ctx, id, 'access.manage', true);
    return this.access.remoteUnlock(ctx, c.id);
  }

  @RequirePermission('access.manage')
  @Post('contracts/:id/access/remote-lock')
  async remoteLock(@Ctx() ctx: AccessContext, @Param('id') id: string) {
    const c = await this.load(ctx, id, 'access.manage', true);
    return this.access.remoteLock(ctx, c.id);
  }

  @RequirePermission('access.manage')
  @Post('access-credentials/:id/report-lost')
  async lost(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() body: unknown) {
    const reason = parse(z.object({ reason: z.string().trim().max(255).default('Khách báo mất') }), body).reason || 'Khách báo mất';
    const cred = await this.access.revoke(ctx, id, reason, true);
    // §6.3 3B step 1: a lost card/key opens a LOCK_KEY ticket (F7) and bills the replacement fee from the catalog.
    const c = await this.prisma.contract.findUniqueOrThrow({ where: { id: cred.contract_id }, include: { unit: true } });
    const what = cred.type === 'ACCESS_CARD' ? 'thẻ ra vào' : 'chìa/khóa';
    const ticket = await this.support.create(ctx, {
      contractId: c.public_id, category: 'LOCK_KEY', subject: `Báo mất ${what} kho ${c.unit.code}`,
      description: `Báo mất ${what}${cred.identifier ? ` (${cred.identifier})` : ''}. ${reason}`.padEnd(10, '.'), channel: ctx.primaryRole === 'CUSTOMER' ? 'PORTAL' : 'COUNTER',
    });
    // Spec codes first; older demo databases still carry ACCESS_CARD_FEE / LOCK_REPLACEMENT_FEE.
    const feeCodes = cred.type === 'ACCESS_CARD' ? ['CARD_REPLACEMENT', 'ACCESS_CARD_FEE'] : cred.type === 'FACILITY_LOCK' ? ['KEY_REPLACEMENT', 'LOCK_REPLACEMENT_FEE'] : [];
    const found = feeCodes.length ? await this.prisma.feeType.findMany({ where: { code: { in: feeCodes }, active: true, deleted_at: null } }) : [];
    const ft = feeCodes.map((code) => found.find((f) => f.code === code)).find(Boolean) ?? null;
    let invoice = null;
    if (ft && ft.active && !ft.deleted_at) {
      const amount = this.billing.feeAmount(ft, c.monthly_rent);
      if (amount.gt(0)) {
        invoice = await this.prisma.tx(async (tx) => {
          const p = await this.core.policyById(c.policy_version_id, tx);
          const inv = await this.core.createInvoice(tx, {
            customerId: c.customer_id, facilityId: c.facility_id, contractId: c.id, type: 'AD_HOC', dueDate: addDays(this.core.today(), 7), vatRate: p.vat_rate, pricesIncludeVat: p.prices_include_vat,
            items: [{ item_type: 'FEE', fee_type_id: ft.id, description: `${ft.name} (${cred.identifier ?? what})`, amount, taxable: ft.taxable, source_type: 'ticket', source_id: ticket.id }], actor: ctx.userId,
          });
          await this.support.logLinked(tx, ticket.id, ctx.userId, 'charge', { invoice: inv.code, fee: ft.code });
          return inv;
        });
      }
    }
    return { ...cred, ticket: { id: ticket.public_id, code: ticket.code }, invoice: invoice ? { id: invoice.public_id, code: invoice.code, total: invoice.total } : null };
  }

  @RequirePermission('access.manage')
  @Post('access-credentials/:id/revoke')
  revoke(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() body: unknown) {
    if (ctx.primaryRole === 'CUSTOMER') throw forbidden();
    return this.access.revoke(ctx, id, parse(z.object({ reason: zReason }), body).reason, false);
  }

  // ---------------------------------------------------------------- move-out (F3)
  @RequirePermission('moveout.request')
  @Post('contracts/:id/move-out')
  moveOutRequest(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() body: unknown) {
    const d = parse(z.object({ date: zDate, slotId: z.string().optional(), notes: z.string().max(500).optional() }), body);
    return this.moveout.request(ctx, id, d);
  }

  @RequirePermission('moveout.request', false)
  @Get('contracts/:id/move-out-estimate')
  async estimate(@Ctx() ctx: AccessContext, @Param('id') id: string, @Query('date') date: string) {
    parse(z.object({ date: zDate }), { date });
    const c = await this.load(ctx, id, 'moveout.request');
    return this.moveout.estimate(this.prisma, c.id, new Date(`${date}T00:00:00.000Z`));
  }

  @RequirePermission('moveout.request')
  @Post('move-out-requests/:id/cancel')
  moveOutCancel(@Ctx() ctx: AccessContext, @Param('id') id: string) {
    return this.moveout.cancel(ctx, id);
  }

  @RequirePermission('moveout.inspect|refund.approve|contract.read', false)
  @Get('move-out-requests')
  async moveOutList(@Ctx() ctx: AccessContext, @Query() q: Record<string, unknown>) {
    const p = pageParams(q);
    const status = filterParam(q, 'status');
    const where = { contract: ctx.scope('contract.read'), ...(status ? { status: { in: status.split(',') } } : {}) };
    const rows = await this.prisma.moveOutRequest.findMany({ where: where as never, include: { contract: { select: { public_id: true, code: true, unit: { select: { code: true } }, customer: { select: { full_name: true } }, facility: { select: { name: true } } } } }, orderBy: { id: 'desc' }, take: p.take, skip: p.skip });
    const cids = [...new Set(rows.map((r) => r.contract_id))];
    const settlements = cids.length ? await this.prisma.depositSettlement.findMany({ where: { contract_id: { in: cids } } }) : [];
    const refunds = cids.length ? await this.prisma.refund.findMany({ where: { contract_id: { in: cids } }, orderBy: { id: 'desc' } }) : [];
    const stMap = new Map(settlements.map((s) => [s.contract_id, s]));
    const rfMap = new Map<bigint, (typeof refunds)[number]>();
    for (const rf of refunds) if (rf.contract_id && !rfMap.has(rf.contract_id)) rfMap.set(rf.contract_id, rf);
    const enriched = rows.map((r) => ({ ...r, settlement: stMap.get(r.contract_id) ?? null, refund: rfMap.get(r.contract_id) ?? null }));
    return paged(enriched, p);
  }

  @RequirePermission('moveout.inspect')
  @Post('move-out-requests/:id/inspection')
  moveOutInspect(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() body: unknown) {
    const d = parse(
      z.object({
        items: z.array(z.object({ code: z.string().max(40), condition: z.enum(['OK', 'MINOR_ISSUE', 'DAMAGED', 'NOT_APPLICABLE']), note: z.string().max(500).optional(), photoIds: z.array(z.string().length(26)).max(20).optional() })).min(1),
        overall: z.enum(['GOOD', 'FAIR', 'DAMAGED']),
        notes: z.string().max(1000).optional(),
        recordedOffline: z.boolean().optional(),
        damages: z.array(z.object({ itemCode: z.string().optional(), feeTypeId: z.string().min(1), amount: zMoney.optional(), description: z.string().trim().min(3).max(300), photoIds: z.array(z.string().length(26)).max(10) })).optional(),
        leftItems: z.boolean().optional(),
        cleaningRequired: z.boolean().optional(),
      }),
      body,
    );
    return this.moveout.inspect(ctx, id, d);
  }

  @RequirePermission('moveout.inspect')
  @Post('move-out-requests/:id/complete')
  moveOutComplete(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() body: unknown) {
    const d = parse(z.object({ agree: z.boolean(), signature: z.string().min(50).optional(), disputeReason: z.string().max(500).optional() }), body);
    return this.moveout.complete(ctx, id, d);
  }

  @RequirePermission('contract.read', false)
  @Get('contracts/:id/settlement')
  async settlement(@Ctx() ctx: AccessContext, @Param('id') id: string) {
    const c = await this.load(ctx, id);
    const s = await this.prisma.depositSettlement.findUnique({ where: { contract_id: c.id } });
    const rawDamages = await attach(await this.prisma.damageItem.findMany({ where: { inspection: { contract_id: c.id } } }), 'fee_type_id', 'fee_type', loaders(this.prisma).feeTypes);
    const damagePhotos = rawDamages.length ? await this.contracts.mediaListFor('damage_item', rawDamages.map((d) => d.id)) : [];
    const damages = rawDamages.map((d) => ({
      ...d,
      photos: damagePhotos.filter((p) => p.related_id === d.id).map((p) => ({ id: p.public_id, url: p.url, mimeType: p.mime_type, caption: p.caption })),
    }));
    const refund = s?.refund_id
      ? await this.prisma.refund.findUnique({ where: { id: s.refund_id } })
      : await this.prisma.refund.findFirst({ where: { contract_id: c.id }, orderBy: { id: 'desc' } });
    const mo = !s ? await this.prisma.moveOutRequest.findFirst({ where: { contract_id: c.id, status: { not: 'CANCELLED' } }, orderBy: { id: 'desc' } }) : null;
    return { settlement: s, damages, refund, estimated: mo?.estimated_settlement ?? null };
  }

  @RequirePermission('contract.read')
  @Post('contracts/:id/settlement/dispute')
  async dispute(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() body: unknown) {
    const c = await this.load(ctx, id, 'contract.read');
    if (ctx.customerId !== c.customer_id) throw forbidden('Chỉ chủ hợp đồng được khiếu nại quyết toán');
    return this.moveout.dispute(ctx, id, parse(z.object({ reason: zReason }), body).reason);
  }

  @RequirePermission('refund.approve')
  @Post('settlements/:id/finalize')
  finalize(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() body: unknown) {
    return this.moveout.finalize(ctx, id, parse(z.object({ resolveDispute: z.boolean().optional() }), body));
  }

  @RequirePermission('refund.approve')
  @Post('contracts/:id/settlement/finalize')
  finalizeContract(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() body: unknown) {
    return this.moveout.finalize(ctx, id, parse(z.object({ resolveDispute: z.boolean().optional() }), body));
  }

  @RequirePermission('charge.adjust')
  @Post('damage-items/:id/decide')
  decideDamage(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() body: unknown) {
    const d = parse(z.object({ approve: z.boolean(), amount: zMoney.optional() }), body);
    return this.moveout.decideDamage(ctx, id, d.approve, d.amount);
  }

  @RequirePermission('unit.status.update')
  @Post('units/:id/final-check')
  finalCheck(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() body: unknown) {
    const d = parse(z.object({ cleaned: z.boolean(), result: z.enum(['AVAILABLE', 'MAINTENANCE']), note: z.string().max(500).optional() }), body);
    return this.moveout.finalUnitCheck(ctx, id, d);
  }

  @RequirePermission('contract.read', false)
  @Get('inspections/:id/compare')
  async compare(@Ctx() ctx: AccessContext, @Param('id') id: string) {
    const insp = await this.prisma.inspection.findUnique({ where: { public_id: id }, include: { contract: true } });
    if (!insp?.contract) throw notFound('Biên bản kiểm tra');
    ctx.assertScope('contract.read', insp.contract, 'Biên bản kiểm tra');
    return this.moveout.compare(ctx, insp.contract.id);
  }

  @RequirePermission('contract.read', false)
  @Get('contracts/:id/inspections')
  async inspections(@Ctx() ctx: AccessContext, @Param('id') id: string) {
    return this.contracts.inspections(ctx, id);
  }

  // ---------------------------------------------------------------- renewal (F6)
  @RequirePermission('contract.read', false)
  @Get('contracts/:id/renewal-offer')
  offer(@Ctx() ctx: AccessContext, @Param('id') id: string) {
    return this.renewal.preview(ctx, id);
  }

  @RequirePermission('renewal.request')
  @Idempotent()
  @Post('contracts/:id/renew')
  renew(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() body: unknown) {
    const d = parse(z.object({ termMonths: z.number().int().min(1).max(36), otp: z.string().trim().regex(/^\d{6}$/).optional() }), body);
    return this.renewal.renew(ctx, id, d.termMonths, d.otp);
  }

  @RequirePermission('renewal.request')
  @Post('contracts/:id/renew/otp')
  renewOtp(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() body: unknown) {
    return this.renewal.sendOtp(ctx, id, parse(z.object({ termMonths: z.number().int().min(1).max(36) }), body).termMonths);
  }

  @RequirePermission('contract.amend')
  @Post('contracts/:id/renewal-block')
  block(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() body: unknown) {
    const d = parse(z.object({ blocked: z.boolean(), reason: zReason }), body);
    return this.renewal.setBlock(ctx, id, d.blocked, d.reason);
  }

  // ---------------------------------------------------------------- delinquency (F6 §6.6)
  @RequirePermission('delinquency.manage', false)
  @Get('delinquency')
  async delinquency(@Ctx() ctx: AccessContext, @Query() q: Record<string, unknown>) {
    const facility = filterParam(q, 'facilityId');
    let facilityId: bigint | undefined;
    if (facility) facilityId = (await this.prisma.facility.findUnique({ where: { public_id: facility } }))?.id;
    return this.delinq.list(ctx, { stage: filterParam(q, 'stage'), facilityId });
  }

  @RequirePermission('delinquency.manage', false)
  @Get('contracts/:id/collection-notes')
  async notes(@Ctx() ctx: AccessContext, @Param('id') id: string) {
    const c = await this.load(ctx, id, 'delinquency.manage');
    const [rawNotes, promises, events, rawOverlocks] = await Promise.all([
      this.prisma.collectionNote.findMany({ where: { contract_id: c.id }, orderBy: { id: 'desc' } }),
      this.prisma.promiseToPay.findMany({ where: { contract_id: c.id }, orderBy: { id: 'desc' } }),
      this.prisma.delinquencyEvent.findMany({ where: { contract_id: c.id }, orderBy: { id: 'desc' } }),
      this.prisma.overlock.findMany({ where: { contract_id: c.id }, orderBy: { id: 'desc' } }),
    ]);
    const directMediaIds = [
      ...rawNotes.map((n) => n.evidence_media_id),
      ...rawOverlocks.flatMap((o) => [o.placed_photo_id, o.removed_photo_id]),
    ].filter((x): x is bigint => x != null);
    const [noteRelPhotos, overlockRelPhotos, directMedia] = await Promise.all([
      rawNotes.length ? this.contracts.mediaListFor('collection_note', rawNotes.map((n) => n.id)) : [],
      rawOverlocks.length ? this.contracts.mediaListFor('overlock', rawOverlocks.map((o) => o.id)) : [],
      directMediaIds.length ? this.contracts.mediaByIds([...new Set(directMediaIds)]) : [],
    ]);
    const notes = rawNotes.map((n) => {
      const rel = noteRelPhotos.filter((p) => p.related_id === n.id);
      const dir = n.evidence_media_id ? directMedia.filter((m) => m.id === n.evidence_media_id) : [];
      const seen = new Set<string>();
      const photos = [...rel, ...dir]
        .filter((p) => {
          if (seen.has(p.public_id)) return false;
          seen.add(p.public_id);
          return true;
        })
        .map((p) => ({ id: p.public_id, url: p.url, mimeType: p.mime_type, caption: p.caption }));
      return { ...n, photos };
    });
    const overlocks = rawOverlocks.map((o) => {
      const rel = overlockRelPhotos.filter((p) => p.related_id === o.id);
      const dir = directMedia.filter((m) => m.id === o.placed_photo_id || m.id === o.removed_photo_id);
      const seen = new Set<string>();
      const photos = [...rel, ...dir]
        .filter((p) => {
          if (seen.has(p.public_id)) return false;
          seen.add(p.public_id);
          return true;
        })
        .map((p) => ({ id: p.public_id, url: p.url, mimeType: p.mime_type, caption: p.caption }));
      return { ...o, photos };
    });
    return { notes, promises, events, overlocks };
  }

  @RequirePermission('delinquency.manage')
  @Post('contracts/:id/collection-notes')
  addNote(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() body: unknown) {
    const d = parse(z.object({ channel: z.enum(['CALL', 'SMS', 'EMAIL', 'IN_PERSON', 'LETTER']), outcome: z.string().trim().min(2).max(100), note: z.string().max(500).optional(), evidenceMediaId: z.string().optional(), evidenceIds: z.array(z.string()).max(10).optional() }), body);
    return this.delinq.addNote(ctx, id, { ...d, evidenceMediaId: d.evidenceMediaId ?? d.evidenceIds?.[0], evidenceIds: d.evidenceIds });
  }

  @RequirePermission('delinquency.manage')
  @Post('contracts/:id/promise-to-pay')
  promise(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() body: unknown) {
    return this.delinq.promise(ctx, id, parse(z.object({ amount: zMoney, date: zDate }), body));
  }

  @RequirePermission('delinquency.manage')
  @Post('overlocks')
  overlock(@Ctx() ctx: AccessContext, @Body() body: unknown) {
    const d = parse(z.object({ contractId: z.string().length(26), lockSerial: z.string().trim().min(2).max(64), photoId: z.string().optional(), photoIds: z.array(z.string()).max(10).optional() }), body);
    return this.delinq.placeOverlock(ctx, { contractId: d.contractId, lockSerial: d.lockSerial, photoId: d.photoId ?? d.photoIds?.[0], photoIds: d.photoIds });
  }

  @RequirePermission('delinquency.manage')
  @Post('overlocks/:id/remove')
  removeOverlock(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() body: unknown) {
    const d = parse(z.object({ photoId: z.string().optional(), photoIds: z.array(z.string()).max(10).optional() }), body);
    return this.delinq.removeOverlock(ctx, id, d.photoId ?? d.photoIds?.[0], d.photoIds);
  }

  @RequirePermission('delinquency.manage', false)
  @Get('termination-requests')
  async terminations(@Ctx() ctx: AccessContext, @Query() q: Record<string, unknown>) {
    const status = filterParam(q, 'status');
    const scoped = await this.prisma.contract.findMany({ where: ctx.scope('contract.read') as never, select: { id: true } });
    const rows = await this.prisma.terminationRequest.findMany({
      where: { contract_id: { in: scoped.map((c) => c.id) }, ...(status ? { status: { in: status.split(',') } } : {}) } as never,
      orderBy: { id: 'desc' },
      take: 100,
    });
    return attach(rows, 'contract_id', 'contract', loaders(this.prisma).contracts);
  }

  @RequirePermission('delinquency.manage')
  @Post('contracts/:id/termination-request')
  requestTermination(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() body: unknown) {
    return this.delinq.requestTermination(ctx, id, parse(z.object({ note: z.string().trim().max(500).optional() }), body).note);
  }

  @RequirePermission('delinquency.manage')
  @Post('termination-requests/:id/confirm')
  confirmTermination(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() body: unknown) {
    return this.delinq.confirmTermination(ctx, id, parse(z.object({ note: z.string().max(500).optional() }), body).note);
  }

  @RequirePermission('contract.amend')
  @Post('termination-requests/:id/decide')
  decideTermination(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() body: unknown) {
    const d = parse(z.object({ approve: z.boolean(), note: z.string().max(500).optional() }), body);
    return this.delinq.decideTermination(ctx, id, d.approve, d.note);
  }

  @RequirePermission('delinquency.manage', false)
  @Get('abandoned-goods')
  async abandoned(@Ctx() ctx: AccessContext) {
    const scoped = await this.prisma.contract.findMany({ where: ctx.scope('contract.read') as never, select: { id: true } });
    const rows = await this.prisma.abandonedGoodsRecord.findMany({ where: { contract_id: { in: scoped.map((c) => c.id) } }, orderBy: { id: 'desc' }, take: 100 });
    const withContract = await attach(rows, 'contract_id', 'contract', loaders(this.prisma).contracts);
    const photos = rows.length ? await this.contracts.mediaListFor('abandoned_goods', rows.map((r) => r.id)) : [];
    return withContract.map((r) => ({
      ...r,
      photos: photos.filter((p) => p.related_id === r.id).map((p) => ({ id: p.public_id, url: p.url, mimeType: p.mime_type, caption: p.caption })),
    }));
  }

  @RequirePermission('delinquency.manage')
  @Post('abandoned-goods')
  createAbandoned(@Ctx() ctx: AccessContext, @Body() body: unknown) {
    const d = parse(
      z.object({
        contractId: z.string().length(26),
        inventory: z.array(z.object({ item: z.string().trim().min(1).max(150), qty: z.number().int().min(1).max(10000), note: z.string().max(200).optional() })).min(1).optional(),
        inventorySummary: z.string().trim().min(2).max(1000).optional(),
        witness1: z.string().trim().min(2).max(100),
        witness2: z.string().trim().min(2).max(100),
        location: z.string().max(150).optional(),
        photoIds: z.array(z.string()).max(20).optional(),
      }),
      body,
    );
    const inventory = d.inventory?.length
      ? d.inventory
      : (d.inventorySummary ?? 'Tài sản kiểm kê tại kho')
          .split(/\r?\n|,/)
          .map((s) => s.trim())
          .filter(Boolean)
          .map((item) => ({ item: item.slice(0, 150), qty: 1 }));
    return this.delinq.createAbandonedGoods(ctx, { ...d, inventory: inventory.length ? inventory : [{ item: 'Tài sản tồn đọng', qty: 1 }] });
  }

  @RequirePermission('contract.amend')
  @Patch('abandoned-goods/:id')
  decideAbandoned(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() body: unknown) {
    const d = parse(z.object({ disposition: z.enum(['RETURNED_TO_TENANT', 'DISPOSED', 'SOLD']), proceeds: zMoney.optional() }), body);
    return this.delinq.decideAbandonedGoods(ctx, id, d);
  }
}
