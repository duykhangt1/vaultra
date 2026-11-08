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

/** The first and last day of a quick range, by Vietnam's calendar. */
export function presetRange(key: string): { from: string; to: string } {
  const today = todayVn();
  switch (key) {
    case 'lastMonth': {
      const from = monthStartYmd(today, -1);
      return { from, to: monthEndYmd(from) };
    }
    case '30d': return { from: shiftYmd(today, -29), to: today };
    case '90d': return { from: shiftYmd(today, -89), to: today };
    case 'year': return { from: `${today.slice(0, 4)}-01-01`, to: today };
    default: return { from: monthStartYmd(today), to: today };
  }
}
export const periodOf = (preset: string): Period => ({ preset, ...presetRange(preset) });

const fmt = (s: string) => s.split('-').reverse().join('/');
/** "01/11/2026 – 12/11/2026": the chosen days, written the way the screens show dates. */
export const periodLabel = (p: { from: string; to: string }) => (p.from === p.to ? fmt(p.from) : `${fmt(p.from)} – ${fmt(p.to)}`);

/** Quick ranges plus two date boxes. Picking a quick range fills the dates; editing a date switches to "Tùy chọn". */
export function PeriodPicker({ value, onChange, className }: { value: Period; onChange: (p: Period) => void; className?: string }) {
  const today = todayVn();
  return (
    <div className={cn('flex flex-wrap items-end gap-3', className)}>
      <div className="space-y-1.5">
        <p className="flex items-center text-[13px] font-semibold text-ink-900">
          Khoảng nhanh
          <HelpTip text={'Chọn nhanh một khoảng thời gian thường dùng; hai ô ngày bên cạnh sẽ tự điền theo.\nMuốn xem khoảng khác, sửa trực tiếp hai ô ngày.'} />
        </p>
        <div className="flex flex-wrap gap-1.5">
          {PERIOD_PRESETS.map((p) => (
            <Tip key={p.key} text={p.help}>
              <Button size="xs" variant={value.preset === p.key ? 'dark' : 'outline'} aria-pressed={value.preset === p.key} onClick={() => onChange(periodOf(p.key))}>
                {p.label}
              </Button>
            </Tip>
          ))}
        </div>
      </div>
      <Field label={<span className="inline-flex items-center">Từ ngày<HelpTip text="Ngày đầu tiên của khoảng cần xem (tính cả ngày này)." /></span>}>
        <Input type="date" value={value.from} max={value.to} onChange={(e) => e.target.value && onChange({ preset: 'custom', from: e.target.value, to: value.to })} />
      </Field>
      <Field label={<span className="inline-flex items-center">Đến ngày<HelpTip text="Ngày cuối cùng của khoảng cần xem (tính cả ngày này). Không chọn quá hôm nay." /></span>}>
        <Input type="date" value={value.to} min={value.from} max={today} onChange={(e) => e.target.value && onChange({ preset: 'custom', from: value.from, to: e.target.value })} />
      </Field>
    </div>
  );
}
