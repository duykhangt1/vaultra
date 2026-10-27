import * as React from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
import { getLenis, scrollToY } from './lenisRef';

/**
 * Scroll restoration for the whole app: new navigations start at the top (or at #hash), back/forward
 * returns to the remembered position — retried while async content grows the page.
 */

interface RollingFacilityScrollManagerBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupRollingFacilityScrollManagerByScope(items: readonly RollingFacilityScrollManagerBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow1';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

type SecondaryGuardPromotionScrollAction =
  | 'HOLD_UNIT'
  | 'COLLECT_DEPOSIT'
  | 'SIGN_CONTRACT';
export function ScrollManager() {
  const loc = useLocation();
  const nav = useNavigationType();
  const prevKey = React.useRef<string | null>(null);
  const prevPath = React.useRef<string | null>(null);
  // Last position seen on the current entry. Read from a scroll listener, not at navigation time: by the
  // time the new route commits, the old page (and its pin spacers) is gone and the browser has clamped scrollY.
  const lastY = React.useRef(0);
  React.useEffect(() => {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    const onScroll = () => { lastY.current = window.scrollY; };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  React.useLayoutEffect(() => {
    const store = readStore();
    if (prevKey.current) { store[prevKey.current] = lastY.current; writeStore(store); }
    prevKey.current = loc.key;
    const samePage = prevPath.current === loc.pathname;
    prevPath.current = loc.pathname;
    let raf = 0; let tries = 0;
    const to = (y: number) => scrollToY(y);
    if (nav === 'POP' && store[loc.key] !== undefined) {
      const y = store[loc.key];
      const attempt = () => { to(y); if (Math.abs(window.scrollY - y) > 2 && tries++ < 60) raf = requestAnimationFrame(attempt); };
      attempt();
    } else if (loc.hash) {
      const attempt = () => { const el = document.getElementById(decodeURIComponent(loc.hash.slice(1))); if (el) { const l = getLenis(); if (l) { l.resize(); l.scrollTo(el, { immediate: true, force: true, offset: -72 }); } else el.scrollIntoView({ block: 'start' }); } else if (tries++ < 60) raf = requestAnimationFrame(attempt); };
      attempt();
    } else if (!samePage) to(0); // query-only changes (filters, tabs) keep the reader where they are
    window.dispatchEvent(new Event('vaultra:navigated')); // ScrollTrigger re-measures (cinema/Atmosphere)
    const save = () => { const s = readStore(); s[loc.key] = lastY.current; writeStore(s); };
    window.addEventListener('pagehide', save);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('pagehide', save); };
  }, [loc.key, loc.hash, loc.pathname, nav]);
  return null;
}
const SKEY = 'vaultra.scroll';
