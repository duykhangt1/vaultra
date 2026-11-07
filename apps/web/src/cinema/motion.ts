/**
 * Central motion engine. Every animated component goes through `useScene`, which scopes GSAP to one
 * DOM subtree and reverts tweens, ScrollTriggers, SplitTexts and matchMedia branches on unmount —
 * so route changes never leak timelines or observers.
 */
import { useLayoutEffect, type DependencyList, type RefObject } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { MorphSVGPlugin } from 'gsap/MorphSVGPlugin';
import { create } from 'zustand';
import { MQ } from './tokens';
import { onIntroDone } from './intro';

gsap.registerPlugin(ScrollTrigger, SplitText, MorphSVGPlugin);
gsap.config({ nullTargetWarn: false });
ScrollTrigger.config({ ignoreMobileResize: true });
gsap.defaults({ ease: 'power3.out', duration: 0.6 });
// QA (`?motion=full` in the URL): follow wall-clock time even in throttled/background tabs
if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('motion') === 'full') gsap.ticker.lagSmoothing(0);

export { gsap, ScrollTrigger, SplitText };

const mq = (q: string) => typeof window !== 'undefined' && window.matchMedia(q).matches;
/** False whenever full motion is on (the default) — see FORCE_MOTION in ./tokens. */
export const prefersReduced = () => mq(MQ.reduce);
export const finePointer = () => mq(MQ.fine);
export const saveData = () => typeof navigator !== 'undefined' && !!(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
/** Phones / low-memory devices get the lightweight motion strategy and no WebGL. */
export function lowPower() {
  if (typeof navigator === 'undefined') return true;
  const n = navigator as Navigator & { deviceMemory?: number };
  return (n.deviceMemory !== undefined && n.deviceMemory <= 4) || (n.hardwareConcurrency ?? 8) <= 4 || mq('(max-width: 767.98px)');
}

type Setup = (api: { mm: gsap.MatchMedia; q: (sel: string) => Element[] }) => void | (() => void);

/** Scoped GSAP setup with automatic cleanup. Use `mm.add(MQ.desktop, …)` for per-device strategies. */
export function useScene(scope: RefObject<HTMLElement | null>, setup: Setup, deps: DependencyList = []) {
  useLayoutEffect(() => {
    const el = scope.current;
    if (!el) return;
    const ctx = gsap.context(() => {
      const mm = gsap.matchMedia();
      const done = setup({ mm, q: gsap.utils.selector(el) });
      return () => { mm.revert(); if (typeof done === 'function') done(); };
    }, el);
    return () => ctx.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/* Background motion always plays (no pause control on the site). `paused` stays as a hook point for
   the video/scroll components; older builds stored a paused flag, which is cleared here. */
interface CinemaState { paused: boolean }
export const useCinema = create<CinemaState>(() => ({ paused: false }));
if (typeof document !== 'undefined') {
  try { localStorage.removeItem('vaultra.motion-paused'); } catch { /* private mode */ }
  document.documentElement.classList.remove('motion-paused');
}

/** Resolves once the signature intro has lifted (immediately when there is no intro). */
export const afterIntro = onIntroDone;

/** Keeps ScrollTrigger measurements right while API data, images and fonts change page height. */
let refreshTimer: number | undefined;
export function scheduleRefresh(delay = 180) {
  window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(() => ScrollTrigger.refresh(), delay);
}
