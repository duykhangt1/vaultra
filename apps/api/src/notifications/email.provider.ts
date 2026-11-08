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
