# Media studio

Sinh toàn bộ ảnh cơ sở, ảnh loại kho và video nền của Vaultra bằng three.js (xem `DESIGN_SYSTEM.md` §6).

```bash
# 1. chép three.js vào studio/lib (một lần)
cp ../../node_modules/.pnpm/three@0.172.0/node_modules/three/build/three.{module,core}.js studio/lib/
cp -r ../../node_modules/.pnpm/three@0.172.0/node_modules/three/examples/jsm studio/lib/jsm
# 2. cần Python + Playwright (Chromium) + Pillow
python render.py preview            # bản xem trước nhỏ -> out/preview-*.jpg
python render.py stills [tên...]    # ảnh WebP 2× khử răng cưa -> out/*.webp (+ -sm)
python render.py video [tên...]     # vòng lặp liền mạch trong VIDEOS -> out/<tên>.webm, <tên>-mobile.webm (640×360) + poster
                                    # street-night · hero-corridor · keypad-glow · moving-dawn
```
Sau đó chép `out/*.webp` vào `apps/web/public/media/` và video vào `apps/web/public/media/video/`.
Danh sách cảnh nằm trong `JOBS` ở `render.py`; cảnh được dựng trong `studio/studio.js` (`SCENES.*`).

Cảnh tĩnh được làm thành video bằng tùy chọn `drift` (camera đi trên quỹ đạo tuần hoàn để khung cuối khớp khung đầu), xem `studio.setup` trong `studio/studio.js`.
