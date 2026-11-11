import { METRIC_DOCS } from './metric-docs';
/** State machines (spec §7.1). transition() in the API validates against these tables. */
type Machine = Record<string, readonly string[]>;

export const UNIT_TRANSITIONS: Machine = {
  AVAILABLE: ['RESERVED', 'MAINTENANCE', 'OUT_OF_SERVICE'],
  RESERVED: ['OCCUPIED', 'AVAILABLE', 'MAINTENANCE'],
  OCCUPIED: ['OVERLOCKED', 'PENDING_INSPECTION'],
  OVERLOCKED: ['OCCUPIED', 'PENDING_INSPECTION'],
  PENDING_INSPECTION: ['AVAILABLE', 'MAINTENANCE'],
  MAINTENANCE: ['AVAILABLE', 'OUT_OF_SERVICE'],
  OUT_OF_SERVICE: ['AVAILABLE', 'RETIRED'],
  RETIRED: [],
};
/** Transitions a human may trigger manually from the unit screens (others are system-driven). */
export const UNIT_MANUAL_TRANSITIONS: Machine = {
  AVAILABLE: ['MAINTENANCE', 'OUT_OF_SERVICE'],
  PENDING_INSPECTION: ['AVAILABLE', 'MAINTENANCE'],
  MAINTENANCE: ['AVAILABLE', 'OUT_OF_SERVICE'],
  OUT_OF_SERVICE: ['AVAILABLE', 'RETIRED'],
};

export const RESERVATION_TRANSITIONS: Machine = {
  PENDING_PAYMENT: ['CONFIRMED', 'EXPIRED', 'CANCELLED'],
  CONFIRMED: ['UNIT_ASSIGNED', 'MOVE_IN_SCHEDULED', 'CHECKED_IN', 'CANCELLED', 'NO_SHOW'], // CHECKED_IN: counter check-in assigns the unit and hands over in one visit
  UNIT_ASSIGNED: ['MOVE_IN_SCHEDULED', 'CANCELLED', 'NO_SHOW', 'CHECKED_IN'],
  MOVE_IN_SCHEDULED: ['CHECKED_IN', 'CANCELLED', 'NO_SHOW', 'UNIT_ASSIGNED', 'CONFIRMED'],
  EXPIRED: ['CONFIRMED'],
  CHECKED_IN: [],
  CANCELLED: [],
  NO_SHOW: [],
};

export const CONTRACT_TRANSITIONS: Machine = {
  PENDING_SIGNATURE: ['SIGNED', 'CANCELLED'],
  SIGNED: ['ACTIVE', 'CANCELLED'],
  ACTIVE: ['MOVE_OUT_SCHEDULED', 'EXPIRED', 'TERMINATED'],
  MOVE_OUT_SCHEDULED: ['ENDED', 'ACTIVE', 'TERMINATED'],
  EXPIRED: ['MOVE_OUT_SCHEDULED', 'TERMINATED', 'ACTIVE'],
  ENDED: ['CLOSED'],
  TERMINATED: ['CLOSED'],
  CLOSED: [],
  CANCELLED: [],
};

export const DELINQUENCY_STAGES = ['CURRENT', 'GRACE', 'LATE', 'LOCKED_OUT', 'FINAL_NOTICE', 'DEFAULT_PENDING', 'DEFAULTED'] as const;
export type DelinquencyStage = (typeof DELINQUENCY_STAGES)[number];

export const INVOICE_TRANSITIONS: Machine = {
  DRAFT: ['ISSUED'],
  ISSUED: ['PARTIALLY_PAID', 'PAID', 'VOID', 'WRITTEN_OFF'],
  PARTIALLY_PAID: ['PAID', 'WRITTEN_OFF'],
  PAID: ['REFUNDED', 'PARTIALLY_REFUNDED'],
  PARTIALLY_REFUNDED: ['REFUNDED'],
  VOID: [],
  WRITTEN_OFF: [],
  REFUNDED: [],
};

export const TICKET_TRANSITIONS: Machine = {
  NEW: ['ASSIGNED', 'IN_PROGRESS', 'CANCELLED'],
  ASSIGNED: ['IN_PROGRESS', 'ASSIGNED', 'CANCELLED', 'NEW'],
  IN_PROGRESS: ['WAITING_CUSTOMER', 'RESOLVED', 'CANCELLED', 'ASSIGNED'],
  WAITING_CUSTOMER: ['IN_PROGRESS', 'RESOLVED', 'CANCELLED'],
  RESOLVED: ['CLOSED', 'REOPENED'],
  REOPENED: ['IN_PROGRESS', 'ASSIGNED', 'CANCELLED'],
  CLOSED: [],
  CANCELLED: [],
};

export const TASK_TRANSITIONS: Machine = {
  OPEN: ['ASSIGNED', 'CANCELLED', 'IN_PROGRESS'],
  ASSIGNED: ['IN_PROGRESS', 'ASSIGNED', 'OPEN', 'CANCELLED'],
  IN_PROGRESS: ['DONE', 'BLOCKED', 'CANCELLED'],
  BLOCKED: ['IN_PROGRESS', 'CANCELLED'],
  DONE: [],
  CANCELLED: [],
};

export const WORK_ORDER_TRANSITIONS: Machine = {
  REPORTED: ['APPROVED', 'CANCELLED'],
  APPROVED: ['SCHEDULED', 'IN_PROGRESS', 'CANCELLED'],
  SCHEDULED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: ['VERIFIED', 'IN_PROGRESS'],
  VERIFIED: [],
  CANCELLED: [],
};

export const REFUND_TRANSITIONS: Machine = {
  PENDING_APPROVAL: ['APPROVED', 'REJECTED'],
  APPROVED: ['PROCESSING'],
  PROCESSING: ['SUCCEEDED', 'FAILED'],
  FAILED: ['PROCESSING', 'MANUAL_REQUIRED'],
  MANUAL_REQUIRED: ['SUCCEEDED'],
  SUCCEEDED: [],
  REJECTED: [],
};

export function canTransition(machine: Machine, from: string, to: string): boolean {
  return (machine[from] ?? []).includes(to);
}

export const UNIT_STATUS_LABEL: Record<string, string> = {
  AVAILABLE: 'Trống',
  RESERVED: 'Đã giữ',
  OCCUPIED: 'Đang thuê',
  OVERLOCKED: 'Khóa chặn',
  PENDING_INSPECTION: 'Chờ kiểm tra',
  MAINTENANCE: 'Bảo trì',
  OUT_OF_SERVICE: 'Ngừng sử dụng',
  RETIRED: 'Đã loại bỏ',
};

export const TICKET_CATEGORIES = ['ACCESS_CODE', 'LOCK_KEY', 'UNIT_DAMAGE', 'STORED_ITEMS', 'PAYMENT', 'CONTRACT', 'OTHER'] as const;

/** Default SLA (spec §6.7) in minutes. */
export const DEFAULT_SLA: Record<string, { priority: string; first: number; resolve: number }> = {
  ACCESS_CODE: { priority: 'HIGH', first: 30, resolve: 240 },
  LOCK_KEY: { priority: 'HIGH', first: 30, resolve: 480 },
  UNIT_DAMAGE: { priority: 'HIGH', first: 60, resolve: 1440 },
  STORED_ITEMS: { priority: 'HIGH', first: 60, resolve: 4320 },
  PAYMENT: { priority: 'MEDIUM', first: 240, resolve: 4320 },
  CONTRACT: { priority: 'LOW', first: 480, resolve: 7200 },
  OTHER: { priority: 'LOW', first: 480, resolve: 7200 },
};

export const INSPECTION_ITEMS = ['DOOR', 'LOCK_HASP', 'WALLS', 'FLOOR', 'CEILING', 'LEAK', 'LIGHT', 'CLEANLINESS', 'AC'] as const;
export const INSPECTION_ITEM_LABEL: Record<string, string> = {
  DOOR: 'Cửa cuốn / cửa mở',
  LOCK_HASP: 'Chốt khóa',
  WALLS: 'Tường',
  FLOOR: 'Sàn',
  CEILING: 'Trần',
  LEAK: 'Thấm nước',
  LIGHT: 'Đèn',
  CLEANLINESS: 'Vệ sinh',
  AC: 'Máy lạnh / điều hòa',
};

export const FEE_TYPE_CODES = [
  'ADMIN_FEE',
  'LATE_FEE',
  'OVERLOCK_FEE',
  'RENEWAL_FEE',
  'KEY_REPLACEMENT',
  'CARD_REPLACEMENT',
  'LOCK_SALE',
  'CLEANING_FEE',
  'DAMAGE_FEE',
  'EARLY_TERMINATION_FEE',
  'ABANDONED_GOODS_REMOVAL',
  'OTHER_SERVICE',
] as const;

/** Vietnamese labels and hover explanations for the report summary tiles (screen + exports). Money/percent kinds drive formatting. */
export const REPORT_SUMMARY: Record<string, { label: string; kind: 'pct' | 'money' | 'int' | 'group'; help?: string }> = {
  byStatus: { label: 'Số kho theo trạng thái (hiện tại)', kind: 'group', help: METRIC_DOCS['occ.byStatus'] },
  byFeeType: { label: 'Phát hành theo loại phí', kind: 'group', help: METRIC_DOCS['rev.byFee'] },
  billed: { label: 'Phát hành', kind: 'money', help: METRIC_DOCS['rev.billed'] },
  collected: { label: 'Thực thu', kind: 'money', help: METRIC_DOCS['rev.collected'] },
  recognized: { label: 'Doanh thu ghi nhận', kind: 'money', help: METRIC_DOCS['rev.recognized'] },
  refunded: { label: 'Đã hoàn tiền', kind: 'money', help: METRIC_DOCS['rev.refunded'] },
  contracts: { label: 'Hợp đồng đang chạy', kind: 'int', help: 'Số hợp đồng đang ở trạng thái đang thuê, đã báo trả kho hoặc hết hạn chưa xử lý.' },
  monthlyRent: { label: 'Tiền thuê một tháng', kind: 'money', help: 'Tổng giá thuê một tháng của tất cả hợp đồng đang chạy trong bảng.' },
  outstanding: { label: 'Tổng còn nợ', kind: 'money', help: 'Tổng tiền còn nợ của các hóa đơn chưa trả hết thuộc các hợp đồng trong bảng.' },
  total: { label: 'Tổng dư nợ phải thu', kind: 'money', help: METRIC_DOCS['ar.total'] },
  current: { label: 'Chưa đến hạn', kind: 'money', help: METRIC_DOCS['ar.current'] },
  d0_30: { label: 'Quá hạn 1–30 ngày', kind: 'money', help: METRIC_DOCS['ar.d0_30'] },
  d31_60: { label: 'Quá hạn 31–60 ngày', kind: 'money', help: METRIC_DOCS['ar.d31_60'] },
  d61_90: { label: 'Quá hạn 61–90 ngày', kind: 'money', help: METRIC_DOCS['ar.d61_90'] },
  d90_plus: { label: 'Quá hạn trên 90 ngày', kind: 'money', help: METRIC_DOCS['ar.d90_plus'] },
  overdue: { label: 'Nợ quá hạn', kind: 'money', help: METRIC_DOCS['ar.overdue'] },
  overdueRatio: { label: 'Tỷ lệ nợ quá hạn', kind: 'pct', help: METRIC_DOCS['ar.ratio'] },
  delinquentContracts: { label: 'Hợp đồng đang quá hạn', kind: 'int', help: 'Số hợp đồng còn hiệu lực đang ở các giai đoạn từ Ân hạn đến Chờ xử lý vi phạm. Khớp với thẻ cùng tên trên trang Tổng quan.' },
  delinquentDebt: { label: 'Nợ của các hợp đồng đó', kind: 'money', help: 'Tổng tiền còn nợ của các hợp đồng đang quá hạn nói trên.' },
  delinquencyByStage: { label: 'Theo giai đoạn (số hợp đồng · số nợ)', kind: 'group', help: 'Số hợp đồng và tổng còn nợ ở từng giai đoạn xử lý nợ, gồm cả hợp đồng đã chấm dứt còn trong danh sách.' },
  renewalEnding: { label: 'Kỳ thuê kết thúc trong khoảng', kind: 'int', help: 'Số hợp đồng có kỳ thuê kết thúc trong khoảng ngày đã chọn (không tính hợp đồng bị chấm dứt hoặc hủy).' },
  renewalDone: { label: 'Đã gia hạn', kind: 'int', help: 'Số hợp đồng trong nhóm trên đã được gia hạn thêm kỳ thuê.' },
  renewalRate: { label: 'Tỷ lệ gia hạn', kind: 'pct', help: METRIC_DOCS['renewals.rate'] },
  reservationsCreated: { label: 'Đặt chỗ tạo trong khoảng', kind: 'int', help: 'Số đơn đặt chỗ được tạo trong khoảng ngày đã chọn, mọi trạng thái.' },
  reservationsCancelled: { label: 'Bị hủy hoặc không đến', kind: 'int', help: 'Trong các đơn đặt chỗ tạo trong khoảng, số đơn sau đó bị hủy hoặc khách không đến.' },
  cancellationRate: { label: 'Tỷ lệ hủy', kind: 'pct', help: METRIC_DOCS['cancel.rate'] },
  quotesCreated: { label: 'Báo giá tạo trong khoảng', kind: 'int', help: 'Số báo giá cho thuê mới được tạo trong khoảng ngày đã chọn.' },
  quotesConverted: { label: 'Báo giá thành đặt chỗ', kind: 'int', help: 'Trong các báo giá tạo trong khoảng, số báo giá khách đã đặt chỗ.' },
  quoteConversion: { label: 'Tỷ lệ chốt báo giá', kind: 'pct', help: METRIC_DOCS['cancel.conversion'] },
  moveIns: { label: 'Nhận kho', kind: 'int', help: METRIC_DOCS['move.in'] },
  moveOuts: { label: 'Trả kho', kind: 'int', help: METRIC_DOCS['move.out'] },
  moveNet: { label: 'Tăng ròng', kind: 'int', help: METRIC_DOCS['move.net'] },
  avgStayDays: { label: 'Thời gian thuê trung bình (ngày)', kind: 'int', help: 'Số ngày trung bình từ lúc kích hoạt hợp đồng đến lúc khách trả kho, của các hợp đồng kết thúc trong khoảng.' },
  slaTickets: { label: 'Phiếu tạo trong khoảng', kind: 'int', help: 'Tổng số phiếu hỗ trợ được tạo trong khoảng ngày đã chọn.' },
  slaFirstRate: { label: 'Phản hồi đúng hạn', kind: 'pct', help: METRIC_DOCS['sla.first'] },
  slaResolveRate: { label: 'Giải quyết đúng hạn', kind: 'pct', help: METRIC_DOCS['sla.resolve'] },
  csatAvg: { label: 'Điểm hài lòng trung bình', kind: 'int', help: METRIC_DOCS['csat'] },
  promoRedemptions: { label: 'Tổng lượt dùng', kind: 'int', help: 'Tổng số lần khách đã dùng các chương trình khuyến mãi trong khoảng ngày đã chọn.' },
  promoDiscount: { label: 'Tổng tiền đã giảm', kind: 'money', help: 'Tổng số tiền đã giảm cho khách nhờ khuyến mãi trong khoảng ngày đã chọn.' },
  refundCount: { label: 'Số khoản hoàn', kind: 'int', help: 'Số khoản hoàn tiền được đề xuất trong khoảng ngày đã chọn, mọi trạng thái.' },
  refundSucceeded: { label: 'Đã hoàn tiền', kind: 'money', help: 'Tổng tiền của các khoản đã được chi cho khách.' },
  refundOpen: { label: 'Đang chờ duyệt hoặc chờ chi', kind: 'money', help: 'Tổng tiền các khoản chưa chi xong: chờ duyệt, đã duyệt chờ chi tiền hoặc đang xử lý.' },
  refundRejected: { label: 'Bị từ chối hoặc lỗi', kind: 'int', help: 'Số khoản hoàn bị từ chối hoặc xử lý lỗi.' },
  refundByReason: { label: 'Theo lý do hoàn', kind: 'group', help: 'Số khoản và tổng tiền theo lý do hoàn tiền.' },
  refundByStatus: { label: 'Theo trạng thái', kind: 'group', help: 'Số khoản và tổng tiền theo trạng thái xử lý.' },
  refundByFacility: { label: 'Theo cơ sở', kind: 'group', help: 'Số khoản và tổng tiền hoàn của từng cơ sở.' },
  agCount: { label: 'Số hồ sơ tài sản', kind: 'int', help: 'Số hồ sơ tài sản tồn đọng trong khoảng ngày đã chọn.' },
  agPending: { label: 'Chờ quyết định xử lý', kind: 'int', help: 'Số hồ sơ BOM chưa quyết định cách xử lý.' },
  agOverdue: { label: 'Quá hạn lưu giữ', kind: 'int', help: 'Số hồ sơ chờ quyết định đã quá hạn lưu giữ, cần xử lý ngay.' },
  agProceeds: { label: 'Tiền thu từ thanh lý', kind: 'money', help: 'Tổng tiền thu được từ các hồ sơ đã thanh lý. Chưa tự động trừ vào nợ còn lại của khách.' },
  agByDisposition: { label: 'Theo cách xử lý', kind: 'group', help: 'Số hồ sơ theo cách xử lý. Số tiền kèm theo là tiền thu được từ thanh lý.' },
  agByFacility: { label: 'Theo cơ sở', kind: 'group', help: 'Số hồ sơ của từng cơ sở. Số tiền kèm theo là tiền thu được từ thanh lý.' },
};
