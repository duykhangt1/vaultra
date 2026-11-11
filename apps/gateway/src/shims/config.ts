/**
 * Worker configuration. NOTHING secret lives in this file: every key, token and password is a Cloudflare Worker secret
 * (`wrangler secret put NAME`) and is copied into `config` by applyEnv() at the start of each request.
 * Required secrets: SERVICE_TOKEN_SECRET, JWT_PRIVATE_KEY, JWT_PUBLIC_KEY, FIELD_ENCRYPTION_KEY.
 * Optional: GOOGLE_CLIENT_SECRET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, VNPAY_HASH_SECRET, GEMINI_API_KEYS (comma separated),
 * VNPAY_HASH_SECRET, TURNSTILE_SECRET_KEY.
 */
export const config = {
  env: 'production',
  isProd: true,
  port: 4000,
  databaseUrl: '',
  dbPoolSize: 10,
  appOrigin: 'https://vaultra-844.pages.dev',
  extraOrigins: ['http://localhost:5173', 'https://vaultra-844.pages.dev'] as string[],
  originPatterns: ['https://[a-z0-9]+\\.vaultra-844\\.pages\\.dev'] as string[],
  trustProxyHeaders: true,
  apiPublicUrl: 'https://vaultra-gateway.zerngulon.workers.dev',
  brandName: 'Vaultra',
  keysDir: '/tmp/keys',
  jwtPrivateKey: 'REPLACE_WITH_YOUR_OWN_SECRET',
  jwtPublicKey: 'REPLACE_WITH_YOUR_OWN_SECRET',
  fieldEncryptionKey: 'REPLACE_WITH_YOUR_OWN_SECRET',
  serviceTokenSecret: 'REPLACE_WITH_YOUR_OWN_SECRET',
  cookieSecure: true,
  google: {
    clientId: '483384984587-ejhcsb8s49c8h2509j86qnog670hu34j.apps.googleusercontent.com',
    clientSecret: 'REPLACE_WITH_YOUR_OWN_SECRET',
    redirectUri: 'https://vaultra-gateway.zerngulon.workers.dev/v1/auth/google/callback',
  },
  smtp: { host: 'mail49.vietnix.vn', port: 465, user: 'support@zermango.com', pass: 'REPLACE_WITH_YOUR_OWN_SECRET', secure: true },
  emailFrom: 'Vaultra Support <support@zermango.com>',
  storage: {
    driver: 'r2' as 'local' | 'r2',
    localDir: '/tmp/storage',
    r2AccountId: '0e057a93c13437ab7a9f464e23cd9b48',
    r2AccessKeyId: 'REPLACE_WITH_YOUR_OWN_SECRET',
    r2SecretAccessKey: 'REPLACE_WITH_YOUR_OWN_SECRET',
    r2PublicBucket: 'vaultra',
    r2PrivateBucket: 'vaultra',
    r2PublicBaseUrl: 'https://pub-f7f8d059b55647939fcb0a260339fde0.r2.dev',
  },
  payments: {
    provider: 'VNPAY' as 'VNPAY',
    mockSecret: 'REPLACE_WITH_YOUR_OWN_SECRET',
    sepayWebhookKey: '',
    sepayAccount: '',
    sepayBank: '',
    sepayBeneficiary: '',
    vnpay: { queryApi: false, tmnCode: 'BYHO7AIM', hashSecret: 'REPLACE_WITH_YOUR_OWN_SECRET', payUrl: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html', apiUrl: 'https://sandbox.vnpayment.vn/merchant_webapi/api/transaction', returnUrl: '' },
  },
  gemini: { apiKey: '', apiKeys: [] as string[], model: 'gemini-3.5-flash-lite', modelLite: 'gemini-3.5-flash-lite' },
  turnstileSecret: '',
  jobs: { enabled: false },
  testClock: false,
};

type EnvLike = Record<string, unknown>;
const str = (env: EnvLike, k: string) => (typeof env[k] === 'string' ? (env[k] as string).trim() : '');

/** Copies Worker vars/secrets into `config`. */
export function applyEnv(env: EnvLike) {
  config.serviceTokenSecret = str(env, 'SERVICE_TOKEN_SECRET') || 'REPLACE_WITH_YOUR_OWN_SECRET';
  config.jwtPrivateKey = str(env, 'JWT_PRIVATE_KEY') || 'REPLACE_WITH_YOUR_OWN_SECRET';
  config.jwtPublicKey = str(env, 'JWT_PUBLIC_KEY') || 'REPLACE_WITH_YOUR_OWN_SECRET';
  config.fieldEncryptionKey = str(env, 'FIELD_ENCRYPTION_KEY') || 'REPLACE_WITH_YOUR_OWN_SECRET';
  config.google.clientId = str(env, 'GOOGLE_CLIENT_ID') || '483384984587-ejhcsb8s49c8h2509j86qnog670hu34j.apps.googleusercontent.com';
  config.google.clientSecret = str(env, 'GOOGLE_CLIENT_SECRET') || 'REPLACE_WITH_YOUR_OWN_SECRET';
  config.google.redirectUri = str(env, 'GOOGLE_REDIRECT_URI') || 'https://vaultra-gateway.zerngulon.workers.dev/v1/auth/google/callback';
  config.smtp.host = str(env, 'SMTP_HOST') || 'mail49.vietnix.vn';
  config.smtp.user = str(env, 'SMTP_USER') || 'support@zermango.com';
  config.smtp.pass = str(env, 'SMTP_PASS') || 'REPLACE_WITH_YOUR_OWN_SECRET';
  if (str(env, 'SMTP_PORT')) { config.smtp.port = Number(str(env, 'SMTP_PORT')); config.smtp.secure = config.smtp.port === 465; }
  config.storage.r2AccessKeyId = str(env, 'R2_ACCESS_KEY_ID') || 'REPLACE_WITH_YOUR_OWN_SECRET';
  config.storage.r2SecretAccessKey = str(env, 'R2_SECRET_ACCESS_KEY') || 'REPLACE_WITH_YOUR_OWN_SECRET';
  config.payments.vnpay.hashSecret = str(env, 'VNPAY_HASH_SECRET') || 'REPLACE_WITH_YOUR_OWN_SECRET';
  config.payments.vnpay.queryApi = str(env, 'VNPAY_QUERY_API') === 'true';
  config.turnstileSecret = str(env, 'TURNSTILE_SECRET_KEY');
  // VNPay is the only gateway (TMN code is public, the hash secret is a Worker secret).
  // Local sandbox switches (set only in .dev.vars, never in production)
  config.testClock = str(env, 'ENABLE_TEST_CLOCK') === 'true';
  const defaultGeminiKeys = [
    'REPLACE_WITH_YOUR_OWN_SECRET',
    'REPLACE_WITH_YOUR_OWN_SECRET',
    'REPLACE_WITH_YOUR_OWN_SECRET',
    'REPLACE_WITH_YOUR_OWN_SECRET',
    'REPLACE_WITH_YOUR_OWN_SECRET',
  ];
  const envKeys = str(env, 'GEMINI_API_KEYS').split(',').map((k) => k.trim()).filter(Boolean);
  const keys = envKeys.length ? envKeys : defaultGeminiKeys;
  config.gemini.apiKeys = keys;
  config.gemini.apiKey = keys[0] ?? '';
  if (str(env, 'APP_ORIGIN')) { config.appOrigin = str(env, 'APP_ORIGIN'); config.extraOrigins = ['http://localhost:5173', config.appOrigin]; }
  if (str(env, 'API_ORIGIN')) config.apiPublicUrl = str(env, 'API_ORIGIN');
}
