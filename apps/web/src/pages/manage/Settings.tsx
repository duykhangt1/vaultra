import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useGet, useAct } from '@/lib/hooks';
import { post, put, patch, del } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Async, Card, CardHead, PageHeader, Button, Badge, Field, Input, Textarea, Select, Switch, Tabs, DataTable, EmptyState } from '@/ui';
import { fmtDate, fmtDateTime } from '@/lib/format';
import { ActBtn } from '../kit';
import { useFacility } from '../shared/Ops';
import { WeekHours, hoursError, type Hours } from '@/widgets/WeekHours';

const WD = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
const TYPE_L: Record<string, string> = { MOVE_IN: 'Nhận kho', MOVE_OUT: 'Trả kho', BOTH: 'Cả hai' };

export function FacilitySettings() {
  const { id } = useFacility();
  const q = useGet<any>(id ? `/facilities/${id}` : null);
  const [tab, setTab] = useState('info');
  return (
    <>
      <PageHeader title="Cài đặt cơ sở" sub={q.data?.name} />
      <Tabs className="mb-4" value={tab} onChange={setTab} tabs={[{ value: 'info', label: 'Thông tin' }, { value: 'zones', label: 'Khu' }, { value: 'slots', label: 'Khung giờ hẹn' }, { value: 'closures', label: 'Ngày đóng cửa' }, { value: 'notices', label: 'Thông báo' }]} />
      <Async q={q}>{(f) => tab === 'info' ? <Info f={f} /> : tab === 'zones' ? <Zones f={f} /> : tab === 'slots' ? <Slots f={f} /> : tab === 'closures' ? <Closures f={f} /> : <Notices f={f} />}</Async>
    </>
  );
}

function Info({ f }: { f: any }) {
  const [v, setV] = useState<any>(() => ({ phone: f.phone ?? '', email: f.email ?? '', hotline: f.hotline ?? '', officeHours: (f.office_hours && typeof f.office_hours === 'object' ? f.office_hours : {}) as Hours, accessHours: (f.access_hours && typeof f.access_hours === 'object' ? f.access_hours : {}) as Hours, description: f.description ?? '', autoAssign: !!f.auto_assign, autoDispatch: !!f.auto_dispatch }));
  const set = (k: string, x: any) => setV((s: any) => ({ ...s, [k]: x }));
  const save = useAct(() => patch(`/facilities/${f.id}`, { ...v, email: v.email || undefined, phone: v.phone || undefined, hotline: v.hotline || undefined }), { ok: 'Đã lưu thông tin', invalidate: ['/facilities'] });
  return (
    <Card className="p-4"><div className="grid gap-3 sm:grid-cols-2">
      <Field label="Điện thoại"><Input value={v.phone} maxLength={20} onChange={(e) => set('phone', e.target.value)} /></Field>
      <Field label="Hotline"><Input value={v.hotline} maxLength={20} onChange={(e) => set('hotline', e.target.value)} /></Field>
      <Field label="Email liên hệ"><Input type="email" value={v.email} onChange={(e) => set('email', e.target.value)} /></Field>
      <div className="sm:col-span-2 grid gap-3 2xl:grid-cols-2"><WeekHours label="Giờ làm việc văn phòng" hint="Quầy tiếp khách và hỗ trợ trực tiếp." value={v.officeHours} onChange={(h) => set('officeHours', h)} /><WeekHours label="Giờ ra vào kho" hint="Khách dùng mã PIN ra vào trong khung giờ này; hiển thị trên trang khách thuê." value={v.accessHours} onChange={(h) => set('accessHours', h)} /></div>
      <div className="sm:col-span-2"><Field label="Mô tả"><Textarea rows={4} value={v.description} onChange={(e) => set('description', e.target.value)} /></Field></div>
      <Switch checked={v.autoAssign} onChange={(x) => set('autoAssign', x)} label="Tự động phân kho khi xác nhận đơn" />
      <Switch checked={v.autoDispatch} onChange={(x) => set('autoDispatch', x)} label="Tự động giao việc cho nhân viên" />
    </div><div className="mt-4 flex justify-end"><Button variant="primary" loading={save.isPending} disabled={!!hoursError(v.officeHours) || !!hoursError(v.accessHours)} onClick={() => save.mutate(undefined)}>Lưu thay đổi</Button></div>
    <p className="mt-3 text-xs text-steel-500">Tên, địa chỉ, tọa độ và trạng thái cơ sở do Quản lý vận hành kinh doanh quản lý.</p></Card>
  );
}

function Zones({ f }: { f: any }) {
  const inv = ['/facilities'];
  const fields = (z?: any) => [{ name: 'code', label: 'Mã khu', required: !z, def: z?.code, maxLength: 16 }, { name: 'name', label: 'Tên', required: true, def: z?.name, maxLength: 100 }, { name: 'floor', label: 'Tầng', type: 'number' as const, required: true, def: z?.floor ?? 1, min: -5, max: 50 }, { name: 'hasElevator', label: '', type: 'check' as const, placeholder: 'Có thang máy', def: z?.has_elevator }, { name: 'driveUp', label: '', type: 'check' as const, placeholder: 'Xe vào tận cửa', def: z?.drive_up }, { name: 'climateControlled', label: '', type: 'check' as const, placeholder: 'Điều hòa', def: z?.climate_controlled }];
  const body = (v: any, edit: boolean) => { const b: any = { name: v.name, floor: +v.floor, hasElevator: !!v.hasElevator, driveUp: !!v.driveUp, climateControlled: !!v.climateControlled }; if (!edit) b.code = v.code; return b; };
  return (
    <>
      <div className="mb-3"><ActBtn label="Thêm khu" icon={<Plus className="size-4" />} variant="primary" title="Thêm khu" fields={fields()} run={(v) => post(`/facilities/${f.id}/zones`, body(v, false))} ok="Đã thêm khu" invalidate={inv} /></div>
      <Card><DataTable rows={f.zones} rowKey={(z: any) => z.id} empty={<EmptyState title="Chưa có khu" />}
        cols={[{ key: 'n', header: 'Khu', cell: (z: any) => <><b>{z.name}</b><span className="block text-xs text-steel-500 code">{z.code}</span></> }, { key: 'f', header: 'Tầng', cell: (z: any) => z.floor }, { key: 'a', header: 'Tiện ích', hideBelow: 'sm', cell: (z: any) => [z.has_elevator && 'Thang máy', z.drive_up && 'Drive-up', z.climate_controlled && 'Điều hòa'].filter(Boolean).join(' · ') || '—' }, { key: 'x', header: '', cell: (z: any) => <ActBtn label="Sửa" size="xs" title={`Sửa ${z.name}`} fields={fields(z).filter((x) => x.name !== 'code')} run={(v) => patch(`/zones/${z.id}`, body(v, true))} ok="Đã lưu" invalidate={inv} /> }]} /></Card>
    </>
  );
}

function Slots({ f }: { f: any }) {
  const init = (f.slots ?? []).filter((s: any) => s.active).map((s: any) => ({ type: s.type, weekday: s.weekday, startTime: s.start_time, endTime: s.end_time, capacity: s.capacity, active: true }));
  const [rows, setRows] = useState<any[]>(init);
  const set = (i: number, k: string, x: any) => setRows((r) => r.map((y, j) => (j === i ? { ...y, [k]: x } : y)));
  const bad = rows.some((r) => !r.startTime || !r.endTime || r.endTime <= r.startTime || !(r.capacity >= 1));
  const save = useAct(() => put(`/facilities/${f.id}/appointment-slot-rules`, rows.map((r) => ({ ...r, capacity: +r.capacity }))), { ok: 'Đã lưu khung giờ', invalidate: ['/facilities'] });
  return (
    <Card className="p-4">
      <p className="mb-3 text-sm text-steel-600">Mỗi khung giờ có sức chứa tối đa (số lịch hẹn đồng thời). Khách chỉ đặt được trong các khung này.</p>
      <div className="space-y-2">{rows.length === 0 && <EmptyState title="Chưa có khung giờ" hint="Khách chưa thể đặt lịch nhận/trả kho." />}
        {rows.map((r, i) => <div key={i} className="grid grid-cols-2 items-end gap-2 rounded-xl border hairline p-2 sm:grid-cols-6">
          <Field label="Thứ"><Select value={r.weekday} onChange={(e) => set(i, 'weekday', +e.target.value)}>{WD.map((d, k) => <option key={k} value={k}>{d}</option>)}</Select></Field>
          <Field label="Loại"><Select value={r.type} onChange={(e) => set(i, 'type', e.target.value)}>{Object.entries(TYPE_L).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
          <Field label="Từ"><Input type="time" value={r.startTime} onChange={(e) => set(i, 'startTime', e.target.value)} /></Field>
          <Field label="Đến" error={r.endTime <= r.startTime ? 'Phải sau giờ bắt đầu' : undefined}><Input type="time" value={r.endTime} onChange={(e) => set(i, 'endTime', e.target.value)} /></Field>
          <Field label="Sức chứa"><Input type="number" min={1} max={50} value={r.capacity} onChange={(e) => set(i, 'capacity', e.target.value)} /></Field>
          <Button variant="ghost" aria-label="Xóa khung" onClick={() => setRows((x) => x.filter((_, j) => j !== i))}><Trash2 className="size-4" /></Button></div>)}</div>
      <div className="mt-3 flex flex-wrap justify-between gap-2"><Button variant="outline" icon={<Plus className="size-4" />} onClick={() => setRows((r) => [...r, { type: 'BOTH', weekday: 1, startTime: '08:00', endTime: '09:00', capacity: 2, active: true }])}>Thêm khung</Button><Button variant="primary" disabled={bad} loading={save.isPending} onClick={() => save.mutate(undefined)}>Lưu khung giờ</Button></div>
    </Card>
  );
}

function Closures({ f }: { f: any }) {
  const inv = ['/facilities'];
  return (
    <>
      <div className="mb-3"><ActBtn label="Thêm ngày đóng cửa" icon={<Plus className="size-4" />} variant="primary" title="Ngày đóng cửa" fields={[{ name: 'date', label: 'Ngày', type: 'date', required: true }, { name: 'reason', label: 'Lý do', required: true, maxLength: 255 }]} run={(v) => post(`/facilities/${f.id}/closures`, v)} ok="Đã thêm" invalidate={inv} /></div>
      <Card><DataTable rows={f.closures} rowKey={(c: any) => c.id ?? c.date} empty={<EmptyState title="Không có ngày đóng cửa" />}
        cols={[{ key: 'd', header: 'Ngày', cell: (c: any) => <b>{fmtDate(c.date)}</b> }, { key: 'r', header: 'Lý do', cell: (c: any) => c.reason }, { key: 'x', header: '', cell: (c: any) => <ActBtn label="Xóa" size="xs" danger title="Xóa ngày đóng cửa" description="Khách sẽ đặt lịch được vào ngày này trở lại." run={() => del(`/facilities/${f.id}/closures/${String(c.date).slice(0, 10)}`)} ok="Đã xóa" invalidate={inv} /> }]} /></Card>
    </>
  );
}

function Notices({ f }: { f: any }) {
  const inv = ['/facilities'];
  const SEV: Record<string, any> = { INFO: ['info', 'Thông tin'], WARNING: ['warn', 'Cảnh báo'], CRITICAL: ['danger', 'Khẩn'] };
  const now = Date.now();
  return (
    <>
      <div className="mb-3"><ActBtn label="Đăng thông báo" icon={<Plus className="size-4" />} variant="primary" title="Thông báo cho khách đang thuê" description="Gửi tới mọi khách có hợp đồng đang hiệu lực tại cơ sở này." fields={[{ name: 'title', label: 'Tiêu đề', required: true, maxLength: 200 }, { name: 'body', label: 'Nội dung', type: 'textarea', required: true, maxLength: 5000 }, { name: 'severity', label: 'Mức độ', type: 'select', required: true, def: 'INFO', options: [{ value: 'INFO', label: 'Thông tin' }, { value: 'WARNING', label: 'Cảnh báo (kèm email)' }, { value: 'CRITICAL', label: 'Khẩn (kèm email)' }] }]} run={(v) => post(`/facilities/${f.id}/notices`, v)} ok="Đã đăng thông báo" invalidate={inv} /></div>
      <Card><DataTable rows={f.notices} rowKey={(n: any) => n.id} empty={<EmptyState title="Chưa có thông báo" />}
        cols={[{ key: 't', header: 'Thông báo', cell: (n: any) => <><b>{n.title}</b><span className="line-clamp-2 block text-xs text-steel-500">{n.body}</span></> }, { key: 's', header: 'Mức độ', hideBelow: 'sm', cell: (n: any) => <Badge tone={SEV[n.severity]?.[0]}>{SEV[n.severity]?.[1]}</Badge> }, { key: 'd', header: 'Từ', hideBelow: 'md', cell: (n: any) => fmtDateTime(n.starts_at) }, { key: 'x', header: '', cell: (n: any) => !n.ends_at || new Date(n.ends_at).getTime() > now ? <ActBtn label="Kết thúc" size="xs" run={() => del(`/facility-notices/${n.id}`)} ok="Đã kết thúc" invalidate={inv} /> : <Badge>Đã kết thúc</Badge> }]} /></Card>
    </>
  );
}
