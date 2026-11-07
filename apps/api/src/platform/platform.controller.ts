import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Post, Put, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { Ctx, Internal, Public } from '../auth/decorators';
import { AccessContext } from '../auth/access-context';
import { PrismaService } from '../common/prisma.service';
import { MediaService } from '../media/media.service';
import { pageParams, paged, parse } from '../common/http';
import { notFound, forbidden, validation } from '../common/errors';
import { JobsService } from '../jobs/jobs.service';
import { ClockService } from '../common/clock.service';
import { config } from '../common/config';
import { StorageService } from '../media/storage.service';
import { ModulesContainer } from '@nestjs/core';
import { buildOpenApiPaths } from './openapi';

const OPENAPI_SUMMARIES: Record<string, string> = {
      'get /health/live': 'Liveness probe',
      'get /health/ready': 'Readiness probe',
      'post /auth/register': 'Đăng ký tài khoản khách hàng',
      'post /auth/login': 'Đăng nhập bằng email & mật khẩu',
      'post /auth/refresh': 'Làm mới access token qua HttpOnly cookie',
      'get /catalog/facilities': 'Danh sách cơ sở kho công khai',
      'get /catalog/unit-types': 'Tìm kiếm loại kho trống theo ngày',
      'post /catalog/size-advisor': 'Gợi ý kích thước kho từ danh mục đồ đạc',
      'post /quotes': 'Tạo báo giá 30 phút (khoá giá & kiểm tra khuyến mãi)',
      'get /reservations': 'Danh sách đặt chỗ',
      'post /reservations': 'Tạo đặt chỗ (yêu cầu Idempotency-Key)',
      'post /checkin-sessions': 'Bắt đầu phiên nhận kho tại quầy',
      'get /contracts': 'Danh sách hợp đồng thuê kho',
      'get /move-out-requests': 'Danh sách yêu cầu trả kho',
      'get /invoices': 'Danh sách hóa đơn',
      'get /payments': 'Danh sách giao dịch thanh toán',
      'get /refunds': 'Danh sách yêu cầu hoàn tiền',
      'get /delinquency': 'Danh sách hồ sơ công nợ quá hạn',
      'get /policies': 'Danh sách chính sách và phiên bản',
      'get /tickets': 'Danh sách phiếu hỗ trợ',
      'post /tickets': 'Tạo phiếu hỗ trợ',
      'get /reports/{code}': 'Truy vấn báo cáo vận hành/tài chính',
      'post /assistant/chat': 'Trò chuyện với trợ lý AI (SSE)',
};

/** Cross-cutting endpoints: media (spec §11.12), in-app notifications (§11.10), health & internal ops (§11.14). */
@Controller()
export class PlatformController {
  constructor(private prisma: PrismaService, private media: MediaService, private jobs: JobsService, private clock: ClockService, private storage: StorageService, private modules: ModulesContainer) {}

  // ---------------------------------------------------------------- media
  @Post('media/upload-url')
  uploadUrl(@Ctx() ctx: AccessContext, @Body() body: unknown) {
    const d = parse(
      z.object({
        purpose: z.string().min(2).max(40),
        relatedType: z.string().max(40).optional(),
        relatedId: z.string().max(40).optional(),
        mimeType: z.string().max(100),
        sizeBytes: z.number().int().positive(),
        sha256: z.string().length(64).optional(),
        facilityId: z.string().length(26).optional(),
        takenAt: z.string().datetime().optional(),
        caption: z.string().max(255).optional(),
      }),
      body,
    );
    return this.media.requestUpload(ctx, d);
  }

  @Post('media/:id/complete')
  @HttpCode(200)
  complete(@Ctx() ctx: AccessContext, @Param('id') id: string) {
    return this.media.complete(ctx, id);
  }

  @Get('media/:id/url')
  async url(@Ctx() ctx: AccessContext, @Param('id') id: string) {
    const m = await this.prisma.mediaFile.findUnique({ where: { public_id: id } });
    if (!m || m.status !== 'READY') throw notFound('Tệp');
    if (m.bucket === 'PRIVATE') {
      const own = m.uploaded_by === ctx.userId;
      const facilityOk = m.facility_id != null && (ctx.facilitiesFor('contract.read').includes(m.facility_id) || ctx.grants['contract.read']?.scope === 'GLOBAL');
      const customerOk = await this.customerOwns(ctx, m.related_type, m.related_id);
      if (!own && !facilityOk && !customerOk) throw notFound('Tệp');
    }
    return { url: await this.media.urlFor(m), mimeType: m.mime_type, expiresInSec: 300 };
  }

  private async customerOwns(ctx: AccessContext, type: string | null, id: bigint | null) {
    if (!ctx.customerId || !type || !id) return false;
    switch (type.toLowerCase()) {
      case 'contract_document':
        return !!(await this.prisma.contractDocument.findFirst({ where: { id, contract: { customer_id: ctx.customerId } } }));
      case 'contract':
        return !!(await this.prisma.contract.findFirst({ where: { id, customer_id: ctx.customerId } }));
      case 'inspection':
        return !!(await this.prisma.inspection.findFirst({ where: { id, contract: { customer_id: ctx.customerId } } }));
      case 'inspection_item':
        return !!(await this.prisma.inspectionItem.findFirst({ where: { id, inspection: { contract: { customer_id: ctx.customerId } } } }));
      case 'damage_item':
        return !!(await this.prisma.damageItem.findFirst({ where: { id, inspection: { contract: { customer_id: ctx.customerId } } } }));
      case 'handover':
        return !!(await this.prisma.handoverRecord.findFirst({ where: { id, contract: { customer_id: ctx.customerId } } }));
      case 'identity_verification':
        return !!(await this.prisma.identityVerification.findFirst({ where: { id, customer_id: ctx.customerId } }));
      case 'support_ticket':
      case 'ticket':
        return !!(await this.prisma.supportTicket.findFirst({ where: { id, customer_id: ctx.customerId } }));
      case 'ticket_message':
        return !!(await this.prisma.ticketMessage.findFirst({ where: { id, ticket: { customer_id: ctx.customerId } } }));
      default:
        return false;
    }
  }

  @Delete('media/:id')
  remove(@Ctx() ctx: AccessContext, @Param('id') id: string) {
    return this.media.remove(ctx, id);
  }

  /** Local-storage driver: signed PUT / GET of the blob (R2 uses its own presigned URLs). */
  @Public()
  @Put('media/:id/blob')
  @HttpCode(200)
  async putBlob(@Param('id') id: string, @Query('exp') exp: string, @Query('sig') sig: string, @Req() req: Request, @Headers('content-type') ct = '') {
    const m = await this.prisma.mediaFile.findUnique({ where: { public_id: id } });
    if (!m || m.status !== 'PENDING' || !this.storage.verify('put', m.object_key, Number(exp), sig ?? '', ct.split(';')[0])) throw forbidden('Liên kết tải lên không hợp lệ hoặc đã hết hạn');
    const body = req.body as Buffer;
    if (!Buffer.isBuffer(body) || !body.length) throw validation('Tệp rỗng');
    await this.storage.put(m.bucket, m.object_key, body, m.mime_type);
    return { ok: true };
  }

  @Public()
  @Get('media/:id/blob')
  async getBlob(@Param('id') id: string, @Query('exp') exp: string, @Query('sig') sig: string, @Res() res: Response) {
    const m = await this.prisma.mediaFile.findUnique({ where: { public_id: id } });
    if (!m || m.status !== 'READY' || !this.storage.verify('get', m.object_key, Number(exp), sig ?? '')) throw notFound('Tệp');
    const buf = await this.storage.read(m.bucket, m.object_key);
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Cache-Control', m.bucket === 'PUBLIC' ? 'public, max-age=86400' : 'private, max-age=60');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (!buf) {
      if (m.mime_type.startsWith('image/')) {
        const label =
          m.related_type === 'identity_verification'
            ? 'Ảnh CCCD / Giấy tờ tùy thân khách hàng'
            : m.purpose === 'INSPECTION_PHOTO'
              ? 'Ảnh hiện trạng kho Vaultra'
              : 'Hình ảnh đính kèm';
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420" viewBox="0 0 640 420"><rect width="640" height="420" fill="#f7f5f0"/><rect x="24" y="24" width="592" height="372" rx="16" fill="#ffffff" stroke="#e2ddd3" stroke-width="2"/><rect x="200" y="96" width="240" height="156" rx="10" fill="#f3ead8" stroke="#b0802a" stroke-width="2"/><line x1="200" y1="130" x2="440" y2="130" stroke="#b0802a" stroke-width="1.5"/><line x1="200" y1="164" x2="440" y2="164" stroke="#b0802a" stroke-width="1.5"/><line x1="200" y1="198" x2="440" y2="198" stroke="#b0802a" stroke-width="1.5"/><circle cx="320" cy="225" r="8" fill="#b0802a"/><text x="320" y="294" text-anchor="middle" font-family="sans-serif" font-size="18" font-weight="700" fill="#181b20">${label}</text><text x="320" y="322" text-anchor="middle" font-family="monospace" font-size="13" fill="#687385">ID: ${m.public_id} · SHA-256: ${(m.sha256 ?? '').slice(0, 16)}…</text></svg>`;
        res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
        res.send(Buffer.from(svg, 'utf8'));
        return;
      }
      throw notFound('Tệp');
    }
    // text files carry their encoding, so a browser that opens one directly reads the letters correctly
    res.setHeader('Content-Type', m.mime_type.startsWith('text/') && !/charset/i.test(m.mime_type) ? `${m.mime_type}; charset=utf-8` : m.mime_type);
    // Uploaded SVG can carry script: never render it inline on the API origin.
    if (m.mime_type === 'image/svg+xml') {
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
      res.setHeader('Content-Disposition', 'attachment');
    } else if (m.mime_type === 'application/pdf') {
      res.removeHeader('X-Frame-Options');
      res.setHeader('Content-Disposition', 'inline');
    } else {
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    }
    res.send(buf);
  }

  // ---------------------------------------------------------------- notifications
  @Get('notifications')
  async list(@Ctx() ctx: AccessContext, @Query() q: Record<string, unknown>) {
    const p = pageParams(q);
    const unreadOnly = q.unread === 'true' || (q.filter as Record<string, string> | undefined)?.unread === 'true';
    const where = { user_id: ctx.userId, ...(unreadOnly ? { read_at: null } : {}) };
    const [rows, total, unread] = await Promise.all([
      this.prisma.notification.findMany({ where, orderBy: { id: 'desc' }, take: p.take, skip: p.skip }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { user_id: ctx.userId, read_at: null } }),
    ]);
    return { ...paged(rows.map(({ id: _i, user_id: _u, dedupe_key: _d, ...r }) => r), p, total), unread };
  }

  @Get('notifications/unread-count')
  async unread(@Ctx() ctx: AccessContext) {
    return { unread: await this.prisma.notification.count({ where: { user_id: ctx.userId, read_at: null } }) };
  }

  @Post('notifications/read-all')
  @HttpCode(200)
  async readAll(@Ctx() ctx: AccessContext) {
    const r = await this.prisma.notification.updateMany({ where: { user_id: ctx.userId, read_at: null }, data: { read_at: new Date() } });
    return { updated: r.count };
  }

  @Post('notifications/:id/read')
  @HttpCode(200)
  async read(@Ctx() ctx: AccessContext, @Param('id') id: string) {
    const n = await this.prisma.notification.findFirst({ where: { public_id: id, user_id: ctx.userId } });
    if (!n) throw notFound('Thông báo');
    if (!n.read_at) await this.prisma.notification.update({ where: { id: n.id }, data: { read_at: new Date() } });
    return { id, read: true };
  }


  // ---------------------------------------------------------------- global search (Ctrl+K, spec §13.7)
  @Get('search')
  async search(@Ctx() ctx: AccessContext, @Query('q') qRaw = '') {
    const q = String(qRaw).trim().slice(0, 60);
    if (q.length < 2) return { data: [] };
    const out: { type: string; id: string; title: string; sub?: string; link: string }[] = [];
    const internal = ctx.roles.some((r) => r !== 'CUSTOMER');
    const base = (internal ? (ctx.hasRole('SYSTEM_ADMIN') ? '/admin' : ctx.hasRole('BUSINESS_OPS_MANAGER') ? '/ops' : ctx.hasRole('FACILITY_MANAGER') ? '/manage' : '/staff') : '/app');
    const mgr = base === '/manage' || base === '/ops';
    const like = { contains: q };
    if (ctx.can('reservation.read', false)) {
      const rows = await this.prisma.reservation.findMany({ where: { ...ctx.scope('reservation.read'), code: like } as never, include: { unit_type: { select: { name: true } } }, take: 5, orderBy: { id: 'desc' } });
      for (const r of rows) out.push({ type: 'Đơn đặt thuê', id: r.public_id, title: r.code, sub: r.unit_type.name, link: internal ? (mgr ? '/manage/reservations' : `/staff/scan?code=${r.code}`) : `/app/reservations/${r.public_id}` });
    }
    if (ctx.can('contract.read', false)) {
      const rows = await this.prisma.contract.findMany({ where: { ...ctx.scope('contract.read'), OR: [{ code: like }, { unit: { code: like } }] } as never, include: { unit: { select: { code: true } } }, take: 5, orderBy: { id: 'desc' } });
      for (const c of rows) out.push({ type: 'Hợp đồng', id: c.public_id, title: c.code, sub: `Kho ${c.unit.code}`, link: internal ? `/manage/contracts/${c.public_id}` : `/app/contracts/${c.public_id}` });
    }
    if (internal && ctx.can('customer.read', false)) {
      const rows = await this.prisma.customer.findMany({ where: { OR: [{ full_name: like }, { email: like }, { phone: like }, { code: like }], deleted_at: null } as never, take: 5 });
      const allowed = ctx.grants['customer.read']?.scope === 'GLOBAL' ? rows : [];
      const fac = ctx.facilitiesFor('customer.read');
      const scoped = ctx.grants['customer.read']?.scope === 'FACILITY' && fac.length ? await this.prisma.customer.findMany({ where: { deleted_at: null, OR: [{ full_name: like }, { email: like }, { phone: like }, { code: like }], contracts: { some: { facility_id: { in: fac } } } } as never, take: 5 }) : [];
      for (const c of [...allowed, ...scoped]) out.push({ type: 'Khách hàng', id: c.public_id, title: c.full_name, sub: c.email ?? c.phone ?? c.code, link: `${base === '/staff' ? '/staff' : '/manage'}/customers/${c.public_id}` });
    }
    if (internal && ctx.can('unit.manage', false)) {
      const rows = await this.prisma.unit.findMany({ where: { ...ctx.scope('unit.manage'), code: like, deleted_at: null } as never, include: { facility: { select: { name: true } } }, take: 5 });
      for (const u of rows) out.push({ type: 'Kho', id: u.public_id, title: u.code, sub: u.facility.name, link: `${base === '/staff' ? '/staff' : '/manage'}/units` });
    }
    const supportPerm = ctx.can('support.handle', false) ? 'support.handle' : ctx.can('support.create', false) ? 'support.create' : null;
    if (supportPerm) {
      const rows = await this.prisma.supportTicket.findMany({ where: { ...ctx.scope(supportPerm), OR: [{ code: like }, { subject: like }] } as never, take: 5, orderBy: { id: 'desc' } });
      for (const t of rows) out.push({ type: 'Ticket', id: t.public_id, title: t.code, sub: t.subject, link: internal ? `${base === '/staff' ? '/staff' : '/manage'}/tickets/${t.public_id}` : `/app/support/${t.public_id}` });
    }
    if (ctx.can('invoice.read', false)) {
      const rows = await this.prisma.invoice.findMany({ where: { ...ctx.scope('invoice.read'), code: like } as never, take: 5, orderBy: { id: 'desc' } });
      for (const i of rows) out.push({ type: 'Hóa đơn', id: i.public_id, title: i.code, link: internal ? '/manage/billing' : `/app/billing/invoices/${i.public_id}` });
    }
    return { data: out };
  }

  // ---------------------------------------------------------------- health
  @Public()
  @Get('health/live')
  live() {
    return { status: 'ok', time: new Date().toISOString() };
  }

  @Public()
  @Get('health/ready')
  async ready() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', db: 'up', version: '1.0.0' };
  }

  // ---------------------------------------------------------------- OpenAPI 3.1 / docs (spec §9.2, §11.1, §18.1)
  @Public()
  @Get('openapi.json')
  openapi() {
    if (config.isProd) throw notFound('OpenAPI');
    return {
      openapi: '3.1.0',
      info: { title: `${config.brandName} Self-Storage Facility Rental & Management API`, version: '1.0.0', description: 'REST API v1 cho hệ thống cho thuê và quản lý kho tự quản Vaultra' },
      servers: [{ url: '/v1', description: 'Cùng máy chủ với trang này' }, { url: `${config.apiPublicUrl}/v1`, description: 'Địa chỉ công khai đã cấu hình (API_PUBLIC_URL)' }],
      components: {
        securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
      },
      security: [{ bearerAuth: [] }],
      paths: buildOpenApiPaths(
        [...this.modules.values()].flatMap((m) => [...m.controllers.values()].map((w) => w.metatype as Function).filter(Boolean)),
        OPENAPI_SUMMARIES,
      ),
    };
  }

  @Public()
  @Get('docs')
  docs(@Res() res: Response) {
    if (config.isProd) throw notFound('Docs');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!doctype html><html lang="vi"><head><meta charset="utf-8"/><title>${config.brandName} API Docs</title><link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css"/></head><body style="margin:0"><div id="swagger-ui"></div><script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script><script>window.onload=()=>SwaggerUIBundle({url:'/v1/openapi.json',dom_id:'#swagger-ui',deepLinking:true,persistAuthorization:true,tryItOutEnabled:true,filter:true,docExpansion:'none'});</script></body></html>`);
  }

  // ---------------------------------------------------------------- internal (service token)
  @Internal()
  @Get('internal/jobs')
  jobList() {
    return this.jobs.names();
  }

  @Internal()
  @Post('internal/jobs/:name')
  @HttpCode(200)
  runJob(@Param('name') name: string) {
    if (name === 'all') return this.jobs.runAll();
    if (!this.jobs.names().includes(name)) throw notFound('Job');
    return this.jobs.run(name);
  }

  /** Fake clock for tests of time-based flows (spec §19.1). Disabled in production. */
  @Internal()
  @Post('internal/clock')
  @HttpCode(200)
  setClock(@Body() body: unknown) {
    if (!config.testClock) throw forbidden('Đồng hồ giả bị tắt');
    const d = parse(z.object({ advanceDays: z.number().optional(), advanceHours: z.number().optional(), reset: z.boolean().optional() }), body);
    if (d.reset) this.clock.setOffset(0);
    else this.clock.setOffset(this.clock.getOffset() + (d.advanceDays ?? 0) * 86400000 + (d.advanceHours ?? 0) * 3600000);
    return { offsetMs: this.clock.getOffset(), now: this.clock.now().toISOString() };
  }
}
