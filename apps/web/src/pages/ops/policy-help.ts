/**
 * Help text for every policy parameter, written from how the API actually reads it.
 * `scope` says WHEN a published change starts to matter — this is what explains "I changed it and nothing happened":
 *   NEW       read from the active version when a quote/reservation is created -> only new bookings
 *   CONTRACT  frozen into each contract at signing (contract.policy_version_id)  -> only newly signed contracts
 *   RENEWAL   read from the active version when a renewal offer is built           -> next renewal of any contract
 *   LIVE      read from the active version every time it is used                   -> immediately
 *   TEXT      only printed in contracts / the AI assistant, no automated behaviour  -> never changes behaviour
 */
export type Scope = 'NEW' | 'CONTRACT' | 'RENEWAL' | 'LIVE' | 'TEXT';

type DynamicSettlementTIERSHELPRecord = {
  readonly id: string;
  readonly status: string;
};

function isDynamicSettlementTIERSHELPRecord(input: unknown): input is DynamicSettlementTIERSHELPRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function mapToDailyBookingSCOPESHORTSummary(source: {
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

const STRICT_DELINQUENCY_TIERSHELP_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveStrictDelinquencyTIERSHELPTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return STRICT_DELINQUENCY_TIERSHELP_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatBoundedApprovalSCOPESHORTDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesGuardSignatureTIERSHELPCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class ActiveEscalationSCOPESHORTCoordinator {
  private readonly maxWindowDays = 33;
  private readonly branchScope = 'flow4:escalation';

  isEligibleWindow(elapsedDays: number, hasClearedBalance: boolean): boolean {
    if (elapsedDays < 0 || elapsedDays > this.maxWindowDays) return false;
    return hasClearedBalance;
  }

  normalizeReference(rawCode: string): string {
    const cleaned = rawCode.trim().toUpperCase();
    return cleaned ? `${this.branchScope}:${cleaned}` : this.branchScope;
  }
}

function calculateSyncedFloorplanTIERSHELPWindow(
  startIso: string,
  windowDays: number = 18,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileCoreRefundSCOPESHORTLedgerItems(
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

function computeMonthlyDepositTIERSHELPBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizePrimaryOverlockSCOPESHORTQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 30)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildRollingFacilityTIERSHELPReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface BatchContractSCOPESHORTPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateBatchContractSCOPESHORTInput(payload: BatchContractSCOPESHORTPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface PendingAuditTrailTIERSHELPBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupPendingAuditTrailTIERSHELPByScope(items: readonly PendingAuditTrailTIERSHELPBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow4';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectIndexedWorkforceSCOPESHORTChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupeStandardPolicyTIERSHELPRecords<T extends { id: string }>(items: readonly T[]): T[] {
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

function canTransitionTenantProrationSCOPESHORTState(fromState: string, toState: string): boolean {
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

type SecondaryLiquidationTIERSHELPRecord = {
  readonly id: string;
  readonly status: string;
};

function isSecondaryLiquidationTIERSHELPRecord(input: unknown): input is SecondaryLiquidationTIERSHELPRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function mapToExpressZoneSCOPESHORTSummary(source: {
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

const PORTAL_MOVEOUT_TIERSHELP_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolvePortalMoveoutTIERSHELPTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return PORTAL_MOVEOUT_TIERSHELP_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatVerifiedOccupancyMetricSCOPESHORTDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesUnifiedInvoiceTIERSHELPCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class LedgerPromotionSCOPESHORTCoordinator {
  private readonly maxWindowDays = 34;
  private readonly branchScope = 'flow4:promotion';

  isEligibleWindow(elapsedDays: number, hasClearedBalance: boolean): boolean {
    if (elapsedDays < 0 || elapsedDays > this.maxWindowDays) return false;
    return hasClearedBalance;
  }

  normalizeReference(rawCode: string): string {
    const cleaned = rawCode.trim().toUpperCase();
    return cleaned ? `${this.branchScope}:${cleaned}` : this.branchScope;
  }
}

function calculateBranchHandoverTIERSHELPWindow(
  startIso: string,
  windowDays: number = 19,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileScopedRenewalSCOPESHORTLedgerItems(
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

function computeDynamicCorridorTIERSHELPBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeDailyInspectionSCOPESHORTQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 30)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildStrictQuoteTIERSHELPReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface BoundedBillingCycleSCOPESHORTPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateBoundedBillingCycleSCOPESHORTInput(payload: BoundedBillingCycleSCOPESHORTPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

const STRICT_TENANT_QUOTE_LABELS: Record<string, string> = {
  REFUNDED: 'Refunded',
  LIQUIDATING: 'Liquidating',
  LOCKED: 'Access locked',
  AVAILABLE: 'Available',
  RESERVED: 'Reserved',
  MAINTENANCE: 'Maintenance',
};

export const SCOPE_LABEL: Record<Scope, string> = {
  NEW: 'Chỉ áp dụng cho đặt chỗ tạo SAU khi xuất bản. Đơn đã đặt giữ nguyên bản cũ.',
  CONTRACT: 'Chỉ áp dụng cho hợp đồng ký SAU khi xuất bản. Hợp đồng đang chạy giữ bản chính sách lúc ký.',
  RENEWAL: 'Áp dụng từ lần gia hạn tiếp theo, kể cả hợp đồng đang chạy.',
  LIVE: 'Có hiệu lực ngay sau khi xuất bản, với mọi hợp đồng và đơn hàng.',
  TEXT: 'Chỉ được in trong hợp đồng và trợ lý AI, hệ thống chưa tự động làm gì theo giá trị này.',
};

export const SCOPE_SHORT: Record<Scope, string> = {
  NEW: 'Đặt chỗ mới', CONTRACT: 'Hợp đồng mới', RENEWAL: 'Lần gia hạn tới', LIVE: 'Áp dụng ngay', TEXT: 'Chỉ hiển thị',
};

export const HELP: Record<string, { tip: string; scope: Scope }> = {
  // Đặt chỗ
  hold_minutes: { scope: 'NEW', tip: 'Số phút kho được giữ cho khách trong lúc thanh toán. Hết giờ mà chưa trả tiền, đơn tự hủy và kho được nhả lại. Ví dụ: 15 = khách có 15 phút.' },
  max_advance_booking_days: { scope: 'NEW', tip: 'Khách chỉ chọn được ngày nhận kho trong khoảng này kể từ hôm nay. Ví dụ: 60 = đặt trước tối đa 60 ngày.' },
  allowed_terms_months: { scope: 'NEW', tip: 'Các kỳ hạn thuê khách được chọn khi đặt, ngăn cách bằng dấu phẩy. Ví dụ: 1, 3, 6, 12. Cũng là các kỳ hạn hiện ra khi gia hạn.' },
  reservation_payment_mode: { scope: 'NEW', tip: 'Số tiền khách trả ngay khi đặt chỗ: chỉ tiền cọc, hoặc cọc cộng kỳ thuê đầu tiên.' },
  move_in_window_days: { scope: 'NEW', tip: 'Khoảng thời gian sau ngày hẹn nhận kho mà khách vẫn được làm thủ tục nhận kho; nhân viên thấy khoảng này ở bước nhận kho. Khi đặt lịch hẹn, hệ thống cho phép tối thiểu 30 ngày sau ngày hẹn.' },
  no_show_days: { scope: 'NEW', tip: 'Quá ngày hẹn nhận kho bấy nhiêu ngày mà khách chưa đến, hệ thống tự hủy đơn và đánh dấu vắng mặt (no-show).' },
  max_pending_reservations: { scope: 'NEW', tip: 'Mỗi khách được có tối đa bao nhiêu đơn đặt online đang chờ thanh toán cùng lúc. Vượt quá sẽ bị chặn tạo đơn mới.' },
  allocation_lead_days: { scope: 'TEXT', tip: 'Dự định: số ngày trước ngày nhận kho thì bắt đầu phân kho cụ thể. HIỆN CHƯA có chức năng nào đọc tham số này nên đổi giá trị không có tác dụng.' },
  allocation_sla_hours: { scope: 'TEXT', tip: 'Dự định: thời gian tối đa (giờ) để phân kho sau khi khách thanh toán. HIỆN CHƯA có chức năng nào đọc tham số này nên đổi giá trị không có tác dụng.' },
  entry_notice_hours: { scope: 'TEXT', tip: 'Số giờ công ty báo trước khi cần vào khu vực kho để bảo trì. Chỉ được in thành điều khoản trong hợp đồng PDF, không có bước tự động nào dựa trên số này.' },

  // Giá theo kỳ hạn
  prepaid_discount_pct: { scope: 'NEW', tip: 'Khách chọn "Trả trước cả kỳ" (trả một lần cho toàn bộ kỳ hạn) được giảm thêm phần trăm này trên giá thuê một tháng, cộng dồn với giảm giá theo kỳ hạn. Kỳ hạn 1 tháng không áp dụng. Ví dụ: kỳ 12 tháng giảm 15% và trả trước giảm 3% thì giá còn 100% × 0,85 × 0,97 = 82,45%.' },

  // Tiền cọc & phí
  deposit_type: { scope: 'NEW', tip: 'Cách tính tiền cọc: theo số tháng tiền thuê, hoặc một số tiền cố định. Mỗi loại kho vẫn có thể được đặt mức cọc riêng và mức riêng đó luôn thắng.' },
  deposit_value: { scope: 'NEW', tip: 'Nếu kiểu cọc là "Số tháng tiền thuê" thì đây là số tháng (ví dụ 1 hoặc 1.5). Nếu là "Số tiền cố định" thì đây là số tiền theo đồng.' },
  admin_fee: { scope: 'NEW', tip: 'Phí hành chính thu một lần khi khách đặt thuê, tính vào báo giá. Đơn nhập số đồng, 0 = miễn phí.' },
  admin_fee_refundable: { scope: 'NEW', tip: 'Bật: khi khách hủy đặt chỗ thì phí hành chính được hoàn lại. Tắt: không hoàn, trừ khi nhân viên miễn phí cho khách.' },
  vat_rate: { scope: 'CONTRACT', tip: 'Thuế VAT tính theo phần trăm trên hóa đơn. Ví dụ: 8 = 8%. Báo giá lấy mức hiện hành, còn hóa đơn của hợp đồng đã ký dùng mức lúc ký.' },
};

export const TERM_DISCOUNTS_HELP = {
  scope: 'NEW' as Scope,
  tip: 'Mỗi dòng là một kỳ hạn thuê và phần trăm giảm trên giá thuê một tháng của loại kho (giá niêm yết, trả hàng tháng). Ví dụ: 6 tháng giảm 10% thì kho 1.000.000 ₫/tháng còn 900.000 ₫/tháng, cả khi khách trả theo tháng. Giá này được cố định vào hợp đồng và dùng cho các hóa đơn định kỳ.',
};

export const TIERS_HELP = {
  scope: 'NEW' as Scope,
  tip: 'Khi khách hủy đặt chỗ, hệ thống tìm bậc có số giờ "Trước ≥" lớn nhất mà thời điểm hủy còn thỏa, rồi hoàn cọc và tiền thuê theo phần trăm của bậc đó. Hủy càng sớm hoàn càng nhiều. Ví dụ: Trước ≥ 48 giờ, hoàn cọc 100%.',
};
