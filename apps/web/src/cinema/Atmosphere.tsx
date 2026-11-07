import * as React from 'react';
import { create } from 'zustand';
import { ENV, type EnvId } from './tokens';
import { gsap, ScrollTrigger, scheduleRefresh } from './motion';
import { cn } from '@/ui';

/**
 * Adaptive environment: one fixed atmosphere layer sits behind the page. Each <Scene> declares an
 * environment; when the scene crosses the middle of the viewport the layer crossfades to its colour
 * and the header switches tone. Outside any scene the page default (usually paper) applies.
 */
interface AtmosState { env: EnvId; fallback: EnvId; active: string[]; envs: Record<string, EnvId>; setFallback: (e: EnvId) => void; enter: (id: string, e: EnvId) => void; leave: (id: string) => void }
export const useAtmos = create<AtmosState>((set) => ({
  env: 'paper',
  fallback: 'paper',
  active: [],
  envs: {},
  setFallback: (fallback) => set((s) => ({ fallback, env: s.active.length ? s.env : fallback })),
  enter: (id, e) => set((s) => { const active = [...s.active.filter((x) => x !== id), id]; return { active, envs: { ...s.envs, [id]: e }, env: e }; }),
  leave: (id) => set((s) => { const active = s.active.filter((x) => x !== id); const top = active[active.length - 1]; return { active, env: top ? s.envs[top] : s.fallback }; }),
}));

/** Fixed colour field + soft light pool that follows the environment. Render once per layout. */
export function AtmosphereLayer() {
  const ref = React.useRef<HTMLDivElement>(null);
  const env = useAtmos((s) => s.env);
  React.useEffect(() => {
    const e = ENV[env];
    document.documentElement.dataset.env = env;
    document.documentElement.dataset.tone = e.tone;
    if (!ref.current) return;
    gsap.to(ref.current, { backgroundColor: e.bg, duration: 0.9, ease: 'sine.inOut', overwrite: 'auto' });
    gsap.to(ref.current.querySelector('[data-pool]'), { backgroundColor: e.accent, opacity: e.tone === 'dark' ? 0.09 : 0.06, duration: 1.4, ease: 'sine.inOut', overwrite: 'auto' });
  }, [env]);
  // page height changes with API data → keep trigger positions honest
  React.useEffect(() => {
    if (!('ResizeObserver' in window)) return;
    const ro = new ResizeObserver(() => scheduleRefresh());
    ro.observe(document.body);
    const nav = () => scheduleRefresh(260);
    window.addEventListener('vaultra:navigated', nav);
    return () => { ro.disconnect(); window.removeEventListener('vaultra:navigated', nav); };
  }, []);
  return (
    <div ref={ref} aria-hidden className="pointer-events-none fixed inset-0 -z-10" style={{ backgroundColor: ENV.paper.bg }}>
      <div data-pool className="absolute left-1/2 top-[-30vh] h-[90vh] w-[120vw] -translate-x-1/2 rounded-[50%] blur-[120px]" style={{ opacity: 0.05 }} />
    </div>
  );
}

/** Sets the environment used where no scene is in view (call once per page). */
export function usePageEnv(env: EnvId) {
  const setFallback = useAtmos((s) => s.setFallback);
  React.useLayoutEffect(() => { setFallback(env); }, [env, setFallback]);
}

type SceneProps = React.HTMLAttributes<HTMLElement> & {
  env: EnvId; as?: React.ElementType; children: React.ReactNode;
  /** the scene paints its own environment colour (default) so it is always readable, whatever the scroll state */
  solid?: boolean;
  /** environment of the scene above: a painted band blends the two so the change of atmosphere has no seam */
  blend?: EnvId;
};

/** A scene of the story. Text colours come from its environment via CSS variables. */
export const Scene = React.forwardRef<HTMLElement, SceneProps>(function Scene({ env, as: As = 'section', className, style, solid = true, blend, children, ...rest }, fwd) {
  const local = React.useRef<HTMLElement>(null);
  const id = React.useId();
  const enter = useAtmos((s) => s.enter);
  const leave = useAtmos((s) => s.leave);
  React.useImperativeHandle(fwd, () => local.current as HTMLElement);
  React.useLayoutEffect(() => {
    const el = local.current; if (!el) return;
    const st = ScrollTrigger.create({ trigger: el, start: 'top 55%', end: 'bottom 55%', refreshPriority: -10, onToggle: (self) => (self.isActive ? enter(id, env) : leave(id)) });
    return () => { st.kill(); leave(id); };
  }, [env, id, enter, leave]);
  const e = ENV[env];
  return (
    <As
      ref={local}
      data-env={env}
      className={cn('scene relative isolate', className)}
      style={{ ['--env-bg' as string]: e.bg, ['--env-fg' as string]: e.fg, ['--env-muted' as string]: e.muted, ['--env-accent' as string]: e.accent, ['--env-line' as string]: e.line, color: e.fg, backgroundColor: solid ? e.bg : undefined, ...style }}
      {...rest}
    >
      {blend && <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-[1] h-40 sm:h-56" style={{ background: `linear-gradient(180deg, ${ENV[blend].bg} 0%, ${hexA(ENV[blend].bg, 0.6)} 35%, ${hexA(e.bg, 0)} 100%)` }} />}
      {children}
    </As>
  );
});

/** #rrggbb + alpha → rgba() for gradient stops */
function hexA(hex: string, a: number) { const n = parseInt(hex.slice(1), 16); return `rgb(${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255} / ${a})`; }
