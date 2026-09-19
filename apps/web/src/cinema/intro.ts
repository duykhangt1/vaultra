/** Cheap, dependency-free check so signed-in areas never download the intro or GSAP. */
export const SEEN = 'vaultra.intro-seen.v2';
export function wantsIntro() {
  if (typeof window === 'undefined') return false;
  let seen = false; try { seen = sessionStorage.getItem(SEEN) === '1'; } catch { /* ignore */ }
  let force = true; try { force = localStorage.getItem('vaultra.force-motion') !== '0' || new URLSearchParams(window.location.search).get('motion') === 'full'; } catch { /* ignore */ }
  const reduce = !force && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return !seen && !reduce && !/^\/(app|staff|manage|ops|admin)(\/|$)/.test(window.location.pathname);
}

/* "intro finished" signal — starts as finished whenever this page load has no intro, so scenes that
   wait for it (hero entrance) never stay hidden. */
let done = !wantsIntro();
const subs = new Set<() => void>();
export const isIntroDone = () => done;
export function markIntroDone() { if (done) return; done = true; subs.forEach((f) => f()); subs.clear(); }
export function onIntroDone(cb: () => void) { if (done) { cb(); return () => undefined; } subs.add(cb); return () => { subs.delete(cb); }; }
