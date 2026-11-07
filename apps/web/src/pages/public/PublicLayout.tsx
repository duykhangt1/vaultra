import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Menu, X, Phone, Mail, MapPin, ArrowRight, Clock, Globe } from 'lucide-react';
import { AtmosphereLayer, useAtmos, usePageEnv, Scene } from '@/cinema/Atmosphere';
import { RouteCurtain } from '@/cinema/Transition';
import { SmoothScroll } from '@/cinema/smooth';
import { Headline, Magnetic } from '@/cinema/kit';
import { ENV } from '@/cinema/tokens';
import { Logo } from '@/layouts/Logo';
import { useAuth, topWorkspace } from '@/lib/auth';
import { useI18n, tr } from '@/lib/i18n';
import { useGet } from '@/lib/hooks';
import { Button, cn } from '@/ui';
import { Container } from '@/ui/brand';

export const LINKS: [string, string][] = [['/locations', 'Cơ sở'], ['/size-guide', 'Chọn kích thước'], ['/business', 'Doanh nghiệp'], ['/pricing-policy', 'Bảng giá & chính sách'], ['/about', 'Về Vaultra']];
/** Compact labels for the desktop bar (the full names stay on the mobile menu and the page transition). */
const SHORT: Record<string, string> = { '/size-guide': 'Kích thước', '/pricing-policy': 'Bảng giá' };
/** Pages without a dark media hero get a solid header and top padding. */
const SOLID = /^\/(login|register|verify-email|forgot-password|reset-password|accept-invite|link-google|book|payment|sign-contract)/;
/** Sign-in style pages are a single focused screen: no footer. */
const AUTH_PAGE = /^\/(login|register|verify-email|forgot-password|reset-password|accept-invite|link-google)/;
const EXTRA: [RegExp, string][] = [[/^\/$/, 'Trang chủ'], [/^\/locations\/.+/, 'Cơ sở'], [/^\/book/, 'Đặt kho'], [/^\/sign-contract/, 'Ký hợp đồng'], [/^\/payment/, 'Thanh toán'], [/^\/(login|register|verify-email|forgot-password|reset-password|accept-invite|link-google)/, 'Tài khoản'], [/^\/faq/, 'Hỏi đáp'], [/^\/contact/, 'Liên hệ'], [/^\/(terms|privacy)/, 'Điều khoản']];
/** Plate label the route curtain carries to the destination. */
export function routeLabel(path: string) {
  const hit = LINKS.find(([to]) => path === to) ?? null;
  if (hit) return hit[1];
  return EXTRA.find(([re]) => re.test(path))?.[1] ?? 'Vaultra';
}

export default function PublicLayout() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [going, setGoing] = useState(false);
  const { status, roles } = useAuth();
  const { locale, toggleLocale } = useI18n();
  const { pathname } = useLocation();
  const solid = SOLID.test(pathname);
  const tone = ENV[useAtmos((s) => s.env)].tone;
  const content = useRef<HTMLElement>(null);
  const labelFor = useCallback((p: string) => tr(routeLabel(p)), [locale]);
  usePageEnv('paper');
  useEffect(() => { setOpen(false); setGoing(false); }, [pathname]);
  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 24);
    h(); window.addEventListener('scroll', h, { passive: true });
    return () => window.removeEventListener('scroll', h);
  }, []);
  const filled = solid || scrolled || open;
  const light = filled && tone === 'light' && !open;
  return (
    <div className="flex min-h-dvh flex-col">
      <SmoothScroll />
      <AtmosphereLayer />
      <RouteCurtain labelFor={labelFor} contentRef={content} />
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-lg focus:bg-white focus:px-3 focus:py-2">{tr('Bỏ qua điều hướng')}</a>
      <header className={cn('fixed inset-x-0 top-0 z-40 transition-[background-color,border-color,color] duration-500', light ? 'border-b border-ink-900/10 bg-paper/88 backdrop-blur-md' : filled ? 'border-b hairline-dark bg-ink-950/90 backdrop-blur-md' : 'bg-gradient-to-b from-ink-950/70 to-transparent')}>
        <div className="mx-auto flex h-[68px] max-w-[1320px] items-center gap-3 px-4 sm:px-6 lg:px-6 xl:gap-4 2xl:gap-8 2xl:px-8">
          <Link to="/" aria-label="Vaultra — trang chủ" className="shrink-0"><Logo light={!light} /></Link>
          <nav className="hidden items-center gap-0.5 whitespace-nowrap xl:flex" aria-label="Điều hướng">
            {LINKS.map(([to, l]) => <NavLink key={to} to={to} className={({ isActive }) => cn('whitespace-nowrap rounded-lg px-2 py-2 text-[13.5px] font-semibold transition 2xl:px-3.5 2xl:text-[14px]', isActive ? (light ? 'text-brass-700' : 'text-brass-400') : light ? 'text-steel-600 hover:text-ink-900' : 'text-steel-200 hover:text-white')}>{tr(SHORT[to] ?? l)}</NavLink>)}
          </nav>
          <div className="ml-auto hidden shrink-0 items-center gap-2 whitespace-nowrap lg:flex">
            <a href="tel:19006868" className={cn('mr-2 hidden items-center gap-2 font-mono text-[13px] 2xl:flex', light ? 'text-steel-600 hover:text-ink-900' : 'text-steel-300 hover:text-white')}><Phone className="size-4 text-brass-400" />1900 6868</a>
            <button onClick={() => toggleLocale(status === 'authed')} data-no-translate className={cn('inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-bold uppercase', light ? 'border-ink-900/15 text-ink-900 hover:border-ink-900/40' : 'border-white/20 bg-white/8 text-white hover:border-white/40')} aria-label="Đổi ngôn ngữ / Switch language">
              <Globe className="size-3.5 text-brass-400" />{locale.toUpperCase()}
            </button>
            {status === 'loading'
              ? <span className={cn('h-8 w-32 animate-pulse rounded-lg', light ? 'bg-ink-900/10' : 'bg-white/15')} role="status" aria-label="Đang kiểm tra đăng nhập" />
              : status === 'authed'
                ? <Link to={topWorkspace(roles)} onClick={() => setGoing(true)}><Button variant={light ? 'outline' : 'glass'} size="sm" loading={going}>{tr('Vào tài khoản')}</Button></Link>
                : <><Link to="/login"><Button variant="ghost" size="sm" className={light ? '' : 'text-white hover:bg-white/10'}>{tr('Đăng nhập')}</Button></Link></>}
            <Magnetic strength={0.22}><Link to="/book"><Button variant="primary" size="sm">{tr('Đặt kho ngay')}</Button></Link></Magnetic>
          </div>
          <div className="ml-auto flex items-center gap-2 lg:hidden">
            <button onClick={() => toggleLocale(status === 'authed')} data-no-translate className={cn('inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-bold uppercase', light ? 'border-ink-900/15 text-ink-900' : 'border-white/20 bg-white/8 text-white')} aria-label="Đổi ngôn ngữ / Switch language">
              <Globe className="size-3.5 text-brass-400" />{locale.toUpperCase()}
            </button>
            <button className={cn('rounded-lg p-2', light ? 'text-ink-900' : 'text-white')} onClick={() => setOpen((o) => !o)} aria-label={open ? 'Đóng menu' : 'Mở menu'} aria-expanded={open}>{open ? <X /> : <Menu />}</button>
          </div>
        </div>
        {open && (
          <div className="max-h-[calc(100dvh-68px)] overflow-y-auto border-t hairline-dark bg-ink-950 px-4 pb-6 pt-2 lg:hidden">
            {LINKS.map(([to, l], i) => <Link key={to} to={to} className="flex items-center justify-between border-b hairline-dark py-4 text-lg font-semibold text-white"><span><span className="mr-3 font-mono text-xs text-brass-400">0{i + 1}</span>{tr(l)}</span><ArrowRight className="size-4 text-steel-400" /></Link>)}
            <div className="mt-5 grid grid-cols-2 gap-2">{status === 'authed' ? <Link className="col-span-2" to={topWorkspace(roles)}><Button variant="glass" className="w-full">{tr('Vào tài khoản')}</Button></Link> : <><Link to="/login"><Button variant="glass" className="w-full">{tr('Đăng nhập')}</Button></Link><Link to="/register"><Button variant="glass" className="w-full">{tr('Đăng ký')}</Button></Link></>}<Link className="col-span-2" to="/book"><Button variant="primary" size="lg" className="w-full">{tr('Đặt kho ngay')}</Button></Link></div>
          </div>
        )}
      </header>
      <main id="main" ref={content} className={cn('flex-1', solid && 'pt-[68px]')}>
        <Outlet key={locale} />
      </main>
      {!AUTH_PAGE.test(pathname) && <Footer />}
    </div>
  );
}

function Footer() {
  const fac = useGet<{ data: any[] }>('/catalog/facilities', undefined, { staleTime: 300_000 });
  return (
    <Scene as="footer" env="night" className="grain overflow-hidden bg-ink-950 !text-steel-300">
      <div className="door-lines pointer-events-none absolute inset-x-0 top-0 h-24 opacity-60" aria-hidden />
      <Container className="relative">
        <div className="flex flex-wrap items-end justify-between gap-8 border-b hairline-dark pb-12 pt-20">
          <Headline as="p" className="display max-w-2xl text-[34px] text-white sm:text-[46px]">Một chỗ an toàn cho mọi thứ <span className="text-brass-400">chưa cần mang về.</span></Headline>
          <div className="flex flex-wrap gap-3"><Link to="/book"><Button variant="primary" size="lg">{tr('Đặt kho ngay')}</Button></Link><Link to="/contact"><Button variant="glass" size="lg">{tr('Nói chuyện với chúng tôi')}</Button></Link></div>
        </div>
        <div className="grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Logo light />
            <p className="mt-4 max-w-xs text-sm leading-relaxed">Kho tự quản cho gia đình và doanh nghiệp. Đặt online, nhận kho có hẹn, ra vào bằng mã PIN riêng trong giờ truy cập.</p>
            <ul className="mt-6 space-y-2.5 text-sm">
              <li><a href="tel:19006868" className="inline-flex items-center gap-2.5 font-semibold text-white hover:text-brass-400"><Phone className="size-4 text-brass-400" />Hotline 1900 6868</a></li>
              <li className="inline-flex items-center gap-2.5"><Mail className="size-4 text-brass-400" />hotro@vaultra.test</li>
              <li className="flex items-center gap-2.5"><Clock className="size-4 text-brass-400" />Văn phòng 08:00–18:00, T2–T7</li>
            </ul>
          </div>
          <FooterCol title={tr('Khám phá')} links={[['/locations', tr('Tất cả cơ sở')], ['/book', tr('Đặt kho')], ['/size-guide', tr('Công cụ chọn kích thước')], ['/pricing-policy', tr('Bảng giá & chính sách')]]} />
          <div>
            <p className="eyebrow mb-4 text-brass-400">{tr('Cơ sở')}</p>
            <ul className="space-y-3 text-sm">{(fac.data?.data ?? []).map((f) => <li key={f.id}><Link to={`/locations/${f.slug}`} className="group flex items-start gap-2 hover:text-white"><MapPin className="mt-0.5 size-4 shrink-0 text-steel-500 group-hover:text-brass-400" /><span><span className="block font-semibold text-steel-200 group-hover:text-white">{f.name}</span><span className="text-xs text-steel-400">{f.district}, {f.province}</span></span></Link></li>)}</ul>
          </div>
          <FooterCol title={tr('Công ty')} links={[['/about', tr('Về Vaultra')], ['/business', tr('Giải pháp doanh nghiệp')], ['/faq', tr('Câu hỏi thường gặp')], ['/contact', tr('Liên hệ')], ['/terms', tr('Điều khoản sử dụng')], ['/privacy', tr('Chính sách bảo mật')]]} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t hairline-dark py-6 font-mono text-[11.5px] tracking-wider text-steel-400">
          <span>© 2026 VAULTRA SELF-STORAGE · DỰ ÁN HỌC PHẦN</span>
        </div>
      </Container>
    </Scene>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return <div><p className="eyebrow mb-4 text-brass-400">{title}</p><ul className="space-y-2.5 text-sm">{links.map(([to, l]) => <li key={to}><Link className="hover:text-white" to={to}>{l}</Link></li>)}</ul></div>;
}
