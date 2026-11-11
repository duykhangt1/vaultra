import { useRef, useState } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { Button } from '@/ui';

/** PNG data URL + `#v=` pen strokes (normalised to the signature's bounding box) so the sealed PDF can draw it as vector lines. */
function encodeSignature(pad: SignatureCanvas): string {
  const png = pad.getTrimmedCanvas().toDataURL('image/png');
  try {
    const groups = (pad.toData() as { x: number; y: number }[][]).filter((g) => g.length);
    const pts = groups.flat();
    if (!pts.length) return png;
    const minX = Math.min(...pts.map((p) => p.x)), maxX = Math.max(...pts.map((p) => p.x));
    const minY = Math.min(...pts.map((p) => p.y)), maxY = Math.max(...pts.map((p) => p.y));
    const w = Math.max(1, maxX - minX), h = Math.max(1, maxY - minY);
    const s = groups.slice(0, 150).map((g) => {
      const step = Math.max(1, Math.ceil(g.length / 400));
      const out: number[] = [];
      g.forEach((p, i) => { if (i % step === 0 || i === g.length - 1) out.push(Math.round(((p.x - minX) / w) * 1000), Math.round(((p.y - minY) / h) * 1000)); });
      return out;
    });
    const json = JSON.stringify({ a: Math.round((w / h) * 1000) / 1000, s });
    const b64 = btoa(unescape(encodeURIComponent(json))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `${png}#v=${b64}`;
  } catch {
    return png;
  }
}

/** Hand-drawn signature → PNG data URL (server validates length and stores the image in the sealed PDF). */
export function SignaturePad({ onChange }: { onChange: (png: string | null) => void }) {
  const ref = useRef<SignatureCanvas>(null);
  const [empty, setEmpty] = useState(true);
  return (
    <div>
      <div className="rounded-xl border-2 border-dashed border-steel-300 bg-white">
        <SignatureCanvas ref={ref} penColor="#0e1b2c" canvasProps={{ className: 'h-40 w-full touch-none rounded-xl', 'aria-label': 'Vùng ký tên' }}
          onEnd={() => { setEmpty(false); onChange(encodeSignature(ref.current!)); }} />
      </div>
      <div className="mt-1.5 flex items-center justify-between text-xs text-steel-500"><span>Dùng chuột hoặc ngón tay để ký</span><Button size="sm" variant="ghost" disabled={empty} onClick={() => { ref.current?.clear(); setEmpty(true); onChange(null); }}>Xóa chữ ký</Button></div>
    </div>
  );
}
