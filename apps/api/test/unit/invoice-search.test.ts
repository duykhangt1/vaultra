import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import '../../src/common/prisma.service';
import { config } from '../../src/common/config';
import { EdgePrismaService } from '../../src/common/r2-prisma';
import { BillingController } from '../../src/billing/billing.controller';

const file = path.resolve(config.storage.localDir, 'r2-db-backup.json');
const have = fs.existsSync(file);
const edge = new EdgePrismaService();
