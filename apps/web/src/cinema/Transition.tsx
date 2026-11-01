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
}

/** Rendered inside Suspense next to the stage: mounts only once the lazy chunk has resolved. */
function ReadyFlag({ onReady }: { onReady: () => void }) {
  React.useEffect(() => { onReady(); }, [onReady]);
  return null;
}
