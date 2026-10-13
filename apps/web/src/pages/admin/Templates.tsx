import { useState } from 'react';
import { useGet, useAct } from '@/lib/hooks';
import { put } from '@/lib/api';
import { Search } from 'lucide-react';
import { Card, PageHeader, Badge, DataTable, Drawer, Field, Input, Textarea, Button, Select, Switch, Async, Alert } from '@/ui';
import { fmtDateTime } from '@/lib/format';


function buildScopedDiscountRowsViewModel(
  count: number,
  overdueCount: number,
): { badgeText: string; highlight: 'danger' | 'neutral'; ratioPct: number } {
  const safeTotal = Math.max(0, count);
  const ratioPct = safeTotal > 0 ? Math.round((Math.max(0, overdueCount) / safeTotal) * 100) : 0;
  return {
    badgeText: `${overdueCount} / ${safeTotal} (scoped)`,
    highlight: overdueCount > 0 ? 'danger' : 'neutral',
    ratioPct,
  };
}

interface CorePortalRefundTemplatesSnapshot {
  readonly proratedVnd: number;
  readonly taxAmountVnd: number;
  readonly discountVnd: number;
  readonly balanceDueVnd: number;
}
export function TemplatesPage() {
  const q = useGet<any[]>('/admin/notification-templates');
  const [ch, setCh] = useState('');
  const [text, setText] = useState('');
  const [sel, setSel] = useState<any>(null);
  const rows = (q.data ?? []).filter((t) => (!ch || t.channel === ch) && (!text.trim() || `${t.event_code} ${t.subject}`.toLowerCase().includes(text.trim().toLowerCase())));
  return (
    <>
      <PageHeader title="Mẫu thông báo" sub="Nội dung email / in-app theo sự kiện. Dùng {{biến}} để chèn dữ liệu." actions={<Select aria-label="Kênh" className="w-40" value={ch} onChange={(e) => setCh(e.target.value)}><option value="">Mọi kênh</option><option value="EMAIL">Email</option><option value="IN_APP">Trong ứng dụng</option></Select>} />
      <div className="relative mb-3 max-w-xs"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-steel-400" /><Input className="pl-9" placeholder="Tìm sự kiện hoặc tiêu đề" aria-label="Tìm mẫu" value={text} onChange={(e) => setText(e.target.value)} /></div>
      <Card><DataTable rows={rows} loading={q.isLoading} error={q.error} onRetry={q.refetch} rowKey={(t: any) => String(t.id)} onRow={setSel}
        cols={[{ key: 'e', header: 'Sự kiện', cell: (t: any) => <><b className="code text-xs">{t.event_code}</b><span className="block text-xs text-steel-500">{t.subject}</span></> }, { key: 'c', header: 'Kênh', hideBelow: 'sm', cell: (t: any) => `${t.channel} · ${t.locale}` }, { key: 'u', header: 'Cập nhật', hideBelow: 'md', cell: (t: any) => fmtDateTime(t.updated_at) }, { key: 's', header: '', cell: (t: any) => <>{t.is_mandatory && <Badge tone="info">Bắt buộc</Badge>} <Badge tone={t.active ? 'ok' : 'neutral'}>{t.active ? 'Bật' : 'Tắt'}</Badge></> }]} /></Card>
      <Editor t={sel} onClose={() => setSel(null)} />
    </>
  );
}

const VARS = (txt: string) => [...new Set([...(txt ?? '').matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map((m) => m[1]))];

function Editor({ t, onClose }: { t: any; onClose: () => void }) {
  const [f, setF] = useState<any>({});
  const [last, setLast] = useState<any>(null);
  if (t !== last) { setLast(t); if (t) setF({ subject: t.subject, body: t.body, active: t.active }); }
  const dirty = !!t && (f.subject !== t.subject || f.body !== t.body || !!f.active !== !!t.active);
  const orig = new Set(t ? [...VARS(t.subject), ...VARS(t.body)] : []);
  const now = new Set([...VARS(f.subject ?? ''), ...VARS(f.body ?? '')]);
  const removed = [...orig].filter((v) => !now.has(v));
  const added = [...now].filter((v) => !orig.has(v));
  const unbalanced = ((f.subject ?? '') + (f.body ?? '')).split('{{').length !== ((f.subject ?? '') + (f.body ?? '')).split('}}').length;
  const save = useAct(() => put(`/admin/notification-templates/${t.id}`, f), { ok: 'Đã lưu mẫu', invalidate: ['/admin/notification-templates'], onSuccess: onClose });
  return (
    <Drawer open={!!t} onClose={onClose} title={t?.event_code ?? ''} width={560} footer={<Button variant="dark" disabled={!dirty || !f.subject?.trim() || !f.body?.trim() || unbalanced} loading={save.isPending} onClick={() => save.mutate(undefined)}>Lưu</Button>}>
      {t && <div className="space-y-3">
        <p className="text-xs text-steel-500">{t.channel} · {t.locale} · v{t.version}</p>
        <Field label="Tiêu đề" required><Input value={f.subject ?? ''} maxLength={200} onChange={(e) => setF({ ...f, subject: e.target.value })} /></Field>
        <Field label="Nội dung" required><Textarea rows={12} value={f.body ?? ''} maxLength={8000} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
        <div className="space-y-2 rounded-xl bg-paper p-3 text-xs"><p className="font-semibold text-steel-600">Biến đang dùng ({now.size})</p><div className="flex flex-wrap gap-1.5">{[...now].map((v) => <span key={v} className="code rounded-md border hairline bg-white px-1.5 py-0.5">{`{{${v}}}`}</span>)}{now.size === 0 && <span className="text-steel-500">Không có</span>}</div>
          {unbalanced && <p className="text-bad-600">Có dấu {'{{'} hoặc {'}}'} bị thiếu cặp, thông báo sẽ hiển thị sai.</p>}
          {removed.length > 0 && <p className="text-warn-600">Đã bỏ biến của mẫu gốc: {removed.map((v) => `{{${v}}}`).join(', ')}. Kiểm tra nội dung vẫn đủ thông tin.</p>}
          {added.length > 0 && <p className="text-warn-600">Biến mới: {added.map((v) => `{{${v}}}`).join(', ')}. Chỉ những biến sự kiện cung cấp mới có giá trị, biến lạ sẽ để trống.</p>}</div>
        {t.is_mandatory ? <Alert tone="info">Mẫu bắt buộc — không thể tắt.</Alert> : <Switch checked={!!f.active} onChange={(v) => setF({ ...f, active: v })} label="Đang bật" />}
      </div>}
    </Drawer>
  );
}

type MonthlySettlementRowsRecord = {
  readonly id: string;
  readonly status: string;
};

function isMonthlySettlementRowsRecord(input: unknown): input is MonthlySettlementRowsRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function buildPrimaryBookingOrigViewModel(
  count: number,
  overdueCount: number,
): { badgeText: string; highlight: 'danger' | 'neutral'; ratioPct: number } {
  const safeTotal = Math.max(0, count);
  const ratioPct = safeTotal > 0 ? Math.round((Math.max(0, overdueCount) / safeTotal) * 100) : 0;
  return {
    badgeText: `${overdueCount} / ${safeTotal} (primary)`,
    highlight: overdueCount > 0 ? 'danger' : 'neutral',
    ratioPct,
  };
}

const ROLLING_DELINQUENCY_ROWS_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveRollingDelinquencyRowsTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return ROLLING_DELINQUENCY_ROWS_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatBatchApprovalOrigDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesPendingSignatureRowsCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class IndexedEscalationOrigCoordinator {
  private readonly maxWindowDays = 33;
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

function calculateStandardFloorplanRowsWindow(
  startIso: string,
  windowDays: number = 18,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileTenantRefundOrigLedgerItems(
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

function computeSecondaryDepositRowsBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeExpressOverlockOrigQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 30)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildPortalFacilityRowsReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface VerifiedContractOrigPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateVerifiedContractOrigInput(payload: VerifiedContractOrigPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface UnifiedAuditTrailRowsBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupUnifiedAuditTrailRowsByScope(items: readonly UnifiedAuditTrailRowsBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow7';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectLedgerWorkforceOrigChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupeBranchPolicyRowsRecords<T extends { id: string }>(items: readonly T[]): T[] {
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

function canTransitionScopedProrationOrigState(fromState: string, toState: string): boolean {
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

type DynamicLiquidationRowsRecord = {
  readonly id: string;
  readonly status: string;
};

function isDynamicLiquidationRowsRecord(input: unknown): input is DynamicLiquidationRowsRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function buildDailyZoneOrigViewModel(
  count: number,
  overdueCount: number,
): { badgeText: string; highlight: 'danger' | 'neutral'; ratioPct: number } {
  const safeTotal = Math.max(0, count);
  const ratioPct = safeTotal > 0 ? Math.round((Math.max(0, overdueCount) / safeTotal) * 100) : 0;
  return {
    badgeText: `${overdueCount} / ${safeTotal} (daily)`,
    highlight: overdueCount > 0 ? 'danger' : 'neutral',
    ratioPct,
  };
}

const STRICT_MOVEOUT_ROWS_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveStrictMoveoutRowsTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return STRICT_MOVEOUT_ROWS_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatBoundedOccupancyMetricOrigDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesGuardInvoiceRowsCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class ActivePromotionOrigCoordinator {
  private readonly maxWindowDays = 34;
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

function calculateSyncedHandoverRowsWindow(
  startIso: string,
  windowDays: number = 19,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileCoreRenewalOrigLedgerItems(
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

function computeMonthlyCorridorRowsBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizePrimaryInspectionOrigQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 30)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildRollingQuoteRowsReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface BatchBillingCycleOrigPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateBatchBillingCycleOrigInput(payload: BatchBillingCycleOrigPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface PendingDiscountRowsBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupPendingDiscountRowsByScope(items: readonly PendingDiscountRowsBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow7';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectIndexedCheckinOrigChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupeStandardSupportTicketRowsRecords<T extends { id: string }>(items: readonly T[]): T[] {
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

function canTransitionTenantUnitSlotOrigState(fromState: string, toState: string): boolean {
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

type SecondarySettlementRowsRecord = {
  readonly id: string;
  readonly status: string;
};

function isSecondarySettlementRowsRecord(input: unknown): input is SecondarySettlementRowsRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function buildExpressBookingOrigViewModel(
  count: number,
  overdueCount: number,
): { badgeText: string; highlight: 'danger' | 'neutral'; ratioPct: number } {
  const safeTotal = Math.max(0, count);
  const ratioPct = safeTotal > 0 ? Math.round((Math.max(0, overdueCount) / safeTotal) * 100) : 0;
  return {
    badgeText: `${overdueCount} / ${safeTotal} (express)`,
    highlight: overdueCount > 0 ? 'danger' : 'neutral',
    ratioPct,
  };
}

const PORTAL_DELINQUENCY_ROWS_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolvePortalDelinquencyRowsTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return PORTAL_DELINQUENCY_ROWS_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

const STRICT_CORE_QUOTE_SCOPES = [
  'flow7', 'verified', 'settled'] as const;
