import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

/**
 * Shared Leaflet helpers (same approach as the reference project "Gánh Mưu Sinh"): Vietnamese-language base
 * tiles with the national sea and island names, plus sovereignty labels for Hoàng Sa, Trường Sa and Biển Đông.
 * Tiles come from Google's public tile endpoint with hl=vi / gl=VN. That endpoint is not covered by a Maps
 * Platform contract; before a commercial launch switch to a licensed provider (only this file changes).
 */
export const VN_CENTER: [number, number] = [14.8, 107.5];

export const createVietnamTileLayer = () =>
  L.tileLayer('https://{s}.google.com/vt/lyrs=m&hl=vi&gl=VN&x={x}&y={y}&z={z}', { subdomains: ['mt0', 'mt1', 'mt2', 'mt3'], maxZoom: 20, attribution: 'Bản đồ Google tiếng Việt' });

const SOVEREIGNTY = [
  { name: 'QUẦN ĐẢO HOÀNG SA', sub: 'Huyện đảo Hoàng Sa, TP. Đà Nẵng, Việt Nam', lat: 16.5412, lng: 112.0125, radius: 95000 },
  { name: 'QUẦN ĐẢO TRƯỜNG SA', sub: 'Huyện đảo Trường Sa, tỉnh Khánh Hòa, Việt Nam', lat: 10.1256, lng: 114.3647, radius: 175000 },
];

/** Island labels and the "BIỂN ĐÔNG" sea label. Only visible when the map is zoomed out far enough to show them. */
export function applyVietnamSovereignty(map: L.Map) {
  const group = L.layerGroup();
  for (const p of SOVEREIGNTY) {
    const icon = L.divIcon({ className: 'vn-sov-wrap', html: `<div class="vn-sov"><span class="vn-sov-star">★</span><span><b>${p.name}</b><i>${p.sub}</i></span></div>`, iconSize: [250, 46], iconAnchor: [125, 23] });
    L.marker([p.lat, p.lng], { icon, interactive: false, keyboard: false, zIndexOffset: 800 }).addTo(group);
    L.circle([p.lat, p.lng], { radius: p.radius, color: '#b33629', fillColor: '#b33629', fillOpacity: 0.07, weight: 1.5, dashArray: '5 5', interactive: false }).addTo(group);
  }
  const sea = L.divIcon({ className: 'vn-sov-wrap', html: '<div class="vn-sea"><b>BIỂN ĐÔNG</b><i>Vùng biển chủ quyền Việt Nam</i></div>', iconSize: [220, 40], iconAnchor: [110, 20] });
  L.marker([13.5, 112.8], { icon: sea, interactive: false, keyboard: false, zIndexOffset: 700 }).addTo(group);
  const sync = () => { const show = map.getZoom() <= 8; if (show && !map.hasLayer(group)) group.addTo(map); if (!show && map.hasLayer(group)) map.removeLayer(group); };
  map.on('zoomend', sync); sync();
  return group;
}

export const pinIcon = (active = false) =>
  L.divIcon({ className: 'vn-pin-wrap', html: `<div class="vn-pin${active ? ' vn-pin--active' : ''}"><span></span></div>`, iconSize: active ? [34, 42] : [28, 36], iconAnchor: active ? [17, 42] : [14, 36], popupAnchor: [0, -34] });

export const validCoords = (lat: unknown, lng: unknown): boolean =>
  typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

/** A map with Vietnamese tiles, zoom control and sovereignty labels; call `map.remove()` to dispose. */
export function createVietnamMap(el: HTMLElement, opts: { center?: [number, number]; zoom?: number } = {}) {
  const map = L.map(el, { zoomControl: false, attributionControl: false, minZoom: 4 }).setView(opts.center ?? VN_CENTER, opts.zoom ?? 5);
  createVietnamTileLayer().addTo(map);
  L.control.zoom({ position: 'topright' }).addTo(map);
  L.control.attribution({ prefix: false, position: 'bottomright' }).addTo(map);
  applyVietnamSovereignty(map);
  // containers that start hidden or resize (tabs, drawers, sticky panels) need a re-measure or Leaflet draws grey tiles
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => map.invalidateSize()) : null;
  ro?.observe(el);
  map.on('unload', () => ro?.disconnect());
  return map;
}
