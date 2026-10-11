/**
 * Turns "pick a table, add some conditions" into a SQL SELECT for the Database tab's console, and into a sentence a
 * non-SQL person can read. Pure functions (no React) so the generated SQL is also tested against the real SQL engine.
 */
export type QCol = { name: string; type: string; sensitive?: boolean; pk?: boolean; fk?: { table: string; column: string } };
export type Op = 'contains' | 'starts' | 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'null' | 'notnull';
export type Cond = { id: number; column: string; op: Op; value: string };
/** An extra table joined through a foreign key of the main table, from which a few columns are shown. */
export type Relation = { fkColumn: string; table: string; refColumn: string; columns: string[] };
export type Spec = {
  table: string;
  allColumns: boolean;
  columns: string[];
  conds: Cond[];
  mode: 'AND' | 'OR';
  sortBy: string;
  sortDir: 'ASC' | 'DESC';
  limit: number;
  relations: Relation[];
};

function normalizeTenantSignatureIsBoolQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 15)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildSecondaryEscalationRelationReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}
