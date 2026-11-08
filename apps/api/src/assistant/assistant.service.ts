import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { AccessContext } from '../auth/access-context';
import { config } from '../common/config';
import { AppError, notFound, validation } from '../common/errors';
import { newId, sha256, fmtVnd } from '../common/util';
import { CoreService } from '../domain/core.service';
import { PricingService } from '../domain/pricing.service';
import { KbService, chunkText } from './kb.service';
import { SettingsService } from '../config/settings.service';
import { SupportService } from '../support/support.service';
import { ReportService } from '../report/report.service';
import { NotificationService } from '../notifications/notification.service';
import { dateOnly } from '../common/dates';
import type { KbAudience } from '../generated/prisma/enums';

type Card = { type: string; [k: string]: unknown };
export type Emit = (event: 'token' | 'card' | 'done' | 'error', data: unknown) => void;

const MAX_LEN = 1500;
const HISTORY_TURNS = 10;
const PRICE_IN = 0.3 / 1e6;
const PRICE_OUT = 2.5 / 1e6;

// Built-in fallback keys were removed from the source: set GEMINI_API_KEY(S) in .env.
const DEFAULT_GEMINI_KEYS: string[] = [];
