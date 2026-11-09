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

/** Builds AccessContext from user_roles + dynamic DB role_permissions; cached 30 s keyed by userId:token_version (spec §12.7.2). */
@Injectable()
export class ContextService {
  private cache = new Map<string, Cached>();
  private permCache: { at: number; byRole: Record<RoleCode, Record<string, Grant>> } | null = null;

  constructor(private prisma: PrismaService) {}

  async getRolePermissions(): Promise<Record<RoleCode, Record<string, Grant>>> {
    if (this.permCache && Date.now() - this.permCache.at < 30000) {
      return this.permCache.byRole;
    }
    try {
      const [roles, perms, rps] = await Promise.all([
        this.prisma.role.findMany(),
        this.prisma.permission.findMany(),
        this.prisma.rolePermission.findMany(),
      ]);
      if (roles.length > 0 && perms.length > 0 && rps.length > 0) {
        const byRole = Object.fromEntries(ROLES.map((r) => [r, {} as Record<string, Grant>])) as Record<RoleCode, Record<string, Grant>>;
        const roleById = new Map<number, RoleCode>(roles.map((r) => [Number(r.id), r.code as RoleCode]));
        const permById = new Map<number, string>(perms.map((p) => [Number(p.id), p.code]));
        for (const rp of rps) {
          const rCode = roleById.get(Number(rp.role_id));
          const pCode = permById.get(Number(rp.permission_id));
          if (!rCode || !pCode || !byRole[rCode]) continue;
          byRole[rCode][pCode] = {
            scope: rp.scope as Scope,
            ...(rp.read_only ? { readOnly: true } : {}),
          };
        }
        this.permCache = { at: Date.now(), byRole };
        return byRole;
      }
    } catch {
      // Fallback to static matrix when DB is mocked or unavailable
    }
    return ROLE_PERMISSIONS;
  }

  mergeGrantsFromMatrix(roles: RoleCode[], matrix: Record<RoleCode, Record<string, Grant>>): Record<string, Grant> {
    if (matrix === ROLE_PERMISSIONS) return mergeGrants(roles);
    const out: Record<string, Grant> = {};
    for (const r of roles) {
      for (const [code, g] of Object.entries(matrix[r] ?? {})) {
        const cur = out[code];
        if (!cur) out[code] = { ...g };
        else {
          out[code] = {
            scope: SCOPE_RANK[g.scope] > SCOPE_RANK[cur.scope] ? g.scope : cur.scope,
            readOnly: Boolean(cur.readOnly && g.readOnly) || undefined,
          };
        }
      }
    }
    return out;
  }

  async mergeDynamicGrants(roles: RoleCode[]): Promise<Record<string, Grant>> {
    const matrix = await this.getRolePermissions();
    return this.mergeGrantsFromMatrix(roles, matrix);
  }

  async load(userId: bigint, tokenVersion?: number): Promise<Cached | null> {
    const key = `${userId}:${tokenVersion ?? 'x'}`;
    const rolePermissions = await this.getRolePermissions();
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < 30000) {
      hit.rolePermissions = rolePermissions;
      if (hit.customerId === null) {
        const cust = await this.prisma.customer.findFirst({ where: { user_id: userId, deleted_at: null }, select: { id: true } }).catch(() => null);
        if (cust) hit.customerId = cust.id;
      }
      return hit;
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, public_id: true, email: true, full_name: true, email_verified_at: true, token_version: true, status: true,
        customer: { select: { id: true } },
        roles: { where: { revoked_at: null }, select: { facility_id: true, role: { select: { code: true } } } },
      },
    });
    if (!user) return null;
    const entry: Cached = {
      at: Date.now(),
      user,
      customerId: user.customer?.id ?? null,
      assignments: user.roles.map((r) => ({ role: r.role.code as RoleCode, facilityId: r.facility_id })),
      rolePermissions,
    };
    if (this.cache.size > 5000) this.cache.clear();
    this.cache.set(`${userId}:${user.token_version}`, entry);
    return entry;
  }

  invalidate(userId: bigint) {
    for (const k of this.cache.keys()) if (k.startsWith(`${userId}:`)) this.cache.delete(k);
  }

  invalidateAllPermissions() {
    this.permCache = null;
    this.cache.clear();
  }

  build(c: Cached, sessionId: bigint | null, meta: { ip?: string; ua?: string; requestId?: string; activeFacilityPublicId?: string }, activeFacilityId?: bigint | null) {
    const roles = [...new Set(c.assignments.map((a) => a.role))];
    const matrix = c.rolePermissions ?? ROLE_PERMISSIONS;
    return new AccessContext(
      c.user.id, c.user.public_id, c.user.email, c.user.full_name, !!c.user.email_verified_at, c.customerId,
      c.assignments, this.mergeGrantsFromMatrix(roles, matrix), sessionId, meta.ip, meta.ua, meta.requestId, activeFacilityId ?? null, matrix,
    );
  }
}
