import * as React from 'react';
import { cn } from '@/ui';
import { tr, useI18n } from '@/lib/i18n';
import { MQ, DEPTH } from './tokens';
import { afterIntro, finePointer, gsap, prefersReduced, ScrollTrigger, SplitText, useScene } from './motion';

const MOTION_OK = MQ.any;

function translateChildren(node: React.ReactNode): React.ReactNode {
  if (typeof node === 'string') return tr(node);
  if (Array.isArray(node)) return node.map((c, i) => <React.Fragment key={i}>{translateChildren(c)}</React.Fragment>);
  if (React.isValidElement(node) && node.props && typeof node.props === 'object' && 'children' in node.props) {
    return React.cloneElement(node, undefined, translateChildren((node.props as any).children));
  }
  return node;
}

/* ───────────────────────── typography ───────────────────────── */

/**
 * Display headline revealed line by line through masks (or character by character for short words).
 * Accessible: SplitText keeps an aria-label with the full text on the element.
 */
export function Headline({ as: As = 'h2', children, className, mode = 'lines', trigger = 'scroll', delay = 0, style }: { as?: React.ElementType; children: React.ReactNode; className?: string; mode?: 'lines' | 'chars' | 'words'; trigger?: 'scroll' | 'intro' | 'mount'; delay?: number; style?: React.CSSProperties }) {
  const ref = React.useRef<HTMLElement>(null);
  const locale = useI18n((s) => s.locale);
  const rendered = locale === 'en' ? translateChildren(children) : children;
  useScene(ref, ({ mm }) => {
    mm.add(MOTION_OK, () => {
      const el = ref.current!;
      let off: (() => void) | undefined;
      SplitText.create(el, {
        type: mode === 'chars' ? 'lines,words,chars' : mode === 'words' ? 'lines,words' : 'lines',
        mask: 'lines',
        linesClass: 'sl',
        autoSplit: true,
        onSplit(self) {
          const targets = mode === 'chars' ? self.chars : mode === 'words' ? self.words : self.lines;
          const tw = gsap.from(targets, {
            yPercent: mode === 'lines' ? 112 : 120,
            rotate: mode === 'lines' ? 1.5 : 0,
            transformOrigin: '0% 100%',
            duration: mode === 'lines' ? 1.05 : 0.8,
            ease: 'power4.out',
            stagger: mode === 'chars' ? 0.022 : mode === 'words' ? 0.05 : 0.11,
            delay,
            paused: trigger === 'intro',
            scrollTrigger: trigger === 'scroll' ? { trigger: el, start: 'top 88%', once: true } : undefined,
          });
          if (trigger === 'intro') { off?.(); off = afterIntro(() => tw.play()); }
          return tw;
        },
      });
      return () => off?.();
    });
  }, [mode, trigger, delay, locale]);
  return <As key={locale} ref={ref} className={className} style={style}>{rendered}</As>;
}

/** Number that counts up when it enters the viewport (keeps non-numeric values as they are). */
export function CountUp({ value, format = (n: number) => n.toLocaleString('vi-VN'), className, suffix = '' }: { value: number | string | null | undefined; format?: (n: number) => string; className?: string; suffix?: string }) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const num = typeof value === 'number' && Number.isFinite(value) ? value : null;
  useScene(ref, ({ mm }) => {
    if (num === null) return;
    mm.add(MOTION_OK, () => {
      const o = { v: 0 };
      gsap.to(o, { v: num, duration: 1.6, ease: 'power3.out', scrollTrigger: { trigger: ref.current, start: 'top 92%', once: true }, onUpdate: () => { if (ref.current) ref.current.textContent = format(Math.round(o.v)) + suffix; } });
    });
  }, [num]);
  return <span ref={ref} className={cn('num', className)}>{num === null ? (value ?? '—') : format(num) + suffix}</span>;
}

/* ───────────────────────── interaction ───────────────────────── */

/** Magnetic pull for primary calls to action on fine pointers. Children stay fully keyboard-accessible. */
export function Magnetic({ children, strength = 0.32, className }: { children: React.ReactNode; strength?: number; className?: string }) {
  const ref = React.useRef<HTMLSpanElement>(null);
  React.useEffect(() => {
    const el = ref.current; if (!el || !finePointer() || prefersReduced()) return;
    const x = gsap.quickTo(el, 'x', { duration: 0.6, ease: 'elastic.out(1, 0.45)' });
    const y = gsap.quickTo(el, 'y', { duration: 0.6, ease: 'elastic.out(1, 0.45)' });
    const move = (e: PointerEvent) => { const r = el.getBoundingClientRect(); x((e.clientX - (r.left + r.width / 2)) * strength); y((e.clientY - (r.top + r.height / 2)) * strength); };
    const leave = () => { x(0); y(0); };
    el.addEventListener('pointermove', move); el.addEventListener('pointerleave', leave);
    return () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerleave', leave); gsap.killTweensOf(el); };
  }, [strength]);
  return <span ref={ref} className={cn('inline-block will-change-transform', className)}>{children}</span>;
}


/** Pointer-responsive depth: children with data-depth="0.4" shift with the pointer inside the scope. */
export function usePointerDepth(scope: React.RefObject<HTMLElement | null>, max = 18) {
  React.useEffect(() => {
    const el = scope.current; if (!el || !finePointer() || prefersReduced()) return;
    const layers = gsap.utils.toArray<HTMLElement>('[data-depth]', el).map((l) => ({ d: Number(l.dataset.depth) || 0.3, x: gsap.quickTo(l, 'x', { duration: 1.1, ease: 'power3.out' }), y: gsap.quickTo(l, 'y', { duration: 1.1, ease: 'power3.out' }) }));
    const move = (e: PointerEvent) => { const r = el.getBoundingClientRect(); const nx = (e.clientX - r.left) / r.width - 0.5; const ny = (e.clientY - r.top) / r.height - 0.5; layers.forEach((l) => { l.x(-nx * max * l.d * 2); l.y(-ny * max * l.d * 2); }); };
    const leave = () => layers.forEach((l) => { l.x(0); l.y(0); });
    el.addEventListener('pointermove', move); el.addEventListener('pointerleave', leave);
    return () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerleave', leave); };
  }, [scope, max]);
}

/* ───────────────────────── scroll choreography ───────────────────────── */

/**
 * Wires declarative motion inside a scope:
 *  data-speed="far|back|mid|front|near|<number>"  multi-layer parallax (scrubbed)
 *  data-reveal="rise|clip|clip-x|fade|scale|draw"   one-shot entrance; data-delay="ms"
 * Mobile keeps entrances but halves parallax travel; reduced motion turns everything off.
 */
export function useChoreography(scope: React.RefObject<HTMLElement | null>, deps: React.DependencyList = []) {
  useScene(scope, ({ mm, q }) => {
    mm.add({ desk: MQ.desktop, tab: MQ.tablet, mob: MQ.mobile }, (c) => {
      const { desk, tab } = c.conditions as { desk: boolean; tab: boolean; mob: boolean };
      const travel = desk ? 140 : tab ? 90 : 50;
      q('[data-speed]').forEach((el) => {
        const raw = (el as HTMLElement).dataset.speed!;
        const s = raw in DEPTH ? DEPTH[raw as keyof typeof DEPTH] : Number(raw) || 1;
        const d = (1 - s) * travel;
        gsap.fromTo(el, { y: -d }, { y: d, ease: 'none', scrollTrigger: { trigger: (el as HTMLElement).closest('[data-parallax]') ?? el, start: 'top bottom', end: 'bottom top', scrub: desk ? 0.6 : true } });
      });
      q('[data-reveal]').forEach((el) => {
        const h = el as HTMLElement; const kind = h.dataset.reveal; const delay = (Number(h.dataset.delay) || 0) / 1000;
        const st = { trigger: h, start: 'top 88%', once: true };
        const img = h.querySelector('img, video');
        if (kind === 'clip' || kind === 'clip-x') {
          gsap.fromTo(h, { clipPath: kind === 'clip' ? 'inset(100% 0% 0% 0%)' : 'inset(0% 100% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', clearProps: 'clipPath', duration: 1.25, ease: 'expo.inOut', delay, scrollTrigger: st });
          if (img) gsap.fromTo(img, { scale: 1.28 }, { scale: 1, duration: 1.6, ease: 'expo.out', delay, scrollTrigger: st });
        } else if (kind === 'scale') {
          gsap.from(h, { scale: 0.9, opacity: 0, duration: 1, ease: 'expo.out', delay, scrollTrigger: st });
        } else if (kind === 'fade') {
          gsap.from(h, { opacity: 0, duration: 1.1, ease: 'sine.out', delay, scrollTrigger: st });
        } else if (kind === 'draw') {
          gsap.from(h, { scaleX: 0, transformOrigin: '0% 50%', duration: 1.2, ease: 'expo.inOut', delay, scrollTrigger: st });
        } else {
          gsap.from(h, { y: 36, opacity: 0, duration: 0.95, ease: 'power3.out', delay, scrollTrigger: st });
        }
      });
    });
  }, deps);
}

/** Small, honest helper for components that need a ScrollTrigger refresh after async content. */
export const refreshScroll = () => ScrollTrigger.refresh();
