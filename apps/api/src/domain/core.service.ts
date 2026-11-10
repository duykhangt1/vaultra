import { Injectable } from '@nestjs/common';
import { canTransition, DEFAULT_POLICY_PARAMS, PolicyParams, UNIT_TRANSITIONS } from '@vaultra/shared';
import { PrismaService, Tx } from '../common/prisma.service';
import { AppError, invalidTransition, notFound } from '../common/errors';
import { D, Dec, DecimalValue, newId, nextCode, vnd } from '../common/util';
import { ClockService } from '../common/clock.service';
import { EventsService } from '../common/events.service';
import { NotificationService } from '../notifications/notification.service';
import type { AccessContext } from '../auth/access-context';
import { Prisma } from '../generated/prisma/client';
import type { UnitStatus, OperationalFlag, ReservationStatus } from '../generated/prisma/enums';
import { addDays, todayIn, DEFAULT_TZ } from '../common/dates';

type Db = Tx | PrismaService;

/**
 * Shared domain services used by every flow: policy resolution, availability (§7.3), ledger (§7.2.4),
 * invoices (§10.5), unit state machine (§7.1) and system task creation (§6.5 5C step 4).
 */
@Injectable()
export class CoreService {
  constructor(private prisma: PrismaService, private clock: ClockService, private events: EventsService, private notify: NotificationService) {}

  now() {
    return this.clock.now();
  }
  today(tz = DEFAULT_TZ) {
    return todayIn(tz, this.clock.now());
  }

  // ------------------------------------------------------------------ policy (§6.4 4A step 5)
  /** Active policy version: facility override first, then global. */
  async activePolicy(facilityId: bigint | null, db: Db = this.prisma): Promise<{ id: bigint; params: PolicyParams; version_no: number }> {
    const now = this.clock.now();
    const pick = async (scope: 'FACILITY' | 'GLOBAL') =>
      db.policyVersion.findFirst({
        where: {
          status: 'ACTIVE',
          effective_from: { lte: now },
          policy: scope === 'FACILITY' ? { scope: 'FACILITY', facility_id: facilityId ?? BigInt(0) } : { scope: 'GLOBAL' },
        },
        orderBy: { effective_from: 'desc' },
      });
    const v = (facilityId ? await pick('FACILITY') : null) ?? (await pick('GLOBAL'));
    if (!v) throw new AppError('CONFLICT', 'Chưa có chính sách hiệu lực — hãy chạy seed hoặc xuất bản chính sách');
    return { id: v.id, version_no: v.version_no, params: { ...DEFAULT_POLICY_PARAMS, ...(v.params as object) } as PolicyParams };
  }

  async policyById(id: bigint, db: Db = this.prisma): Promise<PolicyParams> {
    const v = await db.policyVersion.findUniqueOrThrow({ where: { id } });
    return { ...DEFAULT_POLICY_PARAMS, ...(v.params as object) } as PolicyParams;
  }

  // ------------------------------------------------------------------ availability (§7.3)
  async sellable(db: Db, unitTypeId: bigint) {
    return db.unit.count({ where: { unit_type_id: unitTypeId, deleted_at: null, status: { notIn: ['MAINTENANCE', 'OUT_OF_SERVICE', 'RETIRED'] } } });
  }

  /** Largest number of commitments (reservations + live contracts) that overlap at any single day inside [s, e). */
  async commitments(db: Db, unitTypeId: bigint, s: Date, e: Date, excludeReservationId?: bigint) {
    const now = this.clock.now();
    const rs = await db.reservation.findMany({
      where: {
        unit_type_id: unitTypeId,
        ...(excludeReservationId ? { id: { not: excludeReservationId } } : {}),
        OR: [{ status: 'PENDING_PAYMENT', hold_expires_at: { gt: now } }, { status: { in: ['CONFIRMED', 'UNIT_ASSIGNED', 'MOVE_IN_SCHEDULED'] } }],
        start_date: { lt: e },
        end_date: { gt: s },
      },
      select: { start_date: true, end_date: true },
    });
    const cs = await db.contract.findMany({
      where: {
        unit_type_id: unitTypeId,
        status: { in: ['ACTIVE', 'MOVE_OUT_SCHEDULED', 'EXPIRED'] },
        start_date: { lt: e },
        OR: [{ effective_end_date: null }, { effective_end_date: { gt: s } }],
      },
      select: { start_date: true, effective_end_date: true },
    });
    // sweep line: +1 at each start, -1 at each end (half-open intervals, clipped to the requested window)
    const ev: [number, number][] = [];
    for (const x of [...rs.map((r) => ({ a: r.start_date, b: r.end_date as Date | null })), ...cs.map((c) => ({ a: c.start_date, b: c.effective_end_date }))]) {
      ev.push([Math.max(x.a.getTime(), s.getTime()), 1]);
      ev.push([x.b ? Math.min(x.b.getTime(), e.getTime()) : e.getTime(), -1]);
    }
    ev.sort((p, q) => p[0] - q[0] || p[1] - q[1]); // ends before starts at the same instant
    let cur = 0;
    let peak = 0;
    for (const [, d] of ev) {
      cur += d;
      if (cur > peak) peak = cur;
    }
    return peak;
  }

  async available(db: Db, unitTypeId: bigint, s: Date, e: Date, excludeReservationId?: bigint) {
    const [sell, com] = await Promise.all([this.sellable(db, unitTypeId), this.commitments(db, unitTypeId, s, e, excludeReservationId)]);
    return Math.max(0, sell - com);
  }

  /** Row lock on unit_types serialises bookings for the same type (§7.3 layer 1). */
  async lockUnitType(tx: Tx, unitTypeId: bigint) {
    await tx.$queryRaw`SELECT id FROM unit_types WHERE id = ${unitTypeId} FOR UPDATE`;
  }

  // ------------------------------------------------------------------ ledger (§7.2.4)
  async ledger(tx: Tx, e: { customerId: bigint; contractId?: bigint | null; type: Prisma.CustomerLedgerEntryCreateInput['entry_type']; amount: DecimalValue; sourceType: string; sourceId: bigint; description?: string; actor?: bigint | null }) {
    await tx.$queryRaw`SELECT id FROM customers WHERE id = ${e.customerId} FOR UPDATE`; // serialise ledger writes so balance_cached cannot lose an update
    await tx.customerLedgerEntry.create({
      data: {
        customer_id: e.customerId,
        contract_id: e.contractId ?? null,
        entry_type: e.type,
        amount: D(e.amount),
        source_type: e.sourceType,
        source_id: e.sourceId,
        description: e.description,
        occurred_at: this.clock.now(),
        created_by: e.actor ?? null,
      },
    });
    const due = await this.balance(e.customerId, tx);
    await tx.customer.update({ where: { id: e.customerId }, data: { balance_cached: due } });
  }

  async balance(customerId: bigint, db: Db = this.prisma): Promise<Dec> {
    const open = await db.invoice.findMany({
      where: { customer_id: customerId, status: { in: ['ISSUED', 'PARTIALLY_PAID'] } },
      select: { total: true, amount_paid: true, amount_credited: true },
    });
    let totalDue = D(0);
    for (const inv of open) {
      const rem = D(inv.total).sub(inv.amount_paid).sub(inv.amount_credited);
      if (rem.gt(0)) totalDue = totalDue.add(rem);
    }
    return totalDue;
  }

  // ------------------------------------------------------------------ invoices
  async createInvoice(
    tx: Tx,
    inv: {
      customerId: bigint;
      facilityId: bigint;
      contractId?: bigint | null;
      reservationId?: bigint | null;
      type: Prisma.InvoiceCreateInput['type'];
      issueDate?: Date;
      dueDate: Date;
      periodStart?: Date | null;
      periodEnd?: Date | null;
      moveInDue?: boolean;
      vatRate: number;
      pricesIncludeVat: boolean;
      items: { item_type: Prisma.InvoiceItemCreateWithoutInvoiceInput['item_type']; description: string; amount: DecimalValue; quantity?: number; unit_price?: DecimalValue; fee_type_id?: bigint | null; taxable?: boolean; service_period_start?: Date | null; service_period_end?: Date | null; promotion_id?: bigint | null; source_type?: string; source_id?: bigint }[];
      actor?: bigint | null;
      notify?: boolean;
    },
  ) {
    const issue = inv.issueDate ?? this.today();
    let subtotal = D(0);
    let discount = D(0);
    let tax = D(0);
    const items = inv.items.map((it) => {
      const amount = vnd(it.amount);
      const isDiscount = it.item_type === 'DISCOUNT';
      // A discount reduces the taxable base (VAT is due on the price actually charged), so it carries a negative tax share.
      const taxable = it.taxable ?? (isDiscount || it.item_type === 'RENT' || it.item_type === 'FEE' || it.item_type === 'DAMAGE' || it.item_type === 'PRORATION');
      const rate = taxable ? inv.vatRate : 0;
      let taxAmount = D(0);
      if (rate > 0) {
        const t = inv.pricesIncludeVat ? vnd(amount.abs().mul(rate).div(100 + rate)) : vnd(amount.abs().mul(rate).div(100));
        taxAmount = isDiscount ? t.neg() : t;
      }
      if (isDiscount) discount = discount.add(amount.abs());
      else subtotal = subtotal.add(amount);
      tax = tax.add(taxAmount); // per-item tax_amount is always stored: VAT contained in the price (inclusive) or VAT added on top (exclusive)
      return {
        item_type: it.item_type,
        fee_type_id: it.fee_type_id ?? null,
        description: it.description.slice(0, 255),
        quantity: D(it.quantity ?? 1),
        unit_price: vnd(it.unit_price ?? it.amount),
        amount,
        tax_rate: D(rate),
        tax_amount: taxAmount,
        service_period_start: it.service_period_start ?? null,
        service_period_end: it.service_period_end ?? null,
        promotion_id: it.promotion_id ?? null,
        source_type: it.source_type ?? null,
        source_id: it.source_id ?? null,
        created_by: inv.actor ?? null,
      };
    });
    if (tax.lt(0)) tax = D(0);
    // invoices.tax_total is the VAT ADDED to the total (DB check: total = subtotal - discount + tax_total), so it is 0 for VAT-inclusive prices.
    const addedTax = inv.pricesIncludeVat ? D(0) : tax;
    const total = subtotal.sub(discount).add(addedTax);
    const invoice = await tx.invoice.create({
      data: {
        public_id: newId(),
        code: await nextCode(tx, 'INV', issue.getUTCFullYear()),
        customer_id: inv.customerId,
        facility_id: inv.facilityId,
        contract_id: inv.contractId ?? null,
        reservation_id: inv.reservationId ?? null,
        type: inv.type,
        period_start: inv.periodStart ?? null,
        period_end: inv.periodEnd ?? null,
        issue_date: issue,
        due_date: inv.dueDate,
        status: total.lte(0) ? 'PAID' : 'ISSUED',
        paid_at: total.lte(0) ? this.clock.now() : null,
        subtotal,
        discount_total: discount,
        tax_total: addedTax,
        total,
        move_in_due: inv.moveInDue ?? false,
        items: { create: items },
      },
      include: { items: true },
    });
    await this.ledger(tx, { customerId: inv.customerId, contractId: inv.contractId, type: 'INVOICE', amount: total, sourceType: 'invoice', sourceId: invoice.id, description: invoice.code, actor: inv.actor });
    if (inv.notify !== false && total.gt(0)) {
      const cust = await tx.customer.findUnique({ where: { id: inv.customerId }, select: { user_id: true, full_name: true } });
      if (cust?.user_id) {
        const fac = await tx.facility.findUnique({ where: { id: inv.facilityId }, select: { name: true } });
        const contract = inv.contractId
          ? await tx.contract.findUnique({ where: { id: inv.contractId }, select: { code: true, unit: { select: { code: true } } } })
          : null;
        const reservation = inv.reservationId
          ? await tx.reservation.findUnique({ where: { id: inv.reservationId }, select: { code: true } })
          : null;
        await this.notify.notify(
          {
            users: [cust.user_id],
            event: 'invoice.issued',
            vars: {
              code: invoice.code,
              amount: fmt(total),
              dueDate: fmtD(inv.dueDate),
              issueDate: fmtD(issue),
              facility: fac?.name ?? '',
              contractCode: contract?.code ?? '',
              unitCode: contract?.unit?.code ?? '',
              reservationCode: reservation?.code ?? '',
              customer: cust.full_name,
            },
            link: `/app/billing/invoices/${invoice.public_id}`,
            related: { type: 'invoice', id: invoice.id },
            email: true,
          },
          tx,
        );
      }
    }
    return invoice;
  }

  /** Recomputes invoice status from amounts (ISSUED/PARTIALLY_PAID/PAID). */
  async refreshInvoiceStatus(tx: Tx, invoiceId: bigint) {
    const inv = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    if (['VOID', 'WRITTEN_OFF', 'REFUNDED', 'PARTIALLY_REFUNDED', 'DRAFT'].includes(inv.status)) return inv;
    const due = D(inv.total).sub(inv.amount_paid).sub(inv.amount_credited);
    const status: 'PAID' | 'PARTIALLY_PAID' | 'ISSUED' = due.lte(0) ? 'PAID' : D(inv.amount_paid).gt(0) || D(inv.amount_credited).gt(0) ? 'PARTIALLY_PAID' : 'ISSUED';
    return tx.invoice.update({ where: { id: invoiceId }, data: { status, paid_at: status === 'PAID' && !inv.paid_at ? this.clock.now() : inv.paid_at } });
  }

  async creditNote(tx: Tx, invoiceId: bigint, amount: DecimalValue, reason: string, actor: bigint | null, feeWaiverId?: bigint | null) {
    const inv = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    const cn = await tx.creditNote.create({
      data: { code: await nextCode(tx, 'CN', this.today().getUTCFullYear()), invoice_id: invoiceId, amount: vnd(amount), reason: reason.slice(0, 500), fee_waiver_id: feeWaiverId ?? null, issued_by: actor, issued_at: this.clock.now() },
    });
    await tx.invoice.update({ where: { id: invoiceId }, data: { amount_credited: { increment: vnd(amount) } } });
    await this.ledger(tx, { customerId: inv.customer_id, contractId: inv.contract_id, type: 'CREDIT_NOTE', amount: vnd(amount).neg(), sourceType: 'credit_note', sourceId: cn.id, description: `${cn.code} cho ${inv.code}`, actor });
    await this.refreshInvoiceStatus(tx, invoiceId);
    return cn;
  }

  // ------------------------------------------------------------------ unit state machine (§7.1)
  async transitionUnit(
    tx: Tx,
    unitId: bigint,
    to: UnitStatus,
    opts: { reason?: string | null; actor?: bigint | null; related?: { type: string; id: bigint }; flag?: OperationalFlag; extra?: Prisma.UnitUpdateInput } = {},
  ) {
    const rows = await tx.$queryRaw<{ id: bigint }[]>`SELECT id FROM units WHERE id = ${unitId} FOR UPDATE`;
    if (!rows.length) throw notFound('Kho');
    const unit = await tx.unit.findUniqueOrThrow({ where: { id: unitId }, include: { facility: { select: { public_id: true } } } });
    if (unit.status !== to && !canTransition(UNIT_TRANSITIONS, unit.status, to)) throw invalidTransition('kho', unit.status, to);
    const updated = await tx.unit.update({
      where: { id: unitId },
      data: {
        status: to,
        status_reason: ['MAINTENANCE', 'OUT_OF_SERVICE', 'RETIRED'].includes(to) ? opts.reason ?? unit.status_reason : null,
        operational_flag: opts.flag ?? (to === 'OCCUPIED' || to === 'OVERLOCKED' ? undefined : 'NONE'),
        version: { increment: 1 },
        ...(opts.extra ?? {}),
      },
    });
    await tx.unitStatusHistory.create({
      data: { unit_id: unitId, from_status: unit.status, to_status: to, from_flag: unit.operational_flag, to_flag: updated.operational_flag, reason: opts.reason?.slice(0, 255), related_type: opts.related?.type, related_id: opts.related?.id, actor_user_id: opts.actor ?? null },
    });
    await this.events.emit(tx, 'unit.status_changed', { type: 'unit', id: unitId }, { facility: unit.facility.public_id, unit: unit.public_id, code: unit.code, from: unit.status, to, flag: updated.operational_flag });
    return updated;
  }

  async setOperationalFlag(tx: Tx, unitId: bigint, flag: 'NONE' | 'INSPECTION_DUE' | 'MAINTENANCE_SCHEDULED' | 'ISSUE_REPORTED', reason: string | null, actor: bigint | null) {
    const unit = await tx.unit.findUniqueOrThrow({ where: { id: unitId }, include: { facility: { select: { public_id: true } } } });
    if (unit.operational_flag === flag) return unit;
    const u = await tx.unit.update({ where: { id: unitId }, data: { operational_flag: flag, version: { increment: 1 } } });
    await tx.unitStatusHistory.create({ data: { unit_id: unitId, from_status: unit.status, to_status: unit.status, from_flag: unit.operational_flag, to_flag: flag, reason, actor_user_id: actor } });
    await this.events.emit(tx, 'unit.status_changed', { type: 'unit', id: unitId }, { facility: unit.facility.public_id, unit: unit.public_id, code: unit.code, from: unit.status, to: unit.status, flag });
    return u;
  }

  // ------------------------------------------------------------------ tasks (§6.5 5C step 4)
  async createTask(
    tx: Tx,
    t: { facilityId: bigint; type: Prisma.WorkTaskCreateInput['type']; title: string; description?: string; related?: { type: string; id: bigint }; unitId?: bigint | null; priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'; dueAt?: Date | null; assigneeId?: bigint | null; dedupeKey?: string; requiresPhoto?: boolean; source?: 'SYSTEM' | 'MANUAL'; actor?: bigint | null },
  ) {
    if (t.dedupeKey) {
      const ex = await tx.workTask.findUnique({ where: { dedupe_key: t.dedupeKey } });
      if (ex) return ex;
    }
    let assignee = t.assigneeId ?? null;
    if (!assignee && t.source !== 'MANUAL') {
      const fac = await tx.facility.findUniqueOrThrow({ where: { id: t.facilityId }, select: { auto_dispatch: true } });
      if (fac.auto_dispatch && t.type !== 'ALLOCATE_UNIT') assignee = await this.staffOnShiftWithFewestTasks(tx, t.facilityId);
    }
    const task = await tx.workTask.create({
      data: {
        public_id: newId(),
        facility_id: t.facilityId,
        type: t.type,
        title: t.title.slice(0, 200),
        description: t.description,
        related_type: t.related?.type,
        related_id: t.related?.id,
        unit_id: t.unitId ?? null,
        priority: t.priority ?? 'MEDIUM',
        status: assignee ? 'ASSIGNED' : 'OPEN',
        assignee_id: assignee,
        due_at: t.dueAt ?? null,
        source: t.source ?? 'SYSTEM',
        dedupe_key: t.dedupeKey ?? null,
        requires_photo: t.requiresPhoto ?? false,
        events: { create: [{ event: 'CREATED', actor_user_id: t.actor ?? null }, ...(assignee ? [{ event: 'ASSIGNED' as const, to_user_id: assignee, actor_user_id: t.actor ?? null }] : [])] },
      },
    });
    const fac = await tx.facility.findUniqueOrThrow({ where: { id: t.facilityId }, select: { public_id: true } });
    await this.events.emit(tx, 'task.changed', { type: 'task', id: task.id }, { facility: fac.public_id, task: task.public_id, status: task.status });
    if (assignee) await this.notify.notify({ users: [assignee], event: 'task.assigned', vars: { title: task.title, due: task.due_at ? fmtDT(task.due_at) : 'không đặt' }, link: `/staff/tasks/${task.public_id}`, related: { type: 'task', id: task.id }, email: false }, tx);
    return task;
  }

  async completeTasksFor(tx: Tx, relatedType: string, relatedId: bigint, types: Prisma.WorkTaskCreateInput['type'][], actor: bigint | null, note?: string) {
    const tasks = await tx.workTask.findMany({ where: { related_type: relatedType, related_id: relatedId, type: { in: types }, status: { notIn: ['DONE', 'CANCELLED'] } } });
    for (const t of tasks) {
      await tx.workTask.update({ where: { id: t.id }, data: { status: 'DONE', completed_at: this.clock.now(), started_at: t.started_at ?? this.clock.now(), completion_note: note, is_overdue: false, version: { increment: 1 } } });
      await tx.taskEvent.create({ data: { task_id: t.id, event: 'COMPLETED', actor_user_id: actor, note } });
    }
  }

  /** Staff currently on a published shift at the facility with the fewest open tasks (auto_dispatch). */
  async staffOnShiftWithFewestTasks(db: Db, facilityId: bigint): Promise<bigint | null> {
    const now = this.clock.now();
    const shifts = await db.staffShift.findMany({ where: { facility_id: facilityId, status: 'PUBLISHED', starts_at: { lte: now }, ends_at: { gt: now } }, select: { user_id: true } });
    let candidates = [...new Set(shifts.map((s) => s.user_id))];
    if (!candidates.length) return null;
    const active = await db.userRole.findMany({ where: { user_id: { in: candidates }, facility_id: facilityId, revoked_at: null, role: { code: 'FACILITY_STAFF' } }, select: { user_id: true } });
    candidates = active.map((a) => a.user_id);
    if (!candidates.length) return null;
    const counts = await Promise.all(candidates.map(async (u) => ({ u, n: await db.workTask.count({ where: { assignee_id: u, status: { in: ['ASSIGNED', 'IN_PROGRESS'] } } }) })));
    counts.sort((a, b) => a.n - b.n);
    return counts[0].u;
  }

  async facilityManagers(db: Db, facilityId: bigint): Promise<bigint[]> {
    const rows = await db.userRole.findMany({ where: { facility_id: facilityId, revoked_at: null, role: { code: 'FACILITY_MANAGER' }, user: { status: 'ACTIVE' } }, select: { user_id: true } });
    return [...new Set(rows.map((r) => r.user_id))];
  }
  async facilityStaff(db: Db, facilityId: bigint): Promise<bigint[]> {
    const rows = await db.userRole.findMany({ where: { facility_id: facilityId, revoked_at: null, role: { code: 'FACILITY_STAFF' }, user: { status: 'ACTIVE' } }, select: { user_id: true } });
    return [...new Set(rows.map((r) => r.user_id))];
  }
  async staffOnShift(db: Db, facilityId: bigint): Promise<bigint[]> {
    const now = this.clock.now();
    const rows = await db.staffShift.findMany({ where: { facility_id: facilityId, status: 'PUBLISHED', starts_at: { lte: now }, ends_at: { gt: now } }, select: { user_id: true } });
    return [...new Set(rows.map((r) => r.user_id))];
  }
  async businessOpsManagers(db: Db): Promise<bigint[]> {
    const rows = await db.userRole.findMany({ where: { revoked_at: null, role: { code: 'BUSINESS_OPS_MANAGER' }, user: { status: 'ACTIVE' } }, select: { user_id: true } });
    return [...new Set(rows.map((r) => r.user_id))];
  }
  async admins(db: Db): Promise<bigint[]> {
    const rows = await db.userRole.findMany({ where: { revoked_at: null, role: { code: 'SYSTEM_ADMIN' }, user: { status: 'ACTIVE' } }, select: { user_id: true } });
    return [...new Set(rows.map((r) => r.user_id))];
  }
  async customerUser(db: Db, customerId: bigint): Promise<bigint | null> {
    const c = await db.customer.findUnique({ where: { id: customerId }, select: { user_id: true } });
    return c?.user_id ?? null;
  }

  // ------------------------------------------------------------------ lookups by public id
  async facilityByPublic(id: string, db: Db = this.prisma) {
    const f = await db.facility.findFirst({ where: { OR: [{ public_id: id }, { slug: id }], deleted_at: null } });
    if (!f) throw notFound('Cơ sở');
    return f;
  }

  /** Sets reservation status with history row (§10.4 reservation_status_history). */
  async setReservationStatus(tx: Tx, reservationId: bigint, to: ReservationStatus, actor: bigint | null, reason?: string, extra: Prisma.ReservationUpdateInput = {}) {
    const r = await tx.reservation.findUniqueOrThrow({ where: { id: reservationId } });
    const { RESERVATION_TRANSITIONS } = await import('@vaultra/shared');
    if (r.status !== to && !canTransition(RESERVATION_TRANSITIONS, r.status, to)) throw invalidTransition('đơn đặt thuê', r.status, to);
    const u = await tx.reservation.update({ where: { id: reservationId }, data: { status: to, version: { increment: 1 }, ...extra } });
    if (r.status !== to) await tx.reservationStatusHistory.create({ data: { reservation_id: reservationId, from_status: r.status, to_status: to, reason: reason?.slice(0, 255), actor_user_id: actor } });
    return u;
  }

  async setContractStatus(tx: Tx, contractId: bigint, to: Prisma.ContractUpdateInput['status'] & string, actor: bigint | null, reason?: string, extra: Prisma.ContractUpdateInput = {}) {
    const c = await tx.contract.findUniqueOrThrow({ where: { id: contractId } });
    const { CONTRACT_TRANSITIONS } = await import('@vaultra/shared');
    if (c.status !== to && !canTransition(CONTRACT_TRANSITIONS, c.status, to)) throw invalidTransition('hợp đồng', c.status, to);
    const u = await tx.contract.update({ where: { id: contractId }, data: { status: to, version: { increment: 1 }, ...extra } });
    if (c.status !== to) await tx.contractStatusHistory.create({ data: { contract_id: contractId, field: 'STATUS', from_status: c.status, to_status: to, reason: reason?.slice(0, 255), actor_user_id: actor } });
    return u;
  }

  actorId(ctx: AccessContext | null | undefined) {
    return ctx?.userId ?? null;
  }
  addDays = addDays;
}

export const fmt = (v: DecimalValue) => new Intl.NumberFormat('vi-VN').format(Math.round(Number(v))) + ' ₫';
export const fmtD = (d: Date | null | undefined) => (d ? `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}` : '');
export const fmtDT = (d: Date) => new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
