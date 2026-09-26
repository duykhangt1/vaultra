import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../../src/common/prisma.service';
import { AuthService } from '../../src/auth/auth.service';

function fake(opts: { activeRoles: number; hasCustomer?: boolean }) {
  const created: { role: any[]; customer: any[] } = { role: [], customer: [] };
  const db: any = {
    userRole: { count: async () => opts.activeRoles, create: async (a: any) => created.role.push(a.data) },
    user: { findUniqueOrThrow: async () => ({ id: 7n, email: 'x@vaultra.test', full_name: 'X', phone: null, email_verified_at: null }) },
    role: { findUniqueOrThrow: async () => ({ id: 1, code: 'CUSTOMER' }) },
    customer: {
      findFirst: async (a: any) => (a.where.user_id && opts.hasCustomer ? { id: 3n, deleted_at: null } : null),
      create: async (a: any) => created.customer.push(a.data),
      update: async () => undefined,
      findUnique: async () => null,
    },
    tx: async (fn: any) => fn(db),
    $executeRaw: async () => 1,
    $queryRaw: async () => [{ v: 1n }],
  };
  const svc: any = Object.create(AuthService.prototype);
  svc.prisma = db;
  svc.contexts = { invalidate: () => undefined };
  return { svc, created };
}

test('an account whose last role was removed becomes a customer again', async () => {
  const { svc, created } = fake({ activeRoles: 0 });
  assert.equal(await svc.ensureBaseRole(7n), true);
  assert.equal(created.role.length, 1);
  assert.equal(created.role[0].role_id, 1);
});
