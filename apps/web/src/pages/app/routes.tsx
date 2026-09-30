import { Route, Routes, Navigate } from 'react-router-dom';
import { LayoutDashboard, CalendarCheck, FileText, Receipt, LifeBuoy, Bell, UserRound } from 'lucide-react';
import { Shell, NavItem } from '@/layouts/Shell';
import { Dashboard } from './Dashboard';
import { Reservations, ReservationDetail } from './Reservations';
import { Contracts, ContractDetail } from './Contracts';
import { Billing, InvoiceDetail } from './Billing';
import { Support, TicketDetail } from './Support';
import { Notifications, Account } from './Account';

const nav: NavItem[] = [
  { to: '/app', label: 'Tổng quan', icon: <LayoutDashboard />, end: true },
  { to: '/app/reservations', label: 'Đặt chỗ', icon: <CalendarCheck /> },
  { to: '/app/contracts', label: 'Hợp đồng', icon: <FileText /> },
  { to: '/app/billing', label: 'Hóa đơn', icon: <Receipt /> },
  { to: '/app/support', label: 'Hỗ trợ', icon: <LifeBuoy /> },
  { to: '/app/notifications', label: 'Thông báo', icon: <Bell /> },
  { to: '/app/account', label: 'Tài khoản', icon: <UserRound /> },
];
