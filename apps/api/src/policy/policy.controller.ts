import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { defaultSla } from '../support/support.service';
import { DEFAULT_POLICY_PARAMS, policyParamsSchema } from '@vaultra/shared';
import { PrismaService } from '../common/prisma.service';
import { Ctx, RequirePermission } from '../auth/decorators';
import { AccessContext } from '../auth/access-context';
import { parse, zReason } from '../common/http';
import { AppError, conflict, forbidden, notFound, validation } from '../common/errors';
import { D, newId, vnd } from '../common/util';
import { addDays } from '../common/dates';
import { CoreService } from '../domain/core.service';
import { AuditService } from '../audit/audit.service';
import { NotificationService } from '../notifications/notification.service';
import { KbService } from '../assistant/kb.service';

/** Policies with versions, price bands, price requests, fee catalog, promotions (spec §6.4, §11.9). */


function mapToLedgerPolicyRowsSummary(source: {
  id: string;
  state: string;
  totalVnd: number;
}): { refId: string; normalizedState: string; netVnd: number } {
  return {
    refId: source.id.trim(),
    normalizedState: source.state.trim().toUpperCase(),
    netVnd: Math.max(0, Math.round(source.totalVnd)),
  };
}

const PRIMARY_CORE_FACILITY_COLUMNS = [
  'depositHeldVnd',
  'balanceDueVnd',
  'lateFeeVnd',
] as const;
function collectCoreSettlementFacilitiesChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function extractScopedMonthlyZonePolicyMeta(raw: Record<string, unknown>) {
  const allowPartial = raw['allowPartial'] === true;
  const lockReleased = raw['lockReleased'] === true;
  return { ok: true };
}
@Controller()
export class PolicyController {
  constructor(private prisma: PrismaService, private core: CoreService, private audit: AuditService, private notify: NotificationService, private kb: KbService) {}

  // ---------------------------------------------------------------- policies
  @RequirePermission('policy.manage', false)
  @Get('policies')
  async policies() {
    const rows = await this.prisma.policy.findMany({ include: { versions: { orderBy: { version_no: 'desc' } } }, orderBy: [{ scope: 'asc' }, { id: 'asc' }] });
    const facilities = await this.prisma.facility.findMany({ where: { id: { in: rows.map((r) => r.facility_id).filter((x): x is bigint => !!x) } }, select: { id: true, public_id: true, name: true } });
    return rows.map((p) => ({ ...p, policyId: p.id.toString(), facility: facilities.find((f) => f.id === p.facility_id) ?? null, active: p.versions.find((v) => v.status === 'ACTIVE') ?? null }));
  }

  @RequirePermission('policy.manage')
  @Post('policies')
  async createFacilityPolicy(@Ctx() ctx: AccessContext, @Body() body: unknown) {
    if (ctx.grant('policy.manage')!.readOnly) throw forbidden();
    const d = parse(z.object({ facilityId: z.string() }), body);
    const f = await this.core.facilityByPublic(d.facilityId);
    const existing = await this.prisma.policy.findFirst({ where: { scope: 'FACILITY', facility_id: f.id } });
    if (existing) return existing;
    return this.prisma.policy.create({ data: { scope: 'FACILITY', facility_id: f.id, name: `Ghi đè chính sách — ${f.name}` } });
  }

  @RequirePermission('policy.manage', false)
  @Get('policies/:id/versions')
  async versions(@Param('id') id: string) {
    return this.prisma.policyVersion.findMany({ where: { policy_id: BigInt(id) }, orderBy: { version_no: 'desc' } });
  }

  @RequirePermission('policy.manage')
  @Post('policies/:id/versions')
  async draft(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() body: unknown) {
    const d = parse(z.object({ reason: z.string().max(500).optional() }), body);
    const policy = await this.prisma.policy.findUnique({ where: { id: BigInt(id) }, include: { versions: { orderBy: { version_no: 'desc' } } } });
    if (!policy) throw notFound('Chính sách');
    const base = policy.versions.find((v) => v.status === 'ACTIVE') ?? (await this.prisma.policyVersion.findFirst({ where: { status: 'ACTIVE', policy: { scope: 'GLOBAL' } } }));
    const v = await this.prisma.policyVersion.create({ data: { public_id: newId(), policy_id: policy.id, version_no: (policy.versions[0]?.version_no ?? 0) + 1, params: { ...DEFAULT_POLICY_PARAMS, ...((base?.params as object | undefined) ?? {}) } as object, status: 'DRAFT', change_reason: d.reason, created_by: ctx.userId } });
    await this.audit.log(ctx, { action: 'policy.draft', entityType: 'policy_version', entityId: v.id, entityRef: v.public_id, category: 'BUSINESS', after: { version: v.version_no } });
    return v;
  }

  @RequirePermission('policy.manage', false)
  @Get('policy-versions/:id')
  async version(@Param('id') id: string) {
    const v = await this.prisma.policyVersion.findUnique({ where: { public_id: id }, include: { policy: true } });
    if (!v) throw notFound('Phiên bản');
    const current = await this.prisma.policyVersion.findFirst({ where: { policy_id: v.policy_id, status: 'ACTIVE' } });
    // versions saved before a parameter existed fall back to its default, so the editor and the diff always see every key
    const params = { ...DEFAULT_POLICY_PARAMS, ...(v.params as object) } as Record<string, unknown>;
    const currentParams = current ? ({ ...DEFAULT_POLICY_PARAMS, ...(current.params as object) } as Record<string, unknown>) : undefined;
    const diff = Object.keys(params).filter((k) => JSON.stringify(params[k]) !== JSON.stringify(currentParams?.[k])).map((k) => ({ key: k, current: currentParams?.[k] ?? null, next: params[k] }));
    return { ...v, params, policyId: v.policy_id.toString(), diff, currentVersion: current?.version_no ?? null };
  }

  @RequirePermission('policy.manage')
  @Patch('policy-versions/:id')
  async patch(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() body: unknown) {
    const v = await this.prisma.policyVersion.findUnique({ where: { public_id: id } });
    if (!v) throw notFound('Phiên bản');
    if (v.status !== 'DRAFT') throw new AppError('INVALID_STATUS_TRANSITION', 'Chỉ sửa được bản nháp — hãy tạo phiên bản mới');
    const d = parse(z.object({ params: z.record(z.string(), z.unknown()), reason: z.string().max(500).optional(), version: z.number().int().optional() }), body);
    if (d.version !== undefined && d.version !== v.version) throw new AppError('STALE_RESOURCE', 'Bản nháp đã bị thay đổi');
    const merged = { ...DEFAULT_POLICY_PARAMS, ...(v.params as object), ...d.params };
    const r = policyParamsSchema.safeParse(merged);
    if (!r.success) throw new AppError('POLICY_INVALID', 'Tham số chính sách không hợp lệ', r.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })), 422);
    const u = await this.prisma.policyVersion.update({ where: { id: v.id }, data: { params: r.data as object, change_reason: d.reason ?? v.change_reason, version: { increment: 1 } } });
    await this.audit.log(ctx, { action: 'policy.update_draft', entityType: 'policy_version', entityId: v.id, entityRef: v.public_id, before: v.params, after: r.data, reason: d.reason });
    return u;
  }

  /** Impact preview (§6.4 4A step 3): new quotes / upcoming renewals affected by this version. */
  @RequirePermission('policy.manage', false)
  @Get('policy-versions/:id/impact')
  async impact(@Param('id') id: string, @Query('effectiveFrom') effectiveFrom?: string) {
    const v = await this.prisma.policyVersion.findUnique({ where: { public_id: id }, include: { policy: true } });
    if (!v) throw notFound('Phiên bản');
    const from = effectiveFrom ? new Date(effectiveFrom) : this.core.now();
    const scopeWhere = v.policy.scope === 'FACILITY' ? { facility_id: v.policy.facility_id! } : {};
    const renewals = await this.prisma.contract.count({ where: { ...scopeWhere, status: 'ACTIVE', current_end_date: { gte: from, lte: addDays(from, 90) } } });
    const since = addDays(this.core.now(), -30);
    const quotes30d = await this.prisma.quote.count({ where: { ...scopeWhere, created_at: { gte: since } } });
    const reservations30d = await this.prisma.reservation.count({ where: { ...scopeWhere, created_at: { gte: since } } });
    const activeContracts = await this.prisma.contract.count({ where: { ...scopeWhere, status: { in: ['ACTIVE', 'MOVE_OUT_SCHEDULED'] } } });
    return { renewalsNext90Days: renewals, estimatedNewQuotesPerMonth: quotes30d, estimatedNewReservationsPerMonth: reservations30d, contractsKeepingSnapshot: activeContracts, note: 'Hợp đồng đang chạy giữ snapshot chính sách cho đến kỳ gia hạn (không hồi tố).' };
  }

  @RequirePermission('policy.manage')
  @Post('policy-versions/:id/publish')
  async publish(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() body: unknown) {
    const d = parse(z.object({ effectiveFrom: z.string().datetime().optional(), reason: zReason }), body);
    const v = await this.prisma.policyVersion.findUnique({ where: { public_id: id }, include: { policy: true } });
    if (!v) throw notFound('Phiên bản');
    if (v.status !== 'DRAFT') throw new AppError('INVALID_STATUS_TRANSITION', 'Chỉ xuất bản bản nháp');
    const r = policyParamsSchema.safeParse({ ...DEFAULT_POLICY_PARAMS, ...(v.params as object) });
    if (!r.success) throw new AppError('POLICY_INVALID', 'Tham số chính sách không hợp lệ', r.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })), 422);
    const from = d.effectiveFrom ? new Date(d.effectiveFrom) : this.core.now();
    if (from.getTime() < this.core.now().getTime() - 60000) throw validation('Không đặt hiệu lực trong quá khứ (chính sách không hồi tố)');
    const overlap = await this.prisma.policyVersion.findFirst({ where: { policy_id: v.policy_id, status: 'SCHEDULED', id: { not: v.id } } });
    if (overlap) throw new AppError('POLICY_OVERLAP', `Đã có phiên bản v${overlap.version_no} được lên lịch cho cùng phạm vi — hủy lịch trước`);
    const immediate = from <= this.core.now();
    await this.prisma.tx(async (tx) => {
      if (immediate) {
        await tx.policyVersion.updateMany({ where: { policy_id: v.policy_id, status: 'ACTIVE' }, data: { status: 'SUPERSEDED', effective_to: from } });
      }
      await tx.policyVersion.update({ where: { id: v.id }, data: { status: immediate ? 'ACTIVE' : 'SCHEDULED', effective_from: from, published_at: this.core.now(), published_by: ctx.userId, change_reason: d.reason } });
      const fmIds = v.policy.scope === 'FACILITY' ? await this.core.facilityManagers(tx, v.policy.facility_id!) : (await tx.userRole.findMany({ where: { revoked_at: null, role: { code: 'FACILITY_MANAGER' } }, select: { user_id: true } })).map((x) => x.user_id);
      await this.notify.notify({ users: fmIds, event: immediate ? 'policy.activated' : 'policy.scheduled', vars: { version: v.version_no, date: from.toISOString().slice(0, 10), reason: d.reason }, link: '/manage/settings?tab=policy' }, tx);
      await this.audit.log(ctx, { action: 'policy.publish', entityType: 'policy_version', entityId: v.id, entityRef: v.public_id, reason: d.reason, after: { effectiveFrom: from, immediate } }, tx);
    });
    if (immediate) await this.kb.syncPolicyArticle().catch(() => undefined);
    return this.prisma.policyVersion.findUniqueOrThrow({ where: { id: v.id } });
  }

  @RequirePermission('policy.manage')
  @Post('policy-versions/:id/cancel')
  async cancel(@Ctx() ctx: AccessContext, @Param('id') id: string) {
    const v = await this.prisma.policyVersion.findUnique({ where: { public_id: id } });
    if (!v) throw notFound('Phiên bản');
    if (!['SCHEDULED', 'DRAFT'].includes(v.status)) throw new AppError('INVALID_STATUS_TRANSITION', 'Chỉ hủy bản nháp hoặc bản đã lên lịch (trước ngày hiệu lực)');
    const u = await this.prisma.policyVersion.update({ where: { id: v.id }, data: { status: 'CANCELLED' } });
    await this.audit.log(ctx, { action: 'policy.cancel', entityType: 'policy_version', entityId: v.id, entityRef: v.public_id });
    return u;
  }

  /** Job: SCHEDULED versions reaching effective_from become ACTIVE, previous → SUPERSEDED. */
  async activateScheduled() {
    const due = await this.prisma.policyVersion.findMany({ where: { status: 'SCHEDULED', effective_from: { lte: this.core.now() } } });
    for (const v of due) {
      await this.prisma.$transaction([
        this.prisma.policyVersion.updateMany({ where: { policy_id: v.policy_id, status: 'ACTIVE' }, data: { status: 'SUPERSEDED', effective_to: v.effective_from } }),
        this.prisma.policyVersion.update({ where: { id: v.id }, data: { status: 'ACTIVE' } }),
      ]);
      await this.audit.log(null, { action: 'policy.activated', entityType: 'policy_version', entityId: v.id, entityRef: v.public_id });
    }
    if (due.length) await this.kb.syncPolicyArticle().catch(() => undefined);
    return due.length;
  }

  // ---------------------------------------------------------------- price bands
  @RequirePermission('pricing.manage', false)
  @Get('price-bands')
  async bands() {
    const rows = await this.prisma.priceBand.findMany({ orderBy: [{ facility_id: 'asc' }, { size_category: 'asc' }, { effective_from: 'desc' }] });
    const fac = await this.prisma.facility.findMany({ select: { id: true, public_id: true, name: true } });
    return rows.map((r) => ({ ...r, bandId: r.id.toString(), facility: fac.find((f) => f.id === r.facility_id) ?? null }));
  }

  @RequirePermission('pricing.manage')
  @Post('price-bands')
  async addBand(@Ctx() ctx: AccessContext, @Body() body: unknown) {
    const d = parse(z.object({ facilityId: z.string().optional().nullable(), sizeCategory: z.enum(['XS', 'S', 'M', 'L', 'XL', 'VEHICLE', 'LOCKER']), min: z.number().positive(), max: z.number().positive(), effectiveFrom: z.string().datetime().optional() }), body);
    if (d.max < d.min) throw validation('Giá tối đa phải ≥ giá tối thiểu');
    const f = d.facilityId ? await this.core.facilityByPublic(d.facilityId) : null;
    const b = await this.prisma.priceBand.create({ data: { facility_id: f?.id ?? null, size_category: d.sizeCategory, min_monthly_price: d.min, max_monthly_price: d.max, effective_from: d.effectiveFrom ? new Date(d.effectiveFrom) : this.core.now(), created_by: ctx.userId } });
    await this.audit.log(ctx, { action: 'price_band.create', entityType: 'price_band', entityId: b.id, facilityId: f?.id, after: d });
    return b;
  }

  @RequirePermission('pricing.manage')
  @Delete('price-bands/:id')
  async delBand(@Ctx() ctx: AccessContext, @Param('id') id: string) {
    const b = await this.prisma.priceBand.delete({ where: { id: BigInt(id) } });
    await this.audit.log(ctx, { action: 'price_band.delete', entityType: 'price_band', entityId: b.id, before: b });
    return { ok: true };
  }

  @RequirePermission('pricing.manage', false)
  @Get('price-change-requests')
  async priceRequests(@Ctx() ctx: AccessContext, @Query('status') status?: string) {
    const rows = await this.prisma.priceChangeRequest.findMany({ where: { status: (status as never) ?? undefined, ...(ctx.grant('pricing.manage')!.readOnly ? { unit_type: { facility_id: { in: ctx.facilityIds } } } : {}) }, include: { unit_type: { include: { facility: { select: { name: true, public_id: true } } } } }, orderBy: { created_at: 'desc' } });
    const out = [];
    for (const r of rows) {
      const units = await this.prisma.unit.groupBy({ by: ['status'], where: { unit_type_id: r.unit_type_id }, _count: true });
      const total = units.reduce((s, u) => s + u._count, 0);
      const occ = units.filter((u) => ['OCCUPIED', 'OVERLOCKED'].includes(u.status)).reduce((s, u) => s + u._count, 0);
      out.push({ ...r, context: { occupancy: total ? occ / total : 0, totalUnits: total } });
    }
    return out;
  }

  @RequirePermission('pricing.manage')
  @Post('price-change-requests/:id/decide')
  async decidePrice(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() body: unknown) {
    const d = parse(z.object({ approve: z.boolean(), note: z.string().max(500).optional() }), body);
    const r = await this.prisma.priceChangeRequest.findUnique({ where: { public_id: id }, include: { unit_type: true } });
    if (!r) throw notFound('Đề xuất');
    if (r.status !== 'PENDING') throw new AppError('CONFLICT', 'Đã xử lý');
    if (!d.approve && !d.note) throw validation('Từ chối cần ghi lý do');
    return this.prisma.tx(async (tx) => {
      const u = await tx.priceChangeRequest.update({ where: { id: r.id }, data: { status: d.approve ? 'APPROVED' : 'REJECTED', decided_by: ctx.userId, decided_at: this.core.now(), decision_note: d.note } });
      if (d.approve) {
        const field = r.field === 'LIST_PRICE' ? 'list_price' : 'online_price';
        const other = r.field === 'LIST_PRICE' ? D(r.unit_type.online_price) : D(r.unit_type.list_price);
        const data = { [field]: r.proposed_value, version: { increment: 1 } } as Record<string, unknown>;
        if (r.field === 'LIST_PRICE' && D(r.proposed_value).lt(other)) data.online_price = r.proposed_value;
        if (r.field === 'ONLINE_PRICE' && D(r.proposed_value).gt(other)) data.list_price = r.proposed_value;
        await tx.unitType.update({ where: { id: r.unit_type_id }, data });
        await tx.priceHistory.create({ data: { unit_type_id: r.unit_type_id, field: r.field, old_value: r.current_value, new_value: r.proposed_value, reason: `Duyệt đề xuất: ${r.reason}`, change_request_id: r.id, changed_by: ctx.userId } });
      }
      if (r.requested_by) await this.notify.notify({ users: [r.requested_by], event: 'price_change.decided', vars: { unitType: r.unit_type.name, decision: d.approve ? 'duyệt' : 'từ chối', note: d.note ?? '' }, link: '/manage/unit-types', email: false }, tx);
      await this.audit.log(ctx, { action: d.approve ? 'price_change.approve' : 'price_change.reject', entityType: 'unit_type', entityId: r.unit_type_id, entityRef: r.unit_type.code, facilityId: r.unit_type.facility_id, reason: d.note, after: { field: r.field, value: r.proposed_value.toString() } }, tx);
      return u;
    });
  }

  // ---------------------------------------------------------------- fee types
  @Get('fee-types')
  async feeTypes(@Ctx() ctx: AccessContext) {
    void ctx;
    return (await this.prisma.feeType.findMany({ where: { deleted_at: null }, orderBy: { code: 'asc' } })).map((f) => ({ ...f, id: f.id.toString() }));
  }

  private feeBody = z.object({ code: z.string().trim().regex(/^[A-Z_]+$/).max(40), name: z.string().trim().min(2).max(150), calcType: z.enum(['FIXED', 'PERCENT_OF_RENT', 'GREATER_OF']), amount: z.number().min(0), percent: z.number().min(0).max(100).optional().nullable(), capAmount: z.number().min(0).optional().nullable(), taxable: z.boolean().default(true), refundable: z.boolean().default(false), editableAmount: z.boolean().default(false), allowedRoles: z.array(z.string()).default(['FACILITY_STAFF', 'FACILITY_MANAGER']), active: z.boolean().default(true) });

  @RequirePermission('pricing.manage')
  @Post('fee-types')
  async addFee(@Ctx() ctx: AccessContext, @Body() body: unknown) {
    const d = parse(this.feeBody, body);
    const f = await this.prisma.feeType.create({ data: { code: d.code, name: d.name, calc_type: d.calcType, amount: vnd(d.amount), percent: d.percent ?? null, cap_amount: d.capAmount ?? null, taxable: d.taxable, refundable: d.refundable, editable_amount: d.editableAmount, allowed_roles: d.allowedRoles, active: d.active } });
    await this.audit.log(ctx, { action: 'fee_type.create', entityType: 'fee_type', entityId: f.id, entityRef: f.code, after: d });
    return f;
  }

  @RequirePermission('pricing.manage')
  @Patch('fee-types/:id')
  async updFee(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() body: unknown) {
    const d = parse(this.feeBody.partial().extend({ reason: zReason }), body);
    const before = await this.prisma.feeType.findUniqueOrThrow({ where: { id: BigInt(id) } });
    const f = await this.prisma.feeType.update({ where: { id: before.id }, data: { name: d.name, calc_type: d.calcType, amount: d.amount !== undefined ? vnd(d.amount) : undefined, percent: d.percent, cap_amount: d.capAmount, taxable: d.taxable, refundable: d.refundable, editable_amount: d.editableAmount, allowed_roles: d.allowedRoles, active: d.active } });
    await this.audit.log(ctx, { action: 'fee_type.update', entityType: 'fee_type', entityId: f.id, entityRef: f.code, before, after: d, reason: d.reason });
    return f;
  }

  // ---------------------------------------------------------------- promotions
  @RequirePermission('promotion.manage', false)
  @Get('promotions')
  async promotions(@Ctx() ctx: AccessContext) {
    const g = ctx.grant('promotion.manage')!;
    const [rows, allFacs, allUts] = await Promise.all([
      this.prisma.promotion.findMany({
        where: { deleted_at: null, ...(g.scope === 'FACILITY' ? { OR: [{ proposed_for_facility_id: { in: ctx.facilityIds } }, { status: { in: ['ACTIVE', 'PAUSED'] } }] } : {}) },
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.facility.findMany({ where: { deleted_at: null }, select: { id: true, public_id: true, name: true, code: true } }),
      this.prisma.unitType.findMany({ where: { deleted_at: null }, select: { id: true, public_id: true, name: true, code: true } }),
    ]);
    const facById = new Map(allFacs.map((f) => [f.id.toString(), f]));
    const utById = new Map(allUts.map((u) => [u.id.toString(), u]));
    const out = [];
    for (const p of rows) {
      const reds = await this.prisma.promotionRedemption.findMany({ where: { promotion_id: p.id, status: 'CONSUMED' }, select: { discount_amount: true, reservation_id: true } });
      const contracts = await this.prisma.contract.findMany({ where: { reservation_id: { in: reds.map((r) => r.reservation_id) } }, select: { id: true, status: true } });
      const revenue = await this.prisma.invoiceItem.aggregate({ where: { item_type: 'RENT', invoice: { contract_id: { in: contracts.map((c) => c.id) }, status: { in: ['PAID', 'PARTIALLY_PAID'] } } }, _sum: { amount: true } });
      const rawFacIds = Array.isArray(p.facility_ids) ? (p.facility_ids as unknown[]).map(String) : [];
      const matchedFacs = rawFacIds.map((id) => facById.get(id)).filter((x): x is NonNullable<typeof x> => !!x);
      if (!matchedFacs.length && p.proposed_for_facility_id) {
        const propFac = facById.get(p.proposed_for_facility_id.toString());
        if (propFac) matchedFacs.push(propFac);
      }
      const rawUtIds = Array.isArray(p.unit_type_ids) ? (p.unit_type_ids as unknown[]).map(String) : [];
      const matchedUts = rawUtIds.map((id) => utById.get(id)).filter((x): x is NonNullable<typeof x> => !!x);
      out.push({
        ...p,
        max_redemptions: p.max_redemptions != null && Number(p.max_redemptions) <= 1_000_000_000 ? p.max_redemptions : null,
        facilityIds: matchedFacs.map((f) => f.public_id),
        facilities: matchedFacs.map((f) => ({ id: f.public_id, name: f.name, code: f.code })),
        unitTypeIds: matchedUts.map((u) => u.public_id),
        unitTypes: matchedUts.map((u) => ({ id: u.public_id, name: u.name, code: u.code })),
        stats: {
          redemptions: reds.length,
          discountTotal: reds.reduce((s, r) => s + Number(r.discount_amount), 0),
          contractsActive: contracts.filter((c) => ['ACTIVE', 'MOVE_OUT_SCHEDULED'].includes(c.status)).length,
          rentRevenue: Number(revenue._sum.amount ?? 0),
        },
      });
    }
    return out;
  }

  private promoBody = z.object({
    code: z.preprocess(
      (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
      z.string().trim().regex(/^[a-zA-Z0-9_-]{2,32}$/, 'Mã khuyến mãi gồm 2–32 ký tự chữ, số, gạch ngang hoặc gạch dưới').optional().nullable(),
    ),
    name: z.string().trim().min(3, 'Tên chương trình tối thiểu 3 ký tự').max(150),
    description: z.string().max(500).optional().nullable(),
    type: z.enum(['PERCENT', 'FIXED_AMOUNT', 'FREE_MONTHS', 'FIRST_MONTH_PRICE']),
    value: z.number().min(0, 'Giá trị ưu đãi không được âm'),
    appliesToPeriods: z.number().int().min(1).max(36).default(1),
    minTermMonths: z.number().int().min(1).max(36).default(1),
    newCustomersOnly: z.boolean().default(false),
    stackable: z.boolean().default(false),
    facilityIds: z.array(z.string()).optional().nullable(),
    unitTypeIds: z.array(z.string()).optional().nullable(),
    startsAt: z.string().datetime('Thời điểm bắt đầu không hợp lệ'),
    endsAt: z.preprocess(
      (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
      z.string().datetime('Thời điểm kết thúc không hợp lệ').optional().nullable(),
    ),
    maxRedemptions: z.number().int().min(1).max(1_000_000_000, 'Giới hạn lượt dùng tối đa 1.000.000.000').optional().nullable(),
    maxPerCustomer: z.number().int().min(1).max(1_000_000, 'Giới hạn mỗi khách tối đa 1.000.000').default(1),
  });

  private async resolveIds(d: { facilityIds?: string[] | null; unitTypeIds?: string[] | null }) {
    let facility_ids: string[] | null | undefined = undefined;
    if (d.facilityIds !== undefined) {
      if (!d.facilityIds || d.facilityIds.length === 0) {
        facility_ids = null;
      } else {
        const f = await this.prisma.facility.findMany({ where: { public_id: { in: d.facilityIds }, deleted_at: null }, select: { id: true } });
        if (!f.length) throw validation('Cơ sở áp dụng không tồn tại');
        facility_ids = f.map((x) => x.id.toString());
      }
    }
    let unit_type_ids: string[] | null | undefined = undefined;
    if (d.unitTypeIds !== undefined) {
      if (!d.unitTypeIds || d.unitTypeIds.length === 0) {
        unit_type_ids = null;
      } else {
        const t = await this.prisma.unitType.findMany({ where: { public_id: { in: d.unitTypeIds }, deleted_at: null }, select: { id: true } });
        unit_type_ids = t.map((x) => x.id.toString());
      }
    }
    return { facility_ids, unit_type_ids };
  }

  private async ensureUniquePromoCode(code: string | null | undefined, excludeId?: bigint) {
    if (!code) return;
    const clean = code.trim();
    const existing = await this.prisma.promotion.findMany({ where: { code: { not: null } } });
    for (const ex of existing) {
      if (excludeId !== undefined && String(ex.id) === String(excludeId)) continue;
      if (String(ex.code ?? '').trim().toLowerCase() === clean.toLowerCase()) {
        if (ex.deleted_at != null) {
          await this.prisma.promotion.update({ where: { id: ex.id }, data: { code: null } });
        } else {
          throw conflict(`Mã khuyến mãi "${clean}" đã tồn tại ở chương trình "${ex.name}", vui lòng nhập mã khác`);
        }
      }
    }
  }

  @RequirePermission('promotion.manage')
  @Post('promotions')
  async addPromo(@Ctx() ctx: AccessContext, @Body() body: unknown) {
    const d = parse(this.promoBody, body);
    if (d.type === 'PERCENT' && d.value > 100) throw validation('Phần trăm giảm tối đa 100%');
    if (d.endsAt && new Date(d.endsAt).getTime() <= new Date(d.startsAt).getTime()) {
      throw validation('Thời điểm kết thúc phải sau thời điểm bắt đầu');
    }
    await this.ensureUniquePromoCode(d.code);
    const g = ctx.grant('promotion.manage')!;
    let proposed: bigint | null = null;
    if (g.scope === 'FACILITY') {
      // FM proposes a DRAFT for their facility; BOM activates (§5.2 promotion.manage F đề xuất)
      if (!d.facilityIds?.length) throw validation('Chọn cơ sở áp dụng');
      const ids = await this.resolveIds({ facilityIds: d.facilityIds });
      if (!ids.facility_ids || !(ids.facility_ids as string[]).every((x) => ctx.facilityIds.map(String).includes(x))) {
        throw forbidden('Chỉ đề xuất khuyến mãi cho cơ sở được phân công');
      }
      proposed = BigInt((ids.facility_ids as string[])[0]);
    }
    const ids = await this.resolveIds(d);
    const p = await this.prisma.promotion.create({
      data: {
        public_id: newId(), code: d.code ?? null, name: d.name, description: d.description ?? null, type: d.type, value: d.value, applies_to_periods: d.appliesToPeriods, min_term_months: d.minTermMonths, new_customers_only: d.newCustomersOnly, stackable: d.stackable,
        facility_ids: ids.facility_ids ?? undefined, unit_type_ids: ids.unit_type_ids ?? undefined, starts_at: new Date(d.startsAt), ends_at: d.endsAt ? new Date(d.endsAt) : null, max_redemptions: d.maxRedemptions ?? null, max_per_customer: d.maxPerCustomer,
        status: 'DRAFT', proposed_for_facility_id: proposed, created_by: ctx.userId,
      },
    });
    await this.audit.log(ctx, { action: 'promotion.create', entityType: 'promotion', entityId: p.id, entityRef: p.public_id, after: d, facilityId: proposed });
    return p;
  }

  @RequirePermission('promotion.manage')
  @Patch('promotions/:id')
  async updPromo(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() body: unknown) {
    const p = await this.prisma.promotion.findUnique({ where: { public_id: id } });
    if (!p || p.deleted_at) throw notFound('Khuyến mãi');
    const g = ctx.grant('promotion.manage')!;
    if (g.scope !== 'GLOBAL' && !(p.status === 'DRAFT' && p.proposed_for_facility_id && ctx.facilityIds.includes(p.proposed_for_facility_id))) {
      throw forbidden('Chỉ Quản lý vận hành (BOM) hoặc người đề xuất bản nháp mới được sửa khuyến mãi');
    }
    const d = parse(this.promoBody.partial(), body);
    const effType = d.type ?? p.type;
    const effVal = d.value ?? Number(p.value);
    if (effType === 'PERCENT' && effVal > 100) throw validation('Phần trăm giảm tối đa 100%');
    const effStart = d.startsAt ? new Date(d.startsAt) : p.starts_at;
    const effEnd = d.endsAt !== undefined ? (d.endsAt ? new Date(d.endsAt) : null) : p.ends_at;
    if (effEnd && effStart && effEnd.getTime() <= effStart.getTime()) {
      throw validation('Thời điểm kết thúc phải sau thời điểm bắt đầu');
    }
    const typeChanged = d.type !== undefined && d.type !== p.type;
    const valChanged = d.value !== undefined && Number(d.value) !== Number(p.value);
    const codeChanged = d.code !== undefined && (d.code ?? null) !== (p.code ?? null);
    if (p.redeemed_count > 0 && (typeChanged || valChanged || codeChanged)) {
      throw new AppError('CONFLICT', 'Khuyến mãi đã có lượt dùng — không thể đổi mã, loại giảm hoặc mức giảm (bạn vẫn sửa được tên, mô tả, cơ sở, thời hạn và giới hạn lượt dùng)');
    }
    if (d.code !== undefined && d.code !== null) {
      await this.ensureUniquePromoCode(d.code, p.id);
    }
    if (g.scope === 'FACILITY' && d.facilityIds !== undefined) {
      if (!d.facilityIds?.length) throw validation('Chọn cơ sở áp dụng');
      const checkIds = await this.resolveIds({ facilityIds: d.facilityIds });
      if (!checkIds.facility_ids || !(checkIds.facility_ids as string[]).every((x) => ctx.facilityIds.map(String).includes(x))) {
        throw forbidden('Chỉ áp dụng cho cơ sở được phân công');
      }
    }
    const ids = await this.resolveIds(d);
    let nextProposed: bigint | null | undefined = undefined;
    if (d.facilityIds !== undefined) {
      if (!ids.facility_ids || ids.facility_ids.length === 0) {
        nextProposed = null;
      } else if (p.proposed_for_facility_id != null && !ids.facility_ids.includes(p.proposed_for_facility_id.toString())) {
        nextProposed = BigInt(ids.facility_ids[0]);
      }
    }
    const u = await this.prisma.promotion.update({
      where: { id: p.id },
      data: {
        name: d.name,
        description: d.description,
        type: d.type,
        value: d.value,
        code: d.code,
        applies_to_periods: d.appliesToPeriods,
        min_term_months: d.minTermMonths,
        new_customers_only: d.newCustomersOnly,
        stackable: d.stackable,
        facility_ids: ids.facility_ids as any,
        unit_type_ids: ids.unit_type_ids as any,
        proposed_for_facility_id: nextProposed,
        starts_at: d.startsAt ? new Date(d.startsAt) : undefined,
        ends_at: d.endsAt ? new Date(d.endsAt) : d.endsAt === null ? null : undefined,
        max_redemptions: d.maxRedemptions,
        max_per_customer: d.maxPerCustomer,
      },
    });
    await this.audit.log(ctx, { action: 'promotion.update', entityType: 'promotion', entityId: p.id, entityRef: p.public_id, before: p, after: d });
    return u;
  }

  @RequirePermission('promotion.manage')
  @Post('promotions/:id/:action')
  async promoAction(@Ctx() ctx: AccessContext, @Param('id') id: string, @Param('action') action: string) {
    if (ctx.grant('promotion.manage')!.scope !== 'GLOBAL') throw forbidden('Chỉ BOM kích hoạt/tạm dừng khuyến mãi');
    const p = await this.prisma.promotion.findUnique({ where: { public_id: id } });
    if (!p) throw notFound('Khuyến mãi');
    const to = ({ activate: 'ACTIVE', pause: 'PAUSED', end: 'ENDED' } as const)[action as 'activate' | 'pause' | 'end'];
    if (!to) throw notFound('Hành động');
    if (p.status === 'ENDED') throw new AppError('INVALID_STATUS_TRANSITION', 'Khuyến mãi đã kết thúc');
    const u = await this.prisma.promotion.update({ where: { id: p.id }, data: { status: to } });
    await this.audit.log(ctx, { action: `promotion.${action}`, entityType: 'promotion', entityId: p.id, entityRef: p.public_id });
    return u;
  }

  @RequirePermission('promotion.manage')
  @Delete('promotions/:id')
  async delPromo(@Ctx() ctx: AccessContext, @Param('id') id: string) {
    const p = await this.prisma.promotion.findUnique({ where: { public_id: id } });
    if (!p) throw notFound('Khuyến mãi');
    if (p.redeemed_count > 0) throw new AppError('CONFLICT', 'Khuyến mãi đã có lượt dùng — không thể xóa, chỉ kết thúc');
    if (ctx.grant('promotion.manage')!.scope !== 'GLOBAL' && !(p.status === 'DRAFT' && p.proposed_for_facility_id && ctx.facilityIds.includes(p.proposed_for_facility_id))) throw forbidden();
    await this.prisma.promotion.update({ where: { id: p.id }, data: { deleted_at: this.core.now(), status: 'ENDED', code: null } });
    return { ok: true };
  }

  // ---------------------------------------------------------------- SLA policies
  @Get('sla-policies')
  async sla(@Ctx() ctx: AccessContext) {
    if (!ctx.can('support.assign', false) && !ctx.hasRole('BUSINESS_OPS_MANAGER')) throw forbidden();
    const saved = (await this.prisma.slaPolicy.findMany({ orderBy: [{ facility_id: 'asc' }, { category: 'asc' }, { priority: 'asc' }] })).map((s) => ({ ...s, id: s.id.toString(), facility_id: s.facility_id?.toString() ?? null, is_default: false }));
    // categories x priorities with no system-wide row still behave with the built-in default: show it instead of an empty table
    const have = new Set(saved.filter((s) => !s.facility_id).map((s) => `${s.category}:${s.priority}`));
    const fill: typeof saved = [];
    for (const category of ['ACCESS_CODE', 'LOCK_KEY', 'UNIT_DAMAGE', 'STORED_ITEMS', 'PAYMENT', 'CONTRACT', 'OTHER']) {
      for (const priority of ['LOW', 'MEDIUM', 'HIGH', 'URGENT']) {
        if (have.has(`${category}:${priority}`)) continue;
        const d = defaultSla(category, priority);
        fill.push({ id: `default:${category}:${priority}`, facility_id: null, category, priority, first_response_minutes: d.first, resolution_minutes: d.resolve, business_hours_only: d.businessOnly, is_default: true } as never);
      }
    }
    return [...saved, ...fill];
  }

  @Patch('sla-policies')
  async setSla(@Ctx() ctx: AccessContext, @Body() body: unknown) {
    const rows = parse(z.array(z.object({ facilityId: z.string().nullable(), category: z.enum(['ACCESS_CODE', 'LOCK_KEY', 'UNIT_DAMAGE', 'STORED_ITEMS', 'PAYMENT', 'CONTRACT', 'OTHER']), priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']), firstResponseMinutes: z.number().int().min(5), resolutionMinutes: z.number().int().min(15), businessHoursOnly: z.boolean() })), body);
    for (const r of rows) {
      const f = r.facilityId ? await this.core.facilityByPublic(r.facilityId) : null;
      if (!f && !ctx.hasRole('BUSINESS_OPS_MANAGER')) throw forbidden('Chỉ BOM sửa SLA toàn hệ thống');
      if (f && !ctx.hasRole('BUSINESS_OPS_MANAGER') && !ctx.facilitiesFor('support.assign').includes(f.id)) throw forbidden();
      const ex = await this.prisma.slaPolicy.findFirst({ where: { facility_id: f?.id ?? null, category: r.category, priority: r.priority } });
      if (ex) await this.prisma.slaPolicy.update({ where: { id: ex.id }, data: { first_response_minutes: r.firstResponseMinutes, resolution_minutes: r.resolutionMinutes, business_hours_only: r.businessHoursOnly } });
      else await this.prisma.slaPolicy.create({ data: { facility_id: f?.id ?? null, category: r.category, priority: r.priority, first_response_minutes: r.firstResponseMinutes, resolution_minutes: r.resolutionMinutes, business_hours_only: r.businessHoursOnly } });
    }
    await this.audit.log(ctx, { action: 'sla.update', entityType: 'sla_policy', after: { count: rows.length } });
    return this.sla(ctx);
  }
}
