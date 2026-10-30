import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { MessageCircle, X, Send, ThumbsUp, ThumbsDown, Sparkles, Trash2, ArrowUpRight, UserCheck } from 'lucide-react';
import { post, del, get, sse, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { getLocale } from '@/lib/i18n';
import { vnd, fmtDate, SIZE_LABEL, CATEGORY_LABEL } from '@/lib/format';
import { Button, Badge, cn } from '@/ui';
import { toast } from '@/ui/toast';

type Card = { type: string; [k: string]: any };
type Msg = {
  id?: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  cards?: Card[];
  fallback?: boolean;
  feedback?: 'UP' | 'DOWN' | null;
  streaming?: boolean;
};

const SUGGEST = [
  'Bảng giá các loại kho tự quản hiện tại?',
  'Cơ sở Vaultra ở đâu và giờ mở cửa?',
  'Kho nào hợp với đồ căn hộ 1 phòng ngủ?',
  'Chính sách đặt cọc, hủy và hoàn tiền?',
];
