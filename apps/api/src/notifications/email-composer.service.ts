import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { PdfService } from '../media/pdf.service';
import { StorageService } from '../media/storage.service';
import { capEmailAttachments, EmailAttachment } from './email.provider';
import {
  buildQrPngBuffer,
  EmailComposeModel,
  EnrichContext,
  renderEmailHtml,
  renderEmailText,
  WEB_ONLY_PIN_NOTICE,
} from './email-layout';
import {
  enrichAbandonedGoods,
  enrichCollectionNote,
  enrichInvoice,
  enrichOverlock,
  enrichPayment,
  enrichRefund,
  enrichReportExport,
  enrichTicket,
  enrichWorkOrder,
} from './email-enrichers-ops';
import {
  enrichAppointment,
  enrichContract,
  enrichMoveOut,
  enrichReservation,
} from './email-enrichers-rental';

export interface ComposeEmailInput {
  event: string;
  title: string;
  body: string;
  recipientEmail: string;
  userId?: bigint | null;
  userFullName?: string | null;
  vars?: Record<string, unknown>;
  actionUrl?: string;
  actionLabel?: string;
  related?: { type: string; id: bigint } | null;
  extraAttachments?: EmailAttachment[];
}

export interface ComposedEmailOutput {
  html: string;
  text: string;
  attachments: EmailAttachment[];
}

function defaultCategoryBadge(event: string): string {
  if (event.startsWith('auth.') || event.startsWith('user.') || event.startsWith('privacy.')) return 'TÀI KHOẢN & BẢO MẬT';
  if (event.startsWith('reservation.') || event.startsWith('allocation.') || event === 'unit.unfit_reassigned') return 'ĐẶT KHO LƯU TRỮ';
  if (event.startsWith('appointment.')) return 'LỊCH HẸN CƠ SỞ';
  if (event.startsWith('renewal.')) return 'GIA HẠN HỢP ĐỒNG';
  if (event.startsWith('moveout.') || event.startsWith('settlement.')) return 'TRẢ KHO & QUYẾT TOÁN';
  if (event.startsWith('contract.') || event.startsWith('handover.') || event.startsWith('access.') || event.startsWith('inspection.')) return 'HỢP ĐỒNG THUÊ KHO';
  if (
    event.startsWith('invoice.') ||
    event.startsWith('payment.') ||
    event.startsWith('refund.') ||
    event.startsWith('charge.') ||
    event.startsWith('late_fee.') ||
    event.startsWith('overlock.') ||
    event.startsWith('collection.') ||
    event.startsWith('final_notice.') ||
    event.startsWith('abandoned_goods.')
  ) {
    return 'THANH TOÁN & CÔNG NỢ';
  }
  if (event.startsWith('ticket.') || event.startsWith('contact.') || event.startsWith('assistant.')) return 'HỖ TRỢ KHÁCH HÀNG';
  if (event.startsWith('workorder.') || event.startsWith('work_order.')) return 'BẢO TRÌ KỸ THUẬT';
  if (event.startsWith('shift.')) return 'LỊCH TRỰC VẬN HÀNH';
  if (event.startsWith('report.')) return 'BÁO CÁO KẾT XUẤT';
  return 'THÔNG BÁO HỆ THỐNG';
}

function defaultActionLabel(event: string): string {
  if (event === 'auth.verify_email') return 'Xác minh địa chỉ email';
  if (event === 'auth.password_reset') return 'Đặt lại mật khẩu tài khoản';
  if (event === 'user.invited' || event === 'user.staff_invited') return 'Kích hoạt tài khoản nhân sự';
  if (event === 'contract.sign_email') return 'Xem & ký hợp đồng điện tử';
  if (event.startsWith('invoice.') || event.startsWith('late_fee.') || event === 'payment.failed') return 'Thanh toán hóa đơn trực tuyến';
  if (event.startsWith('reservation.')) return 'Xem chi tiết đơn đặt kho';
  if (event.startsWith('appointment.')) return 'Xem chi tiết lịch hẹn';
  if (event.startsWith('contract.') || event.startsWith('handover.') || event.startsWith('renewal.') || event.startsWith('access.')) return 'Xem hợp đồng trên Cổng khách hàng';
  if (event.startsWith('moveout.') || event.startsWith('settlement.')) return 'Xem hồ sơ quyết toán trả kho';
  if (event.startsWith('ticket.')) return 'Xem & phản hồi phiếu hỗ trợ';
  if (event.startsWith('workorder.') || event.startsWith('work_order.')) return 'Xem phiếu bảo trì kỹ thuật';
  if (event.startsWith('report.')) return 'Mở trang báo cáo kết xuất';
  return 'Xem chi tiết trên hệ thống';
}
