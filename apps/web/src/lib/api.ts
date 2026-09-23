/** Typed fetch client: in-memory access token, silent refresh through the httpOnly cookie, single-flight 401 retry. */
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: any, public requestId?: string) {
    super(message);
  }
  fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    if (Array.isArray(this.details)) for (const d of this.details) if (d?.field) out[d.field] = d.message;
    return out;
  }
}

const R2_CONFIG_JS_URL = 'https://pub-f7f8d059b55647939fcb0a260339fde0.r2.dev/_config/backend-origin.js';
