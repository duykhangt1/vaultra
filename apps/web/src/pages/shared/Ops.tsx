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
