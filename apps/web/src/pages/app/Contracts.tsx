import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Search,
  Download,
  KeyRound,
  ShieldAlert,
  RefreshCw,
  LogOut as OutIcon,
  Unlock,
  Lock,
  FileText,
  Eye,
  EyeOff,
  Camera,
  Copy,
  Check,
  Compass,
  CalendarClock,
  ShieldCheck,
  Plus,
  CreditCard,
  MapPin,
  ArrowLeft,
} from 'lucide-react';
import { useGet, useAct, useDebounced } from '@/lib/hooks';
import { post, patch, newIdemKey, API_ORIGIN } from '@/lib/api';
import {
  Async,
  Card,
  CardHead,
  PagedTable,
  StatusBadge,
  Button,
  Alert,
  Tabs,
  Field,
  Input,
  Modal,
  Badge,
  EmptyState,
  Timeline,
  Switch,
  cn,
} from '@/ui';
import { vnd, fmtDate, fmtEndDate, fmtDateTime, addDaysYmd, statusOf } from '@/lib/format';
import { PublicFloorPlanExplorer } from '@/widgets/FloorPlanView';
import { ActBtn, Info, REASON, Money, PhotoGallery } from '../kit';

const CT_TABS: { value: string; label: string; status: string; empty: [string, string] }[] = [
  {
    value: 'live',
    label: 'Đang thuê',
    status: 'ACTIVE,MOVE_OUT_SCHEDULED,EXPIRED',
    empty: [
      'Chưa có kho đang thuê',
      'Kho xuất hiện ở đây sau khi bạn ký hợp đồng và nhận bàn giao kho tại cơ sở.',
    ],
  },
  {
    value: 'ended',
    label: 'Đã kết thúc',
    status: 'ENDED,TERMINATED,CANCELLED',
    empty: [
      'Chưa có hợp đồng nào đã kết thúc',
      'Lịch sử hợp đồng cũ sẽ lưu ở đây.',
    ],
  },
  {
    value: 'all',
    label: 'Tất cả',
    status: '',
    empty: [
      'Chưa có hợp đồng',
      'Hợp đồng chỉ có sau khi bạn ký và nhận bàn giao kho tại cơ sở.',
    ],
  },
];

const DOC_TYPE_LABELS: Record<string, string> = {
  CONTRACT: 'Hợp đồng thuê kho điện tử (Bản khách đã ký)',
  HANDOVER_MOVE_IN: 'Biên bản bàn giao nhận kho (Đã ký)',
  HANDOVER_MOVE_OUT: 'Biên bản kiểm tra & bàn giao trả kho (Đã ký)',
  RENEWAL_ADDENDUM: 'Phụ lục gia hạn hợp đồng (Đã ký)',
  TRANSFER_ADDENDUM: 'Phụ lục đổi kho (Đã ký)',
  FINAL_NOTICE: 'Thông báo quá hạn lần cuối',
  TERMINATION_NOTICE: 'Thông báo chấm dứt hợp đồng',
};
