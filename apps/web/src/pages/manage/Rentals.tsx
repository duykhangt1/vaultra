import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FileText, QrCode } from 'lucide-react';
import { useGet, useAct } from '@/lib/hooks';
import { post, patch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Async, Card, CardHead, PageHeader, PagedTable, StatusBadge, Button, Alert, Select, Input, Tabs, Modal, Badge, Timeline, EmptyState, DataTable } from '@/ui';
import { vnd, fmtDate, fmtEndDate, fmtDateTime, relTime, enumLabel, transitionText } from '@/lib/format';
import { ActBtn, Info, Money, REASON, ReservationQrCard, PhotoGallery } from '../kit';
import { useFacility } from '../shared/Ops';
import { SignedContractDocsCard, SignedContractDocsModal, ContractInspectionsCard } from '../app/Contracts';


function dedupePortalDepositFeesRecords<T extends { id: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const item of items) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      unique.push(item);
    }
  }
  return unique;
}

const DYNAMIC_DAILY_SETTLEMENT_DEFAULTS = {
  holdDurationMinutes: 30,
  autoOverlockEnabled: true,
  reminderLeadDays: 7,
} as const;
export function ManageReservations() {
  const nav = useNavigate();
  const { id: fid } = useFacility();
  const [status, setStatus] = useState(''); const [qs, setQs] = useState(''); const [alloc, setAlloc] = useState<any>(null);
  const [detailRes, setDetailRes] = useState<any>(null);
  const detailQ = useGet<any>(detailRes ? `/reservations/${detailRes.id}` : null);
  return (
    <>
      <PageHeader title="Đặt chỗ" sub="Gán kho, xem mã QR đơn hàng và ảnh chụp check-in của từng đặt chỗ" />
      <Card><PagedTable path="/reservations" query={{ facilityId: fid ?? undefined, status: status || undefined, q: qs || undefined }} onRow={(r: any) => setDetailRes(r)}
        toolbar={<div className="flex flex-wrap gap-2 border-b hairline p-3"><Input className="w-52" placeholder="Mã đặt chỗ / khách" value={qs} onChange={(e) => setQs(e.target.value)} aria-label="Tìm" /><Select className="w-52" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Trạng thái"><option value="">Mọi trạng thái</option>{['PENDING_PAYMENT', 'CONFIRMED', 'UNIT_ASSIGNED', 'MOVE_IN_SCHEDULED', 'CHECKED_IN', 'CANCELLED', 'EXPIRED', 'NO_SHOW'].map((s) => <option key={s} value={s}>{enumLabel(s)}</option>)}</Select></div>}
        cols={[{ key: 'c', header: 'Mã', cell: (r: any) => <span className="code font-semibold">{r.code}</span> }, { key: 'k', header: 'Khách', cell: (r: any) => <>{r.customer?.full_name}<span className="block text-xs text-steel-500">{r.customer?.phone}</span></> }, { key: 'u', header: 'Loại kho', hideBelow: 'md', cell: (r: any) => r.unit_type?.name }, { key: 'd', header: 'Bắt đầu', hideBelow: 'sm', cell: (r: any) => fmtDate(r.start_date) }, { key: 'k2', header: 'Kho', hideBelow: 'md', cell: (r: any) => r.allocations?.[0]?.unit?.code ?? '—' }, { key: 's', header: 'Trạng thái', cell: (r: any) => <StatusBadge kind="reservation" value={r.status} /> }, { key: 'a', header: '', cell: (r: any) => (
          <span className="flex gap-1.5">
            <Button size="sm" variant="ghost" icon={<QrCode className="size-3.5" />} onClick={(e) => { e.stopPropagation(); setDetailRes(r); }}>QR & Ảnh</Button>
            {(r.status === 'CONFIRMED' || r.status === 'UNIT_ASSIGNED') && <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setAlloc(r); }}>{r.allocations?.length ? 'Đổi kho' : 'Gán kho'}</Button>}
          </span>
        ) }]} /></Card>
      <AllocModal r={alloc} onClose={() => setAlloc(null)} />
      <Modal open={!!detailRes} onClose={() => setDetailRes(null)} size="lg" title={detailRes ? `Chi tiết đơn đặt chỗ · ${detailRes.code}` : 'Đặt chỗ'} footer={<Button variant="ghost" onClick={() => setDetailRes(null)}>Đóng</Button>}>
        {detailRes && (
          <div className="space-y-4">
            <ReservationQrCard code={detailRes.code} facilityName={detailRes.facility?.name} />
            <Async q={detailQ}>{(r) => (
              <div className="space-y-4">
                <Info rows={[['Khách hàng', `${r.customer?.full_name ?? ''} · ${r.customer?.phone ?? ''}`], ['Loại kho', r.unit_type?.name], ['Kho được gán', r.allocations?.[0]?.unit?.code ?? 'Chưa gán'], ['Trạng thái', enumLabel(r.status)]]} />
                {Array.isArray(r.identityVerification?.photos) && r.identityVerification.photos.length > 0 && (
                  <PhotoGallery photos={r.identityVerification.photos} label={`Ảnh CCCD khách hàng đã chụp lúc Check-in (${r.identityVerification.document_type ?? 'CCCD'} ••••${r.identityVerification.document_last4 ?? ''})`} />
                )}
                {Array.isArray(r.inspectionPhotos) && r.inspectionPhotos.length > 0 && (
                  <PhotoGallery photos={r.inspectionPhotos} label="Ảnh kiểm tra hiện trạng kho lúc Check-in" />
                )}
              </div>
            )}</Async>
          </div>
        )}
      </Modal>
    </>
  );
}

function AllocModal({ r, onClose }: { r: any; onClose: () => void }) {
  const sug = useGet<any[]>(r ? `/reservations/${r.id}/allocation-suggestions` : null);
  const [pick, setPick] = useState(''); const [reason, setReason] = useState('');
  const m = useAct(() => post(`/reservations/${r.id}/allocate`, { unitId: pick, reason: reason || undefined }), { ok: 'Đã gán kho', invalidate: ['/reservations'], onSuccess: onClose });
  return (
    <Modal open={!!r} onClose={onClose} title={`Gán kho cho ${r?.code ?? ''}`} description="Gợi ý theo ưu tiên phân bổ, thời gian trống và vị trí" footer={<><Button variant="ghost" onClick={onClose}>Đóng</Button><Button variant="primary" disabled={!pick} loading={m.isPending} onClick={() => m.mutate(undefined)}>Gán kho</Button></>}>
      <Async q={sug}>{(s) => s.length ? <div className="space-y-2" role="radiogroup">{s.map((u) => <button key={u.id} role="radio" aria-checked={pick === u.id} onClick={() => setPick(u.id)} className={`block w-full rounded-xl border p-3 text-left ${pick === u.id ? 'border-ink-900 bg-paper' : 'border-steel-300'}`}><p className="font-bold">#{u.rank} · Kho {u.code} <span className="font-normal text-steel-500">· {u.zone} (tầng {u.floor})</span></p><ul className="mt-1 list-disc pl-5 text-xs text-steel-500">{u.reasons.map((x: string) => <li key={x}>{x}</li>)}</ul></button>)}</div> : <Alert tone="warn" title="Không còn kho trống phù hợp">Thử đổi kho từ danh sách kho hoặc liên hệ khách để đổi loại kho.</Alert>}</Async>
      {r?.allocations?.length > 0 && <div className="mt-3"><Input placeholder="Lý do đổi kho (nếu có)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={255} /></div>}
    </Modal>
  );
}

export function ManageContracts({ renewals }: { renewals?: boolean }) {
  const nav = useNavigate();
  const { id: fid } = useFacility();
  const [status, setStatus] = useState(renewals ? 'ACTIVE' : ''); const [qs, setQs] = useState(''); const [exp, setExp] = useState(renewals ? '60' : '');
  const [pdfModalContract, setPdfModalContract] = useState<any | null>(null);
  return (
    <>
      <PageHeader title={renewals ? 'Gia hạn sắp đến' : 'Hợp đồng'} sub={renewals ? 'Hợp đồng hết hạn trong thời gian tới' : 'Theo dõi hợp đồng và xem các văn bản PDF khách hàng đã ký'} />
      <Card><PagedTable path="/contracts" query={{ facilityId: fid ?? undefined, status: status || undefined, q: qs || undefined, expiringInDays: exp || undefined }} empty={<EmptyState title={renewals ? `Không có hợp đồng nào hết hạn trong ${exp} ngày tới` : 'Không có hợp đồng phù hợp'} hint={renewals ? 'Thử chọn khoảng dài hơn (180 hoặc 365 ngày) hoặc đổi trạng thái.' : 'Thử đổi trạng thái hoặc xóa từ khóa tìm kiếm.'} />} onRow={(r: any) => nav(`/manage/contracts/${r.id}`)}
        toolbar={<div className="flex flex-wrap gap-2 border-b hairline p-3"><Input className="w-52" placeholder="Mã HĐ / khách / kho" value={qs} onChange={(e) => setQs(e.target.value)} aria-label="Tìm" /><Select className="w-48" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Trạng thái"><option value="">Mọi hợp đồng</option>{['ACTIVE', 'MOVE_OUT_SCHEDULED', 'EXPIRED', 'CLOSED', 'TERMINATED'].map((s) => <option key={s} value={s}>{enumLabel(s)}</option>)}</Select>{renewals && <Select className="w-44" value={exp} onChange={(e) => setExp(e.target.value)} aria-label="Hết hạn trong"><option value="30">Trong 30 ngày</option><option value="60">Trong 60 ngày</option><option value="90">Trong 90 ngày</option><option value="180">Trong 180 ngày</option><option value="365">Trong 365 ngày</option></Select>}</div>}
        cols={[{ key: 'c', header: 'Hợp đồng', cell: (r: any) => <span className="code font-semibold">{r.code}</span> }, { key: 'k', header: 'Khách', cell: (r: any) => r.customer?.full_name }, { key: 'u', header: 'Kho', hideBelow: 'sm', cell: (r: any) => r.unit?.code }, { key: 'e', header: 'Hết hạn', hideBelow: 'sm', cell: (r: any) => fmtEndDate(r.effective_end_date) }, { key: 'r', header: 'Tiền thuê', hideBelow: 'md', cell: (r: any) => <Money v={r.monthly_rent} /> }, { key: 'd', header: 'Thanh toán', hideBelow: 'md', cell: (r: any) => <StatusBadge kind="delinquency" value={r.delinquency_status} /> }, { key: 's', header: 'Trạng thái', cell: (r: any) => <StatusBadge kind="contract" value={r.status} /> }, { key: 'pdf', header: 'Hồ sơ & Ảnh Check-in', cell: (r: any) => <Button size="sm" variant="outline" icon={<FileText className="size-3.5" />} onClick={(e) => { e.stopPropagation(); setPdfModalContract(r); }}>Xem PDF & Ảnh check-in</Button> }]} /></Card>
      <SignedContractDocsModal contract={pdfModalContract} onClose={() => setPdfModalContract(null)} />
    </>
  );
}

export function ManageContractDetail() {
  const { id } = useParams();
  const can = useAuth((s) => s.can);
  const q = useGet<any>(`/contracts/${id}`);
  const inv = useGet<any>('/invoices', { contractId: id, 'page[size]': 20 });
  const acc = useGet<any>(`/contracts/${id}/access`);
  const fees = useGet<any[]>('/fee-types');
  return (
    <Async q={q}>{(c) => (
      <>
        <PageHeader back="/manage/contracts" title={<span>Hợp đồng <span className="code">{c.code}</span></span>} sub={`${c.customer?.full_name} · Kho ${c.unit?.code} · ${c.unit_type?.name}`} actions={<><StatusBadge kind="delinquency" value={c.delinquency_status} /><StatusBadge kind="contract" value={c.status} /></>} />
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <div className="space-y-6">
            <Card><CardHead title="Điều khoản" /><div className="p-5"><Info rows={[['Bắt đầu', fmtDate(c.start_date)], ['Hết hạn', fmtDate(c.termsSummary?.endDate)], ['Còn lại', `${c.termsSummary?.daysLeft} ngày`], ['Tiền thuê', vnd(c.monthly_rent)], ['Kỳ thanh toán', c.billing_mode === 'MONTHLY' ? `Hàng tháng (ngày ${c.billing_day})` : 'Trả trước cả kỳ'], ['Tự động gia hạn', c.auto_renew ? 'Bật' : 'Tắt'], ['Chặn gia hạn', c.renewal_blocked ? c.renewal_blocked_reason ?? 'Có' : 'Không'], ['Dư nợ', c.debt > 0 ? vnd(c.debt) : undefined], ['Liên hệ khách', `${c.customer?.phone ?? ''} · ${c.customer?.email ?? ''}`]]} /></div></Card>
            <ContractInspectionsCard contractId={c.id} />
            <SignedContractDocsCard contractId={c.id} contractCode={c.code} contractStatus={c.status} />
            <Card><CardHead title="Hóa đơn" /><Async q={inv}>{(d) => <DataTable rows={d.data} rowKey={(r: any) => r.id} cols={[{ key: 'c', header: 'Mã', cell: (r: any) => <span className="code font-semibold">{r.code}</span> }, { key: 'd', header: 'Hạn', cell: (r: any) => fmtDate(r.due_date) }, { key: 'b', header: 'Còn nợ', cell: (r: any) => <Money v={r.balance_due} strong /> }, { key: 's', header: '', cell: (r: any) => <StatusBadge kind="invoice" value={r.status} /> }, { key: 'x', header: '', cell: (r: any) => ['ISSUED', 'OVERDUE', 'PARTIALLY_PAID'].includes(r.status) && can('charge.adjust', true) ? <span className="flex gap-1"><ActBtn label="Giảm trừ" title="Tạo ghi có (credit note)" fields={[{ name: 'amount', label: 'Số tiền', type: 'money', required: true }, REASON]} run={(v) => post(`/invoices/${r.id}/credit-notes`, v)} ok="Đã giảm trừ" invalidate={['/invoices', '/contracts']} /></span> : null }]} />}</Async></Card>
            <Card><CardHead title="Truy cập" /><Async q={acc}>{(a) => <ul className="divide-y divide-steel-100 text-sm">{a.credentials.length ? a.credentials.map((cr: any) => <li key={cr.id} className="flex items-center gap-3 px-5 py-3"><span className="flex-1"><b>{cr.type}</b> <span className="code text-steel-500">{cr.type === 'PIN_CODE' ? '••••••' : cr.identifier}</span></span><Badge tone={cr.status === 'ACTIVE' ? 'ok' : 'neutral'}>{cr.status}</Badge>{cr.status === 'ACTIVE' && can('access.manage', true) && <ActBtn label="Thu hồi" danger title="Thu hồi phương tiện truy cập" fields={[REASON]} run={(v) => post(`/access-credentials/${cr.id}/revoke`, v)} ok="Đã thu hồi" invalidate={['/contracts']} />}</li>) : <li className="px-5 py-6 text-center text-steel-500">Chưa cấp</li>}</ul>}</Async></Card>
          </div>
          <aside className="space-y-4">
            <Card className="flex flex-col gap-2 p-4">
              {can('charge.adjust', true) && ['ACTIVE', 'MOVE_OUT_SCHEDULED', 'EXPIRED'].includes(c.status) && <ActBtn label="Thêm khoản phí" title="Thêm khoản phí vào hợp đồng" fields={[{ name: 'feeTypeId', label: 'Loại phí', type: 'select', required: true, options: (fees.data ?? []).filter((f: any) => f.active).map((f: any) => ({ value: f.id, label: `${f.name}${f.calc_type === 'FIXED' ? ` — ${vnd(f.amount)}` : ''}` })) }, { name: 'amount', label: 'Số tiền (chỉ khi loại phí cho phép sửa)', type: 'money' }, { name: 'note', label: 'Ghi chú', type: 'textarea' }]} run={(v) => post(`/contracts/${c.id}/charges`, v)} ok="Đã thêm phí" invalidate={['/invoices', '/contracts']} />}
              {can('contract.amend', true) && c.status === 'ACTIVE' && <ActBtn label={c.renewal_blocked ? 'Bỏ chặn gia hạn' : 'Chặn gia hạn'} title="Cập nhật chặn gia hạn" fields={[REASON]} run={(v) => post(`/contracts/${c.id}/renewal-block`, { blocked: !c.renewal_blocked, ...v })} ok="Đã cập nhật" invalidate={['/contracts']} />}
              {can('contract.amend', true) && ['ACTIVE', 'EXPIRED', 'MOVE_OUT_SCHEDULED'].includes(c.status) && <ActBtn label="Chấm dứt hợp đồng" danger title="Chấm dứt hợp đồng" description="Hành động này bắt đầu quy trình thu hồi kho." fields={[{ name: 'terminationReason', label: 'Loại', type: 'select', required: true, options: [{ value: 'MUTUAL', label: 'Thỏa thuận' }, { value: 'FACILITY_CLOSURE', label: 'Đóng cơ sở' }, { value: 'OTHER', label: 'Khác' }] }, REASON]} run={(v) => post(`/contracts/${c.id}/terminate`, v)} ok="Đã chấm dứt" invalidate={['/contracts']} />}
            </Card>
            <Card><CardHead title="Lịch sử" /><div className="max-h-80 overflow-y-auto p-5"><Timeline items={c.history?.map((h: any) => ({ title: transitionText('contract', h.from_status, h.to_status), sub: h.reason, at: fmtDateTime(h.created_at) })) ?? []} /></div></Card>
          </aside>
        </div>
      </>)}</Async>
  );
}

interface BoundedSupportTicketAllocModalPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateBoundedSupportTicketAllocModalInput(payload: BoundedSupportTicketAllocModalPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}
