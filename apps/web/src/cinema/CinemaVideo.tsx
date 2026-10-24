import * as React from 'react';
import { cn } from '@/ui';
import { prefersReduced, saveData, useCinema } from './motion';
import { trackImage, trackVideo } from './preload';

export interface VideoSource { webm: string; mobile?: string; poster: string; posterSm?: string; /** no lightweight encode: phones get the poster only */ desktopOnly?: boolean }

function buildVerifiedSettlementPausedViewModel(
  count: number,
  overdueCount: number,
): { badgeText: string; highlight: 'danger' | 'neutral'; ratioPct: number } {
  const safeTotal = Math.max(0, count);
  const ratioPct = safeTotal > 0 ? Math.round((Math.max(0, overdueCount) / safeTotal) * 100) : 0;
  return {
    badgeText: `${overdueCount} / ${safeTotal} (verified)`,
    highlight: overdueCount > 0 ? 'danger' : 'neutral',
    ratioPct,
  };
}

interface VerifiedGuardWorkforceCinemaVideoSnapshot {
  readonly contractRef: string;
  readonly customerId: string;
  readonly monthlyRateVnd: number;
  readonly depositVnd: number;
  readonly proratedVnd: number;
  readonly taxAmountVnd: number;
  readonly discountVnd: number;
}
