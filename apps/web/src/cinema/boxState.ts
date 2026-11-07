/** Shared pose of the 3D box (kept free of three.js so always-loaded code can import it). */
/** Everything the choreography animates. Angles in degrees (flaps) / radians (camera). */
export interface BoxState {
  az: number; el: number; r: number; ty: number; fov: number; // camera orbit around (0, ty, 0)
  front: number; back: number; left: number; right: number;   // flap opening, 0 = closed, ~128 = swung out
  s: number; lift: number; squash: number;                    // box scale, vertical offset, and soft elastic cushion
  glow: number;                                               // warm light switched on inside the carton during the dive (0..1)
}
export const initialBoxState = (): BoxState => ({
  az: -0.58,
  el: 0.48,
  r: 9.4,
  ty: 0.55,
  fov: 30,
  front: 0,
  back: 0,
  left: 0,
  right: 0,
  s: 0.0001,
  lift: 1.05,
  squash: 0,
  glow: 0,
});
