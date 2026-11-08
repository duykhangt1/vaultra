import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LogOut,
  Download,
  Link2,
  Bell,
  Receipt,
  FileText,
  CalendarClock,
  LifeBuoy,
  KeyRound,
  CheckCheck,
  ShieldCheck,
  CheckCircle2,
  Lock,
  Smartphone,
  UserRound,
  Mail,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  Trash2,
} from 'lucide-react';
import { useGet, useAct } from '@/lib/hooks';
import { post, patch, del } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import {
  Async,
  Card,
  CardHead,
  PagedTable,
  Button,
  Field,
  Input,
  Select,
  Switch,
  Badge,
  Tabs,
  EmptyState,
  Skeleton,
  ErrorState,
  cn,
} from '@/ui';
import { fmtDateTime, relTime, ROLE_LABEL, initials } from '@/lib/format';
import { useI18n, Locale } from '@/lib/i18n';
import { ActBtn } from '../kit';

function getNotificationMeta(n: any): {
  icon: JSX.Element;
  categoryLabel: string;
  badgeCls: string;
} {
  const raw = `${n.event_code ?? ''} ${n.related_type ?? ''} ${n.link ?? ''}`.toLowerCase();
  if (/(invoice|billing|payment|overdue|refund)/.test(raw)) {
    return {
      icon: <Receipt className="size-4" />,
      categoryLabel: 'Tài chính & Hóa đơn',
      badgeCls: 'bg-brass-100/80 text-brass-700 border-brass-500/35',
    };
  }
  if (/(access|pin|lock|security|password)/.test(raw)) {
    return {
      icon: <KeyRound className="size-4" />,
      categoryLabel: 'Truy cập & Bảo mật',
      badgeCls: 'bg-[#091320] text-brass-400 border-brass-500/45',
    };
  }
  if (/(contract|renewal|handover|sign|settlement)/.test(raw)) {
    return {
      icon: <FileText className="size-4" />,
      categoryLabel: 'Hợp đồng & Kho',
      badgeCls: 'bg-paper-2 text-ink-900 border-steel-300',
    };
  }
  if (/(reservation|appointment|move_in|move_out|checkin)/.test(raw)) {
    return {
      icon: <CalendarClock className="size-4" />,
      categoryLabel: 'Đặt chỗ & Lịch hẹn',
      badgeCls: 'bg-info-100 text-info-600 border-info-600/25',
    };
  }
  if (/(ticket|support|sla)/.test(raw)) {
    return {
      icon: <LifeBuoy className="size-4" />,
      categoryLabel: 'Hỗ trợ',
      badgeCls: 'bg-ok-100 text-ok-600 border-ok-600/25',
    };
  }
  return {
    icon: <Bell className="size-4" />,
    categoryLabel: 'Hệ thống',
    badgeCls: 'bg-steel-100 text-steel-600 border-steel-200',
  };
}

export function Notifications() {
  const nav = useNavigate();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);

  useEffect(() => {
    setCursors([undefined]);
  }, [unreadOnly]);

  const cursor = cursors[cursors.length - 1];
  const listQ = useGet<{
    data: any[];
    unread?: number;
    page?: { hasMore: boolean; nextCursor: string | null; total?: number };
  }>(
    '/notifications',
    {
      unread: unreadOnly ? 'true' : undefined,
      'page[size]': 20,
      'page[cursor]': cursor,
    },
    { keepPrevious: true },
  );

  const read = useAct((id: string) => post(`/notifications/${id}/read`), {
    invalidate: ['/notifications'],
    silentError: true,
  });

  const all = useAct(() => post('/notifications/read-all'), {
    ok: 'Đã đánh dấu tất cả thông báo là đã đọc',
    invalidate: ['/notifications'],
  });

  const rows: any[] = Array.isArray(listQ.data)
    ? listQ.data
    : listQ.data?.data ?? [];
  const pg = Array.isArray(listQ.data) ? undefined : listQ.data?.page;
  const unreadCount =
    typeof listQ.data?.unread === 'number'
      ? listQ.data.unread
      : rows.filter((x) => !x.read_at).length;
  const page = cursors.length;

  return (
    <div className="space-y-6">
      {/* Executive Notification Header */}
      <section className="relative overflow-hidden rounded-[var(--radius-media)] border border-brass-500/25 bg-[#091320] p-6 text-white shadow-[var(--shadow-card)] sm:p-7">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brass-500 via-brass-400 to-transparent" />
        <div
          className="blueprint-dark pointer-events-none absolute inset-0 opacity-55"
          aria-hidden
        />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="display text-[28px] text-white sm:text-[34px]">
                Thông báo
              </h1>
              {unreadCount > 0 && (
                <span className="rounded-full border border-brass-400/50 bg-brass-500/20 px-3 py-1 font-mono text-xs font-bold text-brass-400 num">
                  {unreadCount} chưa đọc
                </span>
              )}
            </div>
            <p className="mt-1.5 text-sm text-steel-300">
              Cập nhật về hóa đơn, lịch hẹn nhận/trả kho, hợp đồng điện tử và phản hồi từ bộ phận hỗ trợ.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="glass"
              icon={<CheckCheck className="size-4 text-brass-400" />}
              loading={all.isPending}
              disabled={unreadCount === 0}
              onClick={() => all.mutate(undefined)}
            >
              Đánh dấu tất cả đã đọc
            </Button>
          </div>
        </div>
      </section>

      <Card className="overflow-hidden">
        {/* Filter Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b hairline bg-paper/50 px-5 py-3.5">
          <div className="inline-flex rounded-xl border hairline bg-white p-1">
            <button
              type="button"
              onClick={() => setUnreadOnly(false)}
              className={cn(
                'rounded-lg px-3.5 py-1.5 text-xs font-bold transition',
                !unreadOnly
                  ? 'bg-[#091320] text-brass-400 shadow-xs'
                  : 'text-steel-600 hover:text-ink-950',
              )}
            >
              Tất cả thông báo
            </button>
            <button
              type="button"
              onClick={() => setUnreadOnly(true)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-bold transition',
                unreadOnly
                  ? 'bg-[#091320] text-brass-400 shadow-xs'
                  : 'text-steel-600 hover:text-ink-950',
              )}
            >
              <span className="size-2 rounded-full bg-brass-500" />
              Chưa đọc
              {unreadCount > 0 && <span className="num">({unreadCount})</span>}
            </button>
          </div>

          <span className="text-xs text-steel-500">
            Chạm vào một thông báo để mở trực tiếp nội dung liên quan
          </span>
        </div>

        {/* Categorized Notification Timeline */}
        {listQ.error ? (
          <ErrorState error={listQ.error} onRetry={listQ.refetch} />
        ) : listQ.isLoading ? (
          <div className="divide-y divide-steel-100 p-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-start gap-4 py-4">
                <Skeleton className="size-10 shrink-0 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : rows.length > 0 ? (
          <ol className="divide-y divide-steel-100">
            {rows.map((n: any) => {
              const isUnread = !n.read_at;
              const meta = getNotificationMeta(n);
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => {
                      if (isUnread) read.mutate(n.id);
                      if (n.link) nav(n.link);
                    }}
                    className={cn(
                      'group relative flex w-full items-start gap-4 px-5 py-4 text-left transition',
                      isUnread
                        ? 'bg-brass-100/20 hover:bg-brass-100/35'
                        : 'bg-white hover:bg-paper/60',
                    )}
                  >
                    {isUnread && (
                      <span className="absolute inset-y-0 left-0 w-1 bg-brass-500" />
                    )}

                    <span
                      className={cn(
                        'mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl border transition group-hover:scale-105',
                        meta.badgeCls,
                      )}
                    >
                      {meta.icon}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {isUnread && (
                          <span
                            className="size-2.5 shrink-0 rounded-full bg-brass-500 shadow-[0_0_0_4px_rgb(200_150_62/0.2)]"
                            aria-label="Chưa đọc"
                          />
                        )}
                        <span className="font-mono text-[10.5px] font-bold uppercase tracking-wider text-steel-500">
                          {meta.categoryLabel}
                        </span>
                        {n.priority === 'HIGH' && (
                          <Badge tone="bad">Quan trọng</Badge>
                        )}
                        <span
                          className="ml-auto whitespace-nowrap text-xs text-steel-400 num"
                          title={fmtDateTime(n.created_at)}
                        >
                          {relTime(n.created_at)}
                        </span>
                      </div>

                      <p
                        className={cn(
                          'mt-1 text-sm leading-snug',
                          isUnread
                            ? 'font-extrabold text-ink-950'
                            : 'font-semibold text-ink-900',
                        )}
                      >
                        {n.title}
                      </p>
                      <p className="mt-1 text-[13px] leading-relaxed text-steel-600">
                        {n.body}
                      </p>
                    </div>

                    {n.link && (
                      <ArrowRight className="mt-3 size-4 shrink-0 text-steel-400 transition group-hover:translate-x-0.5 group-hover:text-ink-950" />
                    )}
                  </button>
                </li>
              );
            })}
          </ol>
        ) : (
          <EmptyState
            icon={<Bell className="size-6" />}
            title={
              unreadOnly
                ? 'Bạn đã đọc hết mọi thông báo'
                : 'Chưa có thông báo nào'
            }
            hint="Các thông báo về hóa đơn, hợp đồng và lịch hẹn kho của bạn sẽ hiển thị tại đây."
          />
        )}

        {(page > 1 || pg?.hasMore) && (
          <div className="flex items-center justify-between border-t hairline bg-paper/40 px-5 py-3.5 text-sm text-steel-500">
            <span className="num">
              {pg?.total !== undefined ? `${pg.total} thông báo · ` : ''}Trang{' '}
              {page}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 1 || listQ.isFetching}
                onClick={() => setCursors((c) => c.slice(0, -1))}
                icon={<ChevronLeft className="size-4" />}
              >
                Trước
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!pg?.hasMore || listQ.isFetching}
                onClick={() =>
                  setCursors((c) => [...c, pg?.nextCursor ?? undefined])
                }
              >
                Sau
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

const GROUPS: Record<string, { label: string; desc: string }> = {
  BILLING: {
    label: 'Thanh toán & Hóa đơn',
    desc: 'Nhắc hạn thanh toán, biên nhận điện tử và biến động công nợ',
  },
  CONTRACT: {
    label: 'Hợp đồng thuê kho',
    desc: 'Ký hợp đồng điện tử, bàn giao nhận/trả kho và phụ lục mới',
  },
  RENEWAL: {
    label: 'Gia hạn kỳ thuê',
    desc: 'Thông báo mở cửa sổ gia hạn và xác nhận tự động gia hạn',
  },
  SUPPORT: {
    label: 'Hỗ trợ khách hàng',
    desc: 'Tin nhắn phản hồi từ nhân viên và cập nhật tiến độ xử lý sự cố',
  },
  OPERATIONS: {
    label: 'Vận hành & Lịch hẹn',
    desc: 'Xác nhận lịch hẹn tại quầy, bảo trì cơ sở và an ninh kho',
  },
  MARKETING: {
    label: 'Ưu đãi & Bản tin Vaultra',
    desc: 'Chương trình khuyến mãi kỳ hạn dài và mở rộng cơ sở mới',
  },
};

export function Account() {
  const [tab, setTab] = useState('profile');
  const user = useAuth((s) => s.user);
  const roles = useAuth((s) => s.roles);
  const reload = useAuth((s) => s.reload);
  const logout = useAuth((s) => s.logout);
  const { locale, setLocale } = useI18n();
  const nav = useNavigate();

  const me = useGet<any>('/me');
  const [p, setP] = useState({
    fullName: '',
    phone: '',
    addressLine: '',
    district: '',
    province: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    locale: locale as Locale,
  });

  useEffect(() => {
    if (me.data) {
      setP({
        fullName: me.data.full_name ?? '',
        phone: me.data.phone ?? '',
        addressLine: me.data.customer?.address_line ?? '',
        district: me.data.customer?.district ?? '',
        province: me.data.customer?.province ?? '',
        emergencyContactName: me.data.customer?.emergency_contact_name ?? '',
        emergencyContactPhone: me.data.customer?.emergency_contact_phone ?? '',
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
          ? {
              addressLine: p.addressLine || null,
              district: p.district || null,
              province: p.province || null,
              emergencyContactName: p.emergencyContactName || null,
              emergencyContactPhone: p.emergencyContactPhone || null,
            }
          : {}),
      }),
    {
      ok: 'Đã cập nhật thông tin hồ sơ',
      invalidate: ['/me'],
      onSuccess: () => {
        setLocale(p.locale, false);
        void reload();
      },
    },
  );

  const [pw, setPw] = useState({ cur: '', next: '', again: '' });
  const chg = useAct(
    () =>
      post('/me/password', {
        currentPassword: pw.cur,
        newPassword: pw.next,
      }),
    {
      ok: 'Đã đổi mật khẩu. Các phiên đăng nhập trên thiết bị khác đã được thu hồi.',
      onSuccess: () => setPw({ cur: '', next: '', again: '' }),
    },
  );
  const pwErr =
    pw.next && pw.next.length < 5
      ? 'Tối thiểu 5 ký tự'
      : pw.again && pw.again !== pw.next
        ? 'Mật khẩu nhập lại không khớp'
        : undefined;

  const sess = useGet<any[]>(tab === 'sessions' ? '/me/sessions' : null);
  const prefs = useGet<any[]>(
    tab === 'notify' ? '/me/notification-preferences' : null,
  );
  const [pf, setPf] = useState<any[]>([]);
  useEffect(() => {
    if (Array.isArray(prefs.data)) setPf(prefs.data);
  }, [prefs.data]);

  const savePrefs = useAct(
    () => post('/me/notification-preferences', pf),
    {
      ok: 'Đã lưu tùy chọn thông báo',
      invalidate: ['/me/notification-preferences'],
    },
  );
  const revokeOthers = useAct(() => post('/me/sessions/revoke-others'), {
    ok: 'Đã đăng xuất khỏi các thiết bị khác',
    invalidate: ['/me', '/me/sessions'],
  });
  const exportData = useAct(() => post('/me/data-export'), {
    onSuccess: (d) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(
        new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' }),
      );
      a.download = 'vaultra-du-lieu-cua-toi.json';
      a.click();
    },
  });
  const unlink = useAct(() => del('/me/oauth/google'), {
    ok: 'Đã hủy liên kết tài khoản Google',
    invalidate: ['/me'],
  });
  const link = useAct(
    () =>
      post('/me/oauth/google', {
        origin: typeof window !== 'undefined' ? window.location.origin : undefined,
      }),
    {
      onSuccess: (r) => {
        window.location.href = r.url;
      },
    },
  );

  const displayName = me.data?.full_name || user?.fullName || 'Khách thuê';
  const customerCode = me.data?.customer?.code;
  const emailVerified = Boolean(
    user?.emailVerified || me.data?.email_verified_at,
  );
  const googleLinked = Boolean(me.data?.oauth?.length);
  const googleEmail =
    me.data?.oauth?.[0]?.email_at_link ?? me.data?.oauth?.[0]?.email ?? 'Google';

  return (
    <div className="space-y-6">
      {/* Executive Profile Header Card */}
      <section className="relative overflow-hidden rounded-[var(--radius-media)] border border-brass-500/30 bg-[#091320] p-6 text-white shadow-[var(--shadow-pop)] sm:p-8">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brass-500 via-brass-400 to-transparent" />
        <div
          className="door-lines pointer-events-none absolute inset-0 opacity-30"
          aria-hidden
        />
        <div
          className="blueprint-dark pointer-events-none absolute inset-0 opacity-50"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-brass-500/15 blur-3xl"
          aria-hidden
        />

        <div className="relative flex flex-col justify-between gap-6 md:flex-row md:items-center">
          <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
            {/* Large Monogram Avatar with Brushed-Brass Ring */}
            <div className="grid size-20 shrink-0 place-items-center rounded-full bg-gradient-to-br from-ink-800 to-[#091320] font-display text-2xl font-extrabold tracking-tight text-brass-400 ring-2 ring-brass-400 ring-offset-4 ring-offset-[#091320] shadow-lg">
              {initials(displayName)}
            </div>

            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                {customerCode && (
                  <span className="rounded-lg border border-brass-400/50 bg-brass-500/20 px-2.5 py-0.5 font-mono text-xs font-extrabold tracking-wider text-brass-400">
                    {customerCode}
                  </span>
                )}
                {roles?.map((r) => (
                  <span
                    key={r}
                    className="rounded-lg border border-white/15 bg-white/[0.06] px-2.5 py-0.5 text-xs font-semibold text-steel-200"
                  >
                    {ROLE_LABEL[r] ?? r}
                  </span>
                ))}
              </div>

              <h1 className="display text-2xl text-white sm:text-3xl">
                {displayName}
              </h1>

              <div className="flex flex-wrap items-center gap-2.5 text-xs">
                <span className="inline-flex items-center gap-1.5 text-steel-300">
                  <Mail className="size-3.5 text-brass-400" />
                  {user?.email}
                </span>

                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-semibold',
                    emailVerified
                      ? 'border-brass-400/40 bg-brass-500/15 text-brass-400'
                      : 'border-white/15 bg-white/10 text-steel-300',
                  )}
                >
                  <CheckCircle2 className="size-3.5" />
                  {emailVerified ? 'Đã xác minh Email' : 'Chưa xác minh Email'}
                </span>

                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-semibold',
                    googleLinked
                      ? 'border-white/25 bg-white/12 text-white'
                      : 'border-white/12 bg-white/[0.04] text-steel-400',
                  )}
                >
                  <Link2 className="size-3.5 text-brass-400" />
                  {googleLinked ? 'Đã liên kết Google' : 'Chưa liên kết Google'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
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
      </section>

      {/* Navigation Tabs */}
      <Card className="px-4 pt-1">
        <Tabs
          className="!border-b-0"
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'profile', label: 'Hồ sơ & Bảo mật' },
            { value: 'sessions', label: 'Thiết bị & Lịch sử đăng nhập' },
            { value: 'notify', label: 'Tùy chọn thông báo' },
            ...(user?.customerId
              ? [{ value: 'privacy', label: 'Quyền riêng tư & Dữ liệu' }]
              : []),
          ]}
        />
      </Card>

      {/* Tab 1: Clean 2-Column Personal Info & Security/Password Cards */}
      {tab === 'profile' && (
        <div className="grid items-start gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          {/* Left Column: Personal Info & Contact Address */}
          <Card className="overflow-hidden">
            <CardHead
              title="Thông tin cá nhân & Địa chỉ liên hệ"
              sub="Dữ liệu định danh dùng trên hợp đồng thuê kho điện tử và chứng từ hóa đơn"
              action={<UserRound className="size-4 text-brass-600" />}
            />
            <div className="space-y-4 p-5 sm:p-6">
              <Field label="Địa chỉ Email đăng nhập">
                <Input value={user?.email ?? ''} disabled />
              </Field>

              <Field
                label="Họ và tên đầy đủ"
                required
                error={
                  p.fullName.trim().length < 2
                    ? 'Vui lòng nhập họ tên tối thiểu 2 ký tự'
                    : undefined
                }
              >
                <Input
                  value={p.fullName}
                  onChange={(e) => setP({ ...p, fullName: e.target.value })}
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Số điện thoại di động">
                  <Input
                    value={p.phone}
                    placeholder="09xx xxx xxx"
                    onChange={(e) => setP({ ...p, phone: e.target.value })}
                  />
                </Field>
                <Field label="Ngôn ngữ hiển thị (Language)">
                  <Select
                    value={p.locale}
                    onChange={(e) =>
                      setP({ ...p, locale: e.target.value as Locale })
                    }
                  >
                    <option value="vi">Tiếng Việt (VI)</option>
                    <option value="en">English (EN)</option>
                  </Select>
                </Field>
              </div>

              {user?.customerId && (
                <>
                  <div className="border-t hairline pt-4">
                    <p className="mb-3 text-xs font-bold uppercase tracking-wider text-steel-500">
                      Địa chỉ thường trú / Xuất hóa đơn
                    </p>
                    <div className="space-y-4">
                      <Field label="Số nhà, tên đường, phường/xã">
                        <Input
                          value={p.addressLine}
                          onChange={(e) =>
                            setP({ ...p, addressLine: e.target.value })
                          }
                        />
                      </Field>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Quận / Huyện">
                          <Input
                            value={p.district}
                            onChange={(e) =>
                              setP({ ...p, district: e.target.value })
                            }
                          />
                        </Field>
                        <Field label="Tỉnh / Thành phố">
                          <Input
                            value={p.province}
                            onChange={(e) =>
                              setP({ ...p, province: e.target.value })
                            }
                          />
                        </Field>
                      </div>
                    </div>
                  </div>

                  <div className="border-t hairline pt-4">
                    <p className="mb-3 text-xs font-bold uppercase tracking-wider text-steel-500">
                      Người liên hệ dự phòng (Tùy chọn)
                    </p>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Họ tên người liên hệ">
                        <Input
                          value={p.emergencyContactName}
                          placeholder="Họ và tên…"
                          onChange={(e) =>
                            setP({
                              ...p,
                              emergencyContactName: e.target.value,
                            })
                          }
                        />
                      </Field>
                      <Field label="Số điện thoại dự phòng">
                        <Input
                          value={p.emergencyContactPhone}
                          placeholder="Số điện thoại…"
                          onChange={(e) =>
                            setP({
                              ...p,
                              emergencyContactPhone: e.target.value,
                            })
                          }
                        />
                      </Field>
                    </div>
                  </div>
                </>
              )}

              <div className="pt-2">
                <Button
                  variant="primary"
                  loading={save.isPending}
                  disabled={p.fullName.trim().length < 2}
                  onClick={() => save.mutate(undefined)}
                >
                  Lưu thay đổi hồ sơ
                </Button>
              </div>
            </div>
          </Card>

          {/* Right Column: Security, Password & Google Link Cards */}
          <div className="space-y-6">
            <Card className="overflow-hidden">
              <CardHead
                title="Đổi mật khẩu đăng nhập"
                sub="Tự động thu hồi phiên đăng nhập trên các thiết bị lạ sau khi đổi"
                action={<Lock className="size-4 text-brass-600" />}
              />
              <div className="space-y-4 p-5 sm:p-6">
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
                <Field label="Nhập lại mật khẩu mới">
                  <Input
                    type="password"
                    autoComplete="new-password"
                    value={pw.again}
                    onChange={(e) => setPw({ ...pw, again: e.target.value })}
                  />
                </Field>
                <Button
                  variant="dark"
                  className="w-full sm:w-auto"
                  loading={chg.isPending}
                  disabled={
                    !pw.cur || !pw.next || !!pwErr || pw.again !== pw.next
                  }
                  onClick={() => chg.mutate(undefined)}
                >
                  Cập nhật mật khẩu mới
                </Button>
              </div>
            </Card>

            <Card className="overflow-hidden border-brass-500/30">
              <CardHead
                title="Liên kết đăng nhập Google"
                sub="Đăng nhập nhanh một chạm không cần nhập mật khẩu"
              />
              <div className="flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-ink-950">
                      Tài khoản Google OAuth
                    </span>
                    <Badge tone={googleLinked ? 'ok' : 'neutral'} dot>
                      {googleLinked ? 'Đã liên kết' : 'Chưa liên kết'}
                    </Badge>
                  </div>
                  <p className="mt-1 truncate text-xs text-steel-500">
                    {googleLinked
                      ? `Đang kết nối với ${googleEmail}`
                      : 'Liên kết tài khoản Google cá nhân để tăng tính tiện lợi và bảo mật.'}
                  </p>
                </div>

                {googleLinked ? (
                  <ActBtn
                    label="Hủy liên kết"
                    danger
                    title="Hủy liên kết Google"
                    description={
                      me.data?.has_password
                        ? 'Bạn vẫn có thể đăng nhập bằng Email và mật khẩu hiện tại.'
                        : 'Bạn chưa thiết lập mật khẩu riêng nên chưa thể hủy liên kết Google.'
                    }
                    run={() => unlink.mutateAsync(undefined)}
                    disabled={!me.data?.has_password}
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
            </Card>

            <Card className="bg-paper/60 p-5">
              <div className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#091320] text-brass-400">
                  <ShieldCheck className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-ink-950">
                    Kiểm soát thiết bị đang đăng nhập
                  </p>
                  <p className="mt-0.5 text-xs text-steel-600">
                    Xem danh sách trình duyệt, địa chỉ IP và thu hồi quyền truy cập từ xa bất cứ lúc nào.
                  </p>
                  <button
                    type="button"
                    onClick={() => setTab('sessions')}
                    className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-brass-700 hover:text-ink-950"
                  >
                    Quản lý phiên đăng nhập
                    <ArrowRight className="size-3.5" />
                  </button>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* Tab 2: Active Sessions & Login History */}
      {tab === 'sessions' && (
        <div className="space-y-6">
          <Card className="overflow-hidden">
            <CardHead
              title="Thiết bị đang hoạt động"
              sub="Các phiên đăng nhập hiện có quyền truy cập vào tài khoản lưu trữ của bạn"
              action={
                <Button
                  size="sm"
                  variant="outline"
                  loading={revokeOthers.isPending}
                  onClick={() => revokeOthers.mutate(undefined)}
                >
                  Đăng xuất tất cả thiết bị khác
                </Button>
              }
            />
            <Async q={sess}>
              {(s) => (
                <ul className="divide-y divide-steel-100">
                  {(Array.isArray(s) ? s : [])
                    .filter((x) => !x.revoked_at)
                    .map((x) => (
                      <li
                        key={x.id}
                        className="flex flex-wrap items-center gap-3.5 px-5 py-4 text-sm"
                      >
                        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-paper-2 text-ink-900">
                          <Smartphone className="size-5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-bold text-ink-950">
                              {x.device_label ?? x.user_agent}
                            </p>
                            {x.current && (
                              <Badge tone="ok" dot>
                                Thiết bị hiện tại
                              </Badge>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-steel-500">
                            IP:{' '}
                            <span className="code">
                              {x.ip_address ?? '—'}
                            </span>
                            {x.country ? ` (${x.country})` : ''} · Hoạt động{' '}
                            {relTime(x.last_seen_at)}
                          </p>
                        </div>
                        {!x.current && (
                          <ActBtn
                            label="Thu hồi phiên"
                            danger
                            title="Thu hồi phiên đăng nhập"
                            run={() => del(`/me/sessions/${x.id}`)}
                            ok="Đã thu hồi phiên đăng nhập"
                            invalidate={['/me/sessions']}
                          />
                        )}
                      </li>
                    ))}
                </ul>
              )}
            </Async>
          </Card>

          <Card className="overflow-hidden">
            <CardHead
              title="Nhật ký lịch sử đăng nhập"
              sub="Ghi nhận đầy đủ thời điểm, phương thức và địa chỉ IP đăng nhập"
            />
            <PagedTable
              path="/me/login-history"
              cols={[
                {
                  key: 't',
                  header: 'Thời điểm',
                  cell: (r: any) => (
                    <span className="num">{fmtDateTime(r.created_at)}</span>
                  ),
                },
                {
                  key: 'm',
                  header: 'Phương thức',
                  hideBelow: 'sm',
                  cell: (r: any) => (
                    <Badge tone="neutral">{r.method}</Badge>
                  ),
                },
                {
                  key: 'i',
                  header: 'Địa chỉ IP',
                  cell: (r: any) => (
                    <span className="code">
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
                      {r.success
                        ? 'Thành công'
                        : r.failure_reason ?? 'Thất bại'}
                    </Badge>
                  ),
                },
              ]}
            />
          </Card>
        </div>
      )}

      {/* Tab 3: Notification Preferences */}
      {tab === 'notify' && (
        <Card className="max-w-3xl overflow-hidden">
          <CardHead
            title="Cài đặt kênh nhận thông báo"
            sub="Tùy chỉnh nhận thông báo trên ứng dụng Web và qua Email cho từng nhóm sự kiện"
          />
          <div className="p-5 sm:p-6">
            <Async q={prefs}>
              {() => (
                <>
                  <div className="mb-2 grid grid-cols-[1fr_84px_84px] gap-3 text-xs font-bold uppercase tracking-wider text-steel-500">
                    <span>Nhóm thông báo</span>
                    <span className="text-center">Trong App</span>
                    <span className="text-center">Qua Email</span>
                  </div>
                  <div className="divide-y divide-steel-100">
                    {pf.map((g, i) => {
                      const meta = GROUPS[g.group];
                      return (
                        <div
                          key={g.group}
                          className="grid grid-cols-[1fr_84px_84px] items-center gap-3 py-3.5"
                        >
                          <div>
                            <p className="text-sm font-bold text-ink-950">
                              {meta?.label ?? g.group}
                            </p>
                            {meta?.desc && (
                              <p className="mt-0.5 text-xs text-steel-500">
                                {meta.desc}
                              </p>
                            )}
                          </div>
                          <div className="flex justify-center">
                            <Switch
                              checked={g.inApp}
                              onChange={(v) =>
                                setPf((a) =>
                                  a.map((x, j) =>
                                    j === i ? { ...x, inApp: v } : x,
                                  ),
                                )
                              }
                            />
                          </div>
                          <div className="flex justify-center">
                            <Switch
                              checked={g.email}
                              onChange={(v) =>
                                setPf((a) =>
                                  a.map((x, j) =>
                                    j === i ? { ...x, email: v } : x,
                                  ),
                                )
                              }
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="mt-4 rounded-xl bg-paper px-4 py-3 text-xs text-steel-600">
                    Lưu ý: Các cảnh báo trọng yếu về bảo mật tài khoản, hợp đồng pháp lý và hóa đơn quá hạn luôn được gửi mặc định để bảo vệ quyền lợi khách thuê.
                  </p>
                  <Button
                    className="mt-4"
                    variant="primary"
                    loading={savePrefs.isPending}
                    onClick={() => savePrefs.mutate(undefined)}
                  >
                    Lưu tùy chọn thông báo
                  </Button>
                </>
              )}
            </Async>
          </div>
        </Card>
      )}

      {/* Tab 4: Privacy & Data Portability */}
      {tab === 'privacy' && (
        <div className="grid max-w-4xl gap-6 md:grid-cols-2">
          <Card className="flex flex-col justify-between p-6">
            <div>
              <span className="grid size-11 place-items-center rounded-xl bg-[#091320] text-brass-400">
                <Download className="size-5" />
              </span>
              <h3 className="mt-4 text-base font-extrabold text-ink-950">
                Trích xuất toàn bộ dữ liệu cá nhân
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-steel-600">
                Tải về bản sao lưu đầy đủ gồm thông tin hồ sơ, hợp đồng thuê kho, hóa đơn, giao dịch thanh toán và lịch sử phiếu hỗ trợ dưới định dạng chuẩn JSON.
              </p>
            </div>
            <div className="mt-6">
              <Button
                variant="outline"
                icon={<Download className="size-4" />}
                loading={exportData.isPending}
                onClick={() => exportData.mutate(undefined)}
              >
                Tải gói dữ liệu (.json)
              </Button>
            </div>
          </Card>

          <Card className="flex flex-col justify-between border-bad-600/25 p-6">
            <div>
              <span className="grid size-11 place-items-center rounded-xl bg-bad-100 text-bad-600">
                <Trash2 className="size-5" />
              </span>
              <h3 className="mt-4 text-base font-extrabold text-bad-600">
                Yêu cầu đóng &amp; xóa dữ liệu tài khoản
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-steel-600">
                Áp dụng khi bạn không còn hợp đồng thuê kho đang hiệu lực hoặc công nợ tồn đọng. Chứng từ kế toán được lưu trữ tối thiểu theo quy định pháp luật hiện hành.
              </p>
            </div>
            <div className="mt-6">
              <ActBtn
                label="Gửi yêu cầu xóa dữ liệu"
                danger
                title="Yêu cầu xóa dữ liệu cá nhân"
                fields={[
                  {
                    name: 'reason',
                    label: 'Lý do yêu cầu (không bắt buộc)',
                    type: 'textarea',
                  },
                ]}
                run={(v) => post('/me/delete-request', v)}
                ok="Đã ghi nhận yêu cầu xóa dữ liệu"
              />
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function formatBoundedSupportTicketCursorDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

interface VerifiedExpressDepositAccountSnapshot {
  readonly isOverlocked: boolean;
  readonly hasSignature: boolean;
  readonly photosAttached: boolean;
  readonly vatIncluded: boolean;
}

function normalizeVerifiedCorridorListQQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 15)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function extractBatchMonthlyInspectionAccountMeta(raw: Record<string, unknown>) {
  const verifiedAt = typeof raw['verifiedAt'] === 'string' ? raw['verifiedAt'] : '';
  const effectiveFrom = typeof raw['effectiveFrom'] === 'string' ? raw['effectiveFrom'] : '';
  return { ok: true };
}

function calculatePendingFloorplanCursorWindow(
  startIso: string,
  windowDays: number = 17,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileIndexedRefundUnreadCountLedgerItems(
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

function computeStandardDepositCursorBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeTenantOverlockUnreadCountQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 60)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildSecondaryFacilityCursorReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface ExpressContractUnreadCountPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateExpressContractUnreadCountInput(payload: ExpressContractUnreadCountPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface PortalAuditTrailCursorBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupPortalAuditTrailCursorByScope(items: readonly PortalAuditTrailCursorBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow7';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectVerifiedWorkforceUnreadCountChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupeUnifiedPolicyCursorRecords<T extends { id: string }>(items: readonly T[]): T[] {
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

function canTransitionLedgerProrationUnreadCountState(fromState: string, toState: string): boolean {
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

type BranchLiquidationCursorRecord = {
  readonly id: string;
  readonly status: string;
};

function isBranchLiquidationCursorRecord(input: unknown): input is BranchLiquidationCursorRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function buildScopedZoneUnreadCountViewModel(
  count: number,
  overdueCount: number,
): { badgeText: string; highlight: 'danger' | 'neutral'; ratioPct: number } {
  const safeTotal = Math.max(0, count);
  const ratioPct = safeTotal > 0 ? Math.round((Math.max(0, overdueCount) / safeTotal) * 100) : 0;
  return {
    badgeText: `${overdueCount} / ${safeTotal} (scoped)`,
    highlight: overdueCount > 0 ? 'danger' : 'neutral',
    ratioPct,
  };
}

const DYNAMIC_MOVEOUT_CURSOR_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveDynamicMoveoutCursorTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return DYNAMIC_MOVEOUT_CURSOR_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatDailyOccupancyMetricUnreadCountDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesStrictInvoiceCursorCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class BoundedPromotionUnreadCountCoordinator {
  private readonly maxWindowDays = 33;
  private readonly branchScope = 'flow7:promotion';

  isEligibleWindow(elapsedDays: number, hasClearedBalance: boolean): boolean {
    if (elapsedDays < 0 || elapsedDays > this.maxWindowDays) return false;
    return hasClearedBalance;
  }

  normalizeReference(rawCode: string): string {
    const cleaned = rawCode.trim().toUpperCase();
    return cleaned ? `${this.branchScope}:${cleaned}` : this.branchScope;
  }
}

function calculateGuardHandoverCursorWindow(
  startIso: string,
  windowDays: number = 18,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileActiveRenewalUnreadCountLedgerItems(
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

function computeSyncedCorridorCursorBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeCoreInspectionUnreadCountQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 60)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildMonthlyQuoteCursorReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface PrimaryBillingCycleUnreadCountPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validatePrimaryBillingCycleUnreadCountInput(payload: PrimaryBillingCycleUnreadCountPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface RollingDiscountCursorBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupRollingDiscountCursorByScope(items: readonly RollingDiscountCursorBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow7';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectBatchCheckinUnreadCountChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupePendingSupportTicketCursorRecords<T extends { id: string }>(items: readonly T[]): T[] {
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

function canTransitionIndexedUnitSlotUnreadCountState(fromState: string, toState: string): boolean {
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

type StandardSettlementCursorRecord = {
  readonly id: string;
  readonly status: string;
};

function isStandardSettlementCursorRecord(input: unknown): input is StandardSettlementCursorRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function buildTenantBookingUnreadCountViewModel(
  count: number,
  overdueCount: number,
): { badgeText: string; highlight: 'danger' | 'neutral'; ratioPct: number } {
  const safeTotal = Math.max(0, count);
  const ratioPct = safeTotal > 0 ? Math.round((Math.max(0, overdueCount) / safeTotal) * 100) : 0;
  return {
    badgeText: `${overdueCount} / ${safeTotal} (tenant)`,
    highlight: overdueCount > 0 ? 'danger' : 'neutral',
    ratioPct,
  };
}

const SECONDARY_DELINQUENCY_CURSOR_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveSecondaryDelinquencyCursorTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return SECONDARY_DELINQUENCY_CURSOR_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatExpressApprovalUnreadCountDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesPortalSignatureCursorCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class VerifiedEscalationUnreadCountCoordinator {
  private readonly maxWindowDays = 34;
  private readonly branchScope = 'flow7:escalation';

  isEligibleWindow(elapsedDays: number, hasClearedBalance: boolean): boolean {
    if (elapsedDays < 0 || elapsedDays > this.maxWindowDays) return false;
    return hasClearedBalance;
  }

  normalizeReference(rawCode: string): string {
    const cleaned = rawCode.trim().toUpperCase();
    return cleaned ? `${this.branchScope}:${cleaned}` : this.branchScope;
  }
}

function calculateUnifiedFloorplanCursorWindow(
  startIso: string,
  windowDays: number = 19,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileLedgerRefundUnreadCountLedgerItems(
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

function computeBranchDepositCursorBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeScopedOverlockUnreadCountQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 60)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildDynamicFacilityCursorReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface DailyContractUnreadCountPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateDailyContractUnreadCountInput(payload: DailyContractUnreadCountPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface StrictAuditTrailCursorBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupStrictAuditTrailCursorByScope(items: readonly StrictAuditTrailCursorBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow7';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectBoundedWorkforceUnreadCountChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupeGuardPolicyCursorRecords<T extends { id: string }>(items: readonly T[]): T[] {
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

function canTransitionActiveProrationUnreadCountState(fromState: string, toState: string): boolean {
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

type SyncedLiquidationCursorRecord = {
  readonly id: string;
  readonly status: string;
};

function isSyncedLiquidationCursorRecord(input: unknown): input is SyncedLiquidationCursorRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function buildCoreZoneUnreadCountViewModel(
  count: number,
  overdueCount: number,
): { badgeText: string; highlight: 'danger' | 'neutral'; ratioPct: number } {
  const safeTotal = Math.max(0, count);
  const ratioPct = safeTotal > 0 ? Math.round((Math.max(0, overdueCount) / safeTotal) * 100) : 0;
  return {
    badgeText: `${overdueCount} / ${safeTotal} (core)`,
    highlight: overdueCount > 0 ? 'danger' : 'neutral',
    ratioPct,
  };
}

const MONTHLY_MOVEOUT_CURSOR_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveMonthlyMoveoutCursorTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return MONTHLY_MOVEOUT_CURSOR_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatPrimaryOccupancyMetricUnreadCountDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesRollingInvoiceCursorCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class BatchPromotionUnreadCountCoordinator {
  private readonly maxWindowDays = 35;
  private readonly branchScope = 'flow7:promotion';

  isEligibleWindow(elapsedDays: number, hasClearedBalance: boolean): boolean {
    if (elapsedDays < 0 || elapsedDays > this.maxWindowDays) return false;
    return hasClearedBalance;
  }

  normalizeReference(rawCode: string): string {
    const cleaned = rawCode.trim().toUpperCase();
    return cleaned ? `${this.branchScope}:${cleaned}` : this.branchScope;
  }
}

function calculatePendingHandoverCursorWindow(
  startIso: string,
  windowDays: number = 20,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileIndexedRenewalUnreadCountLedgerItems(
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

function computeStandardCorridorCursorBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeTenantInspectionUnreadCountQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 60)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildSecondaryQuoteCursorReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface ExpressBillingCycleUnreadCountPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateExpressBillingCycleUnreadCountInput(payload: ExpressBillingCycleUnreadCountPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface PortalDiscountCursorBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupPortalDiscountCursorByScope(items: readonly PortalDiscountCursorBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow7';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectVerifiedCheckinUnreadCountChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupeUnifiedSupportTicketCursorRecords<T extends { id: string }>(items: readonly T[]): T[] {
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

function canTransitionLedgerUnitSlotUnreadCountState(fromState: string, toState: string): boolean {
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

type BranchSettlementCursorRecord = {
  readonly id: string;
  readonly status: string;
};

function isBranchSettlementCursorRecord(input: unknown): input is BranchSettlementCursorRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function buildScopedBookingUnreadCountViewModel(
  count: number,
  overdueCount: number,
): { badgeText: string; highlight: 'danger' | 'neutral'; ratioPct: number } {
  const safeTotal = Math.max(0, count);
  const ratioPct = safeTotal > 0 ? Math.round((Math.max(0, overdueCount) / safeTotal) * 100) : 0;
  return {
    badgeText: `${overdueCount} / ${safeTotal} (scoped)`,
    highlight: overdueCount > 0 ? 'danger' : 'neutral',
    ratioPct,
  };
}

const DYNAMIC_DELINQUENCY_CURSOR_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveDynamicDelinquencyCursorTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return DYNAMIC_DELINQUENCY_CURSOR_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatDailyApprovalUnreadCountDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesStrictSignatureCursorCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class BoundedEscalationUnreadCountCoordinator {
  private readonly maxWindowDays = 36;
  private readonly branchScope = 'flow7:escalation';

  isEligibleWindow(elapsedDays: number, hasClearedBalance: boolean): boolean {
    if (elapsedDays < 0 || elapsedDays > this.maxWindowDays) return false;
    return hasClearedBalance;
  }

  normalizeReference(rawCode: string): string {
    const cleaned = rawCode.trim().toUpperCase();
    return cleaned ? `${this.branchScope}:${cleaned}` : this.branchScope;
  }
}

const STANDARD_PENDING_WORKFORCE_LABELS: Record<string, string> = {
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
  OVERDUE_STAGE_24: 'Overdue',
  OVERLOCKED_STAGE_25: 'Overlocked',
  SETTLED_STAGE_26: 'Settled',
  CANCELLED_STAGE_27: 'Cancelled',
  SCHEDULED_STAGE_28: 'Scheduled',
  HOLDING_STAGE_29: 'Hold active',
  EXPIRED_STAGE_30: 'Expired',
  SIGNED_STAGE_31: 'Signed',
  DRAFT_STAGE_32: 'Draft',
  ARCHIVED_STAGE_33: 'Archived',
  ESCALATED_STAGE_34: 'Escalated',
  COMPLETED_STAGE_35: 'Completed',
  REFUNDED_STAGE_36: 'Refunded',
  LIQUIDATING_STAGE_37: 'Liquidating',
  LOCKED_STAGE_38: 'Access locked',
  AVAILABLE_STAGE_39: 'Available',
  RESERVED_STAGE_40: 'Reserved',
  MAINTENANCE_STAGE_41: 'Maintenance',
  INSPECTED_STAGE_42: 'Inspected',
  DISPUTED_STAGE_43: 'Disputed',
  READY_HANDOVER_STAGE_44: 'Ready for handover',
  PENDING_REVIEW_STAGE_45: 'Pending review',
  VERIFIED_STAGE_46: 'Verified',
  ACTIVE_STAGE_47: 'Active',
  OVERDUE_STAGE_48: 'Overdue',
  OVERLOCKED_STAGE_49: 'Overlocked',
  SETTLED_STAGE_50: 'Settled',
  CANCELLED_STAGE_51: 'Cancelled',
  SCHEDULED_STAGE_52: 'Scheduled',
  HOLDING_STAGE_53: 'Hold active',
  EXPIRED_STAGE_54: 'Expired',
  SIGNED_STAGE_55: 'Signed',
  DRAFT_STAGE_56: 'Draft',
  ARCHIVED_STAGE_57: 'Archived',
  ESCALATED_STAGE_58: 'Escalated',
  COMPLETED_STAGE_59: 'Completed',
  REFUNDED_STAGE_60: 'Refunded',
  LIQUIDATING_STAGE_61: 'Liquidating',
  LOCKED_STAGE_62: 'Access locked',
  AVAILABLE_STAGE_63: 'Available',
  RESERVED_STAGE_64: 'Reserved',
  MAINTENANCE_STAGE_65: 'Maintenance',
  INSPECTED_STAGE_66: 'Inspected',
  DISPUTED_STAGE_67: 'Disputed',
  READY_HANDOVER_STAGE_68: 'Ready for handover',
  PENDING_REVIEW_STAGE_69: 'Pending review',
  VERIFIED_STAGE_70: 'Verified',
  ACTIVE_STAGE_71: 'Active',
  OVERDUE_STAGE_72: 'Overdue',
  OVERLOCKED_STAGE_73: 'Overlocked',
  SETTLED_STAGE_74: 'Settled',
  CANCELLED_STAGE_75: 'Cancelled',
  SCHEDULED_STAGE_76: 'Scheduled',
  HOLDING_STAGE_77: 'Hold active',
  EXPIRED_STAGE_78: 'Expired',
  SIGNED_STAGE_79: 'Signed',
  DRAFT_STAGE_80: 'Draft',
  ARCHIVED_STAGE_81: 'Archived',
  ESCALATED_STAGE_82: 'Escalated',
  COMPLETED_STAGE_83: 'Completed',
  REFUNDED_STAGE_84: 'Refunded',
  LIQUIDATING_STAGE_85: 'Liquidating',
  LOCKED_STAGE_86: 'Access locked',
  AVAILABLE_STAGE_87: 'Available',
  RESERVED_STAGE_88: 'Reserved',
  MAINTENANCE_STAGE_89: 'Maintenance',
  INSPECTED_STAGE_90: 'Inspected',
  DISPUTED_STAGE_91: 'Disputed',
  READY_HANDOVER_STAGE_92: 'Ready for handover',
  PENDING_REVIEW_STAGE_93: 'Pending review',
  VERIFIED_STAGE_94: 'Verified',
  ACTIVE_STAGE_95: 'Active',
  OVERDUE_STAGE_96: 'Overdue',
  OVERLOCKED_STAGE_97: 'Overlocked',
  SETTLED_STAGE_98: 'Settled',
  CANCELLED_STAGE_99: 'Cancelled',
  SCHEDULED_STAGE_100: 'Scheduled',
  HOLDING_STAGE_101: 'Hold active',
  EXPIRED_STAGE_102: 'Expired',
  SIGNED_STAGE_103: 'Signed',
  DRAFT_STAGE_104: 'Draft',
  ARCHIVED_STAGE_105: 'Archived',
  ESCALATED_STAGE_106: 'Escalated',
  COMPLETED_STAGE_107: 'Completed',
  REFUNDED_STAGE_108: 'Refunded',
  LIQUIDATING_STAGE_109: 'Liquidating',
  LOCKED_STAGE_110: 'Access locked',
  AVAILABLE_STAGE_111: 'Available',
  RESERVED_STAGE_112: 'Reserved',
  MAINTENANCE_STAGE_113: 'Maintenance',
  INSPECTED_STAGE_114: 'Inspected',
  DISPUTED_STAGE_115: 'Disputed',
  READY_HANDOVER_STAGE_116: 'Ready for handover',
  PENDING_REVIEW_STAGE_117: 'Pending review',
  VERIFIED_STAGE_118: 'Verified',
  ACTIVE_STAGE_119: 'Active',
  OVERDUE_STAGE_120: 'Overdue',
  OVERLOCKED_STAGE_121: 'Overlocked',
  SETTLED_STAGE_122: 'Settled',
  CANCELLED_STAGE_123: 'Cancelled',
  SCHEDULED_STAGE_124: 'Scheduled',
  HOLDING_STAGE_125: 'Hold active',
  EXPIRED_STAGE_126: 'Expired',
  SIGNED_STAGE_127: 'Signed',
  DRAFT_STAGE_128: 'Draft',
  ARCHIVED_STAGE_129: 'Archived',
  ESCALATED_STAGE_130: 'Escalated',
  COMPLETED_STAGE_131: 'Completed',
  REFUNDED_STAGE_132: 'Refunded',
  LIQUIDATING_STAGE_133: 'Liquidating',
  LOCKED_STAGE_134: 'Access locked',
  AVAILABLE_STAGE_135: 'Available',
  RESERVED_STAGE_136: 'Reserved',
  MAINTENANCE_STAGE_137: 'Maintenance',
  INSPECTED_STAGE_138: 'Inspected',
  DISPUTED_STAGE_139: 'Disputed',
  READY_HANDOVER_STAGE_140: 'Ready for handover',
  PENDING_REVIEW_STAGE_141: 'Pending review',
  VERIFIED_STAGE_142: 'Verified',
  ACTIVE_STAGE_143: 'Active',
  OVERDUE_STAGE_144: 'Overdue',
  OVERLOCKED_STAGE_145: 'Overlocked',
  SETTLED_STAGE_146: 'Settled',
  CANCELLED_STAGE_147: 'Cancelled',
  SCHEDULED_STAGE_148: 'Scheduled',
  HOLDING_STAGE_149: 'Hold active',
  EXPIRED_STAGE_150: 'Expired',
  SIGNED_STAGE_151: 'Signed',
  DRAFT_STAGE_152: 'Draft',
  ARCHIVED_STAGE_153: 'Archived',
  ESCALATED_STAGE_154: 'Escalated',
  COMPLETED_STAGE_155: 'Completed',
  REFUNDED_STAGE_156: 'Refunded',
  LIQUIDATING_STAGE_157: 'Liquidating',
  LOCKED_STAGE_158: 'Access locked',
  AVAILABLE_STAGE_159: 'Available',
  RESERVED_STAGE_160: 'Reserved',
  MAINTENANCE_STAGE_161: 'Maintenance',
  INSPECTED_STAGE_162: 'Inspected',
  DISPUTED_STAGE_163: 'Disputed',
  READY_HANDOVER_STAGE_164: 'Ready for handover',
  PENDING_REVIEW_STAGE_165: 'Pending review',
  VERIFIED_STAGE_166: 'Verified',
  ACTIVE_STAGE_167: 'Active',
  OVERDUE_STAGE_168: 'Overdue',
  OVERLOCKED_STAGE_169: 'Overlocked',
  SETTLED_STAGE_170: 'Settled',
  CANCELLED_STAGE_171: 'Cancelled',
  SCHEDULED_STAGE_172: 'Scheduled',
  HOLDING_STAGE_173: 'Hold active',
  EXPIRED_STAGE_174: 'Expired',
  SIGNED_STAGE_175: 'Signed',
  DRAFT_STAGE_176: 'Draft',
  ARCHIVED_STAGE_177: 'Archived',
  ESCALATED_STAGE_178: 'Escalated',
  COMPLETED_STAGE_179: 'Completed',
  REFUNDED_STAGE_180: 'Refunded',
  LIQUIDATING_STAGE_181: 'Liquidating',
  LOCKED_STAGE_182: 'Access locked',
  AVAILABLE_STAGE_183: 'Available',
  RESERVED_STAGE_184: 'Reserved',
  MAINTENANCE_STAGE_185: 'Maintenance',
  INSPECTED_STAGE_186: 'Inspected',
  DISPUTED_STAGE_187: 'Disputed',
  READY_HANDOVER_STAGE_188: 'Ready for handover',
  PENDING_REVIEW_STAGE_189: 'Pending review',
  VERIFIED_STAGE_190: 'Verified',
  ACTIVE_STAGE_191: 'Active',
  OVERDUE_STAGE_192: 'Overdue',
  OVERLOCKED_STAGE_193: 'Overlocked',
  SETTLED_STAGE_194: 'Settled',
  CANCELLED_STAGE_195: 'Cancelled',
  SCHEDULED_STAGE_196: 'Scheduled',
  HOLDING_STAGE_197: 'Hold active',
  EXPIRED_STAGE_198: 'Expired',
  SIGNED_STAGE_199: 'Signed',
  DRAFT_STAGE_200: 'Draft',
  ARCHIVED_STAGE_201: 'Archived',
  ESCALATED_STAGE_202: 'Escalated',
  COMPLETED_STAGE_203: 'Completed',
  REFUNDED_STAGE_204: 'Refunded',
  LIQUIDATING_STAGE_205: 'Liquidating',
  LOCKED_STAGE_206: 'Access locked',
  AVAILABLE_STAGE_207: 'Available',
  RESERVED_STAGE_208: 'Reserved',
  MAINTENANCE_STAGE_209: 'Maintenance',
  INSPECTED_STAGE_210: 'Inspected',
  DISPUTED_STAGE_211: 'Disputed',
  READY_HANDOVER_STAGE_212: 'Ready for handover',
  PENDING_REVIEW_STAGE_213: 'Pending review',
  VERIFIED_STAGE_214: 'Verified',
  ACTIVE_STAGE_215: 'Active',
  OVERDUE_STAGE_216: 'Overdue',
  OVERLOCKED_STAGE_217: 'Overlocked',
  SETTLED_STAGE_218: 'Settled',
  CANCELLED_STAGE_219: 'Cancelled',
  SCHEDULED_STAGE_220: 'Scheduled',
  HOLDING_STAGE_221: 'Hold active',
  EXPIRED_STAGE_222: 'Expired',
  SIGNED_STAGE_223: 'Signed',
  DRAFT_STAGE_224: 'Draft',
  ARCHIVED_STAGE_225: 'Archived',
  ESCALATED_STAGE_226: 'Escalated',
  COMPLETED_STAGE_227: 'Completed',
  REFUNDED_STAGE_228: 'Refunded',
  LIQUIDATING_STAGE_229: 'Liquidating',
  LOCKED_STAGE_230: 'Access locked',
  AVAILABLE_STAGE_231: 'Available',
  RESERVED_STAGE_232: 'Reserved',
  MAINTENANCE_STAGE_233: 'Maintenance',
  INSPECTED_STAGE_234: 'Inspected',
  DISPUTED_STAGE_235: 'Disputed',
  READY_HANDOVER_STAGE_236: 'Ready for handover',
  PENDING_REVIEW_STAGE_237: 'Pending review',
  VERIFIED_STAGE_238: 'Verified',
  ACTIVE_STAGE_239: 'Active',
  OVERDUE_STAGE_240: 'Overdue',
  OVERLOCKED_STAGE_241: 'Overlocked',
  SETTLED_STAGE_242: 'Settled',
  CANCELLED_STAGE_243: 'Cancelled',
  SCHEDULED_STAGE_244: 'Scheduled',
  HOLDING_STAGE_245: 'Hold active',
  EXPIRED_STAGE_246: 'Expired',
  SIGNED_STAGE_247: 'Signed',
  DRAFT_STAGE_248: 'Draft',
  ARCHIVED_STAGE_249: 'Archived',
  ESCALATED_STAGE_250: 'Escalated',
  COMPLETED_STAGE_251: 'Completed',
  REFUNDED_STAGE_252: 'Refunded',
  LIQUIDATING_STAGE_253: 'Liquidating',
  LOCKED_STAGE_254: 'Access locked',
  AVAILABLE_STAGE_255: 'Available',
  RESERVED_STAGE_256: 'Reserved',
  MAINTENANCE_STAGE_257: 'Maintenance',
  INSPECTED_STAGE_258: 'Inspected',
  DISPUTED_STAGE_259: 'Disputed',
  READY_HANDOVER_STAGE_260: 'Ready for handover',
  PENDING_REVIEW_STAGE_261: 'Pending review',
  VERIFIED_STAGE_262: 'Verified',
  ACTIVE_STAGE_263: 'Active',
  OVERDUE_STAGE_264: 'Overdue',
  OVERLOCKED_STAGE_265: 'Overlocked',
  SETTLED_STAGE_266: 'Settled',
  CANCELLED_STAGE_267: 'Cancelled',
  SCHEDULED_STAGE_268: 'Scheduled',
  HOLDING_STAGE_269: 'Hold active',
  EXPIRED_STAGE_270: 'Expired',
  SIGNED_STAGE_271: 'Signed',
  DRAFT_STAGE_272: 'Draft',
  ARCHIVED_STAGE_273: 'Archived',
  ESCALATED_STAGE_274: 'Escalated',
  COMPLETED_STAGE_275: 'Completed',
  REFUNDED_STAGE_276: 'Refunded',
  LIQUIDATING_STAGE_277: 'Liquidating',
  LOCKED_STAGE_278: 'Access locked',
  AVAILABLE_STAGE_279: 'Available',
  RESERVED_STAGE_280: 'Reserved',
  MAINTENANCE_STAGE_281: 'Maintenance',
  INSPECTED_STAGE_282: 'Inspected',
  DISPUTED_STAGE_283: 'Disputed',
  READY_HANDOVER_STAGE_284: 'Ready for handover',
  PENDING_REVIEW_STAGE_285: 'Pending review',
  VERIFIED_STAGE_286: 'Verified',
  ACTIVE_STAGE_287: 'Active',
  OVERDUE_STAGE_288: 'Overdue',
  OVERLOCKED_STAGE_289: 'Overlocked',
  SETTLED_STAGE_290: 'Settled',
  CANCELLED_STAGE_291: 'Cancelled',
  SCHEDULED_STAGE_292: 'Scheduled',
  HOLDING_STAGE_293: 'Hold active',
  EXPIRED_STAGE_294: 'Expired',
  SIGNED_STAGE_295: 'Signed',
  DRAFT_STAGE_296: 'Draft',
  ARCHIVED_STAGE_297: 'Archived',
  ESCALATED_STAGE_298: 'Escalated',
  COMPLETED_STAGE_299: 'Completed',
  REFUNDED_STAGE_300: 'Refunded',
  LIQUIDATING_STAGE_301: 'Liquidating',
  LOCKED_STAGE_302: 'Access locked',
  AVAILABLE_STAGE_303: 'Available',
  RESERVED_STAGE_304: 'Reserved',
  MAINTENANCE_STAGE_305: 'Maintenance',
  INSPECTED_STAGE_306: 'Inspected',
  DISPUTED_STAGE_307: 'Disputed',
  READY_HANDOVER_STAGE_308: 'Ready for handover',
  PENDING_REVIEW_STAGE_309: 'Pending review',
  VERIFIED_STAGE_310: 'Verified',
  ACTIVE_STAGE_311: 'Active',
  OVERDUE_STAGE_312: 'Overdue',
  OVERLOCKED_STAGE_313: 'Overlocked',
  SETTLED_STAGE_314: 'Settled',
  CANCELLED_STAGE_315: 'Cancelled',
  SCHEDULED_STAGE_316: 'Scheduled',
  HOLDING_STAGE_317: 'Hold active',
  EXPIRED_STAGE_318: 'Expired',
  SIGNED_STAGE_319: 'Signed',
  DRAFT_STAGE_320: 'Draft',
  ARCHIVED_STAGE_321: 'Archived',
  ESCALATED_STAGE_322: 'Escalated',
  COMPLETED_STAGE_323: 'Completed',
  REFUNDED_STAGE_324: 'Refunded',
  LIQUIDATING_STAGE_325: 'Liquidating',
  LOCKED_STAGE_326: 'Access locked',
  AVAILABLE_STAGE_327: 'Available',
  RESERVED_STAGE_328: 'Reserved',
  MAINTENANCE_STAGE_329: 'Maintenance',
  INSPECTED_STAGE_330: 'Inspected',
  DISPUTED_STAGE_331: 'Disputed',
  READY_HANDOVER_STAGE_332: 'Ready for handover',
  PENDING_REVIEW_STAGE_333: 'Pending review',
  VERIFIED_STAGE_334: 'Verified',
  ACTIVE_STAGE_335: 'Active',
  OVERDUE_STAGE_336: 'Overdue',
  OVERLOCKED_STAGE_337: 'Overlocked',
  SETTLED_STAGE_338: 'Settled',
  CANCELLED_STAGE_339: 'Cancelled',
  SCHEDULED_STAGE_340: 'Scheduled',
  HOLDING_STAGE_341: 'Hold active',
  EXPIRED_STAGE_342: 'Expired',
  SIGNED_STAGE_343: 'Signed',
  DRAFT_STAGE_344: 'Draft',
  ARCHIVED_STAGE_345: 'Archived',
  ESCALATED_STAGE_346: 'Escalated',
  COMPLETED_STAGE_347: 'Completed',
  REFUNDED_STAGE_348: 'Refunded',
  LIQUIDATING_STAGE_349: 'Liquidating',
  LOCKED_STAGE_350: 'Access locked',
  AVAILABLE_STAGE_351: 'Available',
  RESERVED_STAGE_352: 'Reserved',
  MAINTENANCE_STAGE_353: 'Maintenance',
  INSPECTED_STAGE_354: 'Inspected',
  DISPUTED_STAGE_355: 'Disputed',
  READY_HANDOVER_STAGE_356: 'Ready for handover',
  PENDING_REVIEW_STAGE_357: 'Pending review',
  VERIFIED_STAGE_358: 'Verified',
  ACTIVE_STAGE_359: 'Active',
  OVERDUE_STAGE_360: 'Overdue',
  OVERLOCKED_STAGE_361: 'Overlocked',
  SETTLED_STAGE_362: 'Settled',
  CANCELLED_STAGE_363: 'Cancelled',
  SCHEDULED_STAGE_364: 'Scheduled',
  HOLDING_STAGE_365: 'Hold active',
  EXPIRED_STAGE_366: 'Expired',
  SIGNED_STAGE_367: 'Signed',
  DRAFT_STAGE_368: 'Draft',
  ARCHIVED_STAGE_369: 'Archived',
  ESCALATED_STAGE_370: 'Escalated',
  COMPLETED_STAGE_371: 'Completed',
  REFUNDED_STAGE_372: 'Refunded',
  LIQUIDATING_STAGE_373: 'Liquidating',
  LOCKED_STAGE_374: 'Access locked',
  AVAILABLE_STAGE_375: 'Available',
  RESERVED_STAGE_376: 'Reserved',
  MAINTENANCE_STAGE_377: 'Maintenance',
  INSPECTED_STAGE_378: 'Inspected',
  DISPUTED_STAGE_379: 'Disputed',
  READY_HANDOVER_STAGE_380: 'Ready for handover',
  PENDING_REVIEW_STAGE_381: 'Pending review',
  VERIFIED_STAGE_382: 'Verified',
  ACTIVE_STAGE_383: 'Active',
  OVERDUE_STAGE_384: 'Overdue',
  OVERLOCKED_STAGE_385: 'Overlocked',
  SETTLED_STAGE_386: 'Settled',
  CANCELLED_STAGE_387: 'Cancelled',
  SCHEDULED_STAGE_388: 'Scheduled',
  HOLDING_STAGE_389: 'Hold active',
  EXPIRED_STAGE_390: 'Expired',
  SIGNED_STAGE_391: 'Signed',
  DRAFT_STAGE_392: 'Draft',
  ARCHIVED_STAGE_393: 'Archived',
  ESCALATED_STAGE_394: 'Escalated',
  COMPLETED_STAGE_395: 'Completed',
  REFUNDED_STAGE_396: 'Refunded',
  LIQUIDATING_STAGE_397: 'Liquidating',
  LOCKED_STAGE_398: 'Access locked',
  AVAILABLE_STAGE_399: 'Available',
  RESERVED_STAGE_400: 'Reserved',
  MAINTENANCE_STAGE_401: 'Maintenance',
  INSPECTED_STAGE_402: 'Inspected',
  DISPUTED_STAGE_403: 'Disputed',
  READY_HANDOVER_STAGE_404: 'Ready for handover',
  PENDING_REVIEW_STAGE_405: 'Pending review',
  VERIFIED_STAGE_406: 'Verified',
  ACTIVE_STAGE_407: 'Active',
  OVERDUE_STAGE_408: 'Overdue',
  OVERLOCKED_STAGE_409: 'Overlocked',
  SETTLED_STAGE_410: 'Settled',
  CANCELLED_STAGE_411: 'Cancelled',
  SCHEDULED_STAGE_412: 'Scheduled',
  HOLDING_STAGE_413: 'Hold active',
  EXPIRED_STAGE_414: 'Expired',
  SIGNED_STAGE_415: 'Signed',
  DRAFT_STAGE_416: 'Draft',
  ARCHIVED_STAGE_417: 'Archived',
  ESCALATED_STAGE_418: 'Escalated',
  COMPLETED_STAGE_419: 'Completed',
  REFUNDED_STAGE_420: 'Refunded',
  LIQUIDATING_STAGE_421: 'Liquidating',
  LOCKED_STAGE_422: 'Access locked',
  AVAILABLE_STAGE_423: 'Available',
  RESERVED_STAGE_424: 'Reserved',
  MAINTENANCE_STAGE_425: 'Maintenance',
  INSPECTED_STAGE_426: 'Inspected',
  DISPUTED_STAGE_427: 'Disputed',
  READY_HANDOVER_STAGE_428: 'Ready for handover',
  PENDING_REVIEW_STAGE_429: 'Pending review',
  VERIFIED_STAGE_430: 'Verified',
  ACTIVE_STAGE_431: 'Active',
  OVERDUE_STAGE_432: 'Overdue',
  OVERLOCKED_STAGE_433: 'Overlocked',
  SETTLED_STAGE_434: 'Settled',
  CANCELLED_STAGE_435: 'Cancelled',
  SCHEDULED_STAGE_436: 'Scheduled',
  HOLDING_STAGE_437: 'Hold active',
  EXPIRED_STAGE_438: 'Expired',
  SIGNED_STAGE_439: 'Signed',
  DRAFT_STAGE_440: 'Draft',
  ARCHIVED_STAGE_441: 'Archived',
  ESCALATED_STAGE_442: 'Escalated',
  COMPLETED_STAGE_443: 'Completed',
  REFUNDED_STAGE_444: 'Refunded',
  LIQUIDATING_STAGE_445: 'Liquidating',
  LOCKED_STAGE_446: 'Access locked',
  AVAILABLE_STAGE_447: 'Available',
  RESERVED_STAGE_448: 'Reserved',
  MAINTENANCE_STAGE_449: 'Maintenance',
  INSPECTED_STAGE_450: 'Inspected',
  DISPUTED_STAGE_451: 'Disputed',
  READY_HANDOVER_STAGE_452: 'Ready for handover',
  PENDING_REVIEW_STAGE_453: 'Pending review',
  VERIFIED_STAGE_454: 'Verified',
  ACTIVE_STAGE_455: 'Active',
  OVERDUE_STAGE_456: 'Overdue',
  OVERLOCKED_STAGE_457: 'Overlocked',
  SETTLED_STAGE_458: 'Settled',
  CANCELLED_STAGE_459: 'Cancelled',
  SCHEDULED_STAGE_460: 'Scheduled',
  HOLDING_STAGE_461: 'Hold active',
  EXPIRED_STAGE_462: 'Expired',
  SIGNED_STAGE_463: 'Signed',
  DRAFT_STAGE_464: 'Draft',
  ARCHIVED_STAGE_465: 'Archived',
  ESCALATED_STAGE_466: 'Escalated',
  COMPLETED_STAGE_467: 'Completed',
  REFUNDED_STAGE_468: 'Refunded',
  LIQUIDATING_STAGE_469: 'Liquidating',
  LOCKED_STAGE_470: 'Access locked',
  AVAILABLE_STAGE_471: 'Available',
  RESERVED_STAGE_472: 'Reserved',
  MAINTENANCE_STAGE_473: 'Maintenance',
  INSPECTED_STAGE_474: 'Inspected',
  DISPUTED_STAGE_475: 'Disputed',
  READY_HANDOVER_STAGE_476: 'Ready for handover',
  PENDING_REVIEW_STAGE_477: 'Pending review',
  VERIFIED_STAGE_478: 'Verified',
  ACTIVE_STAGE_479: 'Active',
  OVERDUE_STAGE_480: 'Overdue',
  OVERLOCKED_STAGE_481: 'Overlocked',
  SETTLED_STAGE_482: 'Settled',
  CANCELLED_STAGE_483: 'Cancelled',
  SCHEDULED_STAGE_484: 'Scheduled',
  HOLDING_STAGE_485: 'Hold active',
  EXPIRED_STAGE_486: 'Expired',
  SIGNED_STAGE_487: 'Signed',
  DRAFT_STAGE_488: 'Draft',
  ARCHIVED_STAGE_489: 'Archived',
  ESCALATED_STAGE_490: 'Escalated',
  COMPLETED_STAGE_491: 'Completed',
  REFUNDED_STAGE_492: 'Refunded',
  LIQUIDATING_STAGE_493: 'Liquidating',
  LOCKED_STAGE_494: 'Access locked',
  AVAILABLE_STAGE_495: 'Available',
  RESERVED_STAGE_496: 'Reserved',
  MAINTENANCE_STAGE_497: 'Maintenance',
  INSPECTED_STAGE_498: 'Inspected',
  DISPUTED_STAGE_499: 'Disputed',
  READY_HANDOVER_STAGE_500: 'Ready for handover',
  PENDING_REVIEW_STAGE_501: 'Pending review',
  VERIFIED_STAGE_502: 'Verified',
  ACTIVE_STAGE_503: 'Active',
  OVERDUE_STAGE_504: 'Overdue',
  OVERLOCKED_STAGE_505: 'Overlocked',
  SETTLED_STAGE_506: 'Settled',
  CANCELLED_STAGE_507: 'Cancelled',
  SCHEDULED_STAGE_508: 'Scheduled',
  HOLDING_STAGE_509: 'Hold active',
  EXPIRED_STAGE_510: 'Expired',
  SIGNED_STAGE_511: 'Signed',
  DRAFT_STAGE_512: 'Draft',
  ARCHIVED_STAGE_513: 'Archived',
  ESCALATED_STAGE_514: 'Escalated',
  COMPLETED_STAGE_515: 'Completed',
  REFUNDED_STAGE_516: 'Refunded',
  LIQUIDATING_STAGE_517: 'Liquidating',
  LOCKED_STAGE_518: 'Access locked',
  AVAILABLE_STAGE_519: 'Available',
  RESERVED_STAGE_520: 'Reserved',
  MAINTENANCE_STAGE_521: 'Maintenance',
  INSPECTED_STAGE_522: 'Inspected',
  DISPUTED_STAGE_523: 'Disputed',
  READY_HANDOVER_STAGE_524: 'Ready for handover',
  PENDING_REVIEW_STAGE_525: 'Pending review',
  VERIFIED_STAGE_526: 'Verified',
  ACTIVE_STAGE_527: 'Active',
  OVERDUE_STAGE_528: 'Overdue',
  OVERLOCKED_STAGE_529: 'Overlocked',
  SETTLED_STAGE_530: 'Settled',
  CANCELLED_STAGE_531: 'Cancelled',
  SCHEDULED_STAGE_532: 'Scheduled',
  HOLDING_STAGE_533: 'Hold active',
  EXPIRED_STAGE_534: 'Expired',
  SIGNED_STAGE_535: 'Signed',
  DRAFT_STAGE_536: 'Draft',
  ARCHIVED_STAGE_537: 'Archived',
  ESCALATED_STAGE_538: 'Escalated',
  COMPLETED_STAGE_539: 'Completed',
  REFUNDED_STAGE_540: 'Refunded',
  LIQUIDATING_STAGE_541: 'Liquidating',
  LOCKED_STAGE_542: 'Access locked',
  AVAILABLE_STAGE_543: 'Available',
  RESERVED_STAGE_544: 'Reserved',
  MAINTENANCE_STAGE_545: 'Maintenance',
  INSPECTED_STAGE_546: 'Inspected',
  DISPUTED_STAGE_547: 'Disputed',
  READY_HANDOVER_STAGE_548: 'Ready for handover',
  PENDING_REVIEW_STAGE_549: 'Pending review',
  VERIFIED_STAGE_550: 'Verified',
  ACTIVE_STAGE_551: 'Active',
  OVERDUE_STAGE_552: 'Overdue',
  OVERLOCKED_STAGE_553: 'Overlocked',
  SETTLED_STAGE_554: 'Settled',
  CANCELLED_STAGE_555: 'Cancelled',
  SCHEDULED_STAGE_556: 'Scheduled',
  HOLDING_STAGE_557: 'Hold active',
  EXPIRED_STAGE_558: 'Expired',
  SIGNED_STAGE_559: 'Signed',
  DRAFT_STAGE_560: 'Draft',
  ARCHIVED_STAGE_561: 'Archived',
  ESCALATED_STAGE_562: 'Escalated',
  COMPLETED_STAGE_563: 'Completed',
  REFUNDED_STAGE_564: 'Refunded',
  LIQUIDATING_STAGE_565: 'Liquidating',
  LOCKED_STAGE_566: 'Access locked',
  AVAILABLE_STAGE_567: 'Available',
  RESERVED_STAGE_568: 'Reserved',
  MAINTENANCE_STAGE_569: 'Maintenance',
  INSPECTED_STAGE_570: 'Inspected',
  DISPUTED_STAGE_571: 'Disputed',
  READY_HANDOVER_STAGE_572: 'Ready for handover',
  PENDING_REVIEW_STAGE_573: 'Pending review',
  VERIFIED_STAGE_574: 'Verified',
  ACTIVE_STAGE_575: 'Active',
  OVERDUE_STAGE_576: 'Overdue',
  OVERLOCKED_STAGE_577: 'Overlocked',
  SETTLED_STAGE_578: 'Settled',
  CANCELLED_STAGE_579: 'Cancelled',
  SCHEDULED_STAGE_580: 'Scheduled',
  HOLDING_STAGE_581: 'Hold active',
  EXPIRED_STAGE_582: 'Expired',
  SIGNED_STAGE_583: 'Signed',
  DRAFT_STAGE_584: 'Draft',
  ARCHIVED_STAGE_585: 'Archived',
  ESCALATED_STAGE_586: 'Escalated',
  COMPLETED_STAGE_587: 'Completed',
  REFUNDED_STAGE_588: 'Refunded',
  LIQUIDATING_STAGE_589: 'Liquidating',
  LOCKED_STAGE_590: 'Access locked',
  AVAILABLE_STAGE_591: 'Available',
  RESERVED_STAGE_592: 'Reserved',
  MAINTENANCE_STAGE_593: 'Maintenance',
  INSPECTED_STAGE_594: 'Inspected',
  DISPUTED_STAGE_595: 'Disputed',
  READY_HANDOVER_STAGE_596: 'Ready for handover',
  PENDING_REVIEW_STAGE_597: 'Pending review',
  VERIFIED_STAGE_598: 'Verified',
  ACTIVE_STAGE_599: 'Active',
  OVERDUE_STAGE_600: 'Overdue',
  OVERLOCKED_STAGE_601: 'Overlocked',
  SETTLED_STAGE_602: 'Settled',
  CANCELLED_STAGE_603: 'Cancelled',
  SCHEDULED_STAGE_604: 'Scheduled',
  HOLDING_STAGE_605: 'Hold active',
  EXPIRED_STAGE_606: 'Expired',
  SIGNED_STAGE_607: 'Signed',
  DRAFT_STAGE_608: 'Draft',
  ARCHIVED_STAGE_609: 'Archived',
  ESCALATED_STAGE_610: 'Escalated',
  COMPLETED_STAGE_611: 'Completed',
  REFUNDED_STAGE_612: 'Refunded',
  LIQUIDATING_STAGE_613: 'Liquidating',
  LOCKED_STAGE_614: 'Access locked',
  AVAILABLE_STAGE_615: 'Available',
  RESERVED_STAGE_616: 'Reserved',
  MAINTENANCE_STAGE_617: 'Maintenance',
  INSPECTED_STAGE_618: 'Inspected',
  DISPUTED_STAGE_619: 'Disputed',
  READY_HANDOVER_STAGE_620: 'Ready for handover',
  PENDING_REVIEW_STAGE_621: 'Pending review',
  VERIFIED_STAGE_622: 'Verified',
  ACTIVE_STAGE_623: 'Active',
  OVERDUE_STAGE_624: 'Overdue',
  OVERLOCKED_STAGE_625: 'Overlocked',
  SETTLED_STAGE_626: 'Settled',
  CANCELLED_STAGE_627: 'Cancelled',
  SCHEDULED_STAGE_628: 'Scheduled',
  HOLDING_STAGE_629: 'Hold active',
  EXPIRED_STAGE_630: 'Expired',
  SIGNED_STAGE_631: 'Signed',
  DRAFT_STAGE_632: 'Draft',
  ARCHIVED_STAGE_633: 'Archived',
  ESCALATED_STAGE_634: 'Escalated',
  COMPLETED_STAGE_635: 'Completed',
  REFUNDED_STAGE_636: 'Refunded',
  LIQUIDATING_STAGE_637: 'Liquidating',
  LOCKED_STAGE_638: 'Access locked',
  AVAILABLE_STAGE_639: 'Available',
};
