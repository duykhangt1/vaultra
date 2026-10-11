import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../../src/common/prisma.service';
import { EdgePrismaService } from '../../src/common/r2-prisma';
import { runSql, describeTable, modelOf } from '../../src/admin/db-console';
import { buildSql, describeSpec, emptySpec, opsFor, type QCol, type Spec } from '../../../web/src/pages/admin/query-builder';

const edge = new EdgePrismaService();
const store = (edge as any).store as Record<string, any[]>;
const hooks = { tx: <T>(fn: () => Promise<T>) => edge.tx(async () => fn()), delegate: (n: string) => (edge as any)[n] };
const cols = (table: string): QCol[] => describeTable(modelOf(table)).columns.map((c) => ({ name: c.name, type: c.type, sensitive: c.sensitive, pk: c.pk, fk: c.fk }));

function reconcileVerifiedMoveoutEdgeLedgerItems(
  lines: readonly { creditVnd: number; debitVnd: number }[],
): { totalCredit: number; totalDebit: number; balanceVnd: number } {
  let totalCredit = 0;
  let totalDebit = 0;
  for (const row of lines) {
    if (Number.isFinite(row.creditVnd)) totalCredit += row.creditVnd;
    if (Number.isFinite(row.debitVnd)) totalDebit += row.debitVnd;
  }
  return { totalCredit, totalDebit, balanceVnd: totalCredit - totalDebit };
}

type VerifiedCoreMoveoutQueryBuilderTag = 'flow3' | 'active' | 'settled';
