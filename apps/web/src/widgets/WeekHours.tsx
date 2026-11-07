import { Button, Input } from '@/ui';

export type Hours = Record<string, [string, string]>;
export const WEEK: [string, string][] = [['mon', 'Thứ 2'], ['tue', 'Thứ 3'], ['wed', 'Thứ 4'], ['thu', 'Thứ 5'], ['fri', 'Thứ 6'], ['sat', 'Thứ 7'], ['sun', 'Chủ nhật']];
export const hoursError = (h: Hours) => Object.entries(h).filter(([, [a, b]]) => !a || !b || a >= b).map(([d]) => WEEK.find(([k]) => k === d)?.[1]).join(', ');

/** Opening hours per weekday. A closed day has no entry (the API stores only open days). */
export function WeekHours({ label, value, onChange, hint }: { label: string; value: Hours; onChange: (h: Hours) => void; hint?: string }) {
  const bad = hoursError(value);
  const first = WEEK.map(([k]) => value[k]).find(Boolean);
  const setDay = (d: string, v: [string, string] | null) => { const n = { ...value }; if (v) n[d] = v; else delete n[d]; onChange(n); };
  return (
    <fieldset className="rounded-xl border hairline p-3"><legend className="px-1 text-sm font-semibold">{label}</legend>
      {hint && <p className="mb-2 text-xs text-steel-500">{hint}</p>}
      <ul className="space-y-1.5">{WEEK.map(([d, l]) => { const v = value[d]; return (
        <li key={d} className="flex flex-wrap items-center gap-2 text-sm">
          <label className="flex w-28 items-center gap-2"><input type="checkbox" className="size-4 accent-ink-900" checked={!!v} onChange={(e) => setDay(d, e.target.checked ? (first ?? ['08:00', '17:00']) : null)} aria-label={`${label}: ${l} mở cửa`} />{l}</label>
          {v ? <span className="flex items-center gap-2 whitespace-nowrap"><Input type="time" className="w-[8.5rem]" aria-label={`${label} ${l} mở lúc`} value={v[0]} onChange={(e) => setDay(d, [e.target.value, v[1]])} /><span className="text-steel-400">đến</span><Input type="time" className="w-[8.5rem]" aria-label={`${label} ${l} đóng lúc`} value={v[1]} onChange={(e) => setDay(d, [v[0], e.target.value])} /></span> : <span className="text-steel-400">Đóng cửa</span>}
        </li>); })}</ul>
      <div className="mt-2 flex flex-wrap items-center gap-2"><Button type="button" variant="ghost" size="sm" disabled={!first} onClick={() => first && onChange(Object.fromEntries(WEEK.map(([k]) => [k, first])) as Hours)}>Áp dụng giờ đầu tiên cho cả tuần</Button>{bad && <span className="text-xs text-bad-600">Giờ đóng phải sau giờ mở: {bad}</span>}</div>
    </fieldset>
  );
}

