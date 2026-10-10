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
