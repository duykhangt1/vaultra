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
const wrap76 = (s: string) => s.replace(/(.{76})/g, '$1\r\n');
const addr = (s: string) => /<([^>]+)>/.exec(s)?.[1] ?? s.trim();
const encHeader = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`);
const encFrom = (s: string) => { const m = /^(.*)<([^>]+)>\s*$/.exec(s); return m && !/^[\x20-\x7e]*$/.test(m[1]) ? `${encHeader(m[1].trim())} <${m[2]}>` : s; };

function buildMime(mail: Mail, domain: string) {
  const id = `<${crypto.randomUUID()}@${domain}>`;
  const alt = `alt_${crypto.randomUUID().replace(/-/g, '')}`;
  const mix = `mix_${crypto.randomUUID().replace(/-/g, '')}`;
  const body = [
    `--${alt}`, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', wrap76(b64(mail.text ?? '')),
    `--${alt}`, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', wrap76(b64(mail.html ?? '')),
    `--${alt}--`,
  ].join('\r\n');
  const head = [`From: ${encFrom(mail.from)}`, `To: ${mail.to}`, `Subject: ${encHeader(mail.subject)}`, `Date: ${new Date().toUTCString()}`, `Message-ID: ${id}`, 'MIME-Version: 1.0'];
  let out: string;
  if (mail.attachments?.length) {
    const parts = mail.attachments.map((a) => [`--${mix}`, `Content-Type: ${a.contentType ?? 'application/octet-stream'}; name="${a.filename}"`, 'Content-Transfer-Encoding: base64', `Content-Disposition: attachment; filename="${a.filename}"`, '', wrap76(b64(a.content))].join('\r\n'));
    out = [...head, `Content-Type: multipart/mixed; boundary="${mix}"`, '', `--${mix}`, `Content-Type: multipart/alternative; boundary="${alt}"`, '', body, ...parts, `--${mix}--`].join('\r\n');
  } else {
    out = [...head, `Content-Type: multipart/alternative; boundary="${alt}"`, '', body].join('\r\n');
  }
  return { id, data: out };
}

class Smtp {
  private reader!: ReadableStreamDefaultReader<Uint8Array>;
  private writer!: WritableStreamDefaultWriter<Uint8Array>;
  private buf = '';
  constructor(private sock: ReturnType<typeof connect>) { this.attach(sock); }
  private attach(s: ReturnType<typeof connect>) { this.sock = s; this.reader = s.readable.getReader(); this.writer = s.writable.getWriter(); this.buf = ''; }
  async startTls() { this.reader.releaseLock(); this.writer.releaseLock(); this.attach(this.sock.startTls()); }
  /** Reads one (possibly multi-line) reply and returns [code, text]. */
  async read(): Promise<[number, string]> {
    for (;;) {
      const lines = this.buf.split('\r\n');
      for (let i = 0; i < lines.length - 1; i++) {
        if (/^\d{3} /.test(lines[i]) || /^\d{3}$/.test(lines[i])) {
          const text = lines.slice(0, i + 1).join('\n');
          this.buf = lines.slice(i + 1).join('\r\n');
          return [Number(lines[i].slice(0, 3)), text];
        }
      }
      const { value, done } = await this.reader.read();
      if (done) throw new Error('SMTP connection closed unexpectedly');
      this.buf += dec.decode(value, { stream: true });
    }
  }
  async cmd(line: string, ok: number[]): Promise<string> {
    await this.writer.write(enc.encode(`${line}\r\n`));
    const [code, text] = await this.read();
    if (!ok.includes(code)) throw new Error(`SMTP ${/^(EHLO|HELO|MAIL|RCPT|DATA|AUTH|QUIT|RSET|STARTTLS)\b/.test(line) ? line.split(' ')[0] : 'AUTH'} failed: ${text.slice(0, 200)}`);
    return text;
  }
  async raw(data: string, ok: number[]) {
    await this.writer.write(enc.encode(data));
    const [code, text] = await this.read();
    if (!ok.includes(code)) throw new Error(`SMTP DATA failed: ${text.slice(0, 200)}`);
  }
  async close() { try { await this.writer.write(enc.encode('QUIT\r\n')); } catch { /* ignore */ } try { await this.sock.close(); } catch { /* ignore */ } }
}

async function smtpSend(o: Opts, mail: Mail) {
  const port = o.port ?? 465;
  const implicit = o.secure ?? port === 465;
  const sock = connect({ hostname: o.host!, port }, { secureTransport: implicit ? 'on' : 'starttls', allowHalfOpen: false });
  const c = new Smtp(sock);
  try {
    const [g] = await c.read();
    if (g !== 220) throw new Error(`SMTP greeting ${g}`);
    await c.cmd('EHLO vaultra.worker', [250]);
    if (!implicit) { await c.cmd('STARTTLS', [220]); await c.startTls(); await c.cmd('EHLO vaultra.worker', [250]); }
    if (o.auth?.user) {
      await c.cmd('AUTH LOGIN', [334]);
      await c.cmd(b64(o.auth.user), [334]);
      await c.cmd(b64(o.auth.pass), [235]);
    }
    const from = addr(mail.from);
    await c.cmd(`MAIL FROM:<${from}>`, [250]);
    await c.cmd(`RCPT TO:<${addr(mail.to)}>`, [250, 251]);
    await c.cmd('DATA', [354]);
    const { id, data } = buildMime(mail, from.split('@')[1] ?? 'vaultra.local');
    await c.raw(`${data.replace(/\r\n\./g, '\r\n..')}\r\n.\r\n`, [250]);
    return { messageId: id };
  } finally {
    await c.close();
  }
}

export const createTransport = (o: Opts = {}) => ({
  async sendMail(mail: Mail) {
    if (!o.host) return { messageId: `local-${Date.now()}@vaultra.local` };
    return smtpSend(o, mail);
  },
});
export default { createTransport };
