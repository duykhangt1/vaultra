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
