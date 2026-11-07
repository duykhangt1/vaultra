import { API_ORIGIN } from './api';

/** Rendered imagery (see DESIGN_SYSTEM.md §6). API-provided photos always win over these defaults. */
const M = '/media';

export function resolveMediaUrl(url?: string | null): string | null {
  if (!url) return null;
  if (url.startsWith('/v1/media/')) return `${API_ORIGIN}${url}`;
  const m = url.match(/^https?:\/\/[^/]+(\/v1\/media\/.*)$/);
  if (m && API_ORIGIN) return `${API_ORIGIN}${m[1]}`;
  return url;
}

export const HERO_VIDEO = { webm: `${M}/video/hero-corridor.webm`, poster: `${M}/video/hero-corridor-poster.webp`, posterJpg: `${M}/video/hero-corridor-poster.jpg` };

/** Seamless rendered loops, one per visual environment (tools/media-studio VIDEOS). Mobile = 640×360 encode. */
const vid = (n: string, mobile = true) => ({ webm: `${M}/video/${n}.webm`, mobile: mobile ? `${M}/video/${n}-mobile.webm` : undefined, poster: `${M}/video/${n}-poster.webp` });
export const FILM = {
  /** storage hall with numbered unit doors: the opening film of the site */
  hero: vid('hero-corridor'),
  keypad: vid('keypad-glow'),
  dawn: vid('moving-dawn'),
};

const MV = '?v=2';

export const SCENES = {
  keypad: `${M}/scene-keypad.webp${MV}`,
  moving: `${M}/scene-moving.webp${MV}`,
  business: `${M}/scene-business.webp`,
  lobbyA: `${M}/facility-lobby-a.webp`,
  lobbyB: `${M}/facility-lobby-b.webp`,
  corridor: `${M}/facility-cau-giay-corridor.webp`,
};

export const STEP_IMAGES = {
  step1: `${M}/step-01-size.webp${MV}`,
  step2: `${M}/step-02-reserve.webp${MV}`,
  step3: `${M}/step-03-checkin.webp${MV}`,
  step4: `${M}/step-04-manage.webp${MV}`,
};

export const sm = (src: string) =>
  src && src.startsWith('/media/') && !/-sm\.webp(\?|$)/.test(src) ? src.replace(/\.webp(\?.*)?$/, '-sm.webp$1') : src;

type Shot = { src: string; caption: string };
const FAC: Record<string, { key: string; lobby: 'a' | 'b' }> = {
  'vaultra-cau-giay': { key: 'cau-giay', lobby: 'a' },
  'vaultra-quan-7': { key: 'quan-7', lobby: 'b' },
  'vaultra-thu-duc': { key: 'thu-duc', lobby: 'a' },
};
const FALLBACK_KEYS = ['cau-giay', 'quan-7', 'thu-duc'];
function keyFor(slug?: string | null) {
  if (slug && FAC[slug]) return FAC[slug];
  // stable pick for facilities created later
  const h = [...(slug ?? 'x')].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  return { key: FALLBACK_KEYS[h % 3], lobby: (h % 2 ? 'a' : 'b') as 'a' | 'b' };
}

export function facilityDefaultCover(f?: { slug?: string } | null) {
  return `${M}/facility-${keyFor(f?.slug).key}-exterior.webp`;
}

export function facilityCover(f?: { slug?: string; coverUrl?: string | null; photos?: { url: string }[] } | null) {
  const uploaded = resolveMediaUrl(f?.coverUrl || f?.photos?.[0]?.url);
  return uploaded || facilityDefaultCover(f);
}

export function facilityGallery(f: { slug?: string; name?: string; coverUrl?: string | null; photos?: { url: string; caption?: string | null }[] }): Shot[] {
  const k = keyFor(f.slug);
  const own: Shot[] = (f.photos ?? [])
    .map((p) => ({ src: resolveMediaUrl(p.url) ?? p.url, caption: p.caption ?? f.name ?? '' }))
    .filter((p) => !!p.src);
  if (!own.length && f.coverUrl) {
    const cov = resolveMediaUrl(f.coverUrl);
    if (cov) own.push({ src: cov, caption: f.name ?? '' });
  }
  return [
    ...own,
    { src: `${M}/facility-${k.key}-exterior.webp`, caption: `Mặt tiền ${f.name ?? ''}`.trim() },
    { src: `${M}/facility-${k.key}-corridor.webp`, caption: 'Hành lang kho, đèn LED và camera suốt tuyến' },
    { src: `${M}/facility-lobby-${k.lobby}.webp`, caption: 'Quầy lễ tân và cổng truy cập bằng mã PIN' },
    { src: SCENES.keypad, caption: 'Bàn phím truy cập cá nhân tại mỗi khu' },
  ];
}

export type UnitMediaLike = {
  name?: string | null;
  size_category?: string | null;
  area_m2?: number | string | null;
  ground_floor?: boolean | null;
  drive_up?: boolean | null;
  climate_controlled?: boolean | null;
  photos?: { url: string }[] | null;
};

const UNIT: Record<string, string> = { LOCKER: 'locker', XS: 'xs', S: 's', M: 'm', L: 'l', XL: 'xl', VEHICLE: 'vehicle' };

function unitKeyFor(u?: UnitMediaLike | null): string {
  const name = (u?.name ?? '').trim();
  const area = Number(u?.area_m2 ?? 0);
  if (name) {
    if (/tủ\s*khóa|locker/i.test(name)) return 'xs';
    if (/xe\s*&|phương\s*tiện|xe\s*máy|cồng\s*kềnh|vehicle/i.test(name)) return 'vehicle';
    if (/tầng\s*trệt|ground/i.test(name)) return 'mg';
    if (/cực\s*lớn|xe\s*vào|drive[\s-]*up|20\s*m/i.test(name)) return 'xl';
    if (/kho\s*lớn|10\s*m|12\s*m|15\s*m/i.test(name)) return 'l';
    if (/kho\s*3\s*m|9\s*m/i.test(name)) return area >= 8 ? 'l' : 'm';
    if (/kho\s*vừa|[56]\s*m/i.test(name)) return u?.ground_floor || u?.drive_up ? 'mg' : 'm';
    if (/kho\s*nhỏ|2[.,]5\s*m/i.test(name)) return 's';
  }
  let k = UNIT[u?.size_category ?? 'M'] ?? 'm';
  if (k === 'm' && (u?.ground_floor || u?.drive_up)) k = 'mg';
  return k;
}

export function unitDefaultImage(u?: UnitMediaLike | null, small = false) {
  const k = unitKeyFor(u);
  const src = `${M}/unit-${k}.webp${MV}`;
  return small ? sm(src) : src;
}
export function unitImage(u?: UnitMediaLike | null, small = false) {
  const uploaded = resolveMediaUrl(u?.photos?.[0]?.url);
  if (uploaded) return uploaded;
  return unitDefaultImage(u, small);
}
export const unitImageBySize = (size: string, small = false) => unitImage({ size_category: size }, small);

/** Size explorer copy for the public site. */
export const SIZE_GUIDE: { size: string; title: string; area: string; dims: [number, number, number]; fits: string; for: string }[] = [
  { size: 'XS', title: 'Tủ khóa', area: '1 m²', dims: [1, 1, 2], fits: 'Vài thùng carton, vali, đồ mùa đông, giấy tờ.', for: 'Sinh viên, ở ghép' },
  { size: 'S', title: 'Kho nhỏ', area: '2,5 m²', dims: [1.6, 1.6, 2.4], fits: 'Đồ của một phòng ngủ: 10–15 thùng, vali, ghế, quạt.', for: 'Người đi công tác dài ngày' },
  { size: 'M', title: 'Kho vừa', area: '5–6 m²', dims: [2, 2.5, 2.4], fits: 'Căn hộ 1 phòng ngủ: sofa, nệm, xe đạp, 20 thùng.', for: 'Chuyển nhà, sửa nhà' },
  { size: 'L', title: 'Kho lớn', area: '10 m²', dims: [2.6, 4, 2.6], fits: 'Căn hộ 2 phòng ngủ: tủ lạnh, tủ áo, bàn ăn, sofa 3 chỗ.', for: 'Gia đình' },
  { size: 'XL', title: 'Kho cực lớn', area: '20 m²', dims: [4, 5, 2.8], fits: 'Nhà 3 phòng hoặc hàng tồn kho: kệ, pallet, thiết bị.', for: 'Shop online, doanh nghiệp nhỏ' },
];
