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

/** Which comparisons make sense for a column type. */
export function opsFor(type: string): Op[] {
  if (isBool(type)) return ['eq', 'null', 'notnull'];
  if (isNumeric(type)) return ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'null', 'notnull'];
  if (isDate(type)) return ['gte', 'lte', 'gt', 'lt', 'contains', 'null', 'notnull'];
  return ['contains', 'starts', 'eq', 'ne', 'in', 'null', 'notnull'];
}

const needsValue = (op: Op) => op !== 'null' && op !== 'notnull';
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const ident = (alias: string | null, name: string) => (alias ? `${alias}.${name}` : name);

function literal(col: QCol, raw: string): { sql: string } | { error: string } {
  const v = raw.trim();
  if (isNumeric(col.type)) return /^-?\d+(\.\d+)?$/.test(v) ? { sql: v } : { error: `"${col.name}" là số: nhập chữ số, ví dụ 150000` };
  if (isBool(col.type)) return { sql: /^(true|đúng|1)$/i.test(v) ? 'true' : 'false' };
  return { sql: q(v) };
}

function condSql(c: Cond, col: QCol, alias: string | null): { sql: string } | { error: string } {
  const id = ident(alias, c.column);
  if (c.op === 'null') return { sql: `${id} IS NULL` };
  if (c.op === 'notnull') return { sql: `${id} IS NOT NULL` };
  if (!c.value.trim()) return { error: `Chưa nhập giá trị cho "${c.column}"` };
  if (c.op === 'contains' || c.op === 'starts') {
    const v = c.value.trim();
    // case-insensitive; a null cell is turned into '' so UPPER never sees null
    return { sql: `UPPER(IFNULL(${id}, '')) LIKE UPPER(${q(c.op === 'contains' ? `%${v}%` : `${v}%`)})` };
  }
  if (c.op === 'in') {
    const parts = c.value.split(',').map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return { error: `Chưa nhập giá trị cho "${c.column}"` };
    const lits = parts.map((p) => literal(col, p));
    const bad = lits.find((l) => 'error' in l) as { error: string } | undefined;
    if (bad) return bad;
    return { sql: `${id} IN (${lits.map((l) => (l as { sql: string }).sql).join(', ')})` };
  }
  let value = c.value;
  // dates are stored as ISO timestamps: "to / after this day" must include the whole day
  if (isDate(col.type) && /^\d{4}-\d{2}-\d{2}$/.test(value.trim()) && (c.op === 'lte' || c.op === 'gt')) value = `${value.trim()}T23:59:59.999Z`;
  const l = literal(col, value);
  if ('error' in l) return l;
  const sym = { eq: '=', ne: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' }[c.op as 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte'];
  return { sql: `${id} ${sym} ${l.sql}` };
}

export function buildSql(spec: Spec, cols: QCol[]): { sql: string; errors: string[] } {
  const errors: string[] = [];
  const byName = new Map(cols.map((c) => [c.name, c]));
  const joined = spec.relations.filter((r) => r.columns.length > 0);
  const alias = joined.length ? 't0' : null;

  const picked = spec.allColumns ? [] : spec.columns.filter((c) => byName.has(c));
  const select: string[] = [];
  if (spec.allColumns) select.push(alias ? `${alias}.*` : '*');
  else if (picked.length) picked.forEach((c) => select.push(ident(alias, c)));
  else errors.push('Chọn ít nhất 1 cột để hiển thị');
  joined.forEach((r, i) => r.columns.forEach((c) => select.push(`t${i + 1}.${c} AS ${r.table}_${c}`)));

  const wheres: string[] = [];
  for (const c of spec.conds) {
    const col = byName.get(c.column);
    if (!col) { errors.push('Có điều kiện chưa chọn cột'); continue; }
    const r = condSql(c, col, alias);
    if ('error' in r) errors.push(r.error);
    else wheres.push(r.sql);
  }

  let sql = `SELECT ${select.join(', ') || '*'}\nFROM ${spec.table}${alias ? ` ${alias}` : ''}`;
  joined.forEach((r, i) => { sql += `\nLEFT JOIN ${r.table} t${i + 1} ON t${i + 1}.${r.refColumn} = t0.${r.fkColumn}`; });
  if (wheres.length) sql += `\nWHERE ${wheres.map((w) => (wheres.length > 1 && spec.mode === 'OR' ? `(${w})` : w)).join(spec.mode === 'OR' ? '\n   OR ' : '\n  AND ')}`;
  if (spec.sortBy && byName.has(spec.sortBy)) sql += `\nORDER BY ${ident(alias, spec.sortBy)} ${spec.sortDir}`;
  const limit = Math.min(1000, Math.max(1, Math.floor(Number(spec.limit)) || 50));
  sql += `\nLIMIT ${limit}`;
  return { sql, errors };
}

/** The same query as a sentence. */
export function describeSpec(spec: Spec, cols: QCol[]): string {
  const byName = new Map(cols.map((c) => [c.name, c]));
  const what = spec.allColumns ? 'tất cả các cột' : spec.columns.length ? `cột ${spec.columns.join(', ')}` : 'các cột (chưa chọn)';
  const rel = spec.relations.filter((r) => r.columns.length);
  let s = `Lấy ${what} của bảng ${spec.table}`;
  if (rel.length) s += `, kèm ${rel.map((r) => `${r.columns.join(', ')} của bảng ${r.table}`).join('; ')}`;
  const conds = spec.conds.filter((c) => c.column).map((c) => {
    const type = byName.get(c.column)?.type ?? 'String';
    return `${c.column} ${c.op === 'in' ? 'là một trong' : opLabel(c.op, type)}${needsValue(c.op) ? ` "${c.value}"` : ''}`;
  });
  s += conds.length ? `, chỉ lấy những dòng có ${conds.join(spec.mode === 'OR' ? ' HOẶC ' : ' VÀ ')}` : ', lấy mọi dòng';
  if (spec.sortBy) s += `, sắp xếp theo ${spec.sortBy} ${spec.sortDir === 'DESC' ? 'giảm dần' : 'tăng dần'}`;
  return `${s}, tối đa ${Math.min(1000, Math.max(1, Math.floor(Number(spec.limit)) || 50))} dòng.`;
}

export const needsValueFor = needsValue;
export const emptySpec = (table = ''): Spec => ({ table, allColumns: true, columns: [], conds: [], mode: 'AND', sortBy: '', sortDir: 'DESC', limit: 50, relations: [] });
