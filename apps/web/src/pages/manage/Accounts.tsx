import { useState } from 'react';
import { Building2, Plus, Search, ShieldCheck, UserPlus } from 'lucide-react';
import { useGet, useAct } from '@/lib/hooks';
import { get, post, del } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Alert, Avatar, Badge, Button, Card, CardHead, Drawer, Field, FilterBar, Input, Modal, PageHeader, PagedTable, Select, Tabs } from '@/ui';
import { fmtDateTime } from '@/lib/format';
import { ActBtn, REASON } from '../kit';

const STATUS: Record<string, [any, string]> = {
  ACTIVE: ['ok', 'Hoạt động'],
  INVITED: ['info', 'Chờ kích hoạt'],
  LOCKED: ['bad', 'Bị khóa'],
  DISABLED: ['neutral', 'Vô hiệu'],
  PENDING_VERIFICATION: ['warn', 'Chờ xác minh'],
};
const inv = ['/facility-accounts'];

/** Accounts of the manager's own facilities: staff (invite, grant / withdraw the staff role, lock) and customers (lock, reset password). */
export function Accounts() {
  const facilities = useAuth((s) => s.facilities) ?? [];
  const [group, setGroup] = useState<'staff' | 'customers'>('staff');
  const [qs, setQs] = useState('');
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [grantOpen, setGrantOpen] = useState(false);
  const facOptions = facilities.map((f: any) => ({ value: f.id, label: f.name }));
  const single = facilities.length === 1 ? facilities[0]?.id : undefined;

  return (
    <>
      <PageHeader
        title="Tài khoản & Nhân sự"
        sub="Quản lý tài khoản nhân viên và khách thuê của cơ sở bạn phụ trách: cấp hoặc gỡ quyền nhân viên, khóa và mở khóa, đặt lại mật khẩu"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" icon={<ShieldCheck className="size-4" />} onClick={() => setGrantOpen(true)}>Cấp quyền cho tài khoản có sẵn</Button>
            <ActBtn
              label="Mời nhân viên mới"
              variant="primary"
              icon={<UserPlus className="size-4" />}
              title="Mời nhân viên mới"
              description="Người được mời nhận email để đặt mật khẩu. Tài khoản chỉ có vai trò Nhân viên cơ sở."
              fields={[
                { name: 'email', label: 'Email', type: 'email', required: true },
                { name: 'fullName', label: 'Họ tên', required: true, maxLength: 150 },
                { name: 'phone', label: 'Điện thoại', maxLength: 20 },
                { name: 'facilityId', label: 'Cơ sở', type: 'select', required: true, def: single, options: facOptions },
              ]}
              run={(v) => post('/facility-accounts/staff', { email: v.email, fullName: v.fullName, phone: v.phone || undefined, facilityId: v.facilityId })}
              ok="Đã gửi lời mời"
              invalidate={inv}
            />
          </div>
        }
      />
      <Alert tone="info" title="Phạm vi của bạn">
        Bạn quản lý được <b>nhân viên</b> và <b>khách thuê</b> của cơ sở mình. Bạn chỉ cấp được vai trò <b>Nhân viên cơ sở</b>. Tài khoản quản lý, vận hành và quản trị do cấp cao hơn phụ trách và không hiện ở đây.
      </Alert>
      <Card className="mt-4 overflow-hidden">
        <PagedTable
          path="/facility-accounts"
          query={{ group, status: status || undefined, q: qs || undefined }}
          rowKey={(u: any) => u.id}
          onRow={(u: any) => setOpen(u.id)}
          toolbar={
            <FilterBar>
              <Tabs
                value={group}
                onChange={(v) => { setGroup(v as 'staff' | 'customers'); setStatus(''); }}
                tabs={[{ value: 'staff', label: 'Nhân viên' }, { value: 'customers', label: 'Khách hàng' }]}
              />
              <div className="relative w-60">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-steel-400" />
                <Input aria-label="Tìm kiếm" className="w-60 pl-9" placeholder="Tìm email, tên, SĐT…" value={qs} onChange={(e) => setQs(e.target.value)} />
              </div>
              <Select aria-label="Trạng thái" className="w-44" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">Mọi trạng thái</option>
                {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v[1]}</option>)}
              </Select>
            </FilterBar>
          }
          cols={[
            { key: 'n', header: 'Tài khoản', cell: (u: any) => (
              <div className="flex items-center gap-3">
                <Avatar name={u.full_name} size={34} />
                <div className="min-w-0">
                  <b className="block truncate text-ink-950">{u.full_name}</b>
                  <span className="block truncate text-xs text-steel-500">{u.email}</span>
                </div>
              </div>
            ) },
            { key: 'p', header: 'Điện thoại', hideBelow: 'md', cell: (u: any) => u.phone || <span className="text-steel-400">—</span> },
            { key: 'r', header: 'Vai trò', hideBelow: 'sm', cell: (u: any) => u.roles?.length
              ? <div className="flex flex-wrap gap-1.5">{u.roles.map((r: any) => <Badge key={r.id} tone="brass">{r.label}{r.facility ? ` · ${r.facility.code ?? r.facility.name}` : ''}</Badge>)}</div>
              : <Badge tone="neutral">Khách thuê kho</Badge> },
            { key: 'l', header: 'Đăng nhập cuối', hideBelow: 'md', cell: (u: any) => u.last_login_at ? <span className="whitespace-nowrap text-xs text-steel-600">{fmtDateTime(u.last_login_at)}</span> : <span className="text-steel-400">—</span> },
            { key: 's', header: 'Trạng thái', cell: (u: any) => <Badge tone={STATUS[u.status]?.[0]} dot>{STATUS[u.status]?.[1] ?? u.status}</Badge> },
          ]}
        />
      </Card>
      <AccountDrawer id={open} onClose={() => setOpen(null)} facOptions={facOptions} single={single} />
      <GrantModal open={grantOpen} onClose={() => setGrantOpen(false)} facOptions={facOptions} single={single} />
    </>
  );
}

/** Find an existing account by e-mail, see who it is, then give it the staff role. */
function GrantModal({ open, onClose, facOptions, single }: { open: boolean; onClose: () => void; facOptions: { value: string; label: string }[]; single?: string }) {
  const [email, setEmail] = useState('');
  const [found, setFound] = useState<any | null | undefined>(undefined);
  const [facilityId, setFacilityId] = useState(single ?? '');
  const [reason, setReason] = useState('');
  const close = () => { setEmail(''); setFound(undefined); setReason(''); onClose(); };
  const search = useAct(() => get('/facility-accounts/lookup', { email: email.trim() }), { silentError: true, onSuccess: (r: any) => setFound(r.found ? r : null) });
  const grant = useAct(() => post(`/facility-accounts/${found.id}/staff-role`, { facilityId: facilityId || single, reason }), { ok: 'Đã cấp quyền nhân viên', invalidate: inv, onSuccess: close });
  const fid = facilityId || single || '';
  const already = !!found && (found.staffAt ?? []).length > 0 && facOptions.some((o) => o.value === fid && (found.staffAt as string[]).includes(o.label));
  return (
    <Modal
      open={open}
      onClose={close}
      title="Cấp quyền nhân viên cho tài khoản có sẵn"
      description="Dùng khi người đó đã có tài khoản (ví dụ tài khoản khách). Chỉ cấp được vai trò Nhân viên cơ sở."
      footer={<><Button variant="ghost" onClick={close}>Đóng</Button><Button variant="primary" disabled={!found || !fid || reason.trim().length < 3 || already} loading={grant.isPending} onClick={() => grant.mutate(undefined)}>Cấp quyền nhân viên</Button></>}
    >
      <div className="space-y-4">
        <Field label="Email của tài khoản">
          <div className="flex gap-2">
            <Input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setFound(undefined); }} placeholder="nguoi.dung@example.com" />
            <Button variant="outline" disabled={!/.+@.+\..+/.test(email)} loading={search.isPending} onClick={() => search.mutate(undefined)}>Tìm</Button>
          </div>
        </Field>
        {found === null && <Alert tone="warn" title="Không tìm thấy">Không có tài khoản nào có thể cấp quyền với email này. Nếu là người mới, hãy dùng "Mời nhân viên mới".</Alert>}
        {found && (
          <div className="space-y-3 rounded-xl border hairline bg-paper p-4">
            <div className="flex items-center gap-3">
              <Avatar name={found.full_name} size={40} />
              <div className="min-w-0">
                <b className="block truncate text-ink-950">{found.full_name}</b>
                <span className="block truncate text-xs text-steel-500">{found.email}</span>
              </div>
              <Badge tone={STATUS[found.status]?.[0]} dot className="ml-auto">{STATUS[found.status]?.[1] ?? found.status}</Badge>
            </div>
            {found.staffAt?.length > 0 && <p className="text-xs text-steel-600">Đã là nhân viên tại: <b>{found.staffAt.join(', ')}</b></p>}
            {found.elsewhere && <p className="text-xs text-warn-700">Tài khoản này cũng gắn với cơ sở khác.</p>}
            <Field label="Cơ sở"><Select value={fid} onChange={(e) => setFacilityId(e.target.value)}><option value="">— Chọn cơ sở —</option>{facOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select></Field>
            <Field label="Lý do" hint="Tối thiểu 3 ký tự, được ghi nhật ký"><Input value={reason} maxLength={255} onChange={(e) => setReason(e.target.value)} placeholder="VD: Tuyển nhân viên mới" /></Field>
            {already && <Alert tone="info">Tài khoản đã là nhân viên của cơ sở này.</Alert>}
          </div>
        )}
      </div>
    </Modal>
  );
}

function AccountDrawer({ id, onClose, facOptions, single }: { id: string | null; onClose: () => void; facOptions: { value: string; label: string }[]; single?: string }) {
  const q = useGet<any>(id ? `/facility-accounts/${id}` : null, undefined, { staleTime: 0 });
  const u = q.data;
  const staff = u?.kind === 'STAFF';
  return (
    <Drawer open={!!id} onClose={onClose} title={u?.full_name ?? 'Hồ sơ tài khoản'} width={560}>
      {u && (
        <div className="space-y-5">
          <div className="grain rounded-2xl border border-ink-800 bg-ink-950 p-4 text-white">
            <div className="flex items-center gap-3.5">
              <Avatar name={u.full_name} size={46} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-extrabold text-white">{u.full_name}</p>
                <p className="truncate text-xs text-steel-300">{u.email}{u.phone ? ` · ${u.phone}` : ''}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge tone={STATUS[u.status]?.[0]} dot>{STATUS[u.status]?.[1] ?? u.status}</Badge>
                  <Badge tone="neutral">{staff ? 'Nhân viên' : 'Khách thuê kho'}</Badge>
                </div>
              </div>
            </div>
            <p className="mt-3 text-xs text-steel-300">Đăng nhập cuối: {u.last_login_at ? fmtDateTime(u.last_login_at) : 'chưa đăng nhập'}</p>
          </div>

          {!u.manageable ? (
            <Alert tone="warn" title="Chỉ xem">Tài khoản này gắn với cơ sở khác hoặc là chính bạn nên không thao tác được ở đây. Hãy nhờ quản lý vận hành.</Alert>
          ) : (
            <div className="flex flex-wrap gap-2">
              {u.status === 'LOCKED' ? (
                <ActBtn label="Mở khóa" variant="primary" title="Mở khóa" fields={[REASON]} run={(v) => post(`/facility-accounts/${u.id}/unlock`, v)} ok="Đã mở khóa" invalidate={inv} />
              ) : u.status === 'ACTIVE' && (
                <ActBtn label="Khóa" title="Khóa tài khoản" description="Mọi phiên đăng nhập sẽ bị thu hồi ngay." fields={[REASON]} run={(v) => post(`/facility-accounts/${u.id}/lock`, v)} ok="Đã khóa" invalidate={inv} />
              )}
              {staff && (u.status === 'DISABLED' ? (
                <ActBtn label="Kích hoạt lại" title="Kích hoạt lại" fields={[REASON]} run={(v) => post(`/facility-accounts/${u.id}/enable`, v)} ok="Đã kích hoạt" invalidate={inv} />
              ) : (
                <ActBtn label="Vô hiệu hóa" danger title="Vô hiệu hóa nhân viên" description="Mọi phiên đăng nhập bị thu hồi. Công việc và phiếu hỗ trợ đang giữ sẽ trả về hàng chờ." fields={[REASON]} run={(v) => post(`/facility-accounts/${u.id}/disable`, v)} ok="Đã vô hiệu hóa" invalidate={inv} />
              ))}
              <ActBtn label="Gửi email đặt lại mật khẩu" run={() => post(`/facility-accounts/${u.id}/reset-password`, {})} ok="Đã gửi email" />
            </div>
          )}

          <Card>
            <CardHead
              title="Quyền nhân viên"
              action={u.manageable && (
                <ActBtn
                  label="Cấp quyền nhân viên"
                  size="xs"
                  variant="primary"
                  icon={<Plus className="size-3" />}
                  title="Cấp quyền nhân viên"
                  description="Chỉ cấp được vai trò Nhân viên cơ sở cho cơ sở do bạn quản lý. Người này sẽ phải đăng nhập lại."
                  fields={[
                    { name: 'facilityId', label: 'Cơ sở', type: 'select', required: true, def: single, options: facOptions },
                    REASON,
                  ]}
                  run={(v) => post(`/facility-accounts/${u.id}/staff-role`, { facilityId: v.facilityId, reason: v.reason })}
                  ok="Đã cấp quyền"
                  invalidate={inv}
                />
              )}
            />
            <ul className="divide-y hairline">
              {u.roles.length === 0 && <li className="p-4 text-sm text-steel-500">Chưa có quyền nhân viên. Đây là tài khoản khách thuê.</li>}
              {u.roles.map((r: any) => (
                <li key={r.id} className="flex items-center justify-between gap-2 px-5 py-3 text-sm">
                  <span className="flex flex-wrap items-center gap-2">
                    <b className="text-ink-950">{r.label}</b>
                    {r.facility && <span className="inline-flex items-center gap-1 rounded-full bg-paper px-2.5 py-0.5 text-xs font-medium text-steel-600"><Building2 className="size-3 text-brass-600" />{r.facility.name}</span>}
                  </span>
                  {u.manageable && (
                    <ActBtn
                      label="Gỡ quyền"
                      size="xs"
                      danger
                      title="Gỡ quyền nhân viên"
                      description="Người này bị đăng xuất. Công việc và phiếu đang giữ tại cơ sở được trả về hàng chờ."
                      fields={[REASON]}
                      run={(v) => del(`/facility-accounts/${u.id}/staff-role/${r.id}?reason=${encodeURIComponent(v.reason)}`)}
                      ok="Đã gỡ quyền"
                      invalidate={inv}
                    />
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </Drawer>
  );
}
