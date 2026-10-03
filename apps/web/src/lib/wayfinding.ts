/**
 * 2D/3D Architectural Floor-Plan Wayfinding Engine.
 * Computes obstacle-aware A* corridor routes from LỐI VÀO CHÍNH to any storage unit's doorway,
 * keeping paths centered along corridors and generating Vietnamese turn-by-turn walking directions.
 */

export interface PlanBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Waypoint2D {
  x: number;
  y: number;
}

export type StepKind = 'start' | 'straight' | 'left' | 'right' | 'arrive';

export interface WayfindingStep {
  index: number;
  kind: StepKind;
  instruction: string;
  distanceM?: number;
}

export interface WayfindingResult {
  waypoints: Waypoint2D[];
  distancePx: number;
  distanceM: number;
  durationSec: number;
  durationLabel: string;
  steps: WayfindingStep[];
  entrance: Waypoint2D;
  destination: Waypoint2D;
}

/** Scale calibrated for walking paths (~18px = 1m) and normal indoor walking pace (~1.2m/s). */
export const PX_PER_METER = 18;
