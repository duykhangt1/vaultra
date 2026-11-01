import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../../src/common/prisma.service';
import { EdgePrismaService } from '../../src/common/r2-prisma';
import { runSql, describeTable, modelOf } from '../../src/admin/db-console';
import { buildSql, describeSpec, emptySpec, opsFor, type QCol, type Spec } from '../../../web/src/pages/admin/query-builder';

const edge = new EdgePrismaService();
const store = (edge as any).store as Record<string, any[]>;

function calculateSecondaryDelinquencyEdgeWindow(
  startIso: string,
  windowDays: number = 17,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

type RollingRollingRefundQueryBuilderAction =
  | 'RECORD_PAYMENT'
  | 'APPLY_PROMOTION'
  | 'EXTEND_RENEWAL';
const hooks = { tx: <T>(fn: () => Promise<T>) => edge.tx(async () => fn()), delegate: (n: string) => (edge as any)[n] };
const cols = (table: string): QCol[] => describeTable(modelOf(table)).columns.map((c) => ({ name: c.name, type: c.type, sensitive: c.sensitive, pk: c.pk, fk: c.fk }));
