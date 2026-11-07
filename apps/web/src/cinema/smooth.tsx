/**
 * Lenis smooth scrolling, driven by the GSAP ticker so ScrollTrigger scrubs, pins and Lenis share one
 * clock (no double rAF, no jitter between the scroll position and the scrubbed timelines).
 *
 * Only on the public site, only when motion is allowed and the user hasn't paused motion.
 * Touch devices keep native scrolling (Lenis' default) — momentum on phones is already good and
 * hijacking it costs battery. Nested scroll areas (menus, chat, dialogs) keep scrolling on their own,
 * and any Radix dialog's scroll lock stops Lenis while it is open.
 */
import * as React from 'react';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';
import { setLenis } from './lenisRef';
import { gsap, ScrollTrigger, prefersReduced, useCinema } from './motion';

export { getLenis, scrollToY } from './lenisRef';

export function SmoothScroll() {
  const paused = useCinema((s) => s.paused);
  React.useEffect(() => {
    if (paused || prefersReduced()) return;
    const l = new Lenis({
      autoRaf: false,
      lerp: 0.1,
      wheelMultiplier: 0.9,
      anchors: { offset: -72 },
      allowNestedScroll: true,
      // leave form controls with their own scroll (selects, textareas) and explicit opt-outs alone
      prevent: (node) => node.closest?.('[data-lenis-prevent], textarea, select, [role="listbox"], [role="dialog"]') != null,
    });
    setLenis(l);
    l.on('scroll', ScrollTrigger.update);
    const tick = (time: number) => l.raf(time * 1000);
    gsap.ticker.add(tick);

    // Radix dialogs mark <body data-scroll-locked> while open — stop Lenis so the page doesn't move behind them
    const sync = () => (document.body.hasAttribute('data-scroll-locked') ? l.stop() : l.start());
    const mo = new MutationObserver(sync);
    mo.observe(document.body, { attributes: true, attributeFilter: ['data-scroll-locked', 'style'] });
    sync();
    ScrollTrigger.refresh();
    return () => {
      mo.disconnect();
      gsap.ticker.remove(tick);
      l.destroy();
      setLenis(null);
    };
  }, [paused]);
  return null;
}
