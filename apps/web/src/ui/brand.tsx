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

const m = (n: number) => `${n.toLocaleString('vi-VN', { maximumFractionDigits: 1, minimumFractionDigits: n % 1 ? 1 : 1 })} m`;
export function DimLine({ value, label, dark, className }: { value: number; label?: string; dark?: boolean; className?: string }) {
  return (
    <div className={cn('flex items-center gap-2 font-mono text-[11px] tracking-wider', dark ? 'text-steel-300' : 'text-steel-500', className)} aria-label={`${label ?? ''} ${m(value)}`}>
      <span className="h-2.5 w-px bg-current" /><span className="h-px flex-1 bg-current opacity-60" /><span className="whitespace-nowrap">{label ? `${label} ` : ''}{m(value)}</span><span className="h-px flex-1 bg-current opacity-60" /><span className="h-2.5 w-px bg-current" />
    </div>
  );
}
export const dims = (d: [number, number, number] | number[] | { width_m?: any; depth_m?: any; height_m?: any } | null | undefined) => {
  if (!d) return '';
  const arr = Array.isArray(d) ? d : [d.width_m ?? 0, d.depth_m ?? 0, d.height_m ?? 0];
  return arr.map((x) => Number(x).toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })).join(' × ') + ' m';
};

/** Fades/slides children in when scrolled into view. */
export function Reveal({ children, className, delay = 0, as: As = 'div' }: { children: React.ReactNode; className?: string; delay?: number; as?: any }) {
  const ref = React.useRef<HTMLElement>(null);
  const [inView, setIn] = React.useState(false);
  React.useEffect(() => {
    const el = ref.current; if (!el) return;
    if (!('IntersectionObserver' in window)) { setIn(true); return; }
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { setIn(true); io.disconnect(); } }), { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    io.observe(el); return () => io.disconnect();
  }, []);
  return <As ref={ref} className={cn('reveal', inView && 'in', className)} style={{ ['--d' as any]: `${delay}ms` }}>{children}</As>;
}

export function Marquee({ items, className, dark = true }: { items: React.ReactNode[]; className?: string; dark?: boolean }) {
  const row = (k: string) => <div key={k} className="flex shrink-0 items-center" aria-hidden={k === 'b'}>{items.map((it, i) => <span key={i} className="flex items-center gap-6 px-6 eyebrow whitespace-nowrap"><span className={dark ? 'text-steel-300' : 'text-steel-500'}>{it}</span><span className="size-1.5 rotate-45 bg-brass-500" /></span>)}</div>;
  return <div className={cn('relative flex overflow-hidden py-4', dark ? 'bg-ink-950 border-y hairline-dark' : 'bg-paper-2 border-y hairline', className)}><div className="marquee-track flex">{row('a')}{row('b')}</div></div>;
}

/** Image with skeleton + door-stripe fallback when the file is missing. */
export function MediaImg({ src, fallbackSrc, alt, className, imgClassName, eager, sizes }: { src: string; fallbackSrc?: string; alt: string; className?: string; imgClassName?: string; eager?: boolean; sizes?: string }) {
  const imgRef = React.useRef<HTMLImageElement | null>(null);
  const prevSrc = React.useRef(src);
  const [curSrc, setCurSrc] = React.useState(src);
  const [state, setState] = React.useState<'load' | 'ok' | 'err'>('load');

  if (prevSrc.current !== src) {
    prevSrc.current = src;
    setCurSrc(src);
    setState('load');
  }

  const bindImg = React.useCallback((el: HTMLImageElement | null) => {
    imgRef.current = el;
    if (el && el.complete && el.naturalWidth > 0) {
      setState((s) => (s === 'ok' ? s : 'ok'));
    }
  }, []);

  React.useLayoutEffect(() => {
    const el = imgRef.current;
    if (el && el.complete && el.naturalWidth > 0) {
      setState((s) => (s === 'ok' ? s : 'ok'));
    }
  }, [curSrc]);

  const handleError = () => {
    if (curSrc && /-sm\.webp(\?|$)/.test(curSrc)) {
      setCurSrc(curSrc.replace(/-sm\.webp(\?.*)?$/, '.webp$1'));
      setState('load');
      return;
    }
    if (fallbackSrc && curSrc !== fallbackSrc) {
      setCurSrc(fallbackSrc);
      setState('load');
      return;
    }
    setState('err');
  };
  return (
    <div className={cn((className ?? '').split(' ').includes('absolute') ? '' : 'relative', 'overflow-hidden bg-ink-900', className)}>
      {state !== 'ok' && <div className={cn('absolute inset-0 door-lines-ink', state === 'load' && 'animate-pulse')} aria-hidden />}
      {state !== 'err' && curSrc && <img ref={bindImg} src={curSrc} alt={alt} sizes={sizes} loading={eager === false ? 'lazy' : 'eager'} decoding="async" onLoad={() => setState('ok')} onError={handleError} className={cn('size-full object-cover transition-opacity duration-300', state === 'ok' ? 'opacity-100' : 'opacity-0', imgClassName)} />}
    </div>
  );
}

export function StatBlock({ value, label, sub, className }: { value: React.ReactNode; label: string; sub?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('border-l border-brass-500/50 pl-5', className)}>
      <p className="display text-[40px] leading-none text-white num sm:text-[48px]">{value}</p>
      <p className="eyebrow mt-3 text-brass-400">{label}</p>
      {sub && <p className="mt-1 text-sm text-steel-400">{sub}</p>}
    </div>
  );
}

/** Secondary public page hero: rendered image + scrim + display title. */
export function PageHero({ image, eyebrow, title, sub, children, className, tall }: { image: string; eyebrow?: React.ReactNode; title: React.ReactNode; sub?: React.ReactNode; children?: React.ReactNode; className?: string; tall?: boolean }) {
  return (
    <section className={cn('relative isolate overflow-hidden bg-ink-950 text-white', className)}>
      <div className="absolute inset-0 -z-10"><MediaImg src={image} alt="" eager className="size-full" imgClassName="kenburns" /><div className="absolute inset-0 scrim" /><div className="absolute inset-0 bg-gradient-to-r from-ink-950/85 via-ink-950/40 to-transparent" /></div>
      <div className={cn('mx-auto max-w-[1240px] px-4 sm:px-6 lg:px-8', tall ? 'pb-20 pt-36 lg:pb-28 lg:pt-48' : 'pb-14 pt-32 lg:pb-20 lg:pt-40')}>
        {eyebrow && <Eyebrow dark className="mb-5">{eyebrow}</Eyebrow>}
        <h1 className="display max-w-3xl text-[40px] sm:text-[58px]">{title}</h1>
        {sub && <p className="mt-5 max-w-2xl text-[17px] leading-relaxed text-steel-300">{sub}</p>}
        {children}
      </div>
    </section>
  );
}

export function Container({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('mx-auto w-full max-w-[1240px] px-4 sm:px-6 lg:px-8', className)}>{children}</div>;
}
