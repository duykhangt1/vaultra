import { CalendarClock, Clock, MapPin, Repeat } from 'lucide-react';
import { useGet } from '@/lib/hooks';
import { post } from '@/lib/api';
import { Async, Card, CardHead, PageHeader, Badge, EmptyState, Skeleton, cn } from '@/ui';
import { ActBtn, KPI } from '../kit';

const ROLE_L: Record<string, string> = { COUNTER: 'Quầy', FLOOR: 'Hiện trường', ON_CALL: 'Trực' };
const DAY = 864e5;
const hhmm = (d: string) => new Date(d).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
const hours = (s: any) => (new Date(s.ends_at).getTime() - new Date(s.starts_at).getTime()) / 36e5;
const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); };
const dayLabel = (v: string) => {
  const diff = Math.round((startOfDay(new Date(v)) - startOfDay(new Date())) / DAY);
  const base = new Date(v).toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit' });
  return diff === 0 ? `Hôm nay · ${base}` : diff === 1 ? `Ngày mai · ${base}` : base;
};
const monday = () => { const x = new Date(); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x.getTime(); };
const SWAP: Record<string, [any, string]> = { PENDING: ['warn', 'Đang chờ duyệt đổi ca'], APPROVED: ['ok', 'Đã duyệt đổi ca'], REJECTED: ['neutral', 'Đổi ca bị từ chối'] };

/** "Ca làm của tôi" — published shifts, this week's hours, and the shift-swap request the spec gives staff (§6.5 5C step 3). */
export function MySchedule() {
  const q = useGet<any[]>('/me/shifts');
  return (
    <>
      <PageHeader title="Ca làm của tôi" sub="Lịch do quản lý cơ sở xuất bản. Cần đổi ca? Gửi yêu cầu để quản lý duyệt." />
      <Async q={q} skeleton={<div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}</div>}>{(all) => {
        const now = Date.now();
        const upcoming = all.filter((s) => new Date(s.ends_at).getTime() >= now);
        const past = all.filter((s) => new Date(s.ends_at).getTime() < now).slice(-5).reverse();
        const wkStart = monday(), wkEnd = wkStart + 7 * DAY;
        const wk = all.filter((s) => new Date(s.starts_at).getTime() >= wkStart && new Date(s.starts_at).getTime() < wkEnd);
        const wkHours = Math.round(wk.reduce((a, s) => a + hours(s), 0) * 10) / 10;
        const next = upcoming[0];
        const live = next && new Date(next.starts_at).getTime() <= now;
        const groups = upcoming.reduce<Record<string, any[]>>((m, s) => { (m[dayLabel(s.starts_at)] ??= []).push(s); return m; }, {});
        const pending = all.filter((s) => s.swaps?.some((w: any) => w.status === 'PENDING')).length;
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <KPI label={live ? 'Đang trong ca' : 'Ca kế tiếp'} value={next ? `${hhmm(next.starts_at)}–${hhmm(next.ends_at)}` : '—'} sub={next ? `${dayLabel(next.starts_at).split(' · ')[0]} · ${next.facility?.name ?? ''}` : 'Chưa có ca nào sắp tới'} tone={live ? 'ok' : undefined} />
              <KPI label="Giờ làm tuần này" value={`${wkHours} giờ`} sub={`${wk.length} ca`} tone={wkHours > 48 ? 'bad' : undefined} />
              <KPI label="Ca sắp tới" value={upcoming.length} sub="Đã được xuất bản" />
              <KPI label="Yêu cầu đổi ca" value={pending} sub={pending ? 'Đang chờ quản lý duyệt' : 'Không có yêu cầu chờ'} tone={pending ? 'warn' : undefined} />
            </div>

            {upcoming.length === 0 ? (
              <Card><EmptyState icon={<CalendarClock className="size-6" />} title="Chưa có ca nào sắp tới" hint="Khi quản lý cơ sở xuất bản lịch, ca của bạn sẽ hiện ở đây và bạn nhận thông báo." /></Card>
            ) : (
              <div className="space-y-5">{Object.entries(groups).map(([label, list]) => (
                <section key={label}>
                  <h2 className="mb-2 text-sm font-semibold text-steel-600">{label}</h2>
                  <div className="space-y-2">{list.map((x) => {
                    const sw = x.swaps?.slice().sort((a: any, b: any) => +new Date(b.created_at) - +new Date(a.created_at))[0];
                    const pend = sw?.status === 'PENDING';
                    const started = new Date(x.starts_at).getTime() <= now;
                    return (
                      <Card key={x.id} className={cn('flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-3.5', started && 'border-ok-600/40')}>
                        <div className="min-w-[8.5rem]"><p className="flex items-center gap-1.5 text-lg font-bold num"><Clock className="size-4 text-steel-400" />{hhmm(x.starts_at)}–{hhmm(x.ends_at)}</p><p className="text-xs text-steel-500">{Math.round(hours(x) * 10) / 10} giờ</p></div>
                        <div className="min-w-0 flex-1 text-sm"><p className="font-semibold">{ROLE_L[x.role_on_shift] ?? x.role_on_shift}</p><p className="flex items-center gap-1 truncate text-steel-500"><MapPin className="size-3.5 shrink-0" />{x.facility?.name}</p>{x.note && <p className="mt-0.5 text-xs text-steel-500">Ghi chú: {x.note}</p>}</div>
                        {started && <Badge tone="ok" dot>Đang diễn ra</Badge>}
                        {sw && <Badge tone={SWAP[sw.status]?.[0] ?? 'neutral'}>{SWAP[sw.status]?.[1] ?? sw.status}</Badge>}
                        {!started && !pend && <ActBtn label="Xin đổi ca" icon={<Repeat className="size-4" />} size="sm" title="Xin đổi ca" description={`${label} · ${hhmm(x.starts_at)}–${hhmm(x.ends_at)}. Quản lý cơ sở sẽ nhận thông báo để duyệt.`} fields={[{ name: 'reason', label: 'Lý do', type: 'textarea', required: true, maxLength: 255, placeholder: 'Ví dụ: trùng lịch khám, việc gia đình…', min: 0 }]} confirmLabel="Gửi yêu cầu" run={(v) => post('/shift-swaps', { shiftId: x.id, reason: String(v.reason).trim() })} ok="Đã gửi yêu cầu đổi ca" invalidate={['/me/shifts']} />}
                      </Card>
                    );
                  })}</div>
                </section>
              ))}</div>
            )}

            {past.length > 0 && <Card><CardHead title="Ca gần đây" sub="5 ca đã làm gần nhất" />
              <ul className="divide-y divide-steel-100 text-sm">{past.map((x) => <li key={x.id} className="flex flex-wrap items-center gap-3 px-5 py-2.5"><span className="w-40 shrink-0 text-steel-600">{new Date(x.starts_at).toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' })}</span><span className="num">{hhmm(x.starts_at)}–{hhmm(x.ends_at)}</span><span className="text-steel-500">{ROLE_L[x.role_on_shift] ?? x.role_on_shift} · {x.facility?.name}</span></li>)}</ul></Card>}
          </div>
        );
      }}</Async>
    </>
  );
}
