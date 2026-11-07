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
export const vnd = (n: number | string | null | undefined) => (n === null || n === undefined || n === '' ? '—' : `${vndFmt.format(Math.round(Number(n)))} ₫`);
export const num = (n: number | string | null | undefined, d = 0) => (n === null || n === undefined ? '—' : new Intl.NumberFormat(getLocale() === 'en' ? 'en-US' : 'vi-VN', { maximumFractionDigits: d }).format(Number(n)));
export const pct = (n: number | null | undefined, d = 0) => (n === null || n === undefined ? '—' : `${(n * 100).toFixed(d)}%`);
const dtVi = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' });
const dtEn = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' });
const d0Vi = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeZone: 'UTC' });
const d0En = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'UTC' });
export const fmtDateTime = (v?: string | Date | null) => (v ? (getLocale() === 'en' ? dtEn : dtVi).format(new Date(v)) : '—');
/** Date-only values come from the API as ISO midnight UTC — format in UTC so the calendar day never shifts. */
export const fmtDate = (v?: string | Date | null) => (v ? (getLocale() === 'en' ? d0En : d0Vi).format(new Date(v)) : '—');
/**
 * The API stores a lease's end as an exclusive date (the day after the last day of use) while
 * contracts, PDFs and the detail header show the last day itself. Every screen that shows a stored
 * end date must go through this so the same contract never shows two different expiry dates.
 */
export const fmtEndDate = (v?: string | Date | null) => (v ? fmtDate(new Date(new Date(v).getTime() - 86400000)) : '—');
export const ymd = (d: Date) => d.toISOString().slice(0, 10);
export const addDaysYmd = (n: number, from = new Date()) => ymd(new Date(from.getTime() + n * 86400000));
/** Today's date in Vietnam (UTC+7) as YYYY-MM-DD, whatever time zone the browser is in: the screens and the reports agree on which day "today" is. */
export const todayVn = () => ymd(new Date(Date.now() + 7 * 3600_000));
/** A YYYY-MM-DD date moved by a number of days. */
export const shiftYmd = (s: string, days: number) => ymd(new Date(new Date(`${s}T00:00:00Z`).getTime() + days * 86400000));
/** First day of the month of a YYYY-MM-DD date, moved by a number of months (-1 = the month before). */
export const monthStartYmd = (s: string, months = 0) => {
  const [y, m] = s.split('-').map(Number);
  return ymd(new Date(Date.UTC(y, m - 1 + months, 1)));
};
/** Last day of the month of a YYYY-MM-DD date. */
export const monthEndYmd = (s: string) => shiftYmd(monthStartYmd(s, 1), -1);
export function relTime(v?: string | Date | null) {
  if (!v) return '';
  const s = (new Date(v).getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(getLocale(), { numeric: 'auto' });
  const a = Math.abs(s);
  if (a < 60) return rtf.format(Math.round(s), 'second');
  if (a < 3600) return rtf.format(Math.round(s / 60), 'minute');
  if (a < 86400) return rtf.format(Math.round(s / 3600), 'hour');
  return rtf.format(Math.round(s / 86400), 'day');
}
export const initials = (n?: string | null) => (n ?? '?').split(/\s+/).filter(Boolean).slice(-2).map((x) => x[0]).join('').toUpperCase();

export type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'neutral' | 'brass' | 'purple';
type L = [string, Tone];
const S = (m: Record<string, L>) =>
  new Proxy(m, {
    get(target, prop, receiver) {
      if (typeof prop === 'string' && prop in target) {
        const entry = target[prop];
        if (getLocale() === 'en' && STATUS_EN[prop]) {
          return [STATUS_EN[prop], entry[1]] as L;
        }
        return entry;
      }
      return Reflect.get(target, prop, receiver);
    },
  });

export const STATUS: Record<string, Record<string, L>> = {
  reservation: S({ PENDING_PAYMENT: ['Chờ thanh toán', 'warn'], CONFIRMED: ['Đã xác nhận', 'info'], UNIT_ASSIGNED: ['Đã gán kho', 'info'], MOVE_IN_SCHEDULED: ['Đã hẹn nhận kho', 'info'], CHECKED_IN: ['Đã nhận kho', 'ok'], COMPLETED: ['Hoàn tất', 'ok'], CANCELLED: ['Đã hủy', 'neutral'], EXPIRED: ['Hết hạn giữ chỗ', 'neutral'], NO_SHOW: ['Không đến', 'bad'] }),
  contract: S({ PENDING_SIGNATURE: ['Chờ ký', 'warn'], SIGNED: ['Đã ký', 'info'], ACTIVE: ['Đang thuê', 'ok'], MOVE_OUT_SCHEDULED: ['Đã báo trả kho', 'warn'], EXPIRED: ['Hết hạn', 'warn'], TERMINATED: ['Đã chấm dứt', 'bad'], ENDED: ['Đã kết thúc', 'neutral'], CANCELLED: ['Đã hủy', 'neutral'] }),
  delinquency: S({ CURRENT: ['Đúng hạn', 'ok'], GRACE: ['Ân hạn', 'warn'], LATE: ['Trễ hạn', 'warn'], LOCKED_OUT: ['Khóa truy cập', 'bad'], FINAL_NOTICE: ['Thông báo cuối', 'bad'], DEFAULT_PENDING: ['Chờ xử lý vi phạm', 'bad'], DEFAULTED: ['Vi phạm', 'bad'] }),
  invoice: S({ DRAFT: ['Nháp', 'neutral'], ISSUED: ['Chưa trả', 'warn'], PARTIALLY_PAID: ['Trả một phần', 'warn'], PAID: ['Đã trả', 'ok'], OVERDUE: ['Quá hạn', 'bad'], VOID: ['Đã hủy', 'neutral'], CREDITED: ['Đã ghi có', 'info'], WRITTEN_OFF: ['Xóa nợ', 'neutral'] }),
  payment: S({ PENDING: ['Đang xử lý', 'warn'], SUCCEEDED: ['Thành công', 'ok'], FAILED: ['Thất bại', 'bad'], EXPIRED: ['Hết hạn', 'neutral'], REFUNDED: ['Đã hoàn', 'info'], PARTIALLY_REFUNDED: ['Hoàn một phần', 'info'] }),
  refund: S({ PENDING_APPROVAL: ['Chờ duyệt', 'warn'], APPROVED: ['Đã duyệt', 'info'], PROCESSING: ['Đang hoàn', 'info'], COMPLETED: ['Đã hoàn', 'ok'], REJECTED: ['Từ chối', 'bad'], FAILED: ['Thất bại', 'bad'] }),
  unit: S({ AVAILABLE: ['Trống', 'ok'], RESERVED: ['Đã giữ', 'info'], OCCUPIED: ['Đang thuê', 'brass'], OVERLOCKED: ['Khóa chặn', 'bad'], PENDING_INSPECTION: ['Chờ kiểm tra', 'warn'], MAINTENANCE: ['Bảo trì', 'purple'], OUT_OF_SERVICE: ['Ngưng dùng', 'neutral'], RETIRED: ['Đã loại', 'neutral'] }),
  ticket: S({ NEW: ['Mới', 'info'], ASSIGNED: ['Đã phân công', 'info'], IN_PROGRESS: ['Đang xử lý', 'warn'], WAITING_CUSTOMER: ['Chờ khách', 'neutral'], RESOLVED: ['Đã giải quyết', 'ok'], CLOSED: ['Đã đóng', 'neutral'], CANCELLED: ['Đã hủy', 'neutral'], REOPENED: ['Mở lại', 'bad'] }),
  priority: S({ LOW: ['Thấp', 'neutral'], MEDIUM: ['Trung bình', 'info'], HIGH: ['Cao', 'warn'], URGENT: ['Khẩn', 'bad'] }),
  appointment: S({ BOOKED: ['Đã đặt', 'info'], ARRIVED: ['Đã đến', 'warn'], COMPLETED: ['Hoàn tất', 'ok'], MISSED: ['Lỡ hẹn', 'bad'], CANCELLED: ['Đã hủy', 'neutral'] }),
  task: S({ ASSIGNED: ['Đã giao', 'info'], TODO: ['Cần làm', 'neutral'], IN_PROGRESS: ['Đang làm', 'warn'], BLOCKED: ['Bị chặn', 'bad'], DONE: ['Xong', 'ok'], CANCELLED: ['Đã hủy', 'neutral'], OPEN: ['Mở', 'neutral'] }),
  user: S({ ACTIVE: ['Hoạt động', 'ok'], INVITED: ['Đã mời', 'info'], LOCKED: ['Bị khóa', 'bad'], DISABLED: ['Vô hiệu', 'neutral'], PENDING_VERIFICATION: ['Chờ xác minh', 'warn'] }),
  facility: S({ DRAFT: ['Nháp', 'neutral'], ACTIVE: ['Hoạt động', 'ok'], TEMPORARILY_CLOSED: ['Tạm đóng', 'warn'], INACTIVE: ['Ngưng', 'neutral'] }),
  generic: S({ ACTIVE: ['Hoạt động', 'ok'], DRAFT: ['Nháp', 'neutral'], SCHEDULED: ['Đã lên lịch', 'info'], SUPERSEDED: ['Đã thay thế', 'neutral'], CANCELLED: ['Đã hủy', 'neutral'], PENDING: ['Chờ xử lý', 'warn'], APPROVED: ['Đã duyệt', 'ok'], REJECTED: ['Từ chối', 'bad'], PENDING_APPROVAL: ['Chờ duyệt', 'warn'], EXPIRED: ['Hết hạn', 'neutral'], PUBLISHED: ['Đã xuất bản', 'ok'], ARCHIVED: ['Lưu trữ', 'neutral'], OPEN: ['Mở', 'warn'], DONE: ['Xong', 'ok'], FAILED: ['Lỗi', 'bad'], SUCCEEDED: ['Thành công', 'ok'], RUNNING: ['Đang chạy', 'info'], QUEUED: ['Hàng đợi', 'neutral'], SENT: ['Đã gửi', 'ok'], COMPLETED: ['Hoàn tất', 'ok'] }),
};

export function statusOf(kind: string, v?: string | null): L {
  if (!v) return ['—', 'neutral'];
  const base = STATUS[kind]?.[v] ?? STATUS.generic[v] ?? [v.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()), 'neutral'];
  if (getLocale() === 'en' && STATUS_EN[v]) return [STATUS_EN[v], base[1]];
  return base;
}

export const INVOICE_TYPE_LABEL: Record<string, string> = localeMap(
  { RESERVATION: 'Đặt chỗ', MOVE_IN: 'Nhận kho', RECURRING: 'Tiền thuê định kỳ', RENEWAL: 'Gia hạn', AD_HOC: 'Phát sinh', SETTLEMENT: 'Quyết toán' },
  { RESERVATION: 'Reservation', MOVE_IN: 'Move-in', RECURRING: 'Recurring rent', RENEWAL: 'Renewal', AD_HOC: 'Ad-hoc charge', SETTLEMENT: 'Settlement' },
);

export const ITEM_TYPE_LABEL: Record<string, string> = localeMap(
  { RENT: 'Tiền thuê', DEPOSIT: 'Tiền cọc', FEE: 'Phí', DISCOUNT: 'Giảm giá', PRORATION: 'Theo ngày', DAMAGE: 'Hư hại', ADJUSTMENT: 'Điều chỉnh' },
  { RENT: 'Rent', DEPOSIT: 'Deposit', FEE: 'Fee', DISCOUNT: 'Discount', PRORATION: 'Proration', DAMAGE: 'Damage', ADJUSTMENT: 'Adjustment' },
);

/** "OLD → NEW" status change as readable text, e.g. "Chờ ký → Đã ký"; the first entry reads "Tạo · <status>". */
export function transitionText(kind: string, from: string | null | undefined, to: string) {
  const createdPrefix = getLocale() === 'en' ? 'Created' : 'Tạo';
  return from ? `${statusOf(kind, from)[0]} → ${statusOf(kind, to)[0]}` : `${createdPrefix} · ${statusOf(kind, to)[0]}`;
}

export const SIZE_LABEL: Record<string, string> = localeMap(
  { XS: 'Tủ khóa', S: 'Nhỏ', M: 'Vừa', L: 'Lớn', XL: 'Cực lớn', VEHICLE: 'Xe', LOCKER: 'Locker' },
  { XS: 'Locker', S: 'Small', M: 'Medium', L: 'Large', XL: 'Extra Large', VEHICLE: 'Vehicle', LOCKER: 'Locker' },
);

export const APPT_LABEL: Record<string, string> = localeMap(
  { MOVE_IN: 'Nhận kho', MOVE_OUT: 'Trả kho', INSPECTION: 'Kiểm tra', VIEWING: 'Xem kho', OTHER: 'Khác' },
  { MOVE_IN: 'Move-in', MOVE_OUT: 'Move-out', INSPECTION: 'Inspection', VIEWING: 'Facility tour', OTHER: 'Other' },
);

export const CATEGORY_LABEL: Record<string, string> = localeMap(
  { ACCESS_CODE: 'Mã truy cập', LOCK_KEY: 'Khóa / chìa', UNIT_DAMAGE: 'Hư hại kho', STORED_ITEMS: 'Đồ trong kho', PAYMENT: 'Thanh toán', CONTRACT: 'Hợp đồng', OTHER: 'Khác' },
  { ACCESS_CODE: 'Access code', LOCK_KEY: 'Lock / key', UNIT_DAMAGE: 'Unit damage', STORED_ITEMS: 'Stored items', PAYMENT: 'Payment', CONTRACT: 'Contract', OTHER: 'Other' },
);

export const AMENITY_LABEL: Record<string, string> = localeMap(
  { camera_24_7: 'Camera 24/7', bao_ve: 'Bảo vệ', thang_may: 'Thang máy', dieu_hoa: 'Điều hòa', bai_do_xe: 'Bãi đỗ xe', xe_day: 'Xe đẩy', cua_lon: 'Cửa lớn cho xe tải' },
  { camera_24_7: '24/7 CCTV', bao_ve: '24/7 Security guard', thang_may: 'Freight elevator', dieu_hoa: 'Climate control', bai_do_xe: 'Parking lot', xe_day: 'Hand trolleys', cua_lon: 'Truck loading bay' },
);

export const ROLE_LABEL: Record<string, string> = localeMap(
  { CUSTOMER: 'Khách thuê', FACILITY_STAFF: 'Nhân viên cơ sở', FACILITY_MANAGER: 'Quản lý cơ sở', BUSINESS_OPS_MANAGER: 'Vận hành doanh nghiệp', SYSTEM_ADMIN: 'Quản trị hệ thống' },
  { CUSTOMER: 'Customer', FACILITY_STAFF: 'Facility Staff', FACILITY_MANAGER: 'Facility Manager', BUSINESS_OPS_MANAGER: 'Business Operations', SYSTEM_ADMIN: 'System Admin' },
);

export const WORKSPACE_OF: Record<string, string> = { CUSTOMER: '/app', FACILITY_STAFF: '/staff', FACILITY_MANAGER: '/manage', BUSINESS_OPS_MANAGER: '/ops', SYSTEM_ADMIN: '/admin' };

export const WORKSPACE_LABEL: Record<string, string> = localeMap(
  { '/app': 'Khách thuê', '/staff': 'Nhân viên', '/manage': 'Quản lý cơ sở', '/ops': 'Vận hành', '/admin': 'Quản trị' },
  { '/app': 'Customer Portal', '/staff': 'Staff Workbench', '/manage': 'Facility Manager', '/ops': 'Business Ops', '/admin': 'System Admin' },
);

/** Label for any known status/enum code in the active locale (falls back to a humanised code). */
export function enumLabel(v: string) {
  if (getLocale() === 'en' && STATUS_EN[v]) return STATUS_EN[v];
  for (const m of Object.values(STATUS)) {
    const l = (m as Record<string, L>)[v];
    if (l) return l[0];
  }
  const h = v.replace(/_/g, ' ').toLowerCase();
  return h.charAt(0).toUpperCase() + h.slice(1);
}

const CANONICAL_PROVINCES: Record<string, string> = {
  'ho-chi-minh': 'TP. Hồ Chí Minh',
  'ha-noi': 'Hà Nội',
  'da-nang': 'Đà Nẵng',
  'hai-phong': 'Hải Phòng',
  'can-tho': 'Cần Thơ',
};

export function normalizeProvinceInfo(rawName?: string | null, rawSlug?: string | null): { name: string; slug: string } {
  const cleaned = String(rawName ?? '')
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ');
  const stripped = cleaned.replace(/^(?:thành\s+phố|thanh\s+pho|tp\.?|tỉnh|tinh)\s+/iu, '').trim();
  const toSlug = (s: string) =>
    s
      .normalize('NFC')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/^(?:thanh-pho-|tp-|tinh-)/, '');
  let slug = toSlug(stripped || rawSlug || '');
  if (slug === 'hcm' || slug === 'tphcm' || slug === 'sai-gon' || slug === 'saigon') slug = 'ho-chi-minh';
  if (!slug && rawSlug) slug = toSlug(rawSlug);
  return {
    name: CANONICAL_PROVINCES[slug] || stripped || cleaned,
    slug: slug || 'khac',
  };
}

export function normalizeProvinceList(provinces?: { name?: string; slug?: string; count?: number }[] | null): { name: string; slug: string; count: number }[] {
  if (!Array.isArray(provinces) || !provinces.length) return [];
  const map = new Map<string, { name: string; slug: string; count: number }>();
  for (const p of provinces) {
    const norm = normalizeProvinceInfo(p.name, p.slug);
    const cur = map.get(norm.slug);
    if (cur) cur.count += Number(p.count ?? 1);
    else map.set(norm.slug, { name: norm.name, slug: norm.slug, count: Number(p.count ?? 1) });
  }
  return [...map.values()];
}
