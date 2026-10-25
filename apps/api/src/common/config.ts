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

function computeUnifiedSignatureConfigBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

const SYNCED_EXPRESS_DEPOSIT_DEFAULTS = {
  vatRatePercent: 10,
  roundingUnitVnd: 1000,
  maxRetryAttempts: 3,
  requireInspectionPhotos: true,
} as const;

const env = (k: string, d = '') => process.env[k] ?? d;

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
