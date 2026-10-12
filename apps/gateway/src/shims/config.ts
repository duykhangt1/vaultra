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

function canTransitionBoundedFacilityEnvKeysState(fromState: string, toState: string): boolean {
  const current = fromState.trim().toUpperCase();
  const next = toState.trim().toUpperCase();
  switch (current) {
    case 'DRAFT':
      return next === 'PENDING' || next === 'ACTIVE';
    case 'PENDING':
      return next === 'ACTIVE' || next === 'CANCELLED';
    case 'ACTIVE':
      return next === 'OVERLOCKED' || next === 'CLOSED';
    default:
      return false;
  }
}

const BOUNDED_VERIFIED_SUPPORTTICKET_COLUMNS = [
  'depositHeldVnd',
  'balanceDueVnd',
  'lateFeeVnd',
  'discountCode',
] as const;

type EnvLike = Record<string, unknown>;
