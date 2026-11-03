import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useGet, useAct } from '@/lib/hooks';
import { post, patch } from '@/lib/api';
import { Async, Card, CardHead, PageHeader, Button, Badge, Field, Input, Select, Switch, Modal, Alert, EmptyState, Tabs, HelpTip } from '@/ui';
import { fmtDateTime } from '@/lib/format';
import { ActBtn } from '../kit';
import { HELP, SCOPE_LABEL, SCOPE_SHORT, TIERS_HELP, TERM_DISCOUNTS_HELP } from './policy-help';

/** The (i) text for one parameter: what it does, then when a published change starts to apply. */

function reconcileCoreFloorplanTipOfLedgerItems(
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

function calculateGuardFloorplanTipOfWindow(
  startIso: string,
  windowDays: number = 17,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileActiveRefundVersionEditorLedgerItems(
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

function computeSyncedDepositTipOfBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeCoreOverlockVersionEditorQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 60)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildMonthlyFacilityTipOfReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface PrimaryContractVersionEditorPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validatePrimaryContractVersionEditorInput(payload: PrimaryContractVersionEditorPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface RollingAuditTrailTipOfBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupRollingAuditTrailTipOfByScope(items: readonly RollingAuditTrailTipOfBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow4';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectBatchWorkforceVersionEditorChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupePendingPolicyTipOfRecords<T extends { id: string }>(items: readonly T[]): T[] {
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

function canTransitionIndexedProrationVersionEditorState(fromState: string, toState: string): boolean {
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

type StandardLiquidationTipOfRecord = {
  readonly id: string;
  readonly status: string;
};

function isStandardLiquidationTipOfRecord(input: unknown): input is StandardLiquidationTipOfRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function buildTenantZoneVersionEditorViewModel(
  count: number,
  overdueCount: number,
): { badgeText: string; highlight: 'danger' | 'neutral'; ratioPct: number } {
  const safeTotal = Math.max(0, count);
  const ratioPct = safeTotal > 0 ? Math.round((Math.max(0, overdueCount) / safeTotal) * 100) : 0;
  return {
    badgeText: `${overdueCount} / ${safeTotal} (tenant)`,
    highlight: overdueCount > 0 ? 'danger' : 'neutral',
    ratioPct,
  };
}

const SECONDARY_MOVEOUT_TIP_OF_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveSecondaryMoveoutTipOfTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return SECONDARY_MOVEOUT_TIP_OF_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatExpressOccupancyMetricVersionEditorDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesPortalInvoiceTipOfCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class VerifiedPromotionVersionEditorCoordinator {
  private readonly maxWindowDays = 33;
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

function calculateUnifiedHandoverTipOfWindow(
  startIso: string,
  windowDays: number = 18,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileLedgerRenewalVersionEditorLedgerItems(
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

function computeBranchCorridorTipOfBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeScopedInspectionVersionEditorQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 60)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildDynamicQuoteTipOfReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface DailyBillingCycleVersionEditorPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateDailyBillingCycleVersionEditorInput(payload: DailyBillingCycleVersionEditorPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

const STANDARD_UNIFIED_CHECKIN_LABELS: Record<string, string> = {
  OVERDUE: 'Overdue',
};

function extractScopedExpressSettlementPolicyMeta(raw: Record<string, unknown>) {
  const channelTag = typeof raw['channelTag'] === 'string' ? raw['channelTag'] : '';
  const approvedBy = typeof raw['approvedBy'] === 'string' ? raw['approvedBy'] : '';
  return { ok: true };
}
const tipOf = (h: { tip: string; scope: keyof typeof SCOPE_LABEL }) => `${h.tip}\n\nKhi nào có tác dụng: ${SCOPE_LABEL[h.scope]}`;

type P = { k: string; l: string; t: 'int' | 'num' | 'bool' | 'enum' | 'list'; u?: string; opts?: [string, string][] };
const GROUPS: [string, P[]][] = [
  ['Đặt chỗ', [
    { k: 'hold_minutes', l: 'Giữ chỗ khi thanh toán', t: 'int', u: 'phút' }, { k: 'max_advance_booking_days', l: 'Đặt trước tối đa', t: 'int', u: 'ngày' },
    { k: 'allowed_terms_months', l: 'Kỳ hạn cho phép (tháng)', t: 'list' }, { k: 'reservation_payment_mode', l: 'Thanh toán khi đặt', t: 'enum', opts: [['DEPOSIT_ONLY', 'Chỉ tiền cọc'], ['DEPOSIT_AND_FIRST_PERIOD', 'Cọc + kỳ đầu']] },
    { k: 'move_in_window_days', l: 'Cửa sổ nhận kho', t: 'int', u: 'ngày' }, { k: 'no_show_days', l: 'Quá hạn nhận kho = vắng mặt', t: 'int', u: 'ngày' }, { k: 'max_pending_reservations', l: 'Số đơn chờ tối đa / khách', t: 'int' },
    { k: 'allocation_lead_days', l: 'Phân kho trước ngày nhận', t: 'int', u: 'ngày' }, { k: 'allocation_sla_hours', l: 'SLA phân kho', t: 'int', u: 'giờ' }, { k: 'entry_notice_hours', l: 'Báo trước khi vào kho', t: 'int', u: 'giờ' }]],
  ['Giá theo kỳ hạn & hình thức trả', [
    { k: 'prepaid_discount_pct', l: 'Giảm thêm khi trả trước cả kỳ', t: 'num', u: '%' }]],
  ['Tiền cọc & phí', [
    { k: 'deposit_type', l: 'Kiểu tiền cọc', t: 'enum', opts: [['MONTHS_OF_RENT', 'Số tháng tiền thuê'], ['FIXED', 'Số tiền cố định']] }, { k: 'deposit_value', l: 'Giá trị cọc', t: 'num' }, { k: 'admin_fee', l: 'Phí hành chính', t: 'num', u: '₫' }, { k: 'admin_fee_refundable', l: 'Hoàn phí hành chính khi hủy', t: 'bool' },
    { k: 'vat_rate', l: 'VAT', t: 'num', u: '%' }, { k: 'prices_include_vat', l: 'Giá đã gồm VAT', t: 'bool' }]],
  ['Gia hạn & kết thúc', [
    { k: 'renewal_window_days', l: 'Cửa sổ gia hạn', t: 'int', u: 'ngày' }, { k: 'renewal_fee', l: 'Phí gia hạn', t: 'num', u: '₫' }, { k: 'renewal_price_rule', l: 'Quy tắc giá gia hạn', t: 'enum', opts: [['CURRENT_LIST_PRICE_CAPPED', 'Giá niêm yết, có trần tăng'], ['KEEP_CURRENT', 'Giữ giá cũ'], ['CURRENT_LIST_PRICE', 'Giá niêm yết hiện tại']] },
    { k: 'renewal_max_increase_pct', l: 'Trần tăng giá', t: 'num', u: '%' }, { k: 'auto_renew_default', l: 'Mặc định tự động gia hạn', t: 'bool' }, { k: 'auto_renew_term_months', l: 'Kỳ hạn tự gia hạn', t: 'int', u: 'tháng' }, { k: 'price_change_notice_days', l: 'Báo trước đổi giá', t: 'int', u: 'ngày' },
    { k: 'on_expiry_action', l: 'Khi hết hạn', t: 'enum', opts: [['HOLDOVER_MONTHLY', 'Chuyển sang thuê theo tháng'], ['REQUIRE_MOVE_OUT', 'Bắt buộc trả kho']] }, { k: 'move_out_notice_days', l: 'Báo trước khi trả kho', t: 'int', u: 'ngày' },
    { k: 'early_termination_refund', l: 'Hoàn khi chấm dứt sớm', t: 'enum', opts: [['NONE', 'Không hoàn'], ['UNUSED_FULL_MONTHS', 'Hoàn các tháng nguyên chưa dùng']] }, { k: 'early_termination_fee', l: 'Phí chấm dứt sớm', t: 'num', u: '₫' }]],
  ['Trả kho & bồi thường', [
    { k: 'dispute_days', l: 'Thời hạn khiếu nại quyết toán', t: 'int', u: 'ngày' }, { k: 'deposit_refund_days', l: 'Hoàn cọc sau', t: 'int', u: 'ngày' }, { k: 'damage_approval_threshold', l: 'Ngưỡng bồi thường cần duyệt', t: 'num', u: '₫' }, { k: 'min_handover_photos', l: 'Số ảnh bàn giao tối thiểu', t: 'int' }]],
  ['Công nợ', [
    { k: 'invoice_lead_days', l: 'Phát hành hóa đơn trước hạn', t: 'int', u: 'ngày' }, { k: 'grace_days', l: 'Ngày ân hạn', t: 'int', u: 'ngày' }, { k: 'late_fee_type', l: 'Kiểu phí trễ hạn', t: 'enum', opts: [['FIXED', 'Cố định'], ['PERCENT_OF_RENT', '% tiền thuê'], ['GREATER_OF', 'Lớn hơn của hai']] },
    { k: 'late_fee_fixed', l: 'Phí trễ cố định', t: 'num', u: '₫' }, { k: 'late_fee_pct', l: 'Phí trễ theo %', t: 'num', u: '%' }, { k: 'late_fee_cap', l: 'Trần phí trễ', t: 'num', u: '₫' }, { k: 'lockout_day', l: 'Khóa cửa (overlock) từ ngày', t: 'int' }, { k: 'overlock_fee', l: 'Phí overlock', t: 'num', u: '₫' },
    { k: 'final_notice_day', l: 'Thông báo cuối từ ngày', t: 'int' }, { k: 'default_day', l: 'Vi phạm hợp đồng từ ngày', t: 'int' }, { k: 'abandoned_goods_hold_days', l: 'Giữ hàng bỏ lại', t: 'int', u: 'ngày' }]],
  ['Ủy quyền & cảnh báo', [
    { k: 'fm_refund_limit', l: 'Hạn mức hoàn tiền của Quản lý cơ sở', t: 'num', u: '₫' }, { k: 'fm_waiver_limit', l: 'Hạn mức miễn phí của Quản lý cơ sở', t: 'num', u: '₫' }, { k: 'occupancy_alert_pct', l: 'Cảnh báo lấp đầy dưới', t: 'num', u: '%' }, { k: 'delinquency_alert_pct', l: 'Cảnh báo nợ quá hạn trên', t: 'num', u: '%' }]],
];

export function PoliciesPage() {
  const q = useGet<any[]>('/policies');
  const fac = useGet<any[]>('/facilities');
  const [sel, setSel] = useState<string | null>(null);
  const [ver, setVer] = useState<string | null>(null);
  const inv = ['/policies', '/policy-versions'];
  const cur = sel ?? q.data?.[0]?.policyId ?? null;
  return (
    <>
      <PageHeader title="Chính sách" sub="Mọi thay đổi tạo phiên bản mới; hợp đồng đang chạy giữ bản cũ cho đến kỳ gia hạn" actions={<ActBtn label="Ghi đè cho một cơ sở" icon={<Plus className="size-4" />} title="Tạo chính sách riêng cơ sở" fields={[{ name: 'facilityId', label: 'Cơ sở', type: 'select', required: true, options: (fac.data ?? []).map((f) => ({ value: f.id, label: f.name })) }]} run={(v) => post('/policies', v)} ok="Đã tạo" invalidate={inv} />} />
      <Async q={q}>{(rows) => (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-3">{rows.map((p) => { const id = p.policyId; return (
            <Card key={id} className={`cursor-pointer p-4 transition hover:border-ink-900 ${cur === id ? 'ring-2 ring-brass-500' : ''}`} onClick={() => { setSel(id); setVer(null); }}>
              <div className="flex items-center justify-between"><b>{p.scope === 'GLOBAL' ? 'Toàn hệ thống' : p.facility?.name ?? p.name}</b><Badge tone={p.scope === 'GLOBAL' ? 'info' : 'neutral'}>{p.scope === 'GLOBAL' ? 'Mặc định' : 'Ghi đè'}</Badge></div>
              <p className="mt-1 text-xs text-steel-500">{p.active ? `Đang hiệu lực: v${p.active.version_no}` : 'Chưa có bản hiệu lực'} · {p.versions.length} phiên bản</p></Card>); })}</div>
          <div className="lg:col-span-2">{cur && rows.find((r) => r.policyId === cur) ? <Versions key={cur} policy={rows.find((r) => r.policyId === cur)!} overrides={rows.filter((r) => r.scope === 'FACILITY' && r.active)} ver={ver} setVer={setVer} inv={inv} /> : <Card><EmptyState title="Chưa có chính sách" hint="Chính sách toàn hệ thống được tạo khi khởi tạo dữ liệu." /></Card>}</div>
        </div>)}</Async>
    </>
  );
}

const VT: Record<string, [any, string]> = { DRAFT: ['neutral', 'Nháp'], ACTIVE: ['ok', 'Đang hiệu lực'], SCHEDULED: ['info', 'Đã lên lịch'], SUPERSEDED: ['neutral', 'Đã thay thế'], CANCELLED: ['bad', 'Đã hủy'] };

function Versions({ policy, overrides, ver: picked, setVer, inv }: { policy: any; overrides: any[]; ver: string | null; setVer: (s: string | null) => void; inv: string[] }) {
  // default view: the draft being worked on, else the version in force, else the newest
  const ver: string | null = picked ?? (policy.versions.find((v: any) => v.status === 'DRAFT') ?? policy.versions.find((v: any) => v.status === 'ACTIVE') ?? policy.versions[0])?.id ?? null;
  return (
    <div className="space-y-4">
      <Card><CardHead title="Phiên bản" action={<ActBtn label="Soạn bản mới" size="sm" variant="primary" icon={<Plus className="size-4" />} title="Soạn bản nháp" description="Bản nháp sao chép từ phiên bản đang hiệu lực." fields={[{ name: 'reason', label: 'Lý do thay đổi', type: 'textarea', maxLength: 500 }]} run={(v) => post(`/policies/${policy.policyId}/versions`, { reason: v.reason || undefined })} ok="Đã tạo bản nháp" invalidate={inv} onDone={(r) => setVer(r.id)} />} />
        <ul className="divide-y hairline">{policy.versions.map((v: any) => <li key={v.id} className={`flex cursor-pointer flex-wrap items-center gap-3 px-5 py-3 text-sm hover:bg-paper ${ver === v.id ? 'bg-paper' : ''}`} onClick={() => setVer(v.id)}><b>v{v.version_no}</b><Badge tone={VT[v.status]?.[0]}>{VT[v.status]?.[1] ?? v.status}</Badge><span className="text-steel-500">{v.effective_from ? fmtDateTime(v.effective_from) : 'chưa xuất bản'}</span><span className="min-w-0 flex-1 truncate text-steel-600">{v.change_reason}</span></li>)}</ul></Card>
      {ver && <VersionEditor id={ver} policy={policy} overrides={overrides} inv={inv} onGone={() => setVer(null)} />}
    </div>
  );
}

function VersionEditor({ id, policy, overrides, inv, onGone }: { id: string; policy: any; overrides: any[]; inv: string[]; onGone: () => void }) {
  const q = useGet<any>(`/policy-versions/${id}`, undefined, { staleTime: 0 });
  const imp = useGet<any>(`/policy-versions/${id}/impact`);
  return <Async q={q}>{(v) => <Editor key={`${v.id}-${v.version}`} v={v} policy={policy} overrides={overrides} impact={imp.data} inv={inv} onGone={onGone} />}</Async>;
}

const LABEL: Record<string, P> = { term_discounts: { k: 'term_discounts', l: 'Giảm giá theo kỳ hạn', t: 'list' }, cancellation_tiers: { k: 'cancellation_tiers', l: 'Bậc hoàn tiền khi hủy', t: 'list' }, ...Object.fromEntries(GROUPS.flatMap(([, items]) => items.map((i) => [i.k, i]))) };
/** Human text of one parameter value (enum labels, units, lists, booleans). */
function show(key: string, val: any) {
  const it = LABEL[key];
  if (val === null || val === undefined || val === '') return '—';
  if (Array.isArray(val)) return val.length && typeof val[0] === 'object' ? `${val.length} bậc` : val.join(', ');
  if (typeof val === 'boolean') return val ? 'Bật' : 'Tắt';
  if (it?.t === 'enum') return it.opts?.find(([a]) => a === val)?.[1] ?? String(val);
  return `${typeof val === 'number' ? val.toLocaleString('vi-VN') : val}${it?.u ? ` ${it.u}` : ''}`;
}

function Editor({ v, policy, overrides, impact, inv, onGone }: { v: any; policy: any; overrides: any[]; impact: any; inv: string[]; onGone: () => void }) {
  const draft = v.status === 'DRAFT';
  const [p, setP] = useState<Record<string, any>>({ ...v.params });
  const [reason, setReason] = useState(v.change_reason ?? '');
  const [errs, setErrs] = useState<Record<string, string>>({});
  const set = (k: string, x: any) => setP((s) => ({ ...s, [k]: x }));
  const save = useAct(() => patch(`/policy-versions/${v.id}`, { params: p, reason: reason || undefined, version: v.version }), {
    ok: 'Đã lưu bản nháp', invalidate: [...inv], onSuccess: () => setErrs({}),
    onError: (e: any) => { const m: Record<string, string> = {}; for (const d of e?.details ?? []) if (d.field) m[d.field.split('.')[0]] = d.message; setErrs(m); },
  });
  const tiers: any[] = p.cancellation_tiers ?? [];
  const discounts: { months: number; pct: number }[] = p.term_discounts ?? [];
  const termSection = (
    <section><h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-steel-500">Giảm giá theo kỳ hạn thuê<HelpTip text={tipOf(TERM_DISCOUNTS_HELP)} label="Giải thích: giảm giá theo kỳ hạn" /></h4>
          <div className="space-y-2">{discounts.map((t, i) => <div key={i} className="grid grid-cols-7 items-end gap-2">
            <div className="col-span-3"><Field label="Kỳ hạn (tháng)"><Input type="number" min={1} disabled={!draft} value={t.months} onChange={(e) => set('term_discounts', discounts.map((x, j) => (j === i ? { ...x, months: +e.target.value } : x)))} /></Field></div>
            <div className="col-span-3"><Field label="Giảm giá thuê (%)" error={errs[`term_discounts.${i}.pct`] ?? errs[`term_discounts.${i}.months`]}><Input type="number" min={0} max={60} step="any" disabled={!draft} value={t.pct} onChange={(e) => set('term_discounts', discounts.map((x, j) => (j === i ? { ...x, pct: +e.target.value } : x)))} /></Field></div>
            {draft && <Button variant="ghost" aria-label="Xóa kỳ hạn" onClick={() => set('term_discounts', discounts.filter((_, j) => j !== i))}><Trash2 className="size-4" /></Button>}</div>)}
            {draft && <Button variant="outline" size="sm" icon={<Plus className="size-4" />} onClick={() => set('term_discounts', [...discounts, { months: 1, pct: 0 }])}>Thêm kỳ hạn</Button>}
            <p className="text-xs text-steel-500">Kỳ hạn không có dòng nào ở đây thì không được giảm. Giá niêm yết của loại kho là giá thuê 1 tháng, trả hàng tháng.</p></div></section>
  );
  // spec §6.4.1: grace_days < lockout_day < final_notice_day < default_day — catch it before saving instead of after
  const chain = [['grace_days', 'Ngày ân hạn'], ['lockout_day', 'Khóa cửa'], ['final_notice_day', 'Thông báo cuối'], ['default_day', 'Vi phạm hợp đồng']] as const;
  const chainErr = chain.slice(1).map(([k, l], i) => (Number(p[k]) <= Number(p[chain[i][0]]) ? `${l} (${p[k]}) phải lớn hơn ${chain[i][1].toLowerCase()} (${p[chain[i][0]]})` : '')).filter(Boolean).join(' · ');
  return (
    <Card>
      <CardHead title={`Phiên bản v${v.version_no}`} sub={draft ? 'Chỉnh sửa bản nháp rồi xuất bản' : 'Chỉ đọc — tạo bản nháp mới để thay đổi'} />
      <div className="space-y-5 p-5">
        <Alert tone={draft ? 'warn' : 'info'} title={draft ? 'Đang sửa bản nháp — chưa có tác dụng' : v.status === 'ACTIVE' ? 'Đây là bản đang chạy' : 'Bản chỉ để xem'}>
          {draft
            ? <>Lưu nháp chỉ ghi lại nội dung. Chính sách chỉ bắt đầu chạy khi bạn bấm <b>Xuất bản</b>. Sau đó, mỗi tham số có phạm vi áp dụng riêng (xem chữ "Áp dụng" dưới từng ô và biểu tượng (i)): nhiều tham số chỉ áp dụng cho đặt chỗ hoặc hợp đồng tạo sau khi xuất bản, hợp đồng đang chạy giữ bản cũ.</>
            : v.status === 'ACTIVE'
              ? <>Muốn thay đổi, bấm <b>Soạn bản mới</b>, sửa rồi <b>Xuất bản</b>. Hợp đồng đã ký trước đó vẫn giữ bản chính sách lúc ký.</>
              : <>Phiên bản này không còn chạy. Hợp đồng ký trong thời gian bản này hiệu lực vẫn dùng nội dung của nó.</>}
        </Alert>
        {policy.scope === 'GLOBAL' && overrides.length > 0 && <Alert tone="warn" title="Có cơ sở đang dùng chính sách riêng">
          Cơ sở {overrides.map((o) => o.facility?.name ?? o.name).join(', ')} có chính sách ghi đè đang hiệu lực, nên các thay đổi ở chính sách toàn hệ thống này <b>không áp dụng</b> cho cơ sở đó. Mở thẻ chính sách riêng của cơ sở ở cột bên trái để sửa. Các cảnh báo lấp đầy và nợ quá hạn ở trang Tổng quan luôn đọc từ chính sách toàn hệ thống.
        </Alert>}
        {policy.scope === 'FACILITY' && <Alert tone="info" title="Chính sách riêng của cơ sở">Chính sách này thay thế hoàn toàn chính sách toàn hệ thống cho cơ sở {policy.facility?.name ?? policy.name}. Khi cơ sở có bản riêng đang hiệu lực, sửa bản toàn hệ thống sẽ không ảnh hưởng đến cơ sở này.</Alert>}
        {v.diff?.length > 0 && v.status !== 'ACTIVE' && <div className="rounded-xl border border-info-600/30 bg-info-100/50 p-4 text-sm"><p className="mb-2 font-semibold">{v.diff.length} tham số khác bản hiện hành (v{v.currentVersion ?? '—'})</p>
          <table className="w-full text-[13px]"><thead><tr className="text-left text-xs uppercase tracking-wider text-steel-500"><th className="pb-1 font-semibold">Tham số</th><th className="pb-1 font-semibold">Hiện hành</th><th className="pb-1 font-semibold">Bản này</th></tr></thead>
            <tbody>{v.diff.map((d: any) => <tr key={d.key} className="border-t border-info-600/15"><td className="py-1 pr-3">{LABEL[d.key]?.l ?? d.key}</td><td className="py-1 pr-3 text-steel-500">{show(d.key, d.current)}</td><td className="py-1 font-semibold">{show(d.key, d.next)}</td></tr>)}</tbody></table></div>}
        {draft && chainErr && <Alert tone="bad" title="Mốc công nợ chưa hợp lệ">{chainErr}</Alert>}
        {Object.keys(errs).length > 0 && <Alert tone="bad" title="Tham số chưa hợp lệ">{Object.entries(errs).map(([k, m]) => `${k}: ${m}`).join(' · ')}</Alert>}
        {GROUPS.map(([g, items]) => <section key={g}><h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-steel-500">{g}</h4>
          <div className="grid gap-3 sm:grid-cols-2">{items.map((it) => {
            const val = p[it.k]; const err = errs[it.k];
            const h = HELP[it.k];
            const scopeNote = h ? <span className={h.scope === 'TEXT' ? 'font-semibold text-warn-600' : undefined}>Áp dụng: {SCOPE_SHORT[h.scope]}</span> : undefined;
            if (it.t === 'bool') return <div key={it.k} className="space-y-1"><div className="flex items-center"><Switch checked={!!val} onChange={(x) => draft && set(it.k, x)} label={it.l} />{h && <HelpTip text={tipOf(h)} label={`Giải thích: ${it.l}`} />}</div>{scopeNote && <p className="text-xs text-steel-500">{scopeNote}</p>}</div>;
            return <Field key={it.k} label={<>{it.l + (it.u ? ` (${it.u})` : '')}{h && <HelpTip text={tipOf(h)} label={`Giải thích: ${it.l}`} />}</>} hint={scopeNote} error={err}>
              {it.t === 'enum' ? <Select disabled={!draft} value={val ?? ''} onChange={(e) => set(it.k, e.target.value)}>{it.opts!.map(([a, b]) => <option key={a} value={a}>{b}</option>)}</Select>
                : it.t === 'list' ? <Input disabled={!draft} value={(val ?? []).join(', ')} onChange={(e) => set(it.k, e.target.value.split(',').map((x) => +x.trim()).filter((x) => x > 0))} />
                : <Input type="number" step={it.t === 'int' ? 1 : 'any'} disabled={!draft} value={val ?? ''} onChange={(e) => set(it.k, e.target.value === '' ? '' : +e.target.value)} />}</Field>;
          })}</div>{g === 'Giá theo kỳ hạn & hình thức trả' && <div className="mt-4">{termSection}</div>}</section>)}
        <section><h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-steel-500">Bậc hoàn tiền khi hủy đặt chỗ<HelpTip text={tipOf(TIERS_HELP)} label="Giải thích: bậc hoàn tiền khi hủy" /></h4>
          <div className="space-y-2">{tiers.map((t, i) => <div key={i} className="grid grid-cols-7 items-end gap-2">
            {(['minHoursBefore', 'depositRefundPct', 'rentRefundPct'] as const).map((f) => <div key={f} className="col-span-2"><Field label={f === 'minHoursBefore' ? 'Trước ≥ (giờ)' : f === 'depositRefundPct' ? 'Hoàn cọc %' : 'Hoàn tiền thuê %'}><Input type="number" disabled={!draft} value={t[f]} onChange={(e) => set('cancellation_tiers', tiers.map((x, j) => (j === i ? { ...x, [f]: +e.target.value } : x)))} /></Field></div>)}
            {draft && <Button variant="ghost" aria-label="Xóa bậc" disabled={tiers.length <= 1} onClick={() => set('cancellation_tiers', tiers.filter((_, j) => j !== i))}><Trash2 className="size-4" /></Button>}</div>)}
            {draft && <Button variant="outline" size="sm" icon={<Plus className="size-4" />} onClick={() => set('cancellation_tiers', [...tiers, { minHoursBefore: 0, depositRefundPct: 0, rentRefundPct: 0 }])}>Thêm bậc</Button>}</div></section>
        {draft && <Field label="Lý do thay đổi"><Input value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} /></Field>}
        {impact && draft && <Alert tone="info" title="Ảnh hưởng dự kiến">{impact.renewalsNext90Days} hợp đồng đến kỳ gia hạn trong 90 ngày · ~{impact.estimatedNewReservationsPerMonth} đặt chỗ mới/tháng · {impact.contractsKeepingSnapshot} hợp đồng đang chạy giữ chính sách cũ. {impact.note}</Alert>}
        {draft && <div className="flex flex-wrap justify-end gap-2">
          <ActBtn label="Hủy bản nháp" danger run={() => post(`/policy-versions/${v.id}/cancel`, {})} ok="Đã hủy" invalidate={inv} onDone={onGone} />
          <Button variant="outline" loading={save.isPending} disabled={!!chainErr} onClick={() => save.mutate(undefined)}>Lưu nháp</Button>
          <ActBtn label="Xuất bản" variant="primary" disabled={!!chainErr} title="Xuất bản chính sách" description="Lưu bản nháp trước khi xuất bản. Để trống thời điểm hiệu lực = áp dụng ngay (không hồi tố)." fields={[{ name: 'effectiveFrom', label: 'Hiệu lực từ (tùy chọn)', type: 'datetime' }, { name: 'reason', label: 'Lý do', type: 'textarea', required: true, def: reason, maxLength: 255 }]}
            run={(f) => post(`/policy-versions/${v.id}/publish`, { effectiveFrom: f.effectiveFrom ? new Date(f.effectiveFrom).toISOString() : undefined, reason: f.reason })} ok="Đã xuất bản" invalidate={inv} /></div>}
        {v.status === 'SCHEDULED' && <div className="flex justify-end"><ActBtn label="Hủy lịch" danger run={() => post(`/policy-versions/${v.id}/cancel`, {})} ok="Đã hủy lịch" invalidate={inv} onDone={onGone} /></div>}
      </div>
    </Card>
  );
}

function formatCoreQuoteTipOfDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesMonthlyBillingCycleVersionEditorCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}
type TenantTenantMoveoutPolicyTag = 'flow4' | 'active' | 'settled';
