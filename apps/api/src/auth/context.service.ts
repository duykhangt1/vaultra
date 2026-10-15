import { Injectable } from '@nestjs/common';
import { Grant, mergeGrants, ROLE_PERMISSIONS, RoleCode, ROLES, Scope } from '@vaultra/shared';
import { PrismaService } from '../common/prisma.service';
import { AccessContext, RoleAssignment } from './access-context';

const SCOPE_RANK: Record<Scope, number> = { OWN: 1, FACILITY: 2, GLOBAL: 3 };

interface Cached {
  at: number;
  user: { id: bigint; public_id: string; email: string; full_name: string; email_verified_at: Date | null; token_version: number; status: string };
  customerId: bigint | null;
  assignments: RoleAssignment[];
  rolePermissions: Record<RoleCode, Record<string, Grant>>;
}
