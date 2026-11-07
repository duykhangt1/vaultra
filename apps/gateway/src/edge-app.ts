import './shims/nestjs';
import { PrismaService } from './shims/prisma-service';
import { StorageService } from './shims/storage-service';
import { ClockService } from '../../api/src/common/clock.service';
import { EventsService } from '../../api/src/common/events.service';
import { AppError } from '../../api/src/common/errors';
import { IdempotencyInterceptor } from '../../api/src/common/idempotency.interceptor';
import { from, lastValueFrom } from 'rxjs';
import { ZodError } from 'zod';
import { serialize } from '../../api/src/common/serialize.interceptor';
import { SettingsService } from '../../api/src/config/settings.service';
import { AuditService } from '../../api/src/audit/audit.service';
import { JwtService } from '../../api/src/auth/jwt.service';
import { ContextService } from '../../api/src/auth/context.service';
import { RateLimiter } from '../../api/src/auth/rate-limiter';
import { AuthGuard } from '../../api/src/auth/auth.guard';
import { AuthService } from '../../api/src/auth/auth.service';
import { AuthController, MeController } from '../../api/src/auth/auth.controller';
import { CoreService } from '../../api/src/domain/core.service';
import { PricingService } from '../../api/src/domain/pricing.service';
import { AccessService } from '../../api/src/access/access.service';
import { MediaService } from '../../api/src/media/media.service';
import { PdfService } from '../../api/src/media/pdf.service';
import { EmailProvider } from '../../api/src/notifications/email.provider';
import { EmailComposerService } from '../../api/src/notifications/email-composer.service';
import { NotificationService } from '../../api/src/notifications/notification.service';
import { RealtimeHub } from '../../api/src/realtime/realtime.hub';
import { BillingService } from '../../api/src/billing/billing.service';
import { PaymentService } from '../../api/src/billing/payment.service';
import { ReservationService } from '../../api/src/reservation/reservation.service';
import { CheckinService } from '../../api/src/checkin/checkin.service';
import { ContractService } from '../../api/src/contract/contract.service';
import { MoveOutService } from '../../api/src/moveout/moveout.service';
import { RenewalService } from '../../api/src/lifecycle/renewal.service';
import { DelinquencyService } from '../../api/src/lifecycle/delinquency.service';
import { SupportService } from '../../api/src/support/support.service';
import { ReportService } from '../../api/src/report/report.service';
import { KbService } from '../../api/src/assistant/kb.service';
import { AssistantService } from '../../api/src/assistant/assistant.service';
import { JobsService } from '../../api/src/jobs/jobs.service';
import { CatalogController } from '../../api/src/catalog/catalog.controller';
import { FacilityController } from '../../api/src/facility/facility.controller';
import { PolicyController } from '../../api/src/policy/policy.controller';
import { WorkforceController } from '../../api/src/workforce/workforce.controller';
import { ReservationController } from '../../api/src/reservation/reservation.controller';
import { BillingController } from '../../api/src/billing/billing.controller';
import { VnpayController } from '../../api/src/billing/vnpay.controller';
import { ContractController } from '../../api/src/contract/contract.controller';
import { SupportController } from '../../api/src/support/support.controller';
import { ReportController } from '../../api/src/report/report.controller';
import { AdminController } from '../../api/src/admin/admin.controller';
import { PlatformController } from '../../api/src/platform/platform.controller';
import { AssistantController } from '../../api/src/assistant/assistant.controller';

const METHOD_MAP: Record<number, string> = {
  0: 'GET',
  1: 'POST',
  2: 'PUT',
  3: 'DELETE',
  4: 'PATCH',
  5: 'ALL',
  6: 'OPTIONS',
  7: 'HEAD',
};

interface RouteDef {
  method: string;
  fullPath: string;
  regex: RegExp;
  paramNames: string[];
  controller: any;
  controllerClass: any;
  handler: (...args: any[]) => any;
  handlerName: string;
  httpCode?: number;
  passthrough: boolean;
  routeArgs: Record<string, { index: number; data?: any; factory?: (...a: any[]) => any }>;
}

export class EdgeApp {
  public prisma: PrismaService;
  public jobs: JobsService;
  public notifications!: NotificationService;
  public hub!: RealtimeHub;
  public events!: EventsService;
  private jwt: JwtService;
  private guard: AuthGuard;
  private idem!: IdempotencyInterceptor;
  private routes: RouteDef[] = [];
  private initialized = false;

  constructor() {
    this.prisma = new PrismaService();
    const clock = new ClockService();
    const hub = new RealtimeHub();
    this.hub = hub;
    const email = new EmailProvider();
    const storage = new StorageService();
    const pdf = new PdfService();
    const composer = new EmailComposerService(this.prisma as any, pdf, storage as any);
    const notify = new NotificationService(this.prisma as any, email, hub, clock, composer);
    this.notifications = notify;
    const events = new EventsService(this.prisma as any, hub, notify);
    this.events = events;
    const audit = new AuditService(this.prisma as any, hub);
    const settings = new SettingsService(this.prisma as any);
    const jwt = new JwtService();
    this.jwt = jwt;
    const contexts = new ContextService(this.prisma as any);
    const limiter = new RateLimiter();
    const auth = new AuthService(this.prisma as any, jwt, audit, notify, settings, contexts, limiter, clock, events);
    const core = new CoreService(this.prisma as any, clock, events, notify);
    const pricing = new PricingService(this.prisma as any, core);
    const access = new AccessService(this.prisma as any, core, notify, audit);
    const media = new MediaService(this.prisma as any, storage as any);
    const billing = new BillingService(this.prisma as any, core, pricing, notify, audit, pdf, media);
    const payments = new PaymentService(this.prisma as any, core, notify, audit);
    const contracts = new ContractService(this.prisma as any, core, pdf, media, notify, audit);
    const reservations = new ReservationService(this.prisma as any, core, pricing, payments, contracts, notify, audit, events, contexts);
    const checkin = new CheckinService(this.prisma as any, core, reservations, contracts, access, media, payments, notify, audit, events);
    const moveout = new MoveOutService(this.prisma as any, core, contracts, access, media, payments, checkin, reservations, notify, audit);
    const renewal = new RenewalService(this.prisma as any, core, pricing, contracts, access, payments, notify, audit);
    const delinq = new DelinquencyService(this.prisma as any, core, access, payments, contracts, media, notify, audit);
    const support = new SupportService(this.prisma as any, core, media, notify, audit, events);
    const reports = new ReportService(this.prisma as any, core, pdf, media, notify, audit);
    const kb = new KbService(this.prisma as any, core);
    const assistant = new AssistantService(this.prisma as any, core, pricing, kb, settings, support, reports, notify);
    this.jobs = new JobsService(this.prisma as any, core, notify, kb, reservations, billing, delinq, renewal, moveout, support, reports, payments);

    reservations.onModuleInit();
    renewal.onModuleInit();
    delinq.onModuleInit();

    const reflector = {
      getAllAndOverride: <T>(key: string, targets: any[]): T | undefined => {
        for (const t of targets) {
          if (!t) continue;
          const v = Reflect.getMetadata(key, t);
          if (v !== undefined) return v;
        }
        return undefined;
      },
    };
    this.guard = new AuthGuard(reflector as any, jwt, this.prisma as any, contexts, limiter);
    this.idem = new IdempotencyInterceptor({ get: (key: string, target: any) => Reflect.getMetadata(key, target) } as any, this.prisma as any);

    const workforceCtrl = new WorkforceController(this.prisma as any, core, audit, notify, events, media);
    const controllers = [
      { inst: new AuthController(auth), cls: AuthController },
      { inst: new MeController(auth, this.prisma as any, hub, audit), cls: MeController },
      { inst: new CatalogController(this.prisma as any, core, pricing, media), cls: CatalogController },
      { inst: new FacilityController(this.prisma as any, core, audit, notify, media), cls: FacilityController },
      { inst: new PolicyController(this.prisma as any, core, audit, notify, kb), cls: PolicyController },
      { inst: workforceCtrl, cls: WorkforceController },
      { inst: new ReservationController(this.prisma as any, reservations, checkin, core, audit, payments), cls: ReservationController },
      { inst: new BillingController(this.prisma as any, billing, payments, core, audit, pdf, auth), cls: BillingController },
      { inst: new VnpayController(payments, this.prisma as any), cls: VnpayController },
      { inst: new ContractController(this.prisma as any, contracts, access, moveout, renewal, delinq, core, audit, settings, notify, support, billing), cls: ContractController },
      { inst: new SupportController(this.prisma as any, support, access, billing, payments, workforceCtrl), cls: SupportController },
      { inst: new ReportController(this.prisma as any, reports, media), cls: ReportController },
      { inst: new AdminController(this.prisma as any, audit, auth, contexts, notify, settings, reports, hub), cls: AdminController },
      { inst: new PlatformController(this.prisma as any, media, this.jobs, clock, storage as any, new Map() as any), cls: PlatformController },
      { inst: new AssistantController(assistant, kb, this.prisma as any, audit), cls: AssistantController },
    ];

    for (const { inst, cls } of controllers) {
      this.registerController(inst, cls);
    }
  }

  async init() {
    if (this.initialized) return;
    this.initialized = true;
    await this.jwt.onModuleInit();
  }

  private registerController(inst: any, cls: any) {
    const prefix = String(Reflect.getMetadata('path', cls) ?? '').replace(/^\/+|\/+$/g, '');
    const proto = cls.prototype;
    for (const prop of Object.getOwnPropertyNames(proto)) {
      if (prop === 'constructor') continue;
      const fn = proto[prop];
      if (typeof fn !== 'function') continue;
      const methodNum = Reflect.getMetadata('method', fn);
      const subPathRaw = Reflect.getMetadata('path', fn);
      if (methodNum === undefined || subPathRaw === undefined) continue;

      const method = METHOD_MAP[methodNum] ?? 'GET';
      const subPaths = Array.isArray(subPathRaw) ? subPathRaw : [subPathRaw];
      for (const sp of subPaths) {
        const sub = String(sp).replace(/^\/+|\/+$/g, '');
        const parts = ['v1', prefix, sub].filter(Boolean);
        const fullPath = '/' + parts.join('/');
        const paramNames: string[] = [];
        const regexStr =
          '^' +
          fullPath
            .split('/')
            .map((seg) => {
              if (seg.startsWith(':')) {
                paramNames.push(seg.slice(1));
                return '([^/]+)';
              }
              return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            })
            .join('/') +
          '/?$';

        const httpCode = Reflect.getMetadata('__httpCode__', fn);
        const passthrough = !!Reflect.getMetadata('__responsePassthrough__', cls, prop);
        const routeArgs = Reflect.getMetadata('__routeArguments__', cls, prop) ?? {};

        this.routes.push({
          method,
          fullPath,
          regex: new RegExp(regexStr),
          paramNames,
          controller: inst,
          controllerClass: cls,
          handler: fn,
          handlerName: prop,
          httpCode,
          passthrough,
          routeArgs,
        });
      }
    }

    // Sort static segments before parameterized segments
    this.routes.sort((a, b) => {
      const aParams = a.paramNames.length;
      const bParams = b.paramNames.length;
      if (aParams !== bParams) return aParams - bParams;
      return b.fullPath.length - a.fullPath.length;
    });
  }

  /**
   * The Node API runs JobsService on timers; a Worker only gets a cron tick (every 5 minutes, wrangler.toml). Each tick runs the
   * jobs whose interval has elapsed since their last recorded run (job_runs), so hourly jobs stay hourly. Jobs are idempotent.
   * Old job_runs rows are pruned so the snapshot does not grow forever.
   */
  async runDueJobs(): Promise<{ name: string; status: string; processed: number }[]> {
    const db = this.prisma as any;
    const now = Date.now();
    const out: { name: string; status: string; processed: number }[] = [];
    for (const d of this.jobs.defs) {
      const last = await db.jobRun.findFirst({ where: { job_name: d.name }, orderBy: { id: 'desc' } });
      // a failed run is retried on the next tick instead of waiting a full interval
      if (last && last.status !== 'FAILED' && now - new Date(last.started_at).getTime() < (d.everySec - 30) * 1000) continue;
      const r = await this.jobs.run(d.name);
      out.push({ name: r.name, status: r.status, processed: r.processed });
      if (r.status === 'FAILED') console.error('[jobs]', d.name, (r.error ?? '').split('\n')[0]);
    }
    await db.jobRun.deleteMany({ where: { started_at: { lt: new Date(now - 2 * 86400000) } } });
    // Every write saves the whole data snapshot, so dead rows make every request slower: drop what nothing reads any more.
    const old2 = new Date(now - 2 * 86400000);
    try {
      await db.outboxEvent.deleteMany({ where: { status: 'DISPATCHED', dispatched_at: { lt: old2 } } });
      await db.refreshToken.deleteMany({ where: { OR: [{ used_at: { lt: old2 } }, { revoked_at: { lt: old2 } }, { expires_at: { lt: old2 } }] } });
      await db.userSession.deleteMany({ where: { OR: [{ revoked_at: { lt: old2 } }, { expires_at: { lt: old2 } }] } });
      await db.idempotencyKey.deleteMany({ where: { expires_at: { lt: new Date(now) } } });
    } catch (e) {
      console.error('[jobs] prune failed', (e as Error).message);
    }
    return out;
  }

  /**
   * The Node API runs the email dispatcher on a timer; a Worker has none, so index.ts calls this after writes and from a cron.
   * Demo/test addresses (*.test) and mail older than a day are suppressed instead of sent, so a backlog never spams anyone.
   */
  async flushEmails(limit = 20, guard: <T>(fn: () => Promise<T>) => Promise<T> = (fn) => fn()): Promise<boolean> {
    const db = this.prisma as any;
    const stale = new Date(Date.now() - 24 * 3600 * 1000);
    // nothing queued -> no lock, no snapshot write (every write section costs a whole-snapshot save)
    const queued = await db.notificationDelivery.findMany({ where: { status: 'QUEUED', channel: 'EMAIL' }, select: { id: true, recipient: true, created_at: true }, take: 200 });
    if (!queued.length) return false;
    if (queued.some((q: any) => String(q.recipient).toLowerCase().endsWith('.test') || new Date(q.created_at) < stale)) {
      await guard(async () => {
        await db.notificationDelivery.updateMany({ where: { status: 'QUEUED', channel: 'EMAIL', recipient: { endsWith: '.test' } }, data: { status: 'SUPPRESSED', last_error: 'Địa chỉ demo, không gửi' } });
        await db.notificationDelivery.updateMany({ where: { status: 'QUEUED', channel: 'EMAIL', created_at: { lt: stale } }, data: { status: 'SUPPRESSED', last_error: 'Quá 24 giờ, bỏ qua' } });
      });
    }
    const pending = queued.filter((q: any) => !String(q.recipient).toLowerCase().endsWith('.test') && new Date(q.created_at) >= stale).length;
    if (!pending) return true;
    await this.notifications.dispatchEmails(limit, guard);
    return true;
  }

  async handleRequest(request: Request, cors: Record<string, string>, requestId: string): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    // Find matching route
    let matched: RouteDef | null = null;
    let params: Record<string, string> = {};
    for (const r of this.routes) {
      if (r.method !== method && r.method !== 'ALL') continue;
      const m = url.pathname.match(r.regex);
      if (m) {
        matched = r;
        r.paramNames.forEach((name, idx) => {
          params[name] = decodeURIComponent(m[idx + 1]);
        });
        break;
      }
    }

    if (!matched) {
      return new Response(
        JSON.stringify({ error: { code: 'NOT_FOUND', message: `Cannot ${method} ${url.pathname}`, requestId } }),
        { status: 404, headers: { 'Content-Type': 'application/json', ...cors, 'X-Request-Id': requestId } }
      );
    }

    // Build Express-like req & res objects
    const headersObj: Record<string, string> = {};
    request.headers.forEach((v, k) => {
      headersObj[k.toLowerCase()] = v;
    });

    const cookies: Record<string, string> = {};
    const cookieHeader = headersObj['cookie'] || '';
    for (const pair of cookieHeader.split(';')) {
      const eq = pair.indexOf('=');
      if (eq > 0) {
        const ck = pair.slice(0, eq).trim();
        const cv = pair.slice(eq + 1).trim();
        cookies[ck] = decodeURIComponent(cv);
      }
    }
    if (!cookies['rt'] && headersObj['x-refresh-token']) {
      cookies['rt'] = headersObj['x-refresh-token'];
    }

    const query: Record<string, string> = {};
    url.searchParams.forEach((v, k) => {
      query[k] = v;
    });

    let body: any = undefined;
    let rawBody: Buffer | undefined = undefined;
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      const ab = await request.arrayBuffer();
      rawBody = Buffer.from(ab);
      const ct = headersObj['content-type'] || '';
      if (ct.includes('application/json')) {
        const text = rawBody.toString('utf8');
        try {
          body = text ? JSON.parse(text) : {};
        } catch {
          body = {};
        }
      } else if (ct.includes('application/x-www-form-urlencoded')) {
        const sp = new URLSearchParams(rawBody.toString('utf8'));
        body = Object.fromEntries(sp.entries());
      } else {
        body = rawBody;
      }
    }

    const reqObj: any = {
      method,
      path: url.pathname,
      url: url.pathname + url.search,
      headers: headersObj,
      cookies,
      query,
      params,
      body,
      rawBody,
      // cf-connecting-ip is set by Cloudflare itself; X-Forwarded-For is client-controlled and must never be trusted
      ip: headersObj['cf-connecting-ip'] || '127.0.0.1',
      secure: true,
      requestId,
      get(h: string) {
        return headersObj[h.toLowerCase()];
      },
    };

    const resHeaders = new Headers();
    for (const [k, v] of Object.entries(cors)) resHeaders.set(k, v);
    resHeaders.set('X-Request-Id', requestId);
    const setCookies: string[] = [];
    let statusCode = matched.httpCode ?? (method === 'POST' ? 201 : 200);
    const chunks: Buffer[] = [];
    let ended = false;

    const resObj: any = {
      statusCode,
      setHeader(k: string, v: string) {
        resHeaders.set(k, String(v));
        return resObj;
      },
      header(k: string, v: string) {
        resHeaders.set(k, String(v));
        return resObj;
      },
      status(code: number) {
        statusCode = code;
        resObj.statusCode = code;
        return resObj;
      },
      cookie(name: string, val: string, opts: any = {}) {
        const parts = [`${name}=${encodeURIComponent(val)}`];
        if (opts.path) parts.push(`Path=${opts.path}`);
        if (opts.maxAge != null) parts.push(`Max-Age=${Math.floor(opts.maxAge / 1000)}`);
        if (opts.httpOnly) parts.push('HttpOnly');
        parts.push('Secure');
        parts.push('SameSite=None');
        setCookies.push(parts.join('; '));
        if (name === 'rt') resHeaders.set('X-Refresh-Token', val);
        return resObj;
      },
      clearCookie(name: string, opts: any = {}) {
        const parts = [`${name}=`, `Path=${opts.path || '/'}`, 'Max-Age=0', 'HttpOnly', 'Secure', 'SameSite=None'];
        setCookies.push(parts.join('; '));
        if (name === 'rt') resHeaders.set('X-Refresh-Token', '');
        return resObj;
      },
      flushHeaders() {},
      write(chunk: string | Buffer) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), 'utf8'));
      },
      send(data?: any) {
        if (data !== undefined) {
          if (Buffer.isBuffer(data)) chunks.push(data);
          else if (typeof data === 'string') chunks.push(Buffer.from(data, 'utf8'));
          else {
            resHeaders.set('Content-Type', 'application/json; charset=utf-8');
            chunks.push(Buffer.from(JSON.stringify(serialize(data)), 'utf8'));
          }
        }
        ended = true;
        return resObj;
      },
      end(data?: any) {
        if (data !== undefined) resObj.send(data);
        ended = true;
        return resObj;
      },
      redirect(targetUrl: string) {
        statusCode = 302;
        resHeaders.set('Location', targetUrl);
        ended = true;
        return resObj;
      },
    };

    const ec: any = {
      switchToHttp: () => ({
        getRequest: () => reqObj,
        getResponse: () => resObj,
      }),
      getHandler: () => matched!.handler,
      getClass: () => matched!.controllerClass,
    };

    try {
      await this.guard.canActivate(ec);

      // Build handler arguments
      const args: any[] = [];
      for (const [key, meta] of Object.entries(matched.routeArgs)) {
        const idx = meta.index;
        if (key.includes('__customRouteArgs__') && typeof meta.factory === 'function') {
          args[idx] = meta.factory(meta.data, ec);
          continue;
        }
        const paramType = Number(key.split(':')[0]);
        switch (paramType) {
          case 0: // @Req()
            args[idx] = reqObj;
            break;
          case 1: // @Res()
            args[idx] = resObj;
            break;
          case 3: // @Body()
            args[idx] = meta.data ? reqObj.body?.[meta.data] : reqObj.body;
            break;
          case 4: // @Query()
            args[idx] = meta.data ? reqObj.query?.[meta.data] : reqObj.query;
            break;
          case 5: // @Param()
            args[idx] = meta.data ? reqObj.params?.[meta.data] : reqObj.params;
            break;
          case 6: // @Headers()
            args[idx] = meta.data ? reqObj.headers?.[String(meta.data).toLowerCase()] : reqObj.headers;
            break;
          case 7: // @Ip()
            args[idx] = reqObj.ip;
            break;
          default:
            args[idx] = undefined;
        }
      }

      const invoke = () => matched!.handler.apply(matched!.controller, args);
      // Same Idempotency-Key semantics as the Node API: replay, conflict on different body, reject concurrent duplicates.
      const result = Reflect.getMetadata('idempotent', matched.handler)
        ? await lastValueFrom(this.idem.intercept(ec, { handle: () => from(invoke()) } as any), { defaultValue: undefined })
        : await invoke();

      for (const sc of setCookies) {
        resHeaders.append('Set-Cookie', sc);
      }

      if (ended || chunks.length > 0) {
        const bodyBuf = Buffer.concat(chunks);
        return new Response(bodyBuf, { status: statusCode, headers: resHeaders });
      }

      if (result === undefined && !matched.passthrough) {
        return new Response(null, { status: statusCode, headers: resHeaders });
      }

      resHeaders.set('Content-Type', 'application/json; charset=utf-8');
      const serialized = serialize(result);
      return new Response(JSON.stringify(serialized), { status: statusCode, headers: resHeaders });
    } catch (err: any) {
      let status = 500;
      let code = 'INTERNAL_ERROR';
      let message = 'Lỗi hệ thống';
      let details: unknown = undefined;

      if (err instanceof AppError || (typeof err?.code === 'string' && typeof err?.status === 'number' && err?.message)) {
        status = err.status;
        code = err.code;
        message = err.message;
        details = err.details;
      } else if (err instanceof ZodError || err?.name === 'ZodError') {
        status = 400;
        code = 'VALIDATION_FAILED';
        const issues = (err.issues ?? []) as { path?: PropertyKey[]; message: string }[];
        const firstMsg = issues[0]?.message ?? '';
        const firstField = (issues[0]?.path ?? []).map(String).join('.');
        const minMatch = firstMsg.match(/(?:>=|at least )(\d+) character/i);
        message = minMatch
          ? firstField === 'reason'
            ? `Vui lòng nhập lý do (tối thiểu ${minMatch[1]} ký tự)`
            : `Trường ${firstField || 'dữ liệu'} cần tối thiểu ${minMatch[1]} ký tự`
          : firstMsg || 'Dữ liệu không hợp lệ';
        details = issues.map((i: any) => ({ field: (i.path ?? []).join('.'), message: i.message }));
      } else if (err?.code === 'P2002') {
        status = 409;
        code = 'CONFLICT';
        const target = Array.isArray(err?.meta?.target) ? err.meta.target.join(', ') : String(err?.meta?.target ?? '');
        message = target ? `Dữ liệu bị trùng trên trường (${target}), vui lòng kiểm tra lại` : 'Dữ liệu bị trùng (vi phạm ràng buộc duy nhất)';
      } else if (err?.code === 'P2025') {
        status = 404;
        code = 'NOT_FOUND';
        message = 'Không tìm thấy dữ liệu yêu cầu hoặc dữ liệu đã thay đổi';
      } else if (err?.code === 'P2003') {
        status = 409;
        code = 'CONFLICT';
        message = 'Dữ liệu đang được tham chiếu, không thể xóa hoặc thay đổi';
      } else if (typeof err?.status === 'number' && err?.message) {
        status = err.status;
        message = err.message;
      } else {
        console.error(JSON.stringify({ requestId, path: url.pathname, error: String(err?.message ?? err), stack: err?.stack }));
        message = err?.message ? `Không thể hoàn tất thao tác: ${err.message}` : 'Lỗi hệ thống, vui lòng thử lại';
      }
      if (status === 429) {
        const det = (details ?? {}) as { retryAfter?: number; limit?: number; reset?: number };
        resHeaders.set('Retry-After', String(det.retryAfter ?? 60));
      }

      for (const sc of setCookies) {
        resHeaders.append('Set-Cookie', sc);
      }
      resHeaders.set('Content-Type', 'application/json; charset=utf-8');
      return new Response(
        JSON.stringify({ error: { code, message, details, requestId } }),
        { status, headers: resHeaders }
      );
    }
  }
}
