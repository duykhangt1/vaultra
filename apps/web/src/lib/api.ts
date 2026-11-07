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
const ORIGIN_CACHE_KEY = 'vaultra_backend_origin';

function resolveInitialOrigin(): string {
  const fromWin = typeof window !== 'undefined' ? (window as any).__VAULTRA_BACKEND_ORIGIN__ : undefined;
  if (typeof fromWin === 'string' && fromWin.trim()) {
    const clean = fromWin.trim().replace(/\/+$/, '');
    try { localStorage.setItem(ORIGIN_CACHE_KEY, clean); } catch { /* ignore */ }
    return clean;
  }
  const fromEnv = (import.meta.env.VITE_API_ORIGIN as string | undefined)?.replace(/\/+$/, '');
  if (fromEnv) return fromEnv;
  if (typeof window !== 'undefined' && /^localhost$|^127\.0\.0\.1$/.test(window.location.hostname)) {
    return 'http://127.0.0.1:4000';
  }
  try {
    const cached = localStorage.getItem(ORIGIN_CACHE_KEY);
    if (cached && /^https?:\/\//i.test(cached)) return cached.replace(/\/+$/, '');
  } catch { /* ignore */ }
  return 'http://127.0.0.1:4000';
}

export let API_ORIGIN = resolveInitialOrigin();
export let BASE = `${API_ORIGIN}/v1`;

if (typeof window !== 'undefined' && !(window as any).__VAULTRA_BACKEND_ORIGIN__ && !/^localhost$|^127\.0\.0\.1$/.test(window.location.hostname)) {
  void refreshBackendOriginFromR2();
}

export async function refreshBackendOriginFromR2(): Promise<string> {
  if (typeof document === 'undefined') return API_ORIGIN;
  await new Promise<void>((resolve) => {
    const s = document.createElement('script');
    s.src = `${R2_CONFIG_JS_URL}?t=${Date.now()}`;
    s.onload = () => { s.remove(); resolve(); };
    s.onerror = () => { s.remove(); resolve(); };
    document.head.appendChild(s);
  });
  const next = typeof window !== 'undefined' ? (window as any).__VAULTRA_BACKEND_ORIGIN__ : undefined;
  if (typeof next === 'string' && next.trim()) {
    API_ORIGIN = next.trim().replace(/\/+$/, '');
    BASE = `${API_ORIGIN}/v1`;
    try { localStorage.setItem(ORIGIN_CACHE_KEY, API_ORIGIN); } catch { /* ignore */ }
  }
  return API_ORIGIN;
}
const RT_KEY = 'vaultra_rt_fallback';
const getStoredRt = () => {
  try { return localStorage.getItem(RT_KEY); } catch { return null; }
};
export const setStoredRt = (rt: string | null) => {
  try {
    if (rt) localStorage.setItem(RT_KEY, rt);
    else localStorage.removeItem(RT_KEY);
  } catch { /* ignore */ }
};
export function consumeUrlRt(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const hp = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const sp = new URLSearchParams(window.location.search);
    const rtFromUrl = hp.get('rt') ?? sp.get('rt');
    if (rtFromUrl) {
      localStorage.setItem(RT_KEY, rtFromUrl);
      let changed = false;
      if (hp.has('rt')) { hp.delete('rt'); changed = true; }
      if (sp.has('rt')) { sp.delete('rt'); changed = true; }
      if (changed) {
        const restQ = sp.toString();
        const restH = hp.toString();
        window.history.replaceState(null, '', window.location.pathname + (restQ ? `?${restQ}` : '') + (restH ? `#${restH}` : ''));
      }
      return rtFromUrl;
    }
  } catch { /* ignore */ }
  return null;
}
consumeUrlRt();
const syncRtHeader = (r: Response) => {
  const rt = r.headers.get('X-Refresh-Token');
  if (rt !== null) setStoredRt(rt);
};
let accessToken: string | null = null;
let refreshing: Promise<string | null> | null = null;
/** True only when the server answered 401/403 to the last refresh (session really gone); false for timeouts, network errors and 5xx. */
let refreshRejected = false;
export const wasSessionRejected = () => refreshRejected;
let onSessionLost: (() => void) | null = null;
let activeFacility: string | null = null;

export const setAccessToken = (t: string | null) => (accessToken = t);
export const getAccessToken = () => accessToken;
export const setActiveFacilityHeader = (id: string | null) => (activeFacility = id);
export const onSessionExpired = (fn: () => void) => (onSessionLost = fn);

export function newIdemKey() {
  return (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/-/g, '');
}

export async function refreshSession(): Promise<string | null> {
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const headers: Record<string, string> = {};
        const rt = consumeUrlRt() ?? getStoredRt();
        if (rt) headers['X-Refresh-Token'] = rt;
        // Only a real 401/403 means the session is gone. A network blip or a 5xx must not sign the user out: retry first.
        let r: Response | null = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            r = await fetch(`${BASE}/auth/refresh`, { method: 'POST', headers, credentials: 'include', signal: AbortSignal.timeout(15_000) });
          } catch {
            r = null;
          }
          if (r && r.status < 500) break;
          await refreshBackendOriginFromR2();
          await new Promise((res) => setTimeout(res, 700 * (attempt + 1)));
        }
        refreshRejected = false;
        if (!r || r.status >= 500) return null;
        syncRtHeader(r);
        if (!r.ok) { refreshRejected = r.status === 401 || r.status === 403; return null; }
        const j = await r.json();
        accessToken = j.accessToken;
        window.dispatchEvent(new CustomEvent('vaultra:session', { detail: j }));
        return accessToken;
      } catch {
        refreshRejected = false;
        return null;
      } finally {
        setTimeout(() => (refreshing = null), 0);
      }
    })();
  }
  return refreshing;
}

type Opts = { method?: string; body?: unknown; query?: Record<string, any>; idempotent?: boolean | string; signal?: AbortSignal; raw?: boolean; headers?: Record<string, string> };

function qs(query?: Record<string, any>) {
  if (!query) return '';
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** No spinner may hang forever: a request that gets no answer in this long is given up with a clear message. */
const REQUEST_TIMEOUT_MS = 40_000;
/** Reads are safe to repeat, so a hung one is cut after 12 s and retried by the query client instead of leaving the screen stuck. */
const READ_TIMEOUT_MS = 12_000;
async function fetchOrTimeout(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (e) {
    if ((e as Error)?.name === 'TimeoutError') throw new ApiError(0, 'TIMEOUT', 'Máy chủ phản hồi quá chậm, vui lòng thử lại.');
    throw e;
  }
}

export async function api<T = any>(path: string, opts: Opts = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json', ...opts.headers };
  if (opts.body !== undefined && !(opts.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  if (opts.idempotent) headers['Idempotency-Key'] = typeof opts.idempotent === 'string' ? opts.idempotent : newIdemKey();
  if (activeFacility) headers['X-Active-Facility'] = activeFacility;
  const rt = getStoredRt();
  if (rt && path.startsWith('/auth/')) headers['X-Refresh-Token'] = rt;
  const limit = (opts.method ?? 'GET') === 'GET' ? READ_TIMEOUT_MS : REQUEST_TIMEOUT_MS;
  // A request that dies without any answer ("Failed to fetch": the Worker was cut off, or a 502/503/504 without CORS headers) is repeated
  // when that is safe: reads, idempotency-keyed writes and the price quote. Anything else surfaces a clear message instead.
  const retryable = (opts.method ?? 'GET') === 'GET' || !!headers['Idempotency-Key'] || path === '/quotes' || path.startsWith('/auth/refresh');
  const doFetch = async () => {
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    let last: unknown = null;
    for (let attempt = 0; attempt < (retryable ? 3 : 1); attempt++) {
      if (attempt) await new Promise((res) => setTimeout(res, 500 * attempt));
      try {
        const res = await fetchOrTimeout(() => fetch(`${BASE}${path}${qs(opts.query)}`, { method: opts.method ?? 'GET', headers, credentials: 'include', signal: opts.signal ? AbortSignal.any([opts.signal, AbortSignal.timeout(limit)]) : AbortSignal.timeout(limit), body: opts.body === undefined ? undefined : opts.body instanceof FormData ? opts.body : JSON.stringify(opts.body) }));
        if ([502, 503, 504].includes(res.status) && retryable && attempt < 2) { last = res; await refreshBackendOriginFromR2(); continue; }
        syncRtHeader(res);
        return res;
      } catch (e) {
        if (e instanceof ApiError || (e as Error)?.name === 'AbortError') throw e;
        last = e;
        await refreshBackendOriginFromR2();
        if (!retryable) break;
      }
    }
    if (last instanceof Response) { syncRtHeader(last); return last; }
    throw new ApiError(0, 'NETWORK', 'Không kết nối được máy chủ. Vui lòng thử lại sau vài giây.');
  };
  let r = await doFetch();
  if (r.status === 401 && !path.startsWith('/auth/login') && !path.startsWith('/auth/refresh')) {
    const t = await refreshSession();
    if (t) r = await doFetch();
    else if (wasSessionRejected() && (accessToken || path !== '/me')) onSessionLost?.();
  }
  if (opts.raw) return r as unknown as T;
  const rawText = await r.text();
  const text = API_ORIGIN ? rawText.replace(/https?:\/\/(?:localhost|127\.0\.0\.1|[a-z0-9-]+\.trycloudflare\.com|[a-z0-9.-]+\.workers\.dev)(?::\d+)?\/v1\b/gi, BASE) : rawText;
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-json */ }
  if (!r.ok) {
    const e = json?.error;
    const detailMsg = Array.isArray(e?.details) && e.details[0]?.message ? String(e.details[0].message) : undefined;
    const msg = (!e?.message || e.message === 'Dữ liệu không hợp lệ') && detailMsg ? detailMsg : (e?.message ?? `Lỗi ${r.status}`);
    throw new ApiError(r.status, e?.code ?? 'ERROR', msg, e?.details, e?.requestId);
  }
  return json as T;
}

export const get = <T = any>(path: string, query?: Record<string, any>, signal?: AbortSignal) => api<T>(path, { query, signal });
export const post = <T = any>(path: string, body: unknown = {}, idempotent: boolean | string = false) => api<T>(path, { method: 'POST', body, idempotent });
export const patch = <T = any>(path: string, body: unknown = {}) => api<T>(path, { method: 'PATCH', body });
export const put = <T = any>(path: string, body: unknown = {}) => api<T>(path, { method: 'PUT', body });
export const del = <T = any>(path: string, query?: Record<string, any>) => api<T>(path, { method: 'DELETE', query });

/** Server-sent events over fetch (assistant chat streaming). */
export async function sse(path: string, body: unknown, on: (event: string, data: any) => void, signal?: AbortSignal) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'text/event-stream' };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const r = await fetch(`${BASE}${path}`, { method: 'POST', headers, body: JSON.stringify(body), credentials: 'include', signal });
  if (!r.ok || !r.body) {
    const j = await r.json().catch(() => null);
    throw new ApiError(r.status, j?.error?.code ?? 'ERROR', j?.error?.message ?? `Lỗi ${r.status}`);
  }
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const frame = buf.slice(0, i);
      buf = buf.slice(i + 2);
      let ev = 'message';
      let data = '';
      for (const line of frame.split('\n')) {
        if (line.startsWith('event:')) ev = line.slice(6).trim();
        else if (line.startsWith('data:')) data += line.slice(5).trim();
      }
      if (data) { try { on(ev, JSON.parse(data)); } catch { /* ignore */ } }
    }
  }
}

/** Presigned upload: request URL → PUT bytes → complete. Returns the media id. */
export async function uploadFile(file: File | Blob, meta: { purpose: string; relatedType?: string; relatedId?: string; facilityId?: string; caption?: string; takenAt?: string }, mime = (file as File).type || 'image/jpeg') {
  const req = await post('/media/upload-url', { ...meta, mimeType: mime, sizeBytes: file.size });
  const put = await fetch(req.uploadUrl ?? req.url, { method: 'PUT', headers: { 'Content-Type': mime }, body: file });
  if (!put.ok) throw new ApiError(put.status, 'UPLOAD_FAILED', 'Tải tệp lên thất bại');
  await post(`/media/${req.id}/complete`, {});
  return req.id as string;
}

export async function openSignedMedia(id: string) {
  const { url } = await get<{ url: string }>(`/media/${id}/url`);
  window.open(url, '_blank', 'noopener,noreferrer');
}
