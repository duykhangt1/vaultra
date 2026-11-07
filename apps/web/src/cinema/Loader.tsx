import * as React from 'react';
import { gsap, prefersReduced } from './motion';
import { onProgress, track } from './preload';
import BoxStage from './BoxStage';
import { initialBoxState, type BoxState } from './boxState';

import { SEEN, wantsIntro, markIntroDone } from './intro';
const CAP_MS = 3200; // never hold the page longer than this; late assets keep loading underneath
const MIN_SHOW_MS = 720; // brief enough to feel snappy, long enough to read the carton
const BG = 'radial-gradient(ellipse 80% 70% at 50% 42%, #8d7f72 0%, #75695f 48%, #4d433c 100%)'; // warm studio light fading to a dark corner
const STATUS: [number, string][] = [[0.34, 'ĐANG ĐÓNG GÓI'], [0.7, 'KIỂM TRA KHO'], [1.01, 'NIÊM PHONG']];

function webglAvailable() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}

/**
 * Signature intro — a thin, supple 3D kraft cardboard box (React Three Fiber). It glides in softly and
 * turns while the page loads. When loading finishes, the box pivots smoothly, its four paperboard flaps
 * peel open with a gentle flex, and the camera glides over the rim and dives into the carton.
 */
export default function SignatureLoader({ waitFor }: { waitFor?: () => Promise<unknown> }) {
  const [show, setShow] = React.useState(() => wantsIntro() && !prefersReduced() && webglAvailable());
  const root = React.useRef<HTMLDivElement>(null);
  const counter = React.useRef<HTMLSpanElement>(null);
  const bar = React.useRef<HTMLDivElement>(null);
  const veil = React.useRef<HTMLDivElement>(null);
  const status = React.useRef<HTMLSpanElement>(null);
  const [slow, setSlow] = React.useState(false);
  const finishing = React.useRef(false);
  const st = React.useRef<BoxState>(initialBoxState());
  const exit = React.useRef<gsap.core.Timeline | null>(null);

  React.useEffect(() => { if (!show) markIntroDone(); }, [show]);

  const play = React.useCallback((fast: boolean) => {
    if (finishing.current || !root.current) return;
    finishing.current = true;
    try { sessionStorage.setItem(SEEN, '1'); } catch { /* ignore */ }
    const el = root.current; const s = st.current;
    if (counter.current) counter.current.textContent = '100%';
    if (status.current) status.current.textContent = 'MỞ HỘP';
    const done = () => setShow(false);
    if (fast) { // skipped: no choreography, just a quick fade
      markIntroDone();
      gsap.to(el, { opacity: 0, duration: 0.32, ease: 'power2.out', onComplete: done });
      return;
    }
    const open = (key: 'front' | 'back' | 'left' | 'right', at: number) => ({ key, at });
    const page = document.getElementById('root');
    if (bar.current) gsap.set(bar.current, { scaleX: 1 });
    const tl = gsap.timeline({ onComplete: () => { if (page) gsap.set(page, { clearProps: 'transform,transformOrigin,willChange' }); done(); } });
    exit.current = tl;
    // 1 - soft anticipation cushion as the box turns toward the viewer
    tl.to(s, { squash: 0.65, duration: 0.18, ease: 'sine.out' }, 0)
      .to(s, { squash: 0, duration: 0.42, ease: 'sine.inOut' }, 0.18)
      .to(s, { az: 0.44, el: 0.64, r: 9.8, duration: 0.56, ease: 'sine.inOut' }, 0)
      .to(el.querySelectorAll('[data-hud]'), { opacity: 0, y: 8, duration: 0.3, ease: 'sine.in' }, 0.1);
    // 2 - four thin flaps peel open in a fluid overlapping wave
    [open('front', 0.22), open('back', 0.33), open('left', 0.44), open('right', 0.55)].forEach(({ key, at }) =>
      tl.to(s, { [key]: 128, duration: 0.52, ease: 'power3.out' }, at));
    // 3 - camera arcs over the open carton and looks straight down into it
    tl.to(s, { az: 0.06, el: 1.5, r: 10.2, ty: 0.3, duration: 0.7, ease: 'sine.inOut' }, 0.72);
    // 4 - the dive: down past the rim, the inside lights up, walls rush by as the lens widens
    tl.to(s, { r: 1.1, ty: 0.2, fov: 54, duration: 0.7, ease: 'power2.in' }, 1.4)
      .to(s, { glow: 1, duration: 0.7, ease: 'sine.in' }, 1.5)
      .to(s, { r: 0.1, ty: 0.02, fov: 96, duration: 0.5, ease: 'power3.in' }, 2.1)
      // 5 - warm light fills the frame ...
      .to(veil.current, { opacity: 1, duration: 0.36, ease: 'sine.in' }, 2.28)
      // 6 - ... and the page steps out of the box: it starts slightly too close and settles into place
      .add(() => { if (page) gsap.set(page, { transformOrigin: '50% 35%', scale: 1.12, willChange: 'transform' }); }, 2.62)
      .add(() => markIntroDone(), 2.66)
      .to(el, { opacity: 0, duration: 0.7, ease: 'sine.out' }, 2.66);
    if (page) tl.to(page, { scale: 1, duration: 1.05, ease: 'power3.out' }, 2.66);
  }, []);

  React.useLayoutEffect(() => {
    if (!show || !root.current) return;
    const el = root.current;
    const s = st.current;
    const shown = { v: 0 };
    let target = 0; let routeReady = !waitFor; let stableAt = 0; let introPlayed = false;
    const started = performance.now();
    const ctx = gsap.context(() => {
      // Soft, cushioned landing (no harsh mechanical bounce)
      gsap.timeline({ onComplete: () => { introPlayed = true; } })
        .to(s, { s: 1, duration: 0.52, ease: 'expo.out' }, 0.04)
        .to(s, { lift: 0, duration: 0.54, ease: 'power3.out' }, 0.04)
        .to(s, { squash: 0.85, duration: 0.14, ease: 'sine.out' }, 0.36)
        .to(s, { squash: 0, duration: 0.38, ease: 'elastic.out(1, 0.6)' }, 0.5)
        .from(el.querySelectorAll('[data-meta]'), { opacity: 0, y: 6, duration: 0.42, stagger: 0.06 }, 0.28);
      const tick = () => {
        if (finishing.current) return;
        shown.v += (target - shown.v) * 0.16;
        const v = Math.min(100, Math.round(shown.v * 100));
        if (counter.current) counter.current.textContent = `${String(v).padStart(3, '0')}%`;
        // while loading, the box floats and turns smoothly
        const t = performance.now();
        s.az = -0.58 + shown.v * 0.48 + Math.sin(t / 1400) * 0.04;
        s.el = 0.48 - shown.v * 0.04;
        // seen from far away at first, the camera drifts toward the carton while it loads
        s.r = 13.2 - shown.v * 3.8;
        if (bar.current) bar.current.style.transform = `scaleX(${Math.max(0.02, shown.v)})`;
        if (status.current) status.current.textContent = (STATUS.find(([lim]) => shown.v < lim) ?? STATUS[2])[1];
        if (introPlayed) s.lift = Math.sin(t / 650) * 0.025;
        if (t - started > 2200) setSlow(true);
        const allDone = routeReady && target >= 1;
        if (allDone && !stableAt) stableAt = t; if (!allDone) stableAt = 0;
        const ready = introPlayed && t - started > MIN_SHOW_MS && ((stableAt && t - stableAt > 110 && shown.v > 0.96) || t - started > CAP_MS);
        if (ready) {
          s.lift = 0;
          play(false);
        }
      };
      gsap.ticker.add(tick);
      return () => gsap.ticker.remove(tick);
    }, el);
    const off = onProgress(({ done, total }) => { target = total ? done / total : 0; });
    void track(document.fonts?.ready ?? Promise.resolve());
    if (waitFor) void track(waitFor().then(() => { routeReady = true; }), CAP_MS);
    return () => { off(); exit.current?.kill(); ctx.revert(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);

  React.useEffect(() => {
    if (!show) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') play(true); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [show, play]);

  if (!show) return null;
  return (
    <div ref={root} className="intro fixed inset-0 z-[100] overflow-hidden text-[#2a1c10]" style={{ background: BG }} role="status" aria-live="polite" aria-label="Đang tải Vaultra" onClick={() => play(true)}>
      <div className="grain absolute inset-0 opacity-40 mix-blend-multiply" aria-hidden />
      <div className="absolute inset-0" aria-hidden><BoxStage st={st} /></div>
      {/* vignette: pulls the eye to the carton */}
      <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(ellipse 70% 62% at 50% 46%, transparent 52%, rgba(24,16,10,.46) 100%)' }} aria-hidden />
      {/* warm light that floods the frame at the end of the dive */}
      <div ref={veil} className="pointer-events-none absolute inset-0 opacity-0" style={{ background: 'radial-gradient(circle at 50% 50%, #fff3d9 0%, #f3d9a8 38%, #d9ad6c 100%)' }} aria-hidden />
      <div data-hud className="absolute inset-x-0 top-0 flex items-center justify-between px-5 pt-5 sm:px-10 sm:pt-8">
        <span data-meta className="font-mono text-[11px] font-bold tracking-[0.42em] text-[#f3e6d2]/90">VAULTRA</span>
        <button data-meta type="button" onClick={(e) => { e.stopPropagation(); play(true); }} className="rounded-full border border-[#f3e6d2]/40 px-3.5 py-1.5 font-mono text-[10.5px] tracking-[0.18em] text-[#f3e6d2]/90 transition hover:border-[#f3e6d2] hover:bg-[#f3e6d2] hover:text-[#2a1c10]">BỎ QUA ↵</button>
      </div>
      <div data-hud className="absolute inset-x-0 bottom-0 px-5 pb-7 sm:px-10 sm:pb-10">
        <div className="mx-auto max-w-xl">
          <div className="mb-3 flex items-end justify-between font-mono text-[11px] tracking-[0.22em] text-[#f3e6d2]">
            <span data-meta ref={status}>ĐANG ĐÓNG GÓI</span>
            <span data-meta ref={counter} className="num text-[15px] font-bold tracking-[0.12em]">000%</span>
          </div>
          <div className="h-[3px] w-full overflow-hidden rounded-full bg-[#f3e6d2]/20"><div ref={bar} className="h-full origin-left rounded-full bg-gradient-to-r from-[#e7c486] to-[#fff1d2]" style={{ transform: 'scaleX(0.02)' }} /></div>
          {slow && <p className="mt-3 text-center text-[12px] text-[#f3e6d2]/75">Mạng chậm — nội dung vẫn tải tiếp</p>}
        </div>
      </div>
    </div>
  );
}
