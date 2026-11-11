import { formatInTimeZone } from 'date-fns-tz';
import { INSPECTION_ITEM_LABEL } from '@vaultra/shared';
import { config } from '../common/config';
import { addDays, fmtDate, fmtDateTime, timeIn, zonedToUtc, ymd } from '../common/dates';
import { buildContract } from '../contract/contract-template';
import type { PdfSection } from '../media/pdf.service';
import {
  attachMediaWithPreviews,
  buildIcsBuffer,
  buildQrPngBuffer,
  CONDITION_LABEL,
  EmailComposeModel,
  EnrichContext,
  facilityFooterOf,
  loadPolicyParams,
  moneyVnd,
  readMediaRecords,
  slugAscii,
  WEB_ONLY_PIN_NOTICE,
} from './email-layout';
import { renderInvoicePdfBuffer } from './email-enrichers-ops';

const RSV_STATUS_LABEL: Record<string, string> = {
  PENDING_PAYMENT: 'Đang giữ chỗ chờ thanh toán',
  CONFIRMED: 'Đã xác nhận thanh toán',
  UNIT_ASSIGNED: 'Đã phân bổ kho lưu trữ',
  MOVE_IN_SCHEDULED: 'Đã đặt lịch nhận bàn giao kho',
  CHECKED_IN: 'Đã nhận bàn giao kho',
  EXPIRED: 'Hết thời hạn giữ chỗ',
  CANCELLED: 'Đã hủy đơn đặt chỗ',
  NO_SHOW: 'Quá hạn nhận kho (Không đến)',
};

const APPT_TYPE_LABEL: Record<string, string> = {
  MOVE_IN: 'Nhận bàn giao kho (Check-in)',
  MOVE_OUT: 'Kiểm tra & bàn giao trả kho',
  INSPECTION: 'Kiểm tra kỹ thuật định kỳ',
};

async function loadUnitOrFacilityPhotos(ctx: EnrichContext, opts: { unitId?: bigint | null; unitTypeId?: bigint | null; facilityId: bigint; coverMediaId?: bigint | null; limit?: number }) {
  const limit = opts.limit ?? 4;
  const rows = await ctx.prisma.mediaFile.findMany({
    where: {
      status: 'READY',
      mime_type: { startsWith: 'image/' },
      OR: [
        ...(opts.unitId ? [{ related_type: 'unit', related_id: opts.unitId }] : []),
        ...(opts.unitTypeId ? [{ related_type: 'unit_type', related_id: opts.unitTypeId }] : []),
        { related_type: 'facility', related_id: opts.facilityId },
        ...(opts.coverMediaId ? [{ id: opts.coverMediaId }] : []),
      ],
    },
    orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
    take: limit * 2,
  });
  const rank = (rt: string | null) => (rt === 'unit' ? 0 : rt === 'unit_type' ? 1 : 2);
  rows.sort((a, b) => rank(a.related_type) - rank(b.related_type));
  const loaded = await readMediaRecords(ctx.storage, rows);
  return loaded.slice(0, limit);
}

export async function enrichReservation(ctx: EnrichContext, reservationId: bigint, model: EmailComposeModel, opts?: { fromAppointment?: boolean }) {
  const r = await ctx.prisma.reservation.findUnique({
    where: { id: reservationId },
    include: {
      customer: true,
      facility: true,
      unit_type: true,
      quote: true,
      allocations: { where: { status: 'ACTIVE' }, include: { unit: { include: { zone: true } } }, take: 1 },
      appointments: { where: { status: { in: ['BOOKED', 'ARRIVED'] } }, orderBy: { scheduled_start: 'asc' }, take: 1 },
    },
  });
  if (!r) return;
  const alloc = r.allocations[0];
  const appt = r.appointments[0];
  const tz = r.facility.timezone;
  const facAddr = [r.facility.address_line, r.facility.ward, r.facility.district, r.facility.province].filter(Boolean).join(', ');
  const sizeDesc = `${r.unit_type.name} — ${r.unit_type.width_m} × ${r.unit_type.depth_m} × ${r.unit_type.height_m} m (${r.unit_type.area_m2 ?? ''} m²)`;

  model.userFullName ||= r.customer.full_name;
  model.facilityFooter = facilityFooterOf(r.facility);
  if (!opts?.fromAppointment) {
    model.categoryBadge = 'ĐẶT KHO LƯU TRỮ';
    model.referenceCode = r.code;
    model.kvRows.push(
      ['Mã đơn đặt giữ chỗ', r.code],
      ['Trạng thái đơn hàng', RSV_STATUS_LABEL[r.status] ?? r.status],
      ['Cơ sở lưu trữ', `${r.facility.name} — ${facAddr}`],
      ['Loại kho & Kích thước', sizeDesc],
      ...(alloc ? [['Kho được bố trí', `Kho ${alloc.unit.code} (${alloc.unit.zone.name}, tầng ${alloc.unit.zone.floor})`] as [string, string]] : []),
      ['Kỳ thuê đăng ký', `${fmtDate(r.start_date)} – ${fmtDate(addDays(r.end_date, -1))} (${r.term_months} tháng)`],
      ['Phương thức tính kỳ thuê', r.billing_mode === 'PREPAID_TERM' ? 'Trả trước toàn kỳ' : 'Thanh toán định kỳ hằng tháng'],
      ['Tổng chi phí ban đầu', moneyVnd(r.quote.due_now_total)],
      ...(r.status === 'PENDING_PAYMENT' && r.hold_expires_at ? [['Thời hạn giữ chỗ tạm thời', fmtDateTime(r.hold_expires_at, tz)] as [string, string]] : []),
      ...(appt ? [['Lịch hẹn nhận kho', `${fmtDateTime(appt.scheduled_start, tz)} – ${timeIn(appt.scheduled_end, tz)}`] as [string, string]] : []),
    );
  }

  const rawLines = Array.isArray(r.quote.line_items) ? (r.quote.line_items as { label?: string; description?: string; amount?: number }[]) : [];
  const quoteRows: string[][] = rawLines.length
    ? rawLines.map((l) => [String(l.label ?? l.description ?? 'Khoản mục'), moneyVnd(l.amount ?? 0)])
    : [
        [`Tiền thuê cơ bản (${r.billing_mode === 'PREPAID_TERM' ? `${r.term_months} tháng` : 'tháng đầu'})`, moneyVnd(Number(r.quote.monthly_rent) * (r.billing_mode === 'PREPAID_TERM' ? r.term_months : 1))],
        ...(Number(r.quote.discount_total) > 0 ? [['Khuyến mãi giảm trừ', `- ${moneyVnd(r.quote.discount_total)}`]] : []),
        ...(Number(r.quote.admin_fee) > 0 ? [['Phí khởi tạo hồ sơ', moneyVnd(r.quote.admin_fee)]] : []),
        ['Tiền đặt cọc bảo đảm hợp đồng', moneyVnd(r.quote.deposit_amount)],
        ...(Number(r.quote.tax_total) > 0 ? [['Thuế GTGT (VAT)', moneyVnd(r.quote.tax_total)]] : []),
      ];
  quoteRows.push(['TỔNG CẦN THANH TOÁN BAN ĐẦU', moneyVnd(r.quote.due_now_total)]);

  if (!opts?.fromAppointment) {
    model.tables.push({
      heading: 'Bảng kê chi phí đặt kho',
      headers: ['Khoản mục chi phí', 'Số tiền'],
      alignRightCols: [1],
      rows: quoteRows,
    });
  }

  const qrBuf = await buildQrPngBuffer(r.code);
  model.qrCard = {
    code: r.code,
    cid: 'vaultra-qr',
    subcaption: `${r.facility.name}${alloc ? ` · Kho ${alloc.unit.code}` : ` · ${r.unit_type.name}`}`,
    caption: 'Quý khách vui lòng mang theo CCCD/Hộ chiếu bản gốc và xuất trình mã QR này tại quầy lễ tân để nhân viên quét mã check-in nhanh chóng.',
  };
  model.attachments.push({ filename: `QR-${r.code}.png`, content: qrBuf, contentType: 'image/png', cid: 'vaultra-qr', contentDisposition: 'attachment' });

  const confirmPdf = await ctx.pdf.render(
    'PHIẾU XÁC NHẬN ĐẶT GIỮ CHỖ KHO',
    `${r.code} · ${r.facility.name}`,
    [
      {
        parties: {
          left: { title: 'Cơ sở lưu trữ', rows: [['Đơn vị', `${config.brandName} — ${r.facility.name}`], ['Địa chỉ', facAddr], ['Hotline', r.facility.phone ?? r.facility.hotline ?? '1900 6868']] },
          right: { title: 'Khách hàng đặt kho', rows: [['Họ và tên', r.customer.full_name], ['Mã KH', r.customer.code], ['Liên hệ', [r.customer.phone, r.customer.email].filter(Boolean).join(' · ') || '—']] },
        },
      },
      {
        heading: 'Thông tin đặt giữ chỗ',
        rows: [
          ['Mã đơn đặt chỗ', r.code],
          ['Trạng thái', RSV_STATUS_LABEL[r.status] ?? r.status],
          ['Loại kho đăng ký', sizeDesc],
          ['Kho phân bổ dự kiến', alloc ? `Kho ${alloc.unit.code} (${alloc.unit.zone.name}, tầng ${alloc.unit.zone.floor})` : 'Sẽ gán kho cụ thể trước khi bàn giao'],
          ['Thời gian thuê', `${fmtDate(r.start_date)} – ${fmtDate(addDays(r.end_date, -1))} (${r.term_months} tháng)`],
          ...(appt ? [['Lịch hẹn nhận kho', `${fmtDateTime(appt.scheduled_start, tz)} – ${timeIn(appt.scheduled_end, tz)}`] as [string, string]] : []),
        ],
      },
      { heading: 'Chi tiết báo giá & thanh toán', table: { headers: ['Khoản mục', 'Thành tiền'], widths: [340, 143], rows: quoteRows } },
      { heading: 'Mã QR Check-in tại quầy lễ tân', image: { buffer: qrBuf, caption: `Mã đơn đặt kho: ${r.code} — Xuất trình cùng CCCD bản gốc khi làm thủ tục nhận kho`, width: 135 } },
    ],
    `Phiếu xác nhận đặt giữ chỗ điện tử phát hành bởi hệ thống ${config.brandName}.`,
  );
  model.attachments.push({ filename: `Xac-nhan-dat-cho-${r.code}.pdf`, content: confirmPdf, contentType: 'application/pdf' });

  const photos = await loadUnitOrFacilityPhotos(ctx, { unitId: alloc?.unit_id, unitTypeId: r.unit_type_id, facilityId: r.facility_id, coverMediaId: r.facility.cover_media_id, limit: 4 });
  attachMediaWithPreviews(model, photos, `Hinh-anh-kho-${r.code}`, (_m, idx) => `Hình ảnh cơ sở / khu vực kho (${idx + 1})`);
}

export async function enrichAppointment(ctx: EnrichContext, appointmentId: bigint, model: EmailComposeModel) {
  const a = await ctx.prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { facility: true, customer: true, reservation: true, contract: { include: { unit: { include: { zone: true } } } } },
  });
  if (!a) return;
  const tz = a.facility.timezone;
  const facAddr = [a.facility.address_line, a.facility.ward, a.facility.district, a.facility.province].filter(Boolean).join(', ');
  const typeLabel = APPT_TYPE_LABEL[a.type] ?? a.type;

  model.categoryBadge = 'LỊCH HẸN CƠ SỞ';
  model.referenceCode = a.reservation?.code ?? a.contract?.code ?? a.public_id.slice(-8).toUpperCase();
  model.userFullName ||= a.customer.full_name;
  model.facilityFooter = facilityFooterOf(a.facility);

  model.kvRows.push(
    ['Nội dung lịch hẹn', typeLabel],
    ['Thời gian hẹn', `${fmtDateTime(a.scheduled_start, tz)} – ${timeIn(a.scheduled_end, tz)}`],
    ['Địa điểm cơ sở', `${a.facility.name} — ${facAddr}`],
    ...(a.reservation ? [['Mã đơn đặt chỗ', a.reservation.code] as [string, string]] : []),
    ...(a.contract ? [['Hợp đồng / Kho', `${a.contract.code} — Kho ${a.contract.unit.code} (${a.contract.unit.zone.name})`] as [string, string]] : []),
    ['Trạng thái lịch hẹn', a.status],
    ...(a.notes ? [['Ghi chú đón tiếp', a.notes] as [string, string]] : []),
  );

  const icsBuf = buildIcsBuffer({
    uid: `appt-${a.public_id}`,
    summary: `[${config.brandName}] ${typeLabel} — ${a.facility.name}`,
    description: `${model.title}\nĐơn / Hợp đồng: ${model.referenceCode}\nCơ sở: ${a.facility.name} (${facAddr})`,
    location: `${a.facility.name}, ${facAddr}`,
    start: a.scheduled_start,
    end: a.scheduled_end,
  });
  model.attachments.push({ filename: `Lich-hen-${a.public_id.slice(-6)}.ics`, content: icsBuf, contentType: 'text/calendar; charset=utf-8' });

  if (a.reservation_id) {
    await enrichReservation(ctx, a.reservation_id, model, { fromAppointment: true });
  } else {
    const photos = await loadUnitOrFacilityPhotos(ctx, { unitId: a.contract?.unit_id, facilityId: a.facility_id, coverMediaId: a.facility.cover_media_id, limit: 2 });
    attachMediaWithPreviews(model, photos, `Co-so-${a.facility.code}`, (_m, idx) => `Hình ảnh cơ sở ${a.facility.name} (#${idx + 1})`);
  }
}

export async function enrichContract(ctx: EnrichContext, contractId: bigint, model: EmailComposeModel) {
  if (ctx.event.startsWith('moveout.') || ctx.event === 'settlement.finalized') {
    await enrichMoveOut(ctx, contractId, 'contract', model);
    return;
  }
  const c = await ctx.prisma.contract.findUnique({
    where: { id: contractId },
    include: {
      customer: true,
      facility: true,
      unit: { include: { zone: true } },
      unit_type: true,
      documents: { orderBy: { id: 'desc' }, include: { signatures: true } },
      renewal_offers: { orderBy: { id: 'desc' }, take: 1 },
    },
  });
  if (!c) return;
  const tz = c.facility.timezone;
  const facAddr = [c.facility.address_line, c.facility.ward, c.facility.district, c.facility.province].filter(Boolean).join(', ');
  const snap = (c.snapshot ?? {}) as { price?: { deposit?: number; adminFee?: number; termMonths?: number }; promotion?: { name?: string } | null };

  model.categoryBadge = 'HỢP ĐỒNG THUÊ KHO';
  model.referenceCode = c.code;
  model.userFullName ||= c.customer.full_name;
  model.facilityFooter = facilityFooterOf(c.facility);

  model.kvRows.push(
    ['Mã hợp đồng', c.code],
    ['Cơ sở lưu trữ', `${c.facility.name} — ${facAddr}`],
    ['Kho lưu trữ & Vị trí', `Kho ${c.unit.code} (${c.unit.zone.name}, tầng ${c.unit.zone.floor})`],
    ['Loại kho & Kích thước', `${c.unit_type.name} — ${c.unit_type.width_m} × ${c.unit_type.depth_m} × ${c.unit_type.height_m} m (${c.unit_type.area_m2 ?? ''} m²)`],
    ['Thời hạn hiệu lực', `${fmtDate(c.start_date)} – ${fmtDate(addDays(c.current_end_date, -1))}`],
    ['Đơn giá thuê định kỳ', `${moneyVnd(c.monthly_rent)} / tháng`],
    ['Tiền đặt cọc hợp đồng', moneyVnd(snap.price?.deposit ?? 0)],
  );

  const loadContractDocPdf = async (types: string[], renderDynamicIfMissing = false, isSigned = false): Promise<Buffer | null> => {
    const doc = c.documents.find((d) => types.includes(d.type));
    if (doc) {
      const m = await ctx.prisma.mediaFile.findUnique({ where: { id: doc.media_file_id } });
      if (m) {
        const stored = await ctx.storage.read(m.bucket, m.object_key).catch(() => null);
        if (stored && stored.length > 0) return stored;
      }
    }
    if (!renderDynamicIfMissing) return null;
    const policy = await loadPolicyParams(ctx.prisma, c.policy_version_id);
    const issued = c.signed_at ?? c.created_at;
    const built = buildContract({
      brand: config.brandName,
      code: c.code,
      templateVersion: '2026.12',
      province: c.facility.province,
      facility: { name: c.facility.name, address: facAddr, phone: c.facility.phone },
      customer: { name: c.customer.full_name, code: c.customer.code, email: c.customer.email, phone: c.customer.phone, address: [c.customer.address_line, c.customer.district, c.customer.province].filter(Boolean).join(', ') },
      unit: { code: c.unit.code, type: c.unit_type.name, size: `${c.unit_type.width_m} × ${c.unit_type.depth_m} × ${c.unit_type.height_m} m`, area: Number(c.unit_type.area_m2 ?? 0), zone: c.unit.zone.name, floor: c.unit.zone.floor },
      startDate: fmtDate(c.start_date),
      endDate: fmtDate(addDays(c.current_end_date, -1)),
      months: Number(snap.price?.termMonths ?? 1),
      monthlyRent: moneyVnd(c.monthly_rent),
      billingMode: c.billing_mode,
      billingDay: c.billing_day,
      deposit: moneyVnd(snap.price?.deposit ?? 0),
      adminFee: moneyVnd(snap.price?.adminFee ?? 0),
      promotion: snap.promotion?.name ?? null,
      policy,
      money: (n: number) => moneyVnd(n),
      issued: { day: formatInTimeZone(issued, tz, "'ngày' dd 'tháng' MM 'năm' yyyy"), at: fmtDateTime(issued, tz) },
      today: fmtDate(issued),
      signature: isSigned ? { at: fmtDateTime(c.signed_at ?? issued, tz), method: 'Xác thực chữ ký điện tử (OTP Email)' } : undefined,
    });
    return ctx.pdf.render(built.title, built.subtitle, built.sections, `Tài liệu điện tử do ${config.brandName} phát hành.`, built.opts);
  };

  if (ctx.event === 'contract.sign_otp' || ctx.event === 'renewal.otp') {
    const otp = String(ctx.vars?.otp ?? '').trim();
    if (otp) {
      model.otpCode = {
        code: otp,
        label: ctx.event === 'renewal.otp' ? 'Mã OTP xác nhận gia hạn hợp đồng' : 'Mã OTP ký điện tử hợp đồng thuê kho',
        ttlNote: 'Mã OTP có hiệu lực trong vòng 10 phút. Tuyệt đối không cung cấp mã này cho bất kỳ người nào khác.',
      };
    }
    if (ctx.event === 'renewal.otp' && c.renewal_offers[0]) {
      model.kvRows.push(['Giá thuê kỳ gia hạn đề xuất', `${moneyVnd(c.renewal_offers[0].offered_monthly_rent)} / tháng`]);
    }
    return;
  }

  if (ctx.event === 'contract.sign_email') {
    const draftPdf = await loadContractDocPdf(['CONTRACT', 'TRANSFER_ADDENDUM'], true, false);
    if (draftPdf) model.attachments.push({ filename: `Du-thao-hop-dong-${c.code}.pdf`, content: draftPdf, contentType: 'application/pdf' });
    const photos = await loadUnitOrFacilityPhotos(ctx, { unitId: c.unit_id, unitTypeId: c.unit_type_id, facilityId: c.facility_id, coverMediaId: c.facility.cover_media_id, limit: 2 });
    attachMediaWithPreviews(model, photos, `Hinh-anh-kho-${c.unit.code}`, (_m, idx) => `Hình ảnh khu vực kho ${c.unit.code} (#${idx + 1})`);
    return;
  }

  if (ctx.event === 'contract.signed' || ctx.event === 'handover.completed') {
    model.securityNotice = WEB_ONLY_PIN_NOTICE;
    const signedPdf = await loadContractDocPdf(['CONTRACT', 'TRANSFER_ADDENDUM'], true, true);
    if (signedPdf) model.attachments.push({ filename: `Hop-dong-${c.code}.pdf`, content: signedPdf, contentType: 'application/pdf' });

    const handoverStored = await loadContractDocPdf(['HANDOVER_MOVE_IN'], false, true);
    if (handoverStored) {
      model.attachments.push({ filename: `Bien-ban-ban-giao-${c.code}.pdf`, content: handoverStored, contentType: 'application/pdf' });
    }

    if (ctx.event === 'handover.completed') {
      const insp = await ctx.prisma.inspection.findFirst({
        where: { contract_id: c.id, type: 'MOVE_IN' },
        orderBy: { id: 'desc' },
        include: { items: true },
      });
      if (insp) {
        const itemRows = insp.items.map((it) => [
          INSPECTION_ITEM_LABEL[it.item_code] ?? it.item_code,
          CONDITION_LABEL[it.condition] ?? it.condition,
          it.note || 'Đạt tiêu chuẩn bàn giao',
        ]);
        if (itemRows.length) {
          model.tables.push({
            heading: 'Biên bản kiểm tra hiện trạng kho khi bàn giao',
            headers: ['Hạng mục kiểm tra', 'Tình trạng', 'Ghi chú hiện trạng'],
            rows: itemRows,
          });
        }
        if (!handoverStored) {
          const dynHandover = await ctx.pdf.render(
            `BIÊN BẢN BÀN GIAO NHẬN KHO ${c.unit.code}`,
            `${c.code} · ${c.facility.name}`,
            [
              { heading: 'Thông tin bàn giao', rows: [['Mã hợp đồng', c.code], ['Kho bàn giao', `${c.unit.code} (${c.unit.zone.name}, tầng ${c.unit.zone.floor})`], ['Khách hàng nhận kho', c.customer.full_name], ['Thời điểm hoàn tất', fmtDateTime(insp.completed_at ?? insp.created_at, tz)]] },
              ...(itemRows.length ? [{ heading: 'Checklist kiểm tra hiện trạng', table: { headers: ['Hạng mục', 'Đánh giá', 'Ghi chú'], widths: [175, 100, 208], rows: itemRows } } satisfies PdfSection] : []),
            ],
            `Biên bản bàn giao nhận kho điện tử của ${config.brandName}.`,
          );
          model.attachments.push({ filename: `Bien-ban-ban-giao-${c.code}.pdf`, content: dynHandover, contentType: 'application/pdf' });
        }
        const itemIds = insp.items.map((i) => i.id);
        if (itemIds.length) {
          const mediaRows = await ctx.prisma.mediaFile.findMany({
            where: { status: 'READY', related_type: 'inspection_item', related_id: { in: itemIds } },
            orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
          });
          const loaded = await readMediaRecords(ctx.storage, mediaRows);
          attachMediaWithPreviews(model, loaded, `Hien-trang-nhan-kho-${c.unit.code}`, (m, idx) => {
            const matched = insp.items.find((it) => it.id === m.related_id);
            const lbl = matched ? INSPECTION_ITEM_LABEL[matched.item_code] ?? matched.item_code : 'Hiện trạng kho';
            return `${lbl} — Kho ${c.unit.code} (#${idx + 1})`;
          });
        }
      }
    }
    return;
  }

  if (ctx.event.startsWith('renewal.') || ['contract.price_change_notice', 'contract.holdover_started', 'contract.expired'].includes(ctx.event)) {
    const offer = c.renewal_offers[0];
    if (offer) model.kvRows.push(['Đơn giá kỳ gia hạn', `${moneyVnd(offer.offered_monthly_rent)} / tháng`], ['Hạn xác nhận ưu đãi gia hạn', fmtDate(offer.expires_on)]);
    if (ctx.event === 'renewal.completed' || ctx.event === 'renewal.auto_renewed') {
      const addendumPdf = await loadContractDocPdf(['RENEWAL_ADDENDUM', 'CONTRACT'], true, true);
      if (addendumPdf) model.attachments.push({ filename: `Phu-luc-gia-han-${c.code}.pdf`, content: addendumPdf, contentType: 'application/pdf' });
      const renInv = await ctx.prisma.invoice.findFirst({
        where: { contract_id: c.id, type: { in: ['RENEWAL', 'RECURRING'] } },
        orderBy: { id: 'desc' },
        include: { items: true, customer: true, facility: true, contract: { include: { unit: true } }, reservation: true },
      });
      if (renInv) {
        const invPdf = await renderInvoicePdfBuffer(ctx, renInv);
        model.attachments.push({ filename: `Hoa-don-${renInv.code}.pdf`, content: invPdf, contentType: 'application/pdf' });
      }
    } else {
      const noticePdf = await ctx.pdf.render(
        `THÔNG BÁO GIA HẠN HỢP ĐỒNG ${c.code}`,
        `${c.facility.name} · Kho ${c.unit.code}`,
        [{ heading: 'Thông tin kỳ hạn & biểu giá gia hạn', rows: model.kvRows }, { heading: 'Nội dung thông báo', paragraphs: model.leadParagraphs }],
        `Thông báo chính thức từ hệ thống quản lý hợp đồng ${config.brandName}.`,
      );
      model.attachments.push({ filename: `Thong-bao-gia-han-${c.code}.pdf`, content: noticePdf, contentType: 'application/pdf' });
    }
    return;
  }

  if (['access.suspended', 'access.restored', 'final_notice.sent', 'contract.terminated'].includes(ctx.event)) {
    const openInvs = await ctx.prisma.invoice.findMany({ where: { contract_id: c.id, status: { in: ['ISSUED', 'PARTIALLY_PAID'] } }, orderBy: { due_date: 'asc' } });
    if (openInvs.length) {
      model.tables.push({
        heading: 'Bảng kê hóa đơn quá hạn / dư nợ hiện hành',
        headers: ['Mã hóa đơn', 'Hạn thanh toán', 'Tổng hóa đơn', 'Còn phải trả'],
        alignRightCols: [2, 3],
        rows: openInvs.map((i) => [i.code, fmtDate(i.due_date), moneyVnd(i.total), moneyVnd(Math.max(0, Number(i.total) - Number(i.amount_paid) - Number(i.amount_credited)))]),
      });
    }
    if (ctx.event !== 'access.restored') {
      const docTypes = ctx.event === 'contract.terminated' ? ['TERMINATION_NOTICE', 'FINAL_NOTICE'] : ['FINAL_NOTICE'];
      let noticePdf = await loadContractDocPdf(docTypes, false, false);
      if (!noticePdf) {
        const pdfTitle = ctx.event === 'contract.terminated' ? `THÔNG BÁO CHẤM DỨT HỢP ĐỒNG ${c.code}` : ctx.event === 'final_notice.sent' ? `THÔNG BÁO QUÁ HẠN LẦN CUỐI — ${c.code}` : `THÔNG BÁO TẠM NGƯNG QUYỀN TRUY CẬP KHO ${c.unit.code}`;
        noticePdf = await ctx.pdf.render(
          pdfTitle,
          `${c.code} · Kho ${c.unit.code} · ${c.facility.name}`,
          [
            { heading: 'Thông tin hợp đồng & kho lưu trữ', rows: model.kvRows },
            { heading: 'Nội dung thông báo', paragraphs: model.leadParagraphs },
            ...(openInvs.length ? [{ heading: 'Chi tiết công nợ quá hạn', table: { headers: ['Mã HĐ', 'Hạn thanh toán', 'Tổng cộng', 'Còn nợ'], widths: [130, 110, 120, 123], rows: openInvs.map((i) => [i.code, fmtDate(i.due_date), moneyVnd(i.total), moneyVnd(Math.max(0, Number(i.total) - Number(i.amount_paid) - Number(i.amount_credited)))]) } } satisfies PdfSection] : []),
          ],
          `Văn bản thông báo pháp lý phát hành từ hệ thống ${config.brandName}.`,
        );
      }
      model.attachments.push({ filename: `Thong-bao-hop-dong-${c.code}.pdf`, content: noticePdf, contentType: 'application/pdf' });

      const [overlocks, cnotes] = await Promise.all([
        ctx.prisma.overlock.findMany({ where: { contract_id: c.id }, select: { id: true } }),
        ctx.prisma.collectionNote.findMany({ where: { contract_id: c.id }, select: { id: true } }),
      ]);
      const ors = [
        ...(overlocks.length ? [{ related_type: 'overlock', related_id: { in: overlocks.map((o) => o.id) } }] : []),
        ...(cnotes.length ? [{ related_type: 'collection_note', related_id: { in: cnotes.map((n) => n.id) } }] : []),
      ];
      if (ors.length) {
        const mediaRows = await ctx.prisma.mediaFile.findMany({ where: { status: 'READY', OR: ors }, orderBy: { id: 'desc' }, take: 6 });
        const loaded = await readMediaRecords(ctx.storage, mediaRows);
        attachMediaWithPreviews(model, loaded, `Bang-chung-cong-no-${c.unit.code}`, (_m, idx) => `Bằng chứng hồ sơ công nợ (#${idx + 1})`);
      }
    }
  }
}

export async function enrichMoveOut(ctx: EnrichContext, id: bigint, relatedType: string, model: EmailComposeModel) {
  let mo = relatedType === 'moveout_request' || relatedType === 'move_out_request' ? await ctx.prisma.moveOutRequest.findUnique({ where: { id } }) : null;
  let contractId = mo?.contract_id ?? (relatedType === 'contract' ? id : null);
  if (!contractId && relatedType === 'deposit_settlement') {
    const st0 = await ctx.prisma.depositSettlement.findUnique({ where: { id } });
    contractId = st0?.contract_id ?? null;
  }
  if (!contractId) return;
  if (!mo) mo = await ctx.prisma.moveOutRequest.findFirst({ where: { contract_id: contractId, status: { not: 'CANCELLED' } }, orderBy: { id: 'desc' } });

  const c = await ctx.prisma.contract.findUnique({
    where: { id: contractId },
    include: { customer: true, facility: true, unit: { include: { zone: true } }, unit_type: true, settlement: true, documents: { orderBy: { id: 'desc' } } },
  });
  if (!c) return;
  const tz = c.facility.timezone;
  const facAddr = [c.facility.address_line, c.facility.ward, c.facility.district, c.facility.province].filter(Boolean).join(', ');
  const appt = mo?.appointment_id ? await ctx.prisma.appointment.findUnique({ where: { id: mo.appointment_id } }) : null;

  model.categoryBadge = 'TRẢ KHO & QUYẾT TOÁN';
  model.referenceCode = c.code;
  model.userFullName ||= c.customer.full_name;
  model.facilityFooter = facilityFooterOf(c.facility);

  model.kvRows.push(
    ['Mã hợp đồng', c.code],
    ['Kho bàn giao trả', `Kho ${c.unit.code} (${c.unit.zone.name}, tầng ${c.unit.zone.floor})`],
    ['Cơ sở lưu trữ', `${c.facility.name} — ${facAddr}`],
    ...(mo ? [['Ngày đăng ký trả kho', fmtDate(mo.requested_date)] as [string, string]] : []),
    ...(appt ? [['Khung giờ hẹn kiểm tra', `${fmtDateTime(appt.scheduled_start, tz)} – ${timeIn(appt.scheduled_end, tz)}`] as [string, string]] : []),
  );

  const est = (mo?.estimated_settlement ?? {}) as Record<string, number | undefined>;

  if (ctx.event === 'moveout.scheduled' && mo) {
    const start = appt?.scheduled_start ?? zonedToUtc(ymd(mo.requested_date)!, '09:00', tz);
    const end = appt?.scheduled_end ?? new Date(start.getTime() + 3600_000);
    const ics = buildIcsBuffer({
      uid: `moveout-${mo.public_id}`,
      summary: `[${config.brandName}] Lịch kiểm tra trả kho ${c.unit.code} (${c.code})`,
      description: `Kiểm tra hiện trạng và bàn giao trả kho ${c.unit.code} tại ${c.facility.name}. Vui lòng dọn sạch tài sản và tháo khóa cá nhân.`,
      location: `${c.facility.name}, ${facAddr}`,
      start,
      end,
    });
    model.attachments.push({ filename: `Lich-tra-kho-${slugAscii(c.unit.code)}.ics`, content: ics, contentType: 'text/calendar; charset=utf-8' });

    const estRows: string[][] = [
      ['Tiền đặt cọc đang giữ', moneyVnd(est.deposit ?? 0)],
      ['Công nợ hóa đơn tạm tính cấn trừ', moneyVnd(est.outstanding ?? 0)],
      ...(Number(est.prepaidRefund ?? 0) > 0 ? [['Tiền thuê trả trước hoàn lại dự kiến', moneyVnd(est.prepaidRefund)]] : []),
      ['Dự kiến số tiền quyết toán ròng', moneyVnd(est.net ?? 0)],
    ];
    model.tables.push({ heading: 'Tạm tính quyết toán tiền đặt cọc ban đầu', headers: ['Khoản mục tạm tính', 'Số tiền'], alignRightCols: [1], rows: estRows });

    const schedPdf = await ctx.pdf.render(
      `PHIẾU XÁC NHẬN LỊCH TRẢ KHO ${c.unit.code}`,
      `${c.code} · Ngày ${fmtDate(mo.requested_date)}`,
      [{ heading: 'Thông tin đăng ký trả kho', rows: model.kvRows }, { heading: 'Bảng tạm tính quyết toán cọc', table: { headers: ['Khoản mục', 'Số tiền'], widths: [330, 153], rows: estRows } }],
      `Phiếu xác nhận đăng ký trả kho điện tử của ${config.brandName}.`,
    );
    model.attachments.push({ filename: `Xac-nhan-lich-tra-kho-${c.code}.pdf`, content: schedPdf, contentType: 'application/pdf' });
    return;
  }

  const insps = await ctx.prisma.inspection.findMany({
    where: { contract_id: c.id, type: { in: ['MOVE_IN', 'MOVE_OUT'] } },
    include: { items: true, damage_items: true },
    orderBy: { id: 'asc' },
  });
  const moveIn = insps.find((i) => i.type === 'MOVE_IN');
  const moveOut = [...insps].reverse().find((i) => i.type === 'MOVE_OUT');

  const allCodes = [...new Set([...(moveIn?.items ?? []).map((i) => i.item_code), ...(moveOut?.items ?? []).map((i) => i.item_code)])];
  const compareRows = allCodes.map((code) => {
    const a = moveIn?.items.find((i) => i.item_code === code);
    const b = moveOut?.items.find((i) => i.item_code === code);
    return [
      INSPECTION_ITEM_LABEL[code] ?? code,
      a ? CONDITION_LABEL[a.condition] ?? a.condition : '—',
      b ? CONDITION_LABEL[b.condition] ?? b.condition : '—',
      b?.note || a?.note || 'Bình thường',
    ];
  });
  if (compareRows.length) {
    model.tables.push({
      heading: 'Đối chiếu hiện trạng kho (Khi nhận vs Khi trả)',
      headers: ['Hạng mục', 'Khi nhận kho', 'Khi trả kho', 'Ghi chú kiểm tra'],
      rows: compareRows,
    });
  }

  const damages = (moveOut?.damage_items ?? []).filter((d) => d.approval_status !== 'REJECTED');
  if (damages.length) {
    model.tables.push({
      heading: 'Chi tiết chi phí hư hại / vệ sinh phát sinh',
      headers: ['Nội dung ghi nhận', 'Trạng thái duyệt', 'Số tiền'],
      alignRightCols: [2],
      rows: damages.map((d) => [d.description, d.approval_status === 'PENDING' ? 'Chờ duyệt' : 'Đã xác nhận', moneyVnd(d.amount)]),
    });
  }

  const st = c.settlement;
  const depositAmt = Number(st?.deposit_amount ?? est.deposit ?? 0);
  const outApplied = Number(st?.outstanding_applied ?? est.outstanding ?? 0);
  const dmgTotal = Number(st?.damage_total ?? damages.reduce((s, d) => s + Number(d.amount), 0));
  const cleanTotal = Number(st?.cleaning_total ?? 0);
  const prepRefund = Number(st?.prepaid_refund ?? est.prepaidRefund ?? 0);
  const netAmt = Number(st?.net_amount ?? est.net ?? depositAmt + prepRefund - outApplied - dmgTotal - cleanTotal);

  const stRows: string[][] = [
    ['Tiền đặt cọc bảo đảm hợp đồng', moneyVnd(depositAmt)],
    ...(prepRefund > 0 ? [['Hoàn tiền thuê trả trước chưa sử dụng', `+ ${moneyVnd(prepRefund)}`]] : []),
    ['Cấn trừ công nợ hóa đơn chưa thanh toán', `- ${moneyVnd(outApplied)}`],
    ['Khấu trừ chi phí hư hại & vệ sinh kho', `- ${moneyVnd(dmgTotal + cleanTotal)}`],
    [netAmt >= 0 ? 'SỐ TIỀN HOÀN TRẢ CHO KHÁCH HÀNG' : 'SỐ TIỀN KHÁCH HÀNG CẦN THANH TOÁN THÊM', moneyVnd(Math.abs(netAmt))],
  ];
  model.tables.push({ heading: 'Bảng quyết toán tiền đặt cọc hợp đồng', headers: ['Khoản mục quyết toán', 'Số tiền'], alignRightCols: [1], rows: stRows });

  const outItemIds = (moveOut?.items ?? []).map((i) => i.id);
  const dmgIds = (moveOut?.damage_items ?? []).map((d) => d.id);
  const photoOrs = [
    ...(outItemIds.length ? [{ related_type: 'inspection_item', related_id: { in: outItemIds } }] : []),
    ...(dmgIds.length ? [{ related_type: { in: ['damage_item', 'inspection_damage'] }, related_id: { in: dmgIds } }] : []),
  ];
  const mediaRows = photoOrs.length ? await ctx.prisma.mediaFile.findMany({ where: { status: 'READY', OR: photoOrs }, orderBy: [{ sort_order: 'asc' }, { id: 'asc' }] }) : [];
  const loadedPhotos = await readMediaRecords(ctx.storage, mediaRows);

  const settlementPdf = await ctx.pdf.render(
    `BIÊN BẢN KIỂM TRA TRẢ KHO & QUYẾT TOÁN CỌC`,
    `${c.code} · Kho ${c.unit.code} · ${c.facility.name}`,
    [
      { heading: 'Thông tin hợp đồng & trả kho', rows: [...model.kvRows, ['Trạng thái quyết toán', st?.status === 'FINALIZED' ? 'Đã chốt chính thức' : 'Dự thảo đối soát']] },
      ...(compareRows.length ? [{ heading: 'Đối chiếu hiện trạng Nhận kho vs Trả kho', table: { headers: ['Hạng mục', 'Nhận kho', 'Trả kho', 'Ghi chú'], widths: [145, 85, 85, 168], rows: compareRows } } satisfies PdfSection] : []),
      ...(damages.length ? [{ heading: 'Các khoản hư hại / phí vệ sinh phát sinh', table: { headers: ['Mô tả', 'Trạng thái', 'Số tiền'], widths: [265, 100, 118], rows: damages.map((d) => [d.description, d.approval_status, moneyVnd(d.amount)]) } } satisfies PdfSection] : []),
      { heading: 'Tổng hợp quyết toán tiền cọc', table: { headers: ['Khoản mục', 'Số tiền'], widths: [340, 143], rows: stRows } },
      ...loadedPhotos.filter((m) => m.mime_type.startsWith('image/')).slice(0, 4).map((m, idx) => ({
        heading: idx === 0 ? 'Hình ảnh hiện trạng kiểm tra trả kho & hư hại' : undefined,
        image: { buffer: m.buffer, caption: m.caption ?? `Ảnh kiểm tra trả kho ${c.unit.code} (#${idx + 1})`, width: 210 },
      })),
    ],
    `Biên bản kiểm tra trả kho và quyết toán tiền đặt cọc phát hành bởi ${config.brandName}.`,
  );
  model.attachments.push({ filename: `Quyet-toan-tra-kho-${c.code}.pdf`, content: settlementPdf, contentType: 'application/pdf' });

  const hoDoc = c.documents.find((d) => d.type === 'HANDOVER_MOVE_OUT');
  if (hoDoc) {
    const hoMedia = await ctx.prisma.mediaFile.findUnique({ where: { id: hoDoc.media_file_id } });
    const hoBuf = hoMedia ? await ctx.storage.read(hoMedia.bucket, hoMedia.object_key).catch(() => null) : null;
    if (hoBuf && hoBuf.length) {
      model.attachments.push({ filename: `Bien-ban-ban-giao-tra-kho-${c.code}.pdf`, content: hoBuf, contentType: 'application/pdf' });
    }
  }

  attachMediaWithPreviews(model, loadedPhotos, `Anh-kiem-tra-tra-kho-${c.unit.code}`, (_m, idx) => `Ảnh kiểm tra trả kho ${c.unit.code} (#${idx + 1})`);
}
