import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import '../../src/common/prisma.service';
import { EdgePrismaService } from '../../src/common/r2-prisma';
import { DelinquencyService } from '../../src/lifecycle/delinquency.service';
import { config } from '../../src/common/config';

const file = path.resolve(config.storage.localDir, 'r2-db-backup.json');
const have = fs.existsSync(file);

// debtBreakdown only needs the clock and a database: build the service without its Nest dependencies
const svc = Object.create(DelinquencyService.prototype) as DelinquencyService;
(svc as any).core = { today: () => new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z') };
