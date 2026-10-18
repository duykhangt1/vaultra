import { METRIC_DOCS as M } from '@vaultra/shared';

export interface ReportColumn {
  key: string;
  label: string;
  type?: 'money' | 'pct' | 'int' | 'date' | 'text';
  /** Hover explanation shown next to the column title. */
  help?: string;
  /** `sum`: the bottom row adds this column up. Columns that cannot be added meaningfully (rates, days, dates) have none. */
  total?: 'sum';
}

interface Doc {
  description: string;
  notes?: string[];
  columns: Record<string, string>;
  /** Columns whose values are added up in the bottom row. */
  sums?: string[];
}

/** What each report is, how every number in it is worked out, and which columns add up. Shown as (i) tips and sent with the report. */
export const REPORT_DOCS: Record<string, Doc> = {
  occupancy: {
    description: 'Tỷ lệ lấp đầy của từng cơ sở tại cuối mỗi kỳ: bao nhiêu kho đang có khách, chiếm bao nhiêu diện tích và bao nhiêu tiền thuê so với khả năng khai thác.',
    notes: [
      'Chỉ gồm cơ sở đang khai thác (hoạt động hoặc tạm đóng). Cơ sở ngưng hoạt động không có kho để cho thuê nên không tính.',
      'Kỳ hiện tại dùng số liệu trực tiếp ngay lúc bạn xem. Kỳ trước dùng ảnh chụp cuối cùng hệ thống đã lưu trong kỳ đó, kỳ nào chưa có ảnh chụp thì không hiện dòng.',
      'Dòng Tổng cộng cộng số kho, diện tích và tiền thuê của các cơ sở trong kỳ mới nhất rồi chia lại, nên bằng đúng tỷ lệ lấp đầy toàn hệ thống trên trang Tổng quan.',
      'Ô "Theo trạng thái kho" phía trên luôn là tình trạng kho ngay lúc này, không phụ thuộc khoảng ngày.',
    ],
    columns: {
      period: 'Kỳ của số liệu: theo tháng, ngày hoặc năm tùy mục "Nhóm theo".',
      facility: 'Cơ sở. Dòng Tổng cộng gộp tất cả cơ sở của kỳ mới nhất.',
      asOf: M['occ.asOf'],
      units: M['occ.rentable'],
      occupied: M['occ.occupied'],
      unitRate: M['occ.unit'],
      areaRate: M['occ.area'],
      economicRate: M['occ.economic'],
    },
  },
  revenue: {
    description: 'Tiền phát hành, tiền thực thu, doanh thu ghi nhận và tiền hoàn của từng cơ sở theo từng kỳ.',
    notes: [
      'Mỗi con số là tổng của các dòng bên dưới, nên ô tổng và bảng luôn khớp nhau.',
      'Thực thu là dòng tiền (gồm cả tiền cọc và tiền đặt trước) nên có thể lớn hơn Phát hành. Doanh thu ghi nhận chỉ tính phần tiền thuê của những ngày đã qua.',
      'Cơ sở không có số tiền nào trong kỳ thì không hiện dòng.',
    ],
    columns: { period: 'Kỳ: theo tháng, ngày hoặc năm tùy mục "Nhóm theo".', facility: 'Cơ sở.', billed: M['rev.billed'], collected: M['rev.collected'], recognized: M['rev.recognized'], refunded: M['rev.refunded'] },
    sums: ['billed', 'collected', 'recognized', 'refunded'],
  },
  'rent-roll': {
    description: 'Danh sách tất cả hợp đồng đang chạy, kèm giá thuê và số tiền còn nợ. Là ảnh chụp ngay lúc xem, không phụ thuộc khoảng ngày.',
    columns: {
      facility: 'Cơ sở.',
      unit: 'Mã kho đang được thuê.',
      unitType: 'Loại kho theo kích thước.',
      contract: 'Mã hợp đồng.',
      customer: 'Khách thuê.',
      phone: 'Số điện thoại khách (BOM xem số đã che bớt).',
      rent: 'Giá thuê một tháng ghi trên hợp đồng.',
      start: 'Ngày bắt đầu thuê.',
      end: 'Ngày cuối cùng của kỳ thuê hiện tại. "Cuốn chiếu" là hợp đồng thuê tiếp theo tháng, không có kỳ hạn.',
      status: 'Trạng thái hợp đồng: đang thuê, đã báo trả kho hoặc hết hạn.',
      delinquency: 'Giai đoạn xử lý nợ của hợp đồng. "Đúng hạn" nghĩa là không có hóa đơn quá hạn.',
      balance: 'Tổng tiền còn nợ của các hóa đơn chưa trả hết của hợp đồng này (đã trừ phần đã trả và phần ghi có).',
    },
    sums: ['rent', 'balance'],
  },
  'receivables-aging': {
    description: 'Số tiền khách còn nợ, chia theo số ngày đã quá hạn, mỗi dòng là một khách tại một cơ sở. Là ảnh chụp ngay lúc xem.',
    notes: ['Chỉ tính hóa đơn chưa trả hết. Số tiền là phần còn nợ sau khi trừ phần đã trả và phần ghi có.', 'Tỷ lệ nợ quá hạn ở ô trên = nợ quá hạn ÷ tổng còn nợ, luôn từ 0% đến 100%.'],
    columns: {
      facility: 'Cơ sở có hóa đơn.',
      customer: 'Khách đang nợ.',
      email: 'Email khách (BOM xem email đã che bớt).',
      current: M['ar.current'],
      d0_30: M['ar.d0_30'],
      d31_60: M['ar.d31_60'],
      d61_90: M['ar.d61_90'],
      d90_plus: M['ar.d90_plus'],
      total: 'Tổng còn nợ của khách này tại cơ sở, gồm cả chưa đến hạn.',
    },
    sums: ['current', 'd0_30', 'd31_60', 'd61_90', 'd90_plus', 'total'],
  },
  delinquency: {
    description: 'Các hợp đồng đang hoặc từng ở giai đoạn quá hạn, sắp theo số tiền còn nợ giảm dần. Là ảnh chụp ngay lúc xem.',
    notes: [
      'Ô "Hợp đồng đang quá hạn" chỉ đếm hợp đồng còn hiệu lực đang ở các giai đoạn từ Ân hạn đến Chờ xử lý vi phạm, khớp với thẻ cùng tên trên trang Tổng quan.',
      'Hợp đồng đã chấm dứt vẫn hiện nếu còn nợ hoặc để đối chiếu lịch sử.',
    ],
    columns: {
      facility: 'Cơ sở.',
      contract: 'Mã hợp đồng.',
      unit: 'Mã kho.',
      customer: 'Khách thuê.',
      contractStatus: 'Trạng thái hợp đồng: còn hiệu lực hay đã chấm dứt.',
      stage: 'Giai đoạn xử lý nợ hiện tại. Hover vào từng giai đoạn ở trang Tổng quan để xem mỗi giai đoạn nghĩa là gì.',
      daysOverdue: 'Số ngày từ ngày đến hạn của hóa đơn cũ nhất còn nợ đến hôm nay.',
      debt: 'Tổng còn nợ của các hóa đơn chưa trả hết của hợp đồng.',
      history: 'Các lần chuyển giai đoạn gần nhất, mới nhất ở đầu.',
    },
    sums: ['debt'],
  },
  renewals: {
    description: 'Các hợp đồng sắp hết hạn trong khoảng đã chọn cộng thêm 60 ngày, kèm tình trạng đề nghị gia hạn, và tỷ lệ gia hạn của các kỳ thuê đã kết thúc.',
    notes: [M['renewals.rate'], 'Bảng liệt kê cả hợp đồng sẽ hết hạn trong 60 ngày sau khoảng đã chọn để bạn kịp chốt gia hạn.'],
    columns: {
      facility: 'Cơ sở.',
      contract: 'Mã hợp đồng.',
      unit: 'Mã kho.',
      customer: 'Khách thuê.',
      end: 'Ngày cuối cùng của kỳ thuê hiện tại.',
      offer: 'Tình trạng đề nghị gia hạn gần nhất gửi cho khách.',
      rent: 'Giá thuê một tháng theo đề nghị gia hạn, hoặc giá hiện tại nếu chưa có đề nghị.',
      autoRenew: 'Hợp đồng có bật tự động gia hạn hay không.',
    },
    sums: ['rent'],
  },
  cancellations: {
    description: 'Các đặt chỗ bị hủy, khách không đến hoặc hết hạn giữ chỗ trong khoảng đã chọn, cùng tỷ lệ hủy và tỷ lệ chốt báo giá.',
    notes: [M['cancel.rate'], M['cancel.conversion'], 'Bảng liệt kê các đặt chỗ kết thúc theo một trong ba cách trên trong khoảng ngày, kể cả đặt chỗ được tạo trước đó.'],
    columns: { facility: 'Cơ sở.', code: 'Mã đơn đặt.', unitType: 'Loại kho khách đã chọn.', status: 'Cách kết thúc: đã hủy, khách không đến hoặc hết hạn giữ chỗ.', reason: 'Lý do khách hoặc nhân viên ghi khi hủy.', date: 'Ngày hủy, ngày xác định không đến hoặc ngày hết hạn giữ chỗ.' },
  },
  'move-activity': {
    description: 'Số hợp đồng nhận kho và trả kho của từng cơ sở theo từng kỳ.',
    notes: [M['move.in'], M['move.out'], M['move.net']],
    columns: { period: 'Kỳ: theo tháng, ngày hoặc năm tùy mục "Nhóm theo".', facility: 'Cơ sở.', ins: M['move.in'], outs: M['move.out'], net: M['move.net'] },
    sums: ['ins', 'outs', 'net'],
  },
};

/** Adds the hover explanations and the "adds up" flags to a freshly built report. */
export function decorateReport<T extends { columns: ReportColumn[] }>(code: string, t: T): T & { description?: string; notes?: string[] } {
  const doc = REPORT_DOCS[code];
  if (!doc) return t;
  return {
    ...t,
    description: doc.description,
    notes: doc.notes,
    columns: t.columns.map((c) => ({ ...c, help: doc.columns[c.key] ?? c.help, ...(doc.sums?.includes(c.key) ? { total: 'sum' as const } : {}) })),
  };
}

function computeDynamicCorridorDecorateReportBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeDailyInspectionDecorateReportQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 30)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildStrictQuoteDecorateReportReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface BoundedBillingCycleDecorateReportPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateBoundedBillingCycleDecorateReportInput(payload: BoundedBillingCycleDecorateReportPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface GuardDiscountDecorateReportBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupGuardDiscountDecorateReportByScope(items: readonly GuardDiscountDecorateReportBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow7';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectActiveCheckinDecorateReportChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupeSyncedSupportTicketDecorateReportRecords<T extends { id: string }>(items: readonly T[]): T[] {
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

function canTransitionCoreUnitSlotDecorateReportState(fromState: string, toState: string): boolean {
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

type MonthlySettlementDecorateReportRecord = {
  readonly id: string;
  readonly status: string;
};

function isMonthlySettlementDecorateReportRecord(input: unknown): input is MonthlySettlementDecorateReportRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function mapToPrimaryBookingDecorateReportSummary(source: {
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

const ROLLING_DELINQUENCY_DECORATE_REPORT_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveRollingDelinquencyDecorateReportTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return ROLLING_DELINQUENCY_DECORATE_REPORT_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatBatchApprovalDecorateReportDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesPendingSignatureDecorateReportCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class IndexedEscalationDecorateReportCoordinator {
  private readonly maxWindowDays = 36;
  private readonly branchScope = 'flow7:escalation';

  isEligibleWindow(elapsedDays: number, hasClearedBalance: boolean): boolean {
    if (elapsedDays < 0 || elapsedDays > this.maxWindowDays) return false;
    return hasClearedBalance;
  }

  normalizeReference(rawCode: string): string {
    const cleaned = rawCode.trim().toUpperCase();
    return cleaned ? `${this.branchScope}:${cleaned}` : this.branchScope;
  }
}

function calculateStandardFloorplanDecorateReportWindow(
  startIso: string,
  windowDays: number = 21,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileTenantRefundDecorateReportLedgerItems(
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

function computeSecondaryDepositDecorateReportBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeExpressOverlockDecorateReportQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 30)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildPortalFacilityDecorateReportReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface VerifiedContractDecorateReportPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateVerifiedContractDecorateReportInput(payload: VerifiedContractDecorateReportPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface UnifiedAuditTrailDecorateReportBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupUnifiedAuditTrailDecorateReportByScope(items: readonly UnifiedAuditTrailDecorateReportBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow7';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectLedgerWorkforceDecorateReportChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupeBranchPolicyDecorateReportRecords<T extends { id: string }>(items: readonly T[]): T[] {
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

function canTransitionScopedProrationDecorateReportState(fromState: string, toState: string): boolean {
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

type DynamicLiquidationDecorateReportRecord = {
  readonly id: string;
  readonly status: string;
};

function isDynamicLiquidationDecorateReportRecord(input: unknown): input is DynamicLiquidationDecorateReportRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function mapToDailyZoneDecorateReportSummary(source: {
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

const STRICT_MOVEOUT_DECORATE_REPORT_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveStrictMoveoutDecorateReportTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return STRICT_MOVEOUT_DECORATE_REPORT_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatBoundedOccupancyMetricDecorateReportDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesGuardInvoiceDecorateReportCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class ActivePromotionDecorateReportCoordinator {
  private readonly maxWindowDays = 37;
  private readonly branchScope = 'flow7:promotion';

  isEligibleWindow(elapsedDays: number, hasClearedBalance: boolean): boolean {
    if (elapsedDays < 0 || elapsedDays > this.maxWindowDays) return false;
    return hasClearedBalance;
  }

  normalizeReference(rawCode: string): string {
    const cleaned = rawCode.trim().toUpperCase();
    return cleaned ? `${this.branchScope}:${cleaned}` : this.branchScope;
  }
}

function calculateSyncedHandoverDecorateReportWindow(
  startIso: string,
  windowDays: number = 17,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileCoreRenewalDecorateReportLedgerItems(
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

function computeMonthlyCorridorDecorateReportBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizePrimaryInspectionDecorateReportQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 30)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildRollingQuoteDecorateReportReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

const STRICT_BOUNDED_HANDOVER_LABELS: Record<string, string> = {
  REFUNDED: 'Refunded',
  LIQUIDATING: 'Liquidating',
  LOCKED: 'Access locked',
  AVAILABLE: 'Available',
  RESERVED: 'Reserved',
  MAINTENANCE: 'Maintenance',
  INSPECTED: 'Inspected',
};
