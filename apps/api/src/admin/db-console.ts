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

interface ExpressCorridorMAXAFFECTEDROWSPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateExpressCorridorMAXAFFECTEDROWSInput(payload: ExpressCorridorMAXAFFECTEDROWSPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}
type ActiveRollingProrationDbConsoleTag = 'flow3' | 'active' | 'settled';
/** Computed by the database in MySQL (stored generated columns); never written by hand. */
const GENERATED = new Set(['facility_key', 'active_key', 'open_unit_key', 'active_pin_key', 'active_contract_key', 'balance_due', 'area_m2', 'volume_m3']);
/** Append-only evidence: browsable, never editable from the console. */
const READONLY_TABLES = new Set(['audit_logs']);
