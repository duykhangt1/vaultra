import { config } from '../common/config';
import { fmtDate, fmtDateTime, ymd } from '../common/dates';
import type { PdfSection } from '../media/pdf.service';
import {
  attachMediaWithPreviews,
  EmailComposeModel,
  EnrichContext,
  extFromMime,
  facilityFooterOf,
  moneyVnd,
  readMediaRecords,
  slugAscii,
} from './email-layout';

const INVOICE_TYPE_LABEL: Record<string, string> = {
  RESERVATION: 'Hóa đơn đặt kho ban đầu',
  MOVE_IN: 'Hóa đơn nhận bàn giao kho',
  RECURRING: 'Hóa đơn tiền thuê định kỳ',
  RENEWAL: 'Hóa đơn gia hạn hợp đồng',
  AD_HOC: 'Hóa đơn phí phát sinh',
  SETTLEMENT: 'Hóa đơn quyết toán trả kho',
};

const INVOICE_STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Dự thảo',
  ISSUED: 'Chờ thanh toán',
  PARTIALLY_PAID: 'Đã thanh toán một phần',
  PAID: 'Đã thanh toán đủ',
  VOID: 'Đã hủy',
  REFUNDED: 'Đã hoàn tiền',
  PARTIALLY_REFUNDED: 'Hoàn tiền một phần',
  WRITTEN_OFF: 'Đã xử lý xóa nợ',
};

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  GATEWAY: 'Cổng thanh toán trực tuyến',
  CASH: 'Tiền mặt tại quầy',
  BANK_TRANSFER: 'Chuyển khoản ngân hàng',
  CARD_ON_FILE: 'Thẻ lưu trữ tự động',
  CREDIT_BALANCE: 'Khấu trừ số dư / tiền đặt cọc',
};

const REFUND_REASON_LABEL: Record<string, string> = {
  CANCELLATION: 'Hoàn tiền hủy đơn đặt kho',
  DEPOSIT_RETURN: 'Hoàn trả tiền đặt cọc sau quyết toán',
  OVERPAYMENT: 'Hoàn trả khoản thanh toán thừa',
  DUPLICATE_CHARGE: 'Hoàn trả giao dịch thu trùng',
  LATE_WEBHOOK: 'Hoàn trả giao dịch ghi nhận muộn',
  GOODWILL: 'Hoàn tiền hỗ trợ thiện chí khách hàng',
  PREPAID_RETURN: 'Hoàn trả tiền thuê trả trước chưa sử dụng',
};

const DISPOSITION_LABEL: Record<string, string> = {
  PENDING: 'Đang niêm phong lưu giữ chờ xử lý',
  RETURNED_TO_TENANT: 'Đã bàn giao hoàn trả cho khách thuê',
  DISPOSED: 'Đã xử lý / tiêu hủy theo quy định',
  SOLD: 'Đã thanh lý đối trừ công nợ',
};

export async function renderInvoicePdfBuffer(
  ctx: EnrichContext,
  inv: {
    code: string;
    type: string;
    status: string;
    issue_date: Date;
    due_date: Date;
    subtotal: unknown;
    discount_total: unknown;
    tax_total: unknown;
    total: unknown;
    amount_paid: unknown;
    amount_credited: unknown;
    customer: { full_name: string; code: string; email?: string | null; phone?: string | null };
    facility: { name: string; address_line: string; district: string; province: string; phone?: string | null };
    contract?: { code: string; unit?: { code: string } | null } | null;
    reservation?: { code: string } | null;
    items: { description: string; quantity: unknown; unit_price: unknown; amount: unknown }[];
  },
): Promise<Buffer> {
  const paid = Number(inv.amount_paid) + Number(inv.amount_credited);
  const balance = Math.max(0, Number(inv.total) - paid);
  const facAddr = `${inv.facility.address_line}, ${inv.facility.district}, ${inv.facility.province}`;
  return ctx.pdf.render(
    `HÓA ĐƠN DỊCH VỤ ${inv.code}`,
    `${inv.facility.name} · ${fmtDate(inv.issue_date)}`,
    [
      {
        parties: {
          left: { title: 'Đơn vị phát hành', rows: [['Cơ sở', `${config.brandName} — ${inv.facility.name}`], ['Địa chỉ', facAddr], ['Điện thoại', inv.facility.phone ?? '1900 6868']] },
          right: { title: 'Khách hàng thanh toán', rows: [['Họ và tên', inv.customer.full_name], ['Mã KH', inv.customer.code], ['Liên hệ', [inv.customer.phone, inv.customer.email].filter(Boolean).join(' · ') || '—']] },
        },
      },
      {
        heading: 'Thông tin hóa đơn',
        rows: [
          ['Mã hóa đơn', inv.code],
          ['Loại hóa đơn', INVOICE_TYPE_LABEL[inv.type] ?? inv.type],
          ['Hợp đồng / Đơn liên kết', inv.contract ? `${inv.contract.code}${inv.contract.unit ? ` (Kho ${inv.contract.unit.code})` : ''}` : inv.reservation?.code ?? '—'],
          ['Ngày phát hành / Hạn thanh toán', `${fmtDate(inv.issue_date)} — Hạn: ${fmtDate(inv.due_date)}`],
          ['Trạng thái hiện tại', INVOICE_STATUS_LABEL[inv.status] ?? inv.status],
        ],
      },
      {
        heading: 'Chi tiết các khoản mục',
        table: {
          headers: ['Nội dung khoản thu', 'SL', 'Đơn giá', 'Thành tiền'],
          widths: [240, 45, 95, 103],
          rows: inv.items.map((it) => [it.description, String(Number(it.quantity)), moneyVnd(it.unit_price), moneyVnd(it.amount)]),
        },
      },
      {
        heading: 'Tổng hợp thanh toán',
        rows: [
          ['Tạm tính trước thuế', moneyVnd(inv.subtotal)],
          ...(Number(inv.discount_total) > 0 ? [['Chiết khấu / Khuyến mãi', `- ${moneyVnd(inv.discount_total)}`] as [string, string]] : []),
          ['Thuế GTGT (VAT)', moneyVnd(inv.tax_total)],
          ['Tổng cộng hóa đơn', moneyVnd(inv.total)],
          ['Đã thanh toán / Khấu trừ', moneyVnd(paid)],
          ['Số tiền còn phải thanh toán', moneyVnd(balance)],
        ],
      },
    ],
    `Chứng từ hóa đơn điện tử phát hành tự động từ hệ thống ${config.brandName}.`,
  );
}

export async function enrichInvoice(ctx: EnrichContext, invoiceId: bigint, model: EmailComposeModel) {
  const inv = await ctx.prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { items: true, customer: true, facility: true, contract: { include: { unit: true } }, reservation: true },
  });
  if (!inv) return;
  model.categoryBadge = 'HÓA ĐƠN ĐIỆN TỬ';
  model.referenceCode = inv.code;
  model.userFullName ||= inv.customer.full_name;
  model.facilityFooter = facilityFooterOf(inv.facility);

  const paid = Number(inv.amount_paid) + Number(inv.amount_credited);
  const balance = Math.max(0, Number(inv.total) - paid);
  model.kvRows.push(
    ['Mã hóa đơn', inv.code],
    ['Loại hóa đơn', INVOICE_TYPE_LABEL[inv.type] ?? inv.type],
    ['Hợp đồng / Đơn đặt chỗ', inv.contract ? `${inv.contract.code} (Kho ${inv.contract.unit.code})` : inv.reservation?.code ?? '—'],
    ['Cơ sở lưu trữ', inv.facility.name],
    ['Ngày phát hành', fmtDate(inv.issue_date)],
    ['Hạn thanh toán', fmtDate(inv.due_date)],
    ['Trạng thái', INVOICE_STATUS_LABEL[inv.status] ?? inv.status],
    ['Tổng cộng hóa đơn', moneyVnd(inv.total)],
    ['Đã thanh toán / Cấn trừ', moneyVnd(paid)],
    ['Số tiền còn cần thanh toán', moneyVnd(balance)],
  );

  model.tables.push({
    heading: 'Chi tiết bảng kê hóa đơn',
    headers: ['Khoản mục', 'SL', 'Đơn giá', 'Thành tiền'],
    alignRightCols: [1, 2, 3],
    rows: [
      ...inv.items.map((it) => [it.description, String(Number(it.quantity)), moneyVnd(it.unit_price), moneyVnd(it.amount)]),
      ...(Number(inv.discount_total) > 0 ? [['Khuyến mãi / Giảm trừ', '', '', `- ${moneyVnd(inv.discount_total)}`]] : []),
      ['Thuế GTGT (VAT)', '', '', moneyVnd(inv.tax_total)],
      ['TỔNG CỘNG HÓA ĐƠN', '', '', moneyVnd(inv.total)],
      ['CÒN PHẢI THANH TOÁN', '', '', moneyVnd(balance)],
    ],
  });

  const pdfBuf = await renderInvoicePdfBuffer(ctx, inv);
  model.attachments.push({ filename: `Hoa-don-${inv.code}.pdf`, content: pdfBuf, contentType: 'application/pdf' });
}

export async function enrichPayment(ctx: EnrichContext, paymentId: bigint, model: EmailComposeModel) {
  const pay = await ctx.prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      customer: true,
      allocations: { include: { invoice: { include: { items: true, customer: true, facility: true, contract: { include: { unit: true } }, reservation: true } } } },
    },
  });
  if (!pay) return;
  const fac = await ctx.prisma.facility.findUnique({ where: { id: pay.facility_id } });
  model.categoryBadge = 'BIÊN NHẬN THANH TOÁN';
  model.referenceCode = pay.code;
  model.userFullName ||= pay.customer.full_name;
  if (fac) model.facilityFooter = facilityFooterOf(fac);

  const firstInv = pay.allocations[0]?.invoice;
  const linkedRsv = firstInv?.reservation?.code;
  const linkedCt = firstInv?.contract?.code;
  const tz = fac?.timezone ?? 'Asia/Ho_Chi_Minh';
  const methodStr = `${PAYMENT_METHOD_LABEL[pay.method] ?? pay.method}${pay.provider ? ` (${pay.provider})` : ''}`;

  model.kvRows.push(
    ['Mã biên nhận giao dịch', pay.code],
    ['Trạng thái giao dịch', pay.status === 'SUCCEEDED' ? 'Thành công' : pay.status === 'FAILED' ? 'Chưa thành công' : pay.status],
    ['Số tiền giao dịch', moneyVnd(pay.amount)],
    ['Phương thức thanh toán', methodStr],
    ['Mã tham chiếu cổng / NH', pay.provider_txn_id ?? pay.bank_reference ?? '—'],
    ['Thời điểm ghi nhận', fmtDateTime(pay.paid_at ?? pay.created_at, tz)],
    ...(linkedCt ? [['Hợp đồng liên quan', `${linkedCt}${firstInv?.contract?.unit ? ` (Kho ${firstInv.contract.unit.code})` : ''}`] as [string, string]] : []),
    ...(linkedRsv ? [['Đơn đặt giữ chỗ liên quan', linkedRsv] as [string, string]] : []),
    ...(pay.failure_message ? [['Lý do chưa hoàn tất', pay.failure_message] as [string, string]] : []),
  );

  if (pay.allocations.length) {
    model.tables.push({
      heading: 'Phân bổ thanh toán vào hóa đơn',
      headers: ['Mã hóa đơn', 'Loại hóa đơn', 'Trạng thái HĐ', 'Số tiền phân bổ'],
      alignRightCols: [3],
      rows: pay.allocations.map((al) => [
        al.invoice.code,
        INVOICE_TYPE_LABEL[al.invoice.type] ?? al.invoice.type,
        INVOICE_STATUS_LABEL[al.invoice.status] ?? al.invoice.status,
        moneyVnd(al.amount),
      ]),
    });
  }

  if (ctx.event === 'payment.succeeded' || pay.status === 'SUCCEEDED') {
    const receiptPdf = await ctx.pdf.render(
      `BIÊN NHẬN THANH TOÁN ${pay.code}`,
      `${fac?.name ?? config.brandName} · ${fmtDateTime(pay.paid_at ?? pay.created_at, tz)}`,
      [
        {
          heading: 'Thông tin biên nhận thu tiền',
          rows: [
            ['Mã biên nhận', pay.code],
            ['Khách hàng', `${pay.customer.full_name} (${pay.customer.code})`],
            ['Số tiền đã thanh toán', moneyVnd(pay.amount)],
            ['Phương thức thanh toán', methodStr],
            ['Mã giao dịch đối soát', pay.provider_txn_id ?? pay.bank_reference ?? '—'],
            ['Thời gian xác nhận', fmtDateTime(pay.paid_at ?? pay.created_at, tz)],
            ...(linkedRsv ? [['Đơn đặt chỗ', linkedRsv] as [string, string]] : []),
            ...(linkedCt ? [['Hợp đồng thuê kho', linkedCt] as [string, string]] : []),
          ],
        },
        ...(pay.allocations.length
          ? [
              {
                heading: 'Danh sách hóa đơn được thanh toán',
                table: {
                  headers: ['Mã hóa đơn', 'Loại', 'Trạng thái', 'Số tiền phân bổ'],
                  widths: [130, 155, 100, 98],
                  rows: pay.allocations.map((al) => [al.invoice.code, INVOICE_TYPE_LABEL[al.invoice.type] ?? al.invoice.type, INVOICE_STATUS_LABEL[al.invoice.status] ?? al.invoice.status, moneyVnd(al.amount)]),
                },
              } satisfies PdfSection,
            ]
          : []),
      ],
      `Biên nhận điện tử xác nhận thanh toán hợp lệ tại ${config.brandName}.`,
    );
    model.attachments.push({ filename: `Bien-nhan-${pay.code}.pdf`, content: receiptPdf, contentType: 'application/pdf' });
    for (const al of pay.allocations.slice(0, 2)) {
      const invPdf = await renderInvoicePdfBuffer(ctx, al.invoice);
      model.attachments.push({ filename: `Hoa-don-${al.invoice.code}.pdf`, content: invPdf, contentType: 'application/pdf' });
    }
  }
}

export async function enrichRefund(ctx: EnrichContext, refundId: bigint, model: EmailComposeModel) {
  const ref = await ctx.prisma.refund.findUnique({ where: { id: refundId }, include: { payment: true } });
  if (!ref) return;
  const [customer, fac, contract, reservation] = await Promise.all([
    ctx.prisma.customer.findUnique({ where: { id: ref.customer_id } }),
    ctx.prisma.facility.findUnique({ where: { id: ref.facility_id } }),
    ref.contract_id ? ctx.prisma.contract.findUnique({ where: { id: ref.contract_id } }) : null,
    ref.reservation_id ? ctx.prisma.reservation.findUnique({ where: { id: ref.reservation_id } }) : null,
  ]);
  const refCode = `RF-${String(ref.id).padStart(6, '0')}`;
  model.categoryBadge = 'HOÀN TIỀN';
  model.referenceCode = refCode;
  if (customer) model.userFullName ||= customer.full_name;
  if (fac) model.facilityFooter = facilityFooterOf(fac);

  const tz = fac?.timezone ?? 'Asia/Ho_Chi_Minh';
  const rows: [string, string][] = [
    ['Mã chứng từ hoàn tiền', refCode],
    ['Khách hàng thụ hưởng', customer ? `${customer.full_name} (${customer.code})` : '—'],
    ['Số tiền hoàn trả', moneyVnd(ref.amount)],
    ...(Number(ref.deposit_portion) > 0 ? [['Trong đó hoàn tiền đặt cọc', moneyVnd(ref.deposit_portion)] as [string, string]] : []),
    ['Lý do hoàn tiền', REFUND_REASON_LABEL[ref.reason] ?? ref.reason],
    ['Phương thức hoàn trả', ref.method === 'CASH' ? 'Tiền mặt tại quầy' : ref.method === 'BANK_TRANSFER' ? 'Chuyển khoản ngân hàng' : 'Hoàn về phương thức thanh toán gốc'],
    ['Trạng thái xử lý', ref.status === 'SUCCEEDED' ? 'Đã hoàn tất' : ref.status],
    ...(ref.payment ? [['Giao dịch gốc liên kết', ref.payment.code] as [string, string]] : []),
    ...(contract ? [['Hợp đồng liên quan', contract.code] as [string, string]] : []),
    ...(reservation ? [['Đơn đặt kho liên quan', reservation.code] as [string, string]] : []),
    ['Thời điểm cập nhật', fmtDateTime(ref.processed_at ?? ref.created_at, tz)],
    ...(ref.note ? [['Ghi chú chứng từ', ref.note] as [string, string]] : []),
  ];
  model.kvRows.push(...rows);

  const pdfBuf = await ctx.pdf.render(
    `CHỨNG TỪ HOÀN TIỀN ${refCode}`,
    `${fac?.name ?? config.brandName} · ${fmtDateTime(ref.processed_at ?? ref.created_at, tz)}`,
    [{ heading: 'Thông tin chi tiết khoản hoàn trả', rows }],
    `Chứng từ xác nhận hoàn tiền điện tử phát hành bởi ${config.brandName}.`,
  );
  model.attachments.push({ filename: `Chung-tu-hoan-tien-${refCode}.pdf`, content: pdfBuf, contentType: 'application/pdf' });
}

export async function enrichOverlock(ctx: EnrichContext, overlockId: bigint, model: EmailComposeModel) {
  const ol = await ctx.prisma.overlock.findUnique({ where: { id: overlockId } });
  if (!ol) return;
  const c = await ctx.prisma.contract.findUnique({ where: { id: ol.contract_id }, include: { customer: true, facility: true, unit: { include: { zone: true } } } });
  if (!c) return;
  const isRemoved = Boolean(ol.removed_at) || ctx.event === 'overlock.removed';
  model.categoryBadge = isRemoved ? 'GỠ KHÓA CHẶN KHO' : 'KHÓA CHẶN KHO';
  model.referenceCode = c.code;
  model.userFullName ||= c.customer.full_name;
  model.facilityFooter = facilityFooterOf(c.facility);

  const openInvs = await ctx.prisma.invoice.findMany({ where: { contract_id: c.id, status: { in: ['ISSUED', 'PARTIALLY_PAID'] } }, orderBy: { due_date: 'asc' } });
  const totalDebt = openInvs.reduce((s, i) => s + Math.max(0, Number(i.total) - Number(i.amount_paid) - Number(i.amount_credited)), 0);
  const tz = c.facility.timezone;

  const rows: [string, string][] = [
    ['Mã hợp đồng', c.code],
    ['Kho lưu trữ', `${c.unit.code} (${c.unit.zone.name}, tầng ${c.unit.zone.floor})`],
    ['Cơ sở quản lý', c.facility.name],
    ['Mã niêm phong khóa chặn', ol.lock_serial],
    ['Thời điểm gắn khóa chặn', fmtDateTime(ol.placed_at, tz)],
    ...(ol.removed_at ? [['Thời điểm tháo gỡ khóa chặn', fmtDateTime(ol.removed_at, tz)] as [string, string]] : []),
    ['Tổng dư nợ hiện tại', moneyVnd(totalDebt)],
  ];
  model.kvRows.push(...rows);

  const extraIds = [ol.placed_photo_id, ol.removed_photo_id].filter((x): x is bigint => x != null);
  const mediaRows = await ctx.prisma.mediaFile.findMany({
    where: { status: 'READY', OR: [{ related_type: 'overlock', related_id: ol.id }, ...(extraIds.length ? [{ id: { in: extraIds } }] : [])] },
    orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
  });
  const loaded = await readMediaRecords(ctx.storage, mediaRows);

  const sections: PdfSection[] = [
    { heading: isRemoved ? 'Thông tin tháo gỡ khóa chặn vật lý' : 'Thông tin niêm phong khóa chặn vật lý', rows },
    ...(openInvs.length
      ? [{ heading: 'Các hóa đơn quá hạn liên quan', table: { headers: ['Mã HĐ', 'Hạn thanh toán', 'Tổng tiền', 'Còn nợ'], widths: [130, 110, 120, 123], rows: openInvs.map((i) => [i.code, fmtDate(i.due_date), moneyVnd(i.total), moneyVnd(Number(i.total) - Number(i.amount_paid) - Number(i.amount_credited))]) } } satisfies PdfSection]
      : []),
    ...loaded.filter((m) => m.mime_type.startsWith('image/')).slice(0, 4).map((m, idx) => ({
      heading: idx === 0 ? 'Hình ảnh ghi nhận hiện trường tại cửa kho' : undefined,
      image: { buffer: m.buffer, caption: m.caption ?? `Ảnh hiện trạng cửa kho ${c.unit.code} (#${idx + 1})`, width: 220 },
    })),
  ];
  const pdfBuf = await ctx.pdf.render(
    isRemoved ? `BIÊN BẢN THÁO GỠ KHÓA CHẶN KHO ${c.unit.code}` : `BIÊN BẢN GẮN KHÓA CHẶN KHO ${c.unit.code}`,
    `${c.code} · ${c.facility.name}`,
    sections,
    `Biên bản vận hành hiện trường có hình ảnh đối chứng của ${config.brandName}.`,
  );
  model.attachments.push({
    filename: `${isRemoved ? 'Bien-ban-go-khoa-chan' : 'Bien-ban-khoa-chan'}-${slugAscii(c.unit.code)}-${c.code}.pdf`,
    content: pdfBuf,
    contentType: 'application/pdf',
  });
  attachMediaWithPreviews(model, loaded, isRemoved ? `Anh-go-khoa-${c.unit.code}` : `Anh-khoa-chan-${c.unit.code}`, (_m, idx) => `Ảnh hiện trường kho ${c.unit.code} (#${idx + 1})`);
}

export async function enrichCollectionNote(ctx: EnrichContext, noteId: bigint, model: EmailComposeModel) {
  const cn = await ctx.prisma.collectionNote.findUnique({
    where: { id: noteId },
    include: { contract: { include: { customer: true, facility: true, unit: { include: { zone: true } } } } },
  });
  if (!cn) return;
  const c = cn.contract;
  model.categoryBadge = 'THÔNG BÁO CÔNG NỢ';
  model.referenceCode = c.code;
  model.userFullName ||= c.customer.full_name;
  model.facilityFooter = facilityFooterOf(c.facility);

  const openInvs = await ctx.prisma.invoice.findMany({ where: { contract_id: c.id, status: { in: ['ISSUED', 'PARTIALLY_PAID'] } }, orderBy: { due_date: 'asc' } });
  const totalDebt = openInvs.reduce((s, i) => s + Math.max(0, Number(i.total) - Number(i.amount_paid) - Number(i.amount_credited)), 0);
  const rows: [string, string][] = [
    ['Mã hợp đồng', c.code],
    ['Kho lưu trữ', `${c.unit.code} (${c.unit.zone.name})`],
    ['Cơ sở quản lý', c.facility.name],
    ['Hình thức thông báo', cn.channel],
    ['Kết quả / Tóm tắt', cn.outcome],
    ...(cn.note ? [['Nội dung ghi chú nhắc nợ', cn.note] as [string, string]] : []),
    ['Tổng dư nợ cần tất toán', moneyVnd(totalDebt)],
    ['Thời điểm lập thông báo', fmtDateTime(cn.created_at, c.facility.timezone)],
  ];
  model.kvRows.push(...rows);

  if (openInvs.length) {
    model.tables.push({
      heading: 'Bảng đối chiếu hóa đơn quá hạn / chưa thanh toán',
      headers: ['Mã hóa đơn', 'Hạn thanh toán', 'Tổng hóa đơn', 'Còn nợ'],
      alignRightCols: [2, 3],
      rows: openInvs.map((i) => [i.code, fmtDate(i.due_date), moneyVnd(i.total), moneyVnd(Math.max(0, Number(i.total) - Number(i.amount_paid) - Number(i.amount_credited)))]),
    });
  }

  const mediaRows = await ctx.prisma.mediaFile.findMany({
    where: { status: 'READY', OR: [{ related_type: 'collection_note', related_id: cn.id }, ...(cn.evidence_media_id ? [{ id: cn.evidence_media_id }] : [])] },
    orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
  });
  const loaded = await readMediaRecords(ctx.storage, mediaRows);

  const pdfBuf = await ctx.pdf.render(
    `THÔNG BÁO NHẮC NỢ & ĐỐI CHIẾU CÔNG NỢ`,
    `${c.code} · Kho ${c.unit.code} · ${c.facility.name}`,
    [
      { heading: 'Thông tin hồ sơ công nợ', rows },
      ...(openInvs.length
        ? [{ heading: 'Chi tiết hóa đơn cần thanh toán', table: { headers: ['Mã HĐ', 'Hạn thanh toán', 'Tổng cộng', 'Số tiền còn nợ'], widths: [130, 110, 120, 123], rows: openInvs.map((i) => [i.code, fmtDate(i.due_date), moneyVnd(i.total), moneyVnd(Math.max(0, Number(i.total) - Number(i.amount_paid) - Number(i.amount_credited)))]) } } satisfies PdfSection]
        : []),
      ...loaded.filter((m) => m.mime_type.startsWith('image/')).slice(0, 4).map((m, idx) => ({
        heading: idx === 0 ? 'Chứng từ hình ảnh đính kèm' : undefined,
        image: { buffer: m.buffer, caption: m.caption ?? `Ảnh chứng từ nhắc nợ (#${idx + 1})`, width: 220 },
      })),
    ],
    `Văn bản đối chiếu công nợ chính thức từ bộ phận quản lý hợp đồng ${config.brandName}.`,
  );
  model.attachments.push({ filename: `Thong-bao-nhac-no-${c.code}.pdf`, content: pdfBuf, contentType: 'application/pdf' });
  attachMediaWithPreviews(model, loaded, `Bang-chung-nhac-no-${c.code}`, (_m, idx) => `Chứng từ công nợ (#${idx + 1})`);
}

export async function enrichAbandonedGoods(ctx: EnrichContext, recordId: bigint, model: EmailComposeModel) {
  const rec = await ctx.prisma.abandonedGoodsRecord.findUnique({ where: { id: recordId } });
  if (!rec) return;
  const c = await ctx.prisma.contract.findUnique({ where: { id: rec.contract_id }, include: { customer: true, facility: true, unit: { include: { zone: true } } } });
  if (!c) return;
  const witnesses = await ctx.prisma.user.findMany({ where: { id: { in: [rec.witness_1_user_id, rec.witness_2_user_id] } }, select: { id: true, full_name: true } });
  const w1 = witnesses.find((w) => w.id === rec.witness_1_user_id)?.full_name ?? 'Nhân sự làm chứng 1';
  const w2 = witnesses.find((w) => w.id === rec.witness_2_user_id)?.full_name ?? 'Nhân sự làm chứng 2';

  model.categoryBadge = 'TÀI SẢN TỒN ĐỌNG';
  model.referenceCode = c.code;
  model.userFullName ||= c.customer.full_name;
  model.facilityFooter = facilityFooterOf(c.facility);

  const rows: [string, string][] = [
    ['Mã hợp đồng chấm dứt', c.code],
    ['Kho mở kiểm kê', `${c.unit.code} (${c.unit.zone.name})`],
    ['Cơ sở thực hiện', c.facility.name],
    ['Người làm chứng 1', w1],
    ['Người làm chứng 2', w2],
    ['Vị trí niêm phong bảo quản', rec.stored_location || 'Kho lưu giữ niêm phong nội bộ cơ sở'],
    ['Thời hạn lưu giữ tối thiểu', fmtDate(rec.hold_until)],
    ['Trạng thái xử lý tài sản', DISPOSITION_LABEL[rec.disposition] ?? rec.disposition],
    ...(rec.proceeds_amount !== null ? [['Giá trị thu hồi thanh lý', moneyVnd(rec.proceeds_amount)] as [string, string]] : []),
  ];
  model.kvRows.push(...rows);

  const invItems = (Array.isArray(rec.inventory_list) ? rec.inventory_list : []) as { item?: string; qty?: number; note?: string }[];
  const invTableRows = invItems.map((it, idx) => [String(idx + 1), String(it.item ?? 'Vật dụng lưu kho'), String(it.qty ?? 1), String(it.note ?? '—')]);
  if (invTableRows.length) {
    model.tables.push({
      heading: 'Danh mục tài sản kiểm kê tại hiện trường',
      headers: ['STT', 'Tên / Mô tả tài sản', 'SL', 'Ghi chú hiện trạng'],
      alignRightCols: [2],
      rows: invTableRows,
    });
  }

  const mediaRows = await ctx.prisma.mediaFile.findMany({
    where: { status: 'READY', related_type: { in: ['abandoned_goods', 'abandoned_goods_record'] }, related_id: rec.id },
    orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
  });
  const loaded = await readMediaRecords(ctx.storage, mediaRows);

  const pdfBuf = await ctx.pdf.render(
    rec.disposition === 'PENDING' ? 'BIÊN BẢN KIỂM KÊ TÀI SẢN TỒN ĐỌNG' : 'BIÊN BẢN XỬ LÝ / THANH LÝ TÀI SẢN TỒN ĐỌNG',
    `${c.code} · Kho ${c.unit.code} · ${c.facility.name}`,
    [
      { heading: 'Thông tin hội đồng kiểm kê & lưu giữ', rows },
      ...(invTableRows.length
        ? [{ heading: 'Bảng kê chi tiết tài sản', table: { headers: ['STT', 'Mô tả tài sản', 'SL', 'Ghi chú'], widths: [40, 250, 50, 143], rows: invTableRows } } satisfies PdfSection]
        : []),
      ...loaded.filter((m) => m.mime_type.startsWith('image/')).slice(0, 4).map((m, idx) => ({
        heading: idx === 0 ? 'Hình ảnh hiện trường mở kho & kiểm kê' : undefined,
        image: { buffer: m.buffer, caption: m.caption ?? `Ảnh kiểm kê tài sản kho ${c.unit.code} (#${idx + 1})`, width: 220 },
      })),
    ],
    `Biên bản lập có đầy đủ hai nhân sự làm chứng theo quy định của ${config.brandName}.`,
  );
  model.attachments.push({ filename: `Bien-ban-tai-san-ton-dong-${c.code}.pdf`, content: pdfBuf, contentType: 'application/pdf' });
  attachMediaWithPreviews(model, loaded, `Anh-tai-san-ton-dong-${c.unit.code}`, (_m, idx) => `Ảnh kiểm kê tài sản (#${idx + 1})`);
}

export async function enrichTicket(ctx: EnrichContext, ticketId: bigint, model: EmailComposeModel) {
  const t = await ctx.prisma.supportTicket.findUnique({
    where: { id: ticketId },
    include: { facility: true, customer: true, contract: { include: { unit: true } }, assignee: { select: { full_name: true } }, messages: { orderBy: { created_at: 'asc' } } },
  });
  if (!t) return;
  model.categoryBadge = 'HỖ TRỢ KHÁCH HÀNG';
  model.referenceCode = t.code;
  if (t.customer) model.userFullName ||= t.customer.full_name;
  model.facilityFooter = facilityFooterOf(t.facility);

  const isStaff = Boolean(ctx.recipientUser?.isStaff);
  const visible = isStaff ? t.messages : t.messages.filter((m) => !m.is_internal);
  const recent = visible.slice(-5);
  const authorIds = [...new Set(recent.map((m) => m.author_user_id).filter((x): x is bigint => x != null))];
  const authors = authorIds.length ? await ctx.prisma.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, full_name: true } }) : [];

  model.kvRows.push(
    ['Mã phiếu hỗ trợ', t.code],
    ['Chủ đề yêu cầu', t.subject],
    ['Danh mục / Mức ưu tiên', `${t.category} · ${t.priority}`],
    ['Trạng thái xử lý', t.status],
    ['Cơ sở tiếp nhận', t.facility.name],
    ...(t.contract ? [['Hợp đồng / Kho liên quan', `${t.contract.code} (Kho ${t.contract.unit.code})`] as [string, string]] : []),
    ['Nhân sự phụ trách', t.assignee?.full_name ?? 'Bộ phận Chăm sóc khách hàng'],
    ['Cam kết xử lý (SLA)', fmtDateTime(t.resolution_due_at, t.facility.timezone)],
    ...(t.resolution_note ? [['Kết quả giải quyết', t.resolution_note] as [string, string]] : []),
  );

  if (recent.length) {
    model.tables.push({
      heading: 'Lịch sử trao đổi gần nhất',
      headers: ['Thời gian', 'Người gửi', 'Nội dung'],
      rows: recent.map((m) => {
        const name = authors.find((a) => a.id === m.author_user_id)?.full_name ?? (m.author_role === 'SYSTEM' ? 'Hệ thống' : m.author_role === 'STAFF' ? 'Nhân viên hỗ trợ' : 'Khách hàng');
        return [fmtDateTime(m.created_at, t.facility.timezone), `${name}${m.is_internal ? ' (Nội bộ)' : ''}`, m.body.slice(0, 320)];
      }),
    });
  }

  const msgIds = visible.map((m) => m.id);
  const mediaRows = await ctx.prisma.mediaFile.findMany({
    where: { status: 'READY', OR: [{ related_type: 'ticket', related_id: t.id }, ...(msgIds.length ? [{ related_type: 'ticket_message', related_id: { in: msgIds } }] : [])] },
    orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
  });
  const loaded = await readMediaRecords(ctx.storage, mediaRows);
  attachMediaWithPreviews(model, loaded, `Dinh-kem-${t.code}`, (_m, idx) => `Tệp đính kèm phiếu ${t.code} (#${idx + 1})`);
}

export async function enrichWorkOrder(ctx: EnrichContext, workOrderId: bigint, model: EmailComposeModel) {
  const wo = await ctx.prisma.workOrder.findUnique({ where: { id: workOrderId }, include: { facility: true, unit: { include: { zone: true } } } });
  if (!wo) return;
  const rsvCode = typeof ctx.vars?.code === 'string' && ctx.vars.code.startsWith('RSV-') ? ctx.vars.code : undefined;
  model.categoryBadge = ctx.event === 'unit.unfit_reassigned' ? 'ĐỔI KHO TIÊU CHUẨN' : 'BẢO TRÌ KỸ THUẬT';
  model.referenceCode = rsvCode ?? wo.code;
  model.facilityFooter = facilityFooterOf(wo.facility);

  model.kvRows.push(
    ...(rsvCode ? [['Mã đơn đặt kho', rsvCode] as [string, string]] : []),
    ['Mã phiếu kỹ thuật', wo.code],
    ['Cơ sở lưu trữ', wo.facility.name],
    ['Vị trí kho kiểm tra', wo.unit ? `${wo.unit.code} (${wo.unit.zone.name}, tầng ${wo.unit.zone.floor})` : 'Khu vực chung cơ sở'],
    ['Hạng mục / Mức ưu tiên', `${wo.category} · ${wo.priority}`],
    ['Trạng thái phiếu', wo.status],
    ['Ghi nhận kỹ thuật', wo.description],
    ...(wo.completion_note ? [['Ghi chú nghiệm thu', wo.completion_note] as [string, string]] : []),
  );

  const mediaRows = await ctx.prisma.mediaFile.findMany({
    where: { status: 'READY', related_type: 'work_order', related_id: wo.id },
    orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
  });
  const loaded = await readMediaRecords(ctx.storage, mediaRows);
  attachMediaWithPreviews(model, loaded, `Anh-ky-thuat-${wo.code}`, (_m, idx) => `Ảnh kiểm tra kỹ thuật ${wo.unit?.code ?? wo.code} (#${idx + 1})`);
}

export async function enrichReportExport(ctx: EnrichContext, exportId: bigint, model: EmailComposeModel) {
  const exp = await ctx.prisma.reportExport.findUnique({ where: { id: exportId } });
  if (!exp) return;
  model.categoryBadge = 'BÁO CÁO KẾT XUẤT';
  model.referenceCode = exp.report_code;
  model.kvRows.push(
    ['Mã loại báo cáo', exp.report_code],
    ['Định dạng kết xuất', exp.format],
    ['Số dòng bản ghi', String(exp.row_count ?? 0)],
    ['Ngày khởi tạo', fmtDateTime(exp.created_at)],
    ...(exp.expires_at ? [['Hiệu lực lưu trữ trên Web', fmtDateTime(exp.expires_at)] as [string, string]] : []),
  );

  const m = exp.media_file_id
    ? await ctx.prisma.mediaFile.findUnique({ where: { id: exp.media_file_id } })
    : await ctx.prisma.mediaFile.findFirst({ where: { related_type: 'report_export', related_id: exp.id, status: 'READY' }, orderBy: { id: 'desc' } });
  if (!m) return;
  const buf = await ctx.storage.read(m.bucket, m.object_key).catch(() => null);
  if (!buf || !buf.length) return;
  const ext = extFromMime(m.mime_type, m.object_key);
  model.attachments.push({
    filename: `Bao-cao-${slugAscii(exp.report_code)}-${ymd(exp.created_at) ?? 'export'}.${ext}`,
    content: buf,
    contentType: m.mime_type,
  });
}
