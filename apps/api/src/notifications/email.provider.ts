import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as nodemailer from 'nodemailer';
import { config } from '../common/config';

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
  cid?: string;
  contentDisposition?: 'attachment' | 'inline';
}

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
}

/** Safe raw attachment budget (~14 MB raw -> ~18.7 MB base64 MIME, well below 25 MB Vietnix SMTP limit). */
export const MAX_EMAIL_ATTACHMENT_BYTES = 14 * 1024 * 1024;

function isPriorityAttachment(a: EmailAttachment): boolean {
  const fn = (a.filename ?? '').toLowerCase();
  const ct = (a.contentType ?? '').toLowerCase();
  if (ct === 'application/pdf' || fn.endsWith('.pdf')) return true;
  if (ct.startsWith('text/calendar') || fn.endsWith('.ics')) return true;
  if (a.cid === 'vaultra-qr' || /^qr[-_]/i.test(fn)) return true;
  if (fn.endsWith('.csv') || fn.endsWith('.xlsx')) return true;
  return false;
}

/**
 * Enforces total attachment byte cap: always prioritizes PDFs, .ics calendars, QR codes, and report exports
 * first, then includes photos in order up to `maxBytes` so SMTP servers never reject oversized messages.
 */
export function capEmailAttachments(attachments?: EmailAttachment[], maxBytes = MAX_EMAIL_ATTACHMENT_BYTES): EmailAttachment[] {
  if (!attachments?.length) return [];
  const valid = attachments.filter((a) => a && Buffer.isBuffer(a.content) && a.content.length > 0);
  const priority = valid.filter(isPriorityAttachment);
  const rest = valid.filter((a) => !isPriorityAttachment(a));

  const selected = new Set<EmailAttachment>();
  let total = 0;

  for (const a of priority) {
    if (total + a.content.length <= maxBytes || selected.size === 0) {
      selected.add(a);
      total += a.content.length;
    }
  }
  for (const a of rest) {
    if (total + a.content.length <= maxBytes) {
      selected.add(a);
      total += a.content.length;
    }
  }
  // Preserve clean ordering: priority documents first, then photos in order
  return [...priority.filter((a) => selected.has(a)), ...rest.filter((a) => selected.has(a))];
}

/**
 * EmailProvider (spec §16.6): SMTP (Mailpit locally, any SMTP/Resend in prod) or a file sink
 * (storage/mails/*.eml) when SMTP_HOST is not configured, so flows remain testable offline.
 * Cloudflare Email Service can be plugged in behind the same interface.
 */
@Injectable()
export class EmailProvider {
  private readonly logger = new Logger('Email');
  private fileSink = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'unix' });
  private smtpTransport = config.smtp.host
    ? nodemailer.createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.secure,
        auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
      })
    : null;

  async send(msg: EmailMessage): Promise<{ messageId: string }> {
    const isTestAddr = /\.(test|local|invalid)$/i.test(msg.to.trim());
    const attachments = capEmailAttachments(msg.attachments);
    const mailOpts: nodemailer.SendMailOptions = {
      from: config.emailFrom,
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      ...(msg.replyTo ? { replyTo: msg.replyTo } : {}),
      ...(attachments.length
        ? {
            attachments: attachments.map((a) => ({
              filename: a.filename,
              content: a.content,
              contentType: a.contentType,
              cid: a.cid,
              contentDisposition: a.contentDisposition,
            })),
          }
        : {}),
    };

    let messageId = '';
    if (!config.isProd || !this.smtpTransport || isTestAddr) {
      const info = await this.fileSink.sendMail(mailOpts);
      const dir = path.join(config.storage.localDir, 'mails');
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `${Date.now()}-${msg.to.replace(/[^a-z0-9@.]/gi, '_')}.eml`);
      fs.writeFileSync(file, (info as unknown as { message: Buffer }).message);
      messageId = info.messageId;
      const kb = Math.round(attachments.reduce((s, a) => s + a.content.length, 0) / 1024);
      this.logger.log(`(file sink) ${msg.to} — ${msg.subject}${attachments.length ? ` [${attachments.length} tệp, ${kb} KB]` : ''}`);
    }
    if (this.smtpTransport && !isTestAddr) {
      try {
        const info = await this.smtpTransport.sendMail(mailOpts);
        messageId = info.messageId;
      } catch (e) {
        if (config.isProd) throw e;
        this.logger.warn(`SMTP send failed for ${msg.to}, used local file sink: ${(e as Error).message}`);
      }
    }
    return { messageId };
  }
}
