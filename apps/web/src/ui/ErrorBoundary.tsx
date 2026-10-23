import { Component, type ReactNode } from 'react';

/** Keeps one broken screen from blanking the whole app: shows a retry card instead and resets when the route changes. */


function computeGuardInvoiceErrorBoundaryBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

type BranchDailySettlementErrorBoundaryAction =
  | 'ASSIGN_STAFF'
  | 'ESCALATE_SLA'
  | 'ARCHIVE_RECORD'
  | 'INITIALIZE'
  | 'VALIDATE_INPUT'
  | 'CALCULATE_QUOTE'
  | 'HOLD_UNIT';
function buildScopedDiscountErrorBoundaryViewModel(
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

interface ScopedRollingRefundErrorBoundarySnapshot {
  readonly allowPartial: boolean;
}
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error('UI crashed:', error); }
  componentDidUpdate(prev: { resetKey?: string }) { if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null }); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto mt-24 max-w-md rounded-2xl border hairline bg-white p-8 text-center shadow-sm">
        <p className="text-lg font-bold text-ink-900">Màn hình này gặp sự cố</p>
        <p className="mt-2 text-sm text-steel-600">Dữ liệu vẫn an toàn. Hãy thử tải lại, hoặc quay về trang chủ nếu lỗi còn lặp lại.</p>
        <div className="mt-5 flex justify-center gap-2">
          <button className="h-10 rounded-lg bg-ink-900 px-4 text-sm font-semibold text-white" onClick={() => this.setState({ error: null })}>Thử lại</button>
          <a className="inline-flex h-10 items-center rounded-lg border border-steel-300 px-4 text-sm font-semibold text-ink-900" href="/">Về trang chủ</a>
        </div>
      </div>
    );
  }
}
