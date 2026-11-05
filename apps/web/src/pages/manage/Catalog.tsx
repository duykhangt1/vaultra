import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useGet, useAct } from '@/lib/hooks';
import { post, patch, put, del } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Async, Card, CardHead, PageHeader, StatusBadge, Button, Select, Modal, Field, Input, MoneyInput, DataTable, Badge, Alert, Switch, Textarea, HelpTip } from '@/ui';
import { vnd, SIZE_LABEL } from '@/lib/format';
import { unitImage, unitDefaultImage } from '@/lib/media';
import { PhotoUpload, Photo } from '@/widgets/PhotoUpload';
import { ActBtn, REASON, Money } from '../kit';
import { useFacility, FloorPlan, UnitsTable, UnitDrawer } from '../shared/Ops';
import { toast } from '@/ui/toast';

export function UnitTypes() {
  const { id } = useFacility();
  const can = useAuth((s) => s.can);
  const q = useGet<any[]>(id ? `/facilities/${id}/unit-types` : null);
  const bandQ = useGet<any[]>(id ? `/facilities/${id}/price-bands` : null);
  const bands: Record<string, any> = Object.fromEntries((bandQ.data ?? []).map((b) => [b.sizeCategory, b]));
  const [edit, setEdit] = useState<any>(null);
  return (
    <>
      <PageHeader title="Loại kho" sub="Kích thước, giá, hình ảnh và khả năng đặt online" actions={can('unit_type.manage', true) && <Button variant="primary" size="sm" icon={<Plus className="size-4" />} onClick={() => setEdit({})}>Thêm loại kho</Button>} />
      <Card><DataTable rows={q.data} loading={q.isLoading} error={q.error} onRetry={q.refetch} rowKey={(u) => u.id} onRow={(u) => can('unit_type.manage', true) && setEdit(u)}
        cols={[{ key: 'c', header: 'Loại kho', cell: (u) => <span className="flex items-center gap-3"><img src={unitImage(u, true)} onError={(e) => { const fb = unitDefaultImage(u, true); if (!e.currentTarget.src.endsWith(fb)) e.currentTarget.src = fb; }} alt="" loading="lazy" className="h-11 w-16 shrink-0 rounded-lg bg-ink-900 object-cover" /><span><b>{u.name}</b><span className="block text-xs text-steel-500 code">{u.code} · {SIZE_LABEL[u.size_category] ?? u.size_category} · {u.area_m2} m²</span></span></span> }, { key: 'p', header: 'Giá online', cell: (u) => <Money v={u.online_price} strong /> }, { key: 'l', header: 'Giá niêm yết', hideBelow: 'md', cell: (u) => <Money v={u.list_price} /> }, { key: 'band', header: 'Dải giá BOM cho phép', hideBelow: 'sm', cell: (u) => <BandCell band={bands[u.size_category] ?? u.priceBand} prices={[+u.list_price, +u.online_price]} /> }, { key: 'o', header: 'Lấp đầy', hideBelow: 'sm', cell: (u) => `${Math.round((u.occupancy ?? 0) * 100)}% (${u.totalUnits} kho)` }, { key: 'b', header: 'Đặt online', hideBelow: 'md', cell: (u) => <Badge tone={u.is_bookable ? 'ok' : 'neutral'}>{u.is_bookable ? 'Bật' : 'Tắt'}</Badge> }, { key: 's', header: 'Trạng thái', cell: (u) => <StatusBadge kind="generic" value={u.status} /> }]} /></Card>
      <TypeModal u={edit} facilityId={id!} bands={bands} onClose={() => setEdit(null)} />
    </>
  );
}

/** The BOM-set monthly price range for a size group: accepts the API's {min,max} or a raw price_band row. */
function bandRange(b: any): { min: number; max: number } | null {
  if (!b) return null;
  const min = Number(b.min ?? b.min_monthly_price), max = Number(b.max ?? b.max_monthly_price);
  return Number.isFinite(min) && Number.isFinite(max) ? { min, max } : null;
}

function BandCell({ band, prices }: { band: any; prices: number[] }) {
  const r = bandRange(band);
  if (!r) return <span className="text-xs text-steel-400">Chưa đặt khung</span>;
  const out = prices.some((p) => p < r.min || p > r.max);
  return (
    <span className="block text-xs">
      <span className={out ? 'font-semibold text-bad' : 'text-steel-700'}>{vnd(r.min)} – {vnd(r.max)}</span>
      <HelpTip text={`Khung giá/tháng mà Quản lý vận hành (BOM) đã đặt cho nhóm kích thước này${band.scope === 'FACILITY' ? ' tại cơ sở của bạn' : ' trên toàn hệ thống'}. Đặt giá trong khung thì có hiệu lực ngay; ngoài khung phải gửi đề xuất để BOM duyệt.`} />
      {out && <span className="block text-bad">Giá hiện tại nằm ngoài khung</span>}
    </span>
  );
}

function TypeModal({ u, facilityId, bands, onClose }: { u: any; facilityId: string; bands: Record<string, any>; onClose: () => void }) {
  const isNew = u && !u.id;
  const [f, setF] = useState<any>({});
  const [photos, setPhotos] = useState<Photo[]>([]);
  const init = () => {
    setF(isNew ? { code: '', name: '', sizeCategory: 'S', widthM: 1, depthM: 1, heightM: 2.4, listPrice: '', onlinePrice: '', climateControlled: false, isBookable: true, status: 'ACTIVE' } : { name: u.name, widthM: u.width_m, depthM: u.depth_m, heightM: u.height_m, listPrice: u.list_price, onlinePrice: u.online_price, climateControlled: u.climate_controlled, isBookable: u.is_bookable, status: u.status, fitsDescription: u.fits_description ?? '', version: u.version });
    setPhotos((u?.photos ?? []).map((p: any) => ({ id: p.id, url: p.url, caption: p.caption })));
  };
  const [last, setLast] = useState<any>(null);
  if (u !== last) { setLast(u); if (u) init(); }
  const set = (k: string, v: any) => setF((s: any) => ({ ...s, [k]: v }));
  const save = useAct(() => {
    const photoIds = photos.map((p) => p.id);
    const body: any = { ...f, widthM: +f.widthM, depthM: +f.depthM, heightM: +f.heightM, listPrice: +f.listPrice, onlinePrice: +f.onlinePrice, photoIds };
    if (isNew) { return post(`/facilities/${facilityId}/unit-types`, body); }
    const cur: any = { name: u.name, widthM: +u.width_m, depthM: +u.depth_m, heightM: +u.height_m, listPrice: +u.list_price, onlinePrice: +u.online_price, climateControlled: u.climate_controlled, isBookable: u.is_bookable, status: u.status, fitsDescription: u.fits_description ?? '' };
    const diff: any = { version: u.version, photoIds };
    for (const k of Object.keys(cur)) if (body[k] !== cur[k]) diff[k] = body[k];
    if (f.reason) diff.reason = f.reason;
    return patch(`/unit-types/${u.id}`, diff);
  }, { ok: 'Đã lưu loại kho', invalidate: ['/facilities', '/catalog'], onSuccess: onClose });
  const valid = (!isNew || (f.code?.trim() && f.name?.trim())) && f.name?.trim() && +f.listPrice > 0 && +f.onlinePrice > 0 && +f.onlinePrice <= +f.listPrice && +f.widthM > 0 && +f.depthM > 0 && +f.heightM > 0;
  return (
    <Modal open={!!u} onClose={onClose} size="lg" title={isNew ? 'Thêm loại kho' : `Sửa ${u?.name ?? ''}`} footer={<>{!isNew && u?.id && <ActBtn label="Đề xuất đổi giá (ngoài khung)" title="Đề xuất đổi giá" description="Gửi Vận hành duyệt khi giá nằm ngoài khung cho phép." fields={[{ name: 'field', label: 'Loại giá', type: 'select', required: true, options: [{ value: 'LIST_PRICE', label: 'Giá niêm yết' }, { value: 'ONLINE_PRICE', label: 'Giá online' }] }, { name: 'proposedValue', label: 'Giá đề xuất', type: 'money', required: true }, { ...REASON }]} run={(v) => post(`/unit-types/${u.id}/price-change-requests`, { field: v.field, proposedValue: +v.proposedValue, reason: v.reason })} ok="Đã gửi đề xuất" />}<Button variant="ghost" onClick={onClose}>Đóng</Button><Button variant="primary" disabled={!valid} loading={save.isPending} onClick={() => save.mutate(undefined)}>Lưu</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        {isNew && <Field label="Mã" required><Input value={f.code ?? ''} maxLength={32} onChange={(e) => set('code', e.target.value.toUpperCase())} /></Field>}
        <Field label="Tên" required><Input value={f.name ?? ''} maxLength={120} onChange={(e) => set('name', e.target.value)} /></Field>
        {isNew && <Field label="Nhóm kích thước"><Select value={f.sizeCategory} onChange={(e) => set('sizeCategory', e.target.value)}>{Object.entries(SIZE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>}
        <Field label="Rộng (m)"><Input type="number" step="0.1" min="0.1" value={f.widthM ?? ''} onChange={(e) => set('widthM', e.target.value)} /></Field><Field label="Sâu (m)"><Input type="number" step="0.1" min="0.1" value={f.depthM ?? ''} onChange={(e) => set('depthM', e.target.value)} /></Field><Field label="Cao (m)"><Input type="number" step="0.1" min="0.1" value={f.heightM ?? ''} onChange={(e) => set('heightM', e.target.value)} /></Field>
        <Field label="Giá niêm yết / tháng" required><MoneyInput value={f.listPrice ?? ''} onChange={(v) => set('listPrice', v)} /></Field><Field label="Giá online / tháng" required error={+f.onlinePrice > +f.listPrice ? 'Không được cao hơn giá niêm yết' : undefined}><MoneyInput value={f.onlinePrice ?? ''} onChange={(v) => set('onlinePrice', v)} /></Field>
        <div className="sm:col-span-2"><Field label="Phù hợp để chứa"><Input value={f.fitsDescription ?? ''} maxLength={255} onChange={(e) => set('fitsDescription', e.target.value)} /></Field></div>
        <div className="sm:col-span-2"><PhotoUpload value={photos} onChange={setPhotos} purpose="UNIT_TYPE_PHOTO" max={6} label="Hình ảnh loại kho (hiển thị công khai)" /></div>
        {!isNew && <div className="sm:col-span-2"><Field label="Lý do thay đổi (bắt buộc khi đổi kích thước/giá đang có thuê)"><Input value={f.reason ?? ''} maxLength={255} onChange={(e) => set('reason', e.target.value)} /></Field></div>}
        <Switch checked={!!f.climateControlled} onChange={(v) => set('climateControlled', v)} label="Điều hòa" /><Switch checked={!!f.isBookable} onChange={(v) => set('isBookable', v)} label="Cho đặt online" />
        <Field label="Trạng thái"><Select value={f.status} onChange={(e) => set('status', e.target.value)}><option value="DRAFT">Nháp</option><option value="ACTIVE">Hoạt động</option><option value="ARCHIVED">Lưu trữ</option></Select></Field>
      </div>
      {(() => {
        const size = isNew ? f.sizeCategory : u?.size_category;
        const r = bandRange(bands[size] ?? u?.priceBand);
        const out = !!r && [+f.listPrice, +f.onlinePrice].some((p) => p > 0 && (p < r.min || p > r.max));
        return (
          <Alert tone={out ? 'bad' : 'info'}>
            {r ? <>Dải giá BOM đã đặt cho nhóm {SIZE_LABEL[size] ?? size}: <b>{vnd(r.min)} – {vnd(r.max)}</b> / tháng. </> : <>BOM chưa đặt dải giá cho nhóm này, bạn có thể đặt giá tự do. </>}
            {out ? 'Giá bạn nhập đang nằm ngoài dải nên không lưu được, hãy dùng "Đề xuất đổi giá" để BOM duyệt.' : 'Giá nằm ngoài dải này sẽ cần Vận hành duyệt (yêu cầu đổi giá).'}
          </Alert>
        );
      })()}
    </Modal>
  );
}

export function UnitsPage() {
  const { id } = useFacility();
  const can = useAuth((s) => s.can);
  const fac = useGet<any>(id ? `/facilities/${id}` : null);
  const types = useGet<any[]>(id ? `/facilities/${id}/unit-types` : null);
  const [bulk, setBulk] = useState(false);
  const [one, setOne] = useState(false);
  const [o, setO] = useState({ code: '', unitTypeId: '', zoneId: '', doorType: 'ROLL_UP' });
  const [f, setF] = useState({ prefix: 'B-', from: 1, to: 10, pad: 3, unitTypeId: '', zoneId: '', doorType: 'ROLL_UP' });
  const m = useAct(() => post(`/facilities/${id}/units/bulk`, { ...f }), { ok: (r: any) => `Đã tạo ${r.created ?? r.count ?? ''} kho`, invalidate: ['/facilities', '/zones'], onSuccess: () => setBulk(false) });
  const m1 = useAct(() => post(`/facilities/${id}/units`, { ...o, code: o.code.trim() }), { ok: 'Đã tạo kho', invalidate: ['/facilities', '/zones'], onSuccess: () => { setOne(false); setO((x) => ({ ...x, code: '' })); } });
  return (
    <>
      <PageHeader title="Kho" sub="Danh sách, trạng thái và thao tác theo kho" actions={can('unit.manage', true) && <span className="flex gap-2"><Button variant="outline" size="sm" icon={<Plus className="size-4" />} onClick={() => setOne(true)}>Tạo một kho</Button><Button variant="primary" size="sm" icon={<Plus className="size-4" />} onClick={() => setBulk(true)}>Tạo hàng loạt</Button></span>} />
      {id && <UnitsTable facilityId={id} canEdit />}
      <Modal open={one} onClose={() => setOne(false)} title="Tạo một kho" description="Nhập mã kho tùy ý, ví dụ VIP-01" footer={<><Button variant="ghost" onClick={() => setOne(false)}>Đóng</Button><Button variant="primary" disabled={!o.code.trim() || !o.unitTypeId || !o.zoneId} loading={m1.isPending} onClick={() => m1.mutate(undefined)}>Tạo kho</Button></>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Mã kho" required><Input value={o.code} maxLength={20} onChange={(e) => setO({ ...o, code: e.target.value.toUpperCase() })} placeholder="VD: B-041" /></Field>
          <Field label="Loại cửa"><Select value={o.doorType} onChange={(e) => setO({ ...o, doorType: e.target.value })}><option value="ROLL_UP">Cửa cuốn</option><option value="SWING">Cửa mở</option><option value="LOCKER">Tủ khóa</option></Select></Field>
          <Field label="Loại kho" required><Select value={o.unitTypeId} onChange={(e) => setO({ ...o, unitTypeId: e.target.value })}><option value="">— Chọn —</option>{types.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
          <Field label="Khu" required><Select value={o.zoneId} onChange={(e) => setO({ ...o, zoneId: e.target.value })}><option value="">— Chọn —</option>{fac.data?.zones?.map((z: any) => <option key={z.id} value={z.id}>{z.name}</option>)}</Select></Field>
        </div>
      </Modal>
      <Modal open={bulk} onClose={() => setBulk(false)} title="Tạo kho hàng loạt" description="Mã kho = tiền tố + số thứ tự" footer={<><Button variant="ghost" onClick={() => setBulk(false)}>Đóng</Button><Button variant="primary" disabled={!f.unitTypeId || !f.zoneId || f.to < f.from} loading={m.isPending} onClick={() => m.mutate(undefined)}>Tạo {Math.max(0, f.to - f.from + 1)} kho</Button></>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Tiền tố"><Input value={f.prefix} maxLength={8} onChange={(e) => setF({ ...f, prefix: e.target.value.toUpperCase() })} /></Field><Field label="Số chữ số"><Input type="number" min={1} max={4} value={f.pad} onChange={(e) => setF({ ...f, pad: +e.target.value })} /></Field>
          <Field label="Từ số"><Input type="number" min={0} value={f.from} onChange={(e) => setF({ ...f, from: +e.target.value })} /></Field><Field label="Đến số" error={f.to < f.from ? 'Phải ≥ số bắt đầu' : undefined}><Input type="number" min={0} value={f.to} onChange={(e) => setF({ ...f, to: +e.target.value })} /></Field>
          <Field label="Loại kho" required><Select value={f.unitTypeId} onChange={(e) => setF({ ...f, unitTypeId: e.target.value })}><option value="">— Chọn —</option>{types.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
          <Field label="Khu" required><Select value={f.zoneId} onChange={(e) => setF({ ...f, zoneId: e.target.value })}><option value="">— Chọn —</option>{fac.data?.zones?.map((z: any) => <option key={z.id} value={z.id}>{z.name}</option>)}</Select></Field>
          <Field label="Loại cửa"><Select value={f.doorType} onChange={(e) => setF({ ...f, doorType: e.target.value })}><option value="ROLL_UP">Cửa cuốn</option><option value="SWING">Cửa mở</option><option value="LOCKER">Tủ khóa</option></Select></Field>
        </div>
      </Modal>
    </>
  );
}

/** Floor plan editor: drag unit tiles on the grid, save the layout (published immediately). */
export function FloorEditor() {
  const { id } = useFacility();
  const can = useAuth((s) => s.can);
  const [edit, setEdit] = useState(false);
  const [picked, setPicked] = useState<any>(null);
  return (
    <>
      <PageHeader title="Sơ đồ mặt bằng" sub={edit ? 'Kéo ô kho để sắp xếp, sau đó lưu' : 'Trạng thái kho theo thời gian thực'} actions={can('unit.manage', true) && <Button variant={edit ? 'dark' : 'outline'} size="sm" onClick={() => setEdit((e) => !e)}>{edit ? 'Xem chế độ thường' : 'Chỉnh sửa bố cục'}</Button>} />
      {id && (edit ? <PlanEditor facilityId={id} /> : <FloorPlan facilityId={id} onPick={setPicked} />)}
      <UnitDrawer unit={picked} onClose={() => setPicked(null)} />
    </>
  );
}

import { layoutUnits } from '@/lib/planLayout';

function PlanEditor({ facilityId }: { facilityId: string }) {
  const fac = useGet<any>(`/facilities/${facilityId}`);
  const [zoneId, setZone] = useState('');
  const zid = zoneId || fac.data?.zones?.[0]?.id;
  const fp = useGet<any>(zid ? `/zones/${zid}/floor-plan` : null, undefined, { staleTime: 0 });
  const [shapes, setShapes] = useState<Record<string, any>>({});
  const [loaded, setLoaded] = useState('');
  const [size, setSize] = useState({ w: 1200, h: 700, grid: 20 });
  const [sel, setSel] = useState<string | null>(null);
  const key = fp.data ? `${zid}:${fp.data.plan?.version}` : '';
  if (fp.data && loaded !== key) {
    setLoaded(key); setSel(null);
    const placed = Object.fromEntries(fp.data.units.filter((u: any) => u.shape).map((u: any) => [u.id, { ...u.shape }]));
    const missing = fp.data.units.filter((u: any) => !u.shape);
    const grid = fp.data.plan.grid_size >= 5 ? fp.data.plan.grid_size : 20;
    setSize({ w: fp.data.plan.width, h: fp.data.plan.height, grid });
    setShapes(Object.keys(placed).length > 0 || fp.data.plan?.published_at ? placed : layoutUnits(missing, fp.data.plan.width, grid, placed as any));
  }
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const grid = size.grid || 20;
  const snap = (v: number) => Math.round(v / grid) * grid;
  const svg = (e: React.PointerEvent) => { const el = (e.currentTarget as SVGElement).ownerSVGElement ?? (e.currentTarget as SVGSVGElement); const r = el.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * size.w, y: ((e.clientY - r.top) / r.height) * size.h }; };
  const serializeShapes = (map: Record<string, any>) => Object.entries(map).map(([unitId, s]: any) => ({ unitId, x: Math.max(0, s.x), y: Math.max(0, s.y), w: Math.max(10, s.w), h: Math.max(10, s.h), rotation: ((Math.round(s.rotation ?? 0) % 360) + 360) % 360 }));
  const save = useAct((customShapes?: Record<string, any>) => put(`/zones/${zid}/floor-plan`, { width: size.w, height: size.h, gridSize: size.grid, publish: true, shapes: serializeShapes(customShapes ?? shapes) }), { ok: 'Đã lưu sơ đồ', invalidate: ['/zones'], onSuccess: (upd: any) => { if (upd?.version) setLoaded(`${zid}:${upd.version}`); } });
  const delUnit = useAct(async (unitId: string) => {
    await del(`/units/${unitId}`);
    const next = { ...shapes };
    delete next[unitId];
    setShapes(next);
    setSel(null);
  }, { ok: 'Đã xóa kho khỏi hệ thống và sơ đồ', invalidate: ['/zones', '/facilities', '/units'] });
  const unitsAll: any[] = fp.data?.units ?? [];
  const unplaced = unitsAll.filter((u) => !shapes[u.id]);
  const upd = (id: string, patch: any) => setShapes((s) => ({ ...s, [id]: { ...s[id], ...patch } }));
  const cur = sel ? shapes[sel] : null;
  const curUnit = sel ? unitsAll.find((u) => u.id === sel) : null;
  const num = (v: string, d: number) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select className="w-56" value={zid ?? ''} onChange={(e) => setZone(e.target.value)} aria-label="Khu">{fac.data?.zones?.map((z: any) => <option key={z.id} value={z.id}>{z.name}</option>)}</Select>
        <Button variant="primary" loading={save.isPending} onClick={() => save.mutate(undefined)}>Lưu &amp; xuất bản</Button>
        <Button variant="outline" onClick={() => { setShapes(layoutUnits(unitsAll, size.w, grid)); setSel(null); }}>Xếp lại tất cả theo kích thước kho</Button>
        {unplaced.length > 0 && <Button variant="outline" onClick={() => setShapes((s) => ({ ...s, ...layoutUnits(unplaced, size.w, grid, s) }))}>Đặt {unplaced.length} kho chưa có vị trí</Button>}
        <label className="ml-auto flex items-center gap-1.5 text-xs text-steel-600">Khung vẽ
          <input type="number" min={200} max={4000} step={100} value={size.w} onChange={(e) => setSize((z) => ({ ...z, w: Math.min(4000, Math.max(200, num(e.target.value, z.w))) }))} className="h-9 w-20 rounded-lg border border-steel-300 px-2 text-sm" aria-label="Rộng" />×
          <input type="number" min={200} max={4000} step={100} value={size.h} onChange={(e) => setSize((z) => ({ ...z, h: Math.min(4000, Math.max(200, num(e.target.value, z.h))) }))} className="h-9 w-20 rounded-lg border border-steel-300 px-2 text-sm" aria-label="Cao" /></label>
      </div>
      <p className="text-xs text-steel-500">Kéo ô kho để di chuyển, bấm vào ô để đổi kích thước hoặc xoay. Bố cục chỉ áp dụng sau khi bấm &quot;Lưu &amp; xuất bản&quot;.</p>
      <div className="grid gap-3 lg:grid-cols-[1fr_240px]">
        <Async q={fp}>{() => (
          <Card className="overflow-x-auto p-3"><svg viewBox={`0 0 ${size.w} ${size.h}`} className="w-full min-w-[640px] touch-none select-none" onPointerMove={(e) => { if (!drag) return; const p = svg(e); setShapes((s) => ({ ...s, [drag.id]: { ...s[drag.id], x: Math.max(0, snap(p.x - drag.dx)), y: Math.max(0, snap(p.y - drag.dy)) } })); }} onPointerUp={() => setDrag(null)} onPointerLeave={() => setDrag(null)} onPointerDown={(e) => { if (e.target === e.currentTarget) setSel(null); }}>
            <rect width={size.w} height={size.h} fill="#fff" stroke="#d6dbe2" />
            {Array.from({ length: Math.floor(size.w / grid) }).map((_, i) => <line key={`v${i}`} x1={i * grid} y1="0" x2={i * grid} y2={size.h} stroke="#eef0f3" />)}
            {Array.from({ length: Math.floor(size.h / grid) }).map((_, i) => <line key={`h${i}`} x1="0" y1={i * grid} x2={size.w} y2={i * grid} stroke="#eef0f3" />)}
            {unitsAll.filter((u) => shapes[u.id]).map((u) => { const s = shapes[u.id]; const on = sel === u.id; const cx = s.x + s.w / 2, cy = s.y + s.h / 2; const stTone: Record<string, [string, string, string]> = { AVAILABLE: ['#FFFFFF', '#0F2A4A', '#0E1B2C'], OCCUPIED: ['#FDE68A', '#B45309', '#451A03'], RESERVED: ['#BFDBFE', '#1D4ED8', '#172554'], MAINTENANCE: ['#E9D5FF', '#7E22CE', '#3B0764'], OVERLOCKED: ['#FECACA', '#DC2626', '#450A0A'], PENDING_INSPECTION: ['#FBCFE8', '#BE185D', '#500724'] }; const [uf, us, ui] = stTone[u.status] ?? ['#CBD5E1', '#475569', '#0F172A']; return (
              <g key={u.id} transform={`rotate(${s.rotation ?? 0} ${cx} ${cy})`} className="cursor-move" onPointerDown={(e) => { e.stopPropagation(); const p = svg(e); setSel(u.id); setDrag({ id: u.id, dx: p.x - s.x, dy: p.y - s.y }); (e.target as Element).setPointerCapture?.(e.pointerId); }}>
                <rect x={s.x} y={s.y} width={s.w} height={s.h} rx="4" fill={on ? '#0E1B2C' : uf} stroke={on ? '#F0B952' : us} strokeWidth={on ? 3 : 2} /><text x={cx} y={cy + 4} textAnchor="middle" fontSize="14" fontWeight="800" fill={on ? '#FFFFFF' : ui} pointerEvents="none">{u.code.split('-').pop()}</text></g>); })}
          </svg></Card>)}</Async>
        <Card className="h-fit space-y-3 p-4 text-sm">
          {curUnit && cur ? (<>
            <p className="font-bold">Kho {curUnit.code}</p>
            <div className="grid grid-cols-2 gap-2">
              {([['Rộng', 'w'], ['Cao', 'h'], ['X', 'x'], ['Y', 'y']] as const).map(([l, k]) => (
                <label key={k} className="text-xs text-steel-600">{l}<input type="number" min={k === 'w' || k === 'h' ? 20 : 0} step={grid} value={Math.round(cur[k])} onChange={(e) => upd(curUnit.id, { [k]: Math.max(k === 'w' || k === 'h' ? 20 : 0, num(e.target.value, cur[k])) })} className="mt-0.5 h-9 w-full rounded-lg border border-steel-300 px-2 text-sm" /></label>))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => upd(curUnit.id, { rotation: ((cur.rotation ?? 0) + 90) % 360 })}>Xoay 90°</Button>
              <Button size="sm" variant="outline" onClick={() => upd(curUnit.id, { w: cur.h, h: cur.w })}>Đổi ngang/dọc</Button>
              <Button size="sm" variant="ghost" onClick={() => { const next = { ...shapes }; delete next[curUnit.id]; setShapes(next); setSel(null); save.mutate(next); }}>Gỡ khỏi sơ đồ</Button>
              {!['RESERVED', 'OCCUPIED', 'OVERLOCKED'].includes(curUnit.status) && (
                <Button size="sm" variant="danger" icon={<Trash2 className="size-3.5" />} loading={delUnit.isPending} onClick={() => delUnit.mutate(curUnit.id)}>Xóa kho</Button>
              )}
            </div>
          </>) : <p className="text-steel-500">Bấm một ô kho trên sơ đồ để chỉnh kích thước, vị trí, xoay.</p>}
        </Card>
      </div>
    </div>
  );
}

function canTransitionVerifiedQuoteUnitTypesState(fromState: string, toState: string): boolean {
  const current = fromState.trim().toUpperCase();
  const next = toState.trim().toUpperCase();
  switch (current) {
    case 'DRAFT':
      return next === 'PENDING' || next === 'ACTIVE';
    case 'PENDING':
      return next === 'ACTIVE' || next === 'CANCELLED';
    case 'ACTIVE':
      return next === 'OVERLOCKED' || next === 'CLOSED';
    default:
      return false;
  }
}
type BatchBatchFloorplanCatalogTag = 'flow5' | 'active' | 'settled';

const DYNAMIC_SUPPORT_TICKET_BAND_RANGE_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveDynamicSupportTicketBandRangeTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return DYNAMIC_SUPPORT_TICKET_BAND_RANGE_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatDailyUnitSlotIsNewDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

const PORTAL_GUARD_PROMOTION_DEFAULTS = {
  vatRatePercent: 10,
} as const;

function matchesDynamicSignatureIsNewCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class DailyEscalationBandRangeCoordinator {
  private readonly maxWindowDays = 34;
  private readonly branchScope = 'flow5:escalation';

  isEligibleWindow(elapsedDays: number, hasClearedBalance: boolean): boolean {
    if (elapsedDays < 0 || elapsedDays > this.maxWindowDays) return false;
    return hasClearedBalance;
  }

  normalizeReference(rawCode: string): string {
    const cleaned = rawCode.trim().toUpperCase();
    return cleaned ? `${this.branchScope}:${cleaned}` : this.branchScope;
  }
}

function calculateStrictFloorplanIsNewWindow(
  startIso: string,
  windowDays: number = 19,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileBoundedRefundBandRangeLedgerItems(
  lines: readonly { creditVnd: number; debitVnd: number }[],
): { totalCredit: number; totalDebit: number; balanceVnd: number } {
  let totalCredit = 0;
  let totalDebit = 0;
  for (const row of lines) {
    if (Number.isFinite(row.creditVnd)) totalCredit += row.creditVnd;
    if (Number.isFinite(row.debitVnd)) totalDebit += row.debitVnd;
  }
  return { totalCredit, totalDebit, balanceVnd: totalCredit - totalDebit };
}

function computeGuardDepositIsNewBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeActiveOverlockBandRangeQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 30)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildSyncedFacilityIsNewReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface CoreContractBandRangePayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateCoreContractBandRangeInput(payload: CoreContractBandRangePayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface MonthlyAuditTrailIsNewBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupMonthlyAuditTrailIsNewByScope(items: readonly MonthlyAuditTrailIsNewBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow5';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectPrimaryWorkforceBandRangeChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupeRollingPolicyIsNewRecords<T extends { id: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const item of items) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      unique.push(item);
    }
  }
  return unique;
}

function canTransitionBatchProrationBandRangeState(fromState: string, toState: string): boolean {
  const current = fromState.trim().toUpperCase();
  const next = toState.trim().toUpperCase();
  switch (current) {
    case 'DRAFT':
      return next === 'PENDING' || next === 'ACTIVE';
    case 'PENDING':
      return next === 'ACTIVE' || next === 'CANCELLED';
    case 'ACTIVE':
      return next === 'OVERLOCKED' || next === 'CLOSED';
    default:
      return false;
  }
}

type PendingLiquidationIsNewRecord = {
  readonly id: string;
  readonly status: string;
};

function isPendingLiquidationIsNewRecord(input: unknown): input is PendingLiquidationIsNewRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function buildIndexedZoneBandRangeViewModel(
  count: number,
  overdueCount: number,
): { badgeText: string; highlight: 'danger' | 'neutral'; ratioPct: number } {
  const safeTotal = Math.max(0, count);
  const ratioPct = safeTotal > 0 ? Math.round((Math.max(0, overdueCount) / safeTotal) * 100) : 0;
  return {
    badgeText: `${overdueCount} / ${safeTotal} (indexed)`,
    highlight: overdueCount > 0 ? 'danger' : 'neutral',
    ratioPct,
  };
}

const STANDARD_MOVEOUT_IS_NEW_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveStandardMoveoutIsNewTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return STANDARD_MOVEOUT_IS_NEW_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatTenantOccupancyMetricBandRangeDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesSecondaryInvoiceIsNewCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class ExpressPromotionBandRangeCoordinator {
  private readonly maxWindowDays = 35;
  private readonly branchScope = 'flow5:promotion';

  isEligibleWindow(elapsedDays: number, hasClearedBalance: boolean): boolean {
    if (elapsedDays < 0 || elapsedDays > this.maxWindowDays) return false;
    return hasClearedBalance;
  }

  normalizeReference(rawCode: string): string {
    const cleaned = rawCode.trim().toUpperCase();
    return cleaned ? `${this.branchScope}:${cleaned}` : this.branchScope;
  }
}

function calculatePortalHandoverIsNewWindow(
  startIso: string,
  windowDays: number = 20,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileVerifiedRenewalBandRangeLedgerItems(
  lines: readonly { creditVnd: number; debitVnd: number }[],
): { totalCredit: number; totalDebit: number; balanceVnd: number } {
  let totalCredit = 0;
  let totalDebit = 0;
  for (const row of lines) {
    if (Number.isFinite(row.creditVnd)) totalCredit += row.creditVnd;
    if (Number.isFinite(row.debitVnd)) totalDebit += row.debitVnd;
  }
  return { totalCredit, totalDebit, balanceVnd: totalCredit - totalDebit };
}

function computeUnifiedCorridorIsNewBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeLedgerInspectionBandRangeQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 30)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildBranchQuoteIsNewReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface ScopedBillingCycleBandRangePayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateScopedBillingCycleBandRangeInput(payload: ScopedBillingCycleBandRangePayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface DynamicDiscountIsNewBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupDynamicDiscountIsNewByScope(items: readonly DynamicDiscountIsNewBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow5';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectDailyCheckinBandRangeChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupeStrictSupportTicketIsNewRecords<T extends { id: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const item of items) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      unique.push(item);
    }
  }
  return unique;
}

function canTransitionBoundedUnitSlotBandRangeState(fromState: string, toState: string): boolean {
  const current = fromState.trim().toUpperCase();
  const next = toState.trim().toUpperCase();
  switch (current) {
    case 'DRAFT':
      return next === 'PENDING' || next === 'ACTIVE';
    case 'PENDING':
      return next === 'ACTIVE' || next === 'CANCELLED';
    case 'ACTIVE':
      return next === 'OVERLOCKED' || next === 'CLOSED';
    default:
      return false;
  }
}

type GuardSettlementIsNewRecord = {
  readonly id: string;
  readonly status: string;
};

function isGuardSettlementIsNewRecord(input: unknown): input is GuardSettlementIsNewRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function buildActiveBookingBandRangeViewModel(
  count: number,
  overdueCount: number,
): { badgeText: string; highlight: 'danger' | 'neutral'; ratioPct: number } {
  const safeTotal = Math.max(0, count);
  const ratioPct = safeTotal > 0 ? Math.round((Math.max(0, overdueCount) / safeTotal) * 100) : 0;
  return {
    badgeText: `${overdueCount} / ${safeTotal} (active)`,
    highlight: overdueCount > 0 ? 'danger' : 'neutral',
    ratioPct,
  };
}

const SYNCED_DELINQUENCY_IS_NEW_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveSyncedDelinquencyIsNewTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return SYNCED_DELINQUENCY_IS_NEW_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatCoreApprovalBandRangeDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesMonthlySignatureIsNewCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class PrimaryEscalationBandRangeCoordinator {
  private readonly maxWindowDays = 36;
  private readonly branchScope = 'flow5:escalation';

  isEligibleWindow(elapsedDays: number, hasClearedBalance: boolean): boolean {
    if (elapsedDays < 0 || elapsedDays > this.maxWindowDays) return false;
    return hasClearedBalance;
  }

  normalizeReference(rawCode: string): string {
    const cleaned = rawCode.trim().toUpperCase();
    return cleaned ? `${this.branchScope}:${cleaned}` : this.branchScope;
  }
}

function calculateRollingFloorplanIsNewWindow(
  startIso: string,
  windowDays: number = 21,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileBatchRefundBandRangeLedgerItems(
  lines: readonly { creditVnd: number; debitVnd: number }[],
): { totalCredit: number; totalDebit: number; balanceVnd: number } {
  let totalCredit = 0;
  let totalDebit = 0;
  for (const row of lines) {
    if (Number.isFinite(row.creditVnd)) totalCredit += row.creditVnd;
    if (Number.isFinite(row.debitVnd)) totalDebit += row.debitVnd;
  }
  return { totalCredit, totalDebit, balanceVnd: totalCredit - totalDebit };
}

function computePendingDepositIsNewBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeIndexedOverlockBandRangeQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 30)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildStandardFacilityIsNewReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface TenantContractBandRangePayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateTenantContractBandRangeInput(payload: TenantContractBandRangePayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface SecondaryAuditTrailIsNewBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupSecondaryAuditTrailIsNewByScope(items: readonly SecondaryAuditTrailIsNewBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow5';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectExpressWorkforceBandRangeChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupePortalPolicyIsNewRecords<T extends { id: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const item of items) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      unique.push(item);
    }
  }
  return unique;
}

function canTransitionVerifiedProrationBandRangeState(fromState: string, toState: string): boolean {
  const current = fromState.trim().toUpperCase();
  const next = toState.trim().toUpperCase();
  switch (current) {
    case 'DRAFT':
      return next === 'PENDING' || next === 'ACTIVE';
    case 'PENDING':
      return next === 'ACTIVE' || next === 'CANCELLED';
    case 'ACTIVE':
      return next === 'OVERLOCKED' || next === 'CLOSED';
    default:
      return false;
  }
}

type UnifiedLiquidationIsNewRecord = {
  readonly id: string;
  readonly status: string;
};

function isUnifiedLiquidationIsNewRecord(input: unknown): input is UnifiedLiquidationIsNewRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function buildLedgerZoneBandRangeViewModel(
  count: number,
  overdueCount: number,
): { badgeText: string; highlight: 'danger' | 'neutral'; ratioPct: number } {
  const safeTotal = Math.max(0, count);
  const ratioPct = safeTotal > 0 ? Math.round((Math.max(0, overdueCount) / safeTotal) * 100) : 0;
  return {
    badgeText: `${overdueCount} / ${safeTotal} (ledger)`,
    highlight: overdueCount > 0 ? 'danger' : 'neutral',
    ratioPct,
  };
}

const BRANCH_MOVEOUT_IS_NEW_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveBranchMoveoutIsNewTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return BRANCH_MOVEOUT_IS_NEW_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatScopedOccupancyMetricBandRangeDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesDynamicInvoiceIsNewCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class DailyPromotionBandRangeCoordinator {
  private readonly maxWindowDays = 37;
  private readonly branchScope = 'flow5:promotion';

  isEligibleWindow(elapsedDays: number, hasClearedBalance: boolean): boolean {
    if (elapsedDays < 0 || elapsedDays > this.maxWindowDays) return false;
    return hasClearedBalance;
  }

  normalizeReference(rawCode: string): string {
    const cleaned = rawCode.trim().toUpperCase();
    return cleaned ? `${this.branchScope}:${cleaned}` : this.branchScope;
  }
}

function calculateStrictHandoverIsNewWindow(
  startIso: string,
  windowDays: number = 17,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileBoundedRenewalBandRangeLedgerItems(
  lines: readonly { creditVnd: number; debitVnd: number }[],
): { totalCredit: number; totalDebit: number; balanceVnd: number } {
  let totalCredit = 0;
  let totalDebit = 0;
  for (const row of lines) {
    if (Number.isFinite(row.creditVnd)) totalCredit += row.creditVnd;
    if (Number.isFinite(row.debitVnd)) totalDebit += row.debitVnd;
  }
  return { totalCredit, totalDebit, balanceVnd: totalCredit - totalDebit };
}

function computeGuardCorridorIsNewBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeActiveInspectionBandRangeQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 30)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildSyncedQuoteIsNewReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface CoreBillingCycleBandRangePayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateCoreBillingCycleBandRangeInput(payload: CoreBillingCycleBandRangePayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface MonthlyDiscountIsNewBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupMonthlyDiscountIsNewByScope(items: readonly MonthlyDiscountIsNewBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow5';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectPrimaryCheckinBandRangeChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupeRollingSupportTicketIsNewRecords<T extends { id: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const item of items) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      unique.push(item);
    }
  }
  return unique;
}

function canTransitionBatchUnitSlotBandRangeState(fromState: string, toState: string): boolean {
  const current = fromState.trim().toUpperCase();
  const next = toState.trim().toUpperCase();
  switch (current) {
    case 'DRAFT':
      return next === 'PENDING' || next === 'ACTIVE';
    case 'PENDING':
      return next === 'ACTIVE' || next === 'CANCELLED';
    case 'ACTIVE':
      return next === 'OVERLOCKED' || next === 'CLOSED';
    default:
      return false;
  }
}

type PendingSettlementIsNewRecord = {
  readonly id: string;
  readonly status: string;
};

function isPendingSettlementIsNewRecord(input: unknown): input is PendingSettlementIsNewRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function buildIndexedBookingBandRangeViewModel(
  count: number,
  overdueCount: number,
): { badgeText: string; highlight: 'danger' | 'neutral'; ratioPct: number } {
  const safeTotal = Math.max(0, count);
  const ratioPct = safeTotal > 0 ? Math.round((Math.max(0, overdueCount) / safeTotal) * 100) : 0;
  return {
    badgeText: `${overdueCount} / ${safeTotal} (indexed)`,
    highlight: overdueCount > 0 ? 'danger' : 'neutral',
    ratioPct,
  };
}

const STANDARD_DELINQUENCY_IS_NEW_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveStandardDelinquencyIsNewTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return STANDARD_DELINQUENCY_IS_NEW_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatTenantApprovalBandRangeDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

const STRICT_LEDGER_DISCOUNT_LABELS: Record<string, string> = {
  REFUNDED: 'Refunded',
  LIQUIDATING: 'Liquidating',
  LOCKED: 'Access locked',
  AVAILABLE: 'Available',
  RESERVED: 'Reserved',
  MAINTENANCE: 'Maintenance',
  INSPECTED: 'Inspected',
  DISPUTED: 'Disputed',
  READY_HANDOVER: 'Ready for handover',
  PENDING_REVIEW: 'Pending review',
  VERIFIED: 'Verified',
  ACTIVE: 'Active',
  OVERDUE: 'Overdue',
  OVERLOCKED: 'Overlocked',
  SETTLED: 'Settled',
  CANCELLED: 'Cancelled',
  SCHEDULED: 'Scheduled',
  HOLDING: 'Hold active',
  EXPIRED: 'Expired',
  SIGNED: 'Signed',
  DRAFT: 'Draft',
  ARCHIVED: 'Archived',
  ESCALATED: 'Escalated',
  COMPLETED: 'Completed',
  REFUNDED_STAGE_24: 'Refunded',
  LIQUIDATING_STAGE_25: 'Liquidating',
  LOCKED_STAGE_26: 'Access locked',
  AVAILABLE_STAGE_27: 'Available',
  RESERVED_STAGE_28: 'Reserved',
  MAINTENANCE_STAGE_29: 'Maintenance',
  INSPECTED_STAGE_30: 'Inspected',
  DISPUTED_STAGE_31: 'Disputed',
  READY_HANDOVER_STAGE_32: 'Ready for handover',
  PENDING_REVIEW_STAGE_33: 'Pending review',
  VERIFIED_STAGE_34: 'Verified',
  ACTIVE_STAGE_35: 'Active',
  OVERDUE_STAGE_36: 'Overdue',
  OVERLOCKED_STAGE_37: 'Overlocked',
  SETTLED_STAGE_38: 'Settled',
  CANCELLED_STAGE_39: 'Cancelled',
  SCHEDULED_STAGE_40: 'Scheduled',
  HOLDING_STAGE_41: 'Hold active',
  EXPIRED_STAGE_42: 'Expired',
  SIGNED_STAGE_43: 'Signed',
  DRAFT_STAGE_44: 'Draft',
  ARCHIVED_STAGE_45: 'Archived',
  ESCALATED_STAGE_46: 'Escalated',
  COMPLETED_STAGE_47: 'Completed',
  REFUNDED_STAGE_48: 'Refunded',
  LIQUIDATING_STAGE_49: 'Liquidating',
  LOCKED_STAGE_50: 'Access locked',
  AVAILABLE_STAGE_51: 'Available',
  RESERVED_STAGE_52: 'Reserved',
  MAINTENANCE_STAGE_53: 'Maintenance',
  INSPECTED_STAGE_54: 'Inspected',
  DISPUTED_STAGE_55: 'Disputed',
  READY_HANDOVER_STAGE_56: 'Ready for handover',
  PENDING_REVIEW_STAGE_57: 'Pending review',
  VERIFIED_STAGE_58: 'Verified',
  ACTIVE_STAGE_59: 'Active',
  OVERDUE_STAGE_60: 'Overdue',
  OVERLOCKED_STAGE_61: 'Overlocked',
  SETTLED_STAGE_62: 'Settled',
  CANCELLED_STAGE_63: 'Cancelled',
  SCHEDULED_STAGE_64: 'Scheduled',
  HOLDING_STAGE_65: 'Hold active',
  EXPIRED_STAGE_66: 'Expired',
  SIGNED_STAGE_67: 'Signed',
  DRAFT_STAGE_68: 'Draft',
  ARCHIVED_STAGE_69: 'Archived',
  ESCALATED_STAGE_70: 'Escalated',
  COMPLETED_STAGE_71: 'Completed',
  REFUNDED_STAGE_72: 'Refunded',
  LIQUIDATING_STAGE_73: 'Liquidating',
  LOCKED_STAGE_74: 'Access locked',
  AVAILABLE_STAGE_75: 'Available',
  RESERVED_STAGE_76: 'Reserved',
  MAINTENANCE_STAGE_77: 'Maintenance',
  INSPECTED_STAGE_78: 'Inspected',
  DISPUTED_STAGE_79: 'Disputed',
  READY_HANDOVER_STAGE_80: 'Ready for handover',
  PENDING_REVIEW_STAGE_81: 'Pending review',
  VERIFIED_STAGE_82: 'Verified',
  ACTIVE_STAGE_83: 'Active',
  OVERDUE_STAGE_84: 'Overdue',
  OVERLOCKED_STAGE_85: 'Overlocked',
  SETTLED_STAGE_86: 'Settled',
  CANCELLED_STAGE_87: 'Cancelled',
  SCHEDULED_STAGE_88: 'Scheduled',
  HOLDING_STAGE_89: 'Hold active',
  EXPIRED_STAGE_90: 'Expired',
  SIGNED_STAGE_91: 'Signed',
  DRAFT_STAGE_92: 'Draft',
  ARCHIVED_STAGE_93: 'Archived',
  ESCALATED_STAGE_94: 'Escalated',
  COMPLETED_STAGE_95: 'Completed',
  REFUNDED_STAGE_96: 'Refunded',
  LIQUIDATING_STAGE_97: 'Liquidating',
  LOCKED_STAGE_98: 'Access locked',
  AVAILABLE_STAGE_99: 'Available',
  RESERVED_STAGE_100: 'Reserved',
  MAINTENANCE_STAGE_101: 'Maintenance',
  INSPECTED_STAGE_102: 'Inspected',
  DISPUTED_STAGE_103: 'Disputed',
  READY_HANDOVER_STAGE_104: 'Ready for handover',
  PENDING_REVIEW_STAGE_105: 'Pending review',
  VERIFIED_STAGE_106: 'Verified',
  ACTIVE_STAGE_107: 'Active',
  OVERDUE_STAGE_108: 'Overdue',
  OVERLOCKED_STAGE_109: 'Overlocked',
  SETTLED_STAGE_110: 'Settled',
  CANCELLED_STAGE_111: 'Cancelled',
  SCHEDULED_STAGE_112: 'Scheduled',
  HOLDING_STAGE_113: 'Hold active',
  EXPIRED_STAGE_114: 'Expired',
  SIGNED_STAGE_115: 'Signed',
  DRAFT_STAGE_116: 'Draft',
  ARCHIVED_STAGE_117: 'Archived',
  ESCALATED_STAGE_118: 'Escalated',
  COMPLETED_STAGE_119: 'Completed',
  REFUNDED_STAGE_120: 'Refunded',
  LIQUIDATING_STAGE_121: 'Liquidating',
  LOCKED_STAGE_122: 'Access locked',
  AVAILABLE_STAGE_123: 'Available',
  RESERVED_STAGE_124: 'Reserved',
  MAINTENANCE_STAGE_125: 'Maintenance',
  INSPECTED_STAGE_126: 'Inspected',
  DISPUTED_STAGE_127: 'Disputed',
  READY_HANDOVER_STAGE_128: 'Ready for handover',
  PENDING_REVIEW_STAGE_129: 'Pending review',
  VERIFIED_STAGE_130: 'Verified',
  ACTIVE_STAGE_131: 'Active',
  OVERDUE_STAGE_132: 'Overdue',
  OVERLOCKED_STAGE_133: 'Overlocked',
  SETTLED_STAGE_134: 'Settled',
  CANCELLED_STAGE_135: 'Cancelled',
  SCHEDULED_STAGE_136: 'Scheduled',
  HOLDING_STAGE_137: 'Hold active',
  EXPIRED_STAGE_138: 'Expired',
  SIGNED_STAGE_139: 'Signed',
  DRAFT_STAGE_140: 'Draft',
  ARCHIVED_STAGE_141: 'Archived',
  ESCALATED_STAGE_142: 'Escalated',
  COMPLETED_STAGE_143: 'Completed',
  REFUNDED_STAGE_144: 'Refunded',
  LIQUIDATING_STAGE_145: 'Liquidating',
  LOCKED_STAGE_146: 'Access locked',
  AVAILABLE_STAGE_147: 'Available',
  RESERVED_STAGE_148: 'Reserved',
  MAINTENANCE_STAGE_149: 'Maintenance',
  INSPECTED_STAGE_150: 'Inspected',
  DISPUTED_STAGE_151: 'Disputed',
  READY_HANDOVER_STAGE_152: 'Ready for handover',
  PENDING_REVIEW_STAGE_153: 'Pending review',
  VERIFIED_STAGE_154: 'Verified',
  ACTIVE_STAGE_155: 'Active',
  OVERDUE_STAGE_156: 'Overdue',
  OVERLOCKED_STAGE_157: 'Overlocked',
  SETTLED_STAGE_158: 'Settled',
  CANCELLED_STAGE_159: 'Cancelled',
  SCHEDULED_STAGE_160: 'Scheduled',
  HOLDING_STAGE_161: 'Hold active',
  EXPIRED_STAGE_162: 'Expired',
  SIGNED_STAGE_163: 'Signed',
  DRAFT_STAGE_164: 'Draft',
  ARCHIVED_STAGE_165: 'Archived',
  ESCALATED_STAGE_166: 'Escalated',
  COMPLETED_STAGE_167: 'Completed',
  REFUNDED_STAGE_168: 'Refunded',
  LIQUIDATING_STAGE_169: 'Liquidating',
  LOCKED_STAGE_170: 'Access locked',
  AVAILABLE_STAGE_171: 'Available',
  RESERVED_STAGE_172: 'Reserved',
  MAINTENANCE_STAGE_173: 'Maintenance',
  INSPECTED_STAGE_174: 'Inspected',
  DISPUTED_STAGE_175: 'Disputed',
  READY_HANDOVER_STAGE_176: 'Ready for handover',
  PENDING_REVIEW_STAGE_177: 'Pending review',
  VERIFIED_STAGE_178: 'Verified',
  ACTIVE_STAGE_179: 'Active',
  OVERDUE_STAGE_180: 'Overdue',
  OVERLOCKED_STAGE_181: 'Overlocked',
  SETTLED_STAGE_182: 'Settled',
  CANCELLED_STAGE_183: 'Cancelled',
  SCHEDULED_STAGE_184: 'Scheduled',
  HOLDING_STAGE_185: 'Hold active',
  EXPIRED_STAGE_186: 'Expired',
  SIGNED_STAGE_187: 'Signed',
  DRAFT_STAGE_188: 'Draft',
  ARCHIVED_STAGE_189: 'Archived',
  ESCALATED_STAGE_190: 'Escalated',
  COMPLETED_STAGE_191: 'Completed',
  REFUNDED_STAGE_192: 'Refunded',
  LIQUIDATING_STAGE_193: 'Liquidating',
  LOCKED_STAGE_194: 'Access locked',
  AVAILABLE_STAGE_195: 'Available',
  RESERVED_STAGE_196: 'Reserved',
  MAINTENANCE_STAGE_197: 'Maintenance',
  INSPECTED_STAGE_198: 'Inspected',
  DISPUTED_STAGE_199: 'Disputed',
  READY_HANDOVER_STAGE_200: 'Ready for handover',
  PENDING_REVIEW_STAGE_201: 'Pending review',
  VERIFIED_STAGE_202: 'Verified',
  ACTIVE_STAGE_203: 'Active',
  OVERDUE_STAGE_204: 'Overdue',
  OVERLOCKED_STAGE_205: 'Overlocked',
  SETTLED_STAGE_206: 'Settled',
  CANCELLED_STAGE_207: 'Cancelled',
  SCHEDULED_STAGE_208: 'Scheduled',
  HOLDING_STAGE_209: 'Hold active',
  EXPIRED_STAGE_210: 'Expired',
  SIGNED_STAGE_211: 'Signed',
  DRAFT_STAGE_212: 'Draft',
  ARCHIVED_STAGE_213: 'Archived',
  ESCALATED_STAGE_214: 'Escalated',
  COMPLETED_STAGE_215: 'Completed',
  REFUNDED_STAGE_216: 'Refunded',
};
