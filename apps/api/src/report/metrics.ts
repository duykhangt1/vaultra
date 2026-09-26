/**
 * Pure helpers behind every dashboard and report number. One definition of each metric lives here (or in ReportService, which feeds
 * these helpers), so the same figure can never be worked out two different ways on two screens.
 */

/** Facilities whose units count toward occupancy (a draft or an inactive facility has no rentable stock). */
export const STOCK_FACILITY_STATUSES = ['ACTIVE', 'TEMPORARILY_CLOSED'];
/** Units that cannot be rented out any more; everything else (also under maintenance, waiting inspection, reserved) is rentable stock. */
export const NON_RENTABLE_UNIT_STATUSES = ['OUT_OF_SERVICE', 'RETIRED'];
/** A unit is occupied when a customer holds it: renting, or overlocked because of debt. */
export const OCCUPIED_UNIT_STATUSES = ['OCCUPIED', 'OVERLOCKED'];
/** Contracts that are currently earning rent for their unit. */
export const LIVE_CONTRACT_STATUSES = ['ACTIVE', 'MOVE_OUT_SCHEDULED', 'EXPIRED'];

export interface OccCounts {
  total: number;
  byStatus: Record<string, number>;
  rentable: number;
  occupied: number;
  areaRentable: number;
  areaOccupied: number;
  potentialRent: number;
  actualRent: number;
  activeContracts: number;
}

export const emptyOcc = (): OccCounts => ({ total: 0, byStatus: {}, rentable: 0, occupied: 0, areaRentable: 0, areaOccupied: 0, potentialRent: 0, actualRent: 0, activeContracts: 0 });
