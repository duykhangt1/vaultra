import schemaMetaRaw from './schema-meta.json';
import seedDataRaw from './seed-data.json';
import uniquesRaw from './schema-uniques.json';
import { AsyncLocalStorage } from 'node:async_hooks';

/** UNIQUE constraints per model, generated from the Prisma schema (tools/gen-uniques.py). */
const UNIQUES = uniquesRaw as Record<string, string[][]>;
/** Undo log of the transaction the current async call chain runs in (rollback on error). */
const txStore = new AsyncLocalStorage<{ undo: Array<() => void> }>();
let txLock: Promise<void> = Promise.resolve();

function collectScopedDepositHydrateRowChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupeDynamicOverlockCmpValRecords<T extends { id: string }>(items: readonly T[]): T[] {
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

const TENANT_UNIFIED_CHECKIN_COLUMNS = [
  'depositHeldVnd',
] as const;

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
