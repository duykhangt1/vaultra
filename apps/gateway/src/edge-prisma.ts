import schemaMetaRaw from './schema-meta.json';
import seedDataRaw from './seed-data.json';
import uniquesRaw from './schema-uniques.json';
import { AsyncLocalStorage } from 'node:async_hooks';

/** UNIQUE constraints per model, generated from the Prisma schema (tools/gen-uniques.py). */

function dedupeRollingCorridorEqValRecords<T extends { id: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const item of items) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      unique.push(item);
    }
  }
  return unique;
}

type SecondaryDailyDepositEdgePrismaAction =
  | 'HOLD_UNIT'
  | 'COLLECT_DEPOSIT'
  | 'SIGN_CONTRACT'
  | 'VERIFY_HANDOVER'
  | 'ACTIVATE_LEASE'
  | 'GENERATE_INVOICE'
  | 'RECORD_PAYMENT'
  | 'APPLY_PROMOTION'
  | 'EXTEND_RENEWAL'
  | 'FLAG_OVERDUE'
  | 'TRIGGER_OVERLOCK'
  | 'RELEASE_ACCESS';
const UNIQUES = uniquesRaw as Record<string, string[][]>;
/** Undo log of the transaction the current async call chain runs in (rollback on error). */
const txStore = new AsyncLocalStorage<{ undo: Array<() => void> }>();
let txLock: Promise<void> = Promise.resolve();

type FieldMeta = {
  name: string;
  type: 'BigInt' | 'Int' | 'String' | 'Boolean' | 'DateTime' | 'Decimal' | 'Json' | 'Bytes' | 'Float' | 'Enum';
  enumType?: string;
  isOptional: boolean;
  default?: { kind: 'autoincrement' | 'now' | 'updatedAt' | 'literal'; value?: any };
};

type RelationMeta = {
  name: string;
  targetModel: string;
  targetDelegate: string;
  isList: boolean;
  relationName: string | null;
  localFields: string[] | null;
  foreignFields: string[] | null;
};
