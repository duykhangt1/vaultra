import * as React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import * as Dropdown from '@radix-ui/react-dropdown-menu';
import * as Tooltip from '@radix-ui/react-tooltip';
import clsx from 'clsx';
import { Link } from 'react-router-dom';
import { Loader2, X, Inbox, AlertTriangle, ChevronLeft, ChevronRight, ArrowLeft, Check, Info as InfoIcon, CheckCircle2, ShieldAlert } from 'lucide-react';
import { statusOf, type Tone, initials } from '@/lib/format';
import { useGet } from '@/lib/hooks';
import type { ApiError } from '@/lib/api';

export const cn = clsx;
export { Dropdown, Tooltip };

/* ───────────────────────────── buttons ───────────────────────────── */
type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'dark' | 'outline' | 'ghost' | 'danger' | 'soft' | 'glass'; size?: 'xs' | 'sm' | 'md' | 'lg'; loading?: boolean; icon?: React.ReactNode };
export const Button = React.forwardRef<HTMLButtonElement, BtnProps>(({ variant = 'dark', size = 'md', loading, icon, className, children, disabled, ...p }, ref) => (
  <button
    ref={ref}
    disabled={disabled || loading}
    className={cn(
      'inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-lg font-semibold transition duration-150 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50',
      size === 'xs' ? 'h-7 gap-1.5 px-2.5 text-xs' : size === 'sm' ? 'h-8 px-3 text-[13px]' : size === 'lg' ? 'h-12 px-6 text-base' : 'h-10 px-4 text-sm',
      variant === 'primary' && 'bg-brass-500 text-ink-950 shadow-[inset_0_-2px_0_rgb(0_0_0/0.15),0_1px_2px_rgb(14_27_44/0.08)] hover:bg-brass-400',
      variant === 'dark' && 'bg-ink-900 text-white shadow-[0_1px_2px_rgb(8_18_31/0.18)] hover:bg-ink-800',
      variant === 'outline' && 'border border-steel-300 bg-white text-ink-900 shadow-[0_1px_1px_rgb(14_27_44/0.03)] hover:border-ink-900 hover:bg-[#fcfbf8]',
      variant === 'soft' && 'bg-steel-100 text-ink-900 hover:bg-steel-200',
      variant === 'ghost' && 'text-ink-900 hover:bg-steel-100/80',
      variant === 'danger' && 'bg-bad-600 text-white shadow-[0_1px_2px_rgb(179_54_43/0.25)] hover:bg-red-700',
      variant === 'glass' && 'border border-white/20 bg-white/8 text-white backdrop-blur hover:border-white/40 hover:bg-white/14',
      className,
    )}
    {...p}
  >
    {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
    {children}
  </button>
));
Button.displayName = 'Button';

/* ───────────────────────────── forms ───────────────────────────── */
/** Controls fill their container unless the caller sets an explicit width (clsx does not merge Tailwind classes, so an unconditional w-full would always win). */
const wFull = (c?: string) => (/(^|\s)w-/.test(c ?? '') ? '' : 'w-full');
const inputCls = 'rounded-lg border border-steel-300/95 bg-white px-3 text-sm text-ink-900 shadow-[0_1px_1px_rgb(14_27_44/0.02)] placeholder:text-steel-400 transition hover:border-steel-400 focus:border-ink-800 focus:outline-none focus:ring-2 focus:ring-brass-400/40 disabled:bg-steel-100 aria-[invalid=true]:border-bad-600';
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(({ className, invalid, ...p }, ref) => <input ref={ref} aria-invalid={invalid} className={cn(inputCls, wFull(className), 'h-10', className)} {...p} />);
Input.displayName = 'Input';
export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(({ className, invalid, ...p }, ref) => <textarea ref={ref} aria-invalid={invalid} className={cn(inputCls, wFull(className), 'min-h-[84px] py-2', className)} {...p} />);
Textarea.displayName = 'Textarea';
export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(({ className, invalid, children, ...p }, ref) => (
  <select ref={ref} aria-invalid={invalid} className={cn(inputCls, wFull(className), 'h-10 cursor-pointer appearance-none bg-[url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2712%27 height=%278%27 viewBox=%270 0 12 8%27%3E%3Cpath d=%27M1 1l5 5 5-5%27 stroke=%27%235b6b7d%27 stroke-width=%271.8%27 fill=%27none%27 stroke-linecap=%27round%27/%3E%3C/svg%3E")] bg-[length:12px] bg-[right_12px_center] bg-no-repeat pr-9', className)} {...p}>{children}</select>
));
Select.displayName = 'Select';

export function Field({ label, error, hint, required, children, className }: { label?: React.ReactNode; error?: string; hint?: React.ReactNode; required?: boolean; children: React.ReactNode; className?: string }) {
  const id = React.useId();
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && <label htmlFor={id} className="block text-[13px] font-semibold text-ink-900">{label}{required && <span className="text-bad-600"> *</span>}</label>}
      {React.isValidElement(children) ? React.cloneElement(children as React.ReactElement<any>, { id, invalid: !!error || undefined }) : children}
      {error ? <p role="alert" className="text-xs font-medium text-bad-600">{error}</p> : hint ? <p className="text-xs text-steel-500">{hint}</p> : null}
    </div>
  );
}

export function Checkbox({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: React.ReactNode; disabled?: boolean }) {
  return (
    <label className={cn('flex cursor-pointer items-start gap-2.5 text-sm', disabled && 'opacity-50')}>
      <span className={cn('mt-0.5 grid size-[18px] shrink-0 place-items-center rounded-[5px] border transition', checked ? 'border-ink-900 bg-ink-900 text-white' : 'border-steel-300 bg-white hover:border-ink-700')}>{checked && <Check className="size-3.5" strokeWidth={3} />}</span>
      <input type="checkbox" className="sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="leading-snug">{label}</span>
    </label>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="inline-flex cursor-pointer items-center gap-2.5 text-sm font-medium text-ink-900">
      <span className={cn('relative h-6 w-10 rounded-full transition', checked ? 'bg-ink-900 ring-1 ring-inset ring-brass-400/40' : 'bg-steel-300')}><span className={cn('absolute top-0.5 size-5 rounded-full shadow transition-all', checked ? 'left-[18px] bg-brass-400' : 'left-0.5 bg-white')} /></span>
      {label}
    </button>
  );
}

export function MoneyInput({ value, onChange, ...p }: { value: number | ''; onChange: (v: number | '') => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  return (
    <div className="relative">
      <Input inputMode="numeric" className="pr-8 text-right num" value={value === '' ? '' : new Intl.NumberFormat('vi-VN').format(value)} onChange={(e) => { const d = e.target.value.replace(/\D/g, ''); onChange(d === '' ? '' : Number(d)); }} {...p} />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-steel-500">₫</span>
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: React.ReactNode }[]; className?: string }) {
  return (
    <div role="tablist" className={cn('inline-flex rounded-xl border border-steel-200/80 bg-[#f3efe7] p-1', className)}>
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)} className={cn('cursor-pointer rounded-lg px-3 py-1.5 text-[13px] font-semibold transition', value === o.value ? 'bg-white text-ink-950 shadow-xs ring-1 ring-ink-950/5' : 'text-steel-500 hover:text-ink-900')}>{o.label}</button>
      ))}
    </div>
  );
}

/* ───────────────────────────── display ───────────────────────────── */
export function Card({ className, children, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-2xl border border-steel-200/85 bg-white shadow-[0_1px_2px_rgb(14_27_44/0.04),0_10px_28px_-12px_rgb(14_27_44/0.12)]', className)} {...p}>{children}</div>;
}
export function CardHead({ title, sub, action, className }: { title: React.ReactNode; sub?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start justify-between gap-3 rounded-t-2xl border-b border-steel-200/75 bg-gradient-to-b from-[#fcfbf8] to-white px-5 py-4', className)}>
      <div className="min-w-0 flex-1">
        <h3 className="text-[15.5px] font-bold tracking-tight text-ink-950">{title}</h3>
        {sub && <p className="mt-0.5 text-[13px] leading-relaxed text-steel-500">{sub}</p>}
      </div>
      {action && <div className="shrink-0 whitespace-nowrap">{action}</div>}
    </div>
  );
}

const TONE: Record<Tone, string> = {
  ok: 'bg-ok-100/90 text-ok-600 ring-1 ring-inset ring-ok-600/20',
  warn: 'bg-warn-100/90 text-warn-600 ring-1 ring-inset ring-warn-600/25',
  bad: 'bg-bad-100/90 text-bad-600 ring-1 ring-inset ring-bad-600/20',
  info: 'bg-info-100/90 text-info-600 ring-1 ring-inset ring-info-600/20',
  neutral: 'bg-steel-100 text-steel-600 ring-1 ring-inset ring-steel-300/65',
  brass: 'bg-brass-100/95 text-brass-700 ring-1 ring-inset ring-brass-500/30',
  purple: 'bg-[#f3e8ff] text-[#6b21a8] ring-1 ring-inset ring-[#7e22ce]/30',
};
export function Badge({ tone = 'neutral', children, dot, className }: { tone?: Tone; children: React.ReactNode; dot?: boolean; className?: string }) {
  return <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold', TONE[tone], className)}>{dot && <span className="size-1.5 rounded-full bg-current" />}{children}</span>;
}
export function StatusBadge({ kind, value, className }: { kind: string; value?: string | null; className?: string }) {
  const [label, tone] = statusOf(kind, value);
  return <Badge tone={tone} dot className={className}>{label}</Badge>;
}

export function Avatar({ name, size = 32, className }: { name?: string | null; size?: number; className?: string }) {
  return (
    <span
      style={{ width: size, height: size, fontSize: size * 0.37 }}
      className={cn('inline-grid shrink-0 place-items-center rounded-full bg-ink-900 font-bold tracking-tight text-brass-400 ring-1 ring-inset ring-brass-400/40 shadow-2xs', className)}
    >
      {initials(name)}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton h-4 w-full', className)} aria-hidden />;
}
export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-5 animate-spin text-brass-600', className)} aria-label="Đang tải" />;
}
export function PageLoader() {
  return (
    <div className="grid min-h-[50vh] place-items-center" role="status" aria-busy="true">
      <div className="flex flex-col items-center gap-3 text-steel-500"><Spinner className="size-8" /><span className="text-sm font-medium">Đang tải…</span></div>
    </div>
  );
}

export function EmptyState({ title = 'Chưa có dữ liệu', hint, action, icon }: { title?: string; hint?: React.ReactNode; action?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
      <div className="mb-1 grid size-14 place-items-center rounded-2xl border border-steel-200/90 bg-gradient-to-b from-[#faf8f4] to-steel-100/75 text-brass-700 shadow-[inset_0_1px_0_#fff,0_6px_16px_-6px_rgb(14_27_44/0.12)]">
        {icon ?? <Inbox className="size-6" />}
      </div>
      <p className="text-[15px] font-bold tracking-tight text-ink-950">{title}</p>
      {hint && <p className="max-w-sm text-[13px] leading-relaxed text-steel-500">{hint}</p>}
      {action && <div className="mt-2.5">{action}</div>}
    </div>
  );
}
export function ErrorState({ error, onRetry }: { error?: ApiError | Error | null; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-14 text-center" role="alert">
      <div className="mb-1 grid size-14 place-items-center rounded-2xl border border-bad-600/20 bg-bad-100/80 text-bad-600 shadow-2xs"><AlertTriangle className="size-6" /></div>
      <p className="text-[15px] font-bold tracking-tight text-ink-950">Không tải được dữ liệu</p>
      <p className="max-w-sm text-[13px] leading-relaxed text-steel-500">{error?.message ?? 'Đã có lỗi xảy ra.'}</p>
      {onRetry && <div className="mt-2"><Button variant="outline" size="sm" onClick={onRetry}>Thử lại</Button></div>}
    </div>
  );
}

const ALERT_ICON: Record<Tone, React.ReactNode> = {
  bad: <ShieldAlert className="size-4 shrink-0 text-bad-600" />,
  warn: <AlertTriangle className="size-4 shrink-0 text-warn-600" />,
  ok: <CheckCircle2 className="size-4 shrink-0 text-ok-600" />,
  info: <InfoIcon className="size-4 shrink-0 text-info-600" />,
  neutral: <InfoIcon className="size-4 shrink-0 text-steel-600" />,
  brass: <InfoIcon className="size-4 shrink-0 text-brass-700" />,
  purple: <InfoIcon className="size-4 shrink-0 text-[#7e22ce]" />,
};

export function Alert({ tone = 'info', title, children, action, className }: { tone?: Tone; title?: React.ReactNode; children?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-3 rounded-xl border border-l-[3px] px-4 py-3.5 text-sm shadow-[0_1px_2px_rgb(14_27_44/0.04)]',
        tone === 'bad' && 'border-bad-600/25 border-l-bad-600 bg-gradient-to-r from-bad-100/90 to-white text-ink-950',
        tone === 'warn' && 'border-warn-600/25 border-l-warn-600 bg-gradient-to-r from-warn-100/85 to-white text-ink-950',
        tone === 'ok' && 'border-ok-600/25 border-l-ok-600 bg-gradient-to-r from-ok-100/85 to-white text-ink-950',
        tone === 'brass' && 'border-brass-500/30 border-l-brass-500 bg-gradient-to-r from-brass-100/85 to-white text-ink-950',
        tone === 'purple' && 'border-[#7e22ce]/25 border-l-[#7e22ce] bg-gradient-to-r from-[#f3e8ff]/85 to-white text-ink-950',
        (tone === 'info' || tone === 'neutral') && 'border-info-600/20 border-l-info-600 bg-gradient-to-r from-info-100/75 to-white text-ink-950',
        className,
      )}
    >
      <span className="mt-0.5">{ALERT_ICON[tone]}</span>
      <div className="min-w-0 flex-1">
        {title && <p className="font-bold tracking-tight text-ink-950">{title}</p>}
        {children && <div className="mt-0.5 text-[13px] leading-relaxed text-ink-800">{children}</div>}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}

const BACK_LABEL: Record<string, string> = { contracts: 'Hợp đồng', billing: 'Hóa đơn', reservations: 'Đặt chỗ', support: 'Hỗ trợ', tickets: 'Phiếu hỗ trợ', customers: 'Khách hàng', moveouts: 'Trả kho', app: 'Tổng quan', staff: 'Hôm nay', manage: 'Tổng quan', ops: 'Tổng quan', admin: 'Tổng quan' };
/** `back` may be a ready-made element or just a path: a path renders as "← <where it goes>". */
function BackLink({ to }: { to: string }) {
  const label = BACK_LABEL[to.split('/').filter(Boolean).pop() ?? ''] ?? 'Quay lại';
  return (
    <Link to={to} className="mb-2.5 inline-flex items-center gap-1.5 rounded-lg border border-steel-200/85 bg-white/85 px-2.5 py-1 text-xs font-semibold text-steel-600 shadow-2xs transition hover:border-ink-900/30 hover:bg-white hover:text-ink-950">
      <ArrowLeft className="size-3.5 text-brass-700" />
      {label}
    </Link>
  );
}

export function PageHeader({ title, sub, actions, back, eyebrow, className }: { title: React.ReactNode; sub?: React.ReactNode; actions?: React.ReactNode; back?: React.ReactNode; eyebrow?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-ink-950/[0.08] pb-4', className)}>
      <div className="min-w-0">
        {typeof back === 'string' ? <BackLink to={back} /> : back}
        {eyebrow ? (
          <p className="eyebrow mb-1.5 inline-flex items-center gap-2 text-brass-700">
            <span className="h-0.5 w-5 rounded-full bg-brass-500" aria-hidden />
            {eyebrow}
          </p>
        ) : null}
        <div className={cn(!eyebrow && 'relative pl-3.5 before:absolute before:bottom-1 before:left-0 before:top-1 before:w-[3px] before:rounded-full before:bg-gradient-to-b before:from-brass-500 before:to-brass-700/70')}>
          <h1 className="display text-[26px] tracking-tight text-ink-950 sm:text-[32px]">{title}</h1>
          {sub && <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-steel-500">{sub}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, sub, tone, icon, loading }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: Tone; icon?: React.ReactNode; loading?: boolean }) {
  return (
    <Card className="relative overflow-hidden p-5">
      <div className={cn('absolute inset-x-0 top-0 h-[3px]', tone === 'bad' ? 'bg-bad-600' : tone === 'warn' ? 'bg-warn-600' : tone === 'ok' ? 'bg-ok-600' : 'bg-brass-500')} aria-hidden />
      <div className="flex items-center justify-between gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-steel-500">
        <span>{label}</span>
        {icon && <span className="grid size-7 place-items-center rounded-lg bg-[#f6f3ec] text-brass-700">{icon}</span>}
      </div>
      {loading ? <Skeleton className="mt-2.5 h-8 w-24" /> : <p className={cn('mt-2 display text-[26px] font-bold leading-none tracking-tight text-ink-950 num', tone === 'bad' && 'text-bad-600', tone === 'ok' && 'text-ok-600', tone === 'warn' && 'text-warn-600')}>{value}</p>}
      {sub && <p className="mt-2 inline-flex max-w-full truncate rounded-md bg-[#f7f4ed] px-2 py-0.5 text-xs font-medium text-steel-600">{sub}</p>}
    </Card>
  );
}

export function KV({ items, cols = 2 }: { items: [React.ReactNode, React.ReactNode][]; cols?: 1 | 2 | 3 }) {
  return (
    <dl className={cn('grid gap-x-8 gap-y-3.5 text-sm', cols === 1 ? 'grid-cols-1' : cols === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3')}>
      {items.map(([k, v], i) => (
        <div key={i} className="min-w-0 border-b border-steel-100/90 pb-2.5 last:border-0">
          <dt className="text-[11px] font-bold uppercase tracking-wider text-steel-500">{k}</dt>
          <dd className="mt-0.5 break-words font-medium text-ink-950">{v ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Timeline({ items }: { items: { title: React.ReactNode; sub?: React.ReactNode; at?: React.ReactNode; tone?: Tone }[] }) {
  return (
    <ol className="relative space-y-4 border-l-2 border-steel-200/90 pl-5">
      {items.map((it, i) => (
        <li key={i} className="relative">
          <span className={cn('absolute -left-[26px] top-1 size-2.5 rounded-full ring-4 ring-white', it.tone === 'ok' ? 'bg-ok-600' : it.tone === 'bad' ? 'bg-bad-600' : it.tone === 'warn' ? 'bg-warn-600' : 'bg-brass-500')} />
          <p className="text-sm font-semibold text-ink-950">{it.title}</p>
          {it.sub && <p className="mt-0.5 text-[13px] leading-relaxed text-steel-500">{it.sub}</p>}
          {it.at && <p className="mt-0.5 font-mono text-[11px] text-steel-400">{it.at}</p>}
        </li>
      ))}
    </ol>
  );
}

export function Stepper({ steps, current, onStep }: { steps: string[]; current: number; onStep?: (i: number) => void }) {
  return (
    <ol className="flex items-center gap-2 overflow-x-auto pb-1">
      {steps.map((s, i) => {
        const clickable = !!onStep && i !== current && current < steps.length - 1 && i < steps.length - 1;
        return (
          <li key={s} className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              disabled={!clickable}
              onClick={() => clickable && onStep(i)}
              className={cn('flex items-center gap-2 text-left', clickable && 'cursor-pointer hover:opacity-80')}
            >
              <span className={cn('grid size-7 place-items-center rounded-full text-xs font-bold shadow-2xs', i < current ? 'bg-ok-600 text-white' : i === current ? 'bg-ink-950 text-brass-400 ring-2 ring-brass-400/40' : 'bg-steel-100 text-steel-400')}>{i < current ? <Check className="size-4" /> : i + 1}</span>
              <span className={cn('text-[13px] font-semibold', i === current ? 'text-ink-950' : i < current ? 'text-ink-700' : 'text-steel-400')}>{s}</span>
            </button>
            {i < steps.length - 1 && <span className={cn('mx-1 h-px w-5', i < current ? 'bg-brass-500' : 'bg-steel-300')} />}
          </li>
        );
      })}
    </ol>
  );
}

export function Progress({ value, tone = 'brass' }: { value: number; tone?: 'brass' | 'ok' | 'bad' }) {
  return <div className="h-2 overflow-hidden rounded-full bg-steel-100"><div className={cn('h-full rounded-full transition-all duration-300', tone === 'ok' ? 'bg-ok-600' : tone === 'bad' ? 'bg-bad-600' : 'bg-brass-500')} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>;
}

/* ───────────────────────────── overlays ───────────────────────────── */
export function Modal({ open, onClose, title, description, children, footer, size = 'md' }: { open: boolean; onClose: () => void; title: React.ReactNode; description?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink-950/60 backdrop-blur-[3px]" />
        <Dialog.Content className={cn('fixed left-1/2 top-1/2 z-50 flex max-h-[92dvh] w-[calc(100vw-1.5rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-steel-200/85 bg-white shadow-[0_24px_64px_-12px_rgb(8_18_31/0.42)] focus:outline-none', size === 'sm' ? 'max-w-sm' : size === 'md' ? 'max-w-lg' : size === 'lg' ? 'max-w-2xl' : 'max-w-4xl')}>
          <div className="h-[3px] w-full bg-gradient-to-r from-ink-950 via-brass-500 to-ink-950" aria-hidden />
          <div className="flex items-start justify-between gap-4 border-b border-steel-200/80 bg-gradient-to-b from-[#fcfbf8] to-white px-6 py-4">
            <div>
              <Dialog.Title className="text-[17px] font-bold tracking-tight text-ink-950">{title}</Dialog.Title>
              {description ? <Dialog.Description className="mt-0.5 text-[13px] leading-relaxed text-steel-500">{description}</Dialog.Description> : <Dialog.Description className="sr-only">{typeof title === 'string' ? title : 'Hộp thoại'}</Dialog.Description>}
            </div>
            <Dialog.Close aria-label="Đóng" className="cursor-pointer rounded-lg p-1.5 text-steel-400 transition hover:bg-steel-100 hover:text-ink-950"><X className="size-5" /></Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-steel-200/80 bg-[#faf8f4]/85 px-6 py-3.5">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function Drawer({ open, onClose, title, children, footer, width = 480 }: { open: boolean; onClose: () => void; title: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode; width?: number }) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink-950/50 backdrop-blur-[2px]" />
        <Dialog.Content style={{ maxWidth: width }} className="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-steel-200/80 bg-white shadow-[var(--shadow-pop)] focus:outline-none">
          <div className="flex items-center justify-between border-b border-steel-200/80 bg-gradient-to-b from-[#fcfbf8] to-white px-6 py-4">
            <Dialog.Title className="text-[17px] font-bold tracking-tight text-ink-950">{title}</Dialog.Title>
            <Dialog.Close aria-label="Đóng" className="cursor-pointer rounded-lg p-1.5 text-steel-400 transition hover:bg-steel-100 hover:text-ink-950"><X className="size-5" /></Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">Bảng chi tiết</Dialog.Description>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
          {footer && <div className="flex justify-end gap-2 border-t border-steel-200/80 bg-[#faf8f4]/85 px-6 py-3.5">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Confirmation dialog; `reason` makes a justification mandatory (audit-friendly destructive actions). */
export function Confirm({ open, onClose, onConfirm, title, description, confirmLabel = 'Xác nhận', danger, reason, loading, children }: { open: boolean; onClose: () => void; onConfirm: (reason?: string) => void; title: string; description?: React.ReactNode; confirmLabel?: string; danger?: boolean; reason?: boolean | string; loading?: boolean; children?: React.ReactNode }) {
  const [r, setR] = React.useState('');
  React.useEffect(() => { if (open) setR(''); }, [open]);
  const need = !!reason && r.trim().length < 5;
  return (
    <Modal open={open} onClose={onClose} title={title} description={description} size="sm" footer={<><Button variant="ghost" onClick={onClose}>Để sau</Button><Button variant={danger ? 'danger' : 'dark'} loading={loading} disabled={need} onClick={() => onConfirm(reason ? r.trim() : undefined)}>{confirmLabel}</Button></>}>
      {children}
      {reason && <Field label={typeof reason === 'string' ? reason : 'Lý do'} required hint="Tối thiểu 5 ký tự — được lưu trong nhật ký kiểm toán."><Textarea value={r} onChange={(e) => setR(e.target.value)} autoFocus /></Field>}
    </Modal>
  );
}

export function Tabs({ tabs, value, onChange, className }: { tabs: { value: string; label: React.ReactNode; count?: number }[]; value: string; onChange: (v: string) => void; className?: string }) {
  const list = React.useRef<HTMLDivElement>(null);
  const [edge, setEdge] = React.useState({ left: false, right: false });
  const measure = React.useCallback(() => {
    const el = list.current;
    if (el) setEdge({ left: el.scrollLeft > 2, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 });
  }, []);
  // a long row of tabs scrolls sideways: with the mouse wheel, with the arrows, and it keeps the selected tab in view
  React.useEffect(() => {
    const el = list.current;
    if (!el) return;
    measure();
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('scroll', measure, { passive: true });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => { el.removeEventListener('wheel', onWheel); el.removeEventListener('scroll', measure); ro?.disconnect(); };
  }, [measure, tabs.length]);
  React.useEffect(() => {
    const el = list.current;
    const on = el?.querySelector<HTMLElement>('[data-state=active]');
    if (!el || !on) return;
    if (on.offsetLeft < el.scrollLeft + 28 || on.offsetLeft + on.offsetWidth > el.scrollLeft + el.clientWidth - 28) el.scrollTo({ left: on.offsetLeft - (el.clientWidth - on.offsetWidth) / 2, behavior: 'smooth' });
  }, [value]);
  const arrow = 'absolute inset-y-1 z-10 grid w-7 cursor-pointer place-items-center rounded-lg border border-steel-200/85 bg-white/95 text-ink-900 shadow-sm transition hover:bg-paper';
  return (
    <TabsPrimitive.Root value={value} onValueChange={onChange}>
      <div className="relative w-fit max-w-full">
        {edge.left && <button type="button" aria-label="Cuộn sang trái" className={cn(arrow, 'left-1')} onClick={() => list.current?.scrollBy({ left: -260, behavior: 'smooth' })}><ChevronLeft className="size-4" /></button>}
        {edge.right && <button type="button" aria-label="Cuộn sang phải" className={cn(arrow, 'right-1')} onClick={() => list.current?.scrollBy({ left: 260, behavior: 'smooth' })}><ChevronRight className="size-4" /></button>}
        <TabsPrimitive.List ref={list} className={cn('flex w-fit max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-steel-200/85 bg-white/85 p-1 shadow-[0_1px_2px_rgb(14_27_44/0.04)] backdrop-blur-xs no-scrollbar', className)}>
        {tabs.map((t) => (
          <TabsPrimitive.Trigger
            key={t.value}
            value={t.value}
            className="group relative inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-semibold text-steel-600 transition-all hover:text-ink-950 data-[state=active]:bg-ink-950 data-[state=active]:text-white data-[state=active]:shadow-xs"
          >
            <span className="hidden size-1.5 rounded-full bg-brass-400 group-data-[state=active]:inline-block" aria-hidden />
            {t.label}
            {t.count !== undefined && (
              <span className="ml-0.5 rounded-full bg-steel-100 px-1.5 py-px font-mono text-[11px] font-bold text-steel-600 transition-colors group-data-[state=active]:bg-brass-500 group-data-[state=active]:text-ink-950 num">
                {t.count}
              </span>
            )}
          </TabsPrimitive.Trigger>
        ))}
        </TabsPrimitive.List>
      </div>
    </TabsPrimitive.Root>
  );
}

export function Menu({ trigger, items }: { trigger: React.ReactNode; items: ({ label: React.ReactNode; onSelect?: () => void; danger?: boolean; icon?: React.ReactNode; disabled?: boolean } | 'sep')[] }) {
  return (
    <Dropdown.Root>
      <Dropdown.Trigger asChild>{trigger}</Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content align="end" sideOffset={6} className="z-[60] min-w-52 rounded-xl border border-steel-200/90 bg-white/98 p-1.5 shadow-[0_18px_44px_-10px_rgb(8_18_31/0.28)] backdrop-blur-md">
          {items.map((it, i) => it === 'sep' ? <Dropdown.Separator key={i} className="my-1 h-px bg-steel-100" /> : (
            <Dropdown.Item key={i} disabled={it.disabled} onSelect={it.onSelect} className={cn('flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] font-medium text-ink-900 outline-none transition-colors data-[disabled]:opacity-40 data-[highlighted]:bg-[#f6f3ec]', it.danger && 'text-bad-600 data-[highlighted]:bg-bad-100/60')}>{it.icon}{it.label}</Dropdown.Item>
          ))}
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}

/** Small (i) icon that explains a field on hover or keyboard focus. */
export function HelpTip({ text, label = 'Xem giải thích', onDark }: { text: string; label?: string; onDark?: boolean }) {
  return (
    <Tip text={text}>
      <button type="button" aria-label={label} className={cn('ml-1 inline-flex size-4 shrink-0 cursor-help items-center justify-center rounded-full align-middle transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-brass-500', onDark ? 'text-steel-300 hover:text-white focus-visible:text-white' : 'text-steel-400 hover:text-ink-900 focus-visible:text-ink-900')}>
        <InfoIcon className="size-3.5" aria-hidden />
      </button>
    </Tip>
  );
}

export function Tip({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <Tooltip.Provider delayDuration={200}>
      <Tooltip.Root><Tooltip.Trigger asChild>{children}</Tooltip.Trigger><Tooltip.Portal><Tooltip.Content sideOffset={6} className="z-[70] max-w-xs whitespace-pre-line rounded-lg bg-ink-950 px-2.5 py-1.5 text-xs font-medium leading-relaxed text-white shadow-lg ring-1 ring-white/10">{text}</Tooltip.Content></Tooltip.Portal></Tooltip.Root>
    </Tooltip.Provider>
  );
}

/* ───────────────────────────── data table ───────────────────────────── */
export type Col<T> = { key: string; header: React.ReactNode; cell: (r: T) => React.ReactNode; className?: string; hideBelow?: 'sm' | 'md' | 'lg' };
const HIDE = { sm: 'hidden sm:table-cell', md: 'hidden md:table-cell', lg: 'hidden lg:table-cell' };

type DataTableProps<T> = { rows?: T[]; cols: Col<T>[]; loading?: boolean; error?: ApiError | null; onRetry?: () => void; onRow?: (r: T) => void; empty?: React.ReactNode; rowKey: (r: T) => string; dense?: boolean };
/** With `pageSize` the table shows that many rows at a time and a "Trước / Sau" footer (pageKey resets it to page 1, e.g. when a tab changes). */
export function DataTable<T>({ pageSize, pageKey = '', ...props }: DataTableProps<T> & { pageSize?: number; pageKey?: string }) {
  const paged = usePaged(pageSize ? props.rows : undefined, pageKey, pageSize ?? 10);
  if (!pageSize) return <DataTableBase {...props} />;
  return (
    <>
      <DataTableBase {...props} rows={props.rows === undefined ? undefined : paged.rows} />
      {paged.footer}
    </>
  );
}

function DataTableBase<T>({ rows, cols, loading, error, onRetry, onRow, empty, rowKey, dense }: DataTableProps<T>) {
  if (error) return <ErrorState error={error} onRetry={onRetry} />;
  // No data yet (and no error) is still loading: never flash "empty" for a query that is idle, paused or waiting for its filters.
  loading = loading || rows === undefined;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-steel-200/85 bg-[#faf8f4] text-[11px] font-bold uppercase tracking-[0.08em] text-steel-500">
            {cols.map((c) => <th key={c.key} className={cn('whitespace-nowrap px-4 py-3 font-bold', c.hideBelow && HIDE[c.hideBelow], c.className)}>{c.header}</th>)}
          </tr>
        </thead>
        <tbody>
          {loading && Array.from({ length: 5 }).map((_, i) => <tr key={i} className="border-b border-steel-100/90 last:border-0">{cols.map((c, j) => <td key={c.key} className={cn('px-4 py-3.5', c.hideBelow && HIDE[c.hideBelow])}><Skeleton className={cn('h-4', (i + j) % 2 === 0 ? 'w-4/5' : 'w-3/5')} /></td>)}</tr>)}
          {!loading && rows?.map((r) => (
            <tr key={rowKey(r)} onClick={onRow ? () => onRow(r) : undefined} className={cn('border-b border-steel-100/90 last:border-0 transition-colors', onRow ? 'cursor-pointer hover:bg-brass-100/25' : 'hover:bg-[#faf8f4]/60')}>
              {cols.map((c) => <td key={c.key} className={cn('px-4 align-middle text-[13.5px] text-ink-900', dense ? 'py-2.5' : 'py-3.5', c.hideBelow && HIDE[c.hideBelow], c.className)}>{c.cell(r)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {!loading && !rows?.length && (empty ?? <EmptyState />)}
    </div>
  );
}

/** Server-paginated table over `{data, page:{hasMore,nextCursor,total}}` endpoints (cursor pagination, spec §11.1). */
export function PagedTable<T>({ path, query, cols, onRow, rowKey, empty, size = 20, toolbar, refetchInterval }: { path: string; query?: Record<string, any>; cols: Col<T>[]; onRow?: (r: T) => void; rowKey?: (r: T) => string; empty?: React.ReactNode; size?: number; toolbar?: React.ReactNode; refetchInterval?: number }) {
  const [cursors, setCursors] = React.useState<(string | undefined)[]>([undefined]);
  const qKey = JSON.stringify(query);
  React.useEffect(() => setCursors([undefined]), [qKey, path]);
  const cursor = cursors[cursors.length - 1];
  const { data, isLoading, isFetching, isPlaceholderData, error, refetch } = useGet<{ data: T[]; page?: { hasMore: boolean; nextCursor: string | null; total?: number } } | T[]>(path, { ...query, 'page[size]': size, 'page[cursor]': cursor }, { keepPrevious: true, refetchInterval });
  const page = cursors.length;
  const rows = Array.isArray(data) ? data : data?.data;
  const pg = Array.isArray(data) ? undefined : data?.page;
  return (
    <div>
      {toolbar}
      <DataTable rows={rows} cols={cols} loading={isLoading || isPlaceholderData} error={error} onRetry={refetch} onRow={onRow} empty={empty} rowKey={rowKey ?? ((r: any) => r.id ?? r.code ?? JSON.stringify(r))} />
      {(page > 1 || pg?.hasMore) && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-b-2xl border-t border-steel-200/80 bg-[#fcfbf8] px-4 py-3 text-xs font-medium text-steel-500">
          <span className="inline-flex items-center gap-1.5 num">
            {pg?.total !== undefined && <><b className="font-semibold text-ink-900">{pg.total}</b> kết quả <span className="text-steel-300">·</span></>}
            <span>Trang <b className="font-semibold text-ink-900">{page}</b></span>
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="xs" disabled={page === 1 || isFetching} onClick={() => setCursors((c) => c.slice(0, -1))} icon={<ChevronLeft className="size-3.5" />}>Trước</Button>
            <Button variant="outline" size="xs" disabled={!pg?.hasMore || isFetching} onClick={() => setCursors((c) => [...c, pg?.nextCursor ?? undefined])}>Sau<ChevronRight className="size-3.5" /></Button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Client-side pagination for endpoints that return the whole list (e.g. /delinquency).
 * `resetKey` should change whenever the filters change so the user lands back on page 1.
 */
export function usePaged<T>(rows: T[] | undefined, resetKey = '', size = 10) {
  const [page, setPage] = React.useState(1);
  React.useEffect(() => setPage(1), [resetKey]);
  const total = rows?.length ?? 0;
  const pages = Math.max(1, Math.ceil(total / size));
  const cur = Math.min(page, pages); // data can shrink (refetch / filter) while the user is on a later page
  const slice = rows ? rows.slice((cur - 1) * size, cur * size) : undefined;
  const footer = total > size ? (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-b-2xl border-t border-steel-200/80 bg-[#fcfbf8] px-4 py-3 text-xs font-medium text-steel-500">
      <span className="inline-flex items-center gap-1.5 num">
        <b className="font-semibold text-ink-900">{(cur - 1) * size + 1}–{Math.min(cur * size, total)}</b> / {total} kết quả <span className="text-steel-300">·</span> Trang <b className="font-semibold text-ink-900">{cur}</b> / {pages}
      </span>
      <div className="flex gap-2">
        <Button variant="outline" size="xs" disabled={cur === 1} onClick={() => setPage(cur - 1)} icon={<ChevronLeft className="size-3.5" />}>Trước</Button>
        <Button variant="outline" size="xs" disabled={cur === pages} onClick={() => setPage(cur + 1)}>Sau<ChevronRight className="size-3.5" /></Button>
      </div>
    </div>
  ) : null;
  return { rows: slice, footer };
}

export function FilterBar({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2.5 rounded-t-2xl border-b border-steel-200/80 bg-[#fcfbf8] px-4 py-3">{children}</div>;
}

/** Wrap page content with the canonical loading / error / empty states (spec §14.4). */
export function Async<T>({ q, children, skeleton }: { q: { data?: T; isLoading: boolean; error: ApiError | null; refetch: () => any }; children: (d: T) => React.ReactNode; skeleton?: React.ReactNode }) {
  if (q.isLoading) return <>{skeleton ?? <div className="space-y-4"><div className="grid gap-4 sm:grid-cols-3"><Skeleton className="h-28 rounded-2xl" /><Skeleton className="h-28 rounded-2xl" /><Skeleton className="h-28 rounded-2xl" /></div><Skeleton className="h-48 rounded-2xl" /></div>}</>;
  if (q.error) return <Card><ErrorState error={q.error} onRetry={q.refetch} /></Card>;
  if (q.data === undefined) return null;
  return <>{children(q.data)}</>;
}

export { useGet };
