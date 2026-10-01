/**
 * Default notification templates (spec §16.3, §16.5). Seeded into notification_templates; BOM/Admin
 * can edit them in the UI (DB version wins). Variables use {{name}}.
 * group -> notification_preferences.event_group; mandatory -> cannot be disabled; email -> also email.
 */
export type TemplateDef = {
  group: 'BILLING' | 'CONTRACT' | 'RENEWAL' | 'SUPPORT' | 'OPERATIONS' | 'MARKETING' | 'ACCOUNT';
  mandatory: boolean;
  email: boolean;
  subject: string;
  body: string;
};

export const TEMPLATES: Record<string, TemplateDef> = {
  // A. Account & security
  'assistant.handoff_anonymous': {
    group: 'OPERATIONS',
    mandatory: false,
    email: false,
    subject: 'Yêu cầu tư vấn mới từ khách truy cập website',
    body: 'Khách hàng để lại địa chỉ liên hệ {{email}} qua trợ lý trực tuyến. Tóm tắt nội dung: {{transcript}}',
  },
  'contact.request': {
    group: 'OPERATIONS',
    mandatory: false,
    email: true,
    subject: 'Yêu cầu liên hệ tư vấn mới{{facility}}',
    body: 'Khách hàng {{name}} ({{email}}{{phone}}) đã gửi yêu cầu tư vấn từ trang Liên hệ: {{message}}',
  },
  'auth.verify_email': {
    group: 'ACCOUNT',
    mandatory: true,
    email: true,
    subject: 'Xác minh địa chỉ email tài khoản {{brand}}',
    body: 'Xin chào {{name}}, vui lòng xác minh địa chỉ email trong vòng 24 giờ để hoàn tất kích hoạt tài khoản thuê kho tại {{brand}}. Nếu Quý khách không thực hiện yêu cầu này, vui lòng bỏ qua thông báo.',
  },
  'auth.welcome': {
    group: 'ACCOUNT',
    mandatory: true,
    email: true,
    subject: 'Chào mừng Quý khách đến với {{brand}}',
    body: 'Tài khoản {{brand}} của Quý khách đã được kích hoạt thành công. Quý khách có thể tra cứu cơ sở lưu trữ, chọn diện tích kho phù hợp, thanh toán trực tuyến và đặt lịch nhận kho bất cứ lúc nào.',
  },
  'auth.account_exists': {
    group: 'ACCOUNT',
    mandatory: true,
    email: true,
    subject: 'Thông báo đăng ký trên địa chỉ email đã có tài khoản {{brand}}',
    body: 'Hệ thống vừa ghi nhận yêu cầu đăng ký mới bằng địa chỉ email này. Tài khoản của Quý khách đã tồn tại trên {{brand}} — vui lòng đăng nhập hoặc sử dụng chức năng Đặt lại mật khẩu nếu cần hỗ trợ.',
  },
  'auth.password_reset': {
    group: 'ACCOUNT',
    mandatory: true,
    email: true,
    subject: 'Yêu cầu đặt lại mật khẩu tài khoản {{brand}}',
    body: 'Hệ thống nhận được yêu cầu đặt lại mật khẩu từ thiết bị {{device}} (IP: {{ip}}). Liên kết xác thực có hiệu lực trong 30 phút và chỉ sử dụng một lần.',
  },
  'auth.password_changed': {
    group: 'ACCOUNT',
    mandatory: true,
    email: true,
    subject: 'Xác nhận thay đổi mật khẩu tài khoản {{brand}}',
    body: 'Mật khẩu tài khoản của Quý khách đã được cập nhật lúc {{time}}. Toàn bộ các phiên đăng nhập trước đó đã được đăng xuất để bảo vệ an toàn. Nếu không phải Quý khách thực hiện, vui lòng khôi phục mật khẩu ngay lập tức.',
  },
  'auth.new_device_login': {
    group: 'ACCOUNT',
    mandatory: true,
    email: true,
    subject: 'Cảnh báo bảo mật: Đăng nhập từ thiết bị mới',
    body: 'Tài khoản {{brand}} của Quý khách vừa đăng nhập trên {{device}} (IP: {{ip}}) vào lúc {{time}}. Nếu Quý khách không nhận ra hoạt động này, vui lòng thu hồi phiên đăng nhập và đổi mật khẩu ngay.',
  },
  'auth.account_locked': {
    group: 'ACCOUNT',
    mandatory: true,
    email: true,
    subject: 'Tạm khóa bảo vệ tài khoản {{brand}}',
    body: 'Tài khoản của Quý khách tạm thời khóa đăng nhập trong {{minutes}} phút do nhập sai mật khẩu quá số lần quy định. Quý khách có thể chờ hết thời gian tạm khóa hoặc đặt lại mật khẩu mới.',
  },
  'auth.token_reuse_detected': {
    group: 'ACCOUNT',
    mandatory: true,
    email: true,
    subject: 'Cảnh báo an toàn: Phát hiện bất thường phiên đăng nhập',
    body: 'Hệ thống bảo mật phát hiện dấu hiệu sử dụng lại mã phiên đăng nhập và đã chủ động ngắt phiên đó để bảo vệ tài khoản của Quý khách. Khuyến nghị Quý khách kiểm tra thiết bị và đổi mật khẩu.',
  },
  'auth.google_link_code': {
    group: 'ACCOUNT',
    mandatory: true,
    email: true,
    subject: 'Mã xác thực liên kết tài khoản Google ({{code}})',
    body: 'Mã xác thực một lần để liên kết đăng nhập Google với tài khoản {{brand}} của Quý khách là {{code}} (hiệu lực trong 10 phút). Tuyệt đối không chia sẻ mã này cho bất kỳ ai.',
  },
  'auth.google_linked': {
    group: 'ACCOUNT',
    mandatory: true,
    email: false,
    subject: 'Đã liên kết đăng nhập Google thành công',
    body: 'Tài khoản Google {{googleEmail}} đã được liên kết với hồ sơ {{brand}} của Quý khách.',
  },
  'auth.google_unlinked': {
    group: 'ACCOUNT',
    mandatory: true,
    email: false,
    subject: 'Đã hủy liên kết đăng nhập Google',
    body: 'Phương thức đăng nhập qua Google đã được gỡ khỏi tài khoản {{brand}} của Quý khách.',
  },
  'user.invited': {
    group: 'ACCOUNT',
    mandatory: true,
    email: true,
    subject: 'Lời mời kích hoạt tài khoản trên hệ thống {{brand}}',
    body: 'Xin chào {{name}}, bạn được cấp tài khoản truy cập hệ thống {{brand}} với phân quyền {{roles}}{{facilityText}}. Vui lòng bấm nút bên dưới để thiết lập mật khẩu và kích hoạt tài khoản.',
  },
  'user.role_changed': {
    group: 'ACCOUNT',
    mandatory: true,
    email: true,
    subject: 'Thông báo cập nhật phân quyền tài khoản {{brand}}',
    body: 'Phân quyền truy cập tài khoản của bạn trên hệ thống {{brand}} vừa được quản trị viên cập nhật. Các phiên làm việc cũ đã được làm mới — vui lòng đăng nhập lại để tiếp tục.',
  },
  'user.disabled': {
    group: 'ACCOUNT',
    mandatory: true,
    email: true,
    subject: 'Thông báo ngừng kích hoạt tài khoản {{brand}}',
    body: 'Tài khoản truy cập hệ thống {{brand}} của Quý khách hiện đã tạm ngừng hoạt động. Vui lòng liên hệ bộ phận Quản trị hoặc Chăm sóc khách hàng nếu cần hỗ trợ.',
  },
  'privacy.data_export_ready': {
    group: 'ACCOUNT',
    mandatory: true,
    email: true,
    subject: 'Hồ sơ dữ liệu cá nhân của Quý khách đã sẵn sàng tải xuống',
    body: 'Bản trích xuất dữ liệu cá nhân theo yêu cầu của Quý khách đã được chuẩn bị xong và lưu trữ bảo mật trong 24 giờ. Vui lòng đăng nhập ứng dụng để tải tệp.',
  },

  // B. Reservation & Appointments
  'reservation.pending_payment': {
    group: 'BILLING',
    mandatory: false,
    email: true,
    subject: 'Xác nhận giữ chỗ đặt kho {{code}} (Kèm phiếu & mã QR Check-in)',
    body: 'Đơn đặt kho {{code}} của Quý khách đang được giữ chỗ đến {{holdUntil}}. Vui lòng hoàn tất thanh toán trực tuyến hoặc mang theo CCCD kèm mã QR đơn hàng {{code}} khi đến quầy lễ tân check-in.',
  },
  'reservation.confirmed': {
    group: 'CONTRACT',
    mandatory: true,
    email: true,
    subject: 'Xác nhận đặt kho thành công {{code}} (Kèm phiếu PDF & mã QR Check-in)',
    body: 'Đơn đặt kho {{code}} tại {{facility}} (bắt đầu từ {{startDate}}, thời hạn {{term}} tháng) đã được xác nhận thanh toán. Quý khách vui lòng mang theo CCCD bản gốc và xuất trình mã QR đơn {{code}} để làm thủ tục nhận kho.',
  },
  'reservation.confirmed_fm': {
    group: 'OPERATIONS',
    mandatory: false,
    email: false,
    subject: 'Đơn đặt kho mới {{code}} đã xác nhận thanh toán',
    body: 'Đơn {{code}} ({{unitType}}, bắt đầu {{startDate}}) đã hoàn tất thanh toán và sẵn sàng chuẩn bị bàn giao.',
  },
  'reservation.expired': {
    group: 'CONTRACT',
    mandatory: true,
    email: true,
    subject: 'Thông báo hết thời gian giữ chỗ đơn đặt kho {{code}}',
    body: 'Đơn đặt kho {{code}} đã hết thời hạn giữ chỗ tạm thời do chưa ghi nhận thanh toán. Quý khách có thể thực hiện đặt kho mới bất cứ lúc nào trên hệ thống {{brand}}.',
  },
  'reservation.cancelled': {
    group: 'CONTRACT',
    mandatory: true,
    email: true,
    subject: 'Xác nhận hủy đơn đặt kho {{code}}',
    body: 'Đơn đặt kho {{code}} đã được hủy theo ghi nhận trên hệ thống. Khoản tiền hoàn trả dự kiến theo chính sách hiện hành: {{refund}}.',
  },
  'reservation.no_show': {
    group: 'CONTRACT',
    mandatory: true,
    email: true,
    subject: 'Thông báo quá thời hạn nhận kho — Đơn {{code}}',
    body: 'Đơn đặt kho {{code}} đã quá khung thời gian nhận kho theo quy định và được chuyển sang trạng thái quá hạn nhận kho. Tiền đặt cọc được đối soát theo chính sách; số tiền hoàn dự kiến: {{refund}}.',
  },
  'allocation.required': {
    group: 'OPERATIONS',
    mandatory: false,
    email: false,
    subject: 'Cần phân bổ kho cho đơn {{code}}',
    body: 'Đơn {{code}} ({{unitType}}) cần được gán kho cụ thể trước {{dueAt}}.',
  },
  'allocation.sla_breached': {
    group: 'OPERATIONS',
    mandatory: false,
    email: false,
    subject: 'Quá hạn SLA phân bổ kho — Đơn {{code}}',
    body: 'Đơn {{code}} đã vượt mốc thời gian cam kết phân bổ kho, đề nghị xử lý ngay.',
  },
  'unit.assigned': {
    group: 'CONTRACT',
    mandatory: true,
    email: true,
    subject: 'Thông báo phân bổ kho {{unitCode}} — Đơn {{code}}',
    body: 'Đơn đặt kho {{code}} của Quý khách tại {{facility}} đã được bố trí kho {{unitCode}} ({{zone}}, tầng {{floor}}). Vui lòng xem chi tiết vị trí kho và phiếu xác nhận đính kèm.',
  },
  'allocation.changed': {
    group: 'CONTRACT',
    mandatory: true,
    email: true,
    subject: 'Thông báo cập nhật kho lưu trữ sang {{unitCode}} — Đơn {{code}}',
    body: 'Đơn đặt kho {{code}} đã được điều chuyển sang kho {{unitCode}} ({{zone}}) để đảm bảo điều kiện lưu trữ tốt nhất. Lý do cập nhật: {{reason}}.',
  },
};
