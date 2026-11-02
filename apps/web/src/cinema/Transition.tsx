import * as React from 'react';
import { useLocation } from 'react-router-dom';
import { gsap, prefersReduced } from './motion';
import { initialBoxState, type BoxState } from './boxState';

// The 3D stage (three.js) is loaded lazily and kept mounted — the WebGL context is created once, not per navigation.
const BoxStage = React.lazy(() => import('./BoxStage'));
const BG = '#7a6e64'; // same flat brown-grey as the signature loader

/**
 * Route transition — the same supple 3D kraft cardboard box as the loader, in a brisk, fluid ~1.25 s pass.
 */
export function RouteCurtain({ labelFor, contentRef }: { labelFor: (path: string) => string; contentRef: React.RefObject<HTMLElement | null> }) {
  const { pathname } = useLocation();
  const root = React.useRef<HTMLDivElement>(null);
  const label = React.useRef<HTMLSpanElement>(null);
  const shownPath = React.useRef(pathname); // initial load / StrictMode re-runs never play the transition
  const st = React.useRef<BoxState>(initialBoxState());
  const ready = React.useRef(false); // canvas created
  const [mount, setMount] = React.useState(false); // load three.js once the page has settled
  const [active, setActive] = React.useState(false); // render loop only while a transition plays

  React.useEffect(() => {
    if (prefersReduced()) return;
    const ok = (() => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } })();
    if (!ok) return;
    const idle = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const h = idle ? idle(() => setMount(true), { timeout: 1200 }) : window.setTimeout(() => setMount(true), 600);
    return () => { if (idle) (window as unknown as { cancelIdleCallback?: (n: number) => void }).cancelIdleCallback?.(h); else window.clearTimeout(h); };
  }, []);

  React.useLayoutEffect(() => {
    if (shownPath.current === pathname) return;
    shownPath.current = pathname;
    const el = root.current; if (!el || prefersReduced()) return;
    const q = gsap.utils.selector(el);
    if (label.current) label.current.textContent = labelFor(pathname);
    const settle = (at: number) => contentRef.current && gsap.fromTo(contentRef.current, { y: 36 }, { y: 0, duration: 0.78, ease: 'expo.out', clearProps: 'transform', delay: at });

    // fallback: stage not ready -> quick cover fade, page still settles
    if (!mount || !ready.current) {
      const tl = gsap.timeline();
      tl.set(el, { visibility: 'visible', opacity: 1 }).set(q('[data-stage]'), { opacity: 0 })
        .to(el, { opacity: 0, duration: 0.36, ease: 'power2.out', delay: 0.08 }).set(el, { visibility: 'hidden' });
      settle(0.06);
      return () => { tl.kill(); gsap.set(el, { visibility: 'hidden' }); if (contentRef.current) gsap.set(contentRef.current, { clearProps: 'transform' }); };
    }

    const s = st.current;
    Object.assign(s, initialBoxState());
    setActive(true);
    const tl = gsap.timeline({ onComplete: () => setActive(false) });
    tl.set(el, { visibility: 'visible', opacity: 1 })
      .set(q('[data-stage]'), { opacity: 1 })
      .set(q('[data-label]'), { opacity: 0, y: 6 })
      // 1 — a closed carton glides in with a soft elastic cushion and turns smoothly
      .to(s, { s: 1, duration: 0.24, ease: 'expo.out' }, 0)
      .to(s, { lift: 0, duration: 0.26, ease: 'power3.out' }, 0)
      .to(s, { squash: 0.7, duration: 0.1, ease: 'sine.out' }, 0.14)
      .to(s, { squash: 0, duration: 0.24, ease: 'sine.inOut' }, 0.24)
      .to(s, { az: 0.44, el: 0.64, r: 9.8, duration: 0.36, ease: 'sine.inOut' }, 0.04)
      .to(q('[data-label]'), { opacity: 1, y: 0, duration: 0.22, ease: 'power2.out' }, 0.08);
    // 2 — four thin flaps peel open with a gentle paper flex
    (['front', 'back', 'left', 'right'] as const).forEach((k, i) => tl.to(s, { [k]: 128, duration: 0.34, ease: 'power3.out' }, 0.22 + i * 0.065));
    // 3 — camera arcs over the opening and dives smoothly into the box while the cover dissolves
    tl.to(s, { az: 0.06, el: 1.46, r: 10.4, ty: 0.32, duration: 0.44, ease: 'sine.inOut' }, 0.56)
      .to(s, { r: 0.52, ty: 0.12, fov: 62, duration: 0.38, ease: 'power3.in' }, 0.94)
      .to(q('[data-label]'), { opacity: 0, duration: 0.16 }, 0.94)
      .to(el, { opacity: 0, duration: 0.24, ease: 'sine.out' }, 1.12)
      .set(el, { visibility: 'hidden' });
    settle(1.06);
    return () => { tl.kill(); setActive(false); gsap.set(el, { visibility: 'hidden' }); if (contentRef.current) gsap.set(contentRef.current, { clearProps: 'transform' }); };
  }, [pathname, labelFor, contentRef, mount]);

  return (
    <div ref={root} aria-hidden className="pointer-events-none fixed inset-0 z-[80]" style={{ visibility: 'hidden', background: BG }}>
      <div className="grain absolute inset-0 opacity-40 mix-blend-multiply" />
      <div data-stage className="absolute inset-0">
        {mount && (
          <React.Suspense fallback={null}>
            <ReadyFlag onReady={() => { ready.current = true; }} />
            <BoxStage st={st} active={active} />
          </React.Suspense>
        )}
      </div>
      <p data-label className="absolute inset-x-0 bottom-[12%] flex items-center justify-center gap-4 font-mono text-[12px] uppercase tracking-[0.32em] text-[#2a1c10]"><span className="h-px w-10 bg-current" /><span ref={label} /><span className="h-px w-10 bg-current" /></p>
    </div>
  );
}

/** Rendered inside Suspense next to the stage: mounts only once the lazy chunk has resolved. */
function ReadyFlag({ onReady }: { onReady: () => void }) {
  React.useEffect(() => { onReady(); }, [onReady]);
  return null;
}
