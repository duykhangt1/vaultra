/**
 * Cloudflare Worker Serverless Full-Stack Backend + Edge Gateway + FacilityHub Durable Object
 * Runs 100% natively on Cloudflare Workers + R2 without requiring any local backend server.
 */
import { EdgeApp } from './edge-app';
import { applyEnv } from './shims/config';
import { RealtimeHub } from '../../api/src/realtime/realtime.hub';
import { isAllowedOrigin } from '../../api/src/common/origin';

export interface Env {
  APP_ORIGIN: string;
  API_ORIGIN: string;
  INTERNAL_JOB_SECRET?: string;
  [secret: string]: unknown;
  TURNSTILE_SECRET_KEY?: string;
  FACILITY_HUB: {
    idFromName(name: string): unknown;
    get(id: unknown, opts?: { locationHint?: string }): { fetch(req: Request): Promise<Response> };
  };
  VAULTRA_MEDIA?: {
    get(key: string): Promise<{ text(): Promise<string>; arrayBuffer(): Promise<ArrayBuffer>; size?: number } | null>;
    head?(key: string): Promise<{ size: number; etag?: string } | null>;
    delete?(key: string): Promise<unknown>;
    put(key: string, value: string | ArrayBuffer | Uint8Array, opts?: unknown): Promise<{ etag?: string } | unknown>;
  };
}

export interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

function corsHeaders(origin: string | null, allowedOrigin: string): Record<string, string> {
  // Exact allow-list (see api/src/common/origin.ts): shared hosting suffixes such as *.pages.dev are NOT trusted.
  const allow = origin && isAllowedOrigin(origin) ? origin : allowedOrigin;
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,Idempotency-Key,X-Active-Facility,X-Request-Id,X-Internal-Secret,X-Mock-Signature,X-Turnstile-Token,X-Refresh-Token,If-Match',
    'Access-Control-Expose-Headers': 'X-Request-Id,X-Refresh-Token,RateLimit-Limit,RateLimit-Remaining,RateLimit-Reset,Retry-After',
  };
}

let appInstance: EdgeApp | null = null;
let lastR2LoadAt = 0;
let pendingMutation = false;
let repairedOnce = false;
let lastEtag: string | null = null;
const R2_STATE_KEY = '_db/vaultra-diff-v1.json';

/**
 * The in-memory store is reloaded from / persisted to R2 around requests. Without serialisation a concurrent request could
 * reload the snapshot over another request's not-yet-persisted change (or reset the shared mutation flag), silently
 * dropping it - e.g. a media file reverting to PENDING right after "complete". Writes therefore run one at a time, and the
 * periodic reload of a read waits for any write in progress.
 */
let lockTail: Promise<unknown> = Promise.resolve();
let hubEnv: Env | null = null;

/**
 * Cross-isolate lease. Cloudflare runs several isolates of this Worker at once and each keeps its own copy of the data: two of them
 * doing reload -> change -> save at the same time overwrite each other (a login's refresh token vanished and the user was signed out).
 * One Durable Object hands out a single lease at a time, so every write section in every isolate runs strictly one after another.
 * The lease expires by itself (8 s) so a crashed isolate can never block the others.
 */
async function acquireLease(ttlMs = 6000): Promise<string | null> {
  const env = hubEnv;
  if (!env?.FACILITY_HUB) return null;
  try {
    const stub = env.FACILITY_HUB.get(env.FACILITY_HUB.idFromName('db-mutex'));
    const r = await stub.fetch(new Request('https://do.internal/__acquire?ttl=' + ttlMs, { method: 'POST' }));
    return ((await r.json()) as { token?: string }).token ?? null;
  } catch {
    return null; // fall back to the in-isolate lock only
  }
}
async function releaseLease(token: string | null) {
  const env = hubEnv;
  if (!token || !env?.FACILITY_HUB) return;
  const stub = env.FACILITY_HUB.get(env.FACILITY_HUB.idFromName('db-mutex'));
  // awaited: a fire-and-forget subrequest can be dropped when the invocation ends, and the lease would then block everyone until it expires
  await stub.fetch(new Request('https://do.internal/__release?token=' + token, { method: 'POST' })).catch(() => undefined);
}

function withLock<T>(fn: () => Promise<T>, remote = true, ttlMs = 6000): Promise<T> {
  const task = async () => {
    const token = remote ? await acquireLease(ttlMs) : null;
    try {
      return await fn();
    } finally {
      await releaseLease(token);
    }
  };
  const run = lockTail.then(task, task);
  // a slow request (AI call, SMTP) must not freeze every other button: the queue moves on after 12s
  lockTail = Promise.race([run.catch(() => undefined), new Promise((res) => setTimeout(res, 12000))]);
  return run;
}

async function reloadFromR2(env: Env, app: EdgeApp) {
  lastR2LoadAt = Date.now();
  try {
    // Parsing and re-hydrating the whole snapshot is the slow part: skip it when R2 still holds what this isolate wrote/read.
    const head = await env.VAULTRA_MEDIA!.head?.(R2_STATE_KEY);
    if (head?.etag && head.etag === lastEtag) return;
    const obj = await env.VAULTRA_MEDIA!.get(R2_STATE_KEY);
    if (obj) {
      lastEtag = (obj as { etag?: string }).etag ?? head?.etag ?? null;
      app.prisma.loadSnapshot(JSON.parse(await obj.text()));
    }
  } catch {
    // Use bundled seed snapshot on first boot
  }
  // Old snapshots (and the bundled seed) carry dangling references; repair once per isolate and persist the result.
  if (!repairedOnce) {
    repairedOnce = true;
    if (app.prisma.repairIntegrity()) pendingMutation = true;
  }
}

async function getEdgeApp(env: Env, locked: boolean, forceReloadR2 = false): Promise<EdgeApp> {
  if (!appInstance) {
    const inst = new EdgeApp();
    await inst.init();
    appInstance = inst;
  }
  const app = appInstance;
  // reads check R2's etag on every request (one cheap HEAD): a read right after a write on another isolate must see that write
  if (env.VAULTRA_MEDIA && (forceReloadR2 || !locked)) {
    if (locked) await reloadFromR2(env, app);
    else {
      // cheap unlocked check first: when R2 is unchanged a read never has to queue behind a write or an email batch
      const head = await env.VAULTRA_MEDIA.head?.(R2_STATE_KEY).catch(() => null);
      if (head?.etag && head.etag === lastEtag) lastR2LoadAt = Date.now();
      else await withLock(() => reloadFromR2(env, app), false);
    }
  }
  app.prisma.onMutate = () => {
    pendingMutation = true;
  };
  return app;
}

/**
 * Realtime on the Worker. The in-isolate RealtimeHub has no sockets (they live in the FacilityHub Durable Object), so its
 * toUser/toFacility calls are buffered here and published to the DO after a write. Every write also sends a generic
 * {type:'data.changed'} to all connected tabs: the client then refetches only the queries on screen, so whatever user A
 * changes appears for user B without F5. Payloads carry no data, only "something changed" (spec §18.6).
 */
type RtMsg = { targets: string[]; event: object };
const rtOut: RtMsg[] = [];
let hubPatched = false;
function patchHub(app: EdgeApp) {
  if (hubPatched) return;
  hubPatched = true;
  const hub = app.hub as unknown as Record<string, unknown>;
  hub.toUser = (u: string, e: object) => rtOut.push({ targets: [`u:${u}`], event: e });
  hub.toFacility = (f: string, e: object) => rtOut.push({ targets: [`f:${f}`], event: e });
  hub.revokeUser = (u: string) => rtOut.push({ targets: [`u:${u}`], event: { type: 'session.revoked' } });
}
// writes that change nothing anyone else is looking at: no refetch storm on every login/refresh/chat message
const QUIET_WRITES = [/\/auth\//, /\/notifications/, /\/assistant/, /\/chatbot/, /\/media\/upload-url/, /\/webhooks\//];
async function publishRealtime(env: Env, msgs: RtMsg[]) {
  if (!msgs.length || !env.FACILITY_HUB) return;
  const stub = env.FACILITY_HUB.get(env.FACILITY_HUB.idFromName('global'));
  await stub.fetch(new Request('https://do.internal/__publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(msgs) }));
}

/**
 * Sends queued emails. SMTP is slow and can hang, so it runs OUTSIDE the write lock: only the short DB writes around it take the lock
 * (guard), and the snapshot is persisted at the end. Otherwise every button press waits behind a stuck mail connection.
 */
async function flushEmailsLocked(env: Env, limit = 3) {
  if (!env.VAULTRA_MEDIA) return;
  const app = await getEdgeApp(env, false, false);
  // Every DB write of the dispatcher first reloads what other isolates saved, then saves at once. Writing this isolate's possibly stale
  // memory later would overwrite their work (a new refresh token, a session...) and log people out.
  const guard = <T,>(fn: () => Promise<T>) =>
    withLock(async () => {
      await reloadFromR2(env, app);
      const out = await fn();
      lastEtag = ((await env.VAULTRA_MEDIA!.put(R2_STATE_KEY, app.prisma.exportSnapshot())) as { etag?: string } | undefined)?.etag ?? null;
      lastR2LoadAt = Date.now();
      pendingMutation = false;
      return out;
    });
  await Promise.race([app.flushEmails(limit, guard), new Promise<boolean>((res) => setTimeout(() => res(true), 20000))]);
}

/** Cron tick: run due background jobs, persist, send the mail they queued, tell open tabs to refresh. */
async function runCron(env: Env) {
  if (!env.VAULTRA_MEDIA) return;
  // reload -> jobs -> save is one critical section: a stale save would wipe sessions and tokens written meanwhile by other isolates
  const { app, results } = await withLock(async () => {
    const app = await getEdgeApp(env, true, true);
    patchHub(app);
    const results = await app.runDueJobs();
    await app.events.dispatch().catch(() => undefined);
    pendingMutation = false;
    lastEtag = ((await env.VAULTRA_MEDIA!.put(R2_STATE_KEY, app.prisma.exportSnapshot())) as { etag?: string } | undefined)?.etag ?? null;
    lastR2LoadAt = Date.now();
    return { app, results };
  }, true, 25000);
  console.log('[cron] jobs', JSON.stringify(results));
  void app;
  const msgs = rtOut.splice(0);
  if (results.some((r) => r.processed > 0)) msgs.push({ targets: ['all'], event: { type: 'data.changed', path: '/jobs' } });
  await publishRealtime(env, msgs).catch(() => undefined);
  // small batches: every mail takes the write lock several times, and a long run starves logins and buttons (they time out as "Failed to fetch")
  await flushEmailsLocked(env, 5);
}

export default {
  async scheduled(_event: unknown, env: Env, ctx: ExecutionContext) {
    hubEnv = env;
    applyEnv(env as unknown as Record<string, unknown>);
    (globalThis as unknown as { __R2?: unknown }).__R2 = env.VAULTRA_MEDIA;
    ctx.waitUntil(runCron(env).catch((e) => console.error('[cron] failed:', e?.message)));
  },

  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    hubEnv = env;
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    try {
      applyEnv(env as unknown as Record<string, unknown>);
      (globalThis as unknown as { __R2?: unknown }).__R2 = env.VAULTRA_MEDIA;
    } catch (e) {
      return new Response(JSON.stringify({ error: { code: 'MISCONFIGURED', message: 'Server is not configured' } }), { status: 503, headers: { 'Content-Type': 'application/json' } });
    }
    const cors = corsHeaders(origin, env.APP_ORIGIN || 'https://vaultra-844.pages.dev');
    const requestId = request.headers.get('X-Request-Id') || crypto.randomUUID();

    if (request.method === 'OPTIONS') {
      // Max-Age: without it browsers re-run the preflight about every 5 s, so most requests cost two round trips
      return new Response(null, { status: 204, headers: { ...cors, 'Access-Control-Max-Age': '7200', 'X-Request-Id': requestId } });
    }

    if (url.pathname === '/edge/health' || url.pathname === '/v1/health') {
      return new Response(JSON.stringify({ status: 'ok', edge: true, serverless: true, requestId }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...cors, 'X-Request-Id': requestId },
      });
    }

    // Bridge Google OAuth callback to the active Cloudflare Tunnel backend (if running)
    if (url.pathname === '/v1/auth/google/callback') {
      const cip = request.headers.get('cf-connecting-ip') || '';
      const cc = request.headers.get('cf-ipcountry') || '';
      const stateParam = url.searchParams.get('state') || '';
      let parsedState: { cbOrigin?: string; feOrigin?: string } = {};
      try {
        const payloadB64 = stateParam.split('.')[0];
        if (payloadB64) {
          const pad = payloadB64.replace(/-/g, '+').replace(/_/g, '/');
          parsedState = JSON.parse(atob(pad)) as { cbOrigin?: string; feOrigin?: string };
        }
      } catch {}

      let targetOrigin = '';
      if (parsedState.cbOrigin && /^https?:\/\//i.test(parsedState.cbOrigin)) {
        const clean = parsedState.cbOrigin.trim().replace(/\/+$/, '');
        if (clean !== url.origin && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(clean)) {
          targetOrigin = clean;
        }
      }
      if (!targetOrigin && env.VAULTRA_MEDIA) {
        try {
          const obj = await env.VAULTRA_MEDIA.get('_config/backend-origin.json');
          if (obj) {
            const cfg = JSON.parse(await obj.text()) as { origin?: string };
            const clean = (cfg.origin || '').trim().replace(/\/+$/, '');
            if (clean && /^https?:\/\//i.test(clean) && clean !== url.origin && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(clean)) {
              targetOrigin = clean;
            }
          }
        } catch {}
      }
      if (!targetOrigin && parsedState.cbOrigin && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(parsedState.cbOrigin) && parsedState.feOrigin && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(parsedState.feOrigin)) {
        targetOrigin = parsedState.cbOrigin.trim().replace(/\/+$/, '');
      }

      if (targetOrigin) {
        const forwardUrl = new URL(url.pathname + url.search, targetOrigin);
        if (cip) forwardUrl.searchParams.set('cip', cip);
        if (cc) forwardUrl.searchParams.set('cc', cc);
        return Response.redirect(forwardUrl.toString(), 302);
      }
    }

    // WebSocket upgrade for realtime (/v1/realtime or /ws/facilities/*)
    if (request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
      // Same rule as the Node hub: only a fresh, signed ticket from POST /v1/auth/realtime-ticket may open a socket.
      const ticket = url.searchParams.get('ticket') ?? '';
      if (!new RealtimeHub().verifyTicket(ticket)) {
        return new Response(JSON.stringify({ error: { code: 'UNAUTHENTICATED', message: 'Vé realtime không hợp lệ hoặc đã hết hạn', requestId } }), { status: 401, headers: { 'Content-Type': 'application/json', ...cors, 'X-Request-Id': requestId } });
      }
      const facilityId = url.pathname.split('/')[3] || 'global';
      const id = env.FACILITY_HUB.idFromName(facilityId);
      return env.FACILITY_HUB.get(id).fetch(request);
    }

    try {
      // Provide US-West (wnam) Durable Object proxy for Gemini API in case Worker edge PoP is HKG
      (globalThis as any).__GEMINI_PROXY_FETCH = async (targetUrl: string, payload: unknown) => {
        const doId = env.FACILITY_HUB.idFromName('gemini-wnam-proxy-v1');
        const stub = env.FACILITY_HUB.get(doId, { locationHint: 'wnam' });
        return stub.fetch(
          new Request('https://do.internal/__gemini_proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetUrl, payload }),
          }),
        );
      };
      const needFreshR2 =
        url.pathname.includes('/kb') ||
        url.pathname.includes('/assistant') ||
        url.pathname.includes('/chatbot') ||
        // GETs that still write (Google OAuth callback creates a session, PIN views are audited): treat like a write
        url.pathname.includes('/auth/') ||
        // the signed blob upload only writes the object to R2 (no database change); it just needs fresh data to find the media row
        (request.method !== 'GET' && !(request.method === 'PUT' && /\/media\/[^/]+\/blob$/.test(url.pathname)));
      if (needFreshR2) {
        return await withLock(async () => {
          pendingMutation = false;
          const app = await getEdgeApp(env, true, true);
          patchHub(app);
          const response = await app.handleRequest(request, cors, requestId);
          if (pendingMutation && env.VAULTRA_MEDIA) {
            // forward this request's domain events (notifications, status changes) before the snapshot is written
            await app.events.dispatch().catch(() => undefined);
            pendingMutation = false;
            lastEtag = ((await env.VAULTRA_MEDIA.put(R2_STATE_KEY, app.prisma.exportSnapshot())) as { etag?: string } | undefined)?.etag ?? null;
            lastR2LoadAt = Date.now();
            // send the emails this request queued, after the response is on its way
            ctx.waitUntil(flushEmailsLocked(env).catch((e) => console.error('[mail] flush failed:', e?.message)));
            const msgs = rtOut.splice(0);
            if (response.status < 400 && !QUIET_WRITES.some((r) => r.test(url.pathname))) msgs.push({ targets: ['all'], event: { type: 'data.changed', path: url.pathname.replace(/\/[0-9A-Z]{26}/g, '/:id') } });
            ctx.waitUntil(publishRealtime(env, msgs).catch((e) => console.error('[realtime] publish failed:', e?.message)));
          }
          return response;
        });
      }
      const app = await getEdgeApp(env, false, false);
      const response = await app.handleRequest(request, cors, requestId);
      // a read that wrote anyway (audit rows, notifications) must still reach R2 or the next reload drops it
      if (pendingMutation && env.VAULTRA_MEDIA) {
        await withLock(async () => {
          if (!pendingMutation) return;
          pendingMutation = false;
          lastEtag = ((await env.VAULTRA_MEDIA!.put(R2_STATE_KEY, app.prisma.exportSnapshot())) as { etag?: string } | undefined)?.etag ?? null;
          lastR2LoadAt = Date.now();
        });
      }
      return response;
    } catch (err: any) {
      return new Response(
        JSON.stringify({
          error: {
            code: 'EDGE_BOOT_ERROR',
            message: err?.message || String(err),
            requestId,
          },
        }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...cors, 'X-Request-Id': requestId } }
      );
    }
  },
};

export class FacilityHub {
  private holder: string | null = null;
  private holderTimer: number | null = null;
  private waiters: (() => void)[] = [];
  private pump() {
    if (this.holder === null && this.waiters.length) {
      this.holder = '__pending__';
      this.waiters.shift()!();
    }
  }
  private free(token: string) {
    if (this.holder !== token) return;
    if (this.holderTimer !== null) clearTimeout(this.holderTimer);
    this.holder = null;
    this.holderTimer = null;
    this.pump();
  }
  private sessions = new Map<WebSocket, { facilityId: string; userId?: string }>();

  constructor(private state: { acceptWebSocket?: (ws: WebSocket, tags?: string[]) => void; getWebSockets?: (tag?: string) => WebSocket[] }) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/__gemini_proxy' && request.method === 'POST') {
      const { targetUrl, payload } = (await request.json()) as { targetUrl: string; payload: unknown };
      const r = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return new Response(await r.text(), {
        status: r.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
      const pair = new (globalThis as unknown as { WebSocketPair: new () => { 0: WebSocket; 1: WebSocket } }).WebSocketPair();
      const [client, server] = [pair[0], pair[1]];
      // the Worker verified the ticket's signature before forwarding: read who this socket belongs to from it
      let who: { u?: string; f?: string[] } = {};
      try {
        const payload = (url.searchParams.get('ticket') ?? '').split('.')[0].replace(/-/g, '+').replace(/_/g, '/');
        who = JSON.parse(atob(payload));
      } catch { /* anonymous socket: only receives broadcasts */ }
      const tags = ['all', ...(who.u ? [`u:${who.u}`] : []), ...(who.f ?? []).map((f) => `f:${f}`)].slice(0, 10);
      if (this.state.acceptWebSocket) this.state.acceptWebSocket(server, tags);
      else (server as unknown as { accept(): void }).accept();
      this.sessions.set(server, { facilityId: tags.join(','), userId: who.u });
      server.send(JSON.stringify({ type: 'hello', at: new Date().toISOString() }));
      return new Response(null, { status: 101, webSocket: client } as ResponseInit & { webSocket: WebSocket });
    }

    if (request.method === 'POST' && url.pathname === '/__acquire') {
      // FIFO lease with a hard expiry; the caller waits here until it is its turn
      const token = crypto.randomUUID();
      await new Promise<void>((resolve) => { this.waiters.push(resolve); this.pump(); });
      this.holder = token;
      // short by default: a holder killed mid-request (CPU limit) never releases, and everyone else waits for this expiry
      const ttl = Math.min(30000, Math.max(1000, Number(url.searchParams.get('ttl')) || 6000));
      this.holderTimer = setTimeout(() => this.free(token), ttl) as unknown as number;
      return new Response(JSON.stringify({ token }), { headers: { 'Content-Type': 'application/json' } });
    }
    if (request.method === 'POST' && url.pathname === '/__release') {
      this.free(url.searchParams.get('token') ?? '');
      return new Response('{}', { headers: { 'Content-Type': 'application/json' } });
    }

    if (request.method === 'POST' && url.pathname === '/__publish') {
      const msgs = (await request.json()) as { targets: string[]; event: object }[];
      let sent = 0;
      for (const m of msgs) {
        const seen = new Set<WebSocket>();
        const text = JSON.stringify(m.event);
        for (const t of m.targets) {
          const sockets = this.state.getWebSockets ? this.state.getWebSockets(t) : [...this.sessions.keys()];
          for (const ws of sockets) {
            if (seen.has(ws)) continue;
            seen.add(ws);
            try { ws.send(text); sent++; } catch { this.sessions.delete(ws); }
          }
        }
      }
      return new Response(JSON.stringify({ sent }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    return new Response('Method Not Allowed', { status: 405 });
  }

  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (message === 'ping') {
      ws.send(JSON.stringify({ event: 'pong', ts: Date.now() }));
    }
  }

  webSocketClose(ws: WebSocket) {
    this.sessions.delete(ws);
  }
}
