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
