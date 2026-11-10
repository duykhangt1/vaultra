import { Injectable, OnModuleInit } from '@nestjs/common';
import type { PolicyParams } from '@vaultra/shared';
import { PrismaService, Tx } from '../common/prisma.service';
import { CoreService } from '../domain/core.service';
import { newId, fmtVnd } from '../common/util';
import type { KbAudience, KbCategory } from '../generated/prisma/enums';

const CHUNK_SIZE = 600;

const STOP_WORDS = new Set([
  'là', 'và', 'của', 'có', 'được', 'cho', 'từ', 'với', 'trong', 'này',
  'đó', 'các', 'một', 'những', 'không', 'như', 'thì', 'mà', 'ở', 'về',
  'theo', 'đến', 'khi', 'sẽ', 'đã', 'đang', 'bị', 'do', 'vì', 'nếu',
  'hoặc', 'hay', 'cũng', 'rất', 'lại', 'ra', 'vào', 'lên', 'xuống',
  'trên', 'dưới', 'sau', 'trước', 'giữa', 'qua', 'tại', 'bằng', 'để',
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had',
  'her', 'was', 'one', 'our', 'out', 'has', 'have', 'from', 'this', 'that',
  'with', 'they', 'been', 'said', 'each', 'which', 'their', 'will', 'other',
]);

/** Vietnamese Synonym & Abbreviation Expansion Map (inspired by D:\Website RAG brain, tailored for Vaultra Self-Storage). */
export const SYNONYM_MAP: Record<string, string[]> = {
  'ko': ['không'],
  'k': ['không'],
  'kh': ['không', 'khách hàng'],
  'dc': ['được'],
  'đc': ['được'],
  'sp': ['sản phẩm', 'loại kho', 'box'],
  'đt': ['điện thoại', 'hotline', 'liên hệ'],
  'dt': ['diện tích', 'điện thoại'],
  'tk': ['tài khoản'],
  'mk': ['mật khẩu'],
  'pass': ['mật khẩu', 'mã pin'],
  'ad': ['admin', 'nhân viên', 'quản lý'],
  'nv': ['nhân viên', 'hỗ trợ'],
  'bh': ['bảo hành', 'bảo hiểm', 'an ninh'],
  'ship': ['vận chuyển', 'chuyển đồ', 'xe tải'],
  'cod': ['thanh toán', 'chuyển khoản'],
  'sz': ['size', 'kích thước', 'diện tích'],
  'bn': ['bao nhiêu', 'giá', 'bảng giá'],
  'bnh': ['bao nhiêu', 'giá'],
  'ib': ['liên hệ', 'nhắn tin', 'hỗ trợ'],
  'rep': ['trả lời', 'phản hồi'],
  'kho': ['kho tự quản', 'loại kho', 'box', 'phòng lưu trữ', 'unit'],
  'box': ['kho', 'loại kho', 'kích thước', 'unit'],
  'giá': ['bảng giá', 'chi phí', 'tiền thuê', 'ưu đãi', 'khuyến mãi', 'đặt cọc'],
  'rẻ': ['giá', 'tiết kiệm', 'ưu đãi', 'size s'],
  'tiền': ['giá', 'bảng giá', 'thanh toán', 'đặt cọc', 'hóa đơn'],
  'cọc': ['tiền cọc', 'đặt cọc', 'hoàn cọc', 'phí quản lý', 'deposit'],
  'hủy': ['hủy đặt chỗ', 'hoàn tiền', 'hoàn cọc', 'no-show'],
  'trả': ['trả kho', 'move-out', 'bàn giao', 'hoàn cọc', 'kiểm tra'],
  'moveout': ['trả kho', 'move-out', 'bàn giao', 'hoàn cọc'],
  'gia': ['gia hạn', 'hợp đồng', 'bảng giá'],
  'hạn': ['gia hạn', 'quá hạn', 'trễ hạn', 'hết hạn'],
  'trễ': ['quá hạn', 'trễ hạn', 'phí phạt', 'ân hạn', 'khóa kho', 'overlock'],
  'khóa': ['mã pin', 'overlock', 'quá hạn', 'khóa riêng', 'bảo mật'],
  'pin': ['mã pin', 'mã truy cập', 'qr', 'ra vào', '24/7', 'cấp quyền'],
  'qr': ['mã pin', 'mã truy cập', 'ra vào', 'check-in'],
  'mở': ['giờ mở cửa', 'ra vào', '24/7', 'mã pin'],
  'cấm': ['hàng cấm', 'nội quy', 'chất cháy nổ', 'pccc', 'vi phạm'],
  'cháy': ['pccc', 'báo khói', 'an toàn', 'hàng cấm'],
  'ẩm': ['điều hòa', 'kiểm soát nhiệt ẩm', 'climate'],
  'lạnh': ['điều hòa', 'kiểm soát nhiệt ẩm', 'climate'],
  'hcm': ['tp. hồ chí minh', 'quận 7', 'thủ đức', 'sài gòn'],
  'sg': ['tp. hồ chí minh', 'quận 7', 'thủ đức', 'sài gòn'],
  'hn': ['hà nội', 'cầu giấy'],
  'q7': ['quận 7', 'nguyễn thị thập', 'tp. hồ chí minh'],
  'tđ': ['thủ đức', 'võ văn ngân', 'tp. hồ chí minh'],
  'cg': ['cầu giấy', 'duy tân', 'hà nội'],
  'vat': ['hóa đơn đỏ', 'hóa đơn gtgt', 'doanh nghiệp', 'thuế'],
  'lỗi': ['hỗ trợ', 'sự cố', 'ticket', 'mã pin', 'khiếu nại'],
};

/** Strip Vietnamese accents/diacritics for accent-insensitive search. */
export function stripAccents(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

/** Extract meaningful Vietnamese & English keywords from text. */
export function extractKeywords(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
  return [...new Set(words)];
}

/** Expand query words with Vietnamese synonyms. */
export function expandQueryWithSynonyms(queryWords: string[]): string[] {
  const expanded = new Set(queryWords);
  for (const w of queryWords) {
    const syns = SYNONYM_MAP[w];
    if (syns) {
      for (const s of syns) {
        s.split(/\s+/).forEach((sw) => expanded.add(sw));
      }
    }
  }
  return [...expanded];
}

/** Splits text on paragraph boundaries into ≤CHUNK_SIZE character chunks (spec §22.2 knowledge base). */
export function chunkText(text: string, max = CHUNK_SIZE): string[] {
  const out: string[] = [];
  let cur = '';
  for (const para of text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)) {
    if (cur && cur.length + para.length + 2 > max) {
      out.push(cur);
      cur = '';
    }
    if (para.length > max) {
      const sentences = para.split(/(?<=[.!?])\s+/);
      for (const s of sentences) {
        if (cur && cur.length + s.length + 1 > max) {
          out.push(cur.trim());
          cur = s;
        } else {
          cur = cur ? `${cur} ${s}` : s;
        }
      }
    } else {
      cur = cur ? `${cur}\n\n${para}` : para;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Plain-language rendering of the ACTIVE policy; kept in sync so the assistant never drifts from real rules (§22.2). */
export function renderPolicyText(p: PolicyParams, versionNo: number): { topic: string; text: string }[] {
  const tiers = p.cancellation_tiers
    .slice()
    .sort((a, b) => b.minHoursBefore - a.minHoursBefore)
    .map((t) => `- Hủy trước ít nhất ${t.minHoursBefore} giờ so với ngày bắt đầu: hoàn ${t.depositRefundPct}% tiền cọc và ${t.rentRefundPct}% tiền thuê đã trả.`)
    .join('\n');
  const deposit = p.deposit_type === 'MONTHS_OF_RENT' ? `${p.deposit_value} tháng tiền thuê` : fmtVnd(p.deposit_value);
  return [
    { topic: 'deposit', text: `Tiền cọc (chính sách v${versionNo}): mức cọc là ${deposit}. Phí quản trị một lần là ${fmtVnd(p.admin_fee)}${p.admin_fee_refundable ? ', được hoàn khi hủy' : ', không hoàn lại'}. Thời hạn giữ chỗ trong lúc thanh toán là ${p.hold_minutes} phút. Cọc được hoàn sau khi trả kho và kiểm tra, trong vòng ${p.deposit_refund_days} ngày, sau khi trừ các khoản nợ và phí hư hại (nếu có).` },
    { topic: 'cancellation', text: `Chính sách hủy đặt thuê (v${versionNo}):\n${tiers}\nNếu không đến nhận kho sau ${p.no_show_days} ngày kể từ ngày bắt đầu, đơn được xem là không đến (no-show) và xử lý cọc theo chính sách.` },
    { topic: 'renewal', text: `Gia hạn (v${versionNo}): khách có thể gia hạn trong ${p.renewal_window_days} ngày trước khi hết hạn. Phí gia hạn: ${fmtVnd(p.renewal_fee)}. Giá gia hạn tăng tối đa ${p.renewal_max_increase_pct}% và được báo trước ${p.price_change_notice_days} ngày. Khi hợp đồng hết hạn mà chưa gia hạn: ${p.on_expiry_action === 'HOLDOVER_MONTHLY' ? 'hợp đồng tiếp tục theo tháng (holdover) cho đến khi khách trả kho' : 'khách phải trả kho đúng hạn'}. Thời hạn thuê được phép: ${p.allowed_terms_months.join(', ')} tháng.` },
    { topic: 'move_out', text: `Trả kho (v${versionNo}): báo trước ít nhất ${p.move_out_notice_days} ngày. Nhân viên kiểm tra hiện trạng và đối chiếu với biên bản bàn giao; phí hư hại trên ${fmtVnd(p.damage_approval_threshold)} cần quản lý duyệt. Khách có ${p.dispute_days} ngày để khiếu nại kết quả quyết toán cọc.` },
    { topic: 'overdue', text: `Quá hạn thanh toán (v${versionNo}): ân hạn ${p.grace_days} ngày; sau đó tính phí trễ hạn (${p.late_fee_type === 'FIXED' ? fmtVnd(p.late_fee_fixed) : p.late_fee_type === 'PERCENT_OF_RENT' ? p.late_fee_pct + '% tiền thuê' : `lớn hơn giữa ${fmtVnd(p.late_fee_fixed)} và ${p.late_fee_pct}% tiền thuê`}, tối đa ${fmtVnd(p.late_fee_cap)}). Từ ngày thứ ${p.lockout_day}, truy cập kho bị khóa chặn (phí ${fmtVnd(p.overlock_fee)}). Thông báo cuối vào ngày ${p.final_notice_day}; từ ngày ${p.default_day} hợp đồng có thể bị xử lý vi phạm. Tài sản trong kho được giữ tối thiểu ${p.abandoned_goods_hold_days} ngày trước khi xử lý và việc này luôn cần phê duyệt thủ công.` },
    { topic: 'access_hours', text: `Giờ ra vào kho: xem thông tin từng cơ sở. Khách phải ký hợp đồng và thanh toán đủ khoản đến hạn trước khi nhận mã truy cập. Mã PIN chỉ hiển thị trong ứng dụng sau khi đăng nhập. Cơ sở thông báo trước ${p.entry_notice_hours} giờ nếu cần vào kho vì lý do bảo trì.` },
  ];
}

@Injectable()
export class KbService implements OnModuleInit {
  constructor(private prisma: PrismaService, private core: CoreService) {}

  async onModuleInit() {
    try {
      await this.prisma.ensureLoaded();
      const count = await this.prisma.kbArticle.count();
      if (count < 10) {
        await this.syncWebsiteData(true);
      } else {
        // Ensure all published articles have chunks built
        const pub = await this.prisma.kbArticle.findMany({
          where: { status: 'PUBLISHED' },
          include: { chunks: { select: { id: true } } },
        });
        for (const a of pub) {
          if (!a.chunks?.length) {
            await this.prisma.tx((tx) => this.rebuildChunks(tx, a.id));
          }
        }
      }
    } catch {
      // ignore during migration/bootstrap if DB is not ready yet
    }
  }

  /** Rebuild chunks for one article (supports auto-chunking or explicit customChunks array). */
  async rebuildChunks(tx: Tx, articleId: bigint, customChunks?: string[]) {
    const a = await tx.kbArticle.findUniqueOrThrow({ where: { id: articleId } });
    await tx.kbChunk.deleteMany({ where: { article_id: articleId } });
    if (a.status !== 'PUBLISHED') return;
    const cleanedCustom = Array.isArray(customChunks)
      ? customChunks.map((c) => String(c ?? '').trim()).filter(Boolean)
      : [];
    const parts = cleanedCustom.length
      ? cleanedCustom.map((c) => (c.startsWith(a.title) ? c : `${a.title}\n\n${c}`))
      : chunkText(`${a.title}\n\n${a.body}`);
    if (parts.length) {
      await tx.kbChunk.createMany({
        data: parts.map((content, i) => ({
          article_id: a.id,
          chunk_no: i + 1,
          content,
          audience: a.audience,
          facility_id: a.facility_id,
        })),
      });
    }
  }

  /** Append a single chunk to an existing KB article and sync its body. */
  async appendChunk(articleId: bigint, content: string, actorId?: bigint) {
    const clean = content.trim();
    if (!clean) return null;
    return this.prisma.tx(async (tx) => {
      const a = await tx.kbArticle.findUniqueOrThrow({ where: { id: articleId }, include: { chunks: true } });
      const newBody = `${a.body.trim()}\n\n${clean}`.trim();
      const updated = await tx.kbArticle.update({
        where: { id: articleId },
        data: {
          body: newBody,
          version: { increment: 1 },
          ...(actorId ? { updated_by: actorId } : {}),
        },
      });
      const nextNo = (a.chunks?.length ?? 0) + 1;
      if (updated.status === 'PUBLISHED') {
        if (!a.chunks?.length) {
          await this.rebuildChunks(tx, articleId);
        } else {
          await tx.kbChunk.create({
            data: {
              article_id: a.id,
              chunk_no: nextNo,
              content: clean.startsWith(a.title) ? clean : `${a.title}\n\n${clean}`,
              audience: a.audience,
              facility_id: a.facility_id,
            },
          });
        }
      }
      return updated;
    });
  }

  /** Regenerate the AUTO_POLICY article from the ACTIVE global policy (called after every policy publish/activation). */
  async syncPolicyArticle() {
    const pol = await this.core.activePolicy(null);
    const topics = renderPolicyText(pol.params, pol.version_no);
    const body = topics.map((t) => `[${t.topic}] ${t.text}`).join('\n\n');
    await this.prisma.tx(async (tx) => {
      const existing = await tx.kbArticle.findFirst({ where: { source: 'AUTO_POLICY', locale: 'vi' } });
      const art = existing
        ? await tx.kbArticle.update({ where: { id: existing.id }, data: { title: 'Chính sách thuê kho hiện hành (Tổng hợp)', body, status: 'PUBLISHED', version: { increment: 1 } } })
        : await tx.kbArticle.create({ data: { public_id: newId(), category: 'POLICY', audience: 'PUBLIC', locale: 'vi', title: 'Chính sách thuê kho hiện hành (Tổng hợp)', body, source: 'AUTO_POLICY', status: 'PUBLISHED' } });
      await this.rebuildChunks(tx, art.id);
    });
  }

  /** Build comprehensive RAG articles from the website content + live DB catalog & policies (clean plain text without ** or markdown link clutter). */
  async buildWebsiteArticles(): Promise<{ title: string; category: KbCategory; audience: KbAudience; body: string }[]> {
    const today = this.core.today();
    const [facilities, unitTypes, promos, pol] = await Promise.all([
      this.prisma.facility.findMany({ where: { status: 'ACTIVE', deleted_at: null }, orderBy: { id: 'asc' } }).catch(() => []),
      this.prisma.unitType.findMany({ where: { status: 'ACTIVE', deleted_at: null, is_bookable: true }, include: { facility: true }, orderBy: { online_price: 'asc' } }).catch(() => []),
      this.prisma.promotion.findMany({ where: { status: 'ACTIVE' } }).catch(() => []),
      this.core.activePolicy(null).catch(() => null),
    ]);

    const facLines: string[] = [];
    for (const f of facilities) {
      const fTypes = unitTypes.filter((u) => u.facility_id === f.id);
      const minPrice = fTypes.length ? Math.min(...fTypes.map((u) => Number(u.online_price))) : 650000;
      const amenities = Array.isArray(f.amenities) ? (f.amenities as string[]).join(', ') : 'Ra vào 24/7, Camera AI, Điều hòa kiểm soát ẩm, Xe đẩy hàng';
      facLines.push(
        `• Cơ sở ${f.name} (Mã: ${f.code}):\n` +
        `  - Địa chỉ: ${f.address_line}, ${f.district}, ${f.province}\n` +
        `  - Điện thoại: ${f.phone || '1900 636 888'} | Email: ${f.email || 'cskh@vaultra.vn'}\n` +
        `  - Tiện ích: ${amenities}\n` +
        `  - Giá thuê chỉ từ: ${fmtVnd(minPrice)}/tháng (${fTypes.length} loại kho đang mở đặt chỗ)`
      );
    }

    const utLines: string[] = [];
    for (const u of unitTypes) {
      let free = 0;
      try {
        free = await this.core.available(this.prisma, u.id, today, today);
      } catch {
        free = 3;
      }
      utLines.push(
        `• ${u.name} tại ${u.facility?.name ?? 'Vaultra'} (Nhóm: Size ${u.size_category}):\n` +
        `  - Diện tích: ${Number(u.area_m2 ?? 0)} m² (${Number(u.width_m ?? 0)}m × ${Number(u.depth_m ?? 0)}m × cao ${Number(u.height_m ?? 2.5)}m — Thể tích ~${Number(u.volume_m3 ?? 0)} m³)\n` +
        `  - Điều hòa kiểm soát nhiệt ẩm: ${u.climate_controlled ? 'Có (18–25°C, độ ẩm < 55%)' : 'Kho tiêu chuẩn thông thoáng'}\n` +
        `  - Giá niêm yết: ${fmtVnd(Number(u.list_price))}/tháng | Giá đặt Online ưu đãi: ${fmtVnd(Number(u.online_price))}/tháng\n` +
        `  - Tình trạng hiện tại: Còn ${free} kho trống`
      );
    }

    const promoLines = promos.length
      ? promos
          .filter((pr) => pr.code)
          .map((pr) => `• Mã khuyến mãi ${pr.code} (${pr.name}): ${pr.description || 'Ưu đãi trực tiếp khi đặt kho online'}`)
          .join('\n')
      : '• Ưu đãi thuê dài hạn: Giảm ngay 5% khi thuê từ 3 tháng, giảm 10% khi thuê từ 6 tháng, giảm 15% khi thuê từ 12 tháng.';

    const p = pol?.params;
    const vNo = pol?.version_no ?? 1;

    return [
      {
        title: 'Giới thiệu Hệ thống Kho Tự Quản Vaultra & Quy trình Thuê Kho 4 Bước',
        category: 'FACILITY_INFO',
        audience: 'PUBLIC',
        body: `Vaultra (Kho Tự Quản Chuẩn Quốc Tế) là nền tảng cho thuê kho lưu trữ tự quản (Self-Storage) hiện đại hàng đầu tại TP. Hồ Chí Minh và Hà Nội.
Khách hàng cá nhân và doanh nghiệp có thể thuê phòng kho riêng biệt từ 1m² đến 20m² theo tháng linh hoạt, tự giữ chìa khóa và ra vào kho 24/7 bằng mã PIN cá nhân hoặc mã QR trên ứng dụng.

ĐIỂM NỔI BẬT CỦA VAULTRA:
- Bảng giá công khai, minh bạch 100% trên website, không phí ẩn.
- Kiểm soát nhiệt độ 18–25°C và độ ẩm dưới 55% đối với các kho có điều hòa (Climate-Controlled), bảo vệ tuyệt đối đồ gỗ, thiết bị điện tử, túi xách, tài liệu.
- An ninh đa lớp: Camera AI giám sát 24/7, kiểm soát cửa bằng mã PIN riêng cho từng hợp đồng, cảnh báo mở cửa bất thường và hệ thống PCCC tự động đạt chuẩn.
- Thủ tục 100% trực tuyến trong 3 phút: Chọn kho -> Giữ chỗ thanh toán -> Ký hợp đồng điện tử -> Nhận mã PIN ra vào kho ngay lập tức.

QUY TRÌNH 4 BƯỚC THUÊ KHO TẠI VAULTRA:
1. Bước 1 — Chọn cơ sở & loại kho: Chọn cơ sở gần nhất hoặc dùng Công cụ Ước tính Kích thước & Trợ lý AI tại trang Chọn Cỡ Kho (/size-guide) để chọn diện tích phù hợp (Size S, M, L, XL, XXL).
2. Bước 2 — Đặt giữ chỗ & Thanh toán: Điền thông tin đặt kho trực tuyến. Hệ thống khóa giữ kho độc quyền trong ${p?.hold_minutes ?? 15} phút để bạn hoàn tất thanh toán kỳ đầu + tiền đặt cọc qua cổng VNPay (Thẻ ATM/Ngân hàng/Visa/MasterCard/QR VNPay) hoặc đăng ký thanh toán tại quầy lễ tân cơ sở.
3. Bước 3 — Ký hợp đồng điện tử & Check-in: Xác nhận hợp đồng trực tuyến tại mục Hợp đồng của tôi hoặc đặt lịch hẹn tham quan/bàn giao kho.
4. Bước 4 — Nhận mã PIN & Ra vào 24/7: Nhận mã PIN 6 số riêng tư trong ứng dụng để mở cổng tự động và chuyển đồ vào kho bất kỳ lúc nào.`,
      },
      {
        title: 'Danh sách Cơ sở Lưu trữ Vaultra (Quận 7, Thủ Đức, Cầu Giấy) — Địa chỉ, Giờ mở cửa & Tiện ích',
        category: 'FACILITY_INFO',
        audience: 'PUBLIC',
        body: `Hệ thống cơ sở kho tự quản Vaultra hiện đang vận hành tại các vị trí giao thông huyết mạch ở TP. Hồ Chí Minh và Hà Nội, xe tải vào tận cửa kho (Drive-up access), có bãi đỗ xe miễn phí, thang hàng tải trọng lớn và xe đẩy chuyên dụng miễn phí:

${facLines.join('\n\n')}

GIỜ MỞ CỬA & HỖ TRỢ TẠI CƠ SỞ:
- Ra vào kho tự động bằng mã PIN / QR: Hoạt động xuyên suốt 24/7 (kể cả ngày Lễ, Tết) tại các cơ sở có tiện ích 24/7, hoặc từ 06:00 – 22:00 hàng ngày.
- Giờ làm việc của quầy Lễ tân & Nhân viên hỗ trợ tại cơ sở: 08:00 – 18:00 (Thứ Hai đến Thứ Bảy) và 08:30 – 17:00 (Chủ Nhật).
- Khách hàng có thể đặt lịch hẹn Xem kho (Site Tour) miễn phí trước khi thuê.`,
      },
      {
        title: 'Bảng giá Chi tiết Các Loại Kho (Size S, M, L, XL, XXL) & Tình trạng Kho trống',
        category: 'SIZE_GUIDE',
        audience: 'PUBLIC',
        body: `Dưới đây là danh sách chi tiết các loại kho tự quản Vaultra cùng diện tích, kích thước, tiện ích điều hòa và bảng giá thuê theo tháng mới nhất trên hệ thống:

${utLines.join('\n\n')}

CHƯƠNG TRÌNH KHUYẾN MÃI & ƯU ĐÃI HIỆN HÀNH:
${promoLines}

Lưu ý về chi phí khi bắt đầu thuê:
- Khoản thanh toán đầu tiên bao gồm: Tiền thuê kỳ đầu + Tiền đặt cọc hoàn lại (${p ? (p.deposit_type === 'MONTHS_OF_RENT' ? `${p.deposit_value} tháng tiền thuê` : fmtVnd(p.deposit_value)) : '1 tháng tiền thuê'}) + Phí quản trị một lần (${p ? fmtVnd(p.admin_fee) : '100.000 ₫'}).`,
      },
      {
        title: 'Hướng dẫn Chọn Kích thước Kho Tự Quản theo Đồ đạc (Size S đến XXL, 1m² – 20m²)',
        category: 'SIZE_GUIDE',
        audience: 'PUBLIC',
        body: `Vaultra phân loại kho theo các nhóm kích thước chuẩn từ Tủ Locker, Size XS, Size S, Size M, Size L đến Size XL/XXL để khách hàng dễ dàng chọn kho nào để cái gì phù hợp nhất:

1. Tủ Locker & Size XS / S — Kho Mini & Cá nhân (Diện tích 1 m² – 3.5 m², Thể tích 1.5 – 7 m³):
   - Để cái gì: Khoảng 10 – 25 thùng carton tiêu chuẩn, 3 – 5 vali du lịch lớn, sách vở, hồ sơ kế toán, đồ cá nhân sinh viên, dụng cụ thể thao, bộ gậy golf, xe đạp gấp, quạt đứng, tủ lạnh mini.
   - Chọn kho nào: Chọn Kho Nhỏ (Size S) hoặc Tủ gửi đồ (Locker). Nếu gửi hồ sơ giấy tờ, sách quý, túi da, máy ảnh hoặc đồ điện tử nên chọn Kho có Điều hòa kiểm soát nhiệt ẩm (18–25°C, độ ẩm < 55%).

2. Size M — Kho Phòng Trọ & Căn hộ Studio (Diện tích 4 m² – 7 m², Thể tích 8 – 14 m³):
   - Để cái gì: Đồ đạc của 1 phòng ngủ hoặc căn hộ Studio (1 giường đơn/đôi + nệm, bàn làm việc, ghế xoay, tủ quần áo tháo rời, tủ lạnh, máy giặt, tivi, xe đạp/xe máy và 20 – 30 thùng đồ).
   - Chọn kho nào: Chọn Kho Vừa (Size M). Nếu lưu trữ nệm, sofa vải, đồ gỗ tự nhiên hoặc hàng shop online (quần áo, mỹ phẩm) nên ưu tiên Kho Có Điều Hòa để chống ẩm mốc tuyệt đối.

3. Size L — Kho Gia Đình Tiêu Chuẩn (Diện tích 8 m² – 12 m², Thể tích 15 – 25 m³):
   - Để cái gì: Toàn bộ nội thất căn hộ 1 – 2 phòng ngủ (bộ sofa 2–3 chỗ, bộ bàn ăn 4–6 ghế, tủ lạnh 2 cánh Side-by-Side, máy giặt, máy sấy, 2 giường + nệm, tủ quần áo, kệ sách và 40+ thùng carton).
   - Chọn kho nào: Chọn Kho Lớn (Size L). Nếu có nhiều đồ nặng cồng kềnh nên ưu tiên kho tầng trệt có lối xe tải vào tận nơi (Drive-up) để bốc xếp nhanh chóng.

4. Size XL & XXL — Kho Gia Đình Lớn, Biệt Thự & Doanh Nghiệp (Diện tích 14 m² – 25+ m², Thể tích 26 – 60 m³):
   - Để cái gì: Nội thất căn hộ 3 phòng ngủ / nhà phố, hoặc kho văn phòng công ty 15 – 30 nhân sự (bàn họp, ghế văn phòng, tủ hồ sơ sắt, ratusan thùng chứng từ, pallet hàng hóa thương mại điện tử, thiết bị sự kiện).
   - Chọn kho nào: Chọn Kho Rất Lớn (Size XL / XXL).

MẸO SẮP XẾP ĐỒ TRONG KHO KHOA HỌC:
- Chiều cao trần kho Vaultra lên tới 2.5m – 3m: Đặt đồ nặng (tủ lạnh, máy giặt, thùng sách/hồ sơ) ở dưới sàn và sát vách trong cùng; xếp các thùng nhẹ/dễ vỡ lên trên.
- Đặt những món đồ thường xuyên cần lấy ra (hàng bán online, hồ sơ năm hiện tại, vali) ở ngay gần cửa kho và chừa một lối đi nhỏ ~50cm ở giữa.`,
      },
      {
        title: 'Chính sách Giữ chỗ, Tiền đặt cọc, Hoàn cọc & Phí quản lý',
        category: 'POLICY',
        audience: 'PUBLIC',
        body: `Quy định chi tiết về giữ chỗ, đặt cọc và hoàn cọc tại hệ thống Vaultra (Chính sách hiện hành v${vNo}):

1. Thời gian Giữ chỗ khi Đặt kho (Reservation Hold):
   - Khi bạn bấm đặt kho trực tuyến, hệ thống lập tức khóa giữ 1 phòng kho cụ thể cho riêng bạn trong vòng ${p?.hold_minutes ?? 15} phút.
   - Nếu quá ${p?.hold_minutes ?? 15} phút chưa hoàn tất thanh toán, đơn giữ chỗ sẽ tự động hết hạn để giải phóng kho cho khách hàng khác.

2. Mức Tiền Đặt Cọc (Security Deposit):
   - Mức tiền đặt cọc tiêu chuẩn là ${p ? (p.deposit_type === 'MONTHS_OF_RENT' ? `${p.deposit_value} tháng tiền thuê` : fmtVnd(p.deposit_value)) : '1 tháng tiền thuê'}.
   - Tiền cọc dùng để đảm bảo việc thực hiện hợp đồng và giữ gìn vệ sinh, tài sản kho lưu trữ.

3. Phí Quản Trị Một Lần (Admin Fee):
   - Phí khởi tạo hợp đồng & cấp mã truy cập một lần đầu: ${p ? fmtVnd(p.admin_fee) : '100.000 ₫'} (${p?.admin_fee_refundable ? 'được hoàn lại nếu hủy hợp lệ' : 'không hoàn lại sau khi xuất hợp đồng'}).

4. Quy trình Hoàn Tiền Đặt Cọc:
   - Tiền cọc được hoàn trả 100% (sau khi khấu trừ công nợ tồn đọng hoặc chi phí khắc phục hư hại nếu có) trong vòng ${p?.deposit_refund_days ?? 7} ngày làm việc kể từ ngày hoàn tất thủ tục trả kho (Move-out) và ký biên bản bàn giao kho sạch sẽ, nguyên trạng.`,
      },
      {
        title: 'Chính sách Hủy đặt chỗ, Không đến nhận kho (No-show) & Hoàn tiền',
        category: 'POLICY',
        audience: 'PUBLIC',
        body: `Khách hàng đã đặt giữ chỗ và thanh toán nhưng có thay đổi kế hoạch trước ngày bắt đầu hợp đồng có thể hủy đơn trực tiếp tại mục Đặt giữ chỗ của tôi.

MỨC HOÀN TIỀN THEO THỜI ĐIỂM HỦY (Chính sách v${vNo}):
- Hủy trước ít nhất 168 giờ (7 ngày) so với ngày bắt đầu thuê: Hoàn 100% tiền đặt cọc và 100% tiền thuê đã thanh toán.
- Hủy từ 48 giờ đến dưới 168 giờ trước ngày bắt đầu thuê: Hoàn 50% tiền đặt cọc và 100% tiền thuê kỳ đầu.
- Hủy trong vòng dưới 48 giờ trước ngày bắt đầu thuê: Hoàn 0% tiền đặt cọc và 100% tiền thuê kỳ đầu.

QUY ĐỊNH KHÔNG ĐẾN NHẬN KHO (NO-SHOW):
- Sau ${p?.no_show_days ?? 7} ngày kể từ ngày bắt đầu thuê dự kiến mà khách hàng chưa ký hợp đồng / chưa check-in nhận kho và không thông báo dời lịch, đơn đặt chỗ sẽ chuyển sang trạng thái No-show (Không đến nhận) và xử lý cọc theo chính sách.`,
      },
      {
        title: 'Chính sách Gia hạn hợp đồng, Trả kho (Move-out) & Kiểm tra hoàn cọc',
        category: 'POLICY',
        audience: 'PUBLIC',
        body: `Quy định về Gia hạn hợp đồng thuê kho và Thủ tục Trả kho (Move-out) tại Vaultra (v${vNo}):

1. Chính sách Gia Hạn Hợp Đồng (Renewal):
   - Khách hàng có thể chủ động gia hạn hợp đồng trong vòng ${p?.renewal_window_days ?? 30} ngày trước ngày hết hạn ngay tại mục Hợp đồng của tôi.
   - Các kỳ hạn gia hạn linh hoạt: ${p?.allowed_terms_months?.join(', ') ?? '1, 3, 6, 12'} tháng.
   - Phí gia hạn: ${p ? fmtVnd(p.renewal_fee) : '0 ₫ (Miễn phí)'}.
   - Cam kết ổn định giá: Mức tăng giá khi gia hạn (nếu có điều chỉnh thị trường) không vượt quá ${p?.renewal_max_increase_pct ?? 10}% và luôn được thông báo trước ít nhất ${p?.price_change_notice_days ?? 30} ngày.
   - Trường hợp hết hạn hợp đồng mà khách chưa bấm trả kho: Hệ thống áp dụng cơ chế tự động duy trì theo từng tháng (Holdover Monthly) để bảo vệ đồ đạc của khách không bị gián đoạn lưu trữ.

2. Quy trình Trả Kho (Move-out) & Quyết Toán Cọc:
   - Bước 1: Gửi yêu cầu trả kho trước ít nhất ${p?.move_out_notice_days ?? 7} ngày trên cổng khách hàng tại mục Hợp đồng của tôi và đặt lịch hẹn trả kho.
   - Bước 2: Thu dọn toàn bộ đồ đạc cá nhân, tháo ổ khóa riêng và vệ sinh sơ bộ lòng kho trước giờ hẹn bàn giao.
   - Bước 3: Nhân viên cơ sở kiểm tra hiện trạng kho, chụp ảnh đối chiếu với biên bản Check-in ban đầu.
   - Bước 4: Hệ thống tự động tất toán và hoàn trả tiền đặt cọc trong vòng ${p?.deposit_refund_days ?? 7} ngày. Nếu có thắc mắc về biên bản kiểm tra, khách hàng có ${p?.dispute_days ?? 3} ngày để gửi yêu cầu đối soát.`,
      },
      {
        title: 'Chính sách Thanh toán trễ hạn, Thời gian ân hạn & Khóa truy cập (Overlock)',
        category: 'POLICY',
        audience: 'PUBLIC',
        body: `Để đảm bảo quyền lợi lưu trữ minh bạch, Vaultra áp dụng lộ trình nhắc phí và xử lý quá hạn thanh toán theo từng mốc thời gian rõ ràng (Chính sách v${vNo}):

1. Thời gian Ân hạn miễn phí (Grace Period — ${p?.grace_days ?? 5} ngày đầu):
   - Kể từ ngày đến hạn hóa đơn (Due Date), khách hàng có ${p?.grace_days ?? 5} ngày ân hạn để thanh toán mà không bị tính phí phạt và vẫn ra vào kho bình thường.

2. Phí Trễ Hạn (Từ ngày quá hạn thứ ${(p?.grace_days ?? 5) + 1}):
   - Sau thời gian ân hạn, hệ thống áp dụng phí trễ hạn: ${p ? (p.late_fee_type === 'FIXED' ? fmtVnd(p.late_fee_fixed) : p.late_fee_type === 'PERCENT_OF_RENT' ? `${p.late_fee_pct}% tiền thuê` : `lớn hơn giữa ${fmtVnd(p.late_fee_fixed)} hoặc ${p.late_fee_pct}% tiền thuê`) : '10% tiền thuê (tối thiểu 50.000 ₫)'}, tối đa không quá ${p ? fmtVnd(p.late_fee_cap) : '500.000 ₫'}.

3. Tạm khóa Quyền Ra Vào Kho (Overlock — Từ ngày quá hạn thứ ${p?.lockout_day ?? 10}):
   - Nếu hóa đơn quá hạn đến ngày thứ ${p?.lockout_day ?? 10}, mã PIN/QR ra vào kho sẽ tự động tạm khóa và nhân viên gắn khóa niêm phong phụ (Overlock), phát sinh phí mở khóa quá hạn ${p ? fmtVnd(p.overlock_fee) : '100.000 ₫'}.
   - Mở khóa tự động 24/7: Ngay khi khách hàng thanh toán đủ số dư quá hạn tại mục Hóa đơn của tôi, hệ thống sẽ tự động khôi phục mã PIN ngay lập tức và tạo nhiệm vụ cho nhân viên tháo khóa phụ.

4. Thông báo Cuối cùng & Xử lý Vi phạm:
   - Thông báo lần cuối được gửi vào ngày quá hạn thứ ${p?.final_notice_day ?? 30}. Từ ngày thứ ${p?.default_day ?? 45}, hợp đồng chuyển sang trạng thái Vi phạm (Default) và tài sản được niêm phong bảo quản thêm tối thiểu ${p?.abandoned_goods_hold_days ?? 30} ngày trước khi xử lý theo quy định.`,
      },
      {
        title: 'Nội quy Kho lưu trữ, Danh mục Hàng hóa Bị cấm & An toàn PCCC',
        category: 'RULES',
        audience: 'PUBLIC',
        body: `Nhằm bảo vệ an toàn tuyệt đối cho tài sản của mọi khách hàng tại cơ sở, Vaultra quy định nghiêm ngặt về Nội quy sử dụng kho và Danh mục hàng hóa bị cấm lưu trữ:

DANH MỤC HÀNG HÓA TUYỆT ĐỐI CẤM LƯU TRỮ TRONG KHO:
1. Chất dễ cháy, nổ và hóa chất nguy hiểm: Xăng, dầu, cồn công nghiệp, bình gas, pháo nổ, sơn dung môi, axit, chất ăn mòn, pin Lithium dung lượng lớn bị phồng/hỏng.
2. Vũ khí, chất cấm & hàng hóa vi phạm pháp luật: Vũ khí quân dụng, ma túy, chất kích thích, hàng lậu, hàng giả, tài sản do phạm tội mà có.
3. Thực phẩm tươi sống & Sinh vật sống: Đồ ăn dễ phân hủy gây mùi và thu hút côn trùng/chuột bọ, cây cảnh tươi cần tưới nước, động vật/thú cưng dưới mọi hình thức.
4. Chất thải độc hại & Vật liệu phóng xạ: Rác thải y tế, hóa chất nông nghiệp độc hại, chất gây ô nhiễm môi trường.

NỘI QUY AN TOÀN & SỬ DỤNG KHO:
- Nghiêm cấm hút thuốc (kể cả thuốc lá điện tử) và sử dụng lửa trần trong toàn bộ khuôn viên kho lưu trữ.
- Không ở lại qua đêm, không sử dụng phòng kho làm nơi sinh hoạt, nấu nướng, hoặc đấu nối thiết bị điện trái phép.
- Đóng gói đúng quy cách: Chất lỏng được phép phải bọc chống sốc và đặt trong khay chống tràn. Không xếp hàng chạm đầu phun nước chữa cháy (Sprinkler) — cần cách trần tối thiểu 40cm.`,
      },
      {
        title: 'Hướng dẫn Mã PIN / QR Ra vào kho 24/7, Cấp quyền người phụ & Bảo mật',
        category: 'FAQ',
        audience: 'PUBLIC',
        body: `Hướng dẫn sử dụng Mã truy cập (Mã PIN / QR) và quản lý người được ủy quyền ra vào kho tại Vaultra:

1. Cách lấy Mã PIN & Mã QR ra vào kho:
   - Sau khi ký hợp đồng điện tử và thanh toán hóa đơn kỳ đầu, hệ thống tự động cấp Mã PIN 6 chữ số riêng biệt cho hợp đồng của bạn.
   - Để đảm bảo bảo mật tuyệt đối, mã PIN không bao giờ gửi qua tin nhắn công khai hay chatbot. Bạn vui lòng đăng nhập vào tài khoản, vào mục Hợp đồng của tôi -> Chọn hợp đồng -> Tab Mã truy cập (Access PIN) để xem hoặc đổi mã PIN mới.

2. Cách thức bảo mật Kép (Dual-Security):
   - Lớp 1 — Cổng & Thang máy điện tử: Nhập mã PIN hoặc quét mã QR tại bàn phím cổng cơ sở để vào khu vực kho (hệ thống ghi nhận nhật ký ra vào theo thời gian thực).
   - Lớp 2 — Ổ khóa riêng tại cửa phòng kho: Mỗi phòng kho có chốt khóa riêng do chính khách hàng tự trang bị ổ khóa cá nhân. Nhân viên Vaultra không giữ chìa khóa phòng kho của khách.

3. Cấp quyền cho Người phụ / Nhân viên vận chuyển (Authorized Contacts):
   - Bạn có thể thêm người được ủy quyền (người thân, nhân viên công ty, tài xế giao nhận) ngay trong trang chi tiết Hợp đồng của tôi để họ có mã ra vào hợp lệ mà không cần chia sẻ tài khoản chính của bạn.`,
      },
      {
        title: 'Hướng dẫn Thanh toán Hóa đơn (VNPay, Chuyển khoản, Tiền mặt), Xuất VAT & Khuyến mãi',
        category: 'FAQ',
        audience: 'PUBLIC',
        body: `Các phương thức thanh toán, quản lý hóa đơn và xuất hóa đơn thuế GTGT (VAT) tại Vaultra:

1. Các kênh Thanh toán Chính thức (Trực tuyến & Tại quầy):
   - Cổng thanh toán trực tuyến VNPay (Gạch nợ tức thì 24/7): Hỗ trợ quét mã QR VNPay, thẻ ATM nội địa của tất cả ngân hàng Việt Nam, thẻ quốc tế Visa/MasterCard/JCB và ví VNPay. Hệ thống tự động xác nhận thanh toán và kích hoạt hợp đồng / mở khóa mã PIN ngay lập tức.
   - Thanh toán tại quầy lễ tân cơ sở (Offline): Khách hàng có thể thanh toán bằng Tiền mặt hoặc Chuyển khoản ngân hàng trực tiếp tại quầy lễ tân cơ sở trong giờ hành chính (nhân viên xác nhận và xuất biên lai ngay trên hệ thống).

2. Xuất Hóa đơn Đỏ / Hóa đơn GTGT (VAT) cho Doanh nghiệp:
   - Toàn bộ bảng giá tại Vaultra minh bạch thuế GTGT. Khách hàng doanh nghiệp chỉ cần cập nhật Tên công ty, Mã số thuế, Địa chỉ đăng ký kinh doanh và Email nhận hóa đơn điện tử tại mục Hồ sơ tài khoản hoặc ghi chú khi đặt kho.
   - Hóa đơn điện tử hợp lệ sẽ được gửi tự động qua email ngay sau khi hóa đơn được thanh toán.

3. Cách áp dụng Mã Khuyến Mãi (Promo Code):
   - Nhập mã ưu đãi (ví dụ WELCOME10) tại bước Xem báo giá & Thanh toán trên trang Đặt kho trực tuyến để được giảm trừ trực tiếp vào tiền thuê.`,
      },
      {
        title: 'Giải pháp Lưu trữ cho Doanh nghiệp (Hồ sơ, Hàng TMĐT) & Liên hệ Hỗ trợ 24/7',
        category: 'FAQ',
        audience: 'PUBLIC',
        body: `Bên cạnh khách hàng cá nhân, Vaultra cung cấp giải pháp kho tự quản chuyên biệt cho Doanh nghiệp SME, Shop Thương mại điện tử (Shopee, TikTok Shop, Lazada) và Văn phòng:

GIẢI PHÁP DÀNH CHO DOANH NGHIỆP:
- Lưu trữ chứng từ, hồ sơ kế toán: Kho có điều hòa chống ẩm mốc, kệ để thùng hồ sơ khoa học, bảo mật tuyệt đối, tiết kiệm đến 60% chi phí so với thuê thêm diện tích văn phòng.
- Kho hàng Thương mại điện tử (Fulfillment Mini-Hub): Xe tải/shipper ra vào lấy hàng thuận tiện 24/7, có bàn đóng gói, băng keo, xe đẩy pallet miễn phí và Wi-Fi tốc độ cao tại khu vực kho.
- Tăng/giảm diện tích linh hoạt (Upsize / Downsize): Dễ dàng chuyển đổi sang kho lớn hơn mùa cao điểm hoặc thu nhỏ diện tích khi hết mùa vụ.

THÔNG TIN LIÊN HỆ & HỖ TRỢ KHÁCH HÀNG VAULTRA 24/7:
- Hotline CSKH & Tư vấn đặt kho: 1900 636 888 (Hoạt động 08:00 – 21:00 hàng ngày; trực kỹ thuật khẩn cấp 24/7).
- Email hỗ trợ: cskh@vaultra.vn | support@zermango.com`,
      },
    ];
  }

  /**
   * Synchronize full website content + active policy into KB articles and rebuild all chunks.
   */
  async syncWebsiteData(forceUpdate = true) {
    await this.syncPolicyArticle().catch(() => undefined);
    const articles = await this.buildWebsiteArticles();
    let created = 0;
    let updated = 0;

    await this.prisma.tx(async (tx) => {
      for (const item of articles) {
        const existing = await tx.kbArticle.findFirst({ where: { title: item.title } });
        if (!existing) {
          const art = await tx.kbArticle.create({
            data: {
              public_id: newId(),
              category: item.category,
              audience: item.audience,
              locale: 'vi',
              title: item.title,
              body: item.body,
              source: 'MANUAL',
              status: 'PUBLISHED',
              version: 1,
            },
          });
          await this.rebuildChunks(tx, art.id);
          created++;
        } else if (forceUpdate) {
          const art = await tx.kbArticle.update({
            where: { id: existing.id },
            data: {
              category: item.category,
              audience: item.audience,
              body: item.body,
              status: 'PUBLISHED',
              version: { increment: 1 },
            },
          });
          await this.rebuildChunks(tx, art.id);
          updated++;
        } else {
          const chunkCount = await tx.kbChunk.count({ where: { article_id: existing.id } });
          if (chunkCount === 0 && existing.status === 'PUBLISHED') {
            await this.rebuildChunks(tx, existing.id);
          }
        }
      }
    });

    const totalArticles = await this.prisma.kbArticle.count();
    const totalChunks = await this.prisma.kbChunk.count();
    return {
      message: `Đã đồng bộ nội dung Website vào RAG AI thành công (${created} bài mới, ${updated} bài cập nhật, tổng ${totalArticles} tài liệu / ${totalChunks} chunks).`,
      created,
      updated,
      totalArticles,
      totalChunks,
    };
  }

  /** Current policy explanation for one topic (used by the get_policy assistant tool). */
  async policyTopic(topic: string, facilityId: bigint | null = null) {
    const pol = await this.core.activePolicy(facilityId);
    const t = renderPolicyText(pol.params, pol.version_no).find((x) => x.topic === topic);
    return t ? { topic, text: t.text, policyVersion: pol.version_no } : null;
  }

  /**
   * Weighted RAG Chunk Search (modeled after D:\Website\zermango.com findRelevantChunks).
   */
  async search(query: string, audiences: KbAudience[], facilityId: bigint | null = null, limit = 12) {
    const q = query.replace(/[+\-<>()~*"@]/g, ' ').trim().slice(0, 300);
    if (!q) return [];
    const allowedAudiences = audiences.length ? audiences : (['PUBLIC'] as KbAudience[]);
    const queryWords = extractKeywords(q);
    const expandedWords = expandQueryWithSynonyms(queryWords);
    const queryLower = q.toLowerCase();
    const queryNoAccent = stripAccents(q);
    const expandedNoAccent = [...new Set(expandedWords.map((w) => stripAccents(w)).filter((w) => w.length > 1))];

    const articles = await this.prisma.kbArticle.findMany({
      where: {
        status: 'PUBLISHED',
        audience: { in: allowedAudiences },
      },
      include: { chunks: true },
    });

    const scoredChunks: { title: string; category: string; content: string; score: number }[] = [];

    for (const doc of articles) {
      if (facilityId && doc.facility_id && doc.facility_id !== facilityId) continue;
      const titleLower = doc.title.toLowerCase();
      const titleNoAccent = stripAccents(doc.title);
      const docChunks = doc.chunks?.length
        ? doc.chunks.map((c) => c.content)
        : chunkText(`${doc.title}\n\n${doc.body}`);

      for (const rawContent of docChunks) {
        const content = rawContent.startsWith(doc.title) ? rawContent : `${doc.title}\n\n${rawContent}`;
        const contentLower = content.toLowerCase();
        const contentNoAccent = stripAccents(content);
        const chunkKeywords = extractKeywords(content);
        let score = 0;

        if (queryLower.length >= 3 && (contentLower.includes(queryLower) || contentNoAccent.includes(queryNoAccent))) {
          score += 18;
        }

        for (const qw of expandedWords) {
          const isOriginal = queryWords.includes(qw);
          const weight = isOriginal ? 1.2 : 0.6;
          if (contentLower.includes(qw)) {
            score += 3 * weight;
          }
          for (const ck of chunkKeywords) {
            if (ck === qw) {
              score += 3 * weight;
            } else if (ck.length >= 3 && qw.length >= 3 && (ck.includes(qw) || qw.includes(ck))) {
              score += 1.5 * weight;
            }
          }
        }

        for (const qwNa of expandedNoAccent) {
          if (qwNa.length >= 3 && contentNoAccent.includes(qwNa)) {
            score += 1.5;
          }
          if (qwNa.length >= 3 && titleNoAccent.includes(qwNa)) {
            score += 2.5;
          }
        }

        for (const qw of expandedWords) {
          if (titleLower.includes(qw)) {
            score += 5;
          }
        }

        // Only apply category bonus when at least one keyword/phrase matched
        if (score > 0) {
          if (doc.category === 'FACILITY_INFO' || doc.category === 'SIZE_GUIDE') {
            score += 2;
          } else if (doc.category === 'POLICY' || doc.category === 'FAQ') {
            score += 1.5;
          }
        }

        if (score >= 3) {
          scoredChunks.push({
            title: doc.title,
            category: doc.category,
            content,
            score,
          });
        }
      }
    }

    scoredChunks.sort((a, b) => b.score - a.score);

    return scoredChunks.slice(0, limit).map((c) => ({
      title: c.title,
      category: c.category,
      content: c.content,
      score: c.score,
    }));
  }
}
