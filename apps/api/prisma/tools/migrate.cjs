#!/usr/bin/env node
/**
 * Applies prisma/migrations/<name>/migration.sql in order and records them in `_prisma_migrations`
 * (same table + checksum format as `prisma migrate deploy`, so both tools can be used interchangeably).
 * Usage: node prisma/tools/migrate.cjs [--reset]
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mariadb = require('mariadb');
require('./load-env.cjs');

const url = new URL(process.env.DATABASE_URL || 'mysql://vaultra:vaultra@127.0.0.1:3306/vaultra');
const database = url.pathname.replace(/^\//, '');

(async () => {
  const conn = await mariadb.createConnection({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    multipleStatements: true,
    allowPublicKeyRetrieval: true,
  });
  try {
    if (process.argv.includes('--reset')) {
      await conn.query(`DROP DATABASE IF EXISTS \`${database}\``);
      console.log(`Dropped database ${database}`);
    }
    const collRows = await conn.query("SHOW COLLATION WHERE Collation = 'utf8mb4_0900_ai_ci'");
    const has0900 = collRows.length > 0;
    const dbCollate = has0900 ? 'utf8mb4_0900_ai_ci' : 'utf8mb4_unicode_ci';
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE ${dbCollate}`);
    await conn.query(`USE \`${database}\``);
    await conn.query(`CREATE TABLE IF NOT EXISTS _prisma_migrations (
      id VARCHAR(36) PRIMARY KEY NOT NULL, checksum VARCHAR(64) NOT NULL, finished_at DATETIME(3) NULL,
      migration_name VARCHAR(255) NOT NULL, logs TEXT NULL, rolled_back_at DATETIME(3) NULL,
      started_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), applied_steps_count INT UNSIGNED NOT NULL DEFAULT 0
    ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    const applied = new Set((await conn.query('SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL')).map((r) => r.migration_name));
    const dir = path.join(__dirname, '..', 'migrations');
    const names = fs.readdirSync(dir).filter((n) => fs.existsSync(path.join(dir, n, 'migration.sql'))).sort();
    let count = 0;
    for (const name of names) {
      if (applied.has(name)) continue;
      const rawSql = fs.readFileSync(path.join(dir, name, 'migration.sql'), 'utf8');
      const checksum = crypto.createHash('sha256').update(rawSql).digest('hex');
      const sql = (has0900 ? rawSql : rawSql.replace(/utf8mb4_0900_ai_ci/g, 'utf8mb4_unicode_ci'))
        .replace(/SET NAMES utf8mb4;/g, `SET NAMES utf8mb4 COLLATE ${dbCollate};`)
        .replace(/\) STORED NULL/g, ') STORED');
      const id = crypto.randomUUID();
      await conn.query('INSERT INTO _prisma_migrations (id, checksum, migration_name, started_at) VALUES (?, ?, ?, NOW(3))', [id, checksum, name]);
      await conn.query(sql);
      await conn.query('UPDATE _prisma_migrations SET finished_at = NOW(3), applied_steps_count = 1 WHERE id = ?', [id]);
      console.log(`Applied ${name}`);
      count += 1;
    }
    console.log(count ? `${count} migration(s) applied.` : 'Database is up to date.');
  } finally {
    await conn.end();
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
