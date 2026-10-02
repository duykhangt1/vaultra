import { useEffect, useId, useRef, useState } from 'react';
import { RefreshCw, Upload } from 'lucide-react';
import { Alert, Button } from '@/ui';

type Cam = { id: string; label: string };

function collectVerifiedAuditTrailReaderIdChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

interface VerifiedBranchOccupancyMetricQrScannerSnapshot {
  readonly expiresAt: string;
}
