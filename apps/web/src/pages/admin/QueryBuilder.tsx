import { useEffect, useMemo, useState } from 'react';
import { Copy, Link2, Pencil, Play, Plus, Trash2 } from 'lucide-react';
import { useGet } from '@/lib/hooks';
import { Badge, Button, Input, Select, Alert, cn } from '@/ui';
import { toast } from '@/ui/toast';
import { buildSql, describeSpec, emptySpec, isBool, needsValueFor, opLabel, opsFor, type Cond, type Op, type QCol, type Spec } from './query-builder';

type TableInfoLite = { table: string; columns: (QCol & { generated?: boolean })[]; rows: number };

/** Ready-made questions: pick one and the form fills itself in. */
const PRESETS: { label: string; hint: string; spec: Partial<Spec> & { table: string } }[] = [
  { label: 'Hợp đồng đang nợ', hint: 'Hợp đồng không ở trạng thái đúng hạn', spec: { table: 'contracts', conds: [{ id: 1, column: 'delinquency_status', op: 'ne', value: 'CURRENT' }], sortBy: 'updated_at' } },
  { label: 'Hóa đơn chưa thanh toán', hint: 'Đã phát hành hoặc mới trả một phần', spec: { table: 'invoices', conds: [{ id: 1, column: 'status', op: 'in', value: 'ISSUED, PARTIALLY_PAID' }], sortBy: 'due_date', sortDir: 'ASC' } },
  { label: 'Khách mới nhất', hint: '20 khách đăng ký gần đây', spec: { table: 'customers', sortBy: 'created_at', limit: 20 } },
  { label: 'Đặt chỗ đã hủy', hint: 'Mới nhất trước', spec: { table: 'reservations', conds: [{ id: 1, column: 'status', op: 'eq', value: 'CANCELLED' }], sortBy: 'id' } },
  { label: 'Kho đang khóa chặn', hint: 'Kho bị khóa vì nợ', spec: { table: 'units', conds: [{ id: 1, column: 'status', op: 'eq', value: 'OVERLOCKED' }], sortBy: 'code', sortDir: 'ASC' } },
  { label: 'Lịch sử chỉnh dữ liệu', hint: 'Các lần sửa/xóa trực tiếp ở tab này', spec: { table: 'audit_logs', conds: [{ id: 1, column: 'action', op: 'starts', value: 'db.' }], sortBy: 'id' } },
];

const PICK_DEFAULT = ['code', 'full_name', 'name', 'email'];

function Step({ n, title, hint, children }: { n: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border hairline bg-white p-3.5">
      <div className="mb-2.5 flex items-start gap-2.5">
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-ink-900 text-xs font-bold text-white">{n}</span>
        <div><p className="text-sm font-bold text-ink-950">{title}</p>{hint && <p className="text-xs text-steel-500">{hint}</p>}</div>
      </div>
      {children}
    </section>
  );
}

/** One foreign key of the main table: tick it to show a few columns of the table it points to. */
function RelationRow({ col, on, cols, setOn, setCols }: { col: QCol; on: boolean; cols: string[]; setOn: (v: boolean) => void; setCols: (c: string[]) => void }) {
  const info = useGet<TableInfoLite>(on && col.fk ? `/admin/database/tables/${col.fk.table}` : null);
  useEffect(() => {
    if (on && info.data && cols.length === 0) setCols(PICK_DEFAULT.filter((c) => info.data!.columns.some((x) => x.name === c)).slice(0, 2));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, info.data]);
  return (
    <div className="rounded-lg border border-steel-200 px-3 py-2">
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input type="checkbox" checked={on} onChange={(e) => { setOn(e.target.checked); if (!e.target.checked) setCols([]); }} className="size-4 accent-ink-900" />
        <Link2 className="size-3.5 text-steel-500" />
        <span>Kèm thông tin <b className="font-mono text-[12.5px]">{col.fk!.table}</b> <span className="text-steel-500">(qua cột {col.name})</span></span>
      </label>
      {on && (
        <div className="mt-2 flex flex-wrap gap-1.5 pl-6">
          {!info.data && <span className="text-xs text-steel-500">Đang tải cột…</span>}
          {info.data?.columns.filter((c) => !c.sensitive).map((c) => {
            const sel = cols.includes(c.name);
            return <button key={c.name} type="button" onClick={() => setCols(sel ? cols.filter((x) => x !== c.name) : [...cols, c.name])} className={cn('cursor-pointer rounded-md border px-2 py-0.5 font-mono text-[11.5px] transition', sel ? 'border-ink-900 bg-ink-900 text-white' : 'border-steel-300 bg-white hover:border-ink-900')}>{c.name}</button>;
          })}
        </div>
      )}
    </div>
  );
}

export function QueryBuilder({ onRun, onEdit, running }: { onRun: (sql: string) => void; onEdit: (sql: string) => void; running?: boolean }) {
  const overview = useGet<{ tables: { table: string; rows: number }[] }>('/admin/database/overview');
  const [spec, setSpec] = useState<Spec>(() => emptySpec('invoices'));
  const [relOn, setRelOn] = useState<Record<string, boolean>>({});
  const [relCols, setRelCols] = useState<Record<string, string[]>>({});
  const [tableText, setTableText] = useState('invoices');
  const [showSql, setShowSql] = useState(false);
  const [nextId, setNextId] = useState(10);

  const info = useGet<TableInfoLite>(spec.table ? `/admin/database/tables/${spec.table}` : null, undefined, { keepPrevious: true });
  const cols: QCol[] = info.data && info.data.table === spec.table ? info.data.columns : [];
  const byName = useMemo(() => new Map(cols.map((c) => [c.name, c])), [cols]);
  const fks = cols.filter((c) => c.fk);

  const full: Spec = useMemo(() => ({ ...spec, relations: fks.filter((c) => relOn[c.name]).map((c) => ({ fkColumn: c.name, table: c.fk!.table, refColumn: c.fk!.column, columns: relCols[c.name] ?? [] })) }), [spec, fks, relOn, relCols]);
  const built = useMemo(() => (cols.length ? buildSql(full, cols) : { sql: '', errors: ['Chọn một bảng'] }), [full, cols]);
  const sentence = cols.length ? describeSpec(full, cols) : '';

  const pickTable = (t: string, keep?: Partial<Spec>) => {
    setTableText(t);
    setRelOn({});
    setRelCols({});
    setSpec({ ...emptySpec(t), limit: spec.limit, ...keep });
  };
  const known = (t: string) => overview.data?.tables.some((x) => x.table === t);
  const setCond = (id: number, patch: Partial<Cond>) => setSpec((s) => ({ ...s, conds: s.conds.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
  const addCond = () => {
    const first = cols.find((c) => !c.sensitive) ?? cols[0];
    if (!first) return;
    setSpec((s) => ({ ...s, conds: [...s.conds, { id: nextId, column: first.name, op: opsFor(first.type)[0], value: '' }] }));
    setNextId((n) => n + 1);
  };
  const usePreset = (p: (typeof PRESETS)[number]) => {
    setTableText(p.spec.table);
    setRelOn({});
    setRelCols({});
    setSpec({ ...emptySpec(p.spec.table), ...p.spec, conds: (p.spec.conds ?? []).map((c, i) => ({ ...c, id: 1000 + i })), sortDir: p.spec.sortDir ?? 'DESC', limit: p.spec.limit ?? 50 });
  };
  const copy = async () => { try { await navigator.clipboard.writeText(built.sql); toast.ok('Đã sao chép câu SQL'); } catch { toast.err('Không sao chép được'); } };
  const canRun = built.errors.length === 0 && !!built.sql;

  return (
    <div className="space-y-3 p-4">
      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-steel-500">Câu hỏi mẫu — bấm để điền sẵn</p>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => <button key={p.label} type="button" title={p.hint} onClick={() => usePreset(p)} className="cursor-pointer rounded-full border border-steel-300 bg-white px-3 py-1 text-xs font-semibold text-ink-900 transition hover:border-ink-900">{p.label}</button>)}
        </div>
      </div>

      <Step n={1} title="Muốn xem dữ liệu của bảng nào?" hint="Gõ vài chữ để tìm, ví dụ: hoa don → invoices, contracts, customers, units, reservations">
        <div className="flex flex-wrap items-center gap-2">
          <Input list="qb-tables" value={tableText} onChange={(e) => { setTableText(e.target.value); const v = e.target.value.trim().toLowerCase(); if (known(v)) pickTable(v); }} placeholder="Tên bảng, ví dụ invoices" className="max-w-xs font-mono" aria-label="Bảng" />
          <datalist id="qb-tables">{overview.data?.tables.map((t) => <option key={t.table} value={t.table}>{t.rows} dòng</option>)}</datalist>
          {info.data && info.data.table === spec.table && <Badge tone="neutral">{info.data.rows.toLocaleString('vi-VN')} dòng · {cols.length} cột</Badge>}
          {tableText && !known(tableText.trim().toLowerCase()) && overview.data && <span className="text-xs text-bad-600">Không có bảng này — chọn một tên trong gợi ý</span>}
        </div>
      </Step>

      {cols.length > 0 && (
        <>
          <Step n={2} title="Cần xem những cột nào?">
            <div className="mb-2 flex gap-3 text-sm">
              <label className="flex cursor-pointer items-center gap-1.5"><input type="radio" checked={spec.allColumns} onChange={() => setSpec((s) => ({ ...s, allColumns: true }))} className="accent-ink-900" />Tất cả các cột</label>
              <label className="flex cursor-pointer items-center gap-1.5"><input type="radio" checked={!spec.allColumns} onChange={() => setSpec((s) => ({ ...s, allColumns: false, columns: s.columns.length ? s.columns : cols.filter((c) => !c.sensitive).slice(0, 6).map((c) => c.name) }))} className="accent-ink-900" />Chỉ chọn một số cột</label>
            </div>
            {!spec.allColumns && (
              <div className="flex flex-wrap gap-1.5">
                {cols.map((c) => {
                  const sel = spec.columns.includes(c.name);
                  return <button key={c.name} type="button" title={c.type} onClick={() => setSpec((s) => ({ ...s, columns: sel ? s.columns.filter((x) => x !== c.name) : [...s.columns, c.name] }))} className={cn('cursor-pointer rounded-md border px-2 py-0.5 font-mono text-[11.5px] transition', sel ? 'border-ink-900 bg-ink-900 text-white' : 'border-steel-300 bg-white hover:border-ink-900')}>{c.name}</button>;
                })}
              </div>
            )}
            {fks.length > 0 && (
              <div className="mt-3 space-y-1.5">
                <p className="text-xs font-semibold text-steel-600">Muốn thấy luôn tên/mã thay vì chỉ số id? Kèm thông tin bảng liên quan:</p>
                {fks.map((c) => <RelationRow key={c.name} col={c} on={!!relOn[c.name]} cols={relCols[c.name] ?? []} setOn={(v) => setRelOn((r) => ({ ...r, [c.name]: v }))} setCols={(x) => setRelCols((r) => ({ ...r, [c.name]: x }))} />)}
              </div>
            )}
          </Step>

          <Step n={3} title="Chỉ lấy những dòng thỏa điều kiện nào?" hint="Bỏ trống nếu muốn lấy tất cả dòng">
            <div className="space-y-2">
              {spec.conds.length > 1 && (
                <div className="flex items-center gap-2 text-sm">Lấy dòng thỏa
                  <Select value={spec.mode} onChange={(e) => setSpec((s) => ({ ...s, mode: e.target.value as 'AND' | 'OR' }))} className="w-64" aria-label="Kiểu kết hợp điều kiện">
                    <option value="AND">TẤT CẢ các điều kiện (VÀ)</option>
                    <option value="OR">MỘT TRONG các điều kiện (HOẶC)</option>
                  </Select>
                </div>
              )}
              {spec.conds.map((c) => {
                const col = byName.get(c.column);
                const type = col?.type ?? 'String';
                const ops = opsFor(type);
                return (
                  <div key={c.id} className="flex flex-wrap items-center gap-2">
                    <Select value={c.column} onChange={(e) => { const nc = byName.get(e.target.value)!; setCond(c.id, { column: nc.name, op: opsFor(nc.type)[0], value: '' }); }} className="w-52 font-mono text-[12.5px]" aria-label="Cột">
                      {cols.map((x) => <option key={x.name} value={x.name} disabled={x.sensitive}>{x.name} ({x.type}){x.sensitive ? ' — bí mật' : ''}</option>)}
                    </Select>
                    <Select value={c.op} onChange={(e) => setCond(c.id, { op: e.target.value as Op })} className="w-60" aria-label="Phép so sánh">
                      {ops.map((o) => <option key={o} value={o}>{opLabel(o, type)}</option>)}
                    </Select>
                    {needsValueFor(c.op) && (isBool(type)
                      ? <Select value={c.value || 'true'} onChange={(e) => setCond(c.id, { value: e.target.value })} className="w-32" aria-label="Giá trị"><option value="true">Đúng</option><option value="false">Sai</option></Select>
                      : <Input value={c.value} onChange={(e) => setCond(c.id, { value: e.target.value })} placeholder={c.op === 'in' ? 'ISSUED, PAID' : type === 'DateTime' ? 'YYYY-MM-DD, ví dụ 2026-11-01' : type === 'String' || type === 'Enum' ? 'Giá trị cần tìm' : 'Số'} className="w-64" aria-label="Giá trị" />)}
                    <Button type="button" variant="ghost" size="sm" aria-label="Xóa điều kiện" onClick={() => setSpec((s) => ({ ...s, conds: s.conds.filter((x) => x.id !== c.id) }))}><Trash2 className="size-4" /></Button>
                  </div>
                );
              })}
              <Button type="button" variant="outline" size="sm" icon={<Plus className="size-4" />} onClick={addCond}>Thêm điều kiện</Button>
            </div>
          </Step>

          <Step n={4} title="Sắp xếp và số dòng">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              Sắp xếp theo
              <Select value={spec.sortBy} onChange={(e) => setSpec((s) => ({ ...s, sortBy: e.target.value }))} className="w-52 font-mono text-[12.5px]" aria-label="Sắp xếp theo">
                <option value="">— Không sắp xếp —</option>
                {cols.filter((c) => !c.sensitive).map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
              </Select>
              <Select value={spec.sortDir} onChange={(e) => setSpec((s) => ({ ...s, sortDir: e.target.value as 'ASC' | 'DESC' }))} className="w-44" aria-label="Chiều sắp xếp"><option value="DESC">Giảm dần (mới/lớn nhất trước)</option><option value="ASC">Tăng dần (cũ/nhỏ nhất trước)</option></Select>
              <span className="ml-2">Tối đa</span>
              <Input type="number" min={1} max={1000} value={spec.limit} onChange={(e) => setSpec((s) => ({ ...s, limit: Number(e.target.value) }))} className="w-24" aria-label="Số dòng tối đa" />
              <span>dòng</span>
            </div>
          </Step>

          <div className="space-y-2 rounded-xl border border-brass-500/30 bg-brass-100/30 p-3.5">
            <p className="text-sm text-ink-950"><b>Truy vấn này làm gì:</b> {sentence}</p>
            {built.errors.length > 0 && <Alert tone="warn" title="Cần chỉnh lại">{built.errors.map((e, i) => <span key={i} className="block">• {e}</span>)}</Alert>}
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="dark" icon={<Play className="size-4" />} loading={running} disabled={!canRun} onClick={() => onRun(built.sql)}>Chạy truy vấn</Button>
              <Button variant="outline" size="sm" onClick={() => setShowSql((v) => !v)}>{showSql ? 'Ẩn câu SQL' : 'Xem câu SQL tương ứng'}</Button>
            </div>
            {showSql && canRun && (
              <div className="space-y-2">
                <pre className="overflow-x-auto rounded-lg bg-ink-950 p-3 font-mono text-[12.5px] leading-relaxed text-steel-100">{built.sql}</pre>
                <div className="flex gap-2">
                  <Button variant="outline" size="xs" icon={<Copy className="size-3.5" />} onClick={copy}>Sao chép</Button>
                  <Button variant="outline" size="xs" icon={<Pencil className="size-3.5" />} onClick={() => onEdit(built.sql)}>Sửa bằng SQL</Button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
