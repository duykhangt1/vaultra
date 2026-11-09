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
