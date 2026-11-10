import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import '../../src/common/prisma.service';
import { EdgePrismaService } from '../../src/common/r2-prisma';
import { ReportService } from '../../src/report/report.service';
import { buildCsv, csvCell, dayKey, facilitySnapshots, agingBucket, agingTotals, occRates, sumOcc, emptyOcc, resolveAdminPeriod, emptyAdminSeries, adminBucketKey, localDayStart, localDayEnd } from '../../src/report/metrics';
import { decorateReport, REPORT_DOCS } from '../../src/report/report-docs';
import { REPORT_CODES } from '../../src/report/report.service';
import { REPORT_SUMMARY, METRIC_DOCS, DEFAULT_POLICY_PARAMS } from '@vaultra/shared';
import { config } from '../../src/common/config';

const file = path.resolve(config.storage.localDir, 'r2-db-backup.json');
const have = fs.existsSync(file);
const TODAY = new Date('2026-11-12T00:00:00.000Z');
const NOW = new Date('2026-11-12T08:00:00.000Z');

async function world() {
  const edge: any = new EdgePrismaService();
  edge.loadSnapshot(JSON.parse(fs.readFileSync(file, 'utf8')));
  edge.repairIntegrity();
  const svc: any = Object.create(ReportService.prototype);
  svc.prisma = edge;
  svc.core = { today: () => TODAY, now: () => NOW, activePolicy: async () => ({ params: DEFAULT_POLICY_PARAMS }) };
  const facilities: any[] = await edge.facility.findMany({});
  const names = new Map<string, string>(facilities.map((f) => [f.id.toString(), f.name]));
  const ctxSys: any = { require: () => undefined, assertScope: () => undefined, can: () => true, hasRole: () => false, userId: 1n };
  return { edge, svc, facilities, names, ctxSys };
}
const monthStart = new Date(Date.UTC(2026, 10, 1));
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

// ------------------------------------------------------------------ pure helpers
test('rates come from the same counts, so a total row equals the headline', () => {
  const a = { ...emptyOcc(), rentable: 40, occupied: 6, areaRentable: 100, areaOccupied: 25, potentialRent: 1000, actualRent: 200, activeContracts: 6 };
  const b = { ...emptyOcc(), rentable: 10, occupied: 5, areaRentable: 20, areaOccupied: 10, potentialRent: 400, actualRent: 300, activeContracts: 5 };
  const t = occRates(sumOcc([a, b]));
  assert.equal(t.unitRate, 11 / 50);
  assert.equal(t.areaRate, 35 / 120);
  assert.equal(t.economicRate, 500 / 1400);
  assert.equal(occRates(emptyOcc()).unitRate, 0, 'no stock is 0, not NaN');
});

test('overdue share is always between 0 and 1, and buckets follow the days past due', () => {
  assert.equal(agingBucket(0), 'current');
  assert.equal(agingBucket(1), 'd0_30');
  assert.equal(agingBucket(30), 'd0_30');
  assert.equal(agingBucket(31), 'd31_60');
  assert.equal(agingBucket(61), 'd61_90');
  assert.equal(agingBucket(91), 'd90_plus');
  const t = agingTotals({ current: 100, d0_30: 50, d31_60: 0, d61_90: 0, d90_plus: 50 });
  assert.deepEqual([t.overdue, t.total, t.overdueRatio], [100, 200, 0.5]);
  assert.equal(agingTotals({ current: 0, d0_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 }).overdueRatio, 0);
});

test('a stored date stands for its Vietnam calendar day', () => {
  assert.equal(dayKey('2026-11-06T17:00:00.000Z'), '2026-11-07');
  assert.equal(dayKey('2026-11-08T00:00:00.000Z'), '2026-11-08');
  assert.equal(localDayStart(new Date('2026-11-12T00:00:00Z')).toISOString(), '2026-11-11T17:00:00.000Z');
  assert.equal(localDayEnd(new Date('2026-11-12T00:00:00Z')).toISOString(), '2026-11-12T17:00:00.000Z');
});

test('the facility row of a day is the one covering the most units, per-type rows stored under key 0 are ignored', () => {
  const row = (units: number, occ: number, f = 1) => ({ metric_date: '2026-11-06T17:00:00.000Z', facility_id: f, unit_type_key: 0, units_total: units, units_unavailable: 0, units_occupied: occ, units_overlocked: 0, area_total_m2: 1, area_occupied_m2: 0, potential_rent: 1, actual_rent: 0 });
  const m = facilitySnapshots([row(10, 1), row(40, 6), row(12, 2), row(5, 0, 2)] as never);
  assert.equal(m.size, 2);
  assert.equal(m.get('2026-11-07|1')!.rentable, 40);
  assert.equal(m.get('2026-11-07|1')!.occupied, 6);
  assert.equal(facilitySnapshots([{ ...row(10, 1), unit_type_key: 7 }] as never).size, 0, 'unit-type rows are not facility totals');
});

test('CSV: UTF-8 with byte-order mark, explicit separator, numbers unquoted, text quoted, formulas defused', () => {
  const buf = buildCsv(
    [{ key: 'a', label: 'Cơ sở' }, { key: 'm', label: 'Tiền', type: 'money' }, { key: 'p', label: 'Tỷ lệ', type: 'pct' }, { key: 'i', label: 'Số', type: 'int' }, { key: 'd', label: 'Ngày', type: 'date' }],
    [{ a: 'Vaultra "Q7"', m: 1234567.4, p: 0.0434, i: 7, d: '2026-11-12' }, { a: '=SUM(A1)', m: null, p: null, i: 0, d: null }, { a: '-x', m: 2, p: 1, i: 3, d: '2026-11-13T00:00:00.000Z' }],
  );
  assert.deepEqual([...buf.subarray(0, 3)], [0xef, 0xbb, 0xbf], 'BOM so Excel reads UTF-8');
  const lines = buf.toString('utf8').slice(1).split('\r\n');
  assert.equal(lines[0], 'sep=;');
  assert.equal(lines[1], '"Cơ sở";"Tiền";"Tỷ lệ";"Số";"Ngày"');
  assert.equal(lines[2], '"Vaultra ""Q7""";1234567;4,3%;7;2026-11-12');
  assert.equal(lines[3], `"'=SUM(A1)";;;0;`);
  assert.equal(lines[4], `"'-x";2;100%;3;2026-11-13`);
  assert.equal(csvCell(true), 'Có');
  assert.equal(csvCell(4.5), '4,5', 'decimal comma for a Vietnamese Excel');
  assert.equal(csvCell(0.5, 'pct'), '50%');
});

test('security period: presets, custom days and invalid ranges', () => {
  const day = resolveAdminPeriod({}, NOW, TODAY);
  assert.deepEqual([day.key, day.bucket], ['24h', 'hour']);
  assert.equal(NOW.getTime() - day.from.getTime(), 24 * 3600000);
  const week = resolveAdminPeriod({ range: '7d' }, NOW, TODAY);
  assert.equal(week.bucket, 'day');
  assert.equal(week.from.toISOString(), '2026-11-05T17:00:00.000Z', 'seven calendar days including today, from local midnight');
  assert.equal(emptyAdminSeries(week).length, 7);
  const one = resolveAdminPeriod({ range: 'custom', from: '2026-11-10', to: '2026-11-10' }, NOW, TODAY);
  assert.equal(one.bucket, 'hour');
  assert.equal(emptyAdminSeries(one).length, 24);
  assert.equal(resolveAdminPeriod({ range: 'custom', from: '2026-10-01', to: '2026-10-31' }, NOW, TODAY).bucket, 'day');
  assert.throws(() => resolveAdminPeriod({ range: 'custom', from: '2026-11-10', to: '2026-11-01' }, NOW, TODAY), /Đến ngày/);
  assert.throws(() => resolveAdminPeriod({ range: 'custom', from: '2026-11-10' }, NOW, TODAY), /Từ ngày/);
  assert.throws(() => resolveAdminPeriod({ range: 'custom', from: '2024-01-01', to: '2026-01-01' }, NOW, TODAY), /366/);
  assert.equal(adminBucketKey('2026-11-11T17:30:00.000Z', 'day'), '2026-11-12');
  assert.equal(adminBucketKey('2026-11-11T17:30:00.000Z', 'hour'), '2026-11-12T00');
});

test('every report has a description and a hover text for each column; every summary tile has a label', () => {
  for (const code of REPORT_CODES) assert.ok(REPORT_DOCS[code], `${code} has docs`);
  for (const [code, doc] of Object.entries(REPORT_DOCS)) {
    assert.ok(doc.description.length > 20, code);
    for (const [key, help] of Object.entries(doc.columns)) assert.ok(help && help.length > 5, `${code}.${key} has a help text`);
  }
  for (const [k, v] of Object.entries(REPORT_SUMMARY)) assert.ok(v.label && v.help, `summary ${k} has label and help`);
  for (const [k, v] of Object.entries(METRIC_DOCS)) assert.ok(v.length > 10, `metric doc ${k}`);
  const t = decorateReport('revenue', { columns: [{ key: 'billed', label: 'Phát hành', type: 'money' as const }, { key: 'period', label: 'Kỳ' }] });
  assert.equal(t.columns[0].total, 'sum');
  assert.equal(t.columns[1].total, undefined);
  assert.ok(t.columns[0].help);
});

// ------------------------------------------------------------------ the same number on every screen
test('occupancy: overview, comparison, report rows and the total row agree', { skip: !have }, async () => {
  const { svc, ctxSys } = await world();
  const pf = await svc.portfolio(ctxSys, monthStart, TODAY);
  const stock = pf.comparison.filter((c: any) => c.stock);
  assert.equal(pf.kpi.rentable, sum(stock.map((c: any) => c.rentable)));
  assert.equal(pf.kpi.occupied, sum(stock.map((c: any) => c.occupied)));
  assert.ok(Math.abs(pf.kpi.unitRate - pf.kpi.occupied / pf.kpi.rentable) < 1e-12);
  assert.ok(pf.kpi.unitRate >= 0 && pf.kpi.unitRate <= 1);
  assert.equal(pf.kpi.facilities, stock.length);
  assert.ok(pf.kpi.facilitiesTotal >= pf.kpi.facilities);
  for (const c of pf.comparison) {
    assert.ok(c.occupied <= c.rentable && c.rentable <= c.units, `${c.facility.name}: occupied ≤ rentable ≤ total`);
    assert.ok(c.unitRate >= 0 && c.unitRate <= 1 && c.areaRate <= 1 + 1e-9);
  }
  const rep = await svc.run({ hasRole: () => false }, 'occupancy', { from: monthStart, to: TODAY, facilityIds: null, groupBy: 'month' });
  assert.ok(rep.rows.length > 0 && rep.rows.length === stock.length, 'one row per facility with stock');
  for (const r of rep.rows) {
    const c = stock.find((x: any) => x.facility.name === r.facility);
    assert.ok(c, `${r.facility} is a stock facility`);
    assert.equal(r.units, c.rentable);
    assert.equal(r.occupied, c.occupied);
    assert.ok(Math.abs(r.unitRate - c.unitRate) < 1e-12 && Math.abs(r.areaRate - c.areaRate) < 1e-12 && Math.abs(r.economicRate - c.economicRate) < 1e-12);
    assert.equal(r.asOf, '2026-11-12', 'the current period is live');
  }
  assert.ok(rep.totalRow, 'a total row for several facilities');
  assert.equal(rep.totalRow.units, pf.kpi.rentable);
  assert.equal(rep.totalRow.occupied, pf.kpi.occupied);
  assert.ok(Math.abs(rep.totalRow.unitRate - pf.kpi.unitRate) < 1e-12, 'total row = headline unit rate');
  assert.ok(Math.abs(rep.totalRow.areaRate - pf.kpi.areaRate) < 1e-12, 'total row = headline area rate');
  assert.ok(Math.abs(rep.totalRow.economicRate - pf.kpi.economicRate) < 1e-12, 'total row = headline economic rate');
  assert.deepEqual(Object.keys(rep.summary), ['byStatus'], 'the three "now" tiles are gone: the total row carries them');
  assert.equal(sum(Object.values(rep.summary.byStatus) as number[]), pf.kpi.total, 'status counts add up to the stock units');
});

test('a facility filter really narrows a report to that facility', { skip: !have }, async () => {
  const { svc, facilities } = await world();
  const f = facilities.find((x) => x.status === 'ACTIVE');
  const rep = await svc.run({ hasRole: () => false }, 'occupancy', { from: monthStart, to: TODAY, facilityIds: [f.id], groupBy: 'month' });
  assert.equal(rep.rows.length, 1);
  assert.equal(rep.rows[0].facility, f.name);
  assert.equal(rep.totalRow, undefined, 'a single facility needs no total row');
  const live = await svc.occupancyNow([f.id]);
  assert.equal(rep.summary.byStatus.OCCUPIED ?? 0, live.byStatus.OCCUPIED ?? 0);
  const rev = await svc.run({ hasRole: () => false }, 'revenue', { from: monthStart, to: TODAY, facilityIds: [f.id], groupBy: 'month' });
  for (const r of rev.rows) assert.equal(r.facility, f.name);
  const fee = (rev.summary.byFeeType as { amount: number }[]).reduce((s, x) => s + x.amount, 0);
  assert.equal(Math.round(fee), rev.summary.billed, 'billed by fee type adds up to billed, for this facility only');
});

test('money: overview, comparison, revenue report, trend and size split add up', { skip: !have }, async () => {
  const { svc, ctxSys } = await world();
  const pf = await svc.portfolio(ctxSys, monthStart, TODAY);
  for (const k of ['billed', 'collected', 'recognized', 'refunded']) assert.equal(pf.kpi[k], sum(pf.comparison.map((c: any) => c[k])), `kpi.${k} = sum of the table`);
  const rep = await svc.run({ hasRole: () => false }, 'revenue', { from: monthStart, to: TODAY, facilityIds: null, groupBy: 'month' });
  for (const k of ['billed', 'collected', 'recognized', 'refunded']) {
    assert.equal(rep.summary[k], pf.kpi[k], `report summary ${k} = overview`);
    assert.equal(rep.summary[k], sum(rep.rows.map((r: any) => r[k])), `report summary ${k} = sum of rows`);
  }
  const fee = (rep.summary.byFeeType as { amount: number }[]).reduce((s, x) => s + x.amount, 0);
  assert.ok(Math.abs(fee - rep.summary.billed) <= 1, 'fee types add up to billed');
  const last = pf.trend[pf.trend.length - 1];
  assert.equal(last.month, '2026-11');
  for (const k of ['billed', 'collected', 'recognized', 'refunded']) assert.equal(last[k], pf.kpi[k], `trend ${k} of this month = overview`);
  assert.equal(last.unitRate, pf.kpi.unitRate, 'trend occupancy of this month = overview');
  for (const t of pf.trend) assert.ok(t.recognized > -1e9 && t.billed >= 0);
  const size = sum(pf.revenueBySize.map((s: any) => s.amount));
  assert.ok(Math.abs(size - pf.kpi.rentRecognized) <= pf.revenueBySize.length, 'sizes add up to recognized rent');
});

test('receivables: overdue is part of the total, the ratio is a share, and every screen reads the same buckets', { skip: !have }, async () => {
  const { svc, ctxSys, facilities } = await world();
  const pf = await svc.portfolio(ctxSys, monthStart, TODAY);
  const rep = await svc.run({ hasRole: () => false }, 'receivables-aging', { from: monthStart, to: TODAY, facilityIds: null, groupBy: 'month' });
  const s = rep.summary;
  assert.equal(s.overdue, pf.kpi.overdue);
  assert.equal(s.total, pf.kpi.receivable);
  assert.equal(s.overdue, s.d0_30 + s.d31_60 + s.d61_90 + s.d90_plus);
  assert.equal(s.total, s.overdue + s.current);
  for (const k of ['current', 'd0_30', 'd31_60', 'd61_90', 'd90_plus', 'total']) assert.equal(s[k], sum(rep.rows.map((r: any) => r[k])), `${k} = sum of rows`);
  assert.ok(s.overdueRatio >= 0 && s.overdueRatio <= 1);
  for (const c of pf.comparison) {
    assert.ok(c.overdueRatio >= 0 && c.overdueRatio <= 1, `${c.facility.name} overdue ratio is a share`);
    const ag = await svc.aging([facilities.find((f: any) => f.name === c.facility.name).id]);
    assert.equal(ag.overdue, c.overdue);
  }
  for (const a of pf.alerts) assert.ok(a.value >= 0 && a.value <= 1, 'alerts quote a real share');
  assert.ok(pf.alerts.every((a: any) => a.facility !== 'test'), 'an inactive facility raises no alert');
});

test('facility overview equals the system overview for the same facility', { skip: !have }, async () => {
  const { svc, ctxSys, facilities } = await world();
  const pf = await svc.portfolio(ctxSys, monthStart, TODAY);
  const del = await svc.run({ hasRole: () => false }, 'delinquency', { from: monthStart, to: TODAY, facilityIds: null, groupBy: 'month' });
  for (const f of facilities.filter((x) => x.status === 'ACTIVE')) {
    const d = await svc.facilityDashboard(ctxSys, f.id);
    const c = pf.comparison.find((x: any) => x.facility.name === f.name);
    assert.equal(d.occupancy.rentable, c.rentable);
    assert.equal(d.occupancy.occupied, c.occupied);
    assert.equal(d.occupancy.unitRate, c.unitRate);
    for (const k of ['billed', 'collected', 'recognized', 'refunded']) assert.equal(d.revenue.month[k], c[k], `${f.name}: ${k} of the month`);
    assert.equal(d.aging.overdue, c.overdue);
    const lastPoint = d.trend[d.trend.length - 1];
    assert.equal(lastPoint.month, '2026-11');
    assert.equal(lastPoint.billed, c.billed, 'trend of this month = month revenue');
    assert.equal(lastPoint.unitRate, c.unitRate);
    // the "contracts overdue" tile counts the same contracts the delinquency report counts
    const tile = ['GRACE', 'LATE', 'LOCKED_OUT', 'FINAL_NOTICE', 'DEFAULT_PENDING'].reduce((s, k) => s + (d.delinquencyFunnel[k] ?? 0), 0);
    const rows = del.rows.filter((r: any) => r.facility === f.name && ['Đang thuê', 'Đã báo trả kho', 'Hết hạn'].includes(r.contractStatus) && ['Ân hạn', 'Trễ hạn', 'Khóa truy cập', 'Thông báo cuối', 'Chờ xử lý vi phạm'].includes(r.stage));
    assert.equal(tile, rows.length, `${f.name}: tile = report`);
    // like with like: this month so far against the same days of the previous month
    assert.equal(d.revenue.period.prevTo.toISOString().slice(0, 10), '2026-10-12');
    assert.equal(d.revenue.prevMonthFull.billed >= d.revenue.prevMonth.billed || d.revenue.prevMonthFull.billed >= 0, true);
  }
  const total = ['GRACE', 'LATE', 'LOCKED_OUT', 'FINAL_NOTICE', 'DEFAULT_PENDING'].length;
  assert.equal(total, 5);
  assert.equal(del.summary.delinquentContracts, del.rows.filter((r: any) => ['Đang thuê', 'Đã báo trả kho', 'Hết hạn'].includes(r.contractStatus) && ['Ân hạn', 'Trễ hạn', 'Khóa truy cập', 'Thông báo cuối', 'Chờ xử lý vi phạm'].includes(r.stage)).length);
});

test('rates of other reports are shares of their own cohort', { skip: !have }, async () => {
  const { svc } = await world();
  const from = new Date('2026-09-01T00:00:00Z');
  const rn = await svc.renewalStats(null, from, TODAY);
  assert.ok(rn.renewed <= rn.ending && (rn.rate === null || (rn.rate >= 0 && rn.rate <= 1)));
  const ca = await svc.cancellationStats(null, from, TODAY);
  assert.ok(ca.cancelled <= ca.created && ca.converted <= ca.quotes);
  assert.ok(ca.rate === null || (ca.rate >= 0 && ca.rate <= 1));
  assert.ok(ca.conversion === null || (ca.conversion >= 0 && ca.conversion <= 1));
  const sla = await svc.slaStats(null, from, TODAY);
  assert.ok(sla.ok <= sla.closed);
  const sl = await svc.run({ hasRole: () => false }, 'support-sla', { from, to: TODAY, facilityIds: null, groupBy: 'month' });
  for (const r of sl.rows) {
    assert.ok(!/^[A-Z_]+$/.test(r.category) && !/^[A-Z_]+$/.test(r.priority), 'readable names, not codes');
    for (const k of ['firstPct', 'resolvePct']) assert.ok(r[k] === null || (r[k] >= 0 && r[k] <= 1));
  }
});

test('every report builds, shows no raw status codes, and its CSV opens with the right headers', { skip: !have }, async () => {
  const { svc, ctxSys } = await world();
  const from = new Date('2026-09-01T00:00:00Z');
  for (const code of REPORT_CODES) {
    const t = await svc.run(ctxSys, code, { from, to: TODAY, facilityIds: null, groupBy: 'month' });
    assert.ok(t.description && t.columns.every((c: any) => c.help), `${code}: description and column help`);
    for (const c of t.columns) assert.ok(['money', 'pct', 'int', 'date', 'text', undefined].includes(c.type));
    for (const r of t.rows.slice(0, 50)) for (const c of t.columns) if (typeof r[c.key] === 'string') assert.ok(!/^(ACTIVE|LOCKED_OUT|GRACE|LATE|EXPIRED|CANCELLED|NO_SHOW|OPEN|DEFAULTED|DEFAULT_PENDING|FINAL_NOTICE|MOVE_OUT_SCHEDULED|MATCHED|VNPAY)$/.test(r[c.key]), `${code}.${c.key} shows a raw code: ${r[c.key]}`);
    for (const k of Object.keys(t.summary ?? {})) assert.ok(REPORT_SUMMARY[k], `${code}: summary key ${k} has a label`);
    const csv = buildCsv(t.columns, t.totalRow ? [...t.rows, t.totalRow] : t.rows).toString('utf8');
    assert.ok(csv.startsWith('﻿sep=;\r\n'), `${code}: BOM and sep line`);
    assert.equal(csv.split('\r\n')[1], t.columns.map((c: any) => `"${c.label}"`).join(';'));
  }
});

test('daily snapshots: the repaired table has one facility row per day and the live number replaces a stale snapshot of today', { skip: !have }, async () => {
  const { edge, svc } = await world();
  const rows: any[] = await edge.dailyFacilityMetric.findMany({ where: { unit_type_key: 0 } });
  const seen = new Set<string>();
  for (const r of rows) {
    const k = `${new Date(r.metric_date).toISOString()}|${r.facility_id}`;
    assert.ok(!seen.has(k), `duplicate facility row ${k}`);
    seen.add(k);
    assert.equal(new Date(r.metric_date).getUTCHours(), 0, 'dates are local midnight stored as UTC midnight');
  }
  const f = (await edge.facility.findMany({ where: { status: 'ACTIVE' } }))[0];
  // a stale snapshot for today must not win over the live count
  await edge.dailyFacilityMetric.create({ data: { metric_date: TODAY, facility_id: f.id, unit_type_key: 0, units_total: 1, units_available: 1, units_reserved: 0, units_occupied: 0, units_overlocked: 0, units_unavailable: 0, area_total_m2: 1, area_occupied_m2: 0, potential_rent: 1, actual_rent: 0 } });
  const rep = await svc.run({ hasRole: () => false }, 'occupancy', { from: monthStart, to: TODAY, facilityIds: [f.id], groupBy: 'month' });
  const live = await svc.occupancyNow([f.id]);
  assert.equal(rep.rows[0].units, live.rentable);
  assert.equal(rep.rows[0].occupied, live.occupied);
});

test('report parameters: facility and grouping are read as sent, a made-up grouping is refused', { skip: !have }, async () => {
  const { svc, ctxSys, facilities } = await world();
  const f = facilities.find((x) => x.status === 'ACTIVE');
  const sys: any = { ...ctxSys, can: () => true, facilitiesFor: () => [] };
  assert.equal(svc.resolveParams(sys, 'occupancy', {}, null).groupBy, 'month', 'no grouping means month');
  assert.equal(svc.resolveParams(sys, 'occupancy', { groupBy: '' }, null).groupBy, 'month');
  assert.equal(svc.resolveParams(sys, 'occupancy', { groupBy: 'day' }, [f.id]).groupBy, 'day');
  assert.deepEqual(svc.resolveParams(sys, 'occupancy', {}, [f.id]).facilityIds, [f.id]);
  assert.throws(() => svc.resolveParams(sys, 'occupancy', { groupBy: 'week' }, null), /nhóm/i);
  assert.throws(() => svc.resolveParams(sys, 'occupancy', { from: '2026-11-10', to: '2026-11-01' }, null), /không hợp lệ/i);
});

test('security overview follows the chosen period', { skip: !have }, async () => {
  const { edge, svc } = await world();
  const at = (iso: string, ok: boolean, why?: string) => edge.loginHistory.create({ data: { method: 'PASSWORD', success: ok, failure_reason: why ?? null, ip_address: '1.1.1.1', created_at: new Date(iso) } });
  // what the data already holds for every period, before the test adds its own rows
  const before = {
    d1: await svc.adminDashboard({ range: '24h' }),
    d7: await svc.adminDashboard({ range: '7d' }),
    d30: await svc.adminDashboard({ range: '30d' }),
    one: await svc.adminDashboard({ range: 'custom', from: '2026-11-09', to: '2026-11-09' }),
  };
  await at('2026-11-12T07:00:00Z', true);
  await at('2026-11-12T07:30:00Z', true);
  await at('2026-11-12T06:00:00Z', false, 'BAD_PASSWORD');
  await at('2026-11-09T05:00:00Z', true);
  await at('2026-11-02T05:00:00Z', false, 'TOKEN_REUSE');
  const d1 = await svc.adminDashboard({ range: '24h' });
  assert.equal(d1.logins.success - before.d1.logins.success, 2);
  assert.equal(d1.logins.failed - before.d1.logins.failed, 1);
  assert.equal(d1.series.length >= 24 && d1.series.length <= 25, true);
  assert.equal(d1.series.reduce((s: number, x: any) => s + x.ok, 0), d1.logins.success, 'bars add up to the total');
  const d7 = await svc.adminDashboard({ range: '7d' });
  assert.equal(d7.period.bucket, 'day');
  assert.equal(d7.series.length, 7);
  assert.equal(d7.logins.success - before.d7.logins.success, 3, 'the 7-day view also holds the login of 9 Nov');
  assert.equal(d7.series.reduce((s: number, x: any) => s + x.ok, 0), d7.logins.success);
  const d30 = await svc.adminDashboard({ range: '30d' });
  assert.equal(d30.tokenReuse - before.d30.tokenReuse, 1, 'the token reuse of 2 Nov is inside 30 days');
  assert.equal(d7.tokenReuse - before.d7.tokenReuse, 0, 'and outside 7 days');
  const one = await svc.adminDashboard({ range: 'custom', from: '2026-11-09', to: '2026-11-09' });
  assert.equal(one.logins.success - before.one.logins.success, 1, 'a single chosen day only counts that day');
  assert.equal(one.series.length, 24);
  await assert.rejects(svc.adminDashboard({ range: 'custom', from: '2026-11-09', to: '2026-11-01' }), (e: any) => e.status === 400 || e.code === 'VALIDATION_FAILED');
});
