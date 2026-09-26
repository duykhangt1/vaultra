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
