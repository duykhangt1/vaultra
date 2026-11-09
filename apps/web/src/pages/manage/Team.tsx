import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Send } from 'lucide-react';
import { useGet } from '@/lib/hooks';
import { post, patch, del } from '@/lib/api';
import { Async, Card, CardHead, PageHeader, Button, Badge, DataTable, EmptyState, Tabs, StatusBadge, Alert } from '@/ui';
import { fmtDate, fmtDateTime } from '@/lib/format';
import { ActBtn, Money, PhotoGallery } from '../kit';
import { useFacility } from '../shared/Ops';

const CATS = ['DOOR', 'LOCK', 'ELECTRICAL', 'LEAK', 'PEST', 'CLEANING', 'FIRE_SAFETY', 'STRUCTURE', 'OTHER'];
const CAT_L: Record<string, string> = { DOOR: 'Cửa', LOCK: 'Khóa', ELECTRICAL: 'Điện', LEAK: 'Rò rỉ', PEST: 'Côn trùng', CLEANING: 'Vệ sinh', FIRE_SAFETY: 'PCCC', STRUCTURE: 'Kết cấu', OTHER: 'Khác' };
const catOpts = CATS.map((c) => ({ value: c, label: CAT_L[c] }));
const ROLE_L: Record<string, string> = { COUNTER: 'Quầy', FLOOR: 'Hiện trường', ON_CALL: 'Trực' };
const iso = (d: Date) => d.toISOString().slice(0, 10);
const monday = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };

export { StaffList, Schedule } from './Roster';

export function Maintenance() {
  const { id } = useFacility();
  const [tab, setTab] = useState('wo');
  const wo = useGet<any[]>('/work-orders', id ? { facilityId: id } : undefined);
  const plans = useGet<any[]>(id ? `/facilities/${id}/maintenance-plans` : null);
  const staff = useGet<any[]>(id ? `/facilities/${id}/staff` : null);
  const inv = ['/work-orders', '/maintenance-plans', '/facilities', '/units'];
  const list = (wo.data ?? []).filter((w) => !w.facility || !id || w.facility.public_id === id || true);
  const act = (w: any) => {
    const A = (action: string, label: string, extra: any[] = [], variant: any = 'outline', danger = false) => <ActBtn key={action} label={label} size="xs" variant={variant} danger={danger} title={label} fields={extra} run={(v) => post(`/work-orders/${w.id}/${action}`, Object.fromEntries(Object.entries(v).filter(([, x]) => x !== '' && x !== undefined).map(([k, x]) => [k, ['estimatedCost', 'actualCost'].includes(k) ? +(x as any) : x])))} ok="Đã cập nhật" invalidate={inv} />;
    switch (w.status) {
      case 'REPORTED': return [A('approve', 'Duyệt', [{ name: 'estimatedCost', label: 'Chi phí dự kiến', type: 'money' }, { name: 'vendorName', label: 'Nhà thầu', maxLength: 150 }], 'primary'), A('cancel', 'Hủy', [{ name: 'note', label: 'Lý do', type: 'textarea' }], 'outline', true)];
      case 'APPROVED': return [A('schedule', 'Lên lịch', [{ name: 'scheduledFor', label: 'Thời gian', type: 'datetime', required: true }, { name: 'assigneeId', label: 'Người phụ trách', type: 'select', options: (staff.data ?? []).map((s: any) => ({ value: s.id, label: s.fullName ?? s.full_name })) }], 'primary')];
      case 'SCHEDULED': return [A('start', 'Bắt đầu', [], 'primary')];
      case 'IN_PROGRESS': return [A('complete', 'Hoàn thành', [{ name: 'note', label: 'Ghi chú hoàn thành', type: 'textarea' }, { name: 'photoIds', label: 'Ảnh sau sửa chữa', type: 'photos', required: true }], 'primary')];
      case 'COMPLETED': return [A('verify', 'Nghiệm thu', [{ name: 'actualCost', label: 'Chi phí thực tế', type: 'money' }], 'primary')];
      default: return [];
    }
  };
  return (
    <>
      <PageHeader title="Bảo trì" sub="Yêu cầu sửa chữa và kế hoạch bảo trì định kỳ" actions={<ActBtn label="Báo sự cố" icon={<Plus className="size-4" />} variant="primary" title="Tạo yêu cầu sửa chữa" fields={[{ name: 'category', label: 'Loại', type: 'select', required: true, options: catOpts }, { name: 'priority', label: 'Mức độ', type: 'select', required: true, def: 'MEDIUM', options: [{ value: 'LOW', label: 'Thấp' }, { value: 'MEDIUM', label: 'Trung bình' }, { value: 'HIGH', label: 'Cao' }, { value: 'URGENT', label: 'Khẩn' }] }, { name: 'description', label: 'Mô tả', type: 'textarea', required: true, min: 5, maxLength: 5000 }, { name: 'photoIds', label: 'Ảnh hiện trường', type: 'photos' }]} run={(v) => post('/work-orders', { facilityId: id, ...v })} ok="Đã tạo yêu cầu" invalidate={inv} />} />
      <Tabs className="mb-4" value={tab} onChange={setTab} tabs={[{ value: 'wo', label: 'Yêu cầu sửa chữa' }, { value: 'plans', label: 'Bảo trì định kỳ' }]} />
      {tab === 'wo' ? <Card><DataTable rows={list} loading={wo.isLoading} error={wo.error} onRetry={wo.refetch} rowKey={(w: any) => w.id} empty={<EmptyState title="Chưa có yêu cầu sửa chữa" />}
        cols={[{ key: 'c', header: 'Mã', cell: (w: any) => <><span className="code font-semibold">{w.code}</span><span className="block text-xs text-steel-500">{CAT_L[w.category]} {w.unit && `· ${w.unit.code}`}</span></> }, { key: 'd', header: 'Mô tả & Ảnh hiện trường', cell: (w: any) => <div className="space-y-1.5"><span className="line-clamp-2 max-w-md">{w.description}</span>{w.photos?.length > 0 && <PhotoGallery photos={w.photos} size="sm" />}</div> }, { key: 'p', header: 'Mức độ', hideBelow: 'md', cell: (w: any) => <StatusBadge kind="priority" value={w.priority} /> }, { key: 'k', header: 'Chi phí', hideBelow: 'md', cell: (w: any) => w.actual_cost ? <Money v={w.actual_cost} /> : w.estimated_cost ? <span className="text-steel-500"><Money v={w.estimated_cost} /> (dự kiến)</span> : '—' }, { key: 's', header: 'Trạng thái', cell: (w: any) => <StatusBadge kind="generic" value={w.status} /> }, { key: 'a', header: '', cell: (w: any) => <span className="flex flex-wrap gap-1">{act(w)}</span> }]} /></Card>
        : <><div className="mb-3"><ActBtn label="Thêm kế hoạch" icon={<Plus className="size-4" />} title="Kế hoạch bảo trì" fields={[{ name: 'name', label: 'Tên', required: true, maxLength: 150 }, { name: 'category', label: 'Loại', type: 'select', required: true, options: catOpts }, { name: 'intervalDays', label: 'Chu kỳ (ngày)', type: 'number', required: true, def: 90, min: 1 }, { name: 'nextDueDate', label: 'Đến hạn kế tiếp', type: 'date', required: true }]} run={(v) => post(`/facilities/${id}/maintenance-plans`, { ...v, intervalDays: +v.intervalDays })} ok="Đã thêm kế hoạch" invalidate={inv} /></div>
          <Card><DataTable rows={plans.data} loading={plans.isLoading} error={plans.error} rowKey={(p: any) => p.id} empty={<EmptyState title="Chưa có kế hoạch định kỳ" />}
            cols={[{ key: 'n', header: 'Kế hoạch', cell: (p: any) => <><b>{p.name}</b><span className="block text-xs text-steel-500">{CAT_L[p.category]}</span></> }, { key: 'i', header: 'Chu kỳ', hideBelow: 'sm', cell: (p: any) => `${p.interval_days} ngày` }, { key: 'd', header: 'Đến hạn', cell: (p: any) => fmtDate(p.next_due_date) }, { key: 'a', header: '', cell: (p: any) => <ActBtn label={p.active ? 'Tạm dừng' : 'Kích hoạt'} size="xs" run={() => patch(`/maintenance-plans/${p.id}`, { active: !p.active })} invalidate={inv} /> }]} /></Card></>}
    </>
  );
}
