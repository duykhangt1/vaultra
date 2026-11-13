/**
 * Permanently deletes the given accounts and everything that belongs to them (customer profile, reservations, contracts,
 * invoices, payments, deposits, sessions, notifications ...). Units that were held or rented by them go back to AVAILABLE.
 * The audit log is kept (its actor reference is cleared by the engine's integrity pass).
 *
 *   npx tsx prisma/tools/delete-accounts.ts a@x.com b@y.com --dry     -> show what would go, write nothing
 *   npx tsx prisma/tools/delete-accounts.ts a@x.com b@y.com --apply   -> back up, then write apps/api/storage + R2
 *
 * The backend keeps the database in memory and re-uploads it on every change: stop it first.
 */
import '../../src/common/prisma.service'; // load order: prisma.service before r2-prisma (circular import)
import * as fs from 'fs';
import * as net from 'net';
import * as path from 'path';
import { ulid } from 'ulid';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { config } from '../../src/common/config';
import { EdgePrismaService } from '../../src/common/r2-prisma';

type Row = Record<string, any>;
type Snap = Record<string, Row[]>;

const KEY = '_db/vaultra-diff-v1.json';
const LOCAL = path.resolve(config.storage.localDir, 'r2-db-backup.json');
const flag = (n: string) => process.argv.includes(n);

// ------------------------------------------------------------------------------------------------ snapshot io
const s3 = config.storage.r2AccountId && config.storage.r2AccessKeyId && config.storage.r2SecretAccessKey
  ? new S3Client({ region: 'auto', endpoint: `https://${config.storage.r2AccountId}.r2.cloudflarestorage.com`, credentials: { accessKeyId: config.storage.r2AccessKeyId, secretAccessKey: config.storage.r2SecretAccessKey } })
  : null;
const bucket = config.storage.r2PublicBucket || 'vaultra';

/** Same choice the backend makes at start-up: the fuller local backup wins, otherwise R2. */
async function readBase(): Promise<{ snap: Snap; from: string }> {
  let r2: Snap | null = null;
  if (s3) {
    try {
      const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: KEY }));
      const raw = await res.Body?.transformToString();
      if (raw) r2 = JSON.parse(raw);
    } catch (e: any) { console.warn(`R2 not readable (${e?.message ?? e}); using the local backup`); }
  }
  const local: Snap | null = fs.existsSync(LOCAL) ? JSON.parse(fs.readFileSync(LOCAL, 'utf8')) : null;
  if (local && (!r2 || (local.contract ?? []).length > (r2.contract ?? []).length || Object.keys(local).length > Object.keys(r2).length)) return { snap: local, from: 'local backup' };
  if (r2) return { snap: r2, from: 'R2' };
  throw new Error('No snapshot found (neither R2 nor apps/api/storage/r2-db-backup.json)');
}

function portBusy(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.connect({ port, host: '127.0.0.1' });
    s.once('connect', () => { s.destroy(); resolve(true); });
    s.once('error', () => resolve(false));
    s.setTimeout(800, () => { s.destroy(); resolve(false); });
  });
}


const emails = process.argv.slice(2).filter((a) => a.includes('@')).map((a) => a.toLowerCase());

function purge(snap: Snap) {
  const T = (n: string) => (snap[n] ??= []);
  const users = T('user').filter((u) => emails.includes(String(u.email).toLowerCase()));
  const missing = emails.filter((e) => !users.some((u) => String(u.email).toLowerCase() === e));
  if (missing.length) throw new Error(`Not found: ${missing.join(', ')}`);
  const protect = T('userRole').filter((r) => users.some((u) => u.id === r.user_id) && !r.revoked_at && ['SYSTEM_ADMIN', 'BUSINESS_OPS_MANAGER'].includes(T('role').find((x) => x.id === r.role_id)?.code));
  if (protect.length) throw new Error('One of the accounts is an active admin / BOM: refusing');
  const uid = new Set(users.map((u) => u.id));
  const customers = T('customer').filter((c) => uid.has(c.user_id));
  const cid = new Set(customers.map((c) => c.id));
  const contracts = T('contract').filter((c) => cid.has(c.customer_id));
  const ctid = new Set(contracts.map((c) => c.id));
  const reservations = T('reservation').filter((r) => cid.has(r.customer_id));
  const rid = new Set(reservations.map((r) => r.id));
  const unitIds = new Set<string>([...contracts.map((c) => c.unit_id), ...reservations.map((r) => r.unit_id)].filter(Boolean));
  const roots: [string, (r: Row) => boolean][] = [
    ['payment', (r) => cid.has(r.customer_id)],
    ['invoice', (r) => cid.has(r.customer_id) || ctid.has(r.contract_id)],
    ['deposit', (r) => cid.has(r.customer_id)],
    ['quote', (r) => rid.has(r.reservation_id)],
    ['reservation', (r) => rid.has(r.id)],
    ['contract', (r) => ctid.has(r.id)],
    ['customer', (r) => cid.has(r.id)],
    ['userRole', (r) => uid.has(r.user_id)],
    ['userSession', (r) => uid.has(r.user_id)],
    ['user', (r) => uid.has(r.id)],
  ];
  const removed: Record<string, number> = {};
  for (const [t, pred] of roots) { const before = T(t).length; snap[t] = T(t).filter((r) => !pred(r)); removed[t] = before - snap[t].length; }
  // units held / rented by them go back on the shelf, unless another live contract or reservation still uses them
  const freed: string[] = [];
  for (const u of T('unit')) {
    if (!unitIds.has(u.id) || ['AVAILABLE', 'OUT_OF_SERVICE', 'RETIRED'].includes(u.status)) continue;
    const stillUsed = T('contract').some((c) => c.unit_id === u.id && ['ACTIVE', 'MOVE_OUT_SCHEDULED', 'EXPIRED', 'PENDING_SIGNATURE', 'SIGNED'].includes(c.status)) || T('reservation').some((r) => r.unit_id === u.id && ['HELD', 'CONFIRMED', 'PENDING_PAYMENT'].includes(r.status));
    if (stillUsed) continue;
    freed.push(`${u.code}:${u.status}->AVAILABLE`);
    u.status = 'AVAILABLE'; u.updated_at = new Date().toISOString(); u.version = Number(u.version ?? 0) + 1;
  }
  return { removed, freed, users: users.map((u) => u.email) };
}

async function main() {
  if (!emails.length) { console.error('Give at least one e-mail address'); process.exit(2); }
  const apply = flag('--apply');
  if (apply && !flag('--force') && (await portBusy(4000))) { console.error('Something is listening on port 4000 (the backend). Stop it first.'); process.exit(2); }
  const { snap, from } = await readBase();
  const base: Snap = JSON.parse(JSON.stringify(snap));
  console.log(`Base snapshot: ${from} — ${snap.contract.length} contracts, ${snap.invoice.length} invoices, ${snap.user.length} users`);
  const r = purge(snap);
  console.log('Explicitly removed:', r.removed);
  console.log('Units freed:', r.freed);
  // the engine's own loader + integrity pass cascades to everything that hangs off the removed rows
  const e = new EdgePrismaService();
  e.loadSnapshot(JSON.parse(JSON.stringify(snap)));
  e.repairIntegrity();
  const st = (e as any).store as Record<string, any[]>;
  const cascade: Record<string, number> = {};
  for (const t of Object.keys(base)) { const d = (base[t]?.length ?? 0) - (st[t]?.length ?? 0); if (d) cascade[t] = d; }
  console.log('Total rows removed per table (after cascade):', cascade);
  const left = (st.user ?? []).filter((u) => emails.includes(String(u.email).toLowerCase())).length;
  console.log(`Accounts still present: ${left}; users ${base.user.length} -> ${st.user.length}; contracts ${base.contract.length} -> ${st.contract.length}`);
  if (left) throw new Error('Accounts still present after purge');
  if (!apply) { console.log('Dry run: nothing written.'); return; }
  const payload = e.exportSnapshot();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = path.resolve(path.dirname(LOCAL), `backup-before-delete-accounts-${stamp}.json`);
  if (fs.existsSync(LOCAL)) fs.copyFileSync(LOCAL, backup);
  console.log(`Local backup kept at ${backup}`);
  fs.writeFileSync(`${LOCAL}.tmp`, payload, 'utf8');
  fs.renameSync(`${LOCAL}.tmp`, LOCAL);
  if (s3) { await s3.send(new PutObjectCommand({ Bucket: bucket, Key: KEY, Body: payload, ContentType: 'application/json' })); console.log('Uploaded to R2.'); }
  else console.warn('No R2 credentials: only the local file was written.');
  console.log('Done. Start the backend again.');
}

main().catch((e) => { console.error(e?.message ?? e); process.exit(1); });
