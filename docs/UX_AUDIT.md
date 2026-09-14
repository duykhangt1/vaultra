# Rà soát giao diện và chức năng từng trang

Tài liệu sống của đợt "product refinement". Nguyên tắc: không đổi nghiệp vụ hay schema; chỉ hiển thị đúng và đủ những gì API đã có, bổ sung chức năng còn thiếu theo đặc tả, sửa lỗi nhìn thấy khi duyệt thật.

## Phạm vi hệ thống (khoảng 70 trang)

| Khu | Số trang | Ghi chú |
|---|---|---|
| Khách thuê `/app` | 7 (+ chi tiết) | Tổng quan, Đặt chỗ, Hợp đồng, Hóa đơn, Hỗ trợ, Thông báo, Tài khoản |
| Nhân viên `/staff` | 11 | Hôm nay, Quét, Việc, Trả kho, Sơ đồ, Kho, Hỗ trợ, Khách hàng, Ca làm… |
| Quản lý cơ sở `/manage` | 21 | Tổng quan, Sơ đồ, Loại kho, Kho, Đặt thuê, Hợp đồng, Công nợ, Phê duyệt, Nhân viên, Lịch ca… |
| Vận hành kinh doanh `/ops` | 16 | Tổng quan, Cơ sở, So sánh, Chính sách, Giá & phí, Khuyến mãi, Đối soát, SLA… |
| Quản trị `/admin` | 9 | An ninh, Tài khoản, Vai trò, Bảo mật, Kiểm toán, Cấu hình, Mẫu thông báo, Sức khỏe |

## Phát hiện chính của vòng khảo sát

1. **Dữ liệu API có nhưng giao diện không dùng.** Đây là nguồn "sơ sài" lớn nhất. Bảng điều khiển của Quản lý cơ sở nhận về phê duyệt theo loại, phễu quá hạn, ticket theo ưu tiên và vi phạm SLA, việc quá hạn, hợp đồng sắp hết hạn, nhân viên đang trực, lịch hẹn hôm nay, so sánh doanh thu tháng trước, nhưng chỉ vẽ 4 chỉ số và 2 biểu đồ. Dashboard khách thuê bỏ qua việc cần làm, lịch hẹn, thông báo cơ sở, phiếu đang mở.
2. **Lỗi nghiệp vụ nhìn thấy khi duyệt thật.** Bảng SLA trống trong CSDL nên trang SLA báo "Chưa cấu hình" trong khi hệ thống âm thầm dùng mức mặc định trong code. Tổng nợ âm hiện là "Tổng còn nợ" màu xanh. Liên kết "Ký hợp đồng" ở việc cần làm trỏ tới route không tồn tại.
3. **Lỗi hệ thống tìm thấy ở đợt 2 (đã sửa):** (a) ô nhập/ô chọn luôn bị `w-full` đè nên mọi `className="w-48"` đều vô tác dụng, bộ lọc xếp chồng toàn chiều rộng; (b) bấm một dòng bảng dùng `window.location.assign` nên tải lại cả trang thay vì chuyển trang trong ứng dụng; (c) nút quay lại của trang chi tiết hiện nguyên chữ đường dẫn; (d) API chỉ trả ngày hết hạn/ngày còn lại cho hợp đồng chờ ký, hợp đồng đang thuê luôn hiện "—"; (e) lịch sử trạng thái và loại hóa đơn hiện mã tiếng Anh thô; (f) trang Lịch ca truy vấn tuần theo ngày UTC nên mất ca sau 07:00 sáng Chủ nhật ở UTC+7; (g) nhân viên không có cách xin đổi ca dù đặc tả 5C yêu cầu.
4. **Nhất quán:** nhãn báo cáo tiếng Anh thô trong giao diện tiếng Việt; nút chỉ có biểu tượng không có tên cho trình đọc màn hình; nút hành động ở đầu thẻ bị xuống dòng khi thẻ hẹp.

## Đã hoàn thiện

| Trang | Thay đổi |
|---|---|
| Khách thuê · Tổng quan | Việc cần làm theo ưu tiên, lịch hẹn sắp tới, thông báo từ cơ sở, phiếu hỗ trợ đang mở, cảnh báo hợp đồng sắp hết hạn, nhãn số dư đúng (còn phải trả / số dư khả dụng); sửa liên kết ký hợp đồng |
| Quản lý · Tổng quan | Khối "Cần xử lý" có liên kết, ba chỉ số lấp đầy, phát hành / thu / ghi nhận kèm so tháng trước, lịch hẹn hôm nay, đang trực, nhận/trả kho 7 ngày, trạng thái kho dạng thanh xếp chồng, phễu quá hạn, phiếu theo ưu tiên (đúng đặc tả §17.2) |
| Quản lý · Nhân viên | Hôm nay đang trực hay không, giờ trong tuần (cảnh báo > 48 giờ), việc mở, hoàn thành và đúng hạn 30 ngày, phiếu đã xử lý, tìm kiếm, ngăn chi tiết (ca trong tuần, việc đang làm, liên hệ) |
| Quản lý · Lịch ca | Bảng nhân viên × ngày, bấm ô để thêm ca, hủy ca có xác nhận, sao chép tuần trước, tổng giờ, cảnh báo vượt giờ và lịch hẹn chưa có người trực, danh sách đổi ca chờ duyệt |
| Vận hành · SLA | Ma trận 28 dòng với mức mặc định đang áp dụng thật, quy đổi thời gian, kiểm tra hợp lệ từng dòng, đánh dấu chưa lưu / mặc định / tùy chỉnh. API trả đủ ma trận (một nguồn mặc định chung với engine ticket) |
| Vận hành · Chính sách | Mở thẳng phiên bản đang hiệu lực/nháp, bảng khác biệt có nhãn và giá trị cũ → mới, kiểm tra chuỗi mốc công nợ trước khi lưu/xuất bản |
| Báo cáo (mọi vai trò) | Nhãn tiếng Việt dùng chung cho màn hình và tệp xuất, định dạng ô theo kiểu cột, sắp xếp, lọc nhanh, dòng tổng, xem thêm theo trang, phân tích con (trạng thái kho, loại phí) |
| Nhân viên · Ca làm của tôi | Ca đang diễn ra / kế tiếp, giờ làm trong tuần, ca theo ngày, **xin đổi ca** (kèm lý do, hiện trạng thái chờ duyệt/đã duyệt/từ chối), ca gần đây. Đã thử trọn vòng: quản lý xuất bản → nhân viên xin đổi → quản lý duyệt |
| Nhân viên · Quét / tra cứu | Danh sách nhận kho sắp tới để chạm một lần, mã tra cứu gần đây, thông báo lỗi có hướng dẫn |
| Khách thuê · Hợp đồng | Tab Đang thuê / Chờ ký / Đã kết thúc / Tất cả, tìm kiếm, bộ lọc nằm trên URL (Back về đúng danh sách), cột thanh toán chỉ hiện cho hợp đồng đang chạy; chi tiết có ngày hết hạn/còn lại đúng và lịch sử bằng tiếng Việt |
| Hỗ trợ (khách và nhân viên) | Tab Đang xử lý / Đã xong / Tất cả (lưu trên URL), hạn xử lý ẩn cho phiếu đã xong và ghi "Trễ hạn" khi vi phạm SLA, trạng thái rỗng có hướng dẫn |
| Quản lý · Cài đặt cơ sở · Thông tin | **Sửa lỗi nghiêm trọng:** giờ làm việc và giờ ra vào kho hiện `[object Object]` và có thể ghi đè dữ liệu hỏng. Thay bằng bộ sửa giờ theo từng ngày trong tuần (mở/đóng cửa, giờ mở và đóng, áp dụng cho cả tuần, kiểm tra giờ đóng sau giờ mở). Đã thử lưu và đọc lại: dữ liệu giữ nguyên định dạng |
| Quản lý · Tổng quan (ô Chờ xử lý) | Mỗi loại yêu cầu (hoàn tiền, miễn phí, hư hại, đổi ca, thu hồi kho, phân kho) dẫn tới đúng màn hình xử lý, thay vì dồn về trang Phê duyệt chỉ có hai loại |
| Quản lý · Công nợ | Dải giai đoạn (Ân hạn → Vi phạm) có số hợp đồng và tổng nợ, bấm để lọc |
| Quản trị · Tài khoản | Tab Nhân sự nội bộ / Khách hàng / Tất cả (mặc định nội bộ, không còn chìm giữa 1.000+ khách); API lọc nhiều vai trò |
| Quản trị · Cấu hình | Tab tiếng Việt kèm số mục, mô tả làm tiêu đề, **chặn lưu JSON sai** (trước đây lưu thành chuỗi) |
| Quản trị · Mẫu thông báo | Tìm kiếm, hiện các biến `{{…}}` đang dùng, cảnh báo khi bỏ biến của mẫu gốc hoặc thêm biến lạ, chặn lưu khi thiếu `}}` hoặc chưa sửa gì |
| Quản trị · Kiểm toán | Lọc theo khoảng ngày, bảng "trường · trước → sau" thay hai khối JSON (chỉ so các trường đã đổi), chi tiết có vai trò, IP, mã yêu cầu, thiết bị |
| Quản trị · Bảo mật | Nút "Chặn IP" ngay trên dòng đăng nhập thất bại, nhãn tiếng Việt cho phương thức và lý do |
| Quản trị · Sức khỏe | Bảng tổng hợp theo từng tác vụ nền (lần chạy cuối, kết quả, số lần và số lỗi 24 giờ, lỗi cuối) thay cho danh sách 40 lần chạy bị job 30 giây lấp hết; API trả `jobSummary` |
| Vận hành · Cơ sở | Tạo cơ sở bằng ngăn kéo đầy đủ (trước đây giờ làm việc gửi sai kiểu dữ liệu nên không tạo được): bản đồ chọn vị trí, tự điền địa chỉ, tải ảnh (tối đa 12, ảnh đầu là ảnh đại diện), giờ làm việc theo ngày; nút "Vị trí & ảnh" sửa cơ sở có sẵn; danh sách hiện ảnh đại diện thật |
| Trang công khai | Bản đồ Leaflet kiểu Gánh Mưu Sinh thay OpenStreetMap; video mở đầu là kho hàng thay cảnh phố; viết lại nội dung trang chủ ngắn gọn; bỏ hết màu xanh lá và nhãn chữ hoa kiểu máy |
| Dùng chung (đợt 2) | Ô nhập/chọn nhận đúng độ rộng được truyền; `PageHeader` nhận `back` là đường dẫn và vẽ liên kết "← Hợp đồng"; chuyển trang bằng router thay vì tải lại; nhãn loại hóa đơn, khoản mục và chuyển trạng thái bằng tiếng Việt |
| Dùng chung | `CardHead` không làm xuống dòng nút hành động; `ActBtn` có `ariaLabel` cho nút biểu tượng |

## Chưa rà soát chi tiết (làm tiếp, ưu tiên từ trên xuống)

1. Khách thuê: các tab Truy cập, Gia hạn, Trả kho của chi tiết hợp đồng; Đặt chỗ (+ chi tiết); chi tiết phiếu hỗ trợ; Tài khoản; Thông báo.
2. Nhân viên: Check-in (wizard), Trả kho, Việc, Khách hàng.
3. Quản lý: Cài đặt cơ sở (4 tab còn lại: Khu, Khung giờ hẹn, Ngày đóng cửa, Thông báo), Sơ đồ, Loại kho, Kho, Trả kho, Bảo trì, Đặt thuê, Hợp đồng. Dải giai đoạn của Công nợ mới chỉ kiểm tra kiểu dữ liệu vì CSDL demo chưa có hợp đồng quá hạn.
4. Vận hành: Cơ sở, So sánh, Khuyến mãi, Giá & phí, Đối soát, Tri thức AI, Hiệu quả AI, Mẫu thông báo.
5. Quản trị: Vai trò & quyền, Tổng quan an ninh (thêm thẻ sức khỏe và lỗi 5xx).
6. Dùng chung: Phiếu hỗ trợ, Khách hàng, Việc.

Cách làm cho mỗi trang: đo độ dày thật trên trình duyệt, so với API và đặc tả §6/§17, sửa phần thiếu, kiểm tra trên 375 px và 1280 px, chạy lại bộ kiểm thử.

## Lưu ý về dữ liệu demo

Bộ kiểm thử e2e ghi vào cơ sở dữ liệu demo (đặt kho, xuất bản chính sách…). Sau nhiều lần chạy, khách demo có hàng chục hợp đồng chờ ký, số dư tín dụng lớn, doanh thu ghi nhận âm và 10 phiên bản chính sách "E2E". Trước buổi demo thật, chạy lại dữ liệu mẫu cho sạch.
