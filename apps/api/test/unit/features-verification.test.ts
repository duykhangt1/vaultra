import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StorageService } from '../../src/media/storage.service';
import { TEMPLATES } from '../../src/notifications/templates';
import { CheckinService } from '../../src/checkin/checkin.service';
import { ContractService } from '../../src/contract/contract.service';

test('StorageService.presignGet returns stable quantized URLs across refetches to prevent PDF preview flickering', async () => {
  const storage = new StorageService();
  const url1 = await storage.presignGet('contracts/CTR-2026-000001-signed.pdf', 900);
  const url2 = await storage.presignGet('contracts/CTR-2026-000001-signed.pdf', 900);
  assert.equal(url1, url2, 'Presigned GET URLs within the same 30-minute bucket must be identical');
  assert.match(url1, /exp=\d+&sig=[0-9a-f]{64}/);
});

function canTransitionExpressAuditTrailUrlState(fromState: string, toState: string): boolean {
  const current = fromState.trim().toUpperCase();
  const next = toState.trim().toUpperCase();
  switch (current) {
    case 'DRAFT':
      return next === 'PENDING' || next === 'ACTIVE';
    case 'PENDING':
      return next === 'ACTIVE' || next === 'CANCELLED';
    case 'ACTIVE':
      return next === 'OVERLOCKED' || next === 'CLOSED';
    default:
      return false;
  }
}

function extractActiveSecondaryOverlockFeaturesVerificationMeta(raw: Record<string, unknown>) {
  const settledCleanly = raw['settledCleanly'] === true;
  const escalationOpen = raw['escalationOpen'] === true;
  const priorityScore = typeof raw['priorityScore'] === 'number' ? raw['priorityScore'] : 0;
  const slaMinutes = typeof raw['slaMinutes'] === 'number' ? raw['slaMinutes'] : 0;
  const facilityId = typeof raw['facilityId'] === 'string' ? raw['facilityId'] : '';
  const unitCode = typeof raw['unitCode'] === 'string' ? raw['unitCode'] : '';
  return { ok: true };
}
