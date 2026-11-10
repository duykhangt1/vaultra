import { useEffect, useMemo, useState } from 'react';
import { Download, Search, ArrowUp, ArrowDown, ArrowUpDown, Camera } from 'lucide-react';
import { REPORT_SUMMARY } from '@vaultra/shared';
import { useGet, useAct } from '@/lib/hooks';
import { post } from '@/lib/api';
import { openAuthed } from '@/lib/download';
import { Async, Card, CardHead, PageHeader, Button, Select, Input, EmptyState, Tabs, Field, Badge, Drawer, HelpTip, Tip, cn } from '@/ui';
import { vnd, pct, fmtDate, STATUS, enumLabel } from '@/lib/format';
import { toast } from '@/ui/toast';
import { useAuth } from '@/lib/auth';
import { PeriodPicker, periodOf, periodLabel } from '@/widgets/PeriodPicker';
import type { Period } from '@/widgets/PeriodPicker';

export const REPORTS: [string, string][] = [['occupancy', 'Lấp đầy'], ['revenue', 'Doanh thu'], ['rent-roll', 'Hợp đồng đang thuê'], ['receivables-aging', 'Công nợ theo tuổi'], ['delinquency', 'Nợ quá hạn'], ['renewals', 'Gia hạn'], ['cancellations', 'Hủy đặt chỗ'], ['move-activity', 'Nhận/trả kho'], ['refunds', 'Hoàn tiền'], ['abandoned-goods', 'Tài sản tồn đọng'], ['staff-performance', 'Hiệu suất nhân viên'], ['support-sla', 'SLA hỗ trợ'], ['facility-comparison', 'So sánh cơ sở'], ['promotions', 'Khuyến mãi'], ['reconciliation', 'Đối soát']];
/** Reports only the head office (BOM) may open: a facility manager never sees these tabs. */
const BOM_ONLY = ['facility-comparison', 'promotions', 'reconciliation'];
/** Reports that are a picture of the moment you open them, so the date range does not change them. */
const SNAPSHOT = ['rent-roll', 'receivables-aging', 'delinquency'];
/** Reports that split their rows by day, month or year. */
const GROUPED = ['occupancy', 'revenue', 'move-activity'];
const GROUP_LABEL: Record<string, string> = { day: 'Ngày', month: 'Tháng', year: 'Năm' };

const EXPORT_HELP: Record<string, string> = {
  CSV: 'Tải bảng đang xem dưới dạng CSV. Mở thẳng bằng Excel được: chữ tiếng Việt có dấu, các cột ngăn bằng dấu chấm phẩy. Có đủ mọi cột, mọi dòng và cả dòng tổng.',
  XLSX: 'Tải bảng đang xem dưới dạng Excel (.xlsx), số tiền và tỷ lệ đã định dạng sẵn. Có thêm một sheet ghi lại khoảng ngày, cơ sở và cách nhóm của báo cáo.',
  PDF: 'Tải bản PDF gọn để in hoặc gửi đi. Chỉ có 7 cột đầu và tối đa 300 dòng, nên muốn đầy đủ hãy dùng CSV hoặc Excel.',
};

export function ReportsPage({ multiFacility }: { multiFacility?: boolean }) {
  const reports = REPORTS.filter(([v]) => multiFacility || !BOM_ONLY.includes(v));
  const [code, setCode] = useState(() => { const r = new URLSearchParams(window.location.search).get('report'); return reports.some(([v]) => v === r) ? (r as string) : 'occupancy'; });
  const facilityId = useAuth((s) => s.activeFacilityId);
  const facilities = useAuth((s) => s.facilities);
  const [period, setPeriod] = useState<Period>(() => periodOf('30d'));
  const [groupBy, setGroupBy] = useState('month');
  const [scope, setScope] = useState('');
  const snapshot = SNAPSHOT.includes(code);
  const grouped = GROUPED.includes(code);
  const params = { from: period.from, to: period.to, ...(grouped ? { groupBy } : {}), facilityId: multiFacility ? (scope || undefined) : (facilityId ?? undefined) } as Record<string, string | undefined>;
  const q = useGet<any>(`/reports/${code}`, params);
  const facs = useGet<any[]>(multiFacility ? '/facilities' : null);
  const [job, setJob] = useState<string | null>(null);
  const exp = useAct((format: string) => post('/report-exports', { code, format, params: Object.fromEntries(Object.entries(params).filter(([, v]) => v)) as Record<string, string> }), { onSuccess: (r) => { setJob(r.id); toast.ok('Đang tạo tệp xuất…'); } });
  const status = useGet<any>(job ? `/report-exports/${job}` : null, undefined, { refetchInterval: 1500, staleTime: 0 });
  useEffect(() => { if (status.data?.status === 'COMPLETED' || status.data?.status === 'SUCCEEDED' || status.data?.url) { toast.ok('Tệp đã sẵn sàng'); const u = status.data.url ?? status.data.downloadUrl; if (u) openAuthed(u.replace(/^\/v1/, ''), status.data.fileName ?? `${code}.${(status.data.format ?? 'csv').toLowerCase()}`); setJob(null); } else if (status.data?.status === 'FAILED') { toast.err('Xuất báo cáo thất bại'); setJob(null); } }, [status.data]); // eslint-disable-line
  const facilityName = multiFacility ? (scope ? facs.data?.find((f) => String(f.id) === scope)?.name : 'Toàn hệ thống') : facilities?.find((f) => f.id === facilityId)?.name;
  const basis = [snapshot ? 'Tại thời điểm xem' : `Kỳ ${periodLabel(period)}`, grouped ? `nhóm theo ${GROUP_LABEL[groupBy].toLowerCase()}` : null, facilityName ? `cơ sở: ${facilityName}` : null].filter(Boolean).join(' · ');
  return (
    <>
      <PageHeader
        title={<span className="inline-flex items-center">Báo cáo<HelpTip text={'Số liệu tổng hợp theo kỳ và theo phạm vi quyền của bạn.\nMọi con số lấy từ cùng một nguồn với trang Tổng quan, nên hai nơi luôn khớp nhau.\nDi chuột vào chữ i cạnh mỗi bộ lọc, ô số liệu hay tên cột để xem cách tính.'} /></span>}
        sub="Số liệu tổng hợp theo kỳ và phạm vi quyền của bạn"
        actions={<>{['CSV', 'XLSX', 'PDF'].map((f) => <Tip key={f} text={EXPORT_HELP[f]}><Button size="sm" variant="outline" icon={<Download className="size-4" />} loading={exp.isPending && exp.variables === f || !!job && exp.variables === f} onClick={() => exp.mutate(f)}>{f}</Button></Tip>)}</>}
      />
      <div className="mb-4">
        <p className="mb-1.5 flex items-center text-xs font-bold uppercase tracking-wider text-steel-500">Loại báo cáo<HelpTip text={'Chọn báo cáo cần xem. Mỗi báo cáo có phần mô tả ngay bên dưới, và chữ i cạnh tên bảng giải thích cách tính.\nCó thể kéo ngang hoặc bấm mũi tên để thấy thêm báo cáo.'} /></p>
        <Tabs value={code} onChange={setCode} tabs={reports.map(([v, l]) => ({ value: v, label: l }))} />
      </div>
      <Card className="mb-4 flex flex-wrap items-end gap-x-5 gap-y-3 p-4">
        {snapshot ? (
          <div className="space-y-1.5">
            <p className="flex items-center text-[13px] font-semibold text-ink-900">Thời gian<HelpTip text={'Báo cáo này chụp lại tình hình ngay lúc bạn mở, nên khoảng ngày không làm đổi số liệu.\nMuốn xem lại một kỳ đã qua, hãy dùng báo cáo Doanh thu, Lấp đầy hoặc Hoàn tiền.'} /></p>
            <Badge tone="info"><Camera className="size-3.5" />Ảnh chụp tại thời điểm xem</Badge>
          </div>
        ) : <PeriodPicker value={period} onChange={setPeriod} />}
        {grouped && <Field label={<span className="inline-flex items-center">Nhóm theo<HelpTip text={'Chia số liệu thành từng ngày, từng tháng hoặc từng năm.\nVới báo cáo Lấp đầy, mỗi kỳ lấy số liệu tại cuối kỳ (kỳ hiện tại lấy số liệu ngay lúc xem).'} /></span>}><Select value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>{Object.entries(GROUP_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>}
        {multiFacility
          ? <Field label={<span className="inline-flex items-center">Cơ sở<HelpTip text={'Chọn một cơ sở để chỉ xem số liệu của cơ sở đó, hoặc "Toàn hệ thống" để gộp tất cả cơ sở.\nBộ lọc này áp dụng cho cả bảng, các ô tổng hợp và tệp xuất.'} /></span>}><Select value={scope} onChange={(e) => setScope(e.target.value)}><option value="">Toàn hệ thống</option>{facs.data?.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</Select></Field>
          : <div className="space-y-1.5"><p className="flex items-center text-[13px] font-semibold text-ink-900">Cơ sở<HelpTip text={'Báo cáo của quản lý cơ sở chỉ gồm cơ sở bạn đang chọn ở góc trên bên trái. Đổi cơ sở ở đó để xem cơ sở khác.'} /></p><Badge tone="brass">{facilityName ?? '—'}</Badge></div>}
      </Card>
      <Async q={q}>{(r) => <ReportBody key={code} r={r} basis={basis} />}</Async>
    </>
  );
}

const isNum = (t?: string) => t === 'money' || t === 'pct' || t === 'int';
/** A reporting period as people write it: 2026-11 → 11/2026, 2026-11-12 → 12/11/2026. A year stays as it is. */
const fmtPeriod = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v.split('-').reverse().join('/') : /^\d{4}-\d{2}$/.test(v) ? `${v.slice(5)}/${v.slice(0, 4)}` : v);
/** Format a cell by the column's declared kind (money / pct / int / date), not by guessing from its name. */
function cell(type: string | undefined, v: any, key?: string) {
  if (v === null || v === undefined || v === '') return '—';
  if (key === 'period' && typeof v === 'string') return fmtPeriod(v);
  if (type === 'money') return vnd(v);
  if (type === 'pct') return pct(Number(v), 1);
  if (type === 'int') return Number(v).toLocaleString('vi-VN');
  if (type === 'date') return fmtDate(v);
  return typeof v === 'object' ? JSON.stringify(v) : String(v);
}
const PAGE = 50;
const FEE_L: Record<string, string> = { RENT: 'Tiền thuê', DEPOSIT: 'Tiền cọc', FEE: 'Phí khác', DISCOUNT: 'Giảm giá', PRORATION: 'Tính theo ngày', DAMAGE: 'Bồi thường hư hại', ADJUSTMENT: 'Điều chỉnh', ADMIN_FEE: 'Phí hành chính', ACCESS_CARD_FEE: 'Phí cấp thẻ ra vào', CARD_REPLACEMENT_FEE: 'Phí cấp lại thẻ', LOCK_REPLACEMENT_FEE: 'Phí thay khóa', CLEANING_FEE: 'Phí vệ sinh', LATE_FEE: 'Phí trễ hạn', OVERLOCK_FEE: 'Phí khóa chặn', RENEWAL_FEE: 'Phí gia hạn', EARLY_TERMINATION_FEE: 'Phí chấm dứt sớm' };
/** What one counted item is called in a grouped tile, by the summary it belongs to. */
const unitOf = (k: string) => (k.startsWith('ag') ? 'hồ sơ' : k.startsWith('delinquency') ? 'hợp đồng' : 'khoản');
const TOTAL_HELP = 'Dòng tổng gộp tất cả cơ sở của kỳ mới nhất rồi tính lại tỷ lệ từ số gốc (không phải trung bình cộng các dòng bên trên). Vì vậy nó bằng đúng chỉ số của toàn hệ thống trên trang Tổng quan.';

function SummaryTile({ k, v }: { k: string; v: any }) {
  const m = REPORT_SUMMARY[k];
  const label = (
    <p className="flex items-center text-xs font-semibold uppercase tracking-wider text-steel-500">{m?.label ?? k}{m?.help && <HelpTip text={m.help} label={`Giải thích: ${m.label}`} />}</p>
  );
  if (v !== null && typeof v === 'object') {
    const list = Array.isArray(v) ? v : null;
    const empty = (list ? list.length : Object.keys(v).length) === 0;
    return (
      <div className="rounded-2xl border hairline bg-white p-4 md:col-span-2">
        {label}
        <div className="mt-2 flex flex-wrap gap-2">
          {list?.some((x: any) => x && 'label' in x && 'count' in x)
            ? list.map((x: any) => <Badge key={x.label} tone="neutral">{x.label} · {x.count} {unitOf(k)}{x.amount > 0 ? ` · ${vnd(x.amount)}` : ''}</Badge>)
            : (list ? list.map((x: any) => [x.type, x.amount]) : Object.entries(v)).map(([n, val]: any) => <Badge key={n} tone="neutral">{k === 'byStatus' ? STATUS.unit[n]?.[0] ?? n : k === 'byFeeType' ? FEE_L[n] ?? enumLabel(String(n)) : n} · {k === 'byFeeType' ? vnd(val) : val}</Badge>)}
          {empty && <span className="text-sm text-steel-500">Không có dữ liệu</span>}
        </div>
      </div>
    );
  }
  const text = v === null || v === undefined ? '—' : m?.kind === 'pct' ? pct(Number(v), 1) : m?.kind === 'money' ? vnd(v) : typeof v === 'number' ? v.toLocaleString('vi-VN') : String(v);
  return <div className="rounded-2xl border hairline bg-white p-4">{label}<p className="mt-1 text-xl font-bold num">{text}</p></div>;
}

function ReportBody({ r, basis }: { r: any; basis: string }) {
  const [filter, setFilter] = useState('');
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const [sel, setSel] = useState<any | null>(null);
  const cols: { key: string; label: string; type?: string; help?: string; total?: 'sum' }[] = r.columns ?? [];
  const all: any[] = r.rows ?? [];
  const rows = useMemo(() => {
    const f = filter.trim().toLowerCase();
    let out = f ? all.filter((x) => cols.some((c) => String(x[c.key] ?? '').toLowerCase().includes(f))) : all;
    if (sort) {
      const c = cols.find((x) => x.key === sort.key);
      const num = isNum(c?.type);
      out = [...out].sort((a, b) => {
        const x = a[sort.key], y = b[sort.key];
        if (x === y) return 0;
        if (x === null || x === undefined) return 1;
        if (y === null || y === undefined) return -1;
        return (num ? Number(x) - Number(y) : String(x).localeCompare(String(y), 'vi')) * sort.dir;
      });
    }
    return out;
  }, [all, cols, filter, sort]);
  // Only columns the report says can be added up get a sum; a rate or a day count is never summed.
  const sums = cols.map((c) => (c.total === 'sum' ? rows.reduce((a, x) => a + (Number(x[c.key]) || 0), 0) : null));
  const showSums = !r.totalRow && rows.length > 1 && sums.some((t) => t !== null);
  const toggle = (key: string) => setSort((s) => (s?.key !== key ? { key, dir: 1 } : s.dir === 1 ? { key, dir: -1 } : null));
  const summary = Object.entries(r.summary ?? {}) as [string, any][];
  const scalars = summary.filter(([, v]) => v === null || typeof v !== 'object');
  const groups = summary.filter(([, v]) => v !== null && typeof v === 'object');
  const notes: string[] = r.notes ?? [];
  return (
    <div className="space-y-4">
      {r.description && (
        <p className="flex items-start gap-1 rounded-xl border hairline bg-white/70 px-4 py-3 text-[13px] leading-relaxed text-steel-600">
          <span>{r.description}</span>
          {notes.length > 0 && <HelpTip label="Cách tính và lưu ý" text={notes.map((n) => `• ${n}`).join('\n')} />}
        </p>
      )}
      {summary.length > 0 && <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {scalars.map(([k, v]) => <SummaryTile key={k} k={k} v={v} />)}
        {groups.map(([k, v]) => <SummaryTile key={k} k={k} v={v} />)}
      </div>}
      <Card>
        <CardHead
          title={<span className="inline-flex items-center">{r.title}<HelpTip text={'Bấm vào tên một cột để sắp xếp: bấm lần nữa để đảo chiều, lần thứ ba để bỏ sắp xếp.\nDi chuột vào chữ i cạnh tên cột để xem cột đó được tính thế nào.'} /></span>}
          sub={`${basis} · ${filter ? `${rows.length} / ` : ''}${all.length} dòng`}
          action={all.length > 8 ? <div className="flex items-center"><div className="relative w-56"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-steel-400" /><Input className="h-9 pl-9" placeholder="Lọc nhanh trong bảng" aria-label="Lọc nhanh trong bảng" value={filter} onChange={(e) => { setFilter(e.target.value); setLimit(PAGE); }} /></div><HelpTip text={'Gõ một đoạn chữ để chỉ giữ lại các dòng có chứa chữ đó ở bất kỳ cột nào.\nDòng tổng cộng các cột cũng tính lại theo những dòng còn lại.'} /></div> : undefined}
        />
        {rows.length === 0 ? <EmptyState title={filter ? 'Không có dòng phù hợp' : 'Không có dữ liệu trong kỳ này'} hint={filter ? 'Xóa bộ lọc để xem toàn bộ.' : 'Thử mở rộng khoảng ngày hoặc chọn phạm vi cơ sở khác.'} action={filter ? <Button size="sm" variant="outline" onClick={() => setFilter('')}>Xóa bộ lọc</Button> : undefined} /> : (
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead><tr className="border-b hairline text-left align-bottom text-xs uppercase tracking-wider text-steel-500">{cols.map((c) => { const on = sort?.key === c.key; const right = isNum(c.type); return (
              <th key={c.key} aria-sort={on ? (sort!.dir === 1 ? 'ascending' : 'descending') : 'none'} className={cn('px-3 py-2.5', right && 'text-right')}>
                <span className="inline-flex items-center">
                  <button type="button" onClick={() => toggle(c.key)} className="inline-flex items-center gap-1 font-semibold uppercase hover:text-ink-900">{c.label}{on ? (sort!.dir === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />) : <ArrowUpDown className="size-3 opacity-40" />}</button>
                  {c.help && <HelpTip text={c.help} label={`Giải thích cột ${c.label}`} />}
                </span>
              </th>); })}</tr></thead>
            <tbody>{rows.slice(0, limit).map((x, i) => <tr key={i} onClick={x.detail ? () => setSel(x) : undefined} onKeyDown={x.detail ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSel(x); } } : undefined} tabIndex={x.detail ? 0 : undefined} title={x.detail ? 'Bấm để xem chi tiết khoản này' : undefined} className={cn('border-b hairline last:border-0 hover:bg-paper', x.detail && 'cursor-pointer')}>{cols.map((c) => <td key={c.key} className={cn('px-3 py-2.5', isNum(c.type) && 'text-right num')}>{cell(c.type, x[c.key], c.key)}</td>)}</tr>)}</tbody>
            {r.totalRow && <tfoot><tr className="border-t-2 hairline bg-paper font-bold">{cols.map((c) => <td key={c.key} className={cn('px-3 py-2.5', isNum(c.type) && 'text-right num')}><span className="inline-flex items-center">{cell(c.type, r.totalRow[c.key], c.key)}{c.key === 'facility' && <HelpTip text={TOTAL_HELP} label="Giải thích dòng tổng cộng" />}</span></td>)}</tr></tfoot>}
            {showSums && <tfoot><tr className="border-t-2 hairline bg-paper font-bold">{cols.map((c, i) => <td key={c.key} className={cn('px-3 py-2.5', isNum(c.type) && 'text-right num')}>{i === 0 ? <span className="inline-flex items-center">{filter ? 'Tổng các dòng đã lọc' : 'Tổng'}<HelpTip text={'Cộng các dòng đang hiện trong bảng. Chỉ cộng những cột cộng được (tiền, số lượng); tỷ lệ và số ngày không có tổng.'} label="Giải thích dòng tổng" /></span> : sums[i] === null ? '' : cell(c.type, sums[i])}</td>)}</tr></tfoot>}
          </table></div>
        )}
        {rows.some((x) => x.detail) && rows.length > 0 && <p className="border-t hairline px-4 py-2 text-xs text-steel-500">Bấm vào một dòng để xem đầy đủ chi tiết của khoản đó.</p>}
        {rows.length > limit && <div className="border-t hairline p-3 text-center"><Button variant="outline" size="sm" onClick={() => setLimit((l) => l + PAGE)}>Xem thêm {Math.min(PAGE, rows.length - limit)} dòng · còn {rows.length - limit}</Button></div>}
      </Card>
      <Drawer open={!!sel} onClose={() => setSel(null)} title={sel?.code ?? sel?.contract ?? 'Chi tiết'} width={520}>
        {sel && <dl className="divide-y divide-steel-100 text-sm">{(sel.detail as { label: string; value: any; type?: string }[]).filter((l) => l.value !== null && l.value !== undefined && l.value !== '').map((l, i) => <div key={i} className="flex justify-between gap-4 py-2"><dt className="text-steel-500">{l.label}</dt><dd className="text-right font-semibold text-ink-950">{cell(l.type, l.value)}</dd></div>)}</dl>}
      </Drawer>
    </div>
  );
}
