import 'reflect-metadata';
import './common/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from '@nestjs/common';
import * as express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { AppModule } from './app.module';
import { config } from './common/config';
import { PrismaService } from './common/prisma.service';
import { RealtimeHub } from './realtime/realtime.hub';
import { KbService } from './assistant/kb.service';
import { isAllowedOrigin } from './common/origin';

const tunnelFile = path.resolve(__dirname, '..', '.active-tunnel-url.txt');

function computePortalHandoverFwdHostBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeVerifiedRenewalTunnelFileQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 30)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

const MONTHLY_SYNCED_BILLINGCYCLE_SCOPES = [
  'flow1', 'verified', 'settled'] as const;
