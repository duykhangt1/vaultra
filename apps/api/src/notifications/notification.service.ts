import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { PrismaService, Tx } from '../common/prisma.service';
import { config } from '../common/config';
import { newId, unref } from '../common/util';
import { ClockService } from '../common/clock.service';
import { RealtimeHub } from '../realtime/realtime.hub';
import { capEmailAttachments, EmailAttachment, EmailProvider } from './email.provider';
import { EmailComposerService } from './email-composer.service';
import { renderEmailHtml } from './email-layout';
import { TEMPLATES, TemplateDef } from './templates';

export interface NotifyInput {
  users: bigint[];
  event: string;
  vars?: Record<string, unknown>;
  link?: string;
  related?: { type: string; id: bigint };
  priority?: 'NORMAL' | 'HIGH';
  dedupeKey?: string;
  /** Override: force email off (e.g. internal ops) or on. */
  email?: boolean;
}

export interface SendToAddressOptions {
  event?: string;
  vars?: Record<string, unknown>;
  actionUrl?: string;
  actionLabel?: string;
  replyTo?: string;
  userFullName?: string;
  related?: { type: string; id: bigint };
  attachments?: EmailAttachment[];
}

const QUIET_GROUPS = new Set(['RENEWAL', 'MARKETING']);

/**
 * NotificationService (spec §16.1): resolves template + preferences, writes notifications and
 * notification_deliveries (evidence of sending, required by the overdue flow), and pushes realtime.
 * Email deliveries are enriched via EmailComposerService and sent with exponential retry (max 5 attempts).
 */
@Injectable()
export class NotificationService implements OnModuleInit {
  private readonly logger = new Logger('Notify');
  private tplCache: {
    at: number;
    map: Map<string, { subject: string; body: string; active: boolean; is_mandatory: boolean; updated_by: bigint | null }>;
  } | null = null;
  private sending = false;
  private refreshing = false;
  private defaultsSynced = false;

  constructor(
    private prisma: PrismaService,
    private email: EmailProvider,
    private hub: RealtimeHub,
    private clock: ClockService,
    private composer: EmailComposerService,
  ) {}

  onModuleInit() {
    void this.loadTemplates(this.prisma).catch(() => undefined);
    if (!config.jobs.enabled) return;
    unref(setInterval(() => this.dispatchEmails().catch((e) => this.logger.error(e.message)), 3000));
  }

  def(event: string): TemplateDef {
    return TEMPLATES[event] ?? { group: 'OPERATIONS', mandatory: false, email: false, subject: event, body: '' };
  }

  /**
   * Loads DB templates into memory and (once per boot on the root Prisma client) syncs untouched seed rows
   * (`where: { updated_by: null }`) so stale 1-line seed rows in existing DBs are upgraded to `TEMPLATES`
   * while preserving any template customized by BOM/Admin (`updated_by !== null`).
   */
  private async loadTemplates(db: Tx | PrismaService) {
    let rows = await db.notificationTemplate.findMany({ where: { channel: 'EMAIL', locale: 'vi' } });
    if (db === this.prisma && !this.defaultsSynced) {
      this.defaultsSynced = true;
      try {
        const byCode = new Map(rows.map((r) => [r.event_code, r]));
        let changed = false;
        for (const [code, def] of Object.entries(TEMPLATES)) {
          const subj = def.subject.slice(0, 255);
          const existing = byCode.get(code);
          if (existing) {
            if (
              existing.updated_by === null &&
              (existing.subject !== subj || existing.body !== def.body || existing.is_mandatory !== def.mandatory)
            ) {
              await this.prisma.notificationTemplate
                .updateMany({
                  where: { id: existing.id, updated_by: null },
                  data: { subject: subj, body: def.body, is_mandatory: def.mandatory },
                })
                .catch(() => undefined);
              changed = true;
            }
          } else if (def.email) {
            await this.prisma.notificationTemplate
              .create({
                data: {
                  event_code: code,
                  channel: 'EMAIL',
                  locale: 'vi',
                  subject: subj,
                  body: def.body,
                  is_mandatory: def.mandatory,
                  active: true,
                  updated_by: null,
                },
              })
              .catch(() => undefined);
            changed = true;
          }
        }
        if (changed) {
          rows = await db.notificationTemplate.findMany({ where: { channel: 'EMAIL', locale: 'vi' } });
        }
      } catch (err) {
        this.logger.warn(`Default template sync skipped: ${(err as Error).message}`);
      }
    }
    this.tplCache = { at: Date.now(), map: new Map(rows.map((r) => [r.event_code, r])) };
  }

  /**
   * Stale-while-revalidate: callers often run inside a DB transaction, so a refresh must never wait for
   * a second pool connection (that starves the pool under burst load). A cold cache loads through the
   * caller's own connection; a stale one is served as-is and refreshed in the background.
   */
  private async template(event: string, db: Tx | PrismaService = this.prisma) {
    if (!this.tplCache) await this.loadTemplates(db);
    else if (Date.now() - this.tplCache.at > 60000 && !this.refreshing) {
      this.refreshing = true;
      void this.loadTemplates(this.prisma)
        .catch(() => undefined)
        .finally(() => (this.refreshing = false));
    }
    const d = this.def(event);
    const row = this.tplCache!.map.get(event);
    const hasCustomEdit = row && row.updated_by !== null;
    return {
      ...d,
      subject: hasCustomEdit ? row.subject : TEMPLATES[event] ? d.subject : (row?.subject ?? d.subject),
      body: hasCustomEdit ? row.body : TEMPLATES[event] ? d.body : (row?.body ?? d.body),
      mandatory: row?.is_mandatory ?? d.mandatory,
      active: row?.active ?? true,
    };
  }

  invalidateTemplates() {
    this.tplCache = null;
  }

  render(text: string, vars: Record<string, unknown> = {}) {
    return text.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_m, k) => {
      const v = k === 'brand' ? config.brandName : vars[k];
      return v === undefined || v === null ? '' : String(v);
    });
  }

  async notify(input: NotifyInput, tx?: Tx): Promise<void> {
    const db = tx ?? this.prisma;
    const tpl = await this.template(input.event, db);
    if (!tpl.active && !tpl.mandatory) return;
    const title = this.render(tpl.subject, input.vars).slice(0, 255);
    const body = this.render(tpl.body, input.vars);
    const users = [...new Set(input.users.map(String))].map((x) => BigInt(x));
    for (const userId of users) {
      const user = await db.user.findUnique({
        where: { id: userId },
        select: { id: true, public_id: true, email: true, status: true, customer: { select: { email_suppressed: true } } },
      });
      if (!user || user.status === 'DISABLED') continue;
      const prefs =
        tpl.group === 'ACCOUNT'
          ? []
          : await db.notificationPreference.findMany({ where: { user_id: userId, event_group: tpl.group } });
      const inAppOff = !tpl.mandatory && prefs.some((p) => p.channel === 'IN_APP' && !p.enabled);
      const emailOff = !tpl.mandatory && prefs.some((p) => p.channel === 'EMAIL' && !p.enabled);
      const dedupe = input.dedupeKey ? `${input.dedupeKey}:${userId}`.slice(0, 160) : null;
      if (dedupe && (await db.notification.findUnique({ where: { dedupe_key: dedupe }, select: { id: true } }))) continue;
      const n = await db.notification.create({
        data: {
          public_id: newId(),
          user_id: userId,
          event_code: input.event,
          title,
          body,
          link: input.link ?? null,
          related_type: input.related?.type ?? null,
          related_id: input.related?.id ?? null,
          priority: input.priority ?? 'NORMAL',
          dedupe_key: dedupe,
          read_at: inAppOff ? this.clock.now() : null,
        },
      });
      const wantEmail = input.email ?? tpl.email;
      if (wantEmail && !emailOff) {
        const suppressed = user.customer?.email_suppressed;
        await db.notificationDelivery.create({
          data: {
            notification_id: n.id,
            channel: 'EMAIL',
            recipient: user.email,
            subject: `[${config.brandName}] ${title}`.slice(0, 255),
            status: suppressed ? 'SUPPRESSED' : 'QUEUED',
            next_attempt_at: QUIET_GROUPS.has(tpl.group) ? this.nextAllowedTime() : null,
          },
        });
      }
      await db.outboxEvent.create({
        data: {
          event_type: 'notification.created',
          aggregate_type: 'notification',
          aggregate_id: n.id,
          payload: {
            user: user.public_id,
            id: n.public_id,
            title,
            link: input.link ?? null,
            priority: input.priority ?? 'NORMAL',
          },
        },
      });
    }
  }

  /** Sends a token-bearing or immediate transactional email (tokens/OTPs are never persisted in plaintext). */
  async sendDirect(
    userId: bigint,
    event: string,
    vars: Record<string, unknown>,
    actionUrl?: string,
    actionLabel?: string,
    related?: { type: string; id: bigint },
  ) {
    const tpl = await this.template(event);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return;
    const title = this.render(tpl.subject, vars).slice(0, 255);
    const body = this.render(tpl.body, vars);
    const n = await this.prisma.notification.create({
      data: {
        public_id: newId(),
        user_id: userId,
        event_code: event,
        title,
        body,
        link: null,
        related_type: related?.type ?? null,
        related_id: related?.id ?? null,
        read_at: event.startsWith('auth.') ? this.clock.now() : null,
      },
    });
    const subject = `[${config.brandName}] ${title}`.slice(0, 255);
    const isTestAddr = String(user.email).toLowerCase().endsWith('.test');
    const d = await this.prisma.notificationDelivery.create({
      data: {
        notification_id: n.id,
        channel: 'EMAIL',
        recipient: user.email,
        subject,
        status: isTestAddr ? 'SUPPRESSED' : 'QUEUED',
        attempts: 1,
        next_attempt_at: isTestAddr ? null : new Date(Date.now() + 5 * 60_000),
      },
    });
    if (isTestAddr) return;
    void (async () => {
      try {
        let composed: { html: string; text: string; attachments: EmailAttachment[] };
        try {
          composed = await this.composer.compose({
            event,
            title,
            body,
            recipientEmail: user.email,
            userId: user.id,
            userFullName: user.full_name,
            vars,
            actionUrl,
            actionLabel,
            related: related ?? null,
          });
        } catch (composeErr) {
          this.logger.warn(`sendDirect compose fallback (${event}): ${(composeErr as Error).message}`);
          composed = {
            html: this.layout(title, body, actionUrl, actionLabel),
            text: `${title}\n\n${body}\n\n${actionUrl ?? ''}`,
            attachments: [],
          };
        }
        const mail = {
          to: user.email,
          subject,
          html: composed.html,
          text: composed.text,
          attachments: capEmailAttachments(composed.attachments),
        };
        let r;
        try {
          r = await this.email.send(mail);
        } catch {
          await new Promise((res) => setTimeout(res, 1500));
          r = await this.email.send(mail);
        }
        await this.prisma.notificationDelivery.update({
          where: { id: d.id },
          data: { status: 'SENT', sent_at: new Date(), next_attempt_at: null, provider_message_id: r.messageId?.slice(0, 128) },
        });
      } catch (e) {
        await this.prisma.notificationDelivery.update({
          where: { id: d.id },
          data: { status: 'FAILED', next_attempt_at: null, last_error: String((e as Error).message).slice(0, 500) },
        });
      }
    })();
  }

  /** One-off email to an address that has no account (public contact form acknowledgement, etc.). Never throws. */
  async sendToAddress(to: string, title: string, body: string, opts?: SendToAddressOptions) {
    try {
      const subject = `[${config.brandName}] ${title}`.slice(0, 255);
      let composed: { html: string; text: string; attachments: EmailAttachment[] };
      try {
        composed = await this.composer.compose({
          event: opts?.event ?? 'contact.ack',
          title,
          body,
          recipientEmail: to,
          userFullName: opts?.userFullName,
          vars: opts?.vars,
          actionUrl: opts?.actionUrl,
          actionLabel: opts?.actionLabel,
          related: opts?.related ?? null,
          extraAttachments: opts?.attachments,
        });
      } catch {
        composed = {
          html: this.layout(title, body, opts?.actionUrl, opts?.actionLabel),
          text: `${title}\n\n${body}\n\n${opts?.actionUrl ?? ''}`,
          attachments: capEmailAttachments(opts?.attachments),
        };
      }
      await this.email.send({
        to,
        subject,
        html: composed.html,
        text: composed.text,
        replyTo: opts?.replyTo,
        attachments: capEmailAttachments(composed.attachments),
      });
    } catch (e) {
      this.logger.error(`sendToAddress failed: ${(e as Error).message}`);
    }
  }

  private nextAllowedTime(): Date | null {
    const now = this.clock.now();
    const h = Number(formatInTimeZone(now, 'Asia/Ho_Chi_Minh', 'H'));
    if (h >= 8 && h < 21) return null;
    const day = formatInTimeZone(h >= 21 ? new Date(now.getTime() + 86400000) : now, 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
    return fromZonedTime(`${day}T08:00:00`, 'Asia/Ho_Chi_Minh');
  }

  /** Synchronous fallback layout renderer (never calls external QR image services). */
  layout(title: string, body: string, actionUrl?: string, actionLabel = 'Xem chi tiết trên hệ thống', referenceCode?: string) {
    return renderEmailHtml({
      event: 'system.notification',
      categoryBadge: 'THÔNG BÁO HỆ THỐNG',
      referenceCode,
      title,
      leadParagraphs: body
        .split(/\n{2,}|\r\n\r\n/)
        .map((s) => s.trim())
        .filter(Boolean),
      callouts: [],
      kvRows: [],
      tables: [],
      photoPreviews: [],
      attachments: [],
      cta: actionUrl ? { url: actionUrl, label: actionLabel } : undefined,
    });
  }

  /** Email dispatcher: QUEUED -> SENT, retry with backoff 1,2,4,8 min; FAILED after 5 attempts (spec §16.1.4). */
  async dispatchEmails(limit = 20, guard: <T>(fn: () => Promise<T>) => Promise<T> = (fn) => fn()) {
    if (this.sending) return;
    this.sending = true;
    try {
      const now = new Date();
      const batch = await this.prisma.notificationDelivery.findMany({
        where: { status: 'QUEUED', channel: 'EMAIL', OR: [{ next_attempt_at: null }, { next_attempt_at: { lte: now } }] },
        include: { notification: true },
        take: limit,
        orderBy: { id: 'asc' },
      });
      for (const d of batch) {
        if (String(d.recipient).toLowerCase().endsWith('.test')) {
          await guard(() =>
            this.prisma.notificationDelivery.update({
              where: { id: d.id },
              data: { status: 'SUPPRESSED', last_error: 'Địa chỉ demo, không gửi' },
            }),
          );
          continue;
        }
        try {
          const link = d.notification.link
            ? d.notification.link.startsWith('http')
              ? d.notification.link
              : `${config.appOrigin}${d.notification.link}`
            : undefined;
          const related =
            d.notification.related_type && d.notification.related_id
              ? { type: d.notification.related_type, id: d.notification.related_id }
              : null;

          let composed: { html: string; text: string; attachments: EmailAttachment[] };
          try {
            composed = await this.composer.compose({
              event: d.notification.event_code,
              title: d.notification.title,
              body: d.notification.body,
              recipientEmail: d.recipient,
              userId: d.notification.user_id,
              actionUrl: link,
              related,
            });
          } catch (composeErr) {
            this.logger.warn(`dispatchEmails compose fallback (${d.notification.event_code}): ${(composeErr as Error).message}`);
            composed = {
              html: this.layout(d.notification.title, d.notification.body, link),
              text: `${d.notification.title}\n\n${d.notification.body}\n\n${link ?? ''}`,
              attachments: [],
            };
          }

          const r = await this.email.send({
            to: d.recipient,
            subject: d.subject ?? `[${config.brandName}] ${d.notification.title}`.slice(0, 255),
            html: composed.html,
            text: composed.text,
            attachments: capEmailAttachments(composed.attachments),
          });
          // `guard` lets a caller serialise just the DB write (the Worker) so slow SMTP never runs inside its lock
          await guard(() =>
            this.prisma.notificationDelivery.update({
              where: { id: d.id },
              data: {
                status: 'SENT',
                sent_at: new Date(),
                attempts: d.attempts + 1,
                provider_message_id: r.messageId?.slice(0, 128),
              },
            }),
          );
        } catch (e) {
          const attempts = d.attempts + 1;
          await guard(() =>
            this.prisma.notificationDelivery.update({
              where: { id: d.id },
              data: {
                attempts,
                last_error: String((e as Error).message).slice(0, 500),
                status: attempts >= 5 ? 'FAILED' : 'QUEUED',
                next_attempt_at: new Date(Date.now() + 60000 * 2 ** (attempts - 1)),
              },
            }),
          );
        }
      }
    } finally {
      this.sending = false;
    }
  }

  /** Realtime push of committed notifications (outbox consumer). */
  pushRealtime(payload: { user: string; id: string; title: string; link: string | null; priority: string }) {
    this.hub.toUser(payload.user, { type: 'notification.created', ...payload });
  }
}
