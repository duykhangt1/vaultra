import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { errors as joseErrors } from 'jose';
import { AppError, forbidden } from '../common/errors';
import { clientIp, Req } from '../common/http';
import { PrismaService } from '../common/prisma.service';
import { config } from '../common/config';
import { hmac, safeEqual } from '../common/util';
import { ContextService } from './context.service';
import { INTERNAL, IS_PUBLIC, PERMISSION, RATE_LIMIT } from './decorators';
import { JwtService } from './jwt.service';
import { RateLimiter } from './rate-limiter';

/**
 * Global guard, in order (spec §8.3): JwtAuthGuard -> PermissionGuard -> ScopeGuard (AccessContext).
 * Rejects tokens whose `ver` differs from users.token_version or whose session was revoked (§12.7.1).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private jwt: JwtService,
    private prisma: PrismaService,
    private contexts: ContextService,
    private limiter: RateLimiter,
  ) {}

  async canActivate(ec: ExecutionContext): Promise<boolean> {
    const req = ec.switchToHttp().getRequest<Req>();
    const targets = [ec.getHandler(), ec.getClass()];

    if (this.reflector.getAllAndOverride<boolean>(INTERNAL, targets)) {
      this.checkServiceToken(req);
      return true;
    }

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets);
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (token) {
      try {
        await this.authenticate(req, token);
      } catch (e) {
        if (!isPublic) throw e;
      }
    } else if (!isPublic) {
      throw new AppError('UNAUTHENTICATED', 'Vui lòng đăng nhập', undefined, 401);
    }

    const res = ec.switchToHttp().getResponse<{ setHeader(k: string, v: string): void }>();
    const setRlHeaders = (r: { limit: number; remaining: number; reset: number }) => {
      res.setHeader('RateLimit-Limit', String(r.limit));
      res.setHeader('RateLimit-Remaining', String(r.remaining));
      res.setHeader('RateLimit-Reset', String(r.reset));
    };
    const rl = this.reflector.getAllAndOverride<{ limit: number; windowSec: number; key: string }>(RATE_LIMIT, targets);
    if (rl) {
      const ip = clientIp(req);
      let key = rl.key === 'user' && req.ctx ? `u:${req.ctx.userId}` : `ip:${ip}`;
      key = `${ec.getClass().name}.${ec.getHandler().name}:${key}`;
      setRlHeaders(this.limiter.hit(key, rl.limit, rl.windowSec));
      if (rl.key === 'ip+body.email' && typeof req.body?.email === 'string') {
        this.limiter.hit(`${ec.getHandler().name}:e:${req.body.email.toLowerCase()}`, Math.max(1, Math.ceil(rl.limit / 2)), rl.windowSec);
      }
    } else if (req.ctx) {
      setRlHeaders(this.limiter.hit(`global:u:${req.ctx.userId}`, 600, 60));
    }

    const perm = this.reflector.getAllAndOverride<{ code: string; write: boolean }>(PERMISSION, targets);
    if (perm) {
      if (!req.ctx) throw new AppError('UNAUTHENTICATED', 'Vui lòng đăng nhập', undefined, 401);
      const rc = req.ctx;
      if (!perm.code.split('|').some((c) => rc.can(c, perm.write))) throw forbidden();
    }
    return true;
  }

  private async authenticate(req: Req, token: string) {
    let claims;
    try {
      claims = await this.jwt.verify(token);
    } catch (e) {
      if (e instanceof joseErrors.JWTExpired) throw new AppError('TOKEN_EXPIRED', 'Phiên đã hết hạn', undefined, 401);
      throw new AppError('UNAUTHENTICATED', 'Token không hợp lệ', undefined, 401);
    }
    const user = await this.prisma.user.findUnique({ where: { public_id: claims.sub }, select: { id: true, status: true, token_version: true } });
    if (!user || user.status !== 'ACTIVE' || user.token_version !== claims.ver) {
      throw new AppError('UNAUTHENTICATED', 'Phiên không còn hiệu lực', undefined, 401);
    }
    const session = await this.prisma.userSession.findUnique({ where: { public_id: claims.sid }, select: { id: true, revoked_at: true, expires_at: true } });
    if (!session || session.revoked_at || session.expires_at < new Date()) {
      throw new AppError('UNAUTHENTICATED', 'Phiên đã bị thu hồi', undefined, 401);
    }
    const cached = await this.contexts.load(user.id, user.token_version);
    if (!cached) throw new AppError('UNAUTHENTICATED', 'Phiên không còn hiệu lực', undefined, 401);
    let activeFacilityId: bigint | null = null;
    const af = req.headers['x-active-facility'];
    if (typeof af === 'string' && af) {
      const f = await this.prisma.facility.findUnique({ where: { public_id: af }, select: { id: true } });
      activeFacilityId = f?.id ?? null;
    }
    req.ctx = this.contexts.build(cached, session.id, { ip: clientIp(req), ua: req.headers['user-agent'], requestId: req.requestId }, activeFacilityId);
  }

  private checkServiceToken(req: Req) {
    // Header: X-Service-Token: <unixSeconds>.<hmac(secret, unixSeconds + path)>
    const raw = req.headers['x-service-token'];
    if (typeof raw !== 'string') throw forbidden('Service token required');
    const [ts, sig] = raw.split('.');
    const age = Math.abs(Date.now() / 1000 - Number(ts));
    const expected = hmac(config.serviceTokenSecret, `${ts}:${req.path}`);
    if (!ts || !sig || age > 60 || !safeEqual(sig, expected)) throw forbidden('Invalid service token');
  }
}

export function makeServiceToken(path: string) {
  const ts = Math.floor(Date.now() / 1000).toString();
  return `${ts}.${hmac(config.serviceTokenSecret, `${ts}:${path}`)}`;
}

function canTransitionTenantSupportTicketTargetsState(fromState: string, toState: string): boolean {
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
type CoreActiveDiscountAuthGuardTag = 'flow7' | 'active' | 'settled';

function mapToVerifiedSettlementIsPublicSummary(source: {
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

const UNIFIED_BOOKING_AUTH_GUARD_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveUnifiedBookingAuthGuardTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return UNIFIED_BOOKING_AUTH_GUARD_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}
type BatchUnifiedCheckinAuthGuardTag = 'flow7' | 'active' | 'settled';
