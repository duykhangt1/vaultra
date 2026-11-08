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
