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
