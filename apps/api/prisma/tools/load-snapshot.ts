/**
 * Loads the live database snapshot (Cloudflare R2 `_db/vaultra-diff-v1.json`, or the local backup when R2 is unreachable)
 * into a real MySQL/MariaDB schema, so it can be opened in DataGrip / phpMyAdmin and drawn as an ERD.
 *
 *   npx tsx prisma/tools/load-snapshot.ts                 -> schema `vaultra_live` (created from the migrations, FKs included)
 *   npx tsx prisma/tools/load-snapshot.ts --db demo_db    -> another schema name
 *   npx tsx prisma/tools/load-snapshot.ts --local         -> read apps/api/storage/r2-db-backup.json instead of R2
 *
 * It only ever writes to the target schema. A schema that already holds rows is refused unless `--reset` is passed
 * (that drops and rebuilds the target schema, nothing else). The snapshot is read, never modified.
 */
import '../../src/common/prisma.service'; // load order: prisma.service must come before r2-prisma (circular import)
import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import * as mariadb from 'mariadb';
import { config } from '../../src/common/config';
import { EdgePrismaService, DB_MODELS } from '../../src/common/r2-prisma';

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const flag = (name: string) => process.argv.includes(name);

const target = arg('--db') ?? 'vaultra_live';
if (!/^[A-Za-z0-9_]+$/.test(target)) throw new Error('Tên schema chỉ gồm chữ, số và dấu gạch dưới');
const base = new URL(process.env.DATABASE_URL || 'mysql://root:@127.0.0.1:3306/vaultra');
const SNAPSHOT_KEY = '_db/vaultra-diff-v1.json';
const LOCAL = path.resolve(config.storage.localDir, 'r2-db-backup.json');

async function readSnapshot(): Promise<{ data: Record<string, any[]>; source: string }> {
  if (!flag('--local') && config.storage.r2AccountId && config.storage.r2AccessKeyId && config.storage.r2SecretAccessKey) {
    try {
      const s3 = new S3Client({
        region: 'auto',
        endpoint: `https://${config.storage.r2AccountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId: config.storage.r2AccessKeyId, secretAccessKey: config.storage.r2SecretAccessKey },
      });
      const res = await s3.send(new GetObjectCommand({ Bucket: config.storage.r2PublicBucket || 'vaultra', Key: SNAPSHOT_KEY }));
      const raw = await res.Body?.transformToString();
      if (raw) return { data: JSON.parse(raw), source: `R2 ${config.storage.r2PublicBucket || 'vaultra'}/${SNAPSHOT_KEY}` };
    } catch (e: any) {
      console.warn(`Không đọc được R2 (${e?.message ?? e}), dùng bản sao lưu cục bộ.`);
    }
  }
  return { data: JSON.parse(fs.readFileSync(LOCAL, 'utf8')), source: `bản sao lưu cục bộ ${LOCAL}` };
}

function dbValue(type: string, v: unknown): unknown {
  if (v === null || v === undefined) return null;
  switch (type) {
    case 'Boolean':
      return v ? 1 : 0;
    case 'Json':
      return JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? x.toString() : x));
    case 'DateTime':
      return v instanceof Date ? v : new Date(v as string);
    case 'Bytes':
      return Buffer.isBuffer(v) ? v : Buffer.from(v as any);
    case 'BigInt':
      return typeof v === 'bigint' ? v : BigInt(v as any);
    case 'Int':
    case 'Float':
    case 'Decimal':
      return Number(v);
    default:
      return v;
  }
}

(async () => {
  const { data, source } = await readSnapshot();
  console.log(`Nguồn dữ liệu: ${source}`);

  // same clean-up the backend does on start-up, so dangling references never reach MySQL
  const edge = new EdgePrismaService();
  edge.loadSnapshot(data);
  edge.repairIntegrity();
  const store = edge.store as Record<string, Record<string, any>[]>;

  const admin = await mariadb.createConnection({
    host: base.hostname, port: Number(base.port || 3306), user: decodeURIComponent(base.username), password: decodeURIComponent(base.password),
    multipleStatements: true, allowPublicKeyRetrieval: true, timezone: 'Z',
  });
  try {
    const exists = (await admin.query('SELECT 1 FROM information_schema.schemata WHERE schema_name = ?', [target])).length > 0;
    if (exists) {
      const rows = await admin.query('SELECT COALESCE(SUM(table_rows),0) AS n FROM information_schema.tables WHERE table_schema = ? AND table_name <> "_prisma_migrations"', [target]);
      if (Number(rows[0].n) > 0 && !flag('--reset')) {
        throw new Error(`Schema ${target} đã có dữ liệu. Chạy lại với --reset để xóa và nạp mới (chỉ ảnh hưởng ${target}).`);
      }
    }
    if (flag('--reset')) await admin.query(`DROP DATABASE IF EXISTS \`${target}\``);
  } finally {
    await admin.end();
  }

  // 1. structure: the project's own migrations (tables, indexes, foreign keys)
  const url = new URL(base.toString());
  url.pathname = `/${target}`;
  const mig = spawnSync(process.execPath, [path.join(__dirname, 'migrate.cjs')], { env: { ...process.env, DATABASE_URL: url.toString() }, encoding: 'utf8' });
  process.stdout.write(mig.stdout ?? '');
  if (mig.status !== 0) throw new Error(`migrate.cjs lỗi: ${mig.stderr || mig.stdout}`);

  // 2. data
  const conn = await mariadb.createConnection({
    host: base.hostname, port: Number(base.port || 3306), user: decodeURIComponent(base.username), password: decodeURIComponent(base.password),
    database: target, allowPublicKeyRetrieval: true, timezone: 'Z', bigIntAsNumber: false,
  });
  const report: { table: string; expected: number; loaded: number; rejected: { pk: string; error: string }[] }[] = [];
  try {
    await conn.query('SET FOREIGN_KEY_CHECKS=0');
    const generated = new Set<string>(
      (await conn.query("SELECT CONCAT(table_name,'.',column_name) AS k FROM information_schema.columns WHERE table_schema = ? AND (extra LIKE '%GENERATED%' OR generation_expression <> '')", [target])).map((r: any) => r.k),
    );
    for (const model of Object.values(DB_MODELS).sort((a, b) => a.tableName.localeCompare(b.tableName))) {
      const rows = store[model.delegate] ?? [];
      const cols = Object.values(model.fields).filter((f) => !generated.has(`${model.tableName}.${f.name}`));
      const rejected: { pk: string; error: string }[] = [];
      if (rows.length) {
        const sql = `INSERT INTO \`${model.tableName}\` (${cols.map((c) => `\`${c.name}\``).join(',')}) VALUES (${cols.map(() => '?').join(',')})`;
        const values = (r: Record<string, any>) => cols.map((c) => dbValue(c.type, r[c.name]));
        for (let i = 0; i < rows.length; i += 500) {
          const chunk = rows.slice(i, i + 500);
          try {
            await conn.beginTransaction();
            await conn.batch(sql, chunk.map(values));
            await conn.commit();
          } catch {
            await conn.rollback();
            // the in-memory store does not enforce every MySQL constraint: find the rows MySQL refuses, load the others
            for (const r of chunk) {
              try {
                await conn.query(sql, values(r));
              } catch (e: any) {
                rejected.push({ pk: model.pk.map((k) => `${k}=${String(r[k])}`).join(','), error: String(e?.message ?? e).replace(/^\(conn:\d+, no: \d+, SQLState: \w+\)\s*/, '').split('\n')[0].slice(0, 160) });
              }
            }
          }
        }
      }
      const [{ n }] = await conn.query(`SELECT COUNT(*) AS n FROM \`${model.tableName}\``);
      report.push({ table: model.tableName, expected: rows.length, loaded: Number(n), rejected });
    }
    await conn.query('SET FOREIGN_KEY_CHECKS=1');
  } finally {
    await conn.end();
  }

  const total = report.reduce((s, r) => s + r.loaded, 0);
  console.log(`\nĐã nạp ${total.toLocaleString('vi-VN')} dòng vào ${report.length} bảng của schema ${target}.`);
  const rejectedTables = report.filter((r) => r.rejected.length);
  if (rejectedTables.length) {
    console.log('\nMySQL từ chối một số dòng vì vi phạm ràng buộc (kho lưu trong bộ nhớ không kiểm tra hết các ràng buộc này). Các dòng đó KHÔNG được nạp:');
    for (const r of rejectedTables) {
      console.log(`  ${r.table}: ${r.rejected.length} dòng bị từ chối (snapshot ${r.expected}, nạp ${r.loaded})`);
      for (const x of r.rejected.slice(0, 3)) console.log(`      ${x.pk} — ${x.error}`);
    }
  }
  const unexplained = report.filter((r) => r.loaded + r.rejected.length !== r.expected);
  if (unexplained.length) {
    console.log('LỆCH SỐ DÒNG KHÔNG GIẢI THÍCH ĐƯỢC:', unexplained.map((r) => `${r.table} (${r.expected} vs ${r.loaded}+${r.rejected.length})`).join(', '));
    process.exitCode = 2;
  } else console.log('\nMọi dòng đều được tính: đã nạp hoặc nằm trong danh sách bị từ chối ở trên.');
})().catch((e) => {
  console.error(e?.message ?? e);
  process.exit(1);
});
