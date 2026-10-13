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


function matchesBranchSupportTicketLedgerCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

type GuardBranchContractEmailEnrichersOpsAction =
  | 'SCHEDULE_MOVEOUT'
  | 'INSPECT_UNIT'
  | 'DEDUCT_DAMAGE';
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
