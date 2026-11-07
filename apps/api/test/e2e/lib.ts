import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const CACHE = join(tmpdir(), 'vaultra-e2e-tokens.json');
const loadCache = (): Record<string, { t: string; at: number }> => { try { return existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {}; } catch { return {}; } };
export const BASE = process.env.API_URL ?? 'http://localhost:4000/v1';
export const PASSWORD = process.env.SEED_PASSWORD ?? '12345';
let passed = 0;
let failed = 0;
export const results: { name: string; ok: boolean; detail?: string }[] = [];

export class Client {
  token = '';
  constructor(public label: string) {}
  async req(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', ...(this.token ? { authorization: `Bearer ${this.token}` } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
    const text = await r.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* html/redirect */ }
    return { status: r.status, body: json, text, headers: r.headers };
  }
  get = (p: string) => this.req('GET', p);
  post = (p: string, b: unknown = {}, h: Record<string, string> = {}) => this.req('POST', p, b, h);
  patch = (p: string, b: unknown = {}) => this.req('PATCH', p, b);
  del = (p: string) => this.req('DELETE', p);
  async login(email: string, password = PASSWORD) {
    // tokens live ~15 min and /auth/login is rate limited: reuse a recent one when it still works
    const c = loadCache()[email];
    if (c && Date.now() - c.at < 8 * 60000) { this.token = c.t; if ((await this.get('/me/permissions')).status === 200) return { accessToken: c.t }; this.token = ''; }
    const r = await this.post('/auth/login', { email, password });
    if (r.status !== 200 || !r.body?.accessToken) throw new Error(`login ${email} failed: ${r.status} ${r.text.slice(0, 200)}`);
    this.token = r.body.accessToken;
    const all = loadCache(); all[email] = { t: this.token, at: Date.now() }; try { writeFileSync(CACHE, JSON.stringify(all)); } catch { /* ignore */ }
    return r.body;
  }
}

export function check(name: string, cond: unknown, detail?: unknown) {
  const ok = !!cond;
  if (ok) passed++; else failed++;
  results.push({ name, ok, detail: ok ? undefined : typeof detail === 'string' ? detail : JSON.stringify(detail)?.slice(0, 400) });
  console.log(`${ok ? '  ✔' : '  ✘'} ${name}${ok ? '' : `\n      ↳ ${typeof detail === 'string' ? detail : JSON.stringify(detail)?.slice(0, 400)}`}`);
}
export const section = (s: string) => console.log(`\n▶ ${s}`);
export const idem = () => `t-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
export function summary() {
  console.log(`\n${passed} passed, ${failed} failed`);
  return failed;
}
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Plays VNPay: signs the callback of a payment started through POST .../pay (`payBody` is that response) with the sandbox hash secret
 * (VNPAY_HASH_SECRET from the environment or apps/api/.env) and delivers it to the IPN endpoint. `paid: false` sends a user-cancel (24);
 * `amountVnd` overrides the amount to simulate a short payment. Returns the IPN reply.
 */
export async function payOnVnpay(payBody: any, opts: { paid?: boolean; amountVnd?: number; via?: 'ipn' | 'return' } = {}) {
  const { readFileSync, existsSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { createHmac } = await import('node:crypto');
  let key = process.env.VNPAY_HASH_SECRET ?? '';
  if (!key) {
    const f = join(__dirname, '..', '..', '.env');
    if (existsSync(f)) for (const l of readFileSync(f, 'utf8').split(/\r?\n/)) { const m = l.match(/^VNPAY_HASH_SECRET=(.*)$/); if (m) key = m[1].replace(/^"|"$/g, ''); }
  }
  const u = new URL(payBody.redirectUrl);
  const p: Record<string, string> = {
    vnp_Amount: opts.amountVnd !== undefined ? String(opts.amountVnd * 100) : u.searchParams.get('vnp_Amount')!, vnp_BankCode: 'NCB', vnp_CardType: 'ATM', vnp_OrderInfo: u.searchParams.get('vnp_OrderInfo')!,
    vnp_PayDate: '20261108000000', vnp_ResponseCode: opts.paid === false ? '24' : '00', vnp_TmnCode: u.searchParams.get('vnp_TmnCode')!, vnp_TransactionNo: '9' + String(Date.now()).slice(-9),
    vnp_TransactionStatus: opts.paid === false ? '02' : '00', vnp_TxnRef: u.searchParams.get('vnp_TxnRef')!,
  };
  const canon = Object.keys(p).sort().map((k) => `${k}=${encodeURIComponent(p[k]).replace(/%20/g, '+')}`).join('&');
  const hash = createHmac('sha512', key).update(Buffer.from(canon, 'utf-8')).digest('hex');
  const root = BASE.replace(/\/v1$/, '') + '/v1';
  const r = await fetch(`${root}/payments/vnpay/${opts.via ?? 'ipn'}?${canon}&vnp_SecureHashType=SHA512&vnp_SecureHash=${hash}`, { redirect: 'manual' });
  return { status: r.status, location: r.headers.get('location') ?? '', body: (await r.json().catch(() => null)) as any };
}
export const ymd = (d: Date) => d.toISOString().slice(0, 10);
export const inDays = (n: number) => ymd(new Date(Date.now() + n * 86400000));
