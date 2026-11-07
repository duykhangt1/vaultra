import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Grant, RoleCode } from '@vaultra/shared';
import { normalizeProvince } from '../../src/common/util';
import { AccessContext } from '../../src/auth/access-context';
import { ContextService } from '../../src/auth/context.service';
import { AllExceptionsFilter } from '../../src/common/errors';
import { PaymentService } from '../../src/billing/payment.service';

test('normalizeProvince canonicalizes HCMC, Hanoi, Da Nang variants and preserves custom provinces', () => {
  assert.deepEqual(normalizeProvince('TP. Hồ Chí Minh', 'tp-ho-chi-minh'), {
    province: 'TP. Hồ Chí Minh',
    provinceSlug: 'ho-chi-minh',
  });
  assert.deepEqual(normalizeProvince('Hồ Chí Minh', 'ho-chi-minh'), {
    province: 'TP. Hồ Chí Minh',
    provinceSlug: 'ho-chi-minh',
  });
  assert.deepEqual(normalizeProvince('Thành phố Hồ Chí Minh'), {
    province: 'TP. Hồ Chí Minh',
    provinceSlug: 'ho-chi-minh',
  });
  assert.deepEqual(normalizeProvince('TP. Hà Nội', 'tp-ha-noi'), {
    province: 'Hà Nội',
    provinceSlug: 'ha-noi',
  });
  assert.deepEqual(normalizeProvince('TP. Đà Nẵng'), {
    province: 'Đà Nẵng',
    provinceSlug: 'da-nang',
  });
  assert.deepEqual(normalizeProvince('Bình Dương'), {
    province: 'Bình Dương',
    provinceSlug: 'binh-duong',
  });
  assert.deepEqual(normalizeProvince(''), {
    province: '',
    provinceSlug: 'khac',
  });
});

test('ContextService and AccessContext enforce custom permissions and dynamic role reallocations', async () => {
  const mockPrisma: any = {
    role: {
      findMany: async () => [
        { id: 1, code: 'CUSTOMER' },
        { id: 2, code: 'FACILITY_STAFF' },
        { id: 3, code: 'FACILITY_MANAGER' },
        { id: 4, code: 'BUSINESS_OPS_MANAGER' },
        { id: 5, code: 'SYSTEM_ADMIN' },
      ],
    },
    permission: {
      findMany: async () => [{ id: 100, code: 'iot.sensor.manage' }],
    },
    rolePermission: {
      findMany: async () => [
        { role_id: 2, permission_id: 100, scope: 'FACILITY', read_only: true },
        { role_id: 3, permission_id: 100, scope: 'FACILITY', read_only: false },
        { role_id: 5, permission_id: 100, scope: 'GLOBAL', read_only: false },
      ],
    },
  };

  const ctxSvc = new ContextService(mockPrisma);
  const matrix = await ctxSvc.getRolePermissions();
  const staffGrants = await ctxSvc.mergeDynamicGrants(['FACILITY_STAFF']);
  assert.deepEqual(staffGrants['iot.sensor.manage'], { scope: 'FACILITY', readOnly: true });

  const combinedGrants = await ctxSvc.mergeDynamicGrants(['FACILITY_STAFF', 'FACILITY_MANAGER']);
  assert.deepEqual(combinedGrants['iot.sensor.manage'], { scope: 'FACILITY', readOnly: undefined });

  const ctxStaff = new AccessContext(
    10n,
    '01JUSERSTAFF00000000000001',
    'staff@vaultra.test',
    'Staff User',
    true,
    null,
    [{ role: 'FACILITY_STAFF' as RoleCode, facilityId: 2n }],
    staffGrants as Record<string, Grant>,
    1n,
    '127.0.0.1',
    'unit-test',
    'req-1',
    2n,
    matrix,
  );

  assert.equal(ctxStaff.can('iot.sensor.manage', false), true);
  assert.equal(ctxStaff.can('iot.sensor.manage', true), false);
  assert.deepEqual(ctxStaff.facilitiesFor('iot.sensor.manage'), [2n]);

  const ctxManager = new AccessContext(
    11n,
    '01JUSERMGR0000000000000001',
    'fm@vaultra.test',
    'Manager User',
    true,
    null,
    [{ role: 'FACILITY_MANAGER' as RoleCode, facilityId: 2n }],
    combinedGrants as Record<string, Grant>,
    2n,
    '127.0.0.1',
    'unit-test',
    'req-2',
    2n,
    matrix,
  );
  assert.equal(ctxManager.can('iot.sensor.manage', true), true);
  assert.deepEqual(ctxManager.facilitiesFor('iot.sensor.manage'), [2n]);
});

test('AllExceptionsFilter maps r2-prisma P2002 unique violations to 409 CONFLICT instead of 500', () => {
  const filter = new AllExceptionsFilter();
  let capturedStatus = 0;
  let capturedBody: any = null;
  const host: any = {
    switchToHttp: () => ({
      getResponse: () => ({
        setHeader: () => undefined,
        status: (code: number) => {
          capturedStatus = code;
          return {
            json: (payload: any) => {
              capturedBody = payload;
            },
          };
        },
      }),
      getRequest: () => ({ requestId: 'req-promo-dup' }),
    }),
  };

  const err = Object.assign(new Error('Unique constraint failed on promotion.code'), {
    code: 'P2002',
    meta: { target: ['code'] },
  });
  filter.catch(err, host);
  assert.equal(capturedStatus, 409);
  assert.equal(capturedBody?.error?.code, 'CONFLICT');
  assert.match(capturedBody?.error?.message, /Mã này đã tồn tại/i);
});

test('PaymentService.resolvePublicApiUrl prefers HTTPS forwarded tunnel host over localhost', () => {
  const svc = new (PaymentService as any)(null, null, null, null, null, null) as PaymentService;
  const tunnelUrl = svc.resolvePublicApiUrl({
    headers: {
      'x-forwarded-proto': 'https',
      'x-forwarded-host': 'demo-vaultra.trycloudflare.com',
      host: '127.0.0.1:4000',
    },
    protocol: 'http',
  });
  assert.equal(tunnelUrl, 'https://demo-vaultra.trycloudflare.com');
});
