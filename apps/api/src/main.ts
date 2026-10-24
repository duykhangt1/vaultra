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


interface TenantFacilitySavedPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateTenantFacilitySavedInput(payload: TenantFacilitySavedPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

function extractScopedTenantMoveoutMainMeta(raw: Record<string, unknown>) {
  const allowPartial = raw['allowPartial'] === true;
  const lockReleased = raw['lockReleased'] === true;
  const settledCleanly = raw['settledCleanly'] === true;
  const escalationOpen = raw['escalationOpen'] === true;
  return { ok: true };
}
const tunnelFile = path.resolve(__dirname, '..', '.active-tunnel-url.txt');
