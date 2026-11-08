import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, KeyRound, Camera, Thermometer, Truck, Smartphone, ShieldCheck, CalendarCheck, Boxes, RefreshCw, MapPin, Check, Plus, Minus, Building2, GraduationCap, Home as HomeIcon, Car, ArrowDown } from 'lucide-react';
import { useGet } from '@/lib/hooks';
import { vnd, addDaysYmd, ymd, normalizeProvinceList } from '@/lib/format';
import { FILM, SCENES, STEP_IMAGES, SIZE_GUIDE, facilityCover, facilityDefaultCover, unitImageBySize, sm } from '@/lib/media';
import { Button, cn } from '@/ui';
import { Container, Plate, CropFrame, DimLine, Marquee, MediaImg, Eyebrow, dims } from '@/ui/brand';
import { Scene } from '@/cinema/Atmosphere';
import { CinemaVideo } from '@/cinema/CinemaVideo';
import { CountUp, Headline, Magnetic, useChoreography, usePointerDepth } from '@/cinema/kit';
import { afterIntro, gsap, lowPower, prefersReduced, scheduleRefresh, ScrollTrigger, useScene } from '@/cinema/motion';
import { MQ } from '@/cinema/tokens';
import { AMENITY_LABEL } from '@/lib/format';
import { PublicFloorPlanExplorer } from '@/widgets/FloorPlanView';

const Blueprint3D = lazy(() => import('@/cinema/Blueprint3D'));
const WIDE = MQ.wide;
const MOTION_OK = MQ.any;

/**
 * Home — "Một đêm đi vào két sắt". Nine scenes, each with its own environment and motion:
 * street (arrival) → corridor (4 steps, pinned) → blueprint (sizes, 3D scale model) → paper
 * (facilities, horizontal track) → vault (security, expanding portal) → dusk (people, layered
 * parallax) → receipt (pricing, printed rows) → paper (FAQ) → dawn (call to action).
 */
export function Home() {
  const facilities = useGet<{ data: any[]; provinces: any[] }>('/catalog/facilities', undefined, { staleTime: 60_000 });
  const types = useGet<{ data: any[] }>('/catalog/unit-types', { availableOnly: 'true' }, { staleTime: 60_000 });
  const policy = useGet<any>('/catalog/policy-summary', undefined, { staleTime: 30_000 });
  const fac = facilities.data?.data ?? [];
  const priceBySize = useMemo(() => { const m: Record<string, number> = {}; (types.data?.data ?? []).forEach((u) => { const p = Number(u.online_price); if (!(u.size_category in m) || p < m[u.size_category]) m[u.size_category] = p; }); return m; }, [types.data]);
  const freeUnits = fac.reduce((a, f) => a + (f.availableUnits ?? 0), 0);
  const minPrice = Math.min(...Object.values(priceBySize), Infinity);
  const hold = policy.data?.params?.hold_minutes ?? 15;
  const provinces = useMemo(() => normalizeProvinceList(facilities.data?.provinces), [facilities.data?.provinces]);
  useMarqueeVelocity();

  return (
    <>
      <HeroScene provinces={provinces} facCount={fac.length} freeUnits={freeUnits} minPrice={minPrice} hold={hold} />
      <Marquee items={['Camera 24/7', 'Mã PIN cá nhân', 'Hợp đồng điện tử', 'Giá đã gồm VAT', 'Cọc hoàn lại', 'Gia hạn 1 chạm', 'Hủy theo bậc thang', 'Nhật ký ra vào']} />
      <StepsScene hold={hold} />
      <SizeScene priceBySize={priceBySize} />
      <FacilitiesScene fac={fac} loading={facilities.isLoading} />
      <WayfindingScene />
      <VaultScene />
      <PeopleScene />
      <ReceiptScene policy={policy.data} />
      <FaqScene />
      <DawnScene />
    </>
  );
}

/* ───────────────────────── 00 · street — arrival ───────────────────────── */
function HeroScene({ provinces, facCount, freeUnits, minPrice, hold }: { provinces: any[]; facCount: number; freeUnits: number; minPrice: number; hold: number }) {
  const ref = useRef<HTMLElement>(null);
  const nav = useNavigate();
  const [province, setProvince] = useState('');
  const [size, setSize] = useState('');
  const [start, setStart] = useState(addDaysYmd(2));
  useScene(ref, ({ mm, q }) => {
    mm.add(MOTION_OK, () => {
      const tl = gsap.timeline({ paused: true });
      tl.fromTo(q('[data-zoom]'), { scale: 1.16 }, { scale: 1, duration: 2.6, ease: 'expo.out' }, 0)
        .from(q('[data-in]'), { y: 30, opacity: 0, duration: 1.1, ease: 'expo.out', stagger: 0.09 }, 0.55)
        .from(q('[data-rail] > *'), { opacity: 0, x: 12, duration: 0.8, stagger: 0.06 }, 0.9);
      return afterIntro(() => tl.play());
    });
    mm.add(WIDE, () => {
      const st = { trigger: ref.current, start: 'top top', end: 'bottom top', scrub: true };
      gsap.to(q('[data-media]'), { yPercent: 16, ease: 'none', scrollTrigger: st });
      gsap.to(q('[data-copy]'), { yPercent: -18, opacity: 0.1, ease: 'none', scrollTrigger: st });
      gsap.to(q('[data-rail]'), { yPercent: -60, ease: 'none', scrollTrigger: st });
      // the roller door comes down as we walk in — hands over to the corridor scene
      gsap.fromTo(q('[data-shutter]'), { clipPath: 'inset(0% 0% 100% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', ease: 'none', scrollTrigger: { trigger: ref.current, start: '55% top', end: 'bottom top', scrub: true } });
    });
  });
  return (
    <Scene ref={ref} env="street" className="isolate flex min-h-[100svh] flex-col overflow-hidden">
      <div data-media className="absolute inset-0 -z-10 will-change-transform">
        <div data-zoom className="absolute inset-0"><CinemaVideo src={FILM.hero} priority brightness={0.9} contrast={1.05} label="Hành lang kho với các cửa cuốn đánh số" /></div>
        <div className="absolute inset-0 shade-l" /><div className="absolute inset-0 vignette" /><div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-[#070f1b]" />
      </div>
      {provinces.length > 0 && (
        <div data-rail className="pointer-events-none absolute right-6 top-1/2 hidden -translate-y-1/2 flex-col items-center gap-4 font-mono text-[10.5px] uppercase tracking-[0.3em] text-steel-300 lg:flex" style={{ writingMode: 'vertical-rl' }}>
          <span className="h-16 w-px bg-brass-400/60" />{provinces.map((p) => <span key={p.slug}>{p.name}</span>)}<span className="h-16 w-px bg-brass-400/60" />
        </div>
      )}
      <Container className="flex flex-1 flex-col justify-end pb-14 pt-32 lg:pb-20">
        <div data-copy>
          <div data-in><Eyebrow dark className="mb-6">Cho thuê kho tự quản · {provinces.length ? provinces.map((p) => p.name).join(' · ') : 'Hà Nội · TP. Hồ Chí Minh'}</Eyebrow></div>
          <Headline as="h1" trigger="intro" className="display max-w-4xl text-[length:var(--text-hero)] leading-[0.98]">Chỗ riêng để cất<br /><span className="text-brass-400">đồ của bạn.</span></Headline>
          <p data-in className="mt-6 max-w-xl text-[17px] leading-relaxed text-steel-200 sm:text-lg">Thuê kho từ vài mét vuông, đặt và ký hợp đồng trực tuyến. Giá niêm yết đã gồm VAT, tiền cọc được hoàn lại khi bạn trả kho.</p>
        </div>
        <form data-in onSubmit={(e) => { e.preventDefault(); const p = new URLSearchParams(); if (province) p.set('province', province); if (size) p.set('size', size); if (start) p.set('start', start); nav(`/book?${p}`); }}
          className="mt-10 grid max-w-4xl gap-px overflow-hidden rounded-2xl border border-white/15 bg-white/15 shadow-[var(--shadow-pop)] backdrop-blur-md sm:grid-cols-[1fr_1fr_1fr_auto]" aria-label="Đặt kho">
          <label className="block bg-ink-950/70 px-4 py-3"><span className="eyebrow block text-brass-400">Khu vực</span><select value={province} onChange={(e) => setProvince(e.target.value)} className="mt-1 w-full bg-transparent text-[15px] font-semibold text-white outline-none [&>option]:text-ink-900"><option value="">Tất cả tỉnh/thành</option>{provinces.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}</select></label>
          <label className="block bg-ink-950/70 px-4 py-3"><span className="eyebrow block text-brass-400">Kích thước</span><select value={size} onChange={(e) => setSize(e.target.value)} className="mt-1 w-full bg-transparent text-[15px] font-semibold text-white outline-none [&>option]:text-ink-900"><option value="">Mọi cỡ kho</option>{SIZE_GUIDE.map((s) => <option key={s.size} value={s.size}>{s.title} · {s.area}</option>)}</select></label>
          <label className="block bg-ink-950/70 px-4 py-3"><span className="eyebrow block text-brass-400">Ngày nhận kho</span><input type="date" value={start} min={ymd(new Date())} onChange={(e) => setStart(e.target.value)} className="mt-1 w-full bg-transparent text-[15px] font-semibold text-white outline-none [color-scheme:dark]" /></label>
          <button type="submit" className="flex items-center justify-center gap-2 bg-brass-500 px-7 py-4 font-bold text-ink-950 transition hover:bg-brass-400">Đặt kho<ArrowRight className="size-4" /></button>
        </form>
        <div data-in className="mt-12 grid max-w-4xl grid-cols-2 gap-8 sm:grid-cols-4">
          <HeroStat value={facCount || null} label="Cơ sở" />
          <HeroStat value={freeUnits || null} label="Kho đang trống" />
          <HeroStat value={Number.isFinite(minPrice) ? Math.round(minPrice / 1000) : null} suffix="k" label="Giá từ / tháng" />
          <HeroStat value={hold} suffix="′" label="Giữ chỗ trực tuyến" />
        </div>
        <a data-in href="#steps" className="mt-10 hidden items-center gap-3 self-start font-mono text-[11px] uppercase tracking-[0.24em] text-steel-300 hover:text-white sm:inline-flex"><span className="grid size-9 place-items-center rounded-full border border-white/25"><ArrowDown className="scrollcue size-4" /></span>Xem vòng đời thuê kho</a>
      </Container>
      <div data-shutter aria-hidden className="door-lines-ink pointer-events-none absolute inset-0 z-10" style={{ clipPath: 'inset(0% 0% 100% 0%)' }} />
    </Scene>
  );
}
function HeroStat({ value, label, suffix }: { value: number | null; label: string; suffix?: string }) {
  return (
    <div className="border-l border-brass-500/50 pl-5">
      <p className="display text-[40px] leading-none text-white sm:text-[48px]"><CountUp value={value} suffix={suffix} /></p>
      <p className="eyebrow mt-3 text-brass-400">{label}</p>
    </div>
  );
}

/** The marquee belt speeds up and reverses with scroll velocity, then settles. */
function useMarqueeVelocity() {
  useEffect(() => {
    if (prefersReduced()) return;
    let rate = 1; let target = 1;
    const st = ScrollTrigger.create({ start: 0, end: 'max', onUpdate: (s) => { const v = s.getVelocity(); target = gsap.utils.clamp(-5, 5, (s.direction || 1) * (1 + Math.abs(v) / 350)); } });
    const tick = () => {
      target += (1 * Math.sign(target || 1) - target) * 0.04; rate += (target - rate) * 0.12;
      document.querySelectorAll<HTMLElement>('.marquee-track').forEach((el) => el.getAnimations().forEach((a) => { a.playbackRate = rate; }));
    };
    gsap.ticker.add(tick);
    return () => { st.kill(); gsap.ticker.remove(tick); };
  }, []);
}

/* ───────────────────────── 01 · corridor — four steps (pinned) ───────────────────────── */
function StepsScene({ hold }: { hold: number }) {
  const ref = useRef<HTMLElement>(null);
  const steps: [any, string, string, string][] = [
    [Boxes, 'Chọn cỡ kho', 'Liệt kê đồ cần cất, hệ thống gợi ý diện tích phù hợp.', STEP_IMAGES.step1],
    [CalendarCheck, `Giữ chỗ ${hold} phút`, 'Xem báo giá đầy đủ, thanh toán cọc và tháng đầu.', STEP_IMAGES.step2],
    [KeyRound, 'Nhận kho, nhận PIN', 'Cùng nhân viên kiểm tra kho, ký hợp đồng bằng OTP, nhận mã mở cửa.', STEP_IMAGES.step3],
    [RefreshCw, 'Gia hạn hoặc trả kho', 'Xem hóa đơn, gia hạn hoặc báo trả kho trong tài khoản.', STEP_IMAGES.step4],
  ];
  useChoreography(ref);
  useScene(ref, ({ mm, q }) => {
    mm.add(MQ.desktop, () => {
      const items = q('[data-step]'); const shots = q('[data-shot]'); const fills = q('[data-fill]');
      gsap.set(items.slice(1), { autoAlpha: 0, yPercent: 35 });
      gsap.set(shots.slice(1), { clipPath: 'inset(100% 0% 0% 0%)' });
      gsap.set(fills, { scaleX: 0, transformOrigin: '0% 50%' });
      const tl = gsap.timeline({ defaults: { ease: 'none' }, scrollTrigger: { trigger: q('[data-pin]')[0], pin: true, start: 'top top', end: () => `+=${window.innerHeight * 2.6}`, scrub: 0.8, anticipatePin: 1, invalidateOnRefresh: true } });
      tl.to(fills[0], { scaleX: 1, duration: 1 }, 0)
        // the corridor film dollies forward for the whole walk-through
        .fromTo(q('[data-corridor]'), { scale: 1.18, xPercent: 3 }, { scale: 1, xPercent: 0, duration: (items.length - 1) * 1.2 + 1.2 }, 0);
      for (let i = 1; i < items.length; i++) {
        const at = i * 1.2;
        tl.to(items[i - 1], { autoAlpha: 0, yPercent: -35, duration: 0.45, ease: 'power2.in' }, at)
          .to(items[i], { autoAlpha: 1, yPercent: 0, duration: 0.55, ease: 'power2.out' }, at + 0.25)
          .to(shots[i], { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.95, ease: 'power2.inOut' }, at)
          .fromTo(shots[i].querySelector('img'), { scale: 1.3 }, { scale: 1, duration: 1.2 }, at)
          .to(fills[i], { scaleX: 1, duration: 1 }, at);
      }
      tl.to({}, { duration: 0.5 });
    });
  }, [hold]);
  return (
    <Scene ref={ref} env="corridor" blend="street" id="steps" className="scroll-mt-0 overflow-hidden">
      <div data-pin className="relative lg:h-screen">
        <div aria-hidden className="absolute inset-0 overflow-hidden"><div data-corridor className="absolute inset-0 will-change-transform"><MediaImg src={SCENES.corridor} alt="" className="absolute inset-0" /></div><div className="absolute inset-0 bg-[#0a1626]/70" /><div className="absolute inset-0 vignette" /></div>
        <Container className="relative grid gap-12 py-24 lg:h-full lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-16 lg:py-0">
          <div>
            <p className="eyebrow mb-5 flex items-center gap-3 text-brass-400"><span className="num opacity-60">01</span>Vòng đời thuê kho</p>
            <Headline className="display text-[36px] sm:text-[48px] lg:text-[58px]">Trọn vòng đời thuê kho<br /><span className="text-brass-400">qua bốn bước.</span></Headline>
            <p data-reveal="rise" className="mt-5 max-w-lg text-[16px] leading-relaxed text-steel-300">Từ chọn cỡ, giữ chỗ, nhận kho đến gia hạn hay trả kho — bạn chỉ cần đến cơ sở một lần lúc bàn giao, mọi bước còn lại làm trên điện thoại.</p>
            <ol className="relative mt-12 space-y-12 lg:h-[200px] lg:space-y-0">
              {steps.map(([Icon, t, d, img], i) => (
                <li key={t} data-step className="lg:absolute lg:inset-x-0 lg:top-0">
                  <div className="flex items-start gap-5 sm:gap-7">
                    <span aria-hidden className="stencil shrink-0 text-[84px] text-brass-400 sm:text-[120px] lg:text-[150px]">0{i + 1}</span>
                    <div className="pt-2 sm:pt-4">
                      <div className="flex items-center gap-3"><Plate dark size="sm">BƯỚC 0{i + 1}</Plate><Icon className="size-5 text-brass-400" /></div>
                      <p className="display mt-4 text-[26px] sm:text-[32px]">{t}</p>
                      <p className="mt-2 max-w-sm text-[15px] leading-relaxed text-steel-300">{d}</p>
                    </div>
                  </div>
                  <div data-reveal="clip" className="mt-6 overflow-hidden rounded-[var(--radius-media)] lg:hidden"><MediaImg src={sm(img)} alt={t} eager className="aspect-[16/10]" /></div>
                </li>
              ))}
            </ol>
            <div className="mt-12 hidden gap-2 lg:flex" aria-hidden>{steps.map((s, i) => <span key={i} className="relative h-[3px] flex-1 overflow-hidden rounded-full bg-white/12"><span data-fill className="absolute inset-0 bg-brass-400" /></span>)}</div>
            <Link to="/size-guide" className="mt-10 inline-block"><Button variant="glass">Ước tính kích thước<ArrowRight className="size-4" /></Button></Link>
          </div>
          <div className="relative hidden lg:block">
            <CropFrame dark>
              <div className="relative aspect-[4/5] max-h-[72vh] overflow-hidden rounded-[var(--radius-media)]">
                {steps.map(([, t, , img]) => <div key={t} data-shot className="absolute inset-0"><MediaImg src={img} alt={t} eager className="absolute inset-0" /></div>)}
                <div className="pointer-events-none absolute inset-0 shade-b opacity-60" />
              </div>
            </CropFrame>
          </div>
        </Container>
      </div>
    </Scene>
  );
}

/* ───────────────────────── 02 · blueprint — sizes ───────────────────────── */
function SizeScene({ priceBySize }: { priceBySize: Record<string, number> }) {
  const ref = useRef<HTMLElement>(null);
  const [i, setI] = useState(2);
  const s = SIZE_GUIDE[i];
  const prev = useRef(i);
  const [prevSrc, setPrevSrc] = useState(unitImageBySize(SIZE_GUIDE[2].size));
  const [show3d] = useState(() => !lowPower() && !prefersReduced());
  const [near, setNear] = useState(false);
  useChoreography(ref);
  usePointerDepth(ref, 14);
  useEffect(() => {
    const el = ref.current; if (!el || !show3d) return;
    const io = new IntersectionObserver(([e]) => setNear(e.isIntersecting), { rootMargin: '20% 0px' });
    io.observe(el); return () => io.disconnect();
  }, [show3d]);
  // size change: the new photo wipes across like a door sliding, text & dimension lines redraw
  useLayoutEffect(() => {
    if (prev.current === i) return;
    const dir = i > prev.current ? 1 : -1; prev.current = i;
    const el = ref.current; if (!el || prefersReduced()) { setPrevSrc(unitImageBySize(s.size)); return; }
    const q = gsap.utils.selector(el);
    const tl = gsap.timeline({ onComplete: () => setPrevSrc(unitImageBySize(s.size)) });
    tl.fromTo(q('[data-photo]'), { clipPath: dir > 0 ? 'inset(0% 0% 0% 100%)' : 'inset(0% 100% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.9, ease: 'expo.inOut' })
      .fromTo(q('[data-photo] img'), { scale: 1.18, xPercent: dir * 6 }, { scale: 1, xPercent: 0, duration: 1.2, ease: 'expo.out' }, 0)
      .from(q('[data-swap]'), { y: 22, opacity: 0, duration: 0.6, stagger: 0.05, ease: 'power3.out' }, 0.1)
      .from(q('[data-dim]'), { scaleX: 0, transformOrigin: '0% 50%', duration: 0.8, stagger: 0.08, ease: 'expo.inOut' }, 0.15)
      .fromTo(q('[data-ghost]'), { yPercent: 12 * dir, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 1, ease: 'expo.out' }, 0);
    return () => { tl.kill(); };
  }, [i, s.size]);
  // active tab marker slides along the ruler
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const btn = el.querySelector<HTMLElement>(`[data-tab="${i}"]`); const mark = el.querySelector<HTMLElement>('[data-mark]');
    if (!btn || !mark) return;
    gsap.to(mark, { x: btn.offsetLeft, width: btn.offsetWidth, duration: prefersReduced() ? 0 : 0.6, ease: 'expo.out' });
  }, [i]);
  return (
    <Scene ref={ref} env="blueprint" blend="corridor" data-parallax className="blueprint overflow-hidden py-24 lg:py-32" id="sizes">
      <span data-speed="far" aria-hidden className="pointer-events-none absolute -right-[4vw] top-6 select-none"><span data-ghost className="stencil block text-[34vw] text-ink-900/[0.09] lg:text-[26vw]">{s.size}</span></span>
      <Container className="relative">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-2xl">
            <p className="eyebrow mb-4 flex items-center gap-3 text-brass-700"><span className="num opacity-60">02</span>Bản vẽ kích thước</p>
            <Headline className="display text-[36px] sm:text-[48px] lg:text-[60px]">Từ vài thùng đồ<br />đến cả kho hàng.</Headline>
            <p data-reveal="rise" className="mt-4 max-w-xl text-[16px] leading-relaxed text-steel-600 sm:text-[17px]">Chọn một cỡ để xem kích thước và những gì kho đó chứa được.</p>
          </div>
          <Link to="/size-guide"><Button variant="dark">Dùng công cụ ước tính<ArrowRight className="size-4" /></Button></Link>
        </div>
        {/* ruler */}
        <div className="relative mt-12">
          <div aria-hidden className="absolute inset-x-0 bottom-0 h-3 border-b border-ink-900/25" style={{ backgroundImage: 'repeating-linear-gradient(90deg, rgb(14 27 44 / 0.25) 0 1px, transparent 1px 24px)', backgroundSize: '24px 6px', backgroundRepeat: 'repeat-x', backgroundPosition: 'bottom' }} />
          <div className="no-scrollbar relative flex gap-1 overflow-x-auto pb-4" role="tablist" aria-label="Kích thước kho">
            <span data-mark aria-hidden className="absolute bottom-0 left-0 h-[3px] w-10 bg-brass-500" />
            {SIZE_GUIDE.map((x, k) => (
              <button key={x.size} data-tab={k} role="tab" aria-selected={k === i} onClick={() => setI(k)} className={cn('flex shrink-0 items-baseline gap-2.5 rounded-lg px-3.5 py-2.5 text-left transition', k === i ? 'text-ink-900' : 'text-steel-500 hover:text-ink-900')}>
                <span className={cn('font-mono text-xs', k === i ? 'text-brass-700' : '')}>{x.size}</span><span className="text-sm font-bold">{x.title}</span><span className="text-xs">{x.area}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="mt-10 grid gap-12 lg:grid-cols-[1.35fr_1fr] lg:items-center">
          <div className="relative">
            <CropFrame>
              <div data-reveal="clip" className="relative aspect-[4/3] overflow-hidden rounded-[var(--radius-media)] bg-ink-900">
                <MediaImg src={prevSrc} alt="" className="absolute inset-0" />
                <div data-photo className="absolute inset-0"><MediaImg src={unitImageBySize(s.size)} alt={`Mô phỏng ${s.title} ${s.area} với đồ đạc`} className="absolute inset-0" /></div>
              </div>
            </CropFrame>
            {show3d && (
              <div data-depth="0.5" className="absolute -bottom-10 -right-4 hidden w-[44%] overflow-hidden rounded-2xl border border-ink-900/15 bg-paper/85 shadow-[var(--shadow-pop)] backdrop-blur-md md:block lg:-right-10">
                <div className="aspect-square">{near && <Suspense fallback={<div className="size-full blueprint" />}><Blueprint3D dims={s.dims} active={near} /></Suspense>}</div>
                <p className="border-t border-ink-900/10 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-steel-600">Tỉ lệ thật · người cao 1,7 m · {dims(s.dims)}</p>
              </div>
            )}
          </div>
          <div>
            <div data-swap className="flex items-center gap-3"><Plate>{s.size}</Plate><span className="eyebrow text-steel-500">{s.for}</span></div>
            <p data-swap className="display mt-4 text-[44px] sm:text-[60px]">{s.title} <span className="text-brass-600">{s.area}</span></p>
            <p data-swap className="mt-4 text-[17px] leading-relaxed text-steel-600">{s.fits}</p>
            <div className="mt-8 space-y-3 rounded-xl border hairline bg-white/80 p-5 backdrop-blur">
              <div data-dim><DimLine value={s.dims[0]} label="RỘNG" /></div><div data-dim><DimLine value={s.dims[1]} label="SÂU" /></div><div data-dim><DimLine value={s.dims[2]} label="CAO" /></div>
              <p data-swap className="pt-1 font-mono text-xs text-steel-500">≈ {dims(s.dims)} · {(s.dims[0] * s.dims[1] * s.dims[2]).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} m³</p>
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
              <p data-swap><span className="text-sm text-steel-500">Giá từ</span><br /><span className="display text-3xl num">{priceBySize[s.size] ? vnd(priceBySize[s.size]) : '—'}</span><span className="text-sm text-steel-500"> /tháng</span></p>
              <Magnetic><Link to={`/book?size=${s.size}`}><Button variant="primary" size="lg">Đặt {s.title.toLowerCase()}<ArrowRight className="size-4" /></Button></Link></Magnetic>
            </div>
          </div>
        </div>
      </Container>
    </Scene>
  );
}

/* ───────────────────────── 03 · paper — facilities (horizontal track) ───────────────────────── */
function FacilitiesScene({ fac, loading }: { fac: any[]; loading: boolean }) {
  const ref = useRef<HTMLElement>(null);
  useChoreography(ref, [fac.length]);
  useEffect(() => {
    if (fac.length > 0) scheduleRefresh(120);
  }, [fac.length]);
  useScene(ref, ({ mm, q }) => {
    if (fac.length < 2) return;
    mm.add(MQ.desktop, () => {
      const track = q('[data-track]')[0] as HTMLElement;
      const dist = () => Math.max(0, track.scrollWidth - window.innerWidth + 48);
      const tw = gsap.to(track, { x: () => -dist(), ease: 'none', scrollTrigger: { trigger: q('[data-hpin]')[0], pin: true, start: 'top top', end: () => `+=${dist()}`, scrub: 0.7, invalidateOnRefresh: true, anticipatePin: 1 } });
      q('[data-frame-img]').forEach((img) => gsap.fromTo(img, { xPercent: -8 }, { xPercent: 8, ease: 'none', scrollTrigger: { trigger: img.closest('[data-frame]'), containerAnimation: tw, start: 'left right', end: 'right left', scrub: true } }));
      // fromTo + clearProps: the cards can never be left hidden at their start pose if the trigger is missed
      gsap.fromTo(q('[data-frame]'), { y: 60, opacity: 0 }, { y: 0, opacity: 1, stagger: 0.1, duration: 1, ease: 'expo.out', clearProps: 'opacity,transform', scrollTrigger: { trigger: q('[data-hpin]')[0], start: 'top 85%', once: true } });
      // safety net: whatever happens to the trigger, show the cards a few seconds after the section mounts
      const rescue = window.setTimeout(() => q('[data-frame]').forEach((el) => { if (getComputedStyle(el).opacity === '0') gsap.to(el, { y: 0, opacity: 1, duration: 0.6, clearProps: 'opacity,transform' }); }), 4500);
      return () => window.clearTimeout(rescue);
    });
  }, [fac.length]);
  return (
    <Scene ref={ref} env="paper" blend="blueprint" className="overflow-hidden">
      <div data-hpin className="relative py-24 lg:flex lg:h-screen lg:items-center lg:py-0">
        <div data-track className="no-scrollbar flex snap-x snap-mandatory gap-6 overflow-x-auto px-4 sm:px-6 lg:snap-none lg:gap-8 lg:overflow-visible lg:pl-[max(2rem,calc((100vw-1240px)/2+2rem))] lg:pr-16">
          <div className="flex w-[min(86vw,440px)] shrink-0 snap-start flex-col justify-center lg:w-[420px]">
            <p className="eyebrow mb-4 flex items-center gap-3 text-brass-700"><span className="num opacity-60">03</span>Cơ sở</p>
            <Headline className="display text-[36px] sm:text-[48px]">Cơ sở gần<br /><span className="text-brass-700">chỗ bạn ở.</span></Headline>
            <p data-reveal="rise" className="mt-5 text-[16px] leading-relaxed text-steel-600">Mỗi cơ sở có bảo vệ, camera và khu bốc dỡ hàng.</p>
            <Link to="/locations" className="mt-8 self-start"><Button variant="outline">Xem bản đồ cơ sở<ArrowRight className="size-4" /></Button></Link>
            <p className="mt-10 hidden items-center gap-3 font-mono text-[11px] uppercase tracking-[0.22em] text-steel-500 lg:flex" aria-hidden><span className="h-px w-10 bg-current" />Kéo để xem tiếp</p>
          </div>
          {loading ? [0, 1, 2].map((k) => <div key={k} className="skeleton aspect-[4/5] w-[min(82vw,520px)] shrink-0 rounded-[var(--radius-media)] lg:w-[32vw]" />) : fac.map((f, k) => <FacilityFrame key={f.id} f={f} index={k} />)}
        </div>
      </div>
    </Scene>
  );
}
// Each source photo is framed on its subject (doors / bollards / padlock) so the three cards read as one set.
const FRAME_FOCUS: Record<string, string> = { 'vaultra-cau-giay': 'object-[50%_72%]', 'vaultra-quan-7': 'object-[50%_55%]', 'vaultra-thu-duc': 'object-[62%_50%]' };
function FacilityFrame({ f, index }: { f: any; index: number }) {
  const free = f.availableUnits ?? 0;
  const amenities: string[] = (f.amenities ?? []).slice(0, 3);
  return (
    <Link data-frame to={`/locations/${f.slug}`} className="group relative flex w-[min(82vw,520px)] shrink-0 snap-start flex-col overflow-hidden rounded-[var(--radius-media)] border hairline bg-white text-ink-900 shadow-[0_18px_40px_-24px_rgba(22,33,58,.45)] transition-shadow duration-500 hover:shadow-[0_28px_50px_-24px_rgba(22,33,58,.6)] lg:w-[32vw] lg:max-w-[520px]">
      <div className="relative aspect-[4/3] overflow-hidden bg-ink-950">
        <div data-frame-img className="absolute inset-[-6%]">
          <MediaImg src={facilityCover(f)} fallbackSrc={facilityDefaultCover(f)} alt={`Mặt tiền ${f.name}`} className="absolute inset-0" imgClassName={cn('saturate-[.82] contrast-[1.04] transition duration-[1400ms] ease-out group-hover:scale-[1.05]', FRAME_FOCUS[f.slug] ?? 'object-center')} />
        </div>
        {/* one navy-and-brass grade over all three photos, so red, blue and yellow doors sit in the same palette */}
        <div className="pointer-events-none absolute inset-0 bg-[#16213a]/20 mix-blend-multiply" aria-hidden />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink-950/65 via-transparent to-ink-950/25" aria-hidden />
        <div className="absolute inset-x-0 top-0 flex items-center justify-between px-5 pt-4">
          <p className={cn('rounded-full px-3 py-1 text-[12.5px] font-semibold backdrop-blur', free > 0 ? 'bg-white/90 text-ink-900' : 'bg-bad-600/90 text-white')}>{free > 0 ? <><span className="num">{free}</span> kho còn trống</> : 'Hết chỗ'}</p>
          <span className="rounded-full bg-ink-950/55 px-2.5 py-1 font-mono text-[10.5px] tracking-[0.2em] text-white/85 backdrop-blur">{f.code}</span>
        </div>
        <span aria-hidden className="stencil absolute bottom-3 left-5 text-[64px] leading-none text-brass-400/90">{String(index + 1).padStart(2, '0')}</span>
      </div>
      <div className="flex flex-1 flex-col p-6">
        <p className="display text-[26px] leading-tight sm:text-[30px]">{f.name}</p>
        <p className="mt-2 flex items-start gap-1.5 text-sm text-steel-600"><MapPin className="mt-0.5 size-4 shrink-0 text-brass-600" />{f.address_line}, {f.district}, {f.province}</p>
        <div className="mt-4 flex min-h-[28px] flex-wrap gap-1.5">
          {amenities.map((a) => <span key={a} className="rounded-full border border-steel-200 bg-paper px-2.5 py-0.5 text-[11.5px] font-medium text-steel-600">{AMENITY_LABEL[a] ?? a}</span>)}
        </div>
        <div className="mt-auto flex items-end justify-between gap-4 border-t border-steel-200 pt-4">
          <div><p className="eyebrow text-steel-500">Giá từ</p><p className="mt-0.5 text-lg font-bold num">{vnd(f.priceFrom)}<span className="text-sm font-normal text-steel-500">/tháng</span></p></div>
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-ink-900 text-white transition group-hover:bg-brass-500 group-hover:text-ink-950"><ArrowRight className="size-4" /></span>
        </div>
      </div>
    </Link>
  );
}

/* ───────────────────────── 03B · corridor — 3D wayfinding floor plan explorer ───────────────────────── */
function WayfindingScene() {
  const ref = useRef<HTMLElement>(null);
  useChoreography(ref);
  return (
    <Scene ref={ref} env="paper" id="wayfinding-map" className="scroll-mt-16 overflow-hidden pb-20 pt-4 lg:pb-28 lg:pt-0">
      <Container className="relative">
        <div className="max-w-2xl">
          <Headline className="display text-[36px] leading-[1.06] sm:text-[48px]">
            Sơ đồ kho <span className="text-brass-700">và lối đi.</span>
          </Headline>
          <p data-reveal="rise" className="mt-4 text-[16px] leading-relaxed text-steel-600">
            Chọn cơ sở và bấm vào ô kho bất kỳ để xem vị trí thực tế cùng hướng dẫn đi bộ từ lối vào chính.
          </p>
        </div>

        <div className="mt-8 sm:mt-10">
          <PublicFloorPlanExplorer />
        </div>
      </Container>
    </Scene>
  );
}

/* ───────────────────────── 04 · vault — security (expanding portal) ───────────────────────── */
function VaultScene() {
  const ref = useRef<HTMLElement>(null);
  useChoreography(ref);
  useScene(ref, ({ mm, q }) => {
    mm.add(MQ.desktop, () => {
      gsap.set(q('[data-feature]'), { autoAlpha: 0, y: 40 });
      // the keypad film runs faster while the reader scrolls through the pin, settling back at rest
      const film = () => ref.current?.querySelector<HTMLVideoElement>('[data-portal] video');
      const rate = (r: number) => { const v = film(); if (v) v.playbackRate = r; };
      const tl = gsap.timeline({ scrollTrigger: { trigger: q('[data-vpin]')[0], pin: true, start: 'top top', end: () => `+=${window.innerHeight * 1.7}`, scrub: 0.8, anticipatePin: 1,
        onUpdate: (self) => rate(gsap.utils.clamp(0.5, 2, 0.6 + Math.abs(self.getVelocity()) / 1800)), onLeave: () => rate(1), onLeaveBack: () => rate(1) } });
      tl.fromTo(q('[data-portal]'), { clipPath: 'inset(24% 30% 30% 30% round 28px)', filter: 'brightness(0.45) saturate(0.4)' }, { clipPath: 'inset(0% 0% 0% 0% round 0px)', filter: 'brightness(1) saturate(1)', duration: 1, ease: 'power2.inOut' }, 0)
        .fromTo(q('[data-portal] img, [data-portal] video'), { scale: 1.35 }, { scale: 1, duration: 1, ease: 'power2.inOut' }, 0)
        .to(q('[data-vtitle]'), { yPercent: -30, scale: 0.86, transformOrigin: '0% 0%', duration: 1 }, 0)
        // the dial: arrives, spins through the combination, and the keyhole morphs into "access granted"
        .fromTo(q('[data-dial]'), { autoAlpha: 0, scale: 0.55, rotate: -90 }, { autoAlpha: 1, scale: 1, rotate: 0, duration: 0.6, ease: 'power2.out' }, 0.05)
        .to(q('[data-dial-ring]'), { rotate: 300, svgOrigin: '100 100', duration: 1.05, ease: 'power1.inOut' }, 0.2)
        .to(q('[data-dial-key]'), { morphSVG: CHECK_PATH, fill: '#ddb065', duration: 0.38, ease: 'power2.inOut' }, 1.15)
        .to(q('[data-dial-arc]'), { stroke: '#ddb065', strokeDashoffset: 0, duration: 0.95, ease: 'none' }, 0.2)
        .to(q('[data-dial-state="locked"]'), { autoAlpha: 0, y: -8, duration: 0.2 }, 1.15)
        .fromTo(q('[data-dial-state="open"]'), { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, duration: 0.25 }, 1.25)
        .to(q('[data-feature]'), { autoAlpha: 1, y: 0, stagger: 0.12, duration: 0.5, ease: 'power3.out' }, 0.85)
        .to({}, { duration: 0.35 });
    });
  });
  const features: [any, string, string][] = [
    [KeyRound, 'Mã mở cửa riêng', 'Mỗi hợp đồng một mã, đổi hoặc thu hồi ngay trong tài khoản. Mọi lần ra vào đều được ghi lại.'],
    [Camera, 'Camera và bảo vệ', 'Camera hoạt động suốt ngày đêm, bảo vệ trực tại cơ sở.'],
    [Truck, 'Xe vào tận cửa', 'Kho tầng trệt, lối cho xe tải, có xe đẩy.'],
    [Thermometer, 'Kho điều hòa', 'Hợp để cất tài liệu, đồ điện tử, đồ gỗ.'],
  ];
  return (
    <Scene ref={ref} env="vault" blend="corridor" className="overflow-hidden">
      <div data-vpin className="relative flex min-h-screen flex-col">
        <div data-portal aria-hidden className="absolute inset-0 overflow-hidden"><CinemaVideo src={FILM.keypad} brightness={0.85} saturate={0.9} /><div className="absolute inset-0 bg-[#070d15]/45" /><div className="absolute inset-0 shade-b" /></div>
        <Container className="relative z-10 pt-24 lg:pt-28">
          <VaultDial />
          <div data-vtitle>
            <p className="eyebrow mb-5 flex items-center gap-3 text-brass-400"><span className="num opacity-60">04</span>An ninh & tiện ích</p>
            <Headline className="display max-w-4xl text-[36px] sm:text-[52px] lg:text-[66px]">Kho của bạn, an toàn<br /><span className="text-brass-400">và dễ quản lý.</span></Headline>
          </div>
        </Container>
        <Container className="relative z-10 mt-auto grid gap-10 pb-16 pt-24 lg:grid-cols-[1.4fr_1fr] lg:items-end lg:pb-20">
          <ul className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
            {features.map(([Icon, t, d], k) => (
              <li key={t} data-feature className="border-t border-white/12 pt-5">
                <div className="flex items-center gap-3"><span className="font-mono text-[11px] text-brass-400">{String(k + 1).padStart(2, '0')}</span><Icon className="size-5 text-brass-400" /></div>
                <p className="mt-3 text-lg font-bold">{t}</p><p className="mt-1 text-sm leading-relaxed text-steel-300">{d}</p>
              </li>
            ))}
          </ul>
          <div data-feature className="rounded-2xl border border-white/12 bg-[#070d15]/80 p-5 backdrop-blur-md">
            <div className="flex items-center justify-between"><Smartphone className="size-5 text-brass-400" /><Plate dark size="sm">TÀI KHOẢN</Plate></div>
            <ul className="mt-4 space-y-2.5 text-sm">{['Xem hóa đơn và thanh toán', 'Gia hạn hợp đồng', 'Đặt lịch nhận hoặc trả kho', 'Nhắn tin cho bộ phận hỗ trợ'].map((t) => <li key={t} className="flex items-center gap-2.5 text-steel-200"><Check className="size-4 text-brass-400" />{t}</li>)}</ul>
            <div className="relative mt-5 overflow-hidden rounded-xl border border-white/12 bg-black/40 p-3 font-mono text-[11.5px]" aria-label="Ví dụ nhật ký ra vào">
              <span aria-hidden className="scanline pointer-events-none absolute inset-x-0 top-0 h-full bg-gradient-to-b from-transparent via-brass-400/10 to-transparent" />
              <div className="flex justify-between text-steel-400"><span>Kho A-104</span><span className="text-brass-400">Mở cửa thành công</span></div>
              <div className="mt-1.5 flex justify-between text-steel-300"><span>08:42 · Cổng chính</span><span>Mã ••••</span></div>
            </div>
          </div>
        </Container>
      </div>
    </Scene>
  );
}

const KEY_PATH = 'M100 74 C112 74 121 83 121 95 C121 103 117 109 110 113 L116 136 L84 136 L90 113 C83 109 79 103 79 95 C79 83 88 74 100 74 Z';
const CHECK_PATH = 'M72 101 L88 117 L128 77 L138 87 L88 137 L62 111 Z';
/** Combination dial (desktop only). Driven entirely by VaultScene's pinned timeline. */
function VaultDial() {
  const ticks = Array.from({ length: 40 }, (_, i) => i);
  return (
    <div data-dial aria-hidden className="pointer-events-none absolute right-8 top-24 hidden size-[230px] xl:block 2xl:size-[260px]" style={{ visibility: 'hidden' }}>
      <svg viewBox="0 0 200 200" className="size-full overflow-visible">
        <circle cx="100" cy="100" r="92" fill="#070d15" fillOpacity="0.55" stroke="rgb(221 176 101 / 0.22)" />
        <circle data-dial-arc cx="100" cy="100" r="92" fill="none" stroke="#ddb065" strokeWidth="2" strokeLinecap="round" pathLength={1} strokeDasharray="1" strokeDashoffset="1" transform="rotate(-90 100 100)" />
        <g data-dial-ring>
          {ticks.map((i) => <line key={i} x1="100" y1="16" x2="100" y2={i % 5 ? 23 : 30} stroke={i % 5 ? 'rgb(238 243 239 / 0.35)' : '#ddb065'} strokeWidth={i % 5 ? 1 : 2} transform={`rotate(${i * 9} 100 100)`} />)}
          <circle cx="100" cy="100" r="62" fill="none" stroke="rgb(238 243 239 / 0.14)" />
          <polygon points="100,40 95,50 105,50" fill="#ddb065" />
        </g>
        <path data-dial-key d={KEY_PATH} fill="#8a96a3" />
      </svg>
      <div className="relative -mt-2 h-5 text-center font-mono text-[11px] tracking-[0.2em]">
        <span data-dial-state="locked" className="absolute inset-x-0 text-steel-400">Đang khóa</span>
        <span data-dial-state="open" className="absolute inset-x-0 text-brass-400" style={{ visibility: 'hidden' }}>Đã mở</span>
      </div>
    </div>
  );
}

/* ───────────────────────── 05 · dusk — people (layered parallax) ───────────────────────── */
function PeopleScene() {
  const ref = useRef<HTMLElement>(null);
  useChoreography(ref);
  usePointerDepth(ref, 16);
  const people: [any, string, string, string, string, string][] = [
    [HomeIcon, 'Gia đình chuyển nhà', 'Cất đồ khi sửa nhà hoặc chờ nhận căn hộ mới.', unitImageBySize('L', true), '/book?size=L', 'back'],
    [Building2, 'Shop online & doanh nghiệp', 'Hàng tồn, tài liệu, thiết bị, có hóa đơn VAT.', sm(SCENES.business), '/business', 'front'],
    [GraduationCap, 'Sinh viên & người ở ghép', 'Gửi đồ khi nghỉ hè hoặc chuyển phòng trọ.', unitImageBySize('S', true), '/book?size=S', 'mid'],
    [Car, 'Xe & đồ cồng kềnh', 'Xe máy ít dùng, đồ thể thao, đồ cồng kềnh.', unitImageBySize('VEHICLE', true), '/book?size=XL', 'near'],
  ];
  return (
    <Scene ref={ref} env="dusk" blend="vault" data-parallax className="overflow-hidden py-24 lg:py-36">
      <Container>
        <div className="grid gap-8 lg:grid-cols-[1fr_1fr] lg:items-end">
          <div>
            <p className="eyebrow mb-4 flex items-center gap-3 text-brass-400"><span className="num opacity-60">05</span>Ai thuê kho</p>
            <Headline className="display text-[38px] sm:text-[54px] lg:text-[68px]">Bạn cần<br />chỗ cất đồ<br /><span className="text-brass-400">vì lý do gì?</span></Headline>
          </div>
          <p data-reveal="rise" className="max-w-md text-[16px] leading-relaxed text-steel-300 lg:justify-self-end">Chọn trường hợp gần với bạn để xem cỡ kho nên thuê.</p>
        </div>
        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
          {people.map(([Icon, t, d, img, to, speed], k) => (
            <div key={t} data-speed={speed} className={cn(k % 2 ? 'lg:mt-28' : '')}>
              <Link to={to} data-reveal="clip" data-delay={k * 90} className="group relative block overflow-hidden rounded-[var(--radius-media)] bg-ink-950">
                <div className="relative aspect-[3/4] overflow-hidden"><div data-depth={0.4 + k * 0.15} className="absolute inset-[-5%]"><MediaImg src={img} alt="" className="absolute inset-0" imgClassName="transition duration-[1200ms] ease-out group-hover:scale-[1.07]" /></div><div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/35 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-5"><Icon className="size-6 text-brass-400" /><p className="mt-3 text-lg font-bold text-white">{t}</p><p className="mt-1 text-sm text-steel-300">{d}</p><span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brass-400">Xem kho phù hợp<ArrowRight className="size-4 transition group-hover:translate-x-1" /></span></div>
                </div>
              </Link>
            </div>
          ))}
        </div>
      </Container>
    </Scene>
  );
}

/* ───────────────────────── 06 · receipt — transparent pricing ───────────────────────── */
function ReceiptScene({ policy }: { policy: any }) {
  const ref = useRef<HTMLElement>(null);
  const x = policy?.params;
  const rows: [string, string, string][] = x ? [
    ['Giữ chỗ', `${x.hold_minutes} phút`, 'Kho được khóa cho bạn trong lúc thanh toán.'],
    ['Tiền cọc', x.deposit_type === 'MONTHS_OF_RENT' ? `${x.deposit_value} tháng thuê` : vnd(x.deposit_value), 'Hoàn lại khi trả kho, sau khi trừ khoản hợp lệ.'],
    ['Phí quản lý', vnd(x.admin_fee), 'Thu một lần khi bắt đầu hợp đồng.'],
    ['Kỳ hạn', `${x.allowed_terms_months?.join(' · ')} tháng`, 'Trả hàng tháng hoặc trả trước cả kỳ.'],
    ['Ân hạn thanh toán', `${x.grace_days} ngày`, `Sau đó phí trễ ${x.late_fee_pct}% (tối đa ${vnd(x.late_fee_cap)}).`],
  ] : [];
  useChoreography(ref, [rows.length]);
  useScene(ref, ({ mm, q }) => {
    if (!rows.length) return;
    mm.add(MOTION_OK, () => {
      const tl = gsap.timeline({ scrollTrigger: { trigger: q('[data-slip]')[0], start: 'top 75%', once: true } });
      tl.from(q('[data-slip]'), { yPercent: 18, opacity: 0, duration: 1, ease: 'expo.out' })
        .from(q('[data-row]'), { clipPath: 'inset(0% 0% 100% 0%)', y: -10, duration: 0.55, stagger: 0.14, ease: 'power3.out' }, 0.25)
        .from(q('[data-stamp]'), { scale: 1.9, rotate: 8, opacity: 0, duration: 0.55, ease: 'back.out(2.4)' }, '-=0.1');
    });
  }, [rows.length]);
  return (
    <Scene ref={ref} env="receipt" blend="dusk" className="overflow-hidden py-24 lg:py-32">
      <Container className="grid gap-14 lg:grid-cols-[1fr_1.15fr] lg:items-center">
        <div>
          <p className="eyebrow mb-4 flex items-center gap-3 text-brass-700"><span className="num opacity-60">06</span>Bảng giá</p>
          <Headline className="display text-[38px] sm:text-[54px] lg:text-[64px]">Mọi khoản phí<br /><span className="text-brass-700">xem trước khi trả.</span></Headline>
          <p data-reveal="rise" className="mt-5 max-w-md text-[16px] leading-relaxed text-steel-600 sm:text-[17px]">Các khoản dưới đây lấy từ chính sách giá đang áp dụng{policy ? ` (phiên bản ${policy.version})` : ''}. Giá niêm yết đã gồm VAT {x?.vat_rate ?? 10}%.</p>
          <Link to="/pricing-policy" className="mt-8 inline-block"><Button variant="dark">Xem chính sách giá<ArrowRight className="size-4" /></Button></Link>
        </div>
        <div data-slip className="relative mx-auto w-full max-w-[560px] lg:mr-0">
          <span data-stamp aria-hidden className="absolute -top-5 right-5 z-10 rotate-[-7deg] rounded-md border-2 border-brass-700/80 bg-[#fbf8f1]/90 px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-brass-700 sm:right-6">Đã gồm VAT {x?.vat_rate ?? 10}%</span>
          <div className="receipt relative bg-[#fbf8f1] px-6 pb-8 pt-9 font-mono text-ink-900 shadow-[0_40px_80px_-40px_rgb(14_27_44/0.45)] sm:px-9">
            <div className="flex items-center justify-between border-b border-dashed border-ink-900/25 pb-4 text-[11px] uppercase tracking-[0.2em] text-steel-600"><span>Vaultra · Các khoản phí</span><span>{policy ? `Chính sách v${policy.version}` : '—'}</span></div>
            {rows.length ? rows.map(([k, v, d]) => (
              <div key={k} data-row className="grid gap-1 border-b border-dashed border-ink-900/15 py-4 sm:grid-cols-[1fr_auto] sm:items-baseline sm:gap-6">
                <div><p className="text-[11px] uppercase tracking-[0.16em] text-steel-600">{k}</p><p className="mt-1 font-sans text-[13.5px] leading-snug text-steel-600">{d}</p></div>
                <p className="display text-[22px] num text-ink-900 sm:text-right">{v}</p>
              </div>
            )) : <div className="space-y-3 py-4">{[0, 1, 2, 3].map((k) => <div key={k} className="skeleton h-10" />)}</div>}
            <div className="mt-5 flex items-start gap-3 font-sans text-[13px] leading-relaxed text-steel-600"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-brass-700" />Hủy đặt chỗ được hoàn tiền theo thời điểm hủy, xem bảng hoàn tiền trong chính sách.</div>
          </div>
        </div>
      </Container>
    </Scene>
  );
}

/* ───────────────────────── 07 · paper — FAQ ───────────────────────── */
function FaqScene() {
  const ref = useRef<HTMLElement>(null);
  useChoreography(ref);
  return (
    <Scene ref={ref} env="paper" blend="receipt" className="py-24 lg:py-32">
      <Container className="grid gap-12 lg:grid-cols-[1fr_1.3fr]">
        <div>
          <p className="eyebrow mb-4 flex items-center gap-3 text-brass-700"><span className="num opacity-60">07</span>Câu hỏi thường gặp</p>
          <Headline className="display text-[34px] sm:text-[44px]">Những điều<br />khách hay hỏi.</Headline>
          <p data-reveal="rise" className="mt-4 text-[16px] leading-relaxed text-steel-500">Chưa thấy câu trả lời? Hãy <Link to="/contact" className="font-semibold text-ink-900 underline decoration-brass-500 underline-offset-4">liên hệ với chúng tôi</Link>.</p>
          <Link to="/faq" className="mt-8 inline-block"><Button variant="outline">Tất cả câu hỏi</Button></Link>
        </div>
        <div data-reveal="rise"><FaqList items={HOME_FAQ} /></div>
      </Container>
    </Scene>
  );
}

/* ───────────────────────── 08 · dawn — call to action ───────────────────────── */
function DawnScene() {
  const ref = useRef<HTMLElement>(null);
  useScene(ref, ({ mm, q }) => {
    mm.add(WIDE, () => {
      const st = { trigger: ref.current, start: 'top bottom', end: 'bottom bottom', scrub: true };
      gsap.fromTo(q('[data-mega]'), { letterSpacing: '0.06em', xPercent: -4 }, { letterSpacing: '-0.035em', xPercent: 0, ease: 'none', scrollTrigger: st });
      gsap.fromTo(q('[data-dawn-media]'), { scale: 1.2, yPercent: -8 }, { scale: 1, yPercent: 0, ease: 'none', scrollTrigger: st });
    });
  });
  return (
    <Scene ref={ref} env="dawn" blend="paper" className="isolate overflow-hidden">
      <div data-dawn-media aria-hidden className="absolute inset-0 -z-10"><CinemaVideo src={FILM.dawn} brightness={0.7} saturate={0.95} /><div className="absolute inset-0 bg-gradient-to-r from-[#140e08] via-[#140e08]/80 to-[#140e08]/25" /><div className="absolute inset-0 vignette" /></div>
      <Container className="grid min-h-[86vh] content-end gap-10 py-24 lg:py-32">
        <Eyebrow dark>Bắt đầu thuê kho</Eyebrow>
        <p className="display text-[length:var(--text-scene)] leading-[0.95]"><span data-mega className="block">Còn kho trống,</span><span data-mega className="block">đặt ngay hôm nay.</span></p>
        <div className="flex flex-wrap items-center justify-between gap-6 border-t border-white/15 pt-8">
          <p className="max-w-md text-[17px] text-[#d9c9ae]">Báo giá đầy đủ trước khi thanh toán, giữ chỗ trong lúc bạn hoàn tất đặt thuê.</p>
          <div className="flex flex-wrap gap-3"><Magnetic><Link to="/book"><Button variant="primary" size="lg">Đặt kho ngay<ArrowRight className="size-4" /></Button></Link></Magnetic><Link to="/locations"><Button variant="glass" size="lg"><MapPin className="size-4" />Xem bản đồ cơ sở</Button></Link></div>
        </div>
      </Container>
    </Scene>
  );
}

export const HOME_FAQ: [string, string][] = [
  ['Tôi cần mang gì khi nhận kho?', 'Giấy tờ tùy thân (CCCD/Hộ chiếu) và mã đặt chỗ. Nhân viên kiểm tra kho cùng bạn, bạn ký hợp đồng điện tử bằng OTP rồi nhận mã PIN.'],
  ['Những gì không được cất trong kho?', 'Hàng cấm, chất dễ cháy nổ, hóa chất độc hại, thực phẩm tươi sống, động vật. Chi tiết trong điều khoản sử dụng.'],
  ['Tôi có thể vào kho lúc nào?', 'Trong giờ truy cập của từng cơ sở (thường 06:00–22:00 mỗi ngày) bằng mã PIN cá nhân. Giờ cụ thể ghi ở trang từng cơ sở.'],
  ['Hủy đặt chỗ có được hoàn tiền không?', 'Có, theo bậc thang: hủy càng sớm trước ngày nhận kho, tỷ lệ hoàn tiền thuê và cọc càng cao.'],
  ['Tôi quên mã PIN thì sao?', 'Vào Hợp đồng → Truy cập để đổi PIN sau khi xác thực. Nếu mất thẻ, báo mất để thu hồi ngay.'],
];
export function FaqList({ items, dark }: { items: [string, string][]; dark?: boolean }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className={cn('divide-y border-y', dark ? 'divide-white/10 border-white/10' : 'divide-ink-900/10 border-ink-900/10')}>
      {items.map(([q, a], i) => (
        <div key={q}>
          <button className="flex w-full items-center justify-between gap-6 py-5 text-left" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
            <span className="flex items-baseline gap-4"><span className="font-mono text-xs text-brass-700">{String(i + 1).padStart(2, '0')}</span><span className="text-[17px] font-semibold">{q}</span></span>
            <span className={cn('grid size-8 shrink-0 place-items-center rounded-full border transition', open === i ? 'border-ink-900 bg-ink-900 text-white' : 'hairline')}>{open === i ? <Minus className="size-4" /> : <Plus className="size-4" />}</span>
          </button>
          <div className={cn('grid transition-[grid-template-rows] duration-300', open === i ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}><div className="overflow-hidden"><p className="pb-6 pl-9 pr-12 leading-relaxed text-steel-600">{a}</p></div></div>
        </div>
      ))}
    </div>
  );
}
