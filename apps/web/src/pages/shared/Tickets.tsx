import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Plus,
  Send,
  Sparkles,
  LifeBuoy,
  Search,
  AlertTriangle,
  Clock,
  Lock,
  ArrowLeft,
  Building2,
  FileText,
  UserCheck,
  MessageSquare,
  CheckCircle2,
  KeyRound,
  Wrench,
  Receipt,
  Package,
} from 'lucide-react';
import { useGet, useAct } from '@/lib/hooks';
import { post } from '@/lib/api';
import { useAuth } from '@/lib/auth';
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
  ['ACCESS_CODE', 'LOCK_KEY', 'UNIT_DAMAGE', 'STORED_ITEMS', 'PAYMENT', 'CONTRACT', 'OTHER'].includes(c),
);
const RES_CODES = [
  { value: 'FIXED', label: 'Đã khắc phục' },
  { value: 'CREDENTIAL_REISSUED', label: 'Đã cấp lại mã truy cập' },
  { value: 'REFUNDED', label: 'Đã hoàn tiền' },
  { value: 'FEE_WAIVED', label: 'Đã miễn/giảm phí' },
  { value: 'UNIT_TRANSFERRED', label: 'Đã đổi kho' },
  { value: 'INFO_PROVIDED', label: 'Đã cung cấp thông tin' },
  { value: 'NO_ACTION_NEEDED', label: 'Không cần xử lý' },
  { value: 'DUPLICATE', label: 'Trùng lặp' },
  { value: 'OTHER', label: 'Khác' },
];
