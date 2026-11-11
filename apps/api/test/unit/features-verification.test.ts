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

test('Reservation notification templates include EMAIL delivery and QR code instructions', () => {
  for (const key of ['reservation.pending_payment', 'reservation.confirmed', 'appointment.booked']) {
    const tpl = TEMPLATES[key];
    assert.ok(tpl, `Template ${key} exists`);
    assert.equal(tpl.email, true, `Template ${key} sends email`);
    assert.ok(tpl.body.includes('{{code}}') || tpl.subject.includes('{{code}}'), `Template ${key} includes reservation code`);
    assert.ok(tpl.body.toLowerCase().includes('qr') || tpl.subject.toLowerCase().includes('qr'), `Template ${key} mentions QR code`);
  }
});

test('CheckinService.lookup extracts RSV code from QR payload URL or raw text and CheckinService.verifyIdentity attaches CCCD photos', async () => {
  const attached: { photoIds: string[]; relatedType: string; relatedId: bigint }[] = [];
  const mockReservation = {
    id: BigInt(10),
    public_id: '01JTESTRESERVATION00000001',
    code: 'RSV-2026-000123',
    facility_id: BigInt(1),
    customer_id: BigInt(5),
    unit_type_id: BigInt(2),
    quote_id: BigInt(3),
    contract_id: null,
    status: 'UNIT_ASSIGNED',
    channel: 'ONLINE',
    billing_mode: 'MONTHLY',
    term_months: 3,
    start_date: new Date(),
    customer: { id: BigInt(5), user_id: null, full_name: 'Nguyễn Văn A' },
    facility: { public_id: '01JFACILITY000000000000001', name: 'Vaultra HN', timezone: 'Asia/Ho_Chi_Minh' },
    unit_type: { id: BigInt(2), name: 'Kho M', inspection_checklist: null, climate_controlled: false },
    allocations: [{ status: 'ACTIVE', unit_id: BigInt(99), unit: { id: BigInt(99), public_id: '01JUNIT0000000000000000099', code: 'A-101', status: 'RESERVED' } }],
    appointments: [],
    quote: {
      id: BigInt(3),
      policy_version_id: BigInt(1),
      admin_fee: 0,
      discount_total: 0,
      due_now_total: 1000000,
      deposit_amount: 500000,
      snapshot: {},
    },
  };

  const mockPrisma: any = {
    reservation: {
      findFirst: async ({ where }: any) => {
        if (where?.OR?.some((cond: any) => cond.code === 'RSV-2026-000123')) return mockReservation;
        return null;
      },
      findUniqueOrThrow: async () => mockReservation,
    },
    unitAllocation: {
      findFirst: async () => ({ unit: mockReservation.allocations[0].unit }),
    },
    invoice: {
      findMany: async () => [],
    },
    appointment: {
      findFirst: async () => null,
    },
    unit: {
      findMany: async () => [],
    },
    unitType: {
      findMany: async () => [],
    },
    checkinSession: {
      findMany: async () => [],
      findFirst: async () => null,
      findUnique: async () => ({
        id: BigInt(77),
        public_id: '01JSESSION0000000000000077',
        status: 'IN_PROGRESS',
        facility_id: BigInt(1),
        reservation_id: BigInt(10),
        customer_id: BigInt(5),
        unit_id: BigInt(99),
        inspection_id: null,
        reservation: mockReservation,
        unit: mockReservation.allocations[0].unit,
      }),
      update: async () => ({}),
    },
    identityVerification: {
      create: async (args: any) => ({ id: BigInt(501), public_id: '01JIDV00000000000000000501', ...args.data }),
      findFirst: async () => ({
        id: BigInt(501),
        public_id: '01JIDV00000000000000000501',
        document_type: 'CCCD',
        document_last4: '6789',
        name_matched: true,
        verified_name: 'Nguyễn Văn A',
      }),
    },
    customer: {
      findUnique: async () => ({ id: BigInt(5), full_name: 'Nguyễn Văn A', address_line: 'Hà Nội' }),
      update: async () => ({}),
    },
    contract: {
      findFirst: async () => null,
      findUnique: async () => null,
    },
    tx: async (fn: any) => fn(mockPrisma),
  };

  const mockMedia: any = {
    attach: async (_tx: any, _ctx: any, photoIds: string[], relatedType: string, relatedId: bigint) => {
      attached.push({ photoIds, relatedType, relatedId });
    },
    listFor: async (relatedType: string, ids: bigint[]) => {
      if (relatedType === 'identity_verification' && ids.includes(BigInt(501))) {
        return [{ public_id: '01JPHOTOCCCD00000000000001', url: 'https://api.test/v1/media/blob/cccd.jpg', mime_type: 'image/jpeg', caption: 'CCCD mặt trước', taken_at: new Date(), created_at: new Date() }];
      }
      return [];
    },
  };

  const mockCore: any = {
    policyById: async () => ({
      move_in_window_days: 7,
      min_handover_photos: 4,
      deposit_type: 'FIXED',
      deposit_value: 500000,
      vat_rate: 10,
      prices_include_vat: true,
    }),
    today: () => new Date(),
  };
  const mockAudit: any = { log: async () => ({}) };
  const ctx: any = {
    userId: BigInt(2),
    require: () => ({ scope: 'GLOBAL' }),
    grant: () => ({ scope: 'GLOBAL' }),
    facilitiesFor: () => [BigInt(1)],
    assertScope: () => undefined,
    hasRole: () => true,
  };

  const mockReservations: any = {
    suggestions: async () => [],
  };
  const svc = new CheckinService(mockPrisma, mockCore, mockReservations, {} as any, {} as any, mockMedia, {} as any, {} as any, mockAudit, {} as any);

  const resFromQrUrl = await svc.lookup(ctx, 'https://vaultra.pages.dev/staff/scan?code=rsv-2026-000123');
  assert.equal(resFromQrUrl.reservation.code, 'RSV-2026-000123');

  await svc.verifyIdentity(ctx, '01JSESSION0000000000000077', {
    documentType: 'CCCD',
    last4: '6789',
    nameMatched: true,
    photoIds: ['01JPHOTOCCCD00000000000001'],
  });

  assert.equal(attached.length, 1);
  assert.equal(attached[0].relatedType, 'identity_verification');
  assert.deepEqual(attached[0].photoIds, ['01JPHOTOCCCD00000000000001']);

  const st = await svc.state(ctx, '01JSESSION0000000000000077');
  assert.equal(st.identityVerification?.photos?.length, 1);
  assert.equal(st.identityVerification?.photos[0].id, '01JPHOTOCCCD00000000000001');
});

test('ContractService.inspections returns MOVE_IN identity_verification photos even before unit inspection is recorded', async () => {
  const mockPrisma: any = {
    contract: {
      findUnique: async () => ({
        id: BigInt(300),
        public_id: '01JCONTRACT000000000000300',
        facility_id: BigInt(1),
        customer_id: BigInt(5),
        reservation_id: BigInt(10),
      }),
    },
    checkinSession: {
      findMany: async () => [{ id: BigInt(77) }],
    },
    identityVerification: {
      findMany: async () => [{
        id: BigInt(501),
        public_id: '01JIDV00000000000000000501',
        checkin_session_id: BigInt(77),
        document_type: 'CCCD',
        document_last4: '6789',
        verified_name: 'Nguyễn Văn A',
        verified_at: new Date(),
      }],
    },
    inspection: {
      findMany: async () => [],
    },
  };
  const mockMedia: any = {
    listFor: async (relatedType: string) => {
      if (relatedType === 'identity_verification') {
        return [{ public_id: '01JPHOTOCCCD00000000000001', url: 'https://api.test/v1/media/blob/cccd.jpg', mime_type: 'image/jpeg', caption: 'CCCD', taken_at: new Date(), created_at: new Date() }];
      }
      return [];
    },
  };
  const ctx: any = { assertScope: () => undefined };
  const contractSvc = new ContractService(mockPrisma, {} as any, {} as any, mockMedia, {} as any, {} as any);
  const insps = await contractSvc.inspections(ctx, '01JCONTRACT000000000000300');
  assert.equal(insps.length, 1);
  assert.equal(insps[0].type, 'MOVE_IN');
  assert.equal(insps[0].identity_verification?.photos?.length, 1);
  assert.equal(insps[0].identity_verification?.photos[0].id, '01JPHOTOCCCD00000000000001');
});

test('ID photos never leak from one order of a customer to another', async () => {
  // customer 5 has an old, already handed-over order (session 76 -> idv 400 with a photo) and a NEW order (session 77, no check-in yet)
  const allIdvs = [{ id: BigInt(400), checkin_session_id: BigInt(76), customer_id: BigInt(5), document_type: 'CCCD', document_last4: '1111', verified_at: new Date() }];
  const matches = (where: any, v: any): boolean => {
    if (where.OR) return where.OR.some((w: any) => matches(w, v));
    if (where.checkin_session_id?.in) return where.checkin_session_id.in.includes(v.checkin_session_id);
    if (where.customer_id !== undefined) return where.customer_id === v.customer_id;
    return true;
  };
  const mockPrisma: any = {
    contract: { findUnique: async () => ({ id: BigInt(301), public_id: '01JCONTRACT000000000000301', facility_id: BigInt(1), customer_id: BigInt(5), reservation_id: BigInt(11) }) },
    checkinSession: { findMany: async () => [{ id: BigInt(77), inspection_id: null }] }, // the new order only has an empty session
    identityVerification: { findMany: async (args: any) => allIdvs.filter((v) => matches(args.where, v)) },
    inspection: { findMany: async () => [] },
  };
  const mockMedia: any = {
    listFor: async (relatedType: string, ids: bigint[]) =>
      relatedType === 'identity_verification' && ids.includes(BigInt(400)) ? [{ public_id: '01JOLDORDERPHOTO00000000001', url: 'u', mime_type: 'image/jpeg', created_at: new Date() }] : [],
  };
  const checkin = new CheckinService(mockPrisma, {} as any, {} as any, {} as any, {} as any, mockMedia, {} as any, {} as any, {} as any, {} as any);
  const media = await checkin.checkinMediaForReservation(BigInt(11), BigInt(5));
  assert.equal(media.identityVerification, null, 'new order must not show the previous order\'s ID photo');

  const contractSvc = new ContractService(mockPrisma, {} as any, {} as any, mockMedia, {} as any, {} as any);
  const insps = await contractSvc.inspections({ assertScope: () => undefined } as any, '01JCONTRACT000000000000301');
  assert.equal(insps.length, 0, 'no inspection and no foreign ID verification for the new contract');
});
