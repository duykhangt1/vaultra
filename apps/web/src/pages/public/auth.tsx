import { forwardRef, InputHTMLAttributes, isValidElement, cloneElement, ReactElement, ReactNode, useEffect, useId, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  MailCheck,
  Phone,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  User,
} from 'lucide-react';
import { useAuth, topWorkspace } from '@/lib/auth';
import { BASE, post, ApiError, setStoredRt } from '@/lib/api';
import { useGet } from '@/lib/hooks';
import { Button, Alert, Checkbox, cn } from '@/ui';
import { CinemaVideo } from '@/cinema/CinemaVideo';
import { FILM } from '@/lib/media';

type AuthMode = 'login' | 'register' | 'recovery';

const safeReturn = (r: string | null) => (r && r.startsWith('/') && !r.startsWith('//') ? r : null);
const pwHint = 'Tối thiểu 5 ký tự.';

const OAUTH_ERR_MSG: Record<string, string> = {
  OAUTH_STATE: 'Phiên xác thực Google đã hết hạn hoặc không hợp lệ. Vui lòng thử lại.',
  OAUTH_ERROR: 'Không thể kết nối xác thực với Google. Vui lòng thử lại.',
  OAUTH_CANCELLED: 'Bạn đã hủy đăng nhập bằng Google.',
  OAUTH_EMAIL_UNVERIFIED: 'Email Google của bạn chưa được xác minh.',
  ACCOUNT_LOCKED: 'Tài khoản này đang bị khóa hoặc vô hiệu hóa.',
  GOOGLE_DISABLED_FOR_INTERNAL: 'Tài khoản nội bộ không được phép đăng nhập qua Google.',
};
