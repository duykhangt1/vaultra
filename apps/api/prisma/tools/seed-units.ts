/**
 * Adds free (AVAILABLE) storage units to the three demo facilities so every unit type has a handful of units to rent,
 * and places each new unit on its zone's floor plan (below the existing shapes, enlarging the plan if it has to).
 * Nothing else is touched. New units carry the note `demo:more-units`, which is how --remove finds them again.
 *
 *   npx tsx prisma/tools/seed-units.ts --dry      -> show what would be added, write nothing
 *   npx tsx prisma/tools/seed-units.ts --apply    -> back up, then write apps/api/storage + R2
 *   npx tsx prisma/tools/seed-units.ts --remove --apply   -> take exactly these units out again
 *
 * The backend keeps the database in memory and re-uploads it on every change: stop it before --apply.
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
const arg = (n: string) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : undefined; };

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

// ------------------------------------------------------------------------------------------------ build
const NOTE = 'demo:more-units';
/** free units wanted per unit type (by size category); the script only tops up what is missing */
const WANT: Record<string, number> = { XS: 6, S: 6, M: 5, L: 3, XL: 2 };
const EXTRA = Number(arg('--extra') ?? 0), EXTRA_FAC = arg('--fac');   // --fac 2 --extra 6: keep 6 more free units per type than usual in that facility
const wantFor = (ut: Row) => (ut.code === 'M6G' ? 3 : WANT[ut.size_category] ?? 0);

function build(snap: Snap) {
  const T = (n: string) => (snap[n] ??= []);
  const nextId: Record<string, number> = {};
  const add = (t: string, row: Row) => { const id = (nextId[t] ??= Math.max(0, ...T(t).map((r) => Number(r.id))) + 1); nextId[t] = id + 1; const r = { ...row, id: String(id) }; T(t).push(r); return r; };
  const now = new Date().toISOString();
  const out: { facility: string; type: string; added: number; free: string }[] = [];
  for (const f of T('facility').filter((x) => ['1', '2', '3'].includes(x.id))) {
    const zones = T('zone').filter((z) => z.facility_id === f.id && !z.deleted_at).sort((a, b) => Number(a.floor) - Number(b.floor));
    if (!zones.length) continue;
    const nums = T('unit').filter((u) => u.facility_id === f.id).map((u) => /^[A-Z]-(\d{3})$/.exec(String(u.code))?.[1]).filter(Boolean).map(Number);
    let seq = Math.max(0, ...nums);
    let flip = 0;
    const created: { unit: Row; ut: Row }[] = [];
    for (const ut of T('unitType').filter((u) => u.facility_id === f.id && !u.deleted_at && u.status === 'ACTIVE' && ['XS1', 'S2', 'M5', 'M6G', 'L10', 'XL20'].includes(String(u.code)))) {
      const want = wantFor(ut) + (EXTRA && f.id === EXTRA_FAC ? EXTRA : 0);
      if (!want) continue;
      const units = T('unit').filter((u) => u.unit_type_id === ut.id && !u.deleted_at);
      const free = units.filter((u) => u.status === 'AVAILABLE').length;
      const tpl = units[0];
      if (!tpl) continue;
      const need = Math.max(0, want - free);
      for (let k = 0; k < need; k++) {
        seq += 1;
        const ground = String(ut.name).includes('tầng trệt') || ut.ground_floor === true;
        const zone = ground ? zones[0] : zones[flip++ % zones.length];
        const unit = add('unit', { ...tpl, public_id: ulid(), facility_id: f.id, unit_type_id: ut.id, zone_id: zone.id, code: `${zone.code}-${String(seq).padStart(3, '0')}`, status: 'AVAILABLE', operational_flag: 'NONE', status_reason: null, last_vacated_at: null, notes: NOTE, cleaned_at: now, version: 0, created_at: now, updated_at: now, deleted_at: null });
        created.push({ unit, ut });
      }
      out.push({ facility: f.name, type: `${ut.code} ${ut.name}`, added: need, free: `${free} -> ${free + need}` });
    }
    // floor-plan shapes: same layout rule as the app's "create units" screen
    for (const zone of zones) {
      const mine = created.filter((c) => c.unit.zone_id === zone.id);
      if (!mine.length) continue;
      const plan = T('floorPlan').find((p) => p.zone_id === zone.id);
      if (!plan) continue;
      const shapes = T('unitShape').filter((s) => s.floor_plan_id === plan.id);
      const g = Math.max(5, Number(plan.grid_size) || 20), margin = 40, gap = 24, width = Number(plan.width) >= 200 ? Number(plan.width) : 1200;
      const snapTo = (v: number) => Math.round(v / g) * g;
      const clamp = (v: number) => Math.min(200, Math.max(60, Math.round(v / 10) * 10));
      let y = shapes.length ? snapTo(Math.max(...shapes.map((s) => Number(s.y) + Number(s.h))) + margin) : margin;
      let x = margin, rowH = 0, bottom = y;
      for (const { unit, ut } of mine) {
        const w = clamp(Number(ut.width_m) * 40) || 80, h = clamp(Number(ut.depth_m) * 40) || 70;
        if (x + w > width - margin && x > margin) { x = margin; y = snapTo(y + rowH + gap); rowH = 0; }
        add('unitShape', { floor_plan_id: plan.id, unit_id: unit.id, x: snapTo(x), y: snapTo(y), w, h, rotation: 0 });
        x += w + gap; rowH = Math.max(rowH, h); bottom = Math.max(bottom, y + h);
      }
      if (bottom + margin > Number(plan.height)) plan.height = snapTo(bottom + margin); // keep every new shape inside the canvas
    }
  }
  return out;
}

function remove(snap: Snap) {
  const T = (n: string) => (snap[n] ??= []);
  // only units that are still free: one that has since been rented must stay
  const ids = new Set(T('unit').filter((u) => u.notes === NOTE && u.status === 'AVAILABLE').map((u) => u.id));
  const drop = (t: string, pred: (r: Row) => boolean) => { const b = T(t).length; snap[t] = T(t).filter((r) => !pred(r)); return b - snap[t].length; };
  const shapes = drop('unitShape', (r) => ids.has(r.unit_id));
  const units = drop('unit', (r) => ids.has(r.id));
  return { units, shapes };
}

async function main() {
  const apply = flag('--apply');
  if (apply && !flag('--force') && (await portBusy(4000))) { console.error('Something is listening on port 4000 (the backend). Stop it first.'); process.exit(2); }
  const { snap, from } = await readBase();
  const base: Snap = JSON.parse(JSON.stringify(snap));
  console.log(`Base snapshot: ${from} — ${snap.unit.length} units, ${snap.unitShape.length} floor-plan shapes`);
  if (flag('--remove')) console.log('Removed:', remove(snap));
  else {
    console.table(build(snap));
  }
  const e = new EdgePrismaService();
  e.loadSnapshot(JSON.parse(JSON.stringify(snap)));
  e.repairIntegrity();
  const st = (e as any).store as Record<string, any[]>;
  const diff: Record<string, number> = {};
  for (const t of Object.keys(base)) { const d = (st[t]?.length ?? 0) - (base[t]?.length ?? 0); if (d) diff[t] = d; }
  console.log('Row changes after the engine integrity pass:', diff);
  const unexpected = Object.keys(diff).filter((t) => !['unit', 'unitShape'].includes(t));
  if (unexpected.length) throw new Error(`Unexpected changes in: ${unexpected.join(', ')}; nothing written`);
  if (!apply) { console.log('Dry run: nothing written.'); return; }
  const payload = e.exportSnapshot();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = path.resolve(path.dirname(LOCAL), `backup-before-units-${stamp}.json`);
  if (fs.existsSync(LOCAL)) fs.copyFileSync(LOCAL, backup);
  console.log(`Local backup kept at ${backup}`);
  fs.writeFileSync(`${LOCAL}.tmp`, payload, 'utf8');
  fs.renameSync(`${LOCAL}.tmp`, LOCAL);
  if (s3) { await s3.send(new PutObjectCommand({ Bucket: bucket, Key: KEY, Body: payload, ContentType: 'application/json' })); console.log('Uploaded to R2.'); }
  else console.warn('No R2 credentials: only the local file was written.');
  console.log('Done. Start the backend again.');
}

main().catch((e) => { console.error(e?.message ?? e); process.exit(1); });
