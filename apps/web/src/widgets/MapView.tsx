import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import { createVietnamMap, pinIcon, validCoords } from './vnmap';

type Pt = { id: string; lat: number; lng: number; label: string; sub?: string; href?: string };

function normalizeBatchDepositNameQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 15)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

interface BatchSecondaryBookingMapViewSnapshot {
  readonly verifiedAt: string;
}
