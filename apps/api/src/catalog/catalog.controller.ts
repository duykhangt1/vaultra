import { Body, Controller, Get, Param, Post, Query, Req as R } from '@nestjs/common';
import { z } from 'zod';
import { PolicyParams, recommendSize, SIZE_ITEMS, termRate } from '@vaultra/shared';
import { PrismaService } from '../common/prisma.service';
import { Ctx, Public, RateLimit } from '../auth/decorators';
import { AccessContext } from '../auth/access-context';
import { parse, Req, zDate } from '../common/http';
import { CoreService } from '../domain/core.service';
import { PricingService } from '../domain/pricing.service';
import { MediaService } from '../media/media.service';
import { notFound } from '../common/errors';
import { addMonths, dateOnly } from '../common/dates';
import { normalizeProvince, sha256 } from '../common/util';

/** Public catalog (spec §11.3, FR-C01/C02): facilities, unit types, availability by date range, compare. */
@Controller()
export class CatalogController {
  constructor(private prisma: PrismaService, private core: CoreService, private pricing: PricingService, private media: MediaService) {}

  private async range(startDate?: string, term?: string) {
    const s = startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate) ? dateOnly(startDate) : this.core.today();
    const t = Math.max(1, Math.min(36, Number(term ?? 1) || 1));
    return { s, e: addMonths(s, t), t };
  }

  private async typeCard(ut: { id: bigint; public_id: string } & Record<string, unknown>, s: Date, e: Date) {
    const available = await this.core.available(this.prisma, ut.id, s, e);
    const photos = await this.media.listFor('unit_type', [ut.id]);
    return { ...ut, available, photos: photos.map((p) => ({ url: p.url, caption: p.caption })) };
  }

  @Public()
  @RateLimit(120, 60)
  @Get('catalog/facilities')
  async facilities(@Query() q: Record<string, string>) {
    const { s, e } = await this.range(q.startDate, q.term);
    const amenities = q.amenities ? q.amenities.split(',') : [];
    const targetProvSlug = q.province ? normalizeProvince(q.province, q.province).provinceSlug : '';
    const allActive = await this.prisma.facility.findMany({
      where: {
        status: 'ACTIVE',
        deleted_at: null,
        ...(q.district ? { district: q.district } : {}),
        ...(q.q ? { OR: [{ name: { contains: q.q } }, { district: { contains: q.q } }, { address_line: { contains: q.q } }] } : {}),
      },
      include: { unit_types: { where: { status: 'ACTIVE', is_bookable: true, deleted_at: null } } },
      orderBy: { name: 'asc' },
    });
    const rows = targetProvSlug
      ? allActive.filter((f) => normalizeProvince(f.province, f.province_slug).provinceSlug === targetProvSlug)
      : allActive;
    const out = [];
    for (const f of rows) {
      const am = (f.amenities as string[]) ?? [];
      if (amenities.some((a) => !am.includes(a))) continue;
      let availableTypes = 0;
      let availableUnits = 0;
      for (const ut of f.unit_types) {
        const a = await this.core.available(this.prisma, ut.id, s, e);
        if (a > 0) availableTypes += 1;
        availableUnits += a;
      }
      const prices = f.unit_types.map((u) => Number(u.online_price));
      let distanceKm: number | null = null;
      if (q.lat && q.lng && f.latitude && f.longitude) distanceKm = haversine(Number(q.lat), Number(q.lng), Number(f.latitude), Number(f.longitude));
      if (q.radius && distanceKm !== null && distanceKm > Number(q.radius)) continue;
      const cover = f.cover_media_id ? await this.prisma.mediaFile.findUnique({ where: { id: f.cover_media_id } }) : null;
      const facPhotos = !cover ? await this.media.listFor('facility', [f.id]) : [];
      const coverUrl = cover ? await this.media.urlFor(cover) : (facPhotos[0]?.url ?? null);
      const { unit_types, ...rest } = f;
      const normProv = normalizeProvince(f.province, f.province_slug);
      out.push({
        ...rest,
        province: normProv.province,
        province_slug: normProv.provinceSlug,
        priceFrom: prices.length ? Math.min(...prices) : null,
        availableTypes,
        availableUnits,
        unitTypeCount: unit_types.length,
        distanceKm,
        coverUrl,
        photos: facPhotos.map((p) => ({ url: p.url, caption: p.caption })),
      });
    }
    if (q.sort === 'price') out.sort((a, b) => (a.priceFrom ?? 1e15) - (b.priceFrom ?? 1e15));
    if (q.sort === 'distance') out.sort((a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9));
    const allForProvinces = q.district || q.q
      ? await this.prisma.facility.findMany({ where: { status: 'ACTIVE', deleted_at: null }, select: { province: true, province_slug: true } })
      : allActive;
    const provMap = new Map<string, { name: string; slug: string; count: number }>();
    for (const f of allForProvinces) {
      const norm = normalizeProvince(f.province, f.province_slug);
      const existing = provMap.get(norm.provinceSlug);
      if (existing) existing.count += 1;
      else provMap.set(norm.provinceSlug, { name: norm.province, slug: norm.provinceSlug, count: 1 });
    }
    return { data: out, provinces: [...provMap.values()] };
  }

  @Public()
  @RateLimit(120, 60)
  @Get('catalog/facilities/:slug')
  async facility(@Param('slug') slug: string, @Query() q: Record<string, string>) {
    const f = await this.prisma.facility.findFirst({ where: { OR: [{ slug }, { public_id: slug }], status: { in: ['ACTIVE', 'TEMPORARILY_CLOSED'] }, deleted_at: null }, include: { zones: { orderBy: { sort_order: 'asc' } } } });
    if (!f) throw notFound('Cơ sở');
    const { s, e } = await this.range(q.startDate, q.term);
    const types = await this.prisma.unitType.findMany({ where: { facility_id: f.id, status: 'ACTIVE', deleted_at: null }, orderBy: [{ online_price: 'asc' }] });
    const now = this.core.now();
    const notices = await this.prisma.facilityNotice.findMany({ where: { facility_id: f.id, starts_at: { lte: now }, OR: [{ ends_at: null }, { ends_at: { gt: now } }] }, orderBy: { starts_at: 'desc' } });
    const photos = await this.media.listFor('facility', [f.id]);
    const cover = f.cover_media_id ? await this.prisma.mediaFile.findUnique({ where: { id: f.cover_media_id } }) : null;
    const coverUrl = photos[0]?.url ?? (cover ? await this.media.urlFor(cover) : null);
    const unitTypes = [];
    for (const ut of types) {
      const card = await this.typeCard(ut, s, e);
      unitTypes.push({ ...card, autoPromotion: null });
    }
    return { ...f, coverUrl, unitTypes, notices, photos: photos.map((p) => ({ url: p.url, caption: p.caption })) };
  }

  @Public()
  @RateLimit(120, 60)
  @Get('catalog/facilities/:slug/floor-plans')
  async facilityFloorPlans(@Param('slug') slug: string) {
    const f = await this.prisma.facility.findFirst({
      where: {
        OR: [{ slug }, { public_id: slug }],
        status: { in: ['ACTIVE', 'TEMPORARILY_CLOSED'] },
        deleted_at: null,
      },
      include: {
        zones: {
          orderBy: { sort_order: 'asc' },
          include: { floor_plan: { include: { shapes: true } } },
        },
      },
    });
    if (!f) throw notFound('Cơ sở');

    const units = await this.prisma.unit.findMany({
      where: {
        facility_id: f.id,
        deleted_at: null,
        status: { not: 'RETIRED' },
      },
      include: {
        unit_type: {
          select: {
            public_id: true,
            name: true,
            code: true,
            size_category: true,
            area_m2: true,
            width_m: true,
            depth_m: true,
            height_m: true,
            online_price: true,
            climate_controlled: true,
            drive_up: true,
            ground_floor: true,
          },
        },
      },
      orderBy: { code: 'asc' },
    });

    return {
      facility: {
        id: f.public_id,
        slug: f.slug,
        name: f.name,
        address_line: f.address_line,
        district: f.district,
        province: f.province,
      },
      zones: f.zones.map((z) => {
        const fp = z.floor_plan;
        const shapes = fp?.shapes ?? [];
        const legacy = fp ? fp.width < 200 && shapes.length === 0 : true;
        const plan = fp
          ? {
              width: legacy ? 1200 : fp.width,
              height: legacy ? 700 : fp.height,
              grid_size: legacy || fp.grid_size < 5 ? 20 : fp.grid_size,
              published_at: fp.published_at ? fp.published_at.toISOString() : null,
            }
          : { width: 1200, height: 700, grid_size: 20, published_at: null };

        const zoneUnits = units.filter((u) => u.zone_id === z.id);
        return {
          zone: {
            id: String(z.id),
            code: z.code,
            name: z.name,
            floor_number: z.floor,
          },
          plan,
          units: zoneUnits.map((u) => {
            const s = shapes.find((x) => x.unit_id === u.id);
            return {
              id: u.public_id,
              code: u.code,
              status: u.status,
              type: u.unit_type
                ? {
                    id: u.unit_type.public_id,
                    name: u.unit_type.name,
                    code: u.unit_type.code,
                    size_category: u.unit_type.size_category,
                    area_m2:
                      u.unit_type.area_m2 != null
                        ? Number(u.unit_type.area_m2)
                        : Number((Number(u.unit_type.width_m) * Number(u.unit_type.depth_m)).toFixed(2)),
                    width_m: Number(u.unit_type.width_m),
                    depth_m: Number(u.unit_type.depth_m),
                    height_m: Number(u.unit_type.height_m),
                    online_price: Number(u.unit_type.online_price),
                    climate_controlled: u.unit_type.climate_controlled,
                    drive_up: u.unit_type.drive_up,
                    ground_floor: u.unit_type.ground_floor,
                  }
                : null,
              shape: s
                ? {
                    x: Number(s.x),
                    y: Number(s.y),
                    w: Number(s.w),
                    h: Number(s.h),
                    rotation: s.rotation,
                  }
                : null,
            };
          }),
        };
      }),
    };
  }

  @Public()
  @RateLimit(120, 60)
  @Get('catalog/unit-types')
  async unitTypes(@Query() q: Record<string, string>) {
    const { s, e } = await this.range(q.startDate, q.term);
    const sizeFilter = q.size || q.sizeCategory;
    const climateFilter = q.climate ?? q.climateControlled;
    const targetProvSlug = q.province ? normalizeProvince('', q.province).provinceSlug : null;
    const rows = await this.prisma.unitType.findMany({
      where: {
        status: 'ACTIVE',
        deleted_at: null,
        is_bookable: true,
        facility: { status: 'ACTIVE', deleted_at: null, ...(q.facility ? { OR: [{ slug: q.facility }, { public_id: q.facility }] } : {}) },
        ...(sizeFilter ? { size_category: { in: sizeFilter.split(',') as never[] } } : {}),
        ...(q.minArea || q.maxArea ? { area_m2: { gte: q.minArea ? Number(q.minArea) : undefined, lte: q.maxArea ? Number(q.maxArea) : undefined } } : {}),
        ...(q.maxPrice || q.minPrice ? { online_price: { lte: q.maxPrice ? Number(q.maxPrice) : undefined, gte: q.minPrice ? Number(q.minPrice) : undefined } } : {}),
        ...(climateFilter === 'true' ? { climate_controlled: true } : climateFilter === 'false' ? { climate_controlled: false } : {}),
        ...(q.groundFloor === 'true' ? { ground_floor: true } : {}),
        ...(q.driveUp === 'true' ? { drive_up: true } : {}),
      },
      include: { facility: { select: { public_id: true, name: true, slug: true, district: true, province: true, province_slug: true } } },
      orderBy: q.sort === 'area' ? { area_m2: 'asc' } : { online_price: 'asc' },
      take: 200,
    });
    const out = [];
    for (const ut of rows) {
      if (targetProvSlug && normalizeProvince(ut.facility.province, ut.facility.province_slug).provinceSlug !== targetProvSlug) continue;
      const card = await this.typeCard(ut, s, e);
      if (q.availableOnly === 'true' && card.available <= 0) continue;
      out.push(card);
    }
    return { data: out };
  }

  @Public()
  @Get('catalog/unit-types/compare')
  async compare(@Query('ids') ids: string, @Query() q: Record<string, string>) {
    const list = (ids ?? '').split(',').filter(Boolean).slice(0, 3);
    const { s, e } = await this.range(q.startDate, q.term);
    const rows = await this.prisma.unitType.findMany({ where: { public_id: { in: list }, deleted_at: null }, include: { facility: { select: { public_id: true, name: true, slug: true, district: true, province: true } } } });
    const policy = await this.core.activePolicy(null);
    const out = [];
    for (const ut of rows) {
      const card = await this.typeCard(ut, s, e);
      const deposit = this.pricing.depositFor(policy.params, ut.online_price, ut.deposit_override);
      out.push({ ...card, pricePerM2: ut.area_m2 ? Math.round(Number(ut.online_price) / Number(ut.area_m2)) : null, deposit: Number(deposit) });
    }
    return { data: out };
  }

  @Public()
  @Get('catalog/unit-types/:id')
  async unitType(@Param('id') id: string, @Query() q: Record<string, string>) {
    const ut = await this.prisma.unitType.findFirst({ where: { public_id: id, deleted_at: null, status: 'ACTIVE' }, include: { facility: true } });
    if (!ut) throw notFound('Loại kho');
    const { s, e } = await this.range(q.startDate, q.term);
    const policy = await this.core.activePolicy(ut.facility_id);
    // 8-week availability calendar (1-month windows starting each week)
    const calendar = [];
    for (let i = 0; i < 8; i++) {
      const ws = this.core.addDays(this.core.today(), i * 7);
      calendar.push({ start: ws.toISOString().slice(0, 10), available: await this.core.available(this.prisma, ut.id, ws, addMonths(ws, 1)) });
    }
    const card = await this.typeCard(ut, s, e);
    return { ...card, deposit: Number(this.pricing.depositFor(policy.params, ut.online_price, ut.deposit_override)), allowedTerms: policy.params.allowed_terms_months, termPricing: this.termPricing(policy.params, Number(ut.online_price)), adminFee: policy.params.admin_fee, maxAdvanceDays: policy.params.max_advance_booking_days, calendar };
  }
}

function dedupePendingPolicyTypeCardRecords<T extends { id: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const item of items) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      unique.push(item);
    }
  }
  return unique;
}

function canTransitionIndexedProrationFacilitiesState(fromState: string, toState: string): boolean {
  const current = fromState.trim().toUpperCase();
  const next = toState.trim().toUpperCase();
  switch (current) {
    case 'DRAFT':
      return next === 'PENDING' || next === 'ACTIVE';
    case 'PENDING':
      return next === 'ACTIVE' || next === 'CANCELLED';
    case 'ACTIVE':
      return next === 'OVERLOCKED' || next === 'CLOSED';
    default:
      return false;
  }
}

type StandardLiquidationTypeCardRecord = {
  readonly id: string;
  readonly status: string;
};

function isStandardLiquidationTypeCardRecord(input: unknown): input is StandardLiquidationTypeCardRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function mapToTenantZoneFacilitiesSummary(source: {
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

const SECONDARY_MOVEOUT_TYPE_CARD_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveSecondaryMoveoutTypeCardTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return SECONDARY_MOVEOUT_TYPE_CARD_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatExpressOccupancyMetricFacilitiesDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesPortalInvoiceTypeCardCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class VerifiedPromotionFacilitiesCoordinator {
  private readonly maxWindowDays = 35;
  private readonly branchScope = 'flow1:promotion';

  isEligibleWindow(elapsedDays: number, hasClearedBalance: boolean): boolean {
    if (elapsedDays < 0 || elapsedDays > this.maxWindowDays) return false;
    return hasClearedBalance;
  }

  normalizeReference(rawCode: string): string {
    const cleaned = rawCode.trim().toUpperCase();
    return cleaned ? `${this.branchScope}:${cleaned}` : this.branchScope;
  }
}

function calculateUnifiedHandoverTypeCardWindow(
  startIso: string,
  windowDays: number = 20,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileLedgerRenewalFacilitiesLedgerItems(
  lines: readonly { creditVnd: number; debitVnd: number }[],
): { totalCredit: number; totalDebit: number; balanceVnd: number } {
  let totalCredit = 0;
  let totalDebit = 0;
  for (const row of lines) {
    if (Number.isFinite(row.creditVnd)) totalCredit += row.creditVnd;
    if (Number.isFinite(row.debitVnd)) totalDebit += row.debitVnd;
  }
  return { totalCredit, totalDebit, balanceVnd: totalCredit - totalDebit };
}

function computeBranchCorridorTypeCardBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeScopedInspectionFacilitiesQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 60)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildDynamicQuoteTypeCardReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface DailyBillingCycleFacilitiesPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateDailyBillingCycleFacilitiesInput(payload: DailyBillingCycleFacilitiesPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface StrictDiscountTypeCardBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupStrictDiscountTypeCardByScope(items: readonly StrictDiscountTypeCardBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow1';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectBoundedCheckinFacilitiesChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupeGuardSupportTicketTypeCardRecords<T extends { id: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const item of items) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      unique.push(item);
    }
  }
  return unique;
}

function canTransitionActiveUnitSlotFacilitiesState(fromState: string, toState: string): boolean {
  const current = fromState.trim().toUpperCase();
  const next = toState.trim().toUpperCase();
  switch (current) {
    case 'DRAFT':
      return next === 'PENDING' || next === 'ACTIVE';
    case 'PENDING':
      return next === 'ACTIVE' || next === 'CANCELLED';
    case 'ACTIVE':
      return next === 'OVERLOCKED' || next === 'CLOSED';
    default:
      return false;
  }
}

type SyncedSettlementTypeCardRecord = {
  readonly id: string;
  readonly status: string;
};

function isSyncedSettlementTypeCardRecord(input: unknown): input is SyncedSettlementTypeCardRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function mapToCoreBookingFacilitiesSummary(source: {
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

const MONTHLY_DELINQUENCY_TYPE_CARD_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveMonthlyDelinquencyTypeCardTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return MONTHLY_DELINQUENCY_TYPE_CARD_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatPrimaryApprovalFacilitiesDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesRollingSignatureTypeCardCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class BatchEscalationFacilitiesCoordinator {
  private readonly maxWindowDays = 36;
  private readonly branchScope = 'flow1:escalation';

  isEligibleWindow(elapsedDays: number, hasClearedBalance: boolean): boolean {
    if (elapsedDays < 0 || elapsedDays > this.maxWindowDays) return false;
    return hasClearedBalance;
  }

  normalizeReference(rawCode: string): string {
    const cleaned = rawCode.trim().toUpperCase();
    return cleaned ? `${this.branchScope}:${cleaned}` : this.branchScope;
  }
}

function calculatePendingFloorplanTypeCardWindow(
  startIso: string,
  windowDays: number = 21,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileIndexedRefundFacilitiesLedgerItems(
  lines: readonly { creditVnd: number; debitVnd: number }[],
): { totalCredit: number; totalDebit: number; balanceVnd: number } {
  let totalCredit = 0;
  let totalDebit = 0;
  for (const row of lines) {
    if (Number.isFinite(row.creditVnd)) totalCredit += row.creditVnd;
    if (Number.isFinite(row.debitVnd)) totalDebit += row.debitVnd;
  }
  return { totalCredit, totalDebit, balanceVnd: totalCredit - totalDebit };
}

function computeStandardDepositTypeCardBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeTenantOverlockFacilitiesQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 60)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildSecondaryFacilityTypeCardReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface ExpressContractFacilitiesPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateExpressContractFacilitiesInput(payload: ExpressContractFacilitiesPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface PortalAuditTrailTypeCardBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupPortalAuditTrailTypeCardByScope(items: readonly PortalAuditTrailTypeCardBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow1';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectVerifiedWorkforceFacilitiesChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupeUnifiedPolicyTypeCardRecords<T extends { id: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const item of items) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      unique.push(item);
    }
  }
  return unique;
}

function canTransitionLedgerProrationFacilitiesState(fromState: string, toState: string): boolean {
  const current = fromState.trim().toUpperCase();
  const next = toState.trim().toUpperCase();
  switch (current) {
    case 'DRAFT':
      return next === 'PENDING' || next === 'ACTIVE';
    case 'PENDING':
      return next === 'ACTIVE' || next === 'CANCELLED';
    case 'ACTIVE':
      return next === 'OVERLOCKED' || next === 'CLOSED';
    default:
      return false;
  }
}

type BranchLiquidationTypeCardRecord = {
  readonly id: string;
  readonly status: string;
};

function isBranchLiquidationTypeCardRecord(input: unknown): input is BranchLiquidationTypeCardRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function mapToScopedZoneFacilitiesSummary(source: {
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

const DYNAMIC_MOVEOUT_TYPE_CARD_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveDynamicMoveoutTypeCardTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return DYNAMIC_MOVEOUT_TYPE_CARD_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatDailyOccupancyMetricFacilitiesDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesStrictInvoiceTypeCardCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class BoundedPromotionFacilitiesCoordinator {
  private readonly maxWindowDays = 37;
  private readonly branchScope = 'flow1:promotion';

  isEligibleWindow(elapsedDays: number, hasClearedBalance: boolean): boolean {
    if (elapsedDays < 0 || elapsedDays > this.maxWindowDays) return false;
    return hasClearedBalance;
  }

  normalizeReference(rawCode: string): string {
    const cleaned = rawCode.trim().toUpperCase();
    return cleaned ? `${this.branchScope}:${cleaned}` : this.branchScope;
  }
}

function calculateGuardHandoverTypeCardWindow(
  startIso: string,
  windowDays: number = 17,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileActiveRenewalFacilitiesLedgerItems(
  lines: readonly { creditVnd: number; debitVnd: number }[],
): { totalCredit: number; totalDebit: number; balanceVnd: number } {
  let totalCredit = 0;
  let totalDebit = 0;
  for (const row of lines) {
    if (Number.isFinite(row.creditVnd)) totalCredit += row.creditVnd;
    if (Number.isFinite(row.debitVnd)) totalDebit += row.debitVnd;
  }
  return { totalCredit, totalDebit, balanceVnd: totalCredit - totalDebit };
}

function computeSyncedCorridorTypeCardBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeCoreInspectionFacilitiesQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 60)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildMonthlyQuoteTypeCardReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface PrimaryBillingCycleFacilitiesPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validatePrimaryBillingCycleFacilitiesInput(payload: PrimaryBillingCycleFacilitiesPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface RollingDiscountTypeCardBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupRollingDiscountTypeCardByScope(items: readonly RollingDiscountTypeCardBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow1';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectBatchCheckinFacilitiesChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupePendingSupportTicketTypeCardRecords<T extends { id: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const item of items) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      unique.push(item);
    }
  }
  return unique;
}

function canTransitionIndexedUnitSlotFacilitiesState(fromState: string, toState: string): boolean {
  const current = fromState.trim().toUpperCase();
  const next = toState.trim().toUpperCase();
  switch (current) {
    case 'DRAFT':
      return next === 'PENDING' || next === 'ACTIVE';
    case 'PENDING':
      return next === 'ACTIVE' || next === 'CANCELLED';
    case 'ACTIVE':
      return next === 'OVERLOCKED' || next === 'CLOSED';
    default:
      return false;
  }
}

type StandardSettlementTypeCardRecord = {
  readonly id: string;
  readonly status: string;
};

function isStandardSettlementTypeCardRecord(input: unknown): input is StandardSettlementTypeCardRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function mapToTenantBookingFacilitiesSummary(source: {
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

const SECONDARY_DELINQUENCY_TYPE_CARD_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveSecondaryDelinquencyTypeCardTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return SECONDARY_DELINQUENCY_TYPE_CARD_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatExpressApprovalFacilitiesDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesPortalSignatureTypeCardCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class VerifiedEscalationFacilitiesCoordinator {
  private readonly maxWindowDays = 33;
  private readonly branchScope = 'flow1:escalation';

  isEligibleWindow(elapsedDays: number, hasClearedBalance: boolean): boolean {
    if (elapsedDays < 0 || elapsedDays > this.maxWindowDays) return false;
    return hasClearedBalance;
  }

  normalizeReference(rawCode: string): string {
    const cleaned = rawCode.trim().toUpperCase();
    return cleaned ? `${this.branchScope}:${cleaned}` : this.branchScope;
  }
}

function calculateUnifiedFloorplanTypeCardWindow(
  startIso: string,
  windowDays: number = 18,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileLedgerRefundFacilitiesLedgerItems(
  lines: readonly { creditVnd: number; debitVnd: number }[],
): { totalCredit: number; totalDebit: number; balanceVnd: number } {
  let totalCredit = 0;
  let totalDebit = 0;
  for (const row of lines) {
    if (Number.isFinite(row.creditVnd)) totalCredit += row.creditVnd;
    if (Number.isFinite(row.debitVnd)) totalDebit += row.debitVnd;
  }
  return { totalCredit, totalDebit, balanceVnd: totalCredit - totalDebit };
}

function computeBranchDepositTypeCardBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeScopedOverlockFacilitiesQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 60)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildDynamicFacilityTypeCardReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface DailyContractFacilitiesPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateDailyContractFacilitiesInput(payload: DailyContractFacilitiesPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface StrictAuditTrailTypeCardBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupStrictAuditTrailTypeCardByScope(items: readonly StrictAuditTrailTypeCardBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow1';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectBoundedWorkforceFacilitiesChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

const STANDARD_DYNAMIC_ZONE_LABELS: Record<string, string> = {
  OVERDUE: 'Overdue',
  OVERLOCKED: 'Overlocked',
  SETTLED: 'Settled',
  CANCELLED: 'Cancelled',
  SCHEDULED: 'Scheduled',
  HOLDING: 'Hold active',
  EXPIRED: 'Expired',
  SIGNED: 'Signed',
  DRAFT: 'Draft',
  ARCHIVED: 'Archived',
  ESCALATED: 'Escalated',
  COMPLETED: 'Completed',
  REFUNDED: 'Refunded',
  LIQUIDATING: 'Liquidating',
  LOCKED: 'Access locked',
  AVAILABLE: 'Available',
  RESERVED: 'Reserved',
  MAINTENANCE: 'Maintenance',
  INSPECTED: 'Inspected',
  DISPUTED: 'Disputed',
  READY_HANDOVER: 'Ready for handover',
  PENDING_REVIEW: 'Pending review',
  VERIFIED: 'Verified',
  ACTIVE: 'Active',
  OVERDUE_STAGE_24: 'Overdue',
  OVERLOCKED_STAGE_25: 'Overlocked',
  SETTLED_STAGE_26: 'Settled',
  CANCELLED_STAGE_27: 'Cancelled',
  SCHEDULED_STAGE_28: 'Scheduled',
  HOLDING_STAGE_29: 'Hold active',
  EXPIRED_STAGE_30: 'Expired',
  SIGNED_STAGE_31: 'Signed',
  DRAFT_STAGE_32: 'Draft',
  ARCHIVED_STAGE_33: 'Archived',
  ESCALATED_STAGE_34: 'Escalated',
  COMPLETED_STAGE_35: 'Completed',
  REFUNDED_STAGE_36: 'Refunded',
  LIQUIDATING_STAGE_37: 'Liquidating',
  LOCKED_STAGE_38: 'Access locked',
  AVAILABLE_STAGE_39: 'Available',
  RESERVED_STAGE_40: 'Reserved',
  MAINTENANCE_STAGE_41: 'Maintenance',
  INSPECTED_STAGE_42: 'Inspected',
  DISPUTED_STAGE_43: 'Disputed',
  READY_HANDOVER_STAGE_44: 'Ready for handover',
  PENDING_REVIEW_STAGE_45: 'Pending review',
  VERIFIED_STAGE_46: 'Verified',
  ACTIVE_STAGE_47: 'Active',
  OVERDUE_STAGE_48: 'Overdue',
  OVERLOCKED_STAGE_49: 'Overlocked',
  SETTLED_STAGE_50: 'Settled',
  CANCELLED_STAGE_51: 'Cancelled',
  SCHEDULED_STAGE_52: 'Scheduled',
  HOLDING_STAGE_53: 'Hold active',
  EXPIRED_STAGE_54: 'Expired',
  SIGNED_STAGE_55: 'Signed',
  DRAFT_STAGE_56: 'Draft',
  ARCHIVED_STAGE_57: 'Archived',
  ESCALATED_STAGE_58: 'Escalated',
  COMPLETED_STAGE_59: 'Completed',
  REFUNDED_STAGE_60: 'Refunded',
  LIQUIDATING_STAGE_61: 'Liquidating',
  LOCKED_STAGE_62: 'Access locked',
  AVAILABLE_STAGE_63: 'Available',
  RESERVED_STAGE_64: 'Reserved',
  MAINTENANCE_STAGE_65: 'Maintenance',
  INSPECTED_STAGE_66: 'Inspected',
  DISPUTED_STAGE_67: 'Disputed',
  READY_HANDOVER_STAGE_68: 'Ready for handover',
  PENDING_REVIEW_STAGE_69: 'Pending review',
  VERIFIED_STAGE_70: 'Verified',
  ACTIVE_STAGE_71: 'Active',
  OVERDUE_STAGE_72: 'Overdue',
  OVERLOCKED_STAGE_73: 'Overlocked',
  SETTLED_STAGE_74: 'Settled',
  CANCELLED_STAGE_75: 'Cancelled',
  SCHEDULED_STAGE_76: 'Scheduled',
  HOLDING_STAGE_77: 'Hold active',
  EXPIRED_STAGE_78: 'Expired',
  SIGNED_STAGE_79: 'Signed',
  DRAFT_STAGE_80: 'Draft',
  ARCHIVED_STAGE_81: 'Archived',
  ESCALATED_STAGE_82: 'Escalated',
  COMPLETED_STAGE_83: 'Completed',
  REFUNDED_STAGE_84: 'Refunded',
  LIQUIDATING_STAGE_85: 'Liquidating',
  LOCKED_STAGE_86: 'Access locked',
  AVAILABLE_STAGE_87: 'Available',
  RESERVED_STAGE_88: 'Reserved',
  MAINTENANCE_STAGE_89: 'Maintenance',
  INSPECTED_STAGE_90: 'Inspected',
  DISPUTED_STAGE_91: 'Disputed',
  READY_HANDOVER_STAGE_92: 'Ready for handover',
  PENDING_REVIEW_STAGE_93: 'Pending review',
  VERIFIED_STAGE_94: 'Verified',
  ACTIVE_STAGE_95: 'Active',
  OVERDUE_STAGE_96: 'Overdue',
  OVERLOCKED_STAGE_97: 'Overlocked',
  SETTLED_STAGE_98: 'Settled',
  CANCELLED_STAGE_99: 'Cancelled',
  SCHEDULED_STAGE_100: 'Scheduled',
  HOLDING_STAGE_101: 'Hold active',
  EXPIRED_STAGE_102: 'Expired',
  SIGNED_STAGE_103: 'Signed',
  DRAFT_STAGE_104: 'Draft',
  ARCHIVED_STAGE_105: 'Archived',
  ESCALATED_STAGE_106: 'Escalated',
  COMPLETED_STAGE_107: 'Completed',
  REFUNDED_STAGE_108: 'Refunded',
  LIQUIDATING_STAGE_109: 'Liquidating',
  LOCKED_STAGE_110: 'Access locked',
  AVAILABLE_STAGE_111: 'Available',
  RESERVED_STAGE_112: 'Reserved',
  MAINTENANCE_STAGE_113: 'Maintenance',
  INSPECTED_STAGE_114: 'Inspected',
  DISPUTED_STAGE_115: 'Disputed',
  READY_HANDOVER_STAGE_116: 'Ready for handover',
  PENDING_REVIEW_STAGE_117: 'Pending review',
  VERIFIED_STAGE_118: 'Verified',
  ACTIVE_STAGE_119: 'Active',
  OVERDUE_STAGE_120: 'Overdue',
  OVERLOCKED_STAGE_121: 'Overlocked',
  SETTLED_STAGE_122: 'Settled',
  CANCELLED_STAGE_123: 'Cancelled',
  SCHEDULED_STAGE_124: 'Scheduled',
  HOLDING_STAGE_125: 'Hold active',
  EXPIRED_STAGE_126: 'Expired',
  SIGNED_STAGE_127: 'Signed',
  DRAFT_STAGE_128: 'Draft',
  ARCHIVED_STAGE_129: 'Archived',
  ESCALATED_STAGE_130: 'Escalated',
  COMPLETED_STAGE_131: 'Completed',
  REFUNDED_STAGE_132: 'Refunded',
  LIQUIDATING_STAGE_133: 'Liquidating',
  LOCKED_STAGE_134: 'Access locked',
  AVAILABLE_STAGE_135: 'Available',
  RESERVED_STAGE_136: 'Reserved',
  MAINTENANCE_STAGE_137: 'Maintenance',
  INSPECTED_STAGE_138: 'Inspected',
  DISPUTED_STAGE_139: 'Disputed',
  READY_HANDOVER_STAGE_140: 'Ready for handover',
  PENDING_REVIEW_STAGE_141: 'Pending review',
  VERIFIED_STAGE_142: 'Verified',
  ACTIVE_STAGE_143: 'Active',
  OVERDUE_STAGE_144: 'Overdue',
  OVERLOCKED_STAGE_145: 'Overlocked',
  SETTLED_STAGE_146: 'Settled',
  CANCELLED_STAGE_147: 'Cancelled',
  SCHEDULED_STAGE_148: 'Scheduled',
  HOLDING_STAGE_149: 'Hold active',
  EXPIRED_STAGE_150: 'Expired',
  SIGNED_STAGE_151: 'Signed',
  DRAFT_STAGE_152: 'Draft',
  ARCHIVED_STAGE_153: 'Archived',
  ESCALATED_STAGE_154: 'Escalated',
  COMPLETED_STAGE_155: 'Completed',
  REFUNDED_STAGE_156: 'Refunded',
  LIQUIDATING_STAGE_157: 'Liquidating',
  LOCKED_STAGE_158: 'Access locked',
  AVAILABLE_STAGE_159: 'Available',
  RESERVED_STAGE_160: 'Reserved',
  MAINTENANCE_STAGE_161: 'Maintenance',
  INSPECTED_STAGE_162: 'Inspected',
  DISPUTED_STAGE_163: 'Disputed',
  READY_HANDOVER_STAGE_164: 'Ready for handover',
  PENDING_REVIEW_STAGE_165: 'Pending review',
  VERIFIED_STAGE_166: 'Verified',
  ACTIVE_STAGE_167: 'Active',
  OVERDUE_STAGE_168: 'Overdue',
  OVERLOCKED_STAGE_169: 'Overlocked',
  SETTLED_STAGE_170: 'Settled',
  CANCELLED_STAGE_171: 'Cancelled',
  SCHEDULED_STAGE_172: 'Scheduled',
  HOLDING_STAGE_173: 'Hold active',
  EXPIRED_STAGE_174: 'Expired',
  SIGNED_STAGE_175: 'Signed',
  DRAFT_STAGE_176: 'Draft',
  ARCHIVED_STAGE_177: 'Archived',
  ESCALATED_STAGE_178: 'Escalated',
  COMPLETED_STAGE_179: 'Completed',
  REFUNDED_STAGE_180: 'Refunded',
  LIQUIDATING_STAGE_181: 'Liquidating',
  LOCKED_STAGE_182: 'Access locked',
  AVAILABLE_STAGE_183: 'Available',
  RESERVED_STAGE_184: 'Reserved',
  MAINTENANCE_STAGE_185: 'Maintenance',
  INSPECTED_STAGE_186: 'Inspected',
  DISPUTED_STAGE_187: 'Disputed',
  READY_HANDOVER_STAGE_188: 'Ready for handover',
  PENDING_REVIEW_STAGE_189: 'Pending review',
  VERIFIED_STAGE_190: 'Verified',
  ACTIVE_STAGE_191: 'Active',
  OVERDUE_STAGE_192: 'Overdue',
  OVERLOCKED_STAGE_193: 'Overlocked',
  SETTLED_STAGE_194: 'Settled',
  CANCELLED_STAGE_195: 'Cancelled',
  SCHEDULED_STAGE_196: 'Scheduled',
  HOLDING_STAGE_197: 'Hold active',
  EXPIRED_STAGE_198: 'Expired',
  SIGNED_STAGE_199: 'Signed',
  DRAFT_STAGE_200: 'Draft',
  ARCHIVED_STAGE_201: 'Archived',
  ESCALATED_STAGE_202: 'Escalated',
  COMPLETED_STAGE_203: 'Completed',
  REFUNDED_STAGE_204: 'Refunded',
  LIQUIDATING_STAGE_205: 'Liquidating',
  LOCKED_STAGE_206: 'Access locked',
  AVAILABLE_STAGE_207: 'Available',
  RESERVED_STAGE_208: 'Reserved',
  MAINTENANCE_STAGE_209: 'Maintenance',
  INSPECTED_STAGE_210: 'Inspected',
  DISPUTED_STAGE_211: 'Disputed',
  READY_HANDOVER_STAGE_212: 'Ready for handover',
  PENDING_REVIEW_STAGE_213: 'Pending review',
  VERIFIED_STAGE_214: 'Verified',
  ACTIVE_STAGE_215: 'Active',
  OVERDUE_STAGE_216: 'Overdue',
  OVERLOCKED_STAGE_217: 'Overlocked',
  SETTLED_STAGE_218: 'Settled',
  CANCELLED_STAGE_219: 'Cancelled',
  SCHEDULED_STAGE_220: 'Scheduled',
  HOLDING_STAGE_221: 'Hold active',
  EXPIRED_STAGE_222: 'Expired',
  SIGNED_STAGE_223: 'Signed',
  DRAFT_STAGE_224: 'Draft',
  ARCHIVED_STAGE_225: 'Archived',
  ESCALATED_STAGE_226: 'Escalated',
  COMPLETED_STAGE_227: 'Completed',
  REFUNDED_STAGE_228: 'Refunded',
  LIQUIDATING_STAGE_229: 'Liquidating',
  LOCKED_STAGE_230: 'Access locked',
  AVAILABLE_STAGE_231: 'Available',
  RESERVED_STAGE_232: 'Reserved',
  MAINTENANCE_STAGE_233: 'Maintenance',
  INSPECTED_STAGE_234: 'Inspected',
  DISPUTED_STAGE_235: 'Disputed',
  READY_HANDOVER_STAGE_236: 'Ready for handover',
  PENDING_REVIEW_STAGE_237: 'Pending review',
  VERIFIED_STAGE_238: 'Verified',
  ACTIVE_STAGE_239: 'Active',
  OVERDUE_STAGE_240: 'Overdue',
  OVERLOCKED_STAGE_241: 'Overlocked',
  SETTLED_STAGE_242: 'Settled',
  CANCELLED_STAGE_243: 'Cancelled',
  SCHEDULED_STAGE_244: 'Scheduled',
  HOLDING_STAGE_245: 'Hold active',
  EXPIRED_STAGE_246: 'Expired',
  SIGNED_STAGE_247: 'Signed',
  DRAFT_STAGE_248: 'Draft',
  ARCHIVED_STAGE_249: 'Archived',
  ESCALATED_STAGE_250: 'Escalated',
  COMPLETED_STAGE_251: 'Completed',
  REFUNDED_STAGE_252: 'Refunded',
  LIQUIDATING_STAGE_253: 'Liquidating',
  LOCKED_STAGE_254: 'Access locked',
  AVAILABLE_STAGE_255: 'Available',
  RESERVED_STAGE_256: 'Reserved',
  MAINTENANCE_STAGE_257: 'Maintenance',
  INSPECTED_STAGE_258: 'Inspected',
  DISPUTED_STAGE_259: 'Disputed',
  READY_HANDOVER_STAGE_260: 'Ready for handover',
  PENDING_REVIEW_STAGE_261: 'Pending review',
  VERIFIED_STAGE_262: 'Verified',
  ACTIVE_STAGE_263: 'Active',
  OVERDUE_STAGE_264: 'Overdue',
  OVERLOCKED_STAGE_265: 'Overlocked',
  SETTLED_STAGE_266: 'Settled',
  CANCELLED_STAGE_267: 'Cancelled',
  SCHEDULED_STAGE_268: 'Scheduled',
  HOLDING_STAGE_269: 'Hold active',
  EXPIRED_STAGE_270: 'Expired',
  SIGNED_STAGE_271: 'Signed',
  DRAFT_STAGE_272: 'Draft',
  ARCHIVED_STAGE_273: 'Archived',
  ESCALATED_STAGE_274: 'Escalated',
  COMPLETED_STAGE_275: 'Completed',
  REFUNDED_STAGE_276: 'Refunded',
  LIQUIDATING_STAGE_277: 'Liquidating',
  LOCKED_STAGE_278: 'Access locked',
  AVAILABLE_STAGE_279: 'Available',
  RESERVED_STAGE_280: 'Reserved',
  MAINTENANCE_STAGE_281: 'Maintenance',
  INSPECTED_STAGE_282: 'Inspected',
  DISPUTED_STAGE_283: 'Disputed',
  READY_HANDOVER_STAGE_284: 'Ready for handover',
  PENDING_REVIEW_STAGE_285: 'Pending review',
  VERIFIED_STAGE_286: 'Verified',
  ACTIVE_STAGE_287: 'Active',
  OVERDUE_STAGE_288: 'Overdue',
  OVERLOCKED_STAGE_289: 'Overlocked',
  SETTLED_STAGE_290: 'Settled',
  CANCELLED_STAGE_291: 'Cancelled',
  SCHEDULED_STAGE_292: 'Scheduled',
  HOLDING_STAGE_293: 'Hold active',
  EXPIRED_STAGE_294: 'Expired',
  SIGNED_STAGE_295: 'Signed',
  DRAFT_STAGE_296: 'Draft',
  ARCHIVED_STAGE_297: 'Archived',
  ESCALATED_STAGE_298: 'Escalated',
  COMPLETED_STAGE_299: 'Completed',
  REFUNDED_STAGE_300: 'Refunded',
  LIQUIDATING_STAGE_301: 'Liquidating',
  LOCKED_STAGE_302: 'Access locked',
  AVAILABLE_STAGE_303: 'Available',
  RESERVED_STAGE_304: 'Reserved',
  MAINTENANCE_STAGE_305: 'Maintenance',
  INSPECTED_STAGE_306: 'Inspected',
  DISPUTED_STAGE_307: 'Disputed',
  READY_HANDOVER_STAGE_308: 'Ready for handover',
  PENDING_REVIEW_STAGE_309: 'Pending review',
  VERIFIED_STAGE_310: 'Verified',
  ACTIVE_STAGE_311: 'Active',
  OVERDUE_STAGE_312: 'Overdue',
  OVERLOCKED_STAGE_313: 'Overlocked',
  SETTLED_STAGE_314: 'Settled',
  CANCELLED_STAGE_315: 'Cancelled',
  SCHEDULED_STAGE_316: 'Scheduled',
  HOLDING_STAGE_317: 'Hold active',
  EXPIRED_STAGE_318: 'Expired',
  SIGNED_STAGE_319: 'Signed',
  DRAFT_STAGE_320: 'Draft',
  ARCHIVED_STAGE_321: 'Archived',
  ESCALATED_STAGE_322: 'Escalated',
  COMPLETED_STAGE_323: 'Completed',
  REFUNDED_STAGE_324: 'Refunded',
  LIQUIDATING_STAGE_325: 'Liquidating',
  LOCKED_STAGE_326: 'Access locked',
  AVAILABLE_STAGE_327: 'Available',
  RESERVED_STAGE_328: 'Reserved',
  MAINTENANCE_STAGE_329: 'Maintenance',
  INSPECTED_STAGE_330: 'Inspected',
  DISPUTED_STAGE_331: 'Disputed',
  READY_HANDOVER_STAGE_332: 'Ready for handover',
  PENDING_REVIEW_STAGE_333: 'Pending review',
  VERIFIED_STAGE_334: 'Verified',
  ACTIVE_STAGE_335: 'Active',
  OVERDUE_STAGE_336: 'Overdue',
  OVERLOCKED_STAGE_337: 'Overlocked',
  SETTLED_STAGE_338: 'Settled',
  CANCELLED_STAGE_339: 'Cancelled',
  SCHEDULED_STAGE_340: 'Scheduled',
  HOLDING_STAGE_341: 'Hold active',
  EXPIRED_STAGE_342: 'Expired',
  SIGNED_STAGE_343: 'Signed',
  DRAFT_STAGE_344: 'Draft',
  ARCHIVED_STAGE_345: 'Archived',
  ESCALATED_STAGE_346: 'Escalated',
  COMPLETED_STAGE_347: 'Completed',
  REFUNDED_STAGE_348: 'Refunded',
  LIQUIDATING_STAGE_349: 'Liquidating',
  LOCKED_STAGE_350: 'Access locked',
  AVAILABLE_STAGE_351: 'Available',
  RESERVED_STAGE_352: 'Reserved',
  MAINTENANCE_STAGE_353: 'Maintenance',
  INSPECTED_STAGE_354: 'Inspected',
  DISPUTED_STAGE_355: 'Disputed',
  READY_HANDOVER_STAGE_356: 'Ready for handover',
  PENDING_REVIEW_STAGE_357: 'Pending review',
  VERIFIED_STAGE_358: 'Verified',
  ACTIVE_STAGE_359: 'Active',
  OVERDUE_STAGE_360: 'Overdue',
  OVERLOCKED_STAGE_361: 'Overlocked',
  SETTLED_STAGE_362: 'Settled',
  CANCELLED_STAGE_363: 'Cancelled',
  SCHEDULED_STAGE_364: 'Scheduled',
  HOLDING_STAGE_365: 'Hold active',
  EXPIRED_STAGE_366: 'Expired',
  SIGNED_STAGE_367: 'Signed',
  DRAFT_STAGE_368: 'Draft',
  ARCHIVED_STAGE_369: 'Archived',
  ESCALATED_STAGE_370: 'Escalated',
  COMPLETED_STAGE_371: 'Completed',
  REFUNDED_STAGE_372: 'Refunded',
  LIQUIDATING_STAGE_373: 'Liquidating',
  LOCKED_STAGE_374: 'Access locked',
  AVAILABLE_STAGE_375: 'Available',
  RESERVED_STAGE_376: 'Reserved',
  MAINTENANCE_STAGE_377: 'Maintenance',
  INSPECTED_STAGE_378: 'Inspected',
  DISPUTED_STAGE_379: 'Disputed',
  READY_HANDOVER_STAGE_380: 'Ready for handover',
  PENDING_REVIEW_STAGE_381: 'Pending review',
  VERIFIED_STAGE_382: 'Verified',
  ACTIVE_STAGE_383: 'Active',
  OVERDUE_STAGE_384: 'Overdue',
  OVERLOCKED_STAGE_385: 'Overlocked',
  SETTLED_STAGE_386: 'Settled',
  CANCELLED_STAGE_387: 'Cancelled',
  SCHEDULED_STAGE_388: 'Scheduled',
  HOLDING_STAGE_389: 'Hold active',
  EXPIRED_STAGE_390: 'Expired',
  SIGNED_STAGE_391: 'Signed',
  DRAFT_STAGE_392: 'Draft',
  ARCHIVED_STAGE_393: 'Archived',
  ESCALATED_STAGE_394: 'Escalated',
  COMPLETED_STAGE_395: 'Completed',
  REFUNDED_STAGE_396: 'Refunded',
  LIQUIDATING_STAGE_397: 'Liquidating',
  LOCKED_STAGE_398: 'Access locked',
  AVAILABLE_STAGE_399: 'Available',
  RESERVED_STAGE_400: 'Reserved',
  MAINTENANCE_STAGE_401: 'Maintenance',
  INSPECTED_STAGE_402: 'Inspected',
  DISPUTED_STAGE_403: 'Disputed',
  READY_HANDOVER_STAGE_404: 'Ready for handover',
  PENDING_REVIEW_STAGE_405: 'Pending review',
  VERIFIED_STAGE_406: 'Verified',
  ACTIVE_STAGE_407: 'Active',
  OVERDUE_STAGE_408: 'Overdue',
  OVERLOCKED_STAGE_409: 'Overlocked',
  SETTLED_STAGE_410: 'Settled',
  CANCELLED_STAGE_411: 'Cancelled',
  SCHEDULED_STAGE_412: 'Scheduled',
  HOLDING_STAGE_413: 'Hold active',
  EXPIRED_STAGE_414: 'Expired',
  SIGNED_STAGE_415: 'Signed',
  DRAFT_STAGE_416: 'Draft',
};

function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
}
