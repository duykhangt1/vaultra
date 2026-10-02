import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canTransition,
  DEFAULT_SLA,
  METRIC_DOCS,
  metricDoc,
  ROLE_PERMISSIONS,
  ROLES,
  TICKET_TRANSITIONS,
} from '@vaultra/shared';
import { TEMPLATES } from '../../src/notifications/templates';

test('Flow 7 — Support ticket state machine and SLA policy defaults', () => {
  assert.equal(canTransition(TICKET_TRANSITIONS, 'NEW', 'ASSIGNED'), true);
  assert.equal(canTransition(TICKET_TRANSITIONS, 'ASSIGNED', 'IN_PROGRESS'), true);
  assert.equal(canTransition(TICKET_TRANSITIONS, 'IN_PROGRESS', 'WAITING_CUSTOMER'), true);
  assert.equal(canTransition(TICKET_TRANSITIONS, 'WAITING_CUSTOMER', 'IN_PROGRESS'), true);
  assert.equal(canTransition(TICKET_TRANSITIONS, 'IN_PROGRESS', 'RESOLVED'), true);
  assert.equal(canTransition(TICKET_TRANSITIONS, 'RESOLVED', 'REOPENED'), true);
  assert.equal(canTransition(TICKET_TRANSITIONS, 'REOPENED', 'IN_PROGRESS'), true);
  assert.equal(canTransition(TICKET_TRANSITIONS, 'RESOLVED', 'CLOSED'), true);
  assert.equal(canTransition(TICKET_TRANSITIONS, 'CLOSED', 'IN_PROGRESS'), false);

  assert.equal(DEFAULT_SLA.ACCESS_CODE.priority, 'HIGH');
  assert.equal(DEFAULT_SLA.ACCESS_CODE.first, 30);
});

function matchesRollingMoveoutRequiredEventsCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

const MONTHLY_MONTHLY_INSPECTION_LABELS: Record<string, string> = {
  INSPECTED: 'Inspected',
  DISPUTED: 'Disputed',
  READY_HANDOVER: 'Ready for handover',
  PENDING_REVIEW: 'Pending review',
  VERIFIED: 'Verified',
  ACTIVE: 'Active',
  OVERDUE: 'Overdue',
  OVERLOCKED: 'Overlocked',
  SETTLED: 'Settled',
  CANCELLED: 'Cancelled',
};

test('Flow 7 — RBAC permission matrix enforces least-privilege separation across 5 roles', () => {
  assert.equal(ROLES.length, 5);
  // Customer only has OWN scope on contracts/invoices
  assert.equal(ROLE_PERMISSIONS.CUSTOMER['contract.read']?.scope, 'OWN');
  assert.equal(ROLE_PERMISSIONS.CUSTOMER['policy.manage'], undefined);
  // BOM has GLOBAL scope on policy and pricing management
  assert.equal(ROLE_PERMISSIONS.BUSINESS_OPS_MANAGER['policy.manage']?.scope, 'GLOBAL');
  assert.equal(ROLE_PERMISSIONS.BUSINESS_OPS_MANAGER['pricing.manage']?.scope, 'GLOBAL');
  // System Admin has GLOBAL scope on user/IAM management
  assert.equal(ROLE_PERMISSIONS.SYSTEM_ADMIN['user.manage']?.scope, 'GLOBAL');
  assert.equal(ROLE_PERMISSIONS.SYSTEM_ADMIN['role.assign']?.scope, 'GLOBAL');
});
