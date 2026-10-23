import * as React from 'react';
import { cn } from '@/ui';

/** Brand components — "Vault Noir" (DESIGN_SYSTEM.md §5, §8). */

export function Eyebrow({ children, className, dark }: { children: React.ReactNode; className?: string; dark?: boolean }) {
  return <p className={cn('eyebrow inline-flex items-center gap-2', dark ? 'text-brass-400' : 'text-brass-700', className)}><span className="h-px w-6 bg-current opacity-70" />{children}</p>;
}

export function SectionHead({ index, eyebrow, title, sub, action, dark, center, className }: { index?: string; eyebrow?: React.ReactNode; title: React.ReactNode; sub?: React.ReactNode; action?: React.ReactNode; dark?: boolean; center?: boolean; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-6', center && 'flex-col items-center text-center', className)}>
      <div className={cn('max-w-2xl', center && 'mx-auto')}>
        {(index || eyebrow) && <p className={cn('eyebrow mb-4 flex items-center gap-3', center && 'justify-center', dark ? 'text-brass-400' : 'text-brass-700')}>{index && <span className={cn('rounded border px-1.5 py-0.5', dark ? 'border-brass-400/40' : 'border-brass-700/30')}>{index}</span>}{eyebrow}</p>}
        <h2 className={cn('display text-[32px] sm:text-[42px]', dark ? 'text-white' : 'text-ink-900')}>{title}</h2>
        {sub && <p className={cn('mt-4 text-[16px] leading-relaxed sm:text-[17px]', dark ? 'text-steel-300' : 'text-steel-500')}>{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export function Plate({ children, className, dark, size = 'md' }: { children: React.ReactNode; className?: string; dark?: boolean; size?: 'sm' | 'md' }) {
  return <span className={cn('inline-flex items-center font-mono font-medium uppercase tracking-[0.2em]', size === 'sm' ? 'text-[10.5px]' : 'text-xs', dark ? 'text-brass-400 [text-shadow:0_1px_10px_rgb(7_13_21/0.7)]' : 'text-brass-700', className)}>{children}</span>;
}

export function CropFrame({ children, className, dark }: { children: React.ReactNode; className?: string; dark?: boolean }) {
  return <div className={cn('crop', className)} style={{ ['--crop' as any]: dark ? 'var(--color-brass-400)' : 'var(--color-brass-500)' }}><span className="crop-b" />{children}</div>;
}
