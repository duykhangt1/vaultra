import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CalendarClock,
  KeyRound,
  Receipt,
  LifeBuoy,
  Plus,
  MapPin,
  Clock,
  PenLine,
  CalendarPlus,
  CircleCheck,
  Compass,
  ShieldCheck,
  Warehouse,
  CreditCard,
  Unlock,
} from 'lucide-react';
import { useGet } from '@/lib/hooks';
import { useAuth } from '@/lib/auth';
import { Async, Card, CardHead, StatusBadge, EmptyState, Button, Alert, Badge, cn } from '@/ui';
import { vnd, fmtDate, APPT_LABEL } from '@/lib/format';
import { unitImage, unitImageBySize, SCENES } from '@/lib/media';
import { MediaImg } from '@/ui/brand';
import { ReservationQrCard } from '../kit';

const todayKey = () => ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date().getDay()];

const KIND_ICON: Record<string, JSX.Element> = {
  PAY: <Receipt className="size-4" />,
  SIGN: <PenLine className="size-4" />,
  BOOK: <CalendarPlus className="size-4" />,
};

const dayOf = (v: string) => {
  const d = new Date(v);
  return {
    dd: String(d.getDate()).padStart(2, '0'),
    mm: `T${d.getMonth() + 1}`,
    hm: d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
  };
};

function leaseProgressPct(daysLeft: number | null | undefined): number {
  if (daysLeft === null || daysLeft === undefined) return 50;
  if (daysLeft <= 0) return 100;
  if (daysLeft >= 180) return 18;
  return Math.max(12, Math.min(96, Math.round(((180 - daysLeft) / 180) * 100)));
}

export function Dashboard() {
  const q = useGet<any>('/dashboard/customer');
  const [allTodo, setAllTodo] = useState(false);
  const user = useAuth((s) => s.user);
  const first = user?.fullName?.trim().split(/\s+/).slice(-1)[0] || 'Quý khách';

  const summaryData = q.data;
  const activeHeaderUnits = summaryData?.units?.filter((u: any) => u.status === 'ACTIVE') ?? [];
  const primaryUnit = activeHeaderUnits[0] ?? summaryData?.units?.[0] ?? null;
  const openResCount = summaryData?.reservations?.length ?? 0;
  const unpaidTotal =
    typeof summaryData?.balance === 'number' && summaryData.balance > 0
      ? summaryData.balance
      : summaryData?.nextDue?.amount ?? 0;

  return (
    <div className="space-y-6">
      {/* Architectural Welcome Concierge Banner */}
      <section className="relative overflow-hidden rounded-[var(--radius-media)] border border-brass-500/25 bg-[#091320] text-white shadow-[var(--shadow-pop)]">
        <div className="h-1 w-full bg-gradient-to-r from-brass-500 via-brass-400 to-brass-600/20" />
        <MediaImg
          src={SCENES.corridor.replace('.webp', '-sm.webp')}
          alt=""
          className="absolute inset-0 opacity-25"
        />
        <div className="blueprint-dark absolute inset-0 opacity-60" aria-hidden />
        <div
          className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full bg-brass-500/15 blur-3xl"
          aria-hidden
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#091320] via-[#091320]/92 to-[#091320]/60" />

        <div className="relative p-6 sm:p-8">
          <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div className="max-w-2xl">
              <h1 className="display text-[30px] text-white sm:text-[38px]">
                Xin chào, <span className="text-brass-400">{first}</span>
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-steel-300 sm:text-[15px]">
                Theo dõi hợp đồng thuê kho, mã PIN mở cửa và hóa đơn thanh toán của bạn.
              </p>

              {/* Live Summary Pills */}
              <div className="mt-5 flex flex-wrap items-center gap-2.5">
                <Link
                  to="/app/contracts"
                  className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.06] px-3.5 py-1.5 text-xs font-medium text-steel-200 backdrop-blur transition hover:border-brass-400/50 hover:bg-white/10"
                >
                  <Warehouse className="size-3.5 text-brass-400" />
                  <span>Kho đang thuê:</span>
                  <b className="font-mono text-brass-400 num">
                    {summaryData ? activeHeaderUnits.length : '—'}
                  </b>
                </Link>

                <Link
                  to="/app/reservations"
                  className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.06] px-3.5 py-1.5 text-xs font-medium text-steel-200 backdrop-blur transition hover:border-brass-400/50 hover:bg-white/10"
                >
                  <CalendarClock className="size-3.5 text-brass-400" />
                  <span>Đơn đặt chỗ:</span>
                  <b className="font-mono text-white num">
                    {summaryData ? openResCount : '—'}
                  </b>
                </Link>

                <Link
                  to="/app/billing"
                  className={cn(
                    'inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-medium backdrop-blur transition',
                    unpaidTotal > 0
                      ? 'border-brass-400/50 bg-brass-500/18 text-brass-100 hover:bg-brass-500/25'
                      : 'border-white/12 bg-white/[0.06] text-steel-200 hover:border-brass-400/40',
                  )}
                >
                  <Receipt className="size-3.5 text-brass-400" />
                  <span>Hóa đơn cần thanh toán:</span>
                  <b className="font-mono text-brass-400 num">
                    {summaryData ? (unpaidTotal > 0 ? vnd(unpaidTotal) : '0 ₫') : '—'}
                  </b>
                </Link>
              </div>
            </div>

            {/* Quick-Action Concierge Buttons */}
            <div className="flex flex-wrap items-center gap-2.5">
              <Link to="/book">
                <Button variant="primary" size="md" icon={<Plus className="size-4" />}>
                  Đặt thuê kho mới
                </Button>
              </Link>
              <Link
                to={
                  primaryUnit
                    ? `/app/contracts/${primaryUnit.id}?tab=access`
                    : '/app/contracts'
                }
              >
                <Button variant="glass" size="md" icon={<Compass className="size-4 text-brass-400" />}>
                  Xem sơ đồ &amp; Mở kho
                </Button>
              </Link>
              <Link to="/app/billing">
                <Button variant="glass" size="md" icon={<CreditCard className="size-4 text-brass-400" />}>
                  Thanh toán hóa đơn
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <Async q={q}>
        {(d) => {
          const active = d.units.filter((u: any) => u.status === 'ACTIVE');
          const overdue = d.units.some(
            (u: any) => u.delinquency && u.delinquency !== 'CURRENT',
          );
          const expiring = active.filter(
            (u: any) => u.daysLeft !== null && u.daysLeft <= 30,
          );
          const totalArea = active.reduce(
            (sum: number, u: any) => sum + Number(u.unitType?.area ?? 0),
            0,
          );
          const payTodos = (d.todo ?? []).filter((t: any) => t.kind === 'PAY');

          return (
            <div className="space-y-6">
              {/* Alerts */}
              {overdue && (
                <Alert
                  tone="bad"
                  title="Có khoản thanh toán quá hạn cần xử lý"
                  action={
                    <Link to="/app/billing">
                      <Button size="sm" variant="danger">
                        Thanh toán ngay
                      </Button>
                    </Link>
                  }
                >
                  Vui lòng hoàn tất thanh toán sớm để tránh phát sinh phí trễ hạn và duy trì quyền mở khóa kho 24/7.
                </Alert>
              )}

              {expiring.length > 0 && (
                <Alert
                  tone="warn"
                  title={
                    expiring.length === 1
                      ? `Hợp đồng ${expiring[0].code} sắp đến hạn gia hạn`
                      : `${expiring.length} hợp đồng sắp hết hạn trong vòng 30 ngày`
                  }
                  action={
                    <Link
                      to={
                        expiring.length === 1
                          ? `/app/contracts/${expiring[0].id}?tab=renew`
                          : '/app/contracts'
                      }
                    >
                      <Button size="sm" variant="primary">
                        Gia hạn ngay
                      </Button>
                    </Link>
                  }
                >
                  {expiring
                    .map((u: any) => `Kho ${u.unit?.code} còn ${u.daysLeft} ngày`)
                    .join(' · ')}
                  . Gia hạn trước hạn giúp giữ nguyên kho và mã PIN truy cập không gián đoạn.
                </Alert>
              )}

              {d.notices?.map((n: any) => (
                <Alert
                  key={n.id}
                  tone={
                    n.severity === 'CRITICAL'
                      ? 'bad'
                      : n.severity === 'WARNING'
                        ? 'warn'
                        : 'info'
                  }
                  title={`${n.title}${n.facility?.name ? ` · ${n.facility.name}` : ''}`}
                >
                  {n.body}
                </Alert>
              ))}

              {/* Upgraded 4-Card Executive KPI Strip */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Link
                  to="/app/contracts"
                  className="group relative overflow-hidden rounded-2xl border hairline bg-white p-5 shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:border-brass-500/60"
                >
                  <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#091320] via-brass-500 to-brass-400" />
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-steel-500">
                        Kho đang hoạt động
                      </p>
                      <p className="mt-2 text-3xl font-extrabold tracking-tight text-ink-950 num">
                        {active.length}
                      </p>
                    </div>
                    <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#091320] text-brass-400 shadow-sm transition group-hover:scale-105">
                      <Warehouse className="size-5" />
                    </span>
                  </div>
                  <p className="mt-3 flex items-center justify-between text-xs text-steel-500">
                    <span>
                      {totalArea > 0
                        ? `Tổng diện tích ${totalArea.toLocaleString('vi-VN')} m²`
                        : `${d.units.length} hợp đồng đã ký`}
                    </span>
                    <ArrowRight className="size-3.5 text-brass-600 transition group-hover:translate-x-0.5" />
                  </p>
                </Link>

                <Link
                  to="/app/billing"
                  className="group relative overflow-hidden rounded-2xl border hairline bg-white p-5 shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:border-brass-500/60"
                >
                  <div
                    className={cn(
                      'absolute inset-x-0 top-0 h-1',
                      overdue
                        ? 'bg-bad-600'
                        : d.nextDue
                          ? 'bg-brass-500'
                          : 'bg-ok-600',
                    )}
                  />
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-steel-500">
                        Hóa đơn kế tiếp
                      </p>
                      <p
                        className={cn(
                          'mt-2 truncate text-2xl font-extrabold tracking-tight num sm:text-[26px]',
                          overdue ? 'text-bad-600' : 'text-ink-950',
                        )}
                      >
                        {d.nextDue ? vnd(d.nextDue.amount) : '0 ₫'}
                      </p>
                    </div>
                    <span
                      className={cn(
                        'grid size-11 shrink-0 place-items-center rounded-xl transition group-hover:scale-105',
                        overdue
                          ? 'bg-bad-100 text-bad-600'
                          : 'bg-brass-100 text-brass-700',
                      )}
                    >
                      <Receipt className="size-5" />
                    </span>
                  </div>
                  <p className="mt-3 truncate text-xs text-steel-500">
                    {d.nextDue
                      ? `${d.nextDue.code} · Hạn ${fmtDate(d.nextDue.dueDate)}`
                      : 'Tất cả hóa đơn đã thanh toán'}
                  </p>
                </Link>

                <Link
                  to="/app/reservations"
                  className="group relative overflow-hidden rounded-2xl border hairline bg-white p-5 shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:border-brass-500/60"
                >
                  <div className="absolute inset-x-0 top-0 h-1 bg-info-600" />
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-steel-500">
                        Đặt chỗ &amp; Lịch hẹn
                      </p>
                      <p className="mt-2 text-3xl font-extrabold tracking-tight text-ink-950 num">
                        {d.reservations?.length ?? 0}
                      </p>
                    </div>
                    <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-info-100 text-info-600 transition group-hover:scale-105">
                      <CalendarClock className="size-5" />
                    </span>
                  </div>
                  <p className="mt-3 flex items-center justify-between text-xs text-steel-500">
                    <span>
                      {d.appointments?.length
                        ? `${d.appointments.length} lịch hẹn nhận/trả kho sắp tới`
                        : 'Chưa có lịch hẹn mới'}
                    </span>
                    <ArrowRight className="size-3.5 text-steel-400 transition group-hover:translate-x-0.5" />
                  </p>
                </Link>

                <Link
                  to="/app/support"
                  className="group relative overflow-hidden rounded-2xl border hairline bg-white p-5 shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:border-brass-500/60"
                >
                  <div className="absolute inset-x-0 top-0 h-1 bg-ok-600" />
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-steel-500">
                        Phiếu hỗ trợ
                      </p>
                      <p className="mt-2 text-3xl font-extrabold tracking-tight text-ink-950 num">
                        {d.openTickets ?? 0}
                      </p>
                    </div>
                    <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-ok-100 text-ok-600 transition group-hover:scale-105">
                      <LifeBuoy className="size-5" />
                    </span>
                  </div>
                  <p className="mt-3 flex items-center justify-between text-xs text-steel-500">
                    <span>
                      {d.openTickets
                        ? 'Phiếu đang được xử lý trực tiếp'
                        : 'Đội ngũ trực cơ sở hỗ trợ 24/7'}
                    </span>
                    <ArrowRight className="size-3.5 text-steel-400 transition group-hover:translate-x-0.5" />
                  </p>
                </Link>
              </div>

              {/* Main 2-Column Concierge Workspace */}
              <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
                <div className="space-y-6">
                  {/* Priority Action Checklist */}
                  <Card className="overflow-hidden">
                    <CardHead
                      title="Việc cần ưu tiên xử lý"
                      sub="Các tác vụ thanh toán, ký hợp đồng điện tử hoặc đặt lịch nhận kho của bạn"
                      action={
                        d.todo?.length ? (
                          <Badge tone="brass" dot>
                            {d.todo.length} việc cần làm
                          </Badge>
                        ) : (
                          <Badge tone="ok" dot>
                            Hoàn tất
                          </Badge>
                        )
                      }
                    />
                    {d.todo?.length ? (
                      <ul className="divide-y divide-steel-100">
                        {(allTodo ? d.todo : d.todo.slice(0, 5)).map(
                          (t: any, i: number) => (
                            <li key={i}>
                              <Link
                                to={t.link}
                                className="group flex items-center gap-3.5 px-5 py-3.5 transition hover:bg-paper"
                              >
                                <span
                                  className={cn(
                                    'grid size-9 shrink-0 place-items-center rounded-xl border transition',
                                    t.priority === 1
                                      ? 'border-bad-600/20 bg-bad-100 text-bad-600'
                                      : 'border-brass-500/30 bg-brass-100/60 text-brass-700',
                                  )}
                                >
                                  {KIND_ICON[t.kind] ?? (
                                    <CircleCheck className="size-4" />
                                  )}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-semibold leading-snug text-ink-950 group-hover:text-ink-800">
                                    {t.label}
                                  </p>
                                  <p className="mt-0.5 text-xs text-steel-500">
                                    {t.kind === 'PAY'
                                      ? 'Thanh toán trực tuyến tức thì'
                                      : t.kind === 'BOOK'
                                        ? 'Chọn khung giờ check-in tại quầy'
                                        : 'Xem và xác nhận ngay'}
                                  </p>
                                </div>
                                {t.priority === 1 && (
                                  <Badge tone="bad">Ưu tiên cao</Badge>
                                )}
                                <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-steel-100/80 text-steel-500 transition group-hover:bg-[#091320] group-hover:text-brass-400">
                                  <ArrowRight className="size-4" />
                                </span>
                              </Link>
                            </li>
                          ),
                        )}
                        {d.todo.length > 5 && (
                          <li>
                            <button
                              type="button"
                              onClick={() => setAllTodo((v) => !v)}
                              className="w-full bg-paper/60 px-5 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-brass-700 transition hover:bg-paper"
                            >
                              {allTodo
                                ? 'Thu gọn danh sách'
                                : `Xem thêm ${d.todo.length - 5} việc cần làm`}
                            </button>
                          </li>
                        )}
                      </ul>
                    ) : (
                      <div className="flex items-center gap-3.5 bg-paper/40 px-5 py-5 text-sm text-steel-600">
                        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-ok-100 text-ok-600">
                          <ShieldCheck className="size-5" />
                        </span>
                        <div>
                          <p className="font-semibold text-ink-950">
                            Tài khoản lưu trữ đang ở trạng thái tốt nhất
                          </p>
                          <p className="text-xs text-steel-500">
                            Mọi hóa đơn, hợp đồng thuê kho và lịch hẹn của bạn đều đã được xử lý đầy đủ.
                          </p>
                        </div>
                      </div>
                    )}
                  </Card>

                  {/* Active Contracts */}
                  <Card className="overflow-hidden">
                    <CardHead
                      title="Kho đang thuê"
                      sub="Chọn thao tác bên dưới để mở khóa từ xa, xem mã PIN hoặc xem lối đi trên sơ đồ"
                      action={
                        <Link
                          className="inline-flex items-center gap-1 text-sm font-semibold text-brass-700 hover:text-ink-950"
                          to="/app/contracts"
                        >
                          Tất cả hợp đồng
                          <ArrowRight className="size-3.5" />
                        </Link>
                      }
                    />
                    {d.units.length ? (
                      <div className="grid gap-4 p-4 sm:p-5 md:grid-cols-2">
                        {d.units.slice(0, 6).map((u: any) => {
                          const h = u.facility?.access_hours?.[todayKey()];
                          const pctUsed = leaseProgressPct(u.daysLeft);
                          const urgent =
                            u.daysLeft !== null &&
                            u.daysLeft !== undefined &&
                            u.daysLeft <= 30;
                          return (
                            <div
                              key={u.id}
                              className="group flex flex-col overflow-hidden rounded-2xl border border-steel-200 bg-white shadow-xs transition hover:border-brass-500 hover:shadow-md"
                            >
                              {/* Vault Pass Dark Architectural Header */}
                              <div className="relative flex items-center justify-between gap-2 bg-[#091320] px-4 py-3 text-white">
                                <div
                                  className="door-lines pointer-events-none absolute inset-0 opacity-35"
                                  aria-hidden
                                />
                                <div className="relative flex items-center gap-2.5">
                                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-brass-400/45 bg-brass-500/15 px-2.5 py-1 font-mono text-xs font-bold tracking-[0.14em] text-brass-400">
                                    <KeyRound className="size-3.5" />
                                    {u.unit?.code ?? 'VAULT'}
                                  </span>
                                  <span className="code text-xs text-steel-300">
                                    {u.code}
                                  </span>
                                </div>
                                <div className="relative">
                                  <StatusBadge kind="contract" value={u.status} />
                                </div>
                              </div>

                              {/* Vault Media + Specs */}
                              <Link
                                to={`/app/contracts/${u.id}`}
                                className="flex flex-1 gap-3.5 p-4 transition hover:bg-paper/50"
                              >
                                <MediaImg
                                  src={unitImage(
                                    {
                                      name: u.unitType?.name,
                                      size_category: u.unitType?.size ?? 'M',
                                    },
                                    true,
                                  )}
                                  alt={u.unitType?.name ?? ''}
                                  className="h-24 w-24 shrink-0 rounded-xl border hairline sm:h-28 sm:w-28"
                                  imgClassName="transition duration-700 group-hover:scale-105"
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-start justify-between gap-2">
                                    <p className="truncate text-[15px] font-bold text-ink-950">
                                      {u.unitType?.name}
                                    </p>
                                    {u.unitType?.area > 0 && (
                                      <span className="shrink-0 rounded-md bg-paper-2 px-2 py-0.5 font-mono text-[11px] font-semibold text-ink-800">
                                        {u.unitType.area} m²
                                      </span>
                                    )}
                                  </div>
                                  <p className="mt-1 flex items-center gap-1 truncate text-xs text-steel-500">
                                    <MapPin className="size-3.5 shrink-0 text-brass-600" />
                                    {u.facility?.name}
                                    {u.unit?.zone ? ` · ${u.unit.zone}` : ''}
                                  </p>
                                  <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                                    <span className="inline-flex items-center gap-1 text-steel-500">
                                      <Clock className="size-3.5 text-steel-400" />
                                      {h
                                        ? `Mở cửa ${h[0]}–${h[1]}`
                                        : 'Hôm nay đóng cửa'}
                                    </span>
                                    <span className="font-mono text-sm font-extrabold text-ink-950 num">
                                      {vnd(u.monthlyRent)}
                                      <span className="text-[11px] font-normal text-steel-500">
                                        /th
                                      </span>
                                    </span>
                                  </div>

                                  {/* Lease Progress Bar */}
                                  <div className="mt-3">
                                    <div className="mb-1 flex items-center justify-between text-[11px]">
                                      <span className="text-steel-500">
                                        Hết hạn {fmtDate(u.endDate)}
                                      </span>
                                      <span
                                        className={cn(
                                          'font-semibold num',
                                          u.daysLeft !== null && u.daysLeft < 0
                                            ? 'text-bad-600'
                                            : urgent
                                              ? 'text-warn-600'
                                              : 'text-ink-800',
                                        )}
                                      >
                                        {u.daysLeft !== null && u.daysLeft < 0
                                          ? `Quá hạn ${Math.abs(u.daysLeft)} ngày`
                                          : `Còn ${u.daysLeft ?? '—'} ngày`}
                                      </span>
                                    </div>
                                    <div className="h-1.5 overflow-hidden rounded-full bg-steel-100">
                                      <div
                                        className={cn(
                                          'h-full rounded-full transition-all',
                                          u.daysLeft !== null && u.daysLeft < 0
                                            ? 'bg-bad-600'
                                            : urgent
                                              ? 'bg-warn-600'
                                              : 'bg-brass-500',
                                        )}
                                        style={{ width: `${pctUsed}%` }}
                                      />
                                    </div>
                                  </div>
                                </div>
                              </Link>

                              {/* 1-Click Vault Actions Footer */}
                              <div className="grid grid-cols-2 divide-x divide-steel-200/80 border-t hairline bg-paper/70 text-xs font-semibold">
                                <Link
                                  to={`/app/contracts/${u.id}?tab=access`}
                                  className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-ink-900 transition hover:bg-brass-100/60 hover:text-ink-950"
                                >
                                  <Unlock className="size-3.5 text-brass-700" />
                                  Mã PIN &amp; Mở kho
                                </Link>
                                <Link
                                  to={`/app/contracts/${u.id}`}
                                  className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-ink-900 transition hover:bg-brass-100/60 hover:text-ink-950"
                                >
                                  <Compass className="size-3.5 text-ok-600" />
                                  Sơ đồ 3D &amp; Hồ sơ
                                </Link>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="grid items-center gap-6 p-6 md:grid-cols-[260px_1fr]">
                        <MediaImg
                          src={unitImageBySize('M', true)}
                          alt=""
                          className="aspect-[4/3] rounded-2xl border hairline"
                        />
                        <EmptyState
                          icon={<KeyRound className="size-6" />}
                          title="Chưa có hợp đồng thuê kho"
                          hint="Kho lưu trữ và thẻ mở khóa thông minh sẽ xuất hiện tại đây ngay sau khi bạn ký hợp đồng và nhận bàn giao kho."
                          action={
                            <Link to="/book">
                              <Button variant="primary">
                                Đặt thuê kho ngay
                                <ArrowRight className="size-4" />
                              </Button>
                            </Link>
                          }
                        />
                      </div>
                    )}
                  </Card>
                </div>

                {/* Right Concierge Rail */}
                <div className="space-y-6">
                  {/* Active Reservations & Boarding Pass QR */}
                  {d.reservations?.length > 0 && (
                    <Card className="overflow-hidden">
                      <CardHead
                        title="Đặt chỗ & Vé QR Check-in"
                        sub="Xuất trình mã QR tại quầy lễ tân cơ sở"
                        action={
                          <Link
                            className="text-sm font-semibold text-brass-700 hover:text-ink-950"
                            to="/app/reservations"
                          >
                            Tất cả
                          </Link>
                        }
                      />
                      <div className="space-y-4 p-4">
                        {d.reservations.slice(0, 2).map((r: any) => (
                          <div
                            key={r.id}
                            className="overflow-hidden rounded-2xl border border-brass-500/35 bg-paper/50"
                          >
                            <Link
                              to={`/app/reservations/${r.id}`}
                              className="flex items-center justify-between gap-2 bg-[#091320] px-3.5 py-2.5 text-white transition hover:bg-ink-900"
                            >
                              <div className="min-w-0">
                                <span className="font-mono text-xs font-bold tracking-wider text-brass-400">
                                  {r.code}
                                </span>
                                <span className="block truncate text-[11px] text-steel-300">
                                  {r.unit_type?.name} · {r.facility?.name}
                                </span>
                              </div>
                              <StatusBadge kind="reservation" value={r.status} />
                            </Link>
                            <div className="p-2.5">
                              <ReservationQrCard
                                code={r.code}
                                facilityName={r.facility?.name}
                                compact
                                className="!border-0 !bg-transparent !p-1"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </Card>
                  )}

                  {/* Upcoming Appointments */}
                  <Card className="overflow-hidden">
                    <CardHead
                      title="Lịch hẹn tại cơ sở"
                      action={
                        <Link
                          className="text-sm font-semibold text-brass-700 hover:text-ink-950"
                          to="/app/reservations"
                        >
                          Đặt chỗ
                        </Link>
                      }
                    />
                    {d.appointments?.length ? (
                      <ul className="divide-y divide-steel-100">
                        {d.appointments.map((a: any) => {
                          const t = dayOf(a.scheduled_start);
                          return (
                            <li key={a.id}>
                              <Link
                                to={
                                  a.reservation?.id
                                    ? `/app/reservations/${a.reservation.id}`
                                    : '/app/reservations'
                                }
                                className="flex items-center gap-3.5 px-5 py-3.5 transition hover:bg-paper"
                              >
                                <div className="grid w-12 shrink-0 place-items-center overflow-hidden rounded-xl border border-brass-500/40 bg-[#091320] py-1.5 text-white shadow-xs">
                                  <span className="text-lg font-extrabold leading-none text-brass-400 num">
                                    {t.dd}
                                  </span>
                                  <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-steel-300">
                                    {t.mm}
                                  </span>
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-bold text-ink-950">
                                    {APPT_LABEL[a.type] ?? a.type}
                                    {a.reservation?.code
                                      ? ` · ${a.reservation.code}`
                                      : ''}
                                  </p>
                                  <p className="mt-0.5 text-xs font-medium text-steel-600">
                                    {t.hm} · {a.facility?.name}
                                  </p>
                                  {a.facility?.address_line && (
                                    <p className="truncate text-xs text-steel-400">
                                      {a.facility.address_line}
                                    </p>
                                  )}
                                </div>
                                <ArrowRight className="size-4 shrink-0 text-steel-400" />
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <EmptyState
                        icon={<CalendarClock className="size-6" />}
                        title="Chưa có lịch hẹn sắp tới"
                        hint="Lịch hẹn nhận kho, kiểm tra và bàn giao trả kho sẽ hiển thị tại đây."
                      />
                    )}
                  </Card>

                  {/* Billing Summary Card */}
                  <Card className="overflow-hidden">
                    <CardHead
                      title="Tài chính & Hóa đơn"
                      action={
                        <Link
                          className="text-sm font-semibold text-brass-700 hover:text-ink-950"
                          to="/app/billing"
                        >
                          Chi tiết
                        </Link>
                      }
                    />
                    <div className="space-y-3 p-5">
                      <div className="flex items-baseline justify-between rounded-xl border hairline bg-paper px-4 py-3">
                        <span className="text-xs font-semibold uppercase tracking-wider text-steel-500">
                          Tổng dư nợ hiện tại
                        </span>
                        <span
                          className={cn(
                            'text-lg font-extrabold num',
                            d.balance > 0 ? 'text-bad-600' : 'text-ink-950',
                          )}
                        >
                          {vnd(d.balance ?? 0)}
                        </span>
                      </div>
                      {payTodos.length > 0 ? (
                        <ul className="space-y-2">
                          {payTodos.slice(0, 3).map((item: any, idx: number) => (
                            <li key={idx}>
                              <Link
                                to={item.link}
                                className="flex items-center justify-between gap-2 rounded-xl border border-brass-500/30 bg-brass-100/25 px-3.5 py-2.5 text-xs font-semibold text-ink-950 transition hover:border-brass-500"
                              >
                                <span className="truncate">{item.label}</span>
                                <span className="shrink-0 text-brass-700">
                                  Trả ngay →
                                </span>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-steel-500">
                          Không có hóa đơn chờ thanh toán. Mọi biên nhận VAT điện tử được lưu trữ đầy đủ trong mục Hóa đơn.
                        </p>
                      )}
                    </div>
                  </Card>

                  {/* Concierge Help Card */}
                  <div className="relative overflow-hidden rounded-2xl border border-brass-500/35 bg-[#091320] p-5 text-white shadow-[var(--shadow-card)]">
                    <div
                      className="door-lines pointer-events-none absolute inset-0 opacity-30"
                      aria-hidden
                    />
                    <div className="relative">
                      <p className="text-base font-bold text-white">
                        Cần hỗ trợ tại kho?
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-steel-300">
                        Cấp lại mã PIN, hỗ trợ mở khóa, kiểm tra kho hoặc giải đáp hóa đơn — nhân viên cơ sở phản hồi trực tiếp.
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Link to="/app/support">
                          <Button size="sm" variant="primary">
                            Gửi yêu cầu hỗ trợ
                          </Button>
                        </Link>
                        <Link to="/app/notifications">
                          <Button size="sm" variant="glass">
                            Thông báo
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        }}
      </Async>
    </div>
  );
}
