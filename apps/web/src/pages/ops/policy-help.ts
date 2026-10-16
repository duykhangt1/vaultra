/**
 * Help text for every policy parameter, written from how the API actually reads it.
 * `scope` says WHEN a published change starts to matter — this is what explains "I changed it and nothing happened":
 *   NEW       read from the active version when a quote/reservation is created -> only new bookings
 *   CONTRACT  frozen into each contract at signing (contract.policy_version_id)  -> only newly signed contracts
 *   RENEWAL   read from the active version when a renewal offer is built           -> next renewal of any contract
 *   LIVE      read from the active version every time it is used                   -> immediately
 *   TEXT      only printed in contracts / the AI assistant, no automated behaviour  -> never changes behaviour
 */
export type Scope = 'NEW' | 'CONTRACT' | 'RENEWAL' | 'LIVE' | 'TEXT';

export const SCOPE_LABEL: Record<Scope, string> = {
  NEW: 'Chỉ áp dụng cho đặt chỗ tạo SAU khi xuất bản. Đơn đã đặt giữ nguyên bản cũ.',
  CONTRACT: 'Chỉ áp dụng cho hợp đồng ký SAU khi xuất bản. Hợp đồng đang chạy giữ bản chính sách lúc ký.',
  RENEWAL: 'Áp dụng từ lần gia hạn tiếp theo, kể cả hợp đồng đang chạy.',
  LIVE: 'Có hiệu lực ngay sau khi xuất bản, với mọi hợp đồng và đơn hàng.',
  TEXT: 'Chỉ được in trong hợp đồng và trợ lý AI, hệ thống chưa tự động làm gì theo giá trị này.',
};

export const SCOPE_SHORT: Record<Scope, string> = {
  NEW: 'Đặt chỗ mới', CONTRACT: 'Hợp đồng mới', RENEWAL: 'Lần gia hạn tới', LIVE: 'Áp dụng ngay', TEXT: 'Chỉ hiển thị',
};

export const HELP: Record<string, { tip: string; scope: Scope }> = {
  // Đặt chỗ
  hold_minutes: { scope: 'NEW', tip: 'Số phút kho được giữ cho khách trong lúc thanh toán. Hết giờ mà chưa trả tiền, đơn tự hủy và kho được nhả lại. Ví dụ: 15 = khách có 15 phút.' },
  max_advance_booking_days: { scope: 'NEW', tip: 'Khách chỉ chọn được ngày nhận kho trong khoảng này kể từ hôm nay. Ví dụ: 60 = đặt trước tối đa 60 ngày.' },
  allowed_terms_months: { scope: 'NEW', tip: 'Các kỳ hạn thuê khách được chọn khi đặt, ngăn cách bằng dấu phẩy. Ví dụ: 1, 3, 6, 12. Cũng là các kỳ hạn hiện ra khi gia hạn.' },
  reservation_payment_mode: { scope: 'NEW', tip: 'Số tiền khách trả ngay khi đặt chỗ: chỉ tiền cọc, hoặc cọc cộng kỳ thuê đầu tiên.' },
  move_in_window_days: { scope: 'NEW', tip: 'Khoảng thời gian sau ngày hẹn nhận kho mà khách vẫn được làm thủ tục nhận kho; nhân viên thấy khoảng này ở bước nhận kho. Khi đặt lịch hẹn, hệ thống cho phép tối thiểu 30 ngày sau ngày hẹn.' },
  no_show_days: { scope: 'NEW', tip: 'Quá ngày hẹn nhận kho bấy nhiêu ngày mà khách chưa đến, hệ thống tự hủy đơn và đánh dấu vắng mặt (no-show).' },
  max_pending_reservations: { scope: 'NEW', tip: 'Mỗi khách được có tối đa bao nhiêu đơn đặt online đang chờ thanh toán cùng lúc. Vượt quá sẽ bị chặn tạo đơn mới.' },
  allocation_lead_days: { scope: 'TEXT', tip: 'Dự định: số ngày trước ngày nhận kho thì bắt đầu phân kho cụ thể. HIỆN CHƯA có chức năng nào đọc tham số này nên đổi giá trị không có tác dụng.' },
  allocation_sla_hours: { scope: 'TEXT', tip: 'Dự định: thời gian tối đa (giờ) để phân kho sau khi khách thanh toán. HIỆN CHƯA có chức năng nào đọc tham số này nên đổi giá trị không có tác dụng.' },
  entry_notice_hours: { scope: 'TEXT', tip: 'Số giờ công ty báo trước khi cần vào khu vực kho để bảo trì. Chỉ được in thành điều khoản trong hợp đồng PDF, không có bước tự động nào dựa trên số này.' },

  // Giá theo kỳ hạn
  prepaid_discount_pct: { scope: 'NEW', tip: 'Khách chọn "Trả trước cả kỳ" (trả một lần cho toàn bộ kỳ hạn) được giảm thêm phần trăm này trên giá thuê một tháng, cộng dồn với giảm giá theo kỳ hạn. Kỳ hạn 1 tháng không áp dụng. Ví dụ: kỳ 12 tháng giảm 15% và trả trước giảm 3% thì giá còn 100% × 0,85 × 0,97 = 82,45%.' },

  // Tiền cọc & phí
  deposit_type: { scope: 'NEW', tip: 'Cách tính tiền cọc: theo số tháng tiền thuê, hoặc một số tiền cố định. Mỗi loại kho vẫn có thể được đặt mức cọc riêng và mức riêng đó luôn thắng.' },
  deposit_value: { scope: 'NEW', tip: 'Nếu kiểu cọc là "Số tháng tiền thuê" thì đây là số tháng (ví dụ 1 hoặc 1.5). Nếu là "Số tiền cố định" thì đây là số tiền theo đồng.' },
  admin_fee: { scope: 'NEW', tip: 'Phí hành chính thu một lần khi khách đặt thuê, tính vào báo giá. Đơn nhập số đồng, 0 = miễn phí.' },
  admin_fee_refundable: { scope: 'NEW', tip: 'Bật: khi khách hủy đặt chỗ thì phí hành chính được hoàn lại. Tắt: không hoàn, trừ khi nhân viên miễn phí cho khách.' },
  vat_rate: { scope: 'CONTRACT', tip: 'Thuế VAT tính theo phần trăm trên hóa đơn. Ví dụ: 8 = 8%. Báo giá lấy mức hiện hành, còn hóa đơn của hợp đồng đã ký dùng mức lúc ký.' },
  prices_include_vat: { scope: 'CONTRACT', tip: 'Bật: giá niêm yết đã gồm VAT, VAT được tách ra từ giá. Tắt: VAT được cộng thêm lên trên giá niêm yết.' },

  // Gia hạn & kết thúc
  renewal_window_days: { scope: 'CONTRACT', tip: 'Số ngày trước ngày hết hạn thì mở cửa sổ gia hạn: khách nhận đề nghị gia hạn và thông báo nhắc. Ví dụ: 60 = mở trước 60 ngày.' },
  renewal_fee: { scope: 'RENEWAL', tip: 'Phí cố định thu mỗi lần khách gia hạn hợp đồng. 0 = miễn phí.' },
  renewal_price_rule: { scope: 'RENEWAL', tip: 'Giá thuê kỳ mới khi gia hạn: theo giá niêm yết hiện tại nhưng không tăng quá trần, giữ nguyên giá cũ, hoặc theo giá niêm yết hiện tại không giới hạn.' },
  renewal_max_increase_pct: { scope: 'RENEWAL', tip: 'Trần tăng giá khi gia hạn so với giá đang thuê, tính theo phần trăm. Chỉ có tác dụng với quy tắc "Giá niêm yết, có trần tăng". Ví dụ: 10 = tăng tối đa 10%.' },
  auto_renew_default: { scope: 'CONTRACT', tip: 'Hợp đồng mới ký có bật sẵn "Tự động gia hạn" hay không. Khách vẫn tự bật hoặc tắt được trong hợp đồng của mình.' },
  auto_renew_term_months: { scope: 'CONTRACT', tip: 'Kỳ hạn dùng khi hệ thống tự gia hạn (hợp đồng bật tự động gia hạn, còn ≤ 7 ngày, không nợ). Phải nằm trong danh sách kỳ hạn cho phép, nếu không dùng kỳ đầu tiên.' },
  price_change_notice_days: { scope: 'RENEWAL', tip: 'Nếu giá gia hạn cao hơn giá hiện tại, công ty phải báo khách trước ít nhất bấy nhiêu ngày. Dùng để tính thời điểm mở đề nghị và gửi thông báo đổi giá.' },
  on_expiry_action: { scope: 'LIVE', tip: 'Việc xảy ra khi hợp đồng hết hạn mà khách chưa gia hạn hay trả kho: chuyển sang thuê theo tháng (holdover), hoặc bắt buộc trả kho.' },
  move_out_notice_days: { scope: 'CONTRACT', tip: 'Khách tự yêu cầu trả kho phải chọn ngày trả cách hôm nay ít nhất bấy nhiêu ngày, nếu không yêu cầu bị từ chối. Nhân viên tạo yêu cầu thay khách thì không bị giới hạn này.' },
  early_termination_refund: { scope: 'CONTRACT', tip: 'Khi khách trả kho trước hạn: không hoàn tiền thuê đã trả trước, hoặc hoàn các tháng nguyên chưa dùng.' },
  early_termination_fee: { scope: 'CONTRACT', tip: 'Phí phạt khi khách trả kho trước ngày hết hạn, trừ vào tiền cọc lúc quyết toán. 0 = không phạt.' },

  // Trả kho & bồi thường
  dispute_days: { scope: 'CONTRACT', tip: 'Sau khi lập bảng quyết toán trả kho, khách có bấy nhiêu ngày để khiếu nại; hạn khiếu nại được ghi trên bảng quyết toán.' },
  deposit_refund_days: { scope: 'TEXT', tip: 'Số ngày cam kết hoàn cọc sau khi trả kho. Hiện chỉ được in trong hợp đồng PDF và trợ lý AI, hệ thống không tự đếm ngày để hoàn cọc.' },
  damage_approval_threshold: { scope: 'CONTRACT', tip: 'Tổng tiền bồi thường hư hại lớn hơn mức này thì khoản bồi thường phải được duyệt trước khi trừ vào cọc của khách. Bằng hoặc thấp hơn thì không cần duyệt.' },
  min_handover_photos: { scope: 'NEW', tip: 'Số ảnh tối thiểu trong biên bản hiện trạng khi nhận kho; thiếu ảnh thì không bàn giao kho và không cấp mã PIN được. Khi trả kho, hệ thống yêu cầu tối đa 2 ảnh.' },

  // Công nợ
  invoice_lead_days: { scope: 'CONTRACT', tip: 'Hóa đơn tiền thuê hằng tháng được phát hành trước ngày đến hạn bấy nhiêu ngày. Ví dụ: 7 = phát hành trước 7 ngày.' },
  grace_days: { scope: 'CONTRACT', tip: 'Số ngày ân hạn sau ngày đến hạn: trong thời gian này chưa tính phí trễ và chưa xử lý. Phải nhỏ hơn mốc "Khóa cửa".' },
  late_fee_type: { scope: 'CONTRACT', tip: 'Cách tính phí trả muộn: số tiền cố định, phần trăm tiền thuê, hoặc lấy số lớn hơn trong hai cách.' },
  late_fee_fixed: { scope: 'CONTRACT', tip: 'Số tiền phí trễ cố định (đồng). Dùng khi kiểu phí là "Cố định" hoặc "Lớn hơn của hai".' },
  late_fee_pct: { scope: 'CONTRACT', tip: 'Phí trễ theo phần trăm tiền thuê một tháng. Dùng khi kiểu phí là "% tiền thuê" hoặc "Lớn hơn của hai". Ví dụ: 5 = 5%.' },
};

export const TERM_DISCOUNTS_HELP = {
  scope: 'NEW' as Scope,
  tip: 'Mỗi dòng là một kỳ hạn thuê và phần trăm giảm trên giá thuê một tháng của loại kho (giá niêm yết, trả hàng tháng). Ví dụ: 6 tháng giảm 10% thì kho 1.000.000 ₫/tháng còn 900.000 ₫/tháng, cả khi khách trả theo tháng. Giá này được cố định vào hợp đồng và dùng cho các hóa đơn định kỳ.',
};

export const TIERS_HELP = {
  scope: 'NEW' as Scope,
  tip: 'Khi khách hủy đặt chỗ, hệ thống tìm bậc có số giờ "Trước ≥" lớn nhất mà thời điểm hủy còn thỏa, rồi hoàn cọc và tiền thuê theo phần trăm của bậc đó. Hủy càng sớm hoàn càng nhiều. Ví dụ: Trước ≥ 48 giờ, hoàn cọc 100%.',
};
