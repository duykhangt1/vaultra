import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { config } from '../common/config';
import { newId, nextCode, unref } from '../common/util';
import { CoreService } from '../domain/core.service';
import { NotificationService } from '../notifications/notification.service';
import { KbService } from '../assistant/kb.service';
import { ReservationService } from '../reservation/reservation.service';
import { BillingService } from '../billing/billing.service';
import { PaymentService } from '../billing/payment.service';
import { DelinquencyService } from '../lifecycle/delinquency.service';
import { RenewalService } from '../lifecycle/renewal.service';
import { MoveOutService } from '../moveout/moveout.service';
import { SupportService } from '../support/support.service';
import { ReportService } from '../report/report.service';

type JobDef = { name: string; everySec: number; run: () => Promise<number | void> };

/**
 * Background jobs (spec §10/§12 "job nền"). Every run is recorded in job_runs; the unique
 * `lock_key` makes a job single-flight across API instances (stale locks expire after 15 min).
 * Jobs are idempotent, so a missed tick or a manual run via /internal/jobs/:name is harmless.
 */
@Injectable()
export class JobsService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger('Jobs');
  private timers: NodeJS.Timeout[] = [];
  readonly defs: JobDef[];

  constructor(
    private prisma: PrismaService,
    private core: CoreService,
    private notify: NotificationService,
    private kb: KbService,
    reservations: ReservationService,
    billing: BillingService,
    delinquency: DelinquencyService,
    renewals: RenewalService,
    moveOut: MoveOutService,
    support: SupportService,
    reports: ReportService,
    payments: PaymentService,
  ) {
    this.defs = [
      { name: 'reservation.expire-holds', everySec: 60, run: () => reservations.expireHolds() },
      { name: 'reservation.no-shows', everySec: 3600, run: () => reservations.processNoShows() },
      { name: 'reservation.auto-assign-handovers', everySec: 900, run: () => reservations.autoAssignHandovers() as Promise<number | void> },
      { name: 'appointment.reminders', everySec: 900, run: () => reservations.appointmentReminders() as Promise<number | void> },
      { name: 'appointment.mark-missed', everySec: 900, run: () => reservations.markMissedAppointments() as Promise<number | void> },
      { name: 'billing.recurring', everySec: 3600, run: () => billing.runRecurring() as Promise<number | void> },
      { name: 'billing.due-soon-reminders', everySec: 3600, run: () => billing.dueSoonReminders() as Promise<number | void> },
      { name: 'delinquency.run', everySec: 3600, run: () => delinquency.runJob() as Promise<number | void> },
      { name: 'renewal.windows', everySec: 3600, run: () => renewals.openWindowsAndRemind() as Promise<number | void> },
      { name: 'renewal.expiries', everySec: 3600, run: () => renewals.processExpiries() as Promise<number | void> },
      { name: 'moveout.auto-finalize', everySec: 3600, run: () => moveOut.autoFinalizeJob() as Promise<number | void> },
      { name: 'support.sla', everySec: 300, run: () => support.slaJob() as Promise<number | void> },
      { name: 'policy.activate-scheduled', everySec: 900, run: () => this.activateScheduledPolicies() },
      { name: 'maintenance.plans', everySec: 3600, run: () => this.runMaintenancePlans() },
      { name: 'workforce.overdue-tasks', everySec: 600, run: () => this.flagOverdueTasks() },
      { name: 'report.daily-metrics', everySec: 3600, run: () => reports.computeDailyMetrics() as Promise<number | void> },
    ];
  }

  /** Activates SCHEDULED policy versions whose effective_from has arrived (§6.4 4B step 6). */
  async activateScheduledPolicies(): Promise<number> {
    const now = this.core.now();
    const due = await this.prisma.policyVersion.findMany({ where: { status: 'SCHEDULED', effective_from: { lte: now } } });
    for (const v of due) {
      await this.prisma.tx(async (tx) => {
        await tx.policyVersion.updateMany({ where: { policy_id: v.policy_id, status: 'ACTIVE' }, data: { status: 'SUPERSEDED', effective_to: v.effective_from } });
        await tx.policyVersion.update({ where: { id: v.id }, data: { status: 'ACTIVE' } });
      });
      await this.kb.syncPolicyArticle();
    }
    return due.length;
  }

  /** Generates work_orders and work_tasks for due maintenance_plans and advances next_due_date (§6.5 5D step 5). */
  async runMaintenancePlans(): Promise<number> {
    const now = this.core.now();
    const due = await this.prisma.maintenancePlan.findMany({ where: { active: true, next_due_date: { lte: now } } });
    for (const p of due) {
      await this.prisma.tx(async (tx) => {
        const wo = await tx.workOrder.create({
          data: {
            public_id: newId(),
            code: await nextCode(tx, 'WO', now.getFullYear()),
            facility_id: p.facility_id,
            category: p.category,
            priority: 'MEDIUM',
            description: `Bảo trì định kỳ: ${p.name}`,
            status: 'APPROVED',
          },
        });
        await this.core.createTask(tx, {
          facilityId: p.facility_id,
          type: 'MAINTENANCE',
          title: `Bảo trì định kỳ: ${p.name}`,
          description: `Theo kế hoạch định kỳ (${p.interval_days} ngày) — ${wo.code}`,
          priority: 'MEDIUM',
          dueAt: new Date(now.getTime() + 86400000),
          related: { type: 'work_order', id: wo.id },
          dedupeKey: `MPLAN:${p.id}:${p.next_due_date.toISOString().slice(0, 10)}`,
          source: 'SYSTEM',
        });
        const nextDue = new Date(p.next_due_date.getTime() + Math.max(1, p.interval_days) * 86400000);
        await tx.maintenancePlan.update({ where: { id: p.id }, data: { next_due_date: nextDue } });
      });
    }
    return due.length;
  }

  /** Marks open/in-progress work_tasks past due_at as is_overdue and alerts FM (§6.5 5C step 5, 5B.5). */
  async flagOverdueTasks(): Promise<number> {
    const now = this.core.now();
    const due = await this.prisma.workTask.findMany({
      where: { status: { in: ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'BLOCKED'] }, is_overdue: false, due_at: { lt: now } },
    });
    for (const t of due) {
      await this.prisma.workTask.update({ where: { id: t.id }, data: { is_overdue: true } });
      const fms = await this.core.facilityManagers(this.prisma, t.facility_id);
      const recipients = [...new Set([...fms, ...(t.assignee_id ? [t.assignee_id] : [])])];
      if (recipients.length) {
        await this.notify.notify({
          users: recipients,
          event: 'task.overdue',
          vars: { title: t.title },
          link: '/manage/tasks',
          email: false,
          dedupeKey: `task.overdue:${t.id}`,
        });
      }
      if (t.type === 'ALLOCATE_UNIT' && fms.length) {
        let rCode = t.title;
        if (t.related_type === 'reservation' && t.related_id) {
          const r = await this.prisma.reservation.findUnique({ where: { id: t.related_id }, select: { code: true } });
          if (r) rCode = r.code;
        }
        await this.notify.notify({
          users: fms,
          event: 'allocation.sla_breached',
          vars: { code: rCode },
          link: '/manage/reservations',
          priority: 'HIGH',
          dedupeKey: `alloc.sla:${t.id}`,
        });
      }
    }
    return due.length;
  }

  names() {
    return this.defs.map((d) => d.name);
  }

  async run(name: string): Promise<{ name: string; status: 'SUCCEEDED' | 'FAILED' | 'SKIPPED'; processed: number; error?: string }> {
    const def = this.defs.find((d) => d.name === name);
    if (!def) throw new Error(`Unknown job ${name}`);
    // single-flight lock
    let runId: bigint;
    try {
      await this.prisma.jobRun.deleteMany({ where: { lock_key: name, status: 'RUNNING', started_at: { lt: new Date(Date.now() - 15 * 60000) } } });
      runId = (await this.prisma.jobRun.create({ data: { job_name: name, lock_key: name } })).id;
    } catch {
      return { name, status: 'SKIPPED', processed: 0 };
    }
    try {
      const n = (await def.run()) ?? 0;
      await this.prisma.jobRun.update({ where: { id: runId }, data: { status: 'SUCCEEDED', finished_at: new Date(), processed_count: Number(n) || 0, lock_key: null } }).catch(() => undefined);
      return { name, status: 'SUCCEEDED', processed: Number(n) || 0 };
    } catch (e) {
      const msg = e instanceof Error ? `${e.message}\n${e.stack ?? ''}`.slice(0, 4000) : String(e);
      this.log.error(`${name} failed: ${msg}`);
      await this.prisma.jobRun.update({ where: { id: runId }, data: { status: 'FAILED', finished_at: new Date(), error: msg, lock_key: null } }).catch(() => undefined);
      return { name, status: 'FAILED', processed: 0, error: msg };
    }
  }

  async runAll() {
    const out = [];
    for (const d of this.defs) out.push(await this.run(d.name));
    return out;
  }

  onApplicationBootstrap() {
    if (!config.jobs.enabled) return;
    // Clear locks left by a crashed process.
    void this.prisma.jobRun.updateMany({ where: { status: 'RUNNING' }, data: { status: 'FAILED', error: 'Process restarted', finished_at: new Date(), lock_key: null } }).catch(() => undefined);
    this.defs.forEach((d, i) => {
      const t = setInterval(() => void this.run(d.name), d.everySec * 1000);
      unref(t);
      this.timers.push(t);
      const first = setTimeout(() => void this.run(d.name), 5000 + i * 1500);
      unref(first);
    });
    this.log.log(`Scheduler started: ${this.defs.length} jobs`);
  }

  onModuleDestroy() {
    this.timers.forEach(clearInterval);
  }
}
