import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../common/prisma.service';
import { Ctx, RequirePermission } from '../auth/decorators';
import { AccessContext } from '../auth/access-context';
import { filterParam, pageParams, paged, parse, zReason } from '../common/http';
import { AppError, forbidden, notFound, validation } from '../common/errors';
import { newId, randomToken, sha256 } from '../common/util';
import { config } from '../common/config';
import { attach, loaders } from '../common/enrich';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { ContextService } from '../auth/context.service';
import { NotificationService } from '../notifications/notification.service';
import { SettingsService, DEFAULT_SETTINGS } from '../config/settings.service';
import { ReportService } from '../report/report.service';
import { RealtimeHub } from '../realtime/realtime.hub';
import { ROLE_META, ROLE_PERMISSIONS, PERMISSIONS, RoleCode } from '@vaultra/shared';

const ROLE_CODES = ['CUSTOMER', 'FACILITY_STAFF', 'FACILITY_MANAGER', 'BUSINESS_OPS_MANAGER', 'SYSTEM_ADMIN'] as const;
const INTERNAL_ROLES = ['FACILITY_STAFF', 'FACILITY_MANAGER', 'BUSINESS_OPS_MANAGER', 'SYSTEM_ADMIN'] as const;
const FACILITY_ROLES = ['FACILITY_STAFF', 'FACILITY_MANAGER'];

/** System administration (spec FR-A01..A05, §11.11): accounts, roles, sessions, audit, config, security. */
@Controller('admin')
export class AdminController {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private auth: AuthService,
    private contexts: ContextService,
    private notify: NotificationService,
    private settings: SettingsService,
    private reports: ReportService,
    private hub: RealtimeHub,
  ) {}

  private async userOr404(id: string) {
    const u = await this.prisma.user.findUnique({ where: { public_id: id }, include: { roles: { where: { revoked_at: null }, include: { role: true, facility: { select: { public_id: true, name: true, code: true } } } }, customer: { select: { public_id: true, code: true } } } });
    if (!u) throw notFound('Tài khoản');
    return u;
  }

  /** The business-ops manager may manage facility staff/manager accounts only; admins and other BOMs stay with the system admin. */
  private guardTarget(ctx: AccessContext, u: { roles: { role: { code: string } }[] }) {
    if (ctx.hasRole('SYSTEM_ADMIN')) return;
    if (u.roles.some((r) => !FACILITY_ROLES.includes(r.role.code) && r.role.code !== 'CUSTOMER')) throw forbidden('Chỉ quản trị hệ thống quản lý tài khoản quản trị / vận hành');
  }
  private guardRoles(ctx: AccessContext, roles: string[]) {
    if (ctx.hasRole('SYSTEM_ADMIN')) return;
    if (roles.some((r) => !FACILITY_ROLES.includes(r))) throw forbidden('Quản lý vận hành chỉ gán vai trò quản lý cơ sở hoặc nhân viên cơ sở');
  }

  private async activeAdmins(excludeUserId?: bigint) {
    return this.prisma.userRole.count({ where: { revoked_at: null, role: { code: 'SYSTEM_ADMIN' }, user: { status: 'ACTIVE', ...(excludeUserId ? { id: { not: excludeUserId } } : {}) } } });
  }

  // ---------------------------------------------------------------- users
  @RequirePermission('user.manage', false)
  @Get('users')
  async users(@Query() q: Record<string, unknown>) {
    const p = pageParams(q);
    const status = filterParam(q, 'status');
    const role = filterParam(q, 'role');
    const search = typeof q.q === 'string' ? q.q.trim() : '';
    const where = {
      deleted_at: null,
      ...(status ? { status: { in: status.split(',') } } : {}),
      ...(role ? { roles: { some: { revoked_at: null, role: { code: { in: role.split(',') } } } } } : {}),
      ...(search ? { OR: [{ email: { contains: search } }, { full_name: { contains: search } }, { phone: { contains: search } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({ where: where as never, include: { roles: { where: { revoked_at: null }, include: { role: true, facility: { select: { public_id: true, name: true, code: true } } } } }, orderBy: { id: 'desc' }, take: p.take, skip: p.skip }),
      this.prisma.user.count({ where: where as never }),
    ]);
    return paged(rows, p, total);
  }

  @RequirePermission('user.manage', false)
  @Get('users/:id')
  async user(@Param('id') id: string) {
    const u = await this.userOr404(id);
    const [sessions, logins, oauth] = await Promise.all([
      this.prisma.userSession.findMany({ where: { user_id: u.id, revoked_at: null, expires_at: { gt: new Date() } }, orderBy: { last_seen_at: 'desc' }, take: 20 }),
      this.prisma.loginHistory.findMany({ where: { user_id: u.id }, orderBy: { id: 'desc' }, take: 20 }),
      this.prisma.oAuthAccount.findMany({ where: { user_id: u.id }, select: { provider: true, email_at_link: true, linked_at: true } }),
    ]);
    return { ...u, sessions, loginHistory: logins, oauth };
  }

  @RequirePermission('user.manage')
  @Post('users')
  async create(@Ctx() ctx: AccessContext, @Body() body: unknown) {
    const d = parse(
      z.object({
        email: z.string().trim().toLowerCase().email().max(254),
        fullName: z.string().trim().min(2).max(150),
        phone: z.string().trim().max(20).optional(),
        roles: z.array(z.object({ role: z.enum(INTERNAL_ROLES), facilityId: z.string().length(26).optional() })).min(1),
      }),
      body,
    );
    this.guardRoles(ctx, d.roles.map((r) => r.role));
    if (await this.prisma.user.findUnique({ where: { email: d.email } })) throw new AppError('CONFLICT', 'Email đã được sử dụng');
    const roleRows = await this.resolveRoles(d.roles);
    const token = randomToken();
    const user = await this.prisma.tx(async (tx) => {
      const u = await tx.user.create({ data: { public_id: newId(), email: d.email, full_name: d.fullName, phone: d.phone, status: 'INVITED' } });
      for (const r of roleRows) await tx.userRole.create({ data: { user_id: u.id, role_id: r.roleId, facility_id: r.facilityId, assigned_by: ctx.userId } });
      await tx.authToken.create({ data: { user_id: u.id, purpose: 'INVITE', token_hash: sha256(token), expires_at: new Date(Date.now() + 7 * 86400000), created_ip: ctx.ip?.slice(0, 45) } });
      await this.audit.log(ctx, { action: 'user.create', entityType: 'user', entityId: u.id, entityRef: u.email, category: 'SECURITY', after: { roles: d.roles } }, tx);
      return u;
    });
    const roleOnly = [...new Set(roleRows.map((r) => r.roleLabel))].join(', ');
    const roleSummary = roleRows.map((r) => (r.facilityName ? `${r.roleLabel} (${r.facilityName})` : r.roleLabel)).join(', ');
    const facNames = [...new Set(roleRows.map((r) => r.facilityName).filter(Boolean))].join(', ');
    const multiPair = roleRows.length > 1 && facNames.includes(',');
    await this.notify.sendDirect(
      user.id,
      'user.invited',
      {
        name: d.fullName,
        role: roleOnly,
        roles: multiPair ? roleSummary : roleOnly,
        facility: facNames,
        facilityText: multiPair || !facNames ? '' : ` tại ${facNames}`,
      },
      `${config.appOrigin}/accept-invite#token=${token}`,
      'Kích hoạt tài khoản',
    );
    return this.userOr404(user.public_id);
  }

  private async resolveRoles(items: { role: string; facilityId?: string }[]) {
    const out: { roleId: number; facilityId: bigint | null; facilityName: string | null; code: string; roleLabel: string }[] = [];
    for (const it of items) {
      const role = await this.prisma.role.findUnique({ where: { code: it.role as never } });
      if (!role) throw validation('Vai trò không hợp lệ');
      let facilityId: bigint | null = null;
      let facilityName: string | null = null;
      if (FACILITY_ROLES.includes(it.role)) {
        if (!it.facilityId) throw validation(`Vai trò ${it.role} bắt buộc chọn cơ sở`, [{ field: 'facilityId', message: 'required' }]);
        const f = await this.prisma.facility.findUnique({ where: { public_id: it.facilityId } });
        if (!f) throw notFound('Cơ sở');
        facilityId = f.id;
        facilityName = f.name;
      } else if (it.facilityId) throw validation(`Vai trò ${it.role} không gắn với cơ sở`);
      const roleLabel = ROLE_META[it.role as RoleCode]?.name ?? role.name ?? it.role;
      out.push({ roleId: role.id, facilityId, facilityName, code: it.role, roleLabel });
    }
    return out;
  }

  @RequirePermission('user.manage')
  @Patch('users/:id')
  async update(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() body: unknown) {
    const d = parse(z.object({ fullName: z.string().trim().min(2).max(150).optional(), phone: z.string().trim().max(20).nullable().optional(), locale: z.enum(['vi', 'en']).optional() }), body);
    const u = await this.userOr404(id);
    this.guardTarget(ctx, u);
    await this.prisma.user.update({ where: { id: u.id }, data: { full_name: d.fullName, phone: d.phone, locale: d.locale } });
    await this.audit.log(ctx, { action: 'user.update', entityType: 'user', entityId: u.id, entityRef: u.email, category: 'SECURITY', before: { name: u.full_name, phone: u.phone }, after: d });
    return this.userOr404(id);
  }

  private async setStatus(ctx: AccessContext, id: string, to: 'ACTIVE' | 'LOCKED' | 'DISABLED', reason: string, revoke: boolean) {
    const u = await this.userOr404(id);
    this.guardTarget(ctx, u);
    if (u.id === ctx.userId && to !== 'ACTIVE') throw forbidden('Không thể tự khóa hoặc vô hiệu hóa chính mình');
    if (to !== 'ACTIVE' && u.roles.some((r) => r.role.code === 'SYSTEM_ADMIN') && (await this.activeAdmins(u.id)) < 1) throw new AppError('CONFLICT', 'Hệ thống phải còn tối thiểu một quản trị viên hoạt động');
    await this.prisma.user.update({ where: { id: u.id }, data: { status: to, locked_until: null, failed_login_count: 0, token_version: revoke ? { increment: 1 } : undefined } });
    if (revoke) await this.auth.revokeAllSessions(u.id, 'ADMIN');
    this.contexts.invalidate(u.id);
    await this.audit.log(ctx, { action: `user.${to.toLowerCase()}`, entityType: 'user', entityId: u.id, entityRef: u.email, category: 'SECURITY', before: { status: u.status }, after: { status: to }, reason });
    if (to === 'DISABLED') await this.notify.sendDirect(u.id, 'user.disabled', { name: u.full_name, reason }).catch(() => undefined);
    if (to === 'DISABLED') {
      const facs = [...new Set(u.roles.map((r) => r.facility_id).filter((x): x is bigint => !!x).map(String))].map((x) => BigInt(x));
      if (facs.length) await this.releaseAssignedWork(ctx, u.id, facs, `Tài khoản bị vô hiệu hóa: ${reason}`);
    }
    return this.userOr404(id);
  }

  /**
   * Staff removed from a facility / disabled (§6.5 exceptions, §6.7 exceptions): their open tasks go back
   * to OPEN, open tickets back to the facility queue, upcoming appointments lose the assignee; FMs are told.
   */
  private async releaseAssignedWork(ctx: AccessContext, userId: bigint, facilityIds: bigint[], reason: string) {
    await this.prisma.tx(async (tx) => {
      for (const facilityId of facilityIds) {
        const tasks = await tx.workTask.findMany({ where: { facility_id: facilityId, assignee_id: userId, status: { in: ['ASSIGNED', 'IN_PROGRESS', 'BLOCKED'] } } });
        for (const t of tasks) {
          await tx.workTask.update({ where: { id: t.id }, data: { assignee_id: null, status: 'OPEN', version: { increment: 1 } } });
          await tx.taskEvent.create({ data: { task_id: t.id, event: 'REASSIGNED', from_user_id: userId, to_user_id: null, actor_user_id: ctx.userId, note: reason.slice(0, 255) } });
        }
        const tickets = await tx.supportTicket.findMany({ where: { facility_id: facilityId, assignee_id: userId, status: { in: ['NEW', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'REOPENED'] } } });
        for (const t of tickets) {
          await tx.supportTicket.update({ where: { id: t.id }, data: { assignee_id: null, status: t.status === 'ASSIGNED' ? 'NEW' : t.status, version: { increment: 1 } } });
          await tx.ticketEvent.create({ data: { ticket_id: t.id, event: 'ASSIGNED', actor_user_id: ctx.userId, data: { from: userId.toString(), to: null, reason } } });
        }
        await tx.appointment.updateMany({ where: { facility_id: facilityId, assigned_staff_id: userId, status: 'BOOKED' }, data: { assigned_staff_id: null } });
        if (tasks.length || tickets.length) {
          const fms = (await tx.userRole.findMany({ where: { facility_id: facilityId, revoked_at: null, role: { code: 'FACILITY_MANAGER' } }, select: { user_id: true } })).map((x) => x.user_id).filter((x) => x !== userId);
          await this.notify.notify({ users: fms, event: 'task.reassigned', vars: { title: `${tasks.length} công việc, ${tickets.length} ticket đã trả về hàng chờ`, due: '' }, link: '/manage/tasks', email: false }, tx);
        }
      }
    });
  }

  @RequirePermission('user.manage')
  @Post('users/:id/lock')
  lock(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() b: unknown) {
    return this.setStatus(ctx, id, 'LOCKED', parse(z.object({ reason: zReason }), b).reason, true);
  }
  @RequirePermission('user.manage')
  @Post('users/:id/unlock')
  unlock(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() b: unknown) {
    return this.setStatus(ctx, id, 'ACTIVE', parse(z.object({ reason: zReason }), b).reason, false);
  }
  @RequirePermission('user.manage')
  @Post('users/:id/disable')
  disable(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() b: unknown) {
    return this.setStatus(ctx, id, 'DISABLED', parse(z.object({ reason: zReason }), b).reason, true);
  }
  @RequirePermission('user.manage')
  @Post('users/:id/enable')
  enable(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() b: unknown) {
    return this.setStatus(ctx, id, 'ACTIVE', parse(z.object({ reason: zReason }), b).reason, false);
  }

  @RequirePermission('user.manage')
  @Post('users/:id/reset-password')
  async reset(@Ctx() ctx: AccessContext, @Param('id') id: string) {
    const u = await this.userOr404(id);
    this.guardTarget(ctx, u);
    await this.auth.forgotPassword(u.email, { ip: ctx.ip, ua: ctx.userAgent });
    await this.audit.log(ctx, { action: 'user.reset_password_sent', entityType: 'user', entityId: u.id, entityRef: u.email, category: 'SECURITY' });
    return { message: 'Đã gửi email đặt lại mật khẩu' };
  }

  // ---------------------------------------------------------------- roles (FR-A02/A03)
  @RequirePermission('role.assign', false)
  @Get('users/:id/roles')
  async roles(@Param('id') id: string) {
    const u = await this.userOr404(id);
    return u.roles;
  }

  @RequirePermission('role.assign')
  @Post('users/:id/roles')
  async assign(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() body: unknown) {
    const d = parse(z.object({ role: z.enum(INTERNAL_ROLES), facilityId: z.string().length(26).optional(), reason: zReason }), body);
    const u = await this.userOr404(id);
    this.guardTarget(ctx, u);
    this.guardRoles(ctx, [d.role]);
    if (u.id === ctx.userId) throw forbidden('Không thể tự gán quyền cho chính mình');
    const [r] = await this.resolveRoles([d]);
    try {
      await this.prisma.userRole.create({ data: { user_id: u.id, role_id: r.roleId, facility_id: r.facilityId, assigned_by: ctx.userId } });
    } catch {
      throw new AppError('CONFLICT', 'Tài khoản đã có vai trò này');
    }
    await this.afterRoleChange(ctx, u, 'assign', { ...d, roleLabel: r.roleLabel, facilityName: r.facilityName });
    return this.userOr404(id);
  }

  @RequirePermission('role.assign')
  @Delete('users/:id/roles/:assignmentId')
  async revoke(@Ctx() ctx: AccessContext, @Param('id') id: string, @Param('assignmentId') aid: string, @Query('reason') reason = 'Gỡ vai trò') {
    const u = await this.userOr404(id);
    const a = u.roles.find((r) => r.id.toString() === aid);
    if (!a) throw notFound('Vai trò');
    this.guardTarget(ctx, u);
    this.guardRoles(ctx, [a.role.code]);
    if (u.id === ctx.userId) throw forbidden('Không thể tự gỡ quyền của chính mình');
    if (a.role.code === 'SYSTEM_ADMIN' && (await this.activeAdmins(u.id)) < 1) throw new AppError('CONFLICT', 'Hệ thống phải còn tối thiểu một quản trị viên hoạt động');
    await this.prisma.userRole.update({ where: { id: a.id }, data: { revoked_at: new Date(), revoked_by: ctx.userId } });
    // removing the last role leaves the person as an ordinary customer, never as an account without any role
    await this.auth.ensureBaseRole(u.id);
    if (a.facility_id) {
      const stillThere = await this.prisma.userRole.count({ where: { user_id: u.id, facility_id: a.facility_id, revoked_at: null } });
      if (!stillThere) await this.releaseAssignedWork(ctx, u.id, [a.facility_id], `Gỡ khỏi cơ sở: ${reason}`);
    }
    const roleLabel = ROLE_META[a.role.code as RoleCode]?.name ?? a.role.name ?? a.role.code;
    await this.afterRoleChange(ctx, u, 'revoke', { role: a.role.code, roleLabel, facilityId: a.facility?.public_id, facilityName: a.facility?.name ?? null, reason });
    return this.userOr404(id);
  }

  /** Revokes sessions immediately and pushes session.revoked over the realtime hub (spec §5.1). */
  private async afterRoleChange(
    ctx: AccessContext,
    u: { id: bigint; public_id: string; email: string; full_name: string },
    kind: 'assign' | 'revoke',
    detail: { role: string; roleLabel: string; facilityId?: string; facilityName?: string | null; reason?: string },
  ) {
    await this.prisma.user.update({ where: { id: u.id }, data: { token_version: { increment: 1 } } });
    await this.auth.revokeAllSessions(u.id, 'ROLE_CHANGED');
    this.contexts.invalidate(u.id);
    this.hub.revokeUser(u.public_id);
    const auditDetail = { role: detail.role, facilityId: detail.facilityId, reason: detail.reason };
    await this.audit.log(ctx, { action: `user.role_${kind}`, entityType: 'user', entityId: u.id, entityRef: u.email, category: 'SECURITY', after: auditDetail });
    const activeRoles = await this.prisma.userRole.findMany({
      where: { user_id: u.id, revoked_at: null },
      include: { role: true, facility: { select: { name: true } } },
    });
    const currentRoles = activeRoles
      .map((ar) => {
        const lbl = ROLE_META[ar.role.code as RoleCode]?.name ?? ar.role.name ?? ar.role.code;
        return ar.facility?.name ? `${lbl} (${ar.facility.name})` : lbl;
      })
      .join(', ');
    const facPart = detail.facilityName ? ` tại ${detail.facilityName}` : '';
    const change =
      kind === 'assign'
        ? `Đã cấp vai trò ${detail.roleLabel}${facPart}`
        : `Đã gỡ vai trò ${detail.roleLabel}${facPart}${detail.reason ? ` (${detail.reason})` : ''}`;
    await this.notify
      .sendDirect(
        u.id,
        'user.role_changed',
        { name: u.full_name, change, role: detail.roleLabel, roles: currentRoles || 'Khách thuê kho', facility: detail.facilityName ?? '', reason: detail.reason ?? '' },
        `${config.appOrigin}/login`,
        'Đăng nhập lại',
      )
      .catch(() => undefined);
  }

  @RequirePermission('role.assign', false)
  @Get('roles')
  async roleMatrix() {
    const roles = await this.prisma.role.findMany({ include: { permissions: { include: { permission: true } } }, orderBy: { id: 'asc' } });
    return roles.map((r) => ({ code: r.code, name: r.name, description: r.description, facilityScoped: r.is_facility_scoped, permissions: r.permissions.map((p) => ({ code: p.permission.code, scope: p.scope, readOnly: p.read_only })) }));
  }

  private grantSchema = z
    .object({
      scope: z.enum(['OWN', 'FACILITY', 'GLOBAL']),
      readOnly: z.boolean().optional(),
    })
    .nullable()
    .optional();

  private async ensureRolesInDb(tx: PrismaService | Parameters<Parameters<PrismaService['$transaction']>[0]>[0]) {
    const existing = await tx.role.findMany();
    let maxId = existing.reduce((m, r) => Math.max(m, Number(r.id ?? 0)), 0);
    for (const code of ROLE_CODES) {
      if (!existing.some((r) => r.code === code)) {
        maxId += 1;
        const meta = ROLE_META[code as RoleCode];
        const created = await tx.role.create({
          data: { id: maxId, code, name: meta.name, description: meta.nameEn, is_facility_scoped: meta.facilityScoped },
        });
        existing.push(created);
      }
    }
    return existing;
  }

  private formatPermissionRow(
    p: { id: number; code: string; module: string; description: string | null },
    matrix: Record<string, Record<string, { scope: string; readOnly?: boolean }>>,
    coreCodes: Set<string>,
  ) {
    const grants = Object.fromEntries(
      ROLE_CODES.map((r) => {
        const g = matrix[r]?.[p.code];
        return [r, g ? { scope: g.scope, readOnly: !!g.readOnly } : null];
      }),
    );
    const byRole = Object.fromEntries(
      ROLE_CODES.map((r) => {
        const g = matrix[r]?.[p.code];
        return [r, g ? `${g.scope}${g.readOnly ? ' (read)' : ''}` : null];
      }),
    );
    return {
      id: p.id,
      code: p.code,
      module: p.module,
      description: p.description ?? '',
      isCustom: !coreCodes.has(p.code),
      grants,
      byRole,
    };
  }

  @RequirePermission('role.assign', false)
  @Get('permissions')
  async permissions() {
    const [rows, matrix] = await Promise.all([
      this.prisma.permission.findMany({ orderBy: { code: 'asc' } }),
      this.contexts.getRolePermissions(),
    ]);
    const coreCodes = new Set(PERMISSIONS.map((x) => x.code));
    return rows.map((p) =>
      this.formatPermissionRow(
        p,
        matrix as unknown as Record<string, Record<string, { scope: string; readOnly?: boolean }>>,
        coreCodes,
      ),
    );
  }

  @RequirePermission('role.assign')
  @Post('permissions')
  async createPermission(@Ctx() ctx: AccessContext, @Body() body: unknown) {
    if (!ctx.hasRole('SYSTEM_ADMIN')) throw forbidden('Chỉ Quản trị hệ thống mới được thêm loại quyền mới');
    const d = parse(
      z.object({
        code: z
          .string()
          .trim()
          .toLowerCase()
          .min(3, 'Mã quyền tối thiểu 3 ký tự')
          .max(64, 'Mã quyền tối đa 64 ký tự')
          .regex(/^[a-z][a-z0-9_.]*[a-z0-9]$/, 'Mã quyền chỉ gồm chữ thường, số, dấu chấm hoặc gạch dưới (vd: iot.locker.manage)'),
        module: z
          .string()
          .trim()
          .toLowerCase()
          .min(2, 'Tên phân hệ tối thiểu 2 ký tự')
          .max(40, 'Tên phân hệ tối đa 40 ký tự')
          .regex(/^[a-z0-9_-]+$/, 'Tên phân hệ chỉ gồm chữ thường, số, gạch ngang hoặc gạch dưới'),
        description: z.string().trim().min(2, 'Vui lòng nhập mô tả chức năng').max(255),
        grants: z.record(z.enum(ROLE_CODES), this.grantSchema).optional(),
      }),
      body,
    );
    const dup = await this.prisma.permission.findFirst({ where: { code: d.code } });
    if (dup) throw new AppError('CONFLICT', `Mã quyền "${d.code}" đã tồn tại trong hệ thống`);

    const created = await this.prisma.$transaction(async (tx) => {
      const roles = await this.ensureRolesInDb(tx);
      const allPerms = await tx.permission.findMany({ select: { id: true } });
      const nextId = allPerms.reduce((m, x) => Math.max(m, Number(x.id ?? 0)), 0) + 1;
      const perm = await tx.permission.create({
        data: { id: nextId, code: d.code, module: d.module, description: d.description },
      });
      if (d.grants) {
        for (const roleCode of ROLE_CODES) {
          const g = d.grants[roleCode];
          if (!g?.scope) continue;
          const roleRow = roles.find((r) => r.code === roleCode);
          if (!roleRow) continue;
          await tx.rolePermission.create({
            data: {
              role_id: roleRow.id,
              permission_id: perm.id,
              scope: g.scope,
              read_only: !!g.readOnly,
            },
          });
        }
      }
      return perm;
    });
    this.contexts.invalidateAllPermissions();
    await this.audit.log(ctx, {
      action: 'permission.create',
      entityType: 'permission',
      entityId: BigInt(created.id),
      entityRef: created.code,
      after: d,
      category: 'SECURITY',
    });
    const matrix = await this.contexts.getRolePermissions();
    return this.formatPermissionRow(
      created,
      matrix as unknown as Record<string, Record<string, { scope: string; readOnly?: boolean }>>,
      new Set(PERMISSIONS.map((x) => x.code)),
    );
  }

  @RequirePermission('role.assign')
  @Put('permissions/:code')
  async updatePermission(@Ctx() ctx: AccessContext, @Param('code') code: string, @Body() body: unknown) {
    if (!ctx.hasRole('SYSTEM_ADMIN')) throw forbidden('Chỉ Quản trị hệ thống mới được phân bổ lại quyền');
    const targetCode = code.trim().toLowerCase();
    const perm = await this.prisma.permission.findFirst({ where: { code: targetCode } });
    if (!perm) throw notFound('Quyền');
    const d = parse(
      z.object({
        module: z
          .string()
          .trim()
          .toLowerCase()
          .min(2)
          .max(40)
          .regex(/^[a-z0-9_-]+$/, 'Tên phân hệ chỉ gồm chữ thường, số, gạch ngang hoặc gạch dưới')
          .optional(),
        description: z.string().trim().min(2, 'Vui lòng nhập mô tả chức năng').max(255).optional(),
        grants: z.record(z.enum(ROLE_CODES), this.grantSchema).optional(),
      }),
      body,
    );
    if ((targetCode === 'role.assign' || targetCode === 'user.manage') && d.grants) {
      const adminGrant = d.grants.SYSTEM_ADMIN;
      if (!adminGrant || adminGrant.scope !== 'GLOBAL' || adminGrant.readOnly) {
        throw validation(`Không thể thu hồi hoặc giới hạn quyền "${targetCode}" (GLOBAL) của Quản trị hệ thống để tránh tự khóa quyền quản trị`);
      }
    }
    const prevMatrix = await this.contexts.getRolePermissions();
    const before = this.formatPermissionRow(
      perm,
      prevMatrix as unknown as Record<string, Record<string, { scope: string; readOnly?: boolean }>>,
      new Set(PERMISSIONS.map((x) => x.code)),
    );

    const updated = await this.prisma.$transaction(async (tx) => {
      const p = await tx.permission.update({
        where: { id: perm.id },
        data: {
          ...(d.module !== undefined ? { module: d.module } : {}),
          ...(d.description !== undefined ? { description: d.description } : {}),
        },
      });
      if (d.grants !== undefined) {
        const roles = await this.ensureRolesInDb(tx);
        await tx.rolePermission.deleteMany({ where: { permission_id: perm.id } });
        for (const roleCode of ROLE_CODES) {
          const g = d.grants[roleCode];
          if (!g?.scope) continue;
          const roleRow = roles.find((r) => r.code === roleCode);
          if (!roleRow) continue;
          await tx.rolePermission.create({
            data: {
              role_id: roleRow.id,
              permission_id: perm.id,
              scope: g.scope,
              read_only: !!g.readOnly,
            },
          });
        }
      }
      return p;
    });
    this.contexts.invalidateAllPermissions();
    const nextMatrix = await this.contexts.getRolePermissions();
    const formatted = this.formatPermissionRow(
      updated,
      nextMatrix as unknown as Record<string, Record<string, { scope: string; readOnly?: boolean }>>,
      new Set(PERMISSIONS.map((x) => x.code)),
    );
    await this.audit.log(ctx, {
      action: 'permission.update',
      entityType: 'permission',
      entityId: BigInt(updated.id),
      entityRef: updated.code,
      before: { module: before.module, description: before.description, grants: before.grants },
      after: { module: formatted.module, description: formatted.description, grants: formatted.grants },
      category: 'SECURITY',
    });
    return formatted;
  }

  @RequirePermission('role.assign')
  @Patch('permissions/:code')
  patchPermission(@Ctx() ctx: AccessContext, @Param('code') code: string, @Body() body: unknown) {
    return this.updatePermission(ctx, code, body);
  }

  @RequirePermission('role.assign')
  @Delete('permissions/:code')
  async deletePermission(@Ctx() ctx: AccessContext, @Param('code') code: string) {
    if (!ctx.hasRole('SYSTEM_ADMIN')) throw forbidden('Chỉ Quản trị hệ thống mới được xóa quyền');
    const targetCode = code.trim().toLowerCase();
    const perm = await this.prisma.permission.findFirst({ where: { code: targetCode } });
    if (!perm) throw notFound('Quyền');
    if (PERMISSIONS.some((x) => x.code === targetCode)) {
      throw new AppError('CONFLICT', 'Không thể xóa quyền cốt lõi của hệ thống — bạn có thể bấm Sửa để thu hồi phân bổ ở từng vai trò');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { permission_id: perm.id } });
      await tx.permission.delete({ where: { id: perm.id } });
    });
    this.contexts.invalidateAllPermissions();
    await this.audit.log(ctx, {
      action: 'permission.delete',
      entityType: 'permission',
      entityId: BigInt(perm.id),
      entityRef: perm.code,
      before: { code: perm.code, module: perm.module, description: perm.description },
      category: 'SECURITY',
    });
    return { ok: true };
  }

  // ---------------------------------------------------------------- sessions & security
  @RequirePermission('security.manage')
  @Get('users/:id/sessions')
  async sessions(@Param('id') id: string) {
    const u = await this.userOr404(id);
    return this.prisma.userSession.findMany({ where: { user_id: u.id, revoked_at: null, expires_at: { gt: new Date() } }, orderBy: { last_seen_at: 'desc' } });
  }

  @RequirePermission('security.manage')
  @Delete('users/:id/sessions')
  async revokeAll(@Ctx() ctx: AccessContext, @Param('id') id: string) {
    const u = await this.userOr404(id);
    await this.auth.revokeAllSessions(u.id, 'ADMIN');
    this.hub.revokeUser(u.public_id);
    await this.audit.log(ctx, { action: 'user.sessions_revoked', entityType: 'user', entityId: u.id, entityRef: u.email, category: 'SECURITY' });
    return { message: 'Đã thu hồi mọi phiên đăng nhập' };
  }

  @RequirePermission('audit.read', false)
  @Get('login-history')
  async loginHistory(@Query() q: Record<string, unknown>) {
    const p = pageParams(q);
    const success = filterParam(q, 'success');
    const userId = filterParam(q, 'userId');
    const ip = filterParam(q, 'ip');
    const email = filterParam(q, 'email');
    const from = filterParam(q, 'from');
    const to = filterParam(q, 'to');
    const where = {
      ...(success !== undefined ? { success: success === 'true' } : {}),
      ...(userId ? { user: { public_id: userId } } : {}),
      ...(ip ? { ip_address: ip } : {}),
      ...(email ? { email_attempted: { contains: email } } : {}),
      ...(from || to ? { created_at: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lt: new Date(to) } : {}) } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.loginHistory.findMany({ where: where as never, orderBy: { id: 'desc' }, take: p.take, skip: p.skip }).then((r) => attach(r, 'user_id', 'user', loaders(this.prisma).users)),
      this.prisma.loginHistory.count({ where: where as never }),
    ]);
    return paged(rows, p, total);
  }

  @RequirePermission('audit.read', false)
  @Get('audit-logs')
  async auditLogs(@Ctx() ctx: AccessContext, @Query() q: Record<string, unknown>) {
    const p = pageParams(q);
    const g = ctx.grant('audit.read')!;
    const category = filterParam(q, 'category');
    const action = filterParam(q, 'action');
    const entityType = filterParam(q, 'entityType');
    const actor = filterParam(q, 'actorId');
    const facility = filterParam(q, 'facilityId');
    const from = filterParam(q, 'from');
    const to = filterParam(q, 'to');
    const isAdmin = ctx.hasRole('SYSTEM_ADMIN');
    const where: Record<string, unknown> = {
      ...(isAdmin ? (category ? { category } : {}) : { category: 'BUSINESS' }),
      ...(g.scope === 'FACILITY' && !isAdmin ? { facility_id: { in: ctx.facilitiesFor('audit.read') } } : {}),
      ...(g.scope === 'OWN' ? { actor_user_id: ctx.userId } : {}),
      ...(action ? { action: { contains: action } } : {}),
      ...(entityType ? { entity_type: entityType } : {}),
      ...(actor ? { actor: { public_id: actor } } : {}),
      ...(facility ? { facility: { public_id: facility } } : {}),
      ...(from || to ? { occurred_at: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lt: new Date(to) } : {}) } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({ where: where as never, orderBy: { id: 'desc' }, take: p.take, skip: p.skip }).then((r) => attach(r, 'actor_user_id', 'actor', loaders(this.prisma).users)),
      this.prisma.auditLog.count({ where: where as never }),
    ]);
    return paged(rows, p, total);
  }

  // ---------------------------------------------------------------- config
  @RequirePermission('config.manage', false)
  @Get('settings')
  async allSettings() {
    const rows = await this.prisma.systemSetting.findMany({ orderBy: [{ category: 'asc' }, { key: 'asc' }] });
    const have = new Set(rows.map((r) => r.key));
    const missing = DEFAULT_SETTINGS.filter((s) => !have.has(s.key)).map((s) => ({ key: s.key, value: s.value, value_type: s.type, category: s.category, description: s.description, is_secret: false, version: 0 }));
    return [...rows, ...missing].map((r) => (r.is_secret ? { ...r, value: '••••••' } : r));
  }

  @RequirePermission('config.manage')
  @Patch('settings/:key')
  async setSetting(@Ctx() ctx: AccessContext, @Param('key') key: string, @Body() body: unknown) {
    const d = parse(z.object({ value: z.union([z.string(), z.number(), z.boolean(), z.array(z.unknown()), z.record(z.unknown())]), reason: z.string().max(300).optional() }), body);
    const def = DEFAULT_SETTINGS.find((s) => s.key === key);
    const existing = await this.prisma.systemSetting.findUnique({ where: { key } });
    if (!def && !existing) throw notFound('Cấu hình');
    const type = existing?.value_type ?? def!.type;
    const ok = (type === 'NUMBER' && typeof d.value === 'number') || (type === 'BOOLEAN' && typeof d.value === 'boolean') || (type === 'STRING' && typeof d.value === 'string') || type === 'JSON';
    if (!ok) throw validation(`Giá trị phải có kiểu ${type}`);
    const row = await this.prisma.systemSetting.upsert({
      where: { key },
      create: { key, value: d.value as never, value_type: type, category: existing?.category ?? def!.category, description: def?.description, updated_by: ctx.userId },
      update: { value: d.value as never, updated_by: ctx.userId, version: { increment: 1 } },
    });
    this.settings.invalidate();
    await this.audit.log(ctx, { action: 'config.update', entityType: 'system_setting', entityRef: key, category: 'CONFIG', before: { value: existing?.value ?? def?.value }, after: { value: d.value }, reason: d.reason });
    return row;
  }

  @RequirePermission('config.manage|template.manage', false)
  @Get('notification-templates')
  templates() {
    return this.prisma.notificationTemplate.findMany({ orderBy: [{ event_code: 'asc' }, { channel: 'asc' }, { locale: 'asc' }] });
  }

  @RequirePermission('config.manage|template.manage')
  @Put('notification-templates/:id')
  async putTemplate(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() body: unknown) {
    const d = parse(z.object({ subject: z.string().trim().min(2).max(200), body: z.string().trim().min(2).max(8000), active: z.boolean().optional() }), body);
    const t = await this.prisma.notificationTemplate.findUnique({ where: { id: BigInt(id) } }).catch(() => null);
    if (!t) throw notFound('Mẫu thông báo');
    if (t.is_mandatory && d.active === false) throw validation('Không thể tắt mẫu thông báo bắt buộc');
    const upd = await this.prisma.notificationTemplate.update({ where: { id: t.id }, data: { subject: d.subject, body: d.body, active: d.active ?? t.active, version: { increment: 1 }, updated_by: ctx.userId } });
    this.notify.invalidateTemplates();
    await this.audit.log(ctx, { action: 'config.template_update', entityType: 'notification_template', entityId: t.id, entityRef: `${t.event_code}/${t.channel}/${t.locale}`, category: 'CONFIG', before: { subject: t.subject, body: t.body }, after: { subject: d.subject, body: d.body } });
    return upd;
  }

  @RequirePermission('config.manage|template.manage')
  @Patch('notification-templates/:id')
  patchTemplate(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() body: unknown) {
    return this.putTemplate(ctx, id, body);
  }

  // ---------------------------------------------------------------- IP blocks
  @RequirePermission('security.manage', false)
  @Get('ip-blocks')
  ipBlocks() {
    return this.prisma.ipBlock.findMany({ orderBy: { id: 'desc' }, take: 200 });
  }

  @RequirePermission('security.manage')
  @Post('ip-blocks')
  async addIp(@Ctx() ctx: AccessContext, @Body() body: unknown) {
    const d = parse(z.object({ cidr: z.string().trim().regex(/^[0-9a-fA-F:.]+(\/\d{1,3})?$/, 'IP/CIDR không hợp lệ'), reason: z.string().max(255).optional(), expiresAt: z.string().datetime().optional() }), body);
    const row = await this.prisma.ipBlock.create({ data: { cidr: d.cidr, reason: d.reason, expires_at: d.expiresAt ? new Date(d.expiresAt) : null, created_by: ctx.userId } });
    await this.audit.log(ctx, { action: 'security.ip_block', entityType: 'ip_block', entityId: row.id, entityRef: d.cidr, category: 'SECURITY', reason: d.reason });
    return row;
  }

  @RequirePermission('security.manage')
  @Delete('ip-blocks/:id')
  async delIp(@Ctx() ctx: AccessContext, @Param('id') id: string) {
    const row = await this.prisma.ipBlock.findUnique({ where: { id: BigInt(id) } }).catch(() => null);
    if (!row) throw notFound('IP block');
    await this.prisma.ipBlock.delete({ where: { id: row.id } });
    await this.audit.log(ctx, { action: 'security.ip_unblock', entityType: 'ip_block', entityId: row.id, entityRef: row.cidr, category: 'SECURITY' });
    return { message: 'Đã gỡ chặn' };
  }

  // ---------------------------------------------------------------- dashboard & health
  @RequirePermission('user.manage', false)
  @Get('dashboard')
  dashboard(@Query() q: Record<string, unknown>) {
    const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
    return this.reports.adminDashboard({ range: str(q.range), from: str(q.from), to: str(q.to) });
  }

  @RequirePermission('user.manage', false)
  @Get('system-health')
  async health() {
    const [jobs, outboxPending, outboxFailed, emailPending, emailFailed] = await Promise.all([
      this.prisma.jobRun.findMany({ orderBy: { started_at: 'desc' }, take: 40 }),
      this.prisma.outboxEvent.count({ where: { status: 'PENDING' } }),
      this.prisma.outboxEvent.count({ where: { status: 'FAILED' } }),
      this.prisma.notificationDelivery.count({ where: { status: 'QUEUED' } }),
      this.prisma.notificationDelivery.count({ where: { status: 'FAILED' } }),
    ]);
    // one row per job: a 30-second job must not bury the hourly ones in the 40-run list above
    const since = new Date(Date.now() - 86400000);
    const [all, recent, bad] = await Promise.all([
      this.prisma.jobRun.groupBy({ by: ['job_name'], _max: { started_at: true } }),
      this.prisma.jobRun.groupBy({ by: ['job_name'], where: { started_at: { gte: since } }, _count: true }),
      this.prisma.jobRun.groupBy({ by: ['job_name'], where: { started_at: { gte: since }, status: 'FAILED' }, _count: true }),
    ]);
    const jobSummary = await Promise.all(all.map(async (a) => {
      const last = await this.prisma.jobRun.findFirst({ where: { job_name: a.job_name }, orderBy: { started_at: 'desc' } });
      return { job: a.job_name, runs24h: recent.find((r) => r.job_name === a.job_name)?._count ?? 0, failed24h: bad.find((r) => r.job_name === a.job_name)?._count ?? 0, lastStartedAt: last?.started_at ?? null, lastStatus: last?.status ?? null, lastError: last?.error?.slice(0, 300) ?? null, lastProcessed: last?.processed_count ?? 0, lastDurationMs: last?.finished_at ? last.finished_at.getTime() - last.started_at.getTime() : null };
    }));
    return { db: 'ok', jobs, jobSummary, outbox: { pending: outboxPending, failed: outboxFailed }, email: { pending: emailPending, failed: emailFailed }, time: new Date().toISOString() };
  }
}
