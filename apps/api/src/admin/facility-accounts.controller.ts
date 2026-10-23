import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { Ctx, RequirePermission } from '../auth/decorators';
import { AccessContext } from '../auth/access-context';
import { pageParams, paged, parse, zReason } from '../common/http';
import { FacilityAccountsService } from './facility-accounts.service';

/** Accounts a facility manager may handle: staff and customers of their own facilities (see FacilityAccountsService for the limits). */
@Controller('facility-accounts')
export class FacilityAccountsController {
  constructor(private svc: FacilityAccountsService) {}

  @RequirePermission('facility_account.manage', false)
  @Get()
  async list(@Ctx() ctx: AccessContext, @Query() q: Record<string, unknown>) {
    const p = pageParams(q);
    const str = (k: string) => (typeof q[k] === 'string' ? (q[k] as string) : undefined);
    const r = await this.svc.list(ctx, { group: str('group'), status: str('status'), q: str('q'), facilityId: str('facilityId') }, p.size, p.skip);
    return paged(r.rows, p, r.total);
  }

  @RequirePermission('facility_account.manage', false)
  @Get('lookup')
  lookup(@Ctx() ctx: AccessContext, @Query('email') email = '') {
    parse(z.object({ email: z.string().trim().email().max(254) }), { email });
    return this.svc.lookup(ctx, email);
  }

  @RequirePermission('facility_account.manage', false)
  @Get(':id')
  get(@Ctx() ctx: AccessContext, @Param('id') id: string) {
    return this.svc.get(ctx, id);
  }

  @RequirePermission('facility_account.manage')
  @Post('staff')
  invite(@Ctx() ctx: AccessContext, @Body() body: unknown) {
    const d = parse(z.object({ email: z.string().trim().toLowerCase().email().max(254), fullName: z.string().trim().min(2).max(150), phone: z.string().trim().max(20).optional(), facilityId: z.string().length(26) }), body);
    return this.svc.inviteStaff(ctx, d);
  }

  @RequirePermission('facility_account.manage')
  @Post(':id/staff-role')
  grant(@Ctx() ctx: AccessContext, @Param('id') id: string, @Body() body: unknown) {
    return this.svc.grantStaff(ctx, id, parse(z.object({ facilityId: z.string().length(26), reason: zReason }), body));
  }

  @RequirePermission('facility_account.manage')
  @Delete(':id/staff-role/:assignmentId')
  revoke(@Ctx() ctx: AccessContext, @Param('id') id: string, @Param('assignmentId') aid: string, @Query('reason') reason = 'Gỡ quyền nhân viên') {
    return this.svc.revokeStaff(ctx, id, aid, parse(z.object({ reason: zReason }), { reason }).reason);
  }
}
