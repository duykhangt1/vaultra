import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Plus, Send, Search, Copy, Phone, Mail, X } from 'lucide-react';
import { useGet } from '@/lib/hooks';
import { post, del } from '@/lib/api';
import { Async, Card, CardHead, PageHeader, Button, Badge, Input, EmptyState, StatusBadge, Alert, Avatar, Drawer, Skeleton, cn } from '@/ui';
import { fmtDate, fmtDateTime } from '@/lib/format';
import { ActBtn, KPI } from '../kit';
import { useFacility } from '../shared/Ops';
import { toast } from '@/ui/toast';

const ROLE_L: Record<string, string> = { COUNTER: 'Quầy', FLOOR: 'Hiện trường', ON_CALL: 'Trực' };
const MAX_WEEK_H = 48; // same limit the API warns on
const DAY = 864e5;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const monday = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const hhmm = (d: string | Date) => new Date(d).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
const hours = (s: any) => (new Date(s.ends_at).getTime() - new Date(s.starts_at).getTime()) / 36e5;
const uid = (x: any) => x?.public_id ?? x?.id;
const sameDay = (a: string | Date, b: Date) => new Date(a).toDateString() === b.toDateString();
const roleLabel = (r: string) => (r === 'FACILITY_MANAGER' ? 'Quản lý' : 'Nhân viên');

/* ───────────────────────── Nhân viên ───────────────────────── */
export function StaffList() {
  const { id, facility } = useFacility();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<any>(null);
  const q = useGet<any[]>(id ? `/facilities/${id}/staff` : null);
  const week = useMemo(() => monday(new Date()), []);
  // full instants of local Monday 00:00 → next Monday 00:00 (date-only strings are read as UTC and would drop Sunday evening in UTC+7)
  const sh = useGet<any>(id ? `/facilities/${id}/shifts` : null, { from: week.toISOString(), to: new Date(week.getTime() + 7 * DAY).toISOString() });
  const tasks = useGet<any>(id ? '/tasks' : null);
  const now = Date.now();
  const shifts: any[] = sh.data?.shifts ?? [];
  const myShifts = (s: any) => shifts.filter((x) => uid(x.user) === s.id && x.status !== 'CANCELLED');
  const today = (s: any) => {
    const list = myShifts(s).filter((x) => sameDay(x.starts_at, new Date()));
    const on = list.find((x) => new Date(x.starts_at).getTime() <= now && new Date(x.ends_at).getTime() > now);
    if (on) return { tone: 'ok' as const, text: `Đang trực đến ${hhmm(on.ends_at)}` };
    const next = list.find((x) => new Date(x.starts_at).getTime() > now);
    if (next) return { tone: 'info' as const, text: `Ca ${hhmm(next.starts_at)}–${hhmm(next.ends_at)}` };
    return list.length ? { tone: 'neutral' as const, text: 'Đã hết ca' } : { tone: 'neutral' as const, text: 'Không có ca' };
  };
  const weekHours = (s: any) => Math.round(myShifts(s).reduce((a, x) => a + hours(x), 0) * 10) / 10;
  const rows = (q.data ?? []).filter((s) => !search || `${s.fullName} ${s.email} ${s.phone ?? ''}`.toLowerCase().includes(search.toLowerCase()));
  const onShift = (q.data ?? []).filter((s) => today(s).tone === 'ok').length;
  const openTasks = (q.data ?? []).reduce((a, s) => a + (s.openTasks ?? 0), 0);
  const withPct = (q.data ?? []).filter((s) => s.onTimePct !== null && s.onTimePct !== undefined);
  const avgOnTime = withPct.length ? Math.round(withPct.reduce((a, s) => a + s.onTimePct, 0) / withPct.length) : null;
  return (
    <>
      <PageHeader title="Nhân viên" sub={`Đội ngũ tại ${facility?.name ?? 'cơ sở'}: lịch trực, khối lượng việc và hiệu suất 30 ngày`} actions={<><Link to="/manage/schedule"><Button variant="outline" size="sm">Xếp lịch ca</Button></Link><Link to="/manage/reports"><Button variant="outline" size="sm">Báo cáo hiệu suất</Button></Link></>} />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KPI label="Nhân viên" value={q.data?.length ?? '—'} sub="Gồm quản lý cơ sở" />
        <KPI label="Đang trực" value={sh.isLoading ? '—' : onShift} sub={onShift ? 'Có người tại cơ sở' : 'Hiện không có ai trong ca'} tone={sh.isLoading || onShift ? undefined : 'warn'} />
        <KPI label="Việc đang mở" value={q.data ? openTasks : '—'} sub="Đã giao, đang làm hoặc bị chặn" />
        <KPI label="Đúng hạn 30 ngày" value={avgOnTime === null ? '—' : `${avgOnTime}%`} sub="Trung bình các nhân viên có việc xong" tone={avgOnTime === null ? undefined : avgOnTime >= 90 ? 'ok' : avgOnTime >= 70 ? 'warn' : 'bad'} />
      </div>
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b hairline p-3">
          <div className="relative w-full max-w-xs"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-steel-400" /><Input className="pl-9" placeholder="Tìm tên, email, số điện thoại" aria-label="Tìm nhân viên" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
          <span className="ml-auto text-xs text-steel-500">{rows.length} / {q.data?.length ?? 0} người</span>
        </div>
        <Async q={q} skeleton={<div className="space-y-2 p-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>}>{() => rows.length === 0 ? <EmptyState title={search ? 'Không có nhân viên phù hợp' : 'Chưa có nhân viên'} hint={search ? 'Thử từ khóa khác hoặc xóa bộ lọc.' : 'Quản trị hệ thống tạo tài khoản nhân viên và gán vào cơ sở này.'} action={search ? <Button variant="outline" size="sm" onClick={() => setSearch('')}>Xóa bộ lọc</Button> : undefined} /> : (
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead><tr className="whitespace-nowrap border-b hairline text-left text-xs uppercase tracking-wider text-steel-500"><th className="px-4 py-2.5">Nhân viên</th><th className="px-4 py-2.5">Hôm nay</th><th className="hidden px-4 py-2.5 text-right md:table-cell">Giờ tuần này</th><th className="px-4 py-2.5 text-right">Việc mở</th><th className="hidden px-4 py-2.5 text-right lg:table-cell">Xong 30 ngày</th><th className="hidden px-4 py-2.5 text-right lg:table-cell">Phiếu 30 ngày</th></tr></thead>
            <tbody>{rows.map((s) => { const t = today(s); const wh = weekHours(s); return (
              <tr key={s.id} tabIndex={0} onClick={() => setOpen(s)} onKeyDown={(e) => e.key === 'Enter' && setOpen(s)} className="cursor-pointer border-b hairline last:border-0 hover:bg-paper focus:bg-paper focus:outline-none">
                <td className="px-4 py-3"><div className="flex items-center gap-3"><Avatar name={s.fullName} size={34} /><div className="min-w-0"><p className="truncate font-semibold">{s.fullName}</p><p className="truncate text-xs text-steel-500">{roleLabel(s.roles?.[0])}{s.phone ? ` · ${s.phone}` : ''}</p></div>{s.status !== 'ACTIVE' && <StatusBadge kind="user" value={s.status} />}</div></td>
                <td className="px-4 py-3"><Badge tone={t.tone} dot={t.tone === 'ok'}>{t.text}</Badge></td>
                <td className={cn('hidden px-4 py-3 text-right num md:table-cell', wh > MAX_WEEK_H && 'font-bold text-bad-600')}>{wh ? `${wh} giờ` : '—'}</td>
                <td className="px-4 py-3 text-right num">{s.openTasks ?? 0}</td>
                <td className="hidden px-4 py-3 text-right lg:table-cell"><span className="num">{s.tasksDone30d ?? 0}</span>{s.onTimePct !== null && s.onTimePct !== undefined && <Badge className="ml-2" tone={s.onTimePct >= 90 ? 'ok' : s.onTimePct >= 70 ? 'warn' : 'bad'}>{s.onTimePct}% đúng hạn</Badge>}</td>
                <td className="hidden px-4 py-3 text-right num lg:table-cell">{s.ticketsResolved30d ?? 0}</td>
              </tr>); })}</tbody>
          </table></div>
        )}</Async>
      </Card>

      <Drawer open={!!open} onClose={() => setOpen(null)} title={open?.fullName ?? ''} width={460}>
        {open && (() => {
          const mine = myShifts(open).sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at));
          const my = (tasks.data?.data ?? []).filter((t: any) => (uid(t.assignee) === open.id || t.assignee?.full_name === open.fullName) && !['DONE', 'CANCELLED'].includes(t.status));
          return (
            <div className="space-y-6">
              <div className="flex items-center gap-3"><Avatar name={open.fullName} size={48} /><div><p className="font-bold">{open.fullName}</p><p className="text-sm text-steel-500">{(open.roles ?? []).map(roleLabel).join(' · ')}</p></div></div>
              <div className="flex flex-wrap gap-2 text-sm">{open.phone && <a className="inline-flex items-center gap-1.5 rounded-lg border hairline px-3 py-1.5 hover:bg-paper" href={`tel:${open.phone}`}><Phone className="size-4" />{open.phone}</a>}<a className="inline-flex items-center gap-1.5 rounded-lg border hairline px-3 py-1.5 hover:bg-paper" href={`mailto:${open.email}`}><Mail className="size-4" />{open.email}</a></div>
              <div className="grid grid-cols-3 gap-3 text-center">
                {[['Việc đang mở', open.openTasks ?? 0], ['Xong 30 ngày', open.tasksDone30d ?? 0], ['Phiếu đã xử lý', open.ticketsResolved30d ?? 0]].map(([l, v]) => <div key={l as string} className="rounded-xl bg-paper p-3"><p className="text-2xl font-bold num">{v}</p><p className="text-[11px] text-steel-500">{l}</p></div>)}
              </div>
              <section><h3 className="mb-2 text-sm font-semibold">Ca trong tuần này <span className="font-normal text-steel-500">· {weekHours(open)} giờ</span></h3>
                {mine.length ? <ul className="divide-y divide-steel-100 rounded-xl border hairline text-sm">{mine.map((x) => <li key={x.id} className="flex items-center gap-3 px-3 py-2"><span className="w-24 shrink-0 font-medium">{new Date(x.starts_at).toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' })}</span><span className="num">{hhmm(x.starts_at)}–{hhmm(x.ends_at)}</span><span className="text-steel-500">{ROLE_L[x.role_on_shift] ?? x.role_on_shift}</span><Badge className="ml-auto" tone={x.status === 'PUBLISHED' ? 'ok' : 'warn'}>{x.status === 'PUBLISHED' ? 'Đã xuất bản' : 'Nháp'}</Badge></li>)}</ul> : <p className="rounded-xl border border-dashed hairline p-4 text-sm text-steel-500">Chưa có ca nào trong tuần. <Link className="font-semibold text-info-600" to="/manage/schedule">Xếp ca</Link></p>}
              </section>
              <section><h3 className="mb-2 text-sm font-semibold">Việc đang làm</h3>
                {my.length ? <ul className="divide-y divide-steel-100 rounded-xl border hairline text-sm">{my.slice(0, 8).map((t: any) => <li key={t.id} className="flex items-center gap-3 px-3 py-2"><span className="min-w-0 flex-1 truncate">{t.title}</span>{t.is_overdue && <Badge tone="bad">Quá hạn</Badge>}<StatusBadge kind="task" value={t.status} /></li>)}</ul> : <p className="rounded-xl border border-dashed hairline p-4 text-sm text-steel-500">Không có việc nào đang mở. <Link className="font-semibold text-info-600" to="/manage/tasks">Giao việc</Link></p>}
              </section>
            </div>
          );
        })()}
      </Drawer>
    </>
  );
}

/* ───────────────────────── Lịch ca ───────────────────────── */
export function Schedule() {
  const { id } = useFacility();
  const [week, setWeek] = useState(() => monday(new Date()));
  const from = week.toISOString(), to = new Date(week.getTime() + 7 * DAY).toISOString();
  const q = useGet<any>(id ? `/facilities/${id}/shifts` : null, { from, to }, { keepPrevious: true });
  const prev = useGet<any>(id ? `/facilities/${id}/shifts` : null, { from: new Date(week.getTime() - 7 * DAY).toISOString(), to: from });
  const staff = useGet<any[]>(id ? `/facilities/${id}/staff` : null);
  const tpl = useGet<any[]>(id ? `/facilities/${id}/shift-templates` : null);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => new Date(week.getTime() + i * DAY)), [week]);
  const [copying, setCopying] = useState(false);
  const inv = ['/facilities', '/shifts'];
  const shifts: any[] = (q.data?.shifts ?? []).filter((s: any) => s.status !== 'CANCELLED');
  const planned = shifts.filter((s) => s.status === 'PLANNED').length;
  const published = shifts.length - planned;
  const swaps = shifts.flatMap((s) => (s.swaps ?? []).map((w: any) => ({ ...w, shift: s })));
  const tplOpts = (tpl.data ?? []).map((t: any) => ({ value: String(t.id), label: `${t.name} (${t.start_time}–${t.end_time})` }));
  const weekHours = (u: string) => Math.round(shifts.filter((s) => uid(s.user) === u).reduce((a, s) => a + hours(s), 0) * 10) / 10;
  const over = (staff.data ?? []).filter((s) => weekHours(s.id) > MAX_WEEK_H);
  const totalHours = Math.round(shifts.reduce((a, s) => a + hours(s), 0));
  const shiftFields = (def: { start?: string; end?: string }) => [
    { name: 'templateId', label: 'Mẫu ca (tùy chọn)', type: 'select' as const, options: tplOpts, hint: 'Chọn mẫu để điền sẵn giờ' },
    { name: 'startTime', label: 'Bắt đầu', required: true, def: def.start ?? '08:00', placeholder: 'HH:MM' },
    { name: 'endTime', label: 'Kết thúc', required: true, def: def.end ?? '17:00', placeholder: 'HH:MM' },
    { name: 'roleOnShift', label: 'Vị trí', type: 'select' as const, required: true, def: 'COUNTER', options: Object.entries(ROLE_L).map(([value, label]) => ({ value, label })) },
    { name: 'note', label: 'Ghi chú', maxLength: 255 },
  ];
  const addShift = (userId: string, date: string) => (v: Record<string, any>) => {
    const t = tpl.data?.find((x: any) => String(x.id) === v.templateId);
    return post(`/facilities/${id}/shifts`, { userId, date, ...v, startTime: t ? t.start_time : v.startTime, endTime: t ? t.end_time : v.endTime, templateId: v.templateId || undefined, note: v.note || undefined });
  };
  // copy last week's roster onto this week; the server still enforces overlaps, and warns above 48 h
  const copyLastWeek = async () => {
    const src = (prev.data?.shifts ?? []).filter((s: any) => s.status !== 'CANCELLED');
    if (!src.length) return toast.err('Tuần trước chưa có ca nào để sao chép');
    setCopying(true);
    let ok = 0, skipped = 0;
    for (const s of src) {
      const d = new Date(new Date(s.starts_at).getTime() + 7 * DAY);
      try {
        await post(`/facilities/${id}/shifts`, { userId: uid(s.user), date: iso(d), startTime: hhmm(s.starts_at), endTime: hhmm(s.ends_at), roleOnShift: s.role_on_shift, templateId: s.template_id ? String(s.template_id) : undefined });
        ok++;
      } catch { skipped++; }
    }
    setCopying(false);
    toast.ok(`Đã sao chép ${ok} ca${skipped ? ` · bỏ qua ${skipped} ca trùng hoặc không hợp lệ` : ''}`);
    await q.refetch();
  };
  return (
    <>
      <PageHeader title="Lịch ca" sub="Xếp ca theo nhân viên, xuất bản để nhân viên nhận thông báo" actions={<div className="flex flex-wrap gap-2">
        <ActBtn label="Thêm mẫu ca" icon={<Plus className="size-4" />} title="Mẫu ca" fields={[{ name: 'name', label: 'Tên', required: true, maxLength: 60 }, { name: 'startTime', label: 'Bắt đầu (HH:MM)', required: true, def: '08:00' }, { name: 'endTime', label: 'Kết thúc (HH:MM)', required: true, def: '17:00' }]} run={(v) => post(`/facilities/${id}/shift-templates`, v)} ok="Đã thêm mẫu ca" invalidate={['/shift-templates']} />
        <Button variant="outline" size="sm" icon={<Copy className="size-4" />} loading={copying} disabled={!staff.data?.length} onClick={copyLastWeek}>Sao chép tuần trước</Button>
        <ActBtn label={`Xuất bản (${planned})`} variant="primary" icon={<Send className="size-4" />} disabled={!planned} title="Xuất bản lịch ca" description={`${planned} ca nháp trong tuần này sẽ được gửi thông báo cho nhân viên.`} run={() => post('/shifts/publish', { facilityId: id, from: week.toISOString(), to: new Date(week.getTime() + 7 * DAY).toISOString() })} ok="Đã xuất bản lịch ca" invalidate={inv} />
      </div>} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" aria-label="Tuần trước" onClick={() => setWeek(new Date(week.getTime() - 7 * DAY))}><ChevronLeft className="size-4" /></Button>
        <b className="min-w-44 text-center text-sm">{fmtDate(week)} – {fmtDate(days[6])}</b>
        <Button variant="outline" size="sm" aria-label="Tuần sau" onClick={() => setWeek(new Date(week.getTime() + 7 * DAY))}><ChevronRight className="size-4" /></Button>
        <Button variant="ghost" size="sm" onClick={() => setWeek(monday(new Date()))}>Tuần này</Button>
        <div className="ml-auto flex flex-wrap items-center gap-2 text-xs text-steel-600"><Badge tone="ok">{published} đã xuất bản</Badge><Badge tone="warn">{planned} nháp</Badge><span className="num">{totalHours} giờ</span></div>
      </div>

      {q.data?.uncoveredAppointments?.length > 0 && <div className="mb-4"><Alert tone="warn" title={`${q.data.uncoveredAppointments.length} lịch hẹn chưa có nhân viên trực`}>{q.data.uncoveredAppointments.slice(0, 6).map((a: any) => fmtDateTime(a.start)).join(' · ')}{q.data.uncoveredAppointments.length > 6 ? ' …' : ''}. Thêm ca bao trùm khung giờ đó.</Alert></div>}
      {over.length > 0 && <div className="mb-4"><Alert tone="bad" title={`${over.length} nhân viên vượt ${MAX_WEEK_H} giờ/tuần`}>{over.map((s) => `${s.fullName} (${weekHours(s.id)} giờ)`).join(' · ')}. Giảm bớt ca hoặc đổi người.</Alert></div>}

      <Card className="overflow-hidden">
        <Async q={q} skeleton={<div className="space-y-2 p-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}</div>}>{() => staff.data === undefined ? <div className="space-y-2 p-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}</div> : !staff.data.length ? <EmptyState title="Chưa có nhân viên để xếp ca" hint="Quản trị hệ thống cần gán nhân viên vào cơ sở này." /> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[860px] table-fixed border-collapse text-xs">
            <thead><tr className="border-b hairline bg-paper text-left uppercase tracking-wider text-steel-500">
              <th className="w-40 px-3 py-2.5 font-semibold">Nhân viên</th>
              {days.map((d) => <th key={d.toISOString()} className={cn('px-2 py-2.5 font-semibold', sameDay(d, new Date()) && 'text-brass-700')}>{d.toLocaleDateString('vi-VN', { weekday: 'short' })}<span className="block font-normal normal-case tracking-normal">{d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}</span></th>)}
              <th className="w-16 px-2 py-2.5 text-right font-semibold">Giờ</th>
            </tr></thead>
            <tbody>{staff.data!.map((s) => { const wh = weekHours(s.id); return (
              <tr key={s.id} className="border-b hairline align-top last:border-0">
                <td className="px-3 py-2.5"><div className="flex items-center gap-2"><Avatar name={s.fullName} size={26} /><div className="min-w-0"><p className="truncate text-[13px] font-semibold">{s.fullName}</p><p className="text-[11px] text-steel-500">{roleLabel(s.roles?.[0])}</p></div></div></td>
                {days.map((d) => {
                  const cell = shifts.filter((x) => uid(x.user) === s.id && sameDay(x.starts_at, d));
                  return (
                    <td key={d.toISOString()} className={cn('px-1.5 py-1.5', sameDay(d, new Date()) && 'bg-brass-50/60')}>
                      <div className="space-y-1">
                        {cell.map((x) => (
                          <div key={x.id} className={cn('group relative rounded-md border px-1.5 py-1', x.status === 'PUBLISHED' ? 'border-ink-900/15 bg-white' : 'border-dashed border-warn-600/60 bg-warn-100/60')}>
                            <span className="block whitespace-nowrap font-semibold num">{hhmm(x.starts_at)}–{hhmm(x.ends_at)}</span>
                            <span className="block text-[11px] text-steel-600">{ROLE_L[x.role_on_shift] ?? x.role_on_shift}{x.status === 'PLANNED' ? ' · nháp' : ''}</span>
                            <span className="absolute right-0.5 top-0.5 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100"><ActBtn ariaLabel="Hủy ca" label={<X className="size-3.5" />} danger variant="ghost" size="xs" title="Hủy ca" description={`Hủy ca ${hhmm(x.starts_at)}–${hhmm(x.ends_at)} của ${s.fullName}?${x.status === 'PUBLISHED' ? ' Nhân viên sẽ được thông báo.' : ''}`} confirmLabel="Hủy ca" run={() => del(`/shifts/${x.id}`)} ok="Đã hủy ca" invalidate={inv} /></span>
                            {x.swaps?.length > 0 && <Badge tone="warn" className="mt-1">Xin đổi ca</Badge>}
                          </div>
                        ))}
                        <ActBtn ariaLabel={`Thêm ca cho ${s.fullName}`} label={<Plus className="size-3.5" />} variant="ghost" size="xs" className="w-full justify-center border border-dashed border-transparent text-steel-400 hover:border-steel-300 hover:text-ink-900" title={`Thêm ca · ${s.fullName}`} description={d.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit' })} fields={shiftFields({})} run={addShift(s.id, iso(new Date(d.getTime() - d.getTimezoneOffset() * 6e4)))} ok="Đã thêm ca" invalidate={inv} />
                      </div>
                    </td>
                  );
                })}
                <td className={cn('px-2 py-2.5 text-right num', wh > MAX_WEEK_H ? 'font-bold text-bad-600' : 'text-steel-600')}>{wh || '—'}</td>
              </tr>); })}</tbody>
          </table></div>
        )}</Async>
      </Card>

      {swaps.length > 0 && <Card className="mt-6"><CardHead title="Yêu cầu đổi ca" sub={`${swaps.length} yêu cầu chờ duyệt`} />
        <ul className="divide-y divide-steel-100">{swaps.map((w) => <li key={w.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm"><span className="min-w-0 flex-1"><b>{w.shift.user.full_name}</b><span className="text-steel-500"> · {new Date(w.shift.starts_at).toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' })} {hhmm(w.shift.starts_at)}–{hhmm(w.shift.ends_at)}</span>{w.reason && <span className="block text-xs text-steel-500">Lý do: {w.reason}</span>}</span>
          <ActBtn label="Duyệt" variant="primary" size="xs" run={() => post(`/shift-swaps/${w.id}/decide`, { approve: true })} ok="Đã duyệt đổi ca" invalidate={inv} /><ActBtn label="Từ chối" danger size="xs" title="Từ chối đổi ca" description="Nhân viên giữ nguyên ca hiện tại." confirmLabel="Từ chối" run={() => post(`/shift-swaps/${w.id}/decide`, { approve: false })} ok="Đã từ chối" invalidate={inv} /></li>)}</ul></Card>}
    </>
  );
}
