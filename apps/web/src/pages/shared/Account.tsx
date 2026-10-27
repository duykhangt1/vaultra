import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LogOut,
  Download,
  Link2,
  Bell,
  CheckCheck,
  ShieldCheck,
  KeyRound,
  Building2,
  Mail,
  Phone,
  Globe,
  Laptop,
  History,
  FileText,
  Receipt,
  LifeBuoy,
  CalendarClock,
  ChevronRight,
  Lock,
  Trash2,
  Sliders,
} from 'lucide-react';
import { useGet, useAct } from '@/lib/hooks';
import { post, patch, del } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Async, Card, CardHead, PagedTable, Button, Field, Input, Select, Switch, Badge, Tabs, EmptyState, cn } from '@/ui';
import { fmtDateTime, relTime, ROLE_LABEL, initials } from '@/lib/format';
import { useI18n, Locale } from '@/lib/i18n';
import { ActBtn } from '../kit';


function collectCoreSettlementIsUnreadChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

interface CoreSecondaryZoneAccountSnapshot {
  readonly photosAttached: boolean;
  readonly vatIncluded: boolean;
  readonly allowPartial: boolean;
}
function notifIcon(n: any) {
  const hay = `${n.category ?? ''} ${n.type ?? ''} ${n.link ?? ''} ${n.title ?? ''}`.toLowerCase();
  if (hay.includes('invoice') || hay.includes('bill') || hay.includes('hóa đơn') || hay.includes('thanh toán')) {
    return <Receipt className="size-4" />;
  }
  if (hay.includes('contract') || hay.includes('hợp đồng') || hay.includes('gia hạn')) {
    return <FileText className="size-4" />;
  }
  if (hay.includes('ticket') || hay.includes('support') || hay.includes('hỗ trợ') || hay.includes('phiếu')) {
    return <LifeBuoy className="size-4" />;
  }
  if (hay.includes('reserv') || hay.includes('checkin') || hay.includes('move') || hay.includes('lịch hẹn') || hay.includes('kho')) {
    return <CalendarClock className="size-4" />;
  }
  if (hay.includes('sec') || hay.includes('password') || hay.includes('login') || hay.includes('bảo mật')) {
    return <ShieldCheck className="size-4" />;
  }
  return <Bell className="size-4" />;
}

export function NotificationsPage() {
  const nav = useNavigate();
  const read = useAct((id: string) => post(`/notifications/${id}/read`), { invalidate: ['/notifications'], silentError: true });
  const all = useAct(() => post('/notifications/read-all'), { ok: 'Đã đánh dấu đã đọc', invalidate: ['/notifications'] });
  const [unread, setUnread] = useState(false);

  return (
    <div className="space-y-6">
      <div className="grain blueprint-dark relative overflow-hidden rounded-2xl border border-ink-800 bg-ink-950 p-5 text-white shadow-[var(--shadow-card)] sm:p-6">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brass-600 via-brass-400 to-brass-600" />
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-brass-400/35 bg-brass-500/15 text-brass-400">
              <Bell className="size-5" />
            </span>
            <div>
              <h1 className="display text-2xl text-white sm:text-3xl">Thông báo</h1>
              <p className="mt-1 text-sm text-steel-300">
                Cập nhật về hợp đồng, lịch hẹn nhận/trả kho, hóa đơn và phiếu hỗ trợ.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant={unread ? 'primary' : 'glass'}
              onClick={() => setUnread((u) => !u)}
            >
              {unread ? 'Đang lọc: Chưa đọc' : 'Chỉ xem chưa đọc'}
            </Button>
            <Button
              size="sm"
              variant="glass"
              icon={<CheckCheck className="size-4 text-brass-400" />}
              loading={all.isPending}
              onClick={() => all.mutate(undefined)}
            >
              Đánh dấu tất cả đã đọc
            </Button>
          </div>
        </div>
      </div>

      <Card className="overflow-hidden">
        <CardHead
          title={unread ? 'Thông báo chưa đọc' : 'Tất cả thông báo'}
          sub="Chạm vào một thông báo để đánh dấu đã đọc và chuyển tới trang chi tiết liên quan"
          action={
            unread ? (
              <button
                type="button"
                onClick={() => setUnread(false)}
                className="text-xs font-semibold text-brass-700 hover:underline"
              >
                Xem toàn bộ lịch sử
              </button>
            ) : undefined
          }
        />
        <PagedTable
          path="/notifications"
          query={{ unread: unread ? 'true' : undefined }}
          size={20}
          onRow={(n: any) => {
            if (!n.read_at) read.mutate(n.id);
            if (n.link) nav(n.link);
          }}
          cols={[
            {
              key: 't',
              header: 'Nội dung thông báo',
              cell: (n: any) => {
                const isUnread = !n.read_at;
                return (
                  <div className="flex items-start gap-3.5 py-0.5">
                    <div className="relative mt-0.5 shrink-0">
                      <span
                        className={cn(
                          'grid size-9 place-items-center rounded-xl border transition',
                          isUnread
                            ? 'border-brass-500/40 bg-ink-950 text-brass-400 shadow-xs'
                            : 'border-steel-200 bg-paper text-steel-500',
                        )}
                      >
                        {notifIcon(n)}
                      </span>
                      {isUnread && (
                        <span
                          className="absolute -right-1 -top-1 size-2.5 rounded-full bg-brass-500 ring-2 ring-white"
                          aria-label="Chưa đọc"
                        />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={cn('text-sm', isUnread ? 'font-bold text-ink-950' : 'font-medium text-ink-800')}>
                          {n.title}
                        </span>
                        {isUnread && <Badge tone="brass">Mới</Badge>}
                        {n.priority === 'HIGH' && <Badge tone="bad">Quan trọng</Badge>}
                      </div>
                      {n.body && <p className="mt-0.5 line-clamp-2 text-[13px] leading-relaxed text-steel-500">{n.body}</p>}
                    </div>
                  </div>
                );
              },
            },
            {
              key: 'w',
              header: 'Thời gian',
              className: 'w-40 text-right',
              cell: (n: any) => (
                <div className="flex items-center justify-end gap-2 text-right">
                  <span className="whitespace-nowrap text-xs font-medium text-steel-500">{relTime(n.created_at)}</span>
                  {n.link && <ChevronRight className="size-4 shrink-0 text-steel-300" />}
                </div>
              ),
            },
          ]}
          empty={
            <EmptyState
              icon={<Bell className="size-6" />}
              title={unread ? 'Bạn đã đọc hết mọi thông báo' : 'Chưa có thông báo nào'}
              hint={unread ? 'Bấm "Xem toàn bộ lịch sử" để xem lại các thông báo trước đó.' : 'Các cập nhật vận hành, hợp đồng và bảo mật sẽ xuất hiện tại đây.'}
            />
          }
        />
      </Card>
    </div>
  );
}

const GROUPS: Record<string, { label: string; desc: string }> = {
  BILLING: { label: 'Thanh toán & hóa đơn', desc: 'Phát hành hóa đơn mới, biên lai thanh toán và nhắc hạn thanh toán' },
  CONTRACT: { label: 'Hợp đồng lưu trữ', desc: 'Ký hợp đồng điện tử, bàn giao kho, cấp mã PIN và biên bản kiểm tra' },
  RENEWAL: { label: 'Gia hạn thuê kho', desc: 'Thông báo sắp hết hạn thuê và xác nhận gia hạn chu kỳ mới' },
  SUPPORT: { label: 'Phiếu hỗ trợ kỹ thuật', desc: 'Phản hồi từ nhân viên vận hành và cập nhật trạng thái xử lý phiếu' },
  OPERATIONS: { label: 'Vận hành & lịch hẹn', desc: 'Nhắc lịch hẹn nhận kho, trả kho, kiểm tra định kỳ và công việc ca trực' },
  MARKETING: { label: 'Ưu đãi & bản tin', desc: 'Chương trình khuyến mãi theo mùa và thông báo mở cơ sở mới' },
};

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-5 shrink-0" aria-hidden="true">
      <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v2.98h3.86c2.26-2.09 3.56-5.17 3.56-8.8Z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-2.98c-1.08.72-2.45 1.16-4.07 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24Z" />
      <path fill="#FBBC05" d="M5.28 14.31A7.19 7.19 0 0 1 4.9 12c0-.8.14-1.58.38-2.31V6.6H1.29A11.99 11.99 0 0 0 0 12c0 1.92.46 3.74 1.29 5.4l3.99-3.09Z" />
      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.6l3.99 3.09c.95-2.85 3.6-4.94 6.72-4.94Z" />
    </svg>
  );
}

export function AccountPage() {
  const [tab, setTab] = useState('profile');
  const user = useAuth((s) => s.user);
  const roles = useAuth((s) => s.roles);
  const facilities = useAuth((s) => s.facilities);
  const reload = useAuth((s) => s.reload);
  const logout = useAuth((s) => s.logout);
  const { locale, setLocale } = useI18n();
  const nav = useNavigate();
  const me = useGet<any>('/me');
  const [p, setP] = useState({ fullName: '', phone: '', addressLine: '', district: '', province: '', locale: locale as Locale });

  useEffect(() => {
    if (me.data) {
      setP({
        fullName: me.data.full_name ?? '',
        phone: me.data.phone ?? '',
        addressLine: me.data.customer?.address_line ?? '',
        district: me.data.customer?.district ?? '',
        province: me.data.customer?.province ?? '',
        locale: me.data.locale === 'en' ? 'en' : 'vi',
      });
    }
  }, [me.data]);

  const save = useAct(
    () =>
      patch('/me', {
        fullName: p.fullName.trim(),
        phone: p.phone.trim() || null,
        locale: p.locale,
        ...(user?.customerId
          ? { addressLine: p.addressLine || null, district: p.district || null, province: p.province || null }
          : {}),
      }),
    {
      ok: 'Đã lưu hồ sơ',
      invalidate: ['/me'],
      onSuccess: () => {
        setLocale(p.locale, false);
        void reload();
      },
    },
  );

  const [pw, setPw] = useState({ cur: '', next: '', again: '' });
  const chg = useAct(
    () => post('/me/password', { currentPassword: pw.cur, newPassword: pw.next }),
    {
      ok: 'Đã đổi mật khẩu. Các phiên khác đã bị đăng xuất.',
      onSuccess: () => setPw({ cur: '', next: '', again: '' }),
    },
  );
  const pwErr =
    pw.next && pw.next.length < 5
      ? 'Tối thiểu 5 ký tự'
      : pw.again && pw.again !== pw.next
        ? 'Mật khẩu nhập lại không khớp'
        : undefined;

  const sess = useGet<any[]>(tab === 'security' ? '/me/sessions' : null);
  const prefs = useGet<any[]>(tab === 'notify' ? '/me/notification-preferences' : null);
  const [pf, setPf] = useState<any[]>([]);
  useEffect(() => {
    if (Array.isArray(prefs.data)) setPf(prefs.data);
  }, [prefs.data]);

  const savePrefs = useAct(() => post('/me/notification-preferences', pf), {
    ok: 'Đã lưu tùy chọn thông báo',
    invalidate: ['/me/notification-preferences'],
  });
  const revokeOthers = useAct(() => post('/me/sessions/revoke-others'), {
    ok: 'Đã đăng xuất các thiết bị khác',
    invalidate: ['/me', '/me/sessions'],
  });
  const exportData = useAct(() => post('/me/data-export'), {
    onSuccess: (d) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' }));
      a.download = 'vaultra-du-lieu-cua-toi.json';
      a.click();
    },
  });
  const unlink = useAct(() => del('/me/oauth/google'), { ok: 'Đã hủy liên kết Google', invalidate: ['/me'] });
  const link = useAct(
    () => post('/me/oauth/google', { origin: typeof window !== 'undefined' ? window.location.origin : undefined }),
    {
      onSuccess: (r) => {
        window.location.href = r.url;
      },
    },
  );

  const displayName = p.fullName || user?.fullName || user?.email || 'Tài khoản Vaultra';
  const googleLinked = Boolean(me.data?.oauth?.length);

  return (
    <div className="space-y-6">
      {/* Executive Identity Monogram Banner */}
      <div className="grain blueprint-dark relative overflow-hidden rounded-2xl border border-ink-800 bg-ink-950 p-5 text-white shadow-[var(--shadow-card)] sm:p-7">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brass-600 via-brass-400 to-brass-600" />
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="grid size-16 shrink-0 place-items-center rounded-2xl border border-brass-400/45 bg-gradient-to-br from-ink-800 to-ink-950 text-xl font-extrabold tracking-tight text-brass-400 shadow-[var(--shadow-glow)] sm:size-20 sm:text-2xl">
              {initials(displayName)}
            </div>
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="display truncate text-2xl text-white sm:text-3xl">{displayName}</h1>
                {googleLinked && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/10 px-2.5 py-0.5 text-[11px] font-semibold text-steel-200">
                    Google
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-steel-300 sm:text-sm">
                <span className="inline-flex items-center gap-1.5">
                  <Mail className="size-3.5 text-brass-400" />
                  {user?.email}
                </span>
                {(p.phone || user?.phone) && (
                  <span className="inline-flex items-center gap-1.5">
                    <Phone className="size-3.5 text-brass-400" />
                    {p.phone || user?.phone}
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5">
                  <Globe className="size-3.5 text-brass-400" />
                  {p.locale === 'en' ? 'English (EN)' : 'Tiếng Việt (VI)'}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                {roles?.map((r) => (
                  <span
                    key={r}
                    className="inline-flex items-center gap-1.5 rounded-full border border-brass-400/35 bg-brass-500/15 px-3 py-1 text-xs font-semibold text-brass-400"
                  >
                    <ShieldCheck className="size-3.5" />
                    {ROLE_LABEL[r] ?? r}
                  </span>
                ))}
                {(facilities ?? []).map((f) => (
                  <span
                    key={f.id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/8 px-3 py-1 text-xs font-medium text-steel-200"
                  >
                    <Building2 className="size-3.5 text-brass-400" />
                    {f.code ? `${f.code} · ${f.name}` : f.name}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2 self-start lg:self-center">
            <Button
              variant="glass"
              size="sm"
              icon={<LogOut className="size-4 text-brass-400" />}
              onClick={async () => {
                await logout();
                nav('/login');
              }}
            >
              Đăng xuất
            </Button>
          </div>
        </div>
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'profile', label: 'Hồ sơ cá nhân' },
          { value: 'security', label: 'Bảo mật & Phiên' },
          { value: 'notify', label: 'Tùy chọn thông báo' },
          ...(user?.customerId ? [{ value: 'privacy', label: 'Quyền riêng tư' }] : []),
        ]}
      />

      {tab === 'profile' && (
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <Card>
            <CardHead
              title="Thông tin liên hệ & Ngôn ngữ"
              sub="Cập nhật họ tên, số điện thoại liên lạc nội bộ và ngôn ngữ hiển thị mặc định"
            />
            <div className="space-y-4 p-5">
              <Field label="Địa chỉ Email đăng nhập" hint="Email định danh tài khoản không thể tự thay đổi.">
                <Input value={user?.email ?? ''} disabled />
              </Field>
              <Field label="Họ và tên" required error={p.fullName.trim().length < 2 ? 'Nhập họ tên' : undefined}>
                <Input value={p.fullName} onChange={(e) => setP({ ...p, fullName: e.target.value })} placeholder="Nguyễn Văn A" />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Số điện thoại">
                  <Input value={p.phone} onChange={(e) => setP({ ...p, phone: e.target.value })} placeholder="09xx xxx xxx" />
                </Field>
                <Field label="Ngôn ngữ (Language)">
                  <Select value={p.locale} onChange={(e) => setP({ ...p, locale: e.target.value as Locale })}>
                    <option value="vi">Tiếng Việt (VI)</option>
                    <option value="en">English (EN)</option>
                  </Select>
                </Field>
              </div>
              {user?.customerId && (
                <div className="space-y-4 border-t hairline pt-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-steel-500">Địa chỉ liên hệ hợp đồng</p>
                  <Field label="Địa chỉ">
                    <Input value={p.addressLine} onChange={(e) => setP({ ...p, addressLine: e.target.value })} />
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Quận/huyện">
                      <Input value={p.district} onChange={(e) => setP({ ...p, district: e.target.value })} />
                    </Field>
                    <Field label="Tỉnh/thành">
                      <Input value={p.province} onChange={(e) => setP({ ...p, province: e.target.value })} />
                    </Field>
                  </div>
                </div>
              )}
              <div className="flex items-center justify-end border-t hairline pt-4">
                <Button
                  variant="primary"
                  loading={save.isPending}
                  disabled={p.fullName.trim().length < 2}
                  onClick={() => save.mutate(undefined)}
                >
                  Lưu thay đổi
                </Button>
              </div>
            </div>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHead title="Phân quyền & Cơ sở" sub="Quyền truy cập được cấp bởi quản trị viên" />
              <div className="space-y-4 p-5 text-sm">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-steel-500">Vai trò đảm nhiệm</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {roles?.length ? (
                      roles.map((r) => (
                        <Badge key={r} tone="brass">
                          {ROLE_LABEL[r] ?? r}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-steel-500">—</span>
                    )}
                  </div>
                </div>
                <div className="border-t hairline pt-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-steel-500">Cơ sở được phân công</p>
                  {facilities && facilities.length > 0 ? (
                    <ul className="mt-2 space-y-2">
                      {facilities.map((f) => (
                        <li key={f.id} className="flex items-center gap-2.5 rounded-xl border hairline bg-paper/70 px-3 py-2">
                          <Building2 className="size-4 shrink-0 text-brass-700" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-semibold text-ink-950">{f.name}</p>
                            {f.code && <p className="code text-xs text-steel-500">{f.code}</p>}
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1.5 text-xs leading-relaxed text-steel-500">
                      {roles?.some((r) => r === 'SYSTEM_ADMIN' || r === 'BUSINESS_OPS_MANAGER')
                        ? 'Phạm vi toàn hệ thống (Global) — quản lý tất cả các cơ sở Vaultra.'
                        : 'Tài khoản cá nhân không giới hạn theo cơ sở nội bộ.'}
                    </p>
                  )}
                </div>
                <div className="border-t hairline pt-3">
                  <button
                    type="button"
                    onClick={() => setTab('security')}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-info-600 hover:underline"
                  >
                    <Lock className="size-3.5" />
                    Kiểm tra mật khẩu & phiên đăng nhập →
                  </button>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {tab === 'security' && (
        <div className="grid max-w-5xl gap-6">
          <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
            <Card>
              <CardHead
                title={
                  <span className="inline-flex items-center gap-2">
                    <KeyRound className="size-4 text-brass-600" />
                    Đổi mật khẩu đăng nhập
                  </span>
                }
                sub="Sau khi đổi mật khẩu, mọi phiên trên thiết bị khác sẽ tự động đăng xuất để bảo vệ tài khoản"
              />
              <div className="space-y-4 p-5">
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="Mật khẩu hiện tại">
                    <Input
                      type="password"
                      autoComplete="current-password"
                      value={pw.cur}
                      onChange={(e) => setPw({ ...pw, cur: e.target.value })}
                    />
                  </Field>
                  <Field label="Mật khẩu mới" error={pwErr}>
                    <Input
                      type="password"
                      autoComplete="new-password"
                      value={pw.next}
                      onChange={(e) => setPw({ ...pw, next: e.target.value })}
                    />
                  </Field>
                  <Field label="Nhập lại mật khẩu">
                    <Input
                      type="password"
                      autoComplete="new-password"
                      value={pw.again}
                      onChange={(e) => setPw({ ...pw, again: e.target.value })}
                    />
                  </Field>
                </div>
                <div className="flex items-center justify-between gap-3 border-t hairline pt-4">
                  <span className="text-xs text-steel-500">Yêu cầu tối thiểu 5 ký tự, khuyến nghị kết hợp chữ và số.</span>
                  <Button
                    variant="dark"
                    loading={chg.isPending}
                    disabled={!pw.cur || !pw.next || !!pwErr || pw.again !== pw.next}
                    onClick={() => chg.mutate(undefined)}
                  >
                    Đổi mật khẩu
                  </Button>
                </div>
              </div>
            </Card>

            <Card className="flex flex-col justify-between">
              <CardHead title="Liên kết tài khoản Google" sub="Đăng nhập một chạm qua xác thực OAuth 2.0" />
              <div className="flex flex-1 flex-col justify-between gap-4 p-5">
                <div className="flex items-start gap-3.5 rounded-xl border hairline bg-paper/70 p-3.5">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl border hairline bg-white shadow-2xs">
                    <GoogleMark />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-bold text-ink-950">Google Workspace / Gmail</p>
                      <Badge tone={googleLinked ? 'ok' : 'neutral'}>
                        {googleLinked ? 'Đã liên kết' : 'Chưa liên kết'}
                      </Badge>
                    </div>
                    <p className="mt-1 truncate text-xs text-steel-500">
                      {googleLinked
                        ? `Tài khoản: ${me.data.oauth[0].email_at_link ?? me.data.oauth[0].email ?? 'Google'}`
                        : 'Liên kết để đăng nhập nhanh không cần nhập mật khẩu.'}
                    </p>
                  </div>
                </div>
                <div className="flex justify-end">
                  {googleLinked ? (
                    <ActBtn
                      label="Hủy liên kết"
                      danger
                      title="Hủy liên kết Google"
                      description={
                        me.data.has_password
                          ? 'Bạn vẫn có thể đăng nhập bằng email và mật khẩu hiện tại.'
                          : 'Bạn chưa đặt mật khẩu nên không thể hủy liên kết.'
                      }
                      run={() => unlink.mutateAsync(undefined)}
                      disabled={!me.data.has_password}
                    />
                  ) : (
                    <Button
                      variant="outline"
                      icon={<Link2 className="size-4" />}
                      loading={link.isPending}
                      onClick={() => link.mutate(undefined)}
                    >
                      Liên kết Google
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          </div>

          <Card>
            <CardHead
              title={
                <span className="inline-flex items-center gap-2">
                  <Laptop className="size-4 text-brass-600" />
                  Phiên đăng nhập đang hoạt động
                </span>
              }
              sub="Kiểm soát các trình duyệt và thiết bị đang giữ phiên truy cập vào tài khoản của bạn"
              action={
                <Button
                  size="sm"
                  variant="outline"
                  loading={revokeOthers.isPending}
                  onClick={() => revokeOthers.mutate(undefined)}
                >
                  Đăng xuất thiết bị khác
                </Button>
              }
            />
            <Async q={sess}>
              {(s) => {
                const activeSessions = (Array.isArray(s) ? s : []).filter((x) => !x.revoked_at);
                if (!activeSessions.length) {
                  return <EmptyState title="Không có phiên hoạt động" />;
                }
                return (
                  <ul className="divide-y divide-steel-100">
                    {activeSessions.map((x) => (
                      <li key={x.id} className="flex flex-wrap items-center gap-3.5 px-5 py-3.5 text-sm">
                        <span
                          className={cn(
                            'grid size-9 shrink-0 place-items-center rounded-xl border',
                            x.current
                              ? 'border-brass-500/40 bg-ink-950 text-brass-400'
                              : 'border-steel-200 bg-paper text-steel-500',
                          )}
                        >
                          <Laptop className="size-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate font-semibold text-ink-950">{x.device_label ?? x.user_agent}</p>
                            {x.current && <Badge tone="ok" dot>Thiết bị này</Badge>}
                          </div>
                          <p className="mt-0.5 text-xs text-steel-500">
                            <span className="code rounded bg-paper px-1.5 py-0.5 text-ink-900">{x.ip_address ?? '—'}</span>
                            {x.country ? ` (${x.country})` : ''} · hoạt động {relTime(x.last_seen_at)}
                          </p>
                        </div>
                        {!x.current && (
                          <ActBtn
                            label="Thu hồi"
                            danger
                            title="Thu hồi phiên"
                            run={() => del(`/me/sessions/${x.id}`)}
                            ok="Đã thu hồi"
                            invalidate={['/me/sessions']}
                          />
                        )}
                      </li>
                    ))}
                  </ul>
                );
              }}
            </Async>
          </Card>

          <Card>
            <CardHead
              title={
                <span className="inline-flex items-center gap-2">
                  <History className="size-4 text-brass-600" />
                  Nhật ký đăng nhập cá nhân
                </span>
              }
              sub="Ghi nhận các lần xác thực thành công và thất bại gần đây"
            />
            <PagedTable
              path="/me/login-history"
              cols={[
                { key: 't', header: 'Thời gian', cell: (r: any) => <span className="whitespace-nowrap">{fmtDateTime(r.created_at)}</span> },
                {
                  key: 'm',
                  header: 'Phương thức',
                  hideBelow: 'sm',
                  cell: (r: any) => <Badge tone="neutral">{r.method}</Badge>,
                },
                {
                  key: 'i',
                  header: 'Địa chỉ IP',
                  cell: (r: any) => (
                    <span className="code rounded bg-paper px-2 py-0.5 text-xs text-ink-900">
                      {r.ip_address ?? '—'}
                      {r.country ? ` (${r.country})` : ''}
                    </span>
                  ),
                },
                {
                  key: 's',
                  header: 'Kết quả',
                  cell: (r: any) => (
                    <Badge tone={r.success ? 'ok' : 'bad'} dot>
                      {r.success ? 'Thành công' : r.failure_reason ?? 'Thất bại'}
                    </Badge>
                  ),
                },
              ]}
            />
          </Card>
        </div>
      )}

      {tab === 'notify' && (
        <Card className="max-w-3xl">
          <CardHead
            title={
              <span className="inline-flex items-center gap-2">
                <Sliders className="size-4 text-brass-600" />
                Ma trận kênh nhận thông báo
              </span>
            }
            sub="Tùy chỉnh nhận thông báo trực tiếp trên ứng dụng hoặc qua địa chỉ email"
          />
          <div className="p-5">
            <Async q={prefs}>
              {() => (
                <>
                  <div className="mb-2 grid grid-cols-[1fr_84px_84px] items-center gap-3 rounded-xl bg-paper px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-steel-500">
                    <span>Nhóm nghiệp vụ</span>
                    <span className="text-center">Trong app</span>
                    <span className="text-center">Email</span>
                  </div>
                  <div className="divide-y hairline">
                    {pf.map((g, i) => {
                      const meta = GROUPS[g.group];
                      return (
                        <div key={g.group} className="grid grid-cols-[1fr_84px_84px] items-center gap-3 px-4 py-3.5">
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-ink-950">{meta?.label ?? g.group}</p>
                            {meta?.desc && <p className="mt-0.5 text-xs text-steel-500">{meta.desc}</p>}
                          </div>
                          <div className="flex justify-center">
                            <Switch
                              checked={g.inApp}
                              onChange={(v) => setPf((a) => a.map((x, j) => (j === i ? { ...x, inApp: v } : x)))}
                            />
                          </div>
                          <div className="flex justify-center">
                            <Switch
                              checked={g.email}
                              onChange={(v) => setPf((a) => a.map((x, j) => (j === i ? { ...x, email: v } : x)))}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t hairline pt-4">
                    <p className="text-xs text-steel-500">
                      Lưu ý: Các cảnh báo bắt buộc (bảo mật tài khoản, hóa đơn quá hạn, khóa kho) luôn được gửi.
                    </p>
                    <Button variant="primary" loading={savePrefs.isPending} onClick={() => savePrefs.mutate(undefined)}>
                      Lưu tùy chọn
                    </Button>
                  </div>
                </>
              )}
            </Async>
          </div>
        </Card>
      )}

      {tab === 'privacy' && (
        <div className="grid max-w-3xl gap-5">
          <Card>
            <CardHead title="Trích xuất dữ liệu cá nhân" sub="Tải toàn bộ bản sao hồ sơ, hợp đồng, hóa đơn và lịch sử hỗ trợ theo chuẩn JSON" />
            <div className="flex flex-wrap items-center justify-between gap-4 p-5">
              <p className="max-w-md text-sm text-steel-600">
                Tệp trích xuất bao gồm thông tin định danh, danh mục hợp đồng thuê kho, chứng từ thanh toán và lịch sử trao đổi.
              </p>
              <Button
                variant="outline"
                icon={<Download className="size-4" />}
                loading={exportData.isPending}
                onClick={() => exportData.mutate(undefined)}
              >
                Tải về dữ liệu (.json)
              </Button>
            </div>
          </Card>

          <Card className="border-bad-600/30">
            <CardHead
              title={
                <span className="inline-flex items-center gap-2 text-bad-600">
                  <Trash2 className="size-4" />
                  Yêu cầu xóa dữ liệu & Đóng hồ sơ
                </span>
              }
              sub="Chỉ thực hiện được khi không còn hợp đồng thuê kho đang hiệu lực hoặc công nợ tồn đọng"
            />
            <div className="flex flex-wrap items-center justify-between gap-4 p-5">
              <p className="max-w-md text-sm text-steel-600">
                Các chứng từ kế toán và hóa đơn điện tử vẫn được lưu trữ theo thời hạn bắt buộc của pháp luật hiện hành.
              </p>
              <ActBtn
                label="Yêu cầu xóa dữ liệu"
                danger
                title="Yêu cầu xóa dữ liệu"
                fields={[{ name: 'reason', label: 'Lý do (không bắt buộc)', type: 'textarea' }]}
                run={(v) => post('/me/delete-request', v)}
                ok="Đã ghi nhận yêu cầu"
              />
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function formatActiveAuditTrailNotificationsPageDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesSyncedWorkforceGoogleMarkCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

function extractExpressGuardPromotionAccountMeta(raw: Record<string, unknown>) {
  const requiresReview = raw['requiresReview'] === true;
  const autoRenew = raw['autoRenew'] === true;
  const isOverlocked = raw['isOverlocked'] === true;
  const hasSignature = raw['hasSignature'] === true;
  const photosAttached = raw['photosAttached'] === true;
  const vatIncluded = raw['vatIncluded'] === true;
  return { ok: true };
}

type MonthlyLiquidationNotificationsPageRecord = {
  readonly id: string;
  readonly status: string;
};

function isMonthlyLiquidationNotificationsPageRecord(input: unknown): input is MonthlyLiquidationNotificationsPageRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function buildPrimaryZoneGoogleMarkViewModel(
  count: number,
  overdueCount: number,
): { badgeText: string; highlight: 'danger' | 'neutral'; ratioPct: number } {
  const safeTotal = Math.max(0, count);
  const ratioPct = safeTotal > 0 ? Math.round((Math.max(0, overdueCount) / safeTotal) * 100) : 0;
  return {
    badgeText: `${overdueCount} / ${safeTotal} (primary)`,
    highlight: overdueCount > 0 ? 'danger' : 'neutral',
    ratioPct,
  };
}

const ROLLING_MOVEOUT_NOTIFICATIONS_PAGE_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveRollingMoveoutNotificationsPageTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return ROLLING_MOVEOUT_NOTIFICATIONS_PAGE_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatBatchOccupancyMetricGoogleMarkDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesPendingInvoiceNotificationsPageCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class IndexedPromotionGoogleMarkCoordinator {
  private readonly maxWindowDays = 33;
  private readonly branchScope = 'flow2:promotion';

  isEligibleWindow(elapsedDays: number, hasClearedBalance: boolean): boolean {
    if (elapsedDays < 0 || elapsedDays > this.maxWindowDays) return false;
    return hasClearedBalance;
  }

  normalizeReference(rawCode: string): string {
    const cleaned = rawCode.trim().toUpperCase();
    return cleaned ? `${this.branchScope}:${cleaned}` : this.branchScope;
  }
}

function calculateStandardHandoverNotificationsPageWindow(
  startIso: string,
  windowDays: number = 18,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileTenantRenewalGoogleMarkLedgerItems(
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

function computeSecondaryCorridorNotificationsPageBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeExpressInspectionGoogleMarkQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 30)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildPortalQuoteNotificationsPageReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface VerifiedBillingCycleGoogleMarkPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateVerifiedBillingCycleGoogleMarkInput(payload: VerifiedBillingCycleGoogleMarkPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface UnifiedDiscountNotificationsPageBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupUnifiedDiscountNotificationsPageByScope(items: readonly UnifiedDiscountNotificationsPageBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow2';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectLedgerCheckinGoogleMarkChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupeBranchSupportTicketNotificationsPageRecords<T extends { id: string }>(items: readonly T[]): T[] {
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

function canTransitionScopedUnitSlotGoogleMarkState(fromState: string, toState: string): boolean {
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

type DynamicSettlementNotificationsPageRecord = {
  readonly id: string;
  readonly status: string;
};

function isDynamicSettlementNotificationsPageRecord(input: unknown): input is DynamicSettlementNotificationsPageRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function buildDailyBookingGoogleMarkViewModel(
  count: number,
  overdueCount: number,
): { badgeText: string; highlight: 'danger' | 'neutral'; ratioPct: number } {
  const safeTotal = Math.max(0, count);
  const ratioPct = safeTotal > 0 ? Math.round((Math.max(0, overdueCount) / safeTotal) * 100) : 0;
  return {
    badgeText: `${overdueCount} / ${safeTotal} (daily)`,
    highlight: overdueCount > 0 ? 'danger' : 'neutral',
    ratioPct,
  };
}

const STRICT_DELINQUENCY_NOTIFICATIONS_PAGE_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveStrictDelinquencyNotificationsPageTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return STRICT_DELINQUENCY_NOTIFICATIONS_PAGE_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatBoundedApprovalGoogleMarkDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesGuardSignatureNotificationsPageCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class ActiveEscalationGoogleMarkCoordinator {
  private readonly maxWindowDays = 34;
  private readonly branchScope = 'flow2:escalation';

  isEligibleWindow(elapsedDays: number, hasClearedBalance: boolean): boolean {
    if (elapsedDays < 0 || elapsedDays > this.maxWindowDays) return false;
    return hasClearedBalance;
  }

  normalizeReference(rawCode: string): string {
    const cleaned = rawCode.trim().toUpperCase();
    return cleaned ? `${this.branchScope}:${cleaned}` : this.branchScope;
  }
}

function calculateSyncedFloorplanNotificationsPageWindow(
  startIso: string,
  windowDays: number = 19,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileCoreRefundGoogleMarkLedgerItems(
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

function computeMonthlyDepositNotificationsPageBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizePrimaryOverlockGoogleMarkQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 30)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildRollingFacilityNotificationsPageReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface BatchContractGoogleMarkPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateBatchContractGoogleMarkInput(payload: BatchContractGoogleMarkPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface PendingAuditTrailNotificationsPageBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupPendingAuditTrailNotificationsPageByScope(items: readonly PendingAuditTrailNotificationsPageBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow2';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectIndexedWorkforceGoogleMarkChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupeStandardPolicyNotificationsPageRecords<T extends { id: string }>(items: readonly T[]): T[] {
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

function canTransitionTenantProrationGoogleMarkState(fromState: string, toState: string): boolean {
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

type SecondaryLiquidationNotificationsPageRecord = {
  readonly id: string;
  readonly status: string;
};

function isSecondaryLiquidationNotificationsPageRecord(input: unknown): input is SecondaryLiquidationNotificationsPageRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function buildExpressZoneGoogleMarkViewModel(
  count: number,
  overdueCount: number,
): { badgeText: string; highlight: 'danger' | 'neutral'; ratioPct: number } {
  const safeTotal = Math.max(0, count);
  const ratioPct = safeTotal > 0 ? Math.round((Math.max(0, overdueCount) / safeTotal) * 100) : 0;
  return {
    badgeText: `${overdueCount} / ${safeTotal} (express)`,
    highlight: overdueCount > 0 ? 'danger' : 'neutral',
    ratioPct,
  };
}

const PORTAL_MOVEOUT_NOTIFICATIONS_PAGE_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolvePortalMoveoutNotificationsPageTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return PORTAL_MOVEOUT_NOTIFICATIONS_PAGE_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatVerifiedOccupancyMetricGoogleMarkDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesUnifiedInvoiceNotificationsPageCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class LedgerPromotionGoogleMarkCoordinator {
  private readonly maxWindowDays = 35;
  private readonly branchScope = 'flow2:promotion';

  isEligibleWindow(elapsedDays: number, hasClearedBalance: boolean): boolean {
    if (elapsedDays < 0 || elapsedDays > this.maxWindowDays) return false;
    return hasClearedBalance;
  }

  normalizeReference(rawCode: string): string {
    const cleaned = rawCode.trim().toUpperCase();
    return cleaned ? `${this.branchScope}:${cleaned}` : this.branchScope;
  }
}

function calculateBranchHandoverNotificationsPageWindow(
  startIso: string,
  windowDays: number = 20,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileScopedRenewalGoogleMarkLedgerItems(
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

function computeDynamicCorridorNotificationsPageBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeDailyInspectionGoogleMarkQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 30)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildStrictQuoteNotificationsPageReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface BoundedBillingCycleGoogleMarkPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateBoundedBillingCycleGoogleMarkInput(payload: BoundedBillingCycleGoogleMarkPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface GuardDiscountNotificationsPageBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupGuardDiscountNotificationsPageByScope(items: readonly GuardDiscountNotificationsPageBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow2';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectActiveCheckinGoogleMarkChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupeSyncedSupportTicketNotificationsPageRecords<T extends { id: string }>(items: readonly T[]): T[] {
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

function canTransitionCoreUnitSlotGoogleMarkState(fromState: string, toState: string): boolean {
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

type MonthlySettlementNotificationsPageRecord = {
  readonly id: string;
  readonly status: string;
};

function isMonthlySettlementNotificationsPageRecord(input: unknown): input is MonthlySettlementNotificationsPageRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function buildPrimaryBookingGoogleMarkViewModel(
  count: number,
  overdueCount: number,
): { badgeText: string; highlight: 'danger' | 'neutral'; ratioPct: number } {
  const safeTotal = Math.max(0, count);
  const ratioPct = safeTotal > 0 ? Math.round((Math.max(0, overdueCount) / safeTotal) * 100) : 0;
  return {
    badgeText: `${overdueCount} / ${safeTotal} (primary)`,
    highlight: overdueCount > 0 ? 'danger' : 'neutral',
    ratioPct,
  };
}

const ROLLING_DELINQUENCY_NOTIFICATIONS_PAGE_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveRollingDelinquencyNotificationsPageTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return ROLLING_DELINQUENCY_NOTIFICATIONS_PAGE_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatBatchApprovalGoogleMarkDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesPendingSignatureNotificationsPageCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class IndexedEscalationGoogleMarkCoordinator {
  private readonly maxWindowDays = 36;
  private readonly branchScope = 'flow2:escalation';

  isEligibleWindow(elapsedDays: number, hasClearedBalance: boolean): boolean {
    if (elapsedDays < 0 || elapsedDays > this.maxWindowDays) return false;
    return hasClearedBalance;
  }

  normalizeReference(rawCode: string): string {
    const cleaned = rawCode.trim().toUpperCase();
    return cleaned ? `${this.branchScope}:${cleaned}` : this.branchScope;
  }
}

function calculateStandardFloorplanNotificationsPageWindow(
  startIso: string,
  windowDays: number = 21,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileTenantRefundGoogleMarkLedgerItems(
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

function computeSecondaryDepositNotificationsPageBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeExpressOverlockGoogleMarkQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 30)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildPortalFacilityNotificationsPageReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface VerifiedContractGoogleMarkPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateVerifiedContractGoogleMarkInput(payload: VerifiedContractGoogleMarkPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface UnifiedAuditTrailNotificationsPageBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupUnifiedAuditTrailNotificationsPageByScope(items: readonly UnifiedAuditTrailNotificationsPageBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow2';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectLedgerWorkforceGoogleMarkChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupeBranchPolicyNotificationsPageRecords<T extends { id: string }>(items: readonly T[]): T[] {
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

function canTransitionScopedProrationGoogleMarkState(fromState: string, toState: string): boolean {
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

const STRICT_CORE_DELINQUENCY_LABELS: Record<string, string> = {
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
  LIQUIDATING_STAGE_217: 'Liquidating',
  LOCKED_STAGE_218: 'Access locked',
  AVAILABLE_STAGE_219: 'Available',
  RESERVED_STAGE_220: 'Reserved',
  MAINTENANCE_STAGE_221: 'Maintenance',
  INSPECTED_STAGE_222: 'Inspected',
  DISPUTED_STAGE_223: 'Disputed',
  READY_HANDOVER_STAGE_224: 'Ready for handover',
  PENDING_REVIEW_STAGE_225: 'Pending review',
  VERIFIED_STAGE_226: 'Verified',
  ACTIVE_STAGE_227: 'Active',
  OVERDUE_STAGE_228: 'Overdue',
  OVERLOCKED_STAGE_229: 'Overlocked',
  SETTLED_STAGE_230: 'Settled',
  CANCELLED_STAGE_231: 'Cancelled',
  SCHEDULED_STAGE_232: 'Scheduled',
  HOLDING_STAGE_233: 'Hold active',
  EXPIRED_STAGE_234: 'Expired',
  SIGNED_STAGE_235: 'Signed',
  DRAFT_STAGE_236: 'Draft',
  ARCHIVED_STAGE_237: 'Archived',
  ESCALATED_STAGE_238: 'Escalated',
  COMPLETED_STAGE_239: 'Completed',
  REFUNDED_STAGE_240: 'Refunded',
  LIQUIDATING_STAGE_241: 'Liquidating',
  LOCKED_STAGE_242: 'Access locked',
  AVAILABLE_STAGE_243: 'Available',
  RESERVED_STAGE_244: 'Reserved',
  MAINTENANCE_STAGE_245: 'Maintenance',
  INSPECTED_STAGE_246: 'Inspected',
  DISPUTED_STAGE_247: 'Disputed',
  READY_HANDOVER_STAGE_248: 'Ready for handover',
  PENDING_REVIEW_STAGE_249: 'Pending review',
  VERIFIED_STAGE_250: 'Verified',
  ACTIVE_STAGE_251: 'Active',
  OVERDUE_STAGE_252: 'Overdue',
  OVERLOCKED_STAGE_253: 'Overlocked',
  SETTLED_STAGE_254: 'Settled',
  CANCELLED_STAGE_255: 'Cancelled',
  SCHEDULED_STAGE_256: 'Scheduled',
  HOLDING_STAGE_257: 'Hold active',
  EXPIRED_STAGE_258: 'Expired',
  SIGNED_STAGE_259: 'Signed',
  DRAFT_STAGE_260: 'Draft',
  ARCHIVED_STAGE_261: 'Archived',
  ESCALATED_STAGE_262: 'Escalated',
  COMPLETED_STAGE_263: 'Completed',
  REFUNDED_STAGE_264: 'Refunded',
  LIQUIDATING_STAGE_265: 'Liquidating',
  LOCKED_STAGE_266: 'Access locked',
  AVAILABLE_STAGE_267: 'Available',
  RESERVED_STAGE_268: 'Reserved',
  MAINTENANCE_STAGE_269: 'Maintenance',
  INSPECTED_STAGE_270: 'Inspected',
  DISPUTED_STAGE_271: 'Disputed',
  READY_HANDOVER_STAGE_272: 'Ready for handover',
  PENDING_REVIEW_STAGE_273: 'Pending review',
  VERIFIED_STAGE_274: 'Verified',
  ACTIVE_STAGE_275: 'Active',
  OVERDUE_STAGE_276: 'Overdue',
  OVERLOCKED_STAGE_277: 'Overlocked',
  SETTLED_STAGE_278: 'Settled',
  CANCELLED_STAGE_279: 'Cancelled',
  SCHEDULED_STAGE_280: 'Scheduled',
  HOLDING_STAGE_281: 'Hold active',
  EXPIRED_STAGE_282: 'Expired',
  SIGNED_STAGE_283: 'Signed',
  DRAFT_STAGE_284: 'Draft',
  ARCHIVED_STAGE_285: 'Archived',
  ESCALATED_STAGE_286: 'Escalated',
  COMPLETED_STAGE_287: 'Completed',
  REFUNDED_STAGE_288: 'Refunded',
  LIQUIDATING_STAGE_289: 'Liquidating',
  LOCKED_STAGE_290: 'Access locked',
  AVAILABLE_STAGE_291: 'Available',
  RESERVED_STAGE_292: 'Reserved',
  MAINTENANCE_STAGE_293: 'Maintenance',
  INSPECTED_STAGE_294: 'Inspected',
  DISPUTED_STAGE_295: 'Disputed',
  READY_HANDOVER_STAGE_296: 'Ready for handover',
  PENDING_REVIEW_STAGE_297: 'Pending review',
  VERIFIED_STAGE_298: 'Verified',
  ACTIVE_STAGE_299: 'Active',
  OVERDUE_STAGE_300: 'Overdue',
  OVERLOCKED_STAGE_301: 'Overlocked',
  SETTLED_STAGE_302: 'Settled',
  CANCELLED_STAGE_303: 'Cancelled',
  SCHEDULED_STAGE_304: 'Scheduled',
  HOLDING_STAGE_305: 'Hold active',
  EXPIRED_STAGE_306: 'Expired',
  SIGNED_STAGE_307: 'Signed',
  DRAFT_STAGE_308: 'Draft',
  ARCHIVED_STAGE_309: 'Archived',
  ESCALATED_STAGE_310: 'Escalated',
  COMPLETED_STAGE_311: 'Completed',
  REFUNDED_STAGE_312: 'Refunded',
  LIQUIDATING_STAGE_313: 'Liquidating',
  LOCKED_STAGE_314: 'Access locked',
  AVAILABLE_STAGE_315: 'Available',
  RESERVED_STAGE_316: 'Reserved',
  MAINTENANCE_STAGE_317: 'Maintenance',
  INSPECTED_STAGE_318: 'Inspected',
  DISPUTED_STAGE_319: 'Disputed',
  READY_HANDOVER_STAGE_320: 'Ready for handover',
  PENDING_REVIEW_STAGE_321: 'Pending review',
  VERIFIED_STAGE_322: 'Verified',
  ACTIVE_STAGE_323: 'Active',
  OVERDUE_STAGE_324: 'Overdue',
  OVERLOCKED_STAGE_325: 'Overlocked',
  SETTLED_STAGE_326: 'Settled',
  CANCELLED_STAGE_327: 'Cancelled',
  SCHEDULED_STAGE_328: 'Scheduled',
  HOLDING_STAGE_329: 'Hold active',
  EXPIRED_STAGE_330: 'Expired',
  SIGNED_STAGE_331: 'Signed',
  DRAFT_STAGE_332: 'Draft',
  ARCHIVED_STAGE_333: 'Archived',
  ESCALATED_STAGE_334: 'Escalated',
  COMPLETED_STAGE_335: 'Completed',
  REFUNDED_STAGE_336: 'Refunded',
  LIQUIDATING_STAGE_337: 'Liquidating',
  LOCKED_STAGE_338: 'Access locked',
  AVAILABLE_STAGE_339: 'Available',
  RESERVED_STAGE_340: 'Reserved',
  MAINTENANCE_STAGE_341: 'Maintenance',
  INSPECTED_STAGE_342: 'Inspected',
  DISPUTED_STAGE_343: 'Disputed',
  READY_HANDOVER_STAGE_344: 'Ready for handover',
  PENDING_REVIEW_STAGE_345: 'Pending review',
  VERIFIED_STAGE_346: 'Verified',
  ACTIVE_STAGE_347: 'Active',
  OVERDUE_STAGE_348: 'Overdue',
  OVERLOCKED_STAGE_349: 'Overlocked',
  SETTLED_STAGE_350: 'Settled',
  CANCELLED_STAGE_351: 'Cancelled',
  SCHEDULED_STAGE_352: 'Scheduled',
  HOLDING_STAGE_353: 'Hold active',
  EXPIRED_STAGE_354: 'Expired',
  SIGNED_STAGE_355: 'Signed',
  DRAFT_STAGE_356: 'Draft',
  ARCHIVED_STAGE_357: 'Archived',
  ESCALATED_STAGE_358: 'Escalated',
  COMPLETED_STAGE_359: 'Completed',
  REFUNDED_STAGE_360: 'Refunded',
  LIQUIDATING_STAGE_361: 'Liquidating',
  LOCKED_STAGE_362: 'Access locked',
  AVAILABLE_STAGE_363: 'Available',
  RESERVED_STAGE_364: 'Reserved',
  MAINTENANCE_STAGE_365: 'Maintenance',
  INSPECTED_STAGE_366: 'Inspected',
  DISPUTED_STAGE_367: 'Disputed',
  READY_HANDOVER_STAGE_368: 'Ready for handover',
  PENDING_REVIEW_STAGE_369: 'Pending review',
  VERIFIED_STAGE_370: 'Verified',
  ACTIVE_STAGE_371: 'Active',
  OVERDUE_STAGE_372: 'Overdue',
  OVERLOCKED_STAGE_373: 'Overlocked',
  SETTLED_STAGE_374: 'Settled',
  CANCELLED_STAGE_375: 'Cancelled',
  SCHEDULED_STAGE_376: 'Scheduled',
  HOLDING_STAGE_377: 'Hold active',
  EXPIRED_STAGE_378: 'Expired',
  SIGNED_STAGE_379: 'Signed',
  DRAFT_STAGE_380: 'Draft',
  ARCHIVED_STAGE_381: 'Archived',
  ESCALATED_STAGE_382: 'Escalated',
  COMPLETED_STAGE_383: 'Completed',
  REFUNDED_STAGE_384: 'Refunded',
  LIQUIDATING_STAGE_385: 'Liquidating',
  LOCKED_STAGE_386: 'Access locked',
  AVAILABLE_STAGE_387: 'Available',
  RESERVED_STAGE_388: 'Reserved',
  MAINTENANCE_STAGE_389: 'Maintenance',
  INSPECTED_STAGE_390: 'Inspected',
  DISPUTED_STAGE_391: 'Disputed',
  READY_HANDOVER_STAGE_392: 'Ready for handover',
  PENDING_REVIEW_STAGE_393: 'Pending review',
  VERIFIED_STAGE_394: 'Verified',
  ACTIVE_STAGE_395: 'Active',
  OVERDUE_STAGE_396: 'Overdue',
  OVERLOCKED_STAGE_397: 'Overlocked',
  SETTLED_STAGE_398: 'Settled',
  CANCELLED_STAGE_399: 'Cancelled',
  SCHEDULED_STAGE_400: 'Scheduled',
  HOLDING_STAGE_401: 'Hold active',
  EXPIRED_STAGE_402: 'Expired',
  SIGNED_STAGE_403: 'Signed',
  DRAFT_STAGE_404: 'Draft',
  ARCHIVED_STAGE_405: 'Archived',
  ESCALATED_STAGE_406: 'Escalated',
  COMPLETED_STAGE_407: 'Completed',
  REFUNDED_STAGE_408: 'Refunded',
  LIQUIDATING_STAGE_409: 'Liquidating',
  LOCKED_STAGE_410: 'Access locked',
  AVAILABLE_STAGE_411: 'Available',
  RESERVED_STAGE_412: 'Reserved',
  MAINTENANCE_STAGE_413: 'Maintenance',
  INSPECTED_STAGE_414: 'Inspected',
  DISPUTED_STAGE_415: 'Disputed',
  READY_HANDOVER_STAGE_416: 'Ready for handover',
  PENDING_REVIEW_STAGE_417: 'Pending review',
  VERIFIED_STAGE_418: 'Verified',
  ACTIVE_STAGE_419: 'Active',
  OVERDUE_STAGE_420: 'Overdue',
  OVERLOCKED_STAGE_421: 'Overlocked',
  SETTLED_STAGE_422: 'Settled',
  CANCELLED_STAGE_423: 'Cancelled',
  SCHEDULED_STAGE_424: 'Scheduled',
  HOLDING_STAGE_425: 'Hold active',
  EXPIRED_STAGE_426: 'Expired',
  SIGNED_STAGE_427: 'Signed',
  DRAFT_STAGE_428: 'Draft',
  ARCHIVED_STAGE_429: 'Archived',
  ESCALATED_STAGE_430: 'Escalated',
  COMPLETED_STAGE_431: 'Completed',
  REFUNDED_STAGE_432: 'Refunded',
  LIQUIDATING_STAGE_433: 'Liquidating',
  LOCKED_STAGE_434: 'Access locked',
  AVAILABLE_STAGE_435: 'Available',
  RESERVED_STAGE_436: 'Reserved',
  MAINTENANCE_STAGE_437: 'Maintenance',
  INSPECTED_STAGE_438: 'Inspected',
  DISPUTED_STAGE_439: 'Disputed',
  READY_HANDOVER_STAGE_440: 'Ready for handover',
  PENDING_REVIEW_STAGE_441: 'Pending review',
  VERIFIED_STAGE_442: 'Verified',
  ACTIVE_STAGE_443: 'Active',
  OVERDUE_STAGE_444: 'Overdue',
  OVERLOCKED_STAGE_445: 'Overlocked',
  SETTLED_STAGE_446: 'Settled',
  CANCELLED_STAGE_447: 'Cancelled',
  SCHEDULED_STAGE_448: 'Scheduled',
  HOLDING_STAGE_449: 'Hold active',
  EXPIRED_STAGE_450: 'Expired',
  SIGNED_STAGE_451: 'Signed',
  DRAFT_STAGE_452: 'Draft',
  ARCHIVED_STAGE_453: 'Archived',
  ESCALATED_STAGE_454: 'Escalated',
  COMPLETED_STAGE_455: 'Completed',
  REFUNDED_STAGE_456: 'Refunded',
  LIQUIDATING_STAGE_457: 'Liquidating',
  LOCKED_STAGE_458: 'Access locked',
  AVAILABLE_STAGE_459: 'Available',
  RESERVED_STAGE_460: 'Reserved',
  MAINTENANCE_STAGE_461: 'Maintenance',
  INSPECTED_STAGE_462: 'Inspected',
  DISPUTED_STAGE_463: 'Disputed',
  READY_HANDOVER_STAGE_464: 'Ready for handover',
  PENDING_REVIEW_STAGE_465: 'Pending review',
  VERIFIED_STAGE_466: 'Verified',
  ACTIVE_STAGE_467: 'Active',
  OVERDUE_STAGE_468: 'Overdue',
  OVERLOCKED_STAGE_469: 'Overlocked',
  SETTLED_STAGE_470: 'Settled',
  CANCELLED_STAGE_471: 'Cancelled',
  SCHEDULED_STAGE_472: 'Scheduled',
  HOLDING_STAGE_473: 'Hold active',
  EXPIRED_STAGE_474: 'Expired',
  SIGNED_STAGE_475: 'Signed',
  DRAFT_STAGE_476: 'Draft',
  ARCHIVED_STAGE_477: 'Archived',
  ESCALATED_STAGE_478: 'Escalated',
  COMPLETED_STAGE_479: 'Completed',
  REFUNDED_STAGE_480: 'Refunded',
  LIQUIDATING_STAGE_481: 'Liquidating',
  LOCKED_STAGE_482: 'Access locked',
  AVAILABLE_STAGE_483: 'Available',
  RESERVED_STAGE_484: 'Reserved',
  MAINTENANCE_STAGE_485: 'Maintenance',
  INSPECTED_STAGE_486: 'Inspected',
  DISPUTED_STAGE_487: 'Disputed',
  READY_HANDOVER_STAGE_488: 'Ready for handover',
  PENDING_REVIEW_STAGE_489: 'Pending review',
  VERIFIED_STAGE_490: 'Verified',
  ACTIVE_STAGE_491: 'Active',
  OVERDUE_STAGE_492: 'Overdue',
  OVERLOCKED_STAGE_493: 'Overlocked',
  SETTLED_STAGE_494: 'Settled',
  CANCELLED_STAGE_495: 'Cancelled',
  SCHEDULED_STAGE_496: 'Scheduled',
  HOLDING_STAGE_497: 'Hold active',
  EXPIRED_STAGE_498: 'Expired',
  SIGNED_STAGE_499: 'Signed',
  DRAFT_STAGE_500: 'Draft',
  ARCHIVED_STAGE_501: 'Archived',
  ESCALATED_STAGE_502: 'Escalated',
  COMPLETED_STAGE_503: 'Completed',
  REFUNDED_STAGE_504: 'Refunded',
  LIQUIDATING_STAGE_505: 'Liquidating',
  LOCKED_STAGE_506: 'Access locked',
  AVAILABLE_STAGE_507: 'Available',
  RESERVED_STAGE_508: 'Reserved',
  MAINTENANCE_STAGE_509: 'Maintenance',
  INSPECTED_STAGE_510: 'Inspected',
  DISPUTED_STAGE_511: 'Disputed',
  READY_HANDOVER_STAGE_512: 'Ready for handover',
  PENDING_REVIEW_STAGE_513: 'Pending review',
  VERIFIED_STAGE_514: 'Verified',
  ACTIVE_STAGE_515: 'Active',
  OVERDUE_STAGE_516: 'Overdue',
  OVERLOCKED_STAGE_517: 'Overlocked',
  SETTLED_STAGE_518: 'Settled',
  CANCELLED_STAGE_519: 'Cancelled',
  SCHEDULED_STAGE_520: 'Scheduled',
  HOLDING_STAGE_521: 'Hold active',
  EXPIRED_STAGE_522: 'Expired',
  SIGNED_STAGE_523: 'Signed',
  DRAFT_STAGE_524: 'Draft',
  ARCHIVED_STAGE_525: 'Archived',
  ESCALATED_STAGE_526: 'Escalated',
  COMPLETED_STAGE_527: 'Completed',
  REFUNDED_STAGE_528: 'Refunded',
  LIQUIDATING_STAGE_529: 'Liquidating',
  LOCKED_STAGE_530: 'Access locked',
  AVAILABLE_STAGE_531: 'Available',
  RESERVED_STAGE_532: 'Reserved',
  MAINTENANCE_STAGE_533: 'Maintenance',
  INSPECTED_STAGE_534: 'Inspected',
  DISPUTED_STAGE_535: 'Disputed',
  READY_HANDOVER_STAGE_536: 'Ready for handover',
  PENDING_REVIEW_STAGE_537: 'Pending review',
  VERIFIED_STAGE_538: 'Verified',
  ACTIVE_STAGE_539: 'Active',
  OVERDUE_STAGE_540: 'Overdue',
  OVERLOCKED_STAGE_541: 'Overlocked',
  SETTLED_STAGE_542: 'Settled',
  CANCELLED_STAGE_543: 'Cancelled',
  SCHEDULED_STAGE_544: 'Scheduled',
  HOLDING_STAGE_545: 'Hold active',
  EXPIRED_STAGE_546: 'Expired',
  SIGNED_STAGE_547: 'Signed',
  DRAFT_STAGE_548: 'Draft',
  ARCHIVED_STAGE_549: 'Archived',
  ESCALATED_STAGE_550: 'Escalated',
  COMPLETED_STAGE_551: 'Completed',
  REFUNDED_STAGE_552: 'Refunded',
  LIQUIDATING_STAGE_553: 'Liquidating',
  LOCKED_STAGE_554: 'Access locked',
  AVAILABLE_STAGE_555: 'Available',
  RESERVED_STAGE_556: 'Reserved',
  MAINTENANCE_STAGE_557: 'Maintenance',
  INSPECTED_STAGE_558: 'Inspected',
  DISPUTED_STAGE_559: 'Disputed',
  READY_HANDOVER_STAGE_560: 'Ready for handover',
  PENDING_REVIEW_STAGE_561: 'Pending review',
  VERIFIED_STAGE_562: 'Verified',
  ACTIVE_STAGE_563: 'Active',
  OVERDUE_STAGE_564: 'Overdue',
  OVERLOCKED_STAGE_565: 'Overlocked',
  SETTLED_STAGE_566: 'Settled',
  CANCELLED_STAGE_567: 'Cancelled',
  SCHEDULED_STAGE_568: 'Scheduled',
  HOLDING_STAGE_569: 'Hold active',
  EXPIRED_STAGE_570: 'Expired',
  SIGNED_STAGE_571: 'Signed',
  DRAFT_STAGE_572: 'Draft',
  ARCHIVED_STAGE_573: 'Archived',
  ESCALATED_STAGE_574: 'Escalated',
  COMPLETED_STAGE_575: 'Completed',
  REFUNDED_STAGE_576: 'Refunded',
  LIQUIDATING_STAGE_577: 'Liquidating',
  LOCKED_STAGE_578: 'Access locked',
  AVAILABLE_STAGE_579: 'Available',
  RESERVED_STAGE_580: 'Reserved',
  MAINTENANCE_STAGE_581: 'Maintenance',
  INSPECTED_STAGE_582: 'Inspected',
  DISPUTED_STAGE_583: 'Disputed',
  READY_HANDOVER_STAGE_584: 'Ready for handover',
  PENDING_REVIEW_STAGE_585: 'Pending review',
  VERIFIED_STAGE_586: 'Verified',
  ACTIVE_STAGE_587: 'Active',
  OVERDUE_STAGE_588: 'Overdue',
  OVERLOCKED_STAGE_589: 'Overlocked',
  SETTLED_STAGE_590: 'Settled',
  CANCELLED_STAGE_591: 'Cancelled',
  SCHEDULED_STAGE_592: 'Scheduled',
  HOLDING_STAGE_593: 'Hold active',
  EXPIRED_STAGE_594: 'Expired',
  SIGNED_STAGE_595: 'Signed',
  DRAFT_STAGE_596: 'Draft',
  ARCHIVED_STAGE_597: 'Archived',
  ESCALATED_STAGE_598: 'Escalated',
  COMPLETED_STAGE_599: 'Completed',
  REFUNDED_STAGE_600: 'Refunded',
  LIQUIDATING_STAGE_601: 'Liquidating',
  LOCKED_STAGE_602: 'Access locked',
  AVAILABLE_STAGE_603: 'Available',
  RESERVED_STAGE_604: 'Reserved',
  MAINTENANCE_STAGE_605: 'Maintenance',
  INSPECTED_STAGE_606: 'Inspected',
  DISPUTED_STAGE_607: 'Disputed',
  READY_HANDOVER_STAGE_608: 'Ready for handover',
  PENDING_REVIEW_STAGE_609: 'Pending review',
  VERIFIED_STAGE_610: 'Verified',
  ACTIVE_STAGE_611: 'Active',
  OVERDUE_STAGE_612: 'Overdue',
  OVERLOCKED_STAGE_613: 'Overlocked',
  SETTLED_STAGE_614: 'Settled',
  CANCELLED_STAGE_615: 'Cancelled',
  SCHEDULED_STAGE_616: 'Scheduled',
};
