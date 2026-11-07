import { useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';
import { uploadFile } from '@/lib/api';
import { toast } from '@/ui/toast';
import { Spinner } from '@/ui';

export type Photo = { id: string; name: string; url: string };
/** Pick/capture photos, upload via presigned URL, report media ids. */
export function PhotoUpload({ value, onChange, purpose, relatedType, relatedId, facilityId, max = 6, label = 'Thêm ảnh', camera = true }: { value: Photo[]; onChange: (p: Photo[]) => void; purpose: string; relatedType?: string; relatedId?: string; facilityId?: string; max?: number; label?: string; /** open the camera directly on phones (field photos); off for pick-from-gallery */ camera?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  async function pick(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      const next = [...value];
      for (const f of Array.from(files).slice(0, max - value.length)) {
        if (!/^image\//.test(f.type)) { toast.err('Chỉ nhận ảnh'); continue; }
        if (f.size > 10 * 1024 * 1024) { toast.err('Ảnh tối đa 10MB'); continue; }
        const id = await uploadFile(f, { purpose, relatedType, relatedId, facilityId });
        next.push({ id, name: f.name, url: URL.createObjectURL(f) });
      }
      onChange(next);
    } catch (e) { toast.err((e as Error).message); } finally { setBusy(false); if (input.current) input.current.value = ''; }
  }
  return (
    <div className="flex flex-wrap gap-2">
      {value.map((p) => <div key={p.id} className="relative size-20 overflow-hidden rounded-lg border hairline"><img src={p.url} alt={p.name} className="size-full object-cover" /><button type="button" aria-label="Xóa ảnh" onClick={() => onChange(value.filter((x) => x.id !== p.id))} className="absolute right-0.5 top-0.5 rounded-full bg-ink-900/80 p-0.5 text-white"><X className="size-3.5" /></button></div>)}
      {value.length < max && <button type="button" onClick={() => input.current?.click()} disabled={busy} className="flex size-20 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-steel-300 text-xs font-semibold text-steel-500 hover:border-ink-900">{busy ? <Spinner /> : <><Camera className="size-5" />{label}</>}</button>}
      <input ref={input} type="file" accept="image/*" {...(camera ? { capture: 'environment' as const } : {})} multiple hidden onChange={(e) => pick(e.target.files)} />
    </div>
  );
}
