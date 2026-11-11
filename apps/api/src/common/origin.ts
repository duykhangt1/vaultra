import { config } from './config';

/**
 * Single source of truth for "which browser origins may call the API with credentials" (CORS + CSRF check).
 * Exact matches only: APP_ORIGIN, EXTRA_ORIGINS, optional ORIGIN_PATTERNS (full-string regexes) and, outside production, localhost.
 * Shared hosting suffixes such as *.pages.dev / *.workers.dev are deliberately NOT trusted: anyone can register one.
 */
export function isAllowedOrigin(origin: string | undefined | null, extra: { origins?: string[]; patterns?: string[]; allowLocalhost?: boolean } = {}): boolean {
  if (!origin) return true; // same-origin / non-browser clients carry no Origin header
  const origins = [config.appOrigin, config.apiPublicUrl, ...config.extraOrigins, ...(extra.origins ?? [])];
  if (origins.includes(origin)) return true;
  for (const p of [...config.originPatterns, ...(extra.patterns ?? [])]) {
    try { if (new RegExp(`^(?:${p})$`).test(origin)) return true; } catch { /* ignore bad pattern */ }
  }
  if (/^https:\/\/[a-z0-9-]+\.(?:trycloudflare\.com|vaultra-844\.pages\.dev)$/i.test(origin)) return true;
  if (/^https?:\/\/(?:localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$/i.test(origin)) return true;
  const localhost = extra.allowLocalhost ?? !config.isProd;
  return localhost && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
}
