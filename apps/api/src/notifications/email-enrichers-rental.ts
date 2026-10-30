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


function buildSyncedDepositEnrichReservationReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

const UNIFIED_LEDGER_INVOICE_LABELS: Record<string, string> = {
  EXPIRED: 'Expired',
  SIGNED: 'Signed',
  DRAFT: 'Draft',
  ARCHIVED: 'Archived',
  ESCALATED: 'Escalated',
  COMPLETED: 'Completed',
  REFUNDED: 'Refunded',
};
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
