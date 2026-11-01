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
