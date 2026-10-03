import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { PrismaService } from '../common/prisma.service';
import { Ctx, RequirePermission } from '../auth/decorators';
import { AccessContext } from '../auth/access-context';
import { parse } from '../common/http';
import { forbidden, notFound, validation } from '../common/errors';
import { dateOnly } from '../common/dates';
import { ReportService, REPORT_CODES } from './report.service';
import { MediaService } from '../media/media.service';

/** Dashboards, reports and exports (spec §17, §11.10). */
@Controller()
export class ReportController {
  constructor(private prisma: PrismaService, private svc: ReportService, private media: MediaService) {}

  private async facilityScope(ctx: AccessContext, q: Record<string, string>): Promise<bigint[] | null> {
    // the screens send one facility as `facilityId`; the plural form carries several. Both pick the facilities a report is limited to.
    const requested = String(q.facilityIds ?? q['filter[facilityIds]'] ?? q.facilityId ?? q['filter[facilityId]'] ?? '').split(',').filter(Boolean);
    const sys = ctx.can('report.system', false);
    let ids: bigint[] | null = null;
    if (requested.length) ids = (await this.prisma.facility.findMany({ where: { public_id: { in: requested } }, select: { id: true } })).map((f) => f.id);
    if (sys) return ids;
    const mine = ctx.facilitiesFor('report.facility');
    if (!mine.length) throw forbidden();
    return ids ? ids.filter((i) => mine.includes(i)) : mine;
  }

  @RequirePermission('catalog.read', false)
  @Get('dashboard/customer')
  customer(@Ctx() ctx: AccessContext) {
    return this.svc.customerDashboard(ctx);
  }

  @RequirePermission('task.read', false)
  @Get('dashboard/staff')
  staff(@Ctx() ctx: AccessContext) {
    return this.svc.today(ctx);
  }

  @RequirePermission('task.read', false)
  @Get('ops/today')
  today(@Ctx() ctx: AccessContext) {
    return this.svc.today(ctx);
  }

  @RequirePermission('report.facility', false)
  @Get('dashboard/facility/:id')
  async facility(@Ctx() ctx: AccessContext, @Param('id') id: string, @Query() q: Record<string, string>) {
    const f = await this.prisma.facility.findFirst({ where: { OR: [{ public_id: id }, { slug: id }] } });
    ctx.assertScope('report.facility', f ? { facility_id: f.id } : null, 'Cơ sở');
    const day = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}/.test(v) ? dateOnly(v.slice(0, 10)) : undefined);
    const from = day(q.from);
    const to = day(q.to);
    if (from && to && to < from) throw validation('Khoảng thời gian không hợp lệ');
    return this.svc.facilityDashboard(ctx, f!.id, from, to);
  }
}
