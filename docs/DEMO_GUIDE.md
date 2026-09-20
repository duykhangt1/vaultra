# Hướng dẫn test và thuyết trình 7 flow — Vaultra

Bản chạy thật: **https://vaultra-844.pages.dev** (giao diện) · API: `https://vaultra-gateway.zerngulon.workers.dev`
Thời lượng gợi ý: **20–25 phút** (mỗi flow 2–4 phút). Mỗi flow gồm: *nói gì → bấm gì → kết quả mong đợi → lỗi hay gặp*.

## 0. Chuẩn bị trước giờ trình bày (10 phút)

| Việc | Cách làm |
|---|---|
| Làm nóng máy chủ | Mở trang chủ và đăng nhập thử một lần (lần đầu có thể chậm vài giây) |
| Tài khoản demo (mật khẩu chung do nhóm giữ) | `customer@vaultra.test` (khách) · `staff.hn@vaultra.test` (nhân viên Cầu Giấy) · `fm.hn@vaultra.test` (quản lý cơ sở Cầu Giấy) · `bom@vaultra.test` (quản lý vận hành) · `admin@vaultra.test` (quản trị) |
| Dùng 2 trình duyệt | Cửa sổ thường cho khách; cửa sổ ẩn danh cho nhân viên/quản lý. Đăng xuất khi đổi vai bằng menu avatar |
| Dọn đơn chờ | Mỗi khách giữ tối đa **3 đơn chờ thanh toán** (hết hạn sau 15 phút). Vào *Đặt chỗ* và hủy đơn cũ nếu có |
| Ngày thuê | Chọn **ngày bắt đầu là hôm nay** hoặc vài ngày tới để lịch hẹn nhận kho còn khung trống |
| Thanh toán thử | VNPay sandbox: thẻ NCB `9704198526191432198`, tên `NGUYEN VAN A`, ngày phát hành `07/15`, OTP `123456` |
| Ảnh để chụp kiểm tra kho | Chuẩn bị sẵn ≥ 4 ảnh trên máy (cần cho check-in) |
| Phương án dự phòng | Có sẵn video quay màn hình từng flow hoặc ảnh chụp, phòng mạng chậm |

**Câu mở đầu (30 giây):** *“Vaultra là hệ thống cho thuê kho tự quản. Khách đặt kho online, nhận kho tại cơ sở, quản lý thuê, thu phí, gia hạn, xử lý quá hạn và hỗ trợ. Hệ thống có 5 vai trò: Khách, Nhân viên, Quản lý cơ sở, Quản lý vận hành, Quản trị.”*

## Flow 1 — Đặt kho (Storage Unit Reservation)

**Vai trò:** Khách. **Nói:** *“Khách chọn kho, hệ thống tính giá và giữ chỗ, thanh toán xong đơn được xác nhận.”*

1. Trang chủ → **Đặt kho ngay** (hoặc *Cơ sở* → chọn cơ sở).
2. Chọn cơ sở và loại kho → xem **dải “Lịch trống 8 tuần tới”** (số *kho* còn trống theo ngày bắt đầu) → chọn ngày bắt đầu, thời hạn (1/3/6/12 tháng), có thể nhập mã khuyến mãi.
3. Xem **bảng giá**: tiền thuê, phí quản trị, tiền cọc, VAT, “số tiền thanh toán ngay”.
4. Chọn **ngày hẹn đến cơ sở** và **khung giờ** (“Còn 2 lịch trống” = còn 2 suất hẹn của khung đó).
5. Đồng ý điều khoản → **Thanh toán trực tuyến & giữ chỗ** → sang VNPay, thanh toán bằng thẻ thử → quay về trang đơn.

**Kết quả:** đơn chuyển *Chờ thanh toán → Đã xác nhận*; có hóa đơn, cọc, lịch hẹn. **Điểm nhấn:** giữ chỗ 15 phút; 100 người cùng đặt kho cuối cùng chỉ 1 người thành công (đã kiểm thử); bấm đúp nút không tạo đơn trùng.
**Lỗi hay gặp:** “đang có 3 đơn chờ thanh toán” → hủy bớt đơn cũ; khung giờ đã qua trong ngày không chọn được (đúng thiết kế).

## Flow 2 — Check-in và bàn giao (Check-in & Handover)

**Vai trò:** Nhân viên (+ Khách ký). **Nói:** *“Nhân viên đối soát đơn, gán kho, khách ký hợp đồng điện tử, lập biên bản hiện trạng rồi cấp mã PIN.”*

1. Nhân viên (`staff.hn`) → **Quét** → nhập mã đơn `RSV-…` → **Bắt đầu check-in**.
2. **Bước 1 Rà soát:** xác minh giấy tờ (4 ký tự cuối, tên khớp).
3. **Bước 2 Gán kho:** chọn mã kho (có thể đổi sang kho khác; đổi sang kho rẻ hơn → hệ thống tạo yêu cầu **hoàn tiền mặt**, đắt hơn → hóa đơn chênh lệch).
4. **Bước 3 Ký hợp đồng:** bấm **Gửi hợp đồng qua Email**. Xem **bản nháp PDF** (hợp đồng 11 điều khoản). Sau đó **chuyển sang cửa sổ của khách** → *Đặt chỗ* → mở đơn → nút ký hợp đồng → vẽ chữ ký → xác nhận. Màn hình nhân viên tự chuyển sang Bước 4.
5. **Bước 4 Bàn giao:** điền **biên bản hiện trạng** (chụp ≥ 4 ảnh, đánh giá từng hạng mục) → **Hoàn tất bàn giao & cấp mã PIN**. Mã PIN 6 số hiện trên màn hình.

**Kết quả:** hợp đồng *Đang hiệu lực*, kho *Đang thuê*, đơn *Đã nhận kho*, khách thấy mã PIN trong tài khoản. **Điểm nhấn:** không thể cấp PIN khi chưa ký hợp đồng và chưa có biên bản đủ ảnh (đã kiểm thử); mã PIN không gửi qua email; chữ ký ghi kèm hash SHA-256.
**Lỗi hay gặp:** email thật không gửi trong môi trường thử → khách ký ngay trong tài khoản như bước 4; cần đủ 4 ảnh mới lưu được biên bản.

## Flow 3 — Quản lý kho đang thuê & Trả kho hoàn tiền mặt (Rented Unit Management & Move-out)

**Vai trò:** Khách, Nhân viên, Quản lý cơ sở (FM) / BOM. **Nói:** *“Sau khi nhận kho, khách theo dõi hợp đồng, hóa đơn, mã truy cập và có thể trả kho; nhân viên kiểm tra hiện trạng, trình FM/BOM duyệt hoàn tiền mặt và chi tiền mặt trực tiếp cho khách tại quầy.”*

1. Khách → **Hợp đồng** → mở hợp đồng: thời hạn, tiền thuê, **mã PIN** (giữ để hiện), tài liệu PDF, hóa đơn kỳ tới.
2. Khách → **Yêu cầu trả kho** → chọn ngày (báo trước 7 ngày), xem **ước tính quyết toán**.
3. Nhân viên → **Trả kho** (tab *Đang xử lý / Chưa hoàn tiền*) → Bước 1 **Kiểm tra kho**: chụp ảnh trả kho, đối chiếu ảnh lúc nhận, ghi hư hại/phí dọn dẹp (nếu có) → Bước 2 **Quyết toán & ký**: khách ký xác nhận (trạng thái chuyển sang **`● Chưa hoàn tiền`**).
4. Quản lý cơ sở (FM) hoặc BOM → vào **Trả kho** hoặc **Phê duyệt** → bấm **`[✓ FM/BOOM Duyệt hoàn tiền mặt]`** (trạng thái chuyển sang **`● Chưa hoàn tiền (Chờ chi tiền mặt)`**).
5. Nhân viên → tại Bước 3 (**Hoàn tiền mặt & Kiểm tra cuối**): xuất tiền mặt giao cho khách và bấm **`[💵 Xác nhận đã chi tiền mặt cho khách]`**, sau đó tích chọn tình trạng kho cuối (**Sẵn sàng cho thuê**) → trạng thái chuyển sang **`● Đã hoàn tiền & Hoàn tất`**.

**Kết quả:** hợp đồng *Đã kết thúc → Đã đóng*, tiền cọc được hoàn bằng tiền mặt có phê duyệt của cấp quản lý, PIN bị thu hồi, kho mở bán lại. **Điểm nhấn:** đối chiếu ảnh nhận kho và trả kho; trạng thái luôn giữ ở *Chưa hoàn tiền* cho đến khi nhân viên xác nhận đã chi tiền mặt cho khách.

## Flow 4 — Quy tắc, phí và doanh thu (Business Rules, Fees, Revenue)

**Vai trò:** Quản lý vận hành (BOM), Quản lý cơ sở. **Nói:** *“Mọi quy tắc nghiệp vụ là tham số có phiên bản, không nằm trong mã; quản lý theo dõi doanh thu và duyệt các khoản đặc biệt.”*

1. BOM → **Chính sách** → tạo bản nháp (ví dụ đổi tiền cọc hoặc số ngày ân hạn) → **xem tác động** lên hợp đồng đang chạy → **xuất bản** (có thể hẹn ngày hiệu lực).
2. BOM → **Giá & phí** (bảng giá theo loại kho, danh mục phụ phí) và **Khuyến mãi** (tạo mã giảm giá, giới hạn lượt dùng).
3. FM → **Hóa đơn**: thêm phụ phí, ghi giảm, **đề xuất miễn phí**; vượt hạn mức → chuyển BOM duyệt tại **Phê duyệt**; **hoàn tiền** vượt hạn mức cũng cần BOM.
4. BOM → **Đối soát** (so khớp thanh toán) và **Tổng quan / Báo cáo**: doanh thu, tỷ lệ lấp đầy, công nợ theo tuổi nợ, xuất CSV/XLSX/PDF.

**Điểm nhấn:** hợp đồng cũ giữ nguyên chính sách lúc ký (snapshot); phân quyền hạn mức FM/BOM; VAT tính trên số tiền sau giảm giá; số liệu tiền dùng số thập phân chính xác.

## Flow 5 — Cơ sở và nhân sự (Facility Storage & Staff Management)

**Vai trò:** BOM, Quản lý cơ sở, Nhân viên. **Nói:** *“Quản lý tạo cơ sở, sơ đồ kho, loại kho và xếp ca cho nhân viên; việc được tự giao theo ca.”*

1. BOM → **Cơ sở** → **Tạo cơ sở**: nhập thông tin, chọn **vị trí chính xác trên bản đồ**, tải ảnh.
2. FM → **Sơ đồ** (mặt bằng khu, lọc theo trạng thái, rê chuột xem kho) → **Loại kho**, **Kho** (đổi trạng thái: bảo trì, ngưng dùng).
3. FM → **Lịch ca**: tạo mẫu ca, xếp ca tuần cho nhân viên (hệ thống chặn ca chồng nhau, cảnh báo quá 48 giờ/tuần) → **Xuất bản**.
4. Nhân viên → **Ca làm** → xem lịch, **xin đổi ca** → FM duyệt ở **Phê duyệt**.
5. FM → **Công việc** (việc tự sinh: bàn giao, kiểm tra, vệ sinh; tự giao cho người đang có ca) và **Bảo trì** (phiếu sửa chữa, kế hoạch định kỳ).

**Điểm nhấn:** phân quyền theo cơ sở (nhân viên Cầu Giấy không thấy dữ liệu Quận 7). **Nói thẳng khi được hỏi:** ca chỉ là lịch kế hoạch dùng để chia việc, chưa có chấm công “vào ca/ra ca”; đúng với đặc tả hiện tại.

## Flow 6 — Gia hạn và xử lý quá hạn (Renewal & Overdue)

**Vai trò:** Khách, FM, BOM. **Nói:** *“Hệ thống tự mở cửa sổ gia hạn trước khi hết hạn; nếu quá hạn thanh toán sẽ đi qua chuỗi cảnh báo, khóa truy cập và xử lý, không có bước nào tự động hủy hợp đồng.”*

**Quan trọng:** bản chạy thật **không cho tua thời gian**, nên dùng **dữ liệu có sẵn** (khách `customer@vaultra.test` có nhiều hợp đồng đang quá hạn) để trình bày.

1. FM → **Công nợ**: danh sách hợp đồng theo giai đoạn **Ân hạn → Trễ hạn → Khóa truy cập → Thông báo cuối → Chờ chấm dứt**; mở một hợp đồng xem **ghi chú thu nợ**, **cam kết trả** (tối đa 7 ngày), **khóa chặn** có ảnh bằng chứng.
2. Giải thích mốc (chính sách mặc định): ân hạn 5 ngày → phí trễ → ngày 10 khóa → ngày 30 thông báo cuối → ngày 45 xin chấm dứt. Chấm dứt phải **FM xác nhận rồi BOM phê duyệt**.
3. FM → **Gia hạn**: các đề nghị gia hạn đang mở, giá kỳ mới (tăng tối đa 10%, báo trước 30 ngày). Khách → *Hợp đồng* → **Gia hạn** → chọn kỳ hạn, nhập OTP.
4. Khách thanh toán nợ → chuỗi quá hạn **tự khôi phục** và mở lại mã PIN.

**Muốn chạy chuỗi đầy đủ theo thời gian:** dùng bản máy cá nhân có đồng hồ giả (xem mục “Chứng minh bằng test”). Ở bản chạy thật, gọi điều này là *kịch bản đã được kiểm thử tự động*.

## Flow 7 — Yêu cầu hỗ trợ và xử lý sự cố (Support)

**Vai trò:** Khách, Nhân viên, FM. **Nói:** *“Mọi sự cố đi qua phiếu hỗ trợ có hạn xử lý (SLA) tính theo giờ làm việc, tự giao, leo thang và đo mức hài lòng.”*

1. Khách → **Hỗ trợ** → **Tạo yêu cầu**: chọn hợp đồng/kho, loại sự cố (mất chìa, hư kho, mã truy cập…), mô tả, đính kèm ảnh.
2. Nhân viên → **Hỗ trợ** → nhận phiếu → xem **thanh SLA** (phản hồi lần đầu, hạn giải quyết) → trả lời khách, dùng **gợi ý trả lời AI** nếu có.
3. Khi cần: **chờ khách**, **leo thang** lên FM/BOM (sự cố mất đồ tự leo thang và đính kèm nhật ký ra vào 30 ngày).
4. Nhân viên **giải quyết** (bắt buộc chọn nguyên nhân/ghi chú; hư kho cần ảnh sau xử lý) → khách **đánh giá 1–5 sao**; không hài lòng thì **mở lại trong 7 ngày**.
5. Nói thêm: phiếu thanh toán gắn hóa đơn sẽ **tạm dừng chuỗi quá hạn tối đa 7 ngày** để tránh phạt oan, nhưng không thể kéo dài vô hạn.

**Lưu ý:** trợ lý AI dùng phản hồi dự phòng cho đến khi đặt khóa Gemini mới.

## Kết thúc buổi trình bày (1 phút)

*“Hệ thống phủ đủ 7 luồng, đã được kiểm toán bảo mật và nghiệp vụ, có bộ kiểm thử tự động gồm hơn 160 kiểm tra tích hợp, và đang chạy thật trên Cloudflare (Pages, Workers, R2).”*

## Chứng minh bằng test (nếu hội đồng hỏi)

```bash
pnpm install
pnpm test                                    # unit: 16 + shared: 3
pnpm --filter @vaultra/api test:audit        # thuật toán tiền/ngày
pnpm --filter @vaultra/api test:e2e          # 7 flow qua API (cần DB MySQL và VNPAY_TMN_CODE/VNPAY_HASH_SECRET trong apps/api/.env)
```

Bộ `apps/api/test/audit/audit-findings.ts` kiểm các lỗi đã sửa (36 kiểm tra) và có thể tua đồng hồ để chạy chuỗi **quá hạn** (ân hạn → khóa → thông báo cuối). Báo cáo kiểm toán: `AUDIT_REPORT.md`.

## Câu hỏi hay gặp và cách trả lời

| Câu hỏi | Trả lời ngắn |
|---|---|
| Hai người đặt cùng một kho thì sao? | Khóa theo loại kho khi đặt; 100 yêu cầu đồng thời chỉ 1 thành công |
| Thanh toán thiếu tiền? | Không ghi nhận là đã trả; đánh dấu lệch để đối soát |
| Khách bấm hai lần? | Mỗi thao tác tiền có khóa chống trùng (Idempotency-Key) |
| Ai xem được mã PIN? | Chủ hợp đồng; nhân viên cơ sở có thể xem nhưng mọi lần xem đều ghi nhật ký |
| Dữ liệu cơ sở khác? | Phân quyền theo cơ sở, truy cập ngoài phạm vi trả “không tìm thấy” |
| Hợp đồng có giá trị pháp lý? | Căn cứ Luật Giao dịch điện tử 2023: chữ ký điện tử + mã băm SHA-256 + dấu hệ thống |
| Còn hạn chế nào? | Chưa có chấm công vào/ra ca; cập nhật thời gian thực trên bản Cloudflare chưa đẩy tức thì; email thật chưa cấu hình |
