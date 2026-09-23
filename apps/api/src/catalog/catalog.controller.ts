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
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
}
