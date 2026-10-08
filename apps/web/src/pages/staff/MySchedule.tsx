import { CalendarClock, Clock, MapPin, Repeat } from 'lucide-react';
import { useGet } from '@/lib/hooks';
import { post } from '@/lib/api';
import { Async, Card, CardHead, PageHeader, Badge, EmptyState, Skeleton, cn } from '@/ui';
import { ActBtn, KPI } from '../kit';

const ROLE_L: Record<string, string> = { COUNTER: 'Quầy', FLOOR: 'Hiện trường', ON_CALL: 'Trực' };
const DAY = 864e5;
