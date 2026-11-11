import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, Mail, KeyRound, RefreshCw, ExternalLink } from 'lucide-react';
import { useGet, useAct } from '@/lib/hooks';
import { post, newIdemKey } from '@/lib/api';
import { toast } from '@/ui/toast';
import { Async, Card, PageHeader, Button, Alert, Field, Input, Select, Stepper, Badge, Menu, StatusBadge, Textarea } from '@/ui';
import { vnd, fmtDate, fmtEndDate, fmtDateTime } from '@/lib/format';
import { ActBtn, Info, PhotoGallery } from '../kit';
import { PhotoUpload, Photo } from '@/widgets/PhotoUpload';
import { ContractInspectionsCard } from '../app/Contracts';

const STEPS = ['1. Rà soát thông tin', '2. Gán mã kho & Đổi kho', '3. Ký hợp đồng (Email)', '4. Bàn giao & Cấp mã PIN'];
const KEYS = ['identity', 'unit', 'contract', 'handover'] as const;

export function Checkin() {
  const { sid } = useParams();
  const nav = useNavigate();
  const q = useGet<any>(`/checkin-sessions/${sid}`, undefined, { staleTime: 0, refetchInterval: 2500 });
  const [view, setView] = useState<number | null>(null);
  const [done, setDone] = useState<any>(null);
  const st = q.data;
  const firstOpen = st ? (KEYS.findIndex((k) => !st.steps[k]) === -1 ? 3 : KEYS.findIndex((k) => !st.steps[k])) : 0;
  const idx = view ?? firstOpen;
  useEffect(() => setView(null), [st && JSON.stringify(st.steps)]); // eslint-disable-line
  const refresh = () => { void q.refetch(); };

  if (done || st?.session?.status === 'COMPLETED') {
    const pin = done?.pinCode ?? st?.pinCode ?? '••••••';
    const unitCode = done?.unitCode ?? st?.unit?.code ?? '';
    const contractCode = done?.contractCode ?? st?.contract?.code ?? '';
    return (
      <div className="mx-auto max-w-lg py-12 text-center">
        <div className="mx-auto mb-4 grid size-16 place-items-center rounded-full bg-ok-100 text-ok-600"><CheckCircle2 className="size-9" /></div>
        <h1 className="text-2xl font-extrabold">Bàn giao & Cấp mã PIN hoàn tất</h1>
        <p className="mt-2 text-sm text-steel-500">
          Hợp đồng <b className="code text-ink-900">{contractCode}</b> · Kho <b className="code text-ink-900">{unitCode}</b> đã được kích hoạt cho khách hàng <b>{st?.reservation?.customer?.full_name}</b>.
        </p>
        <div className="mt-6 rounded-2xl border-2 border-brass-500 bg-brass-100/70 p-6 shadow-sm">
          <div className="flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-widest text-brass-700">
            <KeyRound className="size-4" />
            Mã PIN mở cổng & kho của khách hàng
          </div>
          <p className="mt-3 font-mono text-5xl font-extrabold tracking-[0.28em] text-ink-950 num">{pin}</p>
          <p className="mt-3 rounded-lg bg-white/80 px-3 py-2 text-xs font-semibold text-ink-800">
            Bảo mật: Mã PIN này CHỈ hiển thị trực tiếp trên Web (màn hình bàn giao & trang Hợp đồng của khách) — tuyệt đối KHÔNG gửi qua Email.
          </p>
        </div>
        <div className="mt-6 flex justify-center gap-2">
          <Link to="/staff"><Button variant="dark">Về Hôm nay</Button></Link>
          <Link to="/staff/scan"><Button variant="outline">Tiếp nhận đơn mới</Button></Link>
        </div>
      </div>
    );
  }

  return (
    <Async q={q}>{(s) => {
      const r = s.reservation;
      const aborted = s.session.status !== 'IN_PROGRESS';
      return (
        <>
          <PageHeader back="/staff" title={<span>Tiếp nhận Check-in <span className="code">{r.code}</span></span>} sub={`${r.customer?.full_name} · ${r.unit_type?.name} · Kho ${s.unit?.code ?? 'Chưa gán'}`}
            actions={!aborted && <Menu trigger={<Button variant="outline" size="sm">Sự cố</Button>} items={[{ label: 'Hủy phiên nhận kho', danger: true, onSelect: () => (document.getElementById('abort-btn') as HTMLButtonElement)?.click() }, { label: 'Báo kho không đạt', onSelect: () => (document.getElementById('unfit-btn') as HTMLButtonElement)?.click() }]} />} />
          <div className="hidden"><ActBtn label={<span id="abort-btn">Hủy</span>} danger title="Hủy phiên nhận kho" fields={[{ name: 'reason', label: 'Lý do', type: 'select', required: true, options: [{ value: 'IDENTITY_MISMATCH', label: 'Giấy tờ không khớp' }, { value: 'PAYMENT_NOT_COMPLETED', label: 'Chưa thanh toán' }, { value: 'CONTRACT_DECLINED', label: 'Khách từ chối hợp đồng' }, { value: 'UNIT_UNFIT', label: 'Kho không đạt' }, { value: 'CUSTOMER_LEFT', label: 'Khách rời đi' }] }, { name: 'note', label: 'Ghi chú', type: 'textarea' }]} run={(v) => post(`/checkin-sessions/${sid}/abort`, v)} ok="Đã hủy phiên" onDone={() => nav('/staff')} />
            <ActBtn label={<span id="unfit-btn">Kho không đạt</span>} title="Báo kho không đạt" description="Kho sẽ chuyển sang bảo trì và hệ thống đề xuất kho thay thế." fields={[{ name: 'description', label: 'Mô tả vấn đề', type: 'textarea', required: true }, { name: 'photoIds', label: 'Ảnh chụp hiện trạng kho không đạt', type: 'photos', placeholder: 'WORK_ORDER_PHOTO' }]} run={(v) => post(`/checkin-sessions/${sid}/unit-unfit`, v)} ok="Đã ghi nhận" onDone={refresh} /></div>
          {aborted && <div className="mb-4"><Alert tone="bad" title={`Phiên đã ${s.session.status === 'COMPLETED' ? 'hoàn tất' : 'kết thúc'}`}>Trạng thái: {s.session.status}</Alert></div>}
          <div className="mb-5 overflow-x-auto"><Stepper steps={STEPS} current={idx} /></div>
          <div className="mx-auto max-w-2xl">
            {idx === 0 && <Identity sid={sid!} s={s} onDone={refresh} />}
            {idx === 1 && <AssignUnitStep sid={sid!} s={s} onDone={refresh} />}
            {idx === 2 && <EmailSignStep sid={sid!} s={s} onDone={refresh} />}
            {idx === 3 && <HandoverPinStep sid={sid!} s={s} onDone={(c) => setDone(c)} />}
            <div className="mt-4 flex justify-between text-sm"><Button variant="ghost" size="sm" disabled={idx === 0} onClick={() => setView(idx - 1)}>← Bước trước</Button><Button variant="ghost" size="sm" disabled={idx >= firstOpen} onClick={() => setView(idx + 1)}>Bước sau →</Button></div>
          </div>
        </>
      );
    }}</Async>
  );
}

type SP = { sid: string; s: any; onDone: (r?: any) => void };

function Identity({ sid, s, onDone }: SP) {
  const [f, setF] = useState({ documentType: 'CCCD', last4: '', nameMatched: true, notes: '' });
  const [photos, setPhotos] = useState<Photo[]>([]);
  const ok = s.steps.identity;
  const r = s.reservation;
  const idv = s.identityVerification;
  const m = useAct(
    () =>
      post(`/checkin-sessions/${sid}/verify-identity`, {
        ...f,
        notes: f.notes || undefined,
        photoIds: photos.map((p) => p.id),
      }),
    {
      onSuccess: (res) => {
        if (res.ok) onDone();
        else setMsg(res.message);
      },
    },
  );
  const [msg, setMsg] = useState('');
  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b hairline pb-3">
        <div>
          <p className="font-bold">Bước 1 · Rà soát thông tin khách hàng, chụp CCCD & phiếu đặt chỗ</p>
          <p className="text-xs text-steel-500">Kiểm tra thông tin khách hàng trên phiếu đặt giữ chỗ, chụp/tải ảnh CCCD và xác minh giấy tờ tùy thân tại cơ sở.</p>
        </div>
        <StatusBadge kind="reservation" value={r.status} />
      </div>
      <div className="rounded-xl border hairline bg-paper p-4">
        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-brass-700">Thông tin phiếu đặt giữ chỗ</p>
        <Info
          rows={[
            ['Mã phiếu đặt chỗ', <span className="code font-bold">{r.code}</span>],
            ['Họ tên khách hàng', r.customer?.full_name],
            ['Số điện thoại', r.customer?.phone],
            ['Email ký hợp đồng', r.customer?.email],
            ['Cơ sở nhận kho', r.facility?.name],
            ['Loại kho đã chọn', `${r.unit_type?.name ?? ''} (${r.unit_type?.climate_controlled ? 'Có máy lạnh 24/7' : 'Kho tiêu chuẩn'})`],
            ['Kỳ hạn thuê', `${fmtDate(r.start_date)} → ${fmtEndDate(r.end_date)} (${r.term_months} tháng)`],
            ['Hình thức đặt chỗ', r.channel === 'COUNTER' ? 'Thanh toán & ký hợp đồng tại quầy' : 'Đã thanh toán giữ chỗ trực tuyến'],
            ['Lịch hẹn', r.appointments?.[0]?.scheduled_start ? fmtDateTime(r.appointments[0].scheduled_start) : 'Theo lịch hẹn'],
            ['Tổng tiền đơn', <b className="num">{vnd(r.quote?.due_now_total)}</b>],
            ...(r.notes ? [['Ghi chú của khách', r.notes] as [string, any]] : []),
          ]}
        />
      </div>
      {ok ? (
        <div className="space-y-3">
          <Alert tone="ok" title="Đã rà soát thông tin khách hàng & xác minh giấy tờ tùy thân">
            Loại giấy tờ: <b>{idv?.document_type ?? 'CCCD'}</b> · 4 số cuối: <b className="code">••••{idv?.document_last4 ?? ''}</b>
            {idv?.verified_at ? <> · Xác minh lúc {fmtDateTime(idv.verified_at)}</> : null}
          </Alert>
          {idv?.photos?.length > 0 && (
            <div className="rounded-xl border hairline bg-paper p-4">
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-900">
                Ảnh CCCD / Giấy tờ tùy thân đã chụp lúc Check-in ({idv.photos.length} ảnh)
              </p>
              <PhotoGallery
                photos={idv.photos.map((p: any, i: number) => ({
                  ...p,
                  label: p.caption || `Ảnh ${idv.document_type ?? 'CCCD'} #${i + 1}`,
                }))}
                size="lg"
              />
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Loại giấy tờ">
              <Select value={f.documentType} onChange={(e) => setF({ ...f, documentType: e.target.value })}>
                <option value="CCCD">CCCD / Căn cước</option>
                <option value="PASSPORT">Hộ chiếu</option>
                <option value="OTHER">Khác</option>
              </Select>
            </Field>
            <Field label="4 ký tự cuối số giấy tờ" required hint="Chỉ lưu 4 ký tự cuối">
              <Input maxLength={4} value={f.last4} onChange={(e) => setF({ ...f, last4: e.target.value.toUpperCase() })} className="code" placeholder="VD: 1234" />
            </Field>
          </div>
          <Field
            label="Ảnh chụp CCCD / Giấy tờ tùy thân của khách hàng (mặt trước / mặt sau)"
            required
            hint="Bắt buộc chụp hoặc tải lên ít nhất 1 ảnh CCCD/Giấy tờ tùy thân của khách hàng để lưu hồ sơ bàn giao."
          >
            <PhotoUpload
              value={photos}
              onChange={setPhotos}
              purpose="IDENTITY_PHOTO"
              facilityId={r.facility?.public_id ?? r.facility?.id}
              max={4}
              label="Tải ảnh CCCD"
              camera={false}
            />
          </Field>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 size-4 accent-ink-900" checked={f.nameMatched} onChange={(e) => setF({ ...f, nameMatched: e.target.checked })} />
            Đã rà soát thông tin khách hàng, tên trên giấy tờ khớp với chủ hợp đồng.
          </label>
          {msg && <Alert tone="bad">{msg}</Alert>}
          <Button
            variant="primary"
            loading={m.isPending}
            disabled={f.last4.length !== 4 || (f.nameMatched && photos.length < 1)}
            onClick={() => m.mutate(undefined)}
          >
            {f.nameMatched ? `Xác nhận CCCD (${photos.length} ảnh) → Tiếp tục gán kho` : 'Ghi nhận KHÔNG khớp'}
          </Button>
        </>
      )}
    </Card>
  );
}

function AssignUnitStep({ sid, s, onDone }: SP) {
  const facilityUnitTypes: any[] = s.facilityUnitTypes ?? [];
  const currentUtId = s.reservation?.unit_type?.public_id ?? s.reservation?.unit_type?.id ?? '';
  const [selectedUtId, setSelectedUtId] = useState<string>(currentUtId);
  const selectedUt = facilityUnitTypes.find((ut) => ut.id === selectedUtId) ?? facilityUnitTypes[0] ?? null;
  const unitsForSelectedUt: any[] = selectedUt?.units ?? s.availableUnits ?? [];
  const [selectedUnitId, setSelectedUnitId] = useState<string>(s.unit?.public_id ?? s.unit?.id ?? unitsForSelectedUt[0]?.id ?? '');

  useEffect(() => {
    if (currentUtId && !selectedUtId) setSelectedUtId(currentUtId);
  }, [currentUtId, selectedUtId]);

  useEffect(() => {
    if (selectedUtId === currentUtId && s.unit) {
      setSelectedUnitId(s.unit.public_id ?? s.unit.id);
    } else if (unitsForSelectedUt[0]?.id) {
      setSelectedUnitId(unitsForSelectedUt[0].id);
    } else {
      setSelectedUnitId('');
    }
  }, [selectedUtId, currentUtId, s.unit, unitsForSelectedUt]);

  const isChangingType = Boolean(selectedUtId && selectedUtId !== currentUtId);
  const diffAmount = selectedUt?.diffAmount ?? 0;

  const assignUnit = useAct(
    () =>
      post(`/checkin-sessions/${sid}/assign-unit`, {
        unitTypeId: isChangingType ? selectedUtId : undefined,
        unitId: selectedUnitId || undefined,
      }),
    {
      ok: isChangingType && diffAmount > 0
        ? 'Đã đổi kích thước kho, gán mã kho và tạo hóa đơn chênh lệch giá'
        : 'Đã gán mã kho và khởi tạo hợp đồng cho khách',
      onSuccess: (r: any) => {
        if (r?.downgradeRefund?.method === 'CASH') toast.info(`Khách đổi sang kho rẻ hơn: cần hoàn ${vnd(r.downgradeRefund.amount)} bằng TIỀN MẶT — quản lý duyệt tại mục Phê duyệt rồi ghi nhận đã trả.`);
        else if (r?.downgradeRefund) toast.info(`Đã trừ ${vnd(r.downgradeRefund.amount)} chênh lệch vào hóa đơn đặt chỗ.`);
        onDone();
      },
    },
  );

  const [method, setMethod] = useState('CASH');
  const recPay = useAct(
    () => post(`/checkin-sessions/${sid}/record-payment`, { method }, newIdemKey()),
    { ok: 'Đã thu tiền hóa đơn và hoàn tất bước gán kho', onSuccess: () => onDone() },
  );

  return (
    <div className="space-y-4">
      <Card className="space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b hairline pb-3">
          <div>
            <p className="font-bold">Bước 2 · Gán mã kho & Đổi kích thước kho (nếu khách yêu cầu)</p>
            <p className="text-xs text-steel-500">
              Gán mã kho theo đúng loại kho khách đã chọn (<b>{s.reservation?.unit_type?.name}</b>). Nếu khách muốn đổi kích thước kho trong lúc check-in, chọn loại kho mới bên dưới để hệ thống tự động tạo hóa đơn chênh lệch giá.
            </p>
          </div>
          {s.unit && <Badge tone="ok">Đã gán: {s.unit.code}</Badge>}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="1. Loại kho / Kích thước kho bàn giao">
            <Select value={selectedUtId} onChange={(e) => setSelectedUtId(e.target.value)}>
              {facilityUnitTypes.map((ut: any) => (
                <option key={ut.id} value={ut.id}>
                  {ut.name} ({ut.areaM2} m² · {ut.climateControlled ? 'Có máy lạnh' : 'Tiêu chuẩn'}) — {vnd(ut.onlinePrice)}/tháng
                  {ut.id === currentUtId ? ' [Khách đã chọn]' : ut.diffAmount > 0 ? ` [+Chênh lệch ${vnd(ut.diffAmount)}]` : ''}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="2. Chọn mã kho trống thuộc loại kho này">
            <Select value={selectedUnitId} onChange={(e) => setSelectedUnitId(e.target.value)}>
              {selectedUtId === currentUtId && s.unit && (
                <option value={s.unit.public_id ?? s.unit.id}>{s.unit.code} — Đang gán hiện tại</option>
              )}
              {unitsForSelectedUt.map((u: any) => (
                <option key={u.id} value={u.id}>
                  {u.code} — {u.zone} (Tầng {u.floor}) {u.rank === 1 ? '· Đề xuất ưu tiên' : ''}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {isChangingType && (
          <div className="rounded-xl border border-brass-500 bg-brass-100/60 p-4 text-sm">
            <p className="font-bold text-ink-950">
              Đổi kích thước kho khi check-in: {s.reservation?.unit_type?.name} → {selectedUt?.name}
            </p>
            <p className="mt-1 text-xs text-steel-600">
              Tổng chi phí kho mới: <b className="num">{vnd(selectedUt?.dueNowTotal)}</b> · Đã tính trên đơn cũ: <b className="num">{vnd(s.reservation?.quote?.due_now_total)}</b>
            </p>
            {diffAmount > 0 ? (
              <p className="mt-1.5 font-semibold text-warn-700">
                → Hệ thống sẽ tự động phát hành Hóa đơn chênh lệch giá kho: <span className="num font-bold">{vnd(diffAmount)}</span>
              </p>
            ) : (
              <p className="mt-1.5 text-xs font-semibold text-ok-600">
                → Không phát sinh thêm chi phí chênh lệch cần thu thêm.
              </p>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            variant="primary"
            loading={assignUnit.isPending}
            disabled={!selectedUnitId && unitsForSelectedUt.length === 0}
            onClick={() => assignUnit.mutate(undefined)}
          >
            {isChangingType
              ? diffAmount > 0
                ? `Đổi sang ${selectedUt?.name}, Gán kho & Tạo hóa đơn chênh lệch (${vnd(diffAmount)})`
                : `Đổi sang ${selectedUt?.name} & Gán mã kho`
              : s.unit && s.contract
                ? 'Cập nhật mã kho đã gán'
                : 'Gán mã kho & Khởi tạo hợp đồng'}
          </Button>
        </div>
      </Card>

      {s.unpaidMoveIn?.length > 0 && (
        <Card className="space-y-4 border-2 border-warn-500 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold text-ink-950">Hóa đơn cần thanh toán khi nhận kho (bao gồm chênh lệch đổi kho nếu có)</p>
              <p className="text-xs text-steel-500">Thu khoản chênh lệch / hóa đơn còn nợ trước khi gửi hợp đồng qua email cho khách ký.</p>
            </div>
            <Badge tone="warn">Chờ thanh toán</Badge>
          </div>
          <ul className="divide-y divide-steel-100 rounded-xl border hairline bg-paper px-4 text-sm">
            {s.unpaidMoveIn.map((i: any) => (
              <li key={i.id} className="flex items-center justify-between py-3">
                <span>
                  <b className="code">{i.code}</b>{' '}
                  <span className="ml-2 text-xs text-steel-500">
                    {i.type === 'MOVE_IN' ? 'Hóa đơn chênh lệch giá kho / Nhận kho' : 'Hóa đơn đặt kho tại quầy'}
                  </span>
                </span>
                <b className="num text-base text-ink-950">{vnd(i.balance)}</b>
              </li>
            ))}
          </ul>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Hình thức thu">
              <Select value={method} onChange={(e) => setMethod(e.target.value)}>
                <option value="CASH">Tiền mặt tại quầy</option>
                <option value="BANK_TRANSFER">Chuyển khoản ngân hàng</option>
              </Select>
            </Field>
          </div>
          <div className="flex gap-2">
            <Button variant="primary" loading={recPay.isPending} onClick={() => recPay.mutate(undefined)}>
              Xác nhận đã thu tiền & Tiếp tục ký hợp đồng
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

function EmailSignStep({ sid, s, onDone }: SP) {
  const docs = useGet<any[]>(s.contract ? `/contracts/${s.contract.public_id ?? s.contract.id}/documents` : null);
  const sendEmail = useAct(
    () => post(`/checkin-sessions/${sid}/send-contract-email`),
    { ok: 'Đã gửi email kèm liên kết ký hợp đồng cho khách hàng', onSuccess: () => onDone() },
  );

  if (s.steps.contract) {
    return <Alert tone="ok" title={`Khách hàng đã ký hợp đồng ${s.contract?.code ?? ''} thành công!`} />;
  }

  return (
    <Card className="space-y-5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b hairline pb-4">
        <div>
          <p className="font-bold">Bước 3 · Gửi hợp đồng qua Email để khách hàng ký</p>
          <p className="mt-0.5 text-xs text-steel-500">
            Hợp đồng <span className="code font-semibold text-ink-900">{s.contract?.code}</span> · Kho bàn giao:{' '}
            <span className="code font-semibold text-ink-900">{s.unit?.code}</span> · Email khách:{' '}
            <b className="text-ink-900">{s.reservation?.customer?.email}</b>
          </p>
        </div>
        {docs.data?.[0] && (
          <a className="inline-flex items-center gap-1 text-sm font-semibold text-info-600 hover:underline" target="_blank" rel="noreferrer" href={docs.data[0].url}>
            Xem bản nháp PDF <ExternalLink className="size-3.5" />
          </a>
        )}
      </div>

      {s.waitingSignature ? (
        <div className="space-y-4 rounded-2xl border-2 border-info-500/40 bg-info-100/30 p-6 text-center">
          <div className="mx-auto grid size-14 place-items-center rounded-full bg-info-100 text-info-600">
            <RefreshCw className="size-7 animate-spin" />
          </div>
          <div>
            <Badge tone="info">ĐANG CHỜ KHÁCH HÀNG KÝ HỢP ĐỒNG</Badge>
            <h3 className="display mt-2 text-2xl text-ink-950">Chờ khách hàng ký hợp đồng qua Email…</h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-steel-600">
              Hệ thống đã gửi hợp đồng <b className="code">{s.contract?.code}</b> tới email <b>{s.reservation?.customer?.email}</b>. Màn hình này sẽ <b>tự động chuyển sang Bước 4 (Bàn giao & Cấp mã PIN)</b> ngay khi khách hàng ký xong.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            {s.signUrl && (
              <a href={s.signUrl} target="_blank" rel="noreferrer">
                <Button variant="primary" icon={<ExternalLink className="size-4" />}>
                  Mở trang ký hợp đồng của khách (Demo / Test)
                </Button>
              </a>
            )}
            <Button variant="outline" loading={sendEmail.isPending} icon={<Mail className="size-4" />} onClick={() => sendEmail.mutate(undefined)}>
              Gửi lại email hợp đồng
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl bg-paper p-4 text-sm text-steel-600">
            <p>
              Nhấn nút bên dưới để gửi hợp đồng điện tử <b className="code">{s.contract?.code}</b> (Kho <b className="code">{s.unit?.code}</b>) qua địa chỉ email{' '}
              <b>{s.reservation?.customer?.email}</b> cho khách hàng xem và ký trực tuyến.
            </p>
          </div>
          <Button variant="primary" size="lg" className="w-full" icon={<Mail className="size-4" />} loading={sendEmail.isPending} onClick={() => sendEmail.mutate(undefined)}>
            Gửi hợp đồng qua Email cho khách ký
          </Button>
        </div>
      )}
    </Card>
  );
}

function HandoverPinStep({ sid, s, onDone }: SP) {
  const [notes, setNotes] = useState('');
  const m = useAct(
    () => post(`/checkin-sessions/${sid}/complete`, { notes: notes || undefined }, newIdemKey()),
    { ok: 'Đã hoàn tất bàn giao và cấp mã PIN trên web', onSuccess: (r) => onDone(r) },
  );
  const missing = KEYS.slice(0, 3).filter((k) => !s.steps[k]);
  const inspect = useAct((items: any[]) => post(`/checkin-sessions/${sid}/inspection`, { items, overall: items.some((i: any) => i.condition === 'MINOR_ISSUE') ? 'FAIR' : 'GOOD' }), { ok: 'Đã lưu biên bản hiện trạng' });
  return (
    <Card className="space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b hairline pb-3">
        <div>
          <p className="font-bold">Bước 4 · Bàn giao kho & Cấp mã PIN truy cập</p>
          <p className="text-xs text-steel-500">
            Khách hàng đã ký hợp đồng điện tử thành công. Hoàn tất bàn giao kho <b>{s.unit?.code}</b> để kích hoạt hợp đồng và hiển thị mã PIN trực tiếp trên web.
          </p>
        </div>
        <Badge tone="ok">Đã ký hợp đồng {s.contract?.code}</Badge>
      </div>
      {missing.length > 0 && <Alert tone="warn" title="Còn bước chưa hoàn tất">{missing.map((k) => STEPS[KEYS.indexOf(k)]).join(', ')}</Alert>}
      <div className="rounded-xl border hairline bg-paper p-4 text-sm">
        <Info
          rows={[
            ['Hợp đồng đã ký', <span className="code font-bold">{s.contract?.code}</span>],
            ['Kho bàn giao', <span className="code font-bold">{s.unit?.code}</span>],
            ['Khách hàng', s.reservation?.customer?.full_name],
            ['Chính sách bảo mật PIN', 'Mã PIN 6 số chỉ hiển thị trên Web — tuyệt đối không gửi qua Email'],
          ]}
        />
      </div>
      {missing.length === 0 && !s.steps.inspection && (
        <div className="space-y-3 rounded-xl border hairline p-4">
          <p className="text-sm font-semibold">Biên bản hiện trạng kho (bắt buộc trước khi bàn giao)</p>
          <InspectionForm checklist={s.checklist ?? []} minPhotos={s.minPhotos ?? 4} facilityId={s.reservation?.facility?.public_id ?? s.reservation?.facility?.id} relatedType="inspection" loading={inspect.isPending} submitLabel="Lưu biên bản hiện trạng" onSubmit={(items) => inspect.mutate(items)} />
        </div>
      )}
      {s.steps.inspection && (s.contract?.public_id || s.contract?.id) && (
        <ContractInspectionsCard contractId={s.contract.public_id ?? s.contract.id} />
      )}
      <Field label="Ghi chú bàn giao (không bắt buộc)"><Textarea rows={2} value={notes} maxLength={1000} onChange={(e) => setNotes(e.target.value)} placeholder="VD: Đã bàn giao kho sạch sẽ, hướng dẫn khách nhập mã PIN tại cổng..." /></Field>
      <Button variant="primary" size="lg" className="w-full" icon={<KeyRound className="size-4" />} disabled={missing.length > 0 || !s.steps.inspection} loading={m.isPending} onClick={() => m.mutate(undefined)}>
        Hoàn tất bàn giao & Cấp mã PIN trên Web
      </Button>
    </Card>
  );
}

const COND = [['OK', 'Tốt'], ['MINOR_ISSUE', 'Lỗi nhỏ'], ['DAMAGED', 'Hư hại'], ['NOT_APPLICABLE', 'Không áp dụng']];
export function InspectionForm({ checklist, minPhotos, facilityId, onSubmit, loading, submitLabel = 'Lưu kết quả kiểm tra', extra }: { checklist: { code: string; label: string }[]; minPhotos: number; facilityId?: string; relatedType: string; onSubmit: (items: any[], photoCount: number) => void; loading?: boolean; submitLabel?: string; extra?: React.ReactNode }) {
  const [rows, setRows] = useState<Record<string, { condition: string; note: string; photos: Photo[] }>>(() => Object.fromEntries(checklist.map((c) => [c.code, { condition: 'OK', note: '', photos: [] }])));
  const total = Object.values(rows).reduce((n, r) => n + r.photos.length, 0);
  const bad = checklist.some((c) => rows[c.code].condition !== 'OK' && rows[c.code].condition !== 'NOT_APPLICABLE' && !rows[c.code].note.trim());
  return (
    <div className="space-y-3">
      {checklist.map((c) => { const r = rows[c.code]; const set = (p: Partial<typeof r>) => setRows((a) => ({ ...a, [c.code]: { ...r, ...p } })); return (
        <div key={c.code} className="rounded-xl border hairline p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">{c.label}</p><div className="flex gap-1" role="radiogroup" aria-label={c.label}>{COND.map(([v, l]) => <button key={v} role="radio" aria-checked={r.condition === v} onClick={() => set({ condition: v })} className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${r.condition === v ? (v === 'OK' ? 'bg-ok-600 text-white' : v === 'DAMAGED' ? 'bg-bad-600 text-white' : v === 'MINOR_ISSUE' ? 'bg-warn-600 text-white' : 'bg-ink-900 text-white') : 'bg-steel-100 text-steel-600'}`}>{l}</button>)}</div></div>
          {!['OK', 'NOT_APPLICABLE'].includes(r.condition) && <Input className="mt-2" placeholder="Mô tả tình trạng (bắt buộc)" value={r.note} onChange={(e) => set({ note: e.target.value })} maxLength={500} invalid={!r.note.trim()} />}
          <div className="mt-2"><PhotoUpload value={r.photos} onChange={(p) => set({ photos: p })} purpose="INSPECTION_PHOTO" facilityId={facilityId} max={4} label="Ảnh" /></div></div>); })}
      {extra}
      <p className={`text-sm ${total >= minPhotos ? 'text-ok-600' : 'text-warn-600'}`}>Đã chụp {total}/{minPhotos} ảnh tối thiểu</p>
      <Button variant="primary" loading={loading} disabled={total < minPhotos || bad} onClick={() => onSubmit(checklist.map((c) => ({ code: c.code, condition: rows[c.code].condition, note: rows[c.code].note || undefined, photoIds: rows[c.code].photos.map((p) => p.id) })), total)}>{submitLabel}</Button>
    </div>
  );
}
