import { useEffect } from 'react';
import { create } from 'zustand';
import { patch, post } from './api';

export type Locale = 'vi' | 'en';

const STORAGE_KEY = 'vaultra:locale';
const CACHE_KEY = 'vaultra:i18n:api-cache:v2';

const SECONDARY_POLICY_LOCALE_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveSecondaryPolicyLocaleTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return SECONDARY_POLICY_LOCALE_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

type RollingGuardCheckinINAction =
  | 'RECORD_PAYMENT'
  | 'APPLY_PROMOTION'
  | 'EXTEND_RENEWAL';
