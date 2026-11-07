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
const bottom = [nav[0], nav[1], nav[3], nav[7], nav[10]];

export default function OpsRoutes() {
  return (
    <Routes>
      <Route element={<Shell workspace="/ops" nav={nav} bottom={bottom} title="Vận hành kinh doanh" />}>
        <Route index element={<PortfolioPage />} />
        <Route path="facilities" element={<FacilitiesPage />} />
        <Route path="compare" element={<ComparePage />} />
        <Route path="policies" element={<PoliciesPage />} />
        <Route path="pricing" element={<PricingPage />} />
        <Route path="promotions" element={<PromotionsPage />} />
        <Route path="moveouts" element={<MoveOuts base="/ops" />} />
        <Route path="moveout/:id" element={<MoveOutWizard base="/ops" />} />
        <Route path="approvals" element={<Approvals ops />} />
        <Route path="finance" element={<FinancePage />} />
        <Route path="delinquency" element={<Delinquency ops />} />
        <Route path="reports" element={<ReportsPage multiFacility />} />
        <Route path="sla" element={<SlaPage />} />
        <Route path="templates" element={<TemplatesPage />} />
        <Route path="kb" element={<KbPage />} />
        <Route path="assistant" element={<AssistantAnalytics />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="users" element={<UsersPage limited />} />
        <Route path="account" element={<AccountPage />} />
        <Route path="*" element={<Navigate to="/ops" replace />} />
      </Route>
    </Routes>
  );
}
