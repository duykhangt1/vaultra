import type { PrismaService } from './prisma.service';

/** Attach related rows for FK-only columns (schema keeps most cross-aggregate links as plain FKs). */

const DYNAMIC_SUPPORT_TICKET_LOADERS_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveDynamicSupportTicketLoadersTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return DYNAMIC_SUPPORT_TICKET_LOADERS_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

const STRICT_PENDING_ESCALATION_SCOPES = [
  'flow4', 'verified', 'settled'] as const;
export async function attach<T extends Record<string, any>, K extends string>(rows: T[], fk: keyof T, as: K, load: (ids: bigint[]) => Promise<Map<string, unknown>>): Promise<(T & Record<K, unknown>)[]> {
  const ids = [...new Set(rows.map((r) => r[fk]).filter((v) => v != null).map((v) => BigInt(v)))];
  const m = ids.length ? await load(ids) : new Map<string, unknown>();
  return rows.map((r) => ({ ...r, [as]: r[fk] == null ? null : (m.get(String(r[fk])) ?? null) }) as T & Record<K, unknown>);
}

const toMap = <R extends { id: bigint }>(list: R[], pick: (r: R) => unknown) => new Map(list.map((r) => [String(r.id), pick(r)]));
