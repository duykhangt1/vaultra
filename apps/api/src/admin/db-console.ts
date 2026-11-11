/**
 * Admin database console: table browser, row editor and a small SQL console over the in-memory (R2-backed) store.
 *
 * The SQL console runs on alasql against *copies* of the tables referenced by the statement. SELECT never touches the store;
 * UPDATE / DELETE / INSERT are parsed here, the matching rows are found with a SELECT on the copy and the changes are then
 * applied through the store's own delegates (unique checks, updated_at, undo log, snapshot sync) inside one transaction.
 * Everything the user types is checked by `sanitizeSql` first (character + keyword allow-list), so alasql's file / network /
 * JavaScript extensions are unreachable.
 */
import alasql from 'alasql';
import { DB_MODELS, DB_TABLE_MODEL, dbEq, type DbFieldMeta, type DbModelMeta } from '../common/r2-prisma';
import { validation } from '../common/errors';

// ----------------------------------------------------------------------------------------------- schema description

const SENSITIVE = /(password|passwd|secret|token|_enc$|^pin(_|$)|otp|mfa|recovery|private_key|api_key|_hash$)/i;
/** Computed by the database in MySQL (stored generated columns); never written by hand. */
const GENERATED = new Set(['facility_key', 'active_key', 'open_unit_key', 'active_pin_key', 'active_contract_key', 'balance_due', 'area_m2', 'volume_m3']);
/** Append-only evidence: browsable, never editable from the console. */
const READONLY_TABLES = new Set(['audit_logs']);

export const MAX_RESULT_ROWS = 1000;
export const MAX_AFFECTED_ROWS = 1000;
const CELL_PREVIEW = 300;

export interface ColumnInfo {
  name: string;
  type: string;
  enumType?: string;
  nullable: boolean;
  pk: boolean;
  hasDefault: boolean;
  sensitive: boolean;
  generated: boolean;
  fk?: { table: string; column: string };
}
export interface TableInfo {
  table: string;
  model: string;
  delegate: string;
  pk: string[];
  readonly: boolean;
  columns: ColumnInfo[];
}

const sensitive = (name: string) => SENSITIVE.test(name);

export function modelOf(table: string): DbModelMeta {
  const m = DB_TABLE_MODEL[table];
  if (!m) throw validation(`Bảng "${table}" không tồn tại`);
  return m;
}

export function isReadonlyTable(model: DbModelMeta) {
  return READONLY_TABLES.has(model.tableName);
}

export function describeTable(model: DbModelMeta): TableInfo {
  const fk = new Map<string, { table: string; column: string }>();
  for (const rel of Object.values(model.relations)) {
    if (rel.isList || rel.localFields?.length !== 1 || rel.foreignFields?.length !== 1) continue;
    const target = DB_MODELS[rel.targetModel];
    if (target) fk.set(rel.localFields[0], { table: target.tableName, column: rel.foreignFields[0] });
  }
  return {
    table: model.tableName,
    model: model.name,
    delegate: model.delegate,
    pk: model.pk,
    readonly: isReadonlyTable(model),
    columns: Object.values(model.fields).map((f) => ({
      name: f.name,
      type: f.type,
      enumType: f.enumType,
      nullable: f.isOptional,
      pk: model.pk.includes(f.name),
      hasDefault: !!f.default,
      sensitive: sensitive(f.name),
      generated: GENERATED.has(f.name),
      fk: fk.get(f.name),
    })),
  };
}

export const allModels = () => Object.values(DB_MODELS).sort((a, b) => a.tableName.localeCompare(b.tableName));

// -------------------------------------------------------------------------------------------------- value handling

/** JSON-safe cell for the grid. Secrets are masked, binaries summarised, long text cut (full value via `full`). */
export function cell(f: DbFieldMeta | undefined, v: unknown, full = false): unknown {
  if (v === null || v === undefined) return null;
  if (f && sensitive(f.name)) return '••••••';
  if (typeof v === 'bigint') return v.toString();
  if (v instanceof Date) return v.toISOString();
  if (Buffer.isBuffer(v) || v instanceof Uint8Array) return `[nhị phân ${v.length} byte]`;
  if (typeof v === 'string') return !full && v.length > CELL_PREVIEW ? `${v.slice(0, CELL_PREVIEW)}…` : v;
  if (typeof v === 'object') {
    const s = JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? x.toString() : x));
    return !full && s.length > CELL_PREVIEW ? `${s.slice(0, CELL_PREVIEW)}…` : full ? v : s;
  }
  return v;
}

export function serializeRow(model: DbModelMeta, row: Record<string, any>, full = false) {
  const out: Record<string, unknown> = {};
  for (const f of Object.values(model.fields)) out[f.name] = cell(f, row[f.name], full);
  return out;
}

/**
 * Column-ordered cells for HTTP responses. The global SerializeInterceptor rewrites objects that have a `public_id`
 * (drops it, turns it into `id`) and removes keys such as `*_hash`, which would corrupt a raw table view, so rows travel
 * as plain arrays aligned with the column list.
 */
export function serializeCells(model: DbModelMeta, row: Record<string, any>, full = false, cols?: string[]) {
  return (cols ?? Object.keys(model.fields)).map((c) => cell(model.fields[c], row[c], full));
}

/** Converts user input (JSON from the form, or a value computed by SQL) to the column's runtime type. */
export function coerce(model: DbModelMeta, column: string, v: unknown): unknown {
  const f = model.fields[column];
  if (!f) throw validation(`Cột "${column}" không tồn tại trong bảng ${model.tableName}`);
  if (v === undefined) return undefined;
  if (v === null || (v === '' && f.type !== 'String')) {
    if (!f.isOptional) throw validation(`Cột ${column} không được để trống`);
    return null;
  }
  const bad = (what: string) => validation(`Cột ${column}: giá trị "${String(v).slice(0, 40)}" không phải ${what}`);
  switch (f.type) {
    case 'BigInt':
      try {
        return BigInt(typeof v === 'number' ? Math.trunc(v) : String(v).trim());
      } catch {
        throw bad('số nguyên');
      }
    case 'Int': {
      const n = Number(v);
      if (!Number.isInteger(n)) throw bad('số nguyên');
      return n;
    }
    case 'Decimal':
    case 'Float': {
      const n = Number(v);
      if (!Number.isFinite(n)) throw bad('số');
      return n;
    }
    case 'Boolean':
      if (typeof v === 'boolean') return v;
      if (v === 1 || v === '1' || /^true$/i.test(String(v))) return true;
      if (v === 0 || v === '0' || /^false$/i.test(String(v))) return false;
      throw bad('đúng/sai');
    case 'DateTime': {
      const d = v instanceof Date ? v : new Date(String(v).includes(' ') && !String(v).includes('T') ? String(v).replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(String(v)) ? '' : 'Z') : String(v));
      if (Number.isNaN(d.getTime())) throw bad('ngày giờ (ISO 8601)');
      return d;
    }
    case 'Json':
      if (typeof v === 'string') {
        try {
          return JSON.parse(v);
        } catch {
          throw bad('JSON hợp lệ');
        }
      }
      return v;
    case 'Bytes':
      throw validation(`Cột ${column} là dữ liệu nhị phân, không sửa được trong console`);
    default:
      return typeof v === 'string' ? v : String(v);
  }
}

/** Checks that a column may be written from the console. */
export function assertWritable(model: DbModelMeta, column: string, opts: { allowPk?: boolean } = {}) {
  const f = model.fields[column];
  if (!f) throw validation(`Cột "${column}" không tồn tại trong bảng ${model.tableName}`);
  if (sensitive(column)) throw validation(`Cột ${column} chứa dữ liệu bí mật, console không cho sửa`);
  if (GENERATED.has(column)) throw validation(`Cột ${column} do cơ sở dữ liệu tự tính, không sửa trực tiếp`);
  if (f.type === 'Bytes') throw validation(`Cột ${column} là dữ liệu nhị phân, không sửa được trong console`);
  if (!opts.allowPk && model.pk.includes(column)) throw validation(`Cột ${column} là khóa chính, không đổi được`);
}

export function assertTableWritable(model: DbModelMeta) {
  if (isReadonlyTable(model)) throw validation(`Bảng ${model.tableName} là nhật ký chỉ ghi thêm, console không cho sửa hay xóa`);
}

export function pkWhere(model: DbModelMeta, pk: Record<string, unknown>) {
  const where: Record<string, unknown> = {};
  for (const c of model.pk) {
    if (pk?.[c] === undefined || pk?.[c] === null) throw validation(`Thiếu khóa chính ${c}`);
    where[c] = coerce(model, c, pk[c]);
  }
  return where;
}

export function pkOf(model: DbModelMeta, row: Record<string, any>) {
  const out: Record<string, unknown> = {};
  for (const c of model.pk) out[c] = cell(model.fields[c], row[c]);
  return out;
}

const pkKey = (model: DbModelMeta, row: Record<string, any>) => model.pk.map((c) => String(row[c])).join('\u0001');

/** Rows of other tables that point at this row (they would be left dangling by a delete). */
export function referencingRows(store: Record<string, any[]>, model: DbModelMeta, rows: Record<string, any>[]) {
  const out: { table: string; column: string; count: number }[] = [];
  if (!rows.length) return out;
  for (const other of Object.values(DB_MODELS)) {
    for (const rel of Object.values(other.relations)) {
      if (rel.isList || rel.targetModel !== model.name || rel.localFields?.length !== 1 || rel.foreignFields?.length !== 1) continue;
      const local = rel.localFields[0];
      const target = rel.foreignFields[0];
      if (other.pk.includes(local)) continue; // 1-1 back-reference declared on the owning side, not a real child row
      const ids = new Set(rows.map((r) => String(r[target])));
      const count = (store[other.delegate] ?? []).filter((r) => r[local] != null && ids.has(String(r[local]))).length;
      if (count) out.push({ table: other.tableName, column: local, count });
    }
  }
  return out;
}

// ------------------------------------------------------------------------------------------------------ row browser

export interface RowQuery {
  q?: string;
  sort?: string;
  dir?: 'asc' | 'desc';
  limit: number;
  offset: number;
}

function cmp(a: any, b: any): number {
  if (dbEq(a, b)) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === 'bigint' || typeof b === 'bigint') {
    try {
      return BigInt(a) < BigInt(b) ? -1 : 1;
    } catch {
      /* fall through */
    }
  }
  if (a instanceof Date || b instanceof Date) return new Date(a).getTime() < new Date(b).getTime() ? -1 : 1;
  if (typeof a === 'number' || typeof b === 'number') return Number(a) < Number(b) ? -1 : 1;
  return String(a) < String(b) ? -1 : 1;
}

/** The text a cell is matched against: dates as ISO, JSON as its serialised form, ids as digits. */
function searchText(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return v instanceof Date ? v.toISOString() : typeof v === 'object' ? JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? x.toString() : x)) : String(v);
}

export interface SearchHit { column: string; snippet: string }
export interface SearchTableResult { table: string; rows: number; total: number; columns: string[]; samples: { pk: Record<string, unknown>; hits: SearchHit[] }[] }
export interface SearchResult {
  q: string;
  scannedTables: number;
  scannedRows: number;
  ms: number;
  tableNames: string[];
  columnNames: { table: string; column: string }[];
  tables: SearchTableResult[];
}

/**
 * Looks for `q` in every non-secret column of every table (case-insensitive substring), plus table and column names.
 * Per table it returns how many rows match and a few sample rows with the matching cell cut around the match.
 */
export function searchAll(store: Record<string, any[]>, models: DbModelMeta[], rawQ: string, opts: { perTable?: number } = {}): SearchResult {
  const t0 = Date.now();
  const q = rawQ.trim().toLowerCase();
  const perTable = opts.perTable ?? 3;
  const out: SearchResult = { q: rawQ.trim(), scannedTables: models.length, scannedRows: 0, ms: 0, tableNames: [], columnNames: [], tables: [] };
  if (q.length < 2) return out;
  const snippet = (s: string) => {
    const i = s.toLowerCase().indexOf(q);
    const from = Math.max(0, i - 28);
    const to = Math.min(s.length, i + q.length + 48);
    return `${from > 0 ? '…' : ''}${s.slice(from, to)}${to < s.length ? '…' : ''}`;
  };
  for (const m of models) {
    if (m.tableName.toLowerCase().includes(q)) out.tableNames.push(m.tableName);
    for (const f of Object.values(m.fields)) if (out.columnNames.length < 40 && f.name.toLowerCase().includes(q)) out.columnNames.push({ table: m.tableName, column: f.name });
    const cols = Object.values(m.fields).filter((f) => !sensitive(f.name) && f.type !== 'Bytes');
    const rows = store[m.delegate] ?? [];
    out.scannedRows += rows.length;
    let total = 0;
    const matchedCols = new Set<string>();
    const samples: SearchTableResult['samples'] = [];
    for (const r of rows) {
      let hits: SearchHit[] | null = null;
      for (const f of cols) {
        const s = searchText(r[f.name]);
        if (s !== null && s.toLowerCase().includes(q)) {
          if (!hits) { hits = []; total += 1; }
          if (hits.length < 4) hits.push({ column: f.name, snippet: snippet(s) });
          if (samples.length >= perTable) break; // beyond the samples only the row count matters
        }
      }
      if (hits) {
        if (samples.length < perTable) samples.push({ pk: pkOf(m, r), hits });
        for (const h of hits) matchedCols.add(h.column);
      }
    }
    if (total) out.tables.push({ table: m.tableName, rows: rows.length, total, columns: [...matchedCols], samples });
  }
  out.tables.sort((a, b) => b.total - a.total || a.table.localeCompare(b.table));
  out.ms = Date.now() - t0;
  return out;
}

export function browseRows(store: Record<string, any[]>, model: DbModelMeta, query: RowQuery) {
  let rows = store[model.delegate] ?? [];
  const q = query.q?.trim().toLowerCase();
  if (q) {
    const cols = Object.values(model.fields).filter((f) => !sensitive(f.name) && f.type !== 'Bytes');
    rows = rows.filter((r) =>
      cols.some((f) => {
        const v = r[f.name];
        if (v === null || v === undefined) return false;
        const s = v instanceof Date ? v.toISOString() : typeof v === 'object' ? JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? x.toString() : x)) : String(v);
        return s.toLowerCase().includes(q);
      }),
    );
  }
  const sortCol = query.sort && model.fields[query.sort] && !sensitive(query.sort) ? query.sort : model.pk[0];
  const sign = query.dir === 'desc' ? -1 : 1;
  const sorted = [...rows].sort((a, b) => sign * cmp(a[sortCol], b[sortCol]));
  const page = sorted.slice(query.offset, query.offset + query.limit);
  return { total: sorted.length, rows: page };
}

// ------------------------------------------------------------------------------------------------------- SQL guard

const KEYWORDS = new Set(
  ('SELECT DISTINCT FROM WHERE JOIN INNER LEFT RIGHT FULL OUTER ON GROUP BY ORDER ASC DESC LIMIT OFFSET HAVING AS AND OR NOT IN LIKE BETWEEN IS NULL TRUE FALSE ' +
    'CASE WHEN THEN ELSE END UNION ALL EXISTS UPDATE SET INSERT INTO VALUES DELETE').split(' '),
);
const FUNCTIONS = new Set(
  ('COUNT SUM AVG MIN MAX UPPER LOWER LENGTH LEN SUBSTRING SUBSTR TRIM LTRIM RTRIM CONCAT REPLACE COALESCE IFNULL ISNULL NULLIF ROUND FLOOR CEIL CEILING ABS ' +
    'YEAR MONTH DAY HOUR MINUTE CAST').split(' '),
);
/** Only meaningful in write statements. */
const WRITE_WORDS = new Set(['UPDATE', 'SET', 'INSERT', 'INTO', 'VALUES', 'DELETE']);
/** alasql extensions that read files / run code / load data: never reachable. */
const DENIED = new Set(
  ('JAVASCRIPT JS EVAL REQUIRE NEW CSV XLSX XLS TXT TSV TAB HTML JSON XML FILE ATTACH DETACH ASSERT DROP CREATE ALTER TRUNCATE SHOW DESCRIBE USE SOURCE PRAGMA EXEC CALL ' +
    'PIPE FUNCTION AGGR CROSS NATURAL SEARCH MATCHES REMOVE').split(' '),
);

let schemaNames: Set<string> | null = null;
let reservedNames: Set<string> | null = null;
function names() {
  if (!schemaNames) {
    schemaNames = new Set<string>();
    for (const m of Object.values(DB_MODELS)) {
      schemaNames.add(m.tableName.toLowerCase());
      for (const f of Object.keys(m.fields)) schemaNames.add(f.toLowerCase());
    }
  }
  return schemaNames;
}
/** Column/table names that alasql treats as keywords (e.g. `total`): they get wrapped in [brackets] automatically. */
function reserved() {
  if (!reservedNames) {
    reservedNames = new Set<string>();
    const fails = (sql: string) => {
      try {
        (alasql as any).parse(sql);
        return false;
      } catch {
        return true;
      }
    };
    for (const n of names()) {
      if (KEYWORDS.has(n.toUpperCase())) continue;
      if (fails(`SELECT ${n} FROM t`) || fails(`SELECT t.${n} FROM t`) || fails(`SELECT 1 AS ${n}`) || fails(`SELECT * FROM ${n}`)) reservedNames.add(n);
    }
  }
  return reservedNames;
}

/** Cleans and checks one SQL statement. Returns text safe to hand to alasql. */
export function sanitizeSql(raw: string): string {
  const schema = names();
  const res = reserved();
  let out = '';
  let i = 0;
  const n = raw.length;
  let ended = false;
  const nextNonSpace = (from: number) => {
    let j = from;
    while (j < n && /\s/.test(raw[j])) j++;
    return raw[j];
  };
  while (i < n) {
    const c = raw[i];
    if (ended && !/\s/.test(c)) throw validation('Chỉ chạy được một câu lệnh mỗi lần (bỏ phần sau dấu ;)');
    if (c === "'") {
      let j = i + 1;
      for (; j < n; j++) {
        if (raw[j] === '\\') throw validation('Không dùng dấu \\ trong chuỗi; viết hai dấu nháy đơn để chèn dấu nháy');
        if (raw[j] === "'") {
          if (raw[j + 1] === "'") {
            j++;
            continue;
          }
          break;
        }
      }
      if (j >= n) throw validation('Chuỗi nháy đơn chưa được đóng');
      out += raw.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (c === '-' && raw[i + 1] === '-') {
      while (i < n && raw[i] !== '\n') i++;
      out += ' ';
      continue;
    }
    if (c === '/' && raw[i + 1] === '*') {
      const end = raw.indexOf('*/', i + 2);
      if (end < 0) throw validation('Chú thích /* chưa được đóng');
      i = end + 2;
      out += ' ';
      continue;
    }
    if (c === '[') {
      const end = raw.indexOf(']', i);
      const inner = end < 0 ? '' : raw.slice(i + 1, end);
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(inner)) throw validation('Tên trong [ ] chỉ gồm chữ, số và dấu gạch dưới');
      out += `[${inner}]`;
      i = end + 1;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i + 1;
      while (j < n && /[A-Za-z0-9_]/.test(raw[j])) j++;
      const word = raw.slice(i, j);
      const up = word.toUpperCase();
      const low = word.toLowerCase();
      const call = nextNonSpace(j) === '(';
      if (KEYWORDS.has(up)) out += word;
      else if (call) {
        if (!FUNCTIONS.has(up)) throw validation(`Hàm ${up}() chưa được hỗ trợ. Hàm dùng được: ${[...FUNCTIONS].join(', ')}`);
        out += word;
      } else if (DENIED.has(up) && !schema.has(low)) {
        throw validation(`Từ khóa ${up} không được phép trong console`);
      } else if (res.has(low) && raw[i - 1] !== '[') out += `[${word}]`;
      else out += word;
      i = j;
      continue;
    }
    if (/[0-9]/.test(c)) {
      let j = i + 1;
      while (j < n && /[0-9.]/.test(raw[j])) j++;
      if (j < n && /[A-Za-z_]/.test(raw[j])) throw validation('Số không hợp lệ');
      out += raw.slice(i, j);
      i = j;
      continue;
    }
    if (/\s/.test(c)) {
      out += c;
      i++;
      continue;
    }
    if (c === ';') {
      ended = true;
      i++;
      continue;
    }
    if (c === '!' && raw[i + 1] !== '=') throw validation('Ký tự "!" chỉ dùng trong "!="');
    if (/[.,()*+\-/%=<>!]/.test(c)) {
      out += c;
      i++;
      continue;
    }
    if (c === '"') throw validation("Dùng dấu nháy đơn '...' cho chuỗi (dấu nháy kép không được hỗ trợ)");
    throw validation(`Ký tự "${c}" không được phép trong câu lệnh SQL`);
  }
  const text = out.trim();
  if (!text) throw validation('Câu lệnh SQL đang trống');
  return text;
}

/** Same text with string literals blanked, so keyword/structure scans cannot be fooled by quoted data. */
const blankStrings = (s: string) => s.replace(/'(?:[^']|'')*'/g, "''");

// ------------------------------------------------------------------------------------------- scratch alasql database

let scratchSeq = 0;
function toPlain(model: DbModelMeta, r: Record<string, any>) {
  const o: Record<string, any> = {};
  for (const f of Object.values(model.fields)) {
    const v = r[f.name];
    if (v === null || v === undefined) o[f.name] = null;
    else if (sensitive(f.name)) o[f.name] = '••••••';
    else if (typeof v === 'bigint') o[f.name] = v >= BigInt(Number.MIN_SAFE_INTEGER) && v <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(v) : v.toString();
    else if (v instanceof Date) o[f.name] = v.toISOString();
    else if (Buffer.isBuffer(v) || v instanceof Uint8Array) o[f.name] = '[nhị phân]';
    else o[f.name] = v;
  }
  return o;
}

function withScratch<T>(store: Record<string, any[]>, tableNames: string[], fn: (run: (sql: string) => any[]) => T): T {
  const id = `console_${Date.now().toString(36)}_${++scratchSeq}`;
  const db = new (alasql as any).Database(id);
  try {
    for (const t of tableNames) {
      const model = modelOf(t);
      db.exec(`CREATE TABLE [${t}]`);
      db.tables[t].data = (store[model.delegate] ?? []).map((r) => toPlain(model, r));
    }
    return fn((sql) => db.exec(sql));
  } finally {
    delete (alasql as any).databases[id];
  }
}

/** Tables mentioned anywhere in the statement (FROM, JOIN, sub-queries). */
function referencedTables(clean: string): string[] {
  const out = new Set<string>();
  for (const m of blankStrings(clean).matchAll(/\b(?:FROM|JOIN|UPDATE|INTO)\s+\[?([A-Za-z_][A-Za-z0-9_]*)\]?/gi)) {
    const t = m[1].toLowerCase();
    if (!DB_TABLE_MODEL[t]) throw validation(`Bảng "${m[1]}" không tồn tại. Gõ SHOW TABLES để xem danh sách bảng.`);
    out.add(t);
  }
  // comma joins: FROM a, b
  for (const m of blankStrings(clean).matchAll(/\bFROM\s+([A-Za-z_][A-Za-z0-9_]*(?:\s+(?:AS\s+)?[A-Za-z_][A-Za-z0-9_]*)?(?:\s*,\s*[A-Za-z_][A-Za-z0-9_]*(?:\s+(?:AS\s+)?[A-Za-z_][A-Za-z0-9_]*)?)+)/gi)) {
    for (const part of m[1].split(',')) {
      const t = part.trim().split(/\s+/)[0].toLowerCase();
      if (DB_TABLE_MODEL[t]) out.add(t);
    }
  }
  return [...out];
}

function resultColumns(rows: any[]) {
  const cols: string[] = [];
  const seen = new Set<string>();
  for (const r of rows.slice(0, 50)) {
    for (const k of Object.keys(r ?? {})) {
      if (!seen.has(k)) {
        seen.add(k);
        cols.push(k);
      }
    }
  }
  return cols;
}

const outCell = (v: unknown): unknown => {
  if (v === null || v === undefined) return null;
  if (typeof v === 'bigint') return v.toString();
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') return JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? x.toString() : x));
  return v;
};

export interface SqlResult {
  kind: 'select' | 'update' | 'delete' | 'insert' | 'info';
  columns: string[];
  /** one array per row, aligned with `columns` */
  rows: unknown[][];
  rowCount: number;
  truncated?: boolean;
  /** write statements */
  affected?: number;
  table?: string;
  dryRun?: boolean;
  /** rows that point at rows about to be deleted */
  references?: { table: string; column: string; count: number }[];
  /** before/after of the first rows, for the audit trail and the preview */
  changes?: { pk: Record<string, unknown>; cols: string[]; before?: unknown[]; after?: unknown[] }[];
  ms?: number;
}

// ---------------------------------------------------------------------------------------------------------- parsing

/** Marks each character as top level (outside quotes and parentheses). */
function topMask(s: string) {
  const mask: boolean[] = new Array(s.length).fill(false);
  let depth = 0;
  let inStr = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (c === "'") {
        if (s[i + 1] === "'") i++;
        else inStr = false;
      }
      continue;
    }
    if (c === "'") {
      inStr = true;
      continue;
    }
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else mask[i] = depth === 0;
  }
  return mask;
}

function splitTop(s: string, sep: string): string[] {
  const mask = topMask(s);
  const parts: string[] = [];
  let start = 0;
  for (let i = 0; i < s.length; i++) if (s[i] === sep && mask[i]) (parts.push(s.slice(start, i)), (start = i + 1));
  parts.push(s.slice(start));
  return parts.map((p) => p.trim());
}

function findTop(s: string, re: RegExp): number {
  const mask = topMask(s);
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
  for (let m = g.exec(s); m; m = g.exec(s)) if (mask[m.index]) return m.index;
  return -1;
}

const unbracket = (s: string) => s.trim().replace(/^\[(.*)\]$/, '$1');
const lit = (s: string) => `[${s}]`;

type Store = Record<string, any[]>;

function selectIds(run: (sql: string) => any[], model: DbModelMeta, where: string, extra: string[] = []) {
  const cols = [...model.pk.map((c) => lit(c)), ...extra].join(', ');
  return run(`SELECT ${cols} FROM ${lit(model.tableName)} WHERE ${where}`);
}

// ---------------------------------------------------------------------------------------------------------- engine

export interface DmlHooks {
  /** runs the writes in one all-or-nothing transaction */
  tx: <T>(fn: () => Promise<T>) => Promise<T>;
  delegate: (name: string) => any;
}

export async function runSql(store: Store, rawSql: string, opts: { execute: boolean }, hooks: DmlHooks): Promise<SqlResult> {
  const t0 = Date.now();
  const trimmed = rawSql.trim().replace(/;+\s*$/, '');

  // ---- metadata helpers
  if (/^SHOW\s+TABLES$/i.test(trimmed)) {
    const rows = allModels().map((m) => [m.tableName, Object.keys(m.fields).length, (store[m.delegate] ?? []).length]);
    return { kind: 'info', columns: ['table', 'columns', 'rows'], rows, rowCount: rows.length, ms: Date.now() - t0 };
  }
  const desc = /^(?:DESCRIBE|DESC|SHOW\s+COLUMNS\s+FROM)\s+([A-Za-z_][A-Za-z0-9_]*)$/i.exec(trimmed);
  if (desc) {
    const info = describeTable(modelOf(desc[1].toLowerCase()));
    const rows = info.columns.map((c) => [c.name, c.type + (c.enumType ? ` (${c.enumType})` : ''), c.nullable ? 'YES' : 'NO', c.pk ? 'PRI' : c.fk ? `FK → ${c.fk.table}.${c.fk.column}` : '']);
    return { kind: 'info', columns: ['column', 'type', 'nullable', 'key'], rows, rowCount: rows.length, ms: Date.now() - t0 };
  }

  const clean = sanitizeSql(rawSql);
  const probe = blankStrings(clean);
  const first = /^[A-Za-z]+/.exec(clean)?.[0].toUpperCase();

  if (first === 'SELECT') {
    for (const w of probe.toUpperCase().match(/[A-Z_]+/g) ?? []) {
      if (WRITE_WORDS.has(w)) throw validation(`Từ khóa ${w} không dùng được trong câu SELECT`);
    }
    const tables = referencedTables(clean);
    return withScratch(store, tables, (run) => {
      let rows: any[];
      try {
        rows = run(clean);
      } catch (e: any) {
        throw validation(`Lỗi SQL: ${String(e?.message ?? e).split('\n').slice(0, 3).join(' ')}`);
      }
      if (!Array.isArray(rows)) rows = [];
      const columns = resultColumns(rows);
      const truncated = rows.length > MAX_RESULT_ROWS;
      const out = rows.slice(0, MAX_RESULT_ROWS).map((r) => columns.map((c) => outCell(r[c])));
      return { kind: 'select', columns, rows: out, rowCount: rows.length, truncated, ms: Date.now() - t0 } as SqlResult;
    });
  }

  if (first === 'UPDATE') return runUpdate(store, clean, opts.execute, hooks, t0);
  if (first === 'DELETE') return runDelete(store, clean, opts.execute, hooks, t0);
  if (first === 'INSERT') return runInsert(store, clean, opts.execute, hooks, t0);
  throw validation('Chỉ hỗ trợ SELECT, INSERT, UPDATE, DELETE, SHOW TABLES và DESCRIBE <bảng>');
}

function evalError(e: any): never {
  throw validation(`Lỗi SQL: ${String(e?.message ?? e).split('\n').slice(0, 3).join(' ')}`);
}

function sampleChange(model: DbModelMeta, before: Record<string, any>, after: Record<string, any> | null, cols: string[]) {
  return { pk: pkOf(model, before), cols, before: serializeCells(model, before, false, cols), ...(after ? { after: serializeCells(model, after, false, cols) } : {}) };
}

async function runUpdate(store: Store, clean: string, execute: boolean, hooks: DmlHooks, t0: number): Promise<SqlResult> {
  const m = /^UPDATE\s+\[?([A-Za-z_][A-Za-z0-9_]*)\]?\s+SET\s+([\s\S]+)$/i.exec(clean);
  if (!m) throw validation('Cú pháp: UPDATE <bảng> SET cột = giá trị[, ...] WHERE <điều kiện>');
  const model = modelOf(m[1].toLowerCase());
  assertTableWritable(model);
  const rest = m[2];
  const wi = findTop(rest, /\sWHERE\s/i);
  if (wi < 0) throw validation('UPDATE bắt buộc có WHERE (muốn sửa cả bảng hãy viết WHERE 1 = 1 có chủ ý)');
  const setPart = rest.slice(0, wi);
  const where = rest.slice(wi).replace(/^\s*WHERE\s+/i, '');
  const assigns = splitTop(setPart, ',').map((a) => {
    const am = /^(\[[A-Za-z_][A-Za-z0-9_]*\]|[A-Za-z_][A-Za-z0-9_]*)\s*=\s*([\s\S]+)$/.exec(a);
    if (!am) throw validation(`Phép gán không hợp lệ: ${a.slice(0, 60)}`);
    const column = unbracket(am[1]).toLowerCase();
    const name = Object.keys(model.fields).find((f) => f.toLowerCase() === column);
    if (!name) throw validation(`Cột "${column}" không tồn tại trong bảng ${model.tableName}`);
    assertWritable(model, name);
    return { column: name, expr: am[2] };
  });
  const exprCols = assigns.map((a, i) => `(${a.expr}) AS ${lit(`__v${i}`)}`);
  const tables = [model.tableName, ...referencedTables(`FROM ${lit(model.tableName)} WHERE ${where}`)].filter((x, i, a) => a.indexOf(x) === i);
  const matched = withScratch(store, tables, (run) => {
    try {
      return selectIds(run, model, where, exprCols);
    } catch (e) {
      return evalError(e);
    }
  });
  if (matched.length > MAX_AFFECTED_ROWS) throw validation(`Câu lệnh ảnh hưởng ${matched.length} dòng, vượt giới hạn ${MAX_AFFECTED_ROWS} dòng mỗi lần`);
  const byKey = new Map((store[model.delegate] ?? []).map((r) => [pkKey(model, r), r]));
  const plan = matched.map((r) => {
    const row = byKey.get(model.pk.map((c) => String(r[c])).join('\u0001'));
    if (!row) throw validation('Không khớp được dòng với khóa chính (dữ liệu vừa thay đổi?), thử lại');
    const data: Record<string, unknown> = {};
    assigns.forEach((a, i) => (data[a.column] = coerce(model, a.column, r[`__v${i}`])));
    return { row, data };
  });
  const cols = [...new Set([...model.pk, ...assigns.map((a) => a.column)])];
  const changes = plan.slice(0, 20).map(({ row, data }) => {
    const after = { ...row, ...data };
    return sampleChange(model, row, after, cols);
  });
  if (!execute) return { kind: 'update', table: model.tableName, dryRun: true, affected: plan.length, columns: cols, rows: [], rowCount: 0, changes, ms: Date.now() - t0 };
  const del = hooks.delegate(model.delegate);
  const beforeSnap = plan.slice(0, 20).map(({ row }) => ({ ...row }));
  await hooks.tx(async () => {
    for (const { row, data } of plan) await del.update({ where: pkWhere(model, pkOf(model, row)), data });
  });
  const after = plan.slice(0, 20).map(({ row }, i) => sampleChange(model, beforeSnap[i], row, cols));
  return { kind: 'update', table: model.tableName, affected: plan.length, columns: cols, rows: [], rowCount: 0, changes: after, ms: Date.now() - t0 };
}

async function runDelete(store: Store, clean: string, execute: boolean, hooks: DmlHooks, t0: number): Promise<SqlResult> {
  const m = /^DELETE\s+FROM\s+\[?([A-Za-z_][A-Za-z0-9_]*)\]?\s+WHERE\s+([\s\S]+)$/i.exec(clean);
  if (!m) throw validation('Cú pháp: DELETE FROM <bảng> WHERE <điều kiện> (bắt buộc có WHERE)');
  const model = modelOf(m[1].toLowerCase());
  assertTableWritable(model);
  const where = m[2];
  const tables = [model.tableName, ...referencedTables(`FROM ${lit(model.tableName)} WHERE ${where}`)].filter((x, i, a) => a.indexOf(x) === i);
  const matched = withScratch(store, tables, (run) => {
    try {
      return selectIds(run, model, where);
    } catch (e) {
      return evalError(e);
    }
  });
  if (matched.length > MAX_AFFECTED_ROWS) throw validation(`Câu lệnh ảnh hưởng ${matched.length} dòng, vượt giới hạn ${MAX_AFFECTED_ROWS} dòng mỗi lần`);
  const byKey = new Map((store[model.delegate] ?? []).map((r) => [pkKey(model, r), r]));
  const rows = matched.map((r) => {
    const row = byKey.get(model.pk.map((c) => String(r[c])).join('\u0001'));
    if (!row) throw validation('Không khớp được dòng với khóa chính (dữ liệu vừa thay đổi?), thử lại');
    return row;
  });
  const references = referencingRows(store, model, rows);
  const cols = Object.keys(model.fields).filter((c) => !sensitive(c)).slice(0, 8);
  const changes = rows.slice(0, 20).map((row) => sampleChange(model, row, null, cols));
  if (!execute) return { kind: 'delete', table: model.tableName, dryRun: true, affected: rows.length, columns: cols, rows: [], rowCount: 0, references, changes, ms: Date.now() - t0 };
  const snap = rows.slice(0, 20).map((r) => sampleChange(model, r, null, cols));
  const del = hooks.delegate(model.delegate);
  await hooks.tx(async () => {
    for (const row of rows) await del.delete({ where: pkWhere(model, pkOf(model, row)) });
  });
  return { kind: 'delete', table: model.tableName, affected: rows.length, columns: cols, rows: [], rowCount: 0, references, changes: snap, ms: Date.now() - t0 };
}

async function runInsert(store: Store, clean: string, execute: boolean, hooks: DmlHooks, t0: number): Promise<SqlResult> {
  const m = /^INSERT\s+INTO\s+\[?([A-Za-z_][A-Za-z0-9_]*)\]?\s*\(([^)]*)\)\s*VALUES\s*([\s\S]+)$/i.exec(clean);
  if (!m) throw validation('Cú pháp: INSERT INTO <bảng> (cột1, cột2) VALUES (giá trị1, giá trị2)');
  const model = modelOf(m[1].toLowerCase());
  assertTableWritable(model);
  const columns = m[2].split(',').map((c) => {
    const low = unbracket(c).toLowerCase();
    const name = Object.keys(model.fields).find((f) => f.toLowerCase() === low);
    if (!name) throw validation(`Cột "${low}" không tồn tại trong bảng ${model.tableName}`);
    assertWritable(model, name, { allowPk: true });
    return name;
  });
  if (new Set(columns).size !== columns.length) throw validation('Danh sách cột bị trùng');
  // tuples: ( ... ), ( ... )
  const tuples: string[] = [];
  const vals = m[3].trim();
  let depth = 0;
  let start = -1;
  let inStr = false;
  for (let i = 0; i < vals.length; i++) {
    const c = vals[i];
    if (inStr) {
      if (c === "'") {
        if (vals[i + 1] === "'") i++;
        else inStr = false;
      }
      continue;
    }
    if (c === "'") inStr = true;
    else if (c === '(') {
      if (depth === 0) start = i + 1;
      depth++;
    } else if (c === ')') {
      depth--;
      if (depth === 0) tuples.push(vals.slice(start, i));
    } else if (depth === 0 && c !== ',' && !/\s/.test(c)) throw validation('Sau VALUES chỉ gồm các cụm (giá trị, ...) cách nhau bằng dấu phẩy');
  }
  if (!tuples.length || depth !== 0) throw validation('Danh sách VALUES không hợp lệ');
  if (tuples.length > 200) throw validation('Chèn tối đa 200 dòng mỗi lần');
  const computed = withScratch(store, [], (run) =>
    tuples.map((t) => {
      const exprs = splitTop(t, ',');
      if (exprs.length !== columns.length) throw validation(`Số giá trị (${exprs.length}) không khớp số cột (${columns.length})`);
      try {
        return run(`SELECT ${exprs.map((e, i) => `(${e}) AS ${lit(`__c${i}`)}`).join(', ')}`)[0] ?? {};
      } catch (e) {
        return evalError(e);
      }
    }),
  );
  const required = Object.values(model.fields).filter((f) => !f.isOptional && !f.default && !GENERATED.has(f.name)).map((f) => f.name);
  const missing = required.filter((c) => !columns.includes(c));
  if (missing.length) throw validation(`Thiếu cột bắt buộc: ${missing.join(', ')}`);
  const records = computed.map((row) => {
    const data: Record<string, unknown> = {};
    columns.forEach((c, i) => (data[c] = coerce(model, c, row[`__c${i}`])));
    return data;
  });
  const changes = records.slice(0, 20).map((d) => ({ pk: {}, cols: columns, after: columns.map((c) => cell(model.fields[c], d[c])) }));
  if (!execute) return { kind: 'insert', table: model.tableName, dryRun: true, affected: records.length, columns, rows: [], rowCount: 0, changes, ms: Date.now() - t0 };
  const del = hooks.delegate(model.delegate);
  const created: Record<string, any>[] = [];
  await hooks.tx(async () => {
    for (const data of records) created.push(await del.create({ data }));
  });
  const done = created.slice(0, 20).map((r) => ({ pk: pkOf(model, r), cols: columns, after: serializeCells(model, r, false, columns) }));
  return { kind: 'insert', table: model.tableName, affected: records.length, columns, rows: [], rowCount: 0, changes: done, ms: Date.now() - t0 };
}
