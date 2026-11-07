import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Phone, CheckCircle2, Play, Hand, Ban, FileText } from 'lucide-react';
import { useGet, useAct } from '@/lib/hooks';
import { post, patch, del } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Async, Card, CardHead, PageHeader, PagedTable, DataTable, StatusBadge, Button, Select, Input, Modal, Field, Badge, Tabs, EmptyState, Drawer, Alert, Textarea, cn, Skeleton } from '@/ui';
import { vnd, fmtDate, fmtEndDate, fmtDateTime, relTime, STATUS, SIZE_LABEL, transitionText } from '@/lib/format';
import { ActBtn, Info, REASON, Money, FieldDef, PhotoGallery } from '../kit';
import { SignedContractDocsModal } from '../app/Contracts';

export function useFacility() {
  const id = useAuth((s) => s.activeFacilityId);
  const f = useAuth((s) => s.facilities?.find((x) => x.id === id));
  return { id, facility: f };
}

/* ---------------- floor plan ---------------- */
export { FloorPlan } from '@/widgets/FloorPlanView';

/* ---------------- units ---------------- */
export function UnitsTable({ facilityId, canEdit }: { facilityId: string; canEdit?: boolean }) {
  const q = useGet<any[]>(`/facilities/${facilityId}/units`, { 'page[size]': 200 });
  const [status, setStatus] = useState(''); const [search, setSearch] = useState(''); const [sel, setSel] = useState<any>(null);
  const rows = useMemo(() => (q.data ?? []).filter((u) => (!status || (status === 'HELD' ? ['OCCUPIED', 'OVERLOCKED'].includes(u.status) : u.status === status)) && (!search || `${u.code} ${u.unit_type?.name}`.toLowerCase().includes(search.toLowerCase()))), [q.data, status, search]);
  return (
    <>
      <Card>
        <div className="flex flex-wrap gap-2 border-b hairline p-3"><Input className="w-48" placeholder="Tìm mã kho…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Tìm kho" /><Select className="w-60" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Trạng thái"><option value="">Mọi trạng thái</option><option value="HELD">Có khách (thuê + khóa chặn)</option>{Object.entries(STATUS.unit).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</Select><span className="ml-auto self-center text-sm text-steel-500 num">{rows.length} kho</span></div>
        <DataTable rows={rows} loading={q.isLoading} error={q.error} onRetry={q.refetch} rowKey={(u) => u.id} onRow={setSel}
          cols={[{ key: 'c', header: 'Kho', cell: (u) => <span className="code font-semibold">{u.code}</span> }, { key: 't', header: 'Loại', hideBelow: 'sm', cell: (u) => <>{u.unit_type?.name}</> }, { key: 'z', header: 'Khu', hideBelow: 'md', cell: (u) => u.zone?.name }, { key: 'k', header: 'Khách', hideBelow: 'md', cell: (u) => u.contract?.customer_name ?? u.contract?.customer?.full_name ?? '—' }, { key: 's', header: 'Trạng thái', cell: (u) => <StatusBadge kind="unit" value={u.status} /> }, { key: 'f', header: '', hideBelow: 'sm', cell: (u) => u.operational_flag !== 'NONE' && <Badge tone="warn">{u.operational_flag.replace(/_/g, ' ').toLowerCase()}</Badge> }]} />
      </Card>
      <UnitDrawer unit={sel} onClose={() => setSel(null)} />
    </>
  );
}

export function UnitDrawer({ unit, onClose }: { unit: any; onClose: () => void }) {
  const can = useAuth((s) => s.can);
  const hist = useGet<any>(unit ? `/units/${unit.id}/history` : null);
  const detail = useGet<any>(unit ? `/units/${unit.id}` : null);
  const u = detail.data ?? unit;
  const allowed = can('unit.status.update', true);
  return (
    <Drawer open={!!unit} onClose={onClose} title={unit ? `Kho ${unit.code}` : ''}>
      {u && <div className="space-y-5">
        <div className="flex items-center gap-2"><StatusBadge kind="unit" value={u.status} />{u.operational_flag && u.operational_flag !== 'NONE' && <Badge tone="warn">{u.operational_flag}</Badge>}</div>
        <Info rows={[['Loại kho', u.unit_type?.name ?? u.type?.name], ['Khu', u.zone?.name], ['Loại cửa', u.door_type], ['Khách', u.contract?.customer?.full_name ?? u.contract?.customer_name], ['Hợp đồng', u.contract?.code], ['Vệ sinh lần cuối', u.cleaned_at && fmtDateTime(u.cleaned_at)], ['Ghi chú', u.notes], ['Lý do trạng thái', u.status_reason]]} />
        {u.maintenance && (
          <div className="rounded-xl border hairline bg-paper p-3 text-sm space-y-2">
            <p className="mb-1 font-bold">Bảo trì</p>
            <Info rows={[['Người phụ trách', u.maintenance.workOrder?.assignee ?? u.maintenance.workOrder?.vendor ?? 'Chưa phân công'], ['Người chuyển bảo trì', u.maintenance.setBy], ['Từ', u.maintenance.since && fmtDateTime(u.maintenance.since)], ['Lý do', u.maintenance.reason], ['Phiếu sửa chữa', u.maintenance.workOrder && `${u.maintenance.workOrder.code} · ${u.maintenance.workOrder.status}`], ['Hẹn xử lý', u.maintenance.workOrder?.scheduledFor && fmtDateTime(u.maintenance.workOrder.scheduledFor)]]} />
            {Array.isArray(u.maintenance.workOrder?.photos) && u.maintenance.workOrder.photos.length > 0 && (
              <PhotoGallery photos={u.maintenance.workOrder.photos} label="Ảnh hiện trạng bảo trì / báo hỏng" size="sm" />
            )}
          </div>)}
        {Array.isArray(u.inspectionPhotos) && u.inspectionPhotos.length > 0 && (
          <div className="rounded-xl border hairline bg-paper p-3">
            <PhotoGallery photos={u.inspectionPhotos} label="Ảnh kiểm tra hiện trạng kho gần nhất" />
          </div>
        )}
        {Array.isArray(u.photos) && u.photos.length > 0 && (
          <div className="rounded-xl border hairline bg-paper p-3">
            <PhotoGallery photos={u.photos} label="Ảnh kho" />
          </div>
        )}
        {allowed && ['AVAILABLE', 'MAINTENANCE', 'OUT_OF_SERVICE'].includes(u.status) && (
          <div className="flex flex-wrap gap-2 border-t hairline pt-4">
            {u.status !== 'MAINTENANCE' && <ActBtn label="Đưa vào bảo trì" title="Đưa kho vào bảo trì" fields={[REASON]} run={(v) => post(`/units/${u.id}/status`, { to: 'MAINTENANCE', ...v })} ok="Đã cập nhật" invalidate={['/units', '/facilities', '/zones']} onDone={onClose} />}
            {u.status !== 'AVAILABLE' && <ActBtn label="Đưa về trạng thái trống" variant="primary" title="Mở lại kho" fields={[REASON]} run={(v) => post(`/units/${u.id}/status`, { to: 'AVAILABLE', ...v })} ok="Đã cập nhật" invalidate={['/units', '/facilities', '/zones']} onDone={onClose} />}
            {u.status === 'AVAILABLE' && <ActBtn label="Ngưng sử dụng" danger title="Ngưng sử dụng kho" description="Kho sẽ không thể được gán cho khách." fields={[REASON, { name: 'confirmShortage', label: '', type: 'check', placeholder: 'Tôi xác nhận kể cả khi làm thiếu kho loại này' }]} run={(v) => post(`/units/${u.id}/status`, { to: 'OUT_OF_SERVICE', ...v })} ok="Đã cập nhật" invalidate={['/units', '/facilities', '/zones']} onDone={onClose} />}
            {can('unit.manage', true) && <ActBtn label="Xóa kho" danger title={`Xóa kho ${u.code}`} description="Kho sẽ bị xóa khỏi danh sách kho và gỡ khỏi sơ đồ mặt bằng." run={() => del(`/units/${u.id}`)} ok="Đã xóa kho" invalidate={['/units', '/facilities', '/zones']} onDone={onClose} />}
          </div>)}
        <div><p className="mb-2 text-sm font-bold">Lịch sử</p><Async q={hist}>{(raw) => { const h: any[] = Array.isArray(raw) ? raw : raw?.status ?? []; return h.length ? <ul className="space-y-2 text-sm">{h.slice(0, 15).map((x: any) => <li key={x.id} className="rounded-lg bg-paper p-2"><b>{transitionText('unit', x.from_status, x.to_status)}</b><span className="block text-xs text-steel-500">{fmtDateTime(x.created_at)} · {x.reason}</span><span className="block text-xs font-semibold text-ink-900">{x.to_status === 'MAINTENANCE' ? 'Người bảo trì / thực hiện' : 'Người thực hiện'}: {x.actor ?? 'Hệ thống'}</span></li>)}</ul> : <p className="text-sm text-steel-500">Chưa có thay đổi trạng thái.</p>; }}</Async></div>
      </div>}
    </Drawer>
  );
}

/* ---------------- tasks ---------------- */
const AUTO_DONE: Record<string, string> = { HANDOVER: 'Tự hoàn thành khi nhân viên hoàn tất bàn giao ở mục Quét / check-in', ALLOCATE_UNIT: 'Tự hoàn thành khi gán kho cho đơn đặt', MOVE_OUT_INSPECTION: 'Tự hoàn thành khi hoàn tất kiểm tra ở mục Trả kho', OVERLOCK: 'Tự hoàn thành khi thực hiện khóa chặn kho', REMOVE_OVERLOCK: 'Tự hoàn thành khi gỡ khóa chặn kho' };
const TASK_TYPE: Record<string, string> = { ALLOCATE_UNIT: 'Gán kho', HANDOVER: 'Bàn giao kho', MOVE_OUT_INSPECTION: 'Kiểm tra trả kho', ROUTINE_INSPECTION: 'Kiểm tra định kỳ', OVERLOCK: 'Khóa chặn kho', REMOVE_OVERLOCK: 'Gỡ khóa chặn', SUPPORT_TICKET: 'Phiếu hỗ trợ', CLEANING: 'Vệ sinh', MAINTENANCE: 'Bảo trì', COLLECTION_CALL: 'Gọi nhắc nợ', OTHER: 'Khác' };
export function TasksPage({ facilityId, manage }: { facilityId: string; manage?: boolean }) {
  const [status, setStatus] = useState('OPEN'); const [mine, setMine] = useState(!manage); const [create, setCreate] = useState(false);
  const q = useGet<{ data: any[] }>('/tasks', { facilityId, status: status === 'OPEN' ? 'OPEN,ASSIGNED,IN_PROGRESS,BLOCKED' : status || undefined, assignee: mine ? 'me' : undefined, 'page[size]': 100 }, { refetchInterval: 30_000 });
  const staff = useGet<any[]>(manage ? `/facilities/${facilityId}/staff` : null);
  const inv = ['/tasks', '/dashboard'];
  return (
    <>
      <PageHeader title="Công việc" sub="Việc được giao và việc chưa có người nhận" actions={manage || true ? <Button variant="primary" size="sm" icon={<Plus className="size-4" />} onClick={() => setCreate(true)}>Tạo việc</Button> : null} />
      <div className="mb-4 flex flex-wrap gap-2"><Tabs value={status} onChange={setStatus} tabs={[{ value: 'OPEN', label: 'Đang mở' }, { value: 'DONE', label: 'Hoàn thành' }, { value: '', label: 'Tất cả' }]} /><label className="ml-auto flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-ink-900" checked={mine} onChange={(e) => setMine(e.target.checked)} />Chỉ việc của tôi</label></div>
      <Async q={q}>{(d) => d.data.length ? <div className="grid gap-3 md:grid-cols-2">{d.data.map((t) => (
        <Card key={t.id} className="p-4">
          <div className="flex items-start justify-between gap-2"><div><p className="font-bold">{t.title}</p><p className="text-xs text-steel-500">{TASK_TYPE[t.type] ?? t.type}{t.unit?.code ? ` · Kho ${t.unit.code}` : ''}{t.due_at ? ` · hạn ${relTime(t.due_at)}` : ''}</p></div><StatusBadge kind="task" value={t.status} /></div>
          {t.description && <p className="mt-2 line-clamp-3 text-sm text-steel-600">{t.description}</p>}
          {Array.isArray(t.photos) && t.photos.length > 0 && (
            <div className="mt-2">
              <PhotoGallery photos={t.photos} label="Ảnh đính kèm / hoàn thành" size="sm" />
            </div>
          )}
          {AUTO_DONE[t.type] && !['DONE', 'CANCELLED'].includes(t.status) && <p className="mt-2 text-xs font-medium text-info-600">{AUTO_DONE[t.type]}.</p>}
          <p className="mt-2 text-xs text-steel-500">{t.assignee?.full_name ? `Phụ trách: ${t.assignee.full_name}` : t.status === 'DONE' ? (t.completed_by?.full_name ? `Hoàn thành bởi: ${t.completed_by.full_name}` : 'Hoàn thành tự động bởi hệ thống') : t.status === 'CANCELLED' ? 'Đã hủy' : 'Chưa có người nhận'}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {t.status === 'OPEN' && <ActBtn label="Nhận việc" variant="primary" icon={<Hand className="size-4" />} run={() => post(`/tasks/${t.id}/claim`)} ok="Đã nhận việc" invalidate={inv} />}
            {['ASSIGNED', 'BLOCKED'].includes(t.status) && <ActBtn label={t.status === 'BLOCKED' ? 'Tiếp tục' : 'Bắt đầu'} icon={<Play className="size-4" />} run={() => post(`/tasks/${t.id}/start`)} invalidate={inv} />}
            {['ASSIGNED', 'IN_PROGRESS', 'BLOCKED'].includes(t.status) && !AUTO_DONE[t.type] && <ActBtn label="Hoàn thành" variant="primary" icon={<CheckCircle2 className="size-4" />} title="Hoàn thành công việc" fields={[{ name: 'note', label: 'Ghi chú kết quả', type: 'textarea' }, { name: 'photoIds', label: t.requires_photo ? 'Ảnh hoàn thành công việc (bắt buộc)' : 'Ảnh hoàn thành công việc', type: 'photos', required: !!t.requires_photo }]} run={(v) => post(`/tasks/${t.id}/complete`, v)} ok="Đã hoàn thành" invalidate={inv} />}
            {['ASSIGNED', 'IN_PROGRESS'].includes(t.status) && <ActBtn label="Bị chặn" icon={<Ban className="size-4" />} title="Báo bị chặn" fields={[{ name: 'reason', label: 'Lý do', type: 'textarea', required: true }]} run={(v) => post(`/tasks/${t.id}/block`, v)} invalidate={inv} />}
            {manage && t.status !== 'DONE' && t.status !== 'CANCELLED' && <ActBtn label="Giao việc" title="Giao việc" fields={[{ name: 'assigneeId', label: 'Nhân viên', type: 'select', required: true, options: (staff.data ?? []).map((s) => ({ value: s.id, label: `${s.fullName ?? s.email}${s.roles?.includes('FACILITY_MANAGER') ? ' (Quản lý)' : ''} · đang giữ ${s.openTasks ?? 0} việc` })) }]} run={(v) => post(`/tasks/${t.id}/assign`, v)} ok="Đã giao việc" invalidate={inv} />}
            {manage && !['DONE', 'CANCELLED'].includes(t.status) && <ActBtn label="Hủy" danger title="Hủy công việc" fields={[{ name: 'reason', label: 'Lý do', type: 'textarea', required: true }]} run={(v) => post(`/tasks/${t.id}/cancel`, v)} invalidate={inv} />}
          </div>
        </Card>))}</div> : <Card><EmptyState title="Không có công việc" hint="Mọi việc đã hoàn tất hoặc chưa có việc nào được giao." /></Card>}</Async>
      <ActBtnModalCreateTask open={create} onClose={() => setCreate(false)} facilityId={facilityId} />
    </>
  );
}
function ActBtnModalCreateTask({ open, onClose, facilityId }: { open: boolean; onClose: () => void; facilityId: string }) {
  const [f, setF] = useState({ type: 'CLEANING', title: '', description: '' });
  const m = useAct(() => post('/tasks', { facilityId, ...f, description: f.description || undefined }), { ok: 'Đã tạo công việc', invalidate: ['/tasks'], onSuccess: () => { onClose(); setF({ type: 'CLEANING', title: '', description: '' }); } });
  return (
    <Modal open={open} onClose={onClose} title="Tạo công việc" footer={<><Button variant="ghost" onClick={onClose}>Đóng</Button><Button variant="primary" disabled={f.title.trim().length < 3} loading={m.isPending} onClick={() => m.mutate(undefined)}>Tạo</Button></>}>
      <div className="space-y-3"><Field label="Loại"><Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{['ROUTINE_INSPECTION', 'CLEANING', 'MAINTENANCE', 'COLLECTION_CALL', 'OTHER'].map((t) => <option key={t} value={t}>{TASK_TYPE[t]}</option>)}</Select></Field><Field label="Tiêu đề" required><Input value={f.title} maxLength={200} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field><Field label="Mô tả"><Textarea rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field></div>
    </Modal>
  );
}

/* ---------------- customers ---------------- */
export function CustomersPage({ base }: { base: string }) {
  const nav = useNavigate();
  const can = useAuth((s) => s.can);
  const [qs, setQs] = useState('');
  return (
    <>
      <PageHeader title="Khách hàng" actions={can('reservation.create') && <ActBtn label="Thêm khách vãng lai" variant="primary" title="Thêm khách vãng lai" fields={[{ name: 'fullName', label: 'Họ tên', required: true }, { name: 'phone', label: 'Số điện thoại', required: true }, { name: 'email', label: 'Email', type: 'email' }]} run={(v) => post('/customers', v)} ok="Đã tạo khách" invalidate={['/customers']} onDone={(c) => nav(`${base}/${c.id}`)} />} />
      <Card><PagedTable path="/customers" query={{ q: qs || undefined }} onRow={(c: any) => nav(`${base}/${c.id}`)} toolbar={<div className="border-b hairline p-3"><Input className="max-w-xs" placeholder="Tìm tên, SĐT, email, mã" value={qs} onChange={(e) => setQs(e.target.value)} aria-label="Tìm khách" /></div>}
        cols={[{ key: 'c', header: 'Khách', cell: (c: any) => <><b>{c.full_name}</b><span className="block text-xs text-steel-500 code">{c.code}</span></> }, { key: 'p', header: 'Liên hệ', hideBelow: 'sm', cell: (c: any) => <>{c.phone}<span className="block text-xs text-steel-500">{c.email}</span></> }, { key: 'k', header: 'Hợp đồng', hideBelow: 'md', cell: (c: any) => c.contract_count ?? c._count?.contracts ?? '—' }, { key: 'd', header: 'Dư nợ', cell: (c: any) => c.debt > 0 ? <Money v={c.debt} strong /> : '—' }]} /></Card>
    </>
  );
}
export function CustomerDetail({ back }: { back: string }) {
  const { id } = useParams();
  const q = useGet<any>(`/customers/${id}`);
  const led = useGet<any>(`/customers/${id}/ledger`);
  const [pdfModalContract, setPdfModalContract] = useState<any | null>(null);
  return (
    <Async q={q}>{(c) => (<>
      <PageHeader back={back} title={c.full_name} sub={<span className="code">{c.code}</span>} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5 space-y-4">
          <Info rows={[['Điện thoại', c.phone], ['Email', c.email], ['Loại', c.type === 'BUSINESS' ? 'Doanh nghiệp' : 'Cá nhân'], ['Công ty', c.company_name], ['Địa chỉ', [c.address_line, c.district, c.province].filter(Boolean).join(', ')], ['Giấy tờ', c.id_document_type && `${c.id_document_type} ••••${c.id_document_last4}`]]} />
          {Array.isArray(c.identityVerifications) && c.identityVerifications.length > 0 && (
            <div className="space-y-3 border-t hairline pt-3">
              <p className="text-xs font-bold uppercase tracking-wider text-steel-600">Hồ sơ CCCD / Giấy tờ tùy thân đã chụp lúc Check-in</p>
              {c.identityVerifications.map((iv: any) => (
                <div key={iv.id} className="rounded-xl border hairline bg-paper p-3 text-xs space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-ink-900">{iv.document_type ?? 'CCCD'} ••••{iv.document_last4 ?? ''} · {iv.verified_name}</span>
                    <span className="text-steel-500">{iv.verified_at ? fmtDateTime(iv.verified_at) : ''}{iv.verified_by?.full_name ? ` · NV: ${iv.verified_by.full_name}` : ''}</span>
                  </div>
                  {Array.isArray(iv.photos) && iv.photos.length > 0 ? (
                    <PhotoGallery photos={iv.photos} size="sm" />
                  ) : (
                    <p className="text-steel-500">Không có ảnh đính kèm.</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card><CardHead title="Công nợ" /><Async q={led}>{(l) => <div className="p-5 text-sm"><Info rows={[['Còn nợ', vnd(l.balance ?? l.outstanding)], ['Đã thanh toán', vnd(l.paid)], ['Cọc đang giữ', vnd(l.deposits)]]} /></div>}</Async></Card>
        <Card className="lg:col-span-2"><CardHead title="Hợp đồng" /><DataTable rows={c.contracts ?? []} rowKey={(x: any) => x.id} cols={[{ key: 'c', header: 'Mã', cell: (x: any) => <span className="code font-semibold">{x.code}</span> }, { key: 'u', header: 'Kho', cell: (x: any) => x.unit?.code }, { key: 'e', header: 'Hết hạn', cell: (x: any) => fmtEndDate(x.effective_end_date) }, { key: 's', header: 'Trạng thái', cell: (x: any) => <StatusBadge kind="contract" value={x.status} /> }, { key: 'pdf', header: 'Hồ sơ & Ảnh Check-in', cell: (x: any) => <Button size="sm" variant="outline" icon={<FileText className="size-3.5" />} onClick={(e) => { e.stopPropagation(); setPdfModalContract({ ...x, customer: c }); }}>Xem PDF & Ảnh check-in</Button> }]} /></Card>
      </div>
      <SignedContractDocsModal contract={pdfModalContract} onClose={() => setPdfModalContract(null)} />
    </>)}</Async>
  );
}

/* ---------------- shifts ---------------- */
export { MySchedule } from '../staff/MySchedule';
