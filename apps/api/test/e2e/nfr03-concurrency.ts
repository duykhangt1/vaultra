/**
 * NFR-03: 100 concurrent bookings for the LAST available unit of a type → exactly 1 succeeds, 99 get UNIT_TYPE_SOLD_OUT.
 * Runs in-process against the real MySQL (SELECT … FOR UPDATE on unit_types + unique open_unit_key).
 */
process.env.JOBS_ENABLED = 'false';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ulid } from 'ulid';
import { AppModule } from '../../dist/app.module';
import { PrismaService } from '../../dist/common/prisma.service';
import { ContextService } from '../../dist/auth/context.service';
import { PricingService } from '../../dist/domain/pricing.service';
import { ReservationService } from '../../dist/reservation/reservation.service';
import { CoreService } from '../../dist/domain/core.service';
import { check, section, summary, inDays } from './lib';

(async () => {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const prisma = app.get(PrismaService);
  const ctxs = app.get(ContextService);
  const pricing = app.get(PricingService);
  const reservations = app.get(ReservationService);
  const core = app.get(CoreService);

  section('NFR-03 — 100 concurrent bookings for the last unit');
  const f = await prisma.facility.findFirstOrThrow({ where: { code: 'HN-CG' } });
  const ut = await prisma.unitType.create({
    data: { public_id: ulid(), facility_id: f.id, code: `CONC${Date.now() % 100000}`, name: 'Kho thử tải đồng thời', size_category: 'S', width_m: 1, depth_m: 1, height_m: 2, list_price: 700000, online_price: 650000, status: 'ACTIVE' },
  });
  const zone = await prisma.zone.findFirstOrThrow({ where: { facility_id: f.id } });
  await prisma.unit.create({ data: { public_id: ulid(), facility_id: f.id, unit_type_id: ut.id, zone_id: zone.id, code: `T-${Date.now() % 100000}` } });
  const start = new Date(inDays(10) + 'T00:00:00.000Z');
  check('exactly 1 unit available before the race', (await core.available(prisma, ut.id, start, new Date(start.getTime() + 86400000))) === 1);

  const N = 100;
  const stamp = Date.now();
  const pwdHash = (await prisma.user.findFirstOrThrow({ where: { email: 'customer@vaultra.test' } })).password_hash;
  const role = await prisma.role.findUniqueOrThrow({ where: { code: 'CUSTOMER' } });
  const actors: { ctx: Awaited<ReturnType<ContextService['build']>>; quoteId: string }[] = [];
  for (let i = 0; i < N; i++) {
    const u = await prisma.user.create({ data: { public_id: ulid(), email: `race${stamp}_${i}@vaultra.test`, full_name: `Race ${i}`, password_hash: pwdHash, status: 'ACTIVE', email_verified_at: new Date() } });
    await prisma.userRole.create({ data: { user_id: u.id, role_id: role.id } });
    await prisma.customer.create({ data: { public_id: ulid(), code: `RC-${stamp}-${i}`, user_id: u.id, full_name: `Race ${i}`, email: u.email } });
    const cached = await ctxs.load(u.id, 0);
    const ctx = ctxs.build(cached!, null, { ip: '127.0.0.1', ua: 'test' }, null);
    const q = await pricing.createQuote({ unitTypeId: ut.id, startDate: inDays(10), termMonths: 3, billingMode: 'MONTHLY', customerId: ctx.customerId });
    actors.push({ ctx, quoteId: q.quote.public_id });
  }
  const t0 = Date.now();
  const out = await Promise.allSettled(actors.map((a) => reservations.create(a.ctx, { quoteId: a.quoteId })));
  const ok = out.filter((o) => o.status === 'fulfilled').length;
  const soldOut = out.filter((o) => o.status === 'rejected' && (o.reason as { code?: string }).code === 'UNIT_TYPE_SOLD_OUT').length;
  const other = out.filter((o) => o.status === 'rejected' && (o.reason as { code?: string }).code !== 'UNIT_TYPE_SOLD_OUT').map((o) => (o as PromiseRejectedResult).reason?.code ?? String((o as PromiseRejectedResult).reason));
  const firstErr = out.find((o) => o.status === 'rejected' && (o.reason as {code?: string}).code === 'P2039') as PromiseRejectedResult | undefined; if (firstErr) console.log('   P2039 detail:', JSON.stringify(firstErr.reason?.meta ?? firstErr.reason?.message).slice(0, 600));
  console.log(`   ${N} requests in ${Date.now() - t0} ms → ok=${ok}, sold-out=${soldOut}, other=${JSON.stringify(other.slice(0, 3))}`);
  check('exactly 1 reservation succeeded', ok === 1, { ok, soldOut, other: other.slice(0, 3) });
  check('99 rejected with UNIT_TYPE_SOLD_OUT', soldOut === N - 1, { soldOut, other: other.slice(0, 3) });
  const held = await prisma.reservation.count({ where: { unit_type_id: ut.id, status: 'PENDING_PAYMENT' } });
  check('database holds exactly 1 pending reservation', held === 1, held);
  const end = new Date(start.getTime() + 86400000);
  check('availability is now 0', (await core.available(prisma, ut.id, start, end)) === 0, await core.available(prisma, ut.id, start, end));
  await app.close();
  process.exit(summary() ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
