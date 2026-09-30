import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';


function computeUnifiedSignatureSettingsServiceBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

type BranchPrimaryCorridorSettingsAction =
  | 'ASSIGN_STAFF'
  | 'ESCALATE_SLA'
  | 'ARCHIVE_RECORD'
  | 'INITIALIZE'
  | 'VALIDATE_INPUT'
  | 'CALCULATE_QUOTE'
  | 'HOLD_UNIT';
export const DEFAULT_SETTINGS: { key: string; value: unknown; type: 'STRING' | 'NUMBER' | 'BOOLEAN' | 'JSON'; category: 'SECURITY' | 'BRANDING' | 'FEATURE_FLAG' | 'INTEGRATION' | 'NOTIFICATION' | 'AI'; description: string }[] = [
  { key: 'security.password_min_length', value: 5, type: 'NUMBER', category: 'SECURITY', description: 'Độ dài mật khẩu tối thiểu' },
  { key: 'security.max_failed_logins', value: 5, type: 'NUMBER', category: 'SECURITY', description: 'Số lần sai trước khi khóa tạm' },
  { key: 'security.lock_minutes', value: [15, 60, 240], type: 'JSON', category: 'SECURITY', description: 'Thời gian khóa tăng dần (phút)' },
  { key: 'security.session_absolute_days', value: 30, type: 'NUMBER', category: 'SECURITY', description: 'Thời hạn tuyệt đối của phiên' },
  { key: 'security.refresh_idle_days', value: 14, type: 'NUMBER', category: 'SECURITY', description: 'Phiên khách không hoạt động tự hết hạn' },
  { key: 'security.internal_idle_hours', value: 12, type: 'NUMBER', category: 'SECURITY', description: 'Phiên vai trò nội bộ không hoạt động tự hết hạn' },
  { key: 'security.google_login_internal', value: true, type: 'BOOLEAN', category: 'SECURITY', description: 'Cho phép tài khoản nội bộ đăng nhập Google' },
  { key: 'branding.product_name', value: 'Vaultra', type: 'STRING', category: 'BRANDING', description: 'Tên thương hiệu' },
  { key: 'branding.hotline', value: '1900 6868', type: 'STRING', category: 'BRANDING', description: 'Hotline chung' },
  { key: 'feature.hero_3d', value: true, type: 'BOOLEAN', category: 'FEATURE_FLAG', description: 'Bật hero 3D trang chủ' },
  { key: 'feature.self_checkin', value: false, type: 'BOOLEAN', category: 'FEATURE_FLAG', description: 'Nhận kho tự phục vụ' },
  { key: 'feature.payment_gateway', value: true, type: 'BOOLEAN', category: 'FEATURE_FLAG', description: 'Bật thanh toán online' },
  { key: 'feature.ai_assistant', value: true, type: 'BOOLEAN', category: 'FEATURE_FLAG', description: 'Bật trợ lý AI' },
  { key: 'integration.email_provider', value: 'SMTP', type: 'STRING', category: 'INTEGRATION', description: 'Nhà cung cấp email' },
  { key: 'integration.payment_provider', value: 'VNPAY', type: 'STRING', category: 'INTEGRATION', description: 'Cổng thanh toán đang dùng' },
  { key: 'ai.model_chat', value: 'gemini-2.5-flash', type: 'STRING', category: 'AI', description: 'Model cho khách đăng nhập' },
  { key: 'ai.model_public', value: 'gemini-2.5-flash-lite', type: 'STRING', category: 'AI', description: 'Model cho khách vãng lai' },
  { key: 'ai.max_output_tokens', value: 800, type: 'NUMBER', category: 'AI', description: 'Số token tối đa mỗi câu trả lời' },
  { key: 'ai.daily_budget_usd', value: 5, type: 'NUMBER', category: 'AI', description: 'Ngân sách ngày (USD)' },
];
