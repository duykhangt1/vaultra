/**
 * What every number on the overview and report screens means, in one place: the screens show these texts in their (i) tips and the
 * API sends them with the reports, so the explanation can never drift away from the formula it describes.
 */
export const METRIC_DOCS: Record<string, string> = {
  // ------------------------------------------------------------ occupancy
  'occ.rentable':
    'Kho khai thác được = tổng số kho còn dùng để cho thuê, không tính kho ngừng dùng và kho đã loại bỏ. Kho đang bảo trì, chờ kiểm tra hoặc đã được giữ chỗ vẫn tính vì sẽ quay lại cho thuê.',
  'occ.occupied': 'Kho đang thuê = số kho có khách đang giữ: trạng thái Đang thuê, hoặc Khóa chặn (khách nợ, kho bị khóa nhưng vẫn chứa đồ của khách). Kho Đã giữ chỗ chưa tính vì khách chưa nhận kho.',
  'occ.unit': 'Lấp đầy theo kho = số kho đang thuê ÷ số kho khai thác được. Đây là con số lấp đầy chính của hệ thống.',
  'occ.area': 'Lấp đầy theo m² = tổng diện tích các kho đang thuê ÷ tổng diện tích kho khai thác được. Cho thấy kho lớn có được thuê hay không, điều mà việc đếm số kho không phản ánh.',
  'occ.economic':
    'Lấp đầy kinh tế = tổng tiền thuê một tháng của các hợp đồng đang chạy ÷ tổng giá niêm yết một tháng nếu mọi kho khai thác được đều có khách. Thấp hơn lấp đầy theo kho khi khách được giảm giá hoặc ưu đãi.',
  'occ.avgRent': 'Đơn giá trung bình = tổng tiền thuê một tháng của các hợp đồng đang chạy ÷ số hợp đồng đang chạy.',
  'occ.asOf':
    'Ngày của số liệu. Kỳ hiện tại lấy số liệu trực tiếp ngay lúc bạn xem. Các kỳ trước lấy ảnh chụp cuối cùng mà hệ thống đã lưu trong kỳ đó (hệ thống lưu mỗi giờ).',
  'occ.byStatus': 'Số kho theo trạng thái ngay lúc này. Cộng tất cả các trạng thái ra tổng số kho của cơ sở.',
  'unit.AVAILABLE': 'Trống: kho sẵn sàng cho khách mới thuê.',
  'unit.RESERVED': 'Đã giữ: kho đã được gán cho một đơn đặt hoặc hợp đồng chờ ký, khách chưa nhận kho.',
  'unit.OCCUPIED': 'Đang thuê: khách đã nhận kho và đang sử dụng.',
  'unit.OVERLOCKED': 'Khóa chặn: khách quá hạn thanh toán, kho bị gắn khóa ngoài nhưng vẫn chứa đồ của khách. Tính là đang thuê.',
  'unit.PENDING_INSPECTION': 'Chờ kiểm tra: khách đã trả kho, nhân viên cần kiểm tra trước khi cho thuê lại.',
};

/** Tip text for a metric id; an unknown id yields an empty string so a missing entry is obvious in tests rather than in front of a user. */
export const metricDoc = (id: string): string => METRIC_DOCS[id] ?? '';
