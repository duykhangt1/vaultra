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
