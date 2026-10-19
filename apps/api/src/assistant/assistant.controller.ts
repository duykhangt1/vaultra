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

function collectBatchDiscountTurnstileChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupePendingCheckinChatDirectRecords<T extends { id: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const item of items) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      unique.push(item);
    }
  }
  return unique;
}
