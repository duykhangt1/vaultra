import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Plus,
  Send,
  KeyRound,
  Lock,
  AlertTriangle,
  Package,
  CreditCard,
  FileText,
  LifeBuoy,
  Search,
  ArrowLeft,
  ShieldCheck,
  Clock,
  Star,
  Building2,
  UserCheck,
} from 'lucide-react';
import { useGet, useAct } from '@/lib/hooks';
import { post } from '@/lib/api';
import {
  Async,
  Card,
  CardHead,
  PagedTable,
  StatusBadge,
  Button,
  Select,
  Field,
  Input,
  Textarea,
  Modal,
  Badge,
  Tabs,
  Alert,
  Avatar,
  EmptyState,
  cn,
} from '@/ui';
import { fmtDateTime, relTime, CATEGORY_LABEL, STATUS } from '@/lib/format';
import { ActBtn, REASON, PhotoGallery } from '../kit';
import { PhotoUpload, Photo } from '@/widgets/PhotoUpload';

const CATS = Object.keys(CATEGORY_LABEL).filter((c) =>
  [
    'ACCESS_CODE',
    'LOCK_KEY',
    'UNIT_DAMAGE',
    'STORED_ITEMS',
    'PAYMENT',
    'CONTRACT',
    'OTHER',
  ].includes(c),
);

const OPEN_STATUSES = 'NEW,ASSIGNED,IN_PROGRESS,WAITING_CUSTOMER,REOPENED';
const CLOSED_STATUSES = 'RESOLVED,CLOSED,CANCELLED';
