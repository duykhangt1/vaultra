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

test('Flow 2 — capEmailAttachments prioritizes PDF, ICS, and QR attachments before large photo buffers', () => {
  const pdfAtt = { filename: 'Hop-dong-CT-2026-0001.pdf', content: Buffer.alloc(100_000, 1), contentType: 'application/pdf' };
  const icsAtt = { filename: 'Lich-hen.ics', content: Buffer.alloc(2_000, 2), contentType: 'text/calendar' };
  const qrAtt = { filename: 'QR-RSV-2026-0001.png', content: Buffer.alloc(15_000, 3), contentType: 'image/png', cid: 'vaultra-qr' };
  const photo1 = { filename: 'Anh-ban-giao-1.jpg', content: Buffer.alloc(400_000, 4), contentType: 'image/jpeg' };
  const photo2 = { filename: 'Anh-ban-giao-2.jpg', content: Buffer.alloc(800_000, 5), contentType: 'image/jpeg' };

  // Cap at 600 KB: should keep PDF + ICS + QR + photo1 (517 KB total) and drop photo2
  const capped = capEmailAttachments([photo1, photo2, pdfAtt, icsAtt, qrAtt], 600_000);
  assert.deepEqual(
    capped.map((a) => a.filename),
    ['Hop-dong-CT-2026-0001.pdf', 'Lich-hen.ics', 'QR-RSV-2026-0001.png', 'Anh-ban-giao-1.jpg'],
  );
});

test('Flow 2 — renderEmailHtml and renderEmailText produce full enterprise layout with tables, callouts, and attachments', () => {
  const model = {
    event: 'handover.completed',
    categoryBadge: 'HỢP ĐỒNG THUÊ KHO',
    referenceCode: 'CT-2026-000088',
    userFullName: 'Trần Minh Quân',
    title: 'Bàn giao kho A-105 & kích hoạt hợp đồng CT-2026-000088',
    leadParagraphs: ['Xin chào Trần Minh Quân, biên bản bàn giao kho A-105 đã được hoàn tất.'],
    securityNotice: WEB_ONLY_PIN_NOTICE,
    callouts: [{ tone: 'brass' as const, title: 'Hướng dẫn ra vào kho', body: 'Sử dụng mã PIN trên cổng web.' }],
    kvTitle: 'Thông tin hợp đồng & kho',
    kvRows: [
      ['Mã hợp đồng', 'CT-2026-000088'],
      ['Mã ô kho', 'A-105 (Tầng 1)'],
      ['Tiền cọc đảm bảo', moneyVnd(2_000_000)],
    ] as [string, string][],
    tables: [
      {
        heading: 'Biên bản kiểm tra hiện trạng kho (Move-In)',
        headers: ['Hạng mục', 'Tình trạng', 'Ghi chú'],
        rows: [
          ['Cửa cuốn & chốt khóa', 'Tốt', 'Hoạt động trơn tru'],
          ['Sàn & vách kho', 'Tốt', 'Đã vệ sinh sạch sẽ'],
        ],
      },
    ],
    photoPreviews: [{ cid: 'photo-1', filename: 'Bien-ban-ban-giao-1.jpg', caption: 'Hiện trạng kho lúc nhận' }],
    attachments: [
      { filename: 'Hop-dong-CT-2026-000088.pdf', content: Buffer.alloc(45_000), contentType: 'application/pdf' },
      { filename: 'Bien-ban-ban-giao-1.jpg', content: Buffer.alloc(120_000), contentType: 'image/jpeg', cid: 'photo-1' },
    ],
    cta: { url: 'https://vaultra.vn/app/contracts/01JCONTRACT', label: 'Xem hợp đồng trên Cổng khách hàng' },
    facilityFooter: facilityFooterOf({
      name: 'Vaultra Quận 7',
      address_line: '88 Nguyễn Thị Thập',
      ward: 'Phường Bình Thuận',
      district: 'Quận 7',
      province: 'TP. Hồ Chí Minh',
      phone: '028 3888 9999',
    }),
  };

  const html = renderEmailHtml(model);
  const text = renderEmailText(model);

  assert.match(html, /CT-2026-000088/);
  assert.match(html, /Trần Minh Quân/);
  assert.match(html, /Hop-dong-CT-2026-000088\.pdf/);
  assert.match(html, /cid:photo-1/);
  assert.match(html, /Chỉ hiển thị trên Web/);
  assert.match(text, /CT-2026-000088/);
  assert.match(text, /Hop-dong-CT-2026-000088\.pdf/);
  assert.equal(slugAscii('Biên bản bàn giao Đợt 1'), 'Bien-ban-ban-giao-Dot-1');
  assert.equal(formatBytes(1536), '2 KB');
  assert.equal(escHtml('<script>"test"</script>'), '&lt;script&gt;&quot;test&quot;&lt;/script&gt;');
});

