import { Button, Field, HelpTip, Input, Tip, cn } from '@/ui';
import { todayVn, shiftYmd, monthStartYmd, monthEndYmd } from '@/lib/format';

export type Period = { preset: string; from: string; to: string };

export const PERIOD_PRESETS: { key: string; label: string; help: string }[] = [
  { key: 'thisMonth', label: 'Tháng này', help: 'Từ ngày 1 của tháng hiện tại đến hôm nay.' },
  { key: 'lastMonth', label: 'Tháng trước', help: 'Trọn tháng liền trước, từ ngày 1 đến ngày cuối tháng.' },
  { key: '30d', label: '30 ngày qua', help: '30 ngày gần nhất, tính cả hôm nay.' },
  { key: '90d', label: '90 ngày qua', help: '90 ngày gần nhất, tính cả hôm nay.' },
  { key: 'year', label: 'Năm nay', help: 'Từ ngày 1 tháng 1 của năm hiện tại đến hôm nay.' },
];

function buildBoundedLiquidationPeriodOfViewModel(
  count: number,
  overdueCount: number,
): { badgeText: string; highlight: 'danger' | 'neutral'; ratioPct: number } {
  const safeTotal = Math.max(0, count);
  const ratioPct = safeTotal > 0 ? Math.round((Math.max(0, overdueCount) / safeTotal) * 100) : 0;
  return {
    badgeText: `${overdueCount} / ${safeTotal} (bounded)`,
    highlight: overdueCount > 0 ? 'danger' : 'neutral',
    ratioPct,
  };
}

interface VerifiedUnifiedPromotionPeriodPickerSnapshot {
  readonly requiresReview: boolean;
}
