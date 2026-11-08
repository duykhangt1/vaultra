import { Injectable } from '@nestjs/common';
import { DEFAULT_SLA, TICKET_TRANSITIONS, canTransition } from '@vaultra/shared';
import { PrismaService, Tx } from '../common/prisma.service';
import { AppError, forbidden, invalidTransition, notFound, validation } from '../common/errors';
import { D, newId, nextCode } from '../common/util';
import { timeIn, weekdayIn, zonedToUtc } from '../common/dates';
import { formatInTimeZone } from 'date-fns-tz';
import { CoreService, fmt, fmtDT } from '../domain/core.service';
import { MediaService } from '../media/media.service';
import { NotificationService } from '../notifications/notification.service';
import { AuditService } from '../audit/audit.service';
import { EventsService } from '../common/events.service';
import type { AccessContext } from '../auth/access-context';
import { Prisma } from '../generated/prisma/client';

const OPEN = ['NEW', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'REOPENED'];
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/** Support & incidents (spec §6.7, module 22): SLA in business hours, routing, escalation, linked actions. */
/** Built-in SLA used when no sla_policies row exists for a (category, priority). Shown on the SLA screen as "mặc định". */
export function defaultSla(category: string, priority: string) {
  const def = DEFAULT_SLA[category] ?? DEFAULT_SLA.OTHER;
  return priority === 'URGENT' ? { first: 15, resolve: def.resolve, businessOnly: false } : { first: def.first, resolve: def.resolve, businessOnly: true };
}

@Injectable()
export class SupportService {
  constructor(private prisma: PrismaService, private core: CoreService, private media: MediaService, private notify: NotificationService, private audit: AuditService, private events: EventsService) {}

  /** Adds `minutes` of SLA time counting only office hours of the facility (URGENT counts 24/7). */
  addBusinessMinutes(start: Date, minutes: number, officeHours: Record<string, [string, string]>, tz: string, allDay: boolean) {
    if (allDay || !officeHours || !Object.keys(officeHours).length) return new Date(start.getTime() + minutes * 60000);
    let remaining = minutes;
    let cursor = new Date(start);
    for (let guard = 0; guard < 400 && remaining > 0; guard++) {
      const day = formatInTimeZone(cursor, tz, 'yyyy-MM-dd');
      const h = officeHours[DAY_KEYS[weekdayIn(cursor, tz)]];
      if (h) {
        const open = zonedToUtc(day, h[0], tz);
        const close = zonedToUtc(day, h[1], tz);
        const from = cursor < open ? open : cursor;
        if (from < close) {
          const avail = (close.getTime() - from.getTime()) / 60000;
          if (avail >= remaining) return new Date(from.getTime() + remaining * 60000);
          remaining -= avail;
        }
      }
      cursor = zonedToUtc(formatInTimeZone(new Date(zonedToUtc(day, '12:00', tz).getTime() + 86400000), tz, 'yyyy-MM-dd'), '00:00', tz);
    }
    return new Date(start.getTime() + minutes * 60000);
  }

  async sla(db: Tx | PrismaService, facilityId: bigint, category: string, priority: string) {
    const row = (await db.slaPolicy.findFirst({ where: { facility_id: facilityId, category: category as never, priority: priority as never } })) ?? (await db.slaPolicy.findFirst({ where: { facility_id: null, category: category as never, priority: priority as never } }));
    if (row) return { first: row.first_response_minutes, resolve: row.resolution_minutes, businessOnly: row.business_hours_only };
    return defaultSla(category, priority);
  }

  async create(ctx: AccessContext, d: { facilityId?: string; contractId?: string; invoiceId?: string; category: string; priority?: string; subject: string; description: string; attachmentIds?: string[]; channel?: 'PORTAL' | 'COUNTER' | 'PHONE' | 'STAFF_DETECTED' | 'ASSISTANT'; customerId?: string; unitId?: string }) {
    ctx.require('support.create');
    const g = ctx.grant('support.create')!;
    let facilityId: bigint;
    let customerId: bigint | null = null;
    let contract = null as Prisma.ContractGetPayload<{ include: { unit: true } }> | null;
    if (d.contractId) {
      contract = await this.prisma.contract.findUnique({ where: { public_id: d.contractId }, include: { unit: true } });
      ctx.assertScope('support.create', contract, 'Hợp đồng', true);
      if (['ENDED', 'CLOSED', 'TERMINATED'].includes(contract!.status) && contract!.ended_at && this.core.now().getTime() - contract!.ended_at.getTime() > 90 * 86400000) throw validation('Hợp đồng đã kết thúc quá 90 ngày');
      facilityId = contract!.facility_id;
      customerId = contract!.customer_id;
    } else if (d.facilityId) {
      const f = await this.core.facilityByPublic(d.facilityId);
      if (g.scope === 'FACILITY' && !ctx.facilitiesFor('support.create').includes(f.id)) throw notFound('Cơ sở');
      facilityId = f.id;
      customerId = g.scope === 'OWN' ? ctx.customerId : null;
      if (g.scope === 'OWN' && !ctx.customerId) throw forbidden();
    } else throw validation('Chọn kho/hợp đồng hoặc cơ sở', [{ field: 'contractId', message: 'required' }]);
    if (g.scope !== 'OWN' && d.customerId) {
      const c = await this.prisma.customer.findUnique({ where: { public_id: d.customerId } });
      customerId = c?.id ?? null;
    }
    if ((d.attachmentIds?.length ?? 0) > 5) throw validation('Tối đa 5 tệp đính kèm');
    const invoice = d.invoiceId ? await this.prisma.invoice.findUnique({ where: { public_id: d.invoiceId } }) : null;
    if (invoice && invoice.customer_id !== customerId) throw notFound('Hóa đơn');
    const def = DEFAULT_SLA[d.category] ?? DEFAULT_SLA.OTHER;
    const urgentWords = /(ngập|cháy|phá cửa|lũ|khói|flood|fire)/i;
    const priority = (g.scope !== 'OWN' && d.priority) || (d.category === 'UNIT_DAMAGE' && urgentWords.test(`${d.subject} ${d.description}`) ? 'URGENT' : def.priority);
    const f = await this.prisma.facility.findUniqueOrThrow({ where: { id: facilityId } });
    const now = this.core.now();
    const s = await this.sla(this.prisma, facilityId, d.category, priority);
    const oh = f.office_hours as Record<string, [string, string]>;
    const firstDue = this.addBusinessMinutes(now, s.first, oh, f.timezone, priority === 'URGENT' || !s.businessOnly);
    const resolveDue = this.addBusinessMinutes(now, s.resolve, oh, f.timezone, priority === 'URGENT' || !s.businessOnly);
    const t = await this.prisma.tx(async (tx) => {
      const ticket = await tx.supportTicket.create({
        data: {
          public_id: newId(), code: await nextCode(tx, 'SR', now.getFullYear()), facility_id: facilityId, customer_id: customerId, contract_id: contract?.id ?? null, unit_id: contract?.unit_id ?? null, invoice_id: invoice?.id ?? null,
          category: d.category as never, priority: priority as never, subject: d.subject.slice(0, 200), description: d.description, channel: d.channel ?? (g.scope === 'OWN' ? 'PORTAL' : 'COUNTER'),
          first_response_due_at: firstDue, resolution_due_at: resolveDue, created_by: ctx.userId,
          events: { create: { event: 'CREATED', actor_user_id: ctx.userId, data: { priority, channel: d.channel ?? null } } },
        },
      });
      if (d.attachmentIds?.length) await this.media.attach(tx, ctx, d.attachmentIds, 'ticket', ticket.id, facilityId);
      if (invoice && d.category === 'PAYMENT') await tx.invoice.update({ where: { id: invoice.id }, data: { dispute_hold: true } });
      if (contract && d.category === 'UNIT_DAMAGE') await this.core.setOperationalFlag(tx, contract.unit_id, 'ISSUE_REPORTED', d.subject, ctx.userId);
      // Auto-reply for ACCESS_CODE while LOCKED_OUT (§6.7 rule 3)
      if (contract && d.category === 'ACCESS_CODE' && ['LOCKED_OUT', 'FINAL_NOTICE', 'DEFAULT_PENDING'].includes(contract.delinquency_status)) {
        const open = await tx.invoice.findMany({ where: { contract_id: contract.id, status: { in: ['ISSUED', 'PARTIALLY_PAID'] } } });
        const debt = open.reduce((x, i) => x.add(D(i.total).sub(i.amount_paid).sub(i.amount_credited)), D(0));
        await tx.ticketMessage.create({ data: { public_id: newId(), ticket_id: ticket.id, author_role: 'SYSTEM', body: `Truy cập kho đang tạm khóa do quá hạn thanh toán. Tổng nợ hiện tại: ${fmt(debt)}. Vui lòng thanh toán tại mục Thanh toán — mã truy cập sẽ được mở lại tự động ngay sau khi thanh toán thành công.` } });
      }
      // Suspected theft (§6.7 rule 4): FM must take part, 30-day access log attached, no automatic conclusion.
      if (d.category === 'STORED_ITEMS') {
        await tx.supportTicket.update({ where: { id: ticket.id }, data: { escalation_level: 1 } });
        await tx.ticketEvent.create({ data: { ticket_id: ticket.id, event: 'ESCALATED', data: { level: 1, reason: 'STORED_ITEMS: bắt buộc quản lý cơ sở tham gia' } } });
        const unitId = contract?.unit_id ?? null;
        const since = new Date(now.getTime() - 30 * 86400000);
        const log = unitId ? await tx.accessEvent.findMany({ where: { unit_id: unitId, occurred_at: { gte: since } }, orderBy: { occurred_at: 'desc' }, take: 300 }) : [];
        const credIds = [...new Set(log.map((e) => e.credential_id).filter((x): x is bigint => !!x).map(String))].map((x) => BigInt(x));
        const creds = credIds.length ? await tx.accessCredential.findMany({ where: { id: { in: credIds } }, select: { id: true, type: true, holder_name: true } }) : [];
        const lines = log.map((e) => {
          const cr = creds.find((x) => x.id === e.credential_id);
          return `${fmtDT(e.occurred_at)} · ${e.event}${e.deny_reason ? ` (${e.deny_reason})` : ''} · ${cr ? `${cr.type} ${cr.holder_name ?? ''}`.trim() : 'không xác định'}`;
        });
        await tx.ticketMessage.create({
          data: { public_id: newId(), ticket_id: ticket.id, author_role: 'SYSTEM', is_internal: true, body: unitId ? `Nhật ký ra vào kho 30 ngày gần nhất (${log.length} sự kiện):\n${lines.join('\n') || 'Không có sự kiện ra vào nào được ghi nhận.'}` : 'Ticket chưa gắn kho cụ thể — chưa thể xuất nhật ký ra vào.' },
        });
        await tx.ticketMessage.create({
          data: { public_id: newId(), ticket_id: ticket.id, author_role: 'SYSTEM', body: 'Chúng tôi đã ghi nhận phản ánh và quản lý cơ sở sẽ trực tiếp xử lý. Nếu nghi ngờ mất cắp, bạn nên trình báo cơ quan công an địa phương; cơ sở sẽ phối hợp cung cấp nhật ký ra vào và hình ảnh theo yêu cầu của cơ quan chức năng. Hệ thống không tự kết luận trách nhiệm.' },
        });
      }
      // Routing (§6.7 step 2)
      let assignee: bigint | null = null;
      if (f.auto_dispatch) assignee = await this.core.staffOnShiftWithFewestTasks(tx, facilityId);
      if (assignee) {
        await tx.supportTicket.update({ where: { id: ticket.id }, data: { assignee_id: assignee, status: 'ASSIGNED' } });
        await tx.ticketEvent.create({ data: { ticket_id: ticket.id, event: 'ASSIGNED', data: { to: assignee.toString(), auto: true } } });
      }
      await this.core.createTask(tx, { facilityId, type: 'SUPPORT_TICKET', title: `${ticket.code}: ${ticket.subject}`, related: { type: 'ticket', id: ticket.id }, unitId: contract?.unit_id ?? null, priority: priority as never, dueAt: resolveDue, assigneeId: assignee, dedupeKey: `TICKET:${ticket.id}`, source: 'SYSTEM' });
      const fms = await this.core.facilityManagers(tx, facilityId);
      if (priority === 'URGENT') {
        const onShift = await this.core.staffOnShift(tx, facilityId);
        await this.notify.notify({ users: [...fms, ...onShift], event: 'ticket.urgent', vars: { code: ticket.code, subject: ticket.subject, facility: f.name }, link: `/manage/tickets/${ticket.public_id}`, priority: 'HIGH', related: { type: 'ticket', id: ticket.id }, email: true }, tx);
      } else {
        await this.notify.notify({ users: fms, event: 'ticket.new_fm', vars: { code: ticket.code, priority, subject: ticket.subject }, link: `/manage/tickets/${ticket.public_id}`, related: { type: 'ticket', id: ticket.id }, email: false }, tx);
      }
      if (d.category === 'STORED_ITEMS') await this.notify.notify({ users: fms, event: 'ticket.escalated', vars: { code: ticket.code, level: 1, reason: 'Nghi mất cắp/hư hỏng tài sản — cần quản lý cơ sở tham gia' }, link: `/manage/tickets/${ticket.public_id}`, related: { type: 'ticket', id: ticket.id }, email: true }, tx);
      if (assignee) await this.notify.notify({ users: [assignee], event: 'ticket.assigned', vars: { code: ticket.code, subject: ticket.subject, due: fmtDT(firstDue) }, link: `/staff/tickets/${ticket.public_id}`, related: { type: 'ticket', id: ticket.id }, email: false }, tx);
      const uid = customerId ? await this.core.customerUser(tx, customerId) : null;
      if (uid) await this.notify.notify({ users: [uid], event: 'ticket.created', vars: { code: ticket.code, subject: ticket.subject, due: fmtDT(firstDue), facility: f.name, priority }, link: `/app/support/${ticket.public_id}`, related: { type: 'ticket', id: ticket.id }, email: true }, tx);
      await this.events.emit(tx, 'ticket.changed', { type: 'ticket', id: ticket.id }, { facility: f.public_id, ticket: ticket.public_id, status: ticket.status });
      await this.audit.log(ctx, { action: 'ticket.create', entityType: 'support_ticket', entityId: ticket.id, entityRef: ticket.code, facilityId, after: { category: d.category, priority } }, tx);
      return ticket;
    });
    return this.prisma.supportTicket.findUniqueOrThrow({ where: { id: t.id } });
  }

  async load(ctx: AccessContext, publicId: string, write = false) {
    const t = await this.prisma.supportTicket.findUnique({ where: { public_id: publicId } });
    if (!t) throw notFound('Ticket');
    const g = ctx.grant('support.handle') && ctx.facilitiesFor('support.handle').includes(t.facility_id) ? 'STAFF' : ctx.hasRole('BUSINESS_OPS_MANAGER') && t.escalation_level >= 2 ? 'BOM' : null;
    if (!g) ctx.assertScope('support.create', t, 'Ticket', write);
    return { t, staff: g === 'STAFF', bom: g === 'BOM' };
  }

  async detail(ctx: AccessContext, publicId: string) {
    const { t, staff, bom } = await this.load(ctx, publicId);
    const internalOk = staff || bom;
    const full = await this.prisma.supportTicket.findUniqueOrThrow({
      where: { id: t.id },
      include: {
        facility: { select: { public_id: true, name: true, hotline: true } },
        customer: { select: { public_id: true, full_name: true, phone: true, email: true } },
        contract: { select: { public_id: true, code: true, status: true, delinquency_status: true, unit: { select: { public_id: true, code: true } } } },
        assignee: { select: { public_id: true, full_name: true } },
        messages: { where: internalOk ? {} : { is_internal: false }, orderBy: { created_at: 'asc' } },
        events: internalOk ? { orderBy: { created_at: 'asc' } } : false,
        rating: true,
      },
    });
    const authors = await this.prisma.user.findMany({ where: { id: { in: full.messages.map((m) => m.author_user_id).filter((x): x is bigint => !!x) } }, select: { id: true, public_id: true, full_name: true } });
    const roleRows = authors.length ? await this.prisma.userRole.findMany({ where: { user_id: { in: authors.map((a) => a.id) }, revoked_at: null }, select: { user_id: true, facility_id: true, role: { select: { code: true } } } }) : [];
    const ROLE_LABEL: Record<string, string> = { BUSINESS_OPS_MANAGER: 'Quản lý vận hành', FACILITY_MANAGER: 'Quản lý cơ sở', FACILITY_STAFF: 'Nhân viên', SYSTEM_ADMIN: 'Quản trị', CUSTOMER: 'Khách hàng' };
    const ROLE_RANK = ['BUSINESS_OPS_MANAGER', 'FACILITY_MANAGER', 'FACILITY_STAFF', 'SYSTEM_ADMIN', 'CUSTOMER'];
    const roleOf = (uid: bigint | null) => {
      const mine = roleRows.filter((r) => r.user_id === uid && (r.facility_id == null || r.facility_id === t.facility_id));
      const code = ROLE_RANK.find((c) => mine.some((r) => r.role.code === c));
      return code ? ROLE_LABEL[code] ?? null : null;
    };
    const att = await this.media.listFor('ticket', [t.id]);
    const msgAtt = await this.media.listFor('ticket_message', full.messages.map((m) => m.id));
    const now = this.core.now();
    const paused = t.sla_paused_seconds * 1000;
    const pct = (start: Date, due: Date, done: Date | null) => Math.min(100, Math.round((((done ?? now).getTime() - start.getTime() - paused) / Math.max(1, due.getTime() - start.getTime() - paused)) * 100));
    return {
      ...full,
      messages: full.messages.map((m) => {
        const au = authors.find((a) => a.id === m.author_user_id);
        const fullName = au?.full_name ?? (m.author_role === 'SYSTEM' ? 'Hệ thống' : 'Khách hàng');
        return {
          ...m,
          author: { id: au?.public_id ?? null, full_name: fullName, role_label: m.author_role === 'CUSTOMER' ? 'Khách hàng' : m.author_role === 'SYSTEM' ? 'Hệ thống' : roleOf(m.author_user_id) ?? 'Nhân viên' },
          author_name: fullName,
          from_customer: m.author_role === 'CUSTOMER',
          is_system: m.author_role === 'SYSTEM',
          attachments: msgAtt.filter((a) => a.related_id === m.id).map((a) => ({ id: a.public_id, url: a.url, mime: a.mime_type })),
        };
      }),
      attachments: att.map((a) => ({ id: a.public_id, url: a.url, mime: a.mime_type })),
      sla: { firstResponsePct: pct(t.created_at, t.first_response_due_at, t.first_response_at), resolutionPct: pct(t.created_at, t.resolution_due_at, t.resolved_at), breached: t.sla_breached },
      canHandle: staff,
    };
  }

  private async move(tx: Tx, t: { id: bigint; status: string; facility_id: bigint; public_id: string }, to: string, data: Prisma.SupportTicketUpdateInput, actor: bigint | null, extra: object = {}) {
    if (t.status !== to && !canTransition(TICKET_TRANSITIONS, t.status, to)) throw invalidTransition('ticket', t.status, to);
    const u = await tx.supportTicket.update({ where: { id: t.id }, data: { status: to as never, version: { increment: 1 }, ...data } });
    await tx.ticketEvent.create({ data: { ticket_id: t.id, event: 'STATUS_CHANGED', actor_user_id: actor, data: { from: t.status, to, ...extra } } });
    const f = await tx.facility.findUniqueOrThrow({ where: { id: t.facility_id }, select: { public_id: true } });
    await this.events.emit(tx, 'ticket.changed', { type: 'ticket', id: t.id }, { facility: f.public_id, ticket: t.public_id, status: to });
    return u;
  }

  async message(ctx: AccessContext, publicId: string, d: { body: string; isInternal?: boolean; attachmentIds?: string[] }) {
    const { t, staff } = await this.load(ctx, publicId, true);
    if (['CLOSED', 'CANCELLED'].includes(t.status)) throw new AppError('INVALID_STATUS_TRANSITION', 'Ticket đã đóng');
    if (d.isInternal && !staff) throw forbidden('Chỉ nhân viên được ghi chú nội bộ');
    if ((d.attachmentIds?.length ?? 0) > 5) throw validation('Tối đa 5 tệp');
    return this.prisma.tx(async (tx) => {
      const m = await tx.ticketMessage.create({ data: { public_id: newId(), ticket_id: t.id, author_user_id: ctx.userId, author_role: staff ? 'STAFF' : 'CUSTOMER', body: d.body, is_internal: !!d.isInternal } });
      if (d.attachmentIds?.length) await this.media.attach(tx, ctx, d.attachmentIds, 'ticket_message', m.id, t.facility_id);
      const now = this.core.now();
      if (staff && !d.isInternal) {
        const data: Prisma.SupportTicketUpdateInput = { first_response_at: t.first_response_at ?? now };
        if (['NEW', 'ASSIGNED', 'REOPENED'].includes(t.status)) await this.move(tx, t, 'IN_PROGRESS', { ...data, assignee: t.assignee_id ? undefined : { connect: { id: ctx.userId } } }, ctx.userId);
        else await tx.supportTicket.update({ where: { id: t.id }, data });
        const uid = t.customer_id ? await this.core.customerUser(tx, t.customer_id) : null;
        if (uid) await this.notify.notify({ users: [uid], event: 'ticket.message_added', vars: { code: t.code, subject: t.subject, preview: d.body.slice(0, 160) }, link: `/app/support/${t.public_id}`, related: { type: 'ticket', id: t.id }, email: true }, tx);
      } else if (!staff) {
        if (t.status === 'WAITING_CUSTOMER') {
          const paused = t.waiting_since ? Math.round((now.getTime() - t.waiting_since.getTime()) / 1000) : 0;
          const shift = (dt: Date) => new Date(dt.getTime() + paused * 1000);
          await this.move(tx, t, 'IN_PROGRESS', { waiting_since: null, sla_paused_seconds: { increment: paused }, first_response_due_at: shift(t.first_response_due_at), resolution_due_at: shift(t.resolution_due_at) }, ctx.userId);
        }
        if (t.assignee_id) await this.notify.notify({ users: [t.assignee_id], event: 'ticket.message_added', vars: { code: t.code, subject: t.subject, preview: d.body.slice(0, 160) }, link: `/staff/tickets/${t.public_id}`, related: { type: 'ticket', id: t.id }, email: false }, tx);
      }
      return m;
    });
  }

  async action(ctx: AccessContext, publicId: string, action: string, d: Record<string, unknown>) {
    const { t, staff } = await this.load(ctx, publicId, true);
    const now = this.core.now();
    const isFm = ctx.facilitiesFor('support.assign').includes(t.facility_id);
    return this.prisma.tx(async (tx) => {
      switch (action) {
        case 'claim': {
          if (!staff) throw forbidden();
          if (t.assignee_id && t.assignee_id !== ctx.userId) throw new AppError('CONFLICT', 'Ticket đã có người xử lý');
          await tx.ticketEvent.create({ data: { ticket_id: t.id, event: 'ASSIGNED', actor_user_id: ctx.userId, data: { to: ctx.userPublicId, claim: true } } });
          return this.move(tx, t, 'ASSIGNED', { assignee: { connect: { id: ctx.userId } } }, ctx.userId);
        }
        case 'assign': {
          if (!isFm) throw forbidden('Chỉ quản lý cơ sở phân công ticket');
          const u = await tx.user.findUnique({ where: { public_id: String(d.assigneeId) } });
          if (!u) throw notFound('Nhân viên');
          const inFac = await tx.userRole.count({ where: { user_id: u.id, facility_id: t.facility_id, revoked_at: null } });
          if (!inFac) throw new AppError('ASSIGNEE_NOT_IN_FACILITY', 'Nhân viên không thuộc cơ sở');
          await tx.ticketEvent.create({ data: { ticket_id: t.id, event: 'ASSIGNED', actor_user_id: ctx.userId, data: { from: t.assignee_id?.toString() ?? null, to: u.public_id } } });
          await tx.workTask.updateMany({ where: { related_type: 'ticket', related_id: t.id, status: { notIn: ['DONE', 'CANCELLED'] } }, data: { assignee_id: u.id, status: 'ASSIGNED' } });
          await this.notify.notify({ users: [u.id], event: 'ticket.assigned', vars: { code: t.code, subject: t.subject, due: fmtDT(t.first_response_due_at) }, link: `/staff/tickets/${t.public_id}`, related: { type: 'ticket', id: t.id }, email: false }, tx);
          return this.move(tx, t, ['NEW', 'REOPENED'].includes(t.status) ? 'ASSIGNED' : t.status, { assignee: { connect: { id: u.id } } }, ctx.userId);
        }
        case 'priority': {
          if (!isFm) throw forbidden('Chỉ quản lý cơ sở đổi ưu tiên');
          const p = String(d.priority);
          const order = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
          if (!order.includes(p)) throw validation('Ưu tiên không hợp lệ');
          if (order.indexOf(p) < order.indexOf(t.priority) && !d.reason) throw validation('Hạ ưu tiên cần ghi lý do');
          await tx.ticketEvent.create({ data: { ticket_id: t.id, event: 'PRIORITY_CHANGED', actor_user_id: ctx.userId, data: { from: t.priority, to: p, reason: d.reason ?? null } } });
          return tx.supportTicket.update({ where: { id: t.id }, data: { priority: p as never } });
        }
        case 'start':
          if (!staff) throw forbidden();
          return this.move(tx, t, 'IN_PROGRESS', { first_response_at: t.first_response_at ?? now, assignee: t.assignee_id ? undefined : { connect: { id: ctx.userId } } }, ctx.userId);
        case 'wait-customer':
          if (!staff) throw forbidden();
          if (t.customer_id) {
            const uid = await this.core.customerUser(tx, t.customer_id);
            if (uid) await this.notify.notify({ users: [uid], event: 'ticket.waiting_customer', vars: { code: t.code, subject: t.subject }, link: `/app/support/${t.public_id}`, related: { type: 'ticket', id: t.id }, email: true }, tx);
          }
          return this.move(tx, t, 'WAITING_CUSTOMER', { waiting_since: now, first_response_at: t.first_response_at ?? now }, ctx.userId);
        case 'escalate': {
          if (!staff) throw forbidden();
          const level = Math.min(2, t.escalation_level + 1);
          if (level === 2 && !isFm) throw forbidden('Chỉ quản lý cơ sở leo thang lên BOM');
          await tx.supportTicket.update({ where: { id: t.id }, data: { escalation_level: level } });
          await tx.ticketEvent.create({ data: { ticket_id: t.id, event: 'ESCALATED', actor_user_id: ctx.userId, data: { level, reason: d.reason ?? null } } });
          const to = level === 1 ? await this.core.facilityManagers(tx, t.facility_id) : await this.core.businessOpsManagers(tx);
          await this.notify.notify({ users: to, event: 'ticket.escalated', vars: { code: t.code, subject: t.subject, level, reason: String(d.reason ?? '') }, link: level === 1 ? `/manage/tickets/${t.public_id}` : `/ops/approvals`, related: { type: 'ticket', id: t.id }, email: false }, tx);
          return tx.supportTicket.findUniqueOrThrow({ where: { id: t.id } });
        }
        case 'resolve': {
          if (!staff) throw forbidden();
          const rawCode = String(d.resolutionCode ?? '');
          const code = rawCode === 'NO_ACTION' ? 'NO_ACTION_NEEDED' : rawCode;
          const note = String(d.note ?? d.resolutionNote ?? '').trim();
          if (!code || !note) throw validation('Bắt buộc chọn nguyên nhân/cách xử lý và ghi chú', [{ field: 'resolutionCode', message: 'required' }]);
          const photoIds = (d.photoIds ?? d.attachmentIds) as string[] | undefined;
          if (t.category === 'UNIT_DAMAGE' && !photoIds?.length) throw validation('Sự cố hư hỏng kho cần ảnh sau xử lý');
          if (photoIds?.length) await this.media.attach(tx, ctx, photoIds, 'ticket', t.id, t.facility_id);
          // Resolving straight from NEW/ASSIGNED/REOPENED: record the implicit "start work" step first.
          const from = ['NEW', 'ASSIGNED', 'REOPENED'].includes(t.status)
            ? { ...t, ...(await this.move(tx, t, 'IN_PROGRESS', { first_response_at: t.first_response_at ?? now, ...(t.assignee_id ? {} : { assignee: { connect: { id: ctx.userId } } }) }, ctx.userId)) }
            : t;
          const u = await this.move(tx, from, 'RESOLVED', { resolution_code: code as never, resolution_note: note, resolved_at: now, first_response_at: t.first_response_at ?? now, sla_breached: t.sla_breached || now > t.resolution_due_at }, ctx.userId);
          await this.core.completeTasksFor(tx, 'ticket', t.id, ['SUPPORT_TICKET'], ctx.userId, note);
          if (t.unit_id) {
            const unit = await tx.unit.findUniqueOrThrow({ where: { id: t.unit_id } });
            if (unit.operational_flag === 'ISSUE_REPORTED') await this.core.setOperationalFlag(tx, unit.id, 'NONE', `Đã xử lý ${t.code}`, ctx.userId);
          }
          if (t.customer_id) {
            const uid = await this.core.customerUser(tx, t.customer_id);
            if (uid) await this.notify.notify({ users: [uid], event: 'ticket.resolved', vars: { code: t.code, subject: t.subject, note: note.slice(0, 160) }, link: `/app/support/${t.public_id}`, related: { type: 'ticket', id: t.id }, email: true }, tx);
          }
          return u;
        }
        case 'close': {
          const isOwner = !staff && t.customer_id && t.customer_id === ctx.customerId;
          if (!isOwner && !isFm && !staff) throw forbidden('Chỉ khách hoặc quản lý/nhân viên cơ sở đóng ticket');
          const u = await this.move(tx, t, 'CLOSED', { closed_at: now }, ctx.userId);
          if (t.invoice_id) await tx.invoice.update({ where: { id: t.invoice_id }, data: { dispute_hold: false } });
          return u;
        }
        case 'reopen': {
          const isOwner = !staff && t.customer_id === ctx.customerId;
          if (!isOwner && !staff) throw forbidden();
          const refDate = t.resolved_at ?? t.closed_at;
          if (!staff && (!refDate || now.getTime() - refDate.getTime() > 7 * 86400000)) throw validation('Chỉ mở lại trong 7 ngày sau khi giải quyết');
          await tx.ticketEvent.create({ data: { ticket_id: t.id, event: 'REOPENED', actor_user_id: ctx.userId, data: { reason: d.reason ?? d.note ?? null } } });
          const u = await this.move(tx, t, 'REOPENED', { reopened_count: { increment: 1 }, resolved_at: null, closed_at: null }, ctx.userId);
          if (t.assignee_id) await this.notify.notify({ users: [t.assignee_id, ...(await this.core.facilityManagers(tx, t.facility_id))], event: 'ticket.reopened', vars: { code: t.code, subject: t.subject }, link: `/staff/tickets/${t.public_id}`, related: { type: 'ticket', id: t.id }, email: false }, tx);
          return u;
        }
        case 'rate': {
          if (staff || t.customer_id !== ctx.customerId) throw forbidden();
          if (!['RESOLVED', 'CLOSED'].includes(t.status)) throw validation('Chỉ đánh giá ticket đã giải quyết');
          const score = Number(d.score ?? d.stars);
          const comment = d.comment ?? d.note;
          if (!(score >= 1 && score <= 5)) throw validation('Điểm 1–5');
          await tx.ticketRating.upsert({ where: { ticket_id: t.id }, update: { score, comment: comment ? String(comment).slice(0, 500) : null }, create: { ticket_id: t.id, score, comment: comment ? String(comment).slice(0, 500) : null } });
          if (t.status === 'RESOLVED') await this.move(tx, t, 'CLOSED', { closed_at: now }, ctx.userId);
          if (t.invoice_id) await tx.invoice.update({ where: { id: t.invoice_id }, data: { dispute_hold: false } });
          if (score <= 2) await this.core.createTask(tx, { facilityId: t.facility_id, type: 'OTHER', title: `Xem xét đánh giá thấp (${score}★) cho ${t.code}`, related: { type: 'ticket', id: t.id }, priority: 'HIGH', dueAt: new Date(now.getTime() + 86400000), dedupeKey: `LOWRATING:${t.id}`, assigneeId: (await this.core.facilityManagers(tx, t.facility_id))[0] ?? null });
          return tx.supportTicket.findUniqueOrThrow({ where: { id: t.id }, include: { rating: true } });
        }
        case 'cancel': {
          const isOwner = !staff && t.customer_id === ctx.customerId;
          if (!isOwner && !staff) throw forbidden();
          if (t.invoice_id) await tx.invoice.update({ where: { id: t.invoice_id }, data: { dispute_hold: false } });
          await this.core.completeTasksFor(tx, 'ticket', t.id, ['SUPPORT_TICKET'], ctx.userId, 'Đã hủy ticket');
          const u = await this.move(tx, t, 'CANCELLED', { closed_at: now, resolution_code: isOwner ? 'NO_ACTION_NEEDED' : 'OTHER' }, ctx.userId);
          const uid = (t.customer_id ? await this.core.customerUser(tx, t.customer_id) : null) ?? t.created_by;
          if (uid) {
            await this.notify.notify({ users: [uid], event: 'ticket.cancelled', vars: { code: t.code, subject: t.subject }, link: `/app/support/${t.public_id}`, related: { type: 'ticket', id: t.id }, email: true }, tx);
          }
          return u;
        }
        case 'merge': {
          if (!staff) throw forbidden();
          const target = await tx.supportTicket.findUnique({ where: { public_id: String(d.intoTicketId) } });
          if (!target || target.facility_id !== t.facility_id || target.id === t.id) throw validation('Ticket đích không hợp lệ');
          await tx.ticketEvent.create({ data: { ticket_id: t.id, event: 'MERGED', actor_user_id: ctx.userId, data: { into: target.code } } });
          return this.move(tx, t, 'CANCELLED', { merged_into: { connect: { id: target.id } }, resolution_code: 'DUPLICATE', closed_at: now }, ctx.userId);
        }
        default:
          throw notFound('Hành động');
      }
    });
  }

  async logLinked(tx: Tx, ticketId: bigint, actor: bigint, kind: string, data: object) {
    await tx.ticketEvent.create({ data: { ticket_id: ticketId, event: 'LINKED_ACTION', actor_user_id: actor, data: { kind, ...data } } });
  }

  /** Hourly SLA job: 80 % warning, breach flag, auto-close RESOLVED after 72 h (§6.7). */
  async slaJob() {
    const now = this.core.now();
    const open = await this.prisma.supportTicket.findMany({ where: { status: { in: OPEN as never[] } } });
    let n = 0;
    for (const t of open) {
      if (t.status === 'WAITING_CUSTOMER') continue;
      // resolution_due_at is pushed back by every paused interval, so remove the pause from both sides.
      const paused = t.sla_paused_seconds * 1000;
      const total = Math.max(1, t.resolution_due_at.getTime() - t.created_at.getTime() - paused);
      const used = now.getTime() - t.created_at.getTime() - paused;
      const firstLate = !t.first_response_at && now > t.first_response_due_at;
      const late = now > t.resolution_due_at || firstLate;
      const fms = await this.core.facilityManagers(this.prisma, t.facility_id);
      if (late && !t.sla_breached) {
        await this.prisma.supportTicket.update({ where: { id: t.id }, data: { sla_breached: true } });
        await this.prisma.ticketEvent.create({ data: { ticket_id: t.id, event: 'SLA_BREACHED' } });
        await this.notify.notify({ users: [...fms, ...(t.assignee_id ? [t.assignee_id] : [])], event: 'ticket.sla_breached', vars: { code: t.code, subject: t.subject }, link: `/manage/tickets/${t.public_id}`, related: { type: 'ticket', id: t.id }, dedupeKey: `sla.breach:${t.id}` });
        n += 1;
      } else if (!t.sla_warned && used / total >= 0.8) {
        await this.prisma.supportTicket.update({ where: { id: t.id }, data: { sla_warned: true } });
        await this.prisma.ticketEvent.create({ data: { ticket_id: t.id, event: 'SLA_WARNING' } });
        await this.notify.notify({ users: [...fms, ...(t.assignee_id ? [t.assignee_id] : [])], event: 'ticket.sla_warning', vars: { code: t.code, subject: t.subject }, link: `/manage/tickets/${t.public_id}`, related: { type: 'ticket', id: t.id }, email: false, dedupeKey: `sla.warn:${t.id}` });
      }
    }
    const stale = await this.prisma.supportTicket.findMany({ where: { status: 'RESOLVED', resolved_at: { lt: new Date(now.getTime() - 72 * 3600000) } } });
    for (const t of stale) {
      await this.prisma.tx(async (tx) => {
        await this.move(tx, t, 'CLOSED', { closed_at: now }, null, { auto: true });
        if (t.invoice_id) await tx.invoice.update({ where: { id: t.invoice_id }, data: { dispute_hold: false } });
      });
    }
    return n;
  }

  timeIn = timeIn;
}
