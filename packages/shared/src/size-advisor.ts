/**
 * Size advisor conversion table (spec §4.1, §22.3 recommend_size): volume is computed in code,
 * never guessed by the AI model. Values are approximate packed volumes in m³.
 */
export const SIZE_ITEMS: { code: string; label: string; volume: number }[] = [
  { code: 'box_small', label: 'Thùng carton nhỏ', volume: 0.03 },
  { code: 'box_medium', label: 'Thùng carton vừa', volume: 0.06 },
  { code: 'box_large', label: 'Thùng carton lớn', volume: 0.1 },
  { code: 'sofa_2', label: 'Sofa 2 chỗ', volume: 1.2 },
  { code: 'sofa_3', label: 'Sofa 3 chỗ', volume: 1.8 },
  { code: 'bed_single', label: 'Giường đơn (kèm nệm)', volume: 1.2 },
  { code: 'bed_double', label: 'Giường đôi (kèm nệm)', volume: 2.0 },
  { code: 'wardrobe', label: 'Tủ quần áo', volume: 1.5 },
  { code: 'fridge', label: 'Tủ lạnh', volume: 0.8 },
  { code: 'washer', label: 'Máy giặt', volume: 0.4 },
  { code: 'tv', label: 'TV', volume: 0.2 },
  { code: 'desk', label: 'Bàn làm việc', volume: 0.6 },
  { code: 'chair', label: 'Ghế', volume: 0.25 },
  { code: 'dining_set', label: 'Bộ bàn ăn 4 ghế', volume: 1.4 },
  { code: 'bookshelf', label: 'Kệ sách', volume: 0.5 },
  { code: 'motorbike', label: 'Xe máy', volume: 1.5 },
  { code: 'bicycle', label: 'Xe đạp', volume: 0.6 },
];

export const SIZE_CATEGORY_CAPACITY: { category: string; maxVolume: number; label: string }[] = [
  { category: 'LOCKER', maxVolume: 0.8, label: 'Tủ gửi đồ' },
  { category: 'XS', maxVolume: 3, label: 'Rất nhỏ (~1–2 m²)' },
  { category: 'S', maxVolume: 7, label: 'Nhỏ (~3–4 m²)' },
  { category: 'M', maxVolume: 14, label: 'Vừa (~6–8 m²)' },
  { category: 'L', maxVolume: 25, label: 'Lớn (~10–12 m²)' },
  { category: 'XL', maxVolume: 60, label: 'Rất lớn (≥ 15 m²)' },
];

/** Returns estimated volume (with 25% packing allowance) and recommended size category. */
export function recommendSize(items: { code: string; qty: number }[]): { volume: number; category: string; label: string } {
  const raw = items.reduce((s, it) => {
    const def = SIZE_ITEMS.find((x) => x.code === it.code);
    return s + (def ? def.volume * Math.max(0, it.qty) : 0);
  }, 0);
  const volume = Math.round(raw * 1.25 * 100) / 100;
  const cat = SIZE_CATEGORY_CAPACITY.find((c) => volume <= c.maxVolume) ?? SIZE_CATEGORY_CAPACITY[SIZE_CATEGORY_CAPACITY.length - 1];
  return { volume, category: cat.category, label: cat.label };
}
