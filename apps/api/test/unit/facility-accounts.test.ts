import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import '../../src/common/prisma.service';
import { EdgePrismaService } from '../../src/common/r2-prisma';
import { FacilityAccountsService } from '../../src/admin/facility-accounts.service';
import { config } from '../../src/common/config';
import { ROLE_PERMISSIONS, ROLES } from '@vaultra/shared';

const file = path.resolve(config.storage.localDir, 'r2-db-backup.json');
const have = fs.existsSync(file);

const rejects = (p: Promise<unknown>, status: number) => assert.rejects(p, (e: any) => e.status === status, `expected HTTP ${status}`);

test('only the facility manager role holds facility_account.manage, scoped to its facilities', () => {
  for (const r of ROLES) {
    const g = (ROLE_PERMISSIONS as any)[r]['facility_account.manage'];
    if (r === 'FACILITY_MANAGER') assert.equal(g?.scope, 'FACILITY');
    else assert.equal(g, undefined, `${r} must not hold it`);
  }
});

async function world() {
  const edge: any = new EdgePrismaService();
  edge.loadSnapshot(JSON.parse(fs.readFileSync(file, 'utf8')));
  edge.repairIntegrity();
  const calls: string[] = [];
  const svc = new FacilityAccountsService(
    edge,
    { log: async (_c: unknown, e: { action: string }) => { calls.push(`audit:${e.action}`); } } as any,
    { ensureBaseRole: async () => false, revokeAllSessions: async () => { calls.push('revoke-sessions'); }, forgotPassword: async () => { calls.push('forgot'); } } as any,
    { invalidate: () => undefined } as any,
    { sendDirect: async () => { calls.push('mail'); }, notify: async () => undefined } as any,
    { revokeUser: () => undefined } as any,
  );
  const user = async (email: string) => (await edge.user.findMany({ where: { email } }))[0];
  const facilities: any[] = await edge.facility.findMany({});
  const q7 = facilities.find((f) => /Quận 7/.test(f.name));
  const td = facilities.find((f) => /Thủ Đức/.test(f.name));
  const ctxFor = (u: any, ids: bigint[]) => ({ userId: u.id, facilitiesFor: () => ids, ip: '127.0.0.1', userAgent: 'test' }) as any;
  const fm = await user('fm.q7@vaultra.test');
  return { edge, svc, calls, user, q7, td, fm, ctx: ctxFor(fm, [q7.id]), ctxFor };
}

test('a new permission is added to existing databases and granted to the manager role only', { skip: !have }, async () => {
  const { edge } = await world();
  const perm = (await edge.permission.findMany({ where: { code: 'facility_account.manage' } }))[0];
  assert.ok(perm, 'permission row exists after the sync');
  const grants = await edge.rolePermission.findMany({ where: { permission_id: perm.id } });
  const roles = await edge.role.findMany({});
  assert.deepEqual(grants.map((g: any) => roles.find((r: any) => r.id === g.role_id).code), ['FACILITY_MANAGER']);
  assert.equal(grants[0].scope, 'FACILITY');
  assert.equal(edge.repairIntegrity() && false, false);
  assert.equal((await edge.rolePermission.findMany({ where: { permission_id: perm.id } })).length, 1, 'second run adds nothing');
});

test('the manager sees staff and customers of their own facility, never others, never privileged accounts', { skip: !have }, async () => {
  const { svc, ctx, q7, td, edge } = await world();
  const staff = await svc.list(ctx, { group: 'staff' }, 100, 0);
  const emails = staff.rows.map((r: any) => r.email);
  assert.ok(emails.includes('staff.q7@vaultra.test'));
  assert.ok(!emails.includes('staff.td@vaultra.test'), 'staff of another facility stay hidden');
  for (const r of staff.rows) {
    assert.equal(r.kind, 'STAFF');
    assert.ok(!('password_hash' in r) && !('token_version' in r) && !('mfa_secret_enc' in r), 'no secrets in the view');
    assert.ok(r.roles.every((x: any) => x.role === 'FACILITY_STAFF'));
  }
  const all = await svc.list(ctx, { group: 'all', q: '@vaultra.test' }, 100, 0);
  for (const r of all.rows) assert.ok(!/^(admin|bom|fm\.)/.test(r.email), `${r.email} is privileged and must not be listed`);
  const cust = await svc.list(ctx, { group: 'customers' }, 100, 0);
  assert.ok(cust.rows.length > 0, 'the demo data has customers at Quận 7');
  for (const r of cust.rows) {
    const c = (await edge.customer.findMany({ where: { email: r.email } }))[0] ?? (await edge.customer.findMany({ where: { user_id: (await edge.user.findMany({ where: { email: r.email } }))[0].id } }))[0];
    const here = (await edge.reservation.findMany({ where: { customer_id: c.id, facility_id: q7.id } })).length + (await edge.contract.findMany({ where: { customer_id: c.id, facility_id: q7.id } })).length;
    assert.ok(here > 0, `${r.email} must have a reservation or contract at Quận 7`);
  }
  assert.ok(td);
});

test('accounts out of reach answer 404 or 403', { skip: !have }, async () => {
  const { svc, ctx, user } = await world();
  for (const e of ['staff.td@vaultra.test', 'fm.td@vaultra.test', 'bom@vaultra.test', 'admin@vaultra.test']) {
    const u = await user(e);
    await rejects(svc.get(ctx, u.public_id), 404);
    await rejects(svc.setStatus(ctx, u.public_id, 'LOCKED', 'thử'), 404);
    await rejects(svc.resetPassword(ctx, u.public_id), 404);
  }
  // not even yourself
  const me = await user('fm.q7@vaultra.test');
  await rejects(svc.setStatus(ctx, me.public_id, 'LOCKED', 'thử'), 403);
  const found = await svc.lookup(ctx, 'bom@vaultra.test');
  assert.equal(found.found, false, 'a privileged account looks like a missing one');
  assert.equal((await svc.lookup(ctx, 'khong.co@example.com')).found, false);
});

test('staff can be locked, disabled and re-enabled; customers only locked and unlocked', { skip: !have }, async () => {
  const { svc, ctx, user, calls } = await world();
  const staff = await user('staff.q7@vaultra.test');
  await svc.setStatus(ctx, staff.public_id, 'LOCKED', 'kiểm tra');
  assert.equal((await svc.get(ctx, staff.public_id)).status, 'LOCKED');
  await svc.setStatus(ctx, staff.public_id, 'ACTIVE', 'xong');
  await svc.setStatus(ctx, staff.public_id, 'DISABLED', 'nghỉ việc');
  assert.equal((await svc.get(ctx, staff.public_id)).status, 'DISABLED');
  await svc.setStatus(ctx, staff.public_id, 'ACTIVE', 'quay lại');
  assert.ok(calls.includes('revoke-sessions') && calls.includes('audit:user.locked') && calls.includes('audit:user.disabled'));

  const cust = (await svc.list(ctx, { group: 'customers' }, 100, 0)).rows[0];
  await svc.setStatus(ctx, cust.id, 'LOCKED', 'nghi vấn');
  await rejects(svc.setStatus(ctx, cust.id, 'DISABLED', 'thử'), 403);
  await svc.setStatus(ctx, cust.id, 'ACTIVE', 'ổn');
  await svc.resetPassword(ctx, cust.id);
  assert.ok(calls.includes('forgot'));
});

test('a staff member who also works at another facility is read-only for this manager', { skip: !have }, async () => {
  const { svc, ctx, user, edge, td } = await world();
  const staff = await user('staff.q7@vaultra.test');
  const role = (await edge.role.findMany({ where: { code: 'FACILITY_STAFF' } }))[0];
  await edge.userRole.create({ data: { user_id: staff.id, role_id: role.id, facility_id: td.id, assigned_by: staff.id } });
  const row = (await svc.list(ctx, { group: 'staff' }, 100, 0)).rows.find((r: any) => r.email === staff.email);
  assert.equal(row.manageable, false);
  await rejects(svc.setStatus(ctx, staff.public_id, 'LOCKED', 'thử'), 403);
});

test('granting and withdrawing the staff role stays inside the manager facility and the staff role', { skip: !have }, async () => {
  const { svc, ctx, user, edge, q7, td, calls } = await world();
  const cust = (await svc.list(ctx, { group: 'customers' }, 100, 0)).rows[0];
  // cannot reach another facility
  await rejects(svc.grantStaff(ctx, cust.id, { facilityId: td.public_id, reason: 'thử' }), 403);
  // cannot grant to managers, BOM, admin or yourself
  for (const e of ['fm.td@vaultra.test', 'bom@vaultra.test', 'admin@vaultra.test']) await rejects(svc.grantStaff(ctx, (await user(e)).public_id, { facilityId: q7.public_id, reason: 'thử' }), 404);
  await rejects(svc.grantStaff(ctx, (await user('fm.q7@vaultra.test')).public_id, { facilityId: q7.public_id, reason: 'thử' }), 403);
  // a customer account becomes staff of Quận 7
  const after: any = await svc.grantStaff(ctx, cust.id, { facilityId: q7.public_id, reason: 'tuyển mới' });
  assert.ok(after.roles.some((r: any) => r.role === 'FACILITY_STAFF' && r.facility.id === q7.public_id));
  assert.ok(calls.includes('mail') && calls.includes('audit:user.role_assign'));
  await rejects(svc.grantStaff(ctx, cust.id, { facilityId: q7.public_id, reason: 'lại' }), 409);
  // the only role that can be withdrawn is the staff role of a managed facility
  const assign = after.roles.find((r: any) => r.role === 'FACILITY_STAFF');
  const other = (await edge.userRole.findMany({ where: { revoked_at: null } })).find((r: any) => r.facility_id === td.id);
  await rejects(svc.revokeStaff(ctx, cust.id, other.id.toString(), 'thử'), 404);
  const gone: any = await svc.revokeStaff(ctx, cust.id, assign.id, 'nghỉ việc');
  assert.ok(!gone.roles?.some((r: any) => r.role === 'FACILITY_STAFF'));
  // a manager's own assignment is never revocable through here
  const fm2 = await user('fm.q7@vaultra.test');
  const fmRole = (await edge.userRole.findMany({ where: { user_id: fm2.id, revoked_at: null } }))[0];
  await rejects(svc.revokeStaff(ctx, fm2.public_id, fmRole.id.toString(), 'thử'), 403);
});

test('inviting staff creates a pending account with only the staff role at an owned facility', { skip: !have }, async () => {
  const { svc, ctx, q7, td, edge, calls } = await world();
  await rejects(svc.inviteStaff(ctx, { email: 'moi.td@example.com', fullName: 'Người Mới', facilityId: td.public_id }), 403);
  await rejects(svc.inviteStaff(ctx, { email: 'staff.q7@vaultra.test', fullName: 'Trùng Email', facilityId: q7.public_id }), 409);
  await svc.inviteStaff(ctx, { email: 'Moi.Q7@Example.com', fullName: 'Người Mới', phone: '0900000099', facilityId: q7.public_id });
  const u = (await edge.user.findMany({ where: { email: 'moi.q7@example.com' } }))[0];
  assert.equal(u.status, 'INVITED');
  const roles = await edge.userRole.findMany({ where: { user_id: u.id, revoked_at: null } });
  assert.equal(roles.length, 1);
  assert.equal(roles[0].facility_id, q7.id);
  assert.equal((await edge.role.findMany({ where: { id: roles[0].role_id } }))[0].code, 'FACILITY_STAFF');
  assert.ok(calls.includes('mail') && calls.includes('audit:user.create'));
  assert.equal((await svc.lookup(ctx, 'moi.q7@example.com')).found, true);
});
