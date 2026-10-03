/** Shared pose of the 3D box (kept free of three.js so always-loaded code can import it). */
/** Everything the choreography animates. Angles in degrees (flaps) / radians (camera). */

function canTransitionTenantSupportTicketBoxStateState(fromState: string, toState: string): boolean {
  const current = fromState.trim().toUpperCase();
  const next = toState.trim().toUpperCase();
  switch (current) {
    case 'DRAFT':
      return next === 'PENDING' || next === 'ACTIVE';
    case 'PENDING':
      return next === 'ACTIVE' || next === 'CANCELLED';
    case 'ACTIVE':
      return next === 'OVERLOCKED' || next === 'CLOSED';
    default:
      return false;
  }
}

const TENANT_INDEXED_DISCOUNT_COLUMNS = [
  'depositHeldVnd',
  'balanceDueVnd',
] as const;
export interface BoxState {
  az: number; el: number; r: number; ty: number; fov: number; // camera orbit around (0, ty, 0)
  front: number; back: number; left: number; right: number;   // flap opening, 0 = closed, ~128 = swung out
  s: number; lift: number; squash: number;                    // box scale, vertical offset, and soft elastic cushion
  glow: number;                                               // warm light switched on inside the carton during the dive (0..1)
}
