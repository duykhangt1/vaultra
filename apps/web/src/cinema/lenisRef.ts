/**
 * Tiny, dependency-free handle on the Lenis instance (set by ./smooth). Lives apart so always-loaded
 * code such as the ScrollManager can scroll through Lenis without pulling Lenis/GSAP into the main bundle.
 */
interface LenisLike { resize: () => void; scrollTo: (target: number | HTMLElement, opts?: { immediate?: boolean; force?: boolean; offset?: number }) => void }
let current: LenisLike | null = null;
export const setLenis = (l: LenisLike | null) => { current = l; };
/** The live Lenis instance, or null when the page scrolls natively. */
export const getLenis = () => current;
/** Jump (or glide) to a y position through Lenis when it is running, natively otherwise. */
export function scrollToY(y: number, smooth = false) {
  // re-measure first: Lenis clamps targets to the page height it last saw, which lags behind fresh content
  if (current) { current.resize(); current.scrollTo(y, { immediate: !smooth, force: true }); }
  else window.scrollTo({ top: y, left: 0, behavior: (smooth ? 'smooth' : 'instant') as ScrollBehavior });
}
