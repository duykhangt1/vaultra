import { Navigate, Route, Routes } from 'react-router-dom';
import { LayoutDashboard, Map, Layers, Boxes, CalendarCheck, FileText, RefreshCw, AlertTriangle, LogOut, CheckSquare, Users, CalendarClock, ClipboardList, Wrench, LifeBuoy, BarChart3, Settings, Bell, UserRound, Receipt, UserCog, KeyRound } from 'lucide-react';
import { Shell, NavItem } from '@/layouts/Shell';
import { Cockpit } from './Cockpit';
import { ManageReservations, ManageContracts, ManageContractDetail } from './Rentals';
import { Delinquency } from './Collections';
import { Approvals, Payments } from './Money';
import { UnitTypes, UnitsPage, FloorEditor } from './Catalog';
import { StaffList, Schedule, Maintenance } from './Team';
import { Accounts } from './Accounts';
import { FacilitySettings } from './Settings';
import { MoveOuts, MoveOutWizard } from '../staff/MoveOut';
import { TasksPage, CustomersPage, CustomerDetail, useFacility } from '../shared/Ops';
import { TicketList, TicketDetail } from '../shared/Tickets';
import { ReportsPage } from '../shared/Reports';
import { KbPage } from '../ops/System';
import { NotificationsPage, AccountPage } from '../shared/Account';
import { PageHeader, EmptyState } from '@/ui';

const nav: NavItem[] = [
  { to: '/manage', label: 'Tổng quan', icon: <LayoutDashboard />, end: true },
  { to: '/manage/floor', label: 'Sơ đồ', icon: <Map /> },
  { to: '/manage/unit-types', label: 'Loại kho', icon: <Layers /> },
  { to: '/manage/units', label: 'Kho', icon: <Boxes /> },
  { to: '/manage/reservations', label: 'Đặt thuê', icon: <CalendarCheck /> },
  { to: '/manage/contracts', label: 'Hợp đồng', icon: <FileText /> },
  { to: '/manage/renewals', label: 'Gia hạn', icon: <RefreshCw /> },
  { to: '/manage/delinquency', label: 'Công nợ', icon: <AlertTriangle /> },
  { to: '/manage/billing', label: 'Hóa đơn', icon: <Receipt /> },
  { to: '/manage/moveouts', label: 'Trả kho', icon: <LogOut /> },
  { to: '/manage/approvals', label: 'Phê duyệt', icon: <CheckSquare /> },
  { to: '/manage/customers', label: 'Khách hàng', icon: <Users /> },
  { to: '/manage/staff', label: 'Nhân viên', icon: <UserCog /> },
  { to: '/manage/accounts', label: 'Tài khoản & Nhân sự', icon: <KeyRound />, perm: 'facility_account.manage' },
  { to: '/manage/schedule', label: 'Lịch ca', icon: <CalendarClock /> },
  { to: '/manage/tasks', label: 'Công việc', icon: <ClipboardList /> },
  { to: '/manage/maintenance', label: 'Bảo trì', icon: <Wrench /> },
  { to: '/manage/tickets', label: 'Hỗ trợ', icon: <LifeBuoy /> },
  { to: '/manage/reports', label: 'Báo cáo', icon: <BarChart3 /> },
  { to: '/manage/settings', label: 'Cài đặt', icon: <Settings /> },
  { to: '/manage/notifications', label: 'Thông báo', icon: <Bell /> },
  { to: '/manage/account', label: 'Tài khoản', icon: <UserRound /> },
];
const bottom = ['/manage', '/manage/reservations', '/manage/contracts', '/manage/approvals', '/manage/tasks'].map((to) => nav.find((n) => n.to === to)!);

function Gate({ children }: { children: (id: string) => React.ReactNode }) {
  const { id } = useFacility();
  return id ? <>{children(id)}</> : <EmptyState title="Chưa được phân công cơ sở" hint="Liên hệ quản trị để được gán vào một cơ sở." />;
}
