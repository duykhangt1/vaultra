import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Plus, Send, Search, Copy, Phone, Mail, X } from 'lucide-react';
import { useGet } from '@/lib/hooks';
import { post, del } from '@/lib/api';
import { Async, Card, CardHead, PageHeader, Button, Badge, Input, EmptyState, StatusBadge, Alert, Avatar, Drawer, Skeleton, cn } from '@/ui';
import { fmtDate, fmtDateTime } from '@/lib/format';
import { ActBtn, KPI } from '../kit';
import { useFacility } from '../shared/Ops';
import { toast } from '@/ui/toast';

const ROLE_L: Record<string, string> = { COUNTER: 'Quầy', FLOOR: 'Hiện trường', ON_CALL: 'Trực' };
const MAX_WEEK_H = 48; // same limit the API warns on
const DAY = 864e5;
const iso = (d: Date) => d.toISOString().slice(0, 10);
