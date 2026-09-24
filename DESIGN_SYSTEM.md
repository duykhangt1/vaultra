# Vaultra Design System — “Vault Noir”

Tài liệu này là nguồn chuẩn cho mọi màn hình của Vaultra (trang công khai và 5 khu làm việc). Khi thiết kế hay code giao diện mới, làm theo tài liệu này trước; nếu cần một mẫu chưa có, thêm vào đây rồi mới dùng.

- Token: [apps/web/src/styles.css](apps/web/src/styles.css) (`@theme`)
- Thành phần cơ bản: [apps/web/src/ui/index.tsx](apps/web/src/ui/index.tsx)
- Thành phần thương hiệu: [apps/web/src/ui/brand.tsx](apps/web/src/ui/brand.tsx)
- Ảnh & video: [apps/web/src/lib/media.ts](apps/web/src/lib/media.ts), file trong `apps/web/public/media/`

---

## 1. Ý tưởng

**Kho tự quản = một két sắt cá nhân giữa thành phố.** Giao diện mượn ngôn ngữ của chính cơ sở vật chất: hành lang đêm, cửa cuốn sơn xanh mực, biển số kho bằng đồng thau, bản vẽ kỹ thuật có đường kích thước.

Ba nguyên tắc:

1. **Đêm và giấy.** Phần “cảm xúc” (hero, khối nổi bật, footer) dùng nền mực đêm `ink-950/900`. Phần đọc và thao tác dùng nền giấy ấm `paper`. Không dùng nền xám lạnh hay trắng tinh cho cả trang.
2. **Đồng thau là tín hiệu, không phải trang trí.** Màu brass chỉ dành cho: hành động chính, số liệu quan trọng, biển số kho, đường nhấn. Mỗi màn hình tối đa ~10% diện tích brass.
3. **Chính xác như bản vẽ.** Số liệu dùng chữ số đều (`.num`), mã kho/mã đơn dùng mono, kích thước luôn ghi đủ đơn vị (`2,0 × 2,5 × 2,4 m`). Đường kẻ mảnh (hairline), dấu góc (crop marks) và đường kích thước là motif chính.

---

## 2. Màu sắc

| Token | Hex | Dùng cho |
|---|---|---|
| `ink-950` | `#08121f` | Nền hero, footer, overlay video |
| `ink-900` | `#0e1b2c` | Nền tối chính, chữ chính trên nền sáng, sidebar |
| `ink-800` | `#14304f` | Thẻ trên nền tối, hover nền tối |
| `ink-700` / `ink-600` | `#1e4672` / `#2c5d8f` | Viền focus, biểu đồ |
| `paper` | `#f6f3ec` | Nền trang |
| `paper-2` | `#efeadf` | Nền khối xen kẽ, ô nhập trên nền giấy |
| `brass-500` | `#c8963e` | Nút chính, điểm nhấn |
| `brass-400` | `#ddb065` | Chữ nhấn trên nền tối |
| `brass-700` | `#96691f` | Chữ nhấn trên nền sáng (đủ tương phản AA) |
| `brass-100` | `#f6ebd3` | Nền badge/ô icon |
| `steel-500…100` | `#5b6b7d → #eceff3` | Chữ phụ, viền, nền trung tính |
| `signal-500` | `#ddb065` (brass) | “Còn trống”, “Truy cập hợp lệ” — chỉ trên nền tối |
| `ok-600/500/100` | `#1e4672 / #2c5d8f / #e4ebf4` | Trạng thái “thành công” — **xanh navy, không dùng xanh lá** |
| `warn/bad/info-600/100` | | Trạng thái nghiệp vụ (badge, alert) |

> **Quy tắc cứng: không có màu xanh lá cây ở bất kỳ đâu trong giao diện.** Ngoại lệ duy nhất là logo Google (`#34A853`) vì thương hiệu Google bắt buộc.

Quy tắc tương phản: chữ thường trên `paper` dùng `ink-900` hoặc `steel-500` trở lên; chữ brass trên nền sáng **luôn** là `brass-700`. Trên nền tối, chữ phụ dùng `steel-300`, không thấp hơn.

---

## 3. Chữ

| Vai trò | Font | Cỡ / dòng / tracking | Class |
|---|---|---|---|
| Display (hero) | Bricolage Grotesque 700–800 | `clamp(2.6rem, 6vw, 5.4rem)` / 0.98 / -0.035em | `.display` + `text-hero` |
| H1 trang | Bricolage Grotesque 700 | 36–44px / 1.05 / -0.03em | `.display text-4xl` |
| H2 khối | Bricolage Grotesque 700 | 28–40px / 1.1 / -0.025em | `<SectionHead>` |
| H3 thẻ | Be Vietnam Pro 700 | 17–19px | `font-bold` |
| Thân | Be Vietnam Pro 400/500 | 15–17px / 1.6 | mặc định |
| Eyebrow / nhãn | JetBrains Mono 500, IN HOA | 11–12px / tracking 0.18em | `.eyebrow` |
| Mã kho, mã đơn, số kỹ thuật | JetBrains Mono 500 | 0.85em | `.code`, `<Plate>` |
| Số tiền, số liệu | Be Vietnam Pro + `tabular-nums` | | `.num` |

- Tiêu đề hero tối đa 2 dòng, câu ngắn, có nhịp: một dòng trắng + một dòng brass.
- Không dùng Bricolage cho đoạn văn hay nhãn form.
- Tiếng Việt: luôn kiểm tra dấu ở cỡ display (line-height ≥ 0.95 để dấu không chạm dòng trên).

---

## 4. Lưới, khoảng cách, bo góc, đổ bóng

- Container: `max-w-[1240px]`, lề `px-4 sm:px-6 lg:px-8`. Trang đọc dài: `max-w-[780px]`.
- Nhịp dọc khối: `py-20 lg:py-28` (trang công khai), `space-y-6` (khu làm việc).
- Thang khoảng cách: 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96.
- Bo góc: nút/ô nhập `10px`, thẻ `--radius-card` 14px, ảnh lớn `--radius-media` 20px, pill `9999px`.
- Đổ bóng: `--shadow-card` cho thẻ trên nền giấy, `--shadow-pop` cho popover/hover, `--shadow-glow` (viền sáng brass) cho thẻ trên nền tối. Không đổ bóng trên nền tối — dùng viền `white/10`.

---

## 5. Motif thương hiệu

| Motif | Mô tả | Code |
|---|---|---|
| **Biển số kho (Plate)** | Chữ mono in hoa giãn rộng màu đồng thau, không khung, không nền — như chữ khắc trên cửa kho. Trên ảnh dùng biến thể `dark` (có bóng chữ nhẹ). Dùng cho mã kho, nhãn loại kho, số bước. | `<Plate>A-104</Plate>` |
| **Sọc cửa cuốn** | Sọc ngang mảnh lặp lại, dùng làm texture nền cho khối tối hoặc placeholder ảnh. | `.door-lines` |
| **Dấu góc (crop marks)** | 4 góc chữ L mảnh quanh ảnh/khối quan trọng — gợi bản vẽ, khung ngắm. | `<CropFrame>` / `.crop` |
| **Đường kích thước** | `|← 2,0 m →|` mảnh, mono, dùng khi hiển thị kích thước kho. | `<DimLine>` |
| **Đánh số khối** | Mỗi khối trang công khai có số `01 —` + eyebrow. | `<SectionHead index="01">` |
| **Băng chạy (marquee)** | Dải chữ mono chạy ngang chứa cam kết dịch vụ, ngăn giữa hero và nội dung. | `<Marquee>` |
| **Hạt (grain)** | Lớp nhiễu mịn trên nền tối để không bị phẳng. | `.grain` |

Không trộn quá 2 motif trong một thẻ.

---

## 6. Hình ảnh & video

Ảnh cơ sở, loại kho và video nền là **tư liệu quay/chụp thật từ Pexels** (nguồn và tác giả ở `MEDIA_CREDITS.md`), cắt đúng tỉ lệ rồi nén WebP/WebM. Ảnh do API cung cấp luôn thắng ảnh mặc định. Công cụ render 3D cũ vẫn nằm ở `tools/media-studio` nhưng không còn dùng cho ảnh trên site.

- **Phong cách:** ánh sáng đêm/hoàng hôn, đèn LED trần trắng ấm, sàn bê tông bóng, cửa cuốn xanh mực + đồng thau, có grain và vignette nhẹ.
- **Tỷ lệ:** ảnh cơ sở 16:10 (1600×1000), ảnh loại kho 4:3 (1200×900), mỗi ảnh có bản `-sm` (½ kích thước) cho thẻ nhỏ.
- **Định dạng:** WebP; video WebM (VP8) lặp liền mạch 16 giây + poster JPG/WebP.
- **Khi đặt chữ lên ảnh/video:** luôn có lớp phủ `bg-gradient-to-t from-ink-950/90` hoặc `.scrim`. Chữ trên video không nhỏ hơn 15px.
- **Video nền:** `autoplay muted loop playsInline`, có `poster`; tắt video (chỉ poster) khi `prefers-reduced-motion` hoặc `navigator.connection.saveData`.
- Ánh xạ ảnh theo cơ sở/loại kho ở `lib/media.ts`. Nếu API trả về `coverUrl`/`photos`, ảnh API được ưu tiên.

Danh mục ảnh hiện có:

| Nhóm | File |
|---|---|
| Video (mỗi môi trường một vòng lặp liền mạch, bản `-mobile` 640×360) | `media/video/{hero-corridor|keypad-glow|moving-dawn}.webm` + `-poster.(jpg|webp)` — khai báo ở `FILM` trong `lib/media.ts` |
| Cơ sở | `media/facility-{cau-giay|quan-7|thu-duc}-{exterior|corridor}.webp`, `facility-lobby-{a|b}.webp` |
| Loại kho | `media/unit-{locker|xs|s|m|mg|l|xl|vehicle}.webp` |
| Bối cảnh | `media/scene-{keypad|moving|business}.webp` |

---

## 7. Chuyển động (cơ bản — lớp điện ảnh xem §13)

- Thời lượng: 150ms (hover), 300ms (mở/đóng), 600–800ms (hiện khối khi cuộn).
- Easing chuẩn: `cubic-bezier(0.2, 0.7, 0.2, 1)` (`--ease-vault`).
- **Reveal khi cuộn:** khối trượt lên 16px + mờ dần (`<Reveal>`), so le 60–80ms giữa các phần tử.
- **Door reveal:** ảnh lớn hiện từ trên xuống như cửa cuốn mở (`.door-reveal`).
- **Ken Burns:** ảnh hero của trang chi tiết phóng chậm 1.0 → 1.06 trong 14s.
- Tôn trọng `prefers-reduced-motion`: tắt mọi animation, video chỉ hiện poster.

---

## 8. Thành phần

### Cơ bản (`ui/index.tsx`)
`Button` (primary = brass, dark = ink, outline, soft, ghost, danger) · `Input`/`Select`/`Textarea`/`Field` · `Card`/`CardHead` · `Badge`/`StatusBadge` · `Alert` · `Modal`/`Drawer`/`Confirm` · `Tabs`/`Segmented` · `DataTable`/`PagedTable` · `Stepper` · `Skeleton`/`EmptyState`/`ErrorState` · `Async`.

Quy tắc nút: mỗi màn hình **một** nút primary (brass). Trên nền tối, nút phụ dùng `variant="glass"`.

### Thương hiệu (`ui/brand.tsx`)
| Thành phần | Khi nào dùng |
|---|---|
| `Eyebrow` | Nhãn nhỏ trên tiêu đề |
| `SectionHead` | Mở đầu mọi khối trang công khai (số + eyebrow + tiêu đề + mô tả + hành động) |
| `Plate` | Mã kho, loại kho, số bước |
| `CropFrame` | Ảnh nổi bật, ảnh loại kho |
| `DimLine` | Hiển thị kích thước kho |
| `Reveal` | Hiện khối khi cuộn |
| `Marquee` | Dải cam kết dịch vụ |
| `MediaImg` | Ảnh có skeleton, lazy, fallback sọc cửa cuốn khi lỗi |
| `StatBlock` | Số liệu lớn trên nền tối |
| `PageHero` | Đầu trang công khai thứ cấp (ảnh nền + scrim + tiêu đề) |

---

## 9. Mẫu trang

**Trang công khai:** `PageHero` (hoặc hero video ở trang chủ) → `Marquee` (tùy chọn) → các khối `SectionHead` xen kẽ nền `paper` / `white` / `ink-950` → khối CTA cuối trang trên ảnh → footer tối.

**Trang chủ (thứ tự cố định):** Hero video + ô tìm kho → Marquee → Chọn kích thước (ảnh từng loại) → 4 bước thuê → Cơ sở nổi bật → An ninh & tiện ích (bento ảnh) → Ai đang dùng Vaultra → Giá minh bạch → Hỏi đáp nhanh → CTA.

**Khu làm việc:** giữ sidebar `ink-900` + nội dung trên `paper`. Dùng `PageHeader` có `eyebrow`. Thẻ danh sách kho/hợp đồng có ảnh thu nhỏ loại kho (`unitImage()`).

---

## 10. Nội dung & giọng văn

- Xưng “bạn”, câu ngắn, động từ đứng đầu: “Chọn kích thước”, “Giữ chỗ 15 phút”.
- Luôn nói rõ tiền: “đã gồm VAT”, “cọc hoàn lại”, “phí quản lý một lần”.
- Không hứa điều hệ thống không làm (ví dụ không ghi “bảo hiểm” nếu chính sách không có).
- Số liệu trên trang công khai phải lấy từ API (số cơ sở, số kho trống, giá từ…), không viết cứng.

---

## 11. Khả năng tiếp cận

- Tương phản tối thiểu AA (4.5:1 chữ thường, 3:1 chữ ≥ 24px).
- Focus ring brass 2px (`:focus-visible`), không bỏ outline.
- Mọi ảnh nội dung có `alt` mô tả; ảnh trang trí `alt=""`.
- Vùng chạm tối thiểu 40×40px; trên mobile nút chính cao 48px.
- Video nền không có âm thanh, không chứa thông tin cần thiết.

---

## 12. Checklist trước khi merge giao diện

- [ ] Chỉ dùng token màu trong `@theme` (không mã hex lạ trong JSX)
- [ ] Tiêu đề dùng `.display`, nhãn dùng `.eyebrow`, mã dùng `.code`/`Plate`
- [ ] Một nút primary mỗi màn hình
- [ ] Ảnh có `alt`, có bản `-sm` cho thẻ nhỏ, lazy load
- [ ] Hiển thị đúng ở 375px, 768px, 1280px
- [ ] Có trạng thái loading / rỗng / lỗi
- [ ] Kiểm tra `prefers-reduced-motion`

---

## 13. Lớp điện ảnh — "Một đêm đi vào két sắt"

Trang công khai được dựng như một chuỗi cảnh. Mỗi cảnh có môi trường, ánh sáng và kiểu chuyển động riêng; khu đăng nhập chỉ dùng phần chuyển trang tiết chế. Mã nằm trong `apps/web/src/cinema/`.

### 13.1 Môi trường (`cinema/tokens.ts → ENV`)

| Môi trường | Nền | Nhấn | Dùng cho |
|---|---|---|---|
| `street` | `#070f1b` | brass | Cảnh mở đầu, video mặt tiền đêm |
| `corridor` | `#0a1626` | brass | 4 bước thuê (ghim, video hành lang) |
| `blueprint` | `#f1ede3` + lưới | brass-700 | Kích thước kho, mô hình 3D tỉ lệ thật |
| `paper` | `#f6f3ec` | brass-700 | Cơ sở (track ngang), hỏi đáp, nội dung đọc |
| `vault` | `#070d15` | `brass-400` | An ninh (cổng mở rộng, video bàn phím) |
| `dusk` | `#10172a` | brass | Ai đang dùng (thị sai nhiều lớp) |
| `receipt` | `#ece6d8` | brass-700 | Giá minh bạch (tờ biên nhận in dòng) |
| `dawn` | `#140e08` | brass | Kêu gọi hành động (video chuyển đồ) |
| `night` | `#08121f` | brass | Footer |

`<Scene env="…" blend="môi-trường-phía-trên">` tự sơn nền của nó (luôn đọc được) và vẽ dải chuyển màu ở mép trên để hai môi trường nối liền. Khi một cảnh qua giữa màn hình, header đổi tông (giấy / kính mực) theo `ENV[env].tone`.

### 13.2 Ngôn ngữ chuyển động

| Ý | Kỹ thuật | Ở đâu |
|---|---|---|
| Cửa cuốn | `clip-path: inset()` từ trên/xuống, `expo.inOut` | Màn che cuộn lên sau khi hộp mở, cửa đóng cuối cảnh mở đầu, ảnh hiện ra |
| Hộp giấy | R3F 3D thật (`cinema/BoxStage.tsx`): mở 4 nắp, máy ảnh lao vào đáy hộp | Màn loading (chậm, theo tiến độ tải) và chuyển trang (nhanh ~2 s) |
| Chữ in khuôn | SplitText theo dòng có mask (chừa 0,16em cho dấu tiếng Việt) | `<Headline>` |
| Độ sâu | `data-speed="far|back|mid|front|near"`, `data-depth` theo con trỏ | `useChoreography`, `usePointerDepth` |
| Cảnh ghim | ScrollTrigger `pin` + `scrub` — chỉ desktop ≥1024px | 4 bước, cơ sở, két sắt |
| Biến hình | MorphSVG: lỗ khóa → dấu tích, vòng số quay 300° theo cuộn, xám thép → đồng thau (chỉ ≥1280px) | Két sắt |
| Video đồng bộ cuộn | tốc độ phát video bàn phím theo vận tốc cuộn trong đoạn ghim; video hành lang dolly theo tiến độ 4 bước | Két sắt, 4 bước |

Thời lượng: `micro 150ms · quick 300ms · base 600ms · slow 900ms · scene 1200ms`. Easing: `vault` (power3.out), `shutter` (expo.inOut), `lift` (expo.out), `drift` (sine.inOut). Tối đa một nhóm chuyển động lớn cùng lúc trong khung nhìn.

### 13.3 Quy tắc kỹ thuật

- Cuộn mượt: Lenis (`cinema/smooth.tsx`) chạy trên ticker của GSAP và gọi `ScrollTrigger.update` mỗi lần cuộn. Chỉ bật ở site công khai (trừ khi dùng `?motion=auto` trên máy giảm chuyển động). Cảm ứng giữ cuộn gốc. Vùng cuộn lồng nhau tự cuộn (`allowNestedScroll`, `data-lenis-prevent`). Khi hộp thoại Radix khóa cuộn, Lenis dừng. Code luôn được tải (ScrollManager) chỉ dùng `cinema/lenisRef.ts`, để Lenis/GSAP không lọt vào bundle chính.
- Mọi animation đi qua `useScene(ref, …)` (gsap.context + matchMedia) để tự dọn khi rời trang. Không gọi `gsap.to` trần trong component.
- Chiến lược thiết bị: desktop đầy đủ (ghim, thị sai); tablet bỏ ghim, giữ thị sai nhẹ; mobile chỉ reveal, không ghim, video 360p, không WebGL.
- Hiệu ứng **luôn bật mặc định**, kể cả khi hệ điều hành bật "giảm chuyển động" (quyết định sản phẩm). Không có nút dừng và không có con trỏ tùy biến — chỉ dùng con trỏ gốc của hệ điều hành (quyết định sản phẩm). Nhà phát triển muốn theo thiết lập hệ điều hành: `?motion=auto` (bật lại: `?motion=full`). Data Saver vẫn chỉ hiện poster thay video.
- Video: poster trước (không nhảy bố cục), gắn `<video>` chỉ khi gần khung nhìn, tạm dừng khi ra khỏi, lỗi thì giữ poster.
- 3D chỉ dùng khi giúp hiểu nội dung (mô hình kích thước kho cạnh người cao 1,7 m), tải lười, tắt trên thiết bị yếu.
- Khu đăng nhập không tải GSAP/Three: chuyển trang bằng CSS `.route-in`. Vite chia chunk theo đường dẫn module để entry không kéo Three.js.
- Video nền mới: cắt 1080p → 1280×720 VP9, hòa 0,8 s cuối vào đầu để lặp liền mạch; bản mobile 640×360; poster WebP/JPG (xem `MEDIA_CREDITS.md`).
- Màn loading (`cinema/Loader.tsx` + `cinema/BoxStage.tsx`, React Three Fiber): hộp carton kraft 3D đóng kín, quay chậm theo tiến độ tải thật; khi tải xong hộp đổi góc, 4 nắp (mỗi nắp một mesh, pivot đặt đúng đường gấp) mở lần lượt, máy ảnh lên đỉnh hộp rồi lao xuống đáy và trang chủ hiện ra. Nền nâu xám phẳng, ánh sáng Ambient + Directional, bóng đổ mềm (PCF + ContactShadows). Chỉ chạy lần đầu mỗi phiên; không có WebGL thì bỏ qua intro. Three.js tải lười, không nằm trong bundle đầu.
- Chuyển trang (`cinema/Transition.tsx`): cùng hộp 3D của màn loading, phát nhanh: trang mới mount ngay dưới màn che nâu xám; hộp rơi xuống, xoay, 4 nắp mở lần lượt, máy ảnh lên đỉnh rồi lao vào hộp trong khi màn che tan vào trang; tên trang đích hiện dưới hộp. WebGL được tạo một lần và giữ nguyên (chỉ render khi đang chuyển trang), Three.js tải lười khi trình duyệt rảnh. Chưa sẵn sàng hoặc không có WebGL thì màn che chỉ mờ đi — không bao giờ chặn điều hướng.

## 14. Bản đồ, vị trí cơ sở và ảnh

- **Bản đồ** (`widgets/vnmap.ts`, `MapView.tsx`): Leaflet với ô nền Google tiếng Việt (`hl=vi&gl=VN`), nhãn Hoàng Sa, Trường Sa, Biển Đông khi thu nhỏ, ghim kiểu hộp thương hiệu (`.vn-pin`), thẻ xem nhanh có liên kết vào trang cơ sở. Cách làm theo dự án Gánh Mưu Sinh. Lưu ý: địa chỉ ô Google không thuộc hợp đồng Maps Platform; trước khi chạy thương mại hãy đổi nhà cung cấp ô (chỉ sửa `vnmap.ts`).
- **Chọn vị trí** (`widgets/LocationPicker.tsx`): tìm địa chỉ, bấm bản đồ, kéo ghim, hoặc dùng vị trí của tôi. Mỗi lần đổi vị trí gọi `GET /geocoding/reverse` để tự điền số nhà, phường, quận, tỉnh. API tìm địa chỉ gọi Nominatim, nếu không kết nối được thì chuyển sang Photon (cùng dữ liệu OpenStreetMap); kết quả được lưu đệm 1 giờ, giới hạn 30 lần mỗi phút. Tọa độ lưu vào `facility.latitude/longitude`.
- **Tạo và sửa cơ sở** (`pages/ops/FacilityEditor.tsx`): ngăn kéo gồm mã, tên, bản đồ, địa chỉ, ảnh (tối đa 12, ảnh đầu là ảnh đại diện), liên hệ, tiện ích, giờ làm việc theo từng ngày (`widgets/WeekHours.tsx`). Nút "Vị trí & ảnh" trên từng dòng sửa tọa độ, địa chỉ và bộ ảnh của cơ sở có sẵn (`PATCH /facilities/:id`, `PUT /facilities/:id/photos`).
- **Ảnh tải lên** đi qua một đường duy nhất: `POST /media/upload-url` → trình duyệt PUT thẳng lên kho lưu trữ → `POST /media/:id/complete` (máy chủ kiểm tra kích thước và chữ ký tệp). Với `STORAGE_DRIVER=r2` kho là Cloudflare R2; cần đủ `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, tên bucket và `R2_PUBLIC_BASE_URL`, kèm cấu hình CORS của bucket (cho phép `PUT, GET, HEAD` từ địa chỉ web, header `Content-Type`). Thiếu khóa thì API tự dùng ổ đĩa cục bộ.
