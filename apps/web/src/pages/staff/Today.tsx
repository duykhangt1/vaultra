import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  History,
  QrCode,
  Camera,
  Keyboard,
  ScanLine,
  LogIn,
  LogOut as OutI,
  ClipboardList,
  LifeBuoy,
  AlertTriangle,
  Building2,
  Clock,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Thermometer,
  Boxes,
  CalendarClock,
  X,
} from 'lucide-react';
import { useGet, useAct } from '@/lib/hooks';
import { get, post } from '@/lib/api';
import { QrScanner } from './QrScanner';
import { Async, Card, CardHead, StatusBadge, Button, Badge, EmptyState, Input, Alert, cn } from '@/ui';
import { fmtDateTime, relTime } from '@/lib/format';

export const MISSING: Record<string, string> = {
  UNIT_NOT_ASSIGNED: 'Chưa gán kho cho đặt chỗ',
  OUTSIDE_MOVE_IN_WINDOW: 'Ngoài cửa sổ nhận kho theo chính sách',
  TOO_EARLY_FOR_APPOINTMENT: 'Còn quá sớm so với giờ hẹn (trước >30 phút)',
};
const time = (v: string) => new Date(v).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

function extractReservationCode(raw: string): string {
  const trimmed = raw.trim();
  const m = trimmed.match(/RSV-\d{4}-\d{4,10}/i);
  if (m) return m[0].toUpperCase();
  return trimmed.toUpperCase();
}

function ShiftMetric({
  label,
  value,
  sub,
  icon,
  tone,
  to,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon: React.ReactNode;
  tone?: 'warn' | 'bad' | 'brass';
  to?: string;
}) {
  const inner = (
    <div
      className={cn(
        'group relative overflow-hidden rounded-2xl border bg-white p-4 shadow-[var(--shadow-card)] transition',
        to && 'hover:border-ink-900',
        tone === 'bad'
          ? 'border-bad-600/35'
          : tone === 'warn'
            ? 'border-warn-600/35'
            : 'hairline',
      )}
    >
      <div
        className={cn(
          'pointer-events-none absolute inset-x-0 top-0 h-1',
          tone === 'bad'
            ? 'bg-bad-600'
            : tone === 'warn'
              ? 'bg-warn-600'
              : 'bg-gradient-to-r from-ink-900 via-brass-500 to-ink-900',
        )}
      />
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-wider text-steel-500">{label}</p>
        <span
          className={cn(
            'grid size-8 shrink-0 place-items-center rounded-lg',
            tone === 'bad'
              ? 'bg-bad-100 text-bad-600'
              : tone === 'warn'
                ? 'bg-warn-100 text-warn-600'
                : 'bg-paper text-ink-900',
          )}
        >
          {icon}
        </span>
      </div>
      <p
        className={cn(
          'mt-2 text-3xl font-extrabold leading-none tracking-tight num',
          tone === 'bad' ? 'text-bad-600' : tone === 'warn' ? 'text-warn-600' : 'text-ink-950',
        )}
      >
        {value}
      </p>
      {sub && <p className="mt-1.5 text-xs font-medium text-steel-500">{sub}</p>}
    </div>
  );
  return to ? <Link to={to}>{inner}</Link> : inner;
}

export function Today() {
  const nav = useNavigate();
  const q = useGet<any>('/dashboard/staff', undefined, { refetchInterval: 15_000 });
  const [showQuickScanner, setShowQuickScanner] = useState(false);
  const [scanErr, setScanErr] = useState('');
  const start = useAct(
    async (code: string) => {
      const clean = extractReservationCode(code);
      const l = await get('/ops/lookup', { code: clean });
      const s = await post('/checkin-sessions', { reservationId: l.reservation.id });
      return s;
    },
    {
      onSuccess: (s) => nav(`/staff/checkin/${s.session?.id ?? s.id}`),
      onError: (e: any) => setScanErr(e?.message ?? 'Không tìm thấy đơn hàng từ mã QR'),
    },
  );

  const liveData = q.data;
  const headerFacNames = (liveData?.facilities ?? []).map((f: any) => f.name).join(', ');
  const todayLabel = new Date().toLocaleDateString('vi-VN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="space-y-6">
      {/* Executive Facility Shift Command Banner */}
      <div className="grain blueprint-dark relative overflow-hidden rounded-2xl border border-ink-800 bg-ink-950 p-5 text-white shadow-[var(--shadow-card)] sm:p-7">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brass-600 via-brass-400 to-brass-600" />
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
          <div className="space-y-2">
            <p className="text-xs font-medium capitalize text-steel-300">{todayLabel}</p>
            <h1 className="display text-2xl text-white sm:text-3xl">Điều phối quầy &amp; Tiếp nhận kho</h1>
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              {headerFacNames && (
                <span className="inline-flex items-center gap-1.5 rounded-xl border border-brass-400/30 bg-white/8 px-3 py-1 text-xs font-semibold text-white">
                  <Building2 className="size-3.5 text-brass-400" />
                  Cơ sở phụ trách: <b className="text-brass-400">{headerFacNames}</b>
                </span>
              )}
              {liveData?.shift ? (
                <span className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/8 px-3 py-1 text-xs font-medium text-steel-200">
                  <Clock className="size-3.5 text-brass-400" />
                  Đang trong ca {liveData.shift.facility?.name ? `(${liveData.shift.facility.name})` : ''}:{' '}
                  <b className="num text-white">
                    {time(liveData.shift.starts_at)} – {time(liveData.shift.ends_at)}
                  </b>
                </span>
              ) : liveData ? (
                <span className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1 text-xs text-steel-300">
                  <Clock className="size-3.5 text-steel-400" />
                  Chưa ghi nhận ca trực đang mở
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 self-start lg:self-center">
            <Button
              variant="glass"
              icon={<QrCode className="size-4 text-brass-400" />}
              onClick={() => setShowQuickScanner((v) => !v)}
            >
              {showQuickScanner ? 'Ẩn máy quét QR' : 'Quét QR nhanh'}
            </Button>
            <Link to="/staff/scan">
              <Button variant="primary" icon={<ScanLine className="size-4" />}>
                Quét mã QR Check-in
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Inline Quick QR Scanner */}
      {showQuickScanner && (
        <Card className="overflow-hidden border-2 border-brass-500/50 shadow-[var(--shadow-pop)]">
          <div className="flex items-center justify-between gap-3 bg-ink-950 px-5 py-3.5 text-white">
            <div className="flex items-center gap-2.5">
              <span className="grid size-8 place-items-center rounded-lg bg-brass-500/20 text-brass-400">
                <QrCode className="size-4" />
              </span>
              <div>
                <p className="text-sm font-bold">Quét mã QR đơn hàng để Check-in ngay</p>
                <p className="text-xs text-steel-300">
                  Đưa mã QR đơn đặt kho (RSV-...) vào camera hoặc tải ảnh QR của khách để mở thẳng phiên Check-in
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowQuickScanner(false)}
              className="rounded-lg p-1.5 text-steel-300 transition hover:bg-white/10 hover:text-white"
              aria-label="Đóng"
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="space-y-3 p-5">
            {scanErr && (
              <Alert tone="bad" title="Không thể mở Check-in từ mã QR">
                {scanErr}
              </Alert>
            )}
            <QrScanner
              onCode={(c) => {
                setScanErr('');
                start.mutate(c);
              }}
            />
          </div>
        </Card>
      )}

      <Async q={q}>
        {(d) => {
          const facNames = (d.facilities ?? []).map((f: any) => f.name).join(', ');
          return (
            <div className="space-y-6">
              {d.urgent?.length > 0 && (
                <Alert
                  tone="bad"
                  title={`${d.urgent.length} phiếu hỗ trợ khẩn cấp cần xử lý ngay`}
                  action={
                    <Link to="/staff/tickets">
                      <Button size="sm" variant="danger">
                        Mở danh sách phiếu
                      </Button>
                    </Link>
                  }
                >
                  Khách thuê đang chờ phản hồi ưu tiên tại cơ sở phụ trách của bạn.
                </Alert>
              )}

              {/* Executive KPI Strip */}
              <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
                <ShiftMetric
                  label="Đơn chờ check-in"
                  value={d.reservations?.length ?? d.counters.moveIns}
                  sub={facNames ? `Tại ${facNames}` : 'Sẵn sàng bàn giao kho'}
                  icon={<LogIn className="size-4" />}
                />
                <ShiftMetric
                  label="Trả kho hôm nay"
                  value={d.counters.moveOuts}
                  sub="Cần kiểm tra hiện trạng kho"
                  icon={<OutI className="size-4" />}
                  to="/staff/moveouts"
                />
                <ShiftMetric
                  label="Việc của tôi"
                  value={d.counters.myOpenTasks}
                  tone={d.counters.overdueTasks ? 'warn' : undefined}
                  sub={d.counters.overdueTasks ? `${d.counters.overdueTasks} công việc quá hạn` : 'Đúng tiến độ ca trực'}
                  icon={<ClipboardList className="size-4" />}
                  to="/staff/tasks"
                />
                <ShiftMetric
                  label="Phiếu hỗ trợ mở"
                  value={d.counters.tickets}
                  tone={d.urgent?.length ? 'bad' : undefined}
                  sub={d.urgent?.length ? `${d.urgent.length} phiếu mức khẩn` : 'Yêu cầu từ khách thuê'}
                  icon={<LifeBuoy className="size-4" />}
                  to="/staff/tickets"
                />
              </div>

              {/* Reservation Check-in Queue */}
              <Card className="overflow-hidden">
                <CardHead
                  title={
                    <span className="inline-flex items-center gap-2">
                      Đơn đặt kho chờ tiếp nhận Check-in
                      {d.reservations?.length > 0 && (
                        <Badge tone="brass">{d.reservations.length} đơn</Badge>
                      )}
                    </span>
                  }
                  sub={
                    facNames
                      ? `Chỉ hiển thị đơn đặt kho của khách thuộc cơ sở ${facNames}`
                      : 'Danh sách đơn đặt kho tại cơ sở phụ trách đang chờ bàn giao'
                  }
                  action={
                    <Link to="/staff/scan" className="inline-flex items-center gap-1 text-xs font-bold text-brass-700 hover:underline">
                      Mở trạm quét QR <ArrowRight className="size-3.5" />
                    </Link>
                  }
                />
                {d.reservations?.length ? (
                  <ul className="divide-y divide-steel-100">
                    {d.reservations.map((r: any) => (
                      <li
                        key={r.id}
                        className="flex flex-wrap items-center gap-4 px-5 py-4 transition hover:bg-paper/60"
                      >
                        <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-brass-500/35 bg-ink-950 text-brass-400 shadow-2xs">
                          <LogIn className="size-5" />
                        </span>
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="code rounded-md border hairline bg-paper px-2 py-0.5 text-xs font-extrabold text-ink-950">
                              {r.code}
                            </span>
                            <span className="font-bold text-ink-950">{r.customer?.full_name}</span>
                            {(r.customer?.phone || r.customer?.email) && (
                              <span className="text-xs text-steel-500">
                                · {r.customer?.phone ?? r.customer?.email}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-steel-600">
                            <span className="inline-flex items-center gap-1 font-semibold text-ink-800">
                              {r.unit_type?.climate_controlled ? (
                                <Thermometer className="size-3.5 text-brass-600" />
                              ) : (
                                <Boxes className="size-3.5 text-steel-500" />
                              )}
                              {r.unit_type?.name} ({r.unit_type?.climate_controlled ? 'Có máy lạnh' : 'Kho tiêu chuẩn'})
                            </span>
                            <span>
                              · {r.channel === 'COUNTER' ? 'Thanh toán tại quầy' : 'Đã thanh toán online'}
                            </span>
                            {r.appointments?.[0]?.scheduled_start && (
                              <span className="inline-flex items-center gap-1 font-medium text-info-600">
                                <CalendarClock className="size-3.5" />
                                Hẹn {fmtDateTime(r.appointments[0].scheduled_start)}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2.5">
                          <StatusBadge kind="reservation" value={r.status} />
                          <Button
                            size="sm"
                            variant="primary"
                            loading={start.isPending}
                            onClick={() => start.mutate(r.code)}
                          >
                            Tiếp nhận Check-in
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState
                    icon={<CheckCircle2 className="size-6" />}
                    title="Chưa có đơn đặt kho nào đang chờ check-in tại cơ sở này"
                    hint="Khi khách đặt kho mới hoặc đến quầy, bạn có thể quét mã QR đơn hàng để tiếp nhận ngay."
                  />
                )}
              </Card>

              {/* Appointment Timeline */}
              <Card className="overflow-hidden">
                <CardHead
                  title="Lịch hẹn nhận & trả kho"
                  sub="Dòng thời gian các cuộc hẹn đón khách tại cơ sở phụ trách"
                />
                {d.appointments.length ? (
                  <ul className="divide-y divide-steel-100">
                    {d.appointments.map((a: any) => {
                      const isMoveIn = a.type === 'MOVE_IN';
                      return (
                        <li
                          key={a.id}
                          className="flex flex-wrap items-center gap-4 px-5 py-4 transition hover:bg-paper/60"
                        >
                          <div className="flex items-center gap-3">
                            <span
                              className={cn(
                                'grid size-10 shrink-0 place-items-center rounded-xl',
                                isMoveIn ? 'bg-ok-100 text-ok-600' : 'bg-warn-100 text-warn-600',
                              )}
                            >
                              {isMoveIn ? <LogIn className="size-5" /> : <OutI className="size-5" />}
                            </span>
                            <div className="rounded-xl border hairline bg-paper px-3 py-1.5 text-center">
                              <span className="block text-sm font-extrabold leading-none text-ink-950 num">
                                {time(a.scheduled_start)}
                              </span>
                              <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-wider text-steel-500">
                                {isMoveIn ? 'Nhận kho' : 'Trả kho'}
                              </span>
                            </div>
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-bold text-ink-950">
                                {a.customer?.full_name ?? 'Khách thuê'}
                              </span>
                              {(a.reservation?.code || a.contract?.code) && (
                                <span className="code rounded bg-paper px-2 py-0.5 text-xs font-semibold text-ink-900">
                                  {a.reservation?.code ?? a.contract?.code}
                                </span>
                              )}
                              {a.unit?.code && <Badge tone="brass">Kho {a.unit.code}</Badge>}
                            </div>
                            <p className="mt-0.5 text-xs text-steel-500">
                              Lịch hẹn: {fmtDateTime(a.scheduled_start)}
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-2.5">
                            <StatusBadge kind="appointment" value={a.status} />
                            {isMoveIn && a.reservation && (
                              <Button
                                size="sm"
                                variant="primary"
                                loading={start.isPending}
                                onClick={() => start.mutate(a.reservation.code)}
                              >
                                Tiếp nhận Check-in
                              </Button>
                            )}
                            {a.type === 'MOVE_OUT' &&
                              (a.moveOutRequest ? (
                                <Link to={`/staff/moveout/${a.moveOutRequest.id}`}>
                                  <Button size="sm" variant="primary">
                                    Kiểm tra trả kho
                                  </Button>
                                </Link>
                              ) : (
                                <Link to="/staff/moveouts">
                                  <Button size="sm" variant="outline">
                                    Mở danh sách
                                  </Button>
                                </Link>
                              ))}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <EmptyState title="Không có lịch hẹn nào sắp tới" />
                )}
              </Card>

              {/* Bottom Operational Panels */}
              <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                  <CardHead
                    title="Việc cần làm trong ca"
                    sub="Các đầu việc vận hành được giao cho bạn"
                    action={
                      <Link to="/staff/tasks" className="inline-flex items-center gap-1 text-xs font-bold text-info-600 hover:underline">
                        Tất cả <ArrowRight className="size-3.5" />
                      </Link>
                    }
                  />
                  {d.tasks.length ? (
                    <ul className="divide-y divide-steel-100">
                      {d.tasks.slice(0, 6).map((t: any) => (
                        <li key={t.id} className="flex items-center gap-3 px-5 py-3.5">
                          <span
                            className={cn(
                              'grid size-8 shrink-0 place-items-center rounded-lg',
                              t.is_overdue ? 'bg-bad-100 text-bad-600' : 'bg-paper text-steel-500',
                            )}
                          >
                            <ClipboardList className="size-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-ink-950">{t.title}</span>
                            <span className="text-xs text-steel-500">
                              {t.due_at ? `Hạn ${relTime(t.due_at)}` : 'Không giới hạn thời gian'}
                            </span>
                          </span>
                          {t.is_overdue && <Badge tone="bad">Quá hạn</Badge>}
                          <StatusBadge kind="task" value={t.status} />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyState title="Không có công việc tồn đọng" />
                  )}
                </Card>

                <Card>
                  <CardHead
                    title="Kho cần kiểm tra / Bảo trì"
                    sub="Các ô kho có cờ cảnh báo hoặc chờ nghiệm thu"
                    action={
                      <Link to="/staff/units" className="inline-flex items-center gap-1 text-xs font-bold text-info-600 hover:underline">
                        Danh sách kho <ArrowRight className="size-3.5" />
                      </Link>
                    }
                  />
                  {d.unitsToInspect.length ? (
                    <ul className="divide-y divide-steel-100">
                      {d.unitsToInspect.slice(0, 8).map((u: any) => (
                        <li key={u.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-warn-100 text-warn-600">
                            <AlertTriangle className="size-4" />
                          </span>
                          <span className="code rounded-md border hairline bg-paper px-2.5 py-0.5 text-sm font-bold text-ink-950">
                            {u.code}
                          </span>
                          <span className="flex-1" />
                          <StatusBadge kind="unit" value={u.status} />
                          {u.operational_flag !== 'NONE' && (
                            <Badge tone="warn">{u.operational_flag.replace(/_/g, ' ').toLowerCase()}</Badge>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyState title="Không có kho nào cần kiểm tra" />
                  )}
                </Card>
              </div>
            </div>
          );
        }}
      </Async>
    </div>
  );
}

export function Scan() {
  const nav = useNavigate();
  const [code, setCode] = useState('');
  const [cam, setCam] = useState(true);
  const [manualMode, setManualMode] = useState(false);
  const [res, setRes] = useState<any>(null);
  const [err, setErr] = useState('');
  const board = useGet<any>('/dashboard/staff', undefined, { refetchInterval: 30_000 });
  const [recent, setRecent] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('vaultra.recent-codes') ?? '[]');
    } catch {
      return [];
    }
  });
  const remember = (c: string) =>
    setRecent((r) => {
      const n = [c, ...r.filter((x) => x !== c)].slice(0, 5);
      try {
        localStorage.setItem('vaultra.recent-codes', JSON.stringify(n));
      } catch {
        /* private mode */
      }
      return n;
    });
  const look = useAct((c: string) => get('/ops/lookup', { code: extractReservationCode(c) }), {
    silentError: true,
    onSuccess: (r, c) => {
      const clean = extractReservationCode(c);
      setCode(clean);
      setRes(r);
      setErr('');
      setCam(false);
      remember(clean);
    },
  });
  const run = (c: string) => {
    const clean = extractReservationCode(c);
    setCode(clean);
    setErr('');
    setRes(null);
    look.mutate(clean, { onError: (e: any) => setErr(e.message) });
  };
  const moveIns = (board.data?.appointments ?? []).filter((a: any) => a.type === 'MOVE_IN' && a.reservation);
  const start = useAct(() => post('/checkin-sessions', { reservationId: res.reservation.id }), {
    onSuccess: (s) => nav(`/staff/checkin/${s.session?.id ?? s.id}`),
  });
  const resume = res?.activeSession;

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/staff"
          className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-steel-500 transition hover:text-ink-900"
        >
          <ArrowLeft className="size-4" />
          Quay lại ca trực hôm nay
        </Link>
        <div className="grain blueprint-dark relative overflow-hidden rounded-2xl border border-ink-800 bg-ink-950 p-5 text-white shadow-[var(--shadow-card)] sm:p-6">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brass-600 via-brass-400 to-brass-600" />
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-brass-400/40 bg-brass-500/15 text-brass-400">
                <ScanLine className="size-5" />
              </span>
              <div>
                <h1 className="display text-2xl text-white sm:text-3xl">Quét mã QR đơn hàng · Check-in</h1>
                <p className="mt-1 text-sm text-steel-300">
                  Quét mã QR trên vé đặt kho (hoặc tải ảnh QR khách gửi) để xác thực đơn hàng và mở quy trình bàn giao kho.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-4">
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 bg-ink-950 px-5 py-4 text-white">
              <div className="flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-xl border border-brass-400/35 bg-brass-500/15 text-brass-400">
                  <QrCode className="size-5" />
                </span>
                <div>
                  <p className="text-sm font-bold">Ống kính quét QR &amp; Tải ảnh</p>
                  <p className="text-xs text-steel-300">Tự động nhận diện mã RSV-YYYY-XXXXXX</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant={cam ? 'primary' : 'glass'}
                  icon={<Camera className="size-3.5" />}
                  onClick={() => setCam((c) => !c)}
                >
                  {cam ? 'Đang bật camera' : 'Bật quét QR'}
                </Button>
                <Button
                  size="sm"
                  variant="glass"
                  icon={<Keyboard className="size-3.5" />}
                  onClick={() => setManualMode((m) => !m)}
                >
                  {manualMode ? 'Ẩn nhập tay' : 'Nhập mã tiếp nhận'}
                </Button>
              </div>
            </div>

            <div className="space-y-4 p-5">
              {cam && (
                <QrScanner
                  onCode={(c) => {
                    const clean = extractReservationCode(c);
                    setCode(clean);
                    run(clean);
                  }}
                />
              )}

              {!cam && !res && (
                <div className="rounded-xl border border-dashed border-steel-300 bg-paper/60 px-4 py-6 text-center text-sm text-steel-500">
                  Camera đang tạm tắt. Bấm <b className="text-ink-900">Bật quét QR</b> ở thanh trên hoặc dùng tính năng nhập mã tiếp nhận.
                </div>
              )}

              {manualMode && (
                <form
                  className="flex gap-2 border-t hairline pt-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    code.trim() && run(code.trim());
                  }}
                >
                  <Input
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="RSV-2026-000001 (Nhập mã tiếp nhận khi QR mờ)"
                    aria-label="Mã đặt chỗ"
                    className="code"
                  />
                  <Button type="submit" variant="dark" loading={look.isPending}>
                    Tra cứu
                  </Button>
                </form>
              )}
            </div>
          </Card>

          {recent.length > 0 && !res && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border hairline bg-white px-4 py-3 text-xs shadow-2xs">
              <History className="size-4 text-brass-600" />
              <span className="font-semibold text-steel-500">Đã quét gần đây:</span>
              {recent.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => run(c)}
                  className="code rounded-lg border hairline bg-paper px-2.5 py-1 font-bold text-ink-950 transition hover:border-brass-500 hover:bg-brass-100/40"
                >
                  {c}
                </button>
              ))}
            </div>
          )}

          {err && (
            <Alert tone="bad" title="Không tìm thấy hoặc không thuộc cơ sở của bạn">
              {err}. Hãy thử quét lại mã QR đơn hàng (dạng RSV-2026-000123) hoặc chọn theo lịch hẹn bên cạnh.
            </Alert>
          )}

          {res && (
            <Card className="overflow-hidden border-2 border-brass-500 shadow-[var(--shadow-pop)]">
              <div className="grain flex flex-wrap items-center justify-between gap-2 bg-ink-950 px-5 py-3.5 text-white">
                <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-brass-400">
                  <CheckCircle2 className="size-4" />
                  Đã xác thực mã QR đơn hàng
                </span>
                <StatusBadge kind="reservation" value={res.reservation.status} />
              </div>
              <div className="space-y-4 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-steel-500">Mã đơn đặt kho</p>
                    <p className="code mt-0.5 text-2xl font-extrabold text-ink-950">{res.reservation.code}</p>
                    <p className="mt-1 text-sm font-medium text-steel-600">
                      Khách thuê: <b className="text-ink-950">{res.reservation.customer?.full_name}</b> ·{' '}
                      {res.reservation.unit_type?.name}
                    </p>
                  </div>
                  {res.preconditions?.unit && (
                    <div className="rounded-xl border border-brass-500/40 bg-brass-100/35 px-3.5 py-2 text-right">
                      <span className="block text-[11px] font-bold uppercase tracking-wider text-brass-700">
                        Kho được gán
                      </span>
                      <b className="code text-lg font-extrabold text-ink-950">{res.preconditions.unit.code}</b>
                    </div>
                  )}
                </div>

                {res.preconditions?.missing?.length > 0 && (
                  <Alert tone="warn" title="Chưa đủ điều kiện nhận kho">
                    <ul className="list-disc space-y-0.5 pl-5">
                      {res.preconditions.missing.map((b: string, i: number) => (
                        <li key={i}>
                          {MISSING[b] ?? (b.startsWith('STATUS_') ? `Đặt chỗ ở trạng thái ${b.slice(7)}` : b)}
                        </li>
                      ))}
                    </ul>
                  </Alert>
                )}

                <div className="flex flex-wrap gap-2.5 border-t hairline pt-4">
                  <Button
                    variant="primary"
                    size="lg"
                    className="flex-1"
                    loading={start.isPending}
                    disabled={!resume && res.preconditions?.ok === false}
                    onClick={() => start.mutate(undefined)}
                  >
                    {resume ? 'Tiếp tục phiên nhận kho (Check-in)' : 'Bắt đầu nhận kho (Check-in)'}
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={() => {
                      setRes(null);
                      setCam(true);
                    }}
                  >
                    Quét mã QR khác
                  </Button>
                </div>
              </div>
            </Card>
          )}
        </div>

        {/* Right Column: Upcoming Move-in Appointments */}
        <div>
          <Card className="overflow-hidden">
            <CardHead
              title="Lịch nhận kho sắp tới"
              sub="Chạm vào một lịch hẹn để kiểm tra nhanh đơn hàng của khách"
            />
            {board.isLoading ? (
              <p className="px-5 py-6 text-sm text-steel-500">Đang tải lịch hẹn…</p>
            ) : moveIns.length ? (
              <ul className="divide-y divide-steel-100">
                {moveIns.map((a: any) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => run(a.reservation.code)}
                      className="flex w-full items-center gap-3.5 px-5 py-3.5 text-left transition hover:bg-paper"
                    >
                      <span className="rounded-lg border hairline bg-paper px-2.5 py-1.5 text-xs font-extrabold text-ink-950 num">
                        {time(a.scheduled_start)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="code block text-xs font-bold text-ink-950">{a.reservation.code}</span>
                        <span className="block truncate text-xs text-steel-500">
                          {a.customer?.full_name ?? ''}
                          {a.unit?.code ? ` · Kho ${a.unit.code}` : ''}
                        </span>
                      </span>
                      <StatusBadge kind="appointment" value={a.status} />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                title="Không có lịch nhận kho sắp tới"
                hint="Quét mã QR trên đơn đặt kho của khách ở khung bên trái để bắt đầu Check-in."
              />
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
