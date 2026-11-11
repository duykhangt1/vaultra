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

export const config = {
  env: env('NODE_ENV', 'development'),
  isProd: env('NODE_ENV') === 'production',
  port: Number(env('PORT', '4000')),
  databaseUrl: env('DATABASE_URL', 'mysql://vaultra:vaultra@127.0.0.1:3306/vaultra'),
  dbPoolSize: Number(env('DB_POOL_SIZE', '20')),
  appOrigin: env('APP_ORIGIN', 'http://localhost:5173'),
  extraOrigins: env('EXTRA_ORIGINS', '').split(',').filter(Boolean),
  apiPublicUrl: env('API_PUBLIC_URL', 'http://localhost:4000'),
  brandName: env('BRAND_NAME', 'Vaultra'),
  keysDir: env('KEYS_DIR', path.join(__dirname, '..', '..', '.keys')),
  jwtPrivateKey: env('JWT_PRIVATE_KEY'),
  jwtPublicKey: env('JWT_PUBLIC_KEY'),
  fieldEncryptionKey: env('FIELD_ENCRYPTION_KEY'),
  serviceTokenSecret: env('SERVICE_TOKEN_SECRET', 'dev-service-token-secret-change-me'),
  /** Only trust CDN/proxy supplied client IP headers (cf-connecting-ip) when the API really sits behind such a proxy. */
  trustProxyHeaders: env('TRUST_PROXY_HEADERS', 'true') === 'true',
  /** Exact extra origins plus optional regex patterns (anchored, https) that may call the API with credentials. */
  originPatterns: env('ORIGIN_PATTERNS', '').split(',').map((x) => x.trim()).filter(Boolean),
  cookieSecure: env('COOKIE_SECURE', 'false') === 'true',
  google: {
    clientId: env('GOOGLE_CLIENT_ID'),
    clientSecret: env('GOOGLE_CLIENT_SECRET'),
    redirectUri: env('GOOGLE_REDIRECT_URI', 'https://vaultra-844.pages.dev/auth/callback'),
  },
  smtp: {
    host: env('SMTP_HOST'),
    port: Number(env('SMTP_PORT', '1025')),
    user: env('SMTP_USER'),
    pass: env('SMTP_PASS'),
    secure: env('SMTP_SECURE', 'false') === 'true',
  },
  emailFrom: env('EMAIL_FROM', env('SMTP_FROM', 'Vaultra Support <support@zermango.com>')),
  storage: {
    driver: env('STORAGE_DRIVER', 'local') as 'local' | 'r2',
    localDir: env('STORAGE_LOCAL_DIR', path.join(__dirname, '..', '..', 'storage')),
    r2AccountId: env('R2_ACCOUNT_ID'),
    r2AccessKeyId: env('R2_ACCESS_KEY_ID'),
    r2SecretAccessKey: env('R2_SECRET_ACCESS_KEY'),
    r2PublicBucket: env('R2_PUBLIC_BUCKET', 'media-public'),
    r2PrivateBucket: env('R2_PRIVATE_BUCKET', 'media-private'),
    r2PublicBaseUrl: env('R2_PUBLIC_BASE_URL'),
  },
  payments: {
    // VNPay is the only online gateway.
    provider: 'VNPAY' as const,
    // VNPay (https://sandbox.vnpayment.vn for the sandbox): TMN code + hash secret come by email after free registration.
    vnpay: {
      // reconciliation asks VNPay's querydr API only when this is on; otherwise it uses the system's own records (demo)
      queryApi: env('VNPAY_QUERY_API') === 'true',
      tmnCode: env('VNPAY_TMN_CODE'),
      hashSecret: env('VNPAY_HASH_SECRET'),
      payUrl: env('VNPAY_PAY_URL', 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html'),
      apiUrl: env('VNPAY_API_URL', 'https://sandbox.vnpayment.vn/merchant_webapi/api/transaction'),
    },
  },
  gemini: {
    // No built-in keys: set GEMINI_API_KEYS (comma separated) in the environment. Empty = deterministic fallback replies.
    apiKey: env('GEMINI_API_KEY'),
    apiKeys: env('GEMINI_API_KEYS', env('GEMINI_API_KEY'))
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean),
    model: env('GEMINI_MODEL', 'gemini-3.5-flash-lite'),
    modelLite: env('GEMINI_MODEL_LITE', 'gemini-3.5-flash-lite'),
  },
  turnstileSecret: env('TURNSTILE_SECRET_KEY', env('TURNSTILE_SECRET')),
  jobs: {
    enabled: env('JOBS_ENABLED', 'true') === 'true',
  },
  testClock: env('ENABLE_TEST_CLOCK', env('NODE_ENV') === 'production' ? 'false' : 'true') === 'true',
};

if (config.isProd && (!process.env.SERVICE_TOKEN_SECRET || process.env.SERVICE_TOKEN_SECRET === 'dev-service-token-secret-change-me' || process.env.SERVICE_TOKEN_SECRET.length < 32)) {
  throw new Error('SERVICE_TOKEN_SECRET (>= 32 random chars) is required in production');
}
