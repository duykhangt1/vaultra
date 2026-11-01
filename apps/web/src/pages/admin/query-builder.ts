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

const NUMERIC = /^(Int|BigInt|Decimal|Float)$/;
export const isNumeric = (type: string) => NUMERIC.test(type);
export const isBool = (type: string) => type === 'Boolean';
export const isDate = (type: string) => type === 'DateTime';

export const OP_LABEL: Record<Op, string> = {
  contains: 'có chứa',
  starts: 'bắt đầu bằng',
  eq: 'bằng',
  ne: 'khác',
  gt: 'lớn hơn',
  gte: 'lớn hơn hoặc bằng',
  lt: 'nhỏ hơn',
  lte: 'nhỏ hơn hoặc bằng',
  in: 'là một trong (cách nhau dấu phẩy)',
  null: 'để trống',
  notnull: 'có giá trị',
};
const DATE_LABEL: Partial<Record<Op, string>> = { gt: 'sau', gte: 'từ ngày (gồm cả ngày đó)', lt: 'trước', lte: 'đến ngày (gồm cả ngày đó)' };
export const opLabel = (op: Op, type: string) => (isDate(type) ? DATE_LABEL[op] : undefined) ?? OP_LABEL[op];
