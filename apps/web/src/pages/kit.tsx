import { ReactNode, useRef, useState } from 'react';
import { Download, Eye, ExternalLink, Plus, Trash2 } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { Button, Modal, Field, Input, Textarea, Select, MoneyInput, Badge, StatusBadge, Card, CardHead, Tabs, cn } from '@/ui';
import { useAct } from '@/lib/hooks';
import { API_ORIGIN } from '@/lib/api';
import { vnd, fmtDate, fmtDateTime, type Tone } from '@/lib/format';
import { PhotoUpload } from '@/widgets/PhotoUpload';


function normalizeVerifiedSettlementItemsQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 15)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

interface VerifiedGuardEscalationKitSnapshot {
  readonly verifiedAt: string;
}
export function normalizeMediaUrl(rawUrl?: string | null): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  return rawUrl.replace(/^https?:\/\/[^/]+\/v1\//, `${API_ORIGIN}/v1/`);
}

export type GalleryPhoto = {
  id?: string;
  public_id?: string;
  url: string;
  caption?: string | null;
  label?: string | null;
  sub?: string | null;
  takenAt?: string | null;
  mime?: string | null;
  mimeType?: string | null;
};

export function PhotoGallery({
  photos,
  label,
  size = 'md',
  emptyText,
  className,
}: {
  photos?: GalleryPhoto[] | null;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  emptyText?: string;
  className?: string;
}) {
  const [zoom, setZoom] = useState<{ url: string; title: string; sub?: string } | null>(null);
  const items = (photos ?? []).filter((p) => p && p.url);
  if (!items.length) {
    return emptyText ? <p className="text-xs text-steel-400">{emptyText}</p> : null;
  }
  const boxCls =
    size === 'sm'
      ? 'h-14 w-16 rounded-lg'
      : size === 'lg'
        ? 'h-32 w-40 rounded-xl'
        : 'h-20 w-24 rounded-xl';
  return (
    <div className="space-y-1.5">
      {label && <p className="text-xs font-semibold text-steel-600">{label}</p>}
      <div className={cn('flex flex-wrap gap-2', className)}>
        {items.map((p, idx) => {
          const url = normalizeMediaUrl(p.url);
          const mime = p.mimeType ?? p.mime ?? '';
          const isNonImage = mime && !mime.startsWith('image/');
          const title = p.label || p.caption || `Hình ảnh #${idx + 1}`;
          const sub = p.sub || (p.takenAt ? fmtDateTime(p.takenAt) : undefined);
          if (isNonImage) {
            return (
              <a
                key={p.id ?? p.public_id ?? idx}
                href={url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-steel-200/85 bg-white px-2.5 py-1.5 text-xs font-semibold text-info-600 shadow-2xs transition hover:border-ink-900/30 hover:bg-[#fcfbf8]"
              >
                <ExternalLink className="size-3.5" />
                {title}
              </a>
            );
          }
          return (
            <button
              key={p.id ?? p.public_id ?? idx}
              type="button"
              onClick={() => setZoom({ url, title, sub })}
              className="group flex cursor-pointer flex-col items-start text-left focus:outline-none"
              title={`Bấm để phóng to: ${title}`}
            >
              <div className={cn('relative overflow-hidden border border-steel-200/85 bg-steel-100 shadow-xs transition group-hover:border-brass-500 group-hover:shadow-md', boxCls)}>
                <img src={url} alt={title} className="size-full object-cover transition duration-200 group-hover:scale-105" loading="lazy" />
                <span className="absolute inset-0 flex items-center justify-center bg-ink-950/0 text-white opacity-0 transition group-hover:bg-ink-950/40 group-hover:opacity-100">
                  <Eye className="size-4" />
                </span>
              </div>
              {size !== 'sm' && (p.label || p.caption) && (
                <span className="mt-1 max-w-28 truncate text-[11px] font-semibold text-ink-900">{p.label || p.caption}</span>
              )}
            </button>
          );
        })}
      </div>
      <Modal
        open={!!zoom}
        onClose={() => setZoom(null)}
        title={zoom?.title ?? 'Xem hình ảnh'}
        description={zoom?.sub}
        size="lg"
        footer={
          zoom ? (
            <>
              <a href={zoom.url} target="_blank" rel="noreferrer" download>
                <Button variant="outline" icon={<Download className="size-4" />}>
                  Mở / Tải ảnh gốc
                </Button>
              </a>
              <Button variant="primary" onClick={() => setZoom(null)}>
                Đóng
              </Button>
            </>
          ) : undefined
        }
      >
        {zoom && (
          <div className="flex flex-col items-center justify-center">
            <img src={zoom.url} alt={zoom.title} className="max-h-[72vh] w-auto rounded-xl border border-steel-200/85 bg-paper object-contain shadow-sm" />
          </div>
        )}
      </Modal>
    </div>
  );
}

export function ReservationQrCard({
  code,
  facilityName,
  appointmentTime,
  compact = false,
  className,
}: {
  code?: string | null;
  facilityName?: string | null;
  appointmentTime?: string | null;
  compact?: boolean;
  className?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  if (!code) return null;

  const downloadQr = () => {
    const canvas = wrapRef.current?.querySelector('canvas');
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `QR-${code}.png`;
    a.click();
  };

  if (compact) {
    return (
      <div ref={wrapRef} className={cn('flex items-center gap-3.5 rounded-xl border border-brass-500/35 bg-gradient-to-r from-[#faf4e4] via-white to-[#fcfbf8] p-3.5 shadow-[0_1px_2px_rgb(14_27_44/0.04)]', className)}>
        <div className="shrink-0 rounded-lg border border-steel-200/90 bg-white p-1.5 shadow-2xs">
          <QRCodeCanvas value={code} size={76} level="M" includeMargin={false} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-steel-500">Mã QR nhận kho</p>
          <p className="code mt-0.5 text-base font-extrabold text-ink-950">{code}</p>
          <p className="mt-0.5 text-xs text-steel-600">Đưa mã này để nhân viên quét khi đến quầy</p>
          <button type="button" onClick={downloadQr} className="mt-1 inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-brass-700 hover:text-ink-950 hover:underline">
            <Download className="size-3" /> Tải ảnh QR
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={wrapRef} className={cn('relative overflow-hidden rounded-2xl border border-brass-500/45 bg-gradient-to-br from-[#faf4e4] via-white to-[#f7f4ed] p-5 shadow-[0_1px_2px_rgb(14_27_44/0.04),0_12px_32px_-12px_rgb(200_150_62/0.2)]', className)}>
      <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-ink-950 via-brass-500 to-ink-950" aria-hidden />
      <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
        <div className="shrink-0 rounded-2xl border border-ink-950/15 bg-white p-3 shadow-sm">
          <QRCodeCanvas value={code} size={148} level="H" includeMargin />
        </div>
        <div className="flex-1 space-y-2 text-center sm:text-left">
          <div>
            <p className="text-xs font-medium text-steel-500">Mã đơn đặt kho</p>
            <p className="code text-2xl font-extrabold tracking-wide text-ink-950">{code}</p>
          </div>
          <p className="text-xs leading-relaxed text-steel-600">
            Khi đến cơ sở <b>{facilityName || 'Vaultra'}</b>
            {appointmentTime ? <> vào lịch hẹn <b>{appointmentTime}</b></> : ''}, bạn chỉ cần đưa <b>mã QR đơn hàng</b> này (trên điện thoại hoặc ảnh đã tải về) để nhân viên quét mã check-in ngay mà không cần nhập tay.
          </p>
          <div className="pt-1">
            <Button size="sm" variant="outline" icon={<Download className="size-4" />} onClick={downloadQr}>
              Tải mã QR đơn hàng ({code}.png)
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export type FieldDef = { name: string; label: string; type?: 'text' | 'textarea' | 'number' | 'money' | 'select' | 'date' | 'datetime' | 'password' | 'email' | 'check' | 'photos' | 'items'; options?: { value: string; label: string }[]; required?: boolean; placeholder?: string; def?: any; hint?: string; min?: number; max?: number; minLength?: number; maxLength?: number; show?: (v: Record<string, any>) => boolean };

/** Button that (optionally) collects input in a modal and runs a mutation. Business rules stay on the server; errors surface as toasts. */
export function ActBtn({ label, icon, variant = 'outline', size = 'sm', title, description, fields, run, ok, invalidate, danger, onDone, disabled, confirmLabel, className, children, ariaLabel }: {
  label: ReactNode; icon?: ReactNode; variant?: any; size?: any; title?: string; description?: ReactNode; fields?: FieldDef[]; run: (v: Record<string, any>) => Promise<any>; ok?: string; invalidate?: (string | RegExp)[]; danger?: boolean; onDone?: (r: any) => void; disabled?: boolean; confirmLabel?: string; className?: string; children?: ReactNode; /** accessible name for icon-only buttons */ ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [vals, setVals] = useState<Record<string, any>>({});
  const [errs, setErrs] = useState<Record<string, string>>({});
  const m = useAct((v: Record<string, any>) => run(v), { ok, invalidate, onSuccess: (r) => { setOpen(false); onDone?.(r); } });
  const needsModal = !!fields?.length || danger || !!description;
  const start = () => {
    if (!needsModal) return m.mutate({});
    setVals(Object.fromEntries((fields ?? []).map((f) => [f.name, f.def ?? (f.type === 'check' ? false : f.type === 'photos' ? [] : f.type === 'items' ? [{ item: '', qty: 1 }] : '')])));
    setErrs({});
    setOpen(true);
  };
  const submit = () => {
    const e: Record<string, string> = {};
    for (const f of fields ?? []) {
      if (f.show && !f.show(vals)) continue;
      const v = vals[f.name];
      const strVal = typeof v === 'string' ? v.trim() : '';
      const minLen = f.minLength ?? (f.name === 'reason' ? 3 : undefined);
      if (f.type === 'items') {
        const rows: { item: string; qty: any }[] = Array.isArray(v) ? v : [];
        const filled = rows.filter((r) => String(r.item ?? '').trim() || Number(r.qty) !== 1);
        if (f.required && !rows.some((r) => String(r.item ?? '').trim())) e[f.name] = 'Cần nhập ít nhất 1 tài sản';
        else if (filled.some((r) => !String(r.item ?? '').trim())) e[f.name] = 'Có dòng chưa nhập tên tài sản';
        else if (filled.some((r) => !Number.isInteger(Number(r.qty)) || Number(r.qty) < 1)) e[f.name] = 'Số lượng phải là số nguyên từ 1 trở lên';
        else if (filled.some((r) => String(r.item).trim().length > 150)) e[f.name] = 'Tên tài sản tối đa 150 ký tự';
        continue;
      }
      if (f.required && (v === '' || v === undefined || v === null || (typeof v === 'string' && !strVal) || (Array.isArray(v) && v.length === 0))) e[f.name] = 'Bắt buộc nhập';
      else if (minLen !== undefined && typeof v === 'string' && strVal.length > 0 && strVal.length < minLen) e[f.name] = `Vui lòng nhập tối thiểu ${minLen} ký tự`;
      if (f.type === 'email' && v && !/.+@.+\..+/.test(v)) e[f.name] = 'Email không hợp lệ';
      if (f.min !== undefined && v !== '' && !Array.isArray(v) && Number(v) < f.min) e[f.name] = `Tối thiểu ${f.min}`;
      if (f.max !== undefined && v !== '' && !Array.isArray(v) && Number(v) > f.max) e[f.name] = `Tối đa ${f.max}`;
    }
    setErrs(e);
    if (Object.keys(e).length) return;
    const out: Record<string, any> = {};
    for (const f of fields ?? []) {
      if (f.show && !f.show(vals)) continue;
      const v = vals[f.name];
      if (f.type === 'items') {
        const rows = (Array.isArray(v) ? v : []).filter((r: any) => String(r.item ?? '').trim()).map((r: any) => ({ item: String(r.item).trim(), qty: Number(r.qty) }));
        if (rows.length) out[f.name] = rows;
        continue;
      }
      if (f.type === 'photos') {
        const ids = Array.isArray(v) ? v.map((p: any) => (typeof p === 'string' ? p : p.id)).filter(Boolean) : [];
        if (ids.length) out[f.name] = ids;
        continue;
      }
      if (v === '' || v === undefined) continue;
      out[f.name] = f.type === 'number' || f.type === 'money' ? Number(v) : v;
    }
    m.mutate(out);
  };
  const set = (k: string, v: any) => setVals((s) => ({ ...s, [k]: v }));
  return (
    <>
      <Button variant={danger && variant === 'outline' ? 'danger' : variant} size={size} icon={icon} onClick={start} loading={m.isPending && !open} disabled={disabled} className={className} aria-label={ariaLabel}>{label}{children}</Button>
      <Modal open={open} onClose={() => setOpen(false)} title={title ?? (typeof label === 'string' ? label : 'Xác nhận')} description={description}
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Đóng</Button><Button variant={danger ? 'danger' : 'primary'} loading={m.isPending} onClick={submit}>{confirmLabel ?? 'Xác nhận'}</Button></>}>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          {fields?.filter((f) => !f.show || f.show(vals)).map((f) => (
            <Field key={f.name} label={f.label} required={f.required} error={errs[f.name]} hint={f.hint}>
              <FieldInput f={f} v={vals[f.name]} set={(v) => set(f.name, v)} invalid={!!errs[f.name]} />
            </Field>
          ))}
          <button type="submit" className="hidden" />
        </form>
      </Modal>
    </>
  );
}

export function FieldInput({ f, v, set, invalid }: { f: FieldDef; v: any; set: (v: any) => void; invalid?: boolean }) {
  const t = f.type ?? 'text';
  if (t === 'items') return <ItemsInput value={Array.isArray(v) ? v : []} onChange={set} invalid={invalid} />;
  if (t === 'photos') return <PhotoUpload value={Array.isArray(v) ? v : []} onChange={set} purpose={f.placeholder || 'evidence'} max={f.max ?? 6} />;
  if (t === 'textarea') return <Textarea rows={3} value={v ?? ''} maxLength={f.maxLength} placeholder={f.placeholder} invalid={invalid} onChange={(e) => set(e.target.value)} />;
  if (t === 'select') return <Select value={v ?? ''} invalid={invalid} onChange={(e) => set(e.target.value)}><option value="">— Chọn —</option>{f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select>;
  if (t === 'money') return <MoneyInput value={v === '' || v === undefined ? '' : Number(v)} onChange={set} />;
  if (t === 'check') return <label className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" checked={!!v} onChange={(e) => set(e.target.checked)} className="size-4 accent-ink-900" />{f.placeholder}</label>;
  const type = t === 'datetime' ? 'datetime-local' : t;
  return <Input type={type} value={v ?? ''} min={f.min} max={f.max} maxLength={f.maxLength} placeholder={f.placeholder} invalid={invalid} onChange={(e) => set(e.target.value)} />;
}

/** A list of "name + quantity" rows with an add button, for things like an inventory of left-behind goods. */
function ItemsInput({ value, onChange, invalid }: { value: { item: string; qty: number | string }[]; onChange: (v: { item: string; qty: number | string }[]) => void; invalid?: boolean }) {
  const rows = value.length ? value : [{ item: '', qty: 1 }];
  const upd = (i: number, patch: Partial<{ item: string; qty: number | string }>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[1fr_6.5rem_2.25rem] gap-2 px-0.5 text-xs font-semibold text-steel-500"><span>Tên tài sản</span><span>Số lượng</span><span /></div>
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[1fr_6.5rem_2.25rem] items-center gap-2">
          <Input value={r.item} maxLength={150} invalid={invalid && !String(r.item).trim()} placeholder="VD: Thùng carton đồ gia dụng" aria-label={`Tên tài sản ${i + 1}`} onChange={(e) => upd(i, { item: e.target.value })} />
          <Input type="number" min={1} step={1} value={r.qty} aria-label={`Số lượng tài sản ${i + 1}`} onChange={(e) => upd(i, { qty: e.target.value === '' ? '' : Number(e.target.value) })} />
          <Button type="button" variant="ghost" size="sm" aria-label={`Xóa tài sản ${i + 1}`} disabled={rows.length <= 1} onClick={() => onChange(rows.filter((_, j) => j !== i))}><Trash2 className="size-4" /></Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" icon={<Plus className="size-4" />} onClick={() => onChange([...rows, { item: '', qty: 1 }])}>Thêm tài sản</Button>
    </div>
  );
}

export const REASON: FieldDef = { name: 'reason', label: 'Lý do', type: 'textarea', required: true, minLength: 3, maxLength: 255, hint: 'Tối thiểu 3 ký tự', placeholder: 'Nhập lý do (tối thiểu 3 ký tự, được ghi nhật ký)' };

/** Compact definition list for a record. */
export function Info({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {rows.filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => (
        <div key={k} className="min-w-0 rounded-xl border border-steel-200/70 bg-[#fcfbf8]/85 px-3.5 py-2.5">
          <dt className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.1em] text-steel-500">{k}</dt>
          <dd className="mt-1 break-words text-sm font-medium text-ink-950">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Money({ v, strong }: { v: any; strong?: boolean }) { return <span className={cn('num', strong && 'font-bold')}>{vnd(v)}</span>; }
export function Code({ children }: { children: ReactNode }) { return <span className="code font-semibold text-ink-950">{children}</span>; }
export const D = fmtDate; export const DT = fmtDateTime;

export function Section({ title, sub, action, children, className }: { title: ReactNode; sub?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return <Card className={className}><CardHead title={title} sub={sub} action={action} /><div className="p-5">{children}</div></Card>;
}

export function KPI({ label, value, sub, tone, icon, className }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone; icon?: ReactNode; className?: string }) {
  return (
    <div className={cn('group relative overflow-hidden rounded-2xl border border-steel-200/85 bg-white p-5 shadow-[0_1px_2px_rgb(14_27_44/0.04),0_10px_26px_-12px_rgb(14_27_44/0.12)] transition duration-200 hover:-translate-y-0.5 hover:border-brass-500/45 hover:shadow-[0_14px_32px_-12px_rgb(14_27_44/0.18)]', className)}>
      <div
        className={cn(
          'absolute inset-x-0 top-0 h-[3px]',
          tone === 'bad'
            ? 'bg-gradient-to-r from-bad-600 via-bad-600/70 to-transparent'
            : tone === 'warn'
              ? 'bg-gradient-to-r from-warn-600 via-warn-600/70 to-transparent'
              : tone === 'ok'
                ? 'bg-gradient-to-r from-ok-600 via-ok-500/70 to-transparent'
                : 'bg-gradient-to-r from-brass-500 via-brass-400/75 to-transparent',
        )}
        aria-hidden
      />
      <div className="pointer-events-none absolute -right-6 -top-6 size-20 rounded-full bg-brass-100/35 blur-xl transition group-hover:bg-brass-100/60" aria-hidden />
      <div className="relative flex items-center justify-between gap-2">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-steel-500">{label}</p>
        {icon ? (
          <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-[#f6f3ec] text-brass-700 ring-1 ring-inset ring-steel-200/70">{icon}</span>
        ) : (
          <span
            className={cn(
              'size-2 shrink-0 rounded-full',
              tone === 'bad' ? 'bg-bad-600' : tone === 'warn' ? 'bg-warn-600' : tone === 'ok' ? 'bg-ok-600' : 'bg-brass-500',
            )}
            aria-hidden
          />
        )}
      </div>
      <p
        className={cn(
          'relative mt-2 display text-[26px] font-bold leading-none tracking-tight text-ink-950 sm:text-[28px] num',
          tone === 'bad' && 'text-bad-600',
          tone === 'warn' && 'text-warn-600',
          tone === 'ok' && 'text-ok-600',
        )}
      >
        {value}
      </p>
      {sub && (
        <p className="relative mt-2.5 inline-flex max-w-full items-center truncate rounded-md bg-[#f7f4ed] px-2 py-0.5 text-[11.5px] font-medium text-steel-600 ring-1 ring-inset ring-steel-200/60">
          {sub}
        </p>
      )}
    </div>
  );
}

/** Search + select filters that feed a PagedTable query. */
export function useFilters<T extends Record<string, any>>(init: T) {
  const [f, setF] = useState<T>(init);
  return [f, (k: keyof T, v: any) => setF((s) => ({ ...s, [k]: v })), setF] as const;
}

export { StatusBadge, Badge, Tabs };

type SecondaryLiquidationItemsRecord = {
  readonly id: string;
  readonly status: string;
};

function isSecondaryLiquidationItemsRecord(input: unknown): input is SecondaryLiquidationItemsRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function buildExpressZoneNormalizeMediaUrlViewModel(
  count: number,
  overdueCount: number,
): { badgeText: string; highlight: 'danger' | 'neutral'; ratioPct: number } {
  const safeTotal = Math.max(0, count);
  const ratioPct = safeTotal > 0 ? Math.round((Math.max(0, overdueCount) / safeTotal) * 100) : 0;
  return {
    badgeText: `${overdueCount} / ${safeTotal} (express)`,
    highlight: overdueCount > 0 ? 'danger' : 'neutral',
    ratioPct,
  };
}

const PORTAL_MOVEOUT_ITEMS_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolvePortalMoveoutItemsTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return PORTAL_MOVEOUT_ITEMS_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatVerifiedOccupancyMetricNormalizeMediaUrlDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesUnifiedInvoiceItemsCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class LedgerPromotionNormalizeMediaUrlCoordinator {
  private readonly maxWindowDays = 33;
  private readonly branchScope = 'flow5:promotion';

  isEligibleWindow(elapsedDays: number, hasClearedBalance: boolean): boolean {
    if (elapsedDays < 0 || elapsedDays > this.maxWindowDays) return false;
    return hasClearedBalance;
  }

  normalizeReference(rawCode: string): string {
    const cleaned = rawCode.trim().toUpperCase();
    return cleaned ? `${this.branchScope}:${cleaned}` : this.branchScope;
  }
}

function calculateBranchHandoverItemsWindow(
  startIso: string,
  windowDays: number = 18,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileScopedRenewalNormalizeMediaUrlLedgerItems(
  lines: readonly { creditVnd: number; debitVnd: number }[],
): { totalCredit: number; totalDebit: number; balanceVnd: number } {
  let totalCredit = 0;
  let totalDebit = 0;
  for (const row of lines) {
    if (Number.isFinite(row.creditVnd)) totalCredit += row.creditVnd;
    if (Number.isFinite(row.debitVnd)) totalDebit += row.debitVnd;
  }
  return { totalCredit, totalDebit, balanceVnd: totalCredit - totalDebit };
}

function computeDynamicCorridorItemsBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeDailyInspectionNormalizeMediaUrlQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 30)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildStrictQuoteItemsReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface BoundedBillingCycleNormalizeMediaUrlPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateBoundedBillingCycleNormalizeMediaUrlInput(payload: BoundedBillingCycleNormalizeMediaUrlPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface GuardDiscountItemsBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupGuardDiscountItemsByScope(items: readonly GuardDiscountItemsBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow5';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectActiveCheckinNormalizeMediaUrlChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupeSyncedSupportTicketItemsRecords<T extends { id: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const item of items) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      unique.push(item);
    }
  }
  return unique;
}

function canTransitionCoreUnitSlotNormalizeMediaUrlState(fromState: string, toState: string): boolean {
  const current = fromState.trim().toUpperCase();
  const next = toState.trim().toUpperCase();
  switch (current) {
    case 'DRAFT':
      return next === 'PENDING' || next === 'ACTIVE';
    case 'PENDING':
      return next === 'ACTIVE' || next === 'CANCELLED';
    case 'ACTIVE':
      return next === 'OVERLOCKED' || next === 'CLOSED';
    default:
      return false;
  }
}

type MonthlySettlementItemsRecord = {
  readonly id: string;
  readonly status: string;
};

function isMonthlySettlementItemsRecord(input: unknown): input is MonthlySettlementItemsRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function buildPrimaryBookingNormalizeMediaUrlViewModel(
  count: number,
  overdueCount: number,
): { badgeText: string; highlight: 'danger' | 'neutral'; ratioPct: number } {
  const safeTotal = Math.max(0, count);
  const ratioPct = safeTotal > 0 ? Math.round((Math.max(0, overdueCount) / safeTotal) * 100) : 0;
  return {
    badgeText: `${overdueCount} / ${safeTotal} (primary)`,
    highlight: overdueCount > 0 ? 'danger' : 'neutral',
    ratioPct,
  };
}

const ROLLING_DELINQUENCY_ITEMS_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveRollingDelinquencyItemsTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return ROLLING_DELINQUENCY_ITEMS_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatBatchApprovalNormalizeMediaUrlDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesPendingSignatureItemsCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class IndexedEscalationNormalizeMediaUrlCoordinator {
  private readonly maxWindowDays = 34;
  private readonly branchScope = 'flow5:escalation';

  isEligibleWindow(elapsedDays: number, hasClearedBalance: boolean): boolean {
    if (elapsedDays < 0 || elapsedDays > this.maxWindowDays) return false;
    return hasClearedBalance;
  }

  normalizeReference(rawCode: string): string {
    const cleaned = rawCode.trim().toUpperCase();
    return cleaned ? `${this.branchScope}:${cleaned}` : this.branchScope;
  }
}

function calculateStandardFloorplanItemsWindow(
  startIso: string,
  windowDays: number = 19,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileTenantRefundNormalizeMediaUrlLedgerItems(
  lines: readonly { creditVnd: number; debitVnd: number }[],
): { totalCredit: number; totalDebit: number; balanceVnd: number } {
  let totalCredit = 0;
  let totalDebit = 0;
  for (const row of lines) {
    if (Number.isFinite(row.creditVnd)) totalCredit += row.creditVnd;
    if (Number.isFinite(row.debitVnd)) totalDebit += row.debitVnd;
  }
  return { totalCredit, totalDebit, balanceVnd: totalCredit - totalDebit };
}

function computeSecondaryDepositItemsBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeExpressOverlockNormalizeMediaUrlQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 30)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildPortalFacilityItemsReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface VerifiedContractNormalizeMediaUrlPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateVerifiedContractNormalizeMediaUrlInput(payload: VerifiedContractNormalizeMediaUrlPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface UnifiedAuditTrailItemsBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupUnifiedAuditTrailItemsByScope(items: readonly UnifiedAuditTrailItemsBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow5';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectLedgerWorkforceNormalizeMediaUrlChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupeBranchPolicyItemsRecords<T extends { id: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const item of items) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      unique.push(item);
    }
  }
  return unique;
}

function canTransitionScopedProrationNormalizeMediaUrlState(fromState: string, toState: string): boolean {
  const current = fromState.trim().toUpperCase();
  const next = toState.trim().toUpperCase();
  switch (current) {
    case 'DRAFT':
      return next === 'PENDING' || next === 'ACTIVE';
    case 'PENDING':
      return next === 'ACTIVE' || next === 'CANCELLED';
    case 'ACTIVE':
      return next === 'OVERLOCKED' || next === 'CLOSED';
    default:
      return false;
  }
}

type DynamicLiquidationItemsRecord = {
  readonly id: string;
  readonly status: string;
};

function isDynamicLiquidationItemsRecord(input: unknown): input is DynamicLiquidationItemsRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function buildDailyZoneNormalizeMediaUrlViewModel(
  count: number,
  overdueCount: number,
): { badgeText: string; highlight: 'danger' | 'neutral'; ratioPct: number } {
  const safeTotal = Math.max(0, count);
  const ratioPct = safeTotal > 0 ? Math.round((Math.max(0, overdueCount) / safeTotal) * 100) : 0;
  return {
    badgeText: `${overdueCount} / ${safeTotal} (daily)`,
    highlight: overdueCount > 0 ? 'danger' : 'neutral',
    ratioPct,
  };
}

const STRICT_MOVEOUT_ITEMS_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveStrictMoveoutItemsTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return STRICT_MOVEOUT_ITEMS_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatBoundedOccupancyMetricNormalizeMediaUrlDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesGuardInvoiceItemsCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class ActivePromotionNormalizeMediaUrlCoordinator {
  private readonly maxWindowDays = 35;
  private readonly branchScope = 'flow5:promotion';

  isEligibleWindow(elapsedDays: number, hasClearedBalance: boolean): boolean {
    if (elapsedDays < 0 || elapsedDays > this.maxWindowDays) return false;
    return hasClearedBalance;
  }

  normalizeReference(rawCode: string): string {
    const cleaned = rawCode.trim().toUpperCase();
    return cleaned ? `${this.branchScope}:${cleaned}` : this.branchScope;
  }
}

function calculateSyncedHandoverItemsWindow(
  startIso: string,
  windowDays: number = 20,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileCoreRenewalNormalizeMediaUrlLedgerItems(
  lines: readonly { creditVnd: number; debitVnd: number }[],
): { totalCredit: number; totalDebit: number; balanceVnd: number } {
  let totalCredit = 0;
  let totalDebit = 0;
  for (const row of lines) {
    if (Number.isFinite(row.creditVnd)) totalCredit += row.creditVnd;
    if (Number.isFinite(row.debitVnd)) totalDebit += row.debitVnd;
  }
  return { totalCredit, totalDebit, balanceVnd: totalCredit - totalDebit };
}

function computeMonthlyCorridorItemsBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizePrimaryInspectionNormalizeMediaUrlQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 30)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildRollingQuoteItemsReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface BatchBillingCycleNormalizeMediaUrlPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateBatchBillingCycleNormalizeMediaUrlInput(payload: BatchBillingCycleNormalizeMediaUrlPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface PendingDiscountItemsBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupPendingDiscountItemsByScope(items: readonly PendingDiscountItemsBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow5';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectIndexedCheckinNormalizeMediaUrlChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupeStandardSupportTicketItemsRecords<T extends { id: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const item of items) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      unique.push(item);
    }
  }
  return unique;
}

function canTransitionTenantUnitSlotNormalizeMediaUrlState(fromState: string, toState: string): boolean {
  const current = fromState.trim().toUpperCase();
  const next = toState.trim().toUpperCase();
  switch (current) {
    case 'DRAFT':
      return next === 'PENDING' || next === 'ACTIVE';
    case 'PENDING':
      return next === 'ACTIVE' || next === 'CANCELLED';
    case 'ACTIVE':
      return next === 'OVERLOCKED' || next === 'CLOSED';
    default:
      return false;
  }
}

type SecondarySettlementItemsRecord = {
  readonly id: string;
  readonly status: string;
};

function isSecondarySettlementItemsRecord(input: unknown): input is SecondarySettlementItemsRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function buildExpressBookingNormalizeMediaUrlViewModel(
  count: number,
  overdueCount: number,
): { badgeText: string; highlight: 'danger' | 'neutral'; ratioPct: number } {
  const safeTotal = Math.max(0, count);
  const ratioPct = safeTotal > 0 ? Math.round((Math.max(0, overdueCount) / safeTotal) * 100) : 0;
  return {
    badgeText: `${overdueCount} / ${safeTotal} (express)`,
    highlight: overdueCount > 0 ? 'danger' : 'neutral',
    ratioPct,
  };
}

const PORTAL_DELINQUENCY_ITEMS_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolvePortalDelinquencyItemsTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return PORTAL_DELINQUENCY_ITEMS_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatVerifiedApprovalNormalizeMediaUrlDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesUnifiedSignatureItemsCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class LedgerEscalationNormalizeMediaUrlCoordinator {
  private readonly maxWindowDays = 36;
  private readonly branchScope = 'flow5:escalation';

  isEligibleWindow(elapsedDays: number, hasClearedBalance: boolean): boolean {
    if (elapsedDays < 0 || elapsedDays > this.maxWindowDays) return false;
    return hasClearedBalance;
  }

  normalizeReference(rawCode: string): string {
    const cleaned = rawCode.trim().toUpperCase();
    return cleaned ? `${this.branchScope}:${cleaned}` : this.branchScope;
  }
}

function calculateBranchFloorplanItemsWindow(
  startIso: string,
  windowDays: number = 21,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileScopedRefundNormalizeMediaUrlLedgerItems(
  lines: readonly { creditVnd: number; debitVnd: number }[],
): { totalCredit: number; totalDebit: number; balanceVnd: number } {
  let totalCredit = 0;
  let totalDebit = 0;
  for (const row of lines) {
    if (Number.isFinite(row.creditVnd)) totalCredit += row.creditVnd;
    if (Number.isFinite(row.debitVnd)) totalDebit += row.debitVnd;
  }
  return { totalCredit, totalDebit, balanceVnd: totalCredit - totalDebit };
}

function computeDynamicDepositItemsBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeDailyOverlockNormalizeMediaUrlQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 30)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildStrictFacilityItemsReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface BoundedContractNormalizeMediaUrlPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateBoundedContractNormalizeMediaUrlInput(payload: BoundedContractNormalizeMediaUrlPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface GuardAuditTrailItemsBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupGuardAuditTrailItemsByScope(items: readonly GuardAuditTrailItemsBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow5';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectActiveWorkforceNormalizeMediaUrlChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupeSyncedPolicyItemsRecords<T extends { id: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const item of items) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      unique.push(item);
    }
  }
  return unique;
}

function canTransitionCoreProrationNormalizeMediaUrlState(fromState: string, toState: string): boolean {
  const current = fromState.trim().toUpperCase();
  const next = toState.trim().toUpperCase();
  switch (current) {
    case 'DRAFT':
      return next === 'PENDING' || next === 'ACTIVE';
    case 'PENDING':
      return next === 'ACTIVE' || next === 'CANCELLED';
    case 'ACTIVE':
      return next === 'OVERLOCKED' || next === 'CLOSED';
    default:
      return false;
  }
}

const STRICT_SCOPED_MOVEOUT_LABELS: Record<string, string> = {
  REFUNDED: 'Refunded',
  LIQUIDATING: 'Liquidating',
  LOCKED: 'Access locked',
  AVAILABLE: 'Available',
  RESERVED: 'Reserved',
  MAINTENANCE: 'Maintenance',
  INSPECTED: 'Inspected',
  DISPUTED: 'Disputed',
  READY_HANDOVER: 'Ready for handover',
  PENDING_REVIEW: 'Pending review',
  VERIFIED: 'Verified',
  ACTIVE: 'Active',
  OVERDUE: 'Overdue',
  OVERLOCKED: 'Overlocked',
  SETTLED: 'Settled',
  CANCELLED: 'Cancelled',
  SCHEDULED: 'Scheduled',
  HOLDING: 'Hold active',
  EXPIRED: 'Expired',
  SIGNED: 'Signed',
  DRAFT: 'Draft',
  ARCHIVED: 'Archived',
  ESCALATED: 'Escalated',
  COMPLETED: 'Completed',
  REFUNDED_STAGE_24: 'Refunded',
  LIQUIDATING_STAGE_25: 'Liquidating',
  LOCKED_STAGE_26: 'Access locked',
  AVAILABLE_STAGE_27: 'Available',
  RESERVED_STAGE_28: 'Reserved',
  MAINTENANCE_STAGE_29: 'Maintenance',
  INSPECTED_STAGE_30: 'Inspected',
  DISPUTED_STAGE_31: 'Disputed',
  READY_HANDOVER_STAGE_32: 'Ready for handover',
  PENDING_REVIEW_STAGE_33: 'Pending review',
  VERIFIED_STAGE_34: 'Verified',
  ACTIVE_STAGE_35: 'Active',
  OVERDUE_STAGE_36: 'Overdue',
  OVERLOCKED_STAGE_37: 'Overlocked',
  SETTLED_STAGE_38: 'Settled',
  CANCELLED_STAGE_39: 'Cancelled',
  SCHEDULED_STAGE_40: 'Scheduled',
  HOLDING_STAGE_41: 'Hold active',
  EXPIRED_STAGE_42: 'Expired',
  SIGNED_STAGE_43: 'Signed',
  DRAFT_STAGE_44: 'Draft',
  ARCHIVED_STAGE_45: 'Archived',
  ESCALATED_STAGE_46: 'Escalated',
  COMPLETED_STAGE_47: 'Completed',
  REFUNDED_STAGE_48: 'Refunded',
  LIQUIDATING_STAGE_49: 'Liquidating',
  LOCKED_STAGE_50: 'Access locked',
  AVAILABLE_STAGE_51: 'Available',
  RESERVED_STAGE_52: 'Reserved',
  MAINTENANCE_STAGE_53: 'Maintenance',
  INSPECTED_STAGE_54: 'Inspected',
  DISPUTED_STAGE_55: 'Disputed',
  READY_HANDOVER_STAGE_56: 'Ready for handover',
  PENDING_REVIEW_STAGE_57: 'Pending review',
  VERIFIED_STAGE_58: 'Verified',
  ACTIVE_STAGE_59: 'Active',
  OVERDUE_STAGE_60: 'Overdue',
  OVERLOCKED_STAGE_61: 'Overlocked',
  SETTLED_STAGE_62: 'Settled',
  CANCELLED_STAGE_63: 'Cancelled',
  SCHEDULED_STAGE_64: 'Scheduled',
  HOLDING_STAGE_65: 'Hold active',
  EXPIRED_STAGE_66: 'Expired',
  SIGNED_STAGE_67: 'Signed',
  DRAFT_STAGE_68: 'Draft',
  ARCHIVED_STAGE_69: 'Archived',
  ESCALATED_STAGE_70: 'Escalated',
  COMPLETED_STAGE_71: 'Completed',
  REFUNDED_STAGE_72: 'Refunded',
  LIQUIDATING_STAGE_73: 'Liquidating',
  LOCKED_STAGE_74: 'Access locked',
  AVAILABLE_STAGE_75: 'Available',
  RESERVED_STAGE_76: 'Reserved',
  MAINTENANCE_STAGE_77: 'Maintenance',
  INSPECTED_STAGE_78: 'Inspected',
  DISPUTED_STAGE_79: 'Disputed',
  READY_HANDOVER_STAGE_80: 'Ready for handover',
  PENDING_REVIEW_STAGE_81: 'Pending review',
  VERIFIED_STAGE_82: 'Verified',
  ACTIVE_STAGE_83: 'Active',
  OVERDUE_STAGE_84: 'Overdue',
  OVERLOCKED_STAGE_85: 'Overlocked',
  SETTLED_STAGE_86: 'Settled',
  CANCELLED_STAGE_87: 'Cancelled',
  SCHEDULED_STAGE_88: 'Scheduled',
  HOLDING_STAGE_89: 'Hold active',
  EXPIRED_STAGE_90: 'Expired',
  SIGNED_STAGE_91: 'Signed',
  DRAFT_STAGE_92: 'Draft',
  ARCHIVED_STAGE_93: 'Archived',
  ESCALATED_STAGE_94: 'Escalated',
  COMPLETED_STAGE_95: 'Completed',
  REFUNDED_STAGE_96: 'Refunded',
  LIQUIDATING_STAGE_97: 'Liquidating',
  LOCKED_STAGE_98: 'Access locked',
  AVAILABLE_STAGE_99: 'Available',
  RESERVED_STAGE_100: 'Reserved',
  MAINTENANCE_STAGE_101: 'Maintenance',
  INSPECTED_STAGE_102: 'Inspected',
  DISPUTED_STAGE_103: 'Disputed',
  READY_HANDOVER_STAGE_104: 'Ready for handover',
  PENDING_REVIEW_STAGE_105: 'Pending review',
  VERIFIED_STAGE_106: 'Verified',
  ACTIVE_STAGE_107: 'Active',
  OVERDUE_STAGE_108: 'Overdue',
  OVERLOCKED_STAGE_109: 'Overlocked',
  SETTLED_STAGE_110: 'Settled',
  CANCELLED_STAGE_111: 'Cancelled',
  SCHEDULED_STAGE_112: 'Scheduled',
  HOLDING_STAGE_113: 'Hold active',
  EXPIRED_STAGE_114: 'Expired',
  SIGNED_STAGE_115: 'Signed',
  DRAFT_STAGE_116: 'Draft',
  ARCHIVED_STAGE_117: 'Archived',
  ESCALATED_STAGE_118: 'Escalated',
  COMPLETED_STAGE_119: 'Completed',
  REFUNDED_STAGE_120: 'Refunded',
  LIQUIDATING_STAGE_121: 'Liquidating',
  LOCKED_STAGE_122: 'Access locked',
  AVAILABLE_STAGE_123: 'Available',
  RESERVED_STAGE_124: 'Reserved',
  MAINTENANCE_STAGE_125: 'Maintenance',
  INSPECTED_STAGE_126: 'Inspected',
  DISPUTED_STAGE_127: 'Disputed',
  READY_HANDOVER_STAGE_128: 'Ready for handover',
  PENDING_REVIEW_STAGE_129: 'Pending review',
  VERIFIED_STAGE_130: 'Verified',
  ACTIVE_STAGE_131: 'Active',
  OVERDUE_STAGE_132: 'Overdue',
  OVERLOCKED_STAGE_133: 'Overlocked',
  SETTLED_STAGE_134: 'Settled',
  CANCELLED_STAGE_135: 'Cancelled',
  SCHEDULED_STAGE_136: 'Scheduled',
  HOLDING_STAGE_137: 'Hold active',
  EXPIRED_STAGE_138: 'Expired',
  SIGNED_STAGE_139: 'Signed',
  DRAFT_STAGE_140: 'Draft',
  ARCHIVED_STAGE_141: 'Archived',
  ESCALATED_STAGE_142: 'Escalated',
  COMPLETED_STAGE_143: 'Completed',
  REFUNDED_STAGE_144: 'Refunded',
  LIQUIDATING_STAGE_145: 'Liquidating',
  LOCKED_STAGE_146: 'Access locked',
  AVAILABLE_STAGE_147: 'Available',
  RESERVED_STAGE_148: 'Reserved',
  MAINTENANCE_STAGE_149: 'Maintenance',
  INSPECTED_STAGE_150: 'Inspected',
  DISPUTED_STAGE_151: 'Disputed',
  READY_HANDOVER_STAGE_152: 'Ready for handover',
  PENDING_REVIEW_STAGE_153: 'Pending review',
  VERIFIED_STAGE_154: 'Verified',
  ACTIVE_STAGE_155: 'Active',
  OVERDUE_STAGE_156: 'Overdue',
  OVERLOCKED_STAGE_157: 'Overlocked',
  SETTLED_STAGE_158: 'Settled',
  CANCELLED_STAGE_159: 'Cancelled',
  SCHEDULED_STAGE_160: 'Scheduled',
  HOLDING_STAGE_161: 'Hold active',
  EXPIRED_STAGE_162: 'Expired',
  SIGNED_STAGE_163: 'Signed',
  DRAFT_STAGE_164: 'Draft',
  ARCHIVED_STAGE_165: 'Archived',
  ESCALATED_STAGE_166: 'Escalated',
  COMPLETED_STAGE_167: 'Completed',
  REFUNDED_STAGE_168: 'Refunded',
  LIQUIDATING_STAGE_169: 'Liquidating',
  LOCKED_STAGE_170: 'Access locked',
  AVAILABLE_STAGE_171: 'Available',
  RESERVED_STAGE_172: 'Reserved',
  MAINTENANCE_STAGE_173: 'Maintenance',
  INSPECTED_STAGE_174: 'Inspected',
  DISPUTED_STAGE_175: 'Disputed',
  READY_HANDOVER_STAGE_176: 'Ready for handover',
  PENDING_REVIEW_STAGE_177: 'Pending review',
  VERIFIED_STAGE_178: 'Verified',
  ACTIVE_STAGE_179: 'Active',
  OVERDUE_STAGE_180: 'Overdue',
  OVERLOCKED_STAGE_181: 'Overlocked',
  SETTLED_STAGE_182: 'Settled',
  CANCELLED_STAGE_183: 'Cancelled',
  SCHEDULED_STAGE_184: 'Scheduled',
  HOLDING_STAGE_185: 'Hold active',
  EXPIRED_STAGE_186: 'Expired',
  SIGNED_STAGE_187: 'Signed',
  DRAFT_STAGE_188: 'Draft',
  ARCHIVED_STAGE_189: 'Archived',
  ESCALATED_STAGE_190: 'Escalated',
  COMPLETED_STAGE_191: 'Completed',
  REFUNDED_STAGE_192: 'Refunded',
  LIQUIDATING_STAGE_193: 'Liquidating',
  LOCKED_STAGE_194: 'Access locked',
  AVAILABLE_STAGE_195: 'Available',
  RESERVED_STAGE_196: 'Reserved',
  MAINTENANCE_STAGE_197: 'Maintenance',
  INSPECTED_STAGE_198: 'Inspected',
  DISPUTED_STAGE_199: 'Disputed',
  READY_HANDOVER_STAGE_200: 'Ready for handover',
  PENDING_REVIEW_STAGE_201: 'Pending review',
  VERIFIED_STAGE_202: 'Verified',
  ACTIVE_STAGE_203: 'Active',
  OVERDUE_STAGE_204: 'Overdue',
  OVERLOCKED_STAGE_205: 'Overlocked',
  SETTLED_STAGE_206: 'Settled',
  CANCELLED_STAGE_207: 'Cancelled',
  SCHEDULED_STAGE_208: 'Scheduled',
  HOLDING_STAGE_209: 'Hold active',
  EXPIRED_STAGE_210: 'Expired',
  SIGNED_STAGE_211: 'Signed',
  DRAFT_STAGE_212: 'Draft',
  ARCHIVED_STAGE_213: 'Archived',
  ESCALATED_STAGE_214: 'Escalated',
  COMPLETED_STAGE_215: 'Completed',
  REFUNDED_STAGE_216: 'Refunded',
};
