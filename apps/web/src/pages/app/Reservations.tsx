import { useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from '@/ui/toast';
import {
  Clock,
  CalendarPlus,
  QrCode,
  Check,
  MapPin,
  Download,
  Plus,
  CreditCard,
  FileSignature,
  KeyRound,
  Building2,
  Phone,
  Receipt,
  ShieldCheck,
} from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { useGet, useAct } from '@/lib/hooks';
import { post, newIdemKey } from '@/lib/api';
import {
  Async,
  Card,
  CardHead,
  PageHeader,
  PagedTable,
  StatusBadge,
  Button,
  Alert,
  Select,
  Field,
  Input,
  Modal,
  Badge,
  Timeline,
  EmptyState,
  Textarea,
  cn,
} from '@/ui';
import { vnd, fmtDate, fmtEndDate, fmtDateTime, addDaysYmd, ymd, enumLabel } from '@/lib/format';
import { ActBtn, Info, REASON, PhotoGallery } from '../kit';

const BOOKING_STEPS = [
  {
    step: 1,
    title: 'Giữ chỗ',
    sub: 'Khóa kho tạm thời theo yêu cầu',
    icon: Clock,
  },
  {
    step: 2,
    title: 'Thanh toán',
    sub: 'Phí thuê kỳ đầu & tiền cọc',
    icon: CreditCard,
  },
  {
    step: 3,
    title: 'Ký hợp đồng / Hẹn lịch',
    sub: 'Hợp đồng điện tử & khung giờ',
    icon: FileSignature,
  },
  {
    step: 4,
    title: 'Nhận kho Check-in',
    sub: 'Quét QR tại quầy & nhận PIN',
    icon: KeyRound,
  },
];

function computeBookingStep(r: any): { current: number; terminated: boolean } {
  if (['CANCELLED', 'EXPIRED', 'NO_SHOW'].includes(r.status)) {
    return { current: 0, terminated: true };
  }
  if (['CHECKED_IN', 'COMPLETED'].includes(r.status)) {
    return { current: 4, terminated: false };
  }
  if (r.status === 'PENDING_PAYMENT') {
    return { current: 1, terminated: false };
  }
  const hasBookedAppt = r.appointments?.some((a: any) =>
    ['BOOKED', 'ARRIVED', 'COMPLETED'].includes(a.status),
  );
  if (r.status === 'MOVE_IN_SCHEDULED' && !r.pendingContractSignUrl) {
    return { current: 3, terminated: false };
  }
  if (hasBookedAppt && !r.pendingContractSignUrl && r.status !== 'CONFIRMED') {
    return { current: 3, terminated: false };
  }
  return { current: 2, terminated: false };
}

function BookingProgressStepper({ r }: { r: any }) {
  const { current, terminated } = computeBookingStep(r);
  return (
    <Card className="overflow-hidden border-brass-500/30">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b hairline bg-[#091320] px-5 py-3 text-white">
        <span className="text-xs font-semibold text-white">
          Tiến trình nhận kho
        </span>
        <span className="text-xs text-steel-300">
          {terminated
            ? 'Đơn đặt chỗ đã dừng'
            : current >= 4
              ? 'Đã hoàn tất bàn giao'
              : `Bước ${current + 1} / 4`}
        </span>
      </div>
      <div className="grid grid-cols-1 divide-y divide-steel-100 sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
        {BOOKING_STEPS.map((s, idx) => {
          const Icon = s.icon;
          const done = !terminated && idx < current;
          const active = !terminated && idx === current;
          return (
            <div
              key={s.step}
              className={cn(
                'relative flex items-start gap-3.5 p-4 transition',
                active && 'bg-brass-100/35',
                done && 'bg-paper/40',
                terminated && 'opacity-60',
              )}
            >
              {active && (
                <div className="absolute inset-x-0 top-0 h-0.5 bg-brass-500" />
              )}
              <span
                className={cn(
                  'grid size-9 shrink-0 place-items-center rounded-xl border text-xs font-extrabold transition',
                  done
                    ? 'border-[#091320] bg-[#091320] text-brass-400 shadow-xs'
                    : active
                      ? 'border-brass-500 bg-brass-500 text-ink-950 shadow-sm'
                      : 'border-steel-200 bg-steel-100 text-steel-400',
                )}
              >
                {done ? <Check className="size-4" strokeWidth={2.8} /> : <Icon className="size-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[10.5px] font-bold uppercase tracking-wider text-steel-400">
                    0{s.step}
                  </span>
                  {active && (
                    <span className="rounded-full bg-brass-500/20 px-2 py-px text-[10px] font-bold text-brass-700">
                      Hiện tại
                    </span>
                  )}
                </div>
                <p
                  className={cn(
                    'mt-0.5 text-sm font-bold leading-snug',
                    done || active ? 'text-ink-950' : 'text-steel-500',
                  )}
                >
                  {s.title}
                </p>
                <p className="mt-0.5 text-xs leading-snug text-steel-500">
                  {s.sub}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function VaultBoardingPass({
  code,
  status,
  facilityName,
  facilityAddress,
  unitTypeName,
  unitCode,
  appointmentTime,
  startDate,
  onBookClick,
}: {
  code: string;
  status?: string;
  facilityName?: string;
  facilityAddress?: string;
  unitTypeName?: string;
  unitCode?: string;
  appointmentTime?: string;
  startDate?: string;
  onBookClick?: () => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);

  const downloadQr = () => {
    const canvas = wrapRef.current?.querySelector('canvas');
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `Vaultra-Checkin-${code}.png`;
    a.click();
  };

  return (
    <div
      ref={wrapRef}
      className="overflow-hidden rounded-2xl border border-brass-500/45 bg-white shadow-[var(--shadow-card)]"
    >
      {/* Boarding Pass Dark Navy Header */}
      <div className="relative bg-[#091320] px-5 py-4 text-white">
        <div
          className="door-lines pointer-events-none absolute inset-0 opacity-35"
          aria-hidden
        />
        <div className="relative flex items-start justify-between gap-2">
          <div>
            <p className="text-xs text-steel-400">Mã đặt chỗ</p>
            <p className="mt-0.5 font-mono text-xl font-extrabold tracking-[0.12em] text-brass-400">
              {code}
            </p>
          </div>
          {status ? (
            <StatusBadge kind="reservation" value={status} />
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full border border-brass-400/40 bg-brass-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-brass-400">
              <QrCode className="size-3" /> QR Vé nhận kho
            </span>
          )}
        </div>
      </div>

      {/* High-Contrast QR Frame */}
      <div className="flex flex-col items-center bg-gradient-to-b from-paper/80 to-white px-5 pb-4 pt-5">
        <div className="relative rounded-2xl border-2 border-ink-950/12 bg-white p-3.5 shadow-sm">
          <span className="pointer-events-none absolute -left-1 -top-1 size-3.5 border-l-2 border-t-2 border-brass-500" />
          <span className="pointer-events-none absolute -right-1 -top-1 size-3.5 border-r-2 border-t-2 border-brass-500" />
          <span className="pointer-events-none absolute -bottom-1 -left-1 size-3.5 border-b-2 border-l-2 border-brass-500" />
          <span className="pointer-events-none absolute -bottom-1 -right-1 size-3.5 border-b-2 border-r-2 border-brass-500" />
          <QRCodeCanvas value={code} size={168} level="H" includeMargin />
        </div>
        <p className="mt-2.5 text-center text-xs text-steel-500">
          Đưa mã QR này cho lễ tân quét trực tiếp tại quầy Check-in
        </p>
        <Button
          size="xs"
          variant="outline"
          className="mt-2.5"
          icon={<Download className="size-3.5" />}
          onClick={downloadQr}
        >
          Lưu ảnh vé QR ({code}.png)
        </Button>
      </div>

      {/* Perforated Boarding Pass Divider */}
      <div className="relative flex items-center py-1">
        <span
          className="-ml-3 size-6 shrink-0 rounded-full border border-steel-200 bg-paper"
          aria-hidden
        />
        <div className="mx-1 flex-1 border-t-2 border-dashed border-steel-200" />
        <span
          className="-mr-3 size-6 shrink-0 rounded-full border border-steel-200 bg-paper"
          aria-hidden
        />
      </div>

      {/* Ticket Stub Details */}
      <div className="space-y-3 px-5 pb-5 pt-3 text-xs">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-steel-400">
              Loại kho / Mã kho
            </p>
            <p className="mt-0.5 font-bold text-ink-950">
              {unitCode ? `Kho ${unitCode}` : unitTypeName || 'Theo đơn giữ chỗ'}
            </p>
            {unitCode && unitTypeName && (
              <p className="text-[11px] text-steel-500">{unitTypeName}</p>
            )}
          </div>
          <div>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-steel-400">
              Ngày bắt đầu thuê
            </p>
            <p className="mt-0.5 font-bold text-ink-950 num">
              {startDate ? fmtDate(startDate) : '—'}
            </p>
          </div>
        </div>

        <div className="rounded-xl border hairline bg-paper px-3.5 py-2.5">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-steel-400">
            Cơ sở bàn giao
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 font-bold text-ink-950">
            <MapPin className="size-3.5 shrink-0 text-brass-700" />
            {facilityName || 'Cơ sở Vaultra'}
          </p>
          {facilityAddress && (
            <p className="mt-0.5 pl-5 text-[11px] leading-snug text-steel-500">
              {facilityAddress}
            </p>
          )}
        </div>

        <div className="rounded-xl border border-brass-500/30 bg-brass-100/25 px-3.5 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-brass-700">
                Khung giờ hẹn Check-in
              </p>
              <p className="mt-0.5 font-bold text-ink-950 num">
                {appointmentTime || 'Chưa đặt lịch hẹn nhận kho'}
              </p>
            </div>
            {!appointmentTime && onBookClick && (
              <Button size="xs" variant="primary" onClick={onBookClick}>
                Đặt lịch
              </Button>
            )}
          </div>
        </div>

        <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-steel-500">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-ok-600" />
          <span>
            Vui lòng mang theo CCCD/Hộ chiếu bản gốc để đối chiếu nhanh và nhận mã PIN mở kho trên Web.
          </span>
        </p>
      </div>
    </div>
  );
}

const QUICK_FILTERS = [
  { value: '', label: 'Tất cả đơn' },
  { value: 'PENDING_PAYMENT', label: 'Chờ thanh toán' },
  { value: 'CONFIRMED', label: 'Đã xác nhận' },
  { value: 'MOVE_IN_SCHEDULED', label: 'Đã hẹn nhận kho' },
  { value: 'CANCELLED', label: 'Đã hủy' },
];

export function Reservations() {
  const navigate = useNavigate();
  const nav = (id: string) => navigate(`/app/reservations/${id}`);
  const [status, setStatus] = useState('');
  const [qrRes, setQrRes] = useState<any | null>(null);

  return (
    <div className="space-y-6">
      {/* Executive Header Banner */}
      <section className="relative overflow-hidden rounded-[var(--radius-media)] border border-brass-500/25 bg-[#091320] p-6 text-white shadow-[var(--shadow-card)] sm:p-7">
        <div className="h-1 w-full absolute inset-x-0 top-0 bg-gradient-to-r from-brass-500 via-brass-400 to-transparent" />
        <div className="blueprint-dark pointer-events-none absolute inset-0 opacity-55" aria-hidden />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <h1 className="display text-[28px] text-white sm:text-[34px]">
              Đơn đặt chỗ
            </h1>
            <p className="mt-1.5 text-sm text-steel-300">
              Theo dõi đơn giữ chỗ, thanh toán kỳ đầu, đặt lịch hẹn và lấy mã QR check-in trước khi nhận kho.
            </p>
          </div>
          <Link to="/book">
            <Button variant="primary" icon={<Plus className="size-4" />}>
              Đặt thuê kho mới
            </Button>
          </Link>
        </div>

        {/* 4-Step Overview Strip */}
        <div className="relative mt-6 grid grid-cols-2 gap-2.5 border-t border-white/10 pt-5 lg:grid-cols-4">
          {BOOKING_STEPS.map((s) => {
            const Icon = s.icon;
            return (
              <div
                key={s.step}
                className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brass-500/20 text-brass-400">
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-white">
                    {s.step}. {s.title}
                  </p>
                  <p className="truncate text-[11px] text-steel-400">{s.sub}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <Card className="overflow-hidden">
        <PagedTable
          path="/reservations"
          query={{ status: status || undefined }}
          onRow={(r: any) => nav(r.id)}
          toolbar={
            <div className="flex flex-wrap items-center justify-between gap-3 border-b hairline bg-paper/50 px-4 py-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {QUICK_FILTERS.map((f) => {
                  const active = status === f.value;
                  return (
                    <button
                      key={f.value}
                      type="button"
                      onClick={() => setStatus(f.value)}
                      className={cn(
                        'rounded-lg px-3 py-1.5 text-xs font-semibold transition',
                        active
                          ? 'bg-[#091320] text-brass-400 shadow-xs'
                          : 'bg-white text-steel-600 border hairline hover:border-ink-900 hover:text-ink-950',
                      )}
                    >
                      {f.label}
                    </button>
                  );
                })}
              </div>
              <Select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-52"
                aria-label="Lọc trạng thái"
              >
                <option value="">Mọi trạng thái đặt chỗ</option>
                {[
                  'PENDING_PAYMENT',
                  'CONFIRMED',
                  'UNIT_ASSIGNED',
                  'MOVE_IN_SCHEDULED',
                  'CANCELLED',
                  'EXPIRED',
                ].map((s) => (
                  <option key={s} value={s}>
                    {enumLabel(s)}
                  </option>
                ))}
              </Select>
            </div>
          }
          cols={[
            {
              key: 'c',
              header: 'Mã đặt chỗ',
              cell: (r: any) => (
                <span className="inline-flex items-center gap-1.5 rounded-md border border-brass-500/35 bg-brass-100/35 px-2.5 py-1 font-mono text-xs font-bold tracking-wider text-ink-950">
                  {r.code}
                </span>
              ),
            },
            {
              key: 'u',
              header: 'Loại kho & Cơ sở',
              cell: (r: any) => (
                <div>
                  <p className="font-bold text-ink-950">{r.unit_type?.name}</p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-steel-500">
                    <MapPin className="size-3 text-brass-600" />
                    {r.facility?.name}
                  </p>
                </div>
              ),
            },
            {
              key: 's',
              header: 'Ngày bắt đầu',
              hideBelow: 'sm',
              cell: (r: any) => (
                <div>
                  <span className="font-semibold text-ink-900 num">
                    {fmtDate(r.start_date)}
                  </span>
                  {r.term_months && (
                    <span className="block text-xs text-steel-500">
                      Kỳ hạn {r.term_months} tháng
                    </span>
                  )}
                </div>
              ),
            },
            {
              key: 'q',
              header: 'Thanh toán kỳ đầu',
              hideBelow: 'md',
              cell: (r: any) => (
                <span className="font-mono font-bold text-ink-950 num">
                  {vnd(r.quote?.due_now_total)}
                </span>
              ),
            },
            {
              key: 'st',
              header: 'Trạng thái',
              cell: (r: any) => (
                <StatusBadge kind="reservation" value={r.status} />
              ),
            },
            {
              key: 'qr',
              header: 'Vé Check-in',
              cell: (r: any) =>
                !['CANCELLED', 'EXPIRED'].includes(r.status) ? (
                  <Button
                    size="sm"
                    variant="outline"
                    icon={<QrCode className="size-3.5 text-brass-700" />}
                    onClick={(e) => {
                      e.stopPropagation();
                      setQrRes(r);
                    }}
                  >
                    Vé QR
                  </Button>
                ) : (
                  <span className="text-xs text-steel-400">—</span>
                ),
            },
          ]}
          empty={
            <div className="py-8">
              <EmptyState
                icon={<QrCode className="size-6" />}
                title="Chưa có đơn đặt chỗ nào"
                hint="Chọn cơ sở và diện tích kho phù hợp để giữ chỗ trực tuyến và nhận vé QR Check-in ngay lập tức."
                action={
                  <Link to="/book">
                    <Button variant="primary" icon={<Plus className="size-4" />}>
                      Đặt thuê kho mới
                    </Button>
                  </Link>
                }
              />
            </div>
          }
        />
      </Card>

      <Modal
        open={!!qrRes}
        onClose={() => setQrRes(null)}
        title={qrRes ? `Vé Check-in nhận kho · ${qrRes.code}` : 'Vé QR Check-in'}
        footer={
          <Button variant="ghost" onClick={() => setQrRes(null)}>
            Đóng
          </Button>
        }
      >
        {qrRes && (
          <VaultBoardingPass
            code={qrRes.code}
            status={qrRes.status}
            facilityName={qrRes.facility?.name}
            unitTypeName={qrRes.unit_type?.name}
            startDate={qrRes.start_date}
          />
        )}
      </Modal>
    </div>
  );
}

export function ReservationDetail() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const payStatus = sp.get('status');
  const nav = useNavigate();
  const q = useGet<any>(`/reservations/${id}`);
  const [book, setBook] = useState(false);
  const pay = useAct(
    () => post(`/reservations/${id}/pay`, {}, newIdemKey()),
    {
      onSuccess: (r: any) => {
        if (r?.alreadyPaid) {
          toast.ok('Đơn đặt chỗ này đã được thanh toán hoàn tất.');
          void q.refetch();
          return;
        }
        if (r?.redirectUrl) window.location.href = r.redirectUrl;
      },
    },
  );

  return (
    <Async q={q}>
      {(r) => {
        const hasOpenInvoice =
          !Array.isArray(r.invoices) ||
          r.invoices.length === 0 ||
          r.invoices.some((inv: any) => ['ISSUED', 'PARTIALLY_PAID'].includes(inv.status));
        const pending = r.status === 'PENDING_PAYMENT' && hasOpenInvoice && payStatus !== 'SUCCEEDED';
        const canCancel = [
          'PENDING_PAYMENT',
          'CONFIRMED',
          'UNIT_ASSIGNED',
          'MOVE_IN_SCHEDULED',
        ].includes(r.status);
        const canBook = [
          'PENDING_PAYMENT',
          'CONFIRMED',
          'UNIT_ASSIGNED',
          'MOVE_IN_SCHEDULED',
        ].includes(r.status);
        const activeAppt = r.appointments?.find((a: any) =>
          ['BOOKED', 'ARRIVED'].includes(a.status),
        );
        const assignedUnitCode = r.allocations?.find(
          (a: any) => a.status === 'ACTIVE',
        )?.unit?.code;

        return (
          <div className="space-y-6">
            <PageHeader
              back="/app/reservations"
              title={
                <span className="inline-flex flex-wrap items-center gap-3">
                  <span>Đơn đặt chỗ</span>
                  <span className="rounded-xl border border-brass-500/45 bg-[#091320] px-3 py-1 font-mono text-xl font-extrabold tracking-wider text-brass-400">
                    {r.code}
                  </span>
                </span>
              }
              sub={`${r.unit_type?.name ?? ''} · ${r.facility?.name ?? ''}`}
              actions={
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge kind="reservation" value={r.status} />
                  {pending && (
                    <Button
                      variant="primary"
                      size="sm"
                      icon={<CreditCard className="size-4" />}
                      loading={pay.isPending}
                      onClick={() => pay.mutate(undefined)}
                    >
                      Thanh toán {vnd(r.quote?.due_now_total)}
                    </Button>
                  )}
                </div>
              }
            />

            {/* 4-Step Booking & Check-in Progress Stepper */}
            <BookingProgressStepper r={r} />

            <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
              <div className="space-y-6">
                {/* Contextual Action Alerts */}
                {payStatus === 'SUCCEEDED' && (
                  <Alert tone="ok" title="Thanh toán trực tuyến thành công!">
                    Hệ thống đã ghi nhận khoản thanh toán VNPay và phát hành hóa đơn điện tử cho đơn đặt chỗ <b>{r.code}</b>. Vui lòng mang CCCD/Hộ chiếu đến cơ sở theo lịch hẹn để check-in bàn giao kho.
                  </Alert>
                )}
                {pending && r.channel === 'COUNTER' && (
                  <Alert
                    tone="warn"
                    title="Chờ thanh toán & ký hợp đồng tại quầy"
                    action={
                      <Button
                        variant="outline"
                        size="sm"
                        loading={pay.isPending}
                        onClick={() => pay.mutate(undefined)}
                      >
                        Thanh toán online sớm ({vnd(r.quote?.due_now_total)})
                      </Button>
                    }
                  >
                    <Clock className="mr-1 inline size-4" />
                    Lịch hẹn của bạn được giữ đến{' '}
                    <b>{fmtDateTime(r.hold_expires_at)}</b>. Bạn có thể đến cơ sở đúng ngày hẹn để được nhân viên tư vấn, điều chỉnh loại kho nếu cần, sau đó thanh toán, ký hợp đồng và check-in tại quầy.
                  </Alert>
                )}

                {pending && r.channel !== 'COUNTER' && (
                  <Alert
                    tone="warn"
                    title="Kho đang được tạm giữ riêng cho bạn"
                    action={
                      <Button
                        variant="primary"
                        size="sm"
                        loading={pay.isPending}
                        onClick={() => pay.mutate(undefined)}
                      >
                        Thanh toán {vnd(r.quote?.due_now_total)}
                      </Button>
                    }
                  >
                    <Clock className="mr-1 inline size-4" />
                    Hết hạn giữ lúc <b>{fmtDateTime(r.hold_expires_at)}</b>. Sau thời điểm này kho sẽ được nhả tự động cho khách thuê khác.
                  </Alert>
                )}

                {r.pendingContractSignUrl && (
                  <Alert
                    tone="info"
                    title="Nhân viên cơ sở đã gửi hợp đồng thuê kho cho bạn ký"
                    action={
                      <Link to={r.pendingContractSignUrl}>
                        <Button variant="primary" size="sm">
                          Mở &amp; Ký hợp đồng ngay
                        </Button>
                      </Link>
                    }
                  >
                    Hợp đồng điện tử của bạn đã sẵn sàng. Vui lòng kiểm tra email hoặc bấm nút bên cạnh để ký hợp đồng và nhận bàn giao kho kèm mã PIN trên web.
                  </Alert>
                )}

                {r.status === 'MOVE_IN_SCHEDULED' && (
                  <Alert
                    tone="ok"
                    title="Sẵn sàng Check-in bàn giao kho theo lịch hẹn"
                  >
                    Đơn đặt kho của bạn đã hoàn tất giữ chỗ và gửi hóa đơn xác nhận. Vui lòng đến cơ sở theo đúng lịch hẹn bên dưới, xuất trình vé QR bên phải để ký hợp đồng bàn giao và nhận mã PIN mở kho.
                  </Alert>
                )}

                {r.status === 'CANCELLED' && (
                  <Alert tone="neutral" title="Đơn đặt chỗ đã hủy">
                    {r.cancel_reason}
                  </Alert>
                )}

                {/* Reservation Specs Card */}
                <Card className="overflow-hidden">
                  <CardHead
                    title="Thông tin chi tiết đơn giữ chỗ"
                    sub="Thông số kỳ hạn, hình thức thanh toán và địa điểm cơ sở"
                    action={
                      assignedUnitCode ? (
                        <Badge tone="brass" dot>
                          Kho {assignedUnitCode}
                        </Badge>
                      ) : undefined
                    }
                  />
                  <div className="p-5">
                    <Info
                      rows={[
                        ['Ngày bắt đầu thuê', fmtDate(r.start_date)],
                        ['Ngày kết thúc dự kiến', fmtEndDate(r.end_date)],
                        ['Thời hạn đăng ký', `${r.term_months} tháng`],
                        [
                          'Chu kỳ thanh toán',
                          r.billing_mode === 'MONTHLY'
                            ? 'Thanh toán hàng tháng'
                            : 'Trả trước trọn kỳ',
                        ],
                        [
                          'Hình thức giữ chỗ',
                          r.channel === 'COUNTER'
                            ? 'Thanh toán & ký hợp đồng tại quầy'
                            : 'Thanh toán giữ chỗ trực tuyến',
                        ],
                        [
                          'Kho được gán',
                          assignedUnitCode
                            ? `Kho ${assignedUnitCode}`
                            : 'Gán tự động khi Check-in tại quầy',
                        ],
                        [
                          'Địa chỉ cơ sở',
                          <span className="inline-flex items-center gap-1.5">
                            <Building2 className="size-3.5 shrink-0 text-brass-700" />
                            <span>
                              {r.facility?.address_line}, {r.facility?.district}
                            </span>
                          </span>,
                        ],
                        [
                          'Hotline cơ sở',
                          r.facility?.phone ? (
                            <span className="inline-flex items-center gap-1.5 font-mono">
                              <Phone className="size-3.5 text-brass-700" />
                              {r.facility.phone}
                            </span>
                          ) : undefined,
                        ],
                      ]}
                    />
                  </div>
                </Card>

                {/* Cost Statement Card */}
                <Card className="overflow-hidden">
                  <CardHead
                    title="Bảng kê chi phí kỳ đầu"
                    sub="Chi tiết tiền thuê, ưu đãi, phí khởi tạo và tiền đặt cọc bảo đảm"
                  />
                  <div className="p-5">
                    <div className="rounded-xl border hairline bg-paper/50 p-4">
                      <table className="w-full text-sm">
                        <tbody className="divide-y divide-steel-200/60">
                          <tr>
                            <td className="py-2 text-steel-600">
                              Tiền thuê kho tiêu chuẩn / tháng
                            </td>
                            <td className="py-2 text-right font-semibold text-ink-950 num">
                              {vnd(r.quote?.monthly_rent)}
                            </td>
                          </tr>
                          {r.quote?.discount_total > 0 && (
                            <tr>
                              <td className="py-2 text-ok-600 font-medium">
                                Ưu đãi / Khuyến mãi áp dụng
                              </td>
                              <td className="py-2 text-right font-semibold text-ok-600 num">
                                −{vnd(r.quote.discount_total)}
                              </td>
                            </tr>
                          )}
                          <tr>
                            <td className="py-2 text-steel-600">
                              Phí quản lý &amp; khởi tạo khóa
                            </td>
                            <td className="py-2 text-right font-medium text-ink-900 num">
                              {vnd(r.quote?.admin_fee)}
                            </td>
                          </tr>
                          <tr>
                            <td className="py-2 text-steel-600">
                              Tiền đặt cọc hợp đồng (hoàn lại khi trả kho)
                            </td>
                            <td className="py-2 text-right font-medium text-ink-900 num">
                              {vnd(r.quote?.deposit_amount)}
                            </td>
                          </tr>
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-ink-950/15">
                            <td className="pt-3.5 font-bold text-ink-950">
                              Tổng thanh toán lần đầu (đã gồm VAT)
                            </td>
                            <td className="pt-3.5 text-right font-mono text-lg font-extrabold text-ink-950 num">
                              {vnd(r.quote?.due_now_total)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                </Card>

                {/* Move-in Appointments Card */}
                <Card className="overflow-hidden">
                  <CardHead
                    title="Lịch hẹn nhận bàn giao kho"
                    sub="Đặt trước khung giờ để lễ tân chuẩn bị sẵn hợp đồng và kho của bạn"
                    action={
                      canBook &&
                      !activeAppt && (
                        <Button
                          size="sm"
                          variant="primary"
                          icon={<CalendarPlus className="size-4" />}
                          onClick={() => setBook(true)}
                        >
                          Đặt lịch nhận kho
                        </Button>
                      )
                    }
                  />
                  <div className="p-5">
                    {r.appointments?.length ? (
                      <Timeline
                        items={r.appointments.map((a: any) => ({
                          title: (
                            <span className="font-bold text-ink-950 num">
                              {fmtDateTime(a.scheduled_start)}
                            </span>
                          ),
                          sub: (
                            <span className="mt-1 flex flex-wrap items-center gap-2">
                              <StatusBadge kind="appointment" value={a.status} />
                              {a.assigned_staff?.full_name && (
                                <span className="text-xs text-steel-600">
                                  Nhân viên đón tiếp:{' '}
                                  <b>{a.assigned_staff.full_name}</b>
                                </span>
                              )}
                            </span>
                          ),
                          at: ['BOOKED'].includes(a.status) && (
                            <div className="mt-2">
                              <ActBtn
                                label="Hủy lịch hẹn"
                                danger
                                title="Hủy lịch hẹn"
                                fields={[REASON]}
                                run={(v) =>
                                  post(`/appointments/${a.id}/cancel`, v)
                                }
                                ok="Đã hủy lịch hẹn"
                                invalidate={['/reservations']}
                              />
                            </div>
                          ),
                        }))}
                      />
                    ) : (
                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border hairline bg-paper px-4 py-3.5 text-sm text-steel-600">
                        <span>
                          {canBook
                            ? 'Bạn chưa chọn khung giờ đến quầy lễ tân nhận kho.'
                            : 'Tính năng đặt lịch hẹn sẽ mở ngay sau khi thanh toán thành công.'}
                        </span>
                        {canBook && (
                          <Button
                            size="sm"
                            variant="outline"
                            icon={<CalendarPlus className="size-4" />}
                            onClick={() => setBook(true)}
                          >
                            Chọn giờ ngay
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </Card>

                {/* Identity & Check-in Photos */}
                {((Array.isArray(r.identityVerification?.photos) &&
                  r.identityVerification.photos.length > 0) ||
                  (Array.isArray(r.inspectionPhotos) &&
                    r.inspectionPhotos.length > 0)) && (
                  <Card className="overflow-hidden">
                    <CardHead
                      title="Hồ sơ hình ảnh xác minh tại quầy Check-in"
                      sub="Ảnh giấy tờ tùy thân (CCCD) và ảnh chụp hiện trạng kho lúc bàn giao"
                    />
                    <div className="space-y-4 p-5">
                      {Array.isArray(r.identityVerification?.photos) &&
                        r.identityVerification.photos.length > 0 && (
                          <PhotoGallery
                            photos={r.identityVerification.photos}
                            label={`Ảnh CCCD / Giấy tờ tùy thân (${r.identityVerification.document_type ?? 'CCCD'} ••••${r.identityVerification.document_last4 ?? ''})`}
                          />
                        )}
                      {Array.isArray(r.inspectionPhotos) &&
                        r.inspectionPhotos.length > 0 && (
                          <PhotoGallery
                            photos={r.inspectionPhotos}
                            label="Ảnh kiểm tra hiện trạng kho lúc Check-in"
                          />
                        )}
                    </div>
                  </Card>
                )}
              </div>

              {/* Right Sidebar: Luxury Boarding Pass + Invoices + Cancel */}
              <aside className="space-y-5">
                {!['CANCELLED', 'EXPIRED'].includes(r.status) && (
                  <VaultBoardingPass
                    code={r.code}
                    status={r.status}
                    facilityName={r.facility?.name}
                    facilityAddress={
                      r.facility?.address_line
                        ? `${r.facility.address_line}${r.facility.district ? `, ${r.facility.district}` : ''}`
                        : undefined
                    }
                    unitTypeName={r.unit_type?.name}
                    unitCode={assignedUnitCode}
                    startDate={r.start_date}
                    appointmentTime={
                      activeAppt
                        ? fmtDateTime(activeAppt.scheduled_start)
                        : undefined
                    }
                    onBookClick={
                      canBook && !activeAppt ? () => setBook(true) : undefined
                    }
                  />
                )}

                {r.invoices?.length > 0 && (
                  <Card className="overflow-hidden">
                    <CardHead
                      title="Hóa đơn liên quan"
                      action={<Receipt className="size-4 text-steel-400" />}
                    />
                    <ul className="divide-y divide-steel-100">
                      {r.invoices.map((i: any) => (
                        <li
                          key={i.id}
                          className="flex items-center justify-between gap-2 px-4 py-3 text-sm"
                        >
                          <Link
                            to={`/app/billing/invoices/${i.id}`}
                            className="code font-bold text-info-600 hover:underline"
                          >
                            {i.code}
                          </Link>
                          <span className="flex items-center gap-2">
                            <span className="font-semibold num">
                              {vnd(i.total)}
                            </span>
                            <StatusBadge kind="invoice" value={i.status} />
                          </span>
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}

                {canCancel && (
                  <CancelCard
                    id={r.id}
                    onDone={() => nav('/app/reservations')}
                  />
                )}
              </aside>
            </div>

            <BookSlot open={book} onClose={() => setBook(false)} r={r} />
          </div>
        );
      }}
    </Async>
  );
}

function CancelCard({ id, onDone }: { id: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const prev = useGet<any>(open ? `/reservations/${id}/cancellation-preview` : null);
  const cancel = useAct(
    () => post(`/reservations/${id}/cancel`, { reason: reason.trim() }, newIdemKey()),
    {
      ok: 'Đã hủy đặt chỗ',
      invalidate: ['/reservations', '/invoices', '/dashboard'],
      onSuccess: () => {
        setOpen(false);
        onDone();
      },
    },
  );
  return (
    <>
      <Card className="border-bad-600/20 bg-white p-4">
        <p className="text-xs font-semibold text-steel-600">
          Thay đổi kế hoạch lưu trữ?
        </p>
        <p className="mt-0.5 text-xs text-steel-500">
          Xem trước mức hoàn tiền theo chính sách trước khi xác nhận hủy đơn giữ chỗ.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-3 w-full !border-bad-600/30 !text-bad-600 hover:!bg-bad-100/40"
          onClick={() => setOpen(true)}
        >
          Hủy đơn đặt chỗ
        </Button>
      </Card>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Xác nhận hủy đơn đặt chỗ"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Giữ lại đơn
            </Button>
            <Button
              variant="danger"
              loading={cancel.isPending}
              disabled={reason.trim().length < 3}
              onClick={() => cancel.mutate(undefined)}
            >
              Xác nhận hủy
            </Button>
          </>
        }
      >
        <Async q={prev}>
          {(p) => (
            <div className="space-y-3.5">
              <div className="rounded-xl border hairline bg-paper p-4 text-sm">
                <p>
                  Bạn hủy trước thời điểm nhận kho{' '}
                  <b className="num">{p.hoursBeforeStart}</b> giờ → áp dụng bậc hoàn tiền{' '}
                  <b>{p.tier?.rentRefundPct}% tiền thuê</b>,{' '}
                  <b>{p.tier?.depositRefundPct}% tiền cọc</b>.
                </p>
                {p.paid ? (
                  <p className="mt-2 text-base font-extrabold text-ink-950">
                    Dự kiến hoàn lại:{' '}
                    <span className="text-ok-600 num">{vnd(p.totalRefund)}</span>
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-steel-500">
                    Bạn chưa thanh toán đơn này nên không phát sinh giao dịch hoàn tiền.
                  </p>
                )}
              </div>
              <Field label="Lý do hủy đặt chỗ" required hint="Tối thiểu 3 ký tự">
                <Textarea
                  rows={3}
                  maxLength={255}
                  placeholder="Nhập lý do hủy đơn…"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </Field>
            </div>
          )}
        </Async>
      </Modal>
    </>
  );
}

function BookSlot({
  open,
  onClose,
  r,
}: {
  open: boolean;
  onClose: () => void;
  r: any;
}) {
  const [date, setDate] = useState(
    ymd(new Date(Math.max(Date.now(), new Date(r.start_date).getTime()))) >
      addDaysYmd(1)
      ? ymd(new Date(r.start_date))
      : addDaysYmd(1),
  );
  const slots = useGet<any>(
    open ? `/facilities/${r.facility.id}/appointment-slots` : null,
    { date, type: 'MOVE_IN' },
  );
  const [slotId, setSlot] = useState('');
  const book = useAct(
    () =>
      post(
        '/appointments',
        { reservationId: r.id, type: 'MOVE_IN', slotId, date },
        newIdemKey(),
      ),
    {
      ok: 'Đã đặt lịch nhận kho',
      invalidate: ['/reservations'],
      onSuccess: onClose,
    },
  );
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Đặt lịch hẹn nhận bàn giao kho"
      description={`${r.facility.name} · Chọn khung giờ đón tiếp tại quầy lễ tân`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Đóng
          </Button>
          <Button
            variant="primary"
            disabled={!slotId}
            loading={book.isPending}
            onClick={() => book.mutate(undefined)}
          >
            Xác nhận lịch hẹn
          </Button>
        </>
      }
    >
      <Field label="Ngày đến nhận kho" required>
        <Input
          type="date"
          value={date}
          min={addDaysYmd(0)}
          onChange={(e) => {
            setDate(e.target.value);
            setSlot('');
          }}
        />
      </Field>
      <div className="mt-4">
        <p className="mb-2 text-[13px] font-semibold text-ink-800">
          Khung giờ còn trống
        </p>
        {slots.isLoading ? (
          <p className="text-sm text-steel-500">Đang tải khung giờ…</p>
        ) : slots.data?.closed ? (
          <Alert tone="warn">Cơ sở đóng cửa: {slots.data.reason}</Alert>
        ) : slots.data?.slots.length ? (
          <div
            className="grid grid-cols-2 gap-2.5"
            role="radiogroup"
            aria-label="Khung giờ"
          >
            {slots.data.slots.map((s: any) => {
              const off = s.past || s.remaining < 1;
              const selected = slotId === s.slotId;
              return (
                <button
                  key={s.slotId}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={off}
                  onClick={() => setSlot(s.slotId)}
                  className={cn(
                    'rounded-xl border px-3.5 py-2.5 text-left text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-40',
                    selected
                      ? 'border-[#091320] bg-[#091320] text-brass-400 shadow-sm'
                      : 'border-steel-300 bg-white text-ink-900 hover:border-brass-500',
                  )}
                >
                  <span>{s.label}</span>
                  <span
                    className={cn(
                      'mt-0.5 block text-[11px] font-normal',
                      selected ? 'text-steel-300' : 'text-steel-500',
                    )}
                  >
                    {off ? 'Đã kín lịch' : `Còn ${s.remaining} chỗ đón tiếp`}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-steel-500">
            Không có khung giờ trống trong ngày này.
          </p>
        )}
      </div>
    </Modal>
  );
}
