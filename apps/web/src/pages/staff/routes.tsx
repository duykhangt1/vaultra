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
