import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Patch, Post, Query, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { Ctx, Public, RateLimit, RequirePermission } from '../auth/decorators';
import { AccessContext } from '../auth/access-context';
import { PrismaService } from '../common/prisma.service';
import { AssistantService } from './assistant.service';
import { KbService, chunkText } from './kb.service';
import { AppError, notFound, validation } from '../common/errors';
import { clientIp, filterParam, pageParams, paged, parse, Req as AppReq } from '../common/http';
import { newId } from '../common/util';
import { AuditService } from '../audit/audit.service';

const CATS = ['FAQ', 'SIZE_GUIDE', 'POLICY', 'RULES', 'FACILITY_INFO', 'SOP'] as const;

@Controller()
export class AssistantController {
  constructor(
    private svc: AssistantService,
    private kb: KbService,
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  private async turnstile(token?: string) {
    const secret = process.env.TURNSTILE_SECRET;
    if (!secret) return;
    if (!token) throw new AppError('VALIDATION_FAILED', 'Cần xác minh chống bot');
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token }),
    }).catch(() => null);
    const j = (await r?.json().catch(() => null)) as { success?: boolean } | null;
    if (!j?.success) throw new AppError('VALIDATION_FAILED', 'Xác minh chống bot thất bại');
  }

  // ------------------------------------------------------------ conversations & chat
  @Public()
  @RateLimit(40, 600)
  @Post('assistant/conversations')
  async open(@Req() req: AppReq, @Body() body: unknown, @Headers('x-turnstile-token') ts?: string) {
    const d = parse(z.object({ locale: z.enum(['vi', 'en']).optional() }), body);
    if (!req.ctx) await this.turnstile(ts);
    return this.svc.open(req.ctx, clientIp(req), req.headers['user-agent'], d.locale);
  }

  /** Direct JSON chat endpoint (D:\Website style POST /v1/chatbot/chat). */
  @Public()
  @RateLimit(40, 600)
  @Post('chatbot/chat')
  @HttpCode(200)
  async chatDirect(@Req() req: AppReq, @Body() body: unknown) {
    const d = parse(
      z.object({
        message: z.string().min(1).max(2000),
        sessionId: z.string().optional(),
      }),
      body,
    );
    return this.svc.chatDirect(req.ctx, clientIp(req), req.headers['user-agent'], d.message, d.sessionId);
  }

  /** Batch translation API endpoint for dynamic UI / database text (`POST /v1/assistant/translate`). */
  @Public()
  @RateLimit(120, 60)
  @Post('assistant/translate')
  @HttpCode(200)
  async translateBatch(@Body() body: unknown) {
    const d = parse(
      z.object({
        texts: z.array(z.string().max(2000)).min(1).max(80),
        target: z.enum(['en', 'vi']).default('en'),
        source: z.enum(['vi', 'en', 'auto']).default('vi'),
      }),
      body,
    );
    const unique = Array.from(new Set(d.texts.map((t) => t.trim()).filter(Boolean)));
    const translations: Record<string, string> = {};
    if (unique.length === 0) return { translations };

    try {
      const formBody = unique.map((t) => `q=${encodeURIComponent(t)}`).join('&');
      const r = await fetch(
        `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=${d.source}&tl=${d.target}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
          body: formBody,
        },
      );
      if (r.ok) {
        const data = (await r.json()) as unknown;
        if (Array.isArray(data)) {
          unique.forEach((src, idx) => {
            const item = data[idx];
            const translated = typeof item === 'string' ? item : Array.isArray(item) && typeof item[0] === 'string' ? item[0] : '';
            if (translated.trim()) {
              translations[src] = translated.trim();
            }
          });
        }
      }
    } catch {
      // ignore and fall through
    }
    return { translations };
  }

  @RequirePermission('assistant.use_account', false)
  @Get('assistant/conversations')
  list(@Ctx() ctx: AccessContext) {
    return this.svc.list(ctx);
  }

  @Public()
  @Get('assistant/conversations/:id')
  detail(@Req() req: AppReq, @Param('id') id: string) {
    return this.svc.detail(req.ctx, clientIp(req), req.headers['user-agent'], id);
  }

  @Public()
  @Delete('assistant/conversations/:id')
  remove(@Req() req: AppReq, @Param('id') id: string) {
    return this.svc.remove(req.ctx, clientIp(req), req.headers['user-agent'], id);
  }

  /** SSE: event: token | card | done | error. */
  @Public()
  @Post('assistant/conversations/:id/messages')
  async message(@Req() req: AppReq, @Res() res: Response, @Param('id') id: string, @Body() body: unknown) {
    const d = parse(z.object({ content: z.string().min(1).max(2000) }), body);
    let started = false;
    const start = () => {
      if (started) return;
      started = true;
      res.status(200);
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();
    };
    const emit = (event: string, data: unknown) => {
      start();
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    try {
      await this.svc.send(req.ctx, clientIp(req), req.headers['user-agent'], id, d.content, emit);
    } catch (e) {
      if (!started) throw e;
      emit('error', { message: e instanceof AppError ? e.message : 'Có lỗi xảy ra' });
    }
    start();
    res.end();
  }

  @Public()
  @Post('assistant/conversations/:id/handoff')
  @HttpCode(200)
  handoff(@Req() req: AppReq, @Param('id') id: string, @Body() body: unknown) {
    const d = parse(z.object({ email: z.string().email().optional(), note: z.string().max(500).optional(), facility: z.string().max(60).optional(), name: z.string().max(120).optional(), phone: z.string().max(30).optional(), message: z.string().max(500).optional() }), body);
    return this.svc.handoff(req.ctx, clientIp(req), req.headers['user-agent'], id, d);
  }

  @RequirePermission('support.create')
  @Post('assistant/drafts/:id/confirm')
  confirm(@Ctx() ctx: AccessContext, @Param('id') id: string) {
    return this.svc.confirmDraft(ctx, id);
  }

  @Public()
  @Post('assistant/messages/:id/feedback')
  @HttpCode(200)
  feedback(@Req() req: AppReq, @Param('id') id: string, @Body() body: unknown) {
    const d = parse(
      z.object({
        rating: z.enum(['UP', 'DOWN']),
        reason: z.enum(['WRONG', 'NOT_HELPFUL', 'UNSAFE', 'OTHER']).optional(),
        comment: z.string().max(500).optional(),
      }),
      body,
    );
    return this.svc.feedback(req.ctx, clientIp(req), req.headers['user-agent'], id, d);
  }

  // ------------------------------------------------------------ staff helpers
  @RequirePermission('assistant.use_ops', false)
  @Post('tickets/:id/assistant/summary')
  @HttpCode(200)
  summary(@Ctx() ctx: AccessContext, @Param('id') id: string) {
    return this.svc.opsText(ctx, id, 'summary');
  }

  @RequirePermission('assistant.use_ops', false)
  @Post('tickets/:id/assistant/reply-draft')
  @HttpCode(200)
  replyDraft(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() b?: { prompt?: string; hint?: string }) {
    return this.svc.opsText(ctx, id, 'reply', b?.prompt ?? b?.hint);
  }

  // ------------------------------------------------------------ analytics & RAG stats
  @RequirePermission('assistant.logs.read', false)
  @Get('assistant/analytics')
  analytics(@Ctx() ctx: AccessContext, @Query('days') days?: string) {
    return this.svc.analytics(ctx, Math.min(180, Math.max(1, Number(days) || 30)));
  }

  @RequirePermission('assistant.kb.manage', false)
  @Get('kb/stats')
  kbStats() {
    return this.svc.kbStats();
  }

  @RequirePermission('assistant.kb.manage', false)
  @Post('kb/questions/:id/resolve')
  @HttpCode(200)
  resolveQuestion(@Param('id') id: string) {
    return this.svc.resolveQuestion(id);
  }

  // ------------------------------------------------------------ knowledge base & RAG Editor (§22.8)
  private async article(_ctx: AccessContext, id: string) {
    let a = await this.prisma.kbArticle.findUnique({ where: { public_id: id } });
    if (!a && /^\d+$/.test(id)) {
      a = await this.prisma.kbArticle.findUnique({ where: { id: BigInt(id) } });
    }
    if (!a) throw notFound('Bài tri thức');
    return a;
  }

  @RequirePermission('assistant.kb.manage', false)
  @Get('kb/articles')
  async articles(@Ctx() _ctx: AccessContext, @Query() q: Record<string, unknown>) {
    const p = pageParams({ ...q, pageSize: q.pageSize ?? '50' });
    const status = filterParam(q, 'status');
    const category = filterParam(q, 'category');
    const search = typeof q.q === 'string' ? q.q.trim() : '';

    // Auto-seed website RAG articles if fewer than 10 exist yet
    const totalCount = await this.prisma.kbArticle.count();
    if (totalCount < 10) {
      await this.kb.syncWebsiteData(false).catch(() => undefined);
    }

    const where = {
      ...(status ? { status: status as never } : {}),
      ...(category ? { category: category as never } : {}),
      ...(search ? { OR: [{ title: { contains: search } }, { body: { contains: search } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.kbArticle.findMany({
        where,
        include: { chunks: { select: { id: true, chunk_no: true, content: true }, orderBy: { chunk_no: 'asc' } } },
        orderBy: { updated_at: 'desc' },
        take: p.take,
        skip: p.skip,
      }),
      this.prisma.kbArticle.count({ where }),
    ]);
    return paged(
      rows.map(({ id: _i, chunks, ...r }) => {
        const cleanChunks = chunks?.length
          ? chunks.map((c) => ({
              id: String(c.id),
              chunkNo: c.chunk_no,
              content: c.content.startsWith(`${r.title}\n\n`) ? c.content.slice(r.title.length + 2) : c.content,
            }))
          : chunkText(r.body).map((c, idx) => ({
              id: `auto-${idx + 1}`,
              chunkNo: idx + 1,
              content: c,
            }));
        return {
          ...r,
          facility_id: undefined,
          isActive: r.status === 'PUBLISHED',
          chunkCount: cleanChunks.length,
          chunks: cleanChunks,
        };
      }),
      p,
      total,
    );
  }

  @RequirePermission('assistant.kb.manage', false)
  @Get('kb/articles/:id')
  async one(@Ctx() ctx: AccessContext, @Param('id') id: string) {
    const cur = await this.article(ctx, id);
    const chunks = await this.prisma.kbChunk.findMany({
      where: { article_id: cur.id },
      orderBy: { chunk_no: 'asc' },
    });
    const { id: _i, ...a } = cur;
    return {
      ...a,
      chunks: chunks.map((c) => ({
        id: String(c.id),
        chunkNo: c.chunk_no,
        content: c.content.startsWith(`${a.title}\n\n`) ? c.content.slice(a.title.length + 2) : c.content,
      })),
    };
  }

  private body = z.object({
    category: z.enum(CATS).default('FAQ'),
    audience: z.enum(['PUBLIC', 'CUSTOMER', 'INTERNAL']).default('PUBLIC'),
    locale: z.enum(['vi', 'en']).default('vi'),
    title: z.string().trim().min(2).max(250),
    body: z.string().trim().min(2).max(50000).optional(),
    chunks: z.array(z.string().trim()).optional(),
    status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
    facilityId: z.string().trim().optional().nullable(),
    resolveQuestionId: z.string().trim().optional(),
  });

  @RequirePermission('assistant.kb.manage')
  @Post('kb/articles')
  async create(@Ctx() ctx: AccessContext, @Body() b: unknown) {
    const d = parse(this.body, b);
    const customChunks = (d.chunks ?? []).map((c) => c.trim()).filter(Boolean);
    const finalBody = (d.body?.trim() || customChunks.join('\n\n')).trim();
    if (finalBody.length < 3) throw validation('Vui lòng nhập nội dung tài liệu hoặc ít nhất 1 chunk');

    let facilityId: bigint | null = null;
    if (d.facilityId) {
      const f = await this.prisma.facility.findUnique({ where: { public_id: d.facilityId } });
      if (!f) throw notFound('Cơ sở');
      facilityId = f.id;
    }
    const status = d.status ?? 'PUBLISHED';
    const a = await this.prisma.tx(async (tx) => {
      const created = await tx.kbArticle.create({
        data: {
          public_id: newId(),
          category: d.category,
          audience: d.audience,
          locale: d.locale,
          title: d.title,
          body: finalBody,
          status,
          source: 'MANUAL',
          facility_id: facilityId,
          updated_by: ctx.userId,
        },
      });
      await this.kb.rebuildChunks(tx, created.id, customChunks.length ? customChunks : undefined);
      return created;
    });
    if (d.resolveQuestionId) {
      await this.svc.resolveQuestion(d.resolveQuestionId).catch(() => undefined);
    }
    this.svc.clearCache();
    await this.audit.log(ctx, { action: 'kb.create', entityType: 'kb_article', entityId: a.id, entityRef: a.title, category: 'BUSINESS' });
    const { id: _i, ...out } = a;
    const chunkList = customChunks.length ? customChunks : chunkText(`${out.title}\n\n${out.body}`);
    return {
      ...out,
      isActive: out.status === 'PUBLISHED',
      chunkCount: chunkList.length,
      chunks: chunkList.map((c, idx) => ({ id: `c-${idx + 1}`, chunkNo: idx + 1, content: c })),
    };
  }

  @RequirePermission('assistant.kb.manage')
  @Patch('kb/articles/:id')
  async update(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() b: unknown) {
    const cur = await this.article(ctx, id);
    const d = parse(this.body.partial(), b);
    const customChunks = d.chunks ? d.chunks.map((c) => c.trim()).filter(Boolean) : undefined;
    const nextBody = customChunks?.length ? customChunks.join('\n\n') : d.body;

    const a = await this.prisma.tx(async (tx) => {
      const u = await tx.kbArticle.update({
        where: { id: cur.id },
        data: {
          ...(d.category ? { category: d.category } : {}),
          ...(d.audience ? { audience: d.audience } : {}),
          ...(d.locale ? { locale: d.locale } : {}),
          ...(d.title ? { title: d.title } : {}),
          ...(nextBody ? { body: nextBody } : {}),
          ...(d.status ? { status: d.status } : {}),
          version: { increment: 1 },
          updated_by: ctx.userId,
        },
      });
      await this.kb.rebuildChunks(tx, u.id, customChunks?.length ? customChunks : undefined);
      return u;
    });
    this.svc.clearCache();
    await this.audit.log(ctx, { action: 'kb.update', entityType: 'kb_article', entityId: a.id, entityRef: a.title, category: 'BUSINESS' });
    const { id: _i, ...out } = a;
    const chunkList = customChunks?.length ? customChunks : chunkText(`${out.title}\n\n${out.body}`);
    return {
      ...out,
      isActive: out.status === 'PUBLISHED',
      chunkCount: chunkList.length,
      chunks: chunkList.map((c, idx) => ({ id: `c-${idx + 1}`, chunkNo: idx + 1, content: c })),
    };
  }

  /** Append a new chunk directly to an existing KB article. */
  @RequirePermission('assistant.kb.manage')
  @Post('kb/articles/:id/chunks')
  @HttpCode(200)
  async addChunk(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() b: unknown) {
    const cur = await this.article(ctx, id);
    const d = parse(z.object({ content: z.string().trim().min(2).max(10000) }), b);
    const updated = await this.kb.appendChunk(cur.id, d.content, ctx.userId);
    this.svc.clearCache();
    await this.audit.log(ctx, {
      action: 'kb.chunk.add',
      entityType: 'kb_article',
      entityId: cur.id,
      entityRef: cur.title,
      category: 'BUSINESS',
    });
    const chunks = await this.prisma.kbChunk.findMany({ where: { article_id: cur.id }, orderBy: { chunk_no: 'asc' } });
    const { id: _i, ...out } = updated ?? cur;
    return {
      ...out,
      isActive: out.status === 'PUBLISHED',
      chunkCount: chunks.length,
      chunks: chunks.map((c) => ({
        id: String(c.id),
        chunkNo: c.chunk_no,
        content: c.content.startsWith(`${out.title}\n\n`) ? c.content.slice(out.title.length + 2) : c.content,
      })),
    };
  }

  @RequirePermission('assistant.kb.manage')
  @Post('kb/articles/:id/publish')
  @HttpCode(200)
  async publish(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() b: unknown) {
    const cur = await this.article(ctx, id);
    const d = parse(z.object({ unpublish: z.boolean().optional() }), b);
    const status = d.unpublish ? 'ARCHIVED' : 'PUBLISHED';
    const a = await this.prisma.tx(async (tx) => {
      const u = await tx.kbArticle.update({ where: { id: cur.id }, data: { status, updated_by: ctx.userId } });
      await this.kb.rebuildChunks(tx, u.id);
      return u;
    });
    this.svc.clearCache();
    await this.audit.log(ctx, {
      action: d.unpublish ? 'kb.archive' : 'kb.publish',
      entityType: 'kb_article',
      entityId: a.id,
      entityRef: a.title,
      category: 'BUSINESS',
    });
    const { id: _i, ...out } = a;
    return {
      ...out,
      isActive: out.status === 'PUBLISHED',
      chunkCount: out.status === 'PUBLISHED' ? chunkText(`${out.title}\n\n${out.body}`).length : 0,
    };
  }

  /** Toggle active status (PUBLISHED <-> ARCHIVED) with 1 click, like D:\Website AdminChatbot. */
  @RequirePermission('assistant.kb.manage')
  @Patch('kb/articles/:id/toggle')
  async toggle(@Ctx() ctx: AccessContext, @Param('id') id: string) {
    const cur = await this.article(ctx, id);
    const nextStatus = cur.status === 'PUBLISHED' ? 'ARCHIVED' : 'PUBLISHED';
    const a = await this.prisma.tx(async (tx) => {
      const u = await tx.kbArticle.update({
        where: { id: cur.id },
        data: { status: nextStatus, updated_by: ctx.userId },
      });
      await this.kb.rebuildChunks(tx, u.id);
      return u;
    });
    this.svc.clearCache();
    await this.audit.log(ctx, {
      action: nextStatus === 'PUBLISHED' ? 'kb.publish' : 'kb.archive',
      entityType: 'kb_article',
      entityId: a.id,
      entityRef: a.title,
      category: 'BUSINESS',
    });
    const { id: _i, ...out } = a;
    return {
      ...out,
      isActive: out.status === 'PUBLISHED',
      chunkCount: out.status === 'PUBLISHED' ? chunkText(`${out.title}\n\n${out.body}`).length : 0,
    };
  }

  /** Re-sync full website content (facilities, unit types & prices, size guide, policies, rules, FAQs) into RAG KB. */
  @RequirePermission('assistant.kb.manage')
  @Post('kb/sync-website')
  @HttpCode(200)
  async syncWebsite(@Ctx() ctx: AccessContext) {
    const res = await this.kb.syncWebsiteData(true);
    this.svc.clearCache();
    await this.audit.log(ctx, {
      action: 'kb.sync_website',
      entityType: 'kb_article',
      entityRef: `Synced ${res.totalArticles} articles`,
      category: 'BUSINESS',
    });
    return res;
  }

  @RequirePermission('assistant.kb.manage')
  @Delete('kb/articles/:id')
  async del(@Ctx() ctx: AccessContext, @Param('id') id: string) {
    const cur = await this.article(ctx, id);
    await this.prisma.kbChunk.deleteMany({ where: { article_id: cur.id } });
    await this.prisma.kbArticle.delete({ where: { id: cur.id } });
    this.svc.clearCache();
    await this.audit.log(ctx, { action: 'kb.delete', entityType: 'kb_article', entityId: cur.id, entityRef: cur.title, category: 'BUSINESS' });
    return { message: 'Đã xóa tài liệu tri thức RAG' };
  }
}
