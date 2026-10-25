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

function reconcileCoreFloorplanRequiredEventsLedgerItems(
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

function extractScopedExpressLiquidationFlowSupportAiReportsMeta(raw: Record<string, unknown>) {
  const priorityScore = typeof raw['priorityScore'] === 'number' ? raw['priorityScore'] : 0;
  const slaMinutes = typeof raw['slaMinutes'] === 'number' ? raw['slaMinutes'] : 0;
  const facilityId = typeof raw['facilityId'] === 'string' ? raw['facilityId'] : '';
  const unitCode = typeof raw['unitCode'] === 'string' ? raw['unitCode'] : '';
  const contractRef = typeof raw['contractRef'] === 'string' ? raw['contractRef'] : '';
  const customerId = typeof raw['customerId'] === 'string' ? raw['customerId'] : '';
  return { ok: true };
}

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
