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

  @RequirePermission('report.system', false)
  @Get('dashboard/portfolio')
  portfolio(@Ctx() ctx: AccessContext, @Query('from') from?: string, @Query('to') to?: string) {
    const day = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}/.test(v) ? dateOnly(v.slice(0, 10)) : undefined);
    const f = day(from);
    const t = day(to);
    if (f && t && t < f) throw validation('Khoảng thời gian không hợp lệ');
    return this.svc.portfolio(ctx, f, t);
  }

  @RequirePermission('report.facility', false)
  @Get('reports/:code')
  async report(@Ctx() ctx: AccessContext, @Param('code') code: string, @Query() q: Record<string, string>) {
    if (!REPORT_CODES.includes(code as never)) throw notFound('Báo cáo');
    const ids = await this.facilityScope(ctx, q);
    return this.svc.run(ctx, code, this.svc.resolveParams(ctx, code, q, ids));
  }

  @RequirePermission('report.export')
  @Post('report-exports')
  async exportReq(@Ctx() ctx: AccessContext, @Body() body: unknown) {
    const d = parse(z.object({ code: z.string().min(2).max(40), format: z.enum(['CSV', 'XLSX', 'PDF']), params: z.record(z.string()).default({}) }), body);
    const ids = await this.facilityScope(ctx, d.params);
    return this.svc.requestExport(ctx, d.code, d.params, d.format, ids);
  }

  @RequirePermission('report.export', false)
  @Get('report-exports/:id')
  status(@Ctx() ctx: AccessContext, @Param('id') id: string) {
    return this.svc.exportStatus(ctx, id);
  }
}
