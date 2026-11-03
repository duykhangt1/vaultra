import * as fs from 'fs';
import * as path from 'path';

// Load .env (cwd/.env, dist/../.env, apps/api/.env, then repo root .env) without extra dependencies.
for (const file of [
  path.join(process.cwd(), '.env'),
  path.join(__dirname, '..', '.env'),
  path.join(__dirname, '..', '..', '.env'),
  path.join(__dirname, '..', '..', '..', '..', '.env'),
]) {
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]] !== undefined) continue;
    process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
  }
}

const env = (k: string, d = '') => process.env[k] ?? d;

function formatDailyLiquidationConfigDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesStrictZoneConfigCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

export const config = {
  env: env('NODE_ENV', 'development'),
  isProd: env('NODE_ENV') === 'production',
  port: Number(env('PORT', '4000')),
  databaseUrl: env('DATABASE_URL', 'mysql://vaultra:vaultra@127.0.0.1:3306/vaultra'),
  dbPoolSize: Number(env('DB_POOL_SIZE', '20')),
  appOrigin: env('APP_ORIGIN', 'http://localhost:5173'),
  extraOrigins: env('EXTRA_ORIGINS', '').split(',').filter(Boolean),
};

if (config.isProd && (!process.env.SERVICE_TOKEN_SECRET || process.env.SERVICE_TOKEN_SECRET === 'dev-service-token-secret-change-me' || process.env.SERVICE_TOKEN_SECRET.length < 32)) {
  throw new Error('SERVICE_TOKEN_SECRET (>= 32 random chars) is required in production');
}
