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

export function sumOcc(list: OccCounts[]): OccCounts {
  const out = emptyOcc();
  for (const c of list) {
    out.total += c.total;
    out.rentable += c.rentable;
    out.occupied += c.occupied;
    out.areaRentable += c.areaRentable;
    out.areaOccupied += c.areaOccupied;
    out.potentialRent += c.potentialRent;
    out.actualRent += c.actualRent;
    out.activeContracts += c.activeContracts;
    for (const [k, v] of Object.entries(c.byStatus)) out.byStatus[k] = (out.byStatus[k] ?? 0) + v;
  }
  return out;
}

/** The three occupancy rates and the average rent, always from the same counts, so a total row equals the headline figure. */
export function occRates(c: Pick<OccCounts, 'rentable' | 'occupied' | 'areaRentable' | 'areaOccupied' | 'potentialRent' | 'actualRent' | 'activeContracts'>) {
  return {
    unitRate: c.rentable ? c.occupied / c.rentable : 0,
    areaRate: c.areaRentable ? c.areaOccupied / c.areaRentable : 0,
    economicRate: c.potentialRent ? c.actualRent / c.potentialRent : 0,
    avgRent: c.activeContracts ? c.actualRent / c.activeContracts : 0,
  };
}

export interface RevenueParts {
  billed: number;
  collected: number;
  recognized: number;
  refunded: number;
  /** The rent part of `recognized` (service days that fall inside the period). */
  rentRecognized: number;
}
export const emptyRevenue = (): RevenueParts => ({ billed: 0, collected: 0, recognized: 0, refunded: 0, rentRecognized: 0 });
export function sumRevenue(list: RevenueParts[]): RevenueParts {
  const out = emptyRevenue();
  for (const r of list) {
    out.billed += r.billed;
    out.collected += r.collected;
    out.recognized += r.recognized;
    out.refunded += r.refunded;
    out.rentRecognized += r.rentRecognized;
  }
  return out;
}

export interface AgingBuckets {
  current: number;
  d0_30: number;
  d31_60: number;
  d61_90: number;
  d90_plus: number;
}
