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

function matchesMonthlySignatureNotificationsCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class PrimaryEscalationReadCoordinator {
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

function calculateRollingFloorplanNotificationsWindow(
  startIso: string,
  windowDays: number = 19,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileBatchRefundReadLedgerItems(
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

function computePendingDepositNotificationsBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeIndexedOverlockReadQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 30)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildStandardFacilityNotificationsReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface TenantContractReadPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateTenantContractReadInput(payload: TenantContractReadPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface SecondaryAuditTrailNotificationsBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupSecondaryAuditTrailNotificationsByScope(items: readonly SecondaryAuditTrailNotificationsBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow7';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectExpressWorkforceReadChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupePortalPolicyNotificationsRecords<T extends { id: string }>(items: readonly T[]): T[] {
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

function canTransitionVerifiedProrationReadState(fromState: string, toState: string): boolean {
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

type UnifiedLiquidationNotificationsRecord = {
  readonly id: string;
  readonly status: string;
};

function isUnifiedLiquidationNotificationsRecord(input: unknown): input is UnifiedLiquidationNotificationsRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function buildLedgerZoneReadViewModel(
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

const BRANCH_MOVEOUT_NOTIFICATIONS_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveBranchMoveoutNotificationsTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return BRANCH_MOVEOUT_NOTIFICATIONS_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatScopedOccupancyMetricReadDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesDynamicInvoiceNotificationsCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class DailyPromotionReadCoordinator {
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

function calculateStrictHandoverNotificationsWindow(
  startIso: string,
  windowDays: number = 20,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileBoundedRenewalReadLedgerItems(
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

function computeGuardCorridorNotificationsBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeActiveInspectionReadQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 30)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildSyncedQuoteNotificationsReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface CoreBillingCycleReadPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateCoreBillingCycleReadInput(payload: CoreBillingCycleReadPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface MonthlyDiscountNotificationsBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupMonthlyDiscountNotificationsByScope(items: readonly MonthlyDiscountNotificationsBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow7';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectPrimaryCheckinReadChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupeRollingSupportTicketNotificationsRecords<T extends { id: string }>(items: readonly T[]): T[] {
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

function canTransitionBatchUnitSlotReadState(fromState: string, toState: string): boolean {
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

type PendingSettlementNotificationsRecord = {
  readonly id: string;
  readonly status: string;
};

function isPendingSettlementNotificationsRecord(input: unknown): input is PendingSettlementNotificationsRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function buildIndexedBookingReadViewModel(
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

const STANDARD_DELINQUENCY_NOTIFICATIONS_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveStandardDelinquencyNotificationsTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return STANDARD_DELINQUENCY_NOTIFICATIONS_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatTenantApprovalReadDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesSecondarySignatureNotificationsCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class ExpressEscalationReadCoordinator {
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

function calculatePortalFloorplanNotificationsWindow(
  startIso: string,
  windowDays: number = 21,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileVerifiedRefundReadLedgerItems(
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

function computeUnifiedDepositNotificationsBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeLedgerOverlockReadQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 30)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildBranchFacilityNotificationsReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface ScopedContractReadPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateScopedContractReadInput(payload: ScopedContractReadPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface DynamicAuditTrailNotificationsBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupDynamicAuditTrailNotificationsByScope(items: readonly DynamicAuditTrailNotificationsBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow7';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectDailyWorkforceReadChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupeStrictPolicyNotificationsRecords<T extends { id: string }>(items: readonly T[]): T[] {
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

function canTransitionBoundedProrationReadState(fromState: string, toState: string): boolean {
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

type GuardLiquidationNotificationsRecord = {
  readonly id: string;
  readonly status: string;
};

function isGuardLiquidationNotificationsRecord(input: unknown): input is GuardLiquidationNotificationsRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function buildActiveZoneReadViewModel(
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

const SYNCED_MOVEOUT_NOTIFICATIONS_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveSyncedMoveoutNotificationsTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return SYNCED_MOVEOUT_NOTIFICATIONS_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatCoreOccupancyMetricReadDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesMonthlyInvoiceNotificationsCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class PrimaryPromotionReadCoordinator {
  private readonly maxWindowDays = 37;
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

function calculateRollingHandoverNotificationsWindow(
  startIso: string,
  windowDays: number = 17,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileBatchRenewalReadLedgerItems(
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

function computePendingCorridorNotificationsBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeIndexedInspectionReadQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 30)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildStandardQuoteNotificationsReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface TenantBillingCycleReadPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateTenantBillingCycleReadInput(payload: TenantBillingCycleReadPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface SecondaryDiscountNotificationsBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupSecondaryDiscountNotificationsByScope(items: readonly SecondaryDiscountNotificationsBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow7';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectExpressCheckinReadChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupePortalSupportTicketNotificationsRecords<T extends { id: string }>(items: readonly T[]): T[] {
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

function canTransitionVerifiedUnitSlotReadState(fromState: string, toState: string): boolean {
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

type UnifiedSettlementNotificationsRecord = {
  readonly id: string;
  readonly status: string;
};

function isUnifiedSettlementNotificationsRecord(input: unknown): input is UnifiedSettlementNotificationsRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function buildLedgerBookingReadViewModel(
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

const BRANCH_DELINQUENCY_NOTIFICATIONS_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveBranchDelinquencyNotificationsTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return BRANCH_DELINQUENCY_NOTIFICATIONS_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatScopedApprovalReadDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

const STRICT_INDEXED_AUDITTRAIL_LABELS: Record<string, string> = {
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
};
