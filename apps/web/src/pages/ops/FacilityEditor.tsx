import { useEffect, useState } from 'react';
import { get, patch, post, put } from '@/lib/api';
import { normalizeProvinceInfo } from '@/lib/format';
import { useAct } from '@/lib/hooks';
import { Button, Drawer, Field, Input, Textarea, Skeleton } from '@/ui';
import { toast } from '@/ui/toast';
import { LocationPicker, type PickedPlace } from '@/widgets/LocationPicker';
import { PhotoUpload, type Photo } from '@/widgets/PhotoUpload';
import { WeekHours, hoursError, type Hours } from '@/widgets/WeekHours';

export const slugify = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const DEFAULT_OFFICE: Hours = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map((d) => [d, ['08:00', '18:00']])) as Hours;
const DEFAULT_ACCESS: Hours = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, ['06:00', '22:00']])) as Hours;

type Form = { code: string; name: string; addressLine: string; ward: string; district: string; province: string; latitude: number | null; longitude: number | null; phone: string; hotline: string; email: string; description: string; amenities: string; officeHours: Hours; accessHours: Hours; photos: Photo[] };

const blank = (): Form => ({ code: '', name: '', addressLine: '', ward: '', district: '', province: '', latitude: null, longitude: null, phone: '', hotline: '', email: '', description: '', amenities: '', officeHours: DEFAULT_OFFICE, accessHours: DEFAULT_ACCESS, photos: [] });

const fromFacility = (f: any): Form => ({
  code: f.code, name: f.name, addressLine: f.address_line ?? '', ward: f.ward ?? '', district: f.district ?? '', province: f.province ?? '',
  latitude: f.latitude == null ? null : Number(f.latitude), longitude: f.longitude == null ? null : Number(f.longitude),
  phone: f.phone ?? '', hotline: f.hotline ?? '', email: f.email ?? '', description: f.description ?? '', amenities: Array.isArray(f.amenities) ? f.amenities.join(', ') : '',
  officeHours: (f.office_hours && typeof f.office_hours === 'object' ? f.office_hours : {}) as Hours, accessHours: (f.access_hours && typeof f.access_hours === 'object' ? f.access_hours : {}) as Hours,
  photos: (f.photos ?? []).map((p: any) => ({ id: p.id ?? p.public_id, name: p.original_name ?? 'Ảnh cơ sở', url: p.url })),
});

/**
 * Create a facility, or edit the location and photos of an existing one. Position comes from the map (pin or address
 * search) and fills the address fields; photos are uploaded straight to object storage (Cloudflare R2) and only their ids are saved.
 */
export function FacilityEditor({ open, onClose, facilityId }: { open: boolean; onClose: () => void; facilityId?: string }) {
  const editing = !!facilityId;
  const [v, setV] = useState<Form>(blank);
  const [loading, setLoading] = useState(false);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const set = <K extends keyof Form>(k: K, x: Form[K]) => setV((s) => ({ ...s, [k]: x }));

  useEffect(() => {
    if (!open) return;
    setErrs({});
    if (!facilityId) { setV(blank()); return; }
    setLoading(true);
    get(`/facilities/${facilityId}`).then((f) => setV(fromFacility(f))).catch((e) => toast.err(e.message)).finally(() => setLoading(false));
  }, [open, facilityId]);

  const applyPlace = (p: PickedPlace) => setV((s) => ({
    ...s, latitude: p.latitude, longitude: p.longitude,
    addressLine: p.addressLine || s.addressLine, ward: p.ward || s.ward, district: p.district || s.district, province: p.province || s.province,
  }));

  const save = useAct(async () => {
    const e: Record<string, string> = {};
    if (!editing && v.code.trim().length < 2) e.code = 'Mã tối thiểu 2 ký tự';
    if (v.name.trim().length < 3) e.name = 'Tên tối thiểu 3 ký tự';
    if (v.addressLine.trim().length < 3) e.addressLine = 'Nhập địa chỉ hoặc chọn trên bản đồ';
    if (v.district.trim().length < 2) e.district = 'Bắt buộc nhập';
    if (v.province.trim().length < 2) e.province = 'Bắt buộc nhập';
    if (v.latitude == null || v.longitude == null) e.map = 'Chọn vị trí chính xác trên bản đồ';
    if (v.email && !/.+@.+\..+/.test(v.email)) e.email = 'Email không hợp lệ';
    if (hoursError(v.officeHours) || hoursError(v.accessHours)) e.hours = 'Giờ đóng cửa phải sau giờ mở cửa';
    setErrs(e);
    if (Object.keys(e).length) { toast.err('Còn thông tin chưa hợp lệ, xem các ô báo đỏ'); throw new Error('invalid'); }
    const normProv = normalizeProvinceInfo(v.province);
    const body = {
      name: v.name.trim(), addressLine: v.addressLine.trim(), ward: v.ward.trim() || null, district: v.district.trim(), province: normProv.name, provinceSlug: normProv.slug,
      latitude: v.latitude, longitude: v.longitude, phone: v.phone.trim() || null, hotline: v.hotline.trim() || null, email: v.email.trim() || null,
      description: v.description.trim() || null, amenities: v.amenities.split(',').map((x) => x.trim()).filter(Boolean), officeHours: v.officeHours, accessHours: v.accessHours,
    };
    const ids = v.photos.map((p) => p.id);
    if (editing) { await patch(`/facilities/${facilityId}`, body); await put(`/facilities/${facilityId}/photos`, { mediaIds: ids }); return; }
    await post('/facilities', { ...body, code: v.code.trim().toUpperCase(), slug: slugify(v.name), photoIds: ids });
  }, { ok: editing ? 'Đã lưu cơ sở' : 'Đã tạo cơ sở', invalidate: ['/facilities', '/dashboard', '/catalog'], onSuccess: onClose });

  const err = (k: string) => errs[k];
  return (
    <Drawer open={open} onClose={onClose} width={720} title={editing ? 'Sửa vị trí và ảnh cơ sở' : 'Tạo cơ sở mới'}
      footer={<div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Hủy</Button><Button variant="primary" loading={save.isPending} onClick={() => save.mutate(undefined)}>{editing ? 'Lưu thay đổi' : 'Tạo cơ sở'}</Button></div>}>
      {loading ? <div className="space-y-3"><Skeleton className="h-10" /><Skeleton className="h-72" /></div> : (
        <div className="space-y-6">
          <section className="grid gap-3 sm:grid-cols-3">
            <Field label="Mã cơ sở" error={err('code')} hint={editing ? 'Không đổi được' : 'Ví dụ HN02'}><Input value={v.code} disabled={editing} maxLength={16} onChange={(e) => set('code', e.target.value.toUpperCase())} /></Field>
            <div className="sm:col-span-2"><Field label="Tên cơ sở" error={err('name')}><Input value={v.name} maxLength={150} onChange={(e) => set('name', e.target.value)} /></Field></div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-bold">Vị trí trên bản đồ</h3>
            <LocationPicker lat={v.latitude} lng={v.longitude} onChange={applyPlace} />
            {err('map') && <p className="text-xs font-medium text-bad-600">{err('map')}</p>}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2"><Field label="Số nhà, tên đường" error={err('addressLine')}><Input value={v.addressLine} maxLength={255} onChange={(e) => set('addressLine', e.target.value)} /></Field></div>
              <Field label="Phường / Xã"><Input value={v.ward} maxLength={100} onChange={(e) => set('ward', e.target.value)} /></Field>
              <Field label="Quận / Huyện" error={err('district')}><Input value={v.district} maxLength={100} onChange={(e) => set('district', e.target.value)} /></Field>
              <div className="sm:col-span-2"><Field label="Tỉnh / Thành phố" error={err('province')}><Input value={v.province} maxLength={100} onChange={(e) => set('province', e.target.value)} /></Field></div>
            </div>
            <p className="text-xs text-steel-500">Địa chỉ tự điền khi bạn chọn vị trí; hãy kiểm tra lại và sửa nếu cần. Tọa độ trên bản đồ là vị trí khách sẽ thấy.</p>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-bold">Ảnh cơ sở</h3>
            <p className="text-xs text-steel-500">Tối đa 12 ảnh, mỗi ảnh dưới 10 MB. Ảnh đầu tiên là ảnh đại diện trên trang chủ và danh sách cơ sở. Ảnh được lưu trên Cloudflare R2.</p>
            <PhotoUpload camera={false} value={v.photos} onChange={(p) => set('photos', p)} purpose="FACILITY_PHOTO" relatedType="facility" facilityId={facilityId} max={12} label="Thêm ảnh" />
          </section>

          {!editing && (
            <section className="grid gap-3 sm:grid-cols-2">
              <h3 className="text-sm font-bold sm:col-span-2">Liên hệ và mô tả</h3>
              <Field label="Điện thoại"><Input value={v.phone} maxLength={20} onChange={(e) => set('phone', e.target.value)} /></Field>
              <Field label="Hotline"><Input value={v.hotline} maxLength={20} onChange={(e) => set('hotline', e.target.value)} /></Field>
              <div className="sm:col-span-2"><Field label="Email liên hệ" error={err('email')}><Input type="email" value={v.email} onChange={(e) => set('email', e.target.value)} /></Field></div>
              <div className="sm:col-span-2"><Field label="Tiện ích" hint="Cách nhau bằng dấu phẩy, ví dụ: Camera 24/7, Bãi xe tải, Thang máy"><Input value={v.amenities} onChange={(e) => set('amenities', e.target.value)} /></Field></div>
              <div className="sm:col-span-2"><Field label="Mô tả"><Textarea rows={3} value={v.description} onChange={(e) => set('description', e.target.value)} /></Field></div>
              <div className="sm:col-span-2 grid gap-3">
                <WeekHours label="Giờ làm việc văn phòng" value={v.officeHours} onChange={(h) => set('officeHours', h)} />
                <WeekHours label="Giờ ra vào kho" value={v.accessHours} onChange={(h) => set('accessHours', h)} />
                {err('hours') && <p className="text-xs font-medium text-bad-600">{err('hours')}</p>}
              </div>
            </section>
          )}
        </div>
      )}
    </Drawer>
  );
}
