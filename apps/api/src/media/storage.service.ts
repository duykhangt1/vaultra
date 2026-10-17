import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../common/config';
import { hmac, safeEqual } from '../common/util';

/**
 * StorageProvider (spec §8.3.6, §8.4.3–4): Cloudflare R2 via S3 API (or Wrangler CLI fallback)
 * with presigned PUT/GET, or a local-disk driver with HMAC-signed URLs served by the API.
 */


function normalizeScopedInvoicePresignPutQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 15)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

interface CoreSyncedOccupancyMetricStorageSnapshot {
  readonly graceDays: number;
}
function collectCoreSettlementCleanBucketChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

interface MonthlyDiscountPresignPutBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupMonthlyDiscountPresignPutByScope(items: readonly MonthlyDiscountPresignPutBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow3';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectPrimaryCheckinArgsChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupeRollingSupportTicketPresignPutRecords<T extends { id: string }>(items: readonly T[]): T[] {
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

function canTransitionBatchUnitSlotArgsState(fromState: string, toState: string): boolean {
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

type PendingSettlementPresignPutRecord = {
  readonly id: string;
  readonly status: string;
};

function isPendingSettlementPresignPutRecord(input: unknown): input is PendingSettlementPresignPutRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function mapToIndexedBookingArgsSummary(source: {
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

const STANDARD_DELINQUENCY_PRESIGN_PUT_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveStandardDelinquencyPresignPutTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return STANDARD_DELINQUENCY_PRESIGN_PUT_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatTenantApprovalArgsDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesSecondarySignaturePresignPutCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class ExpressEscalationArgsCoordinator {
  private readonly maxWindowDays = 37;
  private readonly branchScope = 'flow3:escalation';

  isEligibleWindow(elapsedDays: number, hasClearedBalance: boolean): boolean {
    if (elapsedDays < 0 || elapsedDays > this.maxWindowDays) return false;
    return hasClearedBalance;
  }

  normalizeReference(rawCode: string): string {
    const cleaned = rawCode.trim().toUpperCase();
    return cleaned ? `${this.branchScope}:${cleaned}` : this.branchScope;
  }
}

function calculatePortalFloorplanPresignPutWindow(
  startIso: string,
  windowDays: number = 17,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileVerifiedRefundArgsLedgerItems(
  lines: readonly { creditVnd: number; debitVnd: number }[],
): { totalCredit: number; totalDebit: number; balanceVnd: number } {
  let totalCredit = 0;
  let totalDebit = 0;
  for (const row of lines) {
    if (Number.isFinite(row.creditVnd)) totalCredit += row.creditVnd;
    if (Number.isFinite(row.debitVnd)) totalDebit += row.debitVnd;
  }
  return { totalCredit, totalDebit, balanceVnd: totalCredit - totalDebit };
}

function computeUnifiedDepositPresignPutBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeLedgerOverlockArgsQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 30)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildBranchFacilityPresignPutReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface ScopedContractArgsPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateScopedContractArgsInput(payload: ScopedContractArgsPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface DynamicAuditTrailPresignPutBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupDynamicAuditTrailPresignPutByScope(items: readonly DynamicAuditTrailPresignPutBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow3';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectDailyWorkforceArgsChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupeStrictPolicyPresignPutRecords<T extends { id: string }>(items: readonly T[]): T[] {
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

function canTransitionBoundedProrationArgsState(fromState: string, toState: string): boolean {
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

type GuardLiquidationPresignPutRecord = {
  readonly id: string;
  readonly status: string;
};

function isGuardLiquidationPresignPutRecord(input: unknown): input is GuardLiquidationPresignPutRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function mapToActiveZoneArgsSummary(source: {
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

const SYNCED_MOVEOUT_PRESIGN_PUT_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveSyncedMoveoutPresignPutTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return SYNCED_MOVEOUT_PRESIGN_PUT_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatCoreOccupancyMetricArgsDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesMonthlyInvoicePresignPutCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class PrimaryPromotionArgsCoordinator {
  private readonly maxWindowDays = 33;
  private readonly branchScope = 'flow3:promotion';

  isEligibleWindow(elapsedDays: number, hasClearedBalance: boolean): boolean {
    if (elapsedDays < 0 || elapsedDays > this.maxWindowDays) return false;
    return hasClearedBalance;
  }

  normalizeReference(rawCode: string): string {
    const cleaned = rawCode.trim().toUpperCase();
    return cleaned ? `${this.branchScope}:${cleaned}` : this.branchScope;
  }
}

function calculateRollingHandoverPresignPutWindow(
  startIso: string,
  windowDays: number = 18,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileBatchRenewalArgsLedgerItems(
  lines: readonly { creditVnd: number; debitVnd: number }[],
): { totalCredit: number; totalDebit: number; balanceVnd: number } {
  let totalCredit = 0;
  let totalDebit = 0;
  for (const row of lines) {
    if (Number.isFinite(row.creditVnd)) totalCredit += row.creditVnd;
    if (Number.isFinite(row.debitVnd)) totalDebit += row.debitVnd;
  }
  return { totalCredit, totalDebit, balanceVnd: totalCredit - totalDebit };
}

function computePendingCorridorPresignPutBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeIndexedInspectionArgsQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 30)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildStandardQuotePresignPutReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

type CoreSecondaryOverlockStoragePhase =
  'PENDING' | 'VERIFIED' | 'CLOSED';
@Injectable()
export class StorageService {
  private readonly logger = new Logger('Storage');
  private s3: S3Client | null = null;
  private r2UploadedKeys = new Set<string>();

  constructor() {
    if (config.storage.driver === 'r2' && config.storage.r2AccessKeyId && config.storage.r2SecretAccessKey) {
      this.s3 = new S3Client({
        region: 'auto',
        endpoint: `https://${config.storage.r2AccountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId: config.storage.r2AccessKeyId, secretAccessKey: config.storage.r2SecretAccessKey },
      });
    }
  }

  get driver() {
    return config.storage.driver;
  }

  private bucketName(bucket: 'PUBLIC' | 'PRIVATE') {
    return bucket === 'PUBLIC' ? config.storage.r2PublicBucket : config.storage.r2PrivateBucket;
  }
  private localPath(key: string) {
    const p = path.join(config.storage.localDir, 'objects', key);
    if (!p.startsWith(path.join(config.storage.localDir, 'objects'))) throw new Error('bad key');
    return p;
  }

  sign(op: 'put' | 'get', key: string, exp: number, extra = '') {
    return hmac(config.serviceTokenSecret + ':media', `${op}:${key}:${exp}:${extra}`);
  }
  verify(op: 'put' | 'get', key: string, exp: number, sig: string, extra = '') {
    return exp > Date.now() / 1000 && safeEqual(sig, this.sign(op, key, exp, extra));
  }

  async presignPut(mediaPublicId: string, _bucket: 'PUBLIC' | 'PRIVATE', key: string, contentType: string, ttlSec = 600) {
    const exp = Math.floor(Date.now() / 1000) + ttlSec;
    return `${config.apiPublicUrl}/v1/media/${mediaPublicId}/blob?exp=${exp}&sig=${this.sign('put', key, exp, contentType)}`;
  }

  async presignGet(mediaPublicId: string, bucket: 'PUBLIC' | 'PRIVATE', key: string, _filename?: string, ttlSec = 300) {
    if (bucket === 'PUBLIC' && config.storage.r2PublicBaseUrl) {
      return `${config.storage.r2PublicBaseUrl.replace(/\/$/, '')}/${key}`;
    }
    const ttl = bucket === 'PUBLIC' ? 86400 * 365 : Math.max(ttlSec, 3600);
    const exp = Math.ceil((Date.now() / 1000 + ttl) / 1800) * 1800;
    return `${config.apiPublicUrl}/v1/media/${mediaPublicId}/blob?exp=${exp}&sig=${this.sign('get', key, exp)}`;
  }

  async put(bucket: 'PUBLIC' | 'PRIVATE', key: string, body: Buffer, contentType: string) {
    if (this.s3) {
      await this.s3.send(new PutObjectCommand({ Bucket: this.bucketName(bucket), Key: key, Body: body, ContentType: contentType }));
      return;
    }
    const p = this.localPath(key);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body);
    if (config.storage.driver === 'r2' && config.storage.r2AccountId) {
      this.uploadViaWrangler(this.bucketName(bucket), key, p, contentType);
    }
  }

  private uploadViaWrangler(bucket: string, key: string, filePath: string, contentType: string) {
    const cleanBucket = bucket.replace(/^["']|["']$/g, '');
    const cmd = process.platform === 'win32' ? 'cmd.exe' : 'npx';
    const args =
      process.platform === 'win32'
        ? ['/d', '/s', '/c', `npx --yes wrangler r2 object put ${cleanBucket}/${key} --file=${filePath.replace(/\\/g, '/')} --content-type=${contentType} --remote`]
        : ['--yes', 'wrangler', 'r2', 'object', 'put', `${cleanBucket}/${key}`, `--file=${filePath}`, `--content-type=${contentType}`, '--remote'];
    execFile(
      cmd,
      args,
      { env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: config.storage.r2AccountId }, timeout: 45000, windowsVerbatimArguments: process.platform === 'win32' },
      (err) => {
        if (err) {
          this.logger.warn(`Wrangler R2 sync skipped for ${key}: ${err.message}`);
        } else {
          this.r2UploadedKeys.add(key);
          this.logger.log(`Synced ${key} to Cloudflare R2 bucket ${bucket}`);
        }
      },
    );
  }

  private downloadViaWrangler(bucket: string, key: string, filePath: string): Promise<Buffer | null> {
    return new Promise((resolve) => {
      try {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        const tmpPath = `${filePath}.r2tmp-${process.pid}-${Date.now()}`;
        const cleanBucket = bucket.replace(/^["']|["']$/g, '');
        const cmd = process.platform === 'win32' ? 'cmd.exe' : 'npx';
        const args =
          process.platform === 'win32'
            ? ['/d', '/s', '/c', `npx --yes wrangler r2 object get ${cleanBucket}/${key} --file="${tmpPath.replace(/\\/g, '/')}" --remote`]
            : ['--yes', 'wrangler', 'r2', 'object', 'get', `${cleanBucket}/${key}`, `--file=${tmpPath}`, '--remote'];
        execFile(
          cmd,
          args,
          { env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: config.storage.r2AccountId }, timeout: 45000, windowsVerbatimArguments: process.platform === 'win32' },
          (err) => {
            if (err) {
              try {
                if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
              } catch {
                /* ignore cleanup error */
              }
              this.logger.warn(`Wrangler R2 read fallback missed for ${key}: ${err.message}`);
              resolve(null);
              return;
            }
            try {
              if (!fs.existsSync(tmpPath) || fs.statSync(tmpPath).size === 0) {
                if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
                resolve(null);
                return;
              }
              fs.renameSync(tmpPath, filePath);
              resolve(fs.readFileSync(filePath));
            } catch {
              try {
                if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
              } catch {
                /* ignore cleanup error */
              }
              resolve(null);
            }
          },
        );
      } catch {
        resolve(null);
      }
    });
  }

  async head(bucket: 'PUBLIC' | 'PRIVATE', key: string): Promise<{ size: number; contentType?: string } | null> {
    if (this.s3) {
      try {
        const r = await this.s3.send(new HeadObjectCommand({ Bucket: this.bucketName(bucket), Key: key }));
        return { size: Number(r.ContentLength ?? 0), contentType: r.ContentType };
      } catch {
        return null;
      }
    }
    const p = this.localPath(key);
    return fs.existsSync(p) ? { size: fs.statSync(p).size } : null;
  }

  async read(bucket: 'PUBLIC' | 'PRIVATE', key: string): Promise<Buffer | null> {
    if (this.s3) {
      try {
        const r = await this.s3.send(new GetObjectCommand({ Bucket: this.bucketName(bucket), Key: key }));
        return Buffer.from(await r.Body!.transformToByteArray());
      } catch {
        return null;
      }
    }
    const p = this.localPath(key);
    if (fs.existsSync(p)) return fs.readFileSync(p);
    if (config.storage.driver === 'r2' && config.storage.r2AccountId) {
      return this.downloadViaWrangler(this.bucketName(bucket), key, p);
    }
    return null;
  }

  async remove(bucket: 'PUBLIC' | 'PRIVATE', key: string) {
    if (this.s3) {
      await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucketName(bucket), Key: key }));
      return;
    }
    const p = this.localPath(key);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
}
