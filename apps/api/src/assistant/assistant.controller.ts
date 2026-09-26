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
