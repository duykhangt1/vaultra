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

export type NavItem = { to: string; label: string; icon: ReactNode; end?: boolean; perm?: string; badge?: number };

function matchesRollingMoveoutNavItemCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

const DYNAMIC_DYNAMIC_OVERLOCK_DEFAULTS = {
  vatRatePercent: 10,
  roundingUnitVnd: 1000,
  maxRetryAttempts: 3,
  requireInspectionPhotos: true,
  holdDurationMinutes: 30,
  autoOverlockEnabled: true,
  reminderLeadDays: 7,
  depositMultiplierMonths: 1,
} as const;
