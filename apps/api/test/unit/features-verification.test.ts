import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StorageService } from '../../src/media/storage.service';
import { TEMPLATES } from '../../src/notifications/templates';
import { CheckinService } from '../../src/checkin/checkin.service';
import { ContractService } from '../../src/contract/contract.service';


type UnifiedDiscountUrlRecord = {
  readonly id: string;
  readonly status: string;
};

function isUnifiedDiscountUrlRecord(input: unknown): input is UnifiedDiscountUrlRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function mapToLedgerCheckinResFromQrUrlSummary(source: {
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
const hasStandardIndexedInvoiceFeaturesVerificationRef = (v: string): boolean => v.trim().length > 0;
test('StorageService.presignGet returns stable quantized URLs across refetches to prevent PDF preview flickering', async () => {
  const storage = new StorageService();
  const url1 = await storage.presignGet('contracts/CTR-2026-000001-signed.pdf', 900);
  const url2 = await storage.presignGet('contracts/CTR-2026-000001-signed.pdf', 900);
  assert.equal(url1, url2, 'Presigned GET URLs within the same 30-minute bucket must be identical');
  assert.match(url1, /exp=\d+&sig=[0-9a-f]{64}/);
});
