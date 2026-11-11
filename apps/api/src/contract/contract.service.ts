import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService, Tx } from '../common/prisma.service';
import { AppError, notFound, validation } from '../common/errors';
import { D, newId, nextCode, sha256 } from '../common/util';
import { addDays, addMonths, fmtDate, fmtDateTime, ymd } from '../common/dates';
import { CoreService, fmt } from '../domain/core.service';
import { PdfService, PdfSection, PdfOptions } from '../media/pdf.service';
import { buildContract, ContractSig } from './contract-template';
import { splitSignature } from '../common/signature';
import { MediaService } from '../media/media.service';
import { NotificationService } from '../notifications/notification.service';
import { AuditService } from '../audit/audit.service';
import { config } from '../common/config';
import { formatInTimeZone } from 'date-fns-tz';
import type { AccessContext } from '../auth/access-context';
import { INSPECTION_ITEM_LABEL } from '@vaultra/shared';
import { Prisma } from '../generated/prisma/client';

const TEMPLATE_VERSION = '2026.12';

/**
 * Contracts (spec module 16, §6.2 step 4, §10.4): draft from template + price/policy snapshot,
 * immutable PDF with SHA-256, e-signature (email OTP + drawn signature) and lessor system seal,
 * amendments history.
 */
@Injectable()
export class ContractService {
  constructor(
    private prisma: PrismaService,
    private core: CoreService,
    private pdf: PdfService,
    private media: MediaService,
    private notify: NotificationService,
    private audit: AuditService,
  ) {}

  /** F1 step 8: draft contract when a unit is assigned (contracts.unit_id is NOT NULL). */
  async ensureDraft(tx: Tx, reservationId: bigint, unitId: bigint, actor: bigint | null) {
    const r = await tx.reservation.findUniqueOrThrow({ where: { id: reservationId }, include: { quote: true, customer: true, unit_type: true, facility: true } });
    const unit = await tx.unit.findUniqueOrThrow({ where: { id: unitId }, include: { zone: true } });
    const existing = await tx.contract.findUnique({ where: { reservation_id: reservationId } });
    const deposit = await tx.deposit.findUnique({ where: { reservation_id: reservationId } });
    const promo = r.quote.promotion_id ? await tx.promotion.findUnique({ where: { id: r.quote.promotion_id } }) : null;
    const snapshot = {
      customer: { name: r.customer.full_name, email: r.customer.email, phone: r.customer.phone, address: [r.customer.address_line, r.customer.district, r.customer.province].filter(Boolean).join(', '), code: r.customer.code },
      facility: { name: r.facility.name, address: `${r.facility.address_line}, ${r.facility.district}, ${r.facility.province}`, phone: r.facility.phone, accessHours: r.facility.access_hours },
      unit: { code: unit.code, zone: unit.zone.name, floor: unit.zone.floor, type: r.unit_type.name, size: `${r.unit_type.width_m} × ${r.unit_type.depth_m} × ${r.unit_type.height_m} m`, area: Number(r.unit_type.area_m2 ?? 0) },
      price: { monthlyRent: Number(r.quote.monthly_rent), deposit: Number(r.quote.deposit_amount), adminFee: Number(r.quote.admin_fee), termMonths: r.term_months, billingMode: r.billing_mode },
      promotion: promo ? { id: promo.id.toString(), name: promo.name, type: promo.type, value: Number(promo.value), periods: promo.applies_to_periods } : null,
      policyVersionId: r.quote.policy_version_id.toString(),
    };
    if (existing) {
      if (existing.unit_id === unitId && existing.unit_type_id === r.unit_type_id && Number(existing.monthly_rent) === Number(r.quote.monthly_rent)) return existing;
      const updated = await tx.contract.update({ where: { id: existing.id }, data: { unit_id: unitId, unit_type_id: r.unit_type_id, monthly_rent: r.quote.monthly_rent, snapshot, version: { increment: 1 } } });
      await tx.contractAmendment.create({ data: { contract_id: existing.id, type: 'UNIT_TRANSFER', before: { unit: (existing.snapshot as { unit?: unknown }).unit ?? null } as object, after: { unit: snapshot.unit }, reason: 'Đổi kho trước khi nhận', effective_date: this.core.today(), created_by: actor } });
      await this.generateDocument(tx, updated.id, ['SIGNED', 'ACTIVE'].includes(existing.status) ? 'TRANSFER_ADDENDUM' : 'CONTRACT');
      return updated;
    }
    const contract = await tx.contract.create({
      data: {
        public_id: newId(),
        code: await nextCode(tx, 'CT', this.core.today().getUTCFullYear()),
        customer_id: r.customer_id,
        facility_id: r.facility_id,
        unit_id: unitId,
        unit_type_id: r.unit_type_id,
        reservation_id: r.id,
        status: 'PENDING_SIGNATURE',
        start_date: r.start_date,
        current_end_date: r.end_date,
        effective_end_date: r.end_date,
        billing_mode: r.billing_mode,
        billing_day: r.start_date.getUTCDate(),
        monthly_rent: r.quote.monthly_rent,
        deposit_id: deposit?.id ?? null,
        policy_version_id: r.quote.policy_version_id,
        auto_renew: (await this.core.policyById(r.quote.policy_version_id, tx)).auto_renew_default,
        snapshot,
      },
    });
    await tx.reservation.update({ where: { id: r.id }, data: { contract_id: contract.id } });
    if (deposit) await tx.deposit.update({ where: { id: deposit.id }, data: { contract_id: contract.id } });
    await tx.contractStatusHistory.create({ data: { contract_id: contract.id, from_status: null, to_status: 'PENDING_SIGNATURE', actor_user_id: actor, reason: 'Sinh hợp đồng nháp' } });
    await this.generateDocument(tx, contract.id, 'CONTRACT');
    return contract;
  }

  async contractSections(tx: Tx | PrismaService, contractId: bigint, sig?: ContractSig) {
    const c = await tx.contract.findUniqueOrThrow({ where: { id: contractId } });
    const s = c.snapshot as { customer: Record<string, string>; facility: Record<string, string>; unit: Record<string, string | number>; price: Record<string, number | string>; promotion: { name: string } | null };
    const policy = await this.core.policyById(c.policy_version_id, tx);
    const fac = await tx.facility.findUniqueOrThrow({ where: { id: c.facility_id } });
    const issued = sig?.signedAt ?? this.core.now();
    const dd = (d: Date) => formatInTimeZone(d, fac.timezone, "'ngày' dd 'tháng' MM 'năm' yyyy");
    return buildContract({
      brand: config.brandName,
      code: c.code,
      templateVersion: TEMPLATE_VERSION,
      province: fac.province,
      facility: { name: s.facility.name, address: s.facility.address, phone: s.facility.phone },
      customer: { name: s.customer.name, code: s.customer.code, email: s.customer.email, phone: s.customer.phone, address: s.customer.address },
      unit: { code: String(s.unit.code), type: String(s.unit.type), size: String(s.unit.size), area: s.unit.area, zone: String(s.unit.zone), floor: s.unit.floor },
      startDate: fmtDate(c.start_date),
      endDate: fmtDate(addDays(c.current_end_date, -1)),
      months: Number(s.price.termMonths ?? 1),
      monthlyRent: fmt(c.monthly_rent),
      billingMode: c.billing_mode as 'MONTHLY' | 'PREPAID_TERM',
      billingDay: c.billing_day,
      deposit: fmt(Number(s.price.deposit ?? 0)),
      adminFee: fmt(Number(s.price.adminFee ?? 0)),
      promotion: s.promotion?.name ?? null,
      policy,
      money: (n: number) => fmt(n),
      issued: { day: dd(issued), at: fmtDateTime(issued) },
      today: fmtDate(this.core.today(fac.timezone)),
      signature: sig ? { at: fmtDateTime(sig.signedAt), method: sig.methodLabel, image: sig.image, strokes: sig.strokes } : undefined,
    });
  }

  /** Renders and stores an immutable PDF with SHA-256 (contract_documents). */
  async generateDocument(tx: Tx, contractId: bigint, type: Prisma.ContractDocumentCreateInput['type'], extraSections: PdfSection[] = [], titleOverride?: string, sig?: ContractSig) {
    const c = await tx.contract.findUniqueOrThrow({ where: { id: contractId } });
    const isContract = type === 'CONTRACT' || type === 'TRANSFER_ADDENDUM';
    const base = isContract ? await this.contractSections(tx, contractId, sig) : { title: titleOverride ?? type, subtitle: `${c.code} · mẫu ${TEMPLATE_VERSION}`, sections: [] as PdfSection[], opts: {} as PdfOptions };
    // the signature block stays last: extra sections go before it
    const sections = isContract ? [...base.sections.slice(0, -1), ...extraSections, base.sections[base.sections.length - 1]] : [...base.sections, ...extraSections];
    const title = isContract && type === 'TRANSFER_ADDENDUM' ? 'PHỤ LỤC ĐỔI KHO' : isContract ? base.title : titleOverride ?? base.title;
    const buf = await this.pdf.render(title, base.subtitle, sections, `Tài liệu điện tử do ${config.brandName} phát hành. Mọi chỉnh sửa sau khi phát hành làm thay đổi mã băm SHA-256 và không còn giá trị.`, base.opts);
    const hash = sha256(buf);
    const media = await this.media.storeServerFile(tx, { purpose: type.startsWith('HANDOVER') ? 'HANDOVER_PDF' : 'CONTRACT_PDF', buffer: buf, mime: 'application/pdf', ext: 'pdf', relatedType: 'contract', relatedId: contractId, facilityId: c.facility_id, locked: true });
    return tx.contractDocument.create({ data: { contract_id: contractId, type, template_version: TEMPLATE_VERSION, media_file_id: media.id, sha256: hash, generated_at: this.core.now() } });
  }

  async findForCtx(ctx: AccessContext, publicId: string, perm = 'contract.read', write = false) {
    const c = await this.prisma.contract.findUnique({ where: { public_id: publicId }, include: { customer: true, facility: true, unit: { include: { zone: true } }, unit_type: true } });
    ctx.assertScope(perm, c, 'Hợp đồng', write);
    return c!;
  }

  // ------------------------------------------------------------------ e-signature (§6.2 step 4)
  async sendSignOtp(ctx: AccessContext | null, contractId: bigint) {
    const c = await this.prisma.contract.findUniqueOrThrow({ where: { id: contractId }, include: { customer: true, facility: true, unit: true } });
    if (c.status !== 'PENDING_SIGNATURE') throw new AppError('INVALID_STATUS_TRANSITION', 'Hợp đồng không ở trạng thái chờ ký');
    if (!c.customer.user_id) throw validation('Khách chưa có tài khoản để nhận OTP');
    const otp = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    await this.prisma.authToken.updateMany({ where: { user_id: c.customer.user_id, purpose: 'SIGN_OTP', used_at: null }, data: { used_at: new Date() } });
    await this.prisma.authToken.create({ data: { user_id: c.customer.user_id, purpose: 'SIGN_OTP', token_hash: sha256(`${c.id}:${otp}:${crypto.randomUUID()}`), payload: { contractId: c.id.toString(), otpHash: sha256(`${c.id}:${otp}`), attempts: 0 }, expires_at: new Date(Date.now() + 10 * 60000) } });
    await this.notify.sendDirect(
      c.customer.user_id,
      'contract.sign_otp',
      { code: c.code, otp, facility: c.facility?.name ?? '', unitCode: c.unit?.code ?? '', name: c.customer.full_name },
      undefined,
      undefined,
      { type: 'contract', id: c.id },
    );
    return { message: 'Đã gửi mã OTP tới email khách hàng', email: c.customer.email };
  }

  async sign(ctx: AccessContext, contractId: bigint, otp: string, signaturePng: string) {
    const c = await this.prisma.contract.findUniqueOrThrow({ where: { id: contractId }, include: { customer: true, facility: true, unit: true, documents: { orderBy: { id: 'desc' } } } });
    if (c.status !== 'PENDING_SIGNATURE') throw new AppError('INVALID_STATUS_TRANSITION', 'Hợp đồng không ở trạng thái chờ ký');
    const tok = await this.prisma.authToken.findFirst({ where: { user_id: c.customer.user_id ?? BigInt(0), purpose: 'SIGN_OTP', used_at: null, expires_at: { gt: new Date() } }, orderBy: { id: 'desc' } });
    const payload = tok?.payload as { contractId: string; otpHash: string; attempts: number } | undefined;
    if (!tok || !payload || payload.contractId !== c.id.toString()) throw validation('OTP đã hết hạn, vui lòng gửi lại', [{ field: 'otp', message: 'expired' }]);
    if (payload.attempts >= 5) throw validation('Nhập sai OTP quá nhiều lần, vui lòng gửi lại mã');
    if (sha256(`${c.id}:${otp}`) !== payload.otpHash) {
      await this.prisma.authToken.update({ where: { id: tok.id }, data: { payload: { ...payload, attempts: payload.attempts + 1 } } });
      throw validation('Mã OTP không đúng', [{ field: 'otp', message: 'invalid' }]);
    }
    const split = splitSignature(signaturePng);
    const m = /^data:image\/png;base64,(.+)$/.exec(split.png);
    if (!m) throw validation('Thiếu chữ ký', [{ field: 'signature', message: 'required' }]);
    const sigBuf = Buffer.from(m[1], 'base64');
    if (sigBuf.length < 200 || sigBuf.length > 1_500_000) throw validation('Chữ ký không hợp lệ');
    const doc = c.documents.find((d) => d.type === 'CONTRACT' || d.type === 'TRANSFER_ADDENDUM');
    if (!doc) throw new AppError('CONFLICT', 'Chưa có bản hợp đồng để ký');
    return this.prisma.tx(async (tx) => {
      await tx.authToken.update({ where: { id: tok.id }, data: { used_at: new Date() } });
      const sigMedia = await this.media.storeServerFile(tx, { purpose: 'SIGNATURE', buffer: sigBuf, mime: 'image/png', ext: 'png', relatedType: 'contract', relatedId: c.id, facilityId: c.facility_id, uploadedBy: ctx.userId, locked: true });
      const now = this.core.now();
      await this.core.setContractStatus(tx, c.id, 'SIGNED', ctx.userId, 'Ký điện tử', { signed_at: now });
      const signed = await this.generateDocument(tx, c.id, 'CONTRACT', [], undefined, { signedAt: now, image: sigBuf, strokes: split.strokes, methodLabel: 'Xác thực OTP email', docHash: doc.sha256 });
      await tx.contractSignature.create({ data: { document_id: signed.id, signer_type: 'CUSTOMER', signer_user_id: c.customer.user_id, method: 'OTP_EMAIL', signature_media_id: sigMedia.id, otp_verified_at: now, ip_address: ctx.ip?.slice(0, 45), user_agent: ctx.userAgent?.slice(0, 512), signed_at: now, document_sha256: signed.sha256 } });
      await tx.contractSignature.create({ data: { document_id: signed.id, signer_type: 'LESSOR', method: 'SYSTEM_SEAL', signed_at: now, document_sha256: signed.sha256 } });
      await this.audit.log(ctx, { action: 'contract.sign', entityType: 'contract', entityId: c.id, entityRef: c.code, facilityId: c.facility_id, after: { document: signed.sha256 } }, tx);
      if (c.customer.user_id) {
        await this.notify.notify(
          {
            users: [c.customer.user_id],
            event: 'contract.signed',
            vars: { code: c.code, unitCode: c.unit.code, facility: c.facility.name, hash: signed.sha256.slice(0, 16) },
            link: `/app/contracts/${c.public_id}`,
            related: { type: 'contract', id: c.id },
            email: true,
          },
          tx,
        );
      }
      return tx.contract.findUniqueOrThrow({ where: { id: c.id } });
    });
  }

  /** Step 3 of staff check-in: send email with contract signing link to customer. */
  async sendSignEmailLink(ctx: AccessContext | null, contractId: bigint) {
    const c = await this.prisma.contract.findUniqueOrThrow({ where: { id: contractId }, include: { customer: true, facility: true, unit: true } });
    if (c.status !== 'PENDING_SIGNATURE') throw new AppError('INVALID_STATUS_TRANSITION', 'Hợp đồng không ở trạng thái chờ ký');
    if (!c.customer.user_id) throw validation('Khách chưa có tài khoản để nhận email ký hợp đồng');
    const rawToken = crypto.randomBytes(24).toString('hex');
    await this.prisma.authToken.updateMany({ where: { user_id: c.customer.user_id, purpose: 'SIGN_OTP', used_at: null }, data: { used_at: new Date() } });
    await this.prisma.authToken.create({
      data: {
        user_id: c.customer.user_id,
        purpose: 'SIGN_OTP',
        token_hash: sha256(`EMAIL_SIGN:${c.id}:${rawToken}`),
        payload: { contractId: c.id.toString(), rawToken, mode: 'EMAIL_LINK', attempts: 0 },
        expires_at: new Date(Date.now() + 24 * 3600_000),
      },
    });
    const signPath = `/sign-contract?contractId=${c.public_id}&token=${rawToken}`;
    const actionUrl = `${config.appOrigin}${signPath}`;
    await this.notify.sendDirect(
      c.customer.user_id,
      'contract.sign_email',
      { code: c.code, facility: c.facility.name, unitCode: c.unit.code, name: c.customer.full_name },
      actionUrl,
      'Xem & Ký hợp đồng điện tử',
      { type: 'contract', id: c.id },
    );
    return { message: 'Đã gửi email ký hợp đồng cho khách hàng', email: c.customer.email, signUrl: signPath };
  }

  async getSignEmailInfo(contractPublicId: string, token: string) {
    const c = await this.prisma.contract.findUnique({
      where: { public_id: contractPublicId },
      include: { customer: true, facility: true, unit: { include: { zone: true } }, unit_type: true, documents: { orderBy: { id: 'desc' } } },
    });
    if (!c) throw notFound('Hợp đồng');
    // The link must always prove possession of the e-mailed token. A used token stays acceptable after signing (so the customer can
    // reopen the signed copy), but an unknown token never reveals the contract, its parties or the PDF.
    const signed = c.status === 'SIGNED' || c.status === 'ACTIVE';
    const tok = await this.prisma.authToken.findFirst({
      where: { user_id: c.customer.user_id ?? BigInt(0), purpose: 'SIGN_OTP', token_hash: sha256(`EMAIL_SIGN:${c.id}:${token}`), ...(signed ? {} : { expires_at: { gt: new Date() } }) },
      orderBy: { id: 'desc' },
    });
    if (!tok) throw validation('Liên kết ký hợp đồng không hợp lệ hoặc đã hết hạn', [{ field: 'token', message: 'expired' }]);
    const doc = c.documents.find((d) => d.type === 'CONTRACT' || d.type === 'TRANSFER_ADDENDUM');
    let pdfUrl: string | null = null;
    if (doc) {
      const m = await this.prisma.mediaFile.findUnique({ where: { id: doc.media_file_id } });
      if (m) pdfUrl = await this.media.urlFor(m, `${c.code}-${doc.type}.pdf`);
    }
    const snap = c.snapshot as { price?: { deposit?: number; adminFee?: number; termMonths?: number } };
    return {
      id: c.public_id,
      code: c.code,
      status: c.status,
      signedAt: c.signed_at,
      startDate: ymd(c.start_date),
      endDate: ymd(addDays(c.current_end_date, -1)),
      monthlyRent: Number(c.monthly_rent),
      deposit: Number(snap?.price?.deposit ?? 0),
      adminFee: Number(snap?.price?.adminFee ?? 0),
      termMonths: Number(snap?.price?.termMonths ?? 1),
      billingMode: c.billing_mode,
      customer: { fullName: c.customer.full_name, email: c.customer.email, phone: c.customer.phone, code: c.customer.code },
      facility: { name: c.facility.name, address: `${c.facility.address_line}, ${c.facility.district}, ${c.facility.province}`, phone: c.facility.phone },
      unit: { code: c.unit.code, zone: c.unit.zone.name, floor: c.unit.zone.floor },
      unitType: { name: c.unit_type.name, areaM2: Number(c.unit_type.area_m2 ?? 0), climateControlled: c.unit_type.climate_controlled },
      pdfUrl,
    };
  }

  async signByEmail(contractPublicId: string, token: string, signaturePng: string, meta?: { ip?: string; userAgent?: string }) {
    const c = await this.prisma.contract.findUnique({
      where: { public_id: contractPublicId },
      include: { customer: true, facility: true, unit: true, documents: { orderBy: { id: 'desc' } } },
    });
    if (!c) throw notFound('Hợp đồng');
    if (c.status === 'SIGNED' || c.status === 'ACTIVE') return { id: c.public_id, code: c.code, status: c.status };
    if (c.status !== 'PENDING_SIGNATURE') throw new AppError('INVALID_STATUS_TRANSITION', 'Hợp đồng không ở trạng thái chờ ký');
    const tok = await this.prisma.authToken.findFirst({
      where: { user_id: c.customer.user_id ?? BigInt(0), purpose: 'SIGN_OTP', used_at: null, token_hash: sha256(`EMAIL_SIGN:${c.id}:${token}`), expires_at: { gt: new Date() } },
      orderBy: { id: 'desc' },
    });
    if (!tok) throw validation('Liên kết ký hợp đồng không hợp lệ hoặc đã hết hạn, vui lòng nhờ nhân viên gửi lại email', [{ field: 'token', message: 'expired' }]);
    const split = splitSignature(signaturePng);
    const m = /^data:image\/png;base64,(.+)$/.exec(split.png);
    if (!m) throw validation('Thiếu chữ ký của khách hàng', [{ field: 'signature', message: 'required' }]);
    const sigBuf = Buffer.from(m[1], 'base64');
    if (sigBuf.length < 200 || sigBuf.length > 1_500_000) throw validation('Chữ ký không hợp lệ');
    const doc = c.documents.find((d) => d.type === 'CONTRACT' || d.type === 'TRANSFER_ADDENDUM');
    if (!doc) throw new AppError('CONFLICT', 'Chưa có bản hợp đồng để ký');
    return this.prisma.tx(async (tx) => {
      await tx.authToken.update({ where: { id: tok.id }, data: { used_at: new Date() } });
      const sigMedia = await this.media.storeServerFile(tx, { purpose: 'SIGNATURE', buffer: sigBuf, mime: 'image/png', ext: 'png', relatedType: 'contract', relatedId: c.id, facilityId: c.facility_id, uploadedBy: c.customer.user_id ?? null, locked: true });
      const now = this.core.now();
      await this.core.setContractStatus(tx, c.id, 'SIGNED', c.customer.user_id ?? null, 'Khách hàng ký hợp đồng điện tử qua liên kết email', { signed_at: now });
      const signed = await this.generateDocument(tx, c.id, 'CONTRACT', [], undefined, { signedAt: now, image: sigBuf, strokes: split.strokes, methodLabel: 'Ký qua liên kết email', docHash: doc.sha256 });
      // Signed through the e-mailed link only: record it as a drawn signature on the newly rendered signed PDF.
      await tx.contractSignature.create({ data: { document_id: signed.id, signer_type: 'CUSTOMER', signer_user_id: c.customer.user_id, method: 'DRAWN_SIGNATURE', signature_media_id: sigMedia.id, otp_verified_at: null, ip_address: meta?.ip?.slice(0, 45), user_agent: meta?.userAgent?.slice(0, 512), signed_at: now, document_sha256: signed.sha256 } });
      await tx.contractSignature.create({ data: { document_id: signed.id, signer_type: 'LESSOR', method: 'SYSTEM_SEAL', signed_at: now, document_sha256: signed.sha256 } });
      if (c.reservation_id) {
        await tx.checkinSession.updateMany({ where: { reservation_id: c.reservation_id, status: 'IN_PROGRESS' }, data: { current_step: 'CONTRACT_SIGNED' } });
      }
      if (c.customer.user_id) {
        await this.notify.notify(
          {
            users: [c.customer.user_id],
            event: 'contract.signed',
            vars: { code: c.code, unitCode: c.unit.code, facility: c.facility.name, hash: signed.sha256.slice(0, 16) },
            link: `/app/contracts/${c.public_id}`,
            related: { type: 'contract', id: c.id },
            email: true,
          },
          tx,
        );
      }
      return { id: c.public_id, code: c.code, status: 'SIGNED' };
    });
  }

  async documents(ctx: AccessContext, publicId: string) {
    const c = await this.findForCtx(ctx, publicId);
    const contractSigned = c.status !== 'PENDING_SIGNATURE' && c.status !== 'CANCELLED';
    // A draft that was rendered with an older template is re-rendered with the current one before anybody opens it
    // (signed documents are never touched: their hash is the evidence).
    if (c.status === 'PENDING_SIGNATURE') {
      const latest = await this.prisma.contractDocument.findFirst({ where: { contract_id: c.id, type: { in: ['CONTRACT', 'TRANSFER_ADDENDUM'] } }, orderBy: { id: 'desc' }, include: { signatures: true } });
      if (latest && latest.template_version !== TEMPLATE_VERSION && !latest.signatures.length) await this.prisma.tx((tx) => this.generateDocument(tx, c.id, latest.type));
    } else if (contractSigned) {
      const hasContractDoc = await this.prisma.contractDocument.findFirst({ where: { contract_id: c.id, type: 'CONTRACT' } });
      if (!hasContractDoc) {
        const signedAt = c.signed_at ?? c.activated_at ?? c.created_at;
        await this.prisma.tx(async (tx) => {
          const signed = await this.generateDocument(tx, c.id, 'CONTRACT', [], undefined, {
            signedAt,
            methodLabel: 'Xác thực chữ ký điện tử (OTP / Email)',
            docHash: sha256(c.code),
          });
          await tx.contractSignature.create({
            data: {
              document_id: signed.id,
              signer_type: 'CUSTOMER',
              signer_user_id: c.customer.user_id,
              method: 'OTP_EMAIL',
              otp_verified_at: signedAt,
              signed_at: signedAt,
              document_sha256: signed.sha256,
            },
          });
          await tx.contractSignature.create({
            data: {
              document_id: signed.id,
              signer_type: 'LESSOR',
              method: 'SYSTEM_SEAL',
              signed_at: signedAt,
              document_sha256: signed.sha256,
            },
          });
        });
      }
    }
    const docs = await this.prisma.contractDocument.findMany({ where: { contract_id: c.id }, orderBy: { id: 'desc' }, include: { signatures: true } });
    const handovers = await this.prisma.handoverRecord.findMany({ where: { contract_id: c.id } });
    const anyContractSig = docs.some((d) => d.type === 'CONTRACT' && d.signatures.length > 0);
    let seenLatestContract = false;
    const out = [];
    for (const d of docs) {
      if (d.type === 'CONTRACT' && (contractSigned || anyContractSig)) {
        if (seenLatestContract) continue; // skip older pre-signature draft PDFs
        seenLatestContract = true;
      }
      const m = await this.prisma.mediaFile.findUniqueOrThrow({ where: { id: d.media_file_id } });
      const ho = handovers.find((h) => h.document_id === d.id);
      const isSigned =
        d.signatures.length > 0 ||
        (d.type === 'CONTRACT' && (contractSigned || anyContractSig)) ||
        (ho?.status === 'SIGNED') ||
        d.type === 'RENEWAL_ADDENDUM' ||
        d.type === 'TRANSFER_ADDENDUM';
      const signedAt = d.signatures[0]?.signed_at ?? ho?.signed_at ?? c.signed_at ?? d.generated_at;
      if (!(await this.media.exists(m))) {
        const isContract = d.type === 'CONTRACT' || d.type === 'TRANSFER_ADDENDUM';
        const docTitleMap: Record<string, string> = {
          HANDOVER_MOVE_IN: 'BIÊN BẢN BÀN GIAO NHẬN KHO',
          HANDOVER_MOVE_OUT: 'BIÊN BẢN KIỂM TRA & BÀN GIAO TRẢ KHO',
          RENEWAL_ADDENDUM: 'PHỤ LỤC GIA HẠN HỢP ĐỒNG',
          TRANSFER_ADDENDUM: 'PHỤ LỤC ĐỔI KHO',
          FINAL_NOTICE: 'THÔNG BÁO QUÁ HẠN LẦN CUỐI',
          TERMINATION_NOTICE: 'THÔNG BÁO CHẤM DỨT HỢP ĐỒNG',
        };
        const base = isContract
          ? await this.contractSections(
              this.prisma,
              c.id,
              isSigned ? { signedAt, methodLabel: 'Xác thực chữ ký điện tử (OTP / Email)', docHash: d.sha256 } : undefined,
            )
          : {
              title: docTitleMap[d.type] ?? d.type,
              subtitle: `${c.code} · Kho ${c.unit.code} · ${c.facility.name}`,
              sections: [
                {
                  heading: 'Thông tin hợp đồng & khách hàng',
                  rows: [
                    ['Mã hợp đồng', c.code],
                    ['Khách hàng', `${c.customer.full_name} (${c.customer.email})`],
                    ['Cơ sở / Kho', `${c.facility.name} — Kho ${c.unit.code}`],
                    ['Thời điểm phát hành / ký', fmtDateTime(signedAt)],
                    ['Mã băm SHA-256', d.sha256],
                  ] as [string, string][],
                },
              ] as PdfSection[],
              opts: {} as PdfOptions,
            };
        const buf = await this.pdf.render(
          base.title,
          base.subtitle,
          base.sections,
          `Tài liệu điện tử do ${config.brandName} phát hành. Mọi chỉnh sửa sau khi phát hành làm thay đổi mã băm SHA-256 và không còn giá trị.`,
          base.opts,
        );
        await this.media.putRaw(m.bucket, m.object_key, buf, 'application/pdf');
      }
      out.push({
        id: d.id.toString(),
        type: d.type,
        sha256: d.sha256,
        generatedAt: d.generated_at,
        signedAt,
        templateVersion: d.template_version,
        signed: isSigned,
        url: await this.media.urlFor(m, `${c.code}-${d.type}.pdf`),
      });
    }
    const orderRank: Record<string, number> = {
      CONTRACT: 1,
      HANDOVER_MOVE_IN: 2,
      RENEWAL_ADDENDUM: 3,
      TRANSFER_ADDENDUM: 4,
      HANDOVER_MOVE_OUT: 5,
      FINAL_NOTICE: 6,
      TERMINATION_NOTICE: 7,
    };
    out.sort((a, b) => (orderRank[a.type] ?? 99) - (orderRank[b.type] ?? 99));
    return out;
  }

  async mediaListFor(relatedType: string, ids: bigint[]) {
    return this.media.listFor(relatedType, ids);
  }

  async mediaByIds(ids: bigint[]) {
    if (!ids.length) return [];
    const rows = await this.prisma.mediaFile.findMany({ where: { id: { in: ids }, status: 'READY' } });
    return Promise.all(rows.map(async (m) => ({ ...m, url: await this.media.urlFor(m) })));
  }

  async inspections(ctx: AccessContext, publicId: string) {
    const c = await this.findForCtx(ctx, publicId);
    const sessionIds = c.reservation_id
      ? (await this.prisma.checkinSession.findMany({ where: { reservation_id: c.reservation_id }, select: { id: true } })).map((s) => s.id)
      : [];
    // Only the verifications of the check-in sessions of this contract's own reservation (never another order of the same customer).
    const idvs = sessionIds.length
      ? await this.prisma.identityVerification.findMany({ where: { checkin_session_id: { in: sessionIds } }, orderBy: { id: 'desc' } })
      : [];
    const idv = idvs[0] ?? null;
    const idvPhotos = idvs.length ? await this.media.listFor('identity_verification', idvs.map((v) => v.id)) : [];
    const identityVerification = idv
      ? {
          ...idv,
          photos: idvPhotos.map((p) => ({
            id: p.public_id,
            url: p.url,
            mimeType: p.mime_type,
            caption: p.caption,
            takenAt: p.taken_at ?? p.created_at,
          })),
        }
      : null;

    const rows = await this.prisma.inspection.findMany({
      where: { contract_id: c.id },
      include: { items: true, damage_items: true },
      orderBy: { id: 'asc' },
    });
    if (!rows.length) {
      if (identityVerification) {
        return [
          {
            id: `idv-${identityVerification.id}`,
            public_id: `idv-${identityVerification.id}`,
            type: 'MOVE_IN',
            status: 'COMPLETED',
            overall_condition: 'GOOD',
            completed_at: identityVerification.verified_at,
            performer: null,
            items: [],
            damage_items: [],
            photos: [],
            identity_verification: identityVerification,
          },
        ];
      }
      return [];
    }
    const performerIds = [...new Set(rows.map((r) => r.performed_by).filter((x): x is bigint => x != null))];
    const users = performerIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: performerIds } }, select: { id: true, full_name: true, email: true } })
      : [];
    const userMap = new Map(users.map((u) => [u.id.toString(), u]));
    const allItemIds = rows.flatMap((r) => r.items.map((it) => it.id));
    const allDamageIds = rows.flatMap((r) => (r.damage_items ?? []).map((dm) => dm.id));
    const [itemPhotos, damagePhotos] = await Promise.all([
      this.media.listFor('inspection_item', allItemIds),
      this.media.listFor('damage_item', allDamageIds),
    ]);
    const hasMoveIn = rows.some((r) => r.type === 'MOVE_IN');
    return rows.map((r, idx) => {
      const performer = r.performed_by ? userMap.get(r.performed_by.toString()) ?? null : null;
      const items = r.items.map((it) => {
        const label = INSPECTION_ITEM_LABEL[it.item_code] ?? it.item_code;
        const photos = itemPhotos
          .filter((p) => p.related_id === it.id)
          .map((p) => ({
            id: p.public_id,
            url: p.url,
            mimeType: p.mime_type,
            caption: p.caption,
            takenAt: p.taken_at ?? p.created_at,
            itemCode: it.item_code,
            itemLabel: label,
            condition: it.condition,
            note: it.note,
          }));
        return {
          ...it,
          label,
          photos,
        };
      });
      const damages = (r.damage_items ?? []).map((dm) => ({
        ...dm,
        photos: damagePhotos
          .filter((p) => p.related_id === dm.id)
          .map((p) => ({ id: p.public_id, url: p.url, mimeType: p.mime_type, caption: p.caption })),
      }));
      const photos = items.flatMap((it) => it.photos);
      return {
        ...r,
        performer,
        items,
        damage_items: damages,
        photos,
        identity_verification: (r.type === 'MOVE_IN' || (!hasMoveIn && idx === 0)) ? identityVerification : null,
      };
    });
  }

  /** Contract terms shown to the customer and staff. */
  termsSummary(c: { start_date: Date; current_end_date: Date; effective_end_date: Date | null; is_holdover: boolean }, today: Date) {
    const daysLeft = Math.round((c.current_end_date.getTime() - today.getTime()) / 86400000);
    return { startDate: ymd(c.start_date), endDate: ymd(addDays(c.current_end_date, -1)), endExclusive: ymd(c.current_end_date), daysLeft, holdover: c.is_holdover, effectiveEnd: ymd(c.effective_end_date) };
  }

  addMonths = addMonths;
  D = D;
}
