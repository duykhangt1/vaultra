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
