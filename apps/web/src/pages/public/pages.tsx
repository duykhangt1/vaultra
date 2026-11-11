import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams, useLocation } from 'react-router-dom';
import { Camera, Clock, Thermometer, MapPin, Phone, ArrowRight, ArrowLeft, KeyRound, Check, Search, Scale, Truck, Zap, ShieldCheck, Package, ArrowUpDown, Plug, Layers, ChevronLeft, ChevronRight, X, Mail, Sparkles, Info, Send, Bot, Compass } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { useGet, useAct } from '@/lib/hooks';
import { post, newIdemKey } from '@/lib/api';
import { RichMessage, CardView } from '@/widgets/AssistantWidget';
import { useAuth } from '@/lib/auth';
import { vnd, fmtDate, fmtDateTime, SIZE_LABEL, AMENITY_LABEL, addDaysYmd, ymd, normalizeProvinceList } from '@/lib/format';
import { facilityCover, facilityDefaultCover, facilityGallery, unitImage, unitDefaultImage, sm, SCENES } from '@/lib/media';
import { Button, Badge, Card, Field, Input, Select, Alert, Async, EmptyState, Skeleton, Spinner, Stepper, Segmented, cn, ErrorState, Checkbox, Textarea, StatusBadge } from '@/ui';
import { toast } from '@/ui/toast';
import { Container, SectionHead, Plate, CropFrame, DimLine, Reveal, MediaImg, Eyebrow, dims } from '@/ui/brand';
import { PageHero } from '@/cinema/CinemaHero';
import { Scene } from '@/cinema/Atmosphere';
import { Headline } from '@/cinema/kit';
import { getLenis } from '@/cinema/lenisRef';
import { gsap, useScene } from '@/cinema/motion';
import { MQ } from '@/cinema/tokens';
import { MapView } from '@/widgets/MapView';
import { PublicFloorPlanExplorer } from '@/widgets/FloorPlanView';
import { SignaturePad } from '@/widgets/SignaturePad';
import { ReservationQrCard } from '../kit';

const AMENITY_ICON: Record<string, any> = { camera_24_7: Camera, bao_ve: ShieldCheck, thang_may: ArrowUpDown, dieu_hoa: Thermometer, bai_do_xe: Truck, xe_day: Package, cua_lon: Truck };

/* ───────── facility card ───────── */
export function FacilityCard({ f }: { f: any }) {
  const free = f.availableUnits ?? 0;
  return (
    <Link to={`/locations/${f.slug}`} className="group block overflow-hidden rounded-[var(--radius-media)] border hairline bg-white shadow-[var(--shadow-card)] transition duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-pop)]">
      <div className="relative aspect-[16/10]">
        <MediaImg src={sm(facilityCover(f))} fallbackSrc={sm(facilityDefaultCover(f))} alt={`Mặt tiền ${f.name}`} className="absolute inset-0" imgClassName="transition duration-700 group-hover:scale-105" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950/80 via-transparent to-ink-950/20" />
        <span className={cn('absolute left-4 top-4 rounded-md px-2.5 py-1 text-xs font-semibold text-white backdrop-blur', free > 0 ? 'bg-ink-950/70' : 'bg-bad-600/90')}>{free > 0 ? `${free} kho trống` : 'Hết chỗ'}</span>
        <Plate dark size="sm" className="absolute right-4 top-4">{f.code}</Plate>
        <div className="absolute inset-x-0 bottom-0 p-5 text-white"><p className="display text-2xl">{f.name}</p><p className="mt-1 flex items-center gap-1.5 text-sm text-steel-200"><MapPin className="size-4 shrink-0 text-brass-400" /><span className="truncate">{f.address_line}, {f.district}, {f.province}</span></p></div>
      </div>
      <div className="flex items-center justify-between gap-3 px-5 py-4">
        <div><p className="eyebrow text-steel-500">Giá từ</p><p className="mt-0.5 whitespace-nowrap font-bold num">{vnd(f.priceFrom)}<span className="text-sm font-normal text-steel-500">/tháng</span></p></div>
        <div className="flex -space-x-1.5">{(f.amenities ?? []).slice(0, 4).map((a: string) => { const I = AMENITY_ICON[a] ?? Check; return <span key={a} title={AMENITY_LABEL[a] ?? a} className="grid size-8 place-items-center rounded-full border-2 border-white bg-brass-100 text-brass-700"><I className="size-3.5" /></span>; })}</div>
        <span className="grid size-10 place-items-center rounded-full bg-ink-900 text-white transition group-hover:bg-brass-500 group-hover:text-ink-950"><ArrowRight className="size-4" /></span>
      </div>
    </Link>
  );
}

/** Facility gallery opens panel by panel like doors along a corridor, then the name types in. */
function FacilityHeroScene({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useScene(ref, ({ mm, q }) => {
    mm.add(MQ.any, () => {
      gsap.fromTo(q('[data-gallery]'), { clipPath: 'inset(100% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.2, stagger: 0.14, ease: 'expo.inOut' });
      gsap.fromTo(q('[data-gallery] img'), { scale: 1.25 }, { scale: 1, duration: 1.8, stagger: 0.14, ease: 'expo.out' });
    });
  });
  return <Scene ref={ref} env="street" className="bg-ink-950 pt-[68px] text-white">{children}</Scene>;
}

/* ───────── locations ───────── */
export function Locations() {
  const [sp] = useSearchParams();
  const [q, setQ] = useState(sp.get('q') ?? '');
  const [province, setProvince] = useState(sp.get('province') ?? '');
  const { data, isLoading, error, refetch } = useGet<{ data: any[]; provinces: any[] }>('/catalog/facilities', { province: province || undefined }, { staleTime: 30_000, keepPrevious: true });
  const provinces = useMemo(() => normalizeProvinceList(data?.provinces), [data?.provinces]);
  const rows = useMemo(() => (data?.data ?? []).filter((f) => !q || `${f.name} ${f.district} ${f.province} ${f.address_line}`.toLowerCase().includes(q.toLowerCase())), [data, q]);
  const total = rows.reduce((a, f) => a + (f.availableUnits ?? 0), 0);
  return (
    <>
      <PageHero env="street" opening="door" image={facilityCover({ slug: 'vaultra-quan-7' })} eyebrow="Mạng lưới cơ sở" title={<>Cơ sở Vaultra<br /><span className="text-brass-400">gần bạn nhất.</span></>} sub="Mỗi cơ sở đều có bảo vệ, camera toàn tuyến, khu bốc dỡ và giờ truy cập rộng. Chọn một cơ sở để xem kho còn trống.">
        <div className="mt-8 flex max-w-2xl flex-wrap gap-2 rounded-2xl border border-white/15 bg-ink-950/60 p-2 backdrop-blur">
          <div className="relative min-w-56 flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-steel-400" /><input className="h-11 w-full rounded-xl bg-white/8 pl-9 pr-3 text-white placeholder:text-steel-400 outline-none focus:ring-2 focus:ring-brass-400" placeholder="Tìm theo tên, quận, đường…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Tìm cơ sở" /></div>
          <select value={province} onChange={(e) => setProvince(e.target.value)} className="h-11 rounded-xl bg-white/8 px-3 text-sm font-semibold text-white outline-none [&>option]:text-ink-900" aria-label="Tỉnh/thành"><option value="">Tất cả tỉnh/thành</option>{provinces.map((p) => <option key={p.slug} value={p.slug}>{p.name} ({p.count})</option>)}</select>
        </div>
      </PageHero>
      <Container className="py-12">
        <p className="eyebrow mb-6 text-steel-500">{isLoading ? 'Đang tải…' : `${rows.length} cơ sở · ${total} kho đang trống`}</p>
        {error ? <ErrorState error={error} onRetry={refetch} /> : (
          <div className="grid gap-8 lg:grid-cols-[1fr_440px]">
            <div className="grid content-start gap-6 sm:grid-cols-2">{isLoading ? [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-80" />) : rows.length ? rows.map((f, i) => <Reveal key={f.id} delay={i * 60}><FacilityCard f={f} /></Reveal>) : <div className="sm:col-span-2"><EmptyState title="Không tìm thấy cơ sở phù hợp" hint="Thử đổi từ khóa hoặc bỏ lọc tỉnh/thành." /></div>}</div>
            <div className="lg:sticky lg:top-24 lg:h-[620px]"><MapView points={rows.filter((f) => f.latitude).map((f) => ({ id: f.id, lat: f.latitude, lng: f.longitude, label: f.name, sub: `${f.availableUnits} kho trống · từ ${vnd(f.priceFrom)}`, href: `/locations/${f.slug}` }))} className="h-80 lg:h-full" /></div>
          </div>
        )}
      </Container>
    </>
  );
}

/* ───────── unit type card ───────── */
const FEATURES = (u: any) => [u.climate_controlled && [Thermometer, 'Điều hòa'], u.drive_up && [Truck, 'Xe vào tận cửa'], u.power_outlet && [Plug, 'Ổ điện'], u.ground_floor && [Layers, 'Tầng trệt']].filter(Boolean) as [any, string][];
function UnitTypeCard({ u, facilitySlug, start }: { u: any; facilitySlug?: string; start?: string }) {
  const free = u.available ?? 0;
  return (
    <article className="group flex flex-col overflow-hidden rounded-[var(--radius-media)] border hairline bg-white shadow-[var(--shadow-card)] transition hover:shadow-[var(--shadow-pop)]">
      <div className="relative aspect-[4/3]">
        <MediaImg src={unitImage(u, true)} fallbackSrc={unitDefaultImage(u, true)} alt={`Mô phỏng ${u.name}`} className="absolute inset-0" imgClassName="transition duration-700 group-hover:scale-105" />
        <div className="absolute left-3 top-3 flex gap-1.5"><Plate dark size="sm">{u.size_category} · {u.area_m2} M²</Plate></div>
        <span className={cn('absolute right-3 top-3 rounded-full px-2.5 py-1 font-mono text-[11px] tracking-wider backdrop-blur', free > 0 ? 'bg-ink-950/70 text-white' : 'bg-bad-600/90 text-white')}>{free > 0 ? `Còn ${free} kho` : 'Hết chỗ'}</span>
        {u.autoPromotion && <span title={u.autoPromotion.name} className="absolute bottom-3 left-3 inline-flex max-w-[calc(100%-1.5rem)] items-center gap-1 rounded-full bg-brass-500 px-2.5 py-1 text-[11px] font-bold text-ink-950"><Sparkles className="size-3.5 shrink-0" /><span className="truncate">{u.autoPromotion.name}</span></span>}
      </div>
      <div className="flex flex-1 flex-col p-5">
        <p className="text-lg font-bold leading-tight">{u.name}</p>
        {u.facility && !facilitySlug && <Link to={`/locations/${u.facility.slug}`} className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-steel-500 hover:text-ink-900"><MapPin className="size-3.5" />{u.facility.name}</Link>}
        <div className="mt-3 flex flex-wrap items-baseline gap-x-2"><span className="display text-[24px] leading-none num">{vnd(u.online_price)}</span><span className="text-xs text-steel-500">/tháng · gồm VAT</span>{Number(u.list_price) > Number(u.online_price) && <span className="text-xs text-steel-400 line-through num">{vnd(u.list_price)}</span>}</div>
        <p className="mt-3 text-sm leading-relaxed text-steel-500">{u.fits_description}</p>
        <p className="mt-3 font-mono text-[11.5px] text-steel-500">{dims([u.width_m, u.depth_m, u.height_m])} · {u.volume_m3} m³</p>
        {FEATURES(u).length > 0 && <ul className="mt-3 flex flex-wrap gap-1.5">{FEATURES(u).map(([I, l]) => <li key={l} className="inline-flex items-center gap-1 rounded-full bg-paper px-2.5 py-1 text-xs font-medium text-ink-800"><I className="size-3.5 text-brass-700" />{l}</li>)}</ul>}
        <div className="mt-auto pt-5">{free > 0 && u.is_bookable ? <Link to={`/book/${u.id}?facility=${encodeURIComponent(u.facility?.slug ?? facilitySlug ?? '')}${start ? `&start=${start}` : ''}`}><Button variant="primary" className="w-full">Đặt kho này<ArrowRight className="size-4" /></Button></Link> : <Button variant="outline" className="w-full" disabled>Tạm hết chỗ</Button>}</div>
      </div>
    </article>
  );
}

/* ───────── facility detail ───────── */
export function FacilityDetail() {
  const { slug } = useParams();
  const q = useGet<any>(`/catalog/facilities/${slug}`);
  const [lb, setLb] = useState<number | null>(null);
  return (
    <Async q={q} skeleton={<div className="h-[70vh] bg-ink-950" />}>{(f) => {
      const shots = facilityGallery(f);
      const free = (f.unitTypes ?? []).reduce((a: number, u: any) => a + (u.available ?? 0), 0);
      const minP = Math.min(...(f.unitTypes ?? []).map((u: any) => Number(u.online_price)));
      return (
        <>
          <FacilityHeroScene>
            <div className="grid gap-1.5 p-1.5 md:h-[68vh] md:grid-cols-[2fr_1fr] md:grid-rows-2">
              {shots.slice(0, 3).map((s, i) => (
                <button key={s.src} data-gallery onClick={() => setLb(i)} className={cn('group relative overflow-hidden rounded-xl', i === 0 ? 'aspect-[16/10] md:row-span-2 md:aspect-auto' : 'hidden md:block')} aria-label={`Xem ảnh: ${s.caption}`}>
                  <MediaImg src={i === 0 ? s.src : sm(s.src)} alt={s.caption} eager={i === 0} className="absolute inset-0" imgClassName={cn('transition duration-700 group-hover:scale-105', i === 0 && 'kenburns')} />
                  {i === 0 && <div className="absolute inset-0 bg-gradient-to-t from-ink-950/95 via-ink-950/20 to-transparent" />}
                  {i === 2 && <span className="absolute bottom-3 right-3 rounded-full bg-ink-950/70 px-3 py-1.5 text-xs font-semibold backdrop-blur">Xem {shots.length} ảnh</span>}
                </button>
              ))}
            </div>
            <Container className="pointer-events-none absolute inset-x-0 bottom-0 pb-10 md:w-2/3 md:max-w-none md:pl-10">
              <div className="pointer-events-auto">
                <Link to="/locations" className="eyebrow inline-flex items-center gap-2 text-steel-300 hover:text-white"><ArrowLeft className="size-3.5" />Tất cả cơ sở</Link>
                <div className="mt-4 flex flex-wrap items-center gap-3"><Plate dark>{f.code}</Plate>{f.status === 'TEMPORARILY_CLOSED' ? <Badge tone="bad">Tạm đóng cửa</Badge> : <span className="text-sm font-semibold text-white">{free} kho trống</span>}</div>
                <Headline as="h1" trigger="mount" mode="chars" delay={0.4} className="display mt-3 text-[40px] sm:text-[60px]">{f.name}</Headline>
                <p className="mt-2 flex items-center gap-2 text-steel-200"><MapPin className="size-4 text-brass-400" />{f.address_line}, {f.district}, {f.province}</p>
              </div>
            </Container>
          </FacilityHeroScene>

          <Container className="grid gap-10 py-14 lg:grid-cols-[1fr_380px]">
            <div className="min-w-0 space-y-12">
              {f.notices?.length > 0 && <div className="space-y-2">{f.notices.map((n: any) => <Alert key={n.id} tone="warn" title={n.title}>{n.body}</Alert>)}</div>}
              <div>
                <Eyebrow>Giới thiệu</Eyebrow>
                <p className="mt-4 max-w-2xl text-[18px] leading-relaxed text-ink-800">{f.description}</p>
                <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{(f.amenities ?? []).map((a: string) => { const I = AMENITY_ICON[a] ?? Check; return <li key={a} className="flex items-center gap-3 rounded-xl border hairline bg-white px-4 py-3"><span className="grid size-9 place-items-center rounded-lg bg-brass-100 text-brass-700"><I className="size-4" /></span><span className="text-sm font-semibold">{AMENITY_LABEL[a] ?? a}</span></li>; })}</ul>
              </div>
              <div id="types" className="scroll-mt-24">
                <SectionHead eyebrow={`${f.unitTypes?.length ?? 0} loại kho`} title="Chọn kho tại cơ sở này" sub="Giá online đã gồm VAT. Số kho trống tính cho kỳ thuê 1 tháng bắt đầu từ hôm nay." />
                <div className="mt-8 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">{f.unitTypes?.map((u: any) => <UnitTypeCard key={u.id} u={u} facilitySlug={f.slug} />)}</div>
              </div>
              {f.zones?.length > 0 && (
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Eyebrow>Khu vực trong cơ sở</Eyebrow>
                    <a
                      href="#floor-plan"
                      onClick={(e) => {
                        const el = document.getElementById('floor-plan');
                        if (!el) return;
                        e.preventDefault();
                        const l = getLenis();
                        if (l) { l.resize(); l.scrollTo(el, { offset: -64, force: true }); }
                        else el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-brass-700 hover:underline"
                    >
                      <Compass className="size-3.5" />
                      Mở sơ đồ 3D & Đường đi ↓
                    </a>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">{f.zones.map((z: any) => <span key={z.id ?? z.code} className="rounded-lg border hairline bg-white px-3 py-2 text-sm"><span className="font-mono text-xs text-brass-700">{z.code}</span> · {z.name}</span>)}</div>
                </div>
              )}
              <div>
                <Eyebrow>Vị trí</Eyebrow>
                <div className="mt-4 h-80 overflow-hidden rounded-[var(--radius-media)]"><MapView points={f.latitude ? [{ id: f.id, lat: Number(f.latitude), lng: Number(f.longitude), label: f.name, sub: f.address_line }] : []} className="h-full" zoom={14} /></div>
              </div>
            </div>
            <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
              <div className="overflow-hidden rounded-[var(--radius-media)] bg-ink-950 text-white">
                <div className="door-lines p-6">
                  <p className="eyebrow text-brass-400">Giá từ</p>
                  <p className="display mt-1 text-[40px] num">{Number.isFinite(minP) ? vnd(minP) : '—'}<span className="text-base font-normal text-steel-400"> /tháng</span></p>
                  <a href="#types"><Button variant="primary" size="lg" className="mt-5 w-full">Chọn loại kho<ArrowRight className="size-4" /></Button></a>
                  <a
                    href="#floor-plan"
                    onClick={(e) => {
                      const el = document.getElementById('floor-plan');
                      if (!el) return;
                      e.preventDefault();
                      const l = getLenis();
                      if (l) { l.resize(); l.scrollTo(el, { offset: -64, force: true }); }
                      else el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                  >
                    <Button variant="glass" className="mt-2 w-full"><Compass className="size-4 text-brass-400" />Sơ đồ 3D & Đường đi</Button>
                  </a>
                  <Link to={`/contact?facility=${f.slug}`}><Button variant="glass" className="mt-2 w-full">Hẹn xem kho trước</Button></Link>
                </div>
                <div className="space-y-3 border-t hairline-dark p-6 text-sm">
                  <a href={`tel:${(f.phone ?? f.hotline ?? '').replace(/\s/g, '')}`} className="flex items-center gap-3 hover:text-brass-400"><Phone className="size-4 text-brass-400" />{f.phone ?? f.hotline}</a>
                  {f.email && <p className="flex items-center gap-3"><Mail className="size-4 text-brass-400" />{f.email}</p>}
                </div>
              </div>
              <Card className="p-5"><p className="mb-3 flex items-center gap-2 font-bold"><Clock className="size-4 text-brass-700" />Giờ hoạt động</p><HoursTable label="Văn phòng" h={f.office_hours} /><HoursTable label="Truy cập kho (mã PIN)" h={f.access_hours} /></Card>
            </aside>
          </Container>

          <section id="floor-plan" className="scroll-mt-20 border-t hairline bg-paper/60 py-14 lg:py-16">
            <Container>
              <SectionHead
                eyebrow="Sơ đồ cơ sở"
                title="Sơ đồ kho & lối đi"
                sub={`Xem vị trí từng kho tại ${f.name} và hướng dẫn đi bộ từ lối vào chính.`}
              />
              <div className="mt-8">
                <PublicFloorPlanExplorer facilitySlug={f.slug} />
              </div>
            </Container>
          </section>

          <Lightbox shots={shots} index={lb} onClose={() => setLb(null)} onIndex={setLb} />
        </>
      );
    }}</Async>
  );
}

function Lightbox({ shots, index, onClose, onIndex }: { shots: { src: string; caption: string }[]; index: number | null; onClose: () => void; onIndex: (i: number) => void }) {
  const n = shots.length;
  useEffect(() => {
    if (index === null) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'ArrowRight') onIndex((index + 1) % n); if (e.key === 'ArrowLeft') onIndex((index - 1 + n) % n); };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, [index, n, onIndex]);
  return (
    <Dialog.Root open={index !== null} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink-950/95" />
        <Dialog.Content className="fixed inset-0 z-50 flex flex-col p-4 text-white focus:outline-none sm:p-8">
          <div className="flex items-center justify-between"><Dialog.Title className="eyebrow text-steel-300">{index !== null ? `${index + 1} / ${n}` : ''}</Dialog.Title><Dialog.Close className="grid size-10 place-items-center rounded-full border border-white/20 hover:border-white" aria-label="Đóng"><X className="size-5" /></Dialog.Close></div>
          <Dialog.Description className="sr-only">Thư viện ảnh cơ sở</Dialog.Description>
          {index !== null && <div className="relative flex min-h-0 flex-1 items-center justify-center py-4"><img src={shots[index].src} alt={shots[index].caption} className="max-h-full max-w-full rounded-xl object-contain" /></div>}
          <div className="flex items-center justify-between gap-4">
            <button onClick={() => index !== null && onIndex((index - 1 + n) % n)} className="grid size-11 place-items-center rounded-full border border-white/20 hover:border-white" aria-label="Ảnh trước"><ChevronLeft /></button>
            <p className="text-center text-sm text-steel-300">{index !== null ? shots[index].caption : ''}</p>
            <button onClick={() => index !== null && onIndex((index + 1) % n)} className="grid size-11 place-items-center rounded-full border border-white/20 hover:border-white" aria-label="Ảnh sau"><ChevronRight /></button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const DAYS: [string, string][] = [['mon', 'T2'], ['tue', 'T3'], ['wed', 'T4'], ['thu', 'T5'], ['fri', 'T6'], ['sat', 'T7'], ['sun', 'CN']];
function HoursTable({ label, h }: { label: string; h: any }) {
  if (!h) return null;
  const today = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date().getDay()];
  return <div className="mb-4 last:mb-0"><p className="eyebrow text-steel-500">{label}</p><ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[13px]">{DAYS.map(([k, l]) => <li key={k} className={cn('flex justify-between rounded px-1.5 py-0.5', k === today && 'bg-brass-100 font-semibold')}><span>{l}</span><span className="num">{h[k] ? `${h[k][0]}–${h[k][1]}` : 'Đóng'}</span></li>)}</ul></div>;
}

/* ───────── unit search ───────── */
export function Units() {
  const [sp, setSp] = useSearchParams();
  const f = { size: sp.get('size') ?? '', province: sp.get('province') ?? '', climate: sp.get('climate') ?? '', max: sp.get('max') ?? '', sort: sp.get('sort') ?? 'price', start: sp.get('start') ?? '' };
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); setSp(n, { replace: true }); };
  const { data, isLoading, error, refetch } = useGet<{ data: any[] }>('/catalog/unit-types', { size: f.size || undefined, province: f.province || undefined, climate: f.climate || undefined, maxPrice: f.max || undefined, sort: f.sort === 'price_desc' ? 'price' : f.sort, startDate: f.start || undefined, availableOnly: 'true' }, { keepPrevious: true });
  const facs = useGet<{ provinces: any[] }>('/catalog/facilities', undefined, { staleTime: 120_000 });
  const [cmp, setCmp] = useState<string[]>([]);
  const rows = useMemo(() => { const r = [...(data?.data ?? [])]; if (f.sort === 'price_desc') r.reverse(); return r; }, [data, f.sort]);
  const active = [f.size, f.province, f.climate, f.max].filter(Boolean).length;
  return (
    <>
      <Scene env="corridor" className="grain overflow-hidden bg-ink-950 pt-[68px] text-white">
        <div className="absolute inset-0 opacity-35"><MediaImg src={SCENES.corridor} alt="" className="size-full" /></div><div className="absolute inset-0 bg-gradient-to-r from-ink-950 via-ink-950/85 to-ink-950/50" />
        <Container className="relative pb-10 pt-14">
          <Eyebrow dark>Tìm kho</Eyebrow>
          <Headline as="h1" trigger="mount" className="display mt-4 text-[40px] sm:text-[54px]">Kho còn trống <span className="text-brass-400">ngay lúc này.</span></Headline>
          <div className="mt-8 grid gap-2 rounded-2xl border border-white/15 bg-ink-950/60 p-2 backdrop-blur sm:grid-cols-2 lg:grid-cols-6">
            <DarkSelect label="Kích thước" value={f.size} onChange={(v) => set('size', v)} options={[['', 'Mọi kích thước'], ...['XS', 'S', 'M', 'L', 'XL'].map((s) => [s, SIZE_LABEL[s] ?? s] as [string, string])]} />
            <DarkSelect label="Khu vực" value={f.province} onChange={(v) => set('province', v)} options={[['', 'Mọi khu vực'], ...(facs.data?.provinces ?? []).map((p) => [p.slug, p.name] as [string, string])]} />
            <DarkSelect label="Điều hòa" value={f.climate} onChange={(v) => set('climate', v)} options={[['', 'Tất cả'], ['true', 'Có điều hòa']]} />
            <DarkSelect label="Giá tối đa" value={f.max} onChange={(v) => set('max', v)} options={[['', 'Bất kỳ'], ...[500000, 1000000, 2000000, 4000000].map((p) => [String(p), `Đến ${vnd(p)}`] as [string, string])]} />
            <label className="block rounded-xl bg-white/6 px-3 py-2"><span className="eyebrow block text-[10px] text-brass-400">Ngày nhận</span><input type="date" value={f.start} min={ymd(new Date())} onChange={(e) => set('start', e.target.value)} className="w-full bg-transparent text-sm font-semibold text-white outline-none [color-scheme:dark]" /></label>
            <DarkSelect label="Sắp xếp" value={f.sort} onChange={(v) => set('sort', v)} options={[['price', 'Giá tăng dần'], ['price_desc', 'Giá giảm dần'], ['area', 'Diện tích']]} />
          </div>
        </Container>
      </Scene>
      <Container className="py-10">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <p className="eyebrow text-steel-500">{isLoading ? 'Đang tìm…' : `${rows.length} loại kho phù hợp`}</p>
          <div className="flex items-center gap-3">{active > 0 && <button onClick={() => setSp(new URLSearchParams(), { replace: true })} className="text-sm font-semibold text-steel-500 hover:text-ink-900">Xóa {active} bộ lọc</button>}<Link to="/size-guide" className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-900 underline decoration-brass-500 underline-offset-4">Chưa biết chọn cỡ nào?</Link></div>
        </div>
        {error ? <ErrorState error={error} onRetry={refetch} /> : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {isLoading ? [0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-[30rem]" />) : rows.length ? rows.map((u, i) => (
              <Reveal key={u.id} delay={(i % 3) * 60} className="relative">
                <UnitTypeCard u={u} start={f.start} />
                <button onClick={() => setCmp((c) => c.includes(u.id) ? c.filter((x) => x !== u.id) : c.length < 3 ? [...c, u.id] : c)} className={cn('absolute bottom-[86px] right-5 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition', cmp.includes(u.id) ? 'border-ink-900 bg-ink-900 text-white' : 'hairline bg-white text-steel-600 hover:border-ink-900')} aria-pressed={cmp.includes(u.id)}>{cmp.includes(u.id) ? <Check className="size-3.5" /> : <Scale className="size-3.5" />}{cmp.includes(u.id) ? 'Đã chọn' : 'So sánh'}</button>
              </Reveal>
            )) : <div className="md:col-span-3"><EmptyState title="Không có kho phù hợp bộ lọc" hint="Nới lọc giá hoặc khu vực để xem thêm lựa chọn." action={<Button variant="outline" onClick={() => setSp(new URLSearchParams(), { replace: true })}>Xóa bộ lọc</Button>} /></div>}
          </div>
        )}
      </Container>
      {cmp.length > 0 && (
        <div className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t hairline-dark bg-ink-950/95 text-white backdrop-blur">
          <Container className="flex items-center justify-between gap-4 py-3">
            <p className="text-sm"><span className="font-mono text-brass-400">{cmp.length}/3</span> loại kho đã chọn{cmp.length < 2 && <span className="text-steel-400"> · chọn thêm ít nhất 1</span>}</p>
            <div className="flex gap-2"><Button variant="ghost" size="sm" className="text-white hover:bg-white/10" onClick={() => setCmp([])}>Bỏ chọn</Button><Link to={`/units/compare?ids=${cmp.join(',')}`} aria-disabled={cmp.length < 2} onClick={(e) => cmp.length < 2 && e.preventDefault()}><Button variant="primary" size="sm" disabled={cmp.length < 2}><Scale className="size-4" />So sánh</Button></Link></div>
          </Container>
        </div>
      )}
    </>
  );
}
function DarkSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return <label className="block rounded-xl bg-white/6 px-3 py-2"><span className="eyebrow block text-[10px] text-brass-400">{label}</span><select value={value} onChange={(e) => onChange(e.target.value)} className="w-full bg-transparent text-sm font-semibold text-white outline-none [&>option]:text-ink-900">{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>;
}

/* ───────── compare ───────── */
export function Compare() {
  const [sp] = useSearchParams();
  const ids = (sp.get('ids') ?? '').split(',').filter(Boolean);
  const q = useGet<{ data: any[] }>(ids.length ? '/catalog/unit-types/compare' : null, { ids: ids.join(',') });
  return (
    <Container className="py-12">
      <Link to="/units" className="eyebrow inline-flex items-center gap-2 text-steel-500 hover:text-ink-900"><ArrowLeft className="size-3.5" />Quay lại tìm kho</Link>
      <h1 className="display mb-8 mt-3 text-[40px]">So sánh kho</h1>
      {ids.length < 2 ? <Card><EmptyState title="Chọn ít nhất 2 loại kho để so sánh" hint="Bấm “So sánh” trên các thẻ kho ở trang Tìm kho." action={<Link to="/units"><Button variant="primary">Đến trang tìm kho</Button></Link>} /></Card> : (
        <Async q={q as any}>{(d: any) => d.data.length < 2 ? <EmptyState title="Chọn ít nhất 2 loại kho để so sánh" /> : (
          <Card className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm"><thead><tr className="border-b hairline"><th className="w-40 p-4 text-left" />{d.data.map((u: any) => <th key={u.id} className="p-4 text-left align-top"><MediaImg src={unitImage(u, true)} fallbackSrc={unitDefaultImage(u, true)} alt={u.name ?? ''} className="mb-3 aspect-[4/3] rounded-xl" /><p className="text-base font-bold">{u.name}</p><p className="text-xs font-normal text-steel-500">{u.facility?.name}</p></th>)}</tr></thead>
            <tbody>{([['Giá/tháng', (u: any) => <b className="display text-lg num">{vnd(u.online_price)}</b>], ['Giá/m²', (u: any) => u.pricePerM2 ? vnd(u.pricePerM2) : '—'], ['Tiền cọc', (u: any) => vnd(u.deposit)], ['Diện tích', (u: any) => `${u.area_m2} m²`], ['Kích thước', (u: any) => <span className="font-mono text-xs">{dims([u.width_m, u.depth_m, u.height_m])}</span>], ['Thể tích', (u: any) => `${u.volume_m3} m³`], ['Điều hòa', (u: any) => u.climate_controlled ? <Check className="size-4 text-ok-600" /> : '—'], ['Xe vào tận nơi', (u: any) => u.drive_up ? <Check className="size-4 text-ok-600" /> : '—'], ['Ổ điện', (u: any) => u.power_outlet ? <Check className="size-4 text-ok-600" /> : '—'], ['Còn trống', (u: any) => `${u.available} kho`]] as [string, (u: any) => any][]).map(([l, fn]) => <tr key={l} className="border-b hairline last:border-0"><th className="eyebrow p-4 text-left font-medium text-steel-500">{l}</th>{d.data.map((u: any) => <td key={u.id} className="p-4">{fn(u)}</td>)}</tr>)}
              <tr><td />{d.data.map((u: any) => <td key={u.id} className="p-4"><Link to={`/book/${u.id}`}><Button variant="primary" size="sm" disabled={!u.available}>Đặt kho</Button></Link></td>)}</tr></tbody></table></Card>
        )}</Async>
      )}
    </Container>
  );
}

/* ───────── size guide + embedded AI Size Advisor Bot ───────── */
const SIZE_BOT_SUGGESTIONS = [
  'Đồ phòng trọ sinh viên (10 thùng đồ, nệm, tủ lạnh mini) nên chọn kho nào để cái gì?',
  'Nội thất căn hộ 2 phòng ngủ chờ sửa nhà (sofa, giường, tủ lạnh, máy giặt) chọn kho nào?',
  'Hàng shop online mỹ phẩm & quần áo cần chống ẩm nên chọn kho nào?',
  'Lưu 50 thùng hồ sơ kế toán công ty dài hạn chọn kho nào tiết kiệm?',
  'Gửi xe máy, xe đạp thể thao và 5 vali du lịch chọn kho nào?',
];

export function SizeGuide() {
  const nav = useNavigate();
  const items = useGet<any[]>('/catalog/size-items', undefined, { staleTime: 600_000 });
  const [qty, setQty] = useState<Record<string, number>>({});
  const list = Object.entries(qty).filter(([, n]) => n > 0).map(([code, n]) => ({ code, qty: n }));
  const [res, setRes] = useState<any>(null);
  const run = useAct(() => post('/catalog/size-advisor', { items: list }), { onSuccess: setRes });
  const key = JSON.stringify(list);
  useEffect(() => { if (list.length) run.mutate(undefined); else setRes(null); }, [key]); // eslint-disable-line
  const count = list.reduce((a, x) => a + x.qty, 0);

  // Embedded Size-Guide AI Bot state
  const [botSession, setBotSession] = useState<string | undefined>(undefined);
  const [botInput, setBotInput] = useState('');
  const [botBusy, setBotBusy] = useState(false);
  const [botMsgs, setBotMsgs] = useState<{ role: 'USER' | 'ASSISTANT'; content: string; cards?: any[] }[]>([]);
  const botRef = useRef<HTMLDivElement>(null);

  async function askSizeBot(promptText: string) {
    const clean = promptText.trim();
    if (!clean || botBusy) return;
    setBotInput('');
    setBotBusy(true);
    setBotMsgs((prev) => [...prev, { role: 'USER', content: clean }]);
    setTimeout(() => botRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 80);
    try {
      const r: any = await post('/chatbot/chat', {
        message: clean,
        sessionId: botSession,
      });
      const data = r?.data ?? r;
      if (data?.sessionId) setBotSession(data.sessionId);
      setBotMsgs((prev) => [
        ...prev,
        {
          role: 'ASSISTANT',
          content: data?.reply || 'Mình đã phân tích danh sách đồ của bạn. Bạn xem các gợi ý kho phù hợp bên dưới nhé!',
          cards: (data?.cards ?? []).filter((c: any) => c.type !== 'handoff'),
        },
      ]);
    } catch {
      setBotMsgs((prev) => [
        ...prev,
        {
          role: 'ASSISTANT',
          content: 'Hệ thống đang bận một chút, bạn vui lòng thử lại sau giây lát nhé!',
        },
      ]);
    } finally {
      setBotBusy(false);
    }
  }

  function askFromSelectedItems() {
    if (!list.length) return;
    const itemSummary = list
      .map((x) => {
        const found = items.data?.find((it) => it.code === x.code);
        return `${x.qty} ${found?.label ?? x.code}`;
      })
      .join(', ');
    const prompt = `Mình cần gửi các món đồ sau: ${itemSummary} (tổng thể tích ước tính khoảng ${res?.volume ?? ''} m³, hệ thống gợi ý Kho ${SIZE_LABEL[res?.category] ?? res?.category ?? ''}). Tư vấn giúp mình nên chọn kho nào, có cần kho điều hòa không và cách sắp xếp các món đồ này trong kho thế nào cho gọn nhé!`;
    void askSizeBot(prompt);
  }

  return (
    <>
      <PageHero env="corridor" opening="slide" image={unitImage({ size_category: 'L' })} eyebrow="Công cụ ước tính & Trợ lý AI" title={<>Cần kho cỡ nào?<br /><span className="text-brass-400">Đếm đồ hoặc hỏi AI.</span></>} sub="Chọn số lượng đồ cần cất hoặc mô tả trực tiếp cho Trợ lý AI — hệ thống tính thể tích (đã cộng 25% khoảng trống xếp đồ) và tư vấn chọn kho nào để cái gì chuẩn xác nhất." />
      <Container className="py-12">
        <div className="grid gap-8 md:grid-cols-[1fr_380px]">
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b hairline px-5 py-4"><p className="font-bold">Đồ cần cất</p>{count > 0 && <button className="text-sm font-semibold text-steel-500 hover:text-ink-900" onClick={() => setQty({})}>Đặt lại</button>}</div>
            {items.isLoading && <div className="p-5"><Skeleton className="h-40" /></div>}
            <ul className="divide-y divide-steel-100">{items.data?.map((it) => (
              <li key={it.code} className={cn('flex items-center justify-between gap-3 px-5 py-3 transition', qty[it.code] && 'bg-brass-100/40')}>
                <span className="text-sm font-medium">{it.label}<span className="ml-2 font-mono text-[11px] text-steel-400">{it.volume} m³</span></span>
                <div className="flex items-center gap-1.5"><button className="size-9 rounded-lg border border-steel-300 bg-white font-bold hover:border-ink-900 disabled:opacity-30" disabled={!qty[it.code]} onClick={() => setQty((q) => ({ ...q, [it.code]: Math.max(0, (q[it.code] ?? 0) - 1) }))} aria-label={`Giảm ${it.label}`}>−</button><span className="w-8 text-center font-semibold num">{qty[it.code] ?? 0}</span><button className="size-9 rounded-lg border border-ink-900 bg-ink-900 font-bold text-white hover:bg-ink-800" onClick={() => setQty((q) => ({ ...q, [it.code]: Math.min(500, (q[it.code] ?? 0) + 1) }))} aria-label={`Tăng ${it.label}`}>+</button></div>
              </li>
            ))}</ul>
          </Card>
          <div className="md:sticky md:top-24 md:self-start">
            <div className="overflow-hidden rounded-[var(--radius-media)] bg-ink-950 text-white">
              {res ? <>
                <MediaImg key={res.category} src={unitImage({ size_category: res.category }, true)} alt={`Mô phỏng kho ${SIZE_LABEL[res.category] ?? res.category}`} className="door-reveal aspect-[4/3]" />
                <div className="p-6"><p className="eyebrow text-brass-400">Gợi ý cho {count} món</p><p className="display mt-2 text-[34px]">Kho {SIZE_LABEL[res.category] ?? res.category}</p><p className="text-sm text-steel-300">{res.label}</p>
                  <div className="mt-5 flex items-end justify-between border-t hairline-dark pt-4"><span className="eyebrow text-steel-400">Thể tích ước tính</span><span className="display text-2xl num">{res.volume} m³</span></div>
                  <Link to={`/book?size=${res.category}`}><Button variant="primary" size="lg" className="mt-5 w-full">Đặt kho cỡ này<ArrowRight className="size-4" /></Button></Link>
                  <button
                    type="button"
                    onClick={askFromSelectedItems}
                    disabled={botBusy}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-brass-400/50 bg-white/10 px-4 py-2.5 text-xs font-semibold text-brass-300 transition hover:bg-white/20"
                  >
                    <Sparkles className="size-4 text-brass-400" />
                    Nhờ Bot AI tư vấn xếp {count} món đồ này
                  </button>
                </div>
              </> : <div className="door-lines p-8 text-center"><Package className="mx-auto size-10 text-brass-400" /><p className="mt-4 text-lg font-bold">Chưa chọn đồ nào</p><p className="mt-1 text-sm text-steel-300">Tăng số lượng bên trái hoặc hỏi trực tiếp Trợ lý AI bên dưới để biết chọn kho nào để cái gì.</p></div>}
            </div>
          </div>
        </div>

        {/* Embedded AI Storage Advisor Bot Section */}
        <div ref={botRef} className="mt-12">
          <Card className="overflow-hidden border-2 border-ink-900/15 shadow-[var(--shadow-card)]">
            <div className="grain flex flex-col justify-between gap-3 bg-ink-900 px-6 py-5 text-white sm:flex-row sm:items-center">
              <div className="flex items-center gap-3.5">
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-brass-500 text-ink-950 shadow">
                  <Bot className="size-6" />
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold">Trợ lý AI Tư Vấn Chọn Kho: “Chọn kho nào để cái gì?”</h2>
                    <Badge tone="brass">AI Tư vấn trực tiếp</Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-steel-300">
                    Kể tên những món đồ bạn muốn cất giữ — Bot sẽ gợi ý cỡ kho (S, M, L, XL), loại kho (Điều hòa chống ẩm hay Tiêu chuẩn), báo giá và hướng dẫn cách xếp đồ.
                  </p>
                </div>
              </div>
              {botMsgs.length > 0 && (
                <Button
                  size="xs"
                  variant="ghost"
                  className="text-steel-300 hover:bg-white/10 hover:text-white"
                  onClick={() => {
                    setBotMsgs([]);
                    setBotSession(undefined);
                  }}
                >
                  Làm mới cuộc tư vấn
                </Button>
              )}
            </div>

            <div className="bg-paper p-6">
              <div className="mb-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-steel-500">
                  💡 Bấm chọn nhanh tình huống của bạn hoặc tự nhập bên dưới:
                </p>
                <div className="flex flex-wrap gap-2">
                  {SIZE_BOT_SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      disabled={botBusy}
                      onClick={() => askSizeBot(s)}
                      className="rounded-full border border-steel-300 bg-white px-3.5 py-1.5 text-left text-xs font-medium text-ink-900 transition hover:border-ink-900 hover:bg-brass-50 disabled:opacity-50"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {botMsgs.length > 0 && (
                <div className="mb-4 max-h-[480px] space-y-4 overflow-y-auto rounded-2xl border border-steel-200 bg-white p-4">
                  {botMsgs.map((m, idx) => (
                    <div key={idx} className={cn('flex flex-col gap-2', m.role === 'USER' ? 'items-end' : 'items-start')}>
                      <div
                        className={cn(
                          'max-w-[92%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed',
                          m.role === 'USER'
                            ? 'rounded-br-sm bg-ink-900 text-white'
                            : 'rounded-tl-sm border border-steel-200 bg-paper text-ink-950',
                        )}
                      >
                        {m.role === 'USER' ? m.content : <RichMessage text={m.content} />}
                      </div>
                      {m.cards && m.cards.filter((c: any) => c.type !== 'handoff').length > 0 && (
                        <div className="grid w-full gap-3 sm:grid-cols-2">
                          {m.cards
                            .filter((c: any) => c.type !== 'handoff')
                            .map((c: any, j: number) => (
                              <CardView key={j} c={c} onNavigate={() => nav(c.bookUrl || '/book')} />
                            ))}
                        </div>
                      )}
                    </div>
                  ))}
                  {botBusy && (
                    <div className="flex items-center gap-2 text-xs font-medium text-steel-500">
                      <Sparkles className="size-4 animate-spin text-brass-600" />
                      AI đang tính toán diện tích và chọn loại kho phù hợp nhất cho đồ đạc của bạn...
                    </div>
                  )}
                </div>
              )}

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void askSizeBot(botInput);
                }}
                className="flex flex-col gap-2 sm:flex-row"
              >
                <Input
                  className="flex-1 bg-white"
                  placeholder="VD: Mình có 1 tủ lạnh, 1 nệm 1m8, 15 thùng quần áo và sách vở ở Quận 7 thì nên chọn kho nào?"
                  value={botInput}
                  disabled={botBusy}
                  onChange={(e) => setBotInput(e.target.value)}
                />
                <Button type="submit" variant="primary" loading={botBusy} disabled={!botInput.trim() || botBusy} icon={<Send className="size-4" />}>
                  Nhờ AI Tư Vấn Chọn Kho
                </Button>
              </form>
            </div>
          </Card>
        </div>
      </Container>
    </>
  );
}

/* ───────── 6-step booking wizard ───────── */
const BOOK_STEPS = [
  '1. Chọn cơ sở',
  '2. Kích thước & máy lạnh',
  '3. Thời hạn & giá cả',
  '4. Lịch hẹn & chi tiết',
  '5. Thanh toán',
  '6. Hoàn tất',
];

export function Book() {
  const { unitTypeId: paramUnitTypeId } = useParams();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const loc = useLocation();
  const { status, user } = useAuth();

  const resIdFromUrl = sp.get('reservationId');
  const urlPayStatus = sp.get('status');
  const initialStep = resIdFromUrl
    ? 5
    : sp.get('step') !== null
      ? Math.max(0, Math.min(5, Number(sp.get('step'))))
      : paramUnitTypeId || sp.get('unitTypeId')
        ? 2
        : sp.get('facility')
          ? 1
          : 0;

  const [step, setStep] = useState<number>(initialStep);
  const [facilitySlug, setFacilitySlug] = useState<string>(sp.get('facility') ?? '');
  const [selectedUnitTypeId, setSelectedUnitTypeId] = useState<string>(paramUnitTypeId ?? sp.get('unitTypeId') ?? '');
  const [climate, setClimate] = useState<string>(sp.get('climate') ?? '');
  const [sizeCat, setSizeCat] = useState<string>(sp.get('size') ?? '');
  const [start, setStart] = useState<string>(sp.get('start') ?? addDaysYmd(1));
  const [term, setTerm] = useState<number>(Number(sp.get('term') ?? 3));
  const [mode, setMode] = useState<'MONTHLY' | 'PREPAID_TERM'>((sp.get('mode') as 'MONTHLY' | 'PREPAID_TERM') || 'MONTHLY');
  const [promo, setPromo] = useState<string>(sp.get('promo') ?? '');
  const [apptDate, setApptDate] = useState<string>(sp.get('apptDate') ?? sp.get('start') ?? addDaysYmd(1));
  const [slotId, setSlotId] = useState<string>(sp.get('slotId') ?? '');
  const [notes, setNotes] = useState<string>(sp.get('notes') ?? '');
  const [paymentChoice, setPaymentChoice] = useState<'ONLINE' | 'COUNTER'>((sp.get('pay') as 'ONLINE' | 'COUNTER') || 'ONLINE');
  const [agree, setAgree] = useState(true);
  const [quote, setQuote] = useState<any>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteErr, setQuoteErr] = useState<string>('');
  const [idem, setIdem] = useState(newIdemKey);
  const [resId, setResId] = useState<string | null>(resIdFromUrl);
  const [createdData, setCreatedData] = useState<any>(null);

  useEffect(() => {
    if (resIdFromUrl && resIdFromUrl !== resId) {
      setResId(resIdFromUrl);
      setStep(5);
    }
  }, [resIdFromUrl, resId]);

  const resDetailQ = useGet<any>(resId && step === 5 && status === 'authed' ? `/reservations/${resId}` : null);
  const finalRes = resDetailQ.data ?? createdData?.reservation ?? null;

  const facilitiesQ = useGet<{ data: any[] }>('/catalog/facilities', undefined, { staleTime: 120_000 });
  const policy = useGet<any>('/catalog/policy-summary', undefined, { staleTime: 30_000 });
  const utDetail = useGet<any>(selectedUnitTypeId ? `/catalog/unit-types/${selectedUnitTypeId}` : null);

  // Sync facilitySlug & selectedUnitTypeId when entering directly via /book/:unitTypeId or returning from VNPay
  useEffect(() => {
    if (utDetail.data?.facility?.slug && !facilitySlug) {
      setFacilitySlug(utDetail.data.facility.slug);
    }
  }, [utDetail.data?.facility?.slug, facilitySlug]);

  useEffect(() => {
    const resUtId = finalRes?.unit_type?.public_id ?? finalRes?.unit_type?.id;
    if (resUtId && !selectedUnitTypeId) {
      setSelectedUnitTypeId(resUtId);
    }
    if (finalRes?.facility?.slug && !facilitySlug) {
      setFacilitySlug(finalRes.facility.slug);
    }
  }, [finalRes?.unit_type?.public_id, finalRes?.unit_type?.id, finalRes?.facility?.slug, selectedUnitTypeId, facilitySlug]);

  // If VNPay returned status=SUCCEEDED while reservation status is still syncing, refetch once shortly after
  useEffect(() => {
    if (step === 5 && urlPayStatus === 'SUCCEEDED' && finalRes?.status === 'PENDING_PAYMENT') {
      const t = setTimeout(() => {
        void resDetailQ.refetch();
      }, 1500);
      return () => clearTimeout(t);
    }
  }, [step, urlPayStatus, finalRes?.status, resDetailQ]);

  const effectiveFacilitySlug = facilitySlug || utDetail.data?.facility?.slug || finalRes?.facility?.slug || '';
  const facilities = facilitiesQ.data?.data ?? [];
  const activeFacility = useMemo(
    () =>
      facilities.find((f: any) => f.slug === effectiveFacilitySlug || f.id === effectiveFacilitySlug) ??
      utDetail.data?.facility ??
      finalRes?.facility ??
      null,
    [facilities, effectiveFacilitySlug, utDetail.data?.facility, finalRes?.facility],
  );

  const unitTypesQ = useGet<{ data: any[] }>(
    effectiveFacilitySlug && step < 5 ? '/catalog/unit-types' : null,
    {
      facility: effectiveFacilitySlug,
      size: sizeCat || undefined,
      sizeCategory: sizeCat || undefined,
      climate: climate || undefined,
      climateControlled: climate || undefined,
      startDate: start,
      term,
    },
  );
  const unitTypes = unitTypesQ.data?.data ?? [];
  const u = utDetail.data ?? unitTypes.find((x: any) => x.id === selectedUnitTypeId) ?? finalRes?.unit_type ?? null;

  const terms: number[] = u?.allowedTerms ?? policy.data?.params?.allowed_terms_months ?? [1, 3, 6, 12];
  const maxDays = u?.maxAdvanceDays ?? policy.data?.params?.max_advance_booking_days ?? 60;
  const moveInWindowDays = policy.data?.params?.move_in_window_days ?? 7;
  const dateErr =
    start < ymd(new Date())
      ? 'Ngày bắt đầu không được ở quá khứ'
      : start > addDaysYmd(maxDays)
        ? `Chỉ đặt trước tối đa ${maxDays} ngày`
        : '';

  useEffect(() => {
    if (terms.length && !terms.includes(term)) setTerm(terms[0]);
  }, [terms.join(',')]); // eslint-disable-line

  // Keep appointment date within [today, start + moveInWindowDays]
  const apptMinDate = useMemo(() => {
    const todayStr = ymd(new Date());
    return todayStr < start ? todayStr : start;
  }, [start]);

  const apptMaxDate = useMemo(() => {
    const base = new Date(`${start}T00:00:00Z`);
    return isNaN(base.getTime()) ? addDaysYmd(moveInWindowDays) : addDaysYmd(moveInWindowDays, base);
  }, [start, moveInWindowDays]);

  useEffect(() => {
    if (apptDate < apptMinDate || apptDate > apptMaxDate) {
      setApptDate(start);
      setSlotId('');
    }
  }, [start, apptMinDate, apptMaxDate, apptDate]);

  // Auto-calculate quote when unitTypeId and parameters change
  const getQuote = useAct(
    () =>
      post('/quotes', {
        unitTypeId: selectedUnitTypeId,
        startDate: start,
        termMonths: term,
        billingMode: mode,
        promoCode: promo.trim() || null,
      }),
    {
      onSuccess: (q) => {
        setQuote(q);
        setQuoteErr('');
      },
    },
  );

  useEffect(() => {
    if (selectedUnitTypeId && !dateErr && step < 5) {
      let cancelled = false;
      setQuoteLoading(true);
      setQuoteErr('');
      post('/quotes', {
        unitTypeId: selectedUnitTypeId,
        startDate: start,
        termMonths: term,
        billingMode: mode,
        promoCode: promo.trim() || null,
      })
        .then((q) => {
          if (!cancelled) {
            setQuote(q);
            setQuoteErr('');
          }
        })
        .catch((err: any) => {
          if (!cancelled) {
            setQuoteErr(err?.message ?? 'Không thể tính báo giá cho lựa chọn này');
          }
        })
        .finally(() => {
          if (!cancelled) setQuoteLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }
  }, [selectedUnitTypeId, start, term, mode]); // eslint-disable-line

  // Appointment slots for Step 4
  const facilityIdForSlots = activeFacility?.id ?? activeFacility?.public_id ?? utDetail.data?.facility?.public_id ?? utDetail.data?.facility?.slug ?? effectiveFacilitySlug;
  const slotsQ = useGet<any>(
    facilityIdForSlots && step >= 2 && step <= 4 ? `/facilities/${facilityIdForSlots}/appointment-slots` : null,
    { date: apptDate, type: 'MOVE_IN' },
  );
  const slots = slotsQ.data?.slots ?? [];
  const selectedSlot = slots.find((s: any) => s.slotId === slotId) ?? slots[0] ?? null;

  useEffect(() => {
    if (slots.length > 0 && !slots.some((s: any) => s.slotId === slotId && !s.past && s.remaining > 0)) {
      const firstAvail = slots.find((s: any) => !s.past && s.remaining > 0) ?? slots[0];
      if (firstAvail) setSlotId(firstAvail.slotId);
    }
  }, [slots, slotId]);

  const payNow = useAct(
    (id: string) => post(`/reservations/${id}/pay`, { returnPath: `/book?reservationId=${id}&step=5` }, newIdemKey()),
    {
      onSuccess: (r: any) => {
        if (r?.alreadyPaid) {
          toast.ok('Đơn đặt kho của bạn đã được thanh toán hoàn tất.');
          void resDetailQ.refetch();
          return;
        }
        if (r?.redirectUrl) window.location.href = r.redirectUrl;
      },
    },
  );

  const reserve = useAct(
    async () => {
      let activeQuote = quote;
      if (!activeQuote?.id) {
        activeQuote = await post('/quotes', {
          unitTypeId: selectedUnitTypeId,
          startDate: start,
          termMonths: term,
          billingMode: mode,
          promoCode: promo.trim() || null,
        });
        setQuote(activeQuote);
      }
      const effectiveSlotId = slotId || selectedSlot?.slotId || '';
      const payload = {
        quoteId: activeQuote.id,
        notes: notes.trim() || undefined,
        paymentChoice,
        appointment: effectiveSlotId ? { date: apptDate, slotId: effectiveSlotId, notes: notes.trim() || undefined } : undefined,
      };
      try {
        return await post('/reservations', payload, idem);
      } catch (err: any) {
        if (err?.code === 'QUOTE_EXPIRED' || err?.status === 404) {
          const freshQuote = await post('/quotes', {
            unitTypeId: selectedUnitTypeId,
            startDate: start,
            termMonths: term,
            billingMode: mode,
            promoCode: promo.trim() || null,
          });
          setQuote(freshQuote);
          return await post('/reservations', { ...payload, quoteId: freshQuote.id }, newIdemKey());
        }
        throw err;
      }
    },
    {
      onSuccess: (r: any) => {
        const id = r.reservation?.public_id ?? r.reservation?.id ?? r.id;
        setCreatedData(r);
        setResId(id);
        setStep(5);
        if (paymentChoice === 'ONLINE') {
          payNow.mutate(id);
        }
      },
    },
  );

  const isPaid =
    urlPayStatus === 'SUCCEEDED' ||
    Boolean(
      finalRes?.status &&
        ['CONFIRMED', 'UNIT_ASSIGNED', 'MOVE_IN_SCHEDULED', 'CHECKED_IN', 'COMPLETED'].includes(finalRes.status),
    ) ||
    Boolean(
      Array.isArray(finalRes?.invoices) &&
        finalRes.invoices.length > 0 &&
        finalRes.invoices.every((inv: any) => inv.status === 'PAID'),
    );

  const canRetryOnlinePay =
    !isPaid &&
    Boolean(resId) &&
    finalRes?.status === 'PENDING_PAYMENT' &&
    (!Array.isArray(finalRes?.invoices) ||
      finalRes.invoices.length === 0 ||
      finalRes.invoices.some((inv: any) => ['ISSUED', 'PARTIALLY_PAID'].includes(inv.status)));

  const isSyncingRes = Boolean(resId && !finalRes && (status === 'loading' || resDetailQ.isLoading));

  const goLogin = (targetStep = 4) => {
    const qs = new URLSearchParams({
      step: String(targetStep),
      facility: effectiveFacilitySlug,
      unitTypeId: selectedUnitTypeId,
      start,
      term: String(term),
      mode,
      apptDate,
      slotId: slotId || selectedSlot?.slotId || '',
      pay: paymentChoice,
    });
    if (promo) qs.set('promo', promo);
    if (notes) qs.set('notes', notes);
    nav(`/login?returnTo=${encodeURIComponent(`/book?${qs.toString()}`)}`);
  };

  return (
    <Container className="py-10">
      <div className="mb-6">
        <p className="eyebrow text-brass-700">QUY TRÌNH ĐẶT KHO 6 BƯỚC</p>
        <h1 className="display mt-1 text-[34px] sm:text-[42px]">
          {u ? `Đặt ${u.name}` : activeFacility ? `Đặt kho tại ${activeFacility.name}` : 'Đặt kho lưu trữ'}
        </h1>
        <div className="mt-4 rounded-2xl border hairline bg-white px-4 py-3 shadow-sm">
          <Stepper
            steps={BOOK_STEPS}
            current={step}
            onStep={(s) => {
              if (s === 0) setStep(0);
              else if (s === 1 && effectiveFacilitySlug) setStep(1);
              else if (s === 2 && selectedUnitTypeId) setStep(2);
              else if (s === 3 && selectedUnitTypeId) setStep(3);
              else if (s === 4 && selectedUnitTypeId && (slotId || selectedSlot?.slotId)) setStep(4);
            }}
          />
        </div>
      </div>

      {/* ───────── BƯỚC 1: CHỌN CƠ SỞ ───────── */}
      {step === 0 && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="display text-2xl">Bước 1 · Chọn cơ sở lưu trữ</h2>
              <p className="mt-1 text-sm text-steel-500">Chọn cơ sở gần bạn nhất để xem các kích thước kho và khung giờ hẹn trống.</p>
            </div>
          </div>
          <Async q={facilitiesQ}>
            {(d) => (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {d.data.map((f: any) => {
                  const free = f.availableUnits ?? 0;
                  const isSelected = f.slug === facilitySlug;
                  return (
                    <div
                      key={f.id}
                      onClick={() => {
                        if (f.slug !== facilitySlug) {
                          setFacilitySlug(f.slug);
                          setSelectedUnitTypeId('');
                          setQuote(null);
                        }
                        setStep(1);
                      }}
                      className={cn(
                        'group cursor-pointer overflow-hidden rounded-[var(--radius-media)] border bg-white shadow-[var(--shadow-card)] transition duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-pop)]',
                        isSelected ? 'border-2 border-ink-900 ring-2 ring-brass-400/40' : 'hairline',
                      )}
                    >
                      <div className="relative aspect-[16/10]">
                        <MediaImg src={sm(facilityCover(f))} fallbackSrc={sm(facilityDefaultCover(f))} alt={f.name} className="absolute inset-0" imgClassName="transition duration-700 group-hover:scale-105" />
                        <div className="absolute inset-0 bg-gradient-to-t from-ink-950/80 via-transparent to-ink-950/20" />
                        <span
                          className={cn(
                            'absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[11px] font-medium tracking-wider backdrop-blur',
                            free > 0 ? 'bg-ink-950/70 text-signal-500' : 'bg-bad-600/90 text-white',
                          )}
                        >
                          <span className="size-1.5 rounded-full bg-current" />
                          {free > 0 ? `${free} KHO TRỐNG` : 'HẾT CHỖ'}
                        </span>
                        <Plate dark size="sm" className="absolute right-4 top-4">{f.code}</Plate>
                        <div className="absolute inset-x-0 bottom-0 p-5 text-white">
                          <p className="display text-2xl">{f.name}</p>
                          <p className="mt-1 flex items-center gap-1.5 text-sm text-steel-200">
                            <MapPin className="size-4 shrink-0 text-brass-400" />
                            <span className="truncate">{f.address_line}, {f.district}, {f.province}</span>
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-3 px-5 py-4">
                        <div>
                          <p className="eyebrow text-steel-500">Giá thuê từ</p>
                          <p className="mt-0.5 whitespace-nowrap font-bold num">
                            {vnd(f.priceFrom)}
                            <span className="text-sm font-normal text-steel-500">/tháng</span>
                          </p>
                        </div>
                        <Button variant={isSelected ? 'primary' : 'dark'} size="sm">
                          {isSelected ? 'Đã chọn · Tiếp tục' : 'Chọn cơ sở này'}
                          <ArrowRight className="size-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Async>
        </div>
      )}

      {/* ───────── BƯỚC 2: CHỌN KÍCH THƯỚC & MÁY LẠNH ───────── */}
      {step === 1 && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <button type="button" onClick={() => setStep(0)} className="eyebrow inline-flex items-center gap-1.5 text-steel-500 hover:text-ink-900">
                <ArrowLeft className="size-3.5" />
                Đổi cơ sở ({activeFacility?.name ?? facilitySlug})
              </button>
              <h2 className="display mt-1 text-2xl">Bước 2 · Chọn kích thước kho & điều kiện máy lạnh</h2>
              <p className="mt-1 text-sm text-steel-500">Lọc theo nhu cầu bảo quản có máy lạnh (điều hòa 24/7 kiểm soát nhiệt ẩm) hoặc kho tiêu chuẩn.</p>
            </div>
            <Link to="/size-guide" target="_blank" className="text-sm font-semibold text-brass-700 hover:underline">
              Chưa rõ kích thước? Mở công cụ ước tính m³ →
            </Link>
          </div>

          <Card className="p-5">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Tùy chọn máy lạnh (Điều hòa nhiệt độ & độ ẩm)">
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { v: '', label: 'Tất cả loại kho', sub: 'Mọi điều kiện' },
                    { v: 'true', label: 'Có máy lạnh', sub: 'Điều hòa 18–25°C' },
                    { v: 'false', label: 'Không máy lạnh', sub: 'Kho tiêu chuẩn' },
                  ].map((opt) => (
                    <button
                      key={opt.v}
                      type="button"
                      onClick={() => setClimate(opt.v)}
                      className={cn(
                        'rounded-xl border px-3 py-2.5 text-left transition',
                        climate === opt.v ? 'border-ink-900 bg-ink-900 text-white' : 'hairline bg-paper hover:border-ink-900',
                      )}
                    >
                      <span className="flex items-center gap-1.5 text-xs font-bold">
                        {opt.v === 'true' && <Thermometer className={cn('size-3.5', climate === opt.v ? 'text-brass-400' : 'text-info-600')} />}
                        {opt.label}
                      </span>
                      <span className={cn('mt-0.5 block text-[11px]', climate === opt.v ? 'text-steel-300' : 'text-steel-500')}>{opt.sub}</span>
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Kích thước kho">
                <div className="flex flex-wrap gap-1.5">
                  {[
                    ['', 'Tất cả cỡ'],
                    ['XS', 'XS · Tủ khóa'],
                    ['S', 'S · Nhỏ'],
                    ['M', 'M · Vừa'],
                    ['L', 'L · Lớn'],
                    ['XL', 'XL · Cực lớn'],
                  ].map(([k, l]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setSizeCat(k)}
                      className={cn(
                        'rounded-xl border px-3 py-2 text-xs font-semibold transition',
                        sizeCat === k ? 'border-ink-900 bg-ink-900 text-white' : 'hairline bg-paper hover:border-ink-900',
                      )}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </Field>
            </div>
          </Card>

          <Async q={unitTypesQ}>
            {(d) =>
              d.data.length === 0 ? (
                <Card className="p-8">
                  <EmptyState
                    title="Không có loại kho khớp bộ lọc"
                    hint="Hãy thử chuyển bộ lọc máy lạnh hoặc kích thước sang 'Tất cả' để xem các kho hiện có tại cơ sở."
                    action={
                      <Button variant="outline" onClick={() => { setClimate(''); setSizeCat(''); }}>
                        Xóa bộ lọc
                      </Button>
                    }
                  />
                </Card>
              ) : (
                <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                  {d.data.map((utItem: any) => {
                    const avail = utItem.available ?? 0;
                    const selected = utItem.id === selectedUnitTypeId;
                    return (
                      <div
                        key={utItem.id}
                        className={cn(
                          'flex flex-col overflow-hidden rounded-[var(--radius-media)] border bg-white shadow-[var(--shadow-card)] transition hover:-translate-y-0.5',
                          selected ? 'border-2 border-ink-900 ring-2 ring-brass-400/40' : 'hairline',
                        )}
                      >
                        <div className="relative aspect-[16/10] bg-ink-950">
                          <MediaImg src={unitImage(utItem, true)} fallbackSrc={unitDefaultImage(utItem, true)} alt={utItem.name} className="absolute inset-0 opacity-90" />
                          <div className="absolute inset-0 bg-gradient-to-t from-ink-950/80 via-transparent to-ink-950/20" />
                          <Plate dark size="sm" className="absolute left-3 top-3">
                            {utItem.size_category} · {SIZE_LABEL[utItem.size_category] ?? utItem.size_category}
                          </Plate>
                          <span
                            className={cn(
                              'absolute right-3 top-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold backdrop-blur',
                              utItem.climate_controlled ? 'bg-info-600/90 text-white' : 'bg-ink-950/75 text-steel-200',
                            )}
                          >
                            <Thermometer className="size-3.5" />
                            {utItem.climate_controlled ? 'Có máy lạnh 24/7' : 'Không máy lạnh'}
                          </span>
                          <div className="absolute inset-x-3 bottom-3 flex items-end justify-between text-white">
                            <div>
                              <p className="display text-xl">{utItem.name}</p>
                              <p className="font-mono text-xs text-brass-300">
                                {dims(utItem)} · {Number(utItem.area_m2)} m² ({Number(utItem.volume_m3)} m³)
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-1 flex-col justify-between space-y-4 p-5">
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-xs">
                              <span className={cn('font-semibold', avail > 0 ? 'text-ok-600' : 'text-bad-600')}>
                                ● {avail > 0 ? `Còn ${avail} kho trống` : 'Tạm hết chỗ'}
                              </span>
                              <span className="text-steel-500">Tầng/Khu tiêu chuẩn</span>
                            </div>
                            <p className="line-clamp-2 text-xs text-steel-600">{utItem.fits_description || 'Phù hợp lưu trữ thùng đồ cá nhân, nội thất và hàng hóa.'}</p>
                          </div>

                          <div className="border-t hairline pt-3">
                            <div className="flex items-baseline justify-between">
                              <div>
                                <span className="eyebrow block text-steel-500">Giá thuê trực tuyến</span>
                                <span className="display text-2xl num">{vnd(utItem.online_price)}</span>
                                <span className="text-xs text-steel-500">/tháng</span>
                              </div>
                              <Button
                                variant={selected ? 'primary' : 'dark'}
                                size="sm"
                                disabled={avail < 1}
                                onClick={() => {
                                  setSelectedUnitTypeId(utItem.id);
                                  setStep(2);
                                }}
                              >
                                {avail < 1 ? 'Hết chỗ' : 'Chọn kho này'}
                                <ArrowRight className="size-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            }
          </Async>
        </div>
      )}

      {/* ───────── BƯỚC 3..6: LAYOUT 2 CỘT VỚI THÔNG TIN KHO BÊN PHẢI ───────── */}
      {step >= 2 && (
        <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
          <div className="min-w-0 space-y-6">
            {/* ───────── BƯỚC 3: THỜI HẠN THUÊ & GIÁ CẢ ───────── */}
            {step === 2 && (
              <Card className="space-y-6 p-6">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b hairline pb-4">
                  <div>
                    <h2 className="display text-2xl">Bước 3 · Thời hạn thuê & giá cả</h2>
                    <p className="mt-0.5 text-sm text-steel-500">Chọn ngày bắt đầu thuê, kỳ hạn thuê và kiểm tra bảng kê chi phí chi tiết.</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setStep(1)}>
                    <ArrowLeft className="size-4" />
                    Đổi kích thước / máy lạnh
                  </Button>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Ngày bắt đầu thuê" error={dateErr} required>
                    <Input type="date" value={start} min={ymd(new Date())} max={addDaysYmd(maxDays)} onChange={(e) => setStart(e.target.value)} invalid={!!dateErr} />
                  </Field>
                  <Field label="Thời hạn thuê" required>
                    <Select value={term} onChange={(e) => setTerm(Number(e.target.value))}>
                      {terms.map((t) => {
                        const off = u?.termPricing?.find((x: any) => x.months === t)?.termDiscountPct ?? 0;
                        return (
                          <option key={t} value={t}>
                            {t} tháng{off > 0 ? ` (giảm ${off}%)` : ''}
                          </option>
                        );
                      })}
                    </Select>
                  </Field>
                  <Field label="Hình thức thanh toán kỳ thuê">
                    <Segmented
                      value={mode}
                      onChange={setMode}
                      options={[
                        { value: 'MONTHLY', label: 'Trả hàng tháng' },
                        { value: 'PREPAID_TERM', label: 'Trả trước cả kỳ' },
                      ]}
                    />
                  </Field>
                  <Field label="Mã khuyến mãi" hint="Nhấn Áp dụng sau khi nhập mã">
                    <div className="flex gap-2">
                      <Input value={promo} onChange={(e) => setPromo(e.target.value)} maxLength={32} placeholder="VD: WELCOME10" />
                      <Button variant="outline" loading={getQuote.isPending} onClick={() => getQuote.mutate(undefined)}>
                        Áp dụng
                      </Button>
                    </div>
                  </Field>
                </div>

                {u?.termPricing?.length > 0 && (
                  <div>
                    <p className="eyebrow mb-2 text-steel-500">Bảng giá thuê theo kỳ hạn và hình thức trả (giá mỗi tháng, bấm để chọn)</p>
                    <div className="overflow-x-auto rounded-xl border hairline bg-white">
                      <table className="w-full min-w-[460px] text-left text-sm">
                        <thead>
                          <tr className="border-b hairline text-xs uppercase tracking-wider text-steel-500">
                            <th className="px-4 py-2.5 font-semibold">Kỳ hạn</th>
                            <th className="px-4 py-2.5 font-semibold">Trả hàng tháng</th>
                            <th className="px-4 py-2.5 font-semibold">Trả trước cả kỳ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {u.termPricing.map((r: any) => {
                            const pick = (m: 'MONTHLY' | 'PREPAID_TERM') => { setTerm(r.months); setMode(m); };
                            const cell = (m: 'MONTHLY' | 'PREPAID_TERM') => {
                              const on = term === r.months && mode === m;
                              const rate = m === 'MONTHLY' ? r.monthlyRate : r.prepaidRate;
                              const off = Math.round((1 - rate / r.listMonthly) * 1000) / 10;
                              return (
                                <button type="button" onClick={() => pick(m)} aria-pressed={on} className={cn('flex w-full flex-wrap items-baseline gap-x-2 rounded-lg px-2 py-1.5 text-left transition', on ? 'bg-ink-900 text-white' : 'hover:bg-paper')}>
                                  <b className="num">{vnd(rate)}</b>
                                  <span className={cn('text-xs', on ? 'text-white/70' : 'text-steel-500')}>/tháng</span>
                                  {off > 0 && <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-semibold', on ? 'bg-brass-400 text-ink-950' : 'bg-brass-100 text-brass-700')}>−{off}%</span>}
                                  {m === 'PREPAID_TERM' && <span className={cn('basis-full text-xs', on ? 'text-white/70' : 'text-steel-500')}>trả một lần {vnd(r.prepaidTotal)}</span>}
                                </button>
                              );
                            };
                            return (
                              <tr key={r.months} className="border-b hairline last:border-0">
                                <td className="px-4 py-2 font-semibold">{r.months} tháng</td>
                                <td className="px-2 py-1.5">{cell('MONTHLY')}</td>
                                <td className="px-2 py-1.5">{r.months > 1 ? cell('PREPAID_TERM') : <span className="px-2 text-steel-400">—</span>}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {u?.calendar?.length > 0 && (
                  <div>
                    <p className="eyebrow mb-2 text-steel-500">Lịch trống 8 tuần tới (chọn nhanh ngày bắt đầu)</p>
                    <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-8">
                      {u.calendar.map((c: any) => (
                        <button
                          key={c.start}
                          type="button"
                          onClick={() => setStart(c.start)}
                          className={cn(
                            'rounded-lg border px-2 py-2 text-left text-xs transition',
                            start === c.start ? 'border-ink-900 bg-ink-900 text-white' : 'hairline bg-white hover:border-ink-900',
                          )}
                        >
                          <span className="block font-mono">{c.start.slice(8, 10)}/{c.start.slice(5, 7)}</span>
                          <span className={cn('block font-semibold', start === c.start ? 'text-brass-400' : c.available > 0 ? 'text-ok-600' : 'text-bad-600')}>
                            {c.available > 0 ? `${c.available} trống` : 'Hết'}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {quoteErr && <Alert tone="bad">{quoteErr}</Alert>}

                {quoteLoading && !quote && <Skeleton className="h-44 rounded-2xl" />}

                {quote && (
                  <div className="rounded-2xl border hairline bg-paper p-5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-bold">Bảng tính chi phí thuê kho</p>
                        <p className="text-xs text-steel-500">
                          Kỳ thuê: {fmtDate(quote.startDate)} → {fmtDate(quote.endDate)} ({quote.termMonths} tháng)
                        </p>
                      </div>
                      <Badge tone="info">
                        Giữ giá đến {new Date(quote.expiresAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                      </Badge>
                    </div>
                    <table className="mt-4 w-full text-sm">
                      <tbody>
                        {quote.lines?.map((l: any, i: number) => (
                          <tr key={i} className="border-b hairline">
                            <td className="py-2.5">{l.description}</td>
                            <td className="py-2.5 text-right font-medium num">{vnd(l.amount)}</td>
                          </tr>
                        ))}
                        <tr>
                          <td className="pt-2.5 text-steel-500">Thuế GTGT (VAT {quote.vatRate}%)</td>
                          <td className="pt-2.5 text-right text-steel-500 num">{vnd(quote.taxTotal)}</td>
                        </tr>
                        <tr className="font-bold">
                          <td className="pt-3 text-base">Tổng thanh toán đợt đầu</td>
                          <td className="display pt-3 text-right text-2xl text-ink-950 num">{vnd(quote.dueNowTotal)}</td>
                        </tr>
                      </tbody>
                    </table>
                    {quote.listMonthlyRent > quote.monthlyRent && (
                      <p className="mt-3 rounded-lg bg-brass-100/60 px-3 py-2 text-xs text-ink-900">
                        Giá thuê của bạn là <b className="num">{vnd(quote.monthlyRent)}/tháng</b> thay vì <span className="num line-through">{vnd(quote.listMonthlyRent)}/tháng</span>
                        {' '}(giảm {quote.termDiscountPct > 0 ? `${quote.termDiscountPct}% theo kỳ hạn ${quote.termMonths} tháng` : ''}
                        {quote.termDiscountPct > 0 && quote.prepaidDiscountPct > 0 ? ' và ' : ''}
                        {quote.prepaidDiscountPct > 0 ? `${quote.prepaidDiscountPct}% khi trả trước cả kỳ` : ''}). Mức giá này giữ nguyên trong suốt kỳ hạn.
                      </p>
                    )}
                    <p className="mt-3 flex gap-2 text-xs text-steel-500">
                      <Info className="size-4 shrink-0 text-brass-700" />
                      Đã bao gồm tiền cọc {vnd(quote.depositAmount)} (được hoàn trả 100% khi kết thúc hợp đồng và bàn giao lại kho đúng quy định) cùng phí quản lý một lần {vnd(quote.adminFee)}.
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-between pt-2">
                  <Button variant="ghost" onClick={() => setStep(1)}>
                    <ArrowLeft className="size-4" />
                    Quay lại
                  </Button>
                  <Button
                    variant="primary"
                    size="lg"
                    loading={getQuote.isPending || quoteLoading}
                    disabled={!!dateErr || (u?.available ?? 1) < 1}
                    onClick={async () => {
                      if (!quote) {
                        try {
                          setQuoteLoading(true);
                          const q = await post('/quotes', {
                            unitTypeId: selectedUnitTypeId,
                            startDate: start,
                            termMonths: term,
                            billingMode: mode,
                            promoCode: promo.trim() || null,
                          });
                          setQuote(q);
                          setQuoteErr('');
                          setStep(3);
                        } catch (err: any) {
                          setQuoteErr(err?.message ?? 'Không thể tính báo giá');
                        } finally {
                          setQuoteLoading(false);
                        }
                      } else {
                        setStep(3);
                      }
                    }}
                  >
                    Tiếp tục: Lịch hẹn & chi tiết
                    <ArrowRight className="size-4" />
                  </Button>
                </div>
              </Card>
            )}

            {/* ───────── BƯỚC 4: LỊCH HẸN & CHI TIẾT ───────── */}
            {step === 3 && (
              <Card className="space-y-6 p-6">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b hairline pb-4">
                  <div>
                    <h2 className="display text-2xl">Bước 4 · Đặt lịch hẹn đến cơ sở & chi tiết</h2>
                    <p className="mt-0.5 text-sm text-steel-500">
                      Chọn ngày giờ bạn dự kiến đến cơ sở <b>{activeFacility?.name}</b> để nhận bàn giao kho hoặc được nhân viên tư vấn trực tiếp.
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setStep(2)}>
                    <ArrowLeft className="size-4" />
                    Sửa thời hạn thuê
                  </Button>
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <Field
                    label="Ngày hẹn đến cơ sở"
                    hint={`Trong khung nhận kho: ${fmtDate(apptMinDate)} – ${fmtDate(apptMaxDate)}`}
                    required
                  >
                    <Input
                      type="date"
                      value={apptDate}
                      min={apptMinDate}
                      max={apptMaxDate}
                      onChange={(e) => {
                        setApptDate(e.target.value);
                        setSlotId('');
                      }}
                    />
                  </Field>

                  <div className="rounded-xl bg-paper p-3.5 text-xs text-steel-600">
                    <p className="font-semibold text-ink-900">Địa điểm hẹn:</p>
                    <p className="mt-1 flex items-start gap-1.5">
                      <MapPin className="mt-0.5 size-3.5 shrink-0 text-brass-700" />
                      <span>
                        <b>{activeFacility?.name}</b> — {activeFacility?.address_line}, {activeFacility?.district}, {activeFacility?.province}
                      </span>
                    </p>
                    {activeFacility?.phone && (
                      <p className="mt-1 flex items-center gap-1.5">
                        <Phone className="size-3.5 text-brass-700" />
                        Hotline cơ sở: <b className="font-mono">{activeFacility.phone}</b>
                      </p>
                    )}
                  </div>
                </div>

                <Field label="Chọn khung giờ hẹn tại cơ sở" required>
                  {slotsQ.isLoading ? (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <Skeleton key={i} className="h-14 rounded-xl" />
                      ))}
                    </div>
                  ) : slotsQ.data?.closed ? (
                    <Alert tone="warn">Cơ sở nghỉ vào ngày này: {slotsQ.data.reason}</Alert>
                  ) : slots.length > 0 ? (
                    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4" role="radiogroup" aria-label="Khung giờ hẹn">
                      {slots.map((s: any) => {
                        const off = s.past || s.remaining < 1;
                        const active = (slotId || selectedSlot?.slotId) === s.slotId;
                        return (
                          <button
                            key={s.slotId}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            disabled={off}
                            onClick={() => setSlotId(s.slotId)}
                            className={cn(
                              'rounded-xl border px-3.5 py-3 text-left transition',
                              active ? 'border-ink-900 bg-ink-900 text-white shadow-sm' : 'hairline bg-white hover:border-ink-900',
                              off && 'cursor-not-allowed opacity-40',
                            )}
                          >
                            <span className="flex items-center gap-1.5 font-mono text-sm font-bold">
                              <Clock className={cn('size-3.5', active ? 'text-brass-400' : 'text-steel-500')} />
                              {s.label}
                            </span>
                            <span className={cn('mt-1 block text-[11px]', active ? 'text-brass-300' : off ? 'text-bad-600' : 'text-ok-600')}>
                              {off ? 'Đã kín lịch / Qua giờ' : `Còn ${s.remaining} lịch trống`}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <Alert tone="warn">Không có khung giờ trống trong ngày này. Vui lòng chọn ngày khác.</Alert>
                  )}
                </Field>

                <Field
                  label="Chi tiết & ghi chú cho nhân viên cơ sở"
                  hint="Ghi rõ loại đồ lưu trữ, phương tiện vận chuyển hoặc nhu cầu nhờ nhân viên tư vấn thêm tại quầy (không bắt buộc)."
                >
                  <Textarea
                    rows={3}
                    maxLength={500}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="VD: Tôi muốn xem thực tế kho có máy lạnh và nhờ nhân viên tư vấn thêm kích thước khi đến cơ sở..."
                  />
                </Field>

                <div className="rounded-xl border hairline bg-paper p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-steel-500">Thông tin người đặt kho</p>
                  {status === 'authed' && user ? (
                    <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                      <p>
                        Khách hàng: <b>{user.fullName}</b>
                      </p>
                      <p>
                        Email nhận hóa đơn & xác nhận: <b>{user.email}</b>
                      </p>
                    </div>
                  ) : (
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm text-steel-600">Bạn cần đăng nhập tài khoản khách hàng để xác nhận lịch hẹn và giữ kho.</p>
                      <Button variant="outline" size="sm" onClick={() => goLogin(4)}>
                        Đăng nhập / Đăng ký ngay
                      </Button>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2">
                  <Button variant="ghost" onClick={() => setStep(2)}>
                    <ArrowLeft className="size-4" />
                    Quay lại
                  </Button>
                  <Button
                    variant="primary"
                    size="lg"
                    disabled={!(slotId || selectedSlot?.slotId)}
                    onClick={() => (status === 'authed' ? setStep(4) : goLogin(4))}
                  >
                    {status === 'authed' ? 'Tiếp tục: Chọn phương thức thanh toán' : 'Đăng nhập để chọn thanh toán'}
                    <ArrowRight className="size-4" />
                  </Button>
                </div>
              </Card>
            )}

            {/* ───────── BƯỚC 5: 2 LỰA CHỌN THANH TOÁN ───────── */}
            {step === 4 && (
              <Card className="space-y-6 p-6">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b hairline pb-4">
                  <div>
                    <h2 className="display text-2xl">Bước 5 · Chọn hình thức thanh toán & nhận kho</h2>
                    <p className="mt-0.5 text-sm text-steel-500">
                      Bạn có thể thanh toán trực tuyến để giữ chỗ cố định ngay hoặc chọn thanh toán & ký hợp đồng trực tiếp tại quầy vào ngày hẹn.
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setStep(3)}>
                    <ArrowLeft className="size-4" />
                    Đổi lịch hẹn
                  </Button>
                </div>

                <div className="grid gap-4 md:grid-cols-2" role="radiogroup" aria-label="Phương thức thanh toán">
                  {/* Lựa chọn 1: Thanh toán giữ chỗ trực tuyến */}
                  <div
                    role="radio"
                    aria-checked={paymentChoice === 'ONLINE'}
                    tabIndex={0}
                    onClick={() => setPaymentChoice('ONLINE')}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setPaymentChoice('ONLINE')}
                    className={cn(
                      'cursor-pointer rounded-2xl border-2 p-5 transition',
                      paymentChoice === 'ONLINE'
                        ? 'border-ink-900 bg-ink-950 text-white shadow-[var(--shadow-pop)]'
                        : 'hairline bg-white hover:border-ink-900',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider',
                          paymentChoice === 'ONLINE' ? 'bg-brass-500 text-ink-950' : 'bg-info-100 text-info-600',
                        )}
                      >
                        <Zap className="size-3.5" />
                        Lựa chọn 1 · Giữ kho ngay
                      </span>
                      <span
                        className={cn(
                          'grid size-6 place-items-center rounded-full border',
                          paymentChoice === 'ONLINE' ? 'border-brass-400 bg-brass-500 text-ink-950' : 'border-steel-300',
                        )}
                      >
                        {paymentChoice === 'ONLINE' && <Check className="size-3.5" />}
                      </span>
                    </div>

                    <h3 className="display mt-3 text-xl">Thanh toán giữ chỗ trực tuyến</h3>
                    <p className={cn('mt-2 text-sm leading-relaxed', paymentChoice === 'ONLINE' ? 'text-steel-200' : 'text-steel-600')}>
                      Thanh toán online ngay <b>{vnd(quote?.dueNowTotal ?? u?.online_price)}</b>. Sau khi thanh toán thành công:
                    </p>
                    <ul className={cn('mt-3 space-y-2 text-xs leading-relaxed', paymentChoice === 'ONLINE' ? 'text-steel-200' : 'text-steel-600')}>
                      <li className="flex items-start gap-2">
                        <Check className="mt-0.5 size-3.5 shrink-0 text-brass-400" />
                        <span>
                          Đơn chuyển ngay sang trạng thái <b>Đã hẹn nhận kho (Chờ check-in bàn giao)</b> theo lịch hẹn đã chọn.
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="mt-0.5 size-3.5 shrink-0 text-brass-400" />
                        <span>
                          Chưa gán mã kho ngay — vào ngày check-in, <b>nhân viên sẽ đối soát phiếu đặt giữ chỗ, gán mã kho thực tế và khởi tạo hợp đồng</b> để bạn ký nhận kho.
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="mt-0.5 size-3.5 shrink-0 text-brass-400" />
                        <span>
                          <b>Gửi ngay hóa đơn điện tử & xác nhận đơn đặt kho</b> kèm lịch hẹn cho bạn.
                        </span>
                      </li>
                    </ul>
                  </div>

                  {/* Lựa chọn 2: Thanh toán và ký hợp đồng tại quầy */}
                  <div
                    role="radio"
                    aria-checked={paymentChoice === 'COUNTER'}
                    tabIndex={0}
                    onClick={() => setPaymentChoice('COUNTER')}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setPaymentChoice('COUNTER')}
                    className={cn(
                      'cursor-pointer rounded-2xl border-2 p-5 transition',
                      paymentChoice === 'COUNTER'
                        ? 'border-ink-900 bg-ink-950 text-white shadow-[var(--shadow-pop)]'
                        : 'hairline bg-white hover:border-ink-900',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider',
                          paymentChoice === 'COUNTER' ? 'bg-brass-500 text-ink-950' : 'bg-warn-100 text-warn-600',
                        )}
                      >
                        <ShieldCheck className="size-3.5" />
                        Lựa chọn 2 · Tư vấn tại cơ sở
                      </span>
                      <span
                        className={cn(
                          'grid size-6 place-items-center rounded-full border',
                          paymentChoice === 'COUNTER' ? 'border-brass-400 bg-brass-500 text-ink-950' : 'border-steel-300',
                        )}
                      >
                        {paymentChoice === 'COUNTER' && <Check className="size-3.5" />}
                      </span>
                    </div>

                    <h3 className="display mt-3 text-xl">Thanh toán & ký hợp đồng tại quầy</h3>
                    <p className={cn('mt-2 text-sm leading-relaxed', paymentChoice === 'COUNTER' ? 'text-steel-200' : 'text-steel-600')}>
                      Chưa cần thanh toán online ngay. Khi xác nhận đặt lịch:
                    </p>
                    <ul className={cn('mt-3 space-y-2 text-xs leading-relaxed', paymentChoice === 'COUNTER' ? 'text-steel-200' : 'text-steel-600')}>
                      <li className="flex items-start gap-2">
                        <Check className="mt-0.5 size-3.5 shrink-0 text-brass-400" />
                        <span>
                          Đơn ở trạng thái <b>Chờ thanh toán</b> và giữ lịch hẹn đến ngày bạn đến cơ sở.
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="mt-0.5 size-3.5 shrink-0 text-brass-400" />
                        <span>
                          Đến cơ sở đúng ngày hẹn để <b>nhờ nhân viên tư vấn trực tiếp, xem kho hoặc thay đổi kích thước/gói thuê</b> tùy nhu cầu.
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="mt-0.5 size-3.5 shrink-0 text-brass-400" />
                        <span>
                          Sau khi chốt phương án mới thực hiện <b>thanh toán, ký hợp đồng và check-in nhận kho tại quầy</b>.
                        </span>
                      </li>
                    </ul>
                  </div>
                </div>

                {/* Tóm tắt thông tin đơn trước khi xác nhận */}
                <div className="rounded-2xl border hairline bg-paper p-4 text-sm">
                  <p className="font-bold text-ink-900">Tóm tắt đơn đặt kho của bạn</p>
                  <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                    <div>
                      <span className="text-xs text-steel-500">Cơ sở lưu trữ</span>
                      <p className="font-semibold">{activeFacility?.name}</p>
                    </div>
                    <div>
                      <span className="text-xs text-steel-500">Loại kho & điều kiện</span>
                      <p className="font-semibold">
                        {u?.name} ({u?.climate_controlled ? 'Có máy lạnh 24/7' : 'Kho tiêu chuẩn'})
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-steel-500">Thời hạn thuê</span>
                      <p className="font-semibold">
                        {fmtDate(quote?.startDate ?? start)} → {quote?.endDate ? fmtDate(quote.endDate) : `${term} tháng`} ({quote?.termMonths ?? term} tháng)
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-steel-500">Lịch hẹn đến cơ sở</span>
                      <p className="font-semibold text-brass-700">
                        {fmtDate(apptDate)} · Khung giờ {selectedSlot?.label ?? 'Đã chọn'}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t hairline pt-3">
                    <span className="font-semibold">
                      {paymentChoice === 'ONLINE' ? 'Số tiền thanh toán trực tuyến ngay:' : 'Số tiền dự kiến thanh toán tại quầy:'}
                    </span>
                    <span className="display text-2xl num">{vnd(quote?.dueNowTotal ?? u?.online_price)}</span>
                  </div>
                </div>

                <Checkbox
                  checked={agree}
                  onChange={setAgree}
                  label={
                    <span>
                      Tôi đồng ý với{' '}
                      <Link className="font-semibold text-info-600" to="/terms" target="_blank">
                        điều khoản dịch vụ
                      </Link>{' '}
                      và{' '}
                      <Link className="font-semibold text-info-600" to="/pricing-policy" target="_blank">
                        chính sách giá & hủy đặt chỗ
                      </Link>
                      .
                    </span>
                  }
                />

                {Boolean(reserve.error || payNow.error) && (
                  <Alert tone="bad">
                    {((reserve.error ?? payNow.error) as any)?.message ?? 'Không thể tạo đơn đặt kho, vui lòng thử lại.'}
                  </Alert>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <Button variant="ghost" onClick={() => setStep(3)}>
                    <ArrowLeft className="size-4" />
                    Quay lại lịch hẹn
                  </Button>
                  <Button
                    variant="primary"
                    size="lg"
                    disabled={!agree}
                    loading={reserve.isPending || payNow.isPending}
                    onClick={() => {
                      if (status !== 'authed') {
                        goLogin(4);
                        return;
                      }
                      setIdem(newIdemKey());
                      reserve.mutate(undefined);
                    }}
                  >
                    {status !== 'authed'
                      ? 'Đăng nhập để xác nhận đặt kho'
                      : paymentChoice === 'ONLINE'
                        ? 'Thanh toán trực tuyến & giữ chỗ ngay'
                        : 'Xác nhận đặt lịch & thanh toán tại quầy'}
                    <ArrowRight className="size-4" />
                  </Button>
                </div>
              </Card>
            )}

            {/* ───────── BƯỚC 6: HOÀN TẤT / XÁC NHẬN ĐƠN ───────── */}
            {step === 5 && (
              <Card className="space-y-6 p-6">
                {paymentChoice === 'ONLINE' && payNow.isPending && !resIdFromUrl ? (
                  <div className="py-8 text-center">
                    <Truck className="mx-auto size-10 animate-pulse text-brass-600" />
                    <h2 className="display mt-4 text-2xl">Đang chuyển tới cổng thanh toán trực tuyến…</h2>
                    <p className="mt-2 text-sm text-steel-500">
                      Đơn đặt kho và lịch hẹn của bạn đã được khởi tạo. Vui lòng hoàn tất thanh toán trên cổng thanh toán để nhận hóa đơn và xác nhận giữ chỗ.
                    </p>
                  </div>
                ) : isSyncingRes ? (
                  <div className="flex flex-col items-center gap-3 py-12 text-center">
                    <Spinner className="size-8" />
                    <h2 className="display text-xl text-ink-950">Đang đồng bộ kết quả thanh toán &amp; thông tin đơn đặt kho…</h2>
                    <p className="max-w-md text-sm text-steel-500">
                      Hệ thống đang tải mã đơn đặt kho, hóa đơn điện tử và thông tin loại kho của bạn.
                    </p>
                  </div>
                ) : resId && !finalRes && status === 'anon' ? (
                  <div className="space-y-5 py-4">
                    <div className="flex items-start gap-3.5 border-b hairline pb-5">
                      <div
                        className={cn(
                          'grid size-12 shrink-0 place-items-center rounded-full',
                          urlPayStatus === 'SUCCEEDED' ? 'bg-ok-100 text-ok-600' : 'bg-info-100 text-info-600',
                        )}
                      >
                        <Check className="size-6" />
                      </div>
                      <div>
                        <p className="eyebrow text-ok-600">HOÀN TẤT ĐẶT KHO · BƯỚC 6/6</p>
                        <h2 className="display mt-1 text-2xl">
                          {urlPayStatus === 'SUCCEEDED'
                            ? 'Thanh toán trực tuyến thành công!'
                            : 'Đơn đặt kho của bạn đã được ghi nhận'}
                        </h2>
                        <p className="mt-1 text-sm text-steel-500">
                          Đăng nhập lại vào tài khoản để xem mã đơn đặt kho, mã QR check-in và hóa đơn chi tiết.
                        </p>
                      </div>
                    </div>
                    {urlPayStatus === 'SUCCEEDED' && (
                      <Alert tone="ok" title="Giao dịch VNPay đã được xác nhận thành công">
                        Hệ thống đã cập nhật hóa đơn và xác nhận lịch hẹn bàn giao kho. Vui lòng đăng nhập để mở phiếu đặt chỗ của bạn.
                      </Alert>
                    )}
                    <div className="flex flex-wrap gap-3">
                      <Button
                        variant="primary"
                        size="lg"
                        onClick={() => nav(`/login?returnTo=${encodeURIComponent(loc.pathname + loc.search)}`)}
                      >
                        Đăng nhập để xem đơn đặt kho
                        <ArrowRight className="size-4" />
                      </Button>
                      <Link to="/app/reservations">
                        <Button variant="outline" size="lg">
                          Về cổng khách hàng
                        </Button>
                      </Link>
                    </div>
                  </div>
                ) : resId && !finalRes && resDetailQ.error ? (
                  <ErrorState error={resDetailQ.error} onRetry={resDetailQ.refetch} />
                ) : (
                  <>
                    <div className="flex flex-wrap items-start justify-between gap-4 border-b hairline pb-5">
                      <div className="flex items-start gap-3.5">
                        <div
                          className={cn(
                            'grid size-12 shrink-0 place-items-center rounded-full',
                            isPaid ? 'bg-ok-100 text-ok-600' : 'bg-warn-100 text-warn-600',
                          )}
                        >
                          <Check className="size-6" />
                        </div>
                        <div>
                          <p className={cn('eyebrow', isPaid ? 'text-ok-600' : 'text-brass-700')}>
                            HOÀN TẤT ĐẶT KHO · BƯỚC 6/6
                          </p>
                          <h2 className="display mt-1 text-2xl">
                            {isPaid
                              ? 'Đã thanh toán & xác nhận lịch hẹn bàn giao'
                              : finalRes?.status === 'PENDING_PAYMENT' && finalRes?.channel === 'COUNTER'
                                ? 'Đã ghi nhận đơn đặt lịch & chờ thanh toán tại quầy'
                                : finalRes?.status === 'PENDING_PAYMENT'
                                  ? 'Đơn đặt kho đã tạo — Chờ hoàn tất thanh toán'
                                  : 'Thông tin đơn đặt kho của bạn'}
                          </h2>
                          <p className="mt-1 text-sm text-steel-500">
                            Mã đơn đặt kho:{' '}
                            <b className="code text-ink-900">
                              {finalRes?.code ?? createdData?.reservation?.code ?? resId ?? '—'}
                            </b>
                          </p>
                        </div>
                      </div>
                      {(isPaid || finalRes?.status) && (
                        <StatusBadge
                          kind="reservation"
                          value={
                            isPaid && (!finalRes?.status || finalRes.status === 'PENDING_PAYMENT')
                              ? 'CONFIRMED'
                              : finalRes?.status
                          }
                        />
                      )}
                    </div>

                    {isPaid ? (
                      <Alert tone="ok" title="Trạng thái: Đã thanh toán · Chờ check-in bàn giao theo lịch hẹn">
                        Thanh toán trực tuyến thành công! Hệ thống đã phát hành <b>hóa đơn điện tử</b> và <b>xác nhận đơn đặt kho kèm lịch hẹn</b> cho tài khoản của bạn. Vui lòng mang theo CCCD/Hộ chiếu đến cơ sở theo lịch hẹn để ký hợp đồng bàn giao và nhận mã PIN kho.
                      </Alert>
                    ) : finalRes?.status === 'CANCELLED' || finalRes?.status === 'EXPIRED' ? (
                      <Alert
                        tone="bad"
                        title="Đơn đặt kho không còn hiệu lực thanh toán"
                        action={
                          <Button size="sm" variant="outline" onClick={() => nav('/book')}>
                            Đặt đơn mới
                          </Button>
                        }
                      >
                        Đơn đặt kho này đã hết thời gian giữ chỗ hoặc đã hủy. Bạn có thể tạo đơn đặt kho mới bất cứ lúc nào.
                      </Alert>
                    ) : finalRes?.channel === 'COUNTER' &&
                      finalRes?.status === 'PENDING_PAYMENT' &&
                      urlPayStatus !== 'FAILED' &&
                      urlPayStatus !== 'CANCELLED' ? (
                      <Alert tone="warn" title="Trạng thái: Chờ thanh toán & ký hợp đồng tại quầy">
                        Đơn đặt kho của bạn đang ở trạng thái <b>Chờ thanh toán</b> và được giữ đến hết khung giờ hẹn{' '}
                        <b>{fmtDateTime(finalRes.hold_expires_at)}</b>. Hãy đến cơ sở đúng ngày hẹn để được nhân viên tư vấn trực tiếp, thay đổi loại kho nếu muốn, sau đó thanh toán, ký hợp đồng và check-in nhận kho.
                      </Alert>
                    ) : canRetryOnlinePay ? (
                      <Alert
                        tone={urlPayStatus === 'FAILED' || urlPayStatus === 'CANCELLED' ? 'warn' : 'info'}
                        title={
                          urlPayStatus === 'FAILED' || urlPayStatus === 'CANCELLED'
                            ? 'Giao dịch thanh toán trực tuyến chưa hoàn tất'
                            : 'Hoàn tất thanh toán trực tuyến'
                        }
                        action={
                          resId && (
                            <Button size="sm" variant="primary" loading={payNow.isPending} onClick={() => payNow.mutate(resId)}>
                              Thanh toán lại ngay
                            </Button>
                          )
                        }
                      >
                        Nếu bạn chưa hoàn tất trên cổng thanh toán VNPay, bạn có thể bấm <b>Thanh toán lại ngay</b> hoặc thanh toán tại quầy khi đến cơ sở theo lịch hẹn.
                      </Alert>
                    ) : null}

                    {(finalRes?.code || createdData?.reservation?.code) && (
                      <ReservationQrCard
                        code={finalRes?.code ?? createdData?.reservation?.code}
                        facilityName={finalRes?.facility?.name ?? activeFacility?.name}
                        appointmentTime={
                          finalRes?.appointments?.[0]?.scheduled_start
                            ? fmtDateTime(finalRes.appointments[0].scheduled_start)
                            : `${fmtDate(apptDate)} · ${selectedSlot?.label ?? ''}`
                        }
                      />
                    )}

                    <div className="grid gap-4 rounded-2xl border hairline bg-paper p-5 text-sm sm:grid-cols-2">
                      <div>
                        <span className="text-xs text-steel-500">Cơ sở nhận kho</span>
                        <p className="font-semibold">{finalRes?.facility?.name ?? activeFacility?.name ?? '—'}</p>
                        <p className="text-xs text-steel-500">{finalRes?.facility?.address_line ?? activeFacility?.address_line ?? ''}</p>
                      </div>
                      <div>
                        <span className="text-xs text-steel-500">Loại kho đã đặt</span>
                        <p className="font-semibold">{finalRes?.unit_type?.name ?? u?.name ?? '—'}</p>
                        <p className="text-xs text-steel-500">
                          {finalRes?.allocations?.[0]?.unit?.code
                            ? `Kho được phân bổ: ${finalRes.allocations[0].unit.code}`
                            : 'Nhân viên sẽ đối soát phiếu đặt chỗ, gán kho & khởi tạo hợp đồng khi check-in'}
                        </p>
                      </div>
                      <div>
                        <span className="text-xs text-steel-500">Lịch hẹn tại cơ sở</span>
                        <p className="font-semibold text-brass-700">
                          {finalRes?.appointments?.[0]?.scheduled_start
                            ? fmtDateTime(finalRes.appointments[0].scheduled_start)
                            : selectedSlot?.label
                              ? `${fmtDate(apptDate)} · ${selectedSlot.label}`
                              : fmtDate(finalRes?.start_date ?? start)}
                        </p>
                      </div>
                      <div>
                        <span className="text-xs text-steel-500">Hóa đơn đính kèm</span>
                        <p className="font-semibold">
                          <span className="code">{finalRes?.invoices?.[0]?.code ?? createdData?.invoice?.code ?? 'INV'}</span> ·{' '}
                          <span className="num">
                            {vnd(finalRes?.invoices?.[0]?.total_amount ?? finalRes?.quote?.due_now_total ?? quote?.dueNowTotal ?? 0)}
                          </span>
                          {isPaid && <Badge tone="ok" className="ml-2">Đã thanh toán</Badge>}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap justify-between gap-3 pt-2">
                      <Link to="/app/billing">
                        <Button variant="outline">Xem hóa đơn &amp; thanh toán</Button>
                      </Link>
                      <div className="flex flex-wrap gap-2">
                        {resId && (
                          <Link to={`/app/reservations/${resId}`}>
                            <Button variant="primary" size="lg">
                              Xem chi tiết đơn đặt kho
                              <ArrowRight className="size-4" />
                            </Button>
                          </Link>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </Card>
            )}
          </div>

          {/* Cột phải: Tóm tắt kho & cơ sở đã chọn */}
          <aside className="lg:sticky lg:top-24 lg:self-start">
            {u ? (
              <div className="overflow-hidden rounded-[var(--radius-media)] border hairline bg-white shadow-[var(--shadow-card)]">
                <div className="relative">
                  <MediaImg src={unitImage(u, true)} fallbackSrc={unitDefaultImage(u, true)} alt={`Mô phỏng ${u.name}`} className="aspect-[4/3]" />
                  <span
                    className={cn(
                      'absolute right-3 top-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold backdrop-blur',
                      u.climate_controlled ? 'bg-info-600/90 text-white' : 'bg-ink-950/75 text-steel-200',
                    )}
                  >
                    <Thermometer className="size-3.5" />
                    {u.climate_controlled ? 'Có máy lạnh 24/7' : 'Kho tiêu chuẩn'}
                  </span>
                </div>
                <div className="space-y-4 p-5">
                  <div className="flex items-center justify-between">
                    <Plate>
                      {u.size_category} · {u.area_m2} M²
                    </Plate>
                    <span className="display text-xl num">
                      {vnd(u.online_price)}
                      <span className="text-xs font-normal text-steel-500">/th</span>
                    </span>
                  </div>
                  {u.width_m != null && u.depth_m != null && u.height_m != null && (
                    <div className="space-y-2">
                      <DimLine value={Number(u.width_m)} label="RỘNG" />
                      <DimLine value={Number(u.depth_m)} label="SÂU" />
                      <DimLine value={Number(u.height_m)} label="CAO" />
                    </div>
                  )}
                  {u.fits_description && <p className="text-sm text-steel-500">{u.fits_description}</p>}
                  <ul className="space-y-2 border-t hairline pt-4 text-sm">
                    <li className="flex justify-between">
                      <span className="text-steel-500">Cơ sở</span>
                      <b>{activeFacility?.name ?? finalRes?.facility?.name ?? u.facility?.name ?? '—'}</b>
                    </li>
                    <li className="flex justify-between">
                      <span className="text-steel-500">Điều kiện kho</span>
                      <b>{u.climate_controlled ? 'Có máy lạnh (18–25°C)' : 'Không máy lạnh'}</b>
                    </li>
                    <li className="flex justify-between">
                      <span className="text-steel-500">Tiền cọc (hoàn lại)</span>
                      <b className="num">{vnd(finalRes?.quote?.deposit_amount ?? quote?.depositAmount ?? u.deposit ?? 0)}</b>
                    </li>
                    <li className="flex justify-between">
                      <span className="text-steel-500">Phí quản lý (1 lần)</span>
                      <b className="num">{vnd(finalRes?.quote?.admin_fee ?? quote?.adminFee ?? u.adminFee ?? 0)}</b>
                    </li>
                    {(finalRes?.appointments?.[0]?.scheduled_start || (slotId && step >= 3)) && (
                      <li className="flex justify-between border-t hairline pt-2 text-brass-700">
                        <span>Lịch hẹn</span>
                        <b>
                          {finalRes?.appointments?.[0]?.scheduled_start
                            ? fmtDateTime(finalRes.appointments[0].scheduled_start)
                            : `${fmtDate(apptDate)} (${selectedSlot?.label ?? ''})`}
                        </b>
                      </li>
                    )}
                  </ul>
                  <p className="flex items-center gap-2 rounded-lg bg-paper px-3 py-2 text-xs text-steel-600">
                    <KeyRound className="size-4 shrink-0 text-brass-700" />
                    Nhận mã PIN mở cửa riêng sau khi ký hợp đồng &amp; bàn giao kho.
                  </p>
                </div>
              </div>
            ) : step === 5 && isSyncingRes ? (
              <Skeleton className="h-96 rounded-2xl" />
            ) : (
              <Card className="p-5 text-sm text-steel-500">
                {selectedUnitTypeId ? 'Đang tải thông tin loại kho…' : 'Chọn cơ sở và loại kho ở cột bên trái để xem thông số chi tiết.'}
              </Card>
            )}
          </aside>
        </div>
      )}
    </Container>
  );
}

export function PaymentResult() {
  const [sp] = useSearchParams();
  const status = sp.get('status');
  const ok = status === 'SUCCEEDED';
  return (
    <div className="mx-auto max-w-lg px-4 py-24 text-center">
      <div className={cn('mx-auto mb-6 grid size-20 place-items-center rounded-full', ok ? 'bg-ok-100 text-ok-600' : status === 'PENDING' ? 'bg-warn-100 text-warn-600' : 'bg-bad-100 text-bad-600')}>{ok ? <Check className="size-10" /> : <Zap className="size-10" />}</div>
      <h1 className="display text-[34px]">{ok ? 'Thanh toán giữ chỗ thành công' : status === 'PENDING' ? 'Giao dịch đang xử lý' : 'Thanh toán chưa hoàn tất'}</h1>
      <p className="mt-3 text-steel-500">{ok ? 'Đơn đặt kho của bạn đã chuyển sang trạng thái chờ check-in bàn giao theo lịch hẹn. Hóa đơn và xác nhận đặt kho đã được gửi tới tài khoản của bạn.' : 'Bạn có thể thử lại từ trang đặt chỗ nếu kho còn đang được giữ.'}</p>
      <div className="mt-8 flex justify-center gap-2"><Link to="/app/reservations"><Button variant="primary">Xem đặt chỗ của tôi</Button></Link><Link to="/"><Button variant="ghost">Về trang chủ</Button></Link></div>
    </div>
  );
}

export function SignContractByEmail() {
  const [sp] = useSearchParams();
  const contractId = sp.get('contractId') ?? '';
  const token = sp.get('token') ?? '';
  const [sig, setSig] = useState<string | null>(null);
  const [signedDone, setSignedDone] = useState(false);

  const infoQ = useGet<any>(
    contractId && token ? `/contracts/${contractId}/sign-email-info` : null,
    { token },
    { staleTime: 0 },
  );

  const signAct = useAct(
    () => post(`/contracts/${contractId}/sign-by-email`, { token, signature: sig }),
    {
      ok: 'Đã ký hợp đồng điện tử thành công!',
      onSuccess: () => {
        setSignedDone(true);
        void infoQ.refetch();
      },
    },
  );

  if (!contractId || !token) {
    return (
      <Container className="py-20">
        <Card className="mx-auto max-w-lg p-8 text-center">
          <Alert tone="bad" title="Thiếu thông tin liên kết ký hợp đồng">
            Vui lòng mở đúng liên kết ký hợp đồng được gửi tới email của bạn hoặc liên hệ nhân viên tại quầy check-in.
          </Alert>
        </Card>
      </Container>
    );
  }

  return (
    <Container className="py-12">
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <p className="eyebrow text-brass-700">KÝ HỢP ĐỒNG ĐIỆN TỬ QUA EMAIL</p>
          <h1 className="display mt-1 text-3xl sm:text-4xl">Xác nhận & Ký hợp đồng thuê kho</h1>
          <p className="mt-1 text-sm text-steel-500">
            Kiểm tra thông tin hợp đồng và kho được nhân viên gán tại cơ sở, sau đó ký tên bên dưới để hoàn tất bước ký hợp đồng.
          </p>
        </div>

        <Async q={infoQ}>
          {(c) => {
            const alreadySigned = signedDone || c.status === 'SIGNED' || c.status === 'ACTIVE';
            return (
              <Card className="space-y-6 p-6">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b hairline pb-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-steel-500">Mã hợp đồng</p>
                    <p className="code text-2xl font-extrabold text-ink-950">{c.code}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {c.pdfUrl && (
                      <a href={c.pdfUrl} target="_blank" rel="noreferrer">
                        <Button variant="outline" size="sm">Xem toàn văn PDF</Button>
                      </a>
                    )}
                    <Badge tone={alreadySigned ? 'ok' : 'warn'}>
                      {alreadySigned ? 'ĐÃ KÝ HỢP ĐỒNG' : 'CHỜ KHÁCH HÀNG KÝ'}
                    </Badge>
                  </div>
                </div>

                <div className="grid gap-4 rounded-2xl border hairline bg-paper p-5 text-sm sm:grid-cols-2">
                  <div>
                    <span className="text-xs text-steel-500">Bên thuê (Khách hàng)</span>
                    <p className="font-bold text-ink-950">{c.customer?.fullName}</p>
                    <p className="text-xs text-steel-500">{c.customer?.email} · {c.customer?.phone}</p>
                  </div>
                  <div>
                    <span className="text-xs text-steel-500">Cơ sở lưu trữ</span>
                    <p className="font-bold text-ink-950">{c.facility?.name}</p>
                    <p className="text-xs text-steel-500">{c.facility?.address}</p>
                  </div>
                  <div>
                    <span className="text-xs text-steel-500">Mã kho & Loại kho bàn giao</span>
                    <p className="font-bold text-brass-700">
                      Kho <span className="code">{c.unit?.code}</span> — {c.unitType?.name}
                    </p>
                    <p className="text-xs text-steel-500">
                      {c.unit?.zone} (Tầng {c.unit?.floor}) · {c.unitType?.areaM2} m² · {c.unitType?.climateControlled ? 'Có máy lạnh 24/7' : 'Kho tiêu chuẩn'}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs text-steel-500">Thời hạn & Chi phí</span>
                    <p className="font-bold text-ink-950">
                      {fmtDate(c.startDate)} → {fmtDate(c.endDate)} ({c.termMonths} tháng)
                    </p>
                    <p className="text-xs text-steel-500">
                      Giá thuê: <b className="num">{vnd(c.monthlyRent)}/tháng</b> · Tiền cọc: <b className="num">{vnd(c.deposit)}</b>
                    </p>
                  </div>
                </div>

                {alreadySigned ? (
                  <div className="space-y-4 rounded-2xl border-2 border-ok-500 bg-ok-100/50 p-6 text-center">
                    <div className="mx-auto grid size-14 place-items-center rounded-full bg-ok-600 text-white">
                      <Check className="size-8" />
                    </div>
                    <h2 className="display text-2xl text-ink-950">Bạn đã ký hợp đồng {c.code} thành công!</h2>
                    <p className="mx-auto max-w-md text-sm text-steel-600">
                      Màn hình của nhân viên tại quầy đã được cập nhật sang bước <b>Bàn giao & Cấp mã PIN</b>. Nhân viên sẽ hoàn tất bàn giao và cấp mã PIN mở kho trực tiếp trên web cho bạn (mã PIN chỉ hiển thị trên web, không gửi qua email).
                    </p>
                    <div className="flex flex-wrap justify-center gap-3 pt-2">
                      <Link to="/app/contracts">
                        <Button variant="primary">Vào trang Hợp đồng của tôi (Xem mã PIN sau khi bàn giao)</Button>
                      </Link>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <Field label="Chữ ký điện tử của khách hàng (Vẽ chữ ký vào khung bên dưới)" required>
                      <SignaturePad onChange={setSig} />
                    </Field>
                    <p className="text-xs text-steel-500">
                      Bằng việc ký tên và bấm xác nhận bên dưới, tôi xác nhận đã đọc, đồng ý với toàn bộ điều khoản của hợp đồng thuê kho <b>{c.code}</b> (Kho <b>{c.unit?.code}</b>).
                    </p>
                    <Button
                      variant="primary"
                      size="lg"
                      className="w-full"
                      disabled={!sig}
                      loading={signAct.isPending}
                      onClick={() => signAct.mutate(undefined)}
                    >
                      Xác nhận ký hợp đồng thuê kho
                    </Button>
                  </div>
                )}
              </Card>
            );
          }}
        </Async>
      </div>
    </Container>
  );
}
