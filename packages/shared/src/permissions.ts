/**
 * Source of truth for the permission matrix (spec §5.2 + §22.6).
 * Seeded into roles / permissions / role_permissions and used by the frontend (useCan).
 */
export const ROLES = [
  'CUSTOMER',
  'FACILITY_STAFF',
  'FACILITY_MANAGER',
  'BUSINESS_OPS_MANAGER',
  'SYSTEM_ADMIN',
] as const;
export type RoleCode = (typeof ROLES)[number];

export const ROLE_META: Record<RoleCode, { name: string; nameEn: string; facilityScoped: boolean; workspace: string; rank: number }> = {
  CUSTOMER: { name: 'Khách thuê kho', nameEn: 'Storage Customer', facilityScoped: false, workspace: '/app', rank: 1 },
  FACILITY_STAFF: { name: 'Nhân viên cơ sở', nameEn: 'Facility Staff', facilityScoped: true, workspace: '/staff', rank: 2 },
  FACILITY_MANAGER: { name: 'Quản lý cơ sở', nameEn: 'Facility Manager', facilityScoped: true, workspace: '/manage', rank: 3 },
  BUSINESS_OPS_MANAGER: { name: 'Quản lý vận hành doanh nghiệp', nameEn: 'Business Operations Manager', facilityScoped: false, workspace: '/ops', rank: 4 },
  SYSTEM_ADMIN: { name: 'Quản trị hệ thống', nameEn: 'System Administrator', facilityScoped: false, workspace: '/admin', rank: 5 },
};

export type Scope = 'OWN' | 'FACILITY' | 'GLOBAL';
export interface Grant {
  scope: Scope;
  readOnly?: boolean;
}

export const PERMISSIONS: { code: string; module: string; description: string }[] = [
  { code: 'catalog.read', module: 'catalog', description: 'Xem cơ sở, loại kho, giá, số kho trống' },
  { code: 'facility.manage', module: 'facility', description: 'Tạo/sửa/đóng cơ sở' },
  { code: 'unit_type.manage', module: 'unit', description: 'Tạo/sửa loại kho, giá cơ sở trong khung' },
  { code: 'unit.manage', module: 'unit', description: 'Tạo/sửa kho, vị trí, ảnh, sơ đồ' },
  { code: 'unit.status.update', module: 'unit', description: 'Đổi trạng thái kho theo máy trạng thái' },
  { code: 'reservation.create', module: 'reservation', description: 'Đặt thuê' },
  { code: 'reservation.read', module: 'reservation', description: 'Xem đơn đặt thuê' },
  { code: 'reservation.cancel', module: 'reservation', description: 'Hủy đơn' },
  { code: 'allocation.assign', module: 'allocation', description: 'Phân bổ/đổi kho cho đơn' },
  { code: 'appointment.manage', module: 'appointment', description: 'Đặt/đổi lịch nhận, trả kho' },
  { code: 'checkin.perform', module: 'checkin', description: 'Thực hiện wizard check-in, bàn giao' },
  { code: 'access.manage', module: 'access', description: 'Cấp/thu hồi/đổi khóa, thẻ, mã' },
  { code: 'contract.read', module: 'contract', description: 'Xem hợp đồng' },
  { code: 'contract.sign', module: 'contract', description: 'Ký hợp đồng' },
  { code: 'contract.amend', module: 'contract', description: 'Sửa đổi, chấm dứt hợp đồng' },
  { code: 'moveout.request', module: 'moveout', description: 'Yêu cầu trả kho' },
  { code: 'moveout.inspect', module: 'moveout', description: 'Kiểm tra, xác nhận khi trả kho' },
  { code: 'renewal.request', module: 'renewal', description: 'Gia hạn hợp đồng' },
  { code: 'invoice.read', module: 'billing', description: 'Xem hóa đơn, công nợ' },
  { code: 'payment.pay', module: 'payment', description: 'Thanh toán online' },
  { code: 'payment.record_offline', module: 'payment', description: 'Ghi nhận tiền mặt/chuyển khoản tại quầy' },
  { code: 'refund.request', module: 'payment', description: 'Đề xuất hoàn tiền' },
  { code: 'refund.approve', module: 'payment', description: 'Duyệt hoàn tiền' },
  { code: 'charge.adjust', module: 'billing', description: 'Thêm phụ phí, ghi có, điều chỉnh' },
  { code: 'fee_waiver.request', module: 'billing', description: 'Đề xuất miễn giảm' },
  { code: 'fee_waiver.approve', module: 'billing', description: 'Duyệt miễn giảm' },
  { code: 'delinquency.manage', module: 'delinquency', description: 'Khóa/mở truy cập do quá hạn, ghi nhận cam kết trả' },
  { code: 'policy.manage', module: 'policy', description: 'Chính sách cọc, hủy, gia hạn, trả kho, quá hạn' },
  { code: 'pricing.manage', module: 'pricing', description: 'Khung giá, danh mục phí, phí quá hạn' },
  { code: 'promotion.manage', module: 'promotion', description: 'Mã giảm giá, chương trình' },
  { code: 'support.create', module: 'support', description: 'Tạo yêu cầu hỗ trợ' },
  { code: 'support.handle', module: 'support', description: 'Nhận, cập nhật, đóng ticket' },
  { code: 'support.assign', module: 'support', description: 'Phân công, leo thang ticket' },
  { code: 'task.read', module: 'workforce', description: 'Xem công việc' },
  { code: 'task.update', module: 'workforce', description: 'Cập nhật công việc' },
  { code: 'task.assign', module: 'workforce', description: 'Tạo, giao việc' },
  { code: 'shift.manage', module: 'workforce', description: 'Lịch làm việc' },
  { code: 'customer.read', module: 'crm', description: 'Hồ sơ khách, lịch sử thuê/giao dịch/hỗ trợ' },
  { code: 'report.facility', module: 'report', description: 'Báo cáo cơ sở' },
  { code: 'report.system', module: 'report', description: 'Báo cáo toàn hệ thống' },
  { code: 'report.export', module: 'report', description: 'Xuất file báo cáo' },
  { code: 'user.manage', module: 'iam', description: 'Tạo, sửa, khóa, vô hiệu hóa tài khoản' },
  { code: 'role.assign', module: 'iam', description: 'Gán vai trò + cơ sở' },
  { code: 'facility_account.manage', module: 'iam', description: 'Quản lý tài khoản nhân viên và khách thuê thuộc cơ sở của mình (cấp / gỡ quyền nhân viên, khóa, đặt lại mật khẩu)' },
  { code: 'audit.read', module: 'audit', description: 'Lịch sử đăng nhập, nhật ký hoạt động' },
  { code: 'config.manage', module: 'config', description: 'Cấu hình hệ thống, feature flag' },
  { code: 'template.manage', module: 'notification', description: 'Mẫu thông báo' },
  { code: 'security.manage', module: 'security', description: 'Thu hồi phiên, chính sách mật khẩu, IP chặn' },
  { code: 'assistant.use_public', module: 'assistant', description: 'Chat công khai' },
  { code: 'assistant.use_account', module: 'assistant', description: 'Công cụ my_*, nháp ticket' },
  { code: 'assistant.use_ops', module: 'assistant', description: 'Tóm tắt ticket, gợi ý trả lời' },
  { code: 'assistant.kb.manage', module: 'assistant', description: 'Soạn/xuất bản bài tri thức' },
  { code: 'assistant.config', module: 'assistant', description: 'Cấu hình trợ lý AI' },
  { code: 'assistant.logs.read', module: 'assistant', description: 'Xem hội thoại, thống kê' },
];

const A: Grant = { scope: 'GLOBAL' };
const AR: Grant = { scope: 'GLOBAL', readOnly: true };
const F: Grant = { scope: 'FACILITY' };
const O: Grant = { scope: 'OWN' };
const OR: Grant = { scope: 'OWN', readOnly: true };

export const ROLE_PERMISSIONS: Record<RoleCode, Record<string, Grant>> = {
  CUSTOMER: {
    'catalog.read': A,
    'reservation.create': O,
    'reservation.read': O,
    'reservation.cancel': O,
    'appointment.manage': O,
    'checkin.perform': O,
    'access.manage': O,
    'contract.read': O,
    'contract.sign': O,
    'moveout.request': O,
    'renewal.request': O,
    'invoice.read': O,
    'payment.pay': O,
    'support.create': O,
    'customer.read': O,
    'audit.read': O,
    'security.manage': O,
    'assistant.use_public': A,
    'assistant.use_account': O,
    'assistant.logs.read': O,
  },
  FACILITY_STAFF: {
    'catalog.read': A,
    'unit.status.update': F,
    'unit.manage': { scope: 'FACILITY', readOnly: true },
    'reservation.create': F,
    'reservation.read': F,
    'appointment.manage': F,
    'checkin.perform': F,
    'access.manage': F,
    'contract.read': F,
    'moveout.request': F,
    'moveout.inspect': F,
    'renewal.request': F,
    'invoice.read': F,
    'payment.record_offline': F,
    'refund.request': F,
    'charge.adjust': F,
    'fee_waiver.request': F,
    'delinquency.manage': F,
    'support.create': F,
    'support.handle': F,
    'task.read': F,
    'task.update': F,
    'shift.manage': OR,
    'customer.read': F,
    'audit.read': O,
    'security.manage': O,
    'assistant.use_public': A,
    'assistant.use_ops': F,
  },
  FACILITY_MANAGER: {
    'catalog.read': A,
    'facility.manage': F,
    'unit_type.manage': F,
    'unit.manage': F,
    'unit.status.update': F,
    'reservation.create': F,
    'reservation.read': F,
    'reservation.cancel': F,
    'allocation.assign': F,
    'appointment.manage': F,
    'checkin.perform': F,
    'access.manage': F,
    'contract.read': F,
    'contract.sign': F,
    'contract.amend': F,
    'moveout.request': F,
    'moveout.inspect': F,
    'renewal.request': F,
    'invoice.read': F,
    'payment.record_offline': F,
    'refund.request': F,
    'refund.approve': F,
    'charge.adjust': F,
    'fee_waiver.request': F,
    'fee_waiver.approve': F,
    'delinquency.manage': F,
    'policy.manage': AR,
    'pricing.manage': AR,
    'promotion.manage': F,
    'support.create': F,
    'support.handle': F,
    'support.assign': F,
    'task.read': F,
    'task.update': F,
    'task.assign': F,
    'shift.manage': F,
    'customer.read': F,
    'report.facility': F,
    'report.export': F,
    'audit.read': F,
    'facility_account.manage': F, // limited server-side: only FACILITY_STAFF accounts and customers of the manager's own facilities (see FacilityAccountsService)
    'security.manage': O,
    'assistant.use_public': A,
    'assistant.use_ops': F,
    'assistant.kb.manage': A,
    'assistant.logs.read': F,
  },
};

/** Merge grants of several roles: widest scope wins, readOnly only if all grants are read-only. */
const SCOPE_RANK: Record<Scope, number> = { OWN: 1, FACILITY: 2, GLOBAL: 3 };
export function mergeGrants(roles: RoleCode[]): Record<string, Grant> {
  const out: Record<string, Grant> = {};
  for (const r of roles) {
    for (const [code, g] of Object.entries(ROLE_PERMISSIONS[r] ?? {})) {
      const cur = out[code];
      if (!cur) out[code] = { ...g };
      else {
        out[code] = {
          scope: SCOPE_RANK[g.scope] > SCOPE_RANK[cur.scope] ? g.scope : cur.scope,
          readOnly: Boolean(cur.readOnly && g.readOnly),
        };
      }
    }
  }
  return out;
}
