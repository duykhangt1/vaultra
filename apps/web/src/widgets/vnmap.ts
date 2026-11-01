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
