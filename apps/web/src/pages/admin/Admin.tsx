import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Plus,
  Pencil,
  Trash2,
  ShieldAlert,
  ShieldCheck,
  Users,
  KeyRound,
  Lock,
  ScrollText,
  Settings,
  Activity,
  Database,
  Mail,
  Clock,
  Search,
  Laptop,
  Building2,
} from 'lucide-react';
import { useGet, useAct } from '@/lib/hooks';
import { post, patch, put, del } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import {
  Async,
  Card,
  CardHead,
  Badge,
  Button,
  DataTable,
  EmptyState,
  Tabs,
  Drawer,
  Modal,
  Field,
  Input,
  Textarea,
  Select,
  Checkbox,
  Switch,
  Alert,
  PagedTable,
  FilterBar,
  Avatar,
  Progress,
  HelpTip,
  Tip,
  cn,
} from '@/ui';
import { fmtDateTime, enumLabel, relTime, todayVn, shiftYmd } from '@/lib/format';
import Chart from '@/widgets/Chart';
import { Titled } from '@/widgets/Titled';
import { ActBtn, REASON } from '../kit';

const ROLE_L: Record<string, string> = {
  CUSTOMER: 'Khách hàng',
  FACILITY_STAFF: 'Nhân viên cơ sở',
  FACILITY_MANAGER: 'Quản lý cơ sở',
  BUSINESS_OPS_MANAGER: 'Vận hành kinh doanh',
  SYSTEM_ADMIN: 'Quản trị hệ thống',
};
const FAC_ROLES = ['FACILITY_STAFF', 'FACILITY_MANAGER'];
