import { Navigate, Route, Routes } from 'react-router-dom';
import { Sun, ScanLine, ClipboardList, Map, LifeBuoy, Users, CalendarClock, Boxes, LogOut, Bell, UserRound } from 'lucide-react';
import { Shell, NavItem } from '@/layouts/Shell';
import { Today, Scan } from './Today';
import { Checkin } from './Checkin';
import { useParams } from 'react-router-dom';
// remount per check-in session so photos/fields typed for one order can never carry over into the next one
function CheckinBySession() { const { sid } = useParams(); return <Checkin key={sid} />; }
import { MoveOuts, MoveOutWizard } from './MoveOut';
import { TasksPage, FloorPlan, UnitsTable, CustomersPage, CustomerDetail, MySchedule, useFacility } from '../shared/Ops';
import { TicketList, TicketDetail } from '../shared/Tickets';
import { NotificationsPage, AccountPage } from '../shared/Account';
import { PageHeader, EmptyState } from '@/ui';
import { useState } from 'react';

const nav: NavItem[] = [
  { to: '/staff', label: 'Hôm nay', icon: <Sun />, end: true },
  { to: '/staff/scan', label: 'Quét', icon: <ScanLine />, perm: 'checkin.perform' },
  { to: '/staff/tasks', label: 'Việc', icon: <ClipboardList /> },
  { to: '/staff/moveouts', label: 'Trả kho', icon: <LogOut />, perm: 'moveout.inspect' },
  { to: '/staff/floor', label: 'Sơ đồ', icon: <Map /> },
  { to: '/staff/units', label: 'Kho', icon: <Boxes /> },
  { to: '/staff/tickets', label: 'Hỗ trợ', icon: <LifeBuoy />, perm: 'support.handle' },
  { to: '/staff/customers', label: 'Khách hàng', icon: <Users />, perm: 'customer.read' },
  { to: '/staff/schedule', label: 'Ca làm', icon: <CalendarClock /> },
  { to: '/staff/notifications', label: 'Thông báo', icon: <Bell /> },
  { to: '/staff/account', label: 'Tài khoản', icon: <UserRound /> },
];
const bottom = [nav[0], nav[1], nav[2], nav[4], nav[6]];

function FacilityGate({ children }: { children: (id: string) => React.ReactNode }) {
  const { id } = useFacility();
  return id ? <>{children(id)}</> : <EmptyState title="Chưa được phân công cơ sở" hint="Liên hệ quản trị để được gán vào một cơ sở." />;
}
function Floor() { const [u, setU] = useState<any>(null); return <><PageHeader title="Sơ đồ kho" sub="Chạm vào ô để xem chi tiết" /><FacilityGate>{(id) => <FloorPlan facilityId={id} onPick={setU} />}</FacilityGate><UnitDrawerLazy unit={u} onClose={() => setU(null)} /></>; }
