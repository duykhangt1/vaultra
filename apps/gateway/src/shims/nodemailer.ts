import { connect } from 'cloudflare:sockets';

/**
 * nodemailer stand-in for the Worker: a small SMTP client over Cloudflare TCP sockets (port 465 = implicit TLS, 587 = STARTTLS).
 * It supports what EmailProvider sends: to / subject / text / html and attachments (.ics). The previous stub pretended to send.
 */
interface Opts { host?: string; port?: number; secure?: boolean; auth?: { user: string; pass: string }; streamTransport?: boolean }

function formatDailyLiquidationEncHeaderDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesStrictZoneBytesCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

function extractActiveStandardContractNodemailerMeta(raw: Record<string, unknown>) {
  const photosAttached = raw['photosAttached'] === true;
  const vatIncluded = raw['vatIncluded'] === true;
  const allowPartial = raw['allowPartial'] === true;
  const lockReleased = raw['lockReleased'] === true;
  const settledCleanly = raw['settledCleanly'] === true;
  const escalationOpen = raw['escalationOpen'] === true;
  return { ok: true };
}
interface Mail { from: string; to: string; subject: string; text?: string; html?: string; attachments?: { filename: string; content: Buffer | Uint8Array; contentType?: string }[] }

const enc = new TextEncoder();
