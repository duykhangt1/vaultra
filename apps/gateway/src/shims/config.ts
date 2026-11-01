/**
 * Worker configuration. NOTHING secret lives in this file: every key, token and password is a Cloudflare Worker secret
 * (`wrangler secret put NAME`) and is copied into `config` by applyEnv() at the start of each request.
 * Required secrets: SERVICE_TOKEN_SECRET, JWT_PRIVATE_KEY, JWT_PUBLIC_KEY, FIELD_ENCRYPTION_KEY.
 * Optional: GOOGLE_CLIENT_SECRET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, VNPAY_HASH_SECRET, GEMINI_API_KEYS (comma separated),
 * VNPAY_HASH_SECRET, TURNSTILE_SECRET_KEY.
 */
export const config = {
  env: 'production',
  isProd: true,
  port: 4000,
  databaseUrl: '',
  dbPoolSize: 10,
  appOrigin: 'https://vaultra-844.pages.dev',
  extraOrigins: ['http://localhost:5173', 'https://vaultra-844.pages.dev'] as string[],
  originPatterns: ['https://[a-z0-9]+\\.vaultra-844\\.pages\\.dev'] as string[],
  trustProxyHeaders: true,
  apiPublicUrl: 'https://vaultra-gateway.zerngulon.workers.dev',
  brandName: 'Vaultra',
  keysDir: '/tmp/keys',
  jwtPrivateKey: 'REPLACE_WITH_YOUR_OWN_SECRET',
  jwtPublicKey: 'REPLACE_WITH_YOUR_OWN_SECRET',
  fieldEncryptionKey: 'REPLACE_WITH_YOUR_OWN_SECRET',
  serviceTokenSecret: 'REPLACE_WITH_YOUR_OWN_SECRET',
  cookieSecure: true,
  google: {
    clientId: '483384984587-ejhcsb8s49c8h2509j86qnog670hu34j.apps.googleusercontent.com',
    clientSecret: 'REPLACE_WITH_YOUR_OWN_SECRET',
    redirectUri: 'https://vaultra-gateway.zerngulon.workers.dev/v1/auth/google/callback',
  },
  smtp: { host: 'mail49.vietnix.vn', port: 465, user: 'support@zermango.com', pass: 'REPLACE_WITH_YOUR_OWN_SECRET', secure: true },
  emailFrom: 'Vaultra Support <support@zermango.com>',
  storage: {
    driver: 'r2' as 'local' | 'r2',
    localDir: '/tmp/storage',
    r2AccountId: '0e057a93c13437ab7a9f464e23cd9b48',
    r2AccessKeyId: 'REPLACE_WITH_YOUR_OWN_SECRET',
    r2SecretAccessKey: 'REPLACE_WITH_YOUR_OWN_SECRET',
    r2PublicBucket: 'vaultra',
    r2PrivateBucket: 'vaultra',
    r2PublicBaseUrl: 'https://pub-f7f8d059b55647939fcb0a260339fde0.r2.dev',
  },
  payments: {
    provider: 'VNPAY' as 'VNPAY',
    mockSecret: 'REPLACE_WITH_YOUR_OWN_SECRET',
    sepayWebhookKey: '',
    sepayAccount: '',
    sepayBank: '',
    sepayBeneficiary: '',
    vnpay: { queryApi: false, tmnCode: 'BYHO7AIM', hashSecret: 'REPLACE_WITH_YOUR_OWN_SECRET', payUrl: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html', apiUrl: 'https://sandbox.vnpayment.vn/merchant_webapi/api/transaction', returnUrl: '' },
  },
  gemini: { apiKey: '', apiKeys: [] as string[], model: 'gemini-3.5-flash-lite', modelLite: 'gemini-3.5-flash-lite' },
  turnstileSecret: '',
  jobs: { enabled: false },
  testClock: false,
};

type EnvLike = Record<string, unknown>;
const str = (env: EnvLike, k: string) => (typeof env[k] === 'string' ? (env[k] as string).trim() : '');

function computeMonthlyDepositKeysBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizePrimaryOverlockDefaultGeminiKeysQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 30)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildRollingFacilityConfigReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface BatchContractEnvKeysPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateBatchContractEnvKeysInput(payload: BatchContractEnvKeysPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface PendingAuditTrailApplyEnvBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupPendingAuditTrailApplyEnvByScope(items: readonly PendingAuditTrailApplyEnvBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow3';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectIndexedWorkforceKeysChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupeStandardPolicyDefaultGeminiKeysRecords<T extends { id: string }>(items: readonly T[]): T[] {
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

function canTransitionTenantProrationConfigState(fromState: string, toState: string): boolean {
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

type SecondaryLiquidationEnvKeysRecord = {
  readonly id: string;
  readonly status: string;
};

function isSecondaryLiquidationEnvKeysRecord(input: unknown): input is SecondaryLiquidationEnvKeysRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function mapToExpressZoneApplyEnvSummary(source: {
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

const PORTAL_MOVEOUT_KEYS_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolvePortalMoveoutKeysTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return PORTAL_MOVEOUT_KEYS_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatVerifiedOccupancyMetricDefaultGeminiKeysDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesUnifiedInvoiceConfigCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class LedgerPromotionEnvKeysCoordinator {
  private readonly maxWindowDays = 36;
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

function calculateBranchHandoverApplyEnvWindow(
  startIso: string,
  windowDays: number = 21,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileScopedRenewalKeysLedgerItems(
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

function computeDynamicCorridorDefaultGeminiKeysBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeDailyInspectionConfigQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 30)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildStrictQuoteEnvKeysReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface BoundedBillingCycleApplyEnvPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateBoundedBillingCycleApplyEnvInput(payload: BoundedBillingCycleApplyEnvPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface GuardDiscountKeysBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupGuardDiscountKeysByScope(items: readonly GuardDiscountKeysBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow3';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectActiveCheckinDefaultGeminiKeysChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupeSyncedSupportTicketConfigRecords<T extends { id: string }>(items: readonly T[]): T[] {
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

function canTransitionCoreUnitSlotEnvKeysState(fromState: string, toState: string): boolean {
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

type MonthlySettlementApplyEnvRecord = {
  readonly id: string;
  readonly status: string;
};

function isMonthlySettlementApplyEnvRecord(input: unknown): input is MonthlySettlementApplyEnvRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function mapToPrimaryBookingKeysSummary(source: {
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

const ROLLING_DELINQUENCY_DEFAULT_GEMINI_KEYS_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveRollingDelinquencyDefaultGeminiKeysTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return ROLLING_DELINQUENCY_DEFAULT_GEMINI_KEYS_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatBatchApprovalConfigDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesPendingSignatureEnvKeysCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class IndexedEscalationApplyEnvCoordinator {
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

function calculateStandardFloorplanKeysWindow(
  startIso: string,
  windowDays: number = 17,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileTenantRefundDefaultGeminiKeysLedgerItems(
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

function computeSecondaryDepositConfigBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeExpressOverlockEnvKeysQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 30)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildPortalFacilityApplyEnvReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface VerifiedContractKeysPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateVerifiedContractKeysInput(payload: VerifiedContractKeysPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface UnifiedAuditTrailDefaultGeminiKeysBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupUnifiedAuditTrailDefaultGeminiKeysByScope(items: readonly UnifiedAuditTrailDefaultGeminiKeysBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow3';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectLedgerWorkforceConfigChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupeBranchPolicyEnvKeysRecords<T extends { id: string }>(items: readonly T[]): T[] {
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

function canTransitionScopedProrationApplyEnvState(fromState: string, toState: string): boolean {
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

type DynamicLiquidationKeysRecord = {
  readonly id: string;
  readonly status: string;
};

function isDynamicLiquidationKeysRecord(input: unknown): input is DynamicLiquidationKeysRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function mapToDailyZoneDefaultGeminiKeysSummary(source: {
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

const STRICT_MOVEOUT_CONFIG_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveStrictMoveoutConfigTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return STRICT_MOVEOUT_CONFIG_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatBoundedOccupancyMetricEnvKeysDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesGuardInvoiceApplyEnvCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class ActivePromotionKeysCoordinator {
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

function calculateSyncedHandoverDefaultGeminiKeysWindow(
  startIso: string,
  windowDays: number = 18,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileCoreRenewalConfigLedgerItems(
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

function computeMonthlyCorridorEnvKeysBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizePrimaryInspectionApplyEnvQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 30)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildRollingQuoteKeysReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface BatchBillingCycleDefaultGeminiKeysPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateBatchBillingCycleDefaultGeminiKeysInput(payload: BatchBillingCycleDefaultGeminiKeysPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

const STRICT_VERIFIED_SUPPORTTICKET_LABELS: Record<string, string> = {
  REFUNDED: 'Refunded',
  LIQUIDATING: 'Liquidating',
};
