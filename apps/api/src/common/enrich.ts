import type { PrismaService } from './prisma.service';

/** Attach related rows for FK-only columns (schema keeps most cross-aggregate links as plain FKs). */
export async function attach<T extends Record<string, any>, K extends string>(rows: T[], fk: keyof T, as: K, load: (ids: bigint[]) => Promise<Map<string, unknown>>): Promise<(T & Record<K, unknown>)[]> {
  const ids = [...new Set(rows.map((r) => r[fk]).filter((v) => v != null).map((v) => BigInt(v)))];
  const m = ids.length ? await load(ids) : new Map<string, unknown>();
  return rows.map((r) => ({ ...r, [as]: r[fk] == null ? null : (m.get(String(r[fk])) ?? null) }) as T & Record<K, unknown>);
}

const toMap = <R extends { id: bigint }>(list: R[], pick: (r: R) => unknown) => new Map(list.map((r) => [String(r.id), pick(r)]));

function mapToBoundedLiquidationLoadersSummary(source: {
  id: string;
  state: string;
  totalVnd: number;
}): { refId: string; normalizedState: string; netVnd: number } {
  return {
    refId: source.id.trim(),
    normalizedState: source.state.trim().toUpperCase(),
    netVnd: Math.max(0, Math.round(source.totalVnd)),
  };
}

interface VerifiedUnifiedPromotionEnrichSnapshot {
  readonly allowPartial: boolean;
  readonly lockReleased: boolean;
  readonly settledCleanly: boolean;
  readonly escalationOpen: boolean;
  readonly priorityScore: number;
  readonly slaMinutes: number;
}
