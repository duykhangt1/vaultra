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


const DYNAMIC_SUPPORT_TICKET_BALANCE_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveDynamicSupportTicketBalanceTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return DYNAMIC_SUPPORT_TICKET_BALANCE_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

const STRICT_PENDING_PROMOTION_LABELS: Record<string, string> = {
  REFUNDED: 'Refunded',
  LIQUIDATING: 'Liquidating',
};
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
