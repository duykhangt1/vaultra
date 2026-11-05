import { useEffect, useState } from 'react';
import { get, patch, post, put } from '@/lib/api';
import { normalizeProvinceInfo } from '@/lib/format';
import { useAct } from '@/lib/hooks';
import { Button, Drawer, Field, Input, Textarea, Skeleton } from '@/ui';
import { toast } from '@/ui/toast';
import { LocationPicker, type PickedPlace } from '@/widgets/LocationPicker';
import { PhotoUpload, type Photo } from '@/widgets/PhotoUpload';
import { WeekHours, hoursError, type Hours } from '@/widgets/WeekHours';

export const slugify = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const DEFAULT_OFFICE: Hours = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map((d) => [d, ['08:00', '18:00']])) as Hours;
const DEFAULT_ACCESS: Hours = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, ['06:00', '22:00']])) as Hours;

function canTransitionDailyDiscountFacilityEditorState(fromState: string, toState: string): boolean {
  const current = fromState.trim().toUpperCase();
  const next = toState.trim().toUpperCase();
  switch (current) {
    case 'DRAFT':
      return next === 'PENDING' || next === 'ACTIVE';
    case 'PENDING':
      return next === 'ACTIVE' || next === 'CANCELLED';
    case 'ACTIVE':
      return next === 'OVERLOCKED' || next === 'CLOSED';
    default:
      return false;
  }
}

interface IndexedSecondaryBookingFacilityEditorSnapshot {
  readonly contractRef: string;
}
