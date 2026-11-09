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

type CodeDomain = 'reservation' | 'contract' | 'invoice' | 'payment' | 'refund' | 'ticket' | 'work_order';

function preferredDomainsForEvent(event: string): CodeDomain[] {
  const base: CodeDomain[] = ['reservation', 'contract', 'invoice', 'payment', 'refund', 'ticket', 'work_order'];
  let first: CodeDomain | null = null;
  if (event.startsWith('payment.')) first = 'payment';
  else if (event.startsWith('refund.')) first = 'refund';
  else if (event.startsWith('invoice.') || event.startsWith('charge.') || event.startsWith('late_fee.')) first = 'invoice';
  else if (event.startsWith('ticket.')) first = 'ticket';
  else if (event.startsWith('workorder.') || event.startsWith('work_order.') || event === 'unit.unfit_reassigned') first = 'work_order';
  else if (event.startsWith('contract.') || event.startsWith('renewal.') || event.startsWith('handover.') || event.startsWith('access.') || event.startsWith('moveout.') || event.startsWith('settlement.') || event.startsWith('final_notice.')) first = 'contract';
  else if (event.startsWith('reservation.') || event.startsWith('allocation.')) first = 'reservation';
  return first ? [first, ...base.filter((d) => d !== first)] : base;
}

@Injectable()
export class EmailComposerService {
  private readonly logger = new Logger('EmailComposer');

  constructor(
    private prisma: PrismaService,
    private pdf: PdfService,
    private storage: StorageService,
  ) {}

  private async resolveRelatedFromText(event: string, haystack: string): Promise<{ type: string; id: bigint } | null> {
    for (const domain of preferredDomainsForEvent(event)) {
      if (domain === 'reservation') {
        const m = /\b(RSV-\d{4}-\d{4,})\b/.exec(haystack);
        if (m) {
          const r = await this.prisma.reservation.findUnique({ where: { code: m[1] }, select: { id: true } });
          if (r) return { type: 'reservation', id: r.id };
        }
      } else if (domain === 'contract') {
        const m = /\b(CT-\d{4}-\d{4,})\b/.exec(haystack);
        if (m) {
          const c = await this.prisma.contract.findUnique({ where: { code: m[1] }, select: { id: true } });
          if (c) return { type: 'contract', id: c.id };
        }
      } else if (domain === 'invoice') {
        const m = /\b(INV-\d{4}-\d{4,})\b/.exec(haystack);
        if (m) {
          const inv = await this.prisma.invoice.findUnique({ where: { code: m[1] }, select: { id: true } });
          if (inv) return { type: 'invoice', id: inv.id };
        }
      } else if (domain === 'payment') {
        const m = /\b((?:RCP|PAY)-\d{4}-\d{4,})\b/.exec(haystack);
        if (m) {
          const p = await this.prisma.payment.findUnique({ where: { code: m[1] }, select: { id: true } });
          if (p) return { type: 'payment', id: p.id };
        }
      } else if (domain === 'refund') {
        const m = /\bRF-0*(\d{1,12})\b/.exec(haystack);
        if (m) {
          const rf = await this.prisma.refund.findUnique({ where: { id: BigInt(m[1]) }, select: { id: true } });
          if (rf) return { type: 'refund', id: rf.id };
        }
      } else if (domain === 'ticket') {
        const m = /\b((?:SR|TK)-\d{4}-\d{4,})\b/.exec(haystack);
        if (m) {
          const t = await this.prisma.supportTicket.findUnique({ where: { code: m[1] }, select: { id: true } });
          if (t) return { type: 'ticket', id: t.id };
        }
      } else if (domain === 'work_order') {
        const m = /\b(WO-\d{4}-\d{4,})\b/.exec(haystack);
        if (m) {
          const wo = await this.prisma.workOrder.findUnique({ where: { code: m[1] }, select: { id: true } });
          if (wo) return { type: 'work_order', id: wo.id };
        }
      }
    }
    return null;
  }

  private enrichAccountAndSecurity(event: string, vars: Record<string, unknown> | undefined, model: EmailComposeModel) {
    if (!vars) return;
    const str = (k: string) => (vars[k] !== undefined && vars[k] !== null && String(vars[k]).trim() !== '' ? String(vars[k]).trim() : '');
    if (event === 'auth.google_link_code' && str('code')) {
      model.otpCode = {
        code: str('code'),
        label: 'Mã xác thực liên kết tài khoản Google',
        ttlNote: 'Mã có hiệu lực trong vòng 10 phút. Tuyệt đối không chia sẻ mã này cho bất kỳ ai.',
      };
    } else if ((event === 'contract.sign_otp' || event === 'renewal.otp') && str('otp') && !model.otpCode) {
      model.otpCode = {
        code: str('otp'),
        label: event === 'renewal.otp' ? 'Mã OTP xác nhận gia hạn hợp đồng' : 'Mã OTP ký điện tử hợp đồng thuê kho',
        ttlNote: 'Mã OTP có hiệu lực trong vòng 10 phút. Tuyệt đối không chia sẻ mã này cho bất kỳ ai.',
      };
    }
    if (event.startsWith('auth.') || event.startsWith('user.') || event.startsWith('privacy.') || event === 'contact.request') {
      if (str('device')) model.kvRows.push(['Thiết bị thực hiện', str('device')]);
      if (str('ip')) model.kvRows.push(['Địa chỉ IP ghi nhận', str('ip')]);
      if (str('time')) model.kvRows.push(['Thời điểm ghi nhận', str('time')]);
      if (str('minutes')) model.kvRows.push(['Thời gian tạm khóa', `${str('minutes')} phút`]);
      if (str('googleEmail')) model.kvRows.push(['Tài khoản Google liên kết', str('googleEmail')]);
      if (str('roles')) model.kvRows.push(['Vai trò phân quyền', str('roles')]);
      if (str('facility')) model.kvRows.push(['Phạm vi cơ sở', str('facility').replace(/^\s*—\s*/, '')]);
      if (str('reason')) model.kvRows.push(['Lý do ghi nhận', str('reason')]);
    }
    if (event === 'auth.new_device_login' || event === 'auth.token_reuse_detected') {
      model.callouts.push({
        tone: 'warning',
        title: 'Khuyến nghị an toàn bảo mật tài khoản',
        body: 'Nếu Quý khách không trực tiếp thực hiện phiên đăng nhập này, vui lòng truy cập mục Tài khoản → Bảo mật để thu hồi toàn bộ thiết bị đang hoạt động và cập nhật mật khẩu mới ngay lập tức.',
      });
    }
  }

  async compose(input: ComposeEmailInput): Promise<ComposedEmailOutput> {
    const paragraphs = input.body
      .split(/\n{2,}|\r\n\r\n/)
      .map((s) => s.trim())
      .filter(Boolean);

    let recipientUser: EnrichContext['recipientUser'] = null;
    if (input.userId) {
      try {
        const u = await this.prisma.user.findUnique({
          where: { id: input.userId },
          include: { customer: { select: { full_name: true } }, roles: { where: { revoked_at: null }, include: { role: true } } },
        });
        if (u) {
          recipientUser = {
            id: u.id,
            full_name: u.full_name || u.customer?.full_name || '',
            email: u.email,
            isStaff: u.roles.some((r) => r.role.code !== 'CUSTOMER'),
          };
        }
      } catch (err) {
        this.logger.warn(`Failed loading recipient user ${String(input.userId)}: ${(err as Error).message}`);
      }
    }

    const bodyGreetMatch = /^Xin\s+chào\s+([^,.!\n]+)/i.exec(input.body.trim());
    const varName = typeof input.vars?.name === 'string' ? input.vars.name : typeof input.vars?.customer === 'string' ? input.vars.customer : '';
    const resolvedName = (input.userFullName || recipientUser?.full_name || varName || bodyGreetMatch?.[1] || '').trim() || undefined;

    const model: EmailComposeModel = {
      event: input.event,
      categoryBadge: defaultCategoryBadge(input.event),
      userFullName: resolvedName,
      title: input.title,
      leadParagraphs: paragraphs.length ? paragraphs : [input.body],
      callouts: [],
      kvRows: [],
      tables: [],
      photoPreviews: [],
      attachments: [...(input.extraAttachments ?? [])],
      cta: input.actionUrl ? { url: input.actionUrl, label: input.actionLabel || defaultActionLabel(input.event) } : undefined,
    };

    if (input.event === 'contract.signed' || input.event === 'handover.completed' || input.event === 'access.issued') {
      model.securityNotice = WEB_ONLY_PIN_NOTICE;
    }

    const ctx: EnrichContext = {
      prisma: this.prisma,
      pdf: this.pdf,
      storage: this.storage,
      event: input.event,
      recipientUser,
      vars: input.vars,
      title: input.title,
      body: input.body,
    };

    try {
      const haystack = [
        input.title,
        input.body,
        ...Object.values(input.vars ?? {}).map((v) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '')),
      ].join(' ');
      const rel = input.related?.type && input.related?.id ? input.related : await this.resolveRelatedFromText(input.event, haystack);

      if (rel) {
        switch (rel.type) {
          case 'reservation':
            await enrichReservation(ctx, rel.id, model);
            break;
          case 'appointment':
            await enrichAppointment(ctx, rel.id, model);
            break;
          case 'contract':
            await enrichContract(ctx, rel.id, model);
            break;
          case 'moveout_request':
          case 'move_out_request':
          case 'deposit_settlement':
            await enrichMoveOut(ctx, rel.id, rel.type, model);
            break;
          case 'invoice':
            await enrichInvoice(ctx, rel.id, model);
            break;
          case 'payment':
            await enrichPayment(ctx, rel.id, model);
            break;
          case 'refund':
            await enrichRefund(ctx, rel.id, model);
            break;
          case 'overlock':
            await enrichOverlock(ctx, rel.id, model);
            break;
          case 'collection_note':
            await enrichCollectionNote(ctx, rel.id, model);
            break;
          case 'abandoned_goods':
          case 'abandoned_goods_record':
            await enrichAbandonedGoods(ctx, rel.id, model);
            break;
          case 'ticket':
          case 'support_ticket':
            await enrichTicket(ctx, rel.id, model);
            break;
          case 'workorder':
          case 'work_order':
            await enrichWorkOrder(ctx, rel.id, model);
            break;
          case 'report_export':
            await enrichReportExport(ctx, rel.id, model);
            break;
        }
      }

      if (!model.qrCard) {
        const rsvMatch = /\b(RSV-\d{4}-\d{4,})\b/.exec(haystack);
        if (rsvMatch) {
          const qrBuf = await buildQrPngBuffer(rsvMatch[1]);
          model.qrCard = {
            code: rsvMatch[1],
            cid: 'vaultra-qr',
            caption: 'Quý khách vui lòng xuất trình mã QR này cùng CCCD/Hộ chiếu bản gốc tại quầy lễ tân khi làm thủ tục nhận kho.',
          };
          model.attachments.push({ filename: `QR-${rsvMatch[1]}.png`, content: qrBuf, contentType: 'image/png', cid: 'vaultra-qr', contentDisposition: 'attachment' });
        }
      }
    } catch (err) {
      this.logger.warn(`Email enrichment fallback on ${input.event}: ${(err as Error).message}`);
    }

    this.enrichAccountAndSecurity(input.event, input.vars, model);

    model.attachments = capEmailAttachments(model.attachments);
    const keptCids = new Set(model.attachments.map((a) => a.cid).filter(Boolean));
    model.photoPreviews = model.photoPreviews.filter((p) => keptCids.has(p.cid));
    if (model.qrCard && !keptCids.has(model.qrCard.cid)) model.qrCard = undefined;

    return {
      html: renderEmailHtml(model),
      text: renderEmailText(model),
      attachments: model.attachments,
    };
  }
}
