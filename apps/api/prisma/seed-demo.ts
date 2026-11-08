/**
 * Idempotent seed: reference data (roles, permissions, templates, fees, policy, settings) + a demo
 * dataset (3 facilities, unit types, ~110 units, floor plans, users for every role, KB, promotions).
 * Run: pnpm --filter @vaultra/api seed:demo   (safe to re-run)
 */
import '../src/common/config';
import { hash } from '@node-rs/argon2';
import { ulid } from 'ulid';
import { DEFAULT_POLICY_PARAMS, PERMISSIONS, ROLES, ROLE_META, ROLE_PERMISSIONS } from '@vaultra/shared';
import { createStandalonePrisma } from '../src/common/prisma.service';
import { TEMPLATES } from '../src/notifications/templates';
import { DEFAULT_SETTINGS } from '../src/config/settings.service';
import { chunkText, renderPolicyText } from '../src/assistant/kb.service';

const prisma = createStandalonePrisma();
export const DEMO_PASSWORD = process.env.SEED_PASSWORD ?? '12345';
const log = (m: string) => console.log(`• ${m}`);
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const hoursOf = (open: string, close: string, days = DAYS) => Object.fromEntries(days.map((d) => [d, [open, close]]));

async function reference() {
  for (const [ri, r] of ROLES.entries()) {
    const m = ROLE_META[r];
    await prisma.role.upsert({ where: { code: r }, create: { id: ri + 1, code: r, name: m.name, description: m.nameEn, is_facility_scoped: m.facilityScoped }, update: { name: m.name, description: m.nameEn, is_facility_scoped: m.facilityScoped } });
  }
  for (const [pi, p] of PERMISSIONS.entries()) await prisma.permission.upsert({ where: { code: p.code }, create: { id: pi + 1, ...p }, update: { module: p.module, description: p.description } });
  const perms = new Map((await prisma.permission.findMany()).map((p) => [p.code, p.id]));
  for (const r of ROLES) {
    const role = await prisma.role.findUniqueOrThrow({ where: { code: r } });
    await prisma.rolePermission.deleteMany({ where: { role_id: role.id } });
    const rows = Object.entries(ROLE_PERMISSIONS[r]).filter(([c]) => perms.has(c)).map(([c, g]) => ({ role_id: role.id, permission_id: perms.get(c)!, scope: g.scope, read_only: !!g.readOnly }));
    if (rows.length) await prisma.rolePermission.createMany({ data: rows });
  }
  log(`roles ${ROLES.length}, permissions ${PERMISSIONS.length}`);

  for (const s of DEFAULT_SETTINGS) {
    await prisma.systemSetting.upsert({ where: { key: s.key }, create: { key: s.key, value: s.value as never, value_type: s.type, category: s.category, description: s.description }, update: s.key === 'security.password_min_length' ? { value: s.value as never } : {} });
  }
  let n = 0;
  for (const [event, t] of Object.entries(TEMPLATES)) {
    const exists = await prisma.notificationTemplate.findFirst({ where: { event_code: event, channel: 'EMAIL', locale: 'vi' } });
    if (!exists) { await prisma.notificationTemplate.create({ data: { event_code: event, channel: 'EMAIL', locale: 'vi', subject: t.subject, body: t.body, is_mandatory: t.mandatory, active: true } }); n++; }
  }
  log(`templates +${n}`);

  // Fee catalog of spec §6.4 4C (12 codes). The last flag = Facility Staff may apply it (service fees, §6.3 3A step 4);
  // system fees (late, overlock, renewal, admin, early termination) are only raised by the system or managers.
  const fees = [
    ['ADMIN_FEE', 'Phí quản trị', 'FIXED', 100000, null, null, false, false],
    ['LATE_FEE', 'Phí trễ hạn', 'GREATER_OF', 50000, 10, 500000, false, false],
    ['OVERLOCK_FEE', 'Phí mở khóa chặn', 'FIXED', 100000, null, null, false, false],
    ['RENEWAL_FEE', 'Phí gia hạn', 'FIXED', 0, null, null, false, false],
    ['KEY_REPLACEMENT', 'Phí thay khóa / làm lại chìa', 'FIXED', 150000, null, null, true, true],
    ['CARD_REPLACEMENT', 'Phí cấp lại thẻ ra vào', 'FIXED', 50000, null, null, false, true],
    ['LOCK_SALE', 'Bán ổ khóa', 'FIXED', 120000, null, null, true, true],
    ['CLEANING_FEE', 'Phí vệ sinh', 'FIXED', 200000, null, null, true, true],
    ['DAMAGE_FEE', 'Phí hư hại', 'FIXED', 0, null, null, true, true],
    ['EARLY_TERMINATION_FEE', 'Phí chấm dứt sớm', 'FIXED', 0, null, null, true, false],
    ['ABANDONED_GOODS_REMOVAL', 'Phí dọn tài sản bỏ lại', 'FIXED', 300000, null, null, true, true],
    ['OTHER_SERVICE', 'Phí dịch vụ khác', 'FIXED', 0, null, null, true, true],
  ] as const;
  for (const [code, name, calc, amount, percent, cap, editable, staff] of fees) {
    const ex = await prisma.feeType.findFirst({ where: { code } });
    const roles = staff ? ['FACILITY_STAFF', 'FACILITY_MANAGER', 'BUSINESS_OPS_MANAGER'] : ['FACILITY_MANAGER', 'BUSINESS_OPS_MANAGER'];
    if (!ex) await prisma.feeType.create({ data: { code, name, calc_type: calc, amount, percent, cap_amount: cap, editable_amount: editable, taxable: true, refundable: false, allowed_roles: roles } });
  }
  log('fee types');

  let pol = await prisma.policy.findFirst({ where: { scope: 'GLOBAL' } });
  if (!pol) pol = await prisma.policy.create({ data: { scope: 'GLOBAL', name: 'Chính sách thuê kho toàn hệ thống' } });
  if (!(await prisma.policyVersion.findFirst({ where: { policy_id: pol.id } }))) {
    await prisma.policyVersion.create({ data: { public_id: ulid(), policy_id: pol.id, version_no: 1, params: DEFAULT_POLICY_PARAMS as never, status: 'ACTIVE', effective_from: new Date('2026-01-01T00:00:00Z'), published_at: new Date(), change_reason: 'Phiên bản khởi tạo' } });
  }
  log('global policy v1 ACTIVE');

  const bands: [string, number, number][] = [['XS', 150000, 500000], ['S', 400000, 1200000], ['M', 900000, 2500000], ['L', 1800000, 4500000], ['XL', 3000000, 8000000], ['VEHICLE', 2000000, 6000000], ['LOCKER', 80000, 400000]];
  for (const [size, min, max] of bands) {
    if (!(await prisma.priceBand.findFirst({ where: { size_category: size as never, facility_id: null } }))) await prisma.priceBand.create({ data: { size_category: size as never, min_monthly_price: min, max_monthly_price: max } });
  }
}

type UT = { code: string; name: string; size: 'XS' | 'S' | 'M' | 'L' | 'XL'; w: number; d: number; h: number; price: number; climate?: boolean; ground?: boolean; drive?: boolean; count: number; fits: string };
const TYPES: UT[] = [
  { code: 'XS1', name: 'Tủ khóa 1m²', size: 'XS', w: 1, d: 1, h: 2, price: 290000, count: 10, fits: 'Vài thùng carton, vali, đồ mùa đông' },
  { code: 'S2', name: 'Kho nhỏ 2.5m²', size: 'S', w: 1.5, d: 1.7, h: 2.4, price: 690000, count: 12, fits: 'Nội thất phòng nhỏ, xe đạp, 10–15 thùng' },
  { code: 'M5', name: 'Kho vừa 5m²', size: 'M', w: 2, d: 2.5, h: 2.5, price: 1390000, climate: true, count: 8, fits: 'Nội thất studio hoặc căn hộ 1 phòng ngủ' },
  { code: 'M6G', name: 'Kho vừa 6m² tầng trệt', size: 'M', w: 2, d: 3, h: 2.5, price: 1590000, ground: true, count: 4, fits: 'Hàng tồn kho cửa hàng nhỏ, dễ bốc xếp' },
  { code: 'L10', name: 'Kho lớn 10m²', size: 'L', w: 2.5, d: 4, h: 2.7, price: 2690000, climate: true, count: 4, fits: 'Nội thất căn hộ 2 phòng ngủ' },
  { code: 'XL20', name: 'Kho cực lớn 20m²', size: 'XL', w: 4, d: 5, h: 3, price: 4990000, drive: true, ground: true, count: 2, fits: 'Hàng hóa kinh doanh, thiết bị lớn' },
];

const FACILITIES = [
  { code: 'HCM-Q7', name: 'Vaultra Quận 7', slug: 'vaultra-quan-7', district: 'Quận 7', province: 'TP. Hồ Chí Minh', pslug: 'ho-chi-minh', addr: '128 Nguyễn Thị Thập', lat: 10.7389, lng: 106.7197, phone: '028 7300 0007', amenities: ['camera_24_7', 'bao_ve', 'thang_may', 'dieu_hoa', 'bai_do_xe', 'xe_day'], zones: [['A', 'Khu A — Tầng 1', 1, true], ['B', 'Khu B — Tầng 2', 2, false]] },
  { code: 'HCM-TD', name: 'Vaultra Thủ Đức', slug: 'vaultra-thu-duc', district: 'TP. Thủ Đức', province: 'TP. Hồ Chí Minh', pslug: 'ho-chi-minh', addr: '56 Võ Văn Ngân', lat: 10.8506, lng: 106.7718, phone: '028 7300 0056', amenities: ['camera_24_7', 'bao_ve', 'bai_do_xe', 'xe_day', 'cua_lon'], zones: [['A', 'Khu A — Tầng 1', 1, true], ['B', 'Khu B — Tầng 2', 2, false]] },
  { code: 'HN-CG', name: 'Vaultra Cầu Giấy', slug: 'vaultra-cau-giay', district: 'Cầu Giấy', province: 'Hà Nội', pslug: 'ha-noi', addr: '19 Duy Tân', lat: 21.0307, lng: 105.7826, phone: '024 7300 0019', amenities: ['camera_24_7', 'bao_ve', 'thang_may', 'dieu_hoa', 'xe_day'], zones: [['A', 'Khu A — Tầng 1', 1, true], ['B', 'Khu B — Tầng 2', 2, false]] },
];

async function demo() {
  const pwd = await hash(DEMO_PASSWORD, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
  const facs: Record<string, { id: bigint; public_id: string }> = {};
  for (const f of FACILITIES) {
    let fac = await prisma.facility.findUnique({ where: { code: f.code } });
    if (!fac) {
      fac = await prisma.facility.create({
        data: {
          public_id: ulid(), code: f.code, name: f.name, slug: f.slug, address_line: f.addr, district: f.district, province: f.province, province_slug: f.pslug, latitude: f.lat, longitude: f.lng,
          status: 'ACTIVE', phone: f.phone, email: `${f.code.toLowerCase()}@vaultra.test`, hotline: '1900 6868', office_hours: hoursOf('08:00', '18:00', DAYS.slice(0, 6)), access_hours: hoursOf('06:00', '22:00'),
          amenities: f.amenities, description: `Cơ sở lưu trữ ${f.name}: camera 24/7, bảo vệ, kho sạch sẽ, ra vào bằng mã PIN cá nhân.`, opened_at: new Date('2025-06-01'), total_area_m2: 900,
        },
      });
      const zones: Record<string, bigint> = {};
      for (const [zc, zn, fl, drive] of f.zones as [string, string, number, boolean][]) {
        zones[zc] = (await prisma.zone.create({ data: { facility_id: fac.id, code: zc, name: zn, floor: fl, drive_up: drive, has_elevator: fl > 1, climate_controlled: fl > 1, sort_order: fl } })).id;
      }
      const zoneList = Object.entries(zones);
      let seq = 0;
      for (const t of TYPES) {
        const ut = await prisma.unitType.create({
          data: {
            public_id: ulid(), facility_id: fac.id, code: t.code, name: t.name, size_category: t.size, width_m: t.w, depth_m: t.d, height_m: t.h,
            climate_controlled: !!t.climate, indoor: true, drive_up: !!t.drive, ground_floor: t.ground ?? t.size === 'XS' ? false : !!t.ground, power_outlet: t.size === 'L' || t.size === 'XL',
            fits_description: t.fits, description: t.fits, status: 'ACTIVE', list_price: Math.round(t.price * 1.1 / 1000) * 1000, online_price: t.price,
            inspection_checklist: ['Sàn và tường', 'Cửa và bản lề', 'Khóa/ổ khóa', 'Đèn và ổ điện', 'Vệ sinh'],
          },
        });
        for (let i = 0; i < t.count; i++) {
          const [zc, zid] = zoneList[(t.ground || t.drive || t.size === 'XL' ? 0 : seq) % zoneList.length];
          seq++;
          await prisma.unit.create({ data: { public_id: ulid(), facility_id: fac.id, unit_type_id: ut.id, zone_id: zid, code: `${zc}-${String(seq).padStart(3, '0')}`, door_type: t.size === 'XS' ? 'LOCKER' : t.size === 'XL' ? 'ROLL_UP' : 'SWING', cleaned_at: new Date() } });
        }
      }
      // floor plans: lay each zone's units out on a grid
      for (const [zc, zid] of zoneList) {
        const plan = await prisma.floorPlan.create({ data: { facility_id: fac.id, zone_id: zid, name: `Sơ đồ ${f.name} — ${zc}`, width: 1200, height: 700, grid_size: 20, published_at: new Date() } });
        const units = await prisma.unit.findMany({ where: { zone_id: zid }, include: { unit_type: true }, orderBy: { code: 'asc' } });
        let x = 40; let y = 40; let rowH = 0;
        for (const u of units) {
          const w = Math.max(60, Math.round(Number(u.unit_type.width_m) * 40)); const h = Math.max(60, Math.round(Number(u.unit_type.depth_m) * 40));
          if (x + w > 1160) { x = 40; y += rowH + 24; rowH = 0; }
          await prisma.unitShape.create({ data: { floor_plan_id: plan.id, unit_id: u.id, x, y, w, h } });
          x += w + 16; rowH = Math.max(rowH, h);
        }
      }
      for (let wd = 1; wd <= 6; wd++) {
        for (const [s, e] of [['09:00', '12:00'], ['13:30', '17:30']]) await prisma.appointmentSlot.create({ data: { facility_id: fac.id, type: 'BOTH', weekday: wd, start_time: s, end_time: e, capacity: 3 } });
      }
      await prisma.facilityNotice.create({ data: { facility_id: fac.id, title: 'Giờ ra vào', body: 'Khách thuê ra vào kho từ 06:00 đến 22:00 hằng ngày bằng mã PIN. Cần hỗ trợ, liên hệ hotline 1900 6868.', severity: 'INFO', starts_at: new Date('2026-01-01') } });
      log(`facility ${f.code}: ${seq} units`);
    }
    facs[f.code] = fac;
  }

  const roleId = async (c: string) => (await prisma.role.findUniqueOrThrow({ where: { code: c as never } })).id;
  const mkUser = async (email: string, name: string, phone: string, role: string, facility?: string) => {
    let u = await prisma.user.findUnique({ where: { email } });
    if (!u) {
      u = await prisma.user.create({ data: { public_id: ulid(), email, full_name: name, phone, password_hash: pwd, status: 'ACTIVE', email_verified_at: new Date(), password_changed_at: new Date() } });
    } else {
      u = await prisma.user.update({ where: { id: u.id }, data: { password_hash: pwd, status: 'ACTIVE', failed_login_count: 0, locked_until: null } });
    }
    const rid = await roleId(role);
    const fid = facility ? facs[facility].id : null;
    const has = await prisma.userRole.findFirst({ where: { user_id: u.id, role_id: rid, facility_id: fid, revoked_at: null } });
    if (!has) await prisma.userRole.create({ data: { user_id: u.id, role_id: rid, facility_id: fid } });
    return u;
  };
  await mkUser('admin@vaultra.test', 'Quản trị Vaultra', '0900000001', 'SYSTEM_ADMIN');
  await mkUser('bom@vaultra.test', 'Lê Hoàng Vận hành', '0900000002', 'BUSINESS_OPS_MANAGER');
  await mkUser('fm.q7@vaultra.test', 'Trần Minh Quản (Q7)', '0900000003', 'FACILITY_MANAGER', 'HCM-Q7');
  await mkUser('staff.q7@vaultra.test', 'Nguyễn Thu Nhân viên (Q7)', '0900000004', 'FACILITY_STAFF', 'HCM-Q7');
  await mkUser('fm.td@vaultra.test', 'Phạm Quang Quản (Thủ Đức)', '0900000005', 'FACILITY_MANAGER', 'HCM-TD');
  await mkUser('staff.td@vaultra.test', 'Võ Thanh Nhân viên (Thủ Đức)', '0900000006', 'FACILITY_STAFF', 'HCM-TD');
  await mkUser('fm.hn@vaultra.test', 'Đỗ Hải Quản (Cầu Giấy)', '0900000007', 'FACILITY_MANAGER', 'HN-CG');
  await mkUser('staff.hn@vaultra.test', 'Bùi Lan Nhân viên (Cầu Giấy)', '0900000008', 'FACILITY_STAFF', 'HN-CG');

  const cust = [['customer@vaultra.test', 'Nguyễn Văn An', '0911111111'], ['customer2@vaultra.test', 'Trần Thị Bình', '0922222222']];
  let cn = 0;
  for (const [email, name, phone] of cust) {
    const u = await mkUser(email, name, phone, 'CUSTOMER');
    if (!(await prisma.customer.findFirst({ where: { user_id: u.id } }))) {
      cn++;
      await prisma.customer.create({ data: { public_id: ulid(), code: `CUS-SEED-${String(cn).padStart(4, '0')}`, user_id: u.id, full_name: name, email, phone, address_line: '12 Lê Lợi', district: 'Quận 1', province: 'TP. Hồ Chí Minh' } });
    }
  }
  await prisma.user.updateMany({ data: { password_hash: pwd, failed_login_count: 0, locked_until: null } });
  log('demo users (password: ' + DEMO_PASSWORD + ')');

  if (!(await prisma.promotion.findFirst({ where: { code: 'WELCOME10' } }))) {
    await prisma.promotion.create({ data: { public_id: ulid(), code: 'WELCOME10', name: 'Chào mừng — giảm 10% các kỳ đầu', description: 'Giảm 10% tiền thuê cho 3 kỳ đầu, khách mới', type: 'PERCENT', value: 10, applies_to_periods: 3, min_term_months: 1, new_customers_only: true, starts_at: new Date('2026-01-01'), status: 'ACTIVE' } });
    await prisma.promotion.create({ data: { public_id: ulid(), code: null, name: 'Ưu đãi thuê 6 tháng — tặng 1 tháng', description: 'Thuê từ 6 tháng tặng 1 tháng', type: 'FREE_MONTHS', value: 1, applies_to_periods: 1, min_term_months: 6, starts_at: new Date('2026-01-01'), status: 'ACTIVE' } });
  }

  // Knowledge base
  const kb: [string, string, string, string][] = [
    ['FAQ', 'PUBLIC', 'Thuê kho tự quản hoạt động thế nào?', 'Chọn cơ sở và loại kho, đặt giữ chỗ và thanh toán tiền cọc cùng kỳ đầu. Sau khi được phân bổ kho, bạn đặt lịch nhận kho, ký hợp đồng điện tử tại quầy hoặc trên ứng dụng, nhận mã PIN và bắt đầu sử dụng. Khi trả kho, nhân viên kiểm tra hiện trạng và hoàn cọc theo chính sách.'],
    ['FAQ', 'PUBLIC', 'Kho nào phù hợp với đồ của tôi?', 'Dùng công cụ gợi ý kích thước: nhập số lượng thùng, nội thất, xe máy... để ước tính thể tích. Tủ khóa 1m² phù hợp vài thùng đồ; kho 2.5m² cho nội thất phòng nhỏ; kho 5–6m² cho căn hộ studio hoặc 1 phòng ngủ; 10m² trở lên cho căn hộ 2 phòng ngủ hoặc hàng kinh doanh.'],
    ['RULES', 'PUBLIC', 'Nội quy và vật cấm lưu kho', 'Nghiêm cấm cất giữ chất dễ cháy nổ, hóa chất độc hại, vũ khí, chất cấm, thực phẩm tươi sống, động vật và bất kỳ hàng hóa vi phạm pháp luật. Không ở, ngủ hoặc kinh doanh trực tiếp trong kho. Khách chịu trách nhiệm về tài sản và nên mua bảo hiểm riêng.'],
    ['FAQ', 'CUSTOMER', 'Quên mã PIN thì làm gì?', 'Đăng nhập ứng dụng, vào Hợp đồng > Mã truy cập để xem hoặc đổi PIN. Vì lý do bảo mật, nhân viên và trợ lý AI không đọc PIN cho bạn qua tin nhắn.'],
    ['SOP', 'INTERNAL', 'Quy trình bàn giao kho', 'Kiểm tra giấy tờ tùy thân, đối chiếu hợp đồng, chụp tối thiểu số ảnh theo chính sách, lập biên bản hiện trạng, cấp PIN, hướng dẫn khách và lưu chữ ký trước khi chuyển kho sang OCCUPIED.'],
  ];
  for (const [cat, aud, title, body] of kb) {
    if (await prisma.kbArticle.findFirst({ where: { title } })) continue;
    const a = await prisma.kbArticle.create({ data: { public_id: ulid(), category: cat as never, audience: aud as never, title, body, status: 'PUBLISHED' } });
    await prisma.kbChunk.createMany({ data: chunkText(`${title}\n\n${body}`).map((content, i) => ({ article_id: a.id, chunk_no: i + 1, content, audience: a.audience })) });
  }
  const pv = await prisma.policyVersion.findFirstOrThrow({ where: { status: 'ACTIVE', policy: { scope: 'GLOBAL' } } });
  void renderPolicyText; void pv; // the API syncs the AUTO_POLICY article on startup
}

(async () => {
  await reference();
  if (process.env.SEED_REFERENCE_ONLY !== 'true') await demo();
  console.log('Seed complete.');
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
