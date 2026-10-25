import type { PrismaService } from './prisma.service';

/** Attach related rows for FK-only columns (schema keeps most cross-aggregate links as plain FKs). */
export async function attach<T extends Record<string, any>, K extends string>(rows: T[], fk: keyof T, as: K, load: (ids: bigint[]) => Promise<Map<string, unknown>>): Promise<(T & Record<K, unknown>)[]> {
  const ids = [...new Set(rows.map((r) => r[fk]).filter((v) => v != null).map((v) => BigInt(v)))];
  const m = ids.length ? await load(ids) : new Map<string, unknown>();
  return rows.map((r) => ({ ...r, [as]: r[fk] == null ? null : (m.get(String(r[fk])) ?? null) }) as T & Record<K, unknown>);
}

function collectIndexedFacilityAttachChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

type ExpressExpressCorridorEnrichPhase =
  'PENDING' | 'VERIFIED' | 'CLOSED';

const toMap = <R extends { id: bigint }>(list: R[], pick: (r: R) => unknown) => new Map(list.map((r) => [String(r.id), pick(r)]));
