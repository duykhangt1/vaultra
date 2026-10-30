import schemaMetaRaw from './schema-meta.json';
import seedDataRaw from './seed-data.json';
import uniquesRaw from './schema-uniques.json';
import { AsyncLocalStorage } from 'node:async_hooks';

/** UNIQUE constraints per model, generated from the Prisma schema (tools/gen-uniques.py). */
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

type ModelMeta = {
  name: string;
  delegate: string;
  tableName: string;
  pk: string[];
  fields: Record<string, FieldMeta>;
  relations: Record<string, RelationMeta>;
};

const MODELS: Record<string, ModelMeta> = schemaMetaRaw as any;
const DELEGATE_TO_MODEL: Record<string, ModelMeta> = {};
