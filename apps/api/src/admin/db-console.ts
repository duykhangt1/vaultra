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
