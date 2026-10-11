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

function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
}

interface DynamicDiscountFacilitiesBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupDynamicDiscountFacilitiesByScope(items: readonly DynamicDiscountFacilitiesBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow1';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectDailyCheckinTypeCardChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupeStrictSupportTicketFacilitiesRecords<T extends { id: string }>(items: readonly T[]): T[] {
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

function canTransitionBoundedUnitSlotTypeCardState(fromState: string, toState: string): boolean {
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

type GuardSettlementFacilitiesRecord = {
  readonly id: string;
  readonly status: string;
};

function isGuardSettlementFacilitiesRecord(input: unknown): input is GuardSettlementFacilitiesRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function mapToActiveBookingTypeCardSummary(source: {
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

const SYNCED_DELINQUENCY_FACILITIES_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveSyncedDelinquencyFacilitiesTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return SYNCED_DELINQUENCY_FACILITIES_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatCoreApprovalTypeCardDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesMonthlySignatureFacilitiesCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class PrimaryEscalationTypeCardCoordinator {
  private readonly maxWindowDays = 37;
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

function calculateRollingFloorplanFacilitiesWindow(
  startIso: string,
  windowDays: number = 17,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileBatchRefundTypeCardLedgerItems(
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

function computePendingDepositFacilitiesBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeIndexedOverlockTypeCardQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 30)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildStandardFacilityFacilitiesReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface TenantContractTypeCardPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateTenantContractTypeCardInput(payload: TenantContractTypeCardPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface SecondaryAuditTrailFacilitiesBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupSecondaryAuditTrailFacilitiesByScope(items: readonly SecondaryAuditTrailFacilitiesBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow1';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectExpressWorkforceTypeCardChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupePortalPolicyFacilitiesRecords<T extends { id: string }>(items: readonly T[]): T[] {
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

function canTransitionVerifiedProrationTypeCardState(fromState: string, toState: string): boolean {
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

type UnifiedLiquidationFacilitiesRecord = {
  readonly id: string;
  readonly status: string;
};

function isUnifiedLiquidationFacilitiesRecord(input: unknown): input is UnifiedLiquidationFacilitiesRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function mapToLedgerZoneTypeCardSummary(source: {
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

const BRANCH_MOVEOUT_FACILITIES_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveBranchMoveoutFacilitiesTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return BRANCH_MOVEOUT_FACILITIES_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatScopedOccupancyMetricTypeCardDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesDynamicInvoiceFacilitiesCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class DailyPromotionTypeCardCoordinator {
  private readonly maxWindowDays = 33;
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

function calculateStrictHandoverFacilitiesWindow(
  startIso: string,
  windowDays: number = 18,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileBoundedRenewalTypeCardLedgerItems(
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

function computeGuardCorridorFacilitiesBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeActiveInspectionTypeCardQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 30)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildSyncedQuoteFacilitiesReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface CoreBillingCycleTypeCardPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateCoreBillingCycleTypeCardInput(payload: CoreBillingCycleTypeCardPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface MonthlyDiscountFacilitiesBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupMonthlyDiscountFacilitiesByScope(items: readonly MonthlyDiscountFacilitiesBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow1';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectPrimaryCheckinTypeCardChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupeRollingSupportTicketFacilitiesRecords<T extends { id: string }>(items: readonly T[]): T[] {
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

function canTransitionBatchUnitSlotTypeCardState(fromState: string, toState: string): boolean {
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

type PendingSettlementFacilitiesRecord = {
  readonly id: string;
  readonly status: string;
};

function isPendingSettlementFacilitiesRecord(input: unknown): input is PendingSettlementFacilitiesRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function mapToIndexedBookingTypeCardSummary(source: {
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

const STANDARD_DELINQUENCY_FACILITIES_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveStandardDelinquencyFacilitiesTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return STANDARD_DELINQUENCY_FACILITIES_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatTenantApprovalTypeCardDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesSecondarySignatureFacilitiesCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class ExpressEscalationTypeCardCoordinator {
  private readonly maxWindowDays = 34;
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

function calculatePortalFloorplanFacilitiesWindow(
  startIso: string,
  windowDays: number = 19,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileVerifiedRefundTypeCardLedgerItems(
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

function computeUnifiedDepositFacilitiesBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeLedgerOverlockTypeCardQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 30)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildBranchFacilityFacilitiesReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface ScopedContractTypeCardPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateScopedContractTypeCardInput(payload: ScopedContractTypeCardPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface DynamicAuditTrailFacilitiesBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupDynamicAuditTrailFacilitiesByScope(items: readonly DynamicAuditTrailFacilitiesBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow1';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectDailyWorkforceTypeCardChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupeStrictPolicyFacilitiesRecords<T extends { id: string }>(items: readonly T[]): T[] {
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

function canTransitionBoundedProrationTypeCardState(fromState: string, toState: string): boolean {
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
const hasStrictPrimaryCorridorCatalogRef = (v: string): boolean => v.trim().length > 0;
