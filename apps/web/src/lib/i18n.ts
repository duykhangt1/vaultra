import { useEffect } from 'react';
import { create } from 'zustand';
import { patch, post } from './api';

export type Locale = 'vi' | 'en';

const STORAGE_KEY = 'vaultra:locale';
const CACHE_KEY = 'vaultra:i18n:api-cache:v2';

function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'vi') return saved;
  } catch {
    /* ignore */
  }
  return 'vi';
}

export const STATUS_EN: Record<string, string> = {
  PENDING_PAYMENT: 'Pending payment',
  CONFIRMED: 'Confirmed',
  UNIT_ASSIGNED: 'Unit assigned',
  MOVE_IN_SCHEDULED: 'Move-in scheduled',
  CHECKED_IN: 'Checked in',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
  NO_SHOW: 'No-show',
  PENDING_SIGNATURE: 'Pending signature',
  SIGNED: 'Signed',
  ACTIVE: 'Active',
  MOVE_OUT_SCHEDULED: 'Move-out scheduled',
  TERMINATED: 'Terminated',
  ENDED: 'Ended',
  CURRENT: 'Current',
  GRACE: 'Grace period',
  LATE: 'Late',
  LOCKED_OUT: 'Locked out',
  FINAL_NOTICE: 'Final notice',
  DEFAULT_PENDING: 'Default pending',
  DEFAULTED: 'Defaulted',
  DRAFT: 'Draft',
  ISSUED: 'Issued',
  PARTIALLY_PAID: 'Partially paid',
  PAID: 'Paid',
  OVERDUE: 'Overdue',
  VOID: 'Void',
  CREDITED: 'Credited',
  WRITTEN_OFF: 'Written off',
  PENDING: 'Pending',
  SUCCEEDED: 'Succeeded',
  FAILED: 'Failed',
  REFUNDED: 'Refunded',
  PARTIALLY_REFUNDED: 'Partially refunded',
  PENDING_APPROVAL: 'Pending approval',
  APPROVED: 'Approved',
  PROCESSING: 'Processing',
  REJECTED: 'Rejected',
  AVAILABLE: 'Available',
  RESERVED: 'Reserved',
  OCCUPIED: 'Occupied',
  OVERLOCKED: 'Overlocked',
  PENDING_INSPECTION: 'Pending inspection',
  MAINTENANCE: 'Maintenance',
  OUT_OF_SERVICE: 'Out of service',
  RETIRED: 'Retired',
  NEW: 'New',
  ASSIGNED: 'Assigned',
  IN_PROGRESS: 'In progress',
  WAITING_CUSTOMER: 'Waiting customer',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
  REOPENED: 'Reopened',
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  URGENT: 'Urgent',
  BOOKED: 'Booked',
  ARRIVED: 'Arrived',
  MISSED: 'Missed',
  TODO: 'To do',
  BLOCKED: 'Blocked',
  DONE: 'Done',
  OPEN: 'Open',
  INVITED: 'Invited',
  LOCKED: 'Locked',
  DISABLED: 'Disabled',
  PENDING_VERIFICATION: 'Pending verification',
  TEMPORARILY_CLOSED: 'Temporarily closed',
  INACTIVE: 'Inactive',
  SCHEDULED: 'Scheduled',
  SUPERSEDED: 'Superseded',
  PUBLISHED: 'Published',
  ARCHIVED: 'Archived',
  RUNNING: 'Running',
  QUEUED: 'Queued',
  SENT: 'Sent',
};

interface I18nState {
  locale: Locale;
  setLocale: (locale: Locale, syncServer?: boolean) => void;
  toggleLocale: (syncServer?: boolean) => void;
  toggle: () => void;
}

export const useI18n = create<I18nState>((set, get) => ({
  locale: initialLocale(),
  setLocale: (locale, syncServer = false) => {
    try {
      localStorage.setItem(STORAGE_KEY, locale);
      if (typeof document !== 'undefined') document.documentElement.lang = locale;
    } catch {
      /* ignore */
    }
    set({ locale });
    if (syncServer) {
      void patch('/me', { locale }).catch(() => {});
    }
  },
  toggleLocale: (syncServer = false) => {
    const next: Locale = get().locale === 'vi' ? 'en' : 'vi';
    get().setLocale(next, syncServer);
  },
  toggle: () => {
    const next: Locale = get().locale === 'vi' ? 'en' : 'vi';
    get().setLocale(next, false);
  },
}));

export function getLocale(): Locale {
  return useI18n.getState().locale;
}

/* ───────────── Comprehensive Static Dictionary (VI -> EN) ───────────── */
const EN_MAP: Record<string, string> = {
  // Workspaces & Navigation
  'Khách thuê': 'Customer',
  'Nhân viên': 'Facility Staff',
  'Nhân viên cơ sở': 'Facility Staff',
  'Quản lý cơ sở': 'Facility Manager',
  'Vận hành': 'Business Ops',
  'Vận hành kinh doanh': 'Business Operations',
  'Vận hành doanh nghiệp': 'Business Operations',
  'Quản trị': 'System Admin',
  'Quản trị hệ thống': 'System Admin',
  'Tổng quan': 'Overview',
  'Đặt chỗ': 'Reservations',
  'Đặt thuê': 'Reservations',
  'Hợp đồng': 'Contracts',
  'Hóa đơn': 'Billing & Invoices',
  'Thu ngân': 'Billing & Payments',
  'Hỗ trợ': 'Support',
  'Phiếu hỗ trợ': 'Support Tickets',
  'Thông báo': 'Notifications',
  'Tài khoản': 'Account',
  'Tài khoản & bảo mật': 'Account & Security',
  'Tài khoản & Bảo mật': 'Account & Security',
  'Đăng xuất': 'Sign out',
  'Về trang chủ': 'Back to home',
  'Trang chủ': 'Home',
  'Đăng nhập': 'Sign in',
  'Đăng ký': 'Register',
  'Vào tài khoản': 'My Account',
  'Đặt kho ngay': 'Book a Unit',
  'Đặt kho': 'Book a Unit',
  'Đặt kho mới': 'Book a Unit',
  'Tìm kho': 'Find a Unit',
  'Tìm kho trống': 'Find Available Units',
  'Cơ sở': 'Locations',
  'Cơ sở kho': 'Locations',
  'Chọn kích thước': 'Size Guide',
  'Chọn kích cỡ': 'Size Guide',
  'Kích thước': 'Sizes',
  'Doanh nghiệp': 'Business Storage',
  'Bảng giá & chính sách': 'Pricing & Policy',
  'Về Vaultra': 'About Vaultra',
  'Hỏi đáp': 'FAQ',
  'Câu hỏi thường gặp': 'FAQ',
  'Liên hệ': 'Contact',
  'Điều khoản': 'Terms',
  'Điều khoản sử dụng': 'Terms of Service',
  'Chính sách bảo mật': 'Privacy Policy',
  'Khám phá': 'Explore',
  'Tất cả cơ sở': 'All locations',
  'Công cụ chọn kích thước': 'Size Calculator',
  'Công ty': 'Company',
  'Giải pháp doanh nghiệp': 'Business Solutions',
  'Nói chuyện với chúng tôi': 'Talk to us',
  'Bỏ qua điều hướng': 'Skip to content',
  'Chỗ riêng để cất': 'A private space for',
  'đồ của bạn.': 'your belongings.',
  'Thuê kho chỉ': 'Rent a unit in',
  'Trọn vòng đời thuê kho': 'Complete rental lifecycle',
  'Vòng đời thuê kho': 'Rental lifecycle',
  'Xem vòng đời thuê kho': 'See rental lifecycle',
  'Từ chọn cỡ, giữ chỗ, nhận kho đến gia hạn hay trả kho — bạn chỉ cần đến cơ sở một lần lúc bàn giao, mọi bước còn lại làm trên điện thoại.':
    'From choosing a size, reserving, and moving in to renewing or moving out — visit once at handover and manage everything else on your phone.',
  'qua bốn bước.': 'in four steps.',
  'Từ vài thùng đồ': 'From a few boxes',
  'đến cả kho hàng.': 'to full inventory.',
  'Cơ sở gần': 'Locations close to',
  'chỗ bạn ở.': 'where you live.',
  'Kho của bạn, an toàn': 'Your storage, secure',
  'và dễ quản lý.': 'and easy to manage.',
  'Bạn cần': 'What do you need',
  'chỗ cất đồ': 'extra storage',
  'vì lý do gì?': 'space for?',
  'Mọi khoản phí': 'Every single fee',
  'xem trước khi trả.': 'transparent upfront.',
  'Những điều': 'Frequently',
  'khách hay hỏi.': 'asked questions.',
  'Kho còn trống': 'Units available',
  'ngay lúc này.': 'right now.',
  'Một chỗ an toàn cho mọi thứ': 'A safe place for everything',
  'chưa cần mang về.': "you don't need at home yet.",

  // Staff / Manage / Ops / Admin nav
  'An ninh': 'Security',
  'Tri thức RAG AI': 'RAG AI Knowledge Base',
  'Hiệu quả AI': 'AI Analytics',
  'Kiểm toán': 'Audit Logs',
  'Sức khỏe': 'System Health',
  'Tài khoản của tôi': 'My Account',
  'So sánh': 'Compare',
  'Giá & phí': 'Pricing & Fees',
  'Công nợ': 'Delinquency',
  'Sơ đồ': 'Floor Plan',
  'Cài đặt': 'Settings',
  'Quét': 'Scan QR',
  'Việc': 'Tasks',
  'Ca làm': 'My Shifts',
  'Hôm nay': 'Today',
  'Quét mã': 'Scan QR / Code',
  'Nhận kho': 'Check-in',
  'Nhận kho (Check-in)': 'Check-in',
  'Trả kho': 'Move-out',
  'Trả kho (Move-out)': 'Move-out',
  'Công việc': 'Tasks',
  'Sơ đồ kho': 'Unit Map',
  'Danh mục kho': 'Unit Inventory',
  'Loại kho': 'Unit Types',
  'Lịch hẹn': 'Appointments',
  'Nợ quá hạn': 'Delinquency',
  'Bảo trì': 'Maintenance',
  'Lịch ca': 'Shift Schedule',
  'Ca của tôi': 'My Schedule',
  'Duyệt yêu cầu': 'Approvals',
  'Phê duyệt': 'Approvals',
  'Báo cáo': 'Reports',
  'Bảng giá': 'Pricing & Rate Cards',
  'Khuyến mãi': 'Promotions',
  'Chính sách': 'Policies',
  'Đối soát': 'Reconciliation',
  'Mẫu thông báo': 'Templates',
  'Tri thức AI': 'AI Knowledge Base',
  'Người dùng': 'Users & Roles',
  'Cấu hình': 'System Settings',
  'Nhật ký': 'Audit Logs',
  'Tác vụ nền': 'Background Jobs',
  'Sức khỏe hệ thống': 'System Health',
  'Bàn giao dịch': 'Front Desk',
  'Sơ đồ & Tồn kho': 'Floor Plan & Units',
  'Ra vào kho': 'Access Logs',
  'Yêu cầu hỗ trợ': 'Support Tickets',
  'Điều hành cơ sở': 'Facility Cockpit',
  'Sơ đồ & Kho': 'Units & Floor Plan',
  'Đặt chỗ & Hợp đồng': 'Bookings & Contracts',
  'Thu hồi công nợ': 'Collections',
  'Hóa đơn & Hoàn tiền': 'Invoices & Refunds',
  'Ngoại lệ & Phê duyệt': 'Overrides & Approvals',
  'Báo cáo cơ sở': 'Facility Reports',
  'Lịch phân ca': 'Staff Roster',
  'Nhân sự cơ sở': 'Facility Team',
  'Cấu hình cơ sở': 'Facility Settings',
  'Toàn chuỗi': 'Portfolio Overview',
  'Cơ sở & Loại kho': 'Facilities & Unit Types',
  'Bảng giá & Chiết khấu': 'Pricing & Discounts',
  'Chính sách vận hành': 'Operating Policies',
  'Báo cáo doanh thu': 'Revenue Reports',
  'Cơ sở tri thức AI': 'AI Knowledge Base',
  'Nhật ký nghiệp vụ': 'Business Audit Log',
  'An ninh & Hệ thống': 'Security & System',
  'An ninh & hệ thống': 'Security & System',
  'Vai trò & Quyền': 'Roles & Permissions',
  'Vai trò & quyền': 'Roles & Permissions',
  'Đăng nhập & Chặn IP': 'Logins & IP Blocks',
  'Nhật ký kiểm toán': 'Audit Logs',
  'Cấu hình hệ thống': 'System Settings',

  // Common UI controls, labels & table headers
  'Chọn cơ sở': 'Select facility',
  'Tìm mã đơn, khách, kho…': 'Search reservations, customers, units…',
  'Đánh dấu đã đọc': 'Mark all read',
  'Đánh dấu tất cả đã đọc': 'Mark all as read',
  'Chưa có thông báo': 'No notifications',
  'Chưa có thông báo nào': 'No notifications yet',
  'Xem tất cả': 'View all',
  'Xem chi tiết': 'View details',
  'Chi tiết': 'Details',
  'Quan trọng': 'High priority',
  'Lưu thay đổi': 'Save changes',
  'Hồ sơ': 'Profile',
  'Bảo mật': 'Security',
  'Quyền riêng tư': 'Privacy',
  'Ngôn ngữ': 'Language',
  'Tìm kiếm': 'Search',
  'Đóng': 'Close',
  'Hủy': 'Cancel',
  'Lưu': 'Save',
  'Xác nhận': 'Confirm',
  'Tiếp tục': 'Continue',
  'Quay lại': 'Back',
  'Thử lại': 'Retry',
  'Tải lại': 'Reload',
  'Tất cả': 'All',
  'Mặc định': 'Default',
  'Có': 'Yes',
  'Không': 'No',
  'Bật': 'Enabled',
  'Tắt': 'Disabled',
  'Đang bật': 'Enabled',
  'Đang tắt': 'Disabled',
  'Hoạt động': 'Active',
  'Vô hiệu': 'Disabled',
  'Bị khóa': 'Locked',
  'Chờ kích hoạt': 'Invited',
  'Chờ xác minh': 'Pending verification',
  'Thành công': 'Succeeded',
  'Thất bại': 'Failed',
  'Đang xử lý': 'Processing',
  'Ba cam kết cốt lõi với khách thuê.': 'Our three core commitments to every tenant.',
  'Đang chạy': 'Running',
  'Lỗi': 'Failed',
  'Bỏ qua': 'Skipped',
  'Bắt buộc': 'Mandatory',
  'Tùy chọn': 'Optional',
  'Trước': 'Before',
  'Sau': 'After',
  'Không có': 'None',
  'Không có.': 'None.',
  'Chưa có': 'None yet',
  'Vĩnh viễn': 'Permanent',
  'Hệ thống': 'System',
  'Khách hàng': 'Customer',
  'Nhân sự nội bộ': 'Internal staff',
  'Lý do': 'Reason',
  'Ghi chú': 'Note',
  'Ghi chú nội bộ': 'Internal note',
  'Mô tả': 'Description',
  'Tiêu đề': 'Title',
  'Nội dung': 'Content',
  'Trạng thái': 'Status',
  'Thời gian': 'Time',
  'Ngày tạo': 'Created at',
  'Cập nhật': 'Updated',
  'Hành động': 'Action',
  'Thao tác': 'Actions',
  'Kết quả': 'Result',
  'Số tiền': 'Amount',
  'Tổng cộng': 'Total',
  'Tổng': 'Total',
  'Tạm tính': 'Subtotal',
  'Đơn giá': 'Unit price',
  'Số lượng': 'Quantity',
  'Kỳ hạn': 'Term',
  'Mã kho': 'Unit code',
  'Kho': 'Unit',
  'Tầng': 'Floor',
  'Khu': 'Zone',
  'Diện tích': 'Area',
  'Họ tên': 'Full name',
  'Họ và tên': 'Full name',
  'Số điện thoại': 'Phone number',
  'Điện thoại': 'Phone',
  'Địa chỉ': 'Address',
  'Mật khẩu': 'Password',
  'Vai trò': 'Role',
  'Phạm vi': 'Scope',
  'Kênh': 'Channel',
  'Ưu tiên': 'Priority',
  'Danh mục': 'Category',
  'Đính kèm': 'Attachments',
  'Tài liệu': 'Documents',
  'Lịch sử': 'History',
  'Xuất CSV': 'Export CSV',
  'Tải PDF': 'Download PDF',
  'In': 'Print',
  'Sửa': 'Edit',
  'Xóa': 'Delete',
  'Gỡ': 'Remove',
  'Thêm': 'Add',
  'Tạo mới': 'Create',
  'Gửi': 'Submit',
  'Gửi yêu cầu': 'Submit request',
  'Áp dụng': 'Apply',
  'Làm mới': 'Refresh',
  'Mọi cơ sở': 'All facilities',
  'Mọi trạng thái': 'All statuses',
  'Mọi loại': 'All types',
  'Mọi vai trò': 'All roles',
  'Mọi vai trò nội bộ': 'All internal roles',
  'Mọi kênh': 'All channels',
  'Mọi nhóm': 'All categories',
  'Mọi module': 'All modules',
  'Từ': 'From',
  'Đến': 'To',
  'Từ ngày': 'From date',
  'Đến ngày': 'To date',
  'Không tải được dữ liệu': 'Failed to load data',
  'Chưa có dữ liệu': 'No data available',
  'Giải thích ngắn gọn lý do thực hiện (ghi vào nhật ký kiểm toán)': 'Briefly explain the reason for this action (recorded in the audit log)',

  // Customer Contract, Renewal, Move-out, Billing, Reservations
  'Truy cập': 'Access',
  'Gia hạn': 'Renew',
  'Bắt đầu': 'Start date',
  'Hết hạn': 'End date',
  'Còn lại': 'Remaining',
  'Tiền thuê': 'Rent',
  'Tiền cọc': 'Deposit',
  'Đặt cọc': 'Deposit',
  'Kỳ thanh toán': 'Billing cycle',
  'Tự động gia hạn': 'Auto-renew',
  'Chặn gia hạn': 'Renewal blocked',
  'Liên hệ khách': 'Customer contact',
  'Tiền thuê hiện tại': 'Current rent',
  'Hết hạn hiện tại': 'Current end date',
  'Cửa sổ gia hạn mở từ': 'Renewal window opens',
  'Chưa mở cửa sổ gia hạn': 'Renewal window not open yet',
  'Thanh toán': 'Pay',
  'Thanh toán ngay': 'Pay now',
  'Ký hợp đồng': 'Sign contract',
  'Trả hàng tháng': 'Monthly billing',
  'Trả trước cả kỳ': 'Prepaid full term',
  'Hàng tháng': 'Monthly',
  'Cả kỳ': 'Full term',

  // Admin & System Pages
  '24 giờ gần nhất': 'Last 24 hours',
  'Cần chú ý': 'Attention required',
  'Đăng nhập thành công': 'Successful logins',
  'Đăng nhập thất bại': 'Failed logins',
  'Tài khoản bị khóa': 'Locked accounts',
  'Tái sử dụng token (7 ngày)': 'Token reuse (7d)',
  'Đăng nhập theo giờ': 'Logins by hour',
  'Tài khoản theo vai trò': 'Users by role',
  'Đăng nhập từ quốc gia mới': 'Logins from new countries',
  'Quốc gia': 'Country',
  'Lúc': 'Time',
  'Nhân sự nội bộ và khách hàng': 'Internal staff and customers',
  'Mời nhân sự': 'Invite staff',
  'Mời tài khoản nội bộ': 'Invite internal user',
  'Người được mời nhận email để đặt mật khẩu hoặc liên kết Google.': 'The invitee will receive an email to set a password or link Google.',
  'Đã gửi lời mời': 'Invitation sent',
  'Tìm email, tên, SĐT': 'Search email, name, phone',
  'Đăng nhập cuối': 'Last login',
  'Mở khóa': 'Unlock',
  'Đã mở khóa': 'Unlocked',
  'Khóa': 'Lock',
  'Khóa tài khoản': 'Lock account',
  'Đã khóa': 'Locked',
  'Kích hoạt lại': 'Re-enable',
  'Đã kích hoạt': 'Enabled',
  'Vô hiệu hóa': 'Disable',
  'Vô hiệu hóa tài khoản': 'Disable account',
  'Mọi phiên đăng nhập sẽ bị thu hồi ngay.': 'All active login sessions will be revoked immediately.',
  'Đã vô hiệu hóa': 'Disabled',
  'Gửi email đặt lại mật khẩu': 'Send password reset email',
  'Đã gửi email': 'Email sent',
  'Thu hồi mọi phiên': 'Revoke all sessions',
  'Thu hồi phiên': 'Revoke sessions',
  'Người dùng sẽ bị đăng xuất khỏi mọi thiết bị.': 'The user will be signed out of all devices.',
  'Đã thu hồi': 'Sessions revoked',
  'Gán vai trò': 'Assign role',
  'Đã gán': 'Role assigned',
  'Không có vai trò nội bộ.': 'No internal roles assigned.',
  'Gỡ vai trò': 'Remove role',
  'Người dùng sẽ bị đăng xuất để áp dụng quyền mới.': 'The user will be signed out to apply new permissions.',
  'Đã gỡ': 'Removed',
  'Đăng nhập gần đây': 'Recent logins',
  'Ma trận quyền × phạm vi (OWN / FACILITY / GLOBAL). Quyền cố định theo đặc tả; thay đổi bằng việc gán vai trò cho tài khoản.':
    'Permission × scope matrix (OWN / FACILITY / GLOBAL). Permissions are fixed by specification; change access by assigning roles to accounts.',
  'Quyền': 'Permission',
  'Lịch sử đăng nhập và chặn IP': 'Login history and IP blocks',
  'Lịch sử đăng nhập': 'Login history',
  'IP bị chặn': 'Blocked IPs',
  'Lọc theo email': 'Filter by email',
  'Phương thức': 'Method',
  'Làm mới phiên': 'Session refresh',
  'Mã OTP': 'OTP code',
  'Sai mật khẩu': 'Wrong password',
  'Sai email hoặc mật khẩu': 'Invalid email or password',
  'Tài khoản đang bị khóa': 'Account locked',
  'Tài khoản bị vô hiệu': 'Account disabled',
  'Chưa xác minh email': 'Email not verified',
  'Vượt giới hạn thử': 'Rate limited',
  'Tài khoản chưa có mật khẩu': 'No password set',
  'Chặn IP': 'Block IP',
  'Chặn IP / CIDR': 'Block IP / CIDR',
  'IP hoặc CIDR': 'IP or CIDR',
  'Hết hạn (tùy chọn)': 'Expires at (optional)',
  'Đã chặn IP': 'IP blocked',
  'Đã chặn': 'Blocked',
  'Chưa chặn IP nào': 'No blocked IPs',
  'Gỡ chặn': 'Unblock',
  'Đã gỡ chặn': 'Unblocked',
  'Bất biến: ghi lại mọi thay đổi quan trọng. Bấm một dòng để xem chi tiết trước và sau.':
    'Immutable: records all sensitive changes. Click any row to inspect before and after values.',
  'Hành động (vd. user.lock)': 'Action (e.g. user.lock)',
  'Không có bản ghi phù hợp': 'No matching audit records',
  'Mở rộng khoảng ngày hoặc xóa bộ lọc hành động.': 'Widen the date range or clear the action filter.',
  'Người thực hiện': 'Actor',
  'Đối tượng': 'Entity',
  'Địa chỉ IP': 'IP address',
  'Mã yêu cầu': 'Request ID',
  'Thiết bị': 'Device / User-Agent',
  'Thay đổi': 'Changes',
  'Trường': 'Field',
  'Không có trường nào thay đổi.': 'No fields changed.',
  'Hành động này không kèm dữ liệu trước/sau.': 'This action has no before/after payload.',
  'Nghiệp vụ': 'Business',
  'Dữ liệu': 'Data',
  'Thương hiệu': 'Branding',
  'Tính năng': 'Feature flags',
  'Tích hợp': 'Integrations',
  'Trợ lý AI': 'AI Assistant',
  'Lưu trữ': 'Storage',
  'Chung': 'General',
  'Thay đổi có hiệu lực ngay và được ghi vào nhật ký kiểm toán': 'Changes take effect immediately and are recorded in the audit log',
  'Đã lưu cấu hình': 'Setting saved',
  'Cơ sở dữ liệu, hàng đợi sự kiện, email và các tác vụ nền': 'Database, event outbox, email queue, and background jobs',
  'Cơ sở dữ liệu': 'Database',
  'Outbox chờ / lỗi': 'Outbox pending / failed',
  'Email chờ / lỗi': 'Email pending / failed',
  'Giờ máy chủ': 'Server time',
  'Chưa có tác vụ nào chạy': 'No background jobs have run yet',
  'Tác vụ': 'Job',
  'Lần chạy cuối': 'Last run',
  '24 giờ': '24h runs',
  'Xử lý': 'Processed',
  'Nội dung email / in-app theo sự kiện. Dùng {{biến}} để chèn dữ liệu.': 'Event-driven email & in-app templates. Use {{variable}} placeholders.',
  'Trong ứng dụng': 'In-app',
  'Tìm sự kiện hoặc tiêu đề': 'Search event or subject',
  'Sự kiện': 'Event',
  'Đã lưu mẫu': 'Template saved',
  'Mẫu bắt buộc — không thể tắt.': 'Mandatory template — cannot be disabled.',

  // AI Assistant Widget
  'Trợ lý AI Vaultra': 'Vaultra AI Assistant',
  'Mở trợ lý AI': 'Open AI Assistant',
  'RAG AI · Dữ liệu kho & bảng giá trực tiếp': 'RAG AI · Live inventory & pricing',
  'Cuộc trò chuyện mới': 'New conversation',
  'Xóa & bắt đầu lại': 'Clear & start over',
  'Chuyển cho nhân viên hỗ trợ': 'Connect with support staff',
  'Email để nhân viên liên hệ': 'Your email for staff follow-up',
  'Nhập câu hỏi về kho, giá, chính sách…': 'Ask about units, pricing, policies…',
  'Powered by Vaultra RAG AI · Dữ liệu trực tiếp': 'Powered by Vaultra RAG AI · Live data',
  'Gặp nhân viên': 'Talk to staff',
  'Liên hệ với chúng tôi': 'Contact us',
  'Đặt ngay': 'Book now',
  'Xem cơ sở': 'View location',
  'Hết chỗ': 'Full',
  'Tiền thuê/tháng': 'Monthly rent',
  'Giảm giá': 'Discount',
  'Thanh toán lần đầu': 'First payment due',
  'Mở hợp đồng →': 'Open contract →',
  'Đặt kho cỡ này →': 'Book this size →',
  'Đi tới màn hình thao tác': 'Go to action screen',
  'Bản nháp yêu cầu hỗ trợ — chưa gửi': 'Support ticket draft — not submitted yet',
  'Bảng giá các loại kho tự quản hiện tại?': 'What are the current self-storage unit prices?',
  'Cơ sở Vaultra ở đâu và giờ mở cửa?': 'Where are Vaultra locations and what are the opening hours?',
  'Kho nào hợp với đồ căn hộ 1 phòng ngủ?': 'Which unit size fits a 1-bedroom apartment?',
  'Chính sách đặt cọc, hủy và hoàn tiền?': 'What is the deposit, cancellation, and refund policy?',
  'Hợp đồng của tôi hết hạn khi nào?': 'When does my contract expire?',
  'Tôi đang nợ hóa đơn nào?': 'Do I have any unpaid invoices?',
  'Tôi quên mã PIN ra vào kho thì làm gì?': 'What should I do if I forgot my access PIN?',
  'Thủ tục trả kho và hoàn cọc thế nào?': 'How does move-out and deposit refund work?',

  // Seeded DB Unit Types
  'Tủ khóa 1m²': '1m² Locker',
  'Kho nhỏ 2m²': '2m² Small Unit',
  'Kho nhỏ 3m²': '3m² Small Unit',
  'Kho vừa 4m²': '4m² Medium Unit',
  'Kho vừa 6m²': '6m² Medium Unit',
  'Kho lớn 9m²': '9m² Large Unit',
  'Kho lớn 12m²': '12m² Large Unit',
  'Kho rất lớn 16m²': '16m² Extra-Large Unit',
  'Kho rất lớn 20m²': '20m² Extra-Large Unit',
  'Tủ khóa cá nhân 1m²': '1m² Personal Locker',

  // Additional UI labels, Weekdays, Charts, & Diacritic-free Vietnamese words
  'Thứ 2': 'Monday',
  'Thứ 3': 'Tuesday',
  'Thứ 4': 'Wednesday',
  'Thứ 5': 'Thursday',
  'Thứ 6': 'Friday',
  'Thứ 7': 'Saturday',
  'Chủ nhật': 'Sunday',
  'Đóng cửa': 'Closed',
  'Mở cửa': 'Open',
  'đến': 'to',
  'Áp dụng giờ đầu tiên cho cả tuần': 'Apply first day hours to entire week',
  'Thêm ảnh': 'Add photo',
  'Xóa ảnh': 'Remove photo',
  'Chỉ nhận ảnh': 'Images only',
  'Ảnh tối đa 10MB': 'Max photo size is 10MB',
  'Vùng ký tên': 'Signature area',
  'Dùng chuột hoặc ngón tay để ký': 'Use your mouse or finger to sign',
  'Xóa chữ ký': 'Clear signature',
  'Xem cơ sở →': 'View location →',
  'Bản đồ cơ sở': 'Facility map',
  'Kéo để chỉnh vị trí': 'Drag to adjust position',
  'Vị trí của tôi': 'My location',
  'Dùng vị trí của tôi': 'Use my location',
  'Tìm địa chỉ': 'Search address',
  'Chưa được phân công cơ sở': 'No facility assigned yet',
  'Liên hệ quản trị để được gán vào một cơ sở.': 'Contact an administrator to be assigned to a facility.',
  'Giao và theo dõi việc của đội': 'Assign and track team tasks',
  'Chạm vào ô để xem chi tiết': 'Click a unit cell to view details',
  'Xem': 'View',
  'Xong': 'Done',
  'Đã xong': 'Completed',
  'Giao': 'Assign',
  'Khác': 'Other',
  'Khách': 'Customer',
  'Loại': 'Type',
  'Mã': 'Code',
  'Tên': 'Name',
  'Ngày': 'Date',
  'Thứ': 'Day',
  'Hạn': 'Due',
  'Cổng': 'Gateway',
  'Trần': 'Cap',
  'Cách': 'Method',
  'Cao': 'High',
  'Thấp': 'Low',
  'Trung bình': 'Medium',
  'Khẩn': 'Urgent',
  'Doanh thu': 'Revenue',
  'Lấp đầy': 'Occupancy',
  'Dư nợ': 'Outstanding balance',
  'Chi phí': 'Cost',
  'Biên nhận': 'Receipt',
  'Kiểm kê': 'Inventory check',
  'Thanh lý': 'Liquidation',
  'Tiêu hủy': 'Disposal',
  'Trả lại khách': 'Returned to customer',
  'Tài sản tồn đọng': 'Abandoned items',
  'Đang mở': 'Open',
  'Đang thuê': 'Active',
  'Chưa thanh toán': 'Unpaid',
  'Quá hạn': 'Overdue',
  'Đến hạn': 'Due date',
  'Đến hạn kế tiếp': 'Next due date',
  'Có máy lạnh': 'Climate-controlled',
  'Không máy lạnh': 'Standard (non-climate)',
  'Điều hòa 18–25°C': 'Climate 18–25°C',
  'Kho tiêu chuẩn': 'Standard unit',
  'Tất cả loại kho': 'All unit types',
  'Danh sách': 'List',
  'Trao đổi': 'Messages',
  'Nhận xét': 'Comments',
  'Thông tin': 'Information',
  'Tiện ích': 'Amenities',
  'Vị trí': 'Location',
  'Sức chứa': 'Capacity',
  'Khung giá': 'Rate cards',
  'Đổi giá': 'Price change',
  'Đề xuất đổi giá': 'Propose price change',
  'Giá niêm yết': 'Base price',
  'Giá online': 'Online price',
  'Giá cũ': 'Old price',
  'Giá đề xuất': 'Proposed price',
  'Chạy đối soát': 'Run reconciliation',
  'Chi tiết đối soát': 'Reconciliation details',
  'Xuất bản': 'Publish',
  'Tạm dừng': 'Pause',
  'Tạm đóng': 'Temporarily closed',
  'ĐANG ĐÓNG GÓI': 'PACKING',
  'MỞ HỘP': 'OPENING',
  'BỎ QUA ↵': 'SKIP ↵',
  'Mạng chậm — nội dung vẫn tải tiếp': 'Slow connection — content is still loading',
  '❓ Hỏi đáp thường gặp (FAQ)': '❓ Frequently Asked Questions (FAQ)',
  '⚠️ Nội quy & Hàng cấm': '⚠️ Facility Rules & Prohibited Items',
  '🏢 Cơ sở & Giới thiệu Website': '🏢 Facilities & Website Info',
  '📋 Chính sách thuê kho': '📋 Rental Policies',
  '📦 Bảng giá & Kích thước kho': '📦 Pricing & Unit Sizes',
  '🛠️ Quy trình vận hành (SOP)': '🛠️ Standard Operating Procedures (SOP)',
};

/* ───────────── Regex Pattern Translators for Dynamic Strings ───────────── */
const PATTERN_RULES: Array<[RegExp, (...m: string[]) => string]> = [
  [/^Hợp đồng\s+(CT-[\w-]+)$/i, (_, id) => `Contract ${id}`],
  [/^Hóa đơn\s+(INV-[\w-]+)$/i, (_, id) => `Invoice ${id}`],
  [/^Đặt chỗ\s+(RSV-[\w-]+)$/i, (_, id) => `Reservation ${id}`],
  [/^Phiếu giữ chỗ\s+(RSV-[\w-]+)$/i, (_, id) => `Reservation ${id}`],
  [/^Yêu cầu\s+(TK-[\w-]+)$/i, (_, id) => `Ticket ${id}`],
  [/^Kho\s+([A-Z0-9-]+)$/i, (_, code) => `Unit ${code}`],
  [/^Tủ khóa\s+(\d+(?:[.,]\d+)?\s*m²)$/i, (_, sz) => `Locker ${sz}`],
  [/^Kho nhỏ\s+(\d+(?:[.,]\d+)?\s*m²)$/i, (_, sz) => `Small Unit ${sz}`],
  [/^Kho vừa\s+(\d+(?:[.,]\d+)?\s*m²)$/i, (_, sz) => `Medium Unit ${sz}`],
  [/^Kho lớn\s+(\d+(?:[.,]\d+)?\s*m²)$/i, (_, sz) => `Large Unit ${sz}`],
  [/^Kho rất lớn\s+(\d+(?:[.,]\d+)?\s*m²)$/i, (_, sz) => `Extra-Large Unit ${sz}`],
  [/^Tầng\s+(\d+)$/i, (_, n) => `Floor ${n}`],
  [/^Khu\s+([A-Z0-9]+)$/i, (_, z) => `Zone ${z}`],
  [/^Còn\s+(\d+)\s+ngày$/i, (_, d) => `${d} days left`],
  [/^(\d+)\s+ngày$/i, (_, d) => `${d} days`],
  [/^(\d+)\s+tháng$/i, (_, m) => `${m} months`],
  [/^\+(\d+)\s+tháng$/i, (_, m) => `+${m} months`],
  [/^Gia hạn\s+\+(\d+)\s+tháng$/i, (_, m) => `Renew +${m} months`],
  [/^Kỳ hạn\s+(\d+)\s+tháng$/i, (_, m) => `${m}-month term`],
  [/^Trả trước cả kỳ\s*\((\d+)\s*tháng\)$/i, (_, m) => `Prepaid full term (${m} months)`],
  [/^Trả trước\s+(\d+)\s+tháng$/i, (_, m) => `Prepaid ${m} months`],
  [/^Hàng tháng\s*\(ngày\s*(\d+)\)$/i, (_, d) => `Monthly (day ${d})`],
  [/^Thu vào ngày\s+(\d+)\s+hàng tháng$/i, (_, d) => `Billed on day ${d} of each month`],
  [/^Bạn có thể gia hạn từ\s+(.+)\.$/i, (_, dt) => `You can renew starting from ${dt}.`],
  [/^Chờ đến hạn\s*·\s*mở tự động\s*(.+)$/i, (_, dt) => `Pending due date · opens automatically on ${dt}`],
  [/^Đã chụp\s+(\d+)\/(\d+)\s+ảnh tối thiểu$/i, (_, a, b) => `Captured ${a}/${b} minimum photos`],
  [/^Tải ảnh kiểm tra\s*\(tối thiểu\s*(\d+),\s*đã có\s*(\d+)\)$/i, (_, a, b) => `Upload inspection photos (min ${a}, uploaded ${b})`],
  [/^Đính kèm\s*\((\d+)\/(\d+)\)$/i, (_, a, b) => `Attachments (${a}/${b})`],
  [/^Phiên đang hoạt động\s*\((\d+)\)$/i, (_, n) => `Active sessions (${n})`],
  [/^Biến đang dùng\s*\((\d+)\)$/i, (_, n) => `Variables in use (${n})`],
  [/^Xóa bộ lọc\s*\((\d+)\)$/i, (_, n) => `Clear filters (${n})`],
  [/^Trang\s+(\d+)$/i, (_, n) => `Page ${n}`],
  [/^(\d+)\s+kết quả$/i, (_, n) => `${n} results`],
  [/^(\d+)\s+kho trống$/i, (_, n) => `${n} available units`],
  [/^Còn\s+(\d+)\s+kho(?:\s+trống)?$/i, (_, n) => `${n} units available`],
  [/^Tổng\s+(\d+)\s+kho$/i, (_, n) => `Total ${n} units`],
  [/^(\d+)\s+kho$/i, (_, n) => `${n} units`],
  [/^(\d+)\s+mục$/i, (_, n) => `${n} items`],
  [/^(\d+)\s+lần$/i, (_, n) => `${n} runs`],
  [/^·\s*(\d+)\s+lỗi$/i, (_, n) => `· ${n} errors`],
  [/^(\d+)\s+tác vụ\s*·\s*thống kê 24 giờ qua$/i, (_, n) => `${n} jobs · last 24h stats`],
  [/^từ\s+([\d.,]+\s*₫)\/tháng$/i, (_, p) => `from ${p}/mo`],
  [/^([\d.,]+\s*₫)\s*\/\s*tháng$/i, (_, p) => `${p} / month`],
  [/^\/tháng$/i, () => `/month`],
  [/^Giảm\s+(\d+(?:[.,]\d+)?)%$/i, (_, p) => `Save ${p}%`],
  [/^Tiết kiệm\s+([\d.,]+\s*₫)$/i, (_, p) => `Save ${p}`],
  [/^Quá hạn\s+(\d+)\s+ngày$/i, (_, d) => `${d} days overdue`],
  [/^Trễ\s+(\d+)\s+ngày$/i, (_, d) => `${d} days late`],
  [/^Dọn sạch trước\s+(.+)$/i, (_, dt) => `Vacate before ${dt}`],
  [/^Chặn\s+([\d.:/a-fA-F]+)$/i, (_, ip) => `Block ${ip}`],
  [/^Chính sách\s+v(\d+)$/i, (_, v) => `Policy v${v}`],
];

const VI_CHAR_RE = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;

function translateSegmentSync(raw: string): string {
  const s = raw.trim();
  if (!s) return raw;
  const exact = EN_MAP[s];
  if (exact) return raw.replace(s, exact);
  for (const [re, fn] of PATTERN_RULES) {
    const m = s.match(re);
    if (m) return raw.replace(s, fn(...m));
  }
  return raw;
}

export function translateSync(text: string): string {
  if (!text) return text;
  const trimmed = text.trim();
  if (!trimmed) return text;
  if (EN_MAP[trimmed]) return text.replace(trimmed, EN_MAP[trimmed]);

  if (trimmed.includes(' · ')) {
    const parts = trimmed.split(' · ');
    const translatedParts = parts.map((p) => translateSegmentSync(p));
    const joined = translatedParts.join(' · ');
    if (joined !== trimmed) return text.replace(trimmed, joined);
  }

  return translateSegmentSync(text);
}

export function tr(viText: string): string {
  if (useI18n.getState().locale === 'en') {
    const sync = translateSync(viText);
    if (sync !== viText) return sync;
    return API_CACHE.get(viText.trim()) ?? viText;
  }
  return viText;
}

/* ───────────── Persistent API Translation Cache & Batch Queue ───────────── */
const API_CACHE = new Map<string, string>();

try {
  const raw = localStorage.getItem(CACHE_KEY);
  if (raw) {
    const parsed = JSON.parse(raw) as Record<string, string>;
    for (const [k, v] of Object.entries(parsed)) {
      if (k && v) API_CACHE.set(k, v);
    }
  }
} catch {
  /* ignore */
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function persistCache() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      const obj: Record<string, string> = {};
      const entries = Array.from(API_CACHE.entries()).slice(-2500);
      for (const [k, v] of entries) obj[k] = v;
      localStorage.setItem(CACHE_KEY, JSON.stringify(obj));
    } catch {
      /* ignore */
    }
  }, 500);
}

const PENDING_CALLBACKS = new Map<string, Set<(en: string) => void>>();
let batchTimer: ReturnType<typeof setTimeout> | null = null;

async function fetchGoogleTranslateBatchDirect(texts: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (!texts.length) return out;
  try {
    const formBody = texts.map((t) => `q=${encodeURIComponent(t)}`).join('&');
    const r = await fetch('https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=vi&tl=en', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
      body: formBody,
    });
    if (!r.ok) return out;
    const data = await r.json();
    if (Array.isArray(data)) {
      texts.forEach((src, idx) => {
        const item = data[idx];
        const translated = typeof item === 'string' ? item : Array.isArray(item) && typeof item[0] === 'string' ? item[0] : '';
        if (translated.trim()) out[src] = translated.trim();
      });
    }
  } catch {
    /* ignore */
  }
  return out;
}

async function flushTranslationQueue() {
  batchTimer = null;
  const keys = Array.from(PENDING_CALLBACKS.keys());
  if (keys.length === 0) return;

  const batch = keys.slice(0, 60);
  const resolved = new Map<string, string>();

  // 1) Primary: Backend batch translation API POST /v1/assistant/translate
  try {
    const res = await post<{ translations?: Record<string, string> }>('/assistant/translate', {
      texts: batch,
      source: 'vi',
      target: 'en',
    });
    const map = res?.translations ?? {};
    for (const [k, v] of Object.entries(map)) {
      if (v) resolved.set(k, v);
    }
  } catch {
    /* ignore */
  }

  // 2) Fallback: Direct client-side batch translation for any remaining strings
  const missing = batch.filter((txt) => !resolved.has(txt));
  if (missing.length > 0) {
    const directMap = await fetchGoogleTranslateBatchDirect(missing);
    for (const [k, v] of Object.entries(directMap)) {
      if (v) resolved.set(k, v);
    }
  }

  for (const txt of batch) {
    const cbs = PENDING_CALLBACKS.get(txt);
    PENDING_CALLBACKS.delete(txt);
    const en = resolved.get(txt);
    if (en) {
      API_CACHE.set(txt, en);
      cbs?.forEach((cb) => cb(en));
    }
  }
  if (resolved.size > 0) persistCache();

  if (PENDING_CALLBACKS.size > 0) {
    batchTimer = setTimeout(flushTranslationQueue, 40);
  }
}

function queueApiTranslation(viText: string, onResolved: (en: string) => void) {
  const key = viText.trim();
  if (!key) return;
  const cached = API_CACHE.get(key);
  if (cached) {
    onResolved(cached);
    return;
  }
  let set = PENDING_CALLBACKS.get(key);
  if (!set) {
    set = new Set();
    PENDING_CALLBACKS.set(key, set);
  }
  set.add(onResolved);
  if (!batchTimer) {
    batchTimer = setTimeout(flushTranslationQueue, 35);
  }
}

/* ───────────── Automatic DOM Translator (Text Nodes & Attributes) ───────────── */
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE', 'SVG', 'PATH', 'TEXTAREA']);
const ATTRS = ['placeholder', 'title', 'aria-label'] as const;

interface NodeMeta {
  vi: string;
  lastApplied: string;
}

const TEXT_META = new WeakMap<Text, NodeMeta>();
const ATTR_META = new WeakMap<Element, Record<string, NodeMeta>>();

const VI_WORD_RE = /\b(an ninh|tai khoan|khach hang|nhan vien|quan ly|van hanh|co so|hop dong|hoa don|thanh toan|giu cho|tra kho|nhan kho|gia han|bao tri|ho tro|thong bao|cai dat|cau hinh|kiem toan|suc khoe|bao cao|cong viec|lich hen|so do|danh muc|chinh sach|khuyen mai|doi soat|cong no|phe duyet|xong|giao|xem)\b/i;

function shouldTranslateString(s: string): boolean {
  const t = s.trim();
  if (t.length < 2) return false;
  if (/^[\d.,\s₫%+-/:·—–()]+$/.test(t)) return false;
  if (/^(CT|INV|RSV|TK|USR|FAC)-[A-Z0-9-]+$/i.test(t)) return false;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) return false;
  return VI_CHAR_RE.test(t) || t in EN_MAP || VI_WORD_RE.test(t);
}

function processTextNode(node: Text, locale: Locale) {
  const parent = node.parentElement;
  if (!parent) return;
  if (SKIP_TAGS.has(parent.tagName) || parent.closest('[data-no-translate], .code')) return;

  const currentVal = node.nodeValue ?? '';
  let meta = TEXT_META.get(node);

  if (!meta || (currentVal !== meta.lastApplied && currentVal !== meta.vi)) {
    if (locale === 'en' && !shouldTranslateString(currentVal) && meta) {
      // keep existing meta if React re-applied an already-English string
    } else {
      meta = { vi: currentVal, lastApplied: currentVal };
      TEXT_META.set(node, meta);
    }
  }

  if (locale === 'vi') {
    if (meta && node.nodeValue !== meta.vi) {
      meta.lastApplied = meta.vi;
      node.nodeValue = meta.vi;
    }
    return;
  }

  const sourceVi = meta.vi;
  if (!shouldTranslateString(sourceVi)) return;

  const syncEn = translateSync(sourceVi);
  if (syncEn !== sourceVi && !VI_CHAR_RE.test(syncEn)) {
    if (node.nodeValue !== syncEn) {
      meta.lastApplied = syncEn;
      node.nodeValue = syncEn;
    }
    return;
  }

  const trimmedVi = sourceVi.trim();
  const cachedEn = API_CACHE.get(trimmedVi);
  if (cachedEn) {
    const applied = sourceVi.replace(trimmedVi, cachedEn);
    if (node.nodeValue !== applied) {
      meta.lastApplied = applied;
      node.nodeValue = applied;
    }
    return;
  }

  if (syncEn !== sourceVi && node.nodeValue !== syncEn) {
    meta.lastApplied = syncEn;
    node.nodeValue = syncEn;
  }

  queueApiTranslation(trimmedVi, (apiEn) => {
    if (getLocale() !== 'en') return;
    const m = TEXT_META.get(node);
    if (!m || m.vi.trim() !== trimmedVi) return;
    const finalEn = m.vi.replace(trimmedVi, apiEn);
    m.lastApplied = finalEn;
    node.nodeValue = finalEn;
  });
}

function processElementAttrs(el: Element, locale: Locale) {
  let map = ATTR_META.get(el);
  for (const attr of ATTRS) {
    const val = el.getAttribute(attr);
    if (!val) continue;
    if (!map) {
      map = {};
      ATTR_META.set(el, map);
    }
    let meta = map[attr];
    if (!meta || (val !== meta.lastApplied && val !== meta.vi)) {
      meta = { vi: val, lastApplied: val };
      map[attr] = meta;
    }

    if (locale === 'vi') {
      if (val !== meta.vi) {
        meta.lastApplied = meta.vi;
        el.setAttribute(attr, meta.vi);
      }
      continue;
    }

    const sourceVi = meta.vi;
    if (!shouldTranslateString(sourceVi)) continue;

    const syncEn = translateSync(sourceVi);
    if (syncEn !== sourceVi && !VI_CHAR_RE.test(syncEn)) {
      if (val !== syncEn) {
        meta.lastApplied = syncEn;
        el.setAttribute(attr, syncEn);
      }
      continue;
    }

    const trimmedVi = sourceVi.trim();
    const cachedEn = API_CACHE.get(trimmedVi);
    if (cachedEn) {
      const applied = sourceVi.replace(trimmedVi, cachedEn);
      if (val !== applied) {
        meta.lastApplied = applied;
        el.setAttribute(attr, applied);
      }
      continue;
    }

    queueApiTranslation(trimmedVi, (apiEn) => {
      if (getLocale() !== 'en') return;
      const m = ATTR_META.get(el)?.[attr];
      if (!m || m.vi.trim() !== trimmedVi) return;
      const finalEn = m.vi.replace(trimmedVi, apiEn);
      m.lastApplied = finalEn;
      el.setAttribute(attr, finalEn);
    });
  }
}

function scanSubtree(root: Node, locale: Locale) {
  if (root.nodeType === Node.TEXT_NODE) {
    processTextNode(root as Text, locale);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;

  if (root.nodeType === Node.ELEMENT_NODE) {
    processElementAttrs(root as Element, locale);
  }

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let n: Node | null = walker.currentNode;
  while (n) {
    if (n.nodeType === Node.TEXT_NODE) {
      processTextNode(n as Text, locale);
    } else if (n.nodeType === Node.ELEMENT_NODE) {
      processElementAttrs(n as Element, locale);
    }
    n = walker.nextNode();
  }
}

/** Global DOM Auto-Translator component mounted once in App.tsx. */
export function DomTranslator() {
  const locale = useI18n((s) => s.locale);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = locale;
    scanSubtree(document.body, locale);

    const observer = new MutationObserver((mutations) => {
      const curLocale = getLocale();
      for (const m of mutations) {
        if (m.type === 'characterData' && m.target.nodeType === Node.TEXT_NODE) {
          processTextNode(m.target as Text, curLocale);
        } else if (m.type === 'childList') {
          m.addedNodes.forEach((added) => scanSubtree(added, curLocale));
        } else if (m.type === 'attributes' && m.target.nodeType === Node.ELEMENT_NODE) {
          processElementAttrs(m.target as Element, curLocale);
        }
      }
    });

    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['placeholder', 'title', 'aria-label'],
    });

    return () => observer.disconnect();
  }, [locale]);

  return null;
}
