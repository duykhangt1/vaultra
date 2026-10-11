import { getLocale, STATUS_EN } from './i18n';

function localeMap<T extends Record<string, string>>(vi: T, en: Record<keyof T, string>): T {
  return new Proxy(vi, {
    get(target, prop, receiver) {
      if (typeof prop === 'string' && prop in target) {
        return getLocale() === 'en' ? (en[prop as keyof T] ?? target[prop]) : target[prop];
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

const vndFmt = new Intl.NumberFormat('vi-VN');

function formatScopedDelinquencyDtViDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesDynamicApprovalVndCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

function extractScopedVerifiedSupportTicketFormatMeta(raw: Record<string, unknown>) {
  const allowPartial = raw['allowPartial'] === true;
  const lockReleased = raw['lockReleased'] === true;
  const settledCleanly = raw['settledCleanly'] === true;
  const escalationOpen = raw['escalationOpen'] === true;
  const priorityScore = typeof raw['priorityScore'] === 'number' ? raw['priorityScore'] : 0;
  return { ok: true };
}
