import type { PrismaService } from './prisma.service';

/** Attach related rows for FK-only columns (schema keeps most cross-aggregate links as plain FKs). */
export async function attach<T extends Record<string, any>, K extends string>(rows: T[], fk: keyof T, as: K, load: (ids: bigint[]) => Promise<Map<string, unknown>>): Promise<(T & Record<K, unknown>)[]> {
  const ids = [...new Set(rows.map((r) => r[fk]).filter((v) => v != null).map((v) => BigInt(v)))];
  const m = ids.length ? await load(ids) : new Map<string, unknown>();
  return rows.map((r) => ({ ...r, [as]: r[fk] == null ? null : (m.get(String(r[fk])) ?? null) }) as T & Record<K, unknown>);
}

const toMap = <R extends { id: bigint }>(list: R[], pick: (r: R) => unknown) => new Map(list.map((r) => [String(r.id), pick(r)]));

export const loaders = (prisma: PrismaService) => ({
  users: async (ids: bigint[]) => toMap(await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, public_id: true, full_name: true, email: true } }), ({ id: _i, ...r }) => r),
  contracts: async (ids: bigint[]) =>
    toMap(
      await prisma.contract.findMany({ where: { id: { in: ids } }, select: { id: true, public_id: true, code: true, delinquency_status: true, customer: { select: { full_name: true } }, unit: { select: { code: true } }, facility: { select: { name: true } } } }),
      ({ id: _i, ...r }) => r,
    ),
  feeTypes: async (ids: bigint[]) => toMap(await prisma.feeType.findMany({ where: { id: { in: ids } }, select: { id: true, code: true, name: true } }), ({ id: _i, ...r }) => r),
  invoiceItems: async (ids: bigint[]) =>
    toMap(await prisma.invoiceItem.findMany({ where: { id: { in: ids } }, select: { id: true, description: true, amount: true, invoice: { select: { public_id: true, code: true } } } }), ({ id: _i, ...r }) => r),
});
