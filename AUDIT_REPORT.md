# AUDIT_REPORT — Vaultra Self-Storage (kiểm toán toàn diện)

> **Cập nhật sau đợt sửa lỗi (2026-11-08):** 42/46 vấn đề đã sửa và có bằng chứng kiểm thử, 4 còn mở (xem §17). Bộ test audit giờ **xanh hoàn toàn**: `audit-findings` 36/36, `audit.unit` 5/5, e2e 167/167, unit 16/16, shared 3/3. Các mục §4–§15 giữ nguyên làm hồ sơ phát hiện ban đầu.

- Ngày kiểm toán: 2026-11-08 · Commit gốc: `43d6c63` (`main`) · Phạm vi mã: `apps/api` (NestJS 11 + Prisma 7 + MySQL), `apps/web` (React 18 + Vite), `packages/shared`, `apps/gateway` (Cloudflare Worker).
- Giai đoạn này **chỉ audit**: không sửa mã nghiệp vụ. Các file thêm mới duy nhất là bộ test: [`apps/api/test/audit/audit-findings.ts`](apps/api/test/audit/audit-findings.ts) (tái hiện qua API thật) và [`apps/api/test/audit/audit.unit.ts`](apps/api/test/audit/audit.unit.ts) (thuật toán/tiền tệ). Hai file này **được viết để FAIL cho đến khi lỗi được sửa**; chúng nằm ngoài `test/unit` nên `pnpm test` mặc định vẫn xanh. Chạy bằng `pnpm --filter @vaultra/api test:audit`.
- Môi trường thử: DB riêng `vaultra_audit` (đã migrate + seed), API chạy cổng 4100, payOS giả (`test/fake-payos.ts`), đồng hồ giả của API cho các luồng theo thời gian. **Không** chạm DB dev `vaultra`, **không** chạm production (Cloudflare Pages/Worker/R2).

**Cách đọc nhãn bằng chứng**

| Nhãn | Ý nghĩa |
|---|---|
| **[R] Đã tái hiện** | Có test chạy thật và thất bại đúng như mô tả (nêu tên test). |
| **[C] Xác định qua code** | Đọc code và lập luận chặt chẽ, chưa có test chạy chứng minh. |
| **[P] Rủi ro cần kiểm tra thêm** | Có dấu hiệu nhưng chưa xác nhận được trong môi trường được phép. |

---

## 1. Executive Summary

Hệ thống build được, 16 unit test sẵn có và đa số e2e sẵn có chạy xanh (RBAC 53/53, tranh chấp đồng thời 100 request → 1 thành công, payOS 18/18, F1 11/11, F3 15/15, F4–F7 35/35). Tuy nhiên audit tìm ra **46 vấn đề**, trong đó **3 Critical** và **18 High**; **28 vấn đề đã được tái hiện bằng test** (15 qua phân tích code, 3 là rủi ro cần kiểm tra thêm).

Ba rủi ro lớn nhất:

1. **Chiếm tài khoản qua CORS/CSRF quá rộng (SEC-01, [R])** — bất kỳ trang `https://<tên>.pages.dev` / `*.workers.dev` / `*.trycloudflare.com` nào cũng được gọi API kèm cookie đăng nhập và đọc được `accessToken`. Kẻ tấn công chỉ cần dựng một trang miễn phí trên `pages.dev`.
2. **Chiếm hồ sơ khách hàng bằng cách đăng ký trước (SEC-02, [R])** — đăng ký bằng email của khách do quầy tạo (chưa xác minh email) sẽ gắn thẳng vào hồ sơ khách đó (hợp đồng, hóa đơn, PIN kho).
3. **Khóa API Gemini nằm trong mã nguồn đã push lên `origin/main` (SEC-03, [R])** — 5 khóa ở `apps/api/src/common/config.ts:76-77` (commit `c636b8b`). Cần coi là đã lộ và thu hồi ngay.

Các lỗi nghiệp vụ nghiêm trọng nhất: check-in hoàn tất không cần kiểm tra hiện trạng/ảnh/cấp quyền truy cập (BIZ-01 — **chính e2e F2 của dự án đang đỏ vì lỗi này**), nhân viên đặt kho không chỉ định khách sẽ đặt nhầm vào khách hàng đầu tiên trong DB (BIZ-02), chấm dứt hợp đồng trực tiếp để nguyên kho/PIN/lịch thu phí (BIZ-03), webhook thanh toán thiếu tiền vẫn xác nhận đủ (FIN-02), VAT trên hóa đơn sai (FIN-01/03), khách có thể "đóng băng" chuỗi quá hạn vô thời hạn bằng ticket tranh chấp (BIZ-06).

**Kết luận không phải "an toàn":** các phần chưa kiểm thử được (xem §16.3) — nhất là Worker `apps/gateway` dùng tầng lưu trữ riêng trên R2 (không phải MySQL) — vẫn là vùng rủi ro mở.

## 2. Project Architecture Overview

| Lớp | Công nghệ | Ghi chú kiểm toán |
|---|---|---|
| API | NestJS 11 / Express 5, Prisma 7 (adapter MariaDB), Zod, JWT (jose), Argon2 | 14.7k dòng không tính `generated/`; guard toàn cục `AuthGuard` → quyền theo decorator `@RequirePermission`, phạm vi dữ liệu OWN/FACILITY/GLOBAL trong `AccessContext` |
| DB | MySQL/MariaDB, 104 model, 3 migration, tiền dùng `Decimal` (không có Float) | Ít `CHECK` (chỉ ở vài bảng); khóa duy nhất cho PIN/phân bổ dựa cột sinh |
| Web | React 18 + Vite + Tailwind 4, react-query, GSAP/Three | typecheck + build xanh; không có test, không có lint |
| Shared | `packages/shared` (state machine, ma trận quyền, policy) | script `test` chạy 0 test |
| Edge | `apps/gateway`: Worker + Durable Object + R2 làm "DB" (`_db/vaultra-diff-v1.json`), bundle lại service Nest bằng shim | **Khác hẳn tầng dữ liệu của API MySQL** — chưa kiểm thử (§16.3) |
| Luồng chính | Báo giá → đặt chỗ (khóa hàng `unit_types FOR UPDATE`) → thanh toán payOS/VNPay → check-in 4 bước → hợp đồng → hóa đơn định kỳ → quá hạn (hourly job) → gia hạn → trả kho/quyết toán; ticket hỗ trợ + SLA | Mỗi luồng được phân tích ở §8 |

Kết luận kiến trúc tích cực (có bằng chứng): SQL động chỉ dùng tagged template tham số hóa (không thấy SQL injection); mọi controller đều đi qua `AuthGuard`; 33 handler không có `@RequirePermission` đều tự kiểm tra phạm vi bên trong; không có `dangerouslySetInnerHTML` ở web; tranh chấp kho dùng khóa hàng và test 100 request đồng thời đạt.

## 3. Total Issues Found

| Mức độ | Số lượng | Đã tái hiện [R] | Qua code [C] | Cần kiểm tra thêm [P] |
|---|---|---|---|---|
| Critical | 3 | 3 | 0 | 0 |
| High | 18 | 16 | 1 | 1 |
| Medium | 19 | 7 | 10 | 2 |
| Low | 6 | 2 | 4 | 0 |
| **Tổng** | **46** | **28** | **15** | **3** |

Đã kiểm tra và **không** tái hiện được: khóa tài khoản bị vượt bằng đoán mật khẩu song song (SEC-05 — khóa hoạt động đúng với 12 request song song), SQL injection, XSS qua `dangerouslySetInnerHTML`, rò rỉ chéo cơ sở của danh sách (RBAC e2e 53/53).

## 4. Critical Issues

### SEC-01 — CORS/CSRF tin mọi origin `*.pages.dev`, `*.workers.dev`, `*.trycloudflare.com` kèm credentials [R]
- **Severity:** Critical · **Module:** Auth/CORS · **File:** `apps/api/src/main.ts:33-47`, `apps/api/src/auth/auth.controller.ts:30-43`, `apps/gateway/src/index.ts:27-33`
- **Mô tả:** `isAllowedOrigin` và `checkOrigin` dùng regex wildcard. Cookie `rt` (refresh) khi chạy HTTPS là `SameSite=None; Secure` (`auth.controller.ts:20-27`), nên trình duyệt gửi kèm từ trang bên thứ ba.
- **Điều kiện tái hiện:** nạn nhân đã đăng nhập Vaultra, mở trang `https://attacker.pages.dev` (đăng ký miễn phí) chạy `fetch('<api>/v1/auth/refresh',{method:'POST',credentials:'include'})`.
- **Expected:** origin lạ bị từ chối (403), không có `Access-Control-Allow-Origin`.
- **Actual:** `Access-Control-Allow-Origin: https://attacker-….pages.dev`, `Allow-Credentials: true`, và `/auth/refresh` trả **200 + accessToken** (test SEC-01a/b).
- **Root cause:** allow-list theo hậu tố miền dùng chung thay vì danh sách chính xác.
- **Đề xuất:** chỉ cho phép đúng `APP_ORIGIN` + danh sách `EXTRA_ORIGINS` cấu hình (so sánh bằng `===`); bỏ wildcard; áp dụng cùng danh sách cho gateway; cân nhắc `SameSite=Lax` + đổi refresh sang cùng site.
- **Test xác nhận:** `audit-findings.ts` SEC-01a, SEC-01b phải ✔.

### SEC-02 — Đăng ký trước chiếm hồ sơ khách do quầy tạo [R]
- **Severity:** Critical · **File:** `apps/api/src/auth/auth.service.ts:101-106`, `apps/api/src/billing/billing.controller.ts:369-381`
- **Mô tả:** `createCustomerUser` gắn user mới vào bất kỳ `customer` cùng email có `user_id = null` **ngay lúc đăng ký**, dù email chưa xác minh (`verified:false`).
- **Tái hiện:** nhân viên tạo khách `victim@x` ở quầy → kẻ tấn công `POST /auth/register` với email đó → đăng nhập được ngay.
- **Expected:** chỉ liên kết sau khi email được xác minh (token EMAIL_VERIFY) hoặc bằng quy trình claim có xác thực.
- **Actual:** `login.user.customerId` của kẻ tấn công **trùng** `customer.id` của nạn nhân, `emailVerified:false` (test SEC-02). Người dùng chưa xác minh vẫn đọc được hợp đồng/hóa đơn/PIN (`requireVerified` chỉ chặn đặt kho/thanh toán).
- **Root cause:** liên kết hồ sơ trước khi chứng minh sở hữu email.
- **Đề xuất:** chuyển bước `linked` vào `verifyEmail`; trước đó chỉ tạo customer mới; cho `GET` dữ liệu khách yêu cầu `emailVerified`.
- **Test:** SEC-02 ✔.

### SEC-03 — Khóa bí mật nằm trong mã nguồn đã push [R]
- **Severity:** Critical · **File:** `apps/api/src/common/config.ts:76-77` (5 khóa `AQ.Ab8R…`), commit `c636b8b`, đã có trên `origin/main`.
- **Mô tả/Actual:** khóa Gemini dùng làm giá trị mặc định của `GEMINI_API_KEY(S)`; ai đọc repo đều dùng được, tốn hạn mức/chi phí của chủ khóa.
- **Đề xuất:** thu hồi 5 khóa ngay ở Google AI Studio, bỏ giá trị mặc định (rỗng = tắt AI, fallback đã có), làm sạch lịch sử git (`git filter-repo`) nếu repo công khai, thêm secret-scanning vào CI.
- **Test:** SEC-03a ✔ (không còn literal `AQ.Ab8R` trong `config.ts`).

## 5. High Severity Issues

### BIZ-01 — `POST /checkin-sessions/:id/complete` bỏ qua kiểm tra hiện trạng, ảnh tối thiểu và bước cấp truy cập [R]
- **File:** `apps/api/src/checkin/checkin.service.ts:436-443` (chỉ đòi identity/unit/contract), `:461-485` (tự tạo biên bản hiện trạng "OK" không ảnh), `:453-456` (tự cấp PIN).
- **Expected (Spec §6.2 rule 1):** không bàn giao/cấp PIN khi chưa có biên bản ≥ `min_handover_photos` (4) và chưa qua bước cấp truy cập.
- **Actual:** nhân viên gọi thẳng `/complete` → `201 {status:'ACTIVE', pinCode:…}`; hợp đồng ACTIVE, kho OCCUPIED, PIN phát ra, không ảnh nào. **E2E sẵn có `f2-checkin.ts` đang đỏ** ("cannot hand over before access is issued", 21/24).
- **Root cause:** commit `1a8240f` thêm tự sinh PIN/biên bản trong `complete` để đi tắt, phá hard-gate.
- **Đề xuất:** `complete` phải đòi `steps.inspection && steps.access`; xóa đoạn tự tạo inspection; giữ tự cấp PIN chỉ khi bước 6 đã xong.
- **Test:** `audit-findings` BIZ-01 và `e2e/f2-checkin` (3 assertion đỏ) phải ✔.

### BIZ-02 — Nhân viên tạo đặt chỗ không chỉ định khách sẽ gắn vào khách đầu tiên trong DB [R]
- **File:** `apps/api/src/reservation/reservation.service.ts:54-66` (`fallbackCustomer = findFirst({orderBy:{id:'asc'}})`).
- **Actual:** `POST /reservations` bằng `staff.hn` không có `customerId` → `201`, đơn thuộc `CUS-SEED-0001` (khách thật không liên quan); hóa đơn, thông báo, cọc, hợp đồng sẽ gắn nhầm người.
- **Expected:** 4xx "thiếu khách hàng".
- **Root cause:** nhánh `fallback` dành cho user chưa có hồ sơ khách nhưng áp cho cả nhân viên.
- **Đề xuất:** xóa nhánh fallback; tự tạo hồ sơ khách cho tài khoản CUSTOMER thiếu hồ sơ; staff bắt buộc `customerId`.
- **Test:** BIZ-02 ✔.

### BIZ-03 — `POST /contracts/:id/terminate` chấm dứt nhưng không thu hồi gì [R]
- **File:** `apps/api/src/contract/contract.controller.ts:160-175` (dòng 169 `tx.contract.update` thẳng, bỏ `setContractStatus`).
- **Actual:** sau terminate: hợp đồng `TERMINATED`, **kho vẫn OCCUPIED**, **PIN vẫn ACTIVE**, lịch thu phí, hóa đơn mở, cọc, yêu cầu trả kho không xử lý (BIZ-03b/c).
- **Expected:** như luồng default (`delinquency.decideTermination`): thu hồi truy cập, kết thúc lịch phí, cấn trừ cọc, kho → `PENDING_INSPECTION`.
- **Đề xuất:** tách helper `terminateContract(tx,…)` dùng chung; endpoint gọi helper và không bỏ qua state machine.
- **Test:** BIZ-03b, BIZ-03c ✔.

### BIZ-04 — Đổi lịch hẹn hủy lịch cũ trước khi kiểm tra lịch mới [R]
- **File:** `apps/api/src/reservation/reservation.controller.ts:200-208`: `cancelAppointment` rồi mới `bookAppointment`, hai transaction riêng.
- **Actual:** đổi sang ngày không hợp lệ/khung đầy → lỗi 400 nhưng lịch gốc đã `CANCELLED` (reservation lùi trạng thái, task bị hủy).
- **Đề xuất:** làm trong **một** transaction; kiểm tra lịch mới trước, đổi trạng thái cũ sau.
- **Test:** BIZ-04 ✔.

### BIZ-05 — `max_pending_reservations` bị bỏ qua [R]
- **File:** `reservation.service.ts:95` `Math.max(policy.max_pending_reservations, 20)`.
- **Actual:** chính sách 3, khách tạo được 6 đơn chờ thanh toán (mỗi đơn giữ kho 15 phút → có thể chiếm hết kho).
- **Đề xuất:** dùng đúng giá trị chính sách. **Test:** BIZ-05 ✔.

### BIZ-06 — Ticket "PAYMENT" gắn hóa đơn khiến chuỗi quá hạn dừng vô thời hạn [R]
- **File:** `support.service.ts:104` (đặt `dispute_hold=true` ngay khi tạo, mọi vai trò), `delinquency.service.ts:103-106`.
- **Actual:** sau 66 ngày quá hạn (khóa ngày 10, chấm dứt ngày 45) hợp đồng vẫn `LATE`; không khóa cửa, không thông báo cuối, không yêu cầu chấm dứt. Khách chỉ cần mở ticket rồi bỏ.
- **Đề xuất:** hold chỉ có hiệu lực sau khi FM chấp nhận, có hạn (vd 7 ngày), tối đa 1 hold/hóa đơn, tự hết hạn.
- **Test:** BIZ-06 ✔.

### BIZ-07 — Nhân viên thấy link/token ký của khách; chữ ký ghi nhầm phương thức [R]
- **File:** `checkin.service.ts:308-318` và `reservation.controller.ts:98-111` (trả `signUrl` có `rawToken`), `contract.service.ts:270` (`method:'OTP_EMAIL'`, `otp_verified_at:now` dù không có OTP).
- **Actual:** nhân viên mở `signUrl` và ký thay khách (`sign-by-email` 201). Bản ghi chữ ký khẳng định đã xác thực OTP → chứng cứ pháp lý sai.
- **Đề xuất:** không trả token cho staff (chỉ gửi email); thêm method `EMAIL_LINK`; `otp_verified_at = null`.
- **Test:** BIZ-07a, BIZ-07b ✔.

### FIN-01 — Hóa đơn giá đã gồm VAT ghi `tax_total = 0`, thuế dòng lệch báo giá [R]
- **File:** `apps/api/src/domain/core.service.ts:145-150, 168`.
- **Actual:** chính sách mặc định (VAT 10 %, giá đã gồm VAT): báo giá `taxTotal = 71 818`, hóa đơn `tax_total = 0`, tổng thuế dòng = 71 818 (không khớp, vì dòng DISCOUNT không được trừ). Unit test: kỳ vọng 81 818 (rent 1 000 000 − 200 000 + phí 100 000), thực tế 0.
- **Ảnh hưởng:** báo cáo thuế/hóa đơn điện tử sai.
- **Đề xuất:** tính thuế trên số tiền **sau** giảm giá, và luôn ghi `tax_total` (phần thuế nằm trong giá khi inclusive).
- **Test:** `FIN-01` (API) + `audit.unit.ts › FIN-01` ✔.

### FIN-02 — Webhook payOS thiếu tiền vẫn thanh toán đủ hóa đơn [R]
- **File:** `payment.service.ts:184-189`: chỉ gắn `reconciliation_status=MISMATCH` rồi `SUCCEEDED` với `payment.amount`.
- **Actual:** webhook hợp lệ báo 1 000 ₫ cho đơn 1 480 000 ₫ → đơn `CONFIRMED`, hóa đơn PAID.
- **Đề xuất:** nếu `out.amount !== payment.amount` → không áp dụng, giữ `PENDING`/`REVIEW`, báo kế toán; hoặc phân bổ đúng số nhận.
- **Test:** FIN-02 ✔.

### FIN-03 — Hóa đơn giá chưa gồm VAT: VAT tính trên số tiền **trước** giảm giá [R]
- **File:** `core.service.ts:150` (bỏ DISCOUNT khi cộng thuế). Unit test: rent 1 000 000, giảm 200 000, VAT 10 % → thuế 100 000, tổng 900 000; đúng là 80 000 / 880 000 (thu dư 20 000).
- **Test:** `audit.unit.ts › FIN-03` ✔.

### SEC-04 — Giới hạn tốc độ theo header client tự khai [R]
- **File:** `apps/api/src/common/http.ts:36` (`cf-connecting-ip`/`x-forwarded-for` đọc thẳng).
- **Actual:** 45 request tới endpoint 30/phút: đối chứng bị 429 (16 lần); xoay `X-Forwarded-For` → **0** lần bị chặn. Vô hiệu hóa giới hạn login/register/promotions/quotes.
- **Đề xuất:** dùng `req.ip` (đã `trust proxy`) và chỉ tin `cf-connecting-ip` khi request đến từ dải Cloudflare/Worker có chữ ký.
- **Test:** SEC-04 ✔.

### SEC-06 — `POST /customers` trả hồ sơ khách bất kỳ (IDOR) [R]
- **File:** `billing.controller.ts:372-376` (`return ex` khi email đã tồn tại, không kiểm tra phạm vi).
- **Actual:** staff HN gửi email của khách Q7 → `201` kèm toàn bộ bản ghi (SĐT, giấy tờ 4 số cuối, số dư…) trong khi `GET /customers/:id` trả 404.
- **Đề xuất:** nếu khách tồn tại ngoài phạm vi → trả 409 mà không lộ dữ liệu, hoặc trả bản rút gọn.
- **Test:** SEC-06 ✔.

### SEC-07 — `GET /contracts/:id/sign-email-info` lộ PII của hợp đồng đã ký với token bất kỳ [R]
- **File:** `contract.service.ts:213-226` (`!tok && status !== SIGNED/ACTIVE` mới chặn).
- **Actual:** token rác ≥10 ký tự → 200 kèm email, SĐT khách, PDF hợp đồng (URL ký sẵn). Cần biết `contractId` (ULID), nhưng ID xuất hiện trong URL/email.
- **Đề xuất:** luôn xác minh token (cho phép token đã dùng) hoặc trả tối thiểu.
- **Test:** SEC-07 ✔.

### SEC-10 — Refresh token để trong `localStorage` và trả qua header đọc được từ JS [C]
- **File:** `apps/web/src/lib/api.ts:19-27`, `apps/gateway/src/edge-app.ts:267-268, 346`, `apps/gateway/src/index.ts:38-39`.
- **Mô tả:** Worker đặt `X-Refresh-Token` (expose qua CORS) và chấp nhận header thay cookie; web lưu vào `localStorage`. Mọi XSS (hoặc origin wildcard của SEC-01) lấy được token sống 14–30 ngày; vô hiệu hóa `httpOnly`.
- **Đề xuất:** quay lại cookie `httpOnly` cùng site (đặt Pages & Worker cùng domain tùy chỉnh) hoặc dùng token ngắn hạn + rotation.

### SEC-11 — `SERVICE_TOKEN_SECRET` mặc định công khai và không bị chặn ở production [R]
- **File:** `config.ts:30`, `auth/jwt.service.ts:30` (chỉ yêu cầu JWT_* và FIELD_ENCRYPTION_KEY khi `isProd`); `pinLookupHash` (`common/util.ts`) và HMAC cookie OAuth cũng dùng chung bí mật này.
- **Actual:** `.env` của repo đang dùng đúng giá trị mặc định → token dịch vụ ký bằng giá trị công khai được chấp nhận (SEC-03c). Nếu production thiếu biến: ai cũng gọi `/internal/jobs/*` (chạy job quá hạn, hoàn tiền…) và dò PIN (băm HMAC với khóa công khai, PIN 6 số).
- **Đề xuất:** bắt buộc giá trị ≥32 byte ngẫu nhiên ở production; tách bí mật cho PIN-lookup/OAuth.
- **Test:** SEC-03b, SEC-03c ✔.

### SEC-12 — Tài khoản demo mật khẩu chung `12345` nằm trong file được theo dõi [P]
- **File:** `tkmk.txt` (tracked), `apps/api/prisma/seed-demo.ts:16`, `apps/gateway/src/seed-data.json`.
- **Rủi ro:** nếu DB triển khai (Worker) chứa các tài khoản `admin@/bom@/fm.*` với mật khẩu này thì ai cũng đăng nhập quản trị. Theo quy tắc audit **không thử đăng nhập production**; cần chủ hệ thống tự kiểm tra và đổi/xóa tài khoản demo.

### DB-01 — Hai bộ đếm mã khách hàng cùng sinh `CUS-000001` → đăng ký/tạo khách bị 409 [R]
- **File:** `auth.service.ts:105` (`nextCode(tx,'CUS',year,6,false)`) và `billing.controller.ts:378` (`nextCode(tx,'CUS',0,6,false)`); `customers.code` là `UNIQUE`.
- **Actual:** sau khi quầy tạo một khách (`CUS-000002`), một người tự đăng ký email mới nhận `409 Dữ liệu bị trùng`. Lỗi lặp lại mỗi khi hai bộ đếm trùng số.
- **Đề xuất:** dùng một chuỗi duy nhất (`year=0`) cho mã khách; migrate các mã trùng.
- **Test:** DB-01 ✔.

### DEP-01 — 33 lỗ hổng phụ thuộc (11 high) [R]
- `pnpm audit --prod`: `nodemailer@6` (RCE/DoS/TLS bypass — vá ở ≥10.0.13), `mariadb@3.4.5` (SQL injection ở text protocol, lộ mật khẩu), `multer` DoS, `zod` memory exhaustion. Đề xuất nâng cấp và bật Renovate/Dependabot.

## 6. Medium Severity Issues

| ID | Tiêu đề · file:dòng | Bằng chứng | Mô tả / Expected vs Actual | Đề xuất · Test |
|---|---|---|---|---|
| BIZ-08 | Đặt lịch vào khung giờ đã qua trong ngày · `reservation.service.ts:517, 551` | [R] BIZ-08a/b | 17:45 vẫn đặt được khung 09:00–12:00; `past` chỉ so ngày. Expected: từ chối khung đã kết thúc. | So sánh `scheduled_end` với `now`. Test BIZ-08 |
| BIZ-09 | Đặt lịch trả kho cho hợp đồng ở trạng thái bất kỳ · `reservation.service.ts:535-540` | [C] | Nhánh MOVE_OUT không kiểm tra `contract.status` (TERMINATED/CLOSED/CANCELLED vẫn nhận lịch). | Chỉ ACTIVE/EXPIRED/MOVE_OUT_SCHEDULED. |
| BIZ-10 | Ngày thu phí trôi sau tháng ngắn · `billing.service.ts:57,73` | [R] `audit.test › BIZ-10` | Hợp đồng bắt đầu 31/01, 12 tháng → 13 kỳ (28/01/2027 vẫn xuất hóa đơn một tháng đầy đủ dù hợp đồng hết 31/01). `addMonths` nối chuỗi làm ngày thu rơi về 28. | Tính `addMonths(start, k*period)` theo chỉ số kỳ; dùng `billing_day`. |
| ALG-01 | Hoàn tiền tháng trả trước chưa dùng sai biên · `moveout.service.ts:44-54` | [R] `audit.test › ALG-01` | Bắt đầu 01/07, hết 01/01, trả 01/09 → hoàn 3 tháng (3 000 000) thay vì 4 (xấp xỉ `/30.44`). | Đếm tháng bằng so sánh ngày lịch, không chia số ngày. |
| BIZ-11 | Hạ hạng kho khi check-in không hoàn chênh lệch · `checkin.service.ts:146-172` | [C] | `diff = max(0, new−old)`, `due_now_total = max(old,new)`, cọc chỉ tăng; hóa đơn chênh lệch luôn `pricesIncludeVat:true` (dòng 182). Khách đã trả giá cao nhưng nhận kho rẻ hơn không được hoàn. | Tạo credit note/hoàn cọc phần chênh; dùng cờ VAT của chính sách. |
| BIZ-12 | Miễn giảm vượt giá trị dòng phí · `billing.service.ts:164-166` | [C] | Chỉ so từng đề xuất với `item.amount`; hai đề xuất cùng dòng có thể cộng quá giá trị dòng. | Trừ tổng đề xuất PENDING/APPROVED hiện có. |
| BIZ-13 | Hai yêu cầu gia hạn song song tạo hóa đơn mồ côi · `renewal.service.ts:175-206` | [P] chưa tái hiện (cần 2 request cùng lúc) | Không khóa hàng offer/contract; khóa `Idempotency-Key` khác nhau → hai hóa đơn RENEWAL, hóa đơn bị ghi đè thanh toán không kích hoạt gia hạn. | `SELECT … FOR UPDATE` trên offer + unique `invoice_id`. |
| BIZ-14 | Phân bổ thủ công bỏ qua phiếu bảo trì mở · `reservation.service.ts:285-300` so với `:258-267` | [C] | `suggestions` loại kho có work order mở, `assign` thì không. | Dùng chung điều kiện. |
| FIN-04 | `balance_cached` có thể lệch dưới tải · `core.service.ts:106-107` | [C] | Insert + aggregate không khóa hàng khách → hai giao dịch song song ghi tổng thiếu. | `FOR UPDATE` trên customer hoặc `UPDATE … SET balance = balance + ?`. |
| FIN-05 | Hoàn tiền không bị chặn theo số đã thu · `payment.service.ts:355-377` | [C] | `createRefund`/`approveRefund` không đối chiếu `payment.amount − refunded_amount`; hủy khi mới trả một phần (`reservation.service.ts:336-346`) vẫn hoàn toàn bộ giá trị dòng. | Kiểm tra trần tại tạo và duyệt. |
| BIZ-15 | `setTimeout(processRefund, 200)` trong transaction · `reservation.service.ts:451` | [C] | Có thể chạy trước commit → hoàn tiền không thấy bản ghi, bị bỏ. | Dùng outbox/sau commit. |
| BIZ-16 | Tính chỗ trống đếm tổng cam kết chồng lấn, không phải đỉnh đồng thời · `core.service.ts:59-79` | [C] | Hai cam kết không chồng nhau trong cửa sổ vẫn bị cộng → từ chối đặt chỗ dư (mất doanh thu). | Tính max-concurrency (sweep line). |
| SEC-08 | Khách upload vào bucket **public** và SVG sơ đồ · `media.service.ts:14-31, 57-90`; `platform.controller.ts:21-44` | [R] SEC-08 | Mọi user đăng nhập xin được URL tải lên mục đích `FACILITY_PHOTO/UNIT_TYPE_PHOTO/AVATAR`; `FLOOR_PLAN` cho `image/svg+xml` (kiểm tra magic chỉ cần có `<svg`) được phục vụ cùng origin API → rủi ro stored-XSS nếu mở link ký. | Giới hạn mục đích theo vai trò; chặn SVG hoặc làm sạch + `Content-Disposition: attachment`, CSP `sandbox`. |
| SEC-09 | Mật khẩu tối thiểu 5 ký tự, không có từ điển ngắn · `settings.service.ts:5`, `auth.service.ts:19, 51` | [R] SEC-09 | Danh sách "mật khẩu phổ biến" toàn chuỗi ≥10 ký tự nên `12345` hợp lệ. | Tối thiểu 10, kiểm tra breach list. |
| SEC-13 | `acceptInvite` kích hoạt lại tài khoản đã DISABLED · `auth.service.ts:361` | [C] | Ghi `status:'ACTIVE'` vô điều kiện. | Chỉ khi `status==='INVITED'`. |
| API-01 | Tham số phân trang sai gây 500 · `common/http.ts:13-20` | [R] API-01a/b | `?pageSize=abc` → `take: NaN`; `cursor` âm → Prisma lỗi. | Zod-validate, kẹp giá trị. |
| BUILD-01 | `pnpm typecheck` ở thư mục gốc **thất bại** (exit 2) · `apps/gateway` | [R] | 1 348 lỗi TS (decorators không bật, `config.storage.r2PublicBaseUrl` thiếu trong shim). Không có script/cấu hình lint nào ở toàn repo → không có phân tích tĩnh. | Sửa `tsconfig` gateway, thêm ESLint + CI. |
| ARCH-01 | Worker triển khai dùng "DB" JSON trên R2 (`_db/vaultra-diff-v1.json`) khác MySQL · `apps/gateway/src/edge-prisma.ts` | [P] | Toàn bộ bảo đảm khóa hàng/transaction/ràng buộc UNIQUE đã kiểm thử ở API **không áp dụng** cho bản đang chạy production. Chưa kiểm thử. | Test e2e chạy lại trên gateway; hoặc chuyển sang D1/Postgres có transaction. |
| PERF-01 | N+1 và quét toàn bảng trong job · `facility.controller.ts:56-70`, `delinquency.service.ts:228-235`, `renewal.service.ts:46`, `reservation.service.ts:476-485` | [C] | Mỗi cơ sở/hợp đồng thêm 3–5 truy vấn; `openWindowsAndRemind` nạp mọi hợp đồng ACTIVE; `processNoShows` tối đa 1 000 mỗi giờ. Chưa đo dữ liệu lớn. | `groupBy` một lần, phân trang theo con trỏ, chỉ mục thích hợp. |

## 7. Low Severity Issues

| ID | Vấn đề · file:dòng | Bằng chứng | Ghi chú / đề xuất |
|---|---|---|---|
| SEC-14 | Sự kiện webhook chưa ký vẫn ghi vào bảng và có thể chặn sự kiện thật cùng `event_id` · `payment.service.ts:149-155` | [C] | Chỉ ghi/đánh dấu trùng với sự kiện **đã xác thực**. |
| SEC-15 | Token Turnstile giả được chấp nhận khi `NODE_ENV≠production` · `auth.service.ts:63` | [C] | Triển khai quên đặt `NODE_ENV` sẽ bị vượt CAPTCHA. Dùng cờ riêng. |
| API-02 | Admin xem được danh sách cơ sở nhưng `GET /facilities/:id` trả 404 · `facility.controller.ts:97-101` | [R] API-02 | `global` thiếu `SYSTEM_ADMIN`. |
| API-03 | `GET appointment-slots` ghi dữ liệu (tự tạo slot mặc định) và `POST /quotes` công khai tạo bản ghi · `reservation.service.ts:500-509`, `catalog.controller.ts:185-196` | [C] | Phình bảng, khó cache; chuyển sang seed/cấu hình. |
| BIZ-17 | Tính năng dang dở: `selfCheckin` luôn ném lỗi (`contract.controller.ts:489-494`), `runAllocationLead` trả 0 (`reservation.service.ts:488-490`), 2 tuyến chưa có UI tương ứng | [C] | Xóa hoặc hoàn thiện; không để job "chạy giả". |
| TEST-01 | `packages/shared` có script `test` nhưng **0 test** (`node --test dist/**/*.test.js`) | [R] | 16 unit test thật nằm ở `apps/api/test/unit`. |

## 8. Business Logic Issues (theo 7 luồng)

| Luồng | Kết quả kiểm tra | Lỗi liên quan |
|---|---|---|
| 1. Đặt kho | Khóa hàng + kiểm tra kép chống đặt trùng **đạt** (100 request → 1). Lỗi: giữ chỗ vượt chính sách, nhầm khách, VAT báo giá/hóa đơn lệch, webhook thiếu tiền, ngày thu phí | BIZ-02, BIZ-05, FIN-01/02/03, BIZ-16 |
| 2. Check-in & bàn giao | Gate bị bỏ qua; chữ ký/token ký; lịch hẹn đổi/giờ qua | BIZ-01, BIZ-04, BIZ-07, BIZ-08, BIZ-11 |
| 3. Quản lý kho đang thuê | Chấm dứt trực tiếp không dọn; PIN nhân viên xem được (thiết kế, có audit) | BIZ-03, BIZ-09, BIZ-14 |
| 4. Quy tắc, phí, doanh thu | Miễn giảm vượt dòng; số dư cache; hoàn tiền không trần; thuế sai | BIZ-12, FIN-01…05 |
| 5. Cơ sở & nhân sự | Tạo/sửa cơ sở, RBAC theo cơ sở **đạt** e2e; lỗi hiển thị admin | API-02, SEC-06 |
| 6. Gia hạn & quá hạn | State machine quá hạn đúng biên (unit test); đóng băng bằng ticket; lệch kỳ thu; race gia hạn | BIZ-06, BIZ-10, BIZ-13, ALG-01 |
| 7. Hỗ trợ | SLA giờ làm việc **đạt** unit test; lạm dụng `dispute_hold` | BIZ-06 |

## 9. Algorithm & Calculation Issues

- Làm tròn VND `ROUND_HALF_UP` + `Decimal`: **đạt** (không dùng float). Ngày dùng `DATE` UTC 00:00 + `addMonths` kẹp cuối tháng: đúng cho một lần gọi, **sai khi nối chuỗi** (BIZ-10).
- Sai thuật toán tiền: FIN-01, FIN-03, ALG-01, BIZ-11, FIN-05.
- Biên thời gian quá hạn (`targetStage`): khớp văn bản hợp đồng (ngày `lockout_day` bị khóa) — đạt.
- Xấp xỉ `30.44` ngày/tháng ở trả kho (ALG-01) và `30.4` ở khuyến mãi định kỳ (`billing.service.ts:66`, chỉ ảnh hưởng chỉ số kỳ giảm giá, rủi ro trôi sau nhiều năm) cần thay bằng tháng lịch.

## 10. Database Issues

- DB-01 (xung đột mã khách), FIN-04 (cache số dư), BIZ-13 (thiếu khóa).
- Ràng buộc: có `CHECK` cho kích thước/giá/ngày nhưng **không** có cho số tiền (`payments.amount>0`, `refunds.amount ≤ …`, `invoices.total ≥ 0`); nên bổ sung.
- Tiền dùng `Decimal` toàn bộ — đạt. Khóa duy nhất cho PIN/phân bổ dựa cột sinh — đạt (không thể đặt trùng PIN cùng cơ sở).
- Dữ liệu mồ côi: nhiều quan hệ `onDelete: Cascade` (13) trong khi hệ thống xóa mềm; chưa tìm thấy mồ côi trên DB seed, **chưa chạy quét FK trên dữ liệu thật**.
- Seed/migration: 3 migration chạy sạch trên DB mới (reset + seed chạy thành công nhiều lần).

## 11. API Issues

- Endpoint: 308 handler; không có endpoint nào bỏ qua `AuthGuard`; `/openapi.json` và `/docs` tắt ở production.
- Lỗi: API-01 (500), API-02 (404), API-03; SEC-06/07 (lộ dữ liệu); BIZ-04 (mất dữ liệu khi lỗi); mã trạng thái 201 cho `POST /customers` khi thực ra là bản ghi cũ (nên 200/409).
- Dữ liệu nhạy cảm: `GET /checkin-sessions/:id` trả `pinCode` giải mã và `signUrl` (BIZ-07); `GET /contracts/:id/access` cho mọi nhân viên có `checkin.perform` xem PIN (thiết kế, có audit `access.pin_viewed`).
- Giới hạn tốc độ chỉ trong bộ nhớ tiến trình (không dùng chung khi chạy nhiều instance) và dựa vào IP khai báo (SEC-04).

## 12. Security Vulnerabilities (tổng hợp)

| Hạng mục | Kết quả |
|---|---|
| Broken Access Control / IDOR | SEC-06 [R], SEC-07 [R]; RBAC ma trận + phạm vi cơ sở e2e 53/53 đạt |
| Authentication | SEC-02 [R], SEC-09 [R], SEC-13 [C], SEC-15 [C]; khóa tài khoản đoán song song **không** vượt được (SEC-05) |
| Session/Token | SEC-01 [R], SEC-10 [C]; xoay refresh + phát hiện tái sử dụng đạt |
| CSRF | SEC-01 (Origin allow-list rộng) |
| SQL Injection | Không thấy: mọi `$queryRaw` dùng tagged template tham số |
| XSS | Web không dùng `dangerouslySetInnerHTML`; rủi ro SVG upload (SEC-08) |
| Lộ thông tin | SEC-03 [R], SEC-11 [R], SEC-12 [P] |
| Phụ thuộc | DEP-01 [R] |

## 13. Performance Issues

PERF-01 (N+1, job nạp toàn bộ), `GET /facilities` chạy `groupBy` mỗi cơ sở, `delinquency.list` không phân trang, `report` dùng nhiều truy vấn tuần tự. **Chưa đo** với dữ liệu lớn (không có bộ dữ liệu); kết luận chỉ dựa trên đọc code.

## 14. Missing Test Cases

- Web: **không có test nào** (chỉ typecheck + build). Thiếu e2e UI cho đặt kho, thanh toán, check-in; chưa kiểm tra giao diện 375 px.
- API: thiếu test cho hủy khi thanh toán một phần, hoàn tiền vượt trần, gia hạn song song, đổi lịch lỗi, job `renewal.*`/`moveout.auto-finalize` trên đồng hồ giả, race `balance_cached`, VNPay (`e2e/vnpay.ts` cần cấu hình sandbox — không chạy).
- Gateway: không có bất kỳ test nào.
- Đã bổ sung: 5 unit test (`audit.unit.ts`) và 34 kiểm tra tích hợp (`audit-findings.ts`).

## 15. Recommended Fixes (thứ tự ưu tiên)

1. **Trong ngày:** thu hồi 5 khóa Gemini (SEC-03); đặt `SERVICE_TOKEN_SECRET` ngẫu nhiên ≥32 byte và chặn khởi động production nếu thiếu (SEC-11); đổi/xóa tài khoản demo trên môi trường triển khai (SEC-12).
2. **Tuần này:** CORS/Origin chính xác (SEC-01), liên kết hồ sơ khách sau xác minh email (SEC-02), sửa `clientIp` (SEC-04), che `POST /customers` và `sign-email-info` (SEC-06/07), bỏ refresh token khỏi `localStorage` (SEC-10).
3. **Nghiệp vụ tiền/hợp đồng:** FIN-01/02/03, BIZ-01/02/03/04/05/06/07, DB-01.
4. **Sau đó:** các mục Medium (ngày thu, hoàn tiền trả trước, race gia hạn, hoàn tiền trần, N+1), nâng cấp phụ thuộc (DEP-01), sửa `pnpm typecheck` + thêm lint/CI (BUILD-01), kiểm thử gateway (ARCH-01).

## 16. Test Execution Results

### 16.1 Đã chạy

| Hạng mục | Lệnh / bộ | Kết quả |
|---|---|---|
| Typecheck shared + api + web | `tsc` | **Xanh** (shared, api, web). Gốc `pnpm typecheck` **đỏ** vì `apps/gateway` (BUILD-01) |
| Build api / web | `tsc -p tsconfig.build.json`, `vite build` | Xanh (web 7.3 s) |
| Lint | — | **Không thể chạy**: repo không có ESLint/Biome |
| Unit hiện có | `pnpm test` | api: **16/16 xanh**; shared: **0 test** (TEST-01) |
| E2E hiện có (DB `vaultra_audit`, payOS giả) | payos 18/18 · f1 11/11 · f3 15/15 · f4–f7 35/35 · nfr03 5/5 · rbac 53/53 · realtime 4/4 · **f2 21/24 (3 đỏ — BIZ-01)** | Ghi chú: f1/f2/payos cần `PAYMENT_PROVIDER=PAYOS`; môi trường dev hiện cấu hình `VNPAY` nên lần chạy đầu có nhiều assertion đỏ giả — đã loại khỏi báo cáo |
| Phụ thuộc | `pnpm audit --prod` | 33 lỗ hổng (11 high) — DEP-01 |
| **Bộ audit mới** | `audit.unit.ts` | 5 test: **1 xanh (kiểm chứng giữ), 4 đỏ** = FIN-01, FIN-03, BIZ-10, ALG-01 |
| **Bộ audit mới** | `audit-findings.ts` (API thật) | 34 kiểm tra: **6 xanh** (3 bước dựng + SEC-05 + BIZ-03a + FIN-01a), **28 đỏ** = lỗi tái hiện (ID ở §4–§7) |

Lệnh tái chạy:

```bash
# API test với DB riêng + payOS giả (xem apps/api/test/fake-payos.ts)
export DATABASE_URL='mysql://root:@127.0.0.1:3306/vaultra_audit' PORT=4100 PAYMENT_PROVIDER=PAYOS \
  PAYOS_API_BASE=http://127.0.0.1:4010 PAYOS_CLIENT_ID=fake PAYOS_API_KEY=fake PAYOS_CHECKSUM_KEY=fake-checksum-key
pnpm --filter @vaultra/api db:reset && pnpm --filter @vaultra/api seed:demo
npx tsx apps/api/test/fake-payos.ts & node apps/api/dist/main.js &
API_URL=http://localhost:4100/v1 SERVICE_TOKEN_SECRET=<giá trị của API> npx tsx apps/api/test/audit/audit-findings.ts
pnpm --filter @vaultra/api test:audit
```

### 16.2 Mức tin cậy của kết quả đỏ

Các kiểm tra "setup" (dựng dữ liệu) báo ✔ nên không lẫn với lỗi sản phẩm. Hai test từng đỏ giả trong lúc viết (do trường `id` thay vì `public_id` và `startDate` theo UTC) đã được sửa trước lần chạy cuối. Chuỗi BIZ-06 dùng đồng hồ giả (+24 rồi +70 ngày) và đã `reset` sau khi chạy.

### 16.3 Không thể/không chạy — nêu rõ lý do

- **Production (Pages/Worker/R2)** và Worker `apps/gateway` (lớp dữ liệu R2): không thử để không ảnh hưởng hệ thống thật (ARCH-01, SEC-12 còn mở).
- **VNPay e2e** (`e2e/vnpay.ts`): cần khóa sandbox VNPay.
- **Gemini/Google OAuth/Turnstile/SMTP thật**: cần khóa ngoài; chỉ đọc code.
- **Giao diện web**: chỉ typecheck + build; không có test UI, chưa kiểm tra tương tác/375 px.
- **Dữ liệu lớn, tải kéo dài, race gia hạn/`balance_cached`**: chưa có bộ dữ liệu/công cụ tải; ghi ở BIZ-13, FIN-04, PERF-01 là [C]/[P].
- **Mất kết nối giữa chừng, refresh khi đang xử lý**: chỉ phân tích (Idempotency interceptor, transaction), chưa có test.

---

*Báo cáo này không tuyên bố hệ thống an toàn: số lượng lỗi tái hiện được cho thấy cần vá các mục Critical/High trước khi triển khai tiếp. Bước tiếp theo (sửa lỗi) chưa được thực hiện — xem ghi chú ở cuối phiên làm việc.*

---

## 17. Remediation status (sau khi sửa)

Quy ước: **Verified** = có test chạy xanh chứng minh · **Fixed** = đã sửa trong mã, các suite hồi quy xanh nhưng chưa có test riêng · **Unresolved** = chưa sửa (lý do ở cột cuối).

| ID | Trạng thái | Cách sửa / lý do còn mở |
|---|---|---|
| SEC-01 | **Verified** | `common/origin.ts`: danh sách origin chính xác (APP_ORIGIN, EXTRA_ORIGINS, pattern neo toàn chuỗi, localhost chỉ ngoài production); dùng chung cho CORS, `checkOrigin` và gateway. Test SEC-01a/b |
| SEC-02 | **Verified** | Chỉ liên kết hồ sơ khách khi email đã xác minh (`verifyEmail` → `claimCounterCustomer`). Test SEC-02 |
| SEC-03 | **Verified (mã)** · hành động của chủ | Xóa 5 khóa Gemini khỏi `config.ts` và shim Worker; mặc định rỗng → AI dùng fallback. **Bạn cần thu hồi 5 khóa cũ** (đã lộ trong git history) và đặt khóa mới bằng `wrangler secret put GEMINI_API_KEYS` |
| SEC-04 | **Verified** | `clientIp` chỉ tin `cf-connecting-ip` khi `TRUST_PROXY_HEADERS` (mặc định bật ở production); bỏ `X-Forwarded-For`. Test SEC-04 |
| SEC-06 | **Verified** | `POST /customers` trả 409 (không lộ dữ liệu) khi khách ngoài phạm vi. Test SEC-06 |
| SEC-07 | **Verified** | `sign-email-info` luôn yêu cầu token đúng. Test SEC-07 |
| SEC-08 | **Verified** | Upload ảnh public/sơ đồ cần quyền `facility.manage`/`unit.manage`; SVG trả `attachment` + CSP `sandbox`. Test SEC-08 |
| SEC-09 | **Verified** | Sàn 8 ký tự bất kể cấu hình + từ điển mật khẩu yếu mở rộng. Test SEC-09 |
| SEC-11 | **Verified** | Production (`config.ts`) và Worker (`applyEnv`) từ chối khởi động nếu `SERVICE_TOKEN_SECRET` thiếu/mặc định/<32 ký tự. Test SEC-03b/c |
| SEC-13, SEC-14, SEC-15 | **Fixed** | Chỉ kích hoạt lại lời mời `INVITED`; sự kiện webhook sai chữ ký dùng id riêng; token Turnstile giả cần `ALLOW_TURNSTILE_DUMMY=true` |
| BIZ-01 | **Verified** | `/complete` đòi biên bản hiện trạng (≥ số ảnh tối thiểu); bỏ tự tạo biên bản "OK". UI nhân viên (Bước 4) có form biên bản. e2e F2 24/24, test BIZ-01 |
| BIZ-02 | **Verified** | Bỏ fallback "khách đầu tiên". Test BIZ-02 |
| BIZ-03 | **Verified** | `terminate` dùng state machine, thu hồi PIN, kết thúc lịch phí, hủy gia hạn/trả kho đang mở, kho → chờ kiểm tra, tạo task. Test BIZ-03a/b/c |
| BIZ-04 | **Verified** | Đổi lịch trong một transaction. Test BIZ-04 |
| BIZ-05 | **Verified** | Dùng đúng `max_pending_reservations`. Test BIZ-05 |
| BIZ-06 | **Verified** | `dispute_hold` chỉ có tác dụng khi còn ticket PAYMENT mở < 7 ngày. Test BIZ-06 |
| BIZ-07 | **Verified** | Nhân viên không còn thấy link ký (chỉ chủ đơn); chữ ký qua link ghi `DRAWN_SIGNATURE`, `otp_verified_at = null`. Test BIZ-07 |
| BIZ-08, BIZ-09, BIZ-14, BIZ-15 | **Verified / Fixed** | Chặn khung giờ đã qua (test BIZ-08); trạng thái hợp đồng khi đặt lịch trả kho; kiểm tra phiếu bảo trì khi gán thủ công; hoàn tiền đến muộn trong cùng transaction |
| BIZ-10 | **Verified** | Kỳ thu neo theo ngày bắt đầu (`monthsBetween`). `audit.unit › BIZ-10` |
| BIZ-12, BIZ-13, FIN-04, FIN-05, BIZ-16 | **Fixed** | Miễn giảm cộng dồn ≤ giá trị dòng; khóa hàng hợp đồng khi gia hạn; khóa hàng khách khi ghi sổ; trần hoàn tiền theo giao dịch; tính chỗ trống theo đỉnh đồng thời (sweep line) |
| FIN-01 | **Verified (đánh giá lại)** | Khi giá đã gồm VAT, `invoices.tax_total` phải bằng 0 theo ràng buộc DB (`total = subtotal − discount + tax_total`); lỗi thật là thuế từng dòng không trừ giảm giá. Nay thuế dòng tính trên số sau giảm giá, khớp báo giá. `audit.unit › FIN-01`, test FIN-01b |
| FIN-02 | **Verified** | Webhook ít tiền hơn → không ghi nhận thanh toán, đánh dấu `MISMATCH`. Test FIN-02 |
| FIN-03 | **Verified** | VAT ngoài giá tính sau giảm giá. `audit.unit › FIN-03` |
| ALG-01 | **Verified** | Đếm tháng trả trước theo lịch. `audit.unit › ALG-01` |
| DB-01 | **Verified** | Một chuỗi mã khách duy nhất (`nextCustomerCode`). Test DB-01 |
| API-01, API-02 | **Verified** | Kẹp tham số phân trang; admin xem được chi tiết cơ sở |
| BUILD-01 | **Verified** | Gateway bật decorators + sửa lỗi `r2PublicBaseUrl`: `tsc` gateway sạch (api, web, gateway đều xanh) |
| DEP-01 | **Fixed một phần** | nodemailer 6→10, mariadb 3.4.5→3.5.5, multer/Nest, echarts 6.1: 33 → 2 cảnh báo. Còn zod (cần lên v4, thay đổi lớn) và uuid (phụ thuộc gián tiếp của exceljs) |
| SEC-10 | **Unresolved** | Refresh token trong `localStorage`/header vì Pages và Worker khác site. Cần domain tùy chỉnh cùng site để dùng cookie `httpOnly` |
| SEC-12 | **Unresolved** | Đã bỏ `tkmk.txt` khỏi git; nhưng DB Worker vẫn có tài khoản demo mật khẩu `12345` — cần bạn đổi/xóa trên môi trường thật |
| BIZ-11 | **Verified** | Hạ hạng kho khi check-in: phần chênh lệch (kể cả cọc) tạo yêu cầu **hoàn TIỀN MẶT** chờ quản lý duyệt (`method=CASH`); nếu đơn chưa thanh toán thì ghi giảm trừ (credit note) vào hóa đơn đặt chỗ. UI nhân viên báo rõ số tiền cần hoàn. Test BIZ-11a/b |
| ARCH-01 | **Unresolved** | Lớp dữ liệu R2 của Worker là thay đổi kiến trúc; đã thêm khóa hàng cho `customers`/`contracts` vào shim Worker |
| PERF-01 | **Fixed một phần** | `GET /facilities` còn 2 truy vấn thay vì 2 mỗi cơ sở. Danh sách quá hạn và job gia hạn vẫn quét rộng — chưa đo trên dữ liệu lớn |
| BIZ-17, TEST-01 | **Fixed** | Xóa job `reservation.allocation-lead` và endpoint `self-checkin` giả; `packages/shared` có 3 test thật (`pnpm --filter @vaultra/shared test`) |
| API-03 | **Accepted** | Slot mặc định vẫn được tạo lười khi đọc lần đầu (idempotent, `skipDuplicates`); đổi sang seed lúc tạo cơ sở là việc nhỏ nhưng ảnh hưởng dữ liệu cũ nên để lại |

### Phát hiện thêm trong lúc sửa

| ID | Mức | Nội dung | Trạng thái |
|---|---|---|---|
| NEW-01 | **Critical** | `apps/gateway/src/shims/config.ts` (trong git) chứa **khóa riêng JWT, khóa mã hóa trường, Google client secret, khóa R2, bí mật VNPay, 5 khóa Gemini**, đồng thời `testClock: true` và bí mật dịch vụ mặc định trên Worker production (cho phép đổi giờ hệ thống và chạy job). | **Fixed**: mọi bí mật chuyển sang Worker secret (`applyEnv`), khóa JWT và `SERVICE_TOKEN_SECRET` được **tạo mới**, `testClock=false`. Khóa mã hóa trường giữ nguyên để không mất PIN hiện có; **cần xoay** khóa R2, Google secret, khóa mã hóa (đã lộ trong lịch sử git) |
| NEW-02 | Medium | Lỗi khởi động Worker trả cả `stack` cho client | **Fixed** |
| NEW-03 | Medium | `storage-service` của Worker đọc sai khóa cấu hình (`config.r2PublicBaseUrl`) | **Fixed** |

### Kết quả kiểm thử sau khi sửa

| Bộ test | Kết quả |
|---|---|
| Typecheck api · web · gateway | xanh cả ba |
| Unit api (`pnpm test`) | 16/16 |
| `audit.unit` (`pnpm --filter @vaultra/api test:audit`) | 5/5 |
| e2e: payos 18 · f1 11 · f2 24 · f3 15 · f4–f7 36 · nfr03 5 · rbac 54 · realtime 4 | 167/167 |
| `audit-findings` (API thật, DB riêng) | 36/36 |
| `@vaultra/shared` | 3/3 |
| `pnpm audit --prod` | 33 → 2 cảnh báo |

---

## 18. Kiểm tra riêng cho Worker (`apps/gateway`)

Cách làm: chạy chính Worker trong sandbox cục bộ (`wrangler dev --local`, bí mật thử nằm trong `.dev.vars` đã bị git bỏ qua, payOS giả) rồi chạy lại bộ e2e và bộ audit trên đó. Phát hiện và sửa:

| ID | Mức | Phát hiện trên Worker | Trạng thái |
|---|---|---|---|
| WRK-01 | High | Lỗi kiểm tra dữ liệu (Zod) trả **500 "Lỗi hệ thống"** thay vì 400 + danh sách trường | **Fixed** — rbac e2e |
| WRK-02 | High | `Idempotency-Key` **không được áp dụng**: bấm đúp tạo trùng đơn/thanh toán; thiếu header không bị từ chối | **Fixed** — dùng chung `IdempotencyInterceptor`; 2 request song song → 1 đơn, request thứ hai được phát lại |
| WRK-03 | High | Kho dữ liệu trong bộ nhớ **không có ràng buộc UNIQUE** (trùng email, mã, PIN, phân bổ kho, sự kiện webhook, khóa idempotency) và không tính các cột sinh của MySQL | **Fixed** — `schema-uniques.json` sinh từ Prisma (`tools/gen-uniques.py`) + tính cột sinh, ném `P2002` như MySQL |
| WRK-04 | High | Giao dịch **không rollback**: lỗi giữa chừng để lại bản ghi mồ côi (đơn đặt chỗ không hóa đơn như người dùng đã gặp) | **Fixed** — giao dịch tuần tự có nhật ký hoàn tác |
| WRK-05 | High | WebSocket realtime **nhận mọi kết nối không cần vé** | **Fixed** — chỉ nhận vé ký còn hạn (401 nếu không); đẩy dữ liệu realtime vẫn chưa hoạt động trên Worker |
| WRK-06 | Medium | `setTimeout(...).unref()` làm hỏng bước ghi nhật ký (lỗi "Lỗi hệ thống" khi đặt kho) | **Fixed** (đợt trước) |
| WRK-07 | Medium | Tạo PDF (hợp đồng, biên bản bàn giao/trả kho) lỗi `heightOfString is not a function`; PDF giả chỉ có 1 trang cụt | **Fixed** — shim pdfkit sinh PDF nhiều trang hợp lệ (tiếng Việt bỏ dấu vì font PDF chuẩn) |
| WRK-08 | Medium | Lỗi nội bộ trả cả `message` và `stack` cho client | **Fixed** — chỉ ghi log phía máy chủ |
| WRK-09 | Medium | IP khách lấy từ `X-Forwarded-For` (giả được) khi thiếu `cf-connecting-ip` | **Fixed** |
| WRK-10 | Low | Dữ liệu mẫu chứa cơ sở thử `TST1` | **Fixed** trong seed (bản production hiện có vẫn còn bản ghi này trong R2) |

Kết quả trên Worker cục bộ: `audit-findings` **36/36**, rbac 53/54 (1 do `TST1` còn trong state cũ), f3 15/15, f4–f7 35/36 (`/openapi.json` cố ý tắt ở production). `f1`/`payos` không chạy sạch trên dữ liệu mẫu của Worker vì tài khoản `customer@` trong snapshot có 13 hợp đồng quá hạn (bị chặn đặt kho), và `f2` đọc OTP từ hộp thư cục bộ — đây là giới hạn của dữ liệu/công cụ thử, không phải lỗi mã; luồng tương đương đã được kiểm bằng `audit-findings`.
