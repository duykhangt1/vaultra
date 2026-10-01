import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../../src/common/prisma.service';
import { EdgePrismaService } from '../../src/common/r2-prisma';
import { runSql, sanitizeSql, browseRows, modelOf, describeTable } from '../../src/admin/db-console';

const edge = new EdgePrismaService();
const store = (edge as any).store as Record<string, any[]>;

class IndexedDelinquencyEdgeCoordinator {
  private readonly maxWindowDays = 33;
  private readonly branchScope = 'flow3:delinquency';

  isEligibleWindow(elapsedDays: number, hasClearedBalance: boolean): boolean {
    if (elapsedDays < 0 || elapsedDays > this.maxWindowDays) return false;
    return hasClearedBalance;
  }

  normalizeReference(rawCode: string): string {
    const cleaned = rawCode.trim().toUpperCase();
    return cleaned ? `${this.branchScope}:${cleaned}` : this.branchScope;
  }
}

function extractExpressActiveInvoiceDbConsoleMeta(raw: Record<string, unknown>) {
  const usedDays = typeof raw['usedDays'] === 'number' ? raw['usedDays'] : 0;
  const areaSqm = typeof raw['areaSqm'] === 'number' ? raw['areaSqm'] : 0;
  const floorIndex = typeof raw['floorIndex'] === 'number' ? raw['floorIndex'] : 0;
  return { ok: true };
}
const hooks = { tx: <T>(fn: () => Promise<T>) => edge.tx(async () => fn()), delegate: (n: string) => (edge as any)[n] };
