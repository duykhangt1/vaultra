import { facilityCover, sm } from '@/lib/media';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus,
  Building2,
  GitCompare,
  Landmark,
  CheckSquare,
  AlertTriangle,
  MapPin,
  Boxes,
  TrendingUp,
  Wallet,
  ArrowRight,
  Image as ImageIcon,
  Receipt,
  PackageOpen,
} from 'lucide-react';
import { metricDoc } from '@vaultra/shared';
import { useGet } from '@/lib/hooks';
import { post } from '@/lib/api';
import { Async, Card, CardHead, Alert, Button, DataTable, Badge, StatusBadge, Progress, EmptyState, HelpTip, Tip, cn } from '@/ui';
import { vnd, pct, fmtDate } from '@/lib/format';
import Chart from '@/widgets/Chart';
import { tipMoney, tipPct, axisMillions, axisPct } from '@/widgets/chart-format';
import { PeriodPicker, periodOf, periodLabel } from '@/widgets/PeriodPicker';
import { Titled } from '@/widgets/Titled';
import type { Period } from '@/widgets/PeriodPicker';
import { ActBtn, Money } from '../kit';
import { FacilityEditor } from './FacilityEditor';

const PIE_COLORS = ['#0e1b2c', '#c8963e', '#2c5d8f', '#ddb065', '#5b6b7d', '#8794a4'];

function ExecMetric({
  label,
  value,
  sub,
  icon,
  tone,
  help,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon: React.ReactNode;
  tone?: 'ok' | 'bad' | 'brass';
  help?: string;
}) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border bg-white p-4 shadow-[var(--shadow-card)]',
        tone === 'bad' ? 'border-bad-600/35' : 'hairline',
      )}
    >
      <div
        className={cn(
          'pointer-events-none absolute inset-x-0 top-0 h-1',
          tone === 'bad' ? 'bg-bad-600' : 'bg-gradient-to-r from-ink-900 via-brass-500 to-ink-900',
        )}
      />
      <div className="flex items-start justify-between gap-2">
        <p className="flex items-center text-xs font-bold uppercase tracking-wider text-steel-500">
          {label}
          {help && <HelpTip text={help} label={`Giải thích: ${label}`} />}
        </p>
        <span
          className={cn(
            'grid size-8 shrink-0 place-items-center rounded-lg',
            tone === 'bad' ? 'bg-bad-100 text-bad-600' : 'bg-paper text-ink-900',
          )}
        >
          {icon}
        </span>
      </div>
      <p
        className={cn(
          'mt-2 text-2xl font-extrabold leading-none tracking-tight num sm:text-[26px]',
          tone === 'bad' ? 'text-bad-600' : 'text-ink-950',
        )}
      >
        {value}
      </p>
      {sub && <p className="mt-1.5 text-xs font-medium text-steel-500">{sub}</p>}
    </div>
  );
}

/** Everything the head office has to decide, with the page where each kind is actually handled. */
const APPROVAL_KINDS: { key: string; label: string; to: string; help: string }[] = [
  { key: 'refunds', label: 'Hoàn tiền', to: '/ops/approvals', help: 'Khoản hoàn tiền vượt hạn mức của Quản lý cơ sở nên chờ BOM duyệt. Bấm để duyệt ở mục Phê duyệt.' },
  { key: 'waivers', label: 'Miễn phí', to: '/ops/approvals?tab=waivers', help: 'Đề xuất miễn phí vượt hạn mức của Quản lý cơ sở, chờ BOM quyết định. Bấm để xem ở mục Phê duyệt.' },
  { key: 'priceRequests', label: 'Đổi giá', to: '/ops/approvals?tab=price', help: 'Đề xuất đổi giá của cơ sở đang chờ BOM duyệt. Bấm để xem ở mục Phê duyệt.' },
  { key: 'terminations', label: 'Thu hồi kho', to: '/ops/delinquency?tab=term', help: 'Yêu cầu thu hồi kho do khách nợ: Quản lý cơ sở đã xác nhận (bước 1), đang chờ BOM duyệt hoặc từ chối (bước 2). Bấm để xử lý ở mục Công nợ.' },
  { key: 'abandonedGoods', label: 'Tài sản tồn đọng', to: '/ops/delinquency?tab=abandoned', help: 'Hồ sơ hàng khách bỏ lại đã được kiểm kê, chờ BOM quyết định trả lại, tiêu hủy hay thanh lý (bước 4). Bấm để xử lý ở mục Công nợ.' },
];

export function PortfolioPage() {
  const [period, setPeriod] = useState<Period>(() => periodOf('thisMonth'));
  const q = useGet<any>('/dashboard/portfolio', { from: period.from, to: period.to }, { keepPrevious: true });
  const liveKpi = q.data?.kpi;

  return (
    <div className="space-y-6">
      {/* Multi-Facility Executive Portfolio Command Header */}
      <div className="grain blueprint-dark relative overflow-hidden rounded-2xl border border-ink-800 bg-ink-950 p-5 text-white shadow-[var(--shadow-card)] sm:p-7">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brass-600 via-brass-400 to-brass-600" />
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
          <div className="space-y-2">
            <h1 className="display inline-flex items-center text-2xl text-white sm:text-3xl">
              Tổng quan vận hành hệ thống
              <HelpTip onDark text={'Trang này gộp số liệu của mọi cơ sở. Lấp đầy và công nợ là tình hình ngay lúc xem; doanh thu và tiền thu theo kỳ bạn chọn ở khung "Kỳ xem số liệu".\nMọi con số lấy từ cùng nguồn với trang Báo cáo nên hai nơi luôn khớp nhau.'} />
            </h1>
            <p className="max-w-2xl text-sm text-steel-300">
              Theo dõi tỷ lệ lấp đầy, dòng tiền thực thu, công nợ quá hạn và hiệu suất từng cơ sở lưu trữ trên toàn quốc.
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              <Tip text="Mở danh sách cơ sở để thêm cơ sở mới, cập nhật vị trí, ảnh và trạng thái mở cửa.">
                <Link to="/ops/facilities">
                  <Button size="xs" variant="glass" icon={<Building2 className="size-3.5 text-brass-400" />}>
                    Danh mục cơ sở
                  </Button>
                </Link>
              </Tip>
              <Tip text="Đặt lấp đầy, doanh thu, giá và công nợ của các cơ sở cạnh nhau trong một bảng.">
                <Link to="/ops/compare">
                  <Button size="xs" variant="glass" icon={<GitCompare className="size-3.5 text-brass-400" />}>
                    So sánh hiệu suất
                  </Button>
                </Link>
              </Tip>
              <Tip text="Đối chiếu giao dịch của cổng thanh toán với sổ sách của hệ thống.">
                <Link to="/ops/finance">
                  <Button size="xs" variant="glass" icon={<Landmark className="size-3.5 text-brass-400" />}>
                    Đối soát cổng thanh toán
                  </Button>
                </Link>
              </Tip>
              <Tip text="Thống kê từng khoản hoàn tiền: lý do, trạng thái, người duyệt và số tiền. Bấm vào một dòng trong báo cáo để xem chi tiết khoản đó.">
                <Link to="/ops/reports?report=refunds">
                  <Button size="xs" variant="glass" icon={<Receipt className="size-3.5 text-brass-400" />}>
                    Thống kê hoàn tiền
                  </Button>
                </Link>
              </Tip>
              <Tip text="Thống kê từng hồ sơ hàng khách bỏ lại sau khi thu hồi kho: danh mục, cách xử lý và tiền thu được.">
                <Link to="/ops/reports?report=abandoned-goods">
                  <Button size="xs" variant="glass" icon={<PackageOpen className="size-3.5 text-brass-400" />}>
                    Thống kê tài sản tồn đọng
                  </Button>
                </Link>
              </Tip>
            </div>
          </div>

          {liveKpi && (
            <div className="grid shrink-0 grid-cols-2 gap-3 self-start rounded-2xl border border-white/15 bg-white/[0.06] p-3.5 backdrop-blur lg:min-w-[19rem] lg:self-center">
              <div className="border-r border-white/10 pr-3.5">
                <p className="flex items-center font-mono text-[10.5px] uppercase tracking-wider text-brass-400">
                  Quy mô mạng lưới
                  <HelpTip onDark text={`Số cơ sở đang khai thác (hoạt động hoặc tạm đóng) và số kho đang có khách trên tổng số kho cho thuê được của các cơ sở đó.\nCơ sở nháp hoặc đã ngưng hoạt động không có kho để cho thuê nên không tính.${liveKpi.facilitiesTotal > liveKpi.facilities ? `\nHệ thống có ${liveKpi.facilitiesTotal} cơ sở, trong đó ${liveKpi.facilitiesTotal - liveKpi.facilities} cơ sở chưa khai thác.` : ''}`} />
                </p>
                <p className="mt-1 text-xl font-extrabold text-white num">{liveKpi.facilities} cơ sở</p>
                <p className="text-xs text-steel-300 num">
                  {liveKpi.occupied}/{liveKpi.rentable} kho đang thuê
                </p>
              </div>
              <div className="pl-1">
                <p className="flex items-center font-mono text-[10.5px] uppercase tracking-wider text-brass-400">
                  Lấp đầy chung
                  <HelpTip onDark text={`${metricDoc('occ.unit')}\n\n${metricDoc('occ.avgRent')}`} />
                </p>
                <p className="mt-1 text-xl font-extrabold text-white num">{pct(liveKpi.unitRate, 1)}</p>
                <p className="text-xs text-steel-300 num">Giá TB {vnd(liveKpi.avgRent)}</p>
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
              <HelpTip text={metricDoc('rev.period')} />
            </p>
            <PeriodPicker value={period} onChange={setPeriod} />
          </div>
          {q.data && (
            <p className="max-w-md text-xs leading-relaxed text-steel-600">
              <b className="text-ink-950">Lấp đầy, công nợ:</b> tại thời điểm xem ({fmtDate(q.data.asOf)}).
              <br />
              <b className="text-ink-950">Doanh thu, thực thu, hoàn tiền:</b> kỳ {periodLabel(period)}.
            </p>
          )}
        </div>
      </Card>

      <Async q={q}>
        {(d) => {
          const k = d.kpi;
          const ap = d.approvals ?? {};
          const waiting = APPROVAL_KINDS.filter((a) => Number(ap[a.key] ?? 0) > 0);
          const pending = waiting.reduce((s, a) => s + Number(ap[a.key]), 0);
          const th = d.thresholds ?? {};
          const months = (d.trend ?? []).map((t: any) => `${t.month.slice(5)}/${t.month.slice(0, 4)}`);
          // the total row of the table below is the headline itself, so the two can never disagree
          const totalRow = { facility: { id: '__total', name: 'Tổng hệ thống', province: `${k.facilities} cơ sở đang khai thác` }, total: true, rentable: k.rentable, occupied: k.occupied, unitRate: k.unitRate, recognized: k.recognized, collected: k.collected, overdue: k.overdue, overdueRatio: k.overdueRatio, stock: true };

          return (
            <div className="space-y-6">
              {pending > 0 ? (
                <Alert
                  tone="warn"
                  title={
                    <span className="inline-flex items-center gap-2">
                      <CheckSquare className="size-4 text-warn-600" />
                      {pending} yêu cầu đang chờ BOM quyết định
                      <HelpTip text={'Những việc chỉ BOM được duyệt hoặc quyết định. Bấm vào từng loại để mở đúng nơi xử lý.\nCon số chỉ đếm các việc còn đang chờ; việc đã quyết định xong không còn nằm ở đây.'} />
                    </span>
                  }
                  action={
                    <Tip text="Mở mục Phê duyệt: hoàn tiền, miễn phí và đổi giá. Thu hồi kho và tài sản tồn đọng được xử lý ở mục Công nợ.">
                      <Link to="/ops/approvals">
                        <Button size="sm" variant="dark">
                          Mở mục Phê duyệt
                        </Button>
                      </Link>
                    </Tip>
                  }
                >
                  <div className="mt-1 flex flex-wrap gap-2 text-xs">
                    {waiting.map((a) => (
                      <Tip key={a.key} text={a.help}>
                        <Link
                          to={a.to}
                          className="rounded-full border border-warn-600/25 bg-white/80 px-2.5 py-0.5 font-semibold text-ink-900 num transition hover:border-ink-900/40 hover:bg-white"
                        >
                          {a.label}: <b>{ap[a.key]}</b>
                        </Link>
                      </Tip>
                    ))}
                  </div>
                </Alert>
              ) : (
                <p className="flex items-center gap-2 rounded-xl border hairline bg-white px-4 py-3 text-sm text-steel-600">
                  <CheckSquare className="size-4 text-steel-400" />
                  Không có yêu cầu nào đang chờ BOM quyết định.
                  <HelpTip text="Hoàn tiền, miễn phí, đổi giá, thu hồi kho và tài sản tồn đọng đều đã được xử lý. Khi có việc mới, khung cảnh báo sẽ hiện ở đây." />
                </p>
              )}

              {d.alerts?.length > 0 && (
                <Card>
                  <CardHead
                    title={
                      <span className="inline-flex items-center gap-2">
                        <AlertTriangle className="size-4 text-warn-600" />
                        Cảnh báo vận hành danh mục ({d.alerts.length})
                        <HelpTip text={`Cơ sở đang hoạt động vượt ngưỡng đặt trong Chính sách (mục Duyệt, thuế & cảnh báo).\n• Lấp đầy thấp: lấp đầy theo kho dưới ${th.occupancy ?? '—'}%.\n• Công nợ cao: nợ quá hạn trên ${th.delinquency ?? '—'}% tổng dư nợ phải thu.\nHai loại có màu khác nhau để phân biệt.`} />
                      </span>
                    }
                  />
                  <ul className="divide-y hairline">
                    {d.alerts.map((a: any, i: number) => (
                      <li key={i} className="flex flex-wrap items-center gap-3 px-5 py-3.5 text-sm">
                        <Tip text={a.kind === 'OCCUPANCY' ? `Lấp đầy theo kho của cơ sở này là ${pct(a.value, 1)}, thấp hơn ngưỡng ${a.threshold}% đặt trong Chính sách. Cần đẩy mạnh bán hàng hoặc xem lại giá.` : `Nợ quá hạn của cơ sở này là ${pct(a.value, 1)} tổng dư nợ phải thu, cao hơn ngưỡng ${a.threshold}% đặt trong Chính sách. Cần đẩy nhanh thu hồi công nợ.`}>
                          <span>
                            <Badge tone={a.kind === 'OCCUPANCY' ? 'info' : 'bad'}>{a.kind === 'OCCUPANCY' ? 'Lấp đầy thấp' : 'Công nợ cao'}</Badge>
                          </span>
                        </Tip>
                        <b className="text-ink-950">{a.facility}</b>
                        <span className="text-steel-600">{a.message}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}

              {/* 4-Column Executive KPI Grid */}
              <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
                <ExecMetric
                  label="Lấp đầy hệ thống"
                  help={`${metricDoc('occ.unit')}\n\nChỉ tính cơ sở đang khai thác. Kho ngưng dùng hoặc đã loại không tính vào số kho cho thuê được.`}
                  value={pct(k.unitRate, 1)}
                  sub={`${k.occupied}/${k.rentable} kho · ${k.facilities} cơ sở`}
                  icon={<Boxes className="size-4" />}
                />
                <ExecMetric
                  label="Lấp đầy kinh tế"
                  help={`${metricDoc('occ.economic')}\n\n${metricDoc('occ.area')}`}
                  value={pct(k.economicRate, 1)}
                  sub={`Theo m² ${pct(k.areaRate, 1)} · Đơn giá TB ${vnd(k.avgRent)}`}
                  icon={<TrendingUp className="size-4" />}
                />
                <ExecMetric
                  label="Doanh thu ghi nhận"
                  help={`${metricDoc('rev.recognized')}\n\n${metricDoc('rev.collected')}`}
                  value={vnd(k.recognized)}
                  sub={`Thực thu ${vnd(k.collected)} · Hoàn ${vnd(k.refunded)}`}
                  icon={<Wallet className="size-4" />}
                />
                <ExecMetric
                  label="Nợ quá hạn"
                  help={`${metricDoc('ar.overdue')}\n\n${metricDoc('ar.ratio')}`}
                  value={vnd(k.overdue)}
                  tone={k.overdue > 0 ? 'bad' : 'ok'}
                  sub={`${pct(k.overdueRatio, 1)} trên tổng dư nợ ${vnd(k.receivable)}`}
                  icon={<AlertTriangle className="size-4" />}
                />
              </div>

              {/* Charts Row */}
              <div className="grid gap-6 lg:grid-cols-3">
                <Card className="lg:col-span-2">
                  <CardHead
                    title={<Titled label="Xu hướng 12 tháng toàn hệ thống" help={'Mỗi cột là một tháng dương lịch (giờ Việt Nam). Tháng cuối là tháng hiện tại tính đến hôm nay.\n• Doanh thu ghi nhận: phần tiền thuê của những ngày đã qua.\n• Thực thu: tiền khách đã trả thành công (gồm cả tiền cọc).\n• Lấp đầy: số liệu cuối tháng (tháng hiện tại là số liệu ngay lúc xem). Tháng chưa có ảnh chụp thì để trống.\nDi chuột vào cột hay đường để xem số chính xác; hộp số liệu giữ nguyên cho đến khi bạn rời chuột.'} />}
                    sub="Doanh thu ghi nhận, thực thu và tỷ lệ lấp đầy kho theo tháng"
                  />
                  <div className="p-3">
                    <Chart
                      style={{ height: 280 }}
                      ariaLabel="Xu hướng doanh thu và lấp đầy"
                      option={{
                        grid: { left: 64, right: 52, top: 40, bottom: 28 },
                        tooltip: { trigger: 'axis' },
                        legend: { top: 0 },
                        xAxis: { type: 'category', data: months },
                        yAxis: [
                          { type: 'value', axisLabel: { formatter: axisMillions } },
                          { type: 'value', min: 0, max: 1, splitLine: { show: false }, axisLabel: { formatter: axisPct } },
                        ],
                        series: [
                          {
                            name: 'Doanh thu ghi nhận',
                            type: 'bar',
                            data: d.trend.map((t: any) => t.recognized),
                            itemStyle: { color: '#0e1b2c', borderRadius: [4, 4, 0, 0] },
                            barMaxWidth: 18,
                            tooltip: { valueFormatter: tipMoney },
                          },
                          {
                            name: 'Thực thu',
                            type: 'bar',
                            data: d.trend.map((t: any) => t.collected),
                            itemStyle: { color: '#2c5d8f', borderRadius: [4, 4, 0, 0] },
                            barMaxWidth: 18,
                            tooltip: { valueFormatter: tipMoney },
                          },
                          {
                            name: 'Lấp đầy theo kho',
                            type: 'line',
                            smooth: true,
                            yAxisIndex: 1,
                            data: d.trend.map((t: any) => t.unitRate),
                            itemStyle: { color: '#c8963e' },
                            tooltip: { valueFormatter: tipPct },
                          },
                        ],
                      }}
                    />
                  </div>
                </Card>

                <Card>
                  <CardHead
                    title={<Titled label="Cơ cấu doanh thu theo cỡ kho" help={`${metricDoc('rev.bySize')}\nKỳ xem: ${periodLabel(period)}.`} />}
                    sub={`Tổng tiền thuê ghi nhận trong kỳ: ${vnd(k.rentRecognized)}`}
                  />
                  <div className="p-3">
                    {d.revenueBySize.length === 0 ? (
                      <EmptyState title="Chưa có tiền thuê ghi nhận trong kỳ" hint="Chọn kỳ dài hơn để xem cơ cấu theo cỡ kho." />
                    ) : (
                      <Chart
                        style={{ height: 280 }}
                        ariaLabel="Doanh thu theo kích thước"
                        option={{
                          color: PIE_COLORS,
                          tooltip: { trigger: 'item', formatter: (p: any) => `${p.marker} Cỡ kho ${p.name}<br/><b>${vnd(p.value)}</b> · ${p.percent}%` },
                          legend: { bottom: 0, itemWidth: 12, itemHeight: 12, formatter: (n: string) => `Cỡ ${n}` },
                          series: [
                            {
                              type: 'pie',
                              radius: ['44%', '70%'],
                              center: ['50%', '44%'],
                              itemStyle: { borderColor: '#fff', borderWidth: 2 },
                              data: d.revenueBySize.map((r: any) => ({ name: r.size, value: r.amount })),
                              label: { show: false },
                              labelLine: { show: false },
                            },
                          ],
                        }}
                      />
                    )}
                  </div>
                </Card>
              </div>

              {/* Sleek Facility Performance Cards */}
              {d.comparison?.length > 0 && (
                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="flex items-center text-xs font-bold uppercase tracking-wider text-steel-500">
                      Thẻ hiệu suất từng cơ sở
                      <HelpTip text={`Mỗi thẻ là một cơ sở. Lấp đầy là tình hình ngay lúc xem, doanh thu là của kỳ ${periodLabel(period)}, tỷ lệ nợ quá hạn là nợ quá hạn ÷ tổng dư nợ của cơ sở đó.\nCơ sở chưa khai thác (đã ngưng hoạt động) không có kho cho thuê nên không tính vào các chỉ số toàn hệ thống.`} />
                    </h2>
                    <Tip text="Mở bảng đối chiếu đầy đủ các chỉ số của từng cơ sở: lấp đầy, doanh thu, giá, nợ, gia hạn, hủy và SLA.">
                      <Link
                        to="/ops/compare"
                        className="inline-flex items-center gap-1 text-xs font-bold text-brass-700 hover:underline"
                      >
                        Mở bảng đối chiếu chi tiết <ArrowRight className="size-3.5" />
                      </Link>
                    </Tip>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {d.comparison.map((r: any) => (
                      <Card key={r.facility.id} className="overflow-hidden p-5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-base font-extrabold text-ink-950">{r.facility.name}</p>
                            <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-steel-500">
                              <MapPin className="size-3 text-brass-600" />
                              {r.facility.province}
                            </p>
                          </div>
                          <StatusBadge kind="facility" value={r.facility.status} />
                        </div>

                        <div className="mt-4 space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="inline-flex items-center font-semibold text-steel-500">
                              Tỷ lệ lấp đầy
                              <HelpTip text={r.stock !== false ? `${r.occupied} kho đang thuê trên ${r.rentable} kho cho thuê được của cơ sở này.` : 'Cơ sở này chưa khai thác nên không có kho cho thuê và không tính vào lấp đầy hệ thống.'} />
                            </span>
                            <b className="font-extrabold text-ink-950 num">{r.stock !== false ? pct(r.unitRate, 1) : '—'}</b>
                          </div>
                          <Progress value={r.stock !== false ? (r.unitRate ?? 0) * 100 : 0} tone="brass" />
                          <p className="text-[11px] text-steel-500 num">{r.stock !== false ? `${r.occupied}/${r.rentable} kho đang thuê` : 'Chưa khai thác'}</p>
                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-3 border-t hairline pt-3 text-xs">
                          <div>
                            <span className="inline-flex items-center text-steel-500">
                              Doanh thu ghi nhận
                              <HelpTip text={`${metricDoc('rev.recognized')}\nKỳ: ${periodLabel(period)}.`} />
                            </span>
                            <b className="mt-0.5 block text-sm font-extrabold text-ink-950 num">
                              {vnd(r.recognized)}
                            </b>
                          </div>
                          <div className="text-right">
                            <span className="inline-flex items-center justify-end text-steel-500">
                              Tỷ lệ nợ quá hạn
                              <HelpTip text={`${metricDoc('ar.ratio')}\nCơ sở này: nợ quá hạn ${vnd(r.overdue)} trên tổng dư nợ ${vnd(r.receivable)}.`} />
                            </span>
                            <b
                              className={cn(
                                'mt-0.5 block text-sm font-extrabold num',
                                r.overdueRatio > 0.1 ? 'text-bad-600' : 'text-ink-950',
                              )}
                            >
                              {r.receivable === undefined || r.receivable > 0 ? pct(r.overdueRatio, 1) : '—'}
                            </b>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                </section>
              )}

              {/* Compact Comparison Table */}
              <Card className="overflow-hidden">
                <CardHead
                  title={<Titled label="Bảng tổng hợp các cơ sở" help={'Dòng cuối "Tổng hệ thống" cộng số kho và số tiền của các cơ sở đang khai thác rồi tính lại tỷ lệ, nên bằng đúng các ô số liệu phía trên.'} />}
                  sub="Tổng hợp nhanh lấp đầy, doanh thu và tỷ lệ nợ quá hạn"
                  action={
                    <Tip text="Mở bảng đối chiếu đầy đủ hơn với giá, gia hạn, hủy và SLA của từng cơ sở.">
                      <Link to="/ops/compare">
                        <Button size="sm" variant="outline" icon={<GitCompare className="size-4" />}>
                          So sánh chi tiết
                        </Button>
                      </Link>
                    </Tip>
                  }
                />
                <DataTable
                  rows={[...d.comparison, totalRow]}
                  rowKey={(r: any) => r.facility.id}
                  cols={[
                    {
                      key: 'f',
                      header: <Titled label="Cơ sở" help="Tên và tỉnh/thành của cơ sở." />,
                      cell: (r: any) => (
                        <div className="flex items-center gap-3">
                          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-paper text-ink-900">
                            <Building2 className="size-4 text-brass-700" />
                          </span>
                          <div>
                            <b className="text-ink-950">{r.facility.name}</b>
                            <span className="block text-xs text-steel-500">{r.facility.province}</span>
                          </div>
                        </div>
                      ),
                    },
                    {
                      key: 'o',
                      header: <Titled label="Lấp đầy" help={metricDoc('occ.unit')} />,
                      cell: (r: any) =>
                        r.stock !== false ? (
                          <div className="w-36 space-y-1">
                            <span className="block text-xs font-bold text-ink-950 num">
                              {pct(r.unitRate, 1)} <span className="font-medium text-steel-500">({r.occupied}/{r.rentable} kho)</span>
                            </span>
                            <Progress value={r.unitRate * 100} />
                          </div>
                        ) : (
                          <span className="text-xs text-steel-500">Chưa khai thác</span>
                        ),
                    },
                    {
                      key: 'r',
                      header: <Titled label="Doanh thu" help={`${metricDoc('rev.recognized')}\nKỳ: ${periodLabel(period)}.`} />,
                      hideBelow: 'sm',
                      cell: (r: any) => <Money v={r.recognized} strong />,
                    },
                    {
                      key: 'c',
                      header: <Titled label="Thực thu" help={`${metricDoc('rev.collected')}\nKỳ: ${periodLabel(period)}.`} />,
                      hideBelow: 'lg',
                      cell: (r: any) => <Money v={r.collected} />,
                    },
                    {
                      key: 'd',
                      header: <Titled label="Nợ quá hạn" help={`${metricDoc('ar.overdue')}\n\n${metricDoc('ar.ratio')}`} />,
                      hideBelow: 'md',
                      cell: (r: any) =>
                        r.total || r.receivable === undefined || r.receivable > 0 ? (
                          <span className="flex flex-wrap items-center gap-1.5">
                            <Badge tone={r.overdueRatio > 0.1 ? 'bad' : 'neutral'}>{pct(r.overdueRatio, 1)}</Badge>
                            <span className="text-xs text-steel-500 num">{vnd(r.overdue)}</span>
                          </span>
                        ) : (
                          <span className="text-xs text-steel-500">Không có dư nợ</span>
                        ),
                    },
                    {
                      key: 's',
                      header: <Titled label="Trạng thái" help="Hoạt động: đang nhận khách. Tạm đóng: dừng nhận đặt chỗ mới nhưng vẫn có hợp đồng. Ngưng: không còn khai thác." />,
                      cell: (r: any) => (r.total ? null : <StatusBadge kind="facility" value={r.facility.status} />),
                    },
                  ]}
                />
              </Card>
            </div>
          );
        }}
      </Async>
    </div>
  );
}

export function ComparePage() {
  const q = useGet<any>('/reports/facility-comparison');
  return (
    <div className="space-y-6">
      <div className="grain blueprint-dark relative overflow-hidden rounded-2xl border border-ink-800 bg-ink-950 p-5 text-white shadow-[var(--shadow-card)] sm:p-6">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brass-600 via-brass-400 to-brass-600" />
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-brass-400/35 bg-brass-500/15 text-brass-400">
              <GitCompare className="size-5" />
            </span>
            <div>
              <h1 className="display text-2xl text-white sm:text-3xl">So sánh hiệu suất cơ sở</h1>
              <p className="mt-1 text-sm text-steel-300">
                Đặt các chỉ số lấp đầy, doanh thu, giá bình quân và công nợ của từng cơ sở cạnh nhau.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/ops">
              <Button size="sm" variant="glass">
                Tổng quan hệ thống
              </Button>
            </Link>
            <Link to="/ops/facilities">
              <Button size="sm" variant="primary" icon={<Building2 className="size-4" />}>
                Quản lý cơ sở
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <Async q={q}>
        {(d) => (
          <Card className="overflow-hidden">
            <CardHead
              title="Ma trận chỉ số vận hành"
              sub={`Đang đối chiếu ${d.rows?.length ?? 0} cơ sở trong hệ thống Vaultra`}
            />
            <DataTable
              rows={d.rows}
              rowKey={(r: any) => r.facility}
              cols={d.columns.map((c: any, idx: number) => ({
                key: c.key,
                header: <Titled label={c.label} help={c.help ?? c.label} />,
                cell: (r: any) => {
                  const v = r[c.key];
                  if (v === null || v === undefined) return <span className="text-steel-400">—</span>;
                  if (idx === 0) {
                    return (
                      <span className="inline-flex items-center gap-2 font-bold text-ink-950">
                        <Building2 className="size-4 text-brass-600" />
                        {String(v)}
                      </span>
                    );
                  }
                  if (c.type === 'pct') {
                    return (
                      <div className="min-w-28 space-y-1">
                        <span className="block text-xs font-extrabold text-ink-950 num">{pct(v, 1)}</span>
                        <Progress value={Math.max(0, Math.min(100, Number(v) * 100))} tone="brass" />
                      </div>
                    );
                  }
                  if (c.type === 'money') {
                    return <span className="font-bold text-ink-950 num">{vnd(v)}</span>;
                  }
                  return <span className="font-medium num">{String(v)}</span>;
                },
              }))}
            />
          </Card>
        )}
      </Async>
    </div>
  );
}

export function FacilitiesPage() {
  const q = useGet<any[]>('/facilities');
  const inv = ['/facilities', '/dashboard'];
  const [editor, setEditor] = useState<{ id?: string } | null>(null);

  const list = q.data ?? [];
  const activeCount = list.filter((f) => f.status === 'ACTIVE').length;
  const totalUnits = list.reduce((sum, f) => sum + Number(f._count?.units ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="grain blueprint-dark relative overflow-hidden rounded-2xl border border-ink-800 bg-ink-950 p-5 text-white shadow-[var(--shadow-card)] sm:p-6">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brass-600 via-brass-400 to-brass-600" />
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-brass-400/35 bg-brass-500/15 text-brass-400">
              <Building2 className="size-5" />
            </span>
            <div>
              <h1 className="display text-2xl text-white sm:text-3xl">Danh mục cơ sở lưu trữ</h1>
              <p className="mt-1 text-sm text-steel-300">
                Khởi tạo cơ sở mới, cập nhật tọa độ bản đồ &amp; hình ảnh nhận diện, điều chỉnh trạng thái mở cửa hoặc tạm đóng.
              </p>
            </div>
          </div>
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditor({})}>
            Tạo cơ sở mới
          </Button>
        </div>
      </div>

      {list.length > 0 && (
        <div className="grid grid-cols-3 gap-3.5">
          <ExecMetric
            label="Tổng số cơ sở"
            value={list.length}
            sub="Trên toàn hệ thống"
            icon={<Building2 className="size-4" />}
          />
          <ExecMetric
            label="Đang mở cửa"
            value={activeCount}
            sub="Nhận đặt kho trực tuyến"
            icon={<TrendingUp className="size-4" />}
          />
          <ExecMetric
            label="Tổng quy mô ô kho"
            value={totalUnits}
            sub="Kho thương mại đã khai báo"
            icon={<Boxes className="size-4" />}
          />
        </div>
      )}

      <FacilityEditor open={!!editor} facilityId={editor?.id} onClose={() => setEditor(null)} />

      <Card className="overflow-hidden">
        <CardHead title="Danh sách các cơ sở" sub="Quản lý thông tin hiển thị trên trang chủ và trạng thái khai thác" />
        <DataTable
          rows={q.data}
          loading={q.isLoading}
          error={q.error}
          onRetry={q.refetch}
          rowKey={(f: any) => f.id}
          cols={[
            {
              key: 'n',
              header: 'Cơ sở lưu trữ',
              cell: (f: any) => (
                <span className="flex items-center gap-3.5">
                  <img
                    src={sm(facilityCover(f))}
                    onError={(e) => {
                      const fb = facilityCover({ slug: f.slug });
                      if (e.currentTarget.src !== fb) e.currentTarget.src = fb;
                    }}
                    alt=""
                    loading="lazy"
                    className="h-12 w-20 shrink-0 rounded-xl border hairline bg-ink-900 object-cover shadow-2xs"
                  />
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <b className="text-ink-950">{f.name}</b>
                      <span className="code rounded bg-paper px-1.5 py-0.5 text-xs font-semibold text-ink-900">
                        {f.code}
                      </span>
                    </span>
                    <span className="mt-0.5 flex items-center gap-1 text-xs text-steel-500">
                      <MapPin className="size-3 shrink-0 text-brass-600" />
                      {f.district}, {f.province}
                    </span>
                  </span>
                </span>
              ),
            },
            {
              key: 'u',
              header: 'Số kho',
              hideBelow: 'sm',
              cell: (f: any) => <span className="font-bold text-ink-950 num">{f._count?.units ?? 0}</span>,
            },
            {
              key: 'o',
              header: 'Lấp đầy',
              hideBelow: 'sm',
              cell: (f: any) => (
                <div className="w-28 space-y-1">
                  <span className="block text-xs font-bold text-ink-950 num">{pct(f.occupancy, 0)}</span>
                  <Progress value={(f.occupancy ?? 0) * 100} tone="brass" />
                </div>
              ),
            },
            {
              key: 's',
              header: 'Trạng thái',
              cell: (f: any) => <StatusBadge kind="facility" value={f.status} />,
            },
            {
              key: 'a',
              header: 'Thao tác',
              cell: (f: any) => (
                <span className="flex flex-wrap gap-1.5">
                  <Button
                    size="xs"
                    variant="outline"
                    icon={<ImageIcon className="size-3.5 text-brass-700" />}
                    onClick={() => setEditor({ id: f.public_id ?? f.id })}
                  >
                    Vị trí &amp; ảnh
                  </Button>
                  {f.status !== 'ACTIVE' && (
                    <ActBtn
                      label="Mở cửa"
                      size="xs"
                      variant="primary"
                      title="Mở cơ sở"
                      fields={[
                        {
                          name: 'reason',
                          label: 'Lý do',
                          type: 'textarea',
                          required: true,
                          def: 'Mở cửa đón khách',
                        },
                      ]}
                      run={(v) => post(`/facilities/${f.id}/status`, { status: 'ACTIVE', reason: v.reason })}
                      ok="Đã mở cửa"
                      invalidate={inv}
                    />
                  )}
                  {f.status === 'ACTIVE' && (
                    <ActBtn
                      label="Tạm đóng"
                      size="xs"
                      title="Tạm đóng cơ sở"
                      description="Dừng nhận đặt chỗ mới. Đơn đã xác nhận sẽ cần xử lý riêng."
                      fields={[{ name: 'reason', label: 'Lý do', type: 'textarea', required: true }]}
                      run={(v) =>
                        post(`/facilities/${f.id}/status`, { status: 'TEMPORARILY_CLOSED', reason: v.reason })
                      }
                      ok="Đã tạm đóng"
                      invalidate={inv}
                    />
                  )}
                  {f.status !== 'INACTIVE' && (
                    <ActBtn
                      label="Ngừng"
                      size="xs"
                      danger
                      title="Ngừng hoạt động"
                      description="Chỉ thực hiện được khi không còn hợp đồng hiệu lực."
                      fields={[{ name: 'reason', label: 'Lý do', type: 'textarea', required: true }]}
                      run={(v) => post(`/facilities/${f.id}/status`, { status: 'INACTIVE', reason: v.reason })}
                      ok="Đã ngừng hoạt động"
                      invalidate={inv}
                    />
                  )}
                </span>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}
