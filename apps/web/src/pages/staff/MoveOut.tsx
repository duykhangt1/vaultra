import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { INSPECTION_ITEMS, INSPECTION_ITEM_LABEL } from '@vaultra/shared';
import { useAuth } from '@/lib/auth';
import { useGet, useAct } from '@/lib/hooks';
import { get, post, newIdemKey } from '@/lib/api';
import { Async, Card, CardHead, PageHeader, PagedTable, DataTable, EmptyState, StatusBadge, Button, Alert, Field, Input, Select, Tabs, Badge, Stepper, MoneyInput, Textarea } from '@/ui';
import { vnd, fmtDate } from '@/lib/format';
import { ActBtn, Info, Money, REASON, PhotoGallery } from '../kit';
import { SignaturePad } from '@/widgets/SignaturePad';
import { PhotoUpload, Photo } from '@/widgets/PhotoUpload';
import { InspectionForm } from './Checkin';
import { ContractInspectionsCard } from '../app/Contracts';

export function getMoveOutStatusBadge(r: any, matchedRefund?: any, settlement?: any) {
  if (!r) return null;
  if (r.status === 'SCHEDULED') return <Badge tone="info" dot>Chờ kiểm tra kho</Badge>;
  if (r.status === 'INSPECTED') return <Badge tone="warn" dot>Chờ ký quyết toán</Badge>;
  if (r.status === 'DISPUTED') return <Badge tone="bad" dot>Đang khiếu nại</Badge>;
  if (r.status === 'CANCELLED') return <Badge tone="neutral" dot>Đã hủy</Badge>;
  if (r.status === 'COMPLETED') {
    const st = settlement ?? r.settlement;
    const refund = matchedRefund ?? r.refund;
    const net = Number(st?.net_amount ?? st?.netAmount ?? r.estimated_settlement?.net ?? 0);
    if (!isNaN(net) && net > 0) {
      if (refund?.status === 'SUCCEEDED') {
        return <Badge tone="ok" dot>Đã hoàn tiền & Hoàn tất</Badge>;
      }
      if (st?.status === 'FINALIZED' || refund?.status === 'APPROVED' || refund?.status === 'MANUAL_REQUIRED') {
        return <Badge tone="warn" dot>Chưa hoàn tiền (Chờ chi tiền mặt)</Badge>;
      }
      return <Badge tone="warn" dot>Chưa hoàn tiền</Badge>;
    }
    return <Badge tone="ok" dot>Hoàn tất</Badge>;
  }
  return <StatusBadge kind="generic" value={r.status} />;
}

export function isMoveOutFullyDone(r: any, matchedRefund?: any, settlement?: any): boolean {
  if (!r || r.status !== 'COMPLETED') return false;
  const st = settlement ?? r.settlement;
  const refund = matchedRefund ?? r.refund;
  const net = Number(st?.net_amount ?? st?.netAmount ?? r.estimated_settlement?.net ?? 0);
  if (!isNaN(net) && net > 0) {
    return refund?.status === 'SUCCEEDED';
  }
  return true;
}

export function MoveOuts({ base = '/staff' }: { base?: string }) {
  const nav = useNavigate();
  const [tab, setTab] = useState<'PENDING' | 'DONE' | 'ALL'>('PENDING');
  const list = useGet<{ data: any[] }>('/move-out-requests', { 'page[size]': 100 }, { staleTime: 0 });
  const refunds = useGet<{ data: any[] }>('/refunds', { 'page[size]': 100 }, { staleTime: 0 });

  const allRows = list.data?.data ?? [];
  const refundRows = refunds.data?.data ?? [];

  const findRefund = (r: any) => {
    if (r?.refund) return r.refund;
    const ccode = r?.contract?.code;
    const cid = r?.contract?.id;
    return refundRows.find(
      (rf: any) =>
        (ccode && rf.note?.includes(ccode)) ||
        (cid && (rf.contract?.id === cid || rf.contract_id === cid))
    );
  };

  const filtered = allRows.filter((r: any) => {
    if (r.status === 'CANCELLED') return tab === 'ALL';
    const done = isMoveOutFullyDone(r, findRefund(r), r.settlement);
    if (tab === 'PENDING') return !done;
    if (tab === 'DONE') return done;
    return true;
  });

  const pendingCount = allRows.filter((r: any) => r.status !== 'CANCELLED' && !isMoveOutFullyDone(r, findRefund(r), r.settlement)).length;
  const doneCount = allRows.filter((r: any) => r.status !== 'CANCELLED' && isMoveOutFullyDone(r, findRefund(r), r.settlement)).length;

  return (
    <>
      <PageHeader title="Trả kho" sub="Yêu cầu trả kho cần kiểm tra, quyết toán và hoàn tiền mặt" />
      <Tabs
        className="mb-4"
        value={tab}
        onChange={(v) => setTab(v as 'PENDING' | 'DONE' | 'ALL')}
        tabs={[
          { value: 'PENDING', label: 'Đang xử lý / Chưa hoàn tiền', count: pendingCount || undefined },
          { value: 'DONE', label: 'Đã hoàn tất', count: doneCount || undefined },
          { value: 'ALL', label: 'Tất cả' },
        ]}
      />
      <Card>
        <DataTable
          pageSize={10}
          pageKey={tab}
          rows={filtered}
          loading={list.isLoading}
          error={list.error}
          rowKey={(r: any) => r.id}
          onRow={(r: any) => nav(`${base}/moveout/${r.id}`)}
          empty={<EmptyState title={tab === 'PENDING' ? 'Không có yêu cầu trả kho nào đang chờ xử lý / hoàn tiền' : 'Không có dữ liệu trả kho'} />}
          cols={[
            {
              key: 'c',
              header: 'Hợp đồng',
              cell: (r: any) => (
                <>
                  <span className="code font-semibold">{r.contract?.code}</span>
                  <span className="block text-xs text-steel-500">{r.contract?.customer?.full_name}</span>
                </>
              ),
            },
            { key: 'u', header: 'Kho', hideBelow: 'sm', cell: (r: any) => r.contract?.unit?.code },
            { key: 'd', header: 'Ngày trả', cell: (r: any) => fmtDate(r.requested_date) },
            {
              key: 'amt',
              header: 'Số tiền hoàn',
              hideBelow: 'md',
              cell: (r: any) => {
                const net = Number(r.settlement?.net_amount ?? r.estimated_settlement?.net ?? 0);
                return net > 0 ? <span className="num font-semibold text-ink-900">{vnd(net)}</span> : <span className="text-steel-400">0 ₫</span>;
              },
            },
            { key: 'n', header: 'Báo trước', hideBelow: 'md', cell: (r: any) => <Badge tone={r.notice_ok ? 'ok' : 'warn'}>{r.notice_ok ? 'Đủ' : 'Thiếu'}</Badge> },
            { key: 's', header: 'Trạng thái', cell: (r: any) => getMoveOutStatusBadge(r, findRefund(r), r.settlement) },
          ]}
        />
      </Card>
    </>
  );
}

export function MoveOutWizard({ base = '/staff' }: { base?: string }) {
  const { id } = useParams();
  const list = useGet<{ data: any[] }>('/move-out-requests', { 'page[size]': 100 }, { staleTime: 0 });
  const req = list.data?.data.find((r) => r.id === id);
  const cid = req?.contract?.id;
  const ccode = req?.contract?.code;
  const contract = useGet<any>(cid ? `/contracts/${cid}` : null, undefined, { staleTime: 0 });
  const settle = useGet<any>(cid && req && req.status !== 'SCHEDULED' ? `/contracts/${cid}/settlement` : null, undefined, { staleTime: 0 });
  const refunds = useGet<{ data: any[] }>(cid && req && req.status !== 'SCHEDULED' ? '/refunds' : null, { 'page[size]': 100 }, { staleTime: 0 });
  const fees = useGet<any[]>('/fee-types');
  const refetchAll = () => { list.refetch(); contract.refetch(); settle.refetch(); refunds.refetch(); };
  if (list.isLoading) return <Async q={list}>{() => null}</Async>;
  if (!req) return <Alert tone="bad" title="Không tìm thấy yêu cầu trả kho" />;
  const c = contract.data;
  const matchedRefund = settle.data?.refund ?? (refunds.data?.data ?? []).find((r: any) => (ccode && r.note?.includes(ccode)) || (cid && (r.contract?.id === cid || r.contract_id === cid)));
  const settleWithRefund = settle.data ? { ...settle.data, refund: matchedRefund, contractId: cid, contractCode: ccode } : undefined;
  const fullyDone = isMoveOutFullyDone(req, matchedRefund, settle.data?.settlement) && c?.unit?.status !== 'PENDING_INSPECTION';
  const step = req.status === 'SCHEDULED' ? 0 : req.status === 'INSPECTED' ? 1 : fullyDone ? 3 : 2;
  return (
    <>
      <PageHeader
        back={`${base}/moveouts`}
        title={<span>Trả kho <span className="code">{req.contract?.code}</span></span>}
        sub={`${req.contract?.customer?.full_name} · Kho ${req.contract?.unit?.code} · ${req.contract?.facility?.name} · ngày ${fmtDate(req.requested_date)}`}
        actions={getMoveOutStatusBadge(req, matchedRefund, settle.data?.settlement)}
      />
      <div className="mb-5"><Stepper steps={['Kiểm tra kho', 'Quyết toán & ký', 'Hoàn tiền mặt & Kiểm tra cuối']} current={step} /></div>
      <div className="mx-auto max-w-2xl space-y-4">
        {cid && <ContractInspectionsCard contractId={cid} />}
        {req.status === 'SCHEDULED' && <InspectStep req={req} fees={fees.data ?? []} onDone={refetchAll} />}
        {req.status === 'INSPECTED' && <ConfirmStep req={req} settlement={settleWithRefund} onDone={refetchAll} />}
        {['COMPLETED', 'DISPUTED'].includes(req.status) && settleWithRefund && <Card className="p-5"><p className="mb-2 font-bold">Quyết toán</p><Settlement s={settleWithRefund} onDone={refetchAll} />
          {req.status === 'COMPLETED' && c?.unit && <FinalCheck unitId={c.unit.id} code={c.unit.code} status={c.unit.status} onDone={refetchAll} />}
          {req.status === 'DISPUTED' && <Alert tone="warn" title="Khách đang khiếu nại">Quản lý cơ sở có thể xem xét và bấm duyệt quyết toán ngay phía trên.</Alert>}</Card>}
      </div>
    </>
  );
}

interface SettleField {
  key: string;
  alt: string;
  label: string;
  isTotal?: boolean;
}

const SETTLEMENT_FIELDS: SettleField[] = [
  { key: 'deposit_amount', alt: 'depositAmount', label: 'Tiền cọc ban đầu' },
  { key: 'outstanding_applied', alt: 'outstandingApplied', label: 'Khấu trừ nợ tiền thuê' },
  { key: 'damage_total', alt: 'damageTotal', label: 'Chi phí hư hại' },
  { key: 'cleaning_total', alt: 'cleaningTotal', label: 'Chi phí dọn dẹp / vệ sinh' },
  { key: 'early_termination_fee', alt: 'earlyTerminationFee', label: 'Phí chấm dứt sớm' },
  { key: 'prepaid_refund', alt: 'prepaidRefund', label: 'Hoàn tiền trả trước' },
  { key: 'net_amount', alt: 'netAmount', label: 'Số tiền hoàn lại cho khách', isTotal: true },
];

const APPROVAL_LABELS: Record<string, string> = {
  NOT_REQUIRED: 'Không cần duyệt',
  APPROVED: 'Đã duyệt',
  PENDING: 'Chờ duyệt',
  REJECTED: 'Từ chối',
};

const UNIT_STATUS_LABELS: Record<string, string> = {
  AVAILABLE: 'sẵn sàng cho thuê lại',
  MAINTENANCE: 'bảo trì',
  PENDING_INSPECTION: 'chờ kiểm tra',
  OCCUPIED: 'đang sử dụng',
  RESERVED: 'đã đặt trước',
  OVERLOCKED: 'đang khóa ngoài',
};

function Settlement({ s, onDone }: { s: any; onDone?: () => void }) {
  const st = s?.settlement;
  const refund = s?.refund;
  const contractId = s?.contractId;
  const contractCode = s?.contractCode;
  const can = useAuth((auth) => auth.can);
  const hasRole = useAuth((auth) => auth.hasRole);
  const canApprove = can('refund.approve', true) || hasRole('ADMIN') || hasRole('FACILITY_MANAGER') || hasRole('BUSINESS_OPS_MANAGER') || hasRole('SUPER_ADMIN') || hasRole('SYSTEM_ADMIN');

  const decideDmgAct = useAct(
    ({ id, approve }: { id: string; approve: boolean }) => post(`/damage-items/${id}/decide`, { approve }),
    { ok: 'Đã cập nhật khoản phí hư hại', onSuccess: onDone }
  );

  const finalizeAct = useAct(
    async () => {
      for (const d of s?.damages ?? []) {
        if (d.approval_status === 'PENDING') {
          await post(`/damage-items/${d.id}/decide`, { approve: true });
        }
      }
      if (st?.status !== 'FINALIZED') {
        const id = st?.id ?? st?.public_id ?? contractId;
        await post(`/settlements/${id}/finalize`, st?.status === 'DISPUTED' ? { resolveDispute: true } : {});
      }
      try {
        const refs = await get<{ data: any[] }>('/refunds', { status: 'PENDING_APPROVAL', 'page[size]': 100 });
        const pendingRef = (refs?.data ?? []).find(
          (r: any) =>
            (contractCode && r.note?.includes(contractCode)) ||
            (contractId && (r.contract?.id === contractId || r.contract_id === contractId))
        );
        if (pendingRef) {
          const rid = pendingRef.id ?? pendingRef.public_id;
          await post(`/refunds/${rid}/approve`, { note: 'FM/BOOM duyệt hoàn tiền mặt trả kho' });
        }
      } catch {
        /* ignore if already approved */
      }
    },
    { ok: 'Đã duyệt quyết toán & phê duyệt hoàn tiền mặt', onSuccess: onDone }
  );

  const cashPayoutAct = useAct(
    async () => {
      let rid = refund?.id ?? refund?.public_id;
      let rStatus = refund?.status;
      if (!rid) {
        const refs = await get<{ data: any[] }>('/refunds', { 'page[size]': 100 });
        const found = (refs?.data ?? []).find(
          (r: any) =>
            (contractCode && r.note?.includes(contractCode)) ||
            (contractId && (r.contract?.id === contractId || r.contract_id === contractId))
        );
        rid = found?.id ?? found?.public_id;
        rStatus = found?.status;
      }
      if (!rid) {
        throw new Error('Không tìm thấy yêu cầu hoàn tiền cho hợp đồng này');
      }
      if (rStatus === 'PENDING_APPROVAL' && canApprove) {
        await post(`/refunds/${rid}/approve`, { note: 'Duyệt hoàn tiền mặt tại quầy' });
      }
      return post(`/refunds/${rid}/mark-manual`, { reference: 'Đã chi tiền mặt tại quầy' });
    },
    { ok: 'Đã xác nhận hoàn tiền mặt cho khách', onSuccess: onDone }
  );

  if (!st) return null;
  const netNum = Number(st.net_amount ?? st.netAmount ?? 0);
  const isNetRefund = !isNaN(netNum) && netNum > 0;
  const isPreview = st.status === 'PREVIEW';
  const needFmApproval = isNetRefund && !isPreview && (st.status === 'DRAFT' || st.status === 'DISPUTED' || (st.status === 'FINALIZED' && refund?.status === 'PENDING_APPROVAL'));
  const readyForCash = isNetRefund && !isPreview && st.status === 'FINALIZED' && refund?.status !== 'PENDING_APPROVAL' && refund?.status !== 'SUCCEEDED' && refund?.status !== 'REJECTED';

  return (
    <div className="space-y-3 text-sm">
      <dl className="space-y-1.5">
        {SETTLEMENT_FIELDS.map((f) => {
          const rawVal = st[f.key] ?? st[f.alt];
          if (rawVal === undefined || rawVal === null) return null;
          const val = Number(rawVal);
          if (isNaN(val)) return null;
          const label = f.isTotal && val < 0 ? 'Số tiền khách cần thanh toán thêm' : f.label;
          const displayVal = f.isTotal && val < 0 ? Math.abs(val) : val;
          return (
            <div
              key={f.key}
              className={`flex justify-between ${
                f.isTotal ? 'border-t hairline pt-2 font-bold text-ink-900 text-base' : ''
              }`}
            >
              <dt className={f.isTotal ? 'font-bold text-ink-900' : 'text-steel-600'}>{label}</dt>
              <dd className={`num ${f.isTotal ? 'font-bold text-ink-900' : ''}`}>{vnd(displayVal)}</dd>
            </div>
          );
        })}
      </dl>

      {st.dispute_reason && (
        <div className="rounded-lg bg-warn-50 p-2.5 text-xs text-warn-800">
          <b>Lý do khiếu nại của khách:</b> {st.dispute_reason}
        </div>
      )}

      {s.damages?.map((d: any) => (
        <div key={d.id} className="space-y-2 rounded-lg bg-paper p-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>{d.description} — <b className="num">{vnd(d.amount)}</b></span>
            <div className="flex items-center gap-1.5">
              <Badge tone={d.approval_status === 'APPROVED' ? 'ok' : d.approval_status === 'REJECTED' ? 'bad' : d.approval_status === 'PENDING' ? 'warn' : 'neutral'}>
                {APPROVAL_LABELS[d.approval_status] ?? d.approval_status}
              </Badge>
              {d.approval_status === 'PENDING' && canApprove && (
                <>
                  <Button size="sm" variant="primary" loading={decideDmgAct.isPending} onClick={() => decideDmgAct.mutate({ id: String(d.id), approve: true })}>Duyệt phí</Button>
                  <Button size="sm" variant="outline" loading={decideDmgAct.isPending} onClick={() => decideDmgAct.mutate({ id: String(d.id), approve: false })}>Bỏ phí</Button>
                </>
              )}
            </div>
          </div>
          {d.photos?.length > 0 && <PhotoGallery photos={d.photos} size="sm" />}
        </div>
      ))}

      {/* Trường hợp không phát sinh tiền hoàn (netNum === 0) */}
      {!isPreview && !isNetRefund && netNum === 0 && (
        <div className="mt-3 rounded-lg border border-steel-200 bg-paper p-3 text-sm text-steel-700">
          ✓ Tiền cọc đã cấn trừ vừa đủ công nợ/chi phí — Không phát sinh khoản hoàn tiền mặt.
        </div>
      )}

      {/* Trường hợp khách còn nợ thêm sau khi trừ hết cọc (netNum < 0) */}
      {!isPreview && netNum < 0 && (
        <div className="mt-3 rounded-lg border border-warn-300 bg-warn-50 p-3 text-sm text-warn-900 flex flex-wrap items-center justify-between gap-2">
          <span>⚠ Tiền cọc không đủ bù chi phí. Khách cần đóng thêm: <b className="num">{vnd(Math.abs(netNum))}</b></span>
          {st.status !== 'FINALIZED' && canApprove && (
            <Button size="sm" variant="primary" loading={finalizeAct.isPending} onClick={() => finalizeAct.mutate(undefined)}>
              Chốt quyết toán & tạo hóa đơn thu thêm
            </Button>
          )}
        </div>
      )}

      {/* Bước 1 hoàn tiền mặt: Chờ FM/BOOM duyệt khoản tiền hoàn */}
      {needFmApproval && (
        <div className="mt-4 rounded-xl border border-brass-300 bg-brass-50/50 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-ink-900 flex items-center gap-2">
                <span>⏳</span> Chờ FM / BOOM duyệt chi tiền mặt: <b className="num text-brass-800">{vnd(netNum)}</b>
              </p>
              <p className="text-xs text-steel-600 mt-1">
                Nhân viên đã chốt bảng tính quyết toán. Quản lý cơ sở (FM) hoặc BOOM bấm xác nhận đồng ý để nhân viên hoàn tiền mặt cho khách.
              </p>
            </div>
            {canApprove ? (
              <Button variant="primary" loading={finalizeAct.isPending} onClick={() => finalizeAct.mutate(undefined)}>
                ✓ FM/BOOM Duyệt hoàn tiền mặt
              </Button>
            ) : (
              <Badge tone="warn">Đang chờ FM / BOOM xác nhận</Badge>
            )}
          </div>
        </div>
      )}

      {/* Bước 2 hoàn tiền mặt: Khi FM/BOOM đã đồng ý -> Nhân viên hoàn tiền mặt lại cho khách */}
      {readyForCash && (
        <div className="mt-4 rounded-xl border border-ok-400 bg-ok-50 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <Badge tone="ok">✓ FM / BOOM ĐÃ ĐỒNG Ý KHOẢN HOÀN TIỀN MẶT</Badge>
              <p className="font-bold text-base text-ink-900 mt-1">
                Số tiền hoàn tiền mặt cho khách: <span className="num text-ok-700">{vnd(netNum)}</span>
              </p>
              <p className="text-xs text-steel-600 mt-0.5">
                Nhân viên xuất tiền mặt tại quầy trao lại cho khách và bấm nút xác nhận hoàn tất bên dưới.
              </p>
            </div>
            <Button variant="primary" loading={cashPayoutAct.isPending} onClick={() => cashPayoutAct.mutate(undefined)}>
              💵 Xác nhận đã hoàn tiền mặt cho khách
            </Button>
          </div>
        </div>
      )}

      {/* Bước 3: Đã hoàn tiền mặt thành công */}
      {isNetRefund && refund?.status === 'SUCCEEDED' && (
        <div className="mt-3 rounded-lg border border-ok-200 bg-ok-50 p-3 text-sm text-ok-900 flex items-center justify-between">
          <span className="font-medium flex items-center gap-1.5">
            <span>✓</span> Đã hoàn tiền mặt <b className="num">{vnd(netNum)}</b> cho khách
          </span>
          <span className="text-xs text-steel-500">{refund.manual_reference ?? 'Đã chi tiền mặt tại quầy'}</span>
        </div>
      )}
    </div>
  );
}

function InspectStep({ req, fees, onDone }: { req: any; fees: any[]; onDone: () => void }) {
  const checklist = INSPECTION_ITEMS.map((c) => ({ code: c, label: INSPECTION_ITEM_LABEL[c] ?? c }));
  const [overall, setOverall] = useState('GOOD'); const [left, setLeft] = useState(false); const [clean, setClean] = useState(false);
  const [dmg, setDmg] = useState({ feeTypeId: '', amount: '' as number | '', description: '' });
  const [dmgPhotos, setDmgPhotos] = useState<Photo[]>([]);
  const [damages, setDamages] = useState<any[]>([]);
  const m = useAct(
    (items: any[]) => {
      const allPhotos = (items ?? []).flatMap((it: any) => it.photoIds ?? []);
      const damagesWithPhotos = damages.map((d) => ({
        feeTypeId: d.feeTypeId,
        amount: d.amount,
        description: d.description,
        photoIds: d.photoIds?.length ? d.photoIds : allPhotos.slice(0, 2),
      }));
      return post(`/move-out-requests/${req.id}/inspection`, {
        items,
        overall,
        leftItems: left,
        cleaningRequired: clean,
        damages: damagesWithPhotos.length ? damagesWithPhotos : undefined,
      });
    },
    { ok: 'Đã lưu kiểm tra', onSuccess: onDone }
  );
  return (
    <Card className="p-5"><p className="mb-3 font-bold">Kiểm tra kho khi trả</p>
      <InspectionForm checklist={checklist} minPhotos={2} facilityId={req.contract?.facility?.id} relatedType="inspection" loading={m.isPending} submitLabel="Lưu kiểm tra & tính quyết toán" onSubmit={(items) => m.mutate(items)}
        extra={<div className="space-y-3 rounded-xl border hairline p-3">
          <Field label="Đánh giá chung"><Select value={overall} onChange={(e) => setOverall(e.target.value)}><option value="GOOD">Tốt</option><option value="FAIR">Chấp nhận được</option><option value="DAMAGED">Có hư hại</option></Select></Field>
          <div className="flex flex-wrap gap-4 text-sm"><label className="flex items-center gap-2"><input type="checkbox" className="size-4 accent-ink-900" checked={left} onChange={(e) => setLeft(e.target.checked)} />Khách để lại đồ</label><label className="flex items-center gap-2"><input type="checkbox" className="size-4 accent-ink-900" checked={clean} onChange={(e) => setClean(e.target.checked)} />Cần vệ sinh thêm</label></div>
          <div className="space-y-2 border-t hairline pt-3"><p className="text-sm font-semibold">Khoản hư hại cần khấu trừ</p>
            {damages.map((d, i) => (
              <div key={i} className="space-y-1.5 rounded-lg bg-paper p-2 text-sm">
                <div className="flex items-center justify-between">
                  <span>{d.description}</span>
                  <span className="num">
                    {d.amount ? vnd(d.amount) : 'theo biểu phí'}
                    <button className="ml-2 text-bad-600" onClick={() => setDamages(damages.filter((_, j) => j !== i))} aria-label="Xóa">✕</button>
                  </span>
                </div>
                {d.photos?.length > 0 && <PhotoGallery photos={d.photos} size="sm" />}
              </div>
            ))}
            <div className="grid gap-2 sm:grid-cols-[1fr_140px]"><Select value={dmg.feeTypeId} onChange={(e) => setDmg({ ...dmg, feeTypeId: e.target.value })} aria-label="Loại phí"><option value="">— Loại phí —</option>{fees.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</Select><MoneyInput value={dmg.amount} onChange={(v) => setDmg({ ...dmg, amount: v })} placeholder="Số tiền" /></div>
            <Input placeholder="Mô tả hư hại" value={dmg.description} onChange={(e) => setDmg({ ...dmg, description: e.target.value })} maxLength={300} />
            <div>
              <p className="mb-1 text-xs text-steel-500">Ảnh chụp vị trí hư hại:</p>
              <PhotoUpload value={dmgPhotos} onChange={setDmgPhotos} purpose="DAMAGE_PHOTO" facilityId={req.contract?.facility?.id} max={6} label="Ảnh hư hại" />
            </div>
            <Button size="sm" variant="outline" disabled={!dmg.feeTypeId || dmg.description.trim().length < 3} onClick={() => { setDamages([...damages, { feeTypeId: dmg.feeTypeId, amount: dmg.amount === '' ? undefined : dmg.amount, description: dmg.description.trim(), photoIds: dmgPhotos.map((p) => p.id), photos: dmgPhotos }]); setDmg({ feeTypeId: '', amount: '', description: '' }); setDmgPhotos([]); }}>+ Thêm khoản</Button></div>
        </div>} />
    </Card>
  );
}

function ConfirmStep({ req, settlement, onDone }: { req: any; settlement: any; onDone: () => void }) {
  const [sig, setSig] = useState<string | null>(null); const [reason, setReason] = useState('');
  const done = useAct((agree: boolean) => post(`/move-out-requests/${req.id}/complete`, agree ? { agree: true, signature: sig ?? undefined } : { agree: false, disputeReason: reason }), { ok: 'Đã ghi nhận quyết toán, chuyển sang chờ FM/BOOM duyệt chi tiền mặt', onSuccess: onDone });
  const est = settlement?.estimated ?? req?.estimated_settlement;
  const previewData = settlement?.settlement
    ? settlement
    : est
      ? {
          settlement: {
            deposit_amount: est.deposit,
            outstanding_applied: est.outstanding,
            damage_total: est.damageTotal,
            cleaning_total: est.cleaningTotal,
            early_termination_fee: est.earlyTerminationFee,
            prepaid_refund: est.prepaidRefund,
            net_amount: est.net,
            status: 'PREVIEW',
          },
          damages: settlement?.damages ?? [],
        }
      : null;
  return (
    <Card className="space-y-4 p-5"><p className="font-bold">Quyết toán cùng khách</p>
      {previewData ? <Settlement s={previewData} /> : <Async q={{ data: undefined, isLoading: true, error: null, refetch: () => undefined }}>{() => null}</Async>}
      <Field label="Chữ ký đồng ý của khách" required><SignaturePad onChange={setSig} /></Field>
      <Button variant="primary" disabled={!sig} loading={done.isPending} onClick={() => done.mutate(true)}>Khách đồng ý — Báo lên FM/BOOM duyệt hoàn tiền mặt</Button>
      <div className="border-t hairline pt-4"><Field label="Khách không đồng ý? Ghi lý do khiếu nại"><Textarea rows={2} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} /></Field><Button className="mt-2" variant="outline" disabled={reason.trim().length < 3} loading={done.isPending} onClick={() => done.mutate(false)}>Ghi nhận khiếu nại</Button></div>
    </Card>
  );
}

function FinalCheck({ unitId, code, status, onDone }: { unitId: string; code: string; status: string; onDone: () => void }) {
  if (status !== 'PENDING_INSPECTION') {
    const statusText = UNIT_STATUS_LABELS[status] ?? status.toLowerCase();
    return <Alert tone="ok" title={`Kho ${code} đã chuyển sang trạng thái ${statusText}`} />;
  }
  const [cleaned, setCleaned] = useState(true); const [result, setResult] = useState('AVAILABLE'); const [note, setNote] = useState('');
  const m = useAct(() => post(`/units/${unitId}/final-check`, { cleaned, result, note: note || undefined }), { ok: 'Đã cập nhật kho', onSuccess: onDone });
  return (
    <div className="mt-4 space-y-3 border-t hairline pt-4"><p className="font-bold">Kiểm tra cuối kho {code}</p>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-ink-900" checked={cleaned} onChange={(e) => setCleaned(e.target.checked)} />Đã dọn sạch</label>
      <Field label="Kết quả"><Select value={result} onChange={(e) => setResult(e.target.value)}><option value="AVAILABLE">Sẵn sàng cho thuê lại</option><option value="MAINTENANCE">Cần bảo trì</option></Select></Field>
      <Field label="Ghi chú"><Input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} /></Field>
      <Button variant="primary" loading={m.isPending} onClick={() => m.mutate(undefined)}>Hoàn tất</Button></div>
  );
}
