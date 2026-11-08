import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { LocateFixed, Search } from 'lucide-react';
import { get } from '@/lib/api';
import { toast } from '@/ui/toast';
import { Button, Input } from '@/ui';
import { createVietnamMap, pinIcon, validCoords } from './vnmap';

export type PickedPlace = { latitude: number; longitude: number; displayName?: string; addressLine?: string; ward?: string; district?: string; province?: string };

/**
 * Choose a facility's exact position: search an address, click the map, drag the pin, or use "my location".
 * Every move reverse-geocodes (server side) so the caller can fill the address fields; the coordinates are what get saved.
 */
export function LocationPicker({ lat, lng, onChange, className = 'h-72' }: { lat: number | null; lng: number | null; onChange: (p: PickedPlace) => void; className?: string }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.Marker | null>(null);
  const cb = useRef(onChange);
  cb.current = onChange;
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [hits, setHits] = useState<PickedPlace[]>([]);

  const place = async (latitude: number, longitude: number, reverse = true) => {
    const la = +latitude.toFixed(6), lo = +longitude.toFixed(6);
    cb.current({ latitude: la, longitude: lo });
    if (!reverse) return;
    try { const r = await get<PickedPlace>('/geocoding/reverse', { lat: la, lng: lo }); cb.current({ ...r, latitude: la, longitude: lo }); } catch { /* the coordinates are still saved; the address can be typed */ }
  };
  const placeRef = useRef(place);
  placeRef.current = place;

  useEffect(() => {
    if (!el.current) return;
    const has = validCoords(lat, lng);
    const m = createVietnamMap(el.current, { center: has ? [lat!, lng!] : undefined, zoom: has ? 16 : 6 });
    map.current = m;
    const drop = (la: number, lo: number) => {
      if (marker.current) marker.current.setLatLng([la, lo]);
      else {
        marker.current = L.marker([la, lo], { icon: pinIcon(true), draggable: true, title: 'Kéo để chỉnh vị trí' }).addTo(m);
        marker.current.on('dragend', () => { const p = marker.current!.getLatLng(); placeRef.current(p.lat, p.lng); });
      }
    };
    if (has) drop(lat!, lng!);
    m.on('click', (e: L.LeafletMouseEvent) => { drop(e.latlng.lat, e.latlng.lng); placeRef.current(e.latlng.lat, e.latlng.lng); });
    return () => { m.remove(); map.current = null; marker.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // keep the pin in step with coordinates edited elsewhere (typed in, or chosen from a search result)
  useEffect(() => {
    const m = map.current;
    if (!m || !validCoords(lat, lng)) return;
    if (marker.current) { const c = marker.current.getLatLng(); if (Math.abs(c.lat - lat!) < 1e-5 && Math.abs(c.lng - lng!) < 1e-5) return; marker.current.setLatLng([lat!, lng!]); }
    else {
      marker.current = L.marker([lat!, lng!], { icon: pinIcon(true), draggable: true, title: 'Kéo để chỉnh vị trí' }).addTo(m);
      marker.current.on('dragend', () => { const p = marker.current!.getLatLng(); placeRef.current(p.lat, p.lng); });
    }
    m.setView([lat!, lng!], Math.max(m.getZoom(), 16));
  }, [lat, lng]);

  async function search() {
    const text = q.trim();
    if (text.length < 2) return;
    setBusy(true);
    try {
      const r = await get<PickedPlace[]>('/geocoding/search', { q: text });
      setHits(r);
      if (!r.length) toast.err('Không tìm thấy địa chỉ này. Thử thêm quận hoặc tỉnh, hoặc bấm thẳng lên bản đồ.');
    } catch (e) { toast.err((e as Error).message); } finally { setBusy(false); }
  }
  function mine() {
    if (!navigator.geolocation) return toast.err('Trình duyệt không hỗ trợ định vị');
    navigator.geolocation.getCurrentPosition((p) => placeRef.current(p.coords.latitude, p.coords.longitude), () => toast.err('Không lấy được vị trí. Hãy cho phép định vị hoặc chọn trên bản đồ.'), { enableHighAccuracy: true, timeout: 10000 });
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); search(); } }} placeholder="Tìm địa chỉ, ví dụ: 12 Nguyễn Văn Linh, Quận 7" aria-label="Tìm địa chỉ trên bản đồ" />
        </div>
        <Button type="button" variant="outline" loading={busy} onClick={search} aria-label="Tìm địa chỉ"><Search className="size-4" /></Button>
        <Button type="button" variant="outline" onClick={mine} aria-label="Dùng vị trí của tôi" title="Vị trí của tôi"><LocateFixed className="size-4" /></Button>
      </div>
      {hits.length > 0 && (
        <ul className="max-h-44 divide-y overflow-auto rounded-xl border hairline bg-white text-sm shadow-sm">
          {hits.map((h, i) => (
            <li key={i}><button type="button" className="block w-full px-3 py-2 text-left hover:bg-steel-50" onClick={() => { setHits([]); cb.current({ ...h }); }}>{h.displayName}</button></li>
          ))}
        </ul>
      )}
      <div ref={el} className={`${className} overflow-hidden rounded-xl border hairline bg-steel-100`} role="application" aria-label="Bản đồ chọn vị trí: bấm để đặt ghim, kéo ghim để chỉnh" />
      <p className="text-xs text-steel-500">{validCoords(lat, lng) ? <>Vị trí đã chọn: <span className="num font-semibold text-ink-900">{lat!.toFixed(6)}, {lng!.toFixed(6)}</span>. Kéo ghim hoặc bấm vị trí khác để chỉnh.</> : 'Chưa chọn vị trí. Tìm địa chỉ hoặc bấm lên bản đồ để đặt ghim.'}</p>
    </div>
  );
}
