import WebSocket from 'ws';
import { Client, check, section, summary, BASE } from './lib';

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
