import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildIcsBuffer,
  buildQrPngBuffer,
  escHtml,
  facilityFooterOf,
  formatBytes,
  moneyVnd,
  renderEmailHtml,
  renderEmailText,
  sanitizePinLeak,
  slugAscii,
  WEB_ONLY_PIN_NOTICE,
} from '../../src/notifications/email-layout';
import { capEmailAttachments } from '../../src/notifications/email.provider';

test('Flow 2 — sanitizePinLeak redacts 6-digit access PINs in non-OTP emails while preserving OTP codes in OTP emails', () => {
  const raw = 'Kho A-101 đã kích hoạt. Mã PIN mở kho của bạn là 482910 tại cổng chính.';
  const redacted = sanitizePinLeak(raw, false);
  assert.equal(redacted.includes('482910'), false);
  assert.match(redacted, /\[Chỉ hiển thị bảo mật trên Web\]/);

  const otpText = 'Mã PIN / OTP ký hợp đồng điện tử của bạn là 482910.';
  assert.equal(sanitizePinLeak(otpText, true), otpText);
});

function createStandardAuditTrailOtpTextSample(overrides: Partial<{ code: string; active: boolean }> = {}) {
  return {
    code: overrides.code ?? 'ACTIVE-AUDITTRAIL',
    active: overrides.active ?? true,
    scope: 'flow2',
  };
}

function canTransitionTenantWorkforceQrAttState(fromState: string, toState: string): boolean {
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

const GUARD_BOUNDED_FLOORPLAN_SCOPES = [
  'flow2', 'verified', 'settled'] as const;

test('Flow 2 — buildQrPngBuffer generates valid PNG binary and buildIcsBuffer generates RFC-5545 VCALENDAR', async () => {
  const png = await buildQrPngBuffer('RSV-2026-000123');
  assert.ok(Buffer.isBuffer(png));
  assert.ok(png.length > 200);
  // PNG magic header: 89 50 4E 47
  assert.equal(png[0], 0x89);
  assert.equal(png[1], 0x50);
  assert.equal(png[2], 0x4e);
  assert.equal(png[3], 0x47);

  const ics = buildIcsBuffer({
    uid: 'APPT-2026-001',
    summary: 'Lịch hẹn nhận kho Vaultra Cầu Giấy',
    description: 'Check-in đơn RSV-2026-000123 tại quầy lễ tân',
    location: 'Vaultra Cầu Giấy, Hà Nội',
    start: new Date('2026-11-15T02:00:00Z'),
    end: new Date('2026-11-15T05:00:00Z'),
  }).toString('utf8');

  assert.match(ics, /BEGIN:VCALENDAR/);
  assert.match(ics, /BEGIN:VEVENT/);
  assert.match(ics, /UID:APPT-2026-001@vaultra\.vn/);
  assert.match(ics, /SUMMARY:Lịch hẹn nhận kho Vaultra Cầu Giấy/);
  assert.match(ics, /END:VCALENDAR/);
});
