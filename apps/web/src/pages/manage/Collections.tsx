import { Fragment, useState } from 'react';
import { useGet, useAct } from '@/lib/hooks';
import { post, patch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Alert, Async, Card, CardHead, PageHeader, StatusBadge, Button, Select, Tabs, Badge, DataTable, Drawer, Timeline, EmptyState, Input, usePaged } from '@/ui';
import { vnd, fmtDate, fmtDateTime, enumLabel, statusOf } from '@/lib/format';
import { ActBtn, Info, Money, REASON, PhotoGallery } from '../kit';
import { useFacility } from '../shared/Ops';
import { DebtGuide, nextStep, useDebtPolicy } from './DebtGuide';

/** Names for the kinds of money a debt is made of (see debtBreakdown in the API). */
const DEBT_KIND: Record<string, string> = { RENT: 'Tiền thuê', LATE_FEE: 'Phí trễ hạn', OVERLOCK_FEE: 'Phí khóa chặn', DAMAGE: 'Bồi thường hư hại', FEE: 'Phí khác', ADJUSTMENT: 'Điều chỉnh', DISCOUNT: 'Giảm trừ', OTHER: 'Thuế & điều chỉnh khác', PAID: 'Đã thanh toán', CREDITED: 'Đã ghi có' };
const INV_TYPE: Record<string, string> = { RECURRING: 'Tiền thuê định kỳ', AD_HOC: 'Phí phát sinh', RESERVATION: 'Đặt chỗ', MOVE_IN: 'Nhận kho', RENEWAL: 'Gia hạn', SETTLEMENT: 'Quyết toán' };

/** "Tiền thuê 2.690.000 ₫ + Phí trễ hạn 269.000 ₫ − Đã thanh toán 300.000 ₫" — the sum that makes up Dư nợ. */
function DebtParts({ parts, className }: { parts?: { kind: string; amount: number }[]; className?: string }) {
  if (!parts?.length) return null;
  // each part is an inline-block, and the space between parts sits OUTSIDE it, so a long sum wraps between parts instead of running into the next column
  return <span className={className ?? 'block text-xs text-steel-500'}>{parts.map((p, i) => <Fragment key={p.kind}>{i > 0 && ' '}<span className="inline-block whitespace-nowrap">{i > 0 && (p.amount < 0 ? '− ' : '+ ')}{i === 0 && p.amount < 0 ? '− ' : ''}{DEBT_KIND[p.kind] ?? p.kind} <span className="num">{vnd(Math.abs(p.amount))}</span></span></Fragment>)}</span>;
}

/** Every unpaid invoice behind the debt, line by line, ending in the total. */
function DebtBreakdown({ c }: { c: any }) {
  const invs: any[] = c.debtInvoices ?? [];
  if (!invs.length) return <p className="text-xs text-steel-500">Hợp đồng này không còn hóa đơn nào chưa thanh toán.</p>;
  return (
    <div className="space-y-3">
      {invs.map((i) => (
        <div key={i.id} className="overflow-hidden rounded-xl border hairline text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 bg-paper px-3 py-2">
            <span><b className="code">{i.code}</b> <span className="text-xs text-steel-500">{INV_TYPE[i.type] ?? i.type}</span></span>
            <span className="text-xs text-steel-500">Hạn {fmtDate(i.dueDate)} · {i.daysOverdue > 0 ? <b className="text-bad-600">quá hạn {i.daysOverdue} ngày</b> : 'chưa đến hạn'}</span>
          </div>
          <table className="w-full text-[13px]"><tbody>
            {i.lines.map((l: any, k: number) => <tr key={k} className="border-t hairline"><td className="px-3 py-1.5">{l.description}</td><td className="whitespace-nowrap px-3 py-1.5 text-right num">{vnd(l.amount)}</td></tr>)}
            {i.otherAdjust !== 0 && <tr className="border-t hairline"><td className="px-3 py-1.5 text-steel-600">Thuế & điều chỉnh khác</td><td className="whitespace-nowrap px-3 py-1.5 text-right num">{vnd(i.otherAdjust)}</td></tr>}
            {i.paid > 0 && <tr className="border-t hairline"><td className="px-3 py-1.5 text-steel-600">Đã thanh toán</td><td className="whitespace-nowrap px-3 py-1.5 text-right num">− {vnd(i.paid)}</td></tr>}
            {i.credited > 0 && <tr className="border-t hairline"><td className="px-3 py-1.5 text-steel-600">Đã ghi có</td><td className="whitespace-nowrap px-3 py-1.5 text-right num">− {vnd(i.credited)}</td></tr>}
            <tr className="border-t hairline bg-paper font-semibold"><td className="px-3 py-1.5">Còn nợ hóa đơn này</td><td className="whitespace-nowrap px-3 py-1.5 text-right num">{vnd(i.outstanding)}</td></tr>
          </tbody></table>
        </div>
      ))}
      <div className="flex items-center justify-between rounded-xl bg-ink-900 px-4 py-3 text-white"><span className="text-sm font-semibold">Tổng dư nợ ({invs.length} hóa đơn)</span><b className="display text-xl num">{vnd(c.debt)}</b></div>
    </div>
  );
}

const STAGES = ['GRACE', 'LATE', 'LOCKED_OUT', 'FINAL_NOTICE', 'DEFAULT_PENDING', 'DEFAULTED'];
export function Delinquency({ ops }: { ops?: boolean }) {
  const { id: fid } = useFacility();
  const can = useAuth((s) => s.can);
  // links from the overview open a given tab / stage / contract state (?tab=term|abandoned, ?stage=LATE, ?ct=live|terminated)
  const urlParam = (k: string) => new URLSearchParams(window.location.search).get(k) ?? '';
  const [stage, setStage] = useState(() => (STAGES.includes(urlParam('stage')) ? urlParam('stage') : '')); const [sel, setSel] = useState<any>(null);
  const [debtF, setDebtF] = useState(''); const [ctF, setCtF] = useState(() => (['live', 'terminated'].includes(urlParam('ct')) ? urlParam('ct') : '')); const [flagF, setFlagF] = useState(''); const [qs, setQs] = useState('');
  const q = useGet<any[]>('/delinquency', { stage: stage || undefined, facilityId: ops ? undefined : fid ?? undefined });
  const all = useGet<any[]>('/delinquency', { facilityId: ops ? undefined : fid ?? undefined }); // unfiltered, for the stage strip
  const term = useGet<any[]>('/termination-requests');
  const abandoned = useGet<any[]>('/abandoned-goods');
  const { policy: debtPolicy } = useDebtPolicy(ops ? null : fid);
  const abandonedOf = (r: any) => (abandoned.data ?? []).find((a: any) => a.contract?.id === r.id || a.contract?.code === r.code) ?? null;
  const staff = useGet<any[]>(!ops && fid ? `/facilities/${fid}/staff` : null);
  const witnessOpts = (staff.data ?? []).map((u) => ({ value: u.email, label: `${u.fullName}${u.roles?.includes('FACILITY_MANAGER') ? ' (Quản lý)' : ' (Nhân viên)'} · ${u.email}` }));
  const [tab, setTab] = useState(() => (['term', 'abandoned'].includes(urlParam('tab')) ? urlParam('tab') : 'list'));
  // extra client-side filters on top of the stage filter: debt, contract status, lock/promise flags, free text
  const shown = (q.data ?? []).filter((r: any) =>
    (!debtF || (debtF === 'owing' ? Number(r.debt) > 0 : Number(r.debt) <= 0)) &&
    (!ctF || (ctF === 'terminated' ? r.status === 'TERMINATED' : r.status !== 'TERMINATED')) &&
    (!flagF || (flagF === 'overlock' ? !!r.overlock : flagF === 'promise' ? !!r.promise : flagF === 'termination' ? !!r.termination && r.termination.bom_decision === 'PENDING' : true)) &&
    (!qs.trim() || `${r.code} ${r.customer?.full_name ?? ''} ${r.unit?.code ?? ''}`.toLowerCase().includes(qs.trim().toLowerCase())));
  const filtering = !!(debtF || ctF || flagF || qs.trim());
  const paged = usePaged(q.data ? shown : undefined, `${stage}|${debtF}|${ctF}|${flagF}|${qs}`);
  const termPaged = usePaged(term.data);
  const abandonedPaged = usePaged(abandoned.data);
  return (
    <>
      <PageHeader title="Nợ quá hạn" sub="Các hợp đồng đang trong quy trình xử lý nợ" />
      <DebtGuide ops={ops} facilityId={fid} />
      <Tabs className="mb-4" value={tab} onChange={setTab} tabs={[
        { value: 'list', label: 'Danh sách', count: q.data?.length },
        { value: 'term', label: 'Yêu cầu thu hồi kho', count: term.data?.filter((t) => t.bom_decision === 'PENDING').length || undefined },
        { value: 'abandoned', label: 'Tài sản tồn đọng', count: abandoned.data?.filter((a) => a.disposition === 'PENDING').length || undefined },
      ]} />
      {tab === 'list' && all.data && all.data.length > 0 && (
        <div className="mb-4 grid gap-2 sm:grid-cols-3 xl:grid-cols-6" role="group" aria-label="Lọc theo giai đoạn">
          {STAGES.map((st) => { const rows = all.data!.filter((r) => r.delinquency_status === st); const debt = rows.reduce((a, r) => a + Number(r.debt ?? 0), 0); const on = stage === st; return (
            <button key={st} type="button" disabled={!rows.length} aria-pressed={on} onClick={() => setStage(on ? '' : st)} className={`rounded-xl border bg-white p-3 text-left transition ${on ? 'border-ink-900 ring-1 ring-ink-900' : 'hairline'} ${rows.length ? 'hover:border-ink-900' : 'opacity-50'}`}>
              <p className="truncate text-xs font-semibold text-steel-600">{statusOf('delinquency', st)[0]}</p><p className="mt-1 text-2xl font-bold num">{rows.length}</p><p className="text-xs text-steel-500 num">{rows.length ? vnd(debt) : '—'}</p>
            </button>); })}
        </div>
      )}
      {tab === 'list' ? (
        <Card>
          <div className="flex flex-wrap items-center gap-2 border-b hairline p-3"><Input className="w-52" placeholder="Tìm mã HĐ / khách / kho" value={qs} onChange={(e) => setQs(e.target.value)} aria-label="Tìm" /><Select className="w-48" value={stage} onChange={(e) => setStage(e.target.value)} aria-label="Giai đoạn"><option value="">Mọi giai đoạn</option>{STAGES.map((s) => <option key={s} value={s}>{enumLabel(s)}</option>)}</Select><Select className="w-44" value={debtF} onChange={(e) => setDebtF(e.target.value)} aria-label="Công nợ"><option value="">Mọi công nợ</option><option value="owing">Còn nợ</option><option value="clear">Đã hết nợ</option></Select><Select className="w-48" value={ctF} onChange={(e) => setCtF(e.target.value)} aria-label="Hợp đồng"><option value="">Mọi trạng thái hợp đồng</option><option value="live">Còn hiệu lực</option><option value="terminated">Đã chấm dứt</option></Select><Select className="w-48" value={flagF} onChange={(e) => setFlagF(e.target.value)} aria-label="Xử lý"><option value="">Mọi xử lý</option><option value="overlock">Đang khóa chặn</option><option value="promise">Có hẹn trả</option><option value="termination">Chờ duyệt thu hồi</option></Select>{filtering && <button type="button" className="text-sm font-semibold text-info-600 hover:underline" onClick={() => { setDebtF(''); setCtF(''); setFlagF(''); setQs(''); }}>Xóa lọc</button>}<span className="ml-auto text-xs text-steel-500">{shown.length} / {q.data?.length ?? 0} hợp đồng</span></div>
          <DataTable rows={paged.rows} loading={q.isLoading} error={q.error} onRetry={q.refetch} rowKey={(r) => r.id} onRow={setSel} empty={filtering ? <EmptyState title="Không có hợp đồng phù hợp bộ lọc" hint="Bấm Xóa lọc để xem lại toàn bộ." /> : <EmptyState title="Không có hợp đồng quá hạn" hint="Rất tốt — mọi khách đang thanh toán đúng hạn." />}
            cols={[{ key: 'c', header: 'Hợp đồng', cell: (r) => <><span className="code font-semibold">{r.code}</span><span className="block text-xs text-steel-500">{r.customer?.full_name} · Kho {r.unit?.code}</span></> }, { key: 'd', header: 'Quá hạn', cell: (r) => <><b className="num">{r.daysOverdue} ngày</b>{r.status === 'TERMINATED' && <span className="block text-xs text-steel-500">tính từ hóa đơn còn nợ sau chấm dứt</span>}</> }, { key: 'a', header: 'Dư nợ', hideBelow: 'sm', cell: (r) => <><Money v={r.debt} strong /><DebtParts parts={r.debtParts} className="block max-w-[22rem] text-xs leading-relaxed text-steel-500" /></> }, { key: 's', header: 'Giai đoạn', cell: (r) => <span className="flex flex-wrap items-center gap-1"><StatusBadge kind="delinquency" value={r.delinquency_status} />{r.status === 'TERMINATED' && <Badge tone="neutral">Đã chấm dứt</Badge>}</span> }, { key: 'n', header: 'Việc cần làm', hideBelow: 'lg', cell: (r) => { const n = nextStep(r, debtPolicy, ops, abandonedOf(r)); return <span className="block max-w-[26rem] text-xs leading-relaxed text-steel-700">{n.text}<span className="mt-0.5 block font-semibold text-steel-500">Ai làm: {n.who}</span></span>; } }, { key: 'o', header: '', hideBelow: 'md', cell: (r) => <span className="flex gap-1">{r.overlock && <Badge tone="bad">Khóa chặn</Badge>}{r.promise && <Badge tone="info">Hẹn trả</Badge>}</span> }]} />
          {paged.footer}
        </Card>
      ) : tab === 'term' ? (
        <Card><div className="border-b hairline bg-paper/60 px-4 py-3 text-[13px] text-steel-700"><b className="text-ink-950">Quy trình thu hồi kho gồm 4 bước:</b> <b>Bước 1</b> Quản lý cơ sở xác nhận → <b>Bước 2</b> BOM duyệt hoặc từ chối → <b>Bước 3</b> Quản lý cơ sở kiểm kê tài sản trong kho → <b>Bước 4</b> BOM quyết định xử lý tài sản. Cột "Bước tiếp theo" cho biết việc đang chờ và ai phải làm. Bấm vào dòng để mở hồ sơ nợ của hợp đồng.</div><DataTable rows={termPaged.rows} loading={term.isLoading} rowKey={(r) => r.id} onRow={(r) => { const found = (all.data ?? []).find((x: any) => x.id === r.contract?.id || x.code === r.contract?.code); if (found) setSel(found); }} empty={<EmptyState title="Không có yêu cầu" />} cols={[{ key: 'c', header: 'Hợp đồng', cell: (r) => <span className="code font-semibold">{r.contract?.code}</span> }, { key: 'd', header: 'Quyết định VH', cell: (r) => <Badge tone={r.bom_decision === 'APPROVED' ? 'ok' : r.bom_decision === 'REJECTED' ? 'bad' : 'warn'}>{r.bom_decision}</Badge> }, { key: 'f', header: 'QL cơ sở xác nhận', cell: (r) => r.fm_confirmed_at ? fmtDate(r.fm_confirmed_at) : '—' }, { key: 'a', header: 'Bước tiếp theo', cell: (r) => {
          const ag = (abandoned.data ?? []).find((a: any) => a.contract?.id === r.contract?.id || a.contract?.code === r.contract?.code);
          return (
            <span className="flex flex-wrap items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
              {!ops && r.bom_decision === 'PENDING' && !r.fm_confirmed_at && <ActBtn label="Xác nhận thu hồi (Bước 1)" variant="primary" title="Xác nhận thu hồi kho" description="Chỉ xác nhận sau khi đã gửi thông báo cuối và đủ thời hạn." fields={[{ name: 'note', label: 'Ghi chú', type: 'textarea' }]} run={(v) => post(`/termination-requests/${r.id}/confirm`, v)} ok="Đã xác nhận" invalidate={['/termination', '/delinquency']} />}
              {!ops && r.bom_decision === 'PENDING' && r.fm_confirmed_at && <Badge tone="warn">Chờ Quản lý vận hành (BOM) duyệt (Bước 2)</Badge>}
              {ops && r.bom_decision === 'PENDING' && !r.fm_confirmed_at && <Badge tone="warn">Chờ QL cơ sở xác nhận (Bước 1)</Badge>}
              {ops && r.bom_decision === 'PENDING' && r.fm_confirmed_at && can('delinquency.manage') && <><ActBtn label="Duyệt (Bước 2)" variant="primary" title="Duyệt thu hồi kho" fields={[{ name: 'note', label: 'Ghi chú', type: 'textarea' }]} run={(v) => post(`/termination-requests/${r.id}/decide`, { approve: true, ...v })} ok="Đã duyệt" invalidate={['/termination', '/delinquency']} /><ActBtn label="Từ chối" danger title="Từ chối thu hồi" fields={[{ name: 'note', label: 'Lý do', type: 'textarea', required: true }]} run={(v) => post(`/termination-requests/${r.id}/decide`, { approve: false, ...v })} invalidate={['/termination', '/delinquency']} /></>}
              {!ops && r.bom_decision === 'APPROVED' && !ag && r.contract?.id && <ActBtn label="Kiểm kê tài sản tồn đọng (Bước 3)" variant="primary" title="Lập hồ sơ tài sản tồn đọng" fields={[{ name: 'inventory', label: 'Danh mục tài sản tồn đọng', type: 'items', required: true }, { name: 'witness1', label: 'Người làm chứng 1', type: 'select', required: true, options: witnessOpts }, { name: 'witness2', label: 'Người làm chứng 2 (khác người 1)', type: 'select', required: true, options: witnessOpts }, { name: 'location', label: 'Nơi lưu giữ' }, { name: 'photoIds', label: 'Ảnh hiện trường kiểm kê', type: 'photos', required: true }]} run={(v) => post('/abandoned-goods', { contractId: r.contract.id, ...v })} ok="Đã lập hồ sơ tài sản tồn đọng" invalidate={['/delinquency', '/contracts', '/abandoned-goods', '/termination']} onDone={() => setTab('abandoned')} />}
              {ops && r.bom_decision === 'APPROVED' && !ag && <Badge tone="warn">Chờ QL cơ sở kiểm kê tài sản (Bước 3)</Badge>}
              {r.bom_decision === 'APPROVED' && ag && ag.disposition === 'PENDING' && (
                ops ? (
                  <ActBtn label="Quyết định xử lý (Bước 4)" variant="primary" title="Xử lý tài sản tồn đọng" fields={[{ name: 'disposition', label: 'Hình thức', type: 'select', required: true, options: [{ value: 'RETURNED_TO_TENANT', label: 'Trả lại khách' }, { value: 'DISPOSED', label: 'Tiêu hủy' }, { value: 'SOLD', label: 'Thanh lý' }] }, { name: 'proceeds', label: 'Tiền thu được (nếu thanh lý)', type: 'money' }]} run={(v) => patch(`/abandoned-goods/${ag.id}`, v)} ok="Đã cập nhật xử lý tài sản" invalidate={['/abandoned-goods', '/termination']} onDone={() => setTab('abandoned')} />
                ) : (
                  <><Badge tone="info">Đã kiểm kê — Chờ BOM xử lý (Bước 4)</Badge><Button size="sm" variant="outline" onClick={() => setTab('abandoned')}>Xem tài sản tồn đọng</Button></>
                )
              )}
              {r.bom_decision === 'APPROVED' && ag && ag.disposition !== 'PENDING' && <><Badge tone="ok">Hoàn tất ({ag.disposition})</Badge><Button size="sm" variant="ghost" onClick={() => setTab('abandoned')}>Xem hồ sơ</Button></>}
            </span>
          );
        } }]} />{termPaged.footer}</Card>
      ) : (
        <Card><div className="border-b hairline bg-paper/60 px-4 py-3 text-[13px] text-steel-700"><b className="text-ink-950">Tài sản tồn đọng</b> là đồ khách để lại sau khi hợp đồng bị chấm dứt. Quản lý cơ sở lập hồ sơ kiểm kê (Bước 3: danh mục, 2 người làm chứng, ảnh); sau đó BOM quyết định <b>trả lại khách</b>, <b>tiêu hủy</b> hoặc <b>thanh lý</b> (Bước 4) — hồ sơ chỉ chốt khi có quyết định này.</div><DataTable rows={abandonedPaged.rows} loading={abandoned.isLoading} rowKey={(r) => r.id} empty={<EmptyState title="Chưa có hồ sơ tài sản tồn đọng" />} cols={[
          { key: 'c', header: 'Hợp đồng', cell: (r) => <span className="code font-semibold">{r.contract?.code}</span> },
          { key: 'i', header: 'Kiểm kê', cell: (r) => <span className="text-xs">{Array.isArray(r.inventory_list) ? r.inventory_list.map((x: any) => `${x.item} (x${x.qty})`).join(', ') : '—'}</span> },
          { key: 'p', header: 'Ảnh hiện trường', cell: (r) => Array.isArray(r.photos) && r.photos.length > 0 ? <PhotoGallery photos={r.photos} size="sm" /> : <span className="text-xs text-steel-400">Chưa có ảnh</span> },
          { key: 'h', header: 'Giữ đến', cell: (r) => fmtDate(r.hold_until) },
          { key: 's', header: 'Trạng thái', cell: (r) => <Badge tone={r.disposition === 'PENDING' ? 'warn' : 'ok'}>{r.disposition}</Badge> },
          { key: 'a', header: '', cell: (r) => ops && r.disposition === 'PENDING' ? <ActBtn label="Quyết định xử lý" variant="primary" title="Xử lý tài sản tồn đọng" fields={[{ name: 'disposition', label: 'Hình thức', type: 'select', required: true, options: [{ value: 'RETURNED_TO_TENANT', label: 'Trả lại khách' }, { value: 'DISPOSED', label: 'Tiêu hủy' }, { value: 'SOLD', label: 'Thanh lý' }] }, { name: 'proceeds', label: 'Tiền thu được (nếu thanh lý)', type: 'money' }]} run={(v) => patch(`/abandoned-goods/${r.id}`, v)} ok="Đã cập nhật xử lý tài sản" invalidate={['/abandoned-goods']} /> : null },
        ]} />{abandonedPaged.footer}</Card>
      )}
      <CaseDrawer c={sel ? ((q.data ?? []).find((r: any) => r.id === sel.id) ?? sel) : null} onClose={() => setSel(null)} ops={ops} policy={debtPolicy} abandoned={sel ? abandonedOf(sel) : null} />
    </>
  );
}

const PROMISE_STATUS: Record<string, string> = { ACTIVE: 'Đang hiệu lực', KEPT: 'Khách đã trả đúng hẹn', BROKEN: 'Khách thất hứa', CANCELLED: 'Đã hủy' };

/** Everything that happened on a case, newest first: contact notes, promises to pay, stage changes and overlock placement/removal. */
function caseLog(d: any) {
  const rows: { t: string; item: { title: React.ReactNode; sub?: React.ReactNode; at?: React.ReactNode; tone?: 'warn' | 'bad' | 'info' } }[] = [];
  for (const n of d.notes ?? []) rows.push({ t: n.created_at, item: { title: `${n.channel} — ${n.outcome}`, at: fmtDateTime(n.created_at), sub: (<div className="space-y-1.5">{n.note && <p>{n.note}</p>}{Array.isArray(n.photos) && n.photos.length > 0 && <PhotoGallery photos={n.photos} size="sm" />}</div>) } });
  for (const p of d.promises ?? []) rows.push({ t: p.created_at, item: { title: `Hẹn trả ${vnd(p.promised_amount)} trước ngày ${fmtDate(p.promised_date)}`, sub: PROMISE_STATUS[p.status] ?? p.status, at: fmtDateTime(p.created_at), tone: p.status === 'BROKEN' ? 'bad' : p.status === 'ACTIVE' ? 'info' : undefined } });
  for (const e of d.events ?? []) rows.push({ t: e.created_at, item: { title: `${e.from_stage} → ${e.to_stage}`, sub: `Quá hạn ${e.days_overdue} ngày`, at: fmtDateTime(e.created_at), tone: 'warn' } });
  for (const o of d.overlocks ?? []) {
    rows.push({ t: o.placed_at, item: { title: `Đã đặt khóa chặn #${o.lock_serial}`, at: fmtDateTime(o.placed_at), tone: 'warn' } });
    if (o.removed_at) rows.push({ t: o.removed_at, item: { title: `Đã gỡ khóa chặn #${o.lock_serial}`, at: fmtDateTime(o.removed_at) } });
  }
  return rows.sort((x, y) => new Date(y.t).getTime() - new Date(x.t).getTime()).map((r) => r.item);
}

function CaseDrawer({ c, onClose, ops, abandoned, policy }: { c: any; onClose: () => void; ops?: boolean; abandoned?: any; policy?: any }) {
  const can = useAuth((s) => s.can);
  const q = useGet<any>(c ? `/contracts/${c.id}/collection-notes` : null);
  const staff = useGet<any[]>(c && !ops && c.status === 'TERMINATED' && c.facility?.id ? `/facilities/${c.facility.id}/staff` : null);
  const witnessOpts = (staff.data ?? []).map((u) => ({ value: u.email, label: `${u.fullName}${u.roles?.includes('FACILITY_MANAGER') ? ' (Quản lý)' : ' (Nhân viên)'} · ${u.email}` }));
  const inv = ['/delinquency', '/contracts', '/abandoned-goods'];
  return (
    <Drawer open={!!c} onClose={onClose} title={c ? `Hồ sơ nợ ${c.code}` : ''} width={520}>
      {c && <div className="space-y-5">
        <Info rows={[['Khách', c.customer?.full_name], ['Điện thoại', c.customer?.phone], ['Kho', `${c.unit?.code} · ${c.facility?.name}`], ['Dư nợ', vnd(c.debt)], ['Quá hạn (hóa đơn cũ nhất)', `${c.daysOverdue} ngày`], ['Hóa đơn cũ nhất', c.oldestInvoice?.code], ['Hẹn trả', c.promise ? `${vnd(c.promise.promised_amount)} trước ngày ${fmtDate(c.promise.promised_date)}` : undefined]]} />
        {(() => { const n = nextStep(c, policy, ops, abandoned); return n.text === '—' ? null : <Alert tone="warn" title="Việc cần làm ngay"><span className="block">{n.text}</span><span className="mt-1 block text-xs font-semibold">Ai làm: {n.who}</span></Alert>; })()}
        <div><p className="mb-2 text-sm font-bold">Dư nợ gồm những khoản nào</p><DebtBreakdown c={c} /></div>
        {can('delinquency.manage', true) && <div className="flex flex-wrap gap-2 border-t hairline pt-4">
          <ActBtn label="Ghi nhận liên hệ" title="Ghi nhận lần liên hệ" fields={[{ name: 'channel', label: 'Kênh', type: 'select', required: true, options: ['CALL', 'SMS', 'EMAIL', 'IN_PERSON', 'LETTER'].map((v) => ({ value: v, label: v })) }, { name: 'outcome', label: 'Kết quả', required: true }, { name: 'note', label: 'Ghi chú', type: 'textarea' }, { name: 'evidenceIds', label: 'Ảnh/bằng chứng đính kèm', type: 'photos' }]} run={(v) => post(`/contracts/${c.id}/collection-notes`, v)} ok="Đã ghi nhận" invalidate={inv} />
          <ActBtn label="Hẹn trả" title="Khách hứa thanh toán" fields={[{ name: 'amount', label: 'Số tiền', type: 'money', required: true }, { name: 'date', label: 'Ngày hẹn', type: 'date', required: true }]} run={(v) => post(`/contracts/${c.id}/promise-to-pay`, v)} ok="Đã ghi nhận lời hẹn" invalidate={inv} />
          {!c.overlock && ['LATE', 'LOCKED_OUT', 'FINAL_NOTICE', 'DEFAULT_PENDING'].includes(c.delinquency_status) && <ActBtn label="Đặt khóa chặn" danger title="Đặt khóa chặn kho" description="Cần ảnh/biên bản tại hiện trường theo quy trình." fields={[{ name: 'lockSerial', label: 'Số seri khóa', required: true }, { name: 'photoIds', label: 'Ảnh khóa chặn tại hiện trường', type: 'photos', required: true }]} run={(v) => post('/overlocks', { contractId: c.id, ...v })} ok="Đã đặt khóa chặn" invalidate={inv} />}
          {!ops && ['LATE', 'LOCKED_OUT', 'FINAL_NOTICE'].includes(c.delinquency_status) && c.status !== 'TERMINATED' && <ActBtn label="Đề xuất thu hồi kho" danger title="Đề xuất thu hồi kho" description="Tạo yêu cầu thu hồi ngay, không cần chờ đủ ngày. Quản lý vận hành sẽ duyệt hoặc từ chối." fields={[{ name: 'note', label: 'Lý do / ghi chú', type: 'textarea' }]} run={(v) => post(`/contracts/${c.id}/termination-request`, v)} ok="Đã gửi yêu cầu thu hồi — xem tab Yêu cầu thu hồi kho" invalidate={[...inv, '/termination']} />}
          {c.overlock && <ActBtn label="Gỡ khóa chặn" title="Gỡ khóa chặn" fields={[{ name: 'photoIds', label: 'Ảnh sau khi gỡ khóa chặn', type: 'photos' }]} run={(v) => post(`/overlocks/${c.overlock.id}/remove`, v)} ok="Đã gỡ" invalidate={inv} />}
          {!ops && c.status === 'TERMINATED' && <ActBtn label="Kiểm kê tài sản tồn đọng" title="Lập hồ sơ tài sản tồn đọng" fields={[{ name: 'inventory', label: 'Danh mục tài sản tồn đọng', type: 'items', required: true }, { name: 'witness1', label: 'Người làm chứng 1', type: 'select', required: true, options: witnessOpts }, { name: 'witness2', label: 'Người làm chứng 2 (khác người 1)', type: 'select', required: true, options: witnessOpts }, { name: 'location', label: 'Nơi lưu giữ' }, { name: 'photoIds', label: 'Ảnh hiện trường kiểm kê', type: 'photos', required: true }]} run={(v) => post('/abandoned-goods', { contractId: c.id, ...v })} ok="Đã lập hồ sơ tài sản" invalidate={inv} />}
        </div>}
        <Async q={q}>{(d) => (
          <div className="space-y-4">
            {Array.isArray(d.overlocks) && d.overlocks.length > 0 && (
              <div className="space-y-2 rounded-xl border hairline bg-paper p-3 text-xs">
                <p className="font-bold text-ink-900">Hồ sơ & Ảnh khóa chặn kho (Overlock)</p>
                {d.overlocks.map((o: any) => (
                  <div key={o.id} className="space-y-1.5 border-t hairline pt-2 first:border-t-0 first:pt-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold">Khóa #{o.lock_serial} · {o.status}</span>
                      <span className="text-steel-500">Đặt: {fmtDateTime(o.placed_at)}{o.removed_at ? ` · Gỡ: ${fmtDateTime(o.removed_at)}` : ''}</span>
                    </div>
                    {Array.isArray(o.photos) && o.photos.length > 0 && (
                      <PhotoGallery photos={o.photos} size="sm" />
                    )}
                  </div>
                ))}
              </div>
            )}
            <div>
              <p className="mb-2 text-sm font-bold">Nhật ký xử lý</p>
              <Timeline items={caseLog(d)} />
            </div>
          </div>
        )}</Async>
      </div>}
    </Drawer>
  );
}
