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
