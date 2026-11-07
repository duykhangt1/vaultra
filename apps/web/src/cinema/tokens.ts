/**
 * Cinematic design tokens — "Một đêm đi vào két sắt" (see DESIGN_SYSTEM.md §13).
 * Each scene of the public site belongs to one visual environment. The atmosphere layer behind
 * the page crossfades between environments as the reader moves from scene to scene.
 */
export type EnvId = 'street' | 'corridor' | 'blueprint' | 'paper' | 'vault' | 'dusk' | 'receipt' | 'dawn' | 'night';

export interface Env {
  /** atmosphere colour behind the scene */
  bg: string;
  /** main text colour */
  fg: string;
  /** secondary text */
  muted: string;
  /** signal / accent colour of the scene */
  accent: string;
  /** hairlines and dividers */
  line: string;
  /** light scenes get a paper header, dark scenes a glass-ink header */
  tone: 'dark' | 'light';
  /** short label shown by the route curtain and scene index */
  label: string;
}

export const ENV: Record<EnvId, Env> = {
  // sodium street light on wet asphalt — the arrival
  street: { bg: '#070f1b', fg: '#f6f3ec', muted: '#b9c2cd', accent: '#ddb065', line: 'rgb(255 255 255 / 0.12)', tone: 'dark', label: 'Phố đêm' },
  // cool LED corridor between roller doors
  corridor: { bg: '#0a1626', fg: '#f6f3ec', muted: '#b9c2cd', accent: '#ddb065', line: 'rgb(255 255 255 / 0.1)', tone: 'dark', label: 'Hành lang' },
  // drafting table: warm paper, blueprint grid, ink lines
  blueprint: { bg: '#f1ede3', fg: '#0e1b2c', muted: '#46546a', accent: '#96691f', line: 'rgb(14 27 44 / 0.12)', tone: 'light', label: 'Bản vẽ' },
  // reading surface
  paper: { bg: '#f6f3ec', fg: '#0e1b2c', muted: '#5b6b7d', accent: '#96691f', line: 'rgb(14 27 44 / 0.1)', tone: 'light', label: 'Giấy' },
  // inside the vault: blue-black steel, brass when access opens
  vault: { bg: '#070d15', fg: '#f6f3ec', muted: '#b9c2cd', accent: '#ddb065', line: 'rgb(221 176 101 / 0.16)', tone: 'dark', label: 'Két sắt' },
  // people & their reasons — dusk blue
  dusk: { bg: '#10172a', fg: '#f6f3ec', muted: '#b9c2cd', accent: '#ddb065', line: 'rgb(255 255 255 / 0.1)', tone: 'dark', label: 'Hoàng hôn' },
  // the receipt: everything priced, nothing hidden
  receipt: { bg: '#ece6d8', fg: '#0e1b2c', muted: '#46546a', accent: '#96691f', line: 'rgb(14 27 44 / 0.14)', tone: 'light', label: 'Biên nhận' },
  // moving day at first light
  dawn: { bg: '#140e08', fg: '#fbf3e4', muted: '#d9c9ae', accent: '#ddb065', line: 'rgb(221 176 101 / 0.2)', tone: 'dark', label: 'Bình minh' },
  // footer / generic dark
  night: { bg: '#08121f', fg: '#f6f3ec', muted: '#b9c2cd', accent: '#ddb065', line: 'rgb(255 255 255 / 0.1)', tone: 'dark', label: 'Đêm' },
};

/** Motion timing (seconds, GSAP units). Mirrors the --dur-* CSS variables. */
export const DUR = { micro: 0.15, quick: 0.3, base: 0.6, slow: 0.9, scene: 1.2, ambient: 16 } as const;

/** Easing curves. "vault" = heavy door settling; "shutter" = roller door, fast start / soft stop. */
export const EASE = {
  vault: 'power3.out',
  shutter: 'expo.inOut',
  lift: 'expo.out',
  drift: 'sine.inOut',
  type: 'power4.out',
} as const;

/** Depth layers used for parallax: speed multiplier relative to scroll (1 = normal flow). */
export const DEPTH = { far: 0.35, back: 0.6, mid: 0.85, front: 1.15, near: 1.35 } as const;

/**
 * Full motion is ON for everyone by default — including machines whose OS asks for reduced motion
 * (product decision: the cinematic experience always plays). Visitors can still stop background motion
 * with the "Dừng chuyển động" button. Developers can follow the OS setting with `?motion=auto`
 * (stored per browser; `?motion=full` switches back).
 */
export const FORCE_MOTION = (() => {
  if (typeof window === 'undefined') return true;
  let on = true;
  try {
    const m = new URLSearchParams(window.location.search).get('motion');
    if (m === 'full') localStorage.removeItem('vaultra.force-motion');
    if (m === 'auto') localStorage.setItem('vaultra.force-motion', '0');
    on = localStorage.getItem('vaultra.force-motion') !== '0';
  } catch { /* private mode: keep the default */ }
  document.documentElement.classList.toggle('force-motion', on);
  return on;
})();
const OK = FORCE_MOTION ? '' : ' and (prefers-reduced-motion: no-preference)';

/** Breakpoints for motion strategies (match Tailwind lg / md). */
export const MQ = {
  desktop: `(min-width: 1024px)${OK}`,
  tablet: `(min-width: 768px) and (max-width: 1023.98px)${OK}`,
  mobile: `(max-width: 767.98px)${OK}`,
  /** any device that allows motion */
  any: FORCE_MOTION ? 'all' : '(prefers-reduced-motion: no-preference)',
  wide: `(min-width: 768px)${OK}`,
  reduce: FORCE_MOTION ? 'not all' : '(prefers-reduced-motion: reduce)',
  fine: '(hover: hover) and (pointer: fine)',
};
