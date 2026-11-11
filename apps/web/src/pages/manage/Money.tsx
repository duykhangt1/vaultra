import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useGet, useAct } from '@/lib/hooks';
import { post } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Async, Card, CardHead, PageHeader, PagedTable, StatusBadge, Tabs, Badge, DataTable, EmptyState, Button } from '@/ui';
import { vnd, fmtDate, fmtDateTime } from '@/lib/format';
import { ActBtn, Money, REASON } from '../kit';
import { useFacility } from '../shared/Ops';
import { getMoveOutStatusBadge } from '../staff/MoveOut';

const REFUND_REASON_LABELS: Record<string, string> = {
  DEPOSIT_RETURN: 'Hoàn tiền cọc trả kho',
  PREPAID_RETURN: 'Hoàn tiền thuê trả trước',
  CANCELLATION: 'Hoàn tiền hủy đặt kho',
  OVERPAYMENT: 'Hoàn tiền đóng thừa',
  DUPLICATE_CHARGE: 'Hoàn tiền thu trùng',
  GOODWILL: 'Hoàn tiền hỗ trợ thiện chí',
  LATE_WEBHOOK: 'Hoàn tiền giao dịch trễ',
};

const REFUND_METHOD_LABELS: Record<string, string> = {
  CASH: 'Tiền mặt tại quầy',
  BANK_TRANSFER: 'Tiền mặt tại quầy',
  ORIGINAL_METHOD: 'Phương thức gốc',
};

const REFUND_STATUS_LABELS: Record<string, string> = {
  PENDING_APPROVAL: 'Chờ FM/BOOM duyệt',
  APPROVED: 'Đã duyệt — Chờ chi tiền mặt',
  MANUAL_REQUIRED: 'Đã duyệt — Chờ chi tiền mặt',
  SUCCEEDED: 'Đã hoàn tiền mặt',
  REJECTED: 'Đã từ chối',
  FAILED: 'Lỗi xử lý',
};

export function Approvals({ ops }: { ops?: boolean }) {
  // a link from the overview can open a given tab (?tab=waivers | price); anything else opens the refunds tab
  const [tab, setTab] = useState(() => { const t = new URLSearchParams(window.location.search).get('tab'); return t === 'waivers' || (ops && t === 'price') ? t : 'refunds'; });
  const can = useAuth((s) => s.can);
  const ref = useGet<any>('/refunds', { status: 'PENDING_APPROVAL,APPROVED,MANUAL_REQUIRED', 'page[size]': 50 });
  const mo = useGet<any>('/move-out-requests', { status: 'COMPLETED,DISPUTED', 'page[size]': 30 });
  const wv = useGet<any>('/fee-waivers', { status: 'PENDING', 'page[size]': 50 });
  const pcr = useGet<any[]>(ops ? '/price-change-requests' : null, { status: 'PENDING' });
  const inv = ['/refunds', '/fee-waivers', '/price-change-requests', '/move-out-requests', '/dashboard'];
  const cashAct = useAct(
    (id: string) => post(`/refunds/${id}/mark-manual`, { reference: 'Đã chi tiền mặt tại quầy' }),
    { ok: 'Đã xác nhận chi tiền mặt cho khách', invalidate: inv }
  );
  const base = ops ? '/ops' : '/manage';

  return (
    <>
      <PageHeader title="Phê duyệt & Hoàn tiền" sub="Các khoản hoàn tiền trả kho, miễn phí và điều chỉnh đang chờ xử lý" />
      <Tabs className="mb-4" value={tab} onChange={setTab} tabs={[{ value: 'refunds', label: 'Hoàn tiền trả kho', count: ref.data?.data.length || undefined }, { value: 'waivers', label: 'Miễn phí', count: wv.data?.data.length || undefined }, ...(ops ? [{ value: 'price', label: 'Đổi giá', count: pcr.data?.length || undefined }] : [])]} />
      {tab === 'refunds' && (
        <div className="space-y-6">
          <Card>
            <CardHead title="Khoản hoàn tiền mặt đang xử lý" sub="FM/BOOM duyệt khoản hoàn tiền, sau đó nhân viên chi tiền mặt tại quầy cho khách" />
            <DataTable
              pageSize={10}
              rows={ref.data?.data}
              loading={ref.isLoading}
              error={ref.error}
              rowKey={(r: any) => r.id}
              empty={<EmptyState title="Không có khoản hoàn tiền nào đang chờ" hint="Bạn cũng có thể kiểm tra trực tiếp trong mục Trả kho bên dưới." />}
              cols={[
                {
                  key: 'c',
                  header: 'Nội dung hoàn tiền',
                  cell: (r: any) => (
                    <>
                      <b>{REFUND_REASON_LABELS[r.reason] ?? r.reason}</b>
                      <span className="block text-xs text-steel-500">{r.note}</span>
                    </>
                  ),
                },
                { key: 'a', header: 'Số tiền hoàn', cell: (r: any) => <Money v={r.amount} strong /> },
                { key: 'm', header: 'Hình thức', hideBelow: 'md', cell: (r: any) => REFUND_METHOD_LABELS[r.method] ?? r.method },
                {
                  key: 'st',
                  header: 'Trạng thái',
                  cell: (r: any) => (
                    <Badge tone={r.status === 'PENDING_APPROVAL' ? 'warn' : 'ok'}>
                      {REFUND_STATUS_LABELS[r.status] ?? r.status}
                    </Badge>
                  ),
                },
                { key: 'd', header: 'Ngày tạo', hideBelow: 'sm', cell: (r: any) => fmtDate(r.created_at) },
                {
                  key: 'x',
                  header: '',
                  cell: (r: any) =>
                    r.status === 'PENDING_APPROVAL' ? (
                      can('refund.approve', true) ? (
                        <span className="flex gap-1">
                          <ActBtn
                            label="✓ Duyệt chi tiền mặt"
                            variant="primary"
                            title="Duyệt hoàn tiền mặt"
                            description={`Xác nhận đồng ý xuất quỹ tiền mặt hoàn ${vnd(r.amount)} cho khách.`}
                            fields={[{ name: 'note', label: 'Ghi chú (tùy chọn)', type: 'textarea' }]}
                            run={(v) => post(`/refunds/${r.id}/approve`, v)}
                            ok="Đã duyệt chi tiền mặt"
                            invalidate={inv}
                          />
                          <ActBtn
                            label="Từ chối"
                            danger
                            title="Từ chối hoàn tiền"
                            fields={[{ name: 'note', label: 'Lý do', type: 'textarea', required: true }]}
                            run={(v) => post(`/refunds/${r.id}/reject`, v)}
                            ok="Đã từ chối"
                            invalidate={inv}
                          />
                        </span>
                      ) : (
                        <Badge tone="warn">Chờ FM/BOOM duyệt</Badge>
                      )
                    ) : (
                      <Button size="sm" variant="primary" loading={cashAct.isPending} onClick={() => cashAct.mutate(r.id)}>
                        💵 Xác nhận đã chi tiền mặt
                      </Button>
                    ),
                },
              ]}
            />
          </Card>

          {(mo.data?.data?.length ?? 0) > 0 && (
            <Card>
              <CardHead title="Hồ sơ trả kho & quyết toán gần đây" sub="Bấm vào từng hồ sơ để xem bảng tính chi tiết, duyệt quyết toán hoặc xác nhận hoàn tiền mặt" />
              <DataTable
                pageSize={10}
                rows={mo.data?.data}
                loading={mo.isLoading}
                rowKey={(r: any) => r.id}
                cols={[
                  {
                    key: 'c',
                    header: 'Hợp đồng / Khách hàng',
                    cell: (r: any) => (
                      <>
                        <span className="code font-semibold">{r.contract?.code}</span>
                        <span className="block text-xs text-steel-500">{r.contract?.customer?.full_name}</span>
                      </>
                    ),
                  },
                  { key: 'u', header: 'Kho', cell: (r: any) => `${r.contract?.unit?.code ?? ''} · ${r.contract?.facility?.name ?? ''}` },
                  { key: 'n', header: 'Số tiền hoàn', cell: (r: any) => <Money v={r.estimated_settlement?.net ?? 0} strong /> },
                  {
                    key: 'st',
                    header: 'Trạng thái',
                    cell: (r: any) => {
                      const matched = (ref.data?.data ?? []).find((rf: any) => (r.contract?.code && rf.note?.includes(r.contract.code)) || (r.contract?.id && (rf.contract?.id === r.contract.id || rf.contract_id === r.contract.id)));
                      return getMoveOutStatusBadge(r, matched, r.settlement);
                    },
                  },
                  { key: 'd', header: 'Ngày trả', hideBelow: 'sm', cell: (r: any) => fmtDate(r.requested_date) },
                  {
                    key: 'x',
                    header: '',
                    cell: (r: any) => (
                      <Link to={`${base}/moveout/${r.id}`}>
                        <Button size="sm" variant="outline">Mở quyết toán & hoàn tiền →</Button>
                      </Link>
                    ),
                  },
                ]}
              />
            </Card>
          )}
        </div>
      )}
      {tab === 'waivers' && <Card><DataTable pageSize={10} rows={wv.data?.data} loading={wv.isLoading} error={wv.error} rowKey={(r: any) => r.id} empty={<EmptyState title="Không có yêu cầu miễn phí" />}
        cols={[{ key: 'c', header: 'Lý do', cell: (r: any) => r.reason }, { key: 'a', header: 'Số tiền', cell: (r: any) => <Money v={r.amount} strong /> }, { key: 'd', header: 'Ngày', hideBelow: 'sm', cell: (r: any) => fmtDate(r.created_at) }, { key: 'x', header: '', cell: (r: any) => can('fee_waiver.approve', true) ? <span className="flex gap-1"><ActBtn label="Duyệt" variant="primary" run={() => post(`/fee-waivers/${r.id}/decide`, { approve: true })} ok="Đã duyệt" invalidate={inv} /><ActBtn label="Từ chối" danger title="Từ chối miễn phí" fields={[{ name: 'note', label: 'Lý do', type: 'textarea', required: true }]} run={(v) => post(`/fee-waivers/${r.id}/decide`, { approve: false, ...v })} invalidate={inv} /></span> : null }]} /></Card>}
      {tab === 'price' && <Card><DataTable pageSize={10} rows={pcr.data} loading={pcr.isLoading} rowKey={(r: any) => r.id} empty={<EmptyState title="Không có yêu cầu đổi giá" />}
        cols={[{ key: 'u', header: 'Loại kho', cell: (r: any) => <>{r.unit_type?.name}<span className="block text-xs text-steel-500">{r.unit_type?.facility?.name}</span></> }, { key: 'f', header: 'Trường', cell: (r: any) => r.field }, { key: 'o', header: 'Giá cũ', cell: (r: any) => <Money v={r.current_value} /> }, { key: 'n', header: 'Giá đề xuất', cell: (r: any) => <Money v={r.proposed_value} strong /> }, { key: 'x', header: '', cell: (r: any) => <span className="flex gap-1"><ActBtn label="Duyệt" variant="primary" run={() => post(`/price-change-requests/${r.id}/decide`, { approve: true })} ok="Đã áp dụng giá mới" invalidate={inv} /><ActBtn label="Từ chối" danger title="Từ chối đổi giá" fields={[{ name: 'note', label: 'Lý do', type: 'textarea', required: true }]} run={(v) => post(`/price-change-requests/${r.id}/decide`, { approve: false, ...v })} invalidate={inv} /></span> }]} /></Card>}
    </>
  );
}

export function Payments({ ops }: { ops?: boolean }) {
  const { id } = useFacility();
  const [tab, setTab] = useState('invoices'); const [status, setStatus] = useState('');
  return (
    <>
      <PageHeader title="Hóa đơn & thanh toán" />
      <Tabs className="mb-4" value={tab} onChange={setTab} tabs={[{ value: 'invoices', label: 'Hóa đơn' }, { value: 'payments', label: 'Thanh toán' }]} />
      {tab === 'invoices' ? <Card><PagedTable path="/invoices" query={{ facilityId: ops ? undefined : id ?? undefined, status: status || undefined }}
        toolbar={<div className="border-b hairline p-3"><select aria-label="Trạng thái" className="h-10 rounded-xl border border-steel-300 bg-white px-3 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Mọi trạng thái</option><option value="ISSUED,PARTIALLY_PAID">Chưa trả</option><option value="OVERDUE">Quá hạn</option><option value="PAID">Đã trả</option><option value="VOID">Đã hủy</option></select></div>}
        cols={[{ key: 'c', header: 'Hóa đơn', cell: (r: any) => <span className="code font-semibold">{r.code}</span> }, { key: 'k', header: 'Khách', hideBelow: 'sm', cell: (r: any) => r.customer?.full_name }, { key: 'd', header: 'Hạn', hideBelow: 'md', cell: (r: any) => fmtDate(r.due_date) }, { key: 't', header: 'Tổng', hideBelow: 'md', cell: (r: any) => <Money v={r.total} /> }, { key: 'b', header: 'Còn nợ', cell: (r: any) => <Money v={r.balance_due} strong /> }, { key: 's', header: '', cell: (r: any) => <StatusBadge kind="invoice" value={r.status} /> }]} /></Card>
        : <Card><PagedTable path="/payments" query={{ facilityId: ops ? undefined : id ?? undefined }} cols={[{ key: 'c', header: 'Mã', cell: (r: any) => <span className="code font-semibold">{r.code}</span> }, { key: 'k', header: 'Khách', hideBelow: 'sm', cell: (r: any) => r.customer?.full_name }, { key: 'm', header: 'Hình thức', hideBelow: 'md', cell: (r: any) => r.method }, { key: 'a', header: 'Số tiền', cell: (r: any) => <Money v={r.amount} strong /> }, { key: 'd', header: 'Thời gian', hideBelow: 'md', cell: (r: any) => fmtDateTime(r.paid_at ?? r.created_at) }, { key: 's', header: '', cell: (r: any) => <StatusBadge kind="payment" value={r.status} /> }]} /></Card>}
    </>
  );
}
