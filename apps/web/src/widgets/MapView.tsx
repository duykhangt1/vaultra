import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import { createVietnamMap, pinIcon, validCoords } from './vnmap';

type Pt = { id: string; lat: number; lng: number; label: string; sub?: string; href?: string };

/**
 * Facility map: Leaflet with Vietnamese-language tiles (see ./vnmap). Pins open a small card with the facility
 * name, a line of detail and a link to its page; the view fits all pins.
 */
export function MapView({ points, className, zoom = 15 }: { points: Pt[]; className?: string; zoom?: number }) {
  const el = useRef<HTMLDivElement>(null);
  const nav = useNavigate();
  const navRef = useRef(nav);
  navRef.current = nav;
  const key = JSON.stringify(points.map((p) => [p.id, p.lat, p.lng]));

  useEffect(() => {
    if (!el.current) return;
    const pts = points.filter((p) => validCoords(p.lat, p.lng));
    const map = createVietnamMap(el.current, { center: pts[0] ? [pts[0].lat, pts[0].lng] : undefined, zoom: pts.length === 1 ? zoom : 5 });
    for (const p of pts) {
      const m = L.marker([p.lat, p.lng], { icon: pinIcon(), title: p.label, riseOnHover: true }).addTo(map);
      const card = document.createElement('div');
      card.className = 'vn-popup';
      const name = document.createElement('strong'); name.textContent = p.label; card.appendChild(name);
      if (p.sub) { const s = document.createElement('span'); s.textContent = p.sub; card.appendChild(s); }
      if (p.href) { const a = document.createElement('a'); a.href = p.href; a.textContent = 'Xem cơ sở →'; a.onclick = (e) => { e.preventDefault(); navRef.current(p.href!); }; card.appendChild(a); }
      m.bindPopup(card, { closeButton: false, offset: [0, -4] });
    }
    if (pts.length > 1) map.fitBounds(L.latLngBounds(pts.map((p) => [p.lat, p.lng] as [number, number])), { padding: [48, 48], maxZoom: 14 });
    return () => { map.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, zoom]);

  return <div ref={el} className={`${className ?? ''} overflow-hidden rounded-[var(--radius-media)] border hairline bg-steel-100`} role="region" aria-label="Bản đồ cơ sở" />;
}
