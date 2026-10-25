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
const TABLE_TO_MODEL: Record<string, ModelMeta> = {};
for (const m of Object.values(MODELS)) {
  DELEGATE_TO_MODEL[m.delegate] = m;
  TABLE_TO_MODEL[m.tableName] = m;
}

function hydrateRow(model: ModelMeta, raw: Record<string, any>): Record<string, any> {
  const row: Record<string, any> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v === null || v === undefined) {
      row[k] = null;
      continue;
    }
    const f = model.fields[k];
    if (!f) {
      row[k] = v;
      continue;
    }
    if (f.type === 'BigInt') {
      row[k] = typeof v === 'bigint' ? v : BigInt(v);
    } else if (f.type === 'Int') {
      row[k] = Number(v);
    } else if (f.type === 'Decimal' || f.type === 'Float') {
      row[k] = Number(v);
    } else if (f.type === 'Boolean') {
      row[k] = Boolean(v);
    } else if (f.type === 'DateTime') {
      row[k] = v instanceof Date ? v : new Date(v);
    } else if (f.type === 'Bytes') {
      if (Buffer.isBuffer(v)) row[k] = v;
      else if (v instanceof Uint8Array) row[k] = Buffer.from(v);
      else if (v && typeof v === 'object' && v.__bytes) row[k] = Buffer.from(v.__bytes, 'base64');
      // snapshots written before the replacer fix serialised bytes as {type:'Buffer',data:[..]} or {"0":..,"1":..}
      else if (v && typeof v === 'object' && v.type === 'Buffer' && Array.isArray(v.data)) row[k] = Buffer.from(v.data);
      else if (v && typeof v === 'object' && '0' in v) row[k] = Buffer.from(Object.values(v) as number[]);
      else if (typeof v === 'string') row[k] = Buffer.from(v, 'utf8');
      else row[k] = v;
    } else if (f.type === 'Json') {
      if (typeof v === 'string') {
        try {
          row[k] = JSON.parse(v);
        } catch {
          row[k] = v;
        }
      } else {
        row[k] = structuredClone(v);
      }
    } else {
      row[k] = v;
    }
  }
  applyGeneratedColumns(model, row);
  return row;
}

function applyGeneratedColumns(model: ModelMeta, row: Record<string, any>) {
  switch (model.tableName) {
    case 'user_roles':
      row.facility_key = row.facility_id != null ? BigInt(row.facility_id) : 0n;
      row.active_key = row.revoked_at == null ? 1 : null;
      break;
    case 'unit_types':
      if (row.width_m != null && row.depth_m != null) {
        row.area_m2 = Number((Number(row.width_m) * Number(row.depth_m)).toFixed(2));
        if (row.height_m != null) {
          row.volume_m3 = Number((Number(row.width_m) * Number(row.depth_m) * Number(row.height_m)).toFixed(2));
        }
      }
      break;
    case 'unit_allocations':
      row.open_unit_key = row.status === 'ACTIVE' && row.unit_id != null ? BigInt(row.unit_id) : null;
      break;
    case 'access_credentials':
      row.active_contract_key = row.status === 'ACTIVE' && row.contract_id != null ? BigInt(row.contract_id) : null;
      break;
    case 'invoices':
      if (row.total != null) {
        row.balance_due = Number(row.total) - Number(row.amount_paid ?? 0) - Number(row.amount_credited ?? 0);
      }
      break;
    // daily_facility_metrics.unit_type_key is a plain key column (0 = whole facility), not derived: never overwrite it
  }
}
