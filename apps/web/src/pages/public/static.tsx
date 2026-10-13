import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, Phone, Mail, Clock, MapPin, Receipt, Truck, Users, FileSpreadsheet, ShieldCheck, Boxes, KeyRound, Building2, Check, MessageCircle } from 'lucide-react';
import { useGet, useAct } from '@/lib/hooks';
import { post } from '@/lib/api';
import { Async, Card, Field, Input, Textarea, Button, Alert, Select, cn } from '@/ui';
import { vnd } from '@/lib/format';
import { SCENES, FILM, facilityCover, sm, unitImageBySize } from '@/lib/media';
import { Container, SectionHead, Reveal, MediaImg, Plate, StatBlock, CropFrame, Eyebrow } from '@/ui/brand';
import { PageHero } from '@/cinema/CinemaHero';
import { FaqList, HOME_FAQ } from './Home';


class CoreSettlementBarCoordinator {
  private readonly maxWindowDays = 33;
  private readonly branchScope = 'flow1:settlement';

  isEligibleWindow(elapsedDays: number, hasClearedBalance: boolean): boolean {
    if (elapsedDays < 0 || elapsedDays > this.maxWindowDays) return false;
    return hasClearedBalance;
  }

  normalizeReference(rawCode: string): string {
    const cleaned = rawCode.trim().toUpperCase();
    return cleaned ? `${this.branchScope}:${cleaned}` : this.branchScope;
  }
}
function Doc({ image, eyebrow, title, sub, children, toc }: { image: string; eyebrow: string; title: React.ReactNode; sub?: React.ReactNode; children: React.ReactNode; toc?: string[] }) {
  return (
    <>
      <PageHero env="night" opening="focus" mode="words" image={image} eyebrow={eyebrow} title={title} sub={sub} />
      <Container className="grid gap-12 py-14 lg:grid-cols-[220px_1fr]">
        <aside className="hidden lg:block">{toc && <nav className="sticky top-24 space-y-1 border-l hairline pl-4" aria-label="Mục lục">{toc.map((t, i) => <a key={t} href={`#s${i}`} className="block py-1 text-sm text-steel-500 hover:text-ink-900"><span className="mr-2 font-mono text-xs text-brass-700">{String(i + 1).padStart(2, '0')}</span>{t}</a>)}</nav>}</aside>
        <div className="max-w-[760px] space-y-4 text-[16px] leading-relaxed text-ink-800">{children}</div>
      </Container>
    </>
  );
}
const H = ({ children, i }: { children: React.ReactNode; i?: number }) => <h2 id={i !== undefined ? `s${i}` : undefined} className="display scroll-mt-24 pt-6 text-[26px]">{i !== undefined && <span className="mr-3 font-mono text-sm text-brass-700">{String(i + 1).padStart(2, '0')}</span>}{children}</h2>;

export function PricingPolicy() {
  const q = useGet<any>('/catalog/policy-summary', undefined, { staleTime: 30_000 });
  const types = useGet<{ data: any[] }>('/catalog/unit-types', undefined, { staleTime: 120_000 });
  const bySize: Record<string, { min: number; max: number; area: number }> = {};
  (types.data?.data ?? []).forEach((u) => { const p = Number(u.online_price); const c = bySize[u.size_category]; bySize[u.size_category] = c ? { min: Math.min(c.min, p), max: Math.max(c.max, p), area: c.area } : { min: p, max: p, area: Number(u.area_m2) }; });
  return (
    <Doc image={SCENES.lobbyB} eyebrow="Bảng giá & chính sách" title={<>Giá rõ ràng<br /><span className="text-brass-400">trước khi bạn trả tiền.</span></>} sub="Áp dụng chung cho mọi cơ sở, trừ khi cơ sở có chính sách riêng được ghi rõ." toc={['Bảng giá tham khảo', 'Giữ chỗ và đặt cọc', 'Hủy đặt chỗ', 'Thanh toán trễ', 'Gia hạn và trả kho']}>
      <Async q={q}>{(p) => { const x = p.params; return (<>
        <p className="text-sm text-steel-500">Phiên bản chính sách <Plate size="sm">v{p.version}</Plate> · Giá niêm yết đã gồm VAT {x.vat_rate}%.</p>
        <H i={0}>Bảng giá tham khảo</H>
        <div className="grid gap-3 sm:grid-cols-2">{Object.entries(bySize).sort((a, b) => a[1].min - b[1].min).map(([s, v]) => (
          <div key={s} className="flex items-center gap-4 overflow-hidden rounded-xl border hairline bg-white"><MediaImg src={unitImageBySize(s, true)} alt="" className="aspect-square w-24 shrink-0" /><div className="py-3 pr-4"><Plate size="sm">{s}</Plate><p className="mt-1.5 font-bold num">{vnd(v.min)}{v.max > v.min && <span className="font-normal text-steel-500"> – {vnd(v.max)}</span>}</p><p className="text-xs text-steel-500">/tháng · từ {v.area} m²</p></div></div>
        ))}</div>
        {(x.term_discounts ?? []).some((t: any) => t.pct > 0) && <p className="text-sm">Giá trên là giá thuê 1 tháng. Thuê dài hơn được giảm giá thuê mỗi tháng: {[...x.term_discounts].filter((t: any) => t.pct > 0).sort((m: any, n: any) => m.months - n.months).map((t: any) => `${t.months} tháng giảm ${t.pct}%`).join(', ')}.{x.prepaid_discount_pct > 0 ? ` Trả trước cả kỳ thuê (trả một lần) được giảm thêm ${x.prepaid_discount_pct}%.` : ''} Mức giá được giữ nguyên trong suốt kỳ hạn của hợp đồng.</p>}
        <H i={1}>Giữ chỗ và đặt cọc</H>
        <ul className="list-disc space-y-1.5 pl-5"><li>Kho được giữ <b>{x.hold_minutes} phút</b> kể từ khi tạo đặt chỗ; quá hạn chưa thanh toán sẽ tự động hủy.</li><li>Tiền cọc: <b>{x.deposit_type === 'MONTHS_OF_RENT' ? `${x.deposit_value} tháng tiền thuê` : vnd(x.deposit_value)}</b>, hoàn lại khi trả kho sau khi trừ các khoản hợp lệ.</li><li>Phí quản lý một lần: <b>{vnd(x.admin_fee)}</b>{x.admin_fee_refundable ? '' : ' (không hoàn)'}.</li><li>Thời hạn thuê được chọn: {x.allowed_terms_months?.join(', ')} tháng. Đặt trước tối đa {x.max_advance_booking_days} ngày.</li></ul>
        <H i={2}>Hủy đặt chỗ — hoàn tiền theo bậc thang</H>
        <Card className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b hairline text-left"><th className="eyebrow p-4 font-medium text-steel-500">Hủy trước ngày nhận kho</th><th className="eyebrow p-4 font-medium text-steel-500">Hoàn tiền thuê</th><th className="eyebrow p-4 font-medium text-steel-500">Hoàn cọc</th></tr></thead><tbody>{x.cancellation_tiers?.map((t: any, i: number) => <tr key={i} className="border-b hairline last:border-0"><td className="p-4">≥ {t.minHoursBefore >= 24 ? `${Math.round(t.minHoursBefore / 24)} ngày` : `${t.minHoursBefore} giờ`}</td><td className="p-4"><Bar v={t.rentRefundPct} /></td><td className="p-4"><Bar v={t.depositRefundPct} /></td></tr>)}</tbody></table></Card>
        <H i={3}>Thanh toán trễ</H>
        <p>Hạn thanh toán có ân hạn {x.grace_days} ngày. Sau đó áp phí trễ {x.late_fee_pct}% (tối đa {vnd(x.late_fee_cap)}). Từ ngày {x.lockout_day} có thể khóa truy cập; từ ngày {x.default_day} hợp đồng chuyển sang xử lý vi phạm.</p>
        <H i={4}>Gia hạn và trả kho</H>
        <p>Cửa sổ gia hạn mở {x.renewal_window_days} ngày trước ngày hết hạn; tăng giá khi gia hạn tối đa {x.renewal_max_increase_pct}% và được báo trước {x.price_change_notice_days} ngày. Báo trả kho trước {x.move_out_notice_days} ngày.</p>
        <div className="pt-6"><Link to="/book"><Button variant="primary" size="lg">Đặt kho ngay<ArrowRight className="size-4" /></Button></Link></div>
      </>); }}</Async>
    </Doc>
  );
}
function Bar({ v }: { v: number }) { return <span className="flex items-center gap-3"><span className="h-1.5 w-24 overflow-hidden rounded-full bg-steel-100"><span className="block h-full rounded-full bg-brass-500" style={{ width: `${v}%` }} /></span><span className="font-semibold num">{v}%</span></span>; }

const FAQ_GROUPS: [string, [string, string][]][] = [
  ['Đặt kho & nhận kho', [HOME_FAQ[0], ['Tôi có thể xem kho trước khi đặt không?', 'Có. Gửi yêu cầu ở trang Liên hệ hoặc gọi hotline để hẹn giờ xem kho tại cơ sở.'], ['Giữ chỗ bao lâu?', 'Kho được giữ trong thời gian giữ chỗ của chính sách (mặc định 15 phút) để bạn thanh toán; quá hạn sẽ tự hủy.'], HOME_FAQ[3]]],
  ['Truy cập & an ninh', [HOME_FAQ[2], HOME_FAQ[4], ['Ai khác có thể vào kho của tôi?', 'Chỉ người có mã PIN/thẻ của hợp đồng. Mọi lần ra vào được ghi nhật ký; bạn có thể đổi PIN bất cứ lúc nào.']]],
  ['Thanh toán & hợp đồng', [['Khi nào tôi bị tính phí trễ?', 'Sau thời gian ân hạn của chính sách hiện hành. Bạn nhận nhắc hạn trước khi đến hạn thanh toán.'], ['Hợp đồng có tự gia hạn không?', 'Bạn bật hoặc tắt tự động gia hạn trong chi tiết hợp đồng. Cửa sổ gia hạn thủ công mở trước ngày hết hạn.'], ['Doanh nghiệp có được xuất hóa đơn VAT?', 'Có. Khai báo thông tin doanh nghiệp trong tài khoản, hóa đơn được phát hành theo từng kỳ.']]],
  ['Đồ được cất', [HOME_FAQ[1], ['Kho có bảo hiểm đồ không?', 'Vaultra không bảo hiểm tài sản trừ khi có thỏa thuận riêng. Bạn nên tự mua bảo hiểm cho đồ giá trị cao.']]],
];
export function Faq() {
  return (
    <Doc image={SCENES.keypad} eyebrow="Hỏi đáp" title={<>Câu hỏi thường gặp</>} sub="Không thấy câu trả lời? Hỏi trợ lý Vaultra ở góc màn hình — trợ lý trả lời theo chính sách đang áp dụng." toc={FAQ_GROUPS.map(([g]) => g)}>
      {FAQ_GROUPS.map(([g, items], i) => <div key={g}><H i={i}>{g}</H><div className="mt-4"><FaqList items={items} /></div></div>)}
      <Card className="mt-10 flex flex-wrap items-center justify-between gap-4 p-6"><div><p className="font-bold">Vẫn còn thắc mắc?</p><p className="text-sm text-steel-500">Đội hỗ trợ phản hồi trong giờ làm việc.</p></div><Link to="/contact"><Button variant="dark">Liên hệ chúng tôi</Button></Link></Card>
    </Doc>
  );
}
export function Terms() {
  const toc = ['Phạm vi dịch vụ', 'Hàng hóa bị cấm', 'Thanh toán', 'Quyền truy cập', 'Chấm dứt & tài sản bị bỏ lại'];
  return <Doc image={SCENES.corridor} eyebrow="Pháp lý" title="Điều khoản sử dụng" sub="Bằng việc đặt kho hoặc sử dụng dịch vụ, bạn đồng ý các điều khoản dưới đây. Đây là bản mô tả cho dự án học phần." toc={toc}><H i={0}>{toc[0]}</H><p>Vaultra cung cấp không gian lưu trữ tự quản. Chúng tôi không giữ hộ, không bảo hiểm tài sản trừ khi có thỏa thuận riêng.</p><H i={1}>{toc[1]}</H><p>Vũ khí, chất nổ, chất dễ cháy, hóa chất độc hại, thực phẩm tươi sống, động vật, tài sản có nguồn gốc bất hợp pháp.</p><H i={2}>{toc[2]}</H><p>Hóa đơn được phát hành theo chu kỳ hợp đồng. Chậm thanh toán chịu phí trễ và có thể bị khóa truy cập theo chính sách đã công bố.</p><H i={3}>{toc[3]}</H><p>Mã PIN và thẻ là của riêng bạn. Việc chia sẻ chịu trách nhiệm của khách thuê.</p><H i={4}>{toc[4]}</H><p>Khi hợp đồng kết thúc, bạn phải dọn kho. Tài sản bị bỏ lại được xử lý theo quy trình thông báo và thời hạn trong chính sách.</p></Doc>;
}
export function Privacy() {
  const toc = ['Dữ liệu thu thập', 'Quyền của bạn', 'Bảo mật'];
  return <Doc image={SCENES.keypad} eyebrow="Pháp lý" title="Chính sách bảo mật" toc={toc}><H i={0}>{toc[0]}</H><p>Chúng tôi thu thập thông tin tài khoản, liên hệ, giấy tờ nhận dạng (chỉ lưu 4 ký tự cuối) và dữ liệu giao dịch để vận hành dịch vụ.</p><H i={1}>{toc[1]}</H><p>Bạn có thể xuất dữ liệu cá nhân hoặc yêu cầu xóa tài khoản trong Tài khoản → Quyền riêng tư. Dữ liệu tài chính và hợp đồng được lưu theo thời hạn pháp luật.</p><H i={2}>{toc[2]}</H><p>Mật khẩu băm Argon2id, phiên đăng nhập thu hồi được, nhật ký truy cập được lưu và giới hạn theo vai trò.</p></Doc>;
}

export function Contact() {
  const [sp] = useSearchParams();
  const fac = useGet<{ data: any[] }>('/catalog/facilities', undefined, { staleTime: 300_000 });
  const [f, setF] = useState({ name: '', email: '', phone: '', topic: sp.get('facility') ? 'Hẹn xem kho' : 'Tư vấn thuê kho', facility: sp.get('facility') ?? '', message: '' });
  const [sent, setSent] = useState(false);
  const send = useAct(async () => {
    const facName = fac.data?.data.find((x) => x.slug === f.facility)?.name;
    const note = `[${f.topic}${facName ? ` · ${facName}` : ''}] ${f.name}${f.phone ? ` (${f.phone})` : ''}: ${f.message}`.slice(0, 500);
    const c = await post('/assistant/conversations', {});
    return post(`/assistant/conversations/${c.id}/handoff`, { email: f.email, note, facility: f.facility || undefined, name: f.name.trim(), phone: f.phone.trim() || undefined, message: `[${f.topic}] ${f.message.trim()}` });
  }, { onSuccess: () => setSent(true) });
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email);
  const valid = f.name.trim().length >= 2 && emailOk && f.message.trim().length >= 10;
  return (
    <>
      <PageHero env="dusk" opening="iris" image={SCENES.lobbyA} eyebrow="Liên hệ" title={<>Nói chuyện với<br /><span className="text-brass-400">người thật.</span></>} sub="Tư vấn chọn kho, hẹn xem kho, báo giá cho doanh nghiệp — chúng tôi phản hồi qua email trong giờ làm việc." />
      <Container className="grid gap-10 py-14 lg:grid-cols-[1fr_1.2fr]">
        <div className="space-y-4">
          {[[Phone, 'Hotline', '1900 6868', 'tel:19006868'], [Mail, 'Email', 'hotro@vaultra.test', 'mailto:hotro@vaultra.test'], [Clock, 'Giờ làm việc', '08:00–18:00, Thứ 2 – Thứ 7', null], [MessageCircle, 'Trợ lý Vaultra', 'Trả lời 24/7 ở góc phải màn hình', null]].map(([I, k, v, href]: any) => (
            <div key={k} className="flex items-center gap-4 rounded-xl border hairline bg-white p-5"><span className="grid size-11 place-items-center rounded-xl bg-ink-900 text-brass-400"><I className="size-5" /></span><div><p className="eyebrow text-steel-500">{k}</p>{href ? <a href={href} className="font-bold hover:text-brass-700">{v}</a> : <p className="font-bold">{v}</p>}</div></div>
          ))}
          <div className="space-y-2 pt-4">{(fac.data?.data ?? []).map((x) => <Link key={x.id} to={`/locations/${x.slug}`} className="flex items-center gap-3 rounded-xl p-2 hover:bg-white"><MediaImg src={facilityCover(x).replace('.webp', '-sm.webp')} alt="" className="size-14 shrink-0 rounded-lg" /><span className="min-w-0"><span className="block font-semibold">{x.name}</span><span className="flex items-center gap-1 truncate text-xs text-steel-500"><MapPin className="size-3.5" />{x.address_line}, {x.district}</span></span><span className="ml-auto font-mono text-xs text-steel-500">{x.phone}</span></Link>)}</div>
        </div>
        {sent ? <Card className="grid place-items-center p-10 text-center"><div><span className="mx-auto grid size-16 place-items-center rounded-full bg-ok-100 text-ok-600"><Check className="size-8" /></span><p className="display mt-5 text-3xl">Đã nhận yêu cầu</p><p className="mt-2 text-steel-500">Nhân viên sẽ phản hồi tới <b>{f.email}</b> trong giờ làm việc.</p><Button variant="outline" className="mt-6" onClick={() => { setSent(false); setF({ ...f, message: '' }); }}>Gửi yêu cầu khác</Button></div></Card> : (
          <Card className="p-6 sm:p-8">
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (valid) send.mutate(undefined); }} noValidate>
              <p className="display text-2xl">Gửi yêu cầu</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Họ tên" required><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" /></Field>
                <Field label="Số điện thoại" hint="Không bắt buộc"><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} inputMode="tel" autoComplete="tel" /></Field>
                <Field label="Email" required error={f.email && !emailOk ? 'Email chưa đúng định dạng' : undefined}><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" /></Field>
                <Field label="Chủ đề"><Select value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })}>{['Tư vấn thuê kho', 'Hẹn xem kho', 'Báo giá doanh nghiệp', 'Hỗ trợ hợp đồng', 'Khác'].map((t) => <option key={t}>{t}</option>)}</Select></Field>
                <Field label="Cơ sở quan tâm" className="sm:col-span-2"><Select value={f.facility} onChange={(e) => setF({ ...f, facility: e.target.value })}><option value="">Chưa chọn</option>{(fac.data?.data ?? []).map((x) => <option key={x.slug} value={x.slug}>{x.name}</option>)}</Select></Field>
              </div>
              <Field label="Nội dung" required hint={`${f.message.trim().length}/10 ký tự tối thiểu`}><Textarea rows={5} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} placeholder="Ví dụ: Tôi cần kho khoảng 5 m² từ tháng sau, có chỗ cho xe đạp…" /></Field>
              {send.isError && <Alert tone="bad">Chưa gửi được. Vui lòng thử lại hoặc gọi hotline 1900 6868.</Alert>}
              <Button type="submit" variant="primary" size="lg" disabled={!valid} loading={send.isPending}>Gửi yêu cầu<ArrowRight className="size-4" /></Button>
            </form>
          </Card>
        )}
      </Container>
    </>
  );
}

export function About() {
  const fac = useGet<{ data: any[] }>('/catalog/facilities', undefined, { staleTime: 300_000 });
  const list = fac.data?.data ?? [];
  const area = list.reduce((a, f) => a + Number(f.total_area_m2 ?? 0), 0);
  return (
    <>
      <PageHero tall env="street" opening="door" mode="words" video={FILM.hero} image={facilityCover({ slug: 'vaultra-cau-giay' })} eyebrow="Về Vaultra" title={<>Chúng tôi xây kho<br /><span className="text-brass-400">như xây két sắt.</span></>} sub="Vaultra ra đời từ một câu hỏi đơn giản: tại sao thuê một chỗ cất đồ lại cần nhiều giấy tờ, cuộc gọi và chìa khóa đến vậy?" />
      <section className="bg-ink-950 py-16 text-white"><Container className="grid grid-cols-2 gap-10 lg:grid-cols-4"><StatBlock value={list.length || '—'} label="Cơ sở" /><StatBlock value={area ? `${area.toLocaleString('vi-VN')}` : '—'} label="m² lưu trữ" /><StatBlock value={list.reduce((a, f) => a + (f.unitTypeCount ?? 0), 0) || '—'} label="Loại kho" /><StatBlock value="24/7" label="Giám sát" /></Container></section>
      <section className="py-20 lg:py-28"><Container className="grid items-center gap-12 lg:grid-cols-2">
        <CropFrame><MediaImg src={SCENES.corridor} alt="Hành lang kho Vaultra" className="aspect-[16/11] rounded-[var(--radius-media)]" /></CropFrame>
        <div><SectionHead index="01" eyebrow="Cách chúng tôi làm" title="Ít giấy tờ. Nhiều minh bạch." sub="Toàn bộ vòng đời thuê kho — báo giá, giữ chỗ, ký hợp đồng, thanh toán, gia hạn, trả kho và hoàn cọc — đều nằm trong một tài khoản. Nhân viên tại cơ sở tập trung vào việc quan trọng nhất: kiểm tra kho cùng bạn và giữ cơ sở an toàn." />
          <ul className="mt-8 space-y-3">{['Giá niêm yết đã gồm VAT, hiển thị đầy đủ trước khi thanh toán', 'Chính sách có phiên bản, thay đổi được báo trước', 'Mọi thao tác nhạy cảm đều có nhật ký kiểm toán'].map((t) => <li key={t} className="flex gap-3"><Check className="mt-0.5 size-5 shrink-0 text-brass-700" />{t}</li>)}</ul></div>
      </Container></section>
      <section className="border-y hairline bg-white py-20 lg:py-28"><Container>
        <SectionHead index="02" eyebrow="Giá trị" title="Ba cam kết cốt lõi với khách thuê." />
        <div className="mt-12 grid gap-6 md:grid-cols-3">{[[ShieldCheck, 'An toàn trước tiên', 'Bảo vệ, camera toàn tuyến, mã PIN theo từng hợp đồng, khóa truy cập ngay khi cần.', SCENES.keypad], [Receipt, 'Tiền bạc rõ ràng', 'Không phí ẩn. Cọc được hoàn theo biên bản trả kho có ảnh đối chiếu.', SCENES.lobbyA], [Boxes, 'Linh hoạt thật sự', 'Đổi kho, gia hạn, trả kho sớm — mọi thứ theo chính sách đã công bố.', SCENES.moving]].map(([I, t, d, img]: any, i) => (
          <Reveal key={t} delay={i * 80} className="overflow-hidden rounded-[var(--radius-media)] border hairline bg-paper"><MediaImg src={sm(img)} alt="" className="aspect-[16/10]" /><div className="p-6"><I className="size-6 text-brass-700" /><p className="mt-3 text-lg font-bold">{t}</p><p className="mt-1.5 text-sm leading-relaxed text-steel-500">{d}</p></div></Reveal>
        ))}</div>
      </Container></section>
      <section className="py-20 lg:py-28"><Container>
        <SectionHead index="03" eyebrow="Cơ sở" title="Đến thăm chúng tôi." action={<Link to="/locations"><Button variant="outline">Tất cả cơ sở<ArrowRight className="size-4" /></Button></Link>} />
        <div className="mt-10 grid gap-4 md:grid-cols-3">{list.map((f) => <Link key={f.id} to={`/locations/${f.slug}`} className="group relative block overflow-hidden rounded-[var(--radius-media)]"><MediaImg src={sm(facilityCover(f))} alt={f.name} className="aspect-[4/3]" imgClassName="transition duration-700 group-hover:scale-105" /><div className="absolute inset-0 bg-gradient-to-t from-ink-950/90 to-transparent" /><div className="absolute bottom-0 p-5 text-white"><Plate dark size="sm">{f.code}</Plate><p className="display mt-2 text-2xl">{f.name}</p><p className="text-sm text-steel-300">Mở cửa từ {f.opened_at ? new Date(f.opened_at).toLocaleDateString('vi-VN', { month: '2-digit', year: 'numeric' }) : '—'} · {Number(f.total_area_m2 ?? 0).toLocaleString('vi-VN')} m²</p></div></Link>)}</div>
      </Container></section>
    </>
  );
}

export function Business() {
  return (
    <>
      <PageHero tall env="dawn" opening="slide" image={SCENES.business} eyebrow="Vaultra cho doanh nghiệp" title={<>Kho hàng linh hoạt<br /><span className="text-brass-400">không cần thuê nhà xưởng.</span></>} sub="Cho shop online, nhà phân phối, văn phòng cần lưu hồ sơ và đội kỹ thuật cần chỗ để thiết bị — thuê theo tháng, mở rộng khi cần.">
        <div className="mt-8 flex flex-wrap gap-3"><Link to="/contact"><Button variant="primary" size="lg">Nhận báo giá doanh nghiệp<ArrowRight className="size-4" /></Button></Link><Link to="/book?size=XL"><Button variant="glass" size="lg">Đặt kho lớn ngay</Button></Link></div>
      </PageHero>
      <section className="py-20 lg:py-28"><Container>
        <SectionHead index="01" eyebrow="Lợi ích" title="Mọi thứ một kho hàng nhỏ cần." />
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{[[Truck, 'Xe tải vào tận cửa', 'Kho tầng trệt, lối xe tải, khu bốc dỡ và xe đẩy miễn phí.'], [Receipt, 'Hóa đơn VAT theo kỳ', 'Khai báo thông tin doanh nghiệp một lần, hóa đơn phát hành tự động.'], [Users, 'Nhiều người truy cập', 'Cấp mã PIN cho nhân viên kho, thu hồi ngay khi nghỉ việc.'], [FileSpreadsheet, 'Nhật ký ra vào', 'Biết ai vào kho, lúc nào — tiện đối soát hàng tồn.'], [KeyRound, 'Kho điều hòa cho hàng nhạy cảm', 'Mỹ phẩm, điện tử, hồ sơ giấy được giữ ổn định.'], [Building2, 'Nhiều cơ sở, một tài khoản', 'Thuê kho ở cả Hà Nội và TP. HCM, quản lý chung một nơi.']].map(([I, t, d]: any, i) => (
          <Reveal key={t} delay={(i % 3) * 70} className="rounded-[var(--radius-card)] border hairline bg-white p-6"><span className="grid size-11 place-items-center rounded-xl bg-ink-900 text-brass-400"><I className="size-5" /></span><p className="mt-4 text-lg font-bold">{t}</p><p className="mt-1.5 text-sm leading-relaxed text-steel-500">{d}</p></Reveal>
        ))}</div>
      </Container></section>
      <section className="grain bg-ink-950 py-20 text-white lg:py-28"><Container className="grid items-center gap-12 lg:grid-cols-2">
        <div className="grid grid-cols-2 gap-3"><MediaImg src={unitImageBySize('XL', true)} alt="Kho cực lớn với kệ hàng" className="aspect-[4/3] rounded-xl" /><MediaImg src={unitImageBySize('L', true)} alt="Kho lớn" className="aspect-[4/3] rounded-xl" /><MediaImg src={sm(facilityCover({ slug: 'vaultra-thu-duc' }))} alt="Dãy kho xe vào tận cửa" className="col-span-2 aspect-[16/8] rounded-xl" /></div>
        <div><SectionHead dark index="02" eyebrow="Gợi ý cấu hình" title="Bắt đầu nhỏ, mở rộng khi đơn tăng." />
          <ul className="mt-8 divide-y divide-white/10 border-y border-white/10">{[['Shop mới', 'Kho vừa 5 m²', 'M'], ['Shop đang tăng trưởng', 'Kho lớn 10 m² tầng trệt', 'L'], ['Nhà phân phối nhỏ', 'Kho cực lớn 20 m² + kệ', 'XL']].map(([a, b, s]) => <li key={a} className="flex items-center justify-between gap-4 py-4"><span><span className="block font-bold">{a}</span><span className="text-sm text-steel-400">{b}</span></span><Link to={`/book?size=${s}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-brass-400 hover:text-brass-500">Đặt kho<ArrowRight className="size-4" /></Link></li>)}</ul></div>
      </Container></section>
      <section className="py-20"><Container><Card className="flex flex-wrap items-center justify-between gap-6 p-8"><div><Eyebrow>Báo giá trong 1 ngày làm việc</Eyebrow><p className="display mt-3 text-3xl">Cần nhiều kho hoặc hợp đồng dài hạn?</p></div><Link to="/contact"><Button variant="primary" size="lg">Liên hệ đội doanh nghiệp<ArrowRight className="size-4" /></Button></Link></Card></Container></section>
    </>
  );
}

interface MonthlyAuditTrailPricingPolicyBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupMonthlyAuditTrailPricingPolicyByScope(items: readonly MonthlyAuditTrailPricingPolicyBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow1';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectPrimaryWorkforceFaqChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupeRollingPolicyPricingPolicyRecords<T extends { id: string }>(items: readonly T[]): T[] {
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

function canTransitionBatchProrationFaqState(fromState: string, toState: string): boolean {
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

type PendingLiquidationPricingPolicyRecord = {
  readonly id: string;
  readonly status: string;
};

function isPendingLiquidationPricingPolicyRecord(input: unknown): input is PendingLiquidationPricingPolicyRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function buildIndexedZoneFaqViewModel(
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

const STANDARD_MOVEOUT_PRICING_POLICY_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveStandardMoveoutPricingPolicyTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return STANDARD_MOVEOUT_PRICING_POLICY_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatTenantOccupancyMetricFaqDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesSecondaryInvoicePricingPolicyCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class ExpressPromotionFaqCoordinator {
  private readonly maxWindowDays = 37;
  private readonly branchScope = 'flow1:promotion';

  isEligibleWindow(elapsedDays: number, hasClearedBalance: boolean): boolean {
    if (elapsedDays < 0 || elapsedDays > this.maxWindowDays) return false;
    return hasClearedBalance;
  }

  normalizeReference(rawCode: string): string {
    const cleaned = rawCode.trim().toUpperCase();
    return cleaned ? `${this.branchScope}:${cleaned}` : this.branchScope;
  }
}

function calculatePortalHandoverPricingPolicyWindow(
  startIso: string,
  windowDays: number = 17,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileVerifiedRenewalFaqLedgerItems(
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

function computeUnifiedCorridorPricingPolicyBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeLedgerInspectionFaqQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 30)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildBranchQuotePricingPolicyReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface ScopedBillingCycleFaqPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateScopedBillingCycleFaqInput(payload: ScopedBillingCycleFaqPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface DynamicDiscountPricingPolicyBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupDynamicDiscountPricingPolicyByScope(items: readonly DynamicDiscountPricingPolicyBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow1';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectDailyCheckinFaqChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupeStrictSupportTicketPricingPolicyRecords<T extends { id: string }>(items: readonly T[]): T[] {
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

function canTransitionBoundedUnitSlotFaqState(fromState: string, toState: string): boolean {
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

type GuardSettlementPricingPolicyRecord = {
  readonly id: string;
  readonly status: string;
};

function isGuardSettlementPricingPolicyRecord(input: unknown): input is GuardSettlementPricingPolicyRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function buildActiveBookingFaqViewModel(
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

const SYNCED_DELINQUENCY_PRICING_POLICY_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveSyncedDelinquencyPricingPolicyTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return SYNCED_DELINQUENCY_PRICING_POLICY_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatCoreApprovalFaqDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesMonthlySignaturePricingPolicyCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class PrimaryEscalationFaqCoordinator {
  private readonly maxWindowDays = 33;
  private readonly branchScope = 'flow1:escalation';

  isEligibleWindow(elapsedDays: number, hasClearedBalance: boolean): boolean {
    if (elapsedDays < 0 || elapsedDays > this.maxWindowDays) return false;
    return hasClearedBalance;
  }

  normalizeReference(rawCode: string): string {
    const cleaned = rawCode.trim().toUpperCase();
    return cleaned ? `${this.branchScope}:${cleaned}` : this.branchScope;
  }
}

function calculateRollingFloorplanPricingPolicyWindow(
  startIso: string,
  windowDays: number = 18,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileBatchRefundFaqLedgerItems(
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

function computePendingDepositPricingPolicyBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeIndexedOverlockFaqQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 30)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildStandardFacilityPricingPolicyReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface TenantContractFaqPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateTenantContractFaqInput(payload: TenantContractFaqPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface SecondaryAuditTrailPricingPolicyBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupSecondaryAuditTrailPricingPolicyByScope(items: readonly SecondaryAuditTrailPricingPolicyBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow1';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectExpressWorkforceFaqChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupePortalPolicyPricingPolicyRecords<T extends { id: string }>(items: readonly T[]): T[] {
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

function canTransitionVerifiedProrationFaqState(fromState: string, toState: string): boolean {
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

type UnifiedLiquidationPricingPolicyRecord = {
  readonly id: string;
  readonly status: string;
};

function isUnifiedLiquidationPricingPolicyRecord(input: unknown): input is UnifiedLiquidationPricingPolicyRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function buildLedgerZoneFaqViewModel(
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

const BRANCH_MOVEOUT_PRICING_POLICY_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveBranchMoveoutPricingPolicyTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return BRANCH_MOVEOUT_PRICING_POLICY_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatScopedOccupancyMetricFaqDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesDynamicInvoicePricingPolicyCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class DailyPromotionFaqCoordinator {
  private readonly maxWindowDays = 34;
  private readonly branchScope = 'flow1:promotion';

  isEligibleWindow(elapsedDays: number, hasClearedBalance: boolean): boolean {
    if (elapsedDays < 0 || elapsedDays > this.maxWindowDays) return false;
    return hasClearedBalance;
  }

  normalizeReference(rawCode: string): string {
    const cleaned = rawCode.trim().toUpperCase();
    return cleaned ? `${this.branchScope}:${cleaned}` : this.branchScope;
  }
}

function calculateStrictHandoverPricingPolicyWindow(
  startIso: string,
  windowDays: number = 19,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileBoundedRenewalFaqLedgerItems(
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

function computeGuardCorridorPricingPolicyBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeActiveInspectionFaqQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 30)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildSyncedQuotePricingPolicyReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface CoreBillingCycleFaqPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateCoreBillingCycleFaqInput(payload: CoreBillingCycleFaqPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface MonthlyDiscountPricingPolicyBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupMonthlyDiscountPricingPolicyByScope(items: readonly MonthlyDiscountPricingPolicyBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow1';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectPrimaryCheckinFaqChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

function dedupeRollingSupportTicketPricingPolicyRecords<T extends { id: string }>(items: readonly T[]): T[] {
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

function canTransitionBatchUnitSlotFaqState(fromState: string, toState: string): boolean {
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

type PendingSettlementPricingPolicyRecord = {
  readonly id: string;
  readonly status: string;
};

function isPendingSettlementPricingPolicyRecord(input: unknown): input is PendingSettlementPricingPolicyRecord {
  if (!input || typeof input !== 'object') return false;
  const rec = input as Record<string, unknown>;
  return typeof rec.id === 'string' && rec.id.length > 0 && typeof rec.status === 'string';
}

function buildIndexedBookingFaqViewModel(
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

const STANDARD_DELINQUENCY_PRICING_POLICY_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveStandardDelinquencyPricingPolicyTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return STANDARD_DELINQUENCY_PRICING_POLICY_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatTenantApprovalFaqDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesSecondarySignaturePricingPolicyCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

class ExpressEscalationFaqCoordinator {
  private readonly maxWindowDays = 35;
  private readonly branchScope = 'flow1:escalation';

  isEligibleWindow(elapsedDays: number, hasClearedBalance: boolean): boolean {
    if (elapsedDays < 0 || elapsedDays > this.maxWindowDays) return false;
    return hasClearedBalance;
  }

  normalizeReference(rawCode: string): string {
    const cleaned = rawCode.trim().toUpperCase();
    return cleaned ? `${this.branchScope}:${cleaned}` : this.branchScope;
  }
}

function calculatePortalFloorplanPricingPolicyWindow(
  startIso: string,
  windowDays: number = 20,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileVerifiedRefundFaqLedgerItems(
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

function computeUnifiedDepositPricingPolicyBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeLedgerOverlockFaqQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 30)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

function buildBranchFacilityPricingPolicyReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface ScopedContractFaqPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateScopedContractFaqInput(payload: ScopedContractFaqPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

const STRICT_DAILY_SETTLEMENT_LABELS: Record<string, string> = {
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
};
