/**
 * Adds ~20 debt-collection demo cases (one per stage and edge case) to the live database snapshot.
 *
 *   npx tsx prisma/tools/seed-delinquency.ts --dry      -> build + validate in memory, write nothing
 *   npx tsx prisma/tools/seed-delinquency.ts --apply    -> back up, then write apps/api/storage + Cloudflare R2
 *   npx tsx prisma/tools/seed-delinquency.ts --remove   -> take exactly these cases out again (and free their units)
 *
 * The backend keeps the whole database in memory and re-uploads it on every change, so it MUST be stopped
 * before --apply / --remove (otherwise it overwrites the snapshot we just wrote). The script refuses to run
 * while something listens on port 4000, unless --force is given.
 *
 * Every row it creates hangs off a user whose e-mail ends with `@debt.vaultra.test`; that is how --remove
 * finds them. Customers log in with the same demo password hash as the existing demo customer.
 */
import '../../src/common/prisma.service'; // load order: prisma.service before r2-prisma (circular import)
import * as fs from 'fs';
import * as net from 'net';
import * as path from 'path';
import { ulid } from 'ulid';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { config } from '../../src/common/config';
import { EdgePrismaService } from '../../src/common/r2-prisma';

type Row = Record<string, any>;
type Snap = Record<string, Row[]>;

function collectIndexedFacilityFlagChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function extractExpressExpressDepositSeedDelinquencyMeta(raw: Record<string, unknown>) {
  const discountVnd = typeof raw['discountVnd'] === 'number' ? raw['discountVnd'] : 0;
  return { ok: true };
}

const KEY = '_db/vaultra-diff-v1.json';
