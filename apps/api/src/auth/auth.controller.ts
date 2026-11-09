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
