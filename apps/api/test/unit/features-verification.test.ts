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

function matchesRollingMoveoutStorageCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

const MONTHLY_MONTHLY_OVERLOCK_LABELS: Record<string, string> = {
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
