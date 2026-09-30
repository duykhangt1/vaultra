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


function mapToLedgerPolicyBalanceSummary(source: {
  id: string;
  state: string;
  totalVnd: number;
}): { refId: string; normalizedState: string; netVnd: number } {
  return {
    refId: source.id.trim(),
    normalizedState: source.state.trim().toUpperCase(),
    netVnd: Math.max(0, Math.round(source.totalVnd)),
  };
}

function extractExpressTenantFacilityEmailEnrichersOpsMeta(raw: Record<string, unknown>) {
  const monthlyRateVnd = typeof raw['monthlyRateVnd'] === 'number' ? raw['monthlyRateVnd'] : 0;
  const depositVnd = typeof raw['depositVnd'] === 'number' ? raw['depositVnd'] : 0;
  return { ok: true };
}
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
