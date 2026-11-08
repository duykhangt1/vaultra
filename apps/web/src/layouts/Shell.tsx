import { ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Bell, ChevronDown, ChevronRight, Home, LogOut, Menu as MenuIcon, Search, X, Building2, ArrowLeftRight, Settings, Globe, Plus, Check } from 'lucide-react';
import { useAuth, allowedWorkspaces } from '@/lib/auth';
import { WORKSPACE_LABEL, relTime } from '@/lib/format';
import { useI18n, tr } from '@/lib/i18n';
import { useGet, useAct } from '@/lib/hooks';
import { post } from '@/lib/api';
import { cn, Avatar, Menu, Badge } from '@/ui';
import { GlobalSearch } from '@/widgets/GlobalSearch';
import { Logo } from './Logo';

export type NavItem = { to: string; label: string; icon: ReactNode; end?: boolean; perm?: string; badge?: number };

function resolveCurrentLabel(pathname: string, items: NavItem[], fallback: string): string {
  const sorted = [...items].sort((a, b) => b.to.length - a.to.length);
  for (const n of sorted) {
    if (n.end) {
      if (pathname === n.to || pathname === `${n.to}/`) return n.label;
    } else if (pathname === n.to || pathname.startsWith(`${n.to}/`)) {
      return n.label;
    }
  }
  if (pathname.includes('/checkin/')) return 'Check-in nhận kho';
  if (pathname.includes('/moveout/')) return 'Kiểm tra trả kho';
  if (pathname.endsWith('/notifications')) return 'Thông báo';
  if (pathname.endsWith('/account')) return 'Tài khoản';
  if (pathname.endsWith('/kb') || pathname.endsWith('/chatbot')) return 'RAG AI & Tri thức';
  return items[0]?.label ?? fallback;
}

/** Shared chrome for the five signed-in areas: sidebar (desktop) / bottom bar or drawer (mobile), facility switcher, bell, ⌘K. */
export function Shell({ workspace, nav, bottom, tone: _tone = 'light', title }: { workspace: string; nav: NavItem[]; bottom?: NavItem[]; tone?: 'light' | 'dark'; title: string }) {
  const { user, roles, facilities, activeFacilityId, setFacility, logout, can } = useAuth();
  const { locale, toggleLocale } = useI18n();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState(false);
  const loc = useLocation();
  const nav2 = useNavigate();

  useEffect(() => setOpen(false), [loc.pathname]);

  const mainRef = useRef<HTMLElement>(null);
  const lastPath = useRef(loc.pathname);
  useLayoutEffect(() => {
    const el = mainRef.current;
    if (!el || lastPath.current === loc.pathname) return;
    lastPath.current = loc.pathname;
    el.classList.remove('route-in');
    void el.offsetWidth;
    el.classList.add('route-in');
  }, [loc.pathname]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearch(true);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const items = useMemo(() => nav.filter((n) => !n.perm || can(n.perm)), [nav, can]);
  const { primaryItems, personalItems } = useMemo(() => {
    const personal = items.filter((n) => n.to.endsWith('/notifications') || n.to.endsWith('/account'));
    const primary = items.filter((n) => !n.to.endsWith('/notifications') && !n.to.endsWith('/account'));
    return { primaryItems: primary, personalItems: personal };
  }, [items]);

  const spaces = useMemo(() => Array.from(new Set(allowedWorkspaces(roles))), [roles]);
  const showFacility = (facilities?.length ?? 0) > 0 && workspace !== '/ops' && workspace !== '/admin';
  const workspaceName = WORKSPACE_LABEL[workspace] ?? title;
  const currentLabel = useMemo(() => resolveCurrentLabel(loc.pathname, items, title), [loc.pathname, items, title]);
  const accountPath = workspace === '/app' ? '/app/account' : `${workspace}/account`;
  const activeFacility = facilities?.find((f) => f.id === activeFacilityId);

  const handleLogout = async () => {
    await logout();
    nav2('/login');
  };

  const userMenuItems = [
    ...spaces
      .filter((s) => s !== workspace)
      .map((s) => ({
        label: `${locale === 'en' ? 'Switch to' : 'Chuyển sang'}: ${tr(WORKSPACE_LABEL[s])}`,
        icon: <ArrowLeftRight className="size-4 text-brass-600" />,
        onSelect: () => nav2(s),
      })),
    ...(spaces.length > 1 ? ['sep' as const] : []),
    {
      label: tr('Tài khoản & bảo mật'),
      icon: <Settings className="size-4 text-steel-500" />,
      onSelect: () => nav2(accountPath),
    },
    {
      label: tr('Về trang chủ'),
      icon: <Home className="size-4 text-steel-500" />,
      onSelect: () => nav2('/'),
    },
    'sep' as const,
    {
      label: tr('Đăng xuất'),
      icon: <LogOut className="size-4" />,
      danger: true,
      onSelect: handleLogout,
    },
  ];

  const renderNavItem = (n: NavItem) => (
    <NavLink
      key={n.to}
      to={n.to}
      end={n.end}
      className={({ isActive }) =>
        cn(
          'group relative flex items-center gap-3 rounded-xl px-3 py-2 text-[13.5px] font-medium transition-all duration-150',
          isActive
            ? 'bg-white/[0.09] font-semibold text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.08),0_1px_2px_rgb(0_0_0/0.25)] before:absolute before:bottom-2 before:left-0 before:top-2 before:w-[3px] before:rounded-r-full before:bg-brass-400 before:shadow-[0_0_10px_rgb(221_176_101/0.75)]'
            : 'text-steel-300/90 hover:bg-white/[0.05] hover:text-white',
        )
      }
    >
      {({ isActive }) => (
        <>
          <span className={cn('size-[18px] shrink-0 transition-colors [&>svg]:size-[18px]', isActive ? 'text-brass-400' : 'text-steel-400 group-hover:text-brass-400/85')}>
            {n.icon}
          </span>
          <span className="flex-1 truncate">{tr(n.label)}</span>
          {n.badge ? (
            <span className="rounded-full bg-brass-500 px-1.5 py-0.5 font-mono text-[10.5px] font-bold leading-none text-ink-950 num">
              {n.badge}
            </span>
          ) : null}
        </>
      )}
    </NavLink>
  );

  const SideNav = (
    <nav className="relative flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-3 no-scrollbar" aria-label="Điều hướng chính">
      {primaryItems.map(renderNavItem)}
      {personalItems.length > 0 && (
        <>
          <div className="my-2 border-t border-white/[0.07] px-3 pb-1 pt-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-steel-400/75">
            {tr('Cá nhân')}
          </div>
          {personalItems.map(renderNavItem)}
        </>
      )}
    </nav>
  );

  const WorkspacePills = spaces.length > 1 && (
    <div className="mt-2.5 flex flex-wrap gap-1 rounded-xl border border-white/[0.08] bg-black/25 p-1" role="navigation" aria-label="Chuyển không gian làm việc">
      {spaces.map((s) => (
        <Link
          key={s}
          to={s}
          className={cn(
            'flex-1 rounded-lg px-2 py-1 text-center text-[11px] font-semibold whitespace-nowrap transition',
            s === workspace ? 'bg-brass-500 font-bold text-ink-950 shadow-2xs' : 'text-steel-300 hover:bg-white/[0.07] hover:text-white',
          )}
        >
          {tr(WORKSPACE_LABEL[s] ?? s)}
        </Link>
      ))}
    </div>
  );

  return (
    <div className="min-h-dvh bg-[#f5f2eb] lg:grid lg:grid-cols-[264px_1fr]">
      {/* ─── Desktop Vault Sidebar ─── */}
      <aside className="sticky top-0 hidden h-dvh flex-col overflow-hidden border-r border-white/[0.08] bg-[#08111e] text-white shadow-[6px_0_28px_-14px_rgb(8_18_31/0.55)] lg:flex">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-[radial-gradient(120%_90%_at_15%_0%,rgb(200_150_62/0.15),transparent_70%)]" aria-hidden />
        <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(90deg,rgb(255_255_255/0.016)_0_1px,transparent_1px_28px)]" aria-hidden />

        <div className="relative border-b border-white/[0.07] px-5 pb-4 pt-5">
          <div className="flex items-center justify-between gap-2">
            <Link to="/" aria-label={tr('Về trang chủ')} title={tr('Về trang chủ')} className="inline-flex items-center transition hover:opacity-90">
              <Logo light />
            </Link>
            <Link
              to="/"
              aria-label={tr('Về trang chủ')}
              title={tr('Về trang chủ')}
              className="grid size-7 place-items-center rounded-lg border border-white/[0.09] bg-white/[0.04] text-steel-300 transition hover:border-brass-400/40 hover:bg-white/[0.08] hover:text-brass-400"
            >
              <Home className="size-3.5" />
            </Link>
          </div>

          {WorkspacePills}
        </div>

        {SideNav}

        {/* Elevated User Profile Keycard */}
        <div className="relative border-t border-white/[0.08] p-3">
          <div className="rounded-2xl border border-white/[0.1] bg-gradient-to-b from-white/[0.065] to-white/[0.025] p-2.5 shadow-[inset_0_1px_0_rgb(255_255_255/0.06)]">
            <Menu
              trigger={
                <button type="button" className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl p-1.5 text-left transition hover:bg-white/[0.06]">
                  <Avatar name={user?.fullName} size={36} className="ring-2 ring-brass-400/45" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-bold text-white">{user?.fullName || tr('Tài khoản')}</span>
                    <span className="block truncate text-[11.5px] text-steel-400">{user?.email}</span>
                  </span>
                  <ChevronDown className="size-4 shrink-0 text-steel-400" />
                </button>
              }
              items={userMenuItems}
            />
            <div className="mt-2 grid grid-cols-2 gap-1.5 border-t border-white/[0.08] pt-2">
              <Link
                to="/"
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2 py-1.5 text-[11.5px] font-semibold text-steel-200 transition hover:border-brass-400/40 hover:bg-white/[0.08] hover:text-white"
              >
                <Home className="size-3.5 text-brass-400" />
                <span className="truncate">{tr('Trang chủ')}</span>
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2 py-1.5 text-[11.5px] font-semibold text-steel-300 transition hover:border-bad-600/45 hover:bg-bad-600/15 hover:text-red-200"
              >
                <LogOut className="size-3.5" />
                <span className="truncate">{tr('Đăng xuất')}</span>
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* ─── Right Workspace Frame ─── */}
      <div className="relative flex min-w-0 flex-col bg-[#f5f2eb]">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(85%_100%_at_50%_0%,rgb(255_255_255/0.8),transparent_100%)]" aria-hidden />

        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-steel-200/80 bg-white/85 px-3 backdrop-blur-md shadow-[0_1px_2px_rgb(14_27_44/0.03)] sm:gap-2.5 sm:px-6 lg:h-16">
          <button type="button" className="cursor-pointer rounded-xl p-2 text-ink-900 transition hover:bg-steel-100 lg:hidden" onClick={() => setOpen(true)} aria-label="Mở menu">
            <MenuIcon className="size-5" />
          </button>
          <Link to={workspace} className="lg:hidden">
            <Logo compact />
          </Link>

          {/* Dynamic Breadcrumb Indicator */}
          <div className="hidden min-w-0 items-center gap-2 lg:flex">
            <span className="text-xs font-medium text-steel-400">{tr(workspaceName)}</span>
            <ChevronRight className="size-3.5 shrink-0 text-steel-300" />
            <span className="truncate text-sm font-bold tracking-tight text-ink-950">{tr(currentLabel)}</span>
          </div>

          {showFacility && (
            <Menu
              trigger={
                <button
                  type="button"
                  className={cn(
                    'flex max-w-[44vw] cursor-pointer items-center gap-2 rounded-xl border border-steel-200/90 bg-[#faf8f4] px-2.5 py-1.5 text-[13px] font-semibold text-ink-900 shadow-2xs transition hover:border-brass-500/60 hover:bg-white',
                    'lg:ml-3',
                  )}
                >
                  <span className="grid size-6 shrink-0 place-items-center rounded-md bg-brass-100 text-brass-700">
                    <Building2 className="size-3.5" />
                  </span>
                  <span className="truncate">{activeFacility?.name ?? tr('Chọn cơ sở')}</span>
                  {facilities!.length > 1 && <ChevronDown className="size-4 shrink-0 text-steel-400" />}
                </button>
              }
              items={facilities!.map((f) => ({
                label: <span className={cn('flex-1', f.id === activeFacilityId && 'font-bold text-ink-950')}>{f.name}</span>,
                icon: f.id === activeFacilityId ? <Check className="size-4 text-brass-600" /> : <Building2 className="size-4 text-steel-400" />,
                onSelect: () => setFacility(f.id),
              }))}
            />
          )}

          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => setSearch(true)}
              className="flex cursor-pointer items-center gap-2 rounded-xl border border-steel-200/90 bg-[#faf8f4]/90 px-2.5 py-1.5 text-[13px] text-steel-500 transition hover:border-ink-900/30 hover:bg-white sm:min-w-52 md:min-w-60"
              aria-label="Tìm kiếm"
            >
              <Search className="size-4 shrink-0 text-steel-400" />
              <span className="hidden truncate sm:inline">{tr('Tìm mã đơn, khách, kho…')}</span>
              <kbd className="ml-auto hidden rounded-md border border-steel-200 bg-white px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-steel-500 shadow-2xs sm:inline">Ctrl K</kbd>
            </button>

            {workspace === '/app' && (
              <Link
                to="/book"
                className="hidden items-center gap-1.5 rounded-xl bg-brass-500 px-3 py-1.5 text-[13px] font-bold text-ink-950 shadow-[inset_0_-1px_0_rgb(0_0_0/0.15)] transition hover:bg-brass-400 xl:inline-flex"
              >
                <Plus className="size-3.5" />
                {tr('Đặt kho mới')}
              </Link>
            )}

            <Link
              to="/"
              className="hidden items-center gap-1.5 rounded-xl border border-steel-200/90 bg-white px-2.5 py-1.5 text-[13px] font-semibold text-ink-900 shadow-2xs transition hover:border-ink-900/35 hover:bg-[#fcfbf8] sm:inline-flex"
              aria-label={tr('Về trang chủ')}
              title={tr('Về trang chủ')}
            >
              <Home className="size-3.5 text-brass-700" />
              <span className="hidden md:inline">{tr('Trang chủ')}</span>
            </Link>

            <button
              type="button"
              onClick={() => toggleLocale(true)}
              data-no-translate
              className="inline-flex cursor-pointer items-center gap-1 rounded-xl border border-steel-200/90 bg-white px-2.5 py-1.5 text-xs font-bold uppercase text-ink-900 shadow-2xs transition hover:border-ink-900/35 hover:bg-[#fcfbf8]"
              aria-label="Đổi ngôn ngữ / Switch language"
            >
              <Globe className="size-3.5 text-brass-700" />
              {locale.toUpperCase()}
            </button>

            <Bell2 workspace={workspace} />

            <Menu
              trigger={
                <button
                  type="button"
                  aria-label={user?.fullName ?? 'Tài khoản'}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-steel-200/90 bg-white p-1 pr-1.5 shadow-2xs transition hover:border-brass-500/50 sm:pr-2.5"
                >
                  <Avatar name={user?.fullName} size={28} />
                  <span className="hidden max-w-24 truncate text-xs font-semibold text-ink-900 xl:inline">
                    {user?.fullName?.split(/\s+/).slice(-1)[0] ?? tr('Tài khoản')}
                  </span>
                  <ChevronDown className="size-3.5 text-steel-400" />
                </button>
              }
              items={userMenuItems}
            />
          </div>
        </header>

        <main ref={mainRef} className={cn('relative mx-auto w-full max-w-[1320px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-7', bottom && 'pb-28 lg:pb-9')}>
          <Outlet key={locale} />
        </main>

        {/* Mobile Floating/Docked Glass Bar */}
        {bottom && (
          <nav
            className="safe-bottom fixed inset-x-0 bottom-0 z-30 grid border-t border-steel-200/85 bg-white/92 px-1 pt-1.5 backdrop-blur-xl shadow-[0_-8px_28px_-12px_rgb(8_18_31/0.16)] lg:hidden"
            style={{ gridTemplateColumns: `repeat(${bottom.length}, 1fr)` }}
            aria-label="Điều hướng nhanh"
          >
            {bottom.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) => cn('flex flex-col items-center gap-0.5 py-1.5 text-[10.5px] font-semibold transition-colors', isActive ? 'font-bold text-ink-950' : 'text-steel-500')}
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={cn(
                        'relative grid h-7 w-12 place-items-center rounded-full transition-all [&>svg]:size-[18px]',
                        isActive ? 'bg-ink-950 text-brass-400 shadow-xs ring-1 ring-brass-400/35' : 'text-steel-400',
                      )}
                    >
                      {n.icon}
                    </span>
                    <span className="max-w-full truncate px-1">{tr(n.label)}</span>
                  </>
                )}
              </NavLink>
            ))}
          </nav>
        )}
      </div>

      {/* ─── Mobile Vault Drawer ─── */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink-950/65 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
          <div className="relative inset-y-0 left-0 flex h-full w-76 max-w-[86vw] flex-col overflow-hidden border-r border-white/10 bg-[#08111e] text-white shadow-2xl">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-[radial-gradient(120%_90%_at_15%_0%,rgb(200_150_62/0.16),transparent_70%)]" aria-hidden />
            <div className="relative border-b border-white/[0.08] px-4 pb-3.5 pt-4">
              <div className="flex items-center justify-between">
                <Logo light />
                <button type="button" onClick={() => setOpen(false)} className="cursor-pointer rounded-lg p-1.5 text-steel-300 hover:bg-white/10 hover:text-white" aria-label="Đóng">
                  <X className="size-5" />
                </button>
              </div>
              {WorkspacePills}
            </div>

            {SideNav}

            <div className="relative border-t border-white/[0.08] p-3">
              <div className="mb-2 flex items-center gap-2.5 px-2 py-1">
                <Avatar name={user?.fullName} size={34} className="ring-2 ring-brass-400/40" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-white">{user?.fullName}</p>
                  <p className="truncate text-xs text-steel-400">{user?.email}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <Link to="/" className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-xs font-semibold text-white hover:bg-white/10">
                  <Home className="size-3.5 text-brass-400" />
                  {tr('Trang chủ')}
                </Link>
                <button type="button" onClick={handleLogout} className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-xs font-semibold text-steel-300 hover:bg-bad-600/20 hover:text-red-200">
                  <LogOut className="size-3.5" />
                  {tr('Đăng xuất')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <GlobalSearch open={search} onClose={() => setSearch(false)} workspace={workspace} />
    </div>
  );
}

function Bell2({ workspace }: { workspace: string }) {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const { data, refetch } = useGet<{ data: any[]; unread: number }>('/notifications', { 'page[size]': 8 }, { refetchInterval: 30_000 });
  const readAll = useAct(() => post('/notifications/read-all'), { invalidate: ['/notifications'] });
  const read = useAct((id: string) => post(`/notifications/${id}/read`), { invalidate: ['/notifications'] });
  useEffect(() => {
    const h = () => refetch();
    window.addEventListener('vaultra:notification', h);
    return () => window.removeEventListener('vaultra:notification', h);
  }, [refetch]);

  const unread = data?.unread ?? 0;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'relative grid size-9 cursor-pointer place-items-center rounded-xl border transition',
          open ? 'border-brass-500/60 bg-brass-100/40 text-ink-950' : 'border-steel-200/90 bg-white text-ink-900 shadow-2xs hover:border-ink-900/35 hover:bg-[#fcfbf8]',
        )}
        aria-label={`Thông báo${unread ? ` (${unread} chưa đọc)` : ''}`}
      >
        <Bell className="size-[18px]" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 grid min-w-[18px] place-items-center rounded-full bg-brass-500 px-1 py-0.5 font-mono text-[10px] font-bold leading-none text-ink-950 ring-2 ring-white num">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-[min(92vw,390px)] overflow-hidden rounded-2xl border border-steel-200/90 bg-white shadow-[0_22px_54px_-12px_rgb(8_18_31/0.35)]">
            <div className="flex items-center justify-between border-b border-steel-200/80 bg-gradient-to-b from-[#fcfbf8] to-white px-4 py-3">
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-ink-950">{tr('Thông báo')}</p>
                {unread > 0 && <Badge tone="brass">{unread} {tr('mới')}</Badge>}
              </div>
              {unread > 0 && (
                <button type="button" className="cursor-pointer text-xs font-semibold text-brass-700 hover:text-ink-950 hover:underline" onClick={() => readAll.mutate(undefined)}>
                  {tr('Đánh dấu đã đọc')}
                </button>
              )}
            </div>
            <ul className="max-h-[60vh] divide-y divide-steel-100 overflow-y-auto">
              {data?.data.length ? (
                data.data.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => {
                        if (!n.read_at) read.mutate(n.id);
                        setOpen(false);
                        if (n.link) nav(n.link);
                      }}
                      className={cn(
                        'flex w-full cursor-pointer gap-3 px-4 py-3.5 text-left transition-colors hover:bg-[#faf8f4]',
                        !n.read_at && 'bg-brass-100/30',
                      )}
                    >
                      <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', !n.read_at ? 'bg-brass-500 shadow-[0_0_6px_rgb(200_150_62/0.6)]' : 'bg-steel-200')} />
                      <span className="min-w-0 flex-1">
                        <span className={cn('block text-sm text-ink-950', !n.read_at ? 'font-bold' : 'font-medium')}>{n.title}</span>
                        <span className="mt-0.5 line-clamp-2 text-[12.5px] leading-relaxed text-steel-500">{n.body}</span>
                        <span className="mt-1 block font-mono text-[11px] text-steel-400">{relTime(n.created_at)}</span>
                      </span>
                      {n.priority === 'HIGH' && <Badge tone="bad">{tr('Quan trọng')}</Badge>}
                    </button>
                  </li>
                ))
              ) : (
                <li className="px-4 py-12 text-center text-sm text-steel-500">{tr('Chưa có thông báo')}</li>
              )}
            </ul>
            <Link
              to={`${workspace}/notifications`}
              onClick={() => setOpen(false)}
              className="block border-t border-steel-200/80 bg-[#fcfbf8] px-4 py-3 text-center text-xs font-bold uppercase tracking-wider text-ink-900 transition hover:bg-brass-100/40 hover:text-brass-700"
            >
              {tr('Xem tất cả')}
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
