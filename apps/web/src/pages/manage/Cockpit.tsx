import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CheckSquare,
  ClipboardList,
  Timer,
  RefreshCw,
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Map,
  BarChart3,
  TrendingUp,
  TrendingDown,
  Wallet,
  Boxes,
  Receipt,
  PackageOpen,
} from 'lucide-react';
import { metricDoc } from '@vaultra/shared';
import Chart from '@/widgets/Chart';
import { Titled } from '@/widgets/Titled';
import { PeriodPicker, periodOf, periodLabel } from '@/widgets/PeriodPicker';
import type { Period } from '@/widgets/PeriodPicker';
import { tipMoney, tipPct, axisMillions, axisPct } from '@/widgets/chart-format';
import { useGet } from '@/lib/hooks';
import { Async, Card, CardHead, Progress, Badge, EmptyState, StatusBadge, Avatar, Button, HelpTip, Tip, cn } from '@/ui';
import { vnd, pct, fmtDate, todayVn, STATUS, APPT_LABEL } from '@/lib/format';
import { useFacility } from '../shared/Ops';

/** Change against the comparison figure, as a whole signed percentage ("+12%"), or null when there is no base to compare to. */
const delta = (cur: number, prev: number) => (prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null);
const hm = (v: string) => new Date(v).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });
/** 2026-11-12T00:00:00Z → 12/11 */
const dm = (v: string) => `${String(v).slice(8, 10)}/${String(v).slice(5, 7)}`;
const UNIT_ORDER = [
  'OCCUPIED',
  'OVERLOCKED',
  'RESERVED',
  'PENDING_INSPECTION',
  'MAINTENANCE',
  'OUT_OF_SERVICE',
  'AVAILABLE',
];
const UNIT_COLOR: Record<string, string> = {
  OCCUPIED: '#c8963e',
  OVERLOCKED: '#b9473c',
  RESERVED: '#5b86b5',
  PENDING_INSPECTION: '#d9a93a',
  MAINTENANCE: '#8c97a3',
  OUT_OF_SERVICE: '#5a6573',
  AVAILABLE: '#cfd6de',
};

function OccupancyRing({ rate }: { rate: number }) {
  const clamped = Math.max(0, Math.min(1, rate || 0));
  const r = 26;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - clamped);
  return (
    <div className="relative grid size-16 shrink-0 place-items-center">
      <svg viewBox="0 0 64 64" className="size-16 -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="5.5" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke="#c8963e"
          strokeWidth="5.5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <span className="absolute text-xs font-extrabold text-white num">{Math.round(clamped * 100)}%</span>
    </div>
  );
}

/** A tile that opens the screen where the thing is handled. The "i" sits beside the link, not inside it. */
function Attention({
  to,
  icon,
  label,
  value,
  hint,
  hot,
  help,
}: {
  to: string;
  icon: JSX.Element;
  label: string;
  value: number;
  hint: string;
  hot?: 'bad' | 'warn';
  help: string;
}) {
  const on = value > 0 && hot;
  return (
    <div className="relative">
      <Link
        to={to}
        className={cn(
          'group relative flex h-full items-center gap-3.5 overflow-hidden rounded-2xl border bg-white px-4 py-3.5 shadow-[var(--shadow-card)] transition hover:border-ink-900',
          on === 'bad' ? 'border-bad-600/40' : on === 'warn' ? 'border-warn-600/40' : 'hairline',
        )}
      >
        <div
          className={cn(
            'pointer-events-none absolute inset-x-0 top-0 h-1',
            on === 'bad' ? 'bg-bad-600' : on === 'warn' ? 'bg-warn-600' : 'bg-steel-200',
          )}
        />
        <span
          className={cn(
            'grid size-10 shrink-0 place-items-center rounded-xl',
            on === 'bad'
              ? 'bg-bad-100 text-bad-600'
              : on === 'warn'
                ? 'bg-warn-100 text-warn-600'
                : 'bg-paper text-steel-500',
          )}
        >
          {icon}
        </span>
        <span className="min-w-0 flex-1 pr-3">
          <span className="block text-2xl font-extrabold leading-none text-ink-950 num">{value}</span>
          <span className="mt-1 block text-xs font-bold leading-snug text-ink-900">{label}</span>
          <span className="block text-[11px] leading-snug text-steel-500">{hint}</span>
        </span>
        <ArrowRight className="hidden size-4 shrink-0 text-steel-300 transition group-hover:translate-x-0.5 group-hover:text-ink-900 2xl:block" />
      </Link>
      <span className="absolute right-2 top-2.5 z-10">
        <HelpTip text={help} label={`Giải thích: ${label}`} />
      </span>
    </div>
  );
}

/** Pending decisions live in different screens (damages in the move-out inspection, swaps in the roster…), so each kind links to its own place. */
const APPROVAL_KINDS: { key: string; label: string; to: string; help: string }[] = [
  { key: 'refunds', label: 'hoàn tiền', to: '/manage/approvals', help: 'Khoản hoàn tiền trong hạn mức của quản lý cơ sở, đang chờ bạn duyệt.' },
  { key: 'waivers', label: 'miễn phí', to: '/manage/approvals?tab=waivers', help: 'Đề xuất miễn phí trong hạn mức của quản lý cơ sở, đang chờ bạn duyệt.' },
  { key: 'damages', label: 'hư hại', to: '/manage/moveouts', help: 'Hạng mục hư hại ghi nhận lúc kiểm tra trả kho, chờ bạn xác nhận mức bồi thường.' },
  { key: 'swaps', label: 'đổi ca', to: '/manage/schedule', help: 'Yêu cầu đổi ca của nhân viên, chờ bạn đồng ý hoặc từ chối.' },
  { key: 'terminations', label: 'thu hồi kho', to: '/manage/delinquency?tab=term', help: 'Hợp đồng quá hạn đến mức chờ xử lý vi phạm: bạn xác nhận thu hồi ở bước 1, sau đó BOM duyệt.' },
  { key: 'allocations', label: 'phân kho', to: '/manage/tasks', help: 'Việc phân kho cho đơn đặt đang mở, cần gán một kho cụ thể.' },
];

function ApprovalTile({ ap, total }: { ap: Record<string, number>; total: number }) {
  const items = APPROVAL_KINDS.filter((a) => Number(ap[a.key]) > 0);
  const on = total > 0;
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border bg-white px-4 py-3.5 shadow-[var(--shadow-card)]',
        on ? 'border-brass-500/50' : 'hairline',
      )}
    >
      <div
        className={cn(
          'pointer-events-none absolute inset-x-0 top-0 h-1',
          on ? 'bg-brass-500' : 'bg-steel-200',
        )}
      />
      <span className="absolute right-2 top-2.5 z-10">
        <HelpTip text={'Tổng số việc đang chờ bạn quyết định. Bấm vào từng loại để mở đúng nơi xử lý: hoàn tiền và miễn phí ở mục Phê duyệt, hư hại ở Trả kho, đổi ca ở Lịch ca, thu hồi kho ở Công nợ, phân kho ở Công việc.'} label="Giải thích: Chờ bạn phê duyệt" />
      </span>
      <Link to={items[0]?.to ?? '/manage/approvals'} className="group flex items-center gap-3.5">
        <span
          className={cn(
            'grid size-10 shrink-0 place-items-center rounded-xl',
            on ? 'bg-ink-950 text-brass-400' : 'bg-paper text-steel-500',
          )}
        >
          <CheckSquare className="size-4" />
        </span>
        <span className="min-w-0 flex-1 pr-3">
          <span className="block text-2xl font-extrabold leading-none text-ink-950 num">{total}</span>
          <span className="mt-1 block text-xs font-bold leading-snug text-ink-900">Chờ bạn phê duyệt</span>
        </span>
        <ArrowRight className="hidden size-4 shrink-0 text-steel-300 transition group-hover:translate-x-0.5 group-hover:text-ink-900 2xl:block" />
      </Link>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
        {items.length ? (
          items.map((a) => (
            <Tip key={a.key} text={a.help}>
              <Link to={a.to} className="font-bold text-brass-700 hover:underline">
                <span className="num">{ap[a.key]}</span> {a.label}
              </Link>
            </Tip>
          ))
        ) : (
          <span className="text-steel-400">Không có yêu cầu tồn đọng</span>
        )}
      </div>
    </div>
  );
}

function OccupancyTile({
  label,
  rate,
  sub,
  help,
}: {
  label: string;
  rate: number;
  sub: string;
  help: string;
}) {
  return (
    <div className="rounded-2xl border hairline bg-white p-4 shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center text-xs font-bold uppercase tracking-wider text-steel-500">
          {label}
          <HelpTip text={help} label={`Giải thích: ${label}`} />
        </p>
        <Boxes className="size-4 text-brass-600" />
      </div>
      <p className="mt-1.5 text-2xl font-extrabold text-ink-950 num">{pct(rate, 1)}</p>
      <div className="mt-2.5">
        <Progress value={(rate ?? 0) * 100} tone="brass" />
      </div>
      <p className="mt-2 text-xs font-medium text-steel-500">{sub}</p>
    </div>
  );
}

/** A money figure for the month so far, compared with the same number of days of the previous month. */
function Money({
  label,
  value,
  prev,
  prevFull,
  hint,
  help,
  span,
  custom,
}: {
  label: string;
  value: number;
  prev: number;
  prevFull: number;
  hint: string;
  help: string;
  span: string;
  custom?: boolean;
}) {
  const d = delta(value, prev);
  return (
    <div className="rounded-2xl border hairline bg-white p-4 shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center text-xs font-bold uppercase tracking-wider text-steel-500">
          {label}
          <HelpTip text={`${help}\n\n${span}\nCả tháng trước: ${vnd(prevFull)}.`} label={`Giải thích: ${label}`} />
        </p>
        <Wallet className="size-4 text-ink-700" />
      </div>
      <p className="mt-1.5 text-2xl font-extrabold text-ink-950 num">{vnd(value)}</p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="text-steel-500">{hint}</span>
        {d !== null && (
          <Tip text={`So với cùng số ngày đầu của tháng trước: ${vnd(prev)}. Tháng này mới đi được một phần nên không so với cả tháng trước (${vnd(prevFull)}).`}>
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-bold num',
                d >= 0 ? 'bg-info-100 text-info-600' : 'bg-bad-100 text-bad-600',
              )}
            >
              {d >= 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
              {d >= 0 ? '+' : ''}
              {d}% so với {custom ? 'kỳ trước' : 'cùng kỳ tháng trước'}
            </span>
          </Tip>
        )}
      </div>
    </div>
  );
}

const AGING_ROWS: [string, string, string][] = [
  ['current', 'Chưa đến hạn', 'ar.current'],
  ['d0_30', 'Quá hạn 1–30 ngày', 'ar.d0_30'],
  ['d31_60', 'Quá hạn 31–60 ngày', 'ar.d31_60'],
  ['d61_90', 'Quá hạn 61–90 ngày', 'ar.d61_90'],
  ['d90_plus', 'Trên 90 ngày', 'ar.d90_plus'],
];

export function Cockpit() {
  const { id, facility } = useFacility();
  const [period, setPeriod] = useState<Period>(() => periodOf('thisMonth'));
  // this month keeps the usual comparison with the same days of last month; any other period is compared with the period of equal length before it
  const q = useGet<any>(id ? `/dashboard/facility/${id}` : null, period.preset === 'thisMonth' ? undefined : { from: period.from, to: period.to }, { keepPrevious: true });
  const liveOcc = q.data?.occupancy;

  return (
    <div className="space-y-6">
      {/* Executive Facility Manager Command Center Banner */}
      <div className="grain blueprint-dark relative overflow-hidden rounded-2xl border border-ink-800 bg-ink-950 p-5 text-white shadow-[var(--shadow-card)] sm:p-7">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brass-600 via-brass-400 to-brass-600" />
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
          <div className="space-y-2">
            <p className="text-xs font-medium text-steel-300">{fmtDate(todayVn())}</p>
            <h1 className="display inline-flex items-center text-2xl text-white sm:text-3xl">
              {facility?.name ?? 'Bảng điều khiển cơ sở'}
              <HelpTip onDark text={'Bảng điều khiển của cơ sở bạn đang chọn: việc cần xử lý, lấp đầy, tiền thu trong tháng, công nợ và lịch hôm nay.\nSố liệu cập nhật khi có thay đổi và dùng chung nguồn với trang Báo cáo nên hai nơi luôn khớp nhau.'} />
            </h1>
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              <Tip text="Xem sơ đồ mặt bằng các ô kho và trạng thái từng kho.">
                <Link to="/manage/floor">
                  <Button size="xs" variant="glass" icon={<Map className="size-3.5 text-brass-400" />}>
                    Sơ đồ kho
                  </Button>
                </Link>
              </Tip>
              <Tip text="Duyệt hoàn tiền và miễn phí thuộc hạn mức của quản lý cơ sở.">
                <Link to="/manage/approvals">
                  <Button size="xs" variant="glass" icon={<CheckSquare className="size-3.5 text-brass-400" />}>
                    Phê duyệt
                  </Button>
                </Link>
              </Tip>
              <Tip text="Mở trang Báo cáo với đầy đủ bảng số liệu theo kỳ, xuất được ra CSV, Excel và PDF.">
                <Link to="/manage/reports">
                  <Button size="xs" variant="glass" icon={<BarChart3 className="size-3.5 text-brass-400" />}>
                    Báo cáo chi tiết
                  </Button>
                </Link>
              </Tip>
              <Tip text="Thống kê từng khoản hoàn tiền của cơ sở: lý do, trạng thái và số tiền. Bấm vào một dòng để xem chi tiết.">
                <Link to="/manage/reports?report=refunds">
                  <Button size="xs" variant="glass" icon={<Receipt className="size-3.5 text-brass-400" />}>
                    Thống kê hoàn tiền
                  </Button>
                </Link>
              </Tip>
              <Tip text="Thống kê từng hồ sơ hàng khách bỏ lại sau khi thu hồi kho: danh mục, cách xử lý và tiền thu được.">
                <Link to="/manage/reports?report=abandoned-goods">
                  <Button size="xs" variant="glass" icon={<PackageOpen className="size-3.5 text-brass-400" />}>
                    Thống kê tài sản tồn đọng
                  </Button>
                </Link>
              </Tip>
            </div>
          </div>

          {liveOcc && (
            <div className="flex items-center gap-4 self-start rounded-2xl border border-white/15 bg-white/[0.06] px-4 py-3 backdrop-blur lg:self-center">
              <OccupancyRing rate={liveOcc.unitRate} />
              <div className="space-y-0.5 text-xs">
                <p className="flex items-center font-mono text-[10.5px] font-semibold uppercase tracking-[0.16em] text-brass-400">
                  Hiệu suất khai thác
                  <HelpTip onDark text={`${metricDoc('occ.unit')}\n\n${metricDoc('occ.economic')}`} />
                </p>
                <p className="text-sm font-bold text-white num">
                  {liveOcc.occupied}/{liveOcc.rentable} kho có khách
                </p>
                <p className="text-steel-300 num">
                  {liveOcc.byStatus?.OCCUPIED ?? 0} đang thuê + {liveOcc.byStatus?.OVERLOCKED ?? 0} khóa chặn
                </p>
                <p className="text-steel-300 num">
                  Lấp đầy kinh tế: <b className="text-white">{pct(liveOcc.economicRate, 1)}</b>
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div>
            <p className="mb-2 flex items-center text-xs font-bold uppercase tracking-wider text-steel-500">
              Kỳ xem số liệu
              <HelpTip text={'Chọn khoảng thời gian cho các số tiền (phát hành, đã thu, ghi nhận) và số lượt nhận/trả kho.\nLấp đầy, công nợ, lịch hẹn và trạng thái kho luôn là tình hình ngay lúc xem.\nTháng này so với cùng số ngày của tháng trước; kỳ khác so với kỳ cùng độ dài liền trước.'} />
            </p>
            <PeriodPicker value={period} onChange={setPeriod} />
          </div>
          <p className="max-w-md text-xs leading-relaxed text-steel-600">
            <b className="text-ink-950">Lấp đầy, công nợ, lịch hẹn:</b> tại thời điểm xem.
            <br />
            <b className="text-ink-950">Tiền, nhận/trả kho:</b> kỳ {periodLabel(period)}.
          </p>
        </div>
      </Card>

      <Async q={q}>
        {(d) => {
          const o = d.occupancy,
            rev = d.revenue,
            ag = d.aging,
            ap = d.approvals ?? {};
          const trend = d.trend ?? [];
          const approvalTotal = Object.values(ap).reduce((a: number, b: any) => a + Number(b || 0), 0) as number;
          const funnel: [string, number][] = [
            'GRACE',
            'LATE',
            'LOCKED_OUT',
            'FINAL_NOTICE',
            'DEFAULT_PENDING',
          ].map((k) => [k, d.delinquencyFunnel?.[k] ?? 0]);
          const delinquent = funnel.reduce((a, [, n]) => a + n, 0);
          const tickets = d.tickets ?? { byPriority: {}, breached: 0 };
          const openTickets = Object.values(tickets.byPriority).reduce((a: number, b: any) => a + Number(b), 0) as number;
          const statuses = UNIT_ORDER.filter((k) => o.byStatus?.[k]);
          const statusTotal = statuses.reduce((a, k) => a + o.byStatus[k], 0);
          const custom = !!rev.period?.custom;
          const mv = d.moveActivity?.custom ? 'trong kỳ' : '7 ngày';
          const per = custom ? 'trong kỳ' : 'tháng này';
          const span = rev.period ? `${custom ? 'Kỳ này' : 'Tháng này'} tính từ ${dm(rev.period.from)} đến ${dm(rev.period.to)}; ${custom ? 'kỳ trước' : 'cùng kỳ tháng trước'} là ${dm(rev.period.prevFrom)} đến ${dm(rev.period.prevTo)}.` : 'Tháng này tính đến hôm nay.';
          const prevFull = (k: string) => rev.prevMonthFull?.[k] ?? rev.prevMonth[k];
          const months = trend.map((t: any) => `${t.month.slice(5)}/${t.month.slice(0, 4)}`);
          const rate = (v: number | null) => (v === null || v === undefined ? null : v);

          return (
            <div className="space-y-6">
              {/* Priority Action Matrix */}
              <section aria-label="Cần xử lý">
                <div className="mb-2.5 flex items-center justify-between">
                  <h2 className="flex items-center text-xs font-bold uppercase tracking-wider text-steel-500">
                    Hạng mục ưu tiên cần điều hành
                    <HelpTip text="Năm ô cần chú ý nhất của cơ sở. Ô nào có số lớn hơn 0 sẽ được tô viền để dễ thấy; bấm vào ô để mở đúng màn hình xử lý." />
                  </h2>
                </div>
                <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-5">
                  <ApprovalTile ap={ap} total={approvalTotal} />
                  <Attention
                    to="/manage/delinquency?ct=live"
                    icon={<AlertTriangle className="size-4" />}
                    label="Hợp đồng quá hạn"
                    value={delinquent}
                    hint={delinquent ? `${d.delinquencyFunnel?.LOCKED_OUT ?? 0} đang khóa truy cập` : 'Không có công nợ trễ'}
                    hot="bad"
                    help={'Số hợp đồng còn hiệu lực đang ở một trong các giai đoạn nợ: ân hạn, trễ hạn, khóa truy cập, thông báo cuối, chờ xử lý vi phạm.\nHợp đồng đã chấm dứt không đếm ở đây (vẫn xem được ở trang Công nợ). Số này bằng tổng của phễu xử lý quá hạn bên dưới.'}
                  />
                  <Attention
                    to="/manage/tasks"
                    icon={<ClipboardList className="size-4" />}
                    label="Việc quá hạn"
                    value={d.overdueTasks ?? 0}
                    hint={
                      (d.overdueTasks ?? 0) > 0
                        ? 'Cần giao lại hoặc xử lý ngay'
                        : ap.allocations
                          ? `${ap.allocations} việc phân bổ kho đang mở`
                          : 'Đội ngũ đang đúng tiến độ'
                    }
                    hot="bad"
                    help={metricDoc('tasks.overdue')}
                  />
                  <Attention
                    to={tickets.breached > 0 ? '/manage/tickets?breached=1' : '/manage/tickets'}
                    icon={<Timer className="size-4" />}
                    label="Phiếu trễ SLA"
                    value={tickets.breached}
                    hint={`${openTickets} phiếu hỗ trợ đang mở`}
                    hot="bad"
                    help={metricDoc('tickets.breached')}
                  />
                  <Attention
                    to="/manage/renewals"
                    icon={<RefreshCw className="size-4" />}
                    label="Hết hạn trong 30 ngày"
                    value={d.expiring30d ?? 0}
                    hint="Cần chốt gia hạn hoặc trả kho"
                    hot="warn"
                    help={metricDoc('contracts.expiring')}
                  />
                </div>
              </section>

              {/* High-Clarity Occupancy & Financial KPI Grid */}
              <section aria-label="Chỉ số" className="space-y-3.5">
                <div className="grid gap-3.5 sm:grid-cols-3">
                  <OccupancyTile
                    label="Lấp đầy theo kho"
                    rate={o.unitRate}
                    sub={`${o.occupied}/${o.rentable} kho có khách (${o.byStatus?.OCCUPIED ?? 0} thuê + ${o.byStatus?.OVERLOCKED ?? 0} khóa chặn)`}
                    help={metricDoc('occ.unit')}
                  />
                  <OccupancyTile
                    label="Lấp đầy theo diện tích (m²)"
                    rate={o.areaRate}
                    sub={`${Math.round(o.areaOccupied)}/${Math.round(o.areaRentable)} m² diện tích hữu dụng`}
                    help={metricDoc('occ.area')}
                  />
                  <OccupancyTile
                    label="Lấp đầy kinh tế"
                    rate={o.economicRate}
                    sub={`Tiền thuê thực tế ${vnd(o.actualRent)} / tiềm năng ${vnd(o.potentialRent)} mỗi tháng`}
                    help={metricDoc('occ.economic')}
                  />
                </div>
                <div className="grid gap-3.5 sm:grid-cols-3">
                  <Money
                    label={`Phát hành ${per}`}
                    value={rev.month.billed}
                    prev={rev.prevMonth.billed}
                    prevFull={prevFull('billed')}
                    hint="Tổng giá trị hóa đơn"
                    help={metricDoc('rev.billed')}
                    span={span}
                    custom={custom}
                  />
                  <Money
                    label={`Đã thu ${per}`}
                    value={rev.month.collected}
                    prev={rev.prevMonth.collected}
                    prevFull={prevFull('collected')}
                    hint="Thực thu sau hoàn tiền"
                    help={metricDoc('rev.collected')}
                    span={span}
                    custom={custom}
                  />
                  <Money
                    label={`Ghi nhận ${per}`}
                    value={rev.month.recognized}
                    prev={rev.prevMonth.recognized}
                    prevFull={prevFull('recognized')}
                    hint="Doanh thu phân bổ theo kỳ"
                    help={metricDoc('rev.recognized')}
                    span={span}
                    custom={custom}
                  />
                </div>
              </section>

              {/* 12-Month Trend & AR Aging */}
              <div className="grid gap-6 lg:grid-cols-3">
                <Card className="lg:col-span-2">
                  <CardHead
                    title={<Titled label="Xu hướng khai thác 12 tháng" help={'Mỗi điểm là một tháng dương lịch (giờ Việt Nam). Ba đường là ba cách đo lấp đầy; cột là tiền thực thu trong tháng.\nLấp đầy lấy số cuối tháng (tháng hiện tại là số ngay lúc xem). Tháng chưa có ảnh chụp thì để trống, không phải 0%.\nDi chuột vào biểu đồ để xem số chính xác; hộp số liệu giữ nguyên cho đến khi bạn rời chuột.'} />}
                    sub="Đối chiếu 3 chỉ số lấp đầy (%) và dòng tiền thực thu"
                  />
                  <div className="p-3">
                    <Chart
                      style={{ height: 290 }}
                      ariaLabel="Xu hướng lấp đầy và doanh thu"
                      option={{
                        grid: { left: 48, right: 64, top: 36, bottom: 28 },
                        tooltip: { trigger: 'axis' },
                        legend: { top: 0, textStyle: { fontFamily: 'inherit' } },
                        xAxis: { type: 'category', data: months },
                        yAxis: [
                          { type: 'value', min: 0, max: 1, axisLabel: { formatter: axisPct } },
                          { type: 'value', splitLine: { show: false }, axisLabel: { formatter: axisMillions } },
                        ],
                        series: [
                          {
                            name: 'Lấp đầy theo kho',
                            type: 'line',
                            smooth: true,
                            data: trend.map((t: any) => rate(t.unitRate)),
                            color: '#0e1b2c',
                            tooltip: { valueFormatter: tipPct },
                          },
                          {
                            name: 'Lấp đầy theo m²',
                            type: 'line',
                            smooth: true,
                            data: trend.map((t: any) => rate(t.areaRate)),
                            color: '#2c5d8f',
                            tooltip: { valueFormatter: tipPct },
                          },
                          {
                            name: 'Lấp đầy kinh tế',
                            type: 'line',
                            smooth: true,
                            data: trend.map((t: any) => rate(t.economicRate)),
                            color: '#c8963e',
                            tooltip: { valueFormatter: tipPct },
                          },
                          {
                            name: 'Đã thu',
                            type: 'bar',
                            yAxisIndex: 1,
                            data: trend.map((t: any) => t.collected),
                            color: '#dde2e8',
                            barMaxWidth: 22,
                            tooltip: { valueFormatter: tipMoney },
                          },
                        ],
                      }}
                    />
                  </div>
                </Card>

                <Card>
                  <CardHead
                    title={<Titled label="Công nợ theo tuổi nợ" help={`${metricDoc('ar.total')}\n\n${metricDoc('ar.ratio')}`} />}
                    sub={`Tổng dư nợ phải thu: ${vnd(ag.total)} · quá hạn ${vnd(ag.overdue)} (${pct(ag.overdueRatio, 1)})`}
                    action={
                      <Tip text="Mở danh sách hóa đơn của cơ sở để xem từng khoản nợ.">
                        <Link to="/manage/billing" className="text-xs font-bold text-info-600 hover:underline">
                          Hóa đơn
                        </Link>
                      </Tip>
                    }
                  />
                  <ul className="space-y-3.5 p-5 text-sm">
                    {AGING_ROWS.map(([key, l, doc]) => {
                      const v = ag[key] ?? 0;
                      const ratio = ag.total ? (v / ag.total) * 100 : 0;
                      return (
                        <li key={key}>
                          <div className="mb-1.5 flex items-center justify-between">
                            <span className="inline-flex items-center font-medium text-steel-600">
                              {l}
                              <HelpTip text={metricDoc(doc)} label={`Giải thích: ${l}`} />
                            </span>
                            <b className="text-ink-950 num">{vnd(v)}</b>
                          </div>
                          <Progress value={ratio} tone={key === 'current' ? 'brass' : 'bad'} />
                        </li>
                      );
                    })}
                  </ul>
                </Card>
              </div>

              {/* Today's Appointments & Staff Roster */}
              <div className="grid gap-6 lg:grid-cols-3">
                <Card className="lg:col-span-2">
                  <CardHead
                    title={<Titled label="Lịch hẹn tại cơ sở hôm nay" help="Các lịch nhận kho, trả kho và kiểm tra còn hiệu lực trong ngày hôm nay (giờ Việt Nam): đã đặt hoặc khách đã đến. Lịch đã xong, đã hủy hoặc lỡ hẹn không hiện ở đây." />}
                    sub={`${d.todayAppointments?.length ?? 0} lịch · nhận kho, trả kho và kiểm tra`}
                    action={
                      <Tip text="Mở danh sách đặt thuê để xem và xử lý từng đơn.">
                        <Link className="inline-flex items-center gap-1 text-xs font-bold text-info-600 hover:underline" to="/manage/reservations">
                          Đặt thuê <ArrowRight className="size-3.5" />
                        </Link>
                      </Tip>
                    }
                  />
                  {d.todayAppointments?.length ? (
                    <ul className="divide-y divide-steel-100">
                      {d.todayAppointments.map((a: any) => (
                        <li key={a.id} className="flex items-center gap-3.5 px-5 py-3.5 text-sm transition hover:bg-paper/60">
                          <span className="rounded-lg border hairline bg-paper px-2.5 py-1 text-xs font-extrabold text-ink-950 num">
                            {hm(a.scheduled_start)}
                          </span>
                          <span className="min-w-0 flex-1 truncate">
                            <span className="font-bold text-ink-950">{APPT_LABEL[a.type] ?? a.type}</span>
                            <span className="text-steel-500"> · {a.customer?.full_name}</span>
                          </span>
                          <StatusBadge kind="appointment" value={a.status} />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyState
                      title="Hôm nay không có lịch hẹn"
                      hint="Lịch nhận kho, trả kho và kiểm tra sẽ hiện ở đây khi khách đặt."
                    />
                  )}
                </Card>

                <Card className="flex flex-col justify-between">
                  <div>
                    <CardHead
                      title={<Titled label="Nhân sự đang trực ca" help="Nhân viên có ca làm đã công bố đang diễn ra ngay lúc này. Giờ bên cạnh tên là giờ kết thúc ca." />}
                      sub={`${d.onShift?.length ?? 0} nhân viên trong ca`}
                      action={
                        <Tip text="Mở lịch ca để xếp ca và duyệt đổi ca.">
                          <Link className="inline-flex items-center gap-1 text-xs font-bold text-info-600 hover:underline" to="/manage/schedule">
                            Lịch ca <ArrowRight className="size-3.5" />
                          </Link>
                        </Tip>
                      }
                    />
                    {d.onShift?.length ? (
                      <ul className="divide-y divide-steel-100">
                        {d.onShift.map((s: any) => (
                          <li key={s.user.public_id ?? s.user.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                            <Avatar name={s.user.full_name} size={30} />
                            <span className="min-w-0 flex-1 truncate font-semibold text-ink-950">
                              {s.user.full_name}
                            </span>
                            <Badge tone="info" dot>
                              đến {hm(s.until)}
                            </Badge>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <EmptyState title="Chưa có ai trong ca" hint="Xếp ca ở mục Lịch ca để có người trực." />
                    )}
                  </div>

                  <div className="grid grid-cols-3 divide-x divide-steel-200 border-t hairline bg-paper/65 text-center text-xs">
                    <div className="px-2 py-3.5">
                      <ArrowDownToLine className="mx-auto mb-1 size-4 text-info-600" />
                      <b className="block text-base font-extrabold text-ink-950 num">{d.moveActivity?.moveIns ?? 0}</b>
                      <span className="inline-flex items-center text-steel-500">
                        Nhận kho {mv}
                        <HelpTip text={`${metricDoc('move.in')}\n${d.moveActivity?.custom ? 'Đang xem theo kỳ đã chọn.' : 'Đang xem 7 ngày gần nhất, tính cả hôm nay.'}`} label="Giải thích: Nhận kho" />
                      </span>
                    </div>
                    <div className="px-2 py-3.5">
                      <ArrowUpFromLine className="mx-auto mb-1 size-4 text-warn-600" />
                      <b className="block text-base font-extrabold text-ink-950 num">{d.moveActivity?.moveOuts ?? 0}</b>
                      <span className="inline-flex items-center text-steel-500">
                        Trả kho {mv}
                        <HelpTip text={`${metricDoc('move.out')}\n${d.moveActivity?.custom ? 'Đang xem theo kỳ đã chọn.' : 'Đang xem 7 ngày gần nhất, tính cả hôm nay.'}`} label="Giải thích: Trả kho" />
                      </span>
                    </div>
                    <div className="px-2 py-3.5">
                      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-steel-400">
                        Tăng trưởng
                      </span>
                      <b
                        className={cn(
                          'block text-base font-extrabold num',
                          (d.moveActivity?.net ?? 0) < 0 ? 'text-bad-600' : 'text-ink-950',
                        )}
                      >
                        {(d.moveActivity?.net ?? 0) > 0 ? '+' : ''}
                        {d.moveActivity?.net ?? 0}
                      </b>
                      <span className="inline-flex items-center text-steel-500">
                        Ròng {mv}
                        <HelpTip text={metricDoc('move.net')} label="Giải thích: Ròng" />
                      </span>
                    </div>
                  </div>
                </Card>
              </div>

              {/* Unit Status Composition & Delinquency Funnel */}
              <div className="grid gap-6 lg:grid-cols-3">
                <Card className="lg:col-span-2">
                  <CardHead
                    title={<Titled label="Cơ cấu trạng thái kho" help={`${metricDoc('occ.byStatus')}\nKho Ngưng dùng và Đã loại nằm trong tổng nhưng không tính vào số kho khai thác được (${o.rentable} kho) dùng để tính lấp đầy.`} />}
                    sub={`Tổng cộng ${statusTotal} ô kho · ${o.rentable} kho khai thác được`}
                    action={
                      <Tip text="Mở danh sách kho để xem và đổi trạng thái từng kho.">
                        <Link className="inline-flex items-center gap-1 text-xs font-bold text-info-600 hover:underline" to="/manage/units">
                          Danh sách kho <ArrowRight className="size-3.5" />
                        </Link>
                      </Tip>
                    }
                  />
                  <div className="p-5">
                    <div
                      className="flex h-4 overflow-hidden rounded-full bg-steel-100 p-0.5 shadow-inner"
                      role="img"
                      aria-label="Cơ cấu trạng thái kho"
                    >
                      {statuses.map((k) => (
                        <span
                          key={k}
                          className="first:rounded-l-full last:rounded-r-full"
                          style={{
                            width: `${(o.byStatus[k] / statusTotal) * 100}%`,
                            background: UNIT_COLOR[k],
                          }}
                          title={`${STATUS.unit[k]?.[0] ?? k}: ${o.byStatus[k]}`}
                        />
                      ))}
                    </div>
                    <ul className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                      {statuses.map((k) => {
                        const count = o.byStatus[k];
                        const share = statusTotal ? Math.round((count / statusTotal) * 100) : 0;
                        return (
                          <li
                            key={k}
                            className="flex items-center justify-between gap-2 rounded-xl border hairline bg-paper/55 px-3 py-2"
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              <span className="size-3 shrink-0 rounded-sm" style={{ background: UNIT_COLOR[k] }} />
                              <span className="inline-flex min-w-0 items-center truncate text-xs font-semibold text-steel-600">
                                {STATUS.unit[k]?.[0] ?? k}
                                <HelpTip text={metricDoc(`unit.${k}`)} label={`Giải thích: ${STATUS.unit[k]?.[0] ?? k}`} />
                              </span>
                            </span>
                            <span className="whitespace-nowrap text-xs num">
                              <b className="font-extrabold text-ink-950">{count}</b>{' '}
                              <span className="text-steel-400">({share}%)</span>
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </Card>

                <Card className="flex flex-col justify-between">
                  <div>
                    <CardHead
                      title={<Titled label="Phễu xử lý quá hạn" help={'Số hợp đồng còn hiệu lực ở từng giai đoạn của quy trình xử lý nợ, từ nhẹ đến nặng. Thanh dài ngắn là tỷ trọng so với tổng số hợp đồng quá hạn.\nDi chuột vào chữ i cạnh từng giai đoạn để biết nhân viên cần làm gì.'} />}
                      sub="Phân tầng mức độ vi phạm thanh toán"
                      action={
                        <Tip text="Mở danh sách hợp đồng quá hạn để liên hệ, hẹn trả và xử lý.">
                          <Link className="inline-flex items-center gap-1 text-xs font-bold text-info-600 hover:underline" to="/manage/delinquency?ct=live">
                            Chi tiết <ArrowRight className="size-3.5" />
                          </Link>
                        </Tip>
                      }
                    />
                    <ul className="space-y-3 p-5 text-sm">
                      {funnel.map(([k, n]) => (
                        <li key={k} className="flex items-center gap-3">
                          <span className="inline-flex w-36 shrink-0 items-center text-xs font-semibold text-steel-600">
                            {STATUS.delinquency[k]?.[0] ?? k}
                            <HelpTip text={metricDoc(`dq.${k}`)} label={`Giải thích: ${STATUS.delinquency[k]?.[0] ?? k}`} />
                          </span>
                          <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-steel-100">
                            <span
                              className="block h-full rounded-full bg-bad-600 transition-all"
                              style={{ width: `${delinquent ? (n / delinquent) * 100 : 0}%` }}
                            />
                          </span>
                          <b className="w-7 text-right text-xs font-extrabold text-ink-950 num">{n}</b>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {tickets && openTickets > 0 && (
                    <div className="border-t hairline bg-paper/55 px-5 py-3.5 text-sm">
                      <div className="mb-2 flex items-center justify-between">
                        <p className="flex items-center text-xs font-bold uppercase tracking-wider text-steel-500">
                          Phiếu hỗ trợ đang mở ({openTickets})
                          <HelpTip text="Số phiếu hỗ trợ chưa giải quyết xong của cơ sở, chia theo mức ưu tiên." />
                        </p>
                        <Link to="/manage/tickets" className="text-xs font-semibold text-info-600 hover:underline">
                          Xem phiếu
                        </Link>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {['URGENT', 'HIGH', 'MEDIUM', 'LOW']
                          .filter((p) => tickets.byPriority[p])
                          .map((p) => (
                            <Badge key={p} tone={p === 'URGENT' ? 'bad' : p === 'HIGH' ? 'warn' : 'neutral'}>
                              {STATUS.priority[p]?.[0]} · {tickets.byPriority[p]}
                            </Badge>
                          ))}
                      </div>
                    </div>
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
