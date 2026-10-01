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
