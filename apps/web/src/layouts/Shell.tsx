import { ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Bell, ChevronDown, ChevronRight, Home, LogOut, Menu as MenuIcon, Search, X, Building2, ArrowLeftRight, Settings, Globe, Plus, Check } from 'lucide-react';
import { useAuth, allowedWorkspaces } from '@/lib/auth';
import { WORKSPACE_LABEL, relTime } from '@/lib/format';
import { useI18n, tr } from '@/lib/i18n';
import { useGet, useAct } from '@/lib/hooks';
import { post } from '@/lib/api';
import { cn, Avatar, Menu, Badge } from '@/ui';
import { GlobalSearch } from '@/widgets/GlobalSearch';
import { Logo } from './Logo';


interface CoreQuoteNavItemPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateCoreQuoteNavItemInput(payload: CoreQuoteNavItemPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

const TENANT_TENANT_FACILITY_COLUMNS = [
  'depositHeldVnd',
] as const;
export type NavItem = { to: string; label: string; icon: ReactNode; end?: boolean; perm?: string; badge?: number };
