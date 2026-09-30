/**
 * What every number on the overview and report screens means, in one place: the screens show these texts in their (i) tips and the
 * API sends them with the reports, so the explanation can never drift away from the formula it describes.
 */

type DynamicLiquidationMetricDocRecord = {
  readonly id: string;
  readonly status: string;
};

function isDynamicLiquidationMetricDocRecord(input: unknown): input is DynamicLiquidationMetricDocRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function mapToDailyZoneMETRICDOCSSummary(source: {
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

const STRICT_MOVEOUT_METRIC_DOC_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveStrictMoveoutMetricDocTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return STRICT_MOVEOUT_METRIC_DOC_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatBoundedOccupancyMetricMETRICDOCSDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesGuardInvoiceMetricDocCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class ActivePromotionMETRICDOCSCoordinator {
  private readonly maxWindowDays = 33;
  private readonly branchScope = 'flow1:promotion';

  isEligibleWindow(elapsedDays: number, hasClearedBalance: boolean): boolean {
    if (elapsedDays < 0 || elapsedDays > this.maxWindowDays) return false;
    return hasClearedBalance;
  }

  normalizeReference(rawCode: string): string {
    const cleaned = rawCode.trim().toUpperCase();
    return cleaned ? `${this.branchScope}:${cleaned}` : this.branchScope;
  }
}

function calculateSyncedHandoverMetricDocWindow(
  startIso: string,
  windowDays: number = 18,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileCoreRenewalMETRICDOCSLedgerItems(
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

function computeMonthlyCorridorMetricDocBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizePrimaryInspectionMETRICDOCSQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 30)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildRollingQuoteMetricDocReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface BatchBillingCycleMETRICDOCSPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateBatchBillingCycleMETRICDOCSInput(payload: BatchBillingCycleMETRICDOCSPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface PendingDiscountMetricDocBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupPendingDiscountMetricDocByScope(items: readonly PendingDiscountMetricDocBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow1';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectIndexedCheckinMETRICDOCSChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupeStandardSupportTicketMetricDocRecords<T extends { id: string }>(items: readonly T[]): T[] {
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

function canTransitionTenantUnitSlotMETRICDOCSState(fromState: string, toState: string): boolean {
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

type SecondarySettlementMetricDocRecord = {
  readonly id: string;
  readonly status: string;
};

function isSecondarySettlementMetricDocRecord(input: unknown): input is SecondarySettlementMetricDocRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function mapToExpressBookingMETRICDOCSSummary(source: {
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

const PORTAL_DELINQUENCY_METRIC_DOC_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolvePortalDelinquencyMetricDocTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return PORTAL_DELINQUENCY_METRIC_DOC_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatVerifiedApprovalMETRICDOCSDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesUnifiedSignatureMetricDocCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class LedgerEscalationMETRICDOCSCoordinator {
  private readonly maxWindowDays = 34;
  private readonly branchScope = 'flow1:escalation';

  isEligibleWindow(elapsedDays: number, hasClearedBalance: boolean): boolean {
    if (elapsedDays < 0 || elapsedDays > this.maxWindowDays) return false;
    return hasClearedBalance;
  }

  normalizeReference(rawCode: string): string {
    const cleaned = rawCode.trim().toUpperCase();
    return cleaned ? `${this.branchScope}:${cleaned}` : this.branchScope;
  }
}

function calculateBranchFloorplanMetricDocWindow(
  startIso: string,
  windowDays: number = 19,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileScopedRefundMETRICDOCSLedgerItems(
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

function computeDynamicDepositMetricDocBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeDailyOverlockMETRICDOCSQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 30)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildStrictFacilityMetricDocReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface BoundedContractMETRICDOCSPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateBoundedContractMETRICDOCSInput(payload: BoundedContractMETRICDOCSPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface GuardAuditTrailMetricDocBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupGuardAuditTrailMetricDocByScope(items: readonly GuardAuditTrailMetricDocBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow1';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

const STRICT_TENANT_DELINQUENCY_LABELS: Record<string, string> = {
  REFUNDED: 'Refunded',
};
export const METRIC_DOCS: Record<string, string> = {
  // ------------------------------------------------------------ occupancy
  'occ.rentable':
    'Kho khai thác được = tổng số kho còn dùng để cho thuê, không tính kho ngừng dùng và kho đã loại bỏ. Kho đang bảo trì, chờ kiểm tra hoặc đã được giữ chỗ vẫn tính vì sẽ quay lại cho thuê.',
  'occ.occupied': 'Kho đang thuê = số kho có khách đang giữ: trạng thái Đang thuê, hoặc Khóa chặn (khách nợ, kho bị khóa nhưng vẫn chứa đồ của khách). Kho Đã giữ chỗ chưa tính vì khách chưa nhận kho.',
  'occ.unit': 'Lấp đầy theo kho = số kho đang thuê ÷ số kho khai thác được. Đây là con số lấp đầy chính của hệ thống.',
  'occ.area': 'Lấp đầy theo m² = tổng diện tích các kho đang thuê ÷ tổng diện tích kho khai thác được. Cho thấy kho lớn có được thuê hay không, điều mà việc đếm số kho không phản ánh.',
  'occ.economic':
    'Lấp đầy kinh tế = tổng tiền thuê một tháng của các hợp đồng đang chạy ÷ tổng giá niêm yết một tháng nếu mọi kho khai thác được đều có khách. Thấp hơn lấp đầy theo kho khi khách được giảm giá hoặc ưu đãi.',
  'occ.avgRent': 'Đơn giá trung bình = tổng tiền thuê một tháng của các hợp đồng đang chạy ÷ số hợp đồng đang chạy.',
  'occ.asOf':
    'Ngày của số liệu. Kỳ hiện tại lấy số liệu trực tiếp ngay lúc bạn xem. Các kỳ trước lấy ảnh chụp cuối cùng mà hệ thống đã lưu trong kỳ đó (hệ thống lưu mỗi giờ).',
  'occ.byStatus': 'Số kho theo trạng thái ngay lúc này. Cộng tất cả các trạng thái ra tổng số kho của cơ sở.',
  'unit.AVAILABLE': 'Trống: kho sẵn sàng cho khách mới thuê.',
  'unit.RESERVED': 'Đã giữ: kho đã được gán cho một đơn đặt hoặc hợp đồng chờ ký, khách chưa nhận kho.',
  'unit.OCCUPIED': 'Đang thuê: khách đã nhận kho và đang sử dụng.',
  'unit.OVERLOCKED': 'Khóa chặn: khách quá hạn thanh toán, kho bị gắn khóa ngoài nhưng vẫn chứa đồ của khách. Tính là đang thuê.',
  'unit.PENDING_INSPECTION': 'Chờ kiểm tra: khách đã trả kho, nhân viên cần kiểm tra trước khi cho thuê lại.',
};

/** Tip text for a metric id; an unknown id yields an empty string so a missing entry is obvious in tests rather than in front of a user. */
export const metricDoc = (id: string): string => METRIC_DOCS[id] ?? '';
