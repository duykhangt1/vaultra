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
  'unit.MAINTENANCE': 'Bảo trì: kho đang sửa chữa, tạm chưa cho thuê. Vẫn tính vào kho khai thác được.',
  'unit.OUT_OF_SERVICE': 'Ngưng dùng: kho tạm thời không dùng được. Không tính vào kho khai thác được.',
  'unit.RETIRED': 'Đã loại: kho đã bỏ khỏi danh mục. Không tính vào kho khai thác được.',

  // ------------------------------------------------------------ money
  'rev.billed':
    'Phát hành = tổng giá trị các dòng hóa đơn được phát hành trong kỳ (tiền thuê, phí, giảm giá, điều chỉnh). Không tính tiền cọc và hóa đơn đã hủy. Tính theo ngày phát hành hóa đơn.',
  'rev.collected':
    'Thực thu = tiền khách đã thanh toán thành công trong kỳ (kể cả tiền cọc và tiền đặt trước, không tính phần trừ vào số dư) trừ tiền đã hoàn chi trong kỳ. Đây là dòng tiền nên có thể lớn hơn Phát hành.',
  'rev.recognized':
    'Doanh thu ghi nhận = tiền thuê chia theo số ngày thuê nằm trong kỳ + phí phát sinh và phí hư hại phát hành trong kỳ − phiếu ghi có + tiền cọc bị tịch thu. Tiền thuê trả trước cho các tháng sau chưa được tính.',
  'rev.refunded': 'Đã hoàn tiền = tổng các khoản hoàn đã chi thành công trong kỳ (hoàn cọc, hủy đặt, đóng thừa…). Từng khoản xem ở báo cáo Hoàn tiền.',
  'rev.rent': 'Tiền thuê ghi nhận = phần tiền thuê (đã trừ giảm giá) của Doanh thu ghi nhận, chia theo số ngày thuê nằm trong kỳ.',
  'rev.byFee': 'Phát hành theo loại phí: tiền thuê, các loại phí, giảm giá (số âm)… Cộng tất cả ra đúng ô Phát hành. Tiền cọc không nằm ở đây vì không phải doanh thu.',
  'rev.period': 'Kỳ của các con số tiền trên trang này. Doanh thu ghi nhận, thực thu và phát hành tính trong kỳ đã chọn. Lấp đầy và công nợ luôn là số liệu tại thời điểm xem.',
  'rev.bySize': 'Tiền thuê ghi nhận trong kỳ chia theo cỡ kho. Cộng các cỡ ra đúng phần Tiền thuê ghi nhận trong Doanh thu ghi nhận.',

  // ------------------------------------------------------------ receivables
  'ar.total': 'Tổng dư nợ phải thu = tổng số tiền còn nợ của các hóa đơn chưa trả hết (đã trừ phần đã trả và phần ghi có), cả chưa đến hạn lẫn quá hạn.',
  'ar.current': 'Chưa đến hạn: hóa đơn chưa tới ngày đến hạn thanh toán.',
  'ar.d0_30': 'Quá hạn 1–30 ngày: số ngày tính từ ngày đến hạn của hóa đơn đến hôm nay.',
  'ar.d31_60': 'Quá hạn 31–60 ngày.',
  'ar.d61_90': 'Quá hạn 61–90 ngày.',
  'ar.d90_plus': 'Quá hạn trên 90 ngày: khoản nợ lâu, khó thu.',
  'ar.overdue': 'Nợ quá hạn = tổng các hóa đơn đã qua ngày đến hạn mà chưa trả hết (tất cả các mức quá hạn cộng lại).',
  'ar.ratio':
    'Tỷ lệ nợ quá hạn = nợ quá hạn ÷ tổng dư nợ phải thu đang mở (gồm cả chưa đến hạn). Luôn từ 0% đến 100%. Cơ sở vượt ngưỡng trong Chính sách bị đánh dấu "Công nợ cao".',

  // ------------------------------------------------------------ delinquency
  'dq.GRACE': 'Ân hạn: vừa quá hạn, chưa tính phí trễ. Nhân viên chỉ nhắc khách.',
  'dq.LATE': 'Trễ hạn: bắt đầu tính phí trễ hạn, nhân viên gọi nhắc và ghi nhận liên hệ.',
  'dq.LOCKED_OUT': 'Khóa truy cập: mã ra vào của khách bị khóa, nhân viên ra gắn khóa chặn.',
  'dq.FINAL_NOTICE': 'Thông báo cuối: đã gửi thông báo cuối cùng cho khách trước khi coi là vi phạm.',
  'dq.DEFAULT_PENDING': 'Chờ xử lý vi phạm: quá hạn đủ lâu, chờ quản lý cơ sở và BOM duyệt thu hồi kho.',
  'dq.DEFAULTED': 'Vi phạm: hợp đồng đã bị chấm dứt vì không thanh toán.',

  // ------------------------------------------------------------ operations
  'renewals.rate': 'Tỷ lệ gia hạn = số hợp đồng có kỳ thuê kết thúc trong khoảng thời gian chọn và đã được gia hạn ÷ số hợp đồng có kỳ thuê kết thúc trong khoảng đó. Luôn từ 0% đến 100%.',
  'cancel.rate': 'Tỷ lệ hủy = số đặt chỗ tạo trong khoảng thời gian chọn mà sau đó bị hủy hoặc khách không đến ÷ số đặt chỗ tạo trong khoảng đó. Đặt chỗ hết hạn giữ chỗ không tính là hủy.',
  'cancel.conversion': 'Tỷ lệ chốt đơn = số báo giá tạo trong khoảng thời gian chọn đã thành đơn đặt chỗ ÷ số báo giá tạo trong khoảng đó.',
  'sla.first': 'Phản hồi đúng hạn = số phiếu được phản hồi trong thời hạn cam kết ÷ số phiếu đã đến hạn phản hồi hoặc đã được phản hồi.',
  'sla.resolve': 'Giải quyết đúng hạn = số phiếu đã giải quyết hoặc đóng mà không trễ SLA ÷ số phiếu đã giải quyết hoặc đóng.',
  'csat': 'Điểm hài lòng trung bình theo đánh giá 1–5 sao của khách sau khi phiếu hỗ trợ được giải quyết.',
  'move.in': 'Nhận kho = số hợp đồng được kích hoạt (khách đã nhận kho và ký) trong kỳ.',
  'move.out': 'Trả kho = số hợp đồng kết thúc (khách đã trả kho) trong kỳ.',
  'move.net': 'Tăng ròng = Nhận kho − Trả kho. Số dương nghĩa là số kho có khách đang tăng.',
  'tickets.breached': 'Phiếu hỗ trợ đang mở đã trễ thời hạn giải quyết cam kết (SLA). Hệ thống kiểm tra lại mỗi 5 phút.',
  'tasks.overdue': 'Công việc còn mở đã quá hạn. Hệ thống đánh dấu quá hạn mỗi 10 phút.',
  'contracts.expiring': 'Hợp đồng đang chạy có ngày kết thúc trong 30 ngày tới (hoặc đã quá ngày kết thúc mà chưa được xử lý). Cần chốt gia hạn hoặc nhận lại kho.',
};

/** Tip text for a metric id; an unknown id yields an empty string so a missing entry is obvious in tests rather than in front of a user. */
export const metricDoc = (id: string): string => METRIC_DOCS[id] ?? '';
