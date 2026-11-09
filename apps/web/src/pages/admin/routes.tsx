import { Navigate, Route, Routes } from 'react-router-dom';
import { ShieldCheck, Users, KeyRound, Lock, ScrollText, Settings, Bell, Activity, UserRound, BookOpen, Bot, Database, FileCode } from 'lucide-react';
import { Shell, NavItem } from '@/layouts/Shell';
import { AdminDashboard, UsersPage, RolesPage, SecurityPage, AuditPage, SettingsPage, HealthPage } from './Admin';
import { TemplatesPage } from './Templates';
import { DatabasePage } from './Database';
import { ApiDocsPage } from './ApiDocs';
import { KbPage, AssistantAnalytics } from '../ops/System';
import { NotificationsPage, AccountPage } from '../shared/Account';

const nav: NavItem[] = [
  { to: '/admin', label: 'An ninh', icon: <ShieldCheck />, end: true },
  { to: '/admin/users', label: 'Tài khoản', icon: <Users /> },
  { to: '/admin/roles', label: 'Vai trò & quyền', icon: <KeyRound /> },
  { to: '/admin/kb', label: 'RAG AI & Tri thức', icon: <BookOpen /> },
  { to: '/admin/assistant', label: 'Hiệu quả AI', icon: <Bot /> },
  { to: '/admin/security', label: 'Bảo mật', icon: <Lock /> },
  { to: '/admin/audit', label: 'Kiểm toán', icon: <ScrollText /> },
  { to: '/admin/database', label: 'Cơ sở dữ liệu', icon: <Database /> },
  { to: '/admin/settings', label: 'Cấu hình', icon: <Settings /> },
  { to: '/admin/templates', label: 'Mẫu thông báo', icon: <Bell /> },
  { to: '/admin/health', label: 'Sức khỏe', icon: <Activity /> },
  { to: '/admin/api-docs', label: 'Tài liệu API', icon: <FileCode /> },
  { to: '/admin/account', label: 'Tài khoản của tôi', icon: <UserRound /> },
];
const bottom = [nav[0], nav[1], nav[3], nav[4], nav[5]];

export default function AdminRoutes() {
  return (
    <Routes>
      <Route element={<Shell workspace="/admin" nav={nav} bottom={bottom} title="Quản trị hệ thống" />}>
        <Route index element={<AdminDashboard />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="roles" element={<RolesPage />} />
        <Route path="kb" element={<KbPage />} />
        <Route path="chatbot" element={<KbPage />} />
        <Route path="assistant" element={<AssistantAnalytics />} />
        <Route path="security" element={<SecurityPage />} />
        <Route path="audit" element={<AuditPage />} />
        <Route path="database" element={<DatabasePage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="templates" element={<TemplatesPage />} />
        <Route path="health" element={<HealthPage />} />
        <Route path="api-docs" element={<ApiDocsPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="account" element={<AccountPage />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Route>
    </Routes>
  );
}
