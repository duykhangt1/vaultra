import { useEffect, useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { useAct, useGet } from '@/lib/hooks';
import { post, patch, del } from '@/lib/api';
import { Alert, Badge, Button, Card, Checkbox, DataTable, EmptyState, Field, Input, Modal, PageHeader, Select, Tabs, Textarea } from '@/ui';
import { fmtDate, SIZE_LABEL, vnd } from '@/lib/format';
import { ActBtn, Money } from '../kit';
import { Approvals } from '../manage/Money';

const SIZES = Object.entries(SIZE_LABEL).map(([value, label]) => ({ value, label }));

export function PricingPage() {
  const [tab, setTab] = useState('bands');
  const bands = useGet<any[]>('/price-bands');
  const fac = useGet<any[]>('/facilities');
  const fees = useGet<any[]>('/fee-types');
  const inv = ['/price-bands', '/fee-types'];
  const feeFields = (f?: any) => [
    { name: 'code', label: 'Mã (CHỮ_HOA_GẠCH_DƯỚI)', required: !f, def: f?.code, maxLength: 40 }, { name: 'name', label: 'Tên', required: true, def: f?.name, maxLength: 150 },
    { name: 'calcType', label: 'Cách tính', type: 'select' as const, required: true, def: f?.calc_type ?? 'FIXED', options: [{ value: 'FIXED', label: 'Cố định' }, { value: 'PERCENT_OF_RENT', label: '% tiền thuê' }, { value: 'GREATER_OF', label: 'Lớn hơn của hai' }] },
    { name: 'amount', label: 'Số tiền', type: 'money' as const, def: f ? Number(f.amount) : 0 }, { name: 'percent', label: '% tiền thuê', type: 'number' as const, def: f?.percent ?? '', min: 0, max: 100 }, { name: 'capAmount', label: 'Trần', type: 'money' as const, def: f?.cap_amount ? Number(f.cap_amount) : '' },
    { name: 'taxable', label: '', type: 'check' as const, placeholder: 'Chịu VAT', def: f?.taxable ?? true }, { name: 'refundable', label: '', type: 'check' as const, placeholder: 'Được hoàn', def: f?.refundable ?? false }, { name: 'editableAmount', label: '', type: 'check' as const, placeholder: 'Cho sửa số tiền khi áp dụng', def: f?.editable_amount ?? false }, { name: 'active', label: '', type: 'check' as const, placeholder: 'Đang dùng', def: f?.active ?? true }];
  const feeBody = (v: any, edit: boolean) => { const b: any = { name: v.name, calcType: v.calcType, amount: +v.amount || 0, percent: v.percent === '' ? null : +v.percent, capAmount: v.capAmount === '' ? null : +v.capAmount, taxable: !!v.taxable, refundable: !!v.refundable, editableAmount: !!v.editableAmount, active: !!v.active }; if (!edit) b.code = v.code; return b; };
  return (
    <>
      <PageHeader title="Giá & phí" sub="Khung giá, đề xuất đổi giá, loại phí" />
      <Tabs className="mb-4" value={tab} onChange={setTab} tabs={[{ value: 'bands', label: 'Khung giá' }, { value: 'requests', label: 'Đề xuất đổi giá' }, { value: 'fees', label: 'Loại phí' }]} />
      {tab === 'bands' && <>
        <div className="mb-3"><ActBtn label="Thêm khung giá" variant="primary" icon={<Plus className="size-4" />} title="Khung giá mới" description="Khung mới thay thế khung cũ cùng phạm vi kể từ thời điểm hiệu lực."
          fields={[{ name: 'sizeCategory', label: 'Kích thước', type: 'select', required: true, options: SIZES }, { name: 'facilityId', label: 'Cơ sở (trống = toàn hệ thống)', type: 'select', options: (fac.data ?? []).map((f) => ({ value: f.id, label: f.name })) }, { name: 'min', label: 'Giá tối thiểu / tháng', type: 'money', required: true }, { name: 'max', label: 'Giá tối đa / tháng', type: 'money', required: true }]}
          run={(v) => post('/price-bands', { sizeCategory: v.sizeCategory, facilityId: v.facilityId || null, min: +v.min, max: +v.max })} ok="Đã thêm khung giá" invalidate={inv} /></div>
        <Card><DataTable rows={bands.data} loading={bands.isLoading} error={bands.error} onRetry={bands.refetch} rowKey={(b: any) => b.bandId} empty={<EmptyState title="Chưa có khung giá" />}
          cols={[{ key: 's', header: 'Kích thước', cell: (b: any) => <b>{SIZE_LABEL[b.size_category] ?? b.size_category}</b> }, { key: 'f', header: 'Phạm vi', cell: (b: any) => b.facility?.name ?? <Badge tone="info">Toàn hệ thống</Badge> }, { key: 'r', header: 'Khung giá / tháng', cell: (b: any) => <><Money v={b.min_monthly_price} /> – <Money v={b.max_monthly_price} /></> }, { key: 'e', header: 'Hiệu lực từ', hideBelow: 'sm', cell: (b: any) => fmtDate(b.effective_from) }, { key: 'x', header: '', cell: (b: any) => <ActBtn label="Xóa" size="xs" danger title="Xóa khung giá" run={() => del(`/price-bands/${b.bandId}`)} ok="Đã xóa" invalidate={inv} /> }]} /></Card></>}
      {tab === 'requests' && <Approvals ops />}
      {tab === 'fees' && <>
        <div className="mb-3"><ActBtn label="Thêm loại phí" variant="primary" icon={<Plus className="size-4" />} title="Loại phí mới" fields={feeFields()} run={(v) => post('/fee-types', feeBody(v, false))} ok="Đã thêm" invalidate={inv} /></div>
        <Card><DataTable rows={fees.data} loading={fees.isLoading} error={fees.error} rowKey={(f: any) => f.id}
          cols={[{ key: 'n', header: 'Loại phí', cell: (f: any) => <><b>{f.name}</b><span className="block text-xs text-steel-500 code">{f.code}</span></> }, { key: 'c', header: 'Cách tính', hideBelow: 'sm', cell: (f: any) => f.calc_type === 'FIXED' ? vnd(f.amount) : f.calc_type === 'PERCENT_OF_RENT' ? `${f.percent}% tiền thuê` : `Max(${vnd(f.amount)}, ${f.percent}%)` }, { key: 't', header: 'VAT', hideBelow: 'md', cell: (f: any) => (f.taxable ? 'Có' : 'Không') }, { key: 's', header: '', cell: (f: any) => <Badge tone={f.active ? 'ok' : 'neutral'}>{f.active ? 'Đang dùng' : 'Tắt'}</Badge> }, { key: 'x', header: '', cell: (f: any) => <ActBtn label="Sửa" size="xs" title={`Sửa ${f.name}`} fields={[...feeFields(f).filter((x) => x.name !== 'code'), { name: 'reason', label: 'Lý do', required: true, maxLength: 255 }]} run={(v) => patch(`/fee-types/${f.id}`, { ...feeBody(v, true), reason: v.reason })} ok="Đã lưu" invalidate={inv} /> }]} /></Card></>}
    </>
  );
}

const PT: Record<string, string> = { PERCENT: '% giảm', FIXED_AMOUNT: 'Giảm tiền', FREE_MONTHS: 'Tặng tháng', FIRST_MONTH_PRICE: 'Giá tháng đầu' };
const PS: Record<string, [any, string]> = { DRAFT: ['neutral', 'Nháp'], ACTIVE: ['ok', 'Đang chạy'], PAUSED: ['warn', 'Tạm dừng'], ENDED: ['neutral', 'Kết thúc'] };

function toLocalDtInput(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function PromoModal({
  open,
  promo,
  facilities,
  manage,
  onClose,
}: {
  open: boolean;
  promo: any | null;
  facilities: any[];
  manage?: boolean;
  onClose: () => void;
}) {
  const isEdit = !!promo;
  const lockedReward = isEdit && Number(promo?.redeemed_count ?? promo?.stats?.redemptions ?? 0) > 0;

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [facilityId, setFacilityId] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('PERCENT');
  const [value, setValue] = useState<string>('');
  const [appliesToPeriods, setAppliesToPeriods] = useState<string>('1');
  const [minTermMonths, setMinTermMonths] = useState<string>('1');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [maxRedemptions, setMaxRedemptions] = useState<string>('');
  const [maxPerCustomer, setMaxPerCustomer] = useState<string>('1');
  const [newCustomersOnly, setNewCustomersOnly] = useState(false);
  const [stackable, setStackable] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(promo?.name ?? '');
    setCode(promo?.code ?? '');
    const defaultFac =
      promo?.facilityIds?.[0] ??
      promo?.facilities?.[0]?.id ??
      (manage ? facilities[0]?.id ?? '' : '');
    setFacilityId(defaultFac);
    setDescription(promo?.description ?? '');
    setType(promo?.type ?? 'PERCENT');
    setValue(promo ? String(Number(promo.value)) : '');
    setAppliesToPeriods(String(promo?.applies_to_periods ?? 1));
    setMinTermMonths(String(promo?.min_term_months ?? 1));
    setStartsAt(promo?.starts_at ? toLocalDtInput(promo.starts_at) : toLocalDtInput(new Date().toISOString()));
    setEndsAt(promo?.ends_at ? toLocalDtInput(promo.ends_at) : '');
    setMaxRedemptions(promo?.max_redemptions != null ? String(promo.max_redemptions) : '');
    setMaxPerCustomer(String(promo?.max_per_customer ?? 1));
    setNewCustomersOnly(!!promo?.new_customers_only);
    setStackable(!!promo?.stackable);
  }, [open, promo, manage, facilities]);

  const save = useAct(
    async () => {
      const payload: Record<string, any> = {
        name: name.trim(),
        code: code.trim() ? code.trim() : null,
        description: description.trim() ? description.trim() : null,
        type,
        value: Number(value),
        appliesToPeriods: Math.max(1, Number(appliesToPeriods) || 1),
        minTermMonths: Math.max(1, Number(minTermMonths) || 1),
        startsAt: new Date(startsAt).toISOString(),
        endsAt: endsAt ? new Date(endsAt).toISOString() : null,
        maxRedemptions: maxRedemptions.trim() === '' ? null : Math.max(1, Number(maxRedemptions)),
        maxPerCustomer: Math.max(1, Number(maxPerCustomer) || 1),
        newCustomersOnly,
        stackable,
        facilityIds: facilityId ? [facilityId] : [],
      };
      if (isEdit) {
        return patch(`/promotions/${promo.id}`, payload);
      }
      return post('/promotions', payload);
    },
    {
      ok: isEdit ? 'Đã lưu cập nhật khuyến mãi' : 'Đã tạo chương trình khuyến mãi (bản nháp)',
      invalidate: ['/promotions'],
      onSuccess: () => onClose(),
    },
  );

  const valid =
    name.trim().length >= 3 &&
    value !== '' &&
    Number(value) >= 0 &&
    Boolean(startsAt) &&
    (!manage || Boolean(facilityId));

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={isEdit ? `Chỉnh sửa khuyến mãi: ${promo.name}` : manage ? 'Đề xuất khuyến mãi cho cơ sở' : 'Tạo chương trình khuyến mãi mới'}
      description={
        isEdit
          ? 'Xem lại đầy đủ thông tin đã thiết lập (bao gồm cơ sở áp dụng, mã ưu đãi, thời hạn và điều kiện) để điều chỉnh khi cần.'
          : 'Thiết lập thông tin ưu đãi, cơ sở áp dụng và điều kiện sử dụng.'
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Hủy
          </Button>
          <Button variant="primary" loading={save.isPending} disabled={!valid} onClick={() => save.mutate(undefined)}>
            {isEdit ? 'Lưu thay đổi' : manage ? 'Gửi đề xuất' : 'Tạo khuyến mãi'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {lockedReward && (
          <Alert tone="warn" title="Chương trình đã có lượt áp dụng thực tế">
            Mã khuyến mãi, loại ưu đãi và mức giảm được cố định để đảm bảo đối soát hóa đơn. Bạn vẫn có thể sửa tên, mô tả, cơ sở áp dụng, thời gian và giới hạn lượt dùng.
          </Alert>
        )}

        <div className="grid gap-3.5 sm:grid-cols-2">
          <Field label="Tên chương trình" required>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="VD: Ưu đãi mùa hè 20%"
              maxLength={150}
            />
          </Field>
          <Field
            label="Mã khuyến mãi"
            hint="2–32 ký tự chữ/số/gạch ngang (để trống nếu tự động áp dụng)"
          >
            <Input
              value={code}
              disabled={lockedReward}
              onChange={(e) => setCode(e.target.value)}
              placeholder="VD: WELCOME10 hoặc VIP2026"
              className="code"
              maxLength={32}
            />
          </Field>
        </div>

        <Field
          label={manage ? 'Cơ sở áp dụng' : 'Phạm vi / Cơ sở áp dụng'}
          required={!!manage}
          hint={manage ? 'Đề xuất áp dụng cho cơ sở bạn quản lý' : 'Chọn một cơ sở cụ thể hoặc áp dụng trên toàn hệ thống Vaultra'}
        >
          <Select value={facilityId} onChange={(e) => setFacilityId(e.target.value)}>
            {!manage && <option value="">Toàn hệ thống (Tất cả cơ sở)</option>}
            {facilities.map((f: any) => (
              <option key={f.id} value={f.id}>
                {f.name} ({f.code})
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Mô tả chương trình">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ghi chú nội dung hiển thị hoặc điều kiện áp dụng chi tiết…"
            className="min-h-[68px]"
            maxLength={500}
          />
        </Field>

        <div className="grid gap-3.5 sm:grid-cols-2">
          <Field label="Loại ưu đãi" required>
            <Select value={type} disabled={lockedReward} onChange={(e) => setType(e.target.value)}>
              {Object.entries(PT).map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label={
              type === 'PERCENT'
                ? 'Mức giảm (%)'
                : type === 'FREE_MONTHS'
                  ? 'Số tháng tặng'
                  : type === 'FIRST_MONTH_PRICE'
                    ? 'Giá ưu đãi tháng đầu (₫)'
                    : 'Số tiền giảm (₫)'
            }
            required
          >
            <Input
              type="number"
              min={0}
              max={type === 'PERCENT' ? 100 : undefined}
              disabled={lockedReward}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </Field>
        </div>

        <div className="grid gap-3.5 sm:grid-cols-2">
          <Field label="Áp dụng cho số kỳ thanh toán">
            <Input
              type="number"
              min={1}
              max={36}
              value={appliesToPeriods}
              onChange={(e) => setAppliesToPeriods(e.target.value)}
            />
          </Field>
          <Field label="Kỳ hạn thuê tối thiểu (tháng)">
            <Input
              type="number"
              min={1}
              max={36}
              value={minTermMonths}
              onChange={(e) => setMinTermMonths(e.target.value)}
            />
          </Field>
        </div>

        <div className="grid gap-3.5 sm:grid-cols-2">
          <Field label="Thời điểm bắt đầu" required>
            <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </Field>
          <Field label="Thời điểm kết thúc" hint="Để trống nếu không giới hạn ngày kết thúc">
            <Input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </Field>
        </div>

        <div className="grid gap-3.5 sm:grid-cols-2">
          <Field label="Tổng số lượt tối đa" hint="Để trống = không giới hạn tổng lượt">
            <Input
              type="number"
              min={1}
              value={maxRedemptions}
              onChange={(e) => setMaxRedemptions(e.target.value)}
              placeholder="Không giới hạn"
            />
          </Field>
          <Field label="Tối đa mỗi khách hàng (lượt)">
            <Input
              type="number"
              min={1}
              value={maxPerCustomer}
              onChange={(e) => setMaxPerCustomer(e.target.value)}
            />
          </Field>
        </div>

        <div className="grid gap-3 rounded-xl border hairline bg-[#faf8f4] p-3.5 sm:grid-cols-2">
          <Checkbox
            checked={newCustomersOnly}
            onChange={setNewCustomersOnly}
            label="Chỉ áp dụng cho khách hàng mới"
          />
          <Checkbox
            checked={stackable}
            onChange={setStackable}
            label="Cộng dồn với chương trình khuyến mãi khác"
          />
        </div>
      </div>
    </Modal>
  );
}

export function PromotionsPage({ manage }: { manage?: boolean }) {
  const q = useGet<any[]>('/promotions');
  const fac = useGet<any[]>('/facilities');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPromo, setEditingPromo] = useState<any | null>(null);
  const inv = ['/promotions'];

  return (
    <>
      <PageHeader
        title="Khuyến mãi"
        sub={manage ? 'Đề xuất chương trình cho cơ sở — BOM sẽ duyệt' : 'Tạo, kích hoạt và theo dõi hiệu quả'}
        actions={
          <Button
            variant="primary"
            icon={<Plus className="size-4" />}
            onClick={() => {
              setEditingPromo(null);
              setModalOpen(true);
            }}
          >
            {manage ? 'Đề xuất khuyến mãi' : 'Tạo khuyến mãi'}
          </Button>
        }
      />
      <Card>
        <DataTable
          rows={q.data}
          loading={q.isLoading}
          error={q.error}
          onRetry={q.refetch}
          rowKey={(p: any) => p.id}
          empty={<EmptyState title="Chưa có khuyến mãi" />}
          cols={[
            {
              key: 'n',
              header: 'Chương trình',
              cell: (p: any) => (
                <>
                  <b>{p.name}</b>
                  <span className="block text-xs text-steel-500">
                    {p.code ? <span className="code font-semibold text-ink-900">{p.code}</span> : 'Tự áp dụng'} · {PT[p.type]}{' '}
                    {p.type === 'PERCENT'
                      ? `${Number(p.value)}%`
                      : p.type === 'FREE_MONTHS'
                        ? `${Number(p.value)} tháng`
                        : vnd(p.value)}
                  </span>
                </>
              ),
            },
            {
              key: 'fac',
              header: 'Phạm vi cơ sở',
              hideBelow: 'sm',
              cell: (p: any) =>
                p.facilities?.length ? (
                  <div className="flex flex-wrap gap-1">
                    {p.facilities.map((f: any) => (
                      <Badge key={f.id} tone="warn">
                        {f.name}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <Badge tone="info">Toàn hệ thống</Badge>
                ),
            },
            {
              key: 'u',
              header: 'Lượt dùng',
              hideBelow: 'sm',
              cell: (p: any) => `${p.stats?.redemptions ?? 0}${p.max_redemptions ? ` / ${p.max_redemptions}` : ''}`,
            },
            {
              key: 'd',
              header: 'Tổng giảm',
              hideBelow: 'md',
              cell: (p: any) => <Money v={p.stats?.discountTotal ?? 0} />,
            },
            {
              key: 'e',
              header: 'Thời gian',
              hideBelow: 'md',
              cell: (p: any) => `${fmtDate(p.starts_at)} → ${p.ends_at ? fmtDate(p.ends_at) : '∞'}`,
            },
            {
              key: 's',
              header: '',
              cell: (p: any) => <Badge tone={PS[p.status]?.[0]}>{PS[p.status]?.[1]}</Badge>,
            },
            {
              key: 'a',
              header: '',
              cell: (p: any) => (
                <span className="flex flex-wrap gap-1">
                  {!manage && ['DRAFT', 'PAUSED'].includes(p.status) && (
                    <ActBtn
                      label="Kích hoạt"
                      size="xs"
                      variant="primary"
                      run={() => post(`/promotions/${p.id}/activate`, {})}
                      ok="Đã kích hoạt"
                      invalidate={inv}
                    />
                  )}
                  {!manage && p.status === 'ACTIVE' && (
                    <ActBtn
                      label="Tạm dừng"
                      size="xs"
                      run={() => post(`/promotions/${p.id}/pause`, {})}
                      ok="Đã tạm dừng"
                      invalidate={inv}
                    />
                  )}
                  {!manage && p.status !== 'ENDED' && (
                    <ActBtn
                      label="Kết thúc"
                      size="xs"
                      danger
                      title="Kết thúc khuyến mãi"
                      description="Không thể kích hoạt lại."
                      run={() => post(`/promotions/${p.id}/end`, {})}
                      ok="Đã kết thúc"
                      invalidate={inv}
                    />
                  )}
                  {(!manage || p.status === 'DRAFT') && p.status !== 'ENDED' && (
                    <Button
                      size="xs"
                      variant="outline"
                      icon={<Pencil className="size-3" />}
                      onClick={() => {
                        setEditingPromo(p);
                        setModalOpen(true);
                      }}
                    >
                      Sửa
                    </Button>
                  )}
                  {p.status === 'DRAFT' && !p.stats?.redemptions && (
                    <ActBtn
                      label="Xóa"
                      size="xs"
                      danger
                      title="Xóa bản nháp"
                      run={() => del(`/promotions/${p.id}`)}
                      ok="Đã xóa"
                      invalidate={inv}
                    />
                  )}
                </span>
              ),
            },
          ]}
        />
      </Card>
      <PromoModal
        open={modalOpen}
        promo={editingPromo}
        facilities={fac.data ?? []}
        manage={manage}
        onClose={() => {
          setModalOpen(false);
          setEditingPromo(null);
        }}
      />
    </>
  );
}
