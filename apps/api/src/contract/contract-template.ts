import type { PolicyParams } from '@vaultra/shared';
import type { PdfOptions, PdfSection } from '../media/pdf.service';

/** Data printed in the signature block of a signed contract. */
export interface ContractSig {
  signedAt: Date;
  image?: Buffer;
  strokes?: { a: number; s: number[][] } | null;
  methodLabel: string;
  docHash: string;
}

export interface ContractView {
  brand: string;
  code: string;
  templateVersion: string;
  province: string;
  facility: { name: string; address: string; phone?: string | null };
  customer: { name: string; code: string; email?: string | null; phone?: string | null; address?: string | null };
  unit: { code: string; type: string; size: string; area: number | string; zone: string; floor: number | string };
  startDate: string; // dd/MM/yyyy
  endDate: string; // dd/MM/yyyy (inclusive)
  months: number;
  monthlyRent: string; // already formatted
  billingMode: 'MONTHLY' | 'PREPAID_TERM';
  billingDay: number;
  deposit: string;
  adminFee: string;
  promotion?: string | null;
  policy: PolicyParams;
  money: (v: number) => string;
  issued: { day: string; at: string };
  today: string;
  signature?: { at: string; method: string; image?: Buffer; strokes?: { a: number; s: number[][] } | null };
}

/** Formal Vietnamese lease contract (Bộ luật Dân sự 2015, Luật Giao dịch điện tử 2023). */
export function buildContract(v: ContractView): { title: string; subtitle: string; sections: PdfSection[]; opts: PdfOptions } {
  const p = v.policy;
  const money = v.money;
  const sections: PdfSection[] = [
    {
      parties: {
        left: {
          title: 'Bên A — Bên cho thuê',
          rows: [['Đơn vị', `${v.brand} — ${v.facility.name}`], ['Địa chỉ kho', v.facility.address], ['Điện thoại', v.facility.phone || '—'], ['Đại diện', 'Quản lý cơ sở'], ['Hotline', '1900 6868']],
        },
        right: {
          title: 'Bên B — Bên thuê',
          rows: [['Họ và tên', v.customer.name], ['Mã khách hàng', v.customer.code], ['Email', v.customer.email || '—'], ['Điện thoại', v.customer.phone || '—'], ['Địa chỉ', v.customer.address || '—']],
        },
      },
    },
    { paragraphs: ['Hai bên cùng thống nhất ký kết Hợp đồng thuê kho tự phục vụ (“Hợp đồng”) với các điều khoản sau:'] },
    {
      heading: 'Điều 1. Đối tượng và thời hạn thuê',
      table: {
        headers: ['Hạng mục', 'Nội dung'],
        widths: [34, 66],
        rows: [
          ['Mã kho', v.unit.code],
          ['Loại kho / kích thước', `${v.unit.type} — ${v.unit.size} (${v.unit.area} m²)`],
          ['Vị trí', `${v.unit.zone}, tầng ${v.unit.floor}`],
          ['Ngày bắt đầu', v.startDate],
          ['Ngày kết thúc kỳ hiện hành', `${v.endDate} (${v.months} tháng)`],
        ],
      },
      paragraphs: ['Bên A giao cho Bên B quyền sử dụng riêng kho nêu trên để lưu giữ tài sản hợp pháp của Bên B trong thời hạn thuê. Bên B không được cho thuê lại hoặc chuyển nhượng quyền sử dụng kho nếu chưa có sự đồng ý bằng văn bản của Bên A.'],
    },
    {
      heading: 'Điều 2. Giá thuê, tiền cọc và thanh toán',
      table: {
        headers: ['Khoản', 'Số tiền', 'Ghi chú'],
        widths: [30, 28, 42],
        rows: [
          ['Giá thuê', `${v.monthlyRent} / tháng`, v.billingMode === 'MONTHLY' ? `Thu hằng tháng vào ngày ${v.billingDay}` : 'Trả trước toàn kỳ'],
          ['Tiền cọc', v.deposit, `Hoàn trong ${p.deposit_refund_days} ngày sau khi trả kho`],
          ['Phí quản trị', v.adminFee, 'Thu một lần khi ký hợp đồng'],
          ['Khuyến mãi', v.promotion || 'Không áp dụng', ''],
          ['Thuế GTGT', `${p.vat_rate}%`, p.prices_include_vat ? 'Đã bao gồm trong giá thuê' : 'Cộng thêm vào hóa đơn'],
        ],
      },
      paragraphs: [`Hóa đơn điện tử được phát hành trước kỳ thu ${p.invoice_lead_days} ngày. Bên B thanh toán qua cổng thanh toán trực tuyến hoặc tại quầy của Bên A. Giá của kỳ mới do hai bên thỏa thuận theo Điều 7.`],
    },
    {
      heading: 'Điều 3. Quyền và nghĩa vụ của Bên A',
      paragraphs: [
        '3.1. Bàn giao kho đúng hiện trạng đã lập biên bản, cấp mã truy cập cho Bên B và bảo đảm an ninh chung của cơ sở (camera, bảo vệ, kiểm soát ra vào).',
        `3.2. Thông báo cho Bên B trước ${p.entry_notice_hours} giờ khi cần vào khu vực kho vì lý do bảo trì; chỉ mở kho khi khẩn cấp (cháy, ngập, nguy hiểm) hoặc theo yêu cầu của cơ quan có thẩm quyền.`,
        '3.3. Thu tiền thuê và các khoản phí theo Hợp đồng; áp dụng biện pháp tạm khóa truy cập và xử lý theo Điều 5 khi Bên B vi phạm nghĩa vụ thanh toán.',
      ],
    },
    {
      heading: 'Điều 4. Quyền và nghĩa vụ của Bên B',
      paragraphs: [
        '4.1. Thanh toán đầy đủ, đúng hạn; sử dụng kho đúng mục đích; giữ gìn kho và tài sản chung của cơ sở.',
        '4.2. Tự bảo quản tài sản và khóa riêng của mình; bảo mật mã truy cập, không chia sẻ cho người ngoài danh sách ủy quyền.',
        '4.3. Không cất giữ chất cháy nổ, hóa chất độc hại, hàng cấm, thực phẩm dễ hỏng, động vật sống hoặc tài sản không rõ nguồn gốc hợp pháp.',
        '4.4. Bồi thường thiệt hại do lỗi của mình gây ra cho kho và cơ sở vật chất theo biên bản kiểm tra có hình ảnh bằng chứng.',
      ],
    },
    {
      heading: 'Điều 5. Thanh toán chậm, tạm khóa truy cập và chấm dứt do vi phạm',
      paragraphs: [
        `Hạn thanh toán có ân hạn ${p.grace_days} ngày. Từ ngày quá hạn thứ ${p.grace_days + 1} áp dụng phí trễ hạn theo biểu phí. Ngày thứ ${p.lockout_day} truy cập kho bị tạm khóa và Bên A gắn khóa chặn (phí mở khóa ${money(p.overlock_fee)}). Ngày thứ ${p.final_notice_day} Bên A gửi thông báo cuối cùng. Từ ngày thứ ${p.default_day}, Hợp đồng có thể bị chấm dứt do vi phạm sau khi được phê duyệt; tài sản trong kho được kiểm kê có hai người làm chứng và lưu giữ ${p.abandoned_goods_hold_days} ngày trước khi xử lý theo quy định pháp luật.`,
      ],
    },
    {
      heading: 'Điều 6. Tiền cọc và quyết toán',
      paragraphs: [`Tiền cọc được hoàn trong ${p.deposit_refund_days} ngày sau khi Bên B trả kho, sau khi trừ công nợ và các khoản phí hư hại, vệ sinh có bằng chứng. Bên B có ${p.dispute_days} ngày kể từ khi nhận bảng quyết toán để khiếu nại.`],
    },
    {
      heading: 'Điều 7. Gia hạn',
      paragraphs: [`Cửa sổ gia hạn mở trước ${p.renewal_window_days} ngày khi hết hạn. Giá kỳ mới theo giá niêm yết hiện hành, tăng không quá ${p.renewal_max_increase_pct}% và được báo trước ${p.price_change_notice_days} ngày. Khi hết hạn mà không gia hạn: ${p.on_expiry_action === 'HOLDOVER_MONTHLY' ? 'Hợp đồng chuyển sang thuê cuốn chiếu theo tháng theo giá niêm yết' : 'Bên B phải trả kho'}.`],
    },
    {
      heading: 'Điều 8. Trả kho và chấm dứt trước hạn',
      paragraphs: [`Bên B báo trước ${p.move_out_notice_days} ngày khi muốn trả kho. Trả kho trước hạn: ${p.early_termination_refund === 'NONE' ? 'không hoàn tiền thuê đã trả' : 'hoàn các tháng trả trước chưa bắt đầu'}${Number(p.early_termination_fee) > 0 ? `, phí chấm dứt sớm ${money(p.early_termination_fee)}` : ''}. Khi trả kho, hai bên lập biên bản kiểm tra so sánh với hiện trạng lúc nhận.`],
    },
    {
      heading: 'Điều 9. Bảo mật và dữ liệu cá nhân',
      paragraphs: ['Mã truy cập chỉ hiển thị trong ứng dụng của Bên B, không gửi qua email. Bên A xử lý dữ liệu cá nhân của Bên B theo Nghị định 13/2023/NĐ-CP và Chính sách bảo mật đã công bố, chỉ để thực hiện Hợp đồng.'],
    },
    {
      heading: 'Điều 10. Giải quyết tranh chấp',
      paragraphs: ['Mọi tranh chấp được ưu tiên giải quyết bằng thương lượng. Nếu không thỏa thuận được trong 30 ngày, một trong hai bên có quyền khởi kiện tại Tòa án nhân dân có thẩm quyền nơi đặt kho. Hợp đồng được điều chỉnh bởi pháp luật Việt Nam.'],
    },
    {
      heading: 'Điều 11. Hiệu lực và chữ ký điện tử',
      paragraphs: [
        'Hợp đồng có hiệu lực kể từ thời điểm Bên B ký xác nhận và hai bên hoàn tất bàn giao kho. Hợp đồng được lập dưới dạng thông điệp dữ liệu; chữ ký điện tử của Bên B và dấu hệ thống của Bên A có giá trị pháp lý theo Luật Giao dịch điện tử 2023.',
        'Mã băm SHA-256 của bản hợp đồng được ghi nhận khi ký; mọi chỉnh sửa sau đó làm thay đổi mã băm và không còn giá trị.',
      ],
    },
    {
      signatures: {
        left: { title: 'Đại diện Bên A', hint: '(Dấu hệ thống)', name: `${v.brand} — ${v.facility.name}`, seal: !!v.signature, note: v.signature ? `Đóng dấu lúc ${v.signature.at}` : 'Chưa ký' },
        right: { title: 'Bên B', hint: '(Ký, ghi rõ họ tên)', name: v.customer.name, image: v.signature?.image, strokes: v.signature?.strokes ?? undefined, note: v.signature ? `${v.signature.method} · ${v.signature.at}` : 'Chờ khách hàng ký' },
      },
    },
  ];
  return {
    title: 'HỢP ĐỒNG THUÊ KHO TỰ PHỤC VỤ',
    subtitle: `Mã hợp đồng ${v.code} · mẫu ${v.templateVersion}`,
    sections,
    opts: {
      motto: true,
      docNumber: `Số: ${v.code}`,
      dateline: `${v.province}, ${v.issued.day}`,
      basis: ['Căn cứ Bộ luật Dân sự số 91/2015/QH13 và Luật Thương mại số 36/2005/QH11;', 'Căn cứ Luật Giao dịch điện tử số 20/2023/QH15;', `Căn cứ nhu cầu và khả năng của hai bên (lập ngày ${v.today}).`],
    },
  };
}
