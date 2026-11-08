import { useEffect, useId, useRef, useState } from 'react';
import { RefreshCw, Upload } from 'lucide-react';
import { Alert, Button } from '@/ui';

type Cam = { id: string; label: string };

/** Turns a getUserMedia / html5-qrcode failure into something a front-desk person can act on. */
export function explainCameraError(e: unknown): string {
  const raw = String((e as any)?.name ?? '') + ' ' + String((e as any)?.message ?? e ?? '');
  if (/NotAllowed|Permission|denied|dismissed/i.test(raw))
    return 'Trình duyệt đang chặn camera của trang này. Bấm biểu tượng ổ khóa (hoặc camera) cạnh thanh địa chỉ → Camera → Cho phép, rồi bấm "Thử lại".';
  if (/NotFound|DevicesNotFound|no camera|Requested device not found|OverconstrainedError/i.test(raw))
    return 'Không tìm thấy camera trên thiết bị này. Hãy cắm webcam hoặc dùng ảnh mã QR bên dưới.';
  if (/NotReadable|TrackStart|in use|Could not start video source|Starting videoinput failed/i.test(raw))
    return 'Camera đang được ứng dụng khác sử dụng (Zoom, Meet, tab khác…). Hãy tắt ứng dụng đó rồi bấm "Thử lại".';
  if (/Secure|https|insecure/i.test(raw)) return 'Trình duyệt chỉ cho dùng camera trên trang HTTPS (hoặc localhost).';
  return `Không mở được camera (${String((e as any)?.message ?? e ?? 'lỗi không rõ').slice(0, 120)}). Bấm "Thử lại" hoặc dùng ảnh mã QR bên dưới.`;
}

/**
 * Live camera QR scanner with a still-image fallback. `onCode` receives the raw decoded text once, then the camera stops.
 */
export function QrScanner({ onCode }: { onCode: (raw: string) => void }) {
  const rawId = useId().replace(/:/g, '');
  const readerId = `qr-reader-${rawId}`;
  const fileReaderId = `qr-file-reader-${rawId}`;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;
  const [camErr, setCamErr] = useState('');
  const [fileErr, setFileErr] = useState('');
  const [scanningFile, setScanningFile] = useState(false);
  const [starting, setStarting] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [cameras, setCameras] = useState<Cam[]>([]);
  const [deviceId, setDeviceId] = useState('');

  useEffect(() => {
    let cancelled = false;
    let done = false;
    let scanner: any = null;
    setCamErr('');
    setStarting(true);

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCamErr(
          window.isSecureContext === false
            ? 'Trình duyệt chỉ cho dùng camera trên trang HTTPS (hoặc localhost).'
            : 'Trình duyệt này không hỗ trợ truy cập camera. Hãy dùng Chrome, Edge hoặc Safari bản mới.',
        );
        setStarting(false);
        return;
      }
      const { Html5Qrcode } = await import('html5-qrcode');
      if (cancelled) return;
      scanner = new Html5Qrcode(readerId, { verbose: false, useBarCodeDetectorIfSupported: true } as any);
      const config = {
        fps: 12,
        qrbox: (w: number, h: number) => {
          const s = Math.max(160, Math.floor(Math.min(w, h) * 0.72));
          return { width: s, height: s };
        },
      };
      const onDecoded = (text: string) => {
        if (cancelled || done) return;
        done = true;
        scanner?.stop().catch(() => undefined);
        onCodeRef.current(text);
      };
      const attemptStart = (cam: string | MediaTrackConstraints) =>
        scanner.start(cam, config, onDecoded, () => undefined);

      // 1) the camera the person picked, 2) back camera, 3) front camera / any webcam, 4) first device found
      const ladder: Array<string | MediaTrackConstraints> = deviceId
        ? [deviceId]
        : [{ facingMode: 'environment' }, { facingMode: 'user' }, {}];
      let lastErr: unknown = null;
      let ok = false;
      for (const cam of ladder) {
        if (cancelled) return;
        try {
          await attemptStart(cam);
          ok = true;
          break;
        } catch (e) {
          lastErr = e;
          if (/NotAllowed|Permission|denied/i.test(String((e as any)?.name ?? e))) break; // asking again won't help
        }
      }
      if (!ok && !cancelled && !deviceId && !/NotAllowed|Permission|denied/i.test(String((lastErr as any)?.name ?? lastErr))) {
        try {
          const list: Cam[] = await Html5Qrcode.getCameras();
          for (const c of list) {
            if (cancelled) return;
            try {
              await attemptStart(c.id);
              ok = true;
              break;
            } catch (e) {
              lastErr = e;
            }
          }
        } catch (e) {
          lastErr = e;
        }
      }
      if (cancelled) {
        if (ok) scanner.stop().catch(() => undefined);
        return;
      }
      setStarting(false);
      if (!ok) {
        setCamErr(explainCameraError(lastErr));
        return;
      }
      // permission is granted now, so device labels are available for the picker
      Html5Qrcode.getCameras()
        .then((list: Cam[]) => !cancelled && setCameras(list))
        .catch(() => undefined);
    })().catch((e) => {
      if (!cancelled) {
        setStarting(false);
        setCamErr(explainCameraError(e));
      }
    });

    return () => {
      cancelled = true;
      try {
        if (scanner?.isScanning) scanner.stop().catch(() => undefined);
      } catch {
        // scanner was not running
      }
    };
  }, [readerId, attempt, deviceId]);

  const handleFileUpload = async (file: File) => {
    setFileErr('');
    setScanningFile(true);
    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      const fileScanner = new Html5Qrcode(fileReaderId);
      const decoded = await fileScanner.scanFile(file, false);
      fileScanner.clear();
      onCodeRef.current(decoded);
    } catch {
      try {
        if ('BarcodeDetector' in window) {
          const bmp = await createImageBitmap(file);
          const detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
          const codes = await detector.detect(bmp);
          if (codes?.[0]?.rawValue) {
            onCodeRef.current(codes[0].rawValue);
            return;
          }
        }
      } catch {
        // fallback failed
      }
      setFileErr('Không nhận diện được mã QR trong ảnh này. Hãy chọn ảnh rõ nét chứa mã QR đơn hàng (RSV-...).');
    } finally {
      setScanningFile(false);
    }
  };

  return (
    <div className="space-y-3.5">
      <div className={camErr ? 'hidden' : 'relative overflow-hidden rounded-2xl border-2 border-ink-900 bg-ink-950 p-1 shadow-inner'}>
        <span className="pointer-events-none absolute left-3 top-3 z-10 size-5 border-l-2 border-t-2 border-brass-400" />
        <span className="pointer-events-none absolute right-3 top-3 z-10 size-5 border-r-2 border-t-2 border-brass-400" />
        <span className="pointer-events-none absolute bottom-3 left-3 z-10 size-5 border-b-2 border-l-2 border-brass-400" />
        <span className="pointer-events-none absolute bottom-3 right-3 z-10 size-5 border-b-2 border-r-2 border-brass-400" />
        <div id={readerId} className="min-h-[220px] overflow-hidden rounded-xl bg-ink-950" />
        {starting && (
          <p className="absolute inset-0 z-20 grid place-items-center bg-ink-950/70 px-6 text-center text-sm font-semibold text-white">
            Đang mở camera… Nếu trình duyệt hỏi, hãy bấm “Cho phép”.
          </p>
        )}
      </div>
      {camErr && (
        <Alert tone="warn" title="Chưa mở được camera">
          <p>{camErr}</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-2.5"
            icon={<RefreshCw className="size-3.5" />}
            onClick={() => setAttempt((a) => a + 1)}
          >
            Thử lại
          </Button>
        </Alert>
      )}
      {!camErr && cameras.length > 1 && (
        <label className="flex flex-wrap items-center gap-2 text-xs font-semibold text-steel-600">
          Camera:
          <select
            value={deviceId}
            onChange={(e) => setDeviceId(e.target.value)}
            className="rounded-lg border hairline bg-white px-2.5 py-1.5 text-xs font-medium text-ink-950"
          >
            <option value="">Tự chọn</option>
            {cameras.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label || `Camera ${c.id.slice(0, 6)}`}
              </option>
            ))}
          </select>
        </label>
      )}
      <div id={fileReaderId} className="hidden" />
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-brass-500/45 bg-gradient-to-r from-brass-100/25 via-paper to-white p-3.5">
        <div className="flex items-center gap-3 text-xs text-steel-600">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl border hairline bg-white text-brass-700 shadow-2xs">
            <Upload className="size-4" />
          </span>
          <div>
            <p className="font-bold text-ink-950">Quét từ ảnh chụp màn hình / file mã QR</p>
            <p className="mt-0.5">Hỗ trợ tải ảnh mã QR đơn hàng khách gửi hoặc lưu từ trang Đặt kho</p>
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFileUpload(f);
            e.target.value = '';
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          loading={scanningFile}
          icon={<Upload className="size-3.5" />}
          onClick={() => fileInputRef.current?.click()}
        >
          Tải ảnh mã QR đơn hàng
        </Button>
      </div>
      {fileErr && <Alert tone="bad">{fileErr}</Alert>}
    </div>
  );
}
