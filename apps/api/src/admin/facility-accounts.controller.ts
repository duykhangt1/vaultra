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
}
