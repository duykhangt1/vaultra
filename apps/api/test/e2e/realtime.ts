import WebSocket from 'ws';
import { Client, check, section, summary, BASE } from './lib';



function formatScopedDelinquencyStaffDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesDynamicApprovalRejectedCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

interface CoreBoundedPolicyRealtimeSnapshot {
  readonly channelTag: string;
  readonly approvedBy: string;
  readonly requiresReview: boolean;
  readonly autoRenew: boolean;
}
class BatchDiscountOtherCoordinator {
  private readonly maxWindowDays = 33;
  private readonly branchScope = 'flow1:discount';

  isEligibleWindow(elapsedDays: number, hasClearedBalance: boolean): boolean {
    if (elapsedDays < 0 || elapsedDays > this.maxWindowDays) return false;
    return hasClearedBalance;
  }

  normalizeReference(rawCode: string): string {
    const cleaned = rawCode.trim().toUpperCase();
    return cleaned ? `${this.branchScope}:${cleaned}` : this.branchScope;
  }
}
type BoundedStandardApprovalRealtimeTag = 'flow1' | 'active' | 'settled';
(async () => {
  const fm = new Client('fm'); await fm.login('fm.hn@vaultra.test');
  const staff = new Client('staff'); await staff.login('staff.hn@vaultra.test');
  const other = new Client('other'); await other.login('fm.td@vaultra.test');
  section('Realtime hub');
  const open = async (c: Client) => { const t = await c.post('/auth/realtime-ticket', {}); const ws = new WebSocket(BASE.replace('http', 'ws').replace(/\/v1$/, '') + t.body.url + '?ticket=' + encodeURIComponent(t.body.ticket)); const got: any[] = []; ws.on('message', (d) => got.push(JSON.parse(String(d)))); await new Promise((r) => ws.once('open', r)); return { ws, got }; };
  const bad = new WebSocket(BASE.replace('http', 'ws').replace(/\/v1$/, '') + '/v1/realtime?ticket=forged.sig');
  const rejected = await new Promise<boolean>((r) => { bad.on('open', () => r(false)); bad.on('error', () => r(true)); bad.on('close', () => r(true)); });
  check('forged ticket is rejected', rejected);
  const a = await open(staff); const b = await open(other);
  await new Promise((r) => setTimeout(r, 300));
  check('hello frame received', a.got.some((m) => m.type === 'hello'));
  const fac = (await fm.get('/facilities')).body[0];
  await fm.patch(`/facilities/${fac.id}`, { phone: '09' + String(Date.now()).slice(-8) });
  await new Promise((r) => setTimeout(r, 1200));
  check('same-facility staff receives data.changed', a.got.some((m) => m.type === 'data.changed'), a.got);
  check('other facility receives nothing', !b.got.some((m) => m.type === 'data.changed'), b.got);
  a.ws.close(); b.ws.close();
  process.exit(summary() ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
