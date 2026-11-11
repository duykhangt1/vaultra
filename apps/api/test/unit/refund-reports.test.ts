import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import '../../src/common/prisma.service';
import { EdgePrismaService } from '../../src/common/r2-prisma';
import { ReportService, groupTotals } from '../../src/report/report.service';
import { config } from '../../src/common/config';

const file = path.resolve(config.storage.localDir, 'r2-db-backup.json');
const have = fs.existsSync(file);
const day = (offset: number) => new Date(Date.now() + offset * 86400000);

test('groupTotals counts and adds money per label, biggest first', () => {
  const g = groupTotals([{ k: 'a', v: 10 }, { k: 'b', v: 50 }, { k: 'a', v: 5 }], (r) => r.k, (r) => r.v);
  assert.deepEqual(g, [{ label: 'b', count: 1, amount: 50 }, { label: 'a', count: 2, amount: 15 }]);
});

test('refund and abandoned-goods reports list every record with its detail', { skip: !have }, async () => {
  const edge: any = new EdgePrismaService();
  edge.loadSnapshot(JSON.parse(fs.readFileSync(file, 'utf8')));
  const svc: any = Object.create(ReportService.prototype);
  svc.prisma = edge;
  svc.core = { today: () => new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z') };

  const contract = (await edge.contract.findMany({ take: 1 }))[0];
  assert.ok(contract, 'snapshot has a contract');
  const otherFacility = (await edge.facility.findMany({})).find((f: any) => f.id !== contract.facility_id);
  const names = new Map<string, string>((await edge.facility.findMany({})).map((f: any) => [f.id.toString(), f.name]));
  const base = { customer_id: contract.customer_id, facility_id: contract.facility_id, contract_id: contract.id, created_at: day(-1) };
  const mk = (extra: Record<string, unknown>) => edge.refund.create({ data: { public_id: `T${Math.random().toString(36).slice(2, 12).toUpperCase().padEnd(25, '0')}`, deposit_portion: 0, attempts: 0, ...base, ...extra } });
  const a = await mk({ reason: 'DEPOSIT_RETURN', amount: 1000000, deposit_portion: 1000000, status: 'SUCCEEDED', method: 'CASH', processed_at: day(0), manual_reference: 'Đã chi tiền mặt tại quầy' });
  const b = await mk({ reason: 'CANCELLATION', amount: 250000, status: 'PENDING_APPROVAL', method: 'ORIGINAL_METHOD' });
  const c = await mk({ reason: 'GOODWILL', amount: 90000, status: 'REJECTED', method: 'CASH' });
  await edge.depositSettlement.create({ data: { public_id: `S${'0'.repeat(24)}1`, contract_id: BigInt(9_000_000), deposit_amount: 1000000, outstanding_applied: 100000, damage_total: 50000, cleaning_total: 0, prepaid_refund: 150000, net_amount: 1000000, status: 'FINALIZED', dispute_deadline: day(1), refund_id: a.id } }).catch(() => undefined);

  const p = { from: day(-30), to: day(1), facilityIds: null, groupBy: 'month' as const };
  const t = await svc.refundsReport(p, names);
  const mine = t.rows.filter((r: any) => [a.id, b.id, c.id].map((i: bigint) => `HT-${String(i).padStart(6, '0')}`).includes(r.code));
  assert.equal(mine.length, 3, 'every refund appears as its own row');
  for (const r of t.rows) {
    assert.ok(Array.isArray(r.detail) && r.detail.length >= 15, 'each row carries its full detail');
    for (const col of t.columns) assert.ok(col.key in r, `row has column ${col.key}`);
  }
  const done = mine.find((r: any) => r.status === 'Đã hoàn tiền');
  assert.equal(done.amount, 1000000);
  assert.equal(done.reason, 'Hoàn cọc khi trả kho');
  assert.equal(done.reference, 'Đã chi tiền mặt tại quầy');
  // totals: the tiles agree with the rows
  const succeeded = t.rows.filter((r: any) => r.status === 'Đã hoàn tiền').reduce((s: number, r: any) => s + r.amount, 0);
  assert.equal(t.summary.refundSucceeded, succeeded);
  assert.equal(t.summary.refundCount, t.rows.length);
  assert.equal(t.summary.refundByReason.reduce((s: number, g: any) => s + g.count, 0), t.rows.length);
  assert.equal(t.summary.refundByStatus.reduce((s: number, g: any) => s + g.amount, 0), t.rows.reduce((s: number, r: any) => s + r.amount, 0));
  assert.ok(t.summary.refundOpen >= 250000);
  assert.ok(t.summary.refundRejected >= 1);

  // a manager of another facility does not see these rows
  if (otherFacility) {
    const scoped = await svc.refundsReport({ ...p, facilityIds: [otherFacility.id] }, names);
    assert.equal(scoped.rows.filter((r: any) => r.code === done.code).length, 0);
  }
  // a period that ends before they were created leaves them out
  const earlier = await svc.refundsReport({ ...p, from: day(-60), to: day(-10) }, names);
  assert.equal(earlier.rows.filter((r: any) => r.code === done.code).length, 0);

  // abandoned goods
  const unit = (await edge.unit.findMany({ where: { id: contract.unit_id } }))[0];
  const user = (await edge.user.findMany({ take: 1 }))[0];
  const mkAg = (extra: Record<string, unknown>) => edge.abandonedGoodsRecord.create({ data: { public_id: `G${Math.random().toString(36).slice(2, 12).toUpperCase().padEnd(25, '0')}`, contract_id: contract.id, unit_id: unit.id, inventory_list: [{ item: 'Tủ lạnh', qty: 1 }, { item: 'Bàn ghế', qty: 4 }], witness_1_user_id: user.id, witness_2_user_id: user.id, stored_location: 'Kho tạm B1', hold_until: day(-5), created_at: day(-2), ...extra } });
  const sold = await mkAg({ disposition: 'SOLD', proceeds_amount: 500000, disposition_approved_by: user.id, disposition_at: day(0) });
  const waiting = await mkAg({ disposition: 'PENDING' });
  const ag = await svc.abandonedGoodsReport(p, names);
  assert.ok(ag.rows.length >= 2);
  const soldRow = ag.rows.find((r: any) => r.proceeds === 500000 && r.status === 'Thanh lý');
  assert.ok(soldRow, 'sold record is listed with its proceeds');
  assert.equal(soldRow.itemCount, 5);
  assert.match(soldRow.items, /Tủ lạnh \(x1\)/);
  assert.ok(soldRow.detail.some((l: any) => l.label === 'Tài sản 2' && /Bàn ghế/.test(String(l.value))));
  const waitRow = ag.rows.find((r: any) => r.status === 'Chờ quyết định' && r.holdState === 'Quá hạn lưu giữ');
  assert.ok(waitRow, 'a pending record past its hold date is flagged');
  assert.ok(ag.summary.agProceeds >= 500000);
  assert.ok(ag.summary.agOverdue >= 1 && ag.summary.agPending >= 1);
  assert.equal(ag.summary.agByDisposition.reduce((s: number, g: any) => s + g.count, 0), ag.rows.length);
  void sold; void waiting;
});
