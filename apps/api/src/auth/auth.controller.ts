import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, Req as R, Res } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { AuthService, ClientMeta } from './auth.service';
import { Ctx, Public, RateLimit, RequirePermission } from './decorators';
import { isAllowedOrigin } from '../common/origin';
import { AccessContext } from './access-context';
import { clientIp, pageParams, paged, parse, Req } from '../common/http';
import { config } from '../common/config';
import { AppError, forbidden, notFound } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { maskIp } from '../common/util';
import { RealtimeHub } from '../realtime/realtime.hub';
import { AuditService } from '../audit/audit.service';

const COOKIE = 'rt';
const OAUTH_COOKIE = 'g_oauth';
const meta = (req: Req): ClientMeta => {
  const qcc = typeof (req as unknown as { query?: Record<string, unknown> }).query?.cc === 'string'
    ? String((req as unknown as { query?: Record<string, unknown> }).query?.cc).trim().slice(0, 8)
    : '';
  const country = qcc || (req.headers['cf-ipcountry'] as string) || (process.env.PUBLIC_CLIENT_IP_FALLBACK ? 'VN' : undefined);
  return { ip: clientIp(req), ua: req.headers['user-agent'], country };
};

function isHttpsReq(req?: Req) {
  return !!(
    config.cookieSecure ||
    req?.secure ||
    req?.headers['x-forwarded-proto'] === 'https' ||
    String(req?.headers['cf-visitor'] || '').includes('https')
  );
}

function setRefreshCookie(res: Response, token: string, req?: Req) {
  const isHttps = isHttpsReq(req);
  res.cookie(COOKIE, token, {
    httpOnly: true,
    secure: isHttps,
    sameSite: isHttps ? 'none' : 'lax',
    path: '/v1/auth',
    maxAge: 30 * 86400000,
  });
  res.setHeader('X-Refresh-Token', token);
}

function clearRefreshCookie(res: Response, req?: Req) {
  const isHttps = isHttpsReq(req);
  res.clearCookie(COOKIE, {
    httpOnly: true,
    secure: isHttps,
    sameSite: isHttps ? 'none' : 'lax',
    path: '/v1/auth',
  });
  res.setHeader('X-Refresh-Token', '');
}
/** CSRF defence for cookie-based endpoints: Origin must be the app (spec §12.1 CSRF). */
function checkOrigin(req: Req) {
  if (!isAllowedOrigin(req.headers.origin)) throw forbidden('Origin không được phép');
}

const email = z.string().trim().toLowerCase().email('Email không hợp lệ').max(254);

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Public()
  @RateLimit(5, 3600, 'ip+body.email')
  @Post('register')
  async register(@Body() body: unknown, @R() req: Req) {
    checkOrigin(req);
    const dto = parse(
      z.object({ fullName: z.string().trim().min(2).max(150), email, password: z.string().min(1).max(200), phone: z.string().trim().max(20).optional(), acceptTerms: z.boolean(), marketingOptIn: z.boolean().optional(), turnstileToken: z.string().optional() }),
      body,
    );
    return this.auth.register(dto, meta(req));
  }

  @Public()
  @HttpCode(200)
  @Post('verify-email')
  verify(@Body() body: unknown) {
    return this.auth.verifyEmail(parse(z.object({ token: z.string().min(10) }), body).token);
  }

  @Public()
  @RateLimit(5, 3600, 'ip+body.email')
  @HttpCode(200)
  @Post('resend-verification')
  resend(@Body() body: unknown) {
    return this.auth.resendVerification(parse(z.object({ email }), body).email);
  }

  @Public()
  @RateLimit(10, 60, 'ip+body.email')
  @HttpCode(200)
  @Post('login')
  async login(@Body() body: unknown, @R() req: Req, @Res({ passthrough: true }) res: Response) {
    checkOrigin(req);
    const dto = parse(z.object({ email, password: z.string().min(1).max(200), turnstileToken: z.string().optional() }), body);
    const { refreshToken, ...out } = await this.auth.login(dto.email, dto.password, meta(req), dto.turnstileToken);
    setRefreshCookie(res, refreshToken, req);
    return out;
  }

  @Public()
  @RateLimit(30, 60)
  @HttpCode(200)
  @Post('refresh')
  async refresh(@R() req: Req, @Res({ passthrough: true }) res: Response) {
    checkOrigin(req);
    const headerToken = typeof req.headers['x-refresh-token'] === 'string' ? req.headers['x-refresh-token'].trim() : undefined;
    const cookieToken = (req as unknown as { cookies?: Record<string, string> }).cookies?.[COOKIE]?.trim();
    const candidates = [headerToken, cookieToken].filter((t, i, a): t is string => !!t && a.indexOf(t) === i);
    if (!candidates.length) {
      clearRefreshCookie(res, req);
      throw new AppError('UNAUTHENTICATED', 'Chưa đăng nhập', undefined, 401);
    }
    let lastErr: unknown;
    for (const token of candidates) {
      try {
        const { refreshToken, ...out } = await this.auth.refresh(token, meta(req));
        setRefreshCookie(res, refreshToken, req);
        return out;
      } catch (e) {
        lastErr = e;
      }
    }
    clearRefreshCookie(res, req);
    throw lastErr;
  }

  @HttpCode(200)
  @Post('logout')
  async logout(@Ctx() ctx: AccessContext, @R() req: Req, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(ctx.sessionId);
    clearRefreshCookie(res, req);
    return { message: 'Đã đăng xuất' };
  }

  @Public()
  @RateLimit(5, 3600, 'ip+body.email')
  @HttpCode(200)
  @Post('forgot-password')
  forgot(@Body() body: unknown, @R() req: Req) {
    return this.auth.forgotPassword(parse(z.object({ email }), body).email, meta(req));
  }

  @Public()
  @HttpCode(200)
  @Post('reset-password')
  reset(@Body() body: unknown) {
    const dto = parse(z.object({ token: z.string().min(10), password: z.string().min(1).max(200) }), body);
    return this.auth.resetPassword(dto.token, dto.password);
  }

  @Public()
  @HttpCode(200)
  @Post('accept-invite')
  async acceptInvite(@Body() body: unknown, @R() req: Req, @Res({ passthrough: true }) res: Response) {
    const dto = parse(z.object({ token: z.string().min(10), password: z.string().min(1).max(200) }), body);
    const { refreshToken, ...out } = await this.auth.acceptInvite(dto.token, dto.password, meta(req));
    setRefreshCookie(res, refreshToken, req);
    return out;
  }

  @Public()
  @Get('google/config')
  googleConfig() {
    return { enabled: this.auth.googleEnabled() };
  }

  @Public()
  @RateLimit(10, 60)
  @Get('google/start')
  googleStart(@Query('returnTo') returnTo: string | undefined, @Query('origin') origin: string | undefined, @R() req: Req, @Res() res: Response) {
    const { url, cookie } = this.auth.googleStart(returnTo, undefined, req, origin);
    const isHttps = isHttpsReq(req);
    res.cookie(OAUTH_COOKIE, cookie, { httpOnly: true, secure: isHttps, sameSite: isHttps ? 'none' : 'lax', path: '/v1/auth/google', maxAge: 600000 });
    res.redirect(url);
  }

  @Public()
  @Get('google/callback')
  async googleCallback(@Query('code') code: string, @Query('state') state: string, @R() req: Req, @Res() res: Response) {
    const cookie = (req as unknown as { cookies?: Record<string, string> }).cookies?.[OAUTH_COOKIE];
    res.clearCookie(OAUTH_COOKIE, { path: '/v1/auth/google' });
    const r = await this.auth.googleCallback(code, state, cookie, meta(req));
    if (r.refreshToken) setRefreshCookie(res, r.refreshToken, req);
    res.redirect(r.redirect);
  }

  @Public()
  @RateLimit(20, 60)
  @HttpCode(200)
  @Post('google/exchange')
  async googleExchange(@Body() body: unknown, @R() req: Req, @Res({ passthrough: true }) res: Response) {
    const dto = parse(z.object({ code: z.string().min(4), state: z.string().min(10) }), body);
    const r = await this.auth.googleExchange(dto.code, dto.state, meta(req));
    if (r.refreshToken) setRefreshCookie(res, r.refreshToken, req);
    return r;
  }

  @Public()
  @RateLimit(5, 600)
  @HttpCode(200)
  @Post('google/link/send-code')
  linkCode(@Body() body: unknown) {
    return this.auth.googleLinkSendCode(parse(z.object({ token: z.string().min(10) }), body).token);
  }

  @Public()
  @RateLimit(10, 600)
  @HttpCode(200)
  @Post('google/link/confirm')
  async linkConfirm(@Body() body: unknown, @R() req: Req, @Res({ passthrough: true }) res: Response) {
    const dto = parse(z.object({ token: z.string().min(10), password: z.string().optional(), code: z.string().length(6).optional() }), body);
    const { refreshToken, ...out } = await this.auth.googleLinkConfirm(dto.token, dto.password, dto.code, meta(req));
    setRefreshCookie(res, refreshToken, req);
    return out;
  }
}

@Controller()
export class MeController {
  constructor(private auth: AuthService, private prisma: PrismaService, private hub: RealtimeHub, private audit: AuditService) {}

  @HttpCode(200)
  @Post('auth/realtime-ticket')
  async realtimeTicket(@Ctx() ctx: AccessContext) {
    const facilities = await this.prisma.facility.findMany({ where: { id: { in: ctx.facilityIds } }, select: { public_id: true } });
    let all = facilities.map((f) => f.public_id);
    if (ctx.hasRole('BUSINESS_OPS_MANAGER')) all = (await this.prisma.facility.findMany({ select: { public_id: true } })).map((f) => f.public_id);
    return { ticket: this.hub.issueTicket(ctx.userPublicId, all), url: '/v1/realtime' };
  }

  @Get('me')
  async me(@Ctx() ctx: AccessContext) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: ctx.userId }, include: { customer: true, oauth: { select: { provider: true, email_at_link: true, linked_at: true } } } });
    return { ...user, oauth: user.oauth.map((o) => ({ ...o, email: o.email_at_link })), has_password: !!user.password_hash };
  }

  @Patch('me')
  async updateMe(@Ctx() ctx: AccessContext, @Body() body: unknown) {
    const dto = parse(
      z.object({
        fullName: z.string().trim().min(2).max(150).optional(),
        phone: z.string().trim().max(20).optional().nullable(),
        locale: z.enum(['vi', 'en']).optional(),
        addressLine: z.string().max(255).optional().nullable(),
        district: z.string().max(100).optional().nullable(),
        province: z.string().max(100).optional().nullable(),
        emergencyContactName: z.string().max(150).optional().nullable(),
        emergencyContactPhone: z.string().max(20).optional().nullable(),
        marketingOptIn: z.boolean().optional(),
      }),
      body,
    );
    const user = await this.prisma.user.update({ where: { id: ctx.userId }, data: { full_name: dto.fullName, phone: dto.phone, locale: dto.locale } });
    if (ctx.customerId) {
      await this.prisma.customer.update({
        where: { id: ctx.customerId },
        data: { full_name: dto.fullName, phone: dto.phone, address_line: dto.addressLine, district: dto.district, province: dto.province, emergency_contact_name: dto.emergencyContactName, emergency_contact_phone: dto.emergencyContactPhone, marketing_opt_in: dto.marketingOptIn },
      });
    }
    await this.audit.log(ctx, { action: 'user.profile_updated', entityType: 'user', entityId: ctx.userId, after: dto, category: 'SECURITY' });
    return user;
  }

  @Get('me/permissions')
  permissions(@Ctx() ctx: AccessContext) {
    return this.auth.permissionsOf(ctx.userId);
  }

  @HttpCode(200)
  @Post('me/password')
  changePassword(@Ctx() ctx: AccessContext, @Body() body: unknown) {
    const dto = parse(z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(1).max(200) }), body);
    return this.auth.changePassword(ctx.userId, ctx.sessionId, dto.currentPassword, dto.newPassword);
  }

  /** Link Google while logged in: re-authenticate with password first (§12.4.3 internal accounts). */
  @HttpCode(200)
  @Post('me/oauth/google')
  async linkGoogle(@Ctx() ctx: AccessContext, @Body() body: unknown, @R() req: Req, @Res({ passthrough: true }) res: Response) {
    const dto = parse(z.object({ password: z.string().min(1).optional(), origin: z.string().optional() }), body ?? {});
    if (dto.password) await this.auth.verifyPassword(ctx.userId, dto.password);
    const { url, cookie } = this.auth.googleStart('/', ctx.userId, req, dto.origin);
    const isHttps = isHttpsReq(req);
    res.cookie(OAUTH_COOKIE, cookie, { httpOnly: true, secure: isHttps, sameSite: isHttps ? 'none' : 'lax', path: '/v1/auth/google', maxAge: 600000 });
    return { url };
  }

  @Delete('me/oauth/google')
  unlinkGoogle(@Ctx() ctx: AccessContext) {
    return this.auth.googleUnlink(ctx.userId);
  }

  @Get('me/sessions')
  async sessions(@Ctx() ctx: AccessContext) {
    const rows = await this.prisma.userSession.findMany({ where: { user_id: ctx.userId, revoked_at: null, expires_at: { gt: new Date() } }, orderBy: { last_seen_at: 'desc' } });
    const callerIp = ctx.ip && ctx.ip !== '127.0.0.1' && ctx.ip !== '::1' ? ctx.ip : undefined;
    for (const s of rows) {
      if (s.id === ctx.sessionId && callerIp && (!s.ip_address || s.ip_address === '127.0.0.1' || s.ip_address === '::1')) {
        s.ip_address = callerIp;
        await this.prisma.userSession.update({ where: { id: s.id }, data: { ip_address: callerIp } }).catch(() => undefined);
      }
    }
    return rows.map((s) => ({ ...s, ip_address: s.ip_address || callerIp || null, current: s.id === ctx.sessionId }));
  }

  @Delete('me/sessions/:id')
  async revokeSession(@Ctx() ctx: AccessContext, @Param('id') id: string) {
    const s = await this.prisma.userSession.findUnique({ where: { public_id: id } });
    if (!s || s.user_id !== ctx.userId) throw notFound('Phiên');
    await this.auth.revokeSession(s.id, 'LOGOUT');
    return { message: 'Đã đăng xuất thiết bị' };
  }

  @HttpCode(200)
  @Post('me/sessions/revoke-others')
  async revokeOthers(@Ctx() ctx: AccessContext) {
    await this.auth.revokeAllSessions(ctx.userId, 'ADMIN', ctx.sessionId);
    return { message: 'Đã đăng xuất mọi nơi khác' };
  }

  @Get('me/login-history')
  async loginHistory(@Ctx() ctx: AccessContext, @Query() q: Record<string, unknown>) {
    const p = pageParams(q);
    const where = { user_id: ctx.userId };
    const [rows, total] = await Promise.all([
      this.prisma.loginHistory.findMany({ where, orderBy: { id: 'desc' }, take: p.take, skip: p.skip }),
      this.prisma.loginHistory.count({ where }),
    ]);
    return paged(rows.map((r) => ({ ...r, ip_address: r.ip_address || null })), p, total);
  }

  @Get('me/notification-preferences')
  async prefs(@Ctx() ctx: AccessContext) {
    const rows = await this.prisma.notificationPreference.findMany({ where: { user_id: ctx.userId } });
    const groups = ['BILLING', 'CONTRACT', 'RENEWAL', 'SUPPORT', 'OPERATIONS', 'MARKETING'] as const;
    return groups.map((g) => ({
      group: g,
      inApp: rows.find((r) => r.event_group === g && r.channel === 'IN_APP')?.enabled ?? true,
      email: rows.find((r) => r.event_group === g && r.channel === 'EMAIL')?.enabled ?? (g !== 'MARKETING'),
    }));
  }

  @Put('me/notification-preferences')
  async setPrefs(@Ctx() ctx: AccessContext, @Body() body: unknown) {
    const items = parse(z.array(z.object({ group: z.enum(['BILLING', 'CONTRACT', 'RENEWAL', 'SUPPORT', 'OPERATIONS', 'MARKETING']), inApp: z.boolean(), email: z.boolean() })), body);
    for (const it of items) {
      for (const [channel, enabled] of [['IN_APP', it.inApp], ['EMAIL', it.email]] as const) {
        await this.prisma.notificationPreference.upsert({
          where: { user_id_event_group_channel: { user_id: ctx.userId, event_group: it.group, channel } },
          update: { enabled },
          create: { user_id: ctx.userId, event_group: it.group, channel, enabled },
        });
      }
    }
    return this.prefs(ctx);
  }

  @HttpCode(200)
  @Post('me/notification-preferences')
  postPrefs(@Ctx() ctx: AccessContext, @Body() body: unknown) {
    return this.setPrefs(ctx, body);
  }

  /** Personal data export (spec NFR-13): JSON of profile, rentals, invoices, payments, tickets. */
  @RequirePermission('contract.read', false)
  @HttpCode(200)
  @Post('me/data-export')
  async dataExport(@Ctx() ctx: AccessContext) {
    if (!ctx.customerId) throw new AppError('FORBIDDEN', 'Chỉ dành cho khách hàng');
    const [user, customer, contracts, invoices, payments, tickets, consents] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: ctx.userId } }),
      this.prisma.customer.findUnique({ where: { id: ctx.customerId } }),
      this.prisma.contract.findMany({ where: { customer_id: ctx.customerId } }),
      this.prisma.invoice.findMany({ where: { customer_id: ctx.customerId }, include: { items: true } }),
      this.prisma.payment.findMany({ where: { customer_id: ctx.customerId } }),
      this.prisma.supportTicket.findMany({ where: { customer_id: ctx.customerId }, include: { messages: { where: { is_internal: false } } } }),
      this.prisma.userConsent.findMany({ where: { user_id: ctx.userId } }),
    ]);
    await this.audit.log(ctx, { action: 'privacy.data_export', entityType: 'user', entityId: ctx.userId, category: 'SECURITY' });
    return { exportedAt: new Date(), user, customer, contracts, invoices, payments, tickets, consents };
  }

  @HttpCode(200)
  @Post('me/delete-request')
  async deleteRequest(@Ctx() ctx: AccessContext, @Body() body: unknown) {
    const dto = parse(z.object({ reason: z.string().max(500).optional() }), body);
    const active = ctx.customerId ? await this.prisma.contract.count({ where: { customer_id: ctx.customerId, status: { in: ['ACTIVE', 'MOVE_OUT_SCHEDULED', 'EXPIRED', 'SIGNED', 'PENDING_SIGNATURE'] } } }) : 0;
    if (active) throw new AppError('CONFLICT', 'Bạn còn hợp đồng đang hiệu lực; hãy trả kho trước khi yêu cầu xóa dữ liệu');
    await this.audit.log(ctx, { action: 'privacy.delete_requested', entityType: 'user', entityId: ctx.userId, reason: dto.reason, category: 'SECURITY' });
    return { message: 'Đã ghi nhận yêu cầu xóa dữ liệu. Quản trị viên sẽ ẩn danh hóa hồ sơ (chứng từ tiền được giữ theo thời hạn luật định).' };
  }
}
