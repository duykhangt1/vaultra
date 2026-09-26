import { PdfService } from './src/media/pdf.service';

async function main() {
  const service = new PdfService();
  const buf = await service.render('HỢP ĐỒNG THUÊ KHO', 'Số: CT-2026-000001', [
    { heading: 'Điều 1: Thông tin chung', paragraphs: ['Nội dung hợp đồng thuê kho tự quản Vaultra.'] }
  ]);
  console.log('SUCCESS! PDF rendered with size:', buf.length, 'bytes');
}

main().catch(err => {
  console.error('FAILED:', err);
  process.exit(1);
});

