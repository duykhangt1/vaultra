import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../../src/common/prisma.service';
import { EdgeDecimal } from '../../src/common/prisma.service';
import { PaymentService } from '../../src/billing/payment.service';

const svc: any = Object.create(PaymentService.prototype);
svc.core = { activePolicy: async () => ({ params: { fm_refund_limit: 5_000_000 } }) };
const ctx = (scope: 'FACILITY' | 'GLOBAL' | null): any => ({ can: () => scope !== null, grant: () => (scope ? { scope } : undefined) });
const D = (n: number) => new EdgeDecimal(n);

test('a facility manager cannot release a refund above the policy limit', async () => {
  await assert.rejects(svc.assertWithinFmRefundLimit(ctx('FACILITY'), 1n, D(5_000_001)), /hạn mức/);
  await svc.assertWithinFmRefundLimit(ctx('FACILITY'), 1n, D(5_000_000));
  await svc.assertWithinFmRefundLimit(ctx('FACILITY'), 1n, D(290_000));
});
