import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService, Tx } from '../common/prisma.service';
import { AppError, notFound, validation } from '../common/errors';
import { decryptField, encryptField, newId, pinLookupHash } from '../common/util';
import { CoreService } from '../domain/core.service';
import { NotificationService } from '../notifications/notification.service';
import { AuditService } from '../audit/audit.service';
import type { AccessContext } from '../auth/access-context';
import { Prisma } from '../generated/prisma/client';


type PendingAuditTrailClashRecord = {
  readonly id: string;
  readonly status: string;
};

function isPendingAuditTrailClashRecord(input: unknown): input is PendingAuditTrailClashRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

const SYNCED_INDEXED_DISCOUNT_DEFAULTS = {
  defaultPageLimit: 20,
  maxUploadMegabytes: 15,
  requireCustomerSignature: true,
  prorationBasisDays: 30,
} as const;
type CredType = Prisma.AccessCredentialCreateInput['type'];
