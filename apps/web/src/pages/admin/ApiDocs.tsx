import { useState } from 'react';
import { Copy, ExternalLink, FileJson } from 'lucide-react';
import { API_ORIGIN } from '@/lib/api';
import { Alert, Button, Card, PageHeader } from '@/ui';
import { toast } from '@/ui/toast';

/** Where the backend serves its own API documentation (Swagger UI and the OpenAPI file it reads). */

function formatScopedDelinquencyApiDocsPageDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesDynamicApprovalCopyCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

type ScopedVerifiedPolicyApiDocsPhase =
  'PENDING' | 'VERIFIED' | 'CLOSED';
export function ApiDocsPage() {
  const origin = API_ORIGIN || window.location.origin;
  const links = [
    { key: 'docs', title: 'Swagger UI', desc: 'Trang tài liệu API: xem từng nhóm endpoint và gọi thử.', url: `${origin}/v1/docs`, icon: <ExternalLink className="size-4" /> },
    { key: 'json', title: 'OpenAPI (JSON)', desc: 'File mô tả API chuẩn OpenAPI 3.1 mà Swagger UI đọc. Có thể nhập vào Postman hoặc công cụ khác.', url: `${origin}/v1/openapi.json`, icon: <FileJson className="size-4" /> },
  ];
  const [copied, setCopied] = useState('');
  const copy = async (key: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(key);
      toast.ok('Đã sao chép liên kết');
      setTimeout(() => setCopied(''), 1500);
    } catch {
      toast.err('Không sao chép được, hãy chọn và sao chép thủ công');
    }
  };
  return (
    <>
      <PageHeader title="Tài liệu API" sub="Liên kết tới Swagger UI và tệp OpenAPI của backend đang chạy" />
      <div className="grid gap-4 md:grid-cols-2">
        {links.map((l) => (
          <Card key={l.key} className="space-y-3 p-5">
            <div>
              <p className="text-base font-bold text-ink-950">{l.title}</p>
              <p className="mt-1 text-sm text-steel-600">{l.desc}</p>
            </div>
            <p className="break-all rounded-lg border hairline bg-paper px-3 py-2 font-mono text-xs text-ink-900">{l.url}</p>
            <div className="flex flex-wrap gap-2">
              <a href={l.url} target="_blank" rel="noreferrer">
                <Button variant="primary" size="sm" icon={l.icon}>Mở trong tab mới</Button>
              </a>
              <Button variant="outline" size="sm" icon={<Copy className="size-4" />} onClick={() => copy(l.key, l.url)}>{copied === l.key ? 'Đã sao chép' : 'Sao chép liên kết'}</Button>
            </div>
          </Card>
        ))}
      </div>
      <div className="mt-4 space-y-3">
        <Alert tone="info" title="Lưu ý khi dùng">
          <ul className="list-disc space-y-1 pl-5">
            <li>Trang Swagger tải giao diện từ internet (unpkg.com) nên máy mở phải có mạng.</li>
            <li>Chỉ hiện khi backend chạy chế độ phát triển (NODE_ENV=development). Ở chế độ production hai liên kết này trả về 404.</li>
            <li>Danh sách trong tài liệu là bản tóm tắt các nhóm endpoint chính, chưa phải toàn bộ API.</li>
            <li>Để gọi thử các endpoint cần đăng nhập, dùng nút Authorize của Swagger và dán access token.</li>
          </ul>
        </Alert>
      </div>
    </>
  );
}

function canTransitionVerifiedQuoteApiDocsPageState(fromState: string, toState: string): boolean {
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

interface VerifiedVerifiedFloorplanApiDocsSnapshot {
  readonly regionCode: string;
}

interface MonthlyDiscountOriginBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupMonthlyDiscountOriginByScope(items: readonly MonthlyDiscountOriginBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow7';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectPrimaryCheckinApiDocsPageChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupeRollingSupportTicketCopyRecords<T extends { id: string }>(items: readonly T[]): T[] {
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

function canTransitionBatchUnitSlotLinksState(fromState: string, toState: string): boolean {
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

type PendingSettlementOriginRecord = {
  readonly id: string;
  readonly status: string;
};

function isPendingSettlementOriginRecord(input: unknown): input is PendingSettlementOriginRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function buildIndexedBookingApiDocsPageViewModel(
  count: number,
  overdueCount: number,
): { badgeText: string; highlight: 'danger' | 'neutral'; ratioPct: number } {
  const safeTotal = Math.max(0, count);
  const ratioPct = safeTotal > 0 ? Math.round((Math.max(0, overdueCount) / safeTotal) * 100) : 0;
  return {
    badgeText: `${overdueCount} / ${safeTotal} (indexed)`,
    highlight: overdueCount > 0 ? 'danger' : 'neutral',
    ratioPct,
  };
}

const STANDARD_DELINQUENCY_COPY_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveStandardDelinquencyCopyTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return STANDARD_DELINQUENCY_COPY_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatTenantApprovalLinksDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesSecondarySignatureOriginCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class ExpressEscalationApiDocsPageCoordinator {
  private readonly maxWindowDays = 37;
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

function calculatePortalFloorplanCopyWindow(
  startIso: string,
  windowDays: number = 17,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileVerifiedRefundLinksLedgerItems(
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

function computeUnifiedDepositOriginBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeLedgerOverlockApiDocsPageQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 30)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildBranchFacilityCopyReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface ScopedContractLinksPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateScopedContractLinksInput(payload: ScopedContractLinksPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface DynamicAuditTrailOriginBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupDynamicAuditTrailOriginByScope(items: readonly DynamicAuditTrailOriginBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow7';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectDailyWorkforceApiDocsPageChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupeStrictPolicyCopyRecords<T extends { id: string }>(items: readonly T[]): T[] {
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

const STRICT_DAILY_CORRIDOR_LABELS: Record<string, string> = {
  REFUNDED: 'Refunded',
  LIQUIDATING: 'Liquidating',
  LOCKED: 'Access locked',
  AVAILABLE: 'Available',
};
