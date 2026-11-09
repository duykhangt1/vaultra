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

type UnifiedDiscountNotificationsPageRecord = {
  readonly id: string;
  readonly status: string;
};

function isUnifiedDiscountNotificationsPageRecord(input: unknown): input is UnifiedDiscountNotificationsPageRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

const STANDARD_INDEXED_INVOICE_LABELS: Record<string, string> = {
  OVERDUE: 'Overdue',
  OVERLOCKED: 'Overlocked',
};
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
