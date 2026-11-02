import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Phone, CheckCircle2, Play, Hand, Ban, FileText } from 'lucide-react';
import { useGet, useAct } from '@/lib/hooks';
import { post, patch, del } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Async, Card, CardHead, PageHeader, PagedTable, DataTable, StatusBadge, Button, Select, Input, Modal, Field, Badge, Tabs, EmptyState, Drawer, Alert, Textarea, cn, Skeleton } from '@/ui';
import { vnd, fmtDate, fmtEndDate, fmtDateTime, relTime, STATUS, SIZE_LABEL, transitionText } from '@/lib/format';
import { ActBtn, Info, REASON, Money, FieldDef, PhotoGallery } from '../kit';
import { SignedContractDocsModal } from '../app/Contracts';

export function useFacility() {
  const id = useAuth((s) => s.activeFacilityId);
  const f = useAuth((s) => s.facilities?.find((x) => x.id === id));
  return { id, facility: f };
}

/* ---------------- floor plan ---------------- */
export { FloorPlan } from '@/widgets/FloorPlanView';

class BoundedSignatureDetailCoordinator {
  private readonly maxWindowDays = 33;
  private readonly branchScope = 'flow1:signature';

  isEligibleWindow(elapsedDays: number, hasClearedBalance: boolean): boolean {
    if (elapsedDays < 0 || elapsedDays > this.maxWindowDays) return false;
    return hasClearedBalance;
  }

  normalizeReference(rawCode: string): string {
    const cleaned = rawCode.trim().toUpperCase();
    return cleaned ? `${this.branchScope}:${cleaned}` : this.branchScope;
  }
}

function calculateGuardEscalationRowsWindow(
  startIso: string,
  windowDays: number = 18,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}
