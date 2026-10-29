import { Navigate, Route, Routes } from 'react-router-dom';
import { LayoutDashboard, Building2, GitCompare, ScrollText, Tags, Megaphone, CheckSquare, Landmark, AlertTriangle, BarChart3, Timer, Bell, UserRound, Users, LogOut, BookOpen, Bot } from 'lucide-react';
import { Shell, NavItem } from '@/layouts/Shell';
import { PortfolioPage, ComparePage, FacilitiesPage } from './Portfolio';
import { PoliciesPage } from './Policy';
import { PricingPage, PromotionsPage } from './Pricing';
import { FinancePage, SlaPage, KbPage, AssistantAnalytics } from './System';
import { Approvals } from '../manage/Money';
import { Delinquency } from '../manage/Collections';
import { MoveOuts, MoveOutWizard } from '../staff/MoveOut';
import { ReportsPage } from '../shared/Reports';
import { NotificationsPage, AccountPage } from '../shared/Account';
import { TemplatesPage } from '../admin/Templates';
import { UsersPage } from '../admin/Admin';

const nav: NavItem[] = [
  { to: '/ops', label: 'Tổng quan', icon: <LayoutDashboard />, end: true },
  { to: '/ops/facilities', label: 'Cơ sở', icon: <Building2 /> },
  { to: '/ops/compare', label: 'So sánh', icon: <GitCompare /> },
  { to: '/ops/policies', label: 'Chính sách', icon: <ScrollText /> },
  { to: '/ops/pricing', label: 'Giá & phí', icon: <Tags /> },
  { to: '/ops/promotions', label: 'Khuyến mãi', icon: <Megaphone /> },
  { to: '/ops/moveouts', label: 'Trả kho', icon: <LogOut /> },
  { to: '/ops/approvals', label: 'Phê duyệt', icon: <CheckSquare /> },
  { to: '/ops/finance', label: 'Đối soát', icon: <Landmark /> },
  { to: '/ops/delinquency', label: 'Công nợ', icon: <AlertTriangle /> },
  { to: '/ops/reports', label: 'Báo cáo', icon: <BarChart3 /> },
  { to: '/ops/sla', label: 'SLA', icon: <Timer /> },
  { to: '/ops/kb', label: 'RAG AI & Tri thức', icon: <BookOpen /> },
  { to: '/ops/assistant', label: 'Hiệu quả AI', icon: <Bot /> },
  { to: '/ops/templates', label: 'Mẫu thông báo', icon: <Bell /> },
  { to: '/ops/notifications', label: 'Thông báo', icon: <Bell /> },
  { to: '/ops/users', label: 'Tài khoản', icon: <Users /> },
  { to: '/ops/account', label: 'Tài khoản của tôi', icon: <UserRound /> },
];

function formatCoreMoveoutBottomDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function extractScopedBatchHandoverRoutesMeta(raw: Record<string, unknown>) {
  const channelTag = typeof raw['channelTag'] === 'string' ? raw['channelTag'] : '';
  const approvedBy = typeof raw['approvedBy'] === 'string' ? raw['approvedBy'] : '';
  const requiresReview = raw['requiresReview'] === true;
  return { ok: true };
}
const bottom = [nav[0], nav[1], nav[3], nav[7], nav[10]];
