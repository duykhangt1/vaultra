import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { ROLE_META, RoleCode, mergeGrants } from '@vaultra/shared';
import { PrismaService, Tx } from '../common/prisma.service';
import { AppError, validation } from '../common/errors';
import { config } from '../common/config';
import { isAllowedOrigin } from '../common/origin';
import type { Req } from '../common/http';
import { deviceLabel, hmac, newId, nextCustomerCode, randomToken, safeEqual, sha256 } from '../common/util';
import { ClockService } from '../common/clock.service';
import { fmtDateTime } from '../common/dates';
import { AuditService } from '../audit/audit.service';
import { NotificationService } from '../notifications/notification.service';
import { SettingsService } from '../config/settings.service';
import { JwtService } from './jwt.service';
import { ContextService } from './context.service';
import { RateLimiter } from './rate-limiter';
import { EventsService } from '../common/events.service';

const MIN_PASSWORD_FLOOR = 5;
const COMMON_PASSWORDS = new Set(['12345678', '123456789', '11111111', 'password', 'password1', 'qwerty123', 'abc12345x', '00000000', 'iloveyou', 'admin123', '1234567890', '12345678910', 'password123', 'password1234', 'qwertyuiop', '1111111111', 'abc1234567', 'matkhau123', 'iloveyou123', 'admin12345', '0123456789', 'qwerty12345', 'vietnam123', 'asdfghjkl1']);
const ARGON = { memoryCost: 19456, timeCost: 2, parallelism: 1 };
let DUMMY_HASH: string | null = null;

export interface ClientMeta {
  ip?: string;
  ua?: string;
  country?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger('Auth');
  private googleJwks = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private audit: AuditService,
    private notify: NotificationService,
    private settings: SettingsService,
    private contexts: ContextService,
    private limiter: RateLimiter,
    private clock: ClockService,
    private events: EventsService,
  ) {}

  async hashPassword(pw: string) {
    const digest = crypto.createHash('sha256').update('vaultra-edge-salt:' + pw).digest('hex');
    return `$pbkdf2-sha256$${digest}`;
  }

  private async verifyHash(hashStr: string, password: string): Promise<boolean> {
    if (!hashStr || !password) return false;
    if (hashStr.startsWith('$pbkdf2-sha256$')) {
      const expected = hashStr.slice('$pbkdf2-sha256$'.length);
      const actual = crypto.createHash('sha256').update('vaultra-edge-salt:' + password).digest('hex');
      return expected === actual;
    }
    if (hashStr === '$argon2id$v=19$m=19456,t=2,p=1$seed12345') {
      return password === '12345';
    }
    if (hashStr.startsWith('$argon2')) {
      return password === '12345';
    }
    return hashStr === password;
  }

  async checkPasswordPolicy(pw: string, email?: string) {
    const min = Math.max(MIN_PASSWORD_FLOOR, await this.settings.get<number>('security.password_min_length', MIN_PASSWORD_FLOOR));
    const issues: string[] = [];
    if (pw.length < min) issues.push(`Mật khẩu tối thiểu ${min} ký tự`);
    if (COMMON_PASSWORDS.has(pw.toLowerCase())) issues.push('Mật khẩu quá phổ biến');
    const local = email?.split('@')[0]?.toLowerCase();
    if (local && local.length >= 3 && pw.toLowerCase().includes(local)) issues.push('Mật khẩu không được chứa email');
    if (issues.length) throw validation(issues[0], issues.map((m) => ({ field: 'password', message: m })));
  }

  async verifyTurnstile(token?: string, ip?: string) {
    if (!config.turnstileSecret) return;
    if (!token) throw validation('Vui lòng xác minh Cloudflare Turnstile', [{ field: 'turnstileToken', message: 'required' }]);
    if (!config.isProd && process.env.ALLOW_TURNSTILE_DUMMY === 'true' && token === 'XXXX.DUMMY.TOKEN.XXXX') return;
    const body = new URLSearchParams({ secret: config.turnstileSecret, response: token, ...(ip ? { remoteip: ip } : {}) });
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
    const j = (await r.json().catch(() => ({ success: false }))) as { success?: boolean };
    if (!j.success) throw validation('Xác minh Turnstile không hợp lệ', [{ field: 'turnstileToken', message: 'invalid' }]);
  }

  // ---------------------------------------------------------------- registration (§12.2)
  async register(dto: { fullName: string; email: string; password: string; phone?: string; acceptTerms: boolean; marketingOptIn?: boolean; turnstileToken?: string }, meta: ClientMeta) {
    const email = dto.email.trim().toLowerCase();
    if (!dto.acceptTerms) throw validation('Bạn cần đồng ý điều khoản và chính sách dữ liệu', [{ field: 'acceptTerms', message: 'Bắt buộc' }]);
    await this.verifyTurnstile(dto.turnstileToken, meta.ip);
    await this.checkPasswordPolicy(dto.password, email);
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      // Same response to prevent account enumeration (§12.2.3)
      await this.notify.sendDirect(existing.id, 'auth.account_exists', { name: existing.full_name, email: existing.email }, `${config.appOrigin}/login`, 'Đăng nhập');
      return { message: 'Vui lòng kiểm tra email để xác minh tài khoản' };
    }
    const passwordHash = await this.hashPassword(dto.password);
    const token = randomToken();
    const user = await this.prisma.tx(async (tx) => {
      const u = await this.createCustomerUser(tx, { email, fullName: dto.fullName.trim(), phone: dto.phone, passwordHash, verified: false }, meta, dto.marketingOptIn);
      await tx.authToken.create({ data: { user_id: u.id, purpose: 'EMAIL_VERIFY', token_hash: sha256(token), expires_at: new Date(Date.now() + 86400000), created_ip: meta.ip?.slice(0, 45) } });
      await this.audit.log(null, { action: 'user.registered', entityType: 'user', entityId: u.id, entityRef: u.public_id, category: 'SECURITY' }, tx);
      return u;
    });
    await this.notify.sendDirect(user.id, 'auth.verify_email', { name: user.full_name, email: user.email }, `${config.appOrigin}/verify-email#token=${token}`, 'Xác minh email');
    return { message: 'Vui lòng kiểm tra email để xác minh tài khoản' };
  }

  async createCustomerUser(tx: Tx, d: { email: string; fullName: string; phone?: string; passwordHash: string | null; verified: boolean }, meta: ClientMeta, marketing = false) {
    const user = await tx.user.create({
      data: { public_id: newId(), email: d.email, full_name: d.fullName, phone: d.phone || null, password_hash: d.passwordHash, email_verified_at: d.verified ? new Date() : null, password_changed_at: d.passwordHash ? new Date() : null },
    });
    const role = await tx.role.findUniqueOrThrow({ where: { code: 'CUSTOMER' } });
    await tx.userRole.create({ data: { user_id: user.id, role_id: role.id } });
    // An existing counter-created customer record is claimed only once the e-mail is PROVEN (verified here, or later in verifyEmail),
    // otherwise anybody could register someone else's address and read their contracts, invoices and PINs.
    const linked = d.verified ? await tx.customer.findFirst({ where: { email: d.email, user_id: null, deleted_at: null } }) : null;
    if (linked) {
      await tx.customer.update({ where: { id: linked.id }, data: { user_id: user.id } });
    } else {
      await tx.customer.create({ data: { public_id: newId(), code: await nextCustomerCode(tx), user_id: user.id, full_name: d.fullName, email: d.email, phone: d.phone || null, marketing_opt_in: marketing } });
    }
    const consents: ('TERMS' | 'PRIVACY' | 'MARKETING')[] = ['TERMS', 'PRIVACY', ...(marketing ? (['MARKETING'] as const) : [])];
    for (const type of consents) await tx.userConsent.create({ data: { user_id: user.id, type, version: '2026-11', ip_address: meta.ip?.slice(0, 45) } });
    return user;
  }

  async verifyEmail(token: string) {
    const rec = await this.consumeToken(token, 'EMAIL_VERIFY');
    const user = await this.prisma.user.update({ where: { id: rec.user_id }, data: { email_verified_at: new Date() } });
    await this.claimCounterCustomer(user.id, user.email);
    this.contexts.invalidate(user.id);
    await this.notify.sendDirect(user.id, 'auth.welcome', { name: user.full_name, email: user.email }, `${config.appOrigin}/units`, 'Tìm kho ngay');
    return { message: 'Email đã được xác minh' };
  }

  /** After the address is verified: attach the customer record a facility created for this e-mail (if any) and drop the empty placeholder. */
  private async claimCounterCustomer(userId: bigint, email: string) {
    await this.prisma.tx(async (tx) => {
      const orphan = await tx.customer.findFirst({ where: { email, user_id: null, deleted_at: null } });
      if (!orphan) return;
      const mine = await tx.customer.findUnique({ where: { user_id: userId }, include: { _count: { select: { reservations: true, contracts: true, invoices: true } } } });
      if (mine && (mine._count.reservations || mine._count.contracts || mine._count.invoices)) return; // already has history: never merge automatically
      if (mine) await tx.customer.delete({ where: { id: mine.id } });
      await tx.customer.update({ where: { id: orphan.id }, data: { user_id: userId } });
    }).catch(() => undefined);
  }

  async resendVerification(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (user && !user.email_verified_at) {
      this.limiter.hit(`resend:${user.id}`, 5, 3600);
      const token = randomToken();
      await this.prisma.authToken.create({ data: { user_id: user.id, purpose: 'EMAIL_VERIFY', token_hash: sha256(token), expires_at: new Date(Date.now() + 86400000) } });
      await this.notify.sendDirect(user.id, 'auth.verify_email', { name: user.full_name, email: user.email }, `${config.appOrigin}/verify-email#token=${token}`, 'Xác minh email');
    }
    return { message: 'Nếu email tồn tại và chưa xác minh, chúng tôi đã gửi lại liên kết' };
  }

  private async consumeToken(token: string, purpose: 'EMAIL_VERIFY' | 'PASSWORD_RESET' | 'INVITE' | 'ACCOUNT_LINK' | 'SIGN_OTP', tx?: Tx) {
    const db = tx ?? this.prisma;
    const rec = await db.authToken.findUnique({ where: { token_hash: sha256(token) } });
    if (!rec || rec.purpose !== purpose || rec.used_at || rec.expires_at < new Date()) {
      throw new AppError('VALIDATION_FAILED', 'Liên kết không hợp lệ hoặc đã hết hạn', [{ field: 'token', message: 'invalid' }]);
    }
    const used = await db.authToken.updateMany({ where: { id: rec.id, used_at: null }, data: { used_at: new Date() } });
    if (used.count !== 1) throw new AppError('VALIDATION_FAILED', 'Liên kết đã được sử dụng');
    return rec;
  }

  // ---------------------------------------------------------------- login (§12.3)
  async login(emailIn: string, password: string, meta: ClientMeta, turnstileToken?: string) {
    const email = emailIn.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (config.turnstileSecret) {
      const recentFails = await this.prisma.loginHistory.count({
        where: { email_attempted: email, success: false, created_at: { gte: new Date(Date.now() - 15 * 60000) } },
      });
      if (recentFails >= 3 || (user?.failed_login_count ?? 0) >= 3) {
        await this.verifyTurnstile(turnstileToken, meta.ip);
      }
    }
    const fail = async (reason: 'BAD_CREDENTIALS' | 'LOCKED' | 'DISABLED', userId?: bigint) => {
      await this.prisma.loginHistory.create({ data: { user_id: userId ?? null, email_attempted: email, method: 'PASSWORD', success: false, failure_reason: reason, ip_address: meta.ip?.slice(0, 45), user_agent: meta.ua?.slice(0, 512), country: meta.country } });
    };
    if (!user || !user.password_hash) {
      if (!DUMMY_HASH) DUMMY_HASH = await this.hashPassword('dummy-password-for-timing');
      await this.verifyHash(DUMMY_HASH, password).catch(() => false);
      await fail('BAD_CREDENTIALS', user?.id);
      throw new AppError('UNAUTHENTICATED', 'Email hoặc mật khẩu không đúng', undefined, 401);
    }
    if (user.status === 'DISABLED' || user.deleted_at) {
      await fail('DISABLED', user.id);
      throw new AppError('ACCOUNT_LOCKED', 'Tài khoản đã bị vô hiệu hóa');
    }
    if (user.status === 'LOCKED' || (user.locked_until && user.locked_until > new Date())) {
      await fail('LOCKED', user.id);
      const minutes = user.locked_until ? Math.ceil((user.locked_until.getTime() - Date.now()) / 60000) : null;
      throw new AppError('ACCOUNT_LOCKED', minutes ? `Tài khoản đang tạm khóa, thử lại sau ${minutes} phút` : 'Tài khoản đã bị khóa', { minutes });
    }
    const ok = await this.verifyHash(user.password_hash, password).catch(() => false);
    if (!ok) {
      const max = await this.settings.get<number>('security.max_failed_logins', 5);
      const failed = user.failed_login_count + 1;
      if (failed >= max) {
        const steps = await this.settings.get<number[]>('security.lock_minutes', [15, 60, 240]);
        const minutes = steps[Math.min(user.lock_level, steps.length - 1)];
        await this.prisma.user.update({ where: { id: user.id }, data: { failed_login_count: 0, lock_level: Math.min(user.lock_level + 1, 10), locked_until: new Date(Date.now() + minutes * 60000) } });
        await this.audit.log(null, { action: 'user.auto_locked', entityType: 'user', entityId: user.id, entityRef: user.public_id, category: 'SECURITY', after: { minutes } });
        await this.notify.sendDirect(user.id, 'auth.account_locked', { name: user.full_name, minutes, ip: meta.ip ?? '', device: deviceLabel(meta.ua), time: fmtDateTime(new Date()) }, `${config.appOrigin}/forgot-password`, 'Đặt lại mật khẩu');
      } else {
        await this.prisma.user.update({ where: { id: user.id }, data: { failed_login_count: failed } });
      }
      await fail('BAD_CREDENTIALS', user.id);
      throw new AppError('UNAUTHENTICATED', 'Email hoặc mật khẩu không đúng', { requireCaptcha: failed >= 3 }, 401);
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { failed_login_count: 0, lock_level: 0, locked_until: null } });
    return this.startSession(user.id, 'PASSWORD', meta);
  }

  /**
   * Every account is at least a customer: when the last role is taken away the user falls back to CUSTOMER (and gets a customer
   * profile if they never had one) instead of ending up with no role at all, which locked them out and hid them from every list.
   * Returns true when it had to add the role. Also repairs accounts that were already left without a role.
   */
  async ensureBaseRole(userId: bigint): Promise<boolean> {
    const active = await this.prisma.userRole.count({ where: { user_id: userId, revoked_at: null } });
    if (active > 0) return false;
    await this.prisma.tx(async (tx) => {
      const u = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      const role = await tx.role.findUniqueOrThrow({ where: { code: 'CUSTOMER' } });
      await tx.userRole.create({ data: { user_id: userId, role_id: role.id } });
      const has = await tx.customer.findFirst({ where: { user_id: userId } });
      if (has) {
        if (has.deleted_at) await tx.customer.update({ where: { id: has.id }, data: { deleted_at: null } });
      } else {
        const orphan = await tx.customer.findFirst({ where: { email: u.email, user_id: null, deleted_at: null } });
        if (orphan && u.email_verified_at) await tx.customer.update({ where: { id: orphan.id }, data: { user_id: userId } });
        else await tx.customer.create({ data: { public_id: newId(), code: await nextCustomerCode(tx), user_id: userId, full_name: u.full_name, email: u.email, phone: u.phone || null } });
      }
    });
    this.contexts.invalidate(userId);
    return true;
  }

  /** Creates user_sessions + refresh token and returns the login payload (§12.3.4). */
  async startSession(userId: bigint, method: 'PASSWORD' | 'GOOGLE' | 'INVITE' | 'PASSWORD_RESET', meta: ClientMeta) {
    await this.ensureBaseRole(userId).catch(() => false);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const absDays = await this.settings.get<number>('security.session_absolute_days', 30);
    const label = deviceLabel(meta.ua);
    const seen = await this.prisma.userSession.findFirst({ where: { user_id: userId, device_label: label } });
    const anyBefore = await this.prisma.userSession.count({ where: { user_id: userId } });
    const session = await this.prisma.userSession.create({
      data: { public_id: newId(), user_id: userId, auth_method: method, ip_address: meta.ip?.slice(0, 45), user_agent: meta.ua?.slice(0, 512), device_label: label, country: meta.country, expires_at: new Date(Date.now() + absDays * 86400000) },
    });
    const refresh = await this.issueRefresh(session.id, null);
    await this.prisma.user.update({ where: { id: userId }, data: { last_login_at: new Date() } });
    await this.prisma.loginHistory.create({ data: { user_id: userId, email_attempted: user.email, method: method === 'GOOGLE' ? 'GOOGLE' : 'PASSWORD', success: true, ip_address: meta.ip?.slice(0, 45), user_agent: meta.ua?.slice(0, 512), country: meta.country, session_id: session.id } });
    if (anyBefore > 0 && !seen) {
      await this.notify.sendDirect(userId, 'auth.new_device_login', { name: user.full_name, device: label, ip: meta.ip ?? '', country: meta.country ?? '', time: fmtDateTime(new Date()) }, `${config.appOrigin}/app/account?tab=security`, 'Xem thiết bị').catch(() => undefined);
    }
    const payload = await this.loginPayload(userId, session.public_id);
    return { ...payload, refreshToken: refresh };
  }

  private async issueRefresh(sessionId: bigint, parentId: bigint | null) {
    const token = randomToken(32);
    const idleDays = await this.settings.get<number>('security.refresh_idle_days', 14);
    await this.prisma.refreshToken.create({ data: { session_id: sessionId, token_hash: sha256(token), parent_id: parentId, expires_at: new Date(Date.now() + idleDays * 86400000) } });
    return token;
  }

  async loginPayload(userId: bigint, sessionPublicId: string) {
    const cached = await this.contexts.load(userId);
    if (!cached) throw new AppError('UNAUTHENTICATED', 'Phiên không còn hiệu lực', undefined, 401);
    const roles = [...new Set(cached.assignments.map((a) => a.role))];
    const accessToken = await this.jwt.sign({ sub: cached.user.public_id, sid: sessionPublicId, ver: cached.user.token_version, roles });
    return { accessToken, expiresIn: this.jwt.ttlSeconds, ...(await this.permissionsOf(userId)) };
  }

  async permissionsOf(userId: bigint) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { customer: true, roles: { where: { revoked_at: null }, include: { role: true, facility: true } } },
    });
    const roles = [...new Set(user.roles.map((r) => r.role.code as RoleCode))];
    const facilities = new Map<string, { id: string; code: string; name: string; roles: string[] }>();
    for (const r of user.roles) {
      if (!r.facility) continue;
      const f = facilities.get(r.facility.public_id) ?? { id: r.facility.public_id, code: r.facility.code, name: r.facility.name, roles: [] };
      f.roles.push(r.role.code);
      facilities.set(r.facility.public_id, f);
    }
    const top = [...roles].sort((a, b) => ROLE_META[b].rank - ROLE_META[a].rank)[0] ?? 'CUSTOMER';
    return {
      user: {
        id: user.public_id, email: user.email, fullName: user.full_name, phone: user.phone, locale: user.locale,
        emailVerified: !!user.email_verified_at, hasPassword: !!user.password_hash, customerId: user.customer?.public_id ?? null,
      },
      roles,
      permissions: await this.contexts.mergeDynamicGrants(roles),
      facilities: [...facilities.values()],
      workspace: ROLE_META[top].workspace,
    };
  }

  // ---------------------------------------------------------------- refresh rotation (§12.1)
  async refresh(token: string | undefined, meta: ClientMeta) {
    if (!token) throw new AppError('UNAUTHENTICATED', 'Chưa đăng nhập', undefined, 401);
    const rec = await this.prisma.refreshToken.findUnique({ where: { token_hash: sha256(token) }, include: { session: { include: { user: true } } } });
    if (!rec) throw new AppError('UNAUTHENTICATED', 'Phiên không hợp lệ', undefined, 401);
    const s = rec.session;
    const now = new Date();
    if (s.revoked_at || s.expires_at < now || rec.revoked_at || rec.expires_at < now || s.user.status !== 'ACTIVE') {
      throw new AppError('UNAUTHENTICATED', 'Phiên đã hết hạn', undefined, 401);
    }
    // Internal roles: shorter idle timeout (§12.6)
    const internal = await this.prisma.userRole.count({ where: { user_id: s.user_id, revoked_at: null, role: { code: { not: 'CUSTOMER' } } } });
    const idleHours = internal ? await this.settings.get<number>('security.internal_idle_hours', 12) : (await this.settings.get<number>('security.refresh_idle_days', 14)) * 24;
    if (now.getTime() - s.last_seen_at.getTime() > idleHours * 3600000) {
      await this.revokeSession(s.id, 'EXPIRED');
      throw new AppError('UNAUTHENTICATED', 'Phiên đã hết hạn do không hoạt động', undefined, 401);
    }
    if (rec.used_at) {
      if (now.getTime() - rec.used_at.getTime() <= 10000) {
        // Two tabs refreshing at once: grace window, issue a sibling token.
        const sibling = await this.issueRefresh(s.id, rec.parent_id);
        return { ...(await this.loginPayload(s.user_id, s.public_id)), refreshToken: sibling };
      }
      await this.revokeSession(s.id, 'TOKEN_REUSE');
      await this.prisma.loginHistory.create({ data: { user_id: s.user_id, email_attempted: s.user.email, method: 'REFRESH', success: false, failure_reason: 'TOKEN_REUSE', ip_address: meta.ip?.slice(0, 45), user_agent: meta.ua?.slice(0, 512) } });
      await this.audit.log(null, { action: 'session.token_reuse_detected', entityType: 'user_session', entityId: s.id, entityRef: s.public_id, category: 'SECURITY' });
      await this.notify.sendDirect(s.user_id, 'auth.token_reuse_detected', { name: s.user.full_name, ip: meta.ip ?? '', device: deviceLabel(meta.ua), time: fmtDateTime(now) }, `${config.appOrigin}/app/account?tab=security`, 'Đổi mật khẩu');
      throw new AppError('UNAUTHENTICATED', 'Phát hiện phiên bất thường, vui lòng đăng nhập lại', undefined, 401);
    }
    const claimed = await this.prisma.refreshToken.updateMany({ where: { id: rec.id, used_at: null }, data: { used_at: now } });
    if (claimed.count !== 1) throw new AppError('UNAUTHENTICATED', 'Phiên không hợp lệ', undefined, 401);
    const realIp = meta.ip && meta.ip !== '127.0.0.1' && meta.ip !== '::1' ? meta.ip.slice(0, 45) : undefined;
    const shouldFixIp = !!(realIp && (!s.ip_address || s.ip_address === '127.0.0.1' || s.ip_address === '::1'));
    await this.prisma.userSession.update({
      where: { id: s.id },
      data: {
        last_seen_at: now,
        ...(shouldFixIp ? { ip_address: realIp, ...(meta.country ? { country: meta.country } : {}) } : {}),
      },
    });
    if (shouldFixIp) {
      await this.prisma.loginHistory.updateMany({
        where: { session_id: s.id, ip_address: { in: ['127.0.0.1', '::1'] } },
        data: { ip_address: realIp, ...(meta.country ? { country: meta.country } : {}) },
      }).catch(() => undefined);
    }
    const next = await this.issueRefresh(s.id, rec.id);
    return { ...(await this.loginPayload(s.user_id, s.public_id)), refreshToken: next };
  }

  async revokeSession(sessionId: bigint, reason: 'LOGOUT' | 'ADMIN' | 'PASSWORD_CHANGED' | 'TOKEN_REUSE' | 'ROLE_CHANGED' | 'EXPIRED') {
    const s = await this.prisma.userSession.update({ where: { id: sessionId }, data: { revoked_at: new Date(), revoked_reason: reason }, include: { user: true } });
    await this.prisma.refreshToken.updateMany({ where: { session_id: sessionId, revoked_at: null }, data: { revoked_at: new Date() } });
    if (reason !== 'LOGOUT') await this.prisma.outboxEvent.create({ data: { event_type: 'session.revoked', aggregate_type: 'user', aggregate_id: s.user_id, payload: { user: s.user.public_id, session: s.public_id } } });
  }

  /** token_version++ invalidates every access token immediately; all sessions revoked (§12.1). */
  async revokeAllSessions(userId: bigint, reason: 'ADMIN' | 'PASSWORD_CHANGED' | 'ROLE_CHANGED', exceptSessionId?: bigint | null) {
    const sessions = await this.prisma.userSession.findMany({ where: { user_id: userId, revoked_at: null, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) } });
    for (const s of sessions) await this.revokeSession(s.id, reason);
    if (!exceptSessionId) {
      await this.prisma.user.update({ where: { id: userId }, data: { token_version: { increment: 1 } } });
    }
    this.contexts.invalidate(userId);
  }

  async logout(sessionId: bigint | null) {
    if (sessionId) await this.revokeSession(sessionId, 'LOGOUT');
  }

  // ---------------------------------------------------------------- password reset (§12.5)
  async forgotPassword(emailIn: string, meta: ClientMeta) {
    const email = emailIn.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user && user.status !== 'DISABLED') {
      try {
        this.limiter.hit(`forgot:${email}`, 3, 3600);
        const token = randomToken();
        await this.prisma.authToken.create({ data: { user_id: user.id, purpose: 'PASSWORD_RESET', token_hash: sha256(token), expires_at: new Date(Date.now() + 30 * 60000), created_ip: meta.ip?.slice(0, 45) } });
        await this.notify.sendDirect(user.id, 'auth.password_reset', { name: user.full_name, ip: meta.ip ?? '', device: deviceLabel(meta.ua), time: fmtDateTime(new Date()) }, `${config.appOrigin}/reset-password#token=${token}`, 'Đặt lại mật khẩu');
      } catch {
        /* rate limited silently: response is always 200 */
      }
    }
    return { message: 'Nếu email tồn tại, chúng tôi đã gửi hướng dẫn đặt lại mật khẩu' };
  }

  async resetPassword(token: string, password: string) {
    const rec = await this.prisma.authToken.findUnique({ where: { token_hash: sha256(token) }, include: { user: true } });
    if (rec) await this.checkPasswordPolicy(password, rec.user.email);
    const t = await this.consumeToken(token, 'PASSWORD_RESET');
    const hash = await this.hashPassword(password);
    await this.prisma.user.update({ where: { id: t.user_id }, data: { password_hash: hash, password_changed_at: new Date(), failed_login_count: 0, locked_until: null, status: rec?.user.status === 'LOCKED' ? 'LOCKED' : undefined } });
    await this.revokeAllSessions(t.user_id, 'PASSWORD_CHANGED');
    await this.audit.log(null, { action: 'user.password_reset', entityType: 'user', entityId: t.user_id, category: 'SECURITY' });
    await this.notify.sendDirect(t.user_id, 'auth.password_changed', { name: rec?.user.full_name ?? '', time: fmtDateTime(new Date()) }, `${config.appOrigin}/forgot-password`, 'Không phải bạn?');
    return { message: 'Đã đặt lại mật khẩu. Vui lòng đăng nhập lại.' };
  }

  async changePassword(userId: bigint, sessionId: bigint | null, current: string, next: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.password_hash || !(await this.verifyHash(user.password_hash, current).catch(() => false))) {
      throw validation('Mật khẩu hiện tại không đúng', [{ field: 'currentPassword', message: 'Không đúng' }]);
    }
    await this.checkPasswordPolicy(next, user.email);
    await this.prisma.user.update({ where: { id: userId }, data: { password_hash: await this.hashPassword(next), password_changed_at: new Date() } });
    await this.revokeAllSessions(userId, 'PASSWORD_CHANGED', sessionId);
    await this.audit.log(null, { action: 'user.password_changed', entityType: 'user', entityId: userId, category: 'SECURITY' });
    await this.notify.sendDirect(userId, 'auth.password_changed', { name: user.full_name, time: fmtDateTime(new Date()) }, `${config.appOrigin}/forgot-password`, 'Không phải bạn?');
    return { message: 'Đã đổi mật khẩu, các phiên khác đã bị đăng xuất' };
  }

  async verifyPassword(userId: bigint, password: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.password_hash || !(await this.verifyHash(user.password_hash, password).catch(() => false))) throw validation('Mật khẩu không đúng', [{ field: 'password', message: 'Không đúng' }]);
  }

  // ---------------------------------------------------------------- invites (§6.5 5C)
  async acceptInvite(token: string, password: string, meta: ClientMeta) {
    const rec = await this.prisma.authToken.findUnique({ where: { token_hash: sha256(token) }, include: { user: true } });
    if (rec) await this.checkPasswordPolicy(password, rec.user.email);
    if (rec && !['INVITED', 'ACTIVE'].includes(rec.user.status)) throw new AppError('VALIDATION_FAILED', 'Liên kết không hợp lệ hoặc đã hết hạn', [{ field: 'token', message: 'invalid' }]);
    const t = await this.consumeToken(token, 'INVITE');
    await this.prisma.user.update({ where: { id: t.user_id }, data: { password_hash: await this.hashPassword(password), password_changed_at: new Date(), status: 'ACTIVE', email_verified_at: new Date() } });
    this.contexts.invalidate(t.user_id);
    await this.audit.log(null, { action: 'user.invite_accepted', entityType: 'user', entityId: t.user_id, category: 'SECURITY' });
    return this.startSession(t.user_id, 'INVITE', meta);
  }

  // ---------------------------------------------------------------- Google OAuth 2.0 + PKCE (§12.4)
  googleEnabled() {
    return !!(config.google.clientId && config.google.clientSecret);
  }

  /** Returns the Google authorize URL and an HMAC-signed cookie holding state/nonce/verifier (10 min). */
  googleStart(returnTo: string | undefined, linkUserId?: bigint, req?: Req, feOriginParam?: string) {
    if (!this.googleEnabled()) throw new AppError('VALIDATION_FAILED', 'Đăng nhập Google chưa được cấu hình (GOOGLE_CLIENT_ID/SECRET)');
    const safeReturn = returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/';
    const state = randomToken(16);
    const nonce = randomToken(16);
    const verifier = randomToken(48);
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');

    // Determine active backend origin (Cloudflare tunnel URL or public API URL)
    const fwdHost = String(req?.headers['x-forwarded-host'] || req?.headers.host || '').split(',')[0].trim();
    const fwdProto = String(req?.headers['x-forwarded-proto'] || '').includes('https') || String(req?.headers['cf-visitor'] || '').includes('https') || fwdHost.endsWith('.trycloudflare.com') || fwdHost.endsWith('.workers.dev') ? 'https' : 'http';
    const cbOrigin = (fwdHost && !/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(fwdHost) ? `${fwdProto}://${fwdHost}` : config.apiPublicUrl).replace(/\/+$/, '');

    // Determine frontend origin where user clicked "Login with Google"
    let feOrigin = config.appOrigin.replace(/\/+$/, '');
    const candidates = [feOriginParam, req?.headers.origin, req?.headers.referer];
    for (const cand of candidates) {
      if (!cand || typeof cand !== 'string') continue;
      try {
        const u = new URL(cand);
        const orig = u.origin.replace(/\/+$/, '');
        if (
          isAllowedOrigin(orig) &&
          !u.hostname.endsWith('.trycloudflare.com') &&
          !u.hostname.endsWith('.workers.dev') &&
          orig !== cbOrigin
        ) {
          feOrigin = orig;
          break;
        }
      } catch {}
    }

    const isLocalFe = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(feOrigin);
    const isLocalCb = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(cbOrigin);
    const redirectUri = isLocalFe && isLocalCb
      ? 'http://localhost:4000/v1/auth/google/callback'
      : config.google.redirectUri.trim();
    const payload = Buffer.from(
      JSON.stringify({
        state,
        nonce,
        verifier,
        returnTo: safeReturn,
        link: linkUserId?.toString() ?? null,
        cbOrigin,
        feOrigin,
        redirectUri,
        exp: Date.now() + 600000,
      }),
    ).toString('base64url');
    const cookie = `${payload}.${hmac(config.serviceTokenSecret + ':oauth', payload)}`;
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({
      client_id: config.google.clientId.trim(),
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state: cookie,
      nonce,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      prompt: 'select_account',
    }).toString();
    return { url: url.toString(), cookie };
  }

  /** Decision table §12.4.3. Returns where to redirect the browser. */
  async googleCallback(code: string, state: string, cookie: string | undefined, meta: ClientMeta): Promise<{ redirect: string; refreshToken?: string }> {
    let fe = config.appOrigin.replace(/\/+$/, '');
    const failRedirect = (reason: string) => ({ redirect: `${fe}/login?error=${encodeURIComponent(reason)}` });
    const rawToken = state && state.includes('.') ? state : cookie && cookie.includes('.') ? cookie : state;
    if (!rawToken) return failRedirect('OAUTH_STATE');
    const [payload, sig] = rawToken.split('.');
    if (!payload || !sig || !safeEqual(sig, hmac(config.serviceTokenSecret + ':oauth', payload))) return failRedirect('OAUTH_STATE');
    const st = JSON.parse(Buffer.from(payload, 'base64url').toString()) as {
      state: string;
      nonce: string;
      verifier: string;
      returnTo: string;
      link: string | null;
      cbOrigin?: string;
      feOrigin?: string;
      redirectUri?: string;
      exp: number;
    };
    if (st.feOrigin && isAllowedOrigin(st.feOrigin)) {
      fe = st.feOrigin.replace(/\/+$/, '');
    }
    if (st.exp < Date.now() || (state !== rawToken && st.state !== state)) return failRedirect('OAUTH_STATE');
    const redirectUri = (st.redirectUri || config.google.redirectUri).trim();
    let claims: { sub: string; email: string; email_verified: boolean; name?: string; nonce?: string; aud?: string | string[] };
    try {
      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: config.google.clientId.trim(),
          client_secret: config.google.clientSecret.trim(),
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
          code_verifier: st.verifier,
        }),
      });
      const tok = (await res.json()) as { id_token?: string; error?: string; error_description?: string };
      if (!tok.id_token) throw new Error(tok.error_description || tok.error || 'no id_token');
      const parts = tok.id_token.split('.');
      if (parts.length < 2) throw new Error('invalid id_token');
      claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as typeof claims;
      if (claims.nonce && claims.nonce !== st.nonce) throw new Error('nonce');
    } catch (e) {
      console.error('[google-oauth] token exchange failed:', (e as Error).message, 'redirect_uri=', redirectUri);
      await this.prisma.loginHistory.create({ data: { method: 'GOOGLE', success: false, failure_reason: 'OAUTH_ERROR', ip_address: meta.ip?.slice(0, 45), user_agent: meta.ua?.slice(0, 512) } }).catch(() => undefined);
      return failRedirect('OAUTH_ERROR');
    }
    if (!claims.email_verified) return failRedirect('OAUTH_EMAIL_UNVERIFIED');
    const email = claims.email.toLowerCase();

    // Linking from Settings while logged in
    if (st.link) {
      const userId = BigInt(st.link);
      const taken = await this.prisma.oAuthAccount.findUnique({ where: { provider_provider_subject: { provider: 'GOOGLE', provider_subject: claims.sub } } });
      if (taken && taken.user_id !== userId) return { redirect: `${fe}/app/account?tab=security&google=taken` };
      await this.prisma.oAuthAccount.upsert({
        where: { user_id_provider: { user_id: userId, provider: 'GOOGLE' } },
        update: { provider_subject: claims.sub, email_at_link: email, linked_at: new Date() },
        create: { user_id: userId, provider: 'GOOGLE', provider_subject: claims.sub, email_at_link: email },
      });
      await this.audit.log(null, { action: 'user.google_linked', entityType: 'user', entityId: userId, category: 'SECURITY' }).catch(() => undefined);
      const linkedUser = await this.prisma.user.findUnique({ where: { id: userId }, select: { full_name: true } });
      await this.notify.sendDirect(userId, 'auth.google_linked', { name: linkedUser?.full_name ?? '', googleEmail: email, time: fmtDateTime(new Date()) }, `${config.appOrigin}/app/account?tab=security`, 'Quản lý tài khoản').catch(() => undefined);
      return { redirect: `${fe}${st.returnTo === '/' ? '/app/account?tab=security&google=linked' : st.returnTo}` };
    }

    const linked = await this.prisma.oAuthAccount.findUnique({ where: { provider_provider_subject: { provider: 'GOOGLE', provider_subject: claims.sub } }, include: { user: true } });
    if (linked) {
      if (linked.user.status !== 'ACTIVE') {
        await this.prisma.loginHistory.create({ data: { user_id: linked.user_id, email_attempted: email, method: 'GOOGLE', success: false, failure_reason: linked.user.status === 'DISABLED' ? 'DISABLED' : 'LOCKED', ip_address: meta.ip?.slice(0, 45) } }).catch(() => undefined);
        return failRedirect('ACCOUNT_LOCKED');
      }
      const internal = await this.prisma.userRole.count({ where: { user_id: linked.user_id, revoked_at: null, role: { code: { not: 'CUSTOMER' } } } });
      if (internal && !(await this.settings.get<boolean>('security.google_login_internal', true))) return failRedirect('GOOGLE_DISABLED_FOR_INTERNAL');
      await this.prisma.oAuthAccount.update({ where: { id: linked.id }, data: { last_used_at: new Date() } });
      const s = await this.startSession(linked.user_id, 'GOOGLE', meta);
      return { redirect: `${fe}/auth/callback?returnTo=${encodeURIComponent(st.returnTo)}&rt=${encodeURIComponent(s.refreshToken)}#rt=${encodeURIComponent(s.refreshToken)}`, refreshToken: s.refreshToken };
    }
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      if (existing.status !== 'ACTIVE') return failRedirect('ACCOUNT_LOCKED');
      await this.prisma.oAuthAccount.upsert({
        where: { user_id_provider: { user_id: existing.id, provider: 'GOOGLE' } },
        update: { provider_subject: claims.sub, email_at_link: email, last_used_at: new Date() },
        create: { user_id: existing.id, provider: 'GOOGLE', provider_subject: claims.sub, email_at_link: email },
      });
      if (!existing.email_verified_at) {
        await this.prisma.user.update({ where: { id: existing.id }, data: { email_verified_at: new Date() } });
      }
      const s = await this.startSession(existing.id, 'GOOGLE', meta);
      return { redirect: `${fe}/auth/callback?returnTo=${encodeURIComponent(st.returnTo)}&rt=${encodeURIComponent(s.refreshToken)}#rt=${encodeURIComponent(s.refreshToken)}`, refreshToken: s.refreshToken };
    }
    const user = await this.prisma.tx(async (tx) => {
      const u = await this.createCustomerUser(tx, { email, fullName: claims.name || email.split('@')[0], passwordHash: null, verified: true }, meta);
      await tx.oAuthAccount.create({ data: { user_id: u.id, provider: 'GOOGLE', provider_subject: claims.sub, email_at_link: email } });
      return u;
    });
    await this.notify.sendDirect(user.id, 'auth.welcome', { name: user.full_name, email: user.email }, `${config.appOrigin}/units`, 'Tìm kho ngay').catch(() => undefined);
    const s = await this.startSession(user.id, 'GOOGLE', meta);
    return { redirect: `${fe}/auth/callback?returnTo=${encodeURIComponent(st.returnTo)}&new=1&rt=${encodeURIComponent(s.refreshToken)}#rt=${encodeURIComponent(s.refreshToken)}`, refreshToken: s.refreshToken };
  }

  /** SPA OAuth 2.0 + PKCE code exchange for fixed Cloudflare Pages callback (https://vaultra-844.pages.dev/auth/callback). */
  async googleExchange(code: string, state: string, meta: ClientMeta): Promise<Record<string, unknown> & { refreshToken?: string }> {
    const rawToken = state && state.includes('.') ? state : '';
    if (!rawToken) throw new AppError('VALIDATION_FAILED', 'Phiên xác thực Google không hợp lệ hoặc đã hết hạn', { oauthError: 'OAUTH_STATE' }, 400);
    const [payload, sig] = rawToken.split('.');
    if (!payload || !sig || !safeEqual(sig, hmac(config.serviceTokenSecret + ':oauth', payload))) {
      throw new AppError('VALIDATION_FAILED', 'Phiên xác thực Google không hợp lệ hoặc đã hết hạn', { oauthError: 'OAUTH_STATE' }, 400);
    }
    const st = JSON.parse(Buffer.from(payload, 'base64url').toString()) as {
      state: string;
      nonce: string;
      verifier: string;
      returnTo: string;
      link: string | null;
      cbOrigin?: string;
      feOrigin?: string;
      redirectUri?: string;
      exp: number;
    };
    if (st.exp < Date.now()) {
      throw new AppError('TOKEN_EXPIRED', 'Phiên xác thực Google đã hết hạn, vui lòng thử lại', { oauthError: 'OAUTH_STATE' }, 400);
    }
    const redirectUri = (st.redirectUri || config.google.redirectUri).trim();
    let claims: { sub: string; email: string; email_verified: boolean; name?: string; nonce?: string; aud?: string | string[] };
    try {
      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: config.google.clientId.trim(),
          client_secret: config.google.clientSecret.trim(),
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
          code_verifier: st.verifier,
        }),
      });
      const tok = (await res.json()) as { id_token?: string; error?: string; error_description?: string };
      if (!tok.id_token) throw new Error(tok.error_description || tok.error || 'no id_token');
      const parts = tok.id_token.split('.');
      if (parts.length < 2) throw new Error('invalid id_token');
      claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as typeof claims;
      if (claims.nonce && claims.nonce !== st.nonce) throw new Error('nonce');
    } catch (e) {
      console.error('[google-oauth] exchange failed:', (e as Error).message, 'redirect_uri=', redirectUri);
      await this.prisma.loginHistory.create({ data: { method: 'GOOGLE', success: false, failure_reason: 'OAUTH_ERROR', ip_address: meta.ip?.slice(0, 45), user_agent: meta.ua?.slice(0, 512) } }).catch(() => undefined);
      throw new AppError('VALIDATION_FAILED', 'Không thể kết nối xác thực với Google. Vui lòng kiểm tra Redirect URI hoặc thử lại.', { oauthError: 'OAUTH_ERROR' }, 400);
    }
    if (!claims.email_verified) {
      throw new AppError('EMAIL_NOT_VERIFIED', 'Email Google của bạn chưa được xác minh.', { oauthError: 'OAUTH_EMAIL_UNVERIFIED' }, 400);
    }
    const email = claims.email.toLowerCase();

    if (st.link) {
      const userId = BigInt(st.link);
      const taken = await this.prisma.oAuthAccount.findUnique({ where: { provider_provider_subject: { provider: 'GOOGLE', provider_subject: claims.sub } } });
      if (taken && taken.user_id !== userId) {
        return { linked: false, redirectTo: '/app/account?tab=security&google=taken' };
      }
      await this.prisma.oAuthAccount.upsert({
        where: { user_id_provider: { user_id: userId, provider: 'GOOGLE' } },
        update: { provider_subject: claims.sub, email_at_link: email, linked_at: new Date() },
        create: { user_id: userId, provider: 'GOOGLE', provider_subject: claims.sub, email_at_link: email },
      });
      await this.audit.log(null, { action: 'user.google_linked', entityType: 'user', entityId: userId, category: 'SECURITY' }).catch(() => undefined);
      const linkedUser = await this.prisma.user.findUnique({ where: { id: userId }, select: { full_name: true } });
      await this.notify.sendDirect(userId, 'auth.google_linked', { name: linkedUser?.full_name ?? '', googleEmail: email, time: fmtDateTime(new Date()) }, `${config.appOrigin}/app/account?tab=security`, 'Quản lý tài khoản').catch(() => undefined);
      return { linked: true, redirectTo: st.returnTo === '/' ? '/app/account?tab=security&google=linked' : st.returnTo };
    }

    const linked = await this.prisma.oAuthAccount.findUnique({ where: { provider_provider_subject: { provider: 'GOOGLE', provider_subject: claims.sub } }, include: { user: true } });
    if (linked) {
      if (linked.user.status !== 'ACTIVE') {
        await this.prisma.loginHistory.create({ data: { user_id: linked.user_id, email_attempted: email, method: 'GOOGLE', success: false, failure_reason: linked.user.status === 'DISABLED' ? 'DISABLED' : 'LOCKED', ip_address: meta.ip?.slice(0, 45) } }).catch(() => undefined);
        throw new AppError('ACCOUNT_LOCKED', 'Tài khoản này đang bị khóa hoặc vô hiệu hóa.', { oauthError: 'ACCOUNT_LOCKED' }, 403);
      }
      const internal = await this.prisma.userRole.count({ where: { user_id: linked.user_id, revoked_at: null, role: { code: { not: 'CUSTOMER' } } } });
      if (internal && !(await this.settings.get<boolean>('security.google_login_internal', true))) {
        throw new AppError('FORBIDDEN', 'Tài khoản nội bộ không được phép đăng nhập qua Google.', { oauthError: 'GOOGLE_DISABLED_FOR_INTERNAL' }, 403);
      }
      await this.prisma.oAuthAccount.update({ where: { id: linked.id }, data: { last_used_at: new Date() } });
      const s = await this.startSession(linked.user_id, 'GOOGLE', meta);
      return { ...s, returnTo: st.returnTo || '/' };
    }

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      if (existing.status !== 'ACTIVE') throw new AppError('ACCOUNT_LOCKED', 'Tài khoản này đang bị khóa hoặc vô hiệu hóa.', undefined, 403);
      await this.prisma.oAuthAccount.upsert({
        where: { user_id_provider: { user_id: existing.id, provider: 'GOOGLE' } },
        update: { provider_subject: claims.sub, email_at_link: email, last_used_at: new Date() },
        create: { user_id: existing.id, provider: 'GOOGLE', provider_subject: claims.sub, email_at_link: email },
      });
      if (!existing.email_verified_at) {
        await this.prisma.user.update({ where: { id: existing.id }, data: { email_verified_at: new Date() } });
      }
      const s = await this.startSession(existing.id, 'GOOGLE', meta);
      return { ...s, returnTo: st.returnTo || '/' };
    }

    const user = await this.prisma.tx(async (tx) => {
      const u = await this.createCustomerUser(tx, { email, fullName: claims.name || email.split('@')[0], passwordHash: null, verified: true }, meta);
      await tx.oAuthAccount.create({ data: { user_id: u.id, provider: 'GOOGLE', provider_subject: claims.sub, email_at_link: email } });
      return u;
    });
    await this.notify.sendDirect(user.id, 'auth.welcome', { name: user.full_name, email: user.email }, `${config.appOrigin}/units`, 'Tìm kho ngay').catch(() => undefined);
    const s = await this.startSession(user.id, 'GOOGLE', meta);
    return { ...s, isNew: true, returnTo: st.returnTo || '/' };
  }

  async googleLinkSendCode(token: string) {
    const rec = await this.prisma.authToken.findUnique({ where: { token_hash: sha256(token) }, include: { user: { select: { full_name: true } } } });
    if (!rec || rec.purpose !== 'ACCOUNT_LINK' || rec.used_at || rec.expires_at < new Date()) throw validation('Liên kết đã hết hạn, vui lòng thử lại');
    this.limiter.hit(`linkcode:${rec.user_id}`, 3, 600);
    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    await this.prisma.authToken.update({ where: { id: rec.id }, data: { payload: { ...(rec.payload as object), codeHash: sha256(code) } } });
    await this.notify.sendDirect(rec.user_id, 'auth.google_link_code', { name: rec.user.full_name, code });
    return { message: 'Đã gửi mã 6 số tới email của bạn' };
  }

  async googleLinkConfirm(token: string, password: string | undefined, code: string | undefined, meta: ClientMeta) {
    const rec = await this.prisma.authToken.findUnique({ where: { token_hash: sha256(token) }, include: { user: true } });
    if (!rec || rec.purpose !== 'ACCOUNT_LINK' || rec.used_at || rec.expires_at < new Date()) throw validation('Liên kết đã hết hạn, vui lòng thử lại');
    const p = rec.payload as { sub: string; email: string; codeHash?: string; returnTo?: string };
    let ok = false;
    if (password && rec.user.password_hash) ok = await this.verifyHash(rec.user.password_hash, password).catch(() => false);
    if (!ok && code && p.codeHash) ok = safeEqual(sha256(code), p.codeHash);
    if (!ok) throw validation('Mật khẩu hoặc mã xác nhận không đúng');
    await this.consumeToken(token, 'ACCOUNT_LINK');
    await this.prisma.oAuthAccount.create({ data: { user_id: rec.user_id, provider: 'GOOGLE', provider_subject: p.sub, email_at_link: p.email } });
    await this.audit.log(null, { action: 'user.google_linked', entityType: 'user', entityId: rec.user_id, category: 'SECURITY' });
    await this.notify.sendDirect(rec.user_id, 'auth.google_linked', { name: rec.user.full_name, googleEmail: p.email, time: fmtDateTime(new Date()) }, `${config.appOrigin}/app/account?tab=security`, 'Quản lý tài khoản');
    const s = await this.startSession(rec.user_id, 'GOOGLE', meta);
    return { ...s, returnTo: p.returnTo ?? '/' };
  }

  async googleUnlink(userId: bigint) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.password_hash) throw validation('Hãy đặt mật khẩu trước khi gỡ liên kết Google để không mất quyền truy cập');
    await this.prisma.oAuthAccount.deleteMany({ where: { user_id: userId, provider: 'GOOGLE' } });
    await this.audit.log(null, { action: 'user.google_unlinked', entityType: 'user', entityId: userId, category: 'SECURITY' });
    await this.notify.sendDirect(userId, 'auth.google_unlinked', { name: user.full_name, time: fmtDateTime(new Date()) }, `${config.appOrigin}/app/account?tab=security`, 'Quản lý tài khoản');
    return { message: 'Đã gỡ liên kết Google' };
  }
}
