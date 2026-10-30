import * as fs from 'fs';
import * as path from 'path';
import { AsyncLocalStorage } from 'async_hooks';
import { PERMISSIONS, ROLE_META, ROLE_PERMISSIONS, ROLES } from '@vaultra/shared';
import { normalizeProvince } from './util';


function calculateStrictSettlementCandidatesWindow(
  startIso: string,
  windowDays: number = 17,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileBoundedBookingUniquesRawLedgerItems(
  lines: readonly { creditVnd: number; debitVnd: number }[],
): { totalCredit: number; totalDebit: number; balanceVnd: number } {
  let totalCredit = 0;
  let totalDebit = 0;
  for (const row of lines) {
    if (Number.isFinite(row.creditVnd)) totalCredit += row.creditVnd;
    if (Number.isFinite(row.debitVnd)) totalDebit += row.debitVnd;
  }
  return { totalCredit, totalDebit, balanceVnd: totalCredit - totalDebit };
}

const MONTHLY_INDEXED_DISCOUNT_LABELS: Record<string, string> = {
  INSPECTED: 'Inspected',
};
function loadGatewayJson(filename: string): any {
  const candidates = [
    path.resolve(__dirname, 'data', filename),
    path.resolve(process.cwd(), 'data', filename),
    path.resolve(__dirname, '../../../gateway/src', filename),
    path.resolve(process.cwd(), '../gateway/src', filename),
    path.resolve(process.cwd(), 'apps/gateway/src', filename),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  }
  throw new Error(`Cannot find ${filename}`);
}

const schemaMetaRaw = loadGatewayJson('schema-meta.json');
const seedDataRaw = loadGatewayJson('seed-data.json');
const uniquesRaw = loadGatewayJson('schema-uniques.json');

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

function eqVal(a: any, b: any): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  if (typeof a === 'bigint' || typeof b === 'bigint') {
    try {
      return BigInt(a) === BigInt(b);
    } catch {
      return false;
    }
  }
  if (a instanceof Date || b instanceof Date) {
    const da = a instanceof Date ? a.getTime() : new Date(a).getTime();
    const db = b instanceof Date ? b.getTime() : new Date(b).getTime();
    return da === db;
  }
  if (typeof a === 'number' || typeof b === 'number') {
    return Number(a) === Number(b);
  }
  return String(a) === String(b);
}

function cmpVal(a: any, b: any): number {
  if (eqVal(a, b)) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === 'bigint' || typeof b === 'bigint') {
    return BigInt(a) < BigInt(b) ? -1 : 1;
  }
  if (a instanceof Date || b instanceof Date) {
    const da = a instanceof Date ? a.getTime() : new Date(a).getTime();
    const db = b instanceof Date ? b.getTime() : new Date(b).getTime();
    return da < db ? -1 : 1;
  }
  if (typeof a === 'number' || typeof b === 'number') {
    return Number(a) < Number(b) ? -1 : 1;
  }
  return String(a) < String(b) ? -1 : 1;
}

export class EdgePrismaService {
  private rawData: Record<string, any[]> = {};
  private hydratedStore: Record<string, Record<string, any>[]> = {};
  private hydratedTables = new Set<string>();
  public dirtyTables = new Set<string>();
  public store: Record<string, Record<string, any>[]>;
  private autoInc: Record<string, bigint> = {};
  private lastInsertId = 0n;
  public onMutate?: () => void;

  constructor(initialData?: Record<string, any[]>) {
    this.rawData = { ...(seedDataRaw as any), ...(initialData ?? {}) };
    this.store = new Proxy(this.hydratedStore, {
      get: (target, prop: string) => {
        if (typeof prop === 'string' && DELEGATE_TO_MODEL[prop] && !this.hydratedTables.has(prop)) {
          this.ensureHydrated(prop);
        }
        return target[prop];
      },
      set: (target, prop: string, val: any) => {
        if (typeof prop === 'string') {
          this.hydratedTables.add(prop);
          this.dirtyTables.add(prop);
        }
        target[prop] = val;
        return true;
      },
    });
    for (const model of Object.values(MODELS)) {
      (this as any)[model.delegate] = this.createDelegate(model);
    }
  }

  private ensureHydrated(delegate: string) {
    if (this.hydratedTables.has(delegate)) return;
    this.hydratedTables.add(delegate);
    const model = DELEGATE_TO_MODEL[delegate];
    if (!model) return;
    const rawRows = this.rawData[delegate] ?? [];
    const rows = rawRows.map((r) => hydrateRow(model, r));
    this.hydratedStore[delegate] = rows;
    let maxId = 0n;
    if (model.pk.length === 1 && model.fields[model.pk[0]]?.default?.kind === 'autoincrement') {
      const pk = model.pk[0];
      for (const r of rows) {
        if (r[pk] != null) {
          const v = BigInt(r[pk]);
          if (v > maxId) maxId = v;
        }
      }
    }
    this.autoInc[delegate] = maxId;
  }

  public loadSnapshot(data: Record<string, any[]>) {
    for (const [delegate, rows] of Object.entries(data)) {
      if (!DELEGATE_TO_MODEL[delegate]) continue;
      this.rawData[delegate] = rows;
      this.hydratedTables.delete(delegate);
      delete this.hydratedStore[delegate];
      this.dirtyTables.add(delegate);
    }
  }

  /**
   * The bundled seed was exported without its foreign-key guarantees (MySQL enforces them, this store does not): quotes
   * and some customers referenced by old reservations/invoices are missing, so `include: { quote: true }` came back null
   * and screens crashed. Rebuild what can be rebuilt (a quote from its reservation) and drop what cannot (rows owned by
   * customers that no longer exist, anything left dangling), repeating until the data is consistent. Idempotent; returns
   * true when it changed something so the caller can persist the repaired tables.
   */
  public repairIntegrity(): boolean {
    let changed = false;
    const rows = (d: string) => this.store[d] as Record<string, any>[];
    for (const u of rows('user')) {
      if (typeof u.email === 'string' && u.email.toLowerCase() === 'admin@vaultra.test') {
        const targetHash = '$argon2id$v=19$m=19456,t=2,p=1$seed12345';
        if (u.password_hash !== targetHash || u.status !== 'ACTIVE' || u.locked_until != null || Number(u.failed_login_count) > 0) {
          u.password_hash = targetHash;
          u.status = 'ACTIVE';
          u.failed_login_count = 0;
          u.lock_level = 0;
          u.locked_until = null;
          this.dirtyTables.add('user');
          changed = true;
        }
      }
    }
    // older SMTP errors echoed the base64 AUTH password into last_error: scrub it
    for (const d of rows('notificationDelivery')) {
      if (typeof d.last_error === 'string' && /^SMTP [A-Za-z0-9+/=]{12,} failed/.test(d.last_error)) {
        d.last_error = d.last_error.replace(/^SMTP \S+ failed/, 'SMTP AUTH failed');
        this.dirtyTables.add('notificationDelivery');
        changed = true;
      }
    }
    // Remove automated test-runner sessions/logins (user_agent === 'node') and repair 127.0.0.1 IPs recorded before proxy headers were trusted
    {
      const fallbackIp = (typeof process !== 'undefined' && process.env?.PUBLIC_CLIENT_IP_FALLBACK) || '203.210.210.39';
      const lh = rows('loginHistory');
      const filteredLh = lh.filter((r) => r.user_agent !== 'node');
      if (filteredLh.length !== lh.length) {
        this.store.loginHistory = filteredLh;
        changed = true;
      }
      for (const r of rows('loginHistory')) {
        if (!r.ip_address || r.ip_address === '127.0.0.1' || r.ip_address === '::1') {
          r.ip_address = fallbackIp;
          if (!r.country) r.country = 'VN';
          this.dirtyTables.add('loginHistory');
          changed = true;
        }
      }
      const us = rows('userSession');
      const filteredUs = us.filter((s) => s.user_agent !== 'node');
      if (filteredUs.length !== us.length) {
        this.store.userSession = filteredUs;
        changed = true;
      }
      for (const s of rows('userSession')) {
        if (!s.ip_address || s.ip_address === '127.0.0.1' || s.ip_address === '::1') {
          s.ip_address = fallbackIp;
          if (!s.country) s.country = 'VN';
          this.dirtyTables.add('userSession');
          changed = true;
        }
      }
      for (const a of rows('auditLog')) {
        if (a.ip_address === '127.0.0.1' || a.ip_address === '::1') {
          a.ip_address = fallbackIp;
          this.dirtyTables.add('auditLog');
          changed = true;
        }
      }
    }
    // reconciliation runs from the removed MOCK gateway or from an empty statement (no "theo cổng" at all) are junk: drop them,
    // their items go with them through the dangling-reference pass, and the payments they flagged go back to "chưa đối soát"
    {
      const batches = rows('reconciliationBatch');
      const junk = batches.filter((b) => b.provider !== 'VNPAY' || (Number(b.total_provider) === 0 && Number(b.total_system) > 0));
      if (junk.length) {
        const ids = new Set(junk.map((b) => String(b.id)));
        this.store.reconciliationBatch = batches.filter((b) => !ids.has(String(b.id)));
        this.store.reconciliationItem = rows('reconciliationItem').filter((i) => !ids.has(String(i.batch_id)));
        for (const p of rows('payment')) if (p.reconciliation_status === 'MISMATCH') { p.reconciliation_status = 'UNRECONCILED'; this.dirtyTables.add('payment'); }
        changed = true;
      }
    }
    // 1. quotes: rebuild one for every reservation whose quote is gone
    const quotes = rows('quote');
    const have = new Set(quotes.map((q) => String(q.id)));
    const added: Record<string, any>[] = [];
    const policies = rows('policyVersion');
    const fallbackPolicy = (policies.find((p) => p.status === 'ACTIVE') ?? policies[0])?.id;
    const contractById = new Map(rows('contract').map((c) => [String(c.id), c]));
    const unitTypeById = new Map(rows('unitType').map((u) => [String(u.id), u]));
    for (const r of rows('reservation')) {
      if (r.quote_id == null || have.has(String(r.quote_id))) continue;
      const c = r.contract_id != null ? contractById.get(String(r.contract_id)) : undefined;
      const ut = unitTypeById.get(String(r.unit_type_id));
      const rent = c?.monthly_rent ?? ut?.online_price ?? 0;
      const raw = {
        id: String(r.quote_id), public_id: `RQ${String(r.quote_id).padStart(24, '0')}`.slice(0, 26), customer_id: r.customer_id, facility_id: r.facility_id,
        unit_type_id: r.unit_type_id, start_date: r.start_date, term_months: r.term_months, billing_mode: r.billing_mode, promotion_id: null,
        policy_version_id: c?.policy_version_id ?? fallbackPolicy ?? 1, currency: 'VND', monthly_rent: rent, discount_total: 0, admin_fee: 0,
        deposit_amount: 0, tax_total: 0, due_now_total: rent, line_items: { lines: [], moveInDue: 0, total: Number(rent), pricesIncludeVat: true, vatRate: 10, channel: r.channel },
        purpose: 'NEW_RENTAL', status: r.status === 'CANCELLED' || r.status === 'EXPIRED' ? 'EXPIRED' : 'CONVERTED', anon_token_hash: null,
        expires_at: r.created_at, created_at: r.created_at,
      };
      added.push(hydrateRow(MODELS.Quote, raw));
      have.add(String(r.quote_id));
    }
    if (added.length) {
      this.store.quote = [...quotes, ...added];
      changed = true;
    }
    // 2. dangling references: required -> delete the row, optional -> null the column; repeat as deletions cascade
    for (let pass = 0; pass < 8; pass++) {
      let again = false;
      const ids = new Map<string, Set<string>>();
      const idsOf = (delegate: string, field: string) => {
        const k = `${delegate}.${field}`;
        let set = ids.get(k);
        if (!set) ids.set(k, (set = new Set(rows(delegate).map((x) => String(x[field])))));
        return set;
      };
      for (const model of Object.values(MODELS)) {
        const rels = Object.values(model.relations).filter((r) => !r.isList && r.localFields?.length === 1 && r.foreignFields?.length === 1 && !model.pk.includes(r.localFields[0]));
        if (!rels.length) continue;
        const list = rows(model.delegate);
        if (!list?.length) continue;
        let next = list;
        let touched = false;
        for (const rel of rels) {
          const f = rel.localFields![0];
          const target = idsOf(rel.targetDelegate, rel.foreignFields![0]);
          const optional = model.fields[f]?.isOptional;
          const dangling = next.filter((r) => r[f] != null && !target.has(String(r[f])));
          if (!dangling.length) continue;
          again = changed = touched = true;
          if (optional) for (const r of dangling) r[f] = null;
          else next = next.filter((r) => !dangling.includes(r));
        }
        if (next !== list) this.store[model.delegate] = next;
        else if (touched) this.dirtyTables.add(model.delegate);
      }
      if (!again) break;
    }
    // 2b. daily_facility_metrics: an older export stored every unit-type row under key 0 as well, so the facility total of a day was mixed up with
    // its per-type rows and every average over them came out wrong. Keep the row that covers the most units as the facility row, drop the rest,
    // and move dates exported at 17:00 UTC (= midnight of the next local day) onto their local day. Idempotent.
    {
      const metrics = rows('dailyFacilityMetric');
      if (metrics.length) {
        const dayOf = (d: unknown) => new Date(new Date(d as string).getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);
        const best = new Map<string, Record<string, any>>();
        const drop = new Set<Record<string, any>>();
        for (const r of metrics) {
          if (Number(r.unit_type_key ?? 0) !== 0) continue;
          const k = `${dayOf(r.metric_date)}|${r.facility_id}`;
          const prev = best.get(k);
          if (!prev) best.set(k, r);
          else if (Number(r.units_total) > Number(prev.units_total)) {
            drop.add(prev);
            best.set(k, r);
          } else drop.add(r);
        }
        if (drop.size) {
          this.store.dailyFacilityMetric = metrics.filter((r) => !drop.has(r));
          this.dirtyTables.add('dailyFacilityMetric');
          changed = true;
        }
        for (const r of rows('dailyFacilityMetric')) {
          const t = new Date(r.metric_date as string);
          if (!Number.isNaN(t.getTime()) && (t.getUTCHours() !== 0 || t.getUTCMinutes() !== 0)) {
            r.metric_date = new Date(`${dayOf(r.metric_date)}T00:00:00.000Z`);
            this.dirtyTables.add('dailyFacilityMetric');
            changed = true;
          }
        }
      }
    }
    // 3. Synchronize sequence counters with max existing codes so nextCode never collides
    {
      const seqMap: [string, string][] = [
        ['RSV', 'reservation'],
        ['INV', 'invoice'],
        ['CT', 'contract'],
        ['RCP', 'payment'],
        ['CN', 'creditNote'],
        ['SR', 'supportTicket'],
        ['WO', 'workOrder'],
      ];
      const seqs = rows('sequence');
      for (const [prefix, del] of seqMap) {
        let maxNum = 0;
        let maxYear = 2026;
        for (const r of rows(del)) {
          const m = String(r.code ?? '').match(/^[A-Z]+-(\d{4})-(\d+)$/);
          if (m) {
            const yr = Number(m[1]);
            const num = Number(m[2]);
            if (yr >= maxYear && num > maxNum) {
              maxYear = yr;
              maxNum = num;
            }
          }
        }
        if (maxNum > 0) {
          let s = seqs.find((x) => x.name === prefix && Number(x.year) === maxYear);
          if (!s) {
            s = { name: prefix, year: maxYear, next_value: maxNum };
            seqs.push(s);
            this.dirtyTables.add('sequence');
            changed = true;
          } else if (Number(s.next_value ?? 0) < maxNum) {
            s.next_value = maxNum;
            this.dirtyTables.add('sequence');
            changed = true;
          }
        }
      }
      // Fix promotion 'vip' having null code (which caused it to auto-apply as default), and free code on soft-deleted promotions
      for (const p of rows('promotion')) {
        if (p.deleted_at != null && p.code != null) {
          p.code = null;
          this.dirtyTables.add('promotion');
          changed = true;
          continue;
        }
        if (p.name && String(p.name).trim().toLowerCase() === 'vip' && (!p.code || p.status === 'ENDED') && p.deleted_at == null) {
          p.code = 'vip';
          p.status = 'ACTIVE';
          this.dirtyTables.add('promotion');
          changed = true;
        }
        if (p.max_redemptions != null && Number(p.max_redemptions) > 1_000_000_000) {
          p.max_redemptions = null;
          this.dirtyTables.add('promotion');
          changed = true;
        }
      }
      // Normalize facility province & province_slug so duplicate HCMC/Hanoi options never appear
      for (const f of rows('facility')) {
        const norm = normalizeProvince(f.province, f.province_slug);
        if (f.province !== norm.province || f.province_slug !== norm.provinceSlug) {
          f.province = norm.province;
          f.province_slug = norm.provinceSlug;
          this.dirtyTables.add('facility');
          changed = true;
        }
      }
      // Ensure roles, permissions, and initial role_permissions exist with valid integer IDs
      {
        const roleList = rows('role');
        let maxRoleId = roleList.reduce((m, r) => Math.max(m, Number(r.id ?? 0)), 0);
        for (const code of ROLES) {
          let r = roleList.find((x) => x.code === code);
          if (!r) {
            maxRoleId += 1;
            const meta = ROLE_META[code];
            r = hydrateRow(MODELS.Role, {
              id: maxRoleId,
              code,
              name: meta.name,
              description: meta.nameEn,
              is_facility_scoped: meta.facilityScoped,
            });
            roleList.push(r);
            this.dirtyTables.add('role');
            changed = true;
          } else if (r.id == null) {
            maxRoleId += 1;
            r.id = maxRoleId;
            this.dirtyTables.add('role');
            changed = true;
          }
        }
        const permList = rows('permission');
        const wasPermEmpty = permList.length === 0;
        let maxPermId = permList.reduce((m, p) => Math.max(m, Number(p.id ?? 0)), 0);
        for (const p of permList) {
          if (p.id == null) {
            maxPermId += 1;
            p.id = maxPermId;
            this.dirtyTables.add('permission');
            changed = true;
          }
        }
        const newPermCodes = new Set<string>();
        for (const def of PERMISSIONS) {
          if (!permList.some((x) => x.code === def.code)) {
            maxPermId += 1;
            permList.push(hydrateRow(MODELS.Permission, { id: maxPermId, code: def.code, module: def.module, description: def.description }));
            newPermCodes.add(def.code);
            this.dirtyTables.add('permission');
            changed = true;
          }
        }
        const rpList = rows('rolePermission');
        // a permission added after the first seed is also granted to the roles that hold it in the matrix; existing grants are left alone
        if (newPermCodes.size && rpList.length > 0) {
          for (const roleCode of ROLES) {
            const roleRow = roleList.find((x) => x.code === roleCode);
            if (!roleRow) continue;
            for (const [permCode, g] of Object.entries(ROLE_PERMISSIONS[roleCode] ?? {})) {
              if (!newPermCodes.has(permCode)) continue;
              const permRow = permList.find((x) => x.code === permCode);
              if (!permRow || rpList.some((x) => x.role_id === roleRow.id && x.permission_id === permRow.id)) continue;
              rpList.push(hydrateRow(MODELS.RolePermission, { role_id: roleRow.id, permission_id: permRow.id, scope: g.scope, read_only: !!g.readOnly }));
              this.dirtyTables.add('rolePermission');
              changed = true;
            }
          }
        }
        // grants the matrix promises but a database seeded earlier never received (e.g. BOM managing staff accounts or handling tickets): add the missing ones, never change existing ones
        if (rpList.length > 0) {
          for (const roleCode of ROLES) {
            const roleRow = roleList.find((x) => x.code === roleCode);
            if (!roleRow) continue;
            for (const [permCode, g] of Object.entries(ROLE_PERMISSIONS[roleCode] ?? {})) {
              const permRow = permList.find((x) => x.code === permCode);
              if (!permRow || rpList.some((x) => x.role_id === roleRow.id && x.permission_id === permRow.id)) continue;
              rpList.push(hydrateRow(MODELS.RolePermission, { role_id: roleRow.id, permission_id: permRow.id, scope: g.scope, read_only: !!g.readOnly }));
              this.dirtyTables.add('rolePermission');
              changed = true;
            }
          }
        }
        if (rpList.length === 0 || wasPermEmpty) {
          const existingKeys = new Set(rpList.map((x) => `${x.role_id}:${x.permission_id}`));
          for (const roleCode of ROLES) {
            const roleRow = roleList.find((x) => x.code === roleCode);
            if (!roleRow) continue;
            const grants = ROLE_PERMISSIONS[roleCode] ?? {};
            for (const [permCode, g] of Object.entries(grants)) {
              const permRow = permList.find((x) => x.code === permCode);
              if (!permRow) continue;
              const k = `${roleRow.id}:${permRow.id}`;
              if (!existingKeys.has(k)) {
                rpList.push(hydrateRow(MODELS.RolePermission, { role_id: roleRow.id, permission_id: permRow.id, scope: g.scope, read_only: !!g.readOnly }));
                existingKeys.add(k);
                this.dirtyTables.add('rolePermission');
                changed = true;
              }
            }
          }
        }
      }
      // Ensure ticket SR-2026-000006 is IN_PROGRESS so 'Đang xử lý' filter has a matching ticket for customer 1
      for (const t of rows('supportTicket')) {
        if (t.code === 'SR-2026-000006' && t.status === 'NEW') {
          t.status = 'IN_PROGRESS';
          this.dirtyTables.add('supportTicket');
          changed = true;
        }
        if (t.code === 'SR-2026-000019' && t.status === 'CANCELLED') {
          const notifs = rows('notification');
          const hasCancelNotif = notifs.some((n) => n.event_code === 'ticket.cancelled' && String(n.related_id) === String(t.id));
          if (!hasCancelNotif) {
            const maxId = notifs.reduce((m, n) => (BigInt(n.id ?? 0) > m ? BigInt(n.id ?? 0) : m), 0n);
            const rawNotif = {
              id: (maxId + 1n).toString(),
              public_id: '01M72DKW8R99ABCDE123456789',
              user_id: t.created_by ?? '9',
              event_code: 'ticket.cancelled',
              title: `Đã hủy yêu cầu ${t.code}`,
              body: `Yêu cầu hỗ trợ "${t.subject}" (${t.code}) đã được hủy.`,
              link: `/app/support/${t.public_id}`,
              related_type: 'ticket',
              related_id: String(t.id),
              priority: 'NORMAL',
              dedupe_key: null,
              read_at: null,
              created_at: t.closed_at ?? new Date().toISOString(),
            };
            notifs.push(hydrateRow(MODELS.Notification, rawNotif));
            this.dirtyTables.add('notification');
            changed = true;
          }
        }
      }
    }
    return changed;
  }

  public exportSnapshot(): string {
    const out: Record<string, any[]> = {};
    for (const delegate of Object.keys(DELEGATE_TO_MODEL)) {
      if (this.hydratedTables.has(delegate)) {
        out[delegate] = this.hydratedStore[delegate];
      } else if (this.rawData[delegate]) {
        out[delegate] = this.rawData[delegate];
      }
    }
    // `this[k]` is the value before toJSON runs: a Buffer reaches a plain replacer as {type:'Buffer',data}, a Uint8Array as {"0":..}
    return JSON.stringify(out, function (this: Record<string, unknown>, k: string, v: unknown) {
      const raw = this[k];
      if (typeof v === 'bigint') return v.toString();
      if (raw instanceof Uint8Array) return { __bytes: Buffer.from(raw).toString('base64') };
      return v;
    });
  }

  async onModuleDestroy() {}
  async $disconnect() {}

  /**
   * Transactions: serialised (one at a time per isolate, nested calls join the outer one) with an undo log, so a failure half-way
   * leaves no orphan rows - the Node/MySQL API gets this from the database, the in-memory store has to do it itself.
   */
  private async runTx<T>(fn: () => Promise<T>): Promise<T> {
    if (txStore.getStore()) return fn();
    const prev = txLock;
    let release!: () => void;
    txLock = new Promise<void>((r) => (release = r));
    await prev;
    const ctx = { undo: [] as Array<() => void> };
    try {
      const res = await txStore.run(ctx, fn);
      this.onMutate?.();
      return res;
    } catch (e) {
      for (const u of ctx.undo.reverse()) {
        try { u(); } catch { /* best effort */ }
      }
      this.onMutate?.();
      throw e;
    } finally {
      release();
    }
  }

  private recordUndo(fn: () => void) {
    txStore.getStore()?.undo.push(fn);
  }

  /** Stored generated columns of the MySQL schema (the database would compute these). */
  private applyGenerated(model: ModelMeta, row: Record<string, any>) {
    const f = model.fields;
    if (f.facility_key) row.facility_key = row.facility_id ?? 0;
    if (f.active_key) row.active_key = row.revoked_at == null ? 1 : null;
    if (f.open_unit_key) row.open_unit_key = row.status === 'ACTIVE' ? row.unit_id : null;
    if (f.active_pin_key) row.active_pin_key = ['ACTIVE', 'SUSPENDED'].includes(row.status) && row.type === 'PIN_CODE' ? row.pin_lookup_hash ?? null : null;
    if (f.balance_due && row.total != null) row.balance_due = Number(row.total) - Number(row.amount_paid ?? 0) - Number(row.amount_credited ?? 0);
    if (model.name === 'UnitType' && row.width_m != null && row.depth_m != null) {
      row.area_m2 = Number(row.width_m) * Number(row.depth_m);
      if (row.height_m != null) row.volume_m3 = Number(row.width_m) * Number(row.depth_m) * Number(row.height_m);
    }
  }

  private checkUnique(model: ModelMeta, row: Record<string, any>) {
    const tuples = [...(UNIQUES[model.name] ?? [])];
    if (model.pk.length > 1) tuples.push(model.pk);
    for (const cols of tuples) {
      if (cols.some((c) => row[c] === null || row[c] === undefined)) continue; // SQL: NULLs never collide
      const dup = this.store[model.delegate].find((r) => r !== row && cols.every((c) => eqVal(r[c], row[c])));
      if (dup) {
        const err: any = new Error(`Unique constraint failed on the fields: (${cols.join(',')})`);
        err.name = 'PrismaClientKnownRequestError';
        err.code = 'P2002';
        err.meta = { modelName: model.name, target: cols };
        throw err;
      }
    }
  }

  private mutateRow(model: ModelMeta, row: Record<string, any>, data: Record<string, any>) {
    const before = { ...row };
    this.applyUpdateData(model, row, data);
    this.applyGenerated(model, row);
    try {
      this.checkUnique(model, row);
    } catch (e) {
      Object.assign(row, before);
      throw e;
    }
    this.recordUndo(() => Object.assign(row, before));
  }

  async tx<T>(fn: (tx: this) => Promise<T>, _timeout?: number): Promise<T> {
    return this.runTx(() => fn(this));
  }

  async $transaction<T>(arg: ((tx: this) => Promise<T>) | Promise<any>[], _opts?: any): Promise<T> {
    if (typeof arg === 'function') return this.runTx(() => arg(this));
    const res = (await Promise.all(arg)) as unknown as T;
    this.onMutate?.();
    return res;
  }

  async $executeRaw(strings: TemplateStringsArray | any, ...values: any[]): Promise<number> {
    const sql = Array.isArray(strings) ? strings.join(' ? ') : String(strings?.sql ?? (Array.isArray(strings?.strings) ? strings.strings.join(' ? ') : strings));
    if (!Array.isArray(strings) && Array.isArray(strings?.values)) values = strings.values;
    if (sql.includes('INSERT INTO sequences')) {
      const [name, year] = values;
      const rows = this.store.sequence;
      const found = rows.find((r) => r.name === String(name) && Number(r.year) === Number(year));
      if (!found) {
        rows.push({ name: String(name), year: Number(year), next_value: 0 });
        this.dirtyTables.add('sequence');
      }
      return 1;
    }
    if (sql.includes('UPDATE sequences SET next_value')) {
      const [name, year] = values;
      const rows = this.store.sequence;
      let found = rows.find((r) => r.name === String(name) && Number(r.year) === Number(year));
      if (!found) {
        found = { name: String(name), year: Number(year), next_value: 0 };
        rows.push(found);
      }
      found.next_value = Number(found.next_value ?? 0) + 1;
      this.lastInsertId = BigInt(found.next_value);
      this.dirtyTables.add('sequence');
      return 1;
    }
    return 1;
  }

  async $queryRaw<T = any>(strings: TemplateStringsArray | any, ...values: any[]): Promise<T> {
    const sql = Array.isArray(strings) ? strings.join(' ? ') : String(strings?.sql ?? (Array.isArray(strings?.strings) ? strings.strings.join(' ? ') : strings));
    if (!Array.isArray(strings) && Array.isArray(strings?.values)) values = strings.values;
    if (sql.includes('SELECT LAST_INSERT_ID()')) {
      return [{ v: this.lastInsertId }] as unknown as T;
    }
    if (sql.includes('SELECT 1')) {
      return [{ 1: 1 }] as unknown as T;
    }
    if (sql.includes('FROM outbox_events')) {
      const now = new Date();
      const rows = this.store.outboxEvent
        .filter((r) => r.status === 'PENDING' && (!r.available_at || new Date(r.available_at) <= now))
        .sort((a, b) => cmpVal(a.id, b.id))
        .slice(0, 100)
        .map((r) => ({ id: r.id }));
      return rows as unknown as T;
    }
    if (sql.includes('FROM payments WHERE provider =')) {
      const [provider, orderRef] = values;
      const rows = this.store.payment
        .filter((r) => r.provider === provider && r.provider_order_ref === orderRef)
        .map((r) => ({ id: r.id }));
      return rows as unknown as T;
    }
    if (sql.includes('FROM units WHERE id =')) {
      const [unitId] = values;
      return this.store.unit.filter((r) => eqVal(r.id, unitId)).map((r) => ({ id: r.id })) as unknown as T;
    }
    if (sql.includes('FROM unit_types WHERE id =')) {
      const [id] = values;
      return this.store.unitType.filter((r) => eqVal(r.id, id)).map((r) => ({ id: r.id })) as unknown as T;
    }
    if (sql.includes('FROM promotions WHERE id =')) {
      const [id] = values;
      return this.store.promotion.filter((r) => eqVal(r.id, id)).map((r) => ({ id: r.id })) as unknown as T;
    }
    if (sql.includes('FROM appointment_slots WHERE id =')) {
      const [id] = values;
      return this.store.appointmentSlot.filter((r) => eqVal(r.id, id)).map((r) => ({ id: r.id })) as unknown as T;
    }
    if (sql.includes('FROM customers WHERE id =')) {
      const [id] = values;
      return this.store.customer.filter((r) => eqVal(r.id, id)).map((r) => ({ id: r.id })) as unknown as T;
    }
    if (sql.includes('FROM contracts WHERE id =')) {
      const [id] = values;
      return this.store.contract.filter((r) => eqVal(r.id, id)).map((r) => ({ id: r.id })) as unknown as T;
    }
    if (sql.includes('FROM users WHERE id =')) {
      const [id] = values;
      return this.store.user.filter((r) => eqVal(r.id, id)).map((r) => ({ id: r.id })) as unknown as T;
    }
    if (sql.includes('FROM daily_facility_metrics')) {
      const byMonth = new Map<string, { m: string; billed: number; collected: number; recognized: number; occ: number; tot: number }>();
      for (const r of this.store.dailyFacilityMetric) {
        if (Number(r.unit_type_key ?? 0) !== 0) continue;
        const d = r.metric_date instanceof Date ? r.metric_date.toISOString() : String(r.metric_date);
        const m = d.slice(0, 7);
        const g = byMonth.get(m) ?? { m, billed: 0, collected: 0, recognized: 0, occ: 0, tot: 0 };
        g.billed += Number(r.billed_amount ?? 0);
        g.collected += Number(r.collected_amount ?? 0);
        g.recognized += Number(r.recognized_revenue ?? 0);
        g.occ += Number(r.units_occupied ?? 0) + Number(r.units_overlocked ?? 0);
        g.tot += Number(r.units_total ?? 0) - Number(r.units_unavailable ?? 0);
        byMonth.set(m, g);
      }
      return [...byMonth.values()].sort((a, b) => a.m.localeCompare(b.m)) as unknown as T;
    }
    if (sql.includes('SELECT ut.size_category AS size')) {
      const [f, t] = values;
      const bySize = new Map<string, number>();
      for (const ii of this.store.invoiceItem) {
        if (ii.item_type !== 'RENT') continue;
        const inv = this.store.invoice.find((i) => eqVal(i.id, ii.invoice_id));
        if (!inv || inv.status === 'VOID') continue;
        if (f && cmpVal(inv.issue_date, f) < 0) continue;
        if (t && cmpVal(inv.issue_date, t) > 0) continue;
        const c = this.store.contract.find((x) => eqVal(x.id, inv.contract_id));
        const ut = c ? this.store.unitType.find((u) => eqVal(u.id, c.unit_type_id)) : null;
        if (!ut) continue;
        bySize.set(ut.size_category, (bySize.get(ut.size_category) ?? 0) + Number(ii.amount ?? 0));
      }
      return [...bySize.entries()].map(([size, amount]) => ({ size, amount })) as unknown as T;
    }
    if (sql.includes('SELECT ft.code, ii.item_type')) {
      const [f, t] = values;
      const byKey = new Map<string, { code: string | null; item_type: string; amount: number }>();
      for (const ii of this.store.invoiceItem) {
        const inv = this.store.invoice.find((i) => eqVal(i.id, ii.invoice_id));
        if (!inv || inv.status === 'VOID') continue;
        if (f && cmpVal(inv.issue_date, f) < 0) continue;
        if (t && cmpVal(inv.issue_date, t) > 0) continue;
        const ft = ii.fee_type_id ? this.store.feeType.find((x) => eqVal(x.id, ii.fee_type_id)) : null;
        const code = ft?.code ?? null;
        const k = `${code}|${ii.item_type}`;
        const g = byKey.get(k) ?? { code, item_type: ii.item_type, amount: 0 };
        g.amount += Number(ii.amount ?? 0);
        byKey.set(k, g);
      }
      return [...byKey.values()] as unknown as T;
    }
    if (sql.includes('FROM login_history')) {
      const [since] = values;
      const byHour = new Map<string, { h: string; ok: number; fail: number }>();
      for (const r of this.store.loginHistory) {
        if (since && cmpVal(r.created_at, since) < 0) continue;
        const h = new Date(r.created_at).toISOString().slice(0, 13).replace('T', ' ') + ':00';
        const g = byHour.get(h) ?? { h, ok: 0, fail: 0 };
        if (r.success) g.ok++;
        else g.fail++;
        byHour.set(h, g);
      }
      return [...byHour.values()].sort((a, b) => a.h.localeCompare(b.h)) as unknown as T;
    }
    if (sql.includes('FROM kb_chunks')) {
      throw new Error('FALLBACK_TO_FINDMANY');
    }
    return [] as unknown as T;
  }

  private matchWhere(model: ModelMeta, row: Record<string, any>, where: Record<string, any> | undefined): boolean {
    if (!where) return true;
    for (const [k, cond] of Object.entries(where)) {
      if (cond === undefined) continue;
      if (k === 'AND') {
        const arr = Array.isArray(cond) ? cond : [cond];
        if (!arr.every((c) => this.matchWhere(model, row, c))) return false;
        continue;
      }
      if (k === 'OR') {
        const arr = Array.isArray(cond) ? cond : [cond];
        if (!arr.some((c) => this.matchWhere(model, row, c))) return false;
        continue;
      }
      if (k === 'NOT') {
        const arr = Array.isArray(cond) ? cond : [cond];
        if (arr.some((c) => this.matchWhere(model, row, c))) return false;
        continue;
      }

      // Check composite unique key like role_id_permission_id or name_year or facility_id_code
      if (!model.fields[k] && !model.relations[k] && cond && typeof cond === 'object' && !Array.isArray(cond)) {
        const subKeys = Object.keys(cond);
        if (subKeys.length > 0 && subKeys.every((sk) => model.fields[sk])) {
          if (!this.matchWhere(model, row, cond)) return false;
          continue;
        }
      }

      const rel = model.relations[k];
      if (rel) {
        const related = this.getRelatedRows(model, row, rel);
        if (rel.isList) {
          if (cond.some && !related.some((r) => this.matchWhere(MODELS[rel.targetModel], r, cond.some))) return false;
          if (cond.every && !related.every((r) => this.matchWhere(MODELS[rel.targetModel], r, cond.every))) return false;
          if (cond.none && related.some((r) => this.matchWhere(MODELS[rel.targetModel], r, cond.none))) return false;
        } else {
          const single = related[0] ?? null;
          if (cond === null) {
            if (single !== null) return false;
          } else if (cond.is !== undefined) {
            if (cond.is === null && single !== null) return false;
            if (cond.is !== null && (!single || !this.matchWhere(MODELS[rel.targetModel], single, cond.is))) return false;
          } else if (cond.isNot !== undefined) {
            if (cond.isNot === null && single === null) return false;
            if (cond.isNot !== null && single && this.matchWhere(MODELS[rel.targetModel], single, cond.isNot)) return false;
          } else {
            if (!single || !this.matchWhere(MODELS[rel.targetModel], single, cond)) return false;
          }
        }
        continue;
      }

      const val = row[k];
      if (cond === null || typeof cond !== 'object' || cond instanceof Date || Buffer.isBuffer(cond)) {
        if (!eqVal(val, cond)) return false;
        continue;
      }

      if ('equals' in cond && !eqVal(val, cond.equals)) return false;
      if ('not' in cond) {
        if (cond.not === null || typeof cond.not !== 'object' || cond.not instanceof Date) {
          if (eqVal(val, cond.not)) return false;
        } else if (this.matchWhere(model, row, { [k]: cond.not })) {
          return false;
        }
      }
      if ('in' in cond && Array.isArray(cond.in)) {
        if (!cond.in.some((x: any) => eqVal(val, x))) return false;
      }
      if ('notIn' in cond && Array.isArray(cond.notIn)) {
        if (cond.notIn.some((x: any) => eqVal(val, x))) return false;
      }
      if ('lt' in cond && !(val != null && cmpVal(val, cond.lt) < 0)) return false;
      if ('lte' in cond && !(val != null && cmpVal(val, cond.lte) <= 0)) return false;
      if ('gt' in cond && !(val != null && cmpVal(val, cond.gt) > 0)) return false;
      if ('gte' in cond && !(val != null && cmpVal(val, cond.gte) >= 0)) return false;
      if ('contains' in cond) {
        if (val == null || !String(val).toLowerCase().includes(String(cond.contains).toLowerCase())) return false;
      }
      if ('startsWith' in cond) {
        if (val == null || !String(val).toLowerCase().startsWith(String(cond.startsWith).toLowerCase())) return false;
      }
      if ('endsWith' in cond) {
        if (val == null || !String(val).toLowerCase().endsWith(String(cond.endsWith).toLowerCase())) return false;
      }
    }
    return true;
  }

  private getRelatedRows(model: ModelMeta, row: Record<string, any>, rel: RelationMeta): Record<string, any>[] {
    const targetRows = this.store[rel.targetDelegate] ?? [];
    if (!rel.localFields || !rel.foreignFields) return [];
    const localVals = rel.localFields.map((lf) => row[lf]);
    if (localVals.some((v) => v == null)) return [];
    return targetRows.filter((tr) => rel.foreignFields!.every((ff, idx) => eqVal(tr[ff], localVals[idx])));
  }

  private sortRows(model: ModelMeta, rows: Record<string, any>[], orderBy: any): Record<string, any>[] {
    if (!orderBy) return rows;
    const orders = Array.isArray(orderBy) ? orderBy : [orderBy];
    return [...rows].sort((a, b) => {
      for (const ord of orders) {
        for (const [k, dir] of Object.entries(ord)) {
          if (dir && typeof dir === 'object' && !Array.isArray(dir)) {
            const rel = model.relations[k];
            if (rel && !rel.isList) {
              const ra = this.getRelatedRows(model, a, rel)[0];
              const rb = this.getRelatedRows(model, b, rel)[0];
              const subKey = Object.keys(dir)[0];
              const subDir = (dir as any)[subKey];
              const c = cmpVal(ra?.[subKey], rb?.[subKey]);
              if (c !== 0) return subDir === 'desc' ? -c : c;
            }
            continue;
          }
          const c = cmpVal(a[k], b[k]);
          if (c !== 0) return dir === 'desc' ? -c : c;
        }
      }
      return 0;
    });
  }

  private projectRow(model: ModelMeta, row: Record<string, any>, args?: { include?: any; select?: any }): Record<string, any> {
    if (!row) return row;
    if (args?.select) {
      const out: Record<string, any> = {};
      for (const [k, spec] of Object.entries(args.select)) {
        if (!spec) continue;
        if (k === '_count') {
          out._count = this.computeRelationCounts(model, row, spec);
          continue;
        }
        const rel = model.relations[k];
        if (rel) {
          out[k] = this.resolveRelation(model, row, rel, typeof spec === 'object' ? spec : undefined);
        } else {
          out[k] = row[k];
        }
      }
      return out;
    }

    const out: Record<string, any> = { ...row };
    if (args?.include) {
      for (const [k, spec] of Object.entries(args.include)) {
        if (!spec) continue;
        if (k === '_count') {
          out._count = this.computeRelationCounts(model, row, spec);
          continue;
        }
        const rel = model.relations[k];
        if (rel) {
          out[k] = this.resolveRelation(model, row, rel, typeof spec === 'object' ? spec : undefined);
        }
      }
    }
    return out;
  }

  private computeRelationCounts(model: ModelMeta, row: Record<string, any>, spec: any): Record<string, number> {
    const counts: Record<string, number> = {};
    const selectRels = spec === true ? Object.keys(model.relations) : Object.keys(spec?.select ?? {});
    for (const rk of selectRels) {
      const rel = model.relations[rk];
      if (!rel) continue;
      let related = this.getRelatedRows(model, row, rel);
      const subSpec = spec?.select?.[rk];
      if (subSpec && typeof subSpec === 'object' && subSpec.where) {
        related = related.filter((r) => this.matchWhere(MODELS[rel.targetModel], r, subSpec.where));
      }
      counts[rk] = related.length;
    }
    return counts;
  }

  private resolveRelation(model: ModelMeta, row: Record<string, any>, rel: RelationMeta, subArgs?: any): any {
    const targetModel = MODELS[rel.targetModel];
    let related = this.getRelatedRows(model, row, rel);
    if (subArgs?.where) {
      related = related.filter((r) => this.matchWhere(targetModel, r, subArgs.where));
    }
    if (subArgs?.orderBy) {
      related = this.sortRows(targetModel, related, subArgs.orderBy);
    }
    if (typeof subArgs?.skip === 'number') {
      related = related.slice(subArgs.skip);
    }
    if (typeof subArgs?.take === 'number') {
      related = subArgs.take >= 0 ? related.slice(0, subArgs.take) : related.slice(subArgs.take);
    }
    if (rel.isList) {
      return related.map((r) => this.projectRow(targetModel, r, subArgs));
    }
    const single = related[0] ?? null;
    return single ? this.projectRow(targetModel, single, subArgs) : null;
  }

  private createDelegate(model: ModelMeta) {
    const notifyMutate = () => {
      if (model.delegate !== 'jobRun') this.onMutate?.();
    };
    const findRows = (args?: any) => {
      let rows = (this.store[model.delegate] ?? []).filter((r) => this.matchWhere(model, r, args?.where));
      if (args?.orderBy) {
        rows = this.sortRows(model, rows, args.orderBy);
      }
      if (args?.distinct) {
        const dist = Array.isArray(args.distinct) ? args.distinct : [args.distinct];
        const seen = new Set<string>();
        rows = rows.filter((r) => {
          const key = dist.map((d: string) => String(r[d])).join('|');
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      }
      if (args?.cursor) {
        const idx = rows.findIndex((r) => this.matchWhere(model, r, args.cursor));
        if (idx >= 0) rows = rows.slice(idx);
      }
      if (typeof args?.skip === 'number') {
        rows = rows.slice(args.skip);
      }
      if (typeof args?.take === 'number') {
        rows = args.take >= 0 ? rows.slice(0, args.take) : rows.slice(args.take);
      }
      return rows;
    };

    const delegate: Record<string, any> = {
      findMany: async (args?: any) => {
        return findRows(args).map((r) => this.projectRow(model, r, args));
      },
      findFirst: async (args?: any) => {
        const row = findRows(args)[0] ?? null;
        return row ? this.projectRow(model, row, args) : null;
      },
      findFirstOrThrow: async (args?: any) => {
        const row = findRows(args)[0] ?? null;
        if (!row) {
          const err: any = new Error(`No ${model.name} found`);
          err.name = 'PrismaClientKnownRequestError';
          err.code = 'P2025';
          throw err;
        }
        return this.projectRow(model, row, args);
      },
      findUnique: async (args?: any) => {
        const row = findRows(args)[0] ?? null;
        return row ? this.projectRow(model, row, args) : null;
      },
      findUniqueOrThrow: async (args?: any) => {
        const row = findRows(args)[0] ?? null;
        if (!row) {
          const err: any = new Error(`No ${model.name} found`);
          err.name = 'PrismaClientKnownRequestError';
          err.code = 'P2025';
          throw err;
        }
        return this.projectRow(model, row, args);
      },
      count: async (args?: any) => {
        return findRows(args).length;
      },
      create: async (args: { data: Record<string, any>; include?: any; select?: any }) => {
        this.ensureHydrated(model.delegate);
        const now = new Date();
        const raw: Record<string, any> = {};
        const nestedCreates: Array<{ rel: RelationMeta; items: any[] }> = [];

        // Initialize all scalar fields with defaults or null
        for (const [fName, fMeta] of Object.entries(model.fields)) {
          if (fMeta.default?.kind === 'autoincrement') {
            this.autoInc[model.delegate] = (this.autoInc[model.delegate] ?? 0n) + 1n;
            raw[fName] = fMeta.type === 'BigInt' ? this.autoInc[model.delegate] : Number(this.autoInc[model.delegate]);
          } else if (fMeta.default?.kind === 'now' || fMeta.default?.kind === 'updatedAt') {
            raw[fName] = now;
          } else if (fMeta.default?.kind === 'literal') {
            raw[fName] = fMeta.default.value;
          } else {
            raw[fName] = null;
          }
        }

        for (const [k, v] of Object.entries(args.data ?? {})) {
          if (v === undefined) continue;
          const rel = model.relations[k];
          if (rel) {
            if (v && typeof v === 'object') {
              if (v.connect && rel.localFields && rel.foreignFields) {
                const targetDel = (this as any)[rel.targetDelegate];
                const targetRow = await targetDel.findFirst({ where: v.connect });
                if (targetRow) {
                  rel.localFields.forEach((lf, i) => {
                    raw[lf] = targetRow[rel.foreignFields![i]];
                  });
                }
              }
              if (v.create) {
                const items = Array.isArray(v.create) ? v.create : [v.create];
                nestedCreates.push({ rel, items });
              }
              if (v.createMany?.data) {
                const items = Array.isArray(v.createMany.data) ? v.createMany.data : [v.createMany.data];
                nestedCreates.push({ rel, items });
              }
            }
            continue;
          }
          raw[k] = v;
        }

        const row = hydrateRow(model, raw);
        this.applyGenerated(model, row);
        this.checkUnique(model, row); // no await between the check and the push: atomic in a single-threaded isolate
        this.store[model.delegate].push(row);
        this.dirtyTables.add(model.delegate);
        this.recordUndo(() => {
          const list = this.store[model.delegate];
          const i = list.indexOf(row);
          if (i >= 0) list.splice(i, 1);
        });

        // Execute nested creates
        for (const nc of nestedCreates) {
          const targetDel = (this as any)[nc.rel.targetDelegate];
          for (const item of nc.items) {
            const childData = { ...item };
            if (nc.rel.localFields && nc.rel.foreignFields) {
              nc.rel.foreignFields.forEach((ff, i) => {
                childData[ff] = row[nc.rel.localFields![i]];
              });
            }
            await targetDel.create({ data: childData });
          }
        }

        notifyMutate();
        return this.projectRow(model, row, args);
      },
      createMany: async (args: { data: Record<string, any>[]; skipDuplicates?: boolean }) => {
        let count = 0;
        for (const item of args.data ?? []) {
          await delegate.create({ data: item });
          count++;
        }
        return { count };
      },
      update: async (args: { where: any; data: Record<string, any>; include?: any; select?: any }) => {
        const row = findRows({ where: args.where })[0];
        if (!row) {
          const err: any = new Error(`No ${model.name} found to update`);
          err.name = 'PrismaClientKnownRequestError';
          err.code = 'P2025';
          throw err;
        }
        this.mutateRow(model, row, args.data);
        this.dirtyTables.add(model.delegate);
        notifyMutate();
        return this.projectRow(model, row, args);
      },
      updateMany: async (args: { where?: any; data: Record<string, any> }) => {
        const rows = findRows({ where: args?.where });
        for (const row of rows) {
          this.mutateRow(model, row, args.data);
        }
        if (rows.length) {
          this.dirtyTables.add(model.delegate);
          notifyMutate();
        }
        return { count: rows.length };
      },
      upsert: async (args: { where: any; create: Record<string, any>; update: Record<string, any>; include?: any; select?: any }) => {
        const existing = findRows({ where: args.where })[0];
        if (existing) {
          this.mutateRow(model, existing, args.update);
          this.dirtyTables.add(model.delegate);
          notifyMutate();
          return this.projectRow(model, existing, args);
        }
        return delegate.create({ data: args.create, include: args.include, select: args.select });
      },
      delete: async (args: { where: any; include?: any; select?: any }) => {
        const list = this.store[model.delegate];
        const idx = list.findIndex((r) => this.matchWhere(model, r, args.where));
        if (idx < 0) {
          const err: any = new Error(`No ${model.name} found to delete`);
          err.name = 'PrismaClientKnownRequestError';
          err.code = 'P2025';
          throw err;
        }
        const [removed] = list.splice(idx, 1);
        this.recordUndo(() => this.store[model.delegate].splice(Math.min(idx, this.store[model.delegate].length), 0, removed));
        this.dirtyTables.add(model.delegate);
        notifyMutate();
        return this.projectRow(model, removed, args);
      },
      deleteMany: async (args?: { where?: any }) => {
        const list = this.store[model.delegate];
        const keep = list.filter((r) => !this.matchWhere(model, r, args?.where));
        const deleted = list.length - keep.length;
        const removedRows = list.filter((r) => !keep.includes(r));
        this.store[model.delegate] = keep;
        this.recordUndo(() => this.store[model.delegate].push(...removedRows));
        if (deleted > 0) {
          this.dirtyTables.add(model.delegate);
          notifyMutate();
        }
        return { count: deleted };
      },
      aggregate: async (args?: any) => {
        const rows = findRows(args);
        return this.computeAggregate(rows, args);
      },
      groupBy: async (args: { by: string | string[]; where?: any; _count?: any; _sum?: any; _avg?: any; _min?: any; _max?: any; orderBy?: any; take?: number }) => {
        const byCols = Array.isArray(args.by) ? args.by : [args.by];
        const rows = findRows({ where: args.where });
        const groups = new Map<string, Record<string, any>[]>();
        for (const r of rows) {
          const key = byCols.map((c) => String(r[c])).join('||');
          const g = groups.get(key) ?? [];
          g.push(r);
          groups.set(key, g);
        }
        const out: Record<string, any>[] = [];
        for (const gRows of groups.values()) {
          const sample = gRows[0];
          const item: Record<string, any> = {};
          for (const c of byCols) item[c] = sample[c];
          const agg = this.computeAggregate(gRows, args);
          if (args._count === true) item._count = gRows.length;
          else if (args._count) item._count = agg._count;
          if (args._sum) item._sum = agg._sum;
          if (args._avg) item._avg = agg._avg;
          if (args._min) item._min = agg._min;
          if (args._max) item._max = agg._max;
          out.push(item);
        }
        return typeof args.take === 'number' ? out.slice(0, args.take) : out;
      },
    };
    return delegate;
  }

  private applyUpdateData(model: ModelMeta, row: Record<string, any>, data: Record<string, any>) {
    for (const [k, v] of Object.entries(data ?? {})) {
      if (v === undefined) continue;
      if (model.relations[k]) continue;
      const fMeta = model.fields[k];
      if (v && typeof v === 'object' && !(v instanceof Date) && !Buffer.isBuffer(v) && fMeta?.type !== 'Json') {
        if ('increment' in v) {
          row[k] = fMeta?.type === 'BigInt' ? BigInt(row[k] ?? 0) + BigInt(v.increment) : Number(row[k] ?? 0) + Number(v.increment);
          continue;
        }
        if ('decrement' in v) {
          row[k] = fMeta?.type === 'BigInt' ? BigInt(row[k] ?? 0) - BigInt(v.decrement) : Number(row[k] ?? 0) - Number(v.decrement);
          continue;
        }
        if ('set' in v) {
          row[k] = v.set;
          continue;
        }
      }
      row[k] = v;
    }
    if (model.fields.updated_at) {
      row.updated_at = new Date();
    }
    const hydrated = hydrateRow(model, row);
    Object.assign(row, hydrated);
  }

  private computeAggregate(rows: Record<string, any>[], args?: any) {
    const res: Record<string, any> = {};
    if (args?._count) {
      if (args._count === true) {
        res._count = rows.length;
      } else {
        res._count = {};
        for (const k of Object.keys(args._count)) {
          res._count[k] = k === '_all' ? rows.length : rows.filter((r) => r[k] != null).length;
        }
      }
    }
    if (args?._sum) {
      res._sum = {};
      for (const k of Object.keys(args._sum)) {
        res._sum[k] = rows.reduce((acc, r) => acc + Number(r[k] ?? 0), 0);
      }
    }
    if (args?._avg) {
      res._avg = {};
      for (const k of Object.keys(args._avg)) {
        res._avg[k] = rows.length ? rows.reduce((acc, r) => acc + Number(r[k] ?? 0), 0) / rows.length : null;
      }
    }
    if (args?._min) {
      res._min = {};
      for (const k of Object.keys(args._min)) {
        const vals = rows.map((r) => r[k]).filter((v) => v != null);
        res._min[k] = vals.length ? vals.sort(cmpVal)[0] : null;
      }
    }
    if (args?._max) {
      res._max = {};
      for (const k of Object.keys(args._max)) {
        const vals = rows.map((r) => r[k]).filter((v) => v != null);
        res._max[k] = vals.length ? vals.sort(cmpVal)[vals.length - 1] : null;
      }
    }
    return res;
  }
}

/** Read-only handles for the admin database console (apps/api/src/admin/db-console.ts). */
export const DB_MODELS = MODELS;
export const DB_TABLE_MODEL = TABLE_TO_MODEL;
export const dbHydrateRow = hydrateRow;
export const dbEq = eqVal;
export type DbModelMeta = ModelMeta;
export type DbFieldMeta = FieldMeta;

function formatBoundedSupportTicketSchemaMetaRawDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesGuardUnitSlotTxStoreCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

type VerifiedExpressDepositRPrismaPhase =
  'PENDING' | 'VERIFIED' | 'CLOSED';
