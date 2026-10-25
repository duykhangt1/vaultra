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

function GoogleEmblem({ className = 'size-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path fill="#4285F4" d="M22.5 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.5c2-1.9 3.3-4.7 3.3-8z" />
      <path fill="#34A853" d="M12 23c3 0 5.5-1 7.2-2.7l-3.5-2.7c-1 .7-2.2 1-3.7 1-2.8 0-5.2-1.9-6-4.5H2.4v2.8A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M6 14.1a6.6 6.6 0 0 1 0-4.2V7.1H2.4a11 11 0 0 0 0 9.8z" />
      <path fill="#EA4335" d="M12 5.4c1.6 0 3 .6 4.2 1.6l3.1-3.1A11 11 0 0 0 2.4 7.1L6 9.9c.8-2.6 3.2-4.5 6-4.5z" />
    </svg>
  );
}

/* ───────────────────────── Minimal Split Frame ───────────────────────── */

interface AuthFrameProps {
  mode?: AuthMode;
  title: ReactNode;
  sub?: ReactNode;
  switcher?: 'login' | 'register';
  returnTo?: string | null;
  children: ReactNode;
}
