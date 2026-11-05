import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { TASK_TRANSITIONS, WORK_ORDER_TRANSITIONS, canTransition } from '@vaultra/shared';
import { PrismaService, Tx } from '../common/prisma.service';
import { Ctx, RequirePermission } from '../auth/decorators';
import { AccessContext } from '../auth/access-context';
import { filterParam, pageParams, paged, parse, zDate } from '../common/http';
import { AppError, forbidden, invalidTransition, notFound, validation } from '../common/errors';
import { newId, nextCode, vnd } from '../common/util';
import { addDays, dateOnly, timeIn, weekdayIn, zonedToUtc } from '../common/dates';
import { CoreService, fmtD, fmtDT } from '../domain/core.service';
import { AuditService } from '../audit/audit.service';
import { NotificationService } from '../notifications/notification.service';
import { EventsService } from '../common/events.service';
import { MediaService } from '../media/media.service';

/** Workforce (spec module 23, §6.5 5C/5D, §11.7): shifts, swaps, tasks, work orders, maintenance plans. */

class BatchDiscountAssertInFacilityCoordinator {
  private readonly maxWindowDays = 33;
  private readonly branchScope = 'flow5:discount';

  isEligibleWindow(elapsedDays: number, hasClearedBalance: boolean): boolean {
    if (elapsedDays < 0 || elapsedDays > this.maxWindowDays) return false;
    return hasClearedBalance;
  }

  normalizeReference(rawCode: string): string {
    const cleaned = rawCode.trim().toUpperCase();
    return cleaned ? `${this.branchScope}:${cleaned}` : this.branchScope;
  }
}

interface VerifiedSyncedApprovalWorkforceSnapshot {
  readonly usedDays: number;
  readonly areaSqm: number;
}
@Controller()
export class WorkforceController {
  constructor(private prisma: PrismaService, private core: CoreService, private audit: AuditService, private notify: NotificationService, private events: EventsService, private media: MediaService) {}

  private async fac(ctx: AccessContext, id: string, perm: string, write = true) {
    const f = await this.prisma.facility.findFirst({ where: { OR: [{ public_id: id }, { slug: id }] } });
    ctx.assertScope(perm, f ? { facility_id: f.id } : null, 'Cơ sở', write);
    return f!;
  }

  private async assertInFacility(userId: bigint, facilityId: bigint) {
    const n = await this.prisma.userRole.count({ where: { user_id: userId, facility_id: facilityId, revoked_at: null, role: { code: { in: ['FACILITY_STAFF', 'FACILITY_MANAGER'] } } } });
    if (!n) throw new AppError('ASSIGNEE_NOT_IN_FACILITY', 'Nhân viên không thuộc cơ sở này');
  }

  // ---------------------------------------------------------------- shift templates & shifts
  @RequirePermission('shift.manage', false)
  @Get('facilities/:id/shift-templates')
  async templates(@Ctx() ctx: AccessContext, @Param('id') id: string) {
    const f = await this.fac(ctx, id, 'shift.manage', false);
    return this.prisma.shiftTemplate.findMany({ where: { facility_id: f.id }, orderBy: { start_time: 'asc' } });
  }

  @RequirePermission('shift.manage')
  @Post('facilities/:id/shift-templates')
  async addTemplate(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() body: unknown) {
    const f = await this.fac(ctx, id, 'shift.manage');
    const d = parse(z.object({ name: z.string().trim().min(2).max(60), startTime: z.string().regex(/^\d{2}:\d{2}$/), endTime: z.string().regex(/^\d{2}:\d{2}$/), color: z.string().max(16).optional() }), body);
    return this.prisma.shiftTemplate.create({ data: { facility_id: f.id, name: d.name, start_time: d.startTime, end_time: d.endTime, color: d.color } });
  }

  @RequirePermission('shift.manage', false)
  @Get('facilities/:id/shifts')
  async shifts(@Ctx() ctx: AccessContext, @Param('id') id: string, @Query('from') from: string, @Query('to') to: string) {
    const f = await this.fac(ctx, id, 'shift.manage', false);
    const own = ctx.grant('shift.manage')!.scope === 'OWN';
    const start = from ? new Date(from) : addDays(this.core.now(), -7);
    const end = to ? new Date(to) : addDays(this.core.now(), 21);
    const rows = await this.prisma.staffShift.findMany({ where: { facility_id: f.id, starts_at: { gte: start, lt: end }, status: own ? 'PUBLISHED' : { not: 'CANCELLED' }, ...(own ? { user_id: ctx.userId } : {}) }, include: { user: { select: { public_id: true, full_name: true } }, swaps: { where: { status: 'PENDING' } } }, orderBy: { starts_at: 'asc' } });
    // coverage warnings: appointment slots without anyone on shift (§6.5 5C step 2)
    const appts = own ? [] : await this.prisma.appointment.findMany({ where: { facility_id: f.id, status: 'BOOKED', scheduled_start: { gte: start, lt: end } } });
    const uncovered = appts.filter((a) => !rows.some((s) => s.starts_at <= a.scheduled_start && s.ends_at >= a.scheduled_end)).map((a) => ({ id: a.public_id, type: a.type, start: a.scheduled_start }));
    return { shifts: rows, uncoveredAppointments: uncovered };
  }

  @RequirePermission('shift.manage')
  @Post('facilities/:id/shifts')
  async addShift(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() body: unknown) {
    const f = await this.fac(ctx, id, 'shift.manage');
    const d = parse(z.object({ userId: z.string().length(26), date: zDate, startTime: z.string().regex(/^\d{2}:\d{2}$/), endTime: z.string().regex(/^\d{2}:\d{2}$/), templateId: z.string().optional(), roleOnShift: z.enum(['COUNTER', 'FLOOR', 'ON_CALL']).default('COUNTER'), note: z.string().max(255).optional() }), body);
    const user = await this.prisma.user.findUnique({ where: { public_id: d.userId } });
    if (!user) throw notFound('Nhân viên');
    await this.assertInFacility(user.id, f.id);
    const start = zonedToUtc(d.date, d.startTime, f.timezone);
    let end = zonedToUtc(d.date, d.endTime, f.timezone);
    if (end <= start) end = addDays(end, 1);
    return this.prisma.tx(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${user.id} FOR UPDATE`;
      const overlap = await tx.staffShift.findFirst({ where: { user_id: user.id, status: { not: 'CANCELLED' }, starts_at: { lt: end }, ends_at: { gt: start } } });
      if (overlap) throw new AppError('SHIFT_OVERLAP', `Trùng ca với ${fmtDT(overlap.starts_at)}`);
      const weekStart = addDays(dateOnly(d.date), -((weekdayIn(start, f.timezone) + 6) % 7));
      const week = await tx.staffShift.findMany({ where: { user_id: user.id, status: { not: 'CANCELLED' }, starts_at: { gte: weekStart, lt: addDays(weekStart, 7) } } });
      const hours = week.reduce((s, x) => s + (x.ends_at.getTime() - x.starts_at.getTime()) / 3600000, 0) + (end.getTime() - start.getTime()) / 3600000;
      const s = await tx.staffShift.create({ data: { public_id: newId(), facility_id: f.id, user_id: user.id, template_id: d.templateId ? BigInt(d.templateId) : null, starts_at: start, ends_at: end, role_on_shift: d.roleOnShift, note: d.note, created_by: ctx.userId } });
      return { ...s, warning: hours > 48 ? `Vượt 48 giờ/tuần (${Math.round(hours)} giờ)` : null };
    });
  }

  @RequirePermission('shift.manage')
  @Delete('shifts/:id')
  async cancelShift(@Ctx() ctx: AccessContext, @Param('id') id: string) {
    const s = await this.prisma.staffShift.findUnique({ where: { public_id: id } });
    ctx.assertScope('shift.manage', s, 'Ca', true);
    const u = await this.prisma.staffShift.update({ where: { id: s!.id }, data: { status: 'CANCELLED' } });
    if (s!.status === 'PUBLISHED') await this.notify.notify({ users: [s!.user_id], event: 'shift.published', vars: { week: `(ca ${fmtDT(s!.starts_at)} đã hủy)` }, link: '/staff/schedule', email: false });
    return u;
  }

  @RequirePermission('shift.manage')
  @Post('shifts/publish')
  async publish(@Ctx() ctx: AccessContext, @Body() body: unknown) {
    const d = parse(z.object({ facilityId: z.string(), from: z.string(), to: z.string() }), body);
    const f = await this.fac(ctx, d.facilityId, 'shift.manage');
    const rows = await this.prisma.staffShift.findMany({ where: { facility_id: f.id, status: 'PLANNED', starts_at: { gte: new Date(d.from), lt: new Date(d.to) } } });
    await this.prisma.staffShift.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { status: 'PUBLISHED' } });
    const users = [...new Set(rows.map((r) => r.user_id))];
    await this.notify.notify({ users, event: 'shift.published', vars: { week: `${fmtD(dateOnly(d.from.slice(0, 10)))}` }, link: '/staff/schedule', email: false });
    await this.audit.log(ctx, { action: 'shift.publish', entityType: 'facility', entityId: f.id, facilityId: f.id, after: { count: rows.length } });
    return { published: rows.length };
  }

  @Get('me/shifts')
  async myShifts(@Ctx() ctx: AccessContext) {
    return this.prisma.staffShift.findMany({ where: { user_id: ctx.userId, status: 'PUBLISHED', ends_at: { gte: addDays(this.core.now(), -7) } }, include: { facility: { select: { name: true, public_id: true } }, swaps: true }, orderBy: { starts_at: 'asc' }, take: 60 });
  }

  @Post('shift-swaps')
  async requestSwap(@Ctx() ctx: AccessContext, @Body() body: unknown) {
    const d = parse(z.object({ shiftId: z.string().length(26), reason: z.string().trim().min(3).max(255), proposedUserId: z.string().length(26).optional() }), body);
    const s = await this.prisma.staffShift.findUnique({ where: { public_id: d.shiftId } });
    if (!s || s.user_id !== ctx.userId) throw notFound('Ca làm');
    const proposed = d.proposedUserId ? await this.prisma.user.findUnique({ where: { public_id: d.proposedUserId } }) : null;
    if (proposed) await this.assertInFacility(proposed.id, s.facility_id);
    const r = await this.prisma.shiftSwapRequest.create({ data: { public_id: newId(), shift_id: s.id, requested_by: ctx.userId, proposed_user_id: proposed?.id ?? null, reason: d.reason } });
    await this.notify.notify({ users: await this.core.facilityManagers(this.prisma, s.facility_id), event: 'waiver.requested', vars: { amount: '', item: `đổi ca ${fmtDT(s.starts_at)}`, reason: d.reason }, link: '/manage/approvals', email: false });
    return r;
  }

  @RequirePermission('shift.manage')
  @Post('shift-swaps/:id/decide')
  async decideSwap(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() body: unknown) {
    const d = parse(z.object({ approve: z.boolean() }), body);
    const r = await this.prisma.shiftSwapRequest.findUnique({ where: { public_id: id }, include: { shift: true } });
    if (!r) throw notFound('Yêu cầu đổi ca');
    ctx.assertScope('shift.manage', r.shift, 'Yêu cầu đổi ca', true);
    if (r.status !== 'PENDING') throw new AppError('CONFLICT', 'Đã xử lý');
    return this.prisma.tx(async (tx) => {
      const u = await tx.shiftSwapRequest.update({ where: { id: r.id }, data: { status: d.approve ? 'APPROVED' : 'REJECTED', decided_by: ctx.userId, decided_at: this.core.now() } });
      if (d.approve) {
        if (r.proposed_user_id) {
          const overlap = await tx.staffShift.findFirst({ where: { user_id: r.proposed_user_id, status: { not: 'CANCELLED' }, starts_at: { lt: r.shift.ends_at }, ends_at: { gt: r.shift.starts_at } } });
          if (overlap) throw new AppError('SHIFT_OVERLAP', 'Người nhận ca bị trùng ca');
          await tx.staffShift.update({ where: { id: r.shift_id }, data: { user_id: r.proposed_user_id } });
        } else await tx.staffShift.update({ where: { id: r.shift_id }, data: { status: 'CANCELLED' } });
      }
      await this.notify.notify({ users: [r.requested_by, ...(r.proposed_user_id ? [r.proposed_user_id] : [])], event: 'shift.swap_decided', vars: { decision: d.approve ? 'duyệt' : 'từ chối', when: fmtDT(r.shift.starts_at) }, link: '/staff/schedule', email: false }, tx);
      return u;
    });
  }

  // ---------------------------------------------------------------- tasks
  @RequirePermission('task.read', false)
  @Get('tasks')
  async tasks(@Ctx() ctx: AccessContext, @Query() q: Record<string, unknown>) {
    const p = pageParams(q);
    const status = filterParam(q, 'status');
    const mine = filterParam(q, 'mine') === 'true';
    const type = filterParam(q, 'type');
    const where = {
      ...ctx.scope('task.read'),
      ...(status ? { status: { in: status.split(',') as never[] } } : { status: { notIn: ['DONE', 'CANCELLED'] as never[] } }),
      ...(mine ? { assignee_id: ctx.userId } : {}),
      ...(type ? { type: type as never } : {}),
      ...(filterParam(q, 'overdue') === 'true' ? { is_overdue: true } : {}),
    };
    const rows = await this.prisma.workTask.findMany({ where, include: { assignee: { select: { public_id: true, full_name: true } }, facility: { select: { public_id: true, name: true } } }, orderBy: [{ priority: 'desc' }, { due_at: 'asc' }], skip: p.skip, take: p.take });
    const unitIds = rows.map((r) => r.unit_id).filter((x): x is bigint => !!x);
    const units = await this.prisma.unit.findMany({ where: { id: { in: unitIds } }, select: { id: true, public_id: true, code: true } });
    const doneIds = rows.filter((r) => r.status === 'DONE').map((r) => r.id);
    const doneEvents = doneIds.length ? await this.prisma.taskEvent.findMany({ where: { task_id: { in: doneIds }, event: 'COMPLETED' }, orderBy: { id: 'asc' }, select: { task_id: true, actor_user_id: true } }) : [];
    const actorIds = [...new Set(doneEvents.map((e) => e.actor_user_id).filter((x): x is bigint => !!x))];
    const actors = actorIds.length ? await this.prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, public_id: true, full_name: true } }) : [];
    const completedBy = (taskId: bigint) => {
      const ev = [...doneEvents].reverse().find((e) => e.task_id === taskId);
      const u = ev?.actor_user_id ? actors.find((a) => a.id === ev.actor_user_id) : null;
      return u ? { public_id: u.public_id, full_name: u.full_name } : null;
    };
    const taskPhotos = rows.length ? await this.media.listFor('task', rows.map((r) => r.id)) : [];
    return paged(
      rows.map((r) => ({
        ...r,
        unit: units.find((u) => u.id === r.unit_id) ?? null,
        completed_by: r.status === 'DONE' ? completedBy(r.id) : null,
        photos: taskPhotos.filter((p) => p.related_id === r.id).map((p) => ({ id: p.public_id, url: p.url, caption: p.caption, takenAt: p.taken_at ?? p.created_at })),
      })),
      p,
      await this.prisma.workTask.count({ where }),
    );
  }

  @RequirePermission('task.read', false)
  @Get('tasks/:id')
  async task(@Ctx() ctx: AccessContext, @Param('id') id: string) {
    const t = await this.prisma.workTask.findUnique({ where: { public_id: id }, include: { assignee: { select: { public_id: true, full_name: true } }, events: { orderBy: { created_at: 'asc' } }, facility: { select: { public_id: true, name: true } } } });
    ctx.assertScope('task.read', t, 'Công việc');
    const related = await this.related(t!.related_type, t!.related_id);
    const unit = t!.unit_id ? await this.prisma.unit.findUnique({ where: { id: t!.unit_id }, select: { public_id: true, code: true, status: true } }) : null;
    const photos = await this.media.listFor('task', [t!.id]);
    return { ...t, related, unit, photos };
  }

  private async related(type: string | null, id: bigint | null) {
    if (!type || !id) return null;
    switch (type) {
      case 'reservation': {
        const r = await this.prisma.reservation.findUnique({ where: { id }, select: { public_id: true, code: true, status: true } });
        return r ? { type, ...r, link: `/manage/reservations/${r.public_id}/allocate` } : null;
      }
      case 'appointment': {
        const a = await this.prisma.appointment.findUnique({ where: { id }, include: { reservation: { select: { public_id: true, code: true } }, contract: { select: { public_id: true, code: true } } } });
        if (!a) return null;
        const mo = a.type === 'MOVE_OUT' ? await this.prisma.moveOutRequest.findFirst({ where: { appointment_id: a.id } }) : null;
        return { type, id: a.public_id, kind: a.type, when: a.scheduled_start, reservation: a.reservation, contract: a.contract, moveOutRequest: mo?.public_id ?? null };
      }
      case 'contract': {
        const c = await this.prisma.contract.findUnique({ where: { id }, select: { public_id: true, code: true, status: true, delinquency_status: true } });
        return c ? { type, ...c } : null;
      }
      case 'ticket': {
        const t = await this.prisma.supportTicket.findUnique({ where: { id }, select: { public_id: true, code: true, status: true, subject: true } });
        return t ? { type, ...t } : null;
      }
      case 'work_order': {
        const w = await this.prisma.workOrder.findUnique({ where: { id }, select: { public_id: true, code: true, status: true } });
        return w ? { type, ...w } : null;
      }
      case 'move_out_request': {
        const m = await this.prisma.moveOutRequest.findUnique({ where: { id }, select: { public_id: true, status: true, requested_date: true } });
        return m ? { type, ...m } : null;
      }
      default:
        return { type };
    }
  }

  @RequirePermission('task.assign')
  @Post('tasks')
  async createTask(@Ctx() ctx: AccessContext, @Body() body: unknown) {
    const d = parse(z.object({ facilityId: z.string(), type: z.enum(['ROUTINE_INSPECTION', 'CLEANING', 'MAINTENANCE', 'COLLECTION_CALL', 'OTHER']), title: z.string().trim().min(3).max(200), description: z.string().max(5000).optional(), unitId: z.string().length(26).optional(), assigneeId: z.string().length(26).optional(), priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'), dueAt: z.string().datetime().optional(), requiresPhoto: z.boolean().default(false) }), body);
    const f = await this.fac(ctx, d.facilityId, 'task.assign');
    const unit = d.unitId ? await this.prisma.unit.findFirst({ where: { public_id: d.unitId, facility_id: f.id } }) : null;
    const assignee = d.assigneeId ? await this.prisma.user.findUnique({ where: { public_id: d.assigneeId } }) : null;
    if (assignee) await this.assertInFacility(assignee.id, f.id);
    return this.prisma.tx(async (tx) => {
      const t = await this.core.createTask(tx, { facilityId: f.id, type: d.type, title: d.title, description: d.description, unitId: unit?.id, related: unit ? { type: 'unit', id: unit.id } : undefined, priority: d.priority, dueAt: d.dueAt ? new Date(d.dueAt) : null, assigneeId: assignee?.id ?? null, requiresPhoto: d.requiresPhoto, source: 'MANUAL', actor: ctx.userId });
      if (d.type === 'ROUTINE_INSPECTION' && unit && ['OCCUPIED', 'OVERLOCKED'].includes(unit.status)) {
        await this.core.setOperationalFlag(tx, unit.id, 'INSPECTION_DUE', d.title, ctx.userId);
        const c = await tx.contract.findFirst({ where: { unit_id: unit.id, status: { in: ['ACTIVE', 'MOVE_OUT_SCHEDULED', 'EXPIRED'] } } });
        const uid = c ? await this.core.customerUser(tx, c.customer_id) : null;
        if (uid) await this.notify.notify({ users: [uid], event: 'inspection.scheduled', vars: { code: c!.code, unitCode: unit.code, facility: f.name, when: d.dueAt ? fmtDT(new Date(d.dueAt)) : 'trong thời gian tới', reason: d.title }, link: `/app/units/${c!.public_id}`, related: { type: 'contract', id: c!.id }, email: true }, tx);
      }
      return t;
    });
  }

  private async loadTask(ctx: AccessContext, id: string) {
    const t = await this.prisma.workTask.findUnique({ where: { public_id: id } });
    ctx.assertScope('task.update', t, 'Công việc', true);
    // Staff only update tasks assigned to them or OPEN tasks of the facility (§6.5 rule 3)
    const isFm = ctx.facilitiesFor('task.assign').includes(t!.facility_id);
    if (!isFm && t!.assignee_id && t!.assignee_id !== ctx.userId) throw forbidden('Bạn chỉ cập nhật công việc được giao cho mình');
    return { t: t!, isFm };
  }

  private async moveTask(tx: Tx, t: { id: bigint; status: string; facility_id: bigint; public_id: string }, to: string, data: Record<string, unknown>, event: string, actor: bigint, note?: string) {
    if (!canTransition(TASK_TRANSITIONS, t.status, to)) throw invalidTransition('công việc', t.status, to);
    const u = await tx.workTask.update({ where: { id: t.id }, data: { status: to as never, version: { increment: 1 }, ...data } });
    await tx.taskEvent.create({ data: { task_id: t.id, event: event as never, actor_user_id: actor, note } });
    const f = await tx.facility.findUniqueOrThrow({ where: { id: t.facility_id }, select: { public_id: true } });
    await this.events.emit(tx, 'task.changed', { type: 'task', id: t.id }, { facility: f.public_id, task: t.public_id, status: to });
    return u;
  }

  @RequirePermission('task.update')
  @Post('tasks/:id/claim')
  async claim(@Ctx() ctx: AccessContext, @Param('id') id: string) {
    const { t } = await this.loadTask(ctx, id);
    if (t.status !== 'OPEN') throw new AppError('CONFLICT', 'Công việc đã có người nhận');
    return this.prisma.tx((tx) => this.moveTask(tx, t, 'ASSIGNED', { assignee_id: ctx.userId }, 'ASSIGNED', ctx.userId, 'Tự nhận'));
  }

  @RequirePermission('task.update')
  @Post('tasks/:id/start')
  async start(@Ctx() ctx: AccessContext, @Param('id') id: string) {
    const { t } = await this.loadTask(ctx, id);
    return this.prisma.tx((tx) => this.moveTask(tx, t, 'IN_PROGRESS', { started_at: t.started_at ?? this.core.now(), assignee_id: t.assignee_id ?? ctx.userId, blocked_reason: null }, t.status === 'BLOCKED' ? 'UNBLOCKED' : 'STARTED', ctx.userId));
  }

  @RequirePermission('task.update')
  @Post('tasks/:id/complete')
  async complete(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() body: unknown) {
    const { t } = await this.loadTask(ctx, id);
    const d = parse(z.object({ note: z.string().max(5000).optional(), photoIds: z.array(z.string()).max(10).default([]) }), body);
    if (t.requires_photo && !d.photoIds.length && !['HANDOVER', 'MOVE_OUT_INSPECTION', 'ALLOCATE_UNIT'].includes(t.type)) throw validation('Công việc này yêu cầu ảnh khi hoàn thành');
    if (['HANDOVER', 'MOVE_OUT_INSPECTION', 'ALLOCATE_UNIT', 'OVERLOCK', 'REMOVE_OVERLOCK'].includes(t.type)) throw validation('Công việc này tự hoàn thành khi thực hiện nghiệp vụ tương ứng (wizard / phân bổ / khóa chặn)');
    return this.prisma.tx(async (tx) => {
      if (d.photoIds.length) await this.media.attach(tx, ctx, d.photoIds, 'task', t.id, t.facility_id);
      const now = this.core.now();
      const u = await this.moveTask(tx, t.status === 'ASSIGNED' || t.status === 'OPEN' ? { ...t, status: 'IN_PROGRESS' } : t, 'DONE', { completed_at: now, started_at: t.started_at ?? now, completion_note: d.note, is_overdue: !!t.due_at && t.due_at < now }, 'COMPLETED', ctx.userId, d.note);
      if (t.type === 'ROUTINE_INSPECTION' && t.unit_id) {
        const unit = await tx.unit.findUniqueOrThrow({ where: { id: t.unit_id } });
        if (unit.operational_flag === 'INSPECTION_DUE') await this.core.setOperationalFlag(tx, unit.id, 'NONE', 'Đã kiểm tra định kỳ', ctx.userId);
      }
      return u;
    });
  }

  @RequirePermission('task.update')
  @Post('tasks/:id/block')
  async block(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() body: unknown) {
    const { t } = await this.loadTask(ctx, id);
    const d = parse(z.object({ reason: z.string().trim().min(3).max(255) }), body);
    const u = await this.prisma.tx((tx) => this.moveTask(tx, t, 'BLOCKED', { blocked_reason: d.reason }, 'BLOCKED', ctx.userId, d.reason));
    await this.notify.notify({ users: await this.core.facilityManagers(this.prisma, t.facility_id), event: 'task.overdue', vars: { title: `${t.title} (vướng: ${d.reason})`, due: t.due_at ? fmtDT(t.due_at) : '' }, link: `/manage/tasks`, email: false });
    return u;
  }

  @RequirePermission('task.assign')
  @Post('tasks/:id/cancel')
  async cancel(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() body: unknown) {
    const t = await this.prisma.workTask.findUnique({ where: { public_id: id } });
    ctx.assertScope('task.assign', t, 'Công việc', true);
    const d = parse(z.object({ reason: z.string().trim().min(3).max(255) }), body);
    return this.prisma.tx((tx) => this.moveTask(tx, t!, 'CANCELLED', {}, 'CANCELLED', ctx.userId, d.reason));
  }

  @RequirePermission('task.assign')
  @Post('tasks/:id/assign')
  async assign(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() body: unknown) {
    const t = await this.prisma.workTask.findUnique({ where: { public_id: id } });
    ctx.assertScope('task.assign', t, 'Công việc', true);
    const d = parse(z.object({ assigneeId: z.string().length(26), dueAt: z.string().datetime().optional() }), body);
    const user = await this.prisma.user.findUnique({ where: { public_id: d.assigneeId } });
    if (!user) throw notFound('Nhân viên');
    await this.assertInFacility(user.id, t!.facility_id);
    if (['DONE', 'CANCELLED'].includes(t!.status)) throw new AppError('INVALID_STATUS_TRANSITION', 'Công việc đã kết thúc');
    return this.prisma.tx(async (tx) => {
      const u = await tx.workTask.update({ where: { id: t!.id }, data: { assignee_id: user.id, status: t!.status === 'OPEN' ? 'ASSIGNED' : t!.status, due_at: d.dueAt ? new Date(d.dueAt) : undefined, version: { increment: 1 } } });
      await tx.taskEvent.create({ data: { task_id: t!.id, event: t!.assignee_id ? 'REASSIGNED' : 'ASSIGNED', from_user_id: t!.assignee_id, to_user_id: user.id, actor_user_id: ctx.userId } });
      if (t!.related_type === 'appointment' && t!.related_id) await tx.appointment.update({ where: { id: t!.related_id }, data: { assigned_staff_id: user.id } });
      await this.notify.notify({ users: [user.id], event: 'task.assigned', vars: { title: t!.title, due: u.due_at ? fmtDT(u.due_at) : '' }, link: `/staff/tasks/${t!.public_id}`, email: false }, tx);
      return u;
    });
  }

  /** Staff absent → move all open tasks to another person (§6.5 exceptions). */
  @RequirePermission('task.assign')
  @Post('tasks/bulk-reassign')
  async bulkReassign(@Ctx() ctx: AccessContext, @Body() body: unknown) {
    const d = parse(z.object({ facilityId: z.string(), fromUserId: z.string().length(26), toUserId: z.string().length(26).nullable() }), body);
    const f = await this.fac(ctx, d.facilityId, 'task.assign');
    const from = await this.prisma.user.findUnique({ where: { public_id: d.fromUserId } });
    const to = d.toUserId ? await this.prisma.user.findUnique({ where: { public_id: d.toUserId } }) : null;
    if (!from) throw notFound('Nhân viên');
    if (to) await this.assertInFacility(to.id, f.id);
    const tasks = await this.prisma.workTask.findMany({ where: { facility_id: f.id, assignee_id: from.id, status: { in: ['ASSIGNED', 'IN_PROGRESS', 'BLOCKED'] } } });
    await this.prisma.tx(async (tx) => {
      for (const t of tasks) {
        await tx.workTask.update({ where: { id: t.id }, data: { assignee_id: to?.id ?? null, status: to ? 'ASSIGNED' : 'OPEN', version: { increment: 1 } } });
        await tx.taskEvent.create({ data: { task_id: t.id, event: 'REASSIGNED', from_user_id: from.id, to_user_id: to?.id ?? null, actor_user_id: ctx.userId, note: 'Chuyển hàng loạt' } });
      }
      const tickets = await tx.supportTicket.findMany({ where: { facility_id: f.id, assignee_id: from.id, status: { notIn: ['CLOSED', 'CANCELLED', 'RESOLVED'] } } });
      for (const tk of tickets) await tx.supportTicket.update({ where: { id: tk.id }, data: { assignee_id: to?.id ?? null, status: to ? tk.status : 'NEW' } });
      if (to) await this.notify.notify({ users: [to.id], event: 'task.assigned', vars: { title: `${tasks.length} công việc được chuyển từ ${from.full_name}`, due: '' }, link: '/staff/tasks', email: false }, tx);
    });
    await this.audit.log(ctx, { action: 'task.bulk_reassign', entityType: 'facility', entityId: f.id, facilityId: f.id, after: { count: tasks.length, from: from.public_id, to: to?.public_id ?? null } });
    return { moved: tasks.length };
  }

  // ---------------------------------------------------------------- work orders (§6.5 5D)
  @RequirePermission('task.read', false)
  @Get('work-orders')
  async workOrders(@Ctx() ctx: AccessContext, @Query() q: Record<string, unknown>) {
    const status = filterParam(q, 'status');
    const rows = await this.prisma.workOrder.findMany({ where: { ...ctx.scope('task.read'), ...(status ? { status: { in: status.split(',') as never[] } } : {}) }, include: { unit: { select: { public_id: true, code: true, status: true } }, facility: { select: { name: true, public_id: true } } }, orderBy: { created_at: 'desc' }, take: 200 });
    return Promise.all(rows.map(async (w) => ({ ...w, photos: await this.media.listFor('work_order', [w.id]) })));
  }

  @RequirePermission('task.update')
  @Post('work-orders')
  async reportWorkOrder(@Ctx() ctx: AccessContext, @Body() body: unknown) {
    const d = parse(z.object({ facilityId: z.string(), unitId: z.string().length(26).optional(), category: z.enum(['DOOR', 'LOCK', 'ELECTRICAL', 'LEAK', 'PEST', 'CLEANING', 'FIRE_SAFETY', 'STRUCTURE', 'OTHER']), description: z.string().trim().min(5).max(5000), priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'), photoIds: z.array(z.string()).max(10).default([]) }), body);
    const f = await this.fac(ctx, d.facilityId, 'task.update');
    const unit = d.unitId ? await this.prisma.unit.findFirst({ where: { public_id: d.unitId, facility_id: f.id } }) : null;
    return this.prisma.tx((tx) => this.createWorkOrder(tx, ctx, { facilityId: f.id, unitId: unit?.id ?? null, category: d.category, description: d.description, priority: d.priority, photoIds: d.photoIds }));
  }

  async createWorkOrder(tx: Tx, ctx: AccessContext, d: { facilityId: bigint; unitId: bigint | null; category: string; description: string; priority: string; photoIds?: string[]; ticketId?: bigint | null; planId?: bigint | null }) {
    const wo = await tx.workOrder.create({ data: { public_id: newId(), code: await nextCode(tx, 'WO', this.core.now().getFullYear()), facility_id: d.facilityId, unit_id: d.unitId, ticket_id: d.ticketId ?? null, plan_id: d.planId ?? null, category: d.category as never, description: d.description, priority: d.priority as never, reported_by: ctx.userId } });
    if (d.photoIds?.length) await this.media.attach(tx, ctx, d.photoIds, 'work_order', wo.id, d.facilityId);
    if (d.unitId) {
      const unit = await tx.unit.findUniqueOrThrow({ where: { id: d.unitId } });
      if (['OCCUPIED', 'OVERLOCKED'].includes(unit.status)) await this.core.setOperationalFlag(tx, unit.id, 'MAINTENANCE_SCHEDULED', `Work order ${wo.code}`, ctx.userId);
    }
    await this.notify.notify({ users: await this.core.facilityManagers(tx, d.facilityId), event: 'workorder.reported', vars: { code: wo.code, description: d.description.slice(0, 120) }, link: '/manage/maintenance', related: { type: 'work_order', id: wo.id }, email: false }, tx);
    await this.audit.log(ctx, { action: 'work_order.report', entityType: 'work_order', entityId: wo.id, entityRef: wo.code, facilityId: d.facilityId }, tx);
    return wo;
  }

  @RequirePermission('task.update')
  @Post('work-orders/:id/:action')
  async woAction(@Ctx() ctx: AccessContext, @Param('id') id: string, @Param('action') action: string, @Body() body: unknown) {
    const wo = await this.prisma.workOrder.findUnique({ where: { public_id: id }, include: { unit: true } });
    ctx.assertScope('task.update', wo, 'Work order', true);
    const isFm = ctx.facilitiesFor('task.assign').includes(wo!.facility_id);
    const map: Record<string, string> = { approve: 'APPROVED', schedule: 'SCHEDULED', start: 'IN_PROGRESS', complete: 'COMPLETED', verify: 'VERIFIED', cancel: 'CANCELLED' };
    const to = map[action];
    if (!to) throw notFound('Hành động');
    if (!isFm && !['start', 'complete'].includes(action)) throw forbidden('Chỉ quản lý cơ sở thực hiện bước này');
    if (!canTransition(WORK_ORDER_TRANSITIONS, wo!.status, to)) throw invalidTransition('work order', wo!.status, to);
    const d = parse(z.object({ estimatedCost: z.number().min(0).optional(), actualCost: z.number().min(0).optional(), scheduledFor: z.string().datetime().optional(), vendorName: z.string().max(150).optional(), assigneeId: z.string().length(26).optional(), note: z.string().max(5000).optional(), photoIds: z.array(z.string()).max(10).default([]) }), body);
    if (action === 'complete' && !d.photoIds.length) throw validation('Cần ảnh sau sửa chữa');
    return this.prisma.tx(async (tx) => {
      const assignee = d.assigneeId ? await tx.user.findUnique({ where: { public_id: d.assigneeId } }) : null;
      const u = await tx.workOrder.update({
        where: { id: wo!.id },
        data: {
          status: to as never, estimated_cost: d.estimatedCost !== undefined ? vnd(d.estimatedCost) : undefined, actual_cost: d.actualCost !== undefined ? vnd(d.actualCost) : undefined,
          scheduled_for: d.scheduledFor ? new Date(d.scheduledFor) : undefined, vendor_name: d.vendorName, assignee_id: assignee?.id, completion_note: d.note,
          completed_at: to === 'COMPLETED' ? this.core.now() : undefined, verified_by: to === 'VERIFIED' ? ctx.userId : undefined, verified_at: to === 'VERIFIED' ? this.core.now() : undefined,
        },
      });
      if (d.photoIds.length) await this.media.attach(tx, ctx, d.photoIds, 'work_order', wo!.id, wo!.facility_id);
      if (wo!.unit) {
        if (to === 'APPROVED' && wo!.unit.status === 'AVAILABLE') await this.core.transitionUnit(tx, wo!.unit_id!, 'MAINTENANCE', { reason: `Work order ${wo!.code}`, actor: ctx.userId, related: { type: 'work_order', id: wo!.id } });
        if ((to === 'VERIFIED' || to === 'CANCELLED') && wo!.unit.status === 'MAINTENANCE') {
          const other = await tx.workOrder.count({ where: { unit_id: wo!.unit_id, id: { not: wo!.id }, status: { in: ['REPORTED', 'APPROVED', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED'] } } });
          if (!other) await this.core.transitionUnit(tx, wo!.unit_id!, 'AVAILABLE', { reason: `Hoàn tất ${wo!.code}`, actor: ctx.userId, related: { type: 'work_order', id: wo!.id } });
        }
        if ((to === 'VERIFIED' || to === 'CANCELLED') && wo!.unit.operational_flag === 'MAINTENANCE_SCHEDULED') await this.core.setOperationalFlag(tx, wo!.unit_id!, 'NONE', `Hoàn tất ${wo!.code}`, ctx.userId);
      }
      if (to === 'COMPLETED') await this.notify.notify({ users: await this.core.facilityManagers(tx, wo!.facility_id), event: 'workorder.completed', vars: { code: wo!.code }, link: '/manage/maintenance', related: { type: 'work_order', id: wo!.id }, email: false }, tx);
      await this.audit.log(ctx, { action: `work_order.${action}`, entityType: 'work_order', entityId: wo!.id, entityRef: wo!.code, facilityId: wo!.facility_id, after: d }, tx);
      return u;
    });
  }

  @RequirePermission('task.assign')
  @Get('facilities/:id/maintenance-plans')
  async plans(@Ctx() ctx: AccessContext, @Param('id') id: string) {
    const f = await this.fac(ctx, id, 'task.assign', false);
    return this.prisma.maintenancePlan.findMany({ where: { facility_id: f.id }, orderBy: { next_due_date: 'asc' } });
  }

  @RequirePermission('task.assign')
  @Post('facilities/:id/maintenance-plans')
  async addPlan(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() body: unknown) {
    const f = await this.fac(ctx, id, 'task.assign');
    const d = parse(z.object({ name: z.string().trim().min(3).max(150), category: z.enum(['DOOR', 'LOCK', 'ELECTRICAL', 'LEAK', 'PEST', 'CLEANING', 'FIRE_SAFETY', 'STRUCTURE', 'OTHER']), intervalDays: z.number().int().min(1).max(3650), nextDueDate: zDate }), body);
    return this.prisma.maintenancePlan.create({ data: { public_id: newId(), facility_id: f.id, name: d.name, category: d.category, interval_days: d.intervalDays, next_due_date: dateOnly(d.nextDueDate) } });
  }

  @RequirePermission('task.assign')
  @Patch('maintenance-plans/:id')
  async updatePlan(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() body: unknown) {
    const p = await this.prisma.maintenancePlan.findUnique({ where: { public_id: id } });
    ctx.assertScope('task.assign', p, 'Kế hoạch', true);
    const d = parse(z.object({ active: z.boolean(), intervalDays: z.number().int().min(1), nextDueDate: zDate, name: z.string().max(150) }).partial(), body);
    return this.prisma.maintenancePlan.update({ where: { id: p!.id }, data: { active: d.active, interval_days: d.intervalDays, next_due_date: d.nextDueDate ? dateOnly(d.nextDueDate) : undefined, name: d.name } });
  }

  timeIn = timeIn;
}

function buildDynamicFloorplanTemplatesReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface DailyRefundStartPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateDailyRefundStartInput(payload: DailyRefundStartPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}
const hasRollingMonthlyInspectionWorkforceRef = (v: string): boolean => v.trim().length > 0;

function matchesDynamicInvoiceStartCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class DailyPromotionTemplatesCoordinator {
  private readonly maxWindowDays = 34;
  private readonly branchScope = 'flow5:promotion';

  isEligibleWindow(elapsedDays: number, hasClearedBalance: boolean): boolean {
    if (elapsedDays < 0 || elapsedDays > this.maxWindowDays) return false;
    return hasClearedBalance;
  }

  normalizeReference(rawCode: string): string {
    const cleaned = rawCode.trim().toUpperCase();
    return cleaned ? `${this.branchScope}:${cleaned}` : this.branchScope;
  }
}

function calculateStrictHandoverStartWindow(
  startIso: string,
  windowDays: number = 19,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileBoundedRenewalTemplatesLedgerItems(
  lines: readonly { creditVnd: number; debitVnd: number }[],
): { totalCredit: number; totalDebit: number; balanceVnd: number } {
  let totalCredit = 0;
  let totalDebit = 0;
  for (const row of lines) {
    if (Number.isFinite(row.creditVnd)) totalCredit += row.creditVnd;
    if (Number.isFinite(row.debitVnd)) totalDebit += row.debitVnd;
  }
  return { totalCredit, totalDebit, balanceVnd: totalCredit - totalDebit };
}

function computeGuardCorridorStartBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeActiveInspectionTemplatesQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 30)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildSyncedQuoteStartReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface CoreBillingCycleTemplatesPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateCoreBillingCycleTemplatesInput(payload: CoreBillingCycleTemplatesPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface MonthlyDiscountStartBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupMonthlyDiscountStartByScope(items: readonly MonthlyDiscountStartBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow5';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectPrimaryCheckinTemplatesChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupeRollingSupportTicketStartRecords<T extends { id: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const item of items) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      unique.push(item);
    }
  }
  return unique;
}

function canTransitionBatchUnitSlotTemplatesState(fromState: string, toState: string): boolean {
  const current = fromState.trim().toUpperCase();
  const next = toState.trim().toUpperCase();
  switch (current) {
    case 'DRAFT':
      return next === 'PENDING' || next === 'ACTIVE';
    case 'PENDING':
      return next === 'ACTIVE' || next === 'CANCELLED';
    case 'ACTIVE':
      return next === 'OVERLOCKED' || next === 'CLOSED';
    default:
      return false;
  }
}

type PendingSettlementStartRecord = {
  readonly id: string;
  readonly status: string;
};

function isPendingSettlementStartRecord(input: unknown): input is PendingSettlementStartRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function mapToIndexedBookingTemplatesSummary(source: {
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

const STANDARD_DELINQUENCY_START_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveStandardDelinquencyStartTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return STANDARD_DELINQUENCY_START_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatTenantApprovalTemplatesDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesSecondarySignatureStartCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class ExpressEscalationTemplatesCoordinator {
  private readonly maxWindowDays = 35;
  private readonly branchScope = 'flow5:escalation';

  isEligibleWindow(elapsedDays: number, hasClearedBalance: boolean): boolean {
    if (elapsedDays < 0 || elapsedDays > this.maxWindowDays) return false;
    return hasClearedBalance;
  }

  normalizeReference(rawCode: string): string {
    const cleaned = rawCode.trim().toUpperCase();
    return cleaned ? `${this.branchScope}:${cleaned}` : this.branchScope;
  }
}

function calculatePortalFloorplanStartWindow(
  startIso: string,
  windowDays: number = 20,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileVerifiedRefundTemplatesLedgerItems(
  lines: readonly { creditVnd: number; debitVnd: number }[],
): { totalCredit: number; totalDebit: number; balanceVnd: number } {
  let totalCredit = 0;
  let totalDebit = 0;
  for (const row of lines) {
    if (Number.isFinite(row.creditVnd)) totalCredit += row.creditVnd;
    if (Number.isFinite(row.debitVnd)) totalDebit += row.debitVnd;
  }
  return { totalCredit, totalDebit, balanceVnd: totalCredit - totalDebit };
}

function computeUnifiedDepositStartBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeLedgerOverlockTemplatesQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 30)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildBranchFacilityStartReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface ScopedContractTemplatesPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateScopedContractTemplatesInput(payload: ScopedContractTemplatesPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface DynamicAuditTrailStartBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupDynamicAuditTrailStartByScope(items: readonly DynamicAuditTrailStartBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow5';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectDailyWorkforceTemplatesChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupeStrictPolicyStartRecords<T extends { id: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const item of items) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      unique.push(item);
    }
  }
  return unique;
}

function canTransitionBoundedProrationTemplatesState(fromState: string, toState: string): boolean {
  const current = fromState.trim().toUpperCase();
  const next = toState.trim().toUpperCase();
  switch (current) {
    case 'DRAFT':
      return next === 'PENDING' || next === 'ACTIVE';
    case 'PENDING':
      return next === 'ACTIVE' || next === 'CANCELLED';
    case 'ACTIVE':
      return next === 'OVERLOCKED' || next === 'CLOSED';
    default:
      return false;
  }
}

type GuardLiquidationStartRecord = {
  readonly id: string;
  readonly status: string;
};

function isGuardLiquidationStartRecord(input: unknown): input is GuardLiquidationStartRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function mapToActiveZoneTemplatesSummary(source: {
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

const SYNCED_MOVEOUT_START_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveSyncedMoveoutStartTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return SYNCED_MOVEOUT_START_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatCoreOccupancyMetricTemplatesDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesMonthlyInvoiceStartCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class PrimaryPromotionTemplatesCoordinator {
  private readonly maxWindowDays = 36;
  private readonly branchScope = 'flow5:promotion';

  isEligibleWindow(elapsedDays: number, hasClearedBalance: boolean): boolean {
    if (elapsedDays < 0 || elapsedDays > this.maxWindowDays) return false;
    return hasClearedBalance;
  }

  normalizeReference(rawCode: string): string {
    const cleaned = rawCode.trim().toUpperCase();
    return cleaned ? `${this.branchScope}:${cleaned}` : this.branchScope;
  }
}

function calculateRollingHandoverStartWindow(
  startIso: string,
  windowDays: number = 21,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileBatchRenewalTemplatesLedgerItems(
  lines: readonly { creditVnd: number; debitVnd: number }[],
): { totalCredit: number; totalDebit: number; balanceVnd: number } {
  let totalCredit = 0;
  let totalDebit = 0;
  for (const row of lines) {
    if (Number.isFinite(row.creditVnd)) totalCredit += row.creditVnd;
    if (Number.isFinite(row.debitVnd)) totalDebit += row.debitVnd;
  }
  return { totalCredit, totalDebit, balanceVnd: totalCredit - totalDebit };
}

function computePendingCorridorStartBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeIndexedInspectionTemplatesQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 30)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildStandardQuoteStartReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface TenantBillingCycleTemplatesPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateTenantBillingCycleTemplatesInput(payload: TenantBillingCycleTemplatesPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface SecondaryDiscountStartBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupSecondaryDiscountStartByScope(items: readonly SecondaryDiscountStartBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow5';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectExpressCheckinTemplatesChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupePortalSupportTicketStartRecords<T extends { id: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const item of items) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      unique.push(item);
    }
  }
  return unique;
}

function canTransitionVerifiedUnitSlotTemplatesState(fromState: string, toState: string): boolean {
  const current = fromState.trim().toUpperCase();
  const next = toState.trim().toUpperCase();
  switch (current) {
    case 'DRAFT':
      return next === 'PENDING' || next === 'ACTIVE';
    case 'PENDING':
      return next === 'ACTIVE' || next === 'CANCELLED';
    case 'ACTIVE':
      return next === 'OVERLOCKED' || next === 'CLOSED';
    default:
      return false;
  }
}

type UnifiedSettlementStartRecord = {
  readonly id: string;
  readonly status: string;
};

function isUnifiedSettlementStartRecord(input: unknown): input is UnifiedSettlementStartRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function mapToLedgerBookingTemplatesSummary(source: {
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

const BRANCH_DELINQUENCY_START_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveBranchDelinquencyStartTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return BRANCH_DELINQUENCY_START_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatScopedApprovalTemplatesDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesDynamicSignatureStartCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class DailyEscalationTemplatesCoordinator {
  private readonly maxWindowDays = 37;
  private readonly branchScope = 'flow5:escalation';

  isEligibleWindow(elapsedDays: number, hasClearedBalance: boolean): boolean {
    if (elapsedDays < 0 || elapsedDays > this.maxWindowDays) return false;
    return hasClearedBalance;
  }

  normalizeReference(rawCode: string): string {
    const cleaned = rawCode.trim().toUpperCase();
    return cleaned ? `${this.branchScope}:${cleaned}` : this.branchScope;
  }
}

function calculateStrictFloorplanStartWindow(
  startIso: string,
  windowDays: number = 17,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileBoundedRefundTemplatesLedgerItems(
  lines: readonly { creditVnd: number; debitVnd: number }[],
): { totalCredit: number; totalDebit: number; balanceVnd: number } {
  let totalCredit = 0;
  let totalDebit = 0;
  for (const row of lines) {
    if (Number.isFinite(row.creditVnd)) totalCredit += row.creditVnd;
    if (Number.isFinite(row.debitVnd)) totalDebit += row.debitVnd;
  }
  return { totalCredit, totalDebit, balanceVnd: totalCredit - totalDebit };
}

function computeGuardDepositStartBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeActiveOverlockTemplatesQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 30)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildSyncedFacilityStartReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface CoreContractTemplatesPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateCoreContractTemplatesInput(payload: CoreContractTemplatesPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface MonthlyAuditTrailStartBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupMonthlyAuditTrailStartByScope(items: readonly MonthlyAuditTrailStartBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow5';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectPrimaryWorkforceTemplatesChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupeRollingPolicyStartRecords<T extends { id: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const item of items) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      unique.push(item);
    }
  }
  return unique;
}

function canTransitionBatchProrationTemplatesState(fromState: string, toState: string): boolean {
  const current = fromState.trim().toUpperCase();
  const next = toState.trim().toUpperCase();
  switch (current) {
    case 'DRAFT':
      return next === 'PENDING' || next === 'ACTIVE';
    case 'PENDING':
      return next === 'ACTIVE' || next === 'CANCELLED';
    case 'ACTIVE':
      return next === 'OVERLOCKED' || next === 'CLOSED';
    default:
      return false;
  }
}

type PendingLiquidationStartRecord = {
  readonly id: string;
  readonly status: string;
};

function isPendingLiquidationStartRecord(input: unknown): input is PendingLiquidationStartRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function mapToIndexedZoneTemplatesSummary(source: {
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

const STANDARD_MOVEOUT_START_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveStandardMoveoutStartTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return STANDARD_MOVEOUT_START_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatTenantOccupancyMetricTemplatesDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

const STRICT_LEDGER_SIGNATURE_LABELS: Record<string, string> = {
  REFUNDED: 'Refunded',
  LIQUIDATING: 'Liquidating',
  LOCKED: 'Access locked',
  AVAILABLE: 'Available',
  RESERVED: 'Reserved',
  MAINTENANCE: 'Maintenance',
  INSPECTED: 'Inspected',
};
