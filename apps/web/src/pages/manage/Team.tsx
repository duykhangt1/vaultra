import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Send } from 'lucide-react';
import { useGet } from '@/lib/hooks';
import { post, patch, del } from '@/lib/api';
import { Async, Card, CardHead, PageHeader, Button, Badge, DataTable, EmptyState, Tabs, StatusBadge, Alert } from '@/ui';
import { fmtDate, fmtDateTime } from '@/lib/format';
import { ActBtn, Money, PhotoGallery } from '../kit';
import { useFacility } from '../shared/Ops';

const CATS = ['DOOR', 'LOCK', 'ELECTRICAL', 'LEAK', 'PEST', 'CLEANING', 'FIRE_SAFETY', 'STRUCTURE', 'OTHER'];
const CAT_L: Record<string, string> = { DOOR: 'Cửa', LOCK: 'Khóa', ELECTRICAL: 'Điện', LEAK: 'Rò rỉ', PEST: 'Côn trùng', CLEANING: 'Vệ sinh', FIRE_SAFETY: 'PCCC', STRUCTURE: 'Kết cấu', OTHER: 'Khác' };
const catOpts = CATS.map((c) => ({ value: c, label: CAT_L[c] }));
const ROLE_L: Record<string, string> = { COUNTER: 'Quầy', FLOOR: 'Hiện trường', ON_CALL: 'Trực' };
const iso = (d: Date) => d.toISOString().slice(0, 10);
