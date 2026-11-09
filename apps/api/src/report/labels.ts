/** Vietnamese names for the codes that appear as text in report tables, so a table, its CSV/Excel file and its PDF all read the same. */
export const LABELS = {
  contract: { PENDING_SIGNATURE: 'Chờ ký', SIGNED: 'Đã ký', ACTIVE: 'Đang thuê', MOVE_OUT_SCHEDULED: 'Đã báo trả kho', EXPIRED: 'Hết hạn', TERMINATED: 'Đã chấm dứt', ENDED: 'Đã kết thúc', CLOSED: 'Đã đóng', CANCELLED: 'Đã hủy' },
  delinquency: { CURRENT: 'Đúng hạn', GRACE: 'Ân hạn', LATE: 'Trễ hạn', LOCKED_OUT: 'Khóa truy cập', FINAL_NOTICE: 'Thông báo cuối', DEFAULT_PENDING: 'Chờ xử lý vi phạm', DEFAULTED: 'Vi phạm' },
  offer: { OPEN: 'Đang mở', ACCEPTED: 'Khách đã chấp nhận', LAPSED: 'Hết hạn', WITHDRAWN: 'Đã rút' },
  reservation: { PENDING_PAYMENT: 'Chờ thanh toán', CONFIRMED: 'Đã xác nhận', UNIT_ASSIGNED: 'Đã gán kho', MOVE_IN_SCHEDULED: 'Đã hẹn nhận kho', CHECKED_IN: 'Đã nhận kho', CANCELLED: 'Đã hủy', EXPIRED: 'Hết hạn giữ chỗ', NO_SHOW: 'Khách không đến' },
  category: { ACCESS_CODE: 'Mã truy cập', LOCK_KEY: 'Khóa / chìa', UNIT_DAMAGE: 'Hư hại kho', STORED_ITEMS: 'Đồ trong kho', PAYMENT: 'Thanh toán', CONTRACT: 'Hợp đồng', OTHER: 'Khác' },
  priority: { LOW: 'Thấp', MEDIUM: 'Trung bình', HIGH: 'Cao', URGENT: 'Khẩn' },
  promotion: { DRAFT: 'Nháp', ACTIVE: 'Đang chạy', PAUSED: 'Tạm dừng', ENDED: 'Đã kết thúc' },
  recon: { MATCHED: 'Khớp', MISMATCH: 'Có chênh lệch', UNRECONCILED: 'Chưa đối soát', COMPLETED: 'Hoàn tất', RUNNING: 'Đang chạy', PENDING: 'Chờ xử lý', FAILED: 'Lỗi' },
  provider: { VNPAY: 'VNPay (thanh toán online)', CASH: 'Tiền mặt / chuyển khoản tại quầy' },
  fee: { RENT: 'Tiền thuê', DEPOSIT: 'Tiền cọc', FEE: 'Phí khác', DISCOUNT: 'Giảm giá', PRORATION: 'Tính theo ngày', DAMAGE: 'Bồi thường hư hại', ADJUSTMENT: 'Điều chỉnh', ADMIN_FEE: 'Phí hành chính', ACCESS_CARD_FEE: 'Phí cấp thẻ ra vào', CARD_REPLACEMENT_FEE: 'Phí cấp lại thẻ', LOCK_REPLACEMENT_FEE: 'Phí thay khóa', CLEANING_FEE: 'Phí vệ sinh', LATE_FEE: 'Phí trễ hạn', OVERLOCK_FEE: 'Phí khóa chặn', RENEWAL_FEE: 'Phí gia hạn', EARLY_TERMINATION_FEE: 'Phí chấm dứt sớm' },
  facility: { DRAFT: 'Nháp', ACTIVE: 'Hoạt động', TEMPORARILY_CLOSED: 'Tạm đóng', INACTIVE: 'Ngưng hoạt động' },
  unit: { AVAILABLE: 'Trống', RESERVED: 'Đã giữ', OCCUPIED: 'Đang thuê', OVERLOCKED: 'Khóa chặn', PENDING_INSPECTION: 'Chờ kiểm tra', MAINTENANCE: 'Bảo trì', OUT_OF_SERVICE: 'Ngưng dùng', RETIRED: 'Đã loại' },
} as const;

export type LabelKind = keyof typeof LABELS;

/** The Vietnamese name of a code, or the code itself when it is one we have no name for. */
export const label = (kind: LabelKind, code: string | null | undefined): string => (code ? ((LABELS[kind] as Record<string, string>)[code] ?? code) : '');
