import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Database as DbIcon, History, KeyRound, Link2, Lock, Play, Plus, Search, Table2, Trash2, TerminalSquare, X } from 'lucide-react';
import { useGet, useAct, useDebounced } from '@/lib/hooks';
import { post } from '@/lib/api';
import { Alert, Async, Badge, Button, Card, CardHead, EmptyState, Field, Input, Modal, Select, Tabs, Textarea, cn } from '@/ui';
import { fmtDateTime } from '@/lib/format';
import { QueryBuilder } from './QueryBuilder';

type Col = { name: string; type: string; enumType?: string; nullable: boolean; pk: boolean; hasDefault: boolean; sensitive: boolean; generated: boolean; fk?: { table: string; column: string } };
type TableInfo = { table: string; pk: string[]; readonly: boolean; columns: Col[]; rows: number };
/** cells are aligned with the table's column list (the API sends arrays: see serializeCells in db-console.ts) */
type RowT = { pk: Record<string, unknown>; cells: unknown[] };
type Change = { pk: Record<string, unknown>; cols: string[]; before?: unknown[]; after?: unknown[] };
type SqlRes = {
  kind: 'select' | 'update' | 'delete' | 'insert' | 'info';
  columns: string[];
  rows: unknown[][];
  rowCount: number;
  truncated?: boolean;
  affected?: number;
  table?: string;
  dryRun?: boolean;
  references?: { table: string; column: string; count: number }[];
  changes?: Change[];
  ms?: number;
};

const PAGE = 50;
const EXAMPLES = [
  { label: 'Danh sách bảng', sql: 'SHOW TABLES' },
  { label: 'Cấu trúc bảng', sql: 'DESCRIBE invoices' },
  { label: 'Hóa đơn theo trạng thái', sql: 'SELECT status, COUNT(*) AS so_luong, SUM(total) AS tong_tien\nFROM invoices\nGROUP BY status\nORDER BY so_luong DESC' },
  { label: 'Đơn kèm khách hàng', sql: 'SELECT r.code, r.status, r.start_date, c.code AS khach\nFROM reservations r\nJOIN customers c ON c.id = r.customer_id\nORDER BY r.id DESC\nLIMIT 20' },
  { label: 'Sửa dữ liệu (xem trước)', sql: "UPDATE promotions SET name = 'Khuyến mãi mới' WHERE id = 1" },
];

const ruled = 'rounded-2xl border border-steel-200/85 bg-white shadow-[var(--shadow-card)]';

function Cell({ v, col, onJump }: { v: unknown; col?: Col; onJump?: (table: string, value: string) => void }) {
  if (v === null || v === undefined) return <span className="italic text-steel-400">NULL</span>;
  if (typeof v === 'boolean') return <Badge tone={v ? 'info' : 'neutral'}>{v ? 'true' : 'false'}</Badge>;
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  if (col?.fk && onJump) {
    return (
      <button type="button" title={`Mở ${col.fk.table} ở dòng ${s}`} onClick={() => onJump(col.fk!.table, s)} className="inline-flex cursor-pointer items-center gap-1 font-mono text-[12px] text-info-600 underline-offset-2 hover:underline">
        <Link2 className="size-3" />
        {s}
      </button>
    );
  }
  return (
    <span title={s} className={cn('block max-w-[280px] truncate', col?.sensitive ? 'text-steel-400' : '', /^(BigInt|Int|Decimal|Float)$/.test(col?.type ?? '') ? 'font-mono text-[12.5px]' : '')}>
      {s}
    </span>
  );
}

function Grid({ columns, rows, sort, dir, onSort, onRow, onJump }: { columns: Col[]; rows: RowT[]; sort?: string; dir?: 'asc' | 'desc'; onSort?: (c: string) => void; onRow?: (r: RowT) => void; onJump?: (t: string, v: string) => void }) {
  return (
    <div className="overflow-auto rounded-b-2xl" style={{ maxHeight: '58vh' }}>
      <table className="w-full min-w-max border-collapse text-[13px]">
        <thead className="sticky top-0 z-10 bg-[#faf8f4] shadow-[0_1px_0_var(--color-steel-200)]">
          <tr>
            {columns.map((c) => (
              <th key={c.name} className="whitespace-nowrap px-3 py-2.5 text-left text-[11.5px] font-bold uppercase tracking-wide text-steel-600">
                <button type="button" onClick={() => onSort?.(c.name)} disabled={!onSort || c.sensitive} className="inline-flex cursor-pointer items-center gap-1 hover:text-ink-950 disabled:cursor-default">
                  {c.pk && <KeyRound className="size-3 text-brass-600" />}
                  {c.fk && !c.pk && <Link2 className="size-3 text-info-600" />}
                  {c.name}
                  {sort === c.name && (dir === 'desc' ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />)}
                </button>
                <div className="font-mono text-[10px] font-medium normal-case tracking-normal text-steel-400">{c.type}{c.nullable ? '?' : ''}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} onClick={() => onRow?.(r)} className={cn('border-t border-steel-100 transition-colors', onRow && 'cursor-pointer hover:bg-brass-100/40')}>
              {columns.map((c, ci) => (
                <td key={c.name} className="whitespace-nowrap px-3 py-2 align-top text-ink-900">
                  <Cell v={r.cells[ci]} col={c} onJump={onJump} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─────────────────────────────────────────── row editor ─────────────────────────────────────────── */

function RowEditor({ info, row, onClose, onDone }: { info: TableInfo; row: RowT | null; onClose: () => void; onDone: () => void }) {
  const isNew = row === null;
  // the full (untruncated) row is fetched once through a POST, so it is not cached like a GET
  const [initial, setInitial] = useState<Record<string, unknown> | null>(isNew ? {} : null);
  const [refs, setRefs] = useState<{ table: string; column: string; count: number }[]>([]);
  const [form, setForm] = useState<Record<string, string | null>>({});
  const [reason, setReason] = useState('');
  const [confirmDel, setConfirmDel] = useState(false);

  const load = useAct((r: RowT) => post<any>(`/admin/database/tables/${info.table}/row`, { pk: r.pk }), {
    silentError: false,
    onSuccess: (res) => {
      setInitial(Object.fromEntries(info.columns.map((c, i) => [c.name, res.cells[i]])));
      setRefs(res.references ?? []);
    },
  });
  useEffect(() => {
    if (row) load.mutate(row);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!initial) return;
    const f: Record<string, string | null> = {};
    for (const c of info.columns) {
      const v = initial[c.name];
      f[c.name] = v === null || v === undefined ? (isNew ? '' : null) : typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v);
    }
    setForm(f);
  }, [initial, info.columns, isNew]);

  const editable = (c: Col) => !c.sensitive && !c.generated && c.type !== 'Bytes' && (isNew || !c.pk);
  const changed = useMemo(() => {
    if (!initial) return {};
    const out: Record<string, unknown> = {};
    for (const c of info.columns) {
      if (!editable(c)) continue;
      const cur = form[c.name];
      const old = initial[c.name];
      const oldStr = old === null || old === undefined ? null : typeof old === 'object' ? JSON.stringify(old, null, 2) : String(old);
      if (isNew) {
        if (cur !== '' && cur !== null && cur !== undefined) out[c.name] = cur;
      } else if (cur !== oldStr) out[c.name] = cur;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, initial]);

  const save = useAct(
    () =>
      isNew
        ? post(`/admin/database/tables/${info.table}/insert`, { values: changed, reason })
        : post(`/admin/database/tables/${info.table}/update`, { pk: row!.pk, values: changed, reason }),
    { ok: isNew ? 'Đã thêm dòng' : 'Đã lưu thay đổi', invalidate: ['/admin/database'], onSuccess: () => { onDone(); onClose(); } },
  );
  const remove = useAct(() => post(`/admin/database/tables/${info.table}/delete`, { pk: row!.pk, reason }), {
    ok: 'Đã xóa dòng',
    invalidate: ['/admin/database'],
    onSuccess: () => { onDone(); onClose(); },
  });

  const n = Object.keys(changed).length;
  const reasonOk = reason.trim().length >= 3;
  const ro = info.readonly;
  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={isNew ? `Thêm dòng vào ${info.table}` : `Sửa dòng · ${info.table}`}
      description={isNew ? 'Để trống cột có giá trị mặc định (id tự tăng, ngày tạo...).' : `Khóa chính: ${JSON.stringify(row!.pk)}`}
      footer={
        <>
          {!isNew && !ro && (
            <Button variant="danger" className="mr-auto" icon={<Trash2 className="size-4" />} onClick={() => setConfirmDel((v) => !v)}>
              Xóa dòng
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>Đóng</Button>
          {!ro && (
            <Button variant="dark" loading={save.isPending} disabled={!n || !reasonOk} onClick={() => save.mutate(undefined)}>
              {isNew ? 'Thêm dòng' : `Lưu ${n || ''} thay đổi`}
            </Button>
          )}
        </>
      }
    >
      {ro && <Alert tone="warn" title="Bảng chỉ đọc">Nhật ký kiểm toán là bằng chứng chỉ ghi thêm, console không cho sửa hay xóa.</Alert>}
      {!initial ? (
        <p className="py-8 text-center text-sm text-steel-500">Đang tải dòng dữ liệu...</p>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {info.columns.map((c) => {
              const dis = ro || !editable(c);
              const val = form[c.name];
              const long = c.type === 'Json' || (typeof val === 'string' && (val.length > 80 || val.includes('\n')));
              const hint = c.sensitive ? 'Dữ liệu bí mật, không hiển thị và không sửa được' : c.generated ? 'Cơ sở dữ liệu tự tính' : c.pk && !isNew ? 'Khóa chính' : c.type === 'Bytes' ? 'Dữ liệu nhị phân' : undefined;
              return (
                <div key={c.name} className={cn('space-y-1.5', long && 'sm:col-span-2')}>
                  <label htmlFor={`col-${c.name}`} className="block text-[13px] font-semibold text-ink-900">
                    <span className="inline-flex items-center gap-1.5">
                      {c.name}
                      <span className="font-mono text-[10.5px] font-normal text-steel-400">{c.type}{c.enumType ? `·${c.enumType}` : ''}{c.nullable ? '' : ' · bắt buộc'}</span>
                    </span>
                  </label>
                  <div className="flex items-start gap-1.5">
                    {c.type === 'Boolean' ? (
                      <Select id={`col-${c.name}`} disabled={dis} value={val ?? ''} onChange={(e) => setForm((f) => ({ ...f, [c.name]: e.target.value === '' ? null : e.target.value }))}>
                        <option value="">NULL</option>
                        <option value="true">true</option>
                        <option value="false">false</option>
                      </Select>
                    ) : long ? (
                      <Textarea id={`col-${c.name}`} disabled={dis} rows={5} className="font-mono text-[12.5px]" value={val ?? ''} placeholder={val === null ? 'NULL' : ''} onChange={(e) => setForm((f) => ({ ...f, [c.name]: e.target.value }))} />
                    ) : (
                      <Input id={`col-${c.name}`} disabled={dis} value={val ?? ''} placeholder={val === null ? 'NULL' : c.hasDefault && isNew ? '(mặc định)' : ''} onChange={(e) => setForm((f) => ({ ...f, [c.name]: e.target.value }))} className={/^(BigInt|Int|Decimal|Float|DateTime)$/.test(c.type) ? 'font-mono text-[13px]' : ''} />
                    )}
                    {!dis && c.nullable && val !== null && (
                      <Button variant="ghost" size="sm" title="Đặt giá trị NULL" className="mt-1 shrink-0" onClick={() => setForm((f) => ({ ...f, [c.name]: null }))}>NULL</Button>
                    )}
                  </div>
                  {hint && <p className="text-xs text-steel-500">{hint}</p>}
                </div>
              );
            })}
          </div>
          {!ro && (
            <div className="space-y-3 border-t border-steel-200/80 pt-4">
              <Alert tone="warn" title="Sửa trực tiếp bỏ qua quy tắc nghiệp vụ">
                Hệ thống không kiểm tra luồng trạng thái hay giá. Mọi thay đổi được ghi vào nhật ký kiểm toán kèm giá trị trước và sau.
              </Alert>
              <Field label="Lý do thay đổi" required hint="Tối thiểu 3 ký tự, lưu vào nhật ký kiểm toán">
                <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ví dụ: sửa dữ liệu demo theo yêu cầu" />
              </Field>
              {confirmDel && (
                <Alert tone="bad" title="Xóa dòng này?" action={<Button variant="danger" size="sm" loading={remove.isPending} disabled={!reasonOk} onClick={() => remove.mutate(undefined)}>Xác nhận xóa</Button>}>
                  {refs.length ? (
                    <>
                      Còn dòng khác trỏ vào dòng này: {refs.map((r) => `${r.table}.${r.column} (${r.count})`).join(', ')}. Chúng sẽ bị mồ côi và hệ thống tự dọn khi khởi động lại.
                    </>
                  ) : (
                    'Không có dòng nào khác tham chiếu tới dòng này. Không thể hoàn tác.'
                  )}
                </Alert>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

/* ─────────────────────────────────────────── tables tab ─────────────────────────────────────────── */

function TablesTab({ overview, jump, setJump }: { overview: any; jump: { table: string; q: string } | null; setJump: (j: null) => void }) {
  const [table, setTable] = useState<string>(overview.tables.find((t: any) => t.table === 'reservations')?.table ?? overview.tables[0]?.table);
  const [filter, setFilter] = useState('');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<string | undefined>();
  const [dir, setDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<RowT | null | undefined>(undefined);
  const [showSchema, setShowSchema] = useState(false);

  useEffect(() => {
    if (jump) {
      setTable(jump.table);
      setQ(jump.q);
      setPage(0);
      setSort(undefined);
      setJump(null);
    }
  }, [jump, setJump]);

  const info = useGet<TableInfo>(table ? `/admin/database/tables/${table}` : null, undefined, { keepPrevious: true });
  const rows = useGet<{ total: number; rows: RowT[] }>(table ? `/admin/database/tables/${table}/rows` : null, { q: q || undefined, sort, dir, limit: PAGE, offset: page * PAGE }, { keepPrevious: true, staleTime: 3000 });
  const list = overview.tables.filter((t: any) => t.table.includes(filter.trim().toLowerCase()));
  const total = rows.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));

  const pick = (t: string) => {
    setTable(t);
    setQ('');
    setSort(undefined);
    setDir('asc');
    setPage(0);
    setShowSchema(false);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
      <div className={cn(ruled, 'flex max-h-[76vh] flex-col overflow-hidden')}>
        <div className="border-b border-steel-200/80 p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-steel-400" />
            <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={`Tìm trong ${overview.tables.length} bảng`} className="pl-9" />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {list.map((t: any) => (
            <button key={t.table} type="button" onClick={() => pick(t.table)} className={cn('flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition', t.table === table ? 'bg-ink-950 text-white' : 'text-ink-900 hover:bg-steel-100')}>
              <span className="flex min-w-0 items-center gap-2">
                {t.readonly ? <Lock className="size-3.5 shrink-0 opacity-70" /> : <Table2 className="size-3.5 shrink-0 opacity-70" />}
                <span className="truncate font-mono text-[12.5px]">{t.table}</span>
              </span>
              <span className={cn('shrink-0 text-[11px] tabular-nums', t.table === table ? 'text-brass-400' : 'text-steel-500')}>{t.rows}</span>
            </button>
          ))}
          {!list.length && <p className="p-4 text-center text-sm text-steel-500">Không có bảng phù hợp</p>}
        </div>
      </div>

      <Card>
        <CardHead
          title={<span className="font-mono">{table}</span>}
          sub={info.data ? `${total.toLocaleString('vi-VN')} dòng · ${info.data.columns.length} cột · khóa chính ${info.data.pk.join(', ')}` : 'Đang tải cấu trúc...'}
          action={
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowSchema((v) => !v)}>{showSchema ? 'Xem dữ liệu' : 'Cấu trúc bảng'}</Button>
              {info.data && !info.data.readonly && <Button variant="dark" size="sm" icon={<Plus className="size-4" />} onClick={() => setEditing(null)}>Thêm dòng</Button>}
            </div>
          }
        />
        {info.data?.readonly && <div className="border-b border-steel-200/80 px-5 py-2.5 text-[13px] text-steel-600"><Lock className="mr-1.5 inline size-3.5" />Bảng chỉ ghi thêm: chỉ xem, không sửa hay xóa.</div>}
        {showSchema && info.data ? (
          <div className="overflow-auto p-4">
            <table className="w-full text-[13px]">
              <thead><tr className="text-left text-[11.5px] uppercase tracking-wide text-steel-500"><th className="py-1.5 pr-4">Cột</th><th className="pr-4">Kiểu</th><th className="pr-4">Null</th><th>Ghi chú</th></tr></thead>
              <tbody>
                {info.data.columns.map((c) => (
                  <tr key={c.name} className="border-t border-steel-100">
                    <td className="py-1.5 pr-4 font-mono text-[12.5px]">{c.name}</td>
                    <td className="pr-4 font-mono text-[12px] text-steel-600">{c.type}{c.enumType ? ` (${c.enumType})` : ''}</td>
                    <td className="pr-4">{c.nullable ? 'có' : 'không'}</td>
                    <td className="space-x-1.5">
                      {c.pk && <Badge tone="brass">khóa chính</Badge>}
                      {c.fk && <button type="button" onClick={() => pick(c.fk!.table)} className="cursor-pointer"><Badge tone="info">→ {c.fk.table}.{c.fk.column}</Badge></button>}
                      {c.generated && <Badge tone="neutral">tự tính</Badge>}
                      {c.sensitive && <Badge tone="warn">bí mật</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 border-b border-steel-200/80 px-4 py-3">
              <div className="relative min-w-[220px] flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-steel-400" />
                <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Tìm trong mọi cột của bảng này" className="pl-9" />
              </div>
              <div className="flex items-center gap-1.5 text-[13px] text-steel-600">
                <Button variant="outline" size="xs" disabled={page === 0} onClick={() => setPage((p) => p - 1)} icon={<ChevronLeft className="size-3.5" />}>Trước</Button>
                <span className="tabular-nums">Trang {page + 1}/{pages}</span>
                <Button variant="outline" size="xs" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>Sau<ChevronRight className="size-3.5" /></Button>
              </div>
            </div>
            {info.data && rows.data ? (
              rows.data.rows.length ? (
                <Grid
                  columns={info.data.columns}
                  rows={rows.data.rows}
                  sort={sort ?? info.data.pk[0]}
                  dir={dir}
                  onSort={(c) => { if (c === (sort ?? info.data!.pk[0])) setDir((d) => (d === 'asc' ? 'desc' : 'asc')); else { setSort(c); setDir('asc'); } setPage(0); }}
                  onRow={(r) => setEditing(r)}
                  onJump={(t, v) => { setTable(t); setQ(v); setPage(0); setSort(undefined); setShowSchema(false); }}
                />
              ) : (
                <EmptyState title="Không có dòng nào" hint={q ? 'Thử từ khóa khác.' : 'Bảng đang trống.'} />
              )
            ) : (
              <p className="p-10 text-center text-sm text-steel-500">{rows.error ? rows.error.message : 'Đang tải dữ liệu...'}</p>
            )}
          </>
        )}
      </Card>

      {editing !== undefined && info.data && (
        <RowEditor key={editing ? JSON.stringify(editing.pk) : 'new'} info={info.data} row={editing} onClose={() => setEditing(undefined)} onDone={() => { rows.refetch(); info.refetch(); }} />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────── SQL tab ─────────────────────────────────────────── */

const HISTORY_KEY = 'vaultra.admin.sql.history';
const loadHistory = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]');
  } catch {
    return [];
  }
};

function ResultTable({ res }: { res: SqlRes }) {
  if (!res.columns.length || !res.rows.length) return <EmptyState title="Không có kết quả" hint="Câu lệnh chạy được nhưng không trả dòng nào." />;
  return (
    <div className="overflow-auto" style={{ maxHeight: '52vh' }}>
      <table className="w-full min-w-max border-collapse text-[13px]">
        <thead className="sticky top-0 bg-[#faf8f4] shadow-[0_1px_0_var(--color-steel-200)]">
          <tr>{res.columns.map((c) => <th key={c} className="whitespace-nowrap px-3 py-2 text-left font-mono text-[11.5px] font-bold text-steel-600">{c}</th>)}</tr>
        </thead>
        <tbody>
          {res.rows.map((r, i) => (
            <tr key={i} className="border-t border-steel-100">
              {res.columns.map((c, ci) => <td key={c} className="whitespace-nowrap px-3 py-1.5 align-top"><Cell v={r[ci]} /></td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChangeList({ changes, kind }: { changes: Change[]; kind: string }) {
  return (
    <div className="max-h-64 space-y-2 overflow-auto">
      {changes.map((c, i) => (
        <div key={i} className="rounded-lg border border-steel-200 bg-white p-2.5 font-mono text-[12px]">
          {Object.keys(c.pk).length > 0 && <div className="mb-1 text-steel-500">{Object.entries(c.pk).map(([k, v]) => `${k}=${String(v)}`).join(', ')}</div>}
          {c.cols.map((k, ki) => {
            const b = c.before?.[ki];
            const a = c.after?.[ki];
            const same = JSON.stringify(a) === JSON.stringify(b);
            return (
              <div key={k} className="flex flex-wrap gap-x-2">
                <span className="text-steel-500">{k}:</span>
                {kind === 'insert' ? <span>{String(a)}</span> : kind === 'delete' ? <span className="text-bad-600">{String(b)}</span> : same ? <span>{String(b)}</span> : (<><span className="text-bad-600 line-through">{String(b)}</span><span>→</span><span className="font-semibold text-ink-950">{String(a)}</span></>)}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function SqlTab() {
  const [sql, setSql] = useState(EXAMPLES[2].sql);
  const [res, setRes] = useState<SqlRes | null>(null);
  const [reason, setReason] = useState('');
  const [history, setHistory] = useState<string[]>(loadHistory);
  const ta = useRef<HTMLTextAreaElement>(null);
  // "builder" = pick table / conditions with the mouse (no SQL needed); "sql" = write the statement yourself
  const [mode, setMode] = useState<'builder' | 'sql'>('builder');
  const [autoRun, setAutoRun] = useState(false);

  const remember = (s: string) => {
    const h = [s, ...history.filter((x) => x !== s)].slice(0, 12);
    setHistory(h);
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(h)); } catch { /* storage full */ }
  };
  const run = useAct((execute: boolean) => post<SqlRes>('/admin/database/sql', { sql, execute, reason: execute ? reason : undefined }), {
    onSuccess: (r, execute) => {
      setRes(r);
      if (!(r.dryRun)) remember(sql);
      if (execute) { setReason(''); }
    },
    invalidate: ['/admin/database'],
    silentError: false,
  });
  // the builder hands over a finished statement: put it in the editor, then run it once the new text is in place
  useEffect(() => {
    if (autoRun) { setAutoRun(false); run.mutate(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRun]);
  const isWrite = res && (res.kind === 'update' || res.kind === 'delete' || res.kind === 'insert');

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
      <div className="space-y-4">
        <Card>
          <CardHead title={mode === 'builder' ? 'Tìm dữ liệu — không cần biết SQL' : 'Truy vấn SQL'} sub={mode === 'builder' ? 'Chọn bảng, cột và điều kiện bằng chuột. Chỉ để xem dữ liệu, không làm thay đổi gì.' : 'SELECT chạy ngay. INSERT, UPDATE, DELETE được xem trước rồi mới xác nhận.'} action={
            <div className="inline-flex rounded-lg border border-steel-300 bg-white p-0.5 text-xs font-semibold" role="tablist" aria-label="Cách tạo truy vấn">
              <button type="button" role="tab" aria-selected={mode === 'builder'} onClick={() => setMode('builder')} className={cn('cursor-pointer rounded-md px-3 py-1.5 transition', mode === 'builder' ? 'bg-ink-900 text-white' : 'text-ink-900 hover:bg-steel-100')}>Chọn để tìm</button>
              <button type="button" role="tab" aria-selected={mode === 'sql'} onClick={() => setMode('sql')} className={cn('cursor-pointer rounded-md px-3 py-1.5 transition', mode === 'sql' ? 'bg-ink-900 text-white' : 'text-ink-900 hover:bg-steel-100')}>Viết SQL</button>
            </div>
          } />
          {mode === 'builder' && <QueryBuilder running={run.isPending} onRun={(s) => { setSql(s); setRes(null); setAutoRun(true); }} onEdit={(s) => { setSql(s); setMode('sql'); }} />}
          <div className={cn('space-y-3 p-4', mode === 'builder' && 'hidden')}>
            <Textarea
              ref={ta}
              value={sql}
              onChange={(e) => { setSql(e.target.value); setRes((r) => (r?.dryRun ? null : r)); }}
              onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); run.mutate(false); } }}
              spellCheck={false}
              rows={7}
              className="font-mono text-[13px] leading-relaxed"
              placeholder="SELECT * FROM reservations LIMIT 10"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="dark" icon={<Play className="size-4" />} loading={run.isPending && !run.variables} onClick={() => run.mutate(false)} disabled={!sql.trim()}>Chạy</Button>
              <span className="text-[12.5px] text-steel-500">Cột trùng từ khóa (như total) được tự thêm [ ]. Chuỗi dùng dấu nháy đơn.</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLES.map((e) => <button key={e.label} type="button" onClick={() => { setSql(e.sql); setRes(null); ta.current?.focus(); }} className="cursor-pointer rounded-full border border-steel-300 bg-white px-3 py-1 text-xs font-semibold text-ink-900 transition hover:border-ink-900">{e.label}</button>)}
            </div>
          </div>
        </Card>

        {res && (
          <Card>
            <CardHead
              title={isWrite ? (res.dryRun ? 'Xem trước thay đổi' : 'Đã thực thi') : 'Kết quả'}
              sub={isWrite ? `${res.kind.toUpperCase()} ${res.table} · ${res.affected} dòng${res.dryRun ? ' sẽ bị ảnh hưởng' : ' đã bị ảnh hưởng'}` : `${res.rowCount.toLocaleString('vi-VN')} dòng${res.truncated ? ' (chỉ hiện 1.000 dòng đầu)' : ''} · ${res.ms ?? 0} ms`}
            />
            {isWrite ? (
              <div className="space-y-3 p-4">
                {res.dryRun && res.references && res.references.length > 0 && (
                  <Alert tone="warn" title="Có dữ liệu liên quan">
                    Các dòng này đang được tham chiếu: {res.references.map((r) => `${r.table}.${r.column} (${r.count})`).join(', ')}. Xóa sẽ để lại dòng mồ côi.
                  </Alert>
                )}
                {res.changes && res.changes.length > 0 && <ChangeList changes={res.changes} kind={res.kind} />}
                {(res.affected ?? 0) > (res.changes?.length ?? 0) && <p className="text-xs text-steel-500">Chỉ hiện {res.changes?.length} dòng đầu trong tổng {res.affected} dòng.</p>}
                {res.dryRun ? (
                  (res.affected ?? 0) > 0 ? (
                    <div className="space-y-3 border-t border-steel-200/80 pt-3">
                      <Alert tone="warn" title="Thay đổi dữ liệu thật">Thực thi sẽ ghi vào cơ sở dữ liệu đang chạy và đồng bộ lên R2. Nhật ký kiểm toán ghi lại câu lệnh này.</Alert>
                      <Field label="Lý do" required><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ví dụ: chỉnh dữ liệu demo" /></Field>
                      <Button variant={res.kind === 'delete' ? 'danger' : 'dark'} loading={run.isPending && run.variables === true} disabled={reason.trim().length < 3} onClick={() => run.mutate(true)}>Xác nhận thực thi {res.affected} dòng</Button>
                    </div>
                  ) : (
                    <Alert tone="info">Không có dòng nào khớp điều kiện, không có gì để thực thi.</Alert>
                  )
                ) : (
                  <Alert tone="brass" title="Hoàn tất">Đã ghi vào nhật ký kiểm toán. Chạy lại SELECT để kiểm tra kết quả.</Alert>
                )}
              </div>
            ) : (
              <ResultTable res={res} />
            )}
          </Card>
        )}
      </div>

      <Card className="h-fit">
        <CardHead title="Lịch sử" sub="Lưu trên trình duyệt này" />
        <div className="max-h-[60vh] space-y-1.5 overflow-auto p-3">
          {history.length === 0 && <p className="p-3 text-center text-[13px] text-steel-500">Chưa có câu lệnh nào</p>}
          {history.map((h) => (
            <button key={h} type="button" onClick={() => { setSql(h); setRes(null); }} className="block w-full cursor-pointer truncate rounded-lg border border-steel-200 bg-white px-2.5 py-1.5 text-left font-mono text-[11.5px] text-ink-900 transition hover:border-ink-900" title={h}>
              <History className="mr-1.5 inline size-3 text-steel-400" />
              {h.replace(/\s+/g, ' ')}
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}

/* ─────────────────────────────────────────── page ─────────────────────────────────────────── */

type SearchRes = {
  q: string; scannedTables: number; scannedRows: number; ms: number; tableNames: string[]; columnNames: { table: string; column: string }[];
  tables: { table: string; rows: number; total: number; columns: string[]; samples: { pk: Record<string, unknown>; hits: { column: string; snippet: string }[] }[] }[];
};

/** `text` with every occurrence of `q` (case-insensitive) marked. */
function Mark({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  const parts: React.ReactNode[] = [];
  const lower = text.toLowerCase();
  const needle = q.toLowerCase();
  let at = 0;
  for (let i = lower.indexOf(needle); i >= 0; i = lower.indexOf(needle, at)) {
    if (i > at) parts.push(text.slice(at, i));
    parts.push(<mark key={i} className="rounded bg-brass-400/45 px-0.5 text-ink-950">{text.slice(i, i + needle.length)}</mark>);
    at = i + needle.length;
  }
  parts.push(text.slice(at));
  return <>{parts}</>;
}

/** One box that looks in every table: values, table names and column names. Choosing a result opens that table filtered by the same text. */
function GlobalSearch({ onOpen }: { onOpen: (table: string, q: string) => void }) {
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const term = useDebounced(text.trim(), 350);
  const active = term.length >= 2;
  const res = useGet<SearchRes>(active ? '/admin/database/search' : null, { q: term }, { keepPrevious: true, staleTime: 5000 });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key === '/' && !(t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) && !t?.isContentEditable) { e.preventDefault(); inputRef.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const open = (table: string, q: string) => { setText(''); onOpen(table, q); };
  const d = res.data && res.data.q.toLowerCase() === term.toLowerCase() ? res.data : null;
  const show = text.trim().length >= 2;
  return (
    <div className={cn(ruled, 'p-3')}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-steel-400" />
        <Input ref={inputRef} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') setText(''); }} placeholder="Tìm trong toàn bộ cơ sở dữ liệu: mã hợp đồng, tên khách, email, số tiền, tên bảng, tên cột…  (nhấn / để nhập nhanh)" aria-label="Tìm trong toàn bộ cơ sở dữ liệu" className="h-11 pl-10 pr-10" />
        {text && <button type="button" aria-label="Xóa tìm kiếm" onClick={() => setText('')} className="absolute right-2.5 top-1/2 grid size-7 -translate-y-1/2 cursor-pointer place-items-center rounded-md text-steel-500 hover:bg-steel-100"><X className="size-4" /></button>}
      </div>
      {show && (
        <div className="mt-3 max-h-[62vh] space-y-3 overflow-y-auto pr-1">
          {!d && (res.isLoading || res.isFetching || text.trim() !== term) && <p className="px-1 py-2 text-sm text-steel-500">Đang tìm…</p>}
          {res.error && <Alert tone="bad" title="Không tìm được">{res.error.message}</Alert>}
          {d && (
            <>
              <p className="px-1 text-xs text-steel-500">
                {d.tables.length ? <><b className="text-ink-950">{d.tables.reduce((n, t) => n + t.total, 0).toLocaleString('vi-VN')}</b> dòng khớp trong <b className="text-ink-950">{d.tables.length}</b> bảng</> : 'Không có dòng dữ liệu nào khớp'} · đã quét {d.scannedRows.toLocaleString('vi-VN')} dòng của {d.scannedTables} bảng trong {d.ms} ms. Cột bí mật (mật khẩu, token…) không được tìm.
              </p>
              {(d.tableNames.length > 0 || d.columnNames.length > 0) && (
                <div className="flex flex-wrap items-center gap-1.5 rounded-xl border hairline bg-paper px-3 py-2 text-xs">
                  <span className="font-semibold text-steel-600">Tên khớp:</span>
                  {d.tableNames.map((t) => <button key={t} type="button" onClick={() => open(t, '')} className="cursor-pointer rounded-md border border-steel-300 bg-white px-2 py-0.5 font-mono hover:border-ink-900"><Table2 className="mr-1 inline size-3" /><Mark text={t} q={d.q} /></button>)}
                  {d.columnNames.map((c) => <button key={c.table + c.column} type="button" onClick={() => open(c.table, '')} className="cursor-pointer rounded-md border border-steel-300 bg-white px-2 py-0.5 font-mono hover:border-ink-900">{c.table}.<Mark text={c.column} q={d.q} /></button>)}
                </div>
              )}
              {d.tables.map((t) => (
                <div key={t.table} className="overflow-hidden rounded-xl border hairline">
                  <div className="flex flex-wrap items-center justify-between gap-2 bg-paper px-3 py-2">
                    <span className="flex flex-wrap items-center gap-2"><b className="font-mono text-[13px]">{t.table}</b><Badge tone="info">{t.total.toLocaleString('vi-VN')} / {t.rows.toLocaleString('vi-VN')} dòng</Badge><span className="text-xs text-steel-500">cột: {t.columns.join(', ')}</span></span>
                    <Button size="xs" variant="outline" onClick={() => open(t.table, d.q)}>Xem {t.total > 1 ? `${t.total} dòng` : 'dòng này'}</Button>
                  </div>
                  <ul className="divide-y hairline">
                    {t.samples.map((sm, i) => (
                      <li key={i}>
                        <button type="button" onClick={() => open(t.table, d.q)} className="block w-full cursor-pointer px-3 py-2 text-left text-[13px] hover:bg-brass-100/25">
                          <span className="mr-2 font-mono text-[11.5px] text-steel-500">{Object.entries(sm.pk).map(([k, v]) => `${k}=${String(v)}`).join(', ')}</span>
                          {sm.hits.map((h) => <span key={h.column} className="mr-3 inline-block"><span className="font-mono text-[11.5px] text-steel-500">{h.column}: </span><Mark text={h.snippet} q={d.q} /></span>)}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function DatabasePage() {
  const [tab, setTab] = useState('tables');
  const [jump, setJump] = useState<{ table: string; q: string } | null>(null);
  const q = useGet<any>('/admin/database/overview');
  return (
    <div className="space-y-5">
      <div className="grain blueprint-dark relative overflow-hidden rounded-2xl border border-ink-800 bg-ink-950 p-5 text-white shadow-[var(--shadow-card)] sm:p-6">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brass-600 via-brass-400 to-brass-600" />
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-brass-400/35 bg-brass-500/15 text-brass-400"><DbIcon className="size-5" /></span>
            <div>
              <h1 className="display text-2xl text-white sm:text-3xl">Cơ sở dữ liệu</h1>
              <p className="mt-1 max-w-2xl text-sm text-steel-300">Xem cấu trúc, duyệt và sửa từng dòng, chạy truy vấn SQL trên dữ liệu đang vận hành.</p>
            </div>
          </div>
          {q.data && (
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
              <span className="rounded-full border border-brass-400/40 bg-brass-500/15 px-3 py-1.5 text-brass-400">{q.data.tables.length} bảng · {q.data.tables.reduce((s: number, t: any) => s + t.rows, 0).toLocaleString('vi-VN')} dòng</span>
              <span className="rounded-full border border-white/20 px-3 py-1.5 text-steel-200">Lược đồ {q.data.schema}</span>
              <span className="rounded-full border border-white/20 px-3 py-1.5 text-steel-200">{q.data.lastSyncedAt ? `Đồng bộ R2 lúc ${fmtDateTime(q.data.lastSyncedAt)}` : 'Chưa đồng bộ R2'}</span>
            </div>
          )}
        </div>
      </div>

      <GlobalSearch onOpen={(table, q) => { setTab('tables'); setJump({ table, q }); }} />

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'tables', label: <span className="inline-flex items-center gap-1.5"><Table2 className="size-3.5" />Bảng dữ liệu</span> },
          { value: 'sql', label: <span className="inline-flex items-center gap-1.5"><TerminalSquare className="size-3.5" />Truy vấn SQL</span> },
        ]}
      />

      <Async q={q}>
        {(overview) =>
          tab === 'tables' ? (
            <TablesTab overview={overview} jump={jump} setJump={setJump} />
          ) : (
            <SqlTab />
          )
        }
      </Async>
    </div>
  );
}
