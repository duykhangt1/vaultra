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
