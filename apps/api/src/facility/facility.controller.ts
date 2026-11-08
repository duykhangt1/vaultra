import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { UNIT_MANUAL_TRANSITIONS, canTransition } from '@vaultra/shared';
import { PrismaService } from '../common/prisma.service';
import { Ctx, RateLimit, RequirePermission } from '../auth/decorators';
import { AccessContext } from '../auth/access-context';
import { parse, zDate, zReason } from '../common/http';
import { AppError, forbidden, invalidTransition, notFound, validation } from '../common/errors';
import { D, newId, normalizeProvince } from '../common/util';
import { dateOnly } from '../common/dates';
import { CoreService } from '../domain/core.service';
import { AuditService } from '../audit/audit.service';
import { NotificationService } from '../notifications/notification.service';
import { MediaService } from '../media/media.service';
import { Prisma } from '../generated/prisma/client';

const hours = z.record(z.string(), z.tuple([z.string().regex(/^\d{2}:\d{2}$/), z.string().regex(/^\d{2}:\d{2}$/)]));
const photoIds = z.array(z.string().length(26)).max(12);
const facilityBody = z.object({
  code: z.string().trim().min(2).max(16),
  name: z.string().trim().min(3).max(150),
  slug: z.string().trim().regex(/^[a-z0-9-]+$/).max(160),
  addressLine: z.string().trim().min(3).max(255),
  ward: z.string().trim().max(100).optional().nullable(),
  district: z.string().trim().min(2).max(100),
  province: z.string().trim().min(2).max(100),
  provinceSlug: z.string().trim().regex(/^[a-z0-9-]+$/),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  phone: z.string().max(20).optional().nullable(),
  email: z.string().email().optional().nullable(),
  hotline: z.string().max(20).optional().nullable(),
  officeHours: hours,
  accessHours: hours,
  amenities: z.array(z.string()).default([]),
  description: z.string().max(5000).optional().nullable(),
  autoAssign: z.boolean().default(true),
  autoDispatch: z.boolean().default(false),
  totalAreaM2: z.number().min(0).optional().nullable(),
  openedAt: zDate.optional().nullable(),
  /** READY uploads (media public ids) in display order; the first becomes the cover. Create only. */
  photoIds: photoIds.optional(),
});

/** Facilities, zones, slots, closures, notices (spec §11.7, FR-B01, FR-M01). */
@Controller()
export class FacilityController {
  constructor(private prisma: PrismaService, private core: CoreService, private audit: AuditService, private notify: NotificationService, private media: MediaService) {}

  private async facility(ctx: AccessContext, id: string, perm = 'facility.manage', write = true) {
    const f = await this.prisma.facility.findFirst({ where: { OR: [{ public_id: id }, { slug: id }], deleted_at: null } });
    ctx.assertScope(perm, f ? { facility_id: f.id } : null, 'Cơ sở', write);
    return f!;
  }

  @Get('facilities')
  async list(@Ctx() ctx: AccessContext) {
    const ids = ctx.facilityIds;
    const global = ctx.hasRole('BUSINESS_OPS_MANAGER') || ctx.hasRole('SYSTEM_ADMIN');
    if (!global && !ids.length) return [];
    const rows = await this.prisma.facility.findMany({ where: { deleted_at: null, ...(global ? {} : { id: { in: ids } }) }, orderBy: { name: 'asc' }, include: { _count: { select: { units: true, unit_types: true } } } });
    // two queries for all facilities instead of two per facility
    const grouped = await this.prisma.unit.groupBy({ by: ['facility_id', 'status'], where: { facility_id: { in: rows.map((r) => r.id) }, deleted_at: null }, _count: true });
    const covers = await this.prisma.mediaFile.findMany({ where: { id: { in: rows.map((r) => r.cover_media_id).filter((x): x is bigint => !!x) } } });
    const out = [];
    for (const f of rows) {
      const counts = Object.fromEntries(grouped.filter((g) => String(g.facility_id) === String(f.id)).map((b) => [b.status, b._count]));
      // rentable stock counted from the same rows as the status counts (deleted units excluded), so it matches the dashboards and reports
      const rentable = Object.values(counts).reduce<number>((s, n) => s + Number(n), 0) - (counts.OUT_OF_SERVICE ?? 0) - (counts.RETIRED ?? 0);
      const cover = f.cover_media_id ? covers.find((c) => String(c.id) === String(f.cover_media_id)) ?? null : null;
      const facPhotos = !cover ? await this.media.listFor('facility', [f.id]) : [];
      const coverUrl = cover ? await this.media.urlFor(cover) : (facPhotos[0]?.url ?? null);
      out.push({ ...f, unitCounts: counts, occupancy: rentable ? ((counts.OCCUPIED ?? 0) + (counts.OVERLOCKED ?? 0)) / rentable : 0, coverUrl });
    }
    return out;
  }

  @RequirePermission('facility.manage')
  @Post('facilities')
  async create(@Ctx() ctx: AccessContext, @Body() body: unknown) {
    if (ctx.grant('facility.manage')!.scope !== 'GLOBAL') throw forbidden('Chỉ Business Operations Manager tạo cơ sở');
    const d = parse(facilityBody, body);
    const normProv = normalizeProvince(d.province, d.provinceSlug);
    const f = await this.prisma.$transaction(async (tx) => {
      const created = await tx.facility.create({
      data: {
        public_id: newId(), code: d.code.toUpperCase(), name: d.name, slug: d.slug, status: 'DRAFT', address_line: d.addressLine, ward: d.ward, district: d.district, province: normProv.province, province_slug: normProv.provinceSlug,
        latitude: d.latitude ?? null, longitude: d.longitude ?? null, phone: d.phone, email: d.email, hotline: d.hotline, office_hours: d.officeHours, access_hours: d.accessHours, amenities: d.amenities,
        description: d.description, auto_assign: d.autoAssign, auto_dispatch: d.autoDispatch, total_area_m2: d.totalAreaM2 ?? null, opened_at: d.openedAt ? dateOnly(d.openedAt) : null,
      },
      });
      if (d.photoIds?.length) {
        const rows = await this.media.syncOwnerFiles(tx, ctx, 'facility', created.id, created.id, d.photoIds);
        if (rows[0]) await tx.facility.update({ where: { id: created.id }, data: { cover_media_id: rows[0].id } });
      }
      return created;
    });
    const { photoIds: _photos, ...audited } = d;
    await this.audit.log(ctx, { action: 'facility.create', entityType: 'facility', entityId: f.id, entityRef: f.code, facilityId: f.id, after: { ...audited, photos: d.photoIds?.length ?? 0 } });
    return f;
  }

  @Get('facilities/:id')
  async get(@Ctx() ctx: AccessContext, @Param('id') id: string) {
    const global = ctx.hasRole('BUSINESS_OPS_MANAGER') || ctx.hasRole('SYSTEM_ADMIN');
    const f = await this.prisma.facility.findFirst({ where: { OR: [{ public_id: id }, { slug: id }], deleted_at: null }, include: { zones: { orderBy: { sort_order: 'asc' } }, slots: { orderBy: [{ weekday: 'asc' }, { start_time: 'asc' }] }, closures: { orderBy: { date: 'asc' } }, notices: { orderBy: { starts_at: 'desc' }, take: 20 } } });
    if (!f || (!global && !ctx.facilityIds.includes(f.id))) throw notFound('Cơ sở');
    const photos = await this.media.listFor('facility', [f.id]);
    const managers = await this.prisma.userRole.findMany({ where: { facility_id: f.id, revoked_at: null, role: { code: 'FACILITY_MANAGER' } }, include: { user: { select: { public_id: true, full_name: true, email: true } } } });
    return { ...f, photos, managers: managers.map((m) => m.user) };
  }

  @RequirePermission('facility.manage')
  @Patch('facilities/:id')
  async update(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() body: unknown) {
    const f = await this.facility(ctx, id);
    const { photoIds: _ignored, ...rest } = parse(facilityBody.partial(), body);
    const d = rest;
    const g = ctx.grant('facility.manage')!;
    if (g.scope === 'FACILITY') {
      // FM may only edit operational info (§5.2 facility.manage F)
      const allowed = ['phone', 'email', 'hotline', 'officeHours', 'accessHours', 'description', 'autoAssign', 'autoDispatch', 'amenities'];
      const bad = Object.keys(d).filter((k) => !allowed.includes(k));
      if (bad.length) throw forbidden(`Quản lý cơ sở không được sửa: ${bad.join(', ')}`);
    }
    const normProv = d.province !== undefined || d.provinceSlug !== undefined
      ? normalizeProvince(d.province ?? f.province, d.provinceSlug ?? f.province_slug)
      : null;
    const u = await this.prisma.facility.update({
      where: { id: f.id },
      data: {
        code: d.code?.toUpperCase(), name: d.name, slug: d.slug, address_line: d.addressLine, ward: d.ward, district: d.district, province: normProv ? normProv.province : undefined, province_slug: normProv ? normProv.provinceSlug : undefined,
        latitude: d.latitude, longitude: d.longitude, phone: d.phone, email: d.email, hotline: d.hotline, office_hours: d.officeHours, access_hours: d.accessHours, amenities: d.amenities,
        description: d.description, auto_assign: d.autoAssign, auto_dispatch: d.autoDispatch, total_area_m2: d.totalAreaM2, opened_at: d.openedAt ? dateOnly(d.openedAt) : undefined,
      },
    });
    await this.audit.log(ctx, { action: 'facility.update', entityType: 'facility', entityId: f.id, entityRef: f.code, facilityId: f.id, before: f, after: d });
    return u;
  }

  /** PUT /facilities/:id/photos — replaces the photo set (ordered); the first photo is the cover shown on the public site. */
  @RequirePermission('facility.manage')
  @Put('facilities/:id/photos')
  async setPhotos(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() body: unknown) {
    const f = await this.facility(ctx, id);
    const d = parse(z.object({ mediaIds: photoIds }), body);
    const rows = await this.prisma.$transaction(async (tx) => {
      const out = await this.media.syncOwnerFiles(tx, ctx, 'facility', f.id, f.id, d.mediaIds);
      await tx.facility.update({ where: { id: f.id }, data: { cover_media_id: out[0]?.id ?? null } });
      return out;
    });
    await this.audit.log(ctx, { action: 'facility.photos', entityType: 'facility', entityId: f.id, entityRef: f.code, facilityId: f.id, after: { count: rows.length } });
    return { photos: await this.media.listFor('facility', [f.id]) };
  }

  // ---------- address search / reverse geocoding for the location picker (OpenStreetMap Nominatim, server side, cached)
  @RequirePermission('facility.manage', false)
  @RateLimit(30, 60)
  @Get('geocoding/search')
  async geoSearch(@Query('q') q?: string) {
    const text = (q ?? '').trim().replace(/\s+/g, ' ');
    if (text.length < 2) throw validation('Nhập ít nhất 2 ký tự');
    const coord = text.match(/^(-?\d{1,2}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)$/);
    if (coord) return [{ displayName: `Tọa độ ${coord[1]}, ${coord[2]}`, latitude: Number(coord[1]), longitude: Number(coord[2]) }];
    try {
      const rows = await this.nominatim('search', { q: text, countrycodes: 'vn', limit: '6', addressdetails: '1' });
      return (rows as Record<string, any>[]).map((r) => ({ displayName: r.display_name as string, latitude: Number(r.lat), longitude: Number(r.lon), ...this.addressParts(r.address) }));
    } catch (e) {
      // Nominatim unreachable (blocked network or rate limit): Photon serves the same OpenStreetMap data
      const photon = await this.photon('api', { q: text, limit: '8', bbox: '102.1,8.2,109.6,23.5' }).catch(() => null);
      if (!photon) throw e;
      return photon.features.map((f: any) => this.photonPlace(f));
    }
  }

  @RequirePermission('facility.manage', false)
  @RateLimit(30, 60)
  @Get('geocoding/reverse')
  async geoReverse(@Query('lat') lat?: string, @Query('lng') lng?: string) {
    const la = Number(lat), lo = Number(lng);
    if (!Number.isFinite(la) || !Number.isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) throw validation('Tọa độ không hợp lệ');
    try {
      const r = (await this.nominatim('reverse', { lat: String(la), lon: String(lo), zoom: '18', addressdetails: '1' })) as Record<string, any>;
      return { displayName: (r.display_name as string) ?? '', latitude: la, longitude: lo, ...this.addressParts(r.address) };
    } catch (e) {
      const photon = await this.photon('reverse', { lat: String(la), lon: String(lo) }).catch(() => null);
      if (!photon) throw e;
      const f = photon.features[0];
      return f ? { ...this.photonPlace(f), latitude: la, longitude: lo } : { displayName: '', latitude: la, longitude: lo };
    }
  }

  private geoCache = new Map<string, { at: number; v: unknown }>();
  private async nominatim(kind: 'search' | 'reverse', params: Record<string, string>) {
    const qs = new URLSearchParams({ format: 'jsonv2', 'accept-language': 'vi', ...params }).toString();
    const hit = this.geoCache.get(`${kind}?${qs}`);
    if (hit && Date.now() - hit.at < 3600_000) return hit.v;
    let res: Response;
    try {
      // public Nominatim policy: identify the app, explicit searches only (never per keystroke)
      res = await fetch(`https://nominatim.openstreetmap.org/${kind}?${qs}`, { headers: { 'user-agent': 'Vaultra-Storage/1.0 (facility-location-picker)', accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
    } catch {
      throw new AppError('CONFLICT', 'Không kết nối được dịch vụ tìm địa chỉ. Bạn vẫn có thể bấm trực tiếp lên bản đồ để đặt ghim.');
    }
    if (!res.ok) throw new AppError('CONFLICT', 'Dịch vụ tìm địa chỉ đang bận, hãy thử lại sau ít phút.');
    const v = await res.json();
    if (this.geoCache.size > 500) this.geoCache.clear();
    this.geoCache.set(`${kind}?${qs}`, { at: Date.now(), v });
    return v;
  }

  private async photon(path: 'api' | 'reverse', params: Record<string, string>): Promise<{ features: any[] }> {
    const qs = new URLSearchParams(params).toString();
    const key = `photon/${path}?${qs}`;
    const hit = this.geoCache.get(key);
    if (hit && Date.now() - hit.at < 3600_000) return hit.v as any;
    const res = await fetch(`https://photon.komoot.io/${path}?${qs}`, { headers: { 'user-agent': 'Vaultra-Storage/1.0 (facility-location-picker)', accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new AppError('PAYMENT_PROVIDER_ERROR', 'Dịch vụ tìm địa chỉ đang bận, hãy thử lại sau ít phút.');
    const v = (await res.json()) as { features: any[] };
    this.geoCache.set(key, { at: Date.now(), v });
    return v;
  }

  private photonPlace(f: any) {
    const p = f.properties ?? {};
    const [lng, lat] = f.geometry?.coordinates ?? [NaN, NaN];
    const street = [p.housenumber, p.street ?? (p.type === 'street' ? p.name : '')].filter(Boolean).join(' ');
    const province = String(p.state ?? p.city ?? '').replace(/^(Thành phố|Tỉnh)\s+/i, '');
    // Photon labels vary: with a county, `district` is the ward; otherwise `district` is the only admin level below the city
    const district = p.county ?? p.district ?? '';
    const ward = p.county ? (p.district ?? '') : (p.locality ?? '');
    const label = [p.name, street && street !== p.name ? street : '', p.district, p.county, p.city, p.state].filter(Boolean);
    return { displayName: [...new Set(label)].join(', '), latitude: Number(lat), longitude: Number(lng), addressLine: street || (p.type === 'house' ? p.name : '') || '', ward, district, province };
  }

  /** Splits a Nominatim address into the fields of the facility form. */
  private addressParts(a?: Record<string, string>) {
    if (!a) return {};
    const street = [a.house_number, a.road].filter(Boolean).join(' ');
    const district = a.city_district || a.county || a.suburb || a.district || '';
    const province = (a.city || a.state || a.province || '').replace(/^(Thành phố|Tỉnh)\s+/i, '');
    return { addressLine: street || a.neighbourhood || a.quarter || '', ward: a.quarter || a.suburb || a.village || a.neighbourhood || '', district, province };
  }

  /** POST /facilities/:id/status — BOM: open / temporarily close / deactivate. */
  @RequirePermission('facility.manage')
  @Post('facilities/:id/status')
  async status(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() body: unknown) {
    if (ctx.grant('facility.manage')!.scope !== 'GLOBAL') throw forbidden('Chỉ BOM đổi trạng thái cơ sở');
    const f = await this.facility(ctx, id);
    const d = parse(z.object({ status: z.enum(['ACTIVE', 'TEMPORARILY_CLOSED', 'INACTIVE']), acceptsBookings: z.boolean().optional(), reason: zReason }), body);
    if (d.status === 'INACTIVE') {
      const live = await this.prisma.contract.count({ where: { facility_id: f.id, status: { in: ['ACTIVE', 'MOVE_OUT_SCHEDULED', 'EXPIRED', 'SIGNED', 'PENDING_SIGNATURE'] } } });
      if (live) throw new AppError('CONFLICT', `Còn ${live} hợp đồng hiệu lực — chuyển cơ sở hoặc kết thúc hợp đồng trước`);
    }
    if (d.status === 'ACTIVE') {
      const types = await this.prisma.unitType.count({ where: { facility_id: f.id, status: 'ACTIVE' } });
      if (!types) throw validation('Cơ sở cần ít nhất một loại kho đang hoạt động trước khi mở');
    }
    const u = await this.prisma.facility.update({ where: { id: f.id }, data: { status: d.status, accepts_bookings: d.acceptsBookings ?? d.status === 'ACTIVE' } });
    await this.audit.log(ctx, { action: 'facility.status', entityType: 'facility', entityId: f.id, entityRef: f.code, facilityId: f.id, reason: d.reason, before: { status: f.status }, after: { status: d.status } });
    if (d.status === 'TEMPORARILY_CLOSED') {
      const pending = await this.prisma.reservation.count({ where: { facility_id: f.id, status: { in: ['CONFIRMED', 'UNIT_ASSIGNED', 'MOVE_IN_SCHEDULED'] } } });
      return { ...u, affectedReservations: pending, note: pending ? 'Có đơn đã xác nhận — chuyển cơ sở khác (giữ giá) hoặc hủy hoàn 100% tại màn Đặt thuê' : null };
    }
    return u;
  }

  // ---------- zones
  @RequirePermission('facility.manage')
  @Post('facilities/:id/zones')
  async addZone(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() body: unknown) {
    const f = await this.facility(ctx, id);
    const d = parse(z.object({ code: z.string().trim().min(1).max(16), name: z.string().trim().min(1).max(100), floor: z.number().int().min(-5).max(50), hasElevator: z.boolean().default(false), driveUp: z.boolean().default(false), climateControlled: z.boolean().default(false), sortOrder: z.number().int().default(0) }), body);
    const zone = await this.prisma.zone.create({ data: { facility_id: f.id, code: d.code.toUpperCase(), name: d.name, floor: d.floor, has_elevator: d.hasElevator, drive_up: d.driveUp, climate_controlled: d.climateControlled, sort_order: d.sortOrder } });
    await this.prisma.floorPlan.create({ data: { facility_id: f.id, zone_id: zone.id, name: `Sơ đồ ${zone.name}` } });
    await this.audit.log(ctx, { action: 'zone.create', entityType: 'zone', entityId: zone.id, facilityId: f.id, after: d });
    return zone;
  }

  @RequirePermission('facility.manage')
  @Patch('zones/:zoneId')
  async updateZone(@Ctx() ctx: AccessContext, @Param('zoneId') zoneId: string, @Body() body: unknown) {
    const zone = await this.prisma.zone.findUnique({ where: { id: BigInt(zoneId) } });
    ctx.assertScope('facility.manage', zone, 'Khu', true);
    const d = parse(z.object({ name: z.string().max(100), floor: z.number().int(), hasElevator: z.boolean(), driveUp: z.boolean(), climateControlled: z.boolean(), sortOrder: z.number().int() }).partial(), body);
    return this.prisma.zone.update({ where: { id: zone!.id }, data: { name: d.name, floor: d.floor, has_elevator: d.hasElevator, drive_up: d.driveUp, climate_controlled: d.climateControlled, sort_order: d.sortOrder } });
  }

  // ---------- appointment slot rules & closures
  @RequirePermission('facility.manage')
  @Put('facilities/:id/appointment-slot-rules')
  async setSlots(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() body: unknown) {
    const f = await this.facility(ctx, id);
    const rules = parse(z.array(z.object({ type: z.enum(['MOVE_IN', 'MOVE_OUT', 'BOTH']), weekday: z.number().int().min(0).max(6), startTime: z.string().regex(/^\d{2}:\d{2}$/), endTime: z.string().regex(/^\d{2}:\d{2}$/), capacity: z.number().int().min(1).max(50), active: z.boolean().default(true) })).max(200), body);
    for (const r of rules) if (r.endTime <= r.startTime) throw validation(`Khung ${r.startTime}–${r.endTime} không hợp lệ`);
    await this.prisma.$transaction(async (tx) => {
      await tx.appointmentSlot.updateMany({ where: { facility_id: f.id }, data: { active: false } });
      for (const r of rules) {
        const ex = await tx.appointmentSlot.findFirst({ where: { facility_id: f.id, weekday: r.weekday, start_time: r.startTime, type: r.type } });
        if (ex) await tx.appointmentSlot.update({ where: { id: ex.id }, data: { end_time: r.endTime, capacity: r.capacity, active: r.active } });
        else await tx.appointmentSlot.create({ data: { facility_id: f.id, type: r.type, weekday: r.weekday, start_time: r.startTime, end_time: r.endTime, capacity: r.capacity, active: r.active } });
      }
    });
    await this.audit.log(ctx, { action: 'facility.slots_update', entityType: 'facility', entityId: f.id, facilityId: f.id, after: { count: rules.length } });
    return this.prisma.appointmentSlot.findMany({ where: { facility_id: f.id, active: true }, orderBy: [{ weekday: 'asc' }, { start_time: 'asc' }] });
  }

  @RequirePermission('facility.manage')
  @Post('facilities/:id/closures')
  async addClosure(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() body: unknown) {
    const f = await this.facility(ctx, id);
    const d = parse(z.object({ date: zDate, reason: z.string().trim().min(2).max(255) }), body);
    return this.prisma.facilityClosure.upsert({ where: { facility_id_date: { facility_id: f.id, date: dateOnly(d.date) } }, update: { reason: d.reason }, create: { facility_id: f.id, date: dateOnly(d.date), reason: d.reason } });
  }

  @RequirePermission('facility.manage')
  @Delete('facilities/:id/closures/:date')
  async delClosure(@Ctx() ctx: AccessContext, @Param('id') id: string, @Param('date') date: string) {
    const f = await this.facility(ctx, id);
    await this.prisma.facilityClosure.deleteMany({ where: { facility_id: f.id, date: dateOnly(date) } });
    return { ok: true };
  }

  // ---------- operational notices (§6.5 5E)
  @RequirePermission('facility.manage')
  @Post('facilities/:id/notices')
  async addNotice(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() body: unknown) {
    const f = await this.facility(ctx, id);
    const d = parse(z.object({ title: z.string().trim().min(3).max(200), body: z.string().trim().min(3).max(5000), severity: z.enum(['INFO', 'WARNING', 'CRITICAL']).default('INFO'), startsAt: z.string().datetime().optional(), endsAt: z.string().datetime().optional().nullable() }), body);
    return this.prisma.tx(async (tx) => {
      const n = await tx.facilityNotice.create({ data: { facility_id: f.id, title: d.title, body: d.body, severity: d.severity, starts_at: d.startsAt ? new Date(d.startsAt) : this.core.now(), ends_at: d.endsAt ? new Date(d.endsAt) : null, created_by: ctx.userId } });
      const tenants = await tx.contract.findMany({ where: { facility_id: f.id, status: { in: ['ACTIVE', 'MOVE_OUT_SCHEDULED', 'EXPIRED'] } }, select: { customer: { select: { user_id: true } } } });
      const users = tenants.map((t) => t.customer.user_id).filter((x): x is bigint => !!x);
      await this.notify.notify({ users, event: 'facility.notice_posted', vars: { facility: f.name, title: d.title, body: d.body }, link: '/app', priority: d.severity === 'CRITICAL' ? 'HIGH' : 'NORMAL', email: d.severity !== 'INFO' }, tx);
      await this.audit.log(ctx, { action: 'facility.notice_posted', entityType: 'facility_notice', entityId: n.id, facilityId: f.id, after: d }, tx);
      return { ...n, recipients: users.length };
    });
  }

  @RequirePermission('facility.manage')
  @Delete('facility-notices/:noticeId')
  async endNotice(@Ctx() ctx: AccessContext, @Param('noticeId') noticeId: string) {
    const n = await this.prisma.facilityNotice.findUnique({ where: { id: BigInt(noticeId) } });
    ctx.assertScope('facility.manage', n, 'Thông báo', true);
    return this.prisma.facilityNotice.update({ where: { id: n!.id }, data: { ends_at: this.core.now() } });
  }

  @RequirePermission('task.assign')
  @Get('facilities/:id/staff')
  async staff(@Ctx() ctx: AccessContext, @Param('id') id: string) {
    const f = await this.facility(ctx, id, 'task.assign');
    const rows = await this.prisma.userRole.findMany({ where: { facility_id: f.id, revoked_at: null, role: { code: { in: ['FACILITY_STAFF', 'FACILITY_MANAGER'] } } }, include: { user: true, role: true } });
    const since = new Date(this.core.now().getTime() - 30 * 86400000);
    const out = new Map<string, Record<string, unknown>>();
    for (const r of rows) {
      const u = r.user;
      if (out.has(u.public_id)) {
        (out.get(u.public_id)!.roles as string[]).push(r.role.code);
        continue;
      }
      const [done, onTime, open, tickets] = await Promise.all([
        this.prisma.workTask.count({ where: { assignee_id: u.id, status: 'DONE', completed_at: { gte: since } } }),
        this.prisma.workTask.count({ where: { assignee_id: u.id, status: 'DONE', completed_at: { gte: since }, is_overdue: false } }),
        this.prisma.workTask.count({ where: { assignee_id: u.id, status: { in: ['ASSIGNED', 'IN_PROGRESS', 'BLOCKED'] } } }),
        this.prisma.supportTicket.count({ where: { assignee_id: u.id, resolved_at: { gte: since } } }),
      ]);
      out.set(u.public_id, { id: u.public_id, fullName: u.full_name, email: u.email, phone: u.phone, status: u.status, roles: [r.role.code], tasksDone30d: done, onTimePct: done ? Math.round((onTime / done) * 100) : null, openTasks: open, ticketsResolved30d: tickets });
    }
    return [...out.values()];
  }

  // ---------- unit types
  @Get('facilities/:id/unit-types')
  async unitTypes(@Ctx() ctx: AccessContext, @Param('id') id: string) {
    const f = await this.facility(ctx, id, 'unit.manage', false);
    const types = await this.prisma.unitType.findMany({ where: { facility_id: f.id, deleted_at: null }, orderBy: { online_price: 'asc' } });
    const out = [];
    for (const t of types) {
      const byStatus = await this.prisma.unit.groupBy({ by: ['status'], where: { unit_type_id: t.id, deleted_at: null }, _count: true });
      const counts = Object.fromEntries(byStatus.map((b) => [b.status, b._count]));
      const total = byStatus.reduce((s, b) => s + b._count, 0);
      const rentable = total - (counts.OUT_OF_SERVICE ?? 0) - (counts.RETIRED ?? 0);
      const band = await this.band(f.id, t.size_category);
      out.push({ ...t, unitCounts: counts, totalUnits: total, occupancy: rentable ? ((counts.OCCUPIED ?? 0) + (counts.OVERLOCKED ?? 0)) / rentable : 0, priceBand: band, photos: await this.media.listFor('unit_type', [t.id]) });
    }
    return out;
  }

  /** The price range the business operations manager set for each size group, as it applies to this facility (a facility-specific range wins over the system-wide one). */
  @Get('facilities/:id/price-bands')
  async priceBands(@Ctx() ctx: AccessContext, @Param('id') id: string) {
    const f = await this.facility(ctx, id, 'unit.manage', false);
    const out: { sizeCategory: string; min: number; max: number; scope: 'FACILITY' | 'SYSTEM'; effectiveFrom: Date }[] = [];
    for (const size of ['XS', 'S', 'M', 'L', 'XL', 'VEHICLE', 'LOCKER']) {
      const b = await this.band(f.id, size);
      if (b) out.push({ sizeCategory: size, min: Number(b.min_monthly_price), max: Number(b.max_monthly_price), scope: b.facility_id ? 'FACILITY' : 'SYSTEM', effectiveFrom: b.effective_from });
    }
    return out;
  }

  async band(facilityId: bigint, size: string) {
    const now = this.core.now();
    return (
      (await this.prisma.priceBand.findFirst({ where: { facility_id: facilityId, size_category: size as never, effective_from: { lte: now } }, orderBy: { effective_from: 'desc' } })) ??
      (await this.prisma.priceBand.findFirst({ where: { facility_id: null, size_category: size as never, effective_from: { lte: now } }, orderBy: { effective_from: 'desc' } }))
    );
  }

  private typeBody = z.object({
    code: z.string().trim().min(1).max(32),
    name: z.string().trim().min(2).max(120),
    sizeCategory: z.enum(['XS', 'S', 'M', 'L', 'XL', 'VEHICLE', 'LOCKER']),
    widthM: z.number().positive().max(100),
    depthM: z.number().positive().max(100),
    heightM: z.number().positive().max(20),
    climateControlled: z.boolean().default(false),
    indoor: z.boolean().default(true),
    driveUp: z.boolean().default(false),
    powerOutlet: z.boolean().default(false),
    groundFloor: z.boolean().default(false),
    fitsDescription: z.string().max(255).optional().nullable(),
    description: z.string().max(5000).optional().nullable(),
    listPrice: z.number().positive(),
    onlinePrice: z.number().positive(),
    depositOverride: z.number().min(0).optional().nullable(),
    isBookable: z.boolean().default(true),
    status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).default('DRAFT'),
    inspectionChecklist: z.array(z.string()).optional().nullable(),
    reason: z.string().max(255).optional(),
    photoIds: photoIds.optional(),
  });

  @RequirePermission('unit_type.manage')
  @Post('facilities/:id/unit-types')
  async createType(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() body: unknown) {
    const f = await this.facility(ctx, id, 'unit_type.manage');
    const d = parse(this.typeBody, body);
    if (d.onlinePrice > d.listPrice) throw validation('Giá online phải ≤ giá niêm yết');
    await this.checkBand(f.id, d.sizeCategory, [d.listPrice, d.onlinePrice]);
    const t = await this.prisma.$transaction(async (tx) => {
      const created = await tx.unitType.create({
        data: {
          public_id: newId(), facility_id: f.id, code: d.code.toUpperCase(), name: d.name, size_category: d.sizeCategory, width_m: d.widthM, depth_m: d.depthM, height_m: d.heightM, climate_controlled: d.climateControlled, indoor: d.indoor,
          drive_up: d.driveUp, power_outlet: d.powerOutlet, ground_floor: d.groundFloor, fits_description: d.fitsDescription, description: d.description, list_price: d.listPrice, online_price: d.onlinePrice, deposit_override: d.depositOverride ?? null,
          is_bookable: d.isBookable, status: d.status === 'ARCHIVED' ? 'DRAFT' : d.status, inspection_checklist: d.inspectionChecklist ?? undefined,
        },
      });
      if (d.photoIds?.length) {
        await this.media.syncOwnerFiles(tx, ctx, 'unit_type', created.id, f.id, d.photoIds);
      }
      return created;
    });
    const { photoIds: _photos, ...audited } = d;
    await this.audit.log(ctx, { action: 'unit_type.create', entityType: 'unit_type', entityId: t.id, entityRef: t.code, facilityId: f.id, after: { ...audited, photos: d.photoIds?.length ?? 0 } });
    return { ...t, photos: await this.media.listFor('unit_type', [t.id]) };
  }

  async checkBand(facilityId: bigint, size: string, prices: number[]) {
    const band = await this.band(facilityId, size);
    if (!band) return;
    const bad = prices.filter((p) => D(p).lt(band.min_monthly_price) || D(p).gt(band.max_monthly_price));
    if (bad.length) throw new AppError('PRICE_OUT_OF_BAND', `Giá ngoài khung ${Number(band.min_monthly_price).toLocaleString('vi-VN')}–${Number(band.max_monthly_price).toLocaleString('vi-VN')} ₫ — hãy tạo đề xuất giá để BOM duyệt`, { band: { min: Number(band.min_monthly_price), max: Number(band.max_monthly_price) }, hint: 'POST /unit-types/:id/price-change-requests' });
  }

  @RequirePermission('unit_type.manage')
  @Patch('unit-types/:id')
  async updateType(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() body: unknown) {
    const t = await this.prisma.unitType.findFirst({ where: { public_id: id, deleted_at: null } });
    ctx.assertScope('unit_type.manage', t, 'Loại kho', true);
    const d = parse(this.typeBody.partial().extend({ version: z.number().int().optional() }), body);
    if (d.version !== undefined && d.version !== t!.version) throw new AppError('STALE_RESOURCE', 'Dữ liệu đã bị người khác thay đổi, vui lòng tải lại');
    const list = d.listPrice ?? Number(t!.list_price);
    const online = d.onlinePrice ?? Number(t!.online_price);
    if (online > list) throw validation('Giá online phải ≤ giá niêm yết');
    if (d.listPrice !== undefined || d.onlinePrice !== undefined) await this.checkBand(t!.facility_id, d.sizeCategory ?? t!.size_category, [list, online]);
    if (d.status === 'ACTIVE') {
      const units = await this.prisma.unit.count({ where: { unit_type_id: t!.id, deleted_at: null } });
      if (!units) throw validation('Loại kho cần ít nhất 1 kho trước khi hiển thị công khai');
    }
    const open = await this.prisma.unitAllocation.count({ where: { unit: { unit_type_id: t!.id }, status: 'ACTIVE' } });
    if (open && (d.widthM || d.depthM || d.heightM) && !d.reason) throw validation('Đổi kích thước loại kho đang có phân bổ cần nhập lý do');
    return this.prisma.tx(async (tx) => {
      const res = await tx.unitType.updateMany({
        where: { id: t!.id, version: t!.version },
        data: {
          code: d.code?.toUpperCase(), name: d.name, size_category: d.sizeCategory, width_m: d.widthM, depth_m: d.depthM, height_m: d.heightM, climate_controlled: d.climateControlled, indoor: d.indoor, drive_up: d.driveUp,
          power_outlet: d.powerOutlet, ground_floor: d.groundFloor, fits_description: d.fitsDescription, description: d.description, list_price: d.listPrice, online_price: d.onlinePrice, deposit_override: d.depositOverride,
          is_bookable: d.isBookable, status: d.status, inspection_checklist: d.inspectionChecklist ?? undefined, version: { increment: 1 },
        },
      });
      if (res.count !== 1) throw new AppError('STALE_RESOURCE', 'Dữ liệu đã bị người khác thay đổi, vui lòng tải lại');
      for (const [field, key, nv] of [['LIST_PRICE', 'list_price', d.listPrice], ['ONLINE_PRICE', 'online_price', d.onlinePrice], ['DEPOSIT_OVERRIDE', 'deposit_override', d.depositOverride]] as const) {
        const ov = t![key as 'list_price'];
        if (nv !== undefined && !(ov !== null && D(ov).eq(nv ?? 0))) await tx.priceHistory.create({ data: { unit_type_id: t!.id, field, old_value: ov, new_value: nv ?? null, reason: d.reason ?? 'Cập nhật giá trong khung', changed_by: ctx.userId } });
      }
      if (d.photoIds !== undefined) {
        await this.media.syncOwnerFiles(tx, ctx, 'unit_type', t!.id, t!.facility_id, d.photoIds);
      }
      const { photoIds: _photos, ...audited } = d;
      await this.audit.log(ctx, { action: 'unit_type.update', entityType: 'unit_type', entityId: t!.id, entityRef: t!.code, facilityId: t!.facility_id, before: t, after: audited, reason: d.reason }, tx);
      const updated = await tx.unitType.findUniqueOrThrow({ where: { id: t!.id } });
      return { ...updated, photos: await this.media.listFor('unit_type', [t!.id]) };
    });
  }

  @RequirePermission('unit_type.manage')
  @Put('unit-types/:id/photos')
  async setUnitTypePhotos(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() body: unknown) {
    const t = await this.prisma.unitType.findFirst({ where: { public_id: id, deleted_at: null } });
    ctx.assertScope('unit_type.manage', t, 'Loại kho', true);
    const d = parse(z.object({ mediaIds: photoIds }), body);
    await this.prisma.$transaction(async (tx) => {
      await this.media.syncOwnerFiles(tx, ctx, 'unit_type', t!.id, t!.facility_id, d.mediaIds);
    });
    return { photos: await this.media.listFor('unit_type', [t!.id]) };
  }

  @RequirePermission('unit_type.manage')
  @Post('unit-types/:id/price-change-requests')
  async priceRequest(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() body: unknown) {
    const t = await this.prisma.unitType.findFirst({ where: { public_id: id }, include: { facility: true } });
    ctx.assertScope('unit_type.manage', t, 'Loại kho', true);
    const d = parse(z.object({ field: z.enum(['LIST_PRICE', 'ONLINE_PRICE']), proposedValue: z.number().positive(), reason: zReason }), body);
    const current = d.field === 'LIST_PRICE' ? t!.list_price : t!.online_price;
    const r = await this.prisma.priceChangeRequest.create({ data: { public_id: newId(), unit_type_id: t!.id, field: d.field, proposed_value: d.proposedValue, current_value: current, reason: d.reason, requested_by: ctx.userId } });
    await this.notify.notify({ users: await this.core.businessOpsManagers(this.prisma), event: 'price_change.requested', vars: { unitType: t!.name, facility: t!.facility.name, field: d.field, value: d.proposedValue.toLocaleString('vi-VN'), reason: d.reason }, link: '/ops/pricing', email: false });
    await this.audit.log(ctx, { action: 'price_change.request', entityType: 'unit_type', entityId: t!.id, entityRef: t!.code, facilityId: t!.facility_id, after: d });
    return r;
  }

  @RequirePermission('unit_type.manage')
  @Delete('unit-types/:id')
  async archiveType(@Ctx() ctx: AccessContext, @Param('id') id: string) {
    const t = await this.prisma.unitType.findFirst({ where: { public_id: id, deleted_at: null } });
    ctx.assertScope('unit_type.manage', t, 'Loại kho', true);
    const live = await this.prisma.unit.count({ where: { unit_type_id: t!.id, status: { in: ['RESERVED', 'OCCUPIED', 'OVERLOCKED'] } } });
    if (live) throw new AppError('UNIT_HAS_OPEN_ALLOCATION', 'Loại kho còn kho đang được thuê / giữ chỗ');
    return this.prisma.unitType.update({ where: { id: t!.id }, data: { status: 'ARCHIVED', is_bookable: false, deleted_at: this.core.now() } });
  }

  // ---------- units
  @RequirePermission('unit.manage', false)
  @Get('facilities/:id/units')
  async units(@Ctx() ctx: AccessContext, @Param('id') id: string, @Query() q: Record<string, string>) {
    const f = await this.facility(ctx, id, 'unit.manage', false);
    const units = await this.prisma.unit.findMany({
      where: { facility_id: f.id, deleted_at: null, ...(q.status ? { status: q.status as never } : {}), ...(q.zone ? { zone_id: BigInt(q.zone) } : {}), ...(q.type ? { unit_type: { public_id: q.type } } : {}), ...(q.q ? { code: { contains: q.q } } : {}) },
      include: { unit_type: { select: { public_id: true, name: true, code: true, size_category: true, area_m2: true } }, zone: { select: { id: true, code: true, name: true, floor: true } }, contracts: { where: { status: { in: ['ACTIVE', 'MOVE_OUT_SCHEDULED', 'EXPIRED', 'PENDING_SIGNATURE', 'SIGNED'] } }, select: { public_id: true, code: true, status: true, delinquency_status: true, current_end_date: true, customer: { select: { public_id: true, full_name: true } } }, take: 1 } },
      orderBy: [{ zone_id: 'asc' }, { code: 'asc' }],
    });
    return units.map((u) => ({ ...u, contract: u.contracts[0] ?? null, contracts: undefined }));
  }

  private async placeNewUnitsOnPlan(tx: any, facilityId: bigint, zoneId: bigint, zoneName: string, unitType: { width_m: any; depth_m: any }, createdUnits: { id: bigint; code: string }[]) {
    if (!createdUnits.length) return;
    const plan = (await tx.floorPlan.findUnique({ where: { zone_id: zoneId }, include: { shapes: true } })) ??
      (await tx.floorPlan.create({ data: { facility_id: facilityId, zone_id: zoneId, name: `Sơ đồ ${zoneName}`, width: 1200, height: 700, grid_size: 20 }, include: { shapes: true } }));
    const clamp = (v: number) => Math.min(200, Math.max(60, Math.round(v / 10) * 10));
    const wm = Number(unitType.width_m), dm = Number(unitType.depth_m);
    const w = Number.isFinite(wm) && wm > 0 ? clamp(wm * 40) : 80;
    const h = Number.isFinite(dm) && dm > 0 ? clamp(dm * 40) : 70;
    const width = plan.width >= 200 ? plan.width : 1200;
    const g = Math.max(5, plan.grid_size || 20);
    const margin = 40, gap = 24;
    const snap = (v: number) => Math.round(v / g) * g;
    const bottoms = (plan.shapes ?? []).map((s: any) => Number(s.y) + Number(s.h));
    let y = bottoms.length ? snap(Math.max(...bottoms) + margin) : margin;
    let x = margin, rowH = 0;
    for (const u of createdUnits) {
      if (x + w > width - margin && x > margin) { x = margin; y = snap(y + rowH + gap); rowH = 0; }
      await tx.unitShape.create({ data: { floor_plan_id: plan.id, unit_id: u.id, x: snap(x), y: snap(y), w, h, rotation: 0 } });
      x += w + gap; rowH = Math.max(rowH, h);
    }
  }

  /** Creates one unit with a code the manager types (e.g. "VIP-01"), as an alternative to the numbered bulk range. */
  @RequirePermission('unit.manage')
  @Post('facilities/:id/units')
  async createOne(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() body: unknown) {
    const f = await this.facility(ctx, id, 'unit.manage');
    const d = parse(z.object({ code: z.string().trim().min(1).max(20), unitTypeId: z.string().length(26), zoneId: z.string(), doorType: z.enum(['ROLL_UP', 'SWING', 'LOCKER']).default('ROLL_UP') }), body);
    const code = d.code.toUpperCase();
    const t = await this.prisma.unitType.findFirst({ where: { public_id: d.unitTypeId, facility_id: f.id } });
    const zone = await this.prisma.zone.findFirst({ where: { id: BigInt(d.zoneId), facility_id: f.id } });
    if (!t || !zone) throw validation('Loại kho / khu không thuộc cơ sở này');
    if (await this.prisma.unit.findFirst({ where: { facility_id: f.id, code, deleted_at: null }, select: { id: true } })) throw new AppError('UNIT_CODE_DUPLICATE', `Mã kho đã tồn tại: ${code}`, { codes: [code] });
    return this.prisma.tx(async (tx) => {
      const u = await tx.unit.create({ data: { public_id: newId(), facility_id: f.id, unit_type_id: t.id, zone_id: zone.id, code, status: 'AVAILABLE', door_type: d.doorType, allocation_priority: 100 } });
      await tx.unitStatusHistory.create({ data: { unit_id: u.id, to_status: 'AVAILABLE', reason: 'Tạo kho', actor_user_id: ctx.userId } });
      await this.placeNewUnitsOnPlan(tx, f.id, zone.id, zone.name, t, [u]);
      await this.audit.log(ctx, { action: 'unit.create', entityType: 'unit', entityId: u.id, entityRef: code, facilityId: f.id, after: { code, unitType: t.code, zone: zone.name } }, tx);
      return u;
    });
  }

  @RequirePermission('unit.manage')
  @Post('facilities/:id/units/bulk')
  async bulk(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() body: unknown) {
    const f = await this.facility(ctx, id, 'unit.manage');
    const d = parse(z.object({ prefix: z.string().trim().min(1).max(8), from: z.number().int().min(0).max(9999), to: z.number().int().min(0).max(9999), pad: z.number().int().min(1).max(4).default(3), unitTypeId: z.string().length(26), zoneId: z.string(), status: z.enum(['AVAILABLE', 'OUT_OF_SERVICE']).default('AVAILABLE'), doorType: z.enum(['ROLL_UP', 'SWING', 'LOCKER']).default('ROLL_UP'), allocationPriority: z.number().int().default(100) }), body);
    if (d.to < d.from || d.to - d.from > 199) throw validation('Dải số không hợp lệ (tối đa 200 kho mỗi lần)');
    const t = await this.prisma.unitType.findFirst({ where: { public_id: d.unitTypeId, facility_id: f.id } });
    const zone = await this.prisma.zone.findFirst({ where: { id: BigInt(d.zoneId), facility_id: f.id } });
    if (!t || !zone) throw validation('Loại kho / khu không thuộc cơ sở này');
    const codes = Array.from({ length: d.to - d.from + 1 }, (_, i) => `${d.prefix.toUpperCase()}${String(d.from + i).padStart(d.pad, '0')}`);
    const dup = await this.prisma.unit.findMany({ where: { facility_id: f.id, code: { in: codes }, deleted_at: null }, select: { code: true } });
    if (dup.length) throw new AppError('UNIT_CODE_DUPLICATE', `Mã kho đã tồn tại: ${dup.map((x) => x.code).join(', ')}`, { codes: dup.map((x) => x.code) });
    const created = await this.prisma.tx(async (tx) => {
      const out = [];
      for (const code of codes) {
        const u = await tx.unit.create({ data: { public_id: newId(), facility_id: f.id, unit_type_id: t.id, zone_id: zone.id, code, status: d.status, door_type: d.doorType, allocation_priority: d.allocationPriority, status_reason: d.status === 'OUT_OF_SERVICE' ? 'Chưa sẵn sàng' : null } });
        await tx.unitStatusHistory.create({ data: { unit_id: u.id, to_status: d.status, reason: 'Tạo kho', actor_user_id: ctx.userId } });
        out.push(u);
      }
      await this.placeNewUnitsOnPlan(tx, f.id, zone.id, zone.name, t, out);
      await this.audit.log(ctx, { action: 'unit.bulk_create', entityType: 'facility', entityId: f.id, facilityId: f.id, after: { count: out.length, from: codes[0], to: codes[codes.length - 1] } }, tx);
      return out;
    });
    return { created: created.length, codes };
  }

  @RequirePermission('unit.manage')
  @Delete('units/:id')
  async deleteUnit(@Ctx() ctx: AccessContext, @Param('id') id: string) {
    const u = await this.prisma.unit.findFirst({ where: { public_id: id, deleted_at: null } });
    ctx.assertScope('unit.manage', u, 'Kho', true);
    if (['RESERVED', 'OCCUPIED', 'OVERLOCKED'].includes(u!.status)) {
      throw new AppError('UNIT_HAS_OPEN_ALLOCATION', 'Không thể xóa kho đang có khách thuê hoặc giữ chỗ');
    }
    const openAlloc = await this.prisma.unitAllocation.count({ where: { unit_id: u!.id, status: 'ACTIVE' } });
    const liveContract = await this.prisma.contract.count({ where: { unit_id: u!.id, status: { in: ['ACTIVE', 'MOVE_OUT_SCHEDULED', 'EXPIRED', 'PENDING_SIGNATURE', 'SIGNED'] } } });
    if (openAlloc || liveContract) {
      throw new AppError('UNIT_HAS_OPEN_ALLOCATION', 'Không thể xóa kho đang có hợp đồng hoặc phân bổ hiệu lực');
    }
    await this.prisma.tx(async (tx) => {
      await tx.unitShape.deleteMany({ where: { unit_id: u!.id } });
      await tx.unit.update({
        where: { id: u!.id },
        data: { status: 'RETIRED', deleted_at: this.core.now(), code: `${u!.code.slice(0, 12)}#${u!.id}` },
      });
      await this.audit.log(ctx, { action: 'unit.delete', entityType: 'unit', entityId: u!.id, entityRef: u!.code, facilityId: u!.facility_id }, tx);
    });
    return { deleted: true, id: u!.public_id, code: u!.code };
  }

  @RequirePermission('unit.manage', false)
  @Get('units/:id')
  async unit(@Ctx() ctx: AccessContext, @Param('id') id: string) {
    const u = await this.prisma.unit.findUnique({ where: { public_id: id }, include: { unit_type: true, zone: true, facility: { select: { public_id: true, name: true } } } });
    ctx.assertScope('unit.manage', u, 'Kho');
    const contract = await this.prisma.contract.findFirst({ where: { unit_id: u!.id, status: { in: ['ACTIVE', 'MOVE_OUT_SCHEDULED', 'EXPIRED', 'PENDING_SIGNATURE', 'SIGNED'] } }, include: { customer: { select: { public_id: true, full_name: true, phone: true } } } });
    // who took the unit into maintenance (last status change) and the open work order with its assignee, so the drawer can name the person responsible
    let maintenance: unknown = null;
    if (u!.status === 'MAINTENANCE') {
      const last = await this.prisma.unitStatusHistory.findFirst({ where: { unit_id: u!.id, to_status: 'MAINTENANCE' }, orderBy: { created_at: 'desc' } });
      const setBy = last?.actor_user_id ? await this.prisma.user.findUnique({ where: { id: last.actor_user_id }, select: { full_name: true, email: true } }) : null;
      const wo = await this.prisma.workOrder.findFirst({ where: { unit_id: u!.id, status: { notIn: ['COMPLETED', 'VERIFIED', 'CANCELLED'] } }, orderBy: { created_at: 'desc' } });
      const woPhotos = wo ? await this.media.listFor('work_order', [wo.id]) : [];
      const assignee = wo?.assignee_id ? await this.prisma.user.findUnique({ where: { id: wo.assignee_id }, select: { full_name: true } }) : null;
      maintenance = { since: last?.created_at ?? null, reason: last?.reason ?? null, setBy: setBy?.full_name ?? null, workOrder: wo ? { code: wo.code, status: wo.status, description: wo.description, assignee: assignee?.full_name ?? null, vendor: wo.vendor_name, scheduledFor: wo.scheduled_for, photos: woPhotos.map((p) => ({ id: p.public_id, url: p.url, caption: p.caption })) } : null };
    }
    const latestInsp = await this.prisma.inspection.findFirst({ where: { unit_id: u!.id, status: 'COMPLETED' }, include: { items: true }, orderBy: { id: 'desc' } });
    const inspPhotos = latestInsp?.items.length ? await this.media.listFor('inspection_item', latestInsp.items.map((it) => it.id)) : [];
    const unitPhotos = await this.media.listFor('unit', [u!.id]);
    return {
      ...u,
      contract,
      maintenance,
      photos: unitPhotos,
      inspectionPhotos: inspPhotos.map((p) => ({ id: p.public_id, url: p.url, caption: p.caption, takenAt: p.taken_at ?? p.created_at })),
    };
  }

  @RequirePermission('unit.manage')
  @Patch('units/:id')
  async updateUnit(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() body: unknown) {
    const u = await this.prisma.unit.findUnique({ where: { public_id: id } });
    ctx.assertScope('unit.manage', u, 'Kho', true);
    const d = parse(z.object({ code: z.string().max(20), unitTypeId: z.string().length(26), zoneId: z.string(), allocationPriority: z.number().int(), doorType: z.enum(['ROLL_UP', 'SWING', 'LOCKER']), notes: z.string().max(500).nullable(), version: z.number().int() }).partial(), body);
    if (d.version !== undefined && d.version !== u!.version) throw new AppError('STALE_RESOURCE', 'Dữ liệu đã bị người khác thay đổi');
    let unitTypeId: bigint | undefined;
    if (d.unitTypeId) {
      const open = await this.prisma.unitAllocation.count({ where: { unit_id: u!.id, status: 'ACTIVE' } });
      if (open) throw new AppError('UNIT_HAS_OPEN_ALLOCATION', 'Không đổi loại kho khi kho đang có phân bổ');
      const t = await this.prisma.unitType.findFirst({ where: { public_id: d.unitTypeId, facility_id: u!.facility_id } });
      if (!t) throw validation('Loại kho không thuộc cơ sở');
      unitTypeId = t.id;
    }
    if (d.code && d.code !== u!.code) {
      const dup = await this.prisma.unit.findFirst({ where: { facility_id: u!.facility_id, code: d.code.toUpperCase() } });
      if (dup) throw new AppError('UNIT_CODE_DUPLICATE', 'Mã kho đã tồn tại');
    }
    const upd = await this.prisma.unit.update({ where: { id: u!.id }, data: { code: d.code?.toUpperCase(), unit_type_id: unitTypeId, zone_id: d.zoneId ? BigInt(d.zoneId) : undefined, allocation_priority: d.allocationPriority, door_type: d.doorType, notes: d.notes, version: { increment: 1 } } });
    await this.audit.log(ctx, { action: 'unit.update', entityType: 'unit', entityId: u!.id, entityRef: u!.code, facilityId: u!.facility_id, before: u, after: d });
    return upd;
  }

  /** POST /units/:id/status {to, reason} — manual transitions only (§7.1, §6.5 rule 1–2). */
  @RequirePermission('unit.status.update')
  @Post('units/:id/status')
  async setStatus(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() body: unknown) {
    const u = await this.prisma.unit.findUnique({ where: { public_id: id } });
    ctx.assertScope('unit.status.update', u, 'Kho', true);
    const d = parse(z.object({ to: z.enum(['AVAILABLE', 'MAINTENANCE', 'OUT_OF_SERVICE', 'RETIRED']).optional(), flag: z.enum(['NONE', 'INSPECTION_DUE', 'MAINTENANCE_SCHEDULED', 'ISSUE_REPORTED']).optional(), reason: zReason, confirmShortage: z.boolean().optional() }), body);
    if (d.flag && !d.to) {
      if (!['OCCUPIED', 'OVERLOCKED'].includes(u!.status)) throw validation('Cờ vận hành chỉ áp cho kho đang thuê');
      return this.prisma.tx((tx) => this.core.setOperationalFlag(tx, u!.id, d.flag!, d.reason, ctx.userId));
    }
    if (!d.to) throw validation('Chọn trạng thái mới');
    if (!canTransition(UNIT_MANUAL_TRANSITIONS, u!.status, d.to)) {
      if (['OCCUPIED', 'RESERVED'].includes(u!.status)) throw new AppError('INVALID_STATUS_TRANSITION', 'Kho đang thuê / đã giữ — hãy đổi kho cho khách trước khi chuyển bảo trì', { from: u!.status, to: d.to });
      throw invalidTransition('kho', u!.status, d.to);
    }
    if (d.to === 'RETIRED') {
      if (!ctx.hasRole('FACILITY_MANAGER')) throw forbidden('Chỉ quản lý cơ sở ngừng vĩnh viễn kho');
      const open = await this.prisma.unitAllocation.count({ where: { unit_id: u!.id, status: 'ACTIVE' } });
      if (open) throw new AppError('UNIT_HAS_OPEN_ALLOCATION', 'Kho còn phân bổ mở');
    }
    if (u!.status === 'PENDING_INSPECTION') throw validation('Dùng màn "Kiểm tra cuối" để mở bán lại kho sau trả kho', { action: 'FINAL_CHECK' });
    if (['MAINTENANCE', 'OUT_OF_SERVICE'].includes(d.to) && u!.status === 'AVAILABLE') {
      // §6.5 rule 2: taking a unit out must not make confirmed-but-unallocated reservations impossible
      const sellable = await this.core.sellable(this.prisma, u!.unit_type_id);
      const now = this.core.today();
      const commitments = await this.core.commitments(this.prisma, u!.unit_type_id, now, this.core.addDays(now, 60));
      if (sellable - 1 < commitments && !d.confirmShortage) throw new AppError('CONFLICT', 'Đưa kho này vào bảo trì sẽ làm khả dụng âm cho các đơn đã xác nhận — xác nhận kèm kế hoạch nâng hạng khách', { requireConfirm: true, sellable, commitments });
    }
    return this.prisma.tx(async (tx) => {
      const r = await this.core.transitionUnit(tx, u!.id, d.to!, { reason: d.reason, actor: ctx.userId, extra: d.to === 'AVAILABLE' && u!.status !== 'AVAILABLE' ? {} : {} });
      await this.audit.log(ctx, { action: 'unit.status_change', entityType: 'unit', entityId: u!.id, entityRef: u!.code, facilityId: u!.facility_id, reason: d.reason, before: { status: u!.status }, after: { status: d.to } }, tx);
      return r;
    });
  }

  @RequirePermission('unit.manage', false)
  @Get('units/:id/history')
  async history(@Ctx() ctx: AccessContext, @Param('id') id: string) {
    const u = await this.prisma.unit.findUnique({ where: { public_id: id } });
    ctx.assertScope('unit.manage', u, 'Kho');
    const [status, contracts, inspections, workOrders] = await Promise.all([
      this.prisma.unitStatusHistory.findMany({ where: { unit_id: u!.id }, orderBy: { created_at: 'desc' }, take: 100 }),
      this.prisma.contract.findMany({ where: { unit_id: u!.id }, orderBy: { start_date: 'desc' }, select: { public_id: true, code: true, status: true, start_date: true, current_end_date: true, ended_at: true, customer: { select: { full_name: true, public_id: true } } } }),
      this.prisma.inspection.findMany({ where: { unit_id: u!.id }, orderBy: { created_at: 'desc' }, include: { items: true } }),
      this.prisma.workOrder.findMany({ where: { unit_id: u!.id }, orderBy: { created_at: 'desc' } }),
    ]);
    const actors = await this.prisma.user.findMany({ where: { id: { in: status.map((s) => s.actor_user_id).filter((x): x is bigint => !!x) } }, select: { id: true, full_name: true } });
    return { status: status.map((s) => ({ ...s, actor: actors.find((a) => a.id === s.actor_user_id)?.full_name ?? 'Hệ thống' })), contracts, inspections, workOrders };
  }

  // ---------- floor plan (module 8)
  @RequirePermission('unit.manage', false)
  @Get('zones/:zoneId/floor-plan')
  async floorPlan(@Ctx() ctx: AccessContext, @Param('zoneId') zoneId: string) {
    const zone = await this.prisma.zone.findUnique({ where: { id: BigInt(zoneId) }, include: { floor_plan: { include: { shapes: true } } } });
    ctx.assertScope('unit.manage', zone, 'Khu');
    const units = await this.prisma.unit.findMany({ where: { zone_id: zone!.id, deleted_at: null }, include: { unit_type: { select: { public_id: true, name: true, code: true, size_category: true, width_m: true, depth_m: true, height_m: true, area_m2: true, online_price: true, climate_controlled: true, drive_up: true, ground_floor: true } }, contracts: { where: { status: { in: ['ACTIVE', 'MOVE_OUT_SCHEDULED', 'EXPIRED'] } }, select: { public_id: true, code: true, delinquency_status: true, current_end_date: true, customer: { select: { full_name: true } } }, take: 1 } }, orderBy: { code: 'asc' } });
    const tasks = await this.prisma.workTask.findMany({ where: { unit_id: { in: units.map((u) => u.id) }, status: { in: ['OPEN', 'ASSIGNED', 'IN_PROGRESS'] } }, select: { unit_id: true, type: true, title: true } });
    // Plans are drawn in pixels (1200 x 700, grid 20). A plan created with the column defaults (40 x 24 grid units) is treated as a blank 1200 x 700 canvas.
    const created = zone!.floor_plan ?? (await this.prisma.floorPlan.create({ data: { facility_id: zone!.facility_id, zone_id: zone!.id, name: `Sơ đồ ${zone!.name}`, width: 1200, height: 700, grid_size: 20 }, include: { shapes: true } }));
    const legacy = created.width < 200 && created.shapes.length === 0;
    const plan = legacy ? { ...created, width: 1200, height: 700, grid_size: 20 } : created.grid_size < 5 ? { ...created, grid_size: 20 } : created;
    return {
      plan: { ...plan, shapes: undefined },
      zone,
      units: units.map((u) => {
        const s = plan.shapes.find((x) => x.unit_id === u.id);
        return { id: u.public_id, code: u.code, status: u.status, flag: u.operational_flag, type: u.unit_type, contract: u.contracts[0] ?? null, tasks: tasks.filter((t) => t.unit_id === u.id).map((t) => ({ type: t.type, title: t.title })), shape: s ? { x: Number(s.x), y: Number(s.y), w: Number(s.w), h: Number(s.h), rotation: s.rotation } : null };
      }),
    };
  }

  @RequirePermission('unit.manage')
  @Put('zones/:zoneId/floor-plan')
  async saveFloorPlan(@Ctx() ctx: AccessContext, @Param('zoneId') zoneId: string, @Body() body: unknown) {
    const zone = await this.prisma.zone.findUnique({ where: { id: BigInt(zoneId) }, include: { floor_plan: true } });
    ctx.assertScope('unit.manage', zone, 'Khu', true);
    const d = parse(z.object({ width: z.number().int().min(200).max(4000), height: z.number().int().min(200).max(4000), gridSize: z.number().int().min(5).max(100).optional(), publish: z.boolean().default(true), shapes: z.array(z.object({ unitId: z.string().length(26), x: z.number().min(0), y: z.number().min(0), w: z.number().positive(), h: z.number().positive(), rotation: z.number().int().min(0).max(359).default(0) })).max(1000) }), body);
    const units = await this.prisma.unit.findMany({ where: { public_id: { in: d.shapes.map((s) => s.unitId) }, zone_id: zone!.id } });
    if (units.length !== new Set(d.shapes.map((s) => s.unitId)).size) throw validation('Có kho không thuộc khu này hoặc bị lặp');
    return this.prisma.tx(async (tx) => {
      const plan = zone!.floor_plan ?? (await tx.floorPlan.create({ data: { facility_id: zone!.facility_id, zone_id: zone!.id, name: `Sơ đồ ${zone!.name}` } }));
      await tx.unitShape.deleteMany({ where: { floor_plan_id: plan.id } });
      for (const s of d.shapes) {
        const u = units.find((x) => x.public_id === s.unitId)!;
        await tx.unitShape.create({ data: { floor_plan_id: plan.id, unit_id: u.id, x: s.x, y: s.y, w: s.w, h: s.h, rotation: s.rotation } });
      }
      const upd = await tx.floorPlan.update({ where: { id: plan.id }, data: { width: d.width, height: d.height, ...(d.gridSize ? { grid_size: d.gridSize } : {}), version: { increment: 1 }, published_at: d.publish ? this.core.now() : plan.published_at } });
      await this.audit.log(ctx, { action: 'floor_plan.save', entityType: 'floor_plan', entityId: plan.id, facilityId: zone!.facility_id, after: { shapes: d.shapes.length } }, tx);
      return upd;
    });
  }

  Prisma = Prisma;
}
