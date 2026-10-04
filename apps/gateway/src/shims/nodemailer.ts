import { connect } from 'cloudflare:sockets';

/**
 * nodemailer stand-in for the Worker: a small SMTP client over Cloudflare TCP sockets (port 465 = implicit TLS, 587 = STARTTLS).
 * It supports what EmailProvider sends: to / subject / text / html and attachments (.ics). The previous stub pretended to send.
 */
interface Opts { host?: string; port?: number; secure?: boolean; auth?: { user: string; pass: string }; streamTransport?: boolean }
interface Mail { from: string; to: string; subject: string; text?: string; html?: string; attachments?: { filename: string; content: Buffer | Uint8Array; contentType?: string }[] }

const enc = new TextEncoder();
const dec = new TextDecoder();
const b64 = (data: string | Uint8Array) => {
  const bytes = typeof data === 'string' ? enc.encode(data) : data;
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
