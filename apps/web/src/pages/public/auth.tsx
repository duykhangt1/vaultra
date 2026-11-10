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

function AuthFrame({ mode = 'login', title, sub, switcher, returnTo, children }: AuthFrameProps) {
  const { pathname } = useLocation();
  const needsHeaderOffset = pathname.startsWith('/auth/');
  const rtSuffix = returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : '';

  return (
    <div className={cn('grid min-h-[calc(100dvh-68px)] bg-paper lg:grid-cols-[1fr_1fr]', needsHeaderOffset && 'pt-[68px]')}>
      {/* Left Calm Visual Panel (Desktop) */}
      <aside className="relative hidden flex-col justify-end overflow-hidden bg-[#08111e] p-12 text-white lg:flex xl:p-16">
        <div className="pointer-events-none absolute inset-0">
          <CinemaVideo
            src={mode === 'register' ? FILM.dawn : FILM.keypad}
            priority
            brightness={0.55}
            contrast={1.05}
            saturate={0.9}
            label="Không gian kho tự quản Vaultra"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#08111e] via-[#08111e]/45 to-[#08111e]/30" />
        </div>

        <div className="relative z-10 max-w-md">
          <h2 className="display text-[36px] leading-[1.06] text-white xl:text-[42px]">
            Chỗ riêng để cất
            <br />
            <span className="text-brass-400">đồ của bạn.</span>
          </h2>
          <p className="mt-3.5 text-[15px] leading-relaxed text-steel-200">
            Đặt kho trực tuyến, ký hợp đồng điện tử và quản lý mã mở cửa trong một tài khoản.
          </p>
        </div>
      </aside>

      {/* Right Form Panel */}
      <section className="relative flex flex-col items-center justify-center px-4 py-10 sm:px-6 lg:px-10">
        <div className="rise w-full max-w-[430px] rounded-2xl border border-ink-900/10 bg-white p-6 shadow-[0_20px_50px_-22px_rgb(8_18_31/0.14)] sm:p-8">
          {switcher && (
            <div role="tablist" aria-label="Chuyển đổi đăng nhập và đăng ký" className="mb-6 grid grid-cols-2 rounded-xl border border-steel-200/90 bg-paper p-1">
              <Link
                role="tab"
                aria-selected={switcher === 'login'}
                to={`/login${rtSuffix}`}
                className={cn(
                  'rounded-lg py-2 text-center text-[13px] font-semibold transition-all',
                  switcher === 'login' ? 'bg-ink-950 text-white shadow-xs' : 'text-steel-500 hover:text-ink-900',
                )}
              >
                Đăng nhập
              </Link>
              <Link
                role="tab"
                aria-selected={switcher === 'register'}
                to={`/register${rtSuffix}`}
                className={cn(
                  'rounded-lg py-2 text-center text-[13px] font-semibold transition-all',
                  switcher === 'register' ? 'bg-ink-950 text-white shadow-xs' : 'text-steel-500 hover:text-ink-900',
                )}
              >
                Đăng ký
              </Link>
            </div>
          )}

          <div>
            <h1 className="display text-[26px] text-ink-950 sm:text-[30px]">{title}</h1>
            {sub && <p className="mt-1.5 text-[14px] leading-relaxed text-steel-500">{sub}</p>}
          </div>

          <div className="mt-6">{children}</div>
        </div>
      </section>
    </div>
  );
}

/* ───────────────────────── Form Controls ───────────────────────── */

interface VaultInputProps extends InputHTMLAttributes<HTMLInputElement> {
  icon?: ReactNode;
  invalid?: boolean;
  passwordToggle?: boolean;
}

const VaultInput = forwardRef<HTMLInputElement, VaultInputProps>(
  ({ icon, invalid, passwordToggle, className, type, ...props }, ref) => {
    const [showPw, setShowPw] = useState(false);
    const resolvedType = passwordToggle ? (showPw ? 'text' : 'password') : type;

    return (
      <div className="group relative">
        {icon && (
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-steel-400 transition-colors group-focus-within:text-ink-900">
            {icon}
          </span>
        )}
        <input
          ref={ref}
          type={resolvedType}
          aria-invalid={invalid}
          className={cn(
            'h-11 w-full rounded-xl border border-steel-300/90 bg-white text-[14px] font-medium text-ink-900 placeholder:font-normal placeholder:text-steel-400 transition-all focus:border-ink-900 focus:outline-none focus:ring-3 focus:ring-brass-400/20 disabled:cursor-not-allowed disabled:bg-steel-100 aria-[invalid=true]:border-bad-600 aria-[invalid=true]:bg-bad-100/25',
            icon ? 'pl-10' : 'pl-3.5',
            passwordToggle ? 'pr-10' : 'pr-3.5',
            className,
          )}
          {...props}
        />
        {passwordToggle && (
          <button
            type="button"
            onClick={() => setShowPw((s) => !s)}
            className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-lg text-steel-400 transition hover:bg-steel-100 hover:text-ink-900"
            aria-label={showPw ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
          >
            {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        )}
      </div>
    );
  },
);
VaultInput.displayName = 'VaultInput';

function VaultField({
  label,
  labelRight,
  error,
  hint,
  required,
  children,
  className,
}: {
  label?: ReactNode;
  labelRight?: ReactNode;
  error?: string;
  hint?: ReactNode;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn('space-y-1.5', className)}>
      {(label || labelRight) && (
        <div className="flex items-center justify-between gap-2">
          {label && (
            <label htmlFor={id} className="block text-[13px] font-semibold text-ink-900">
              {label}
              {required && <span className="text-bad-600"> *</span>}
            </label>
          )}
          {labelRight}
        </div>
      )}
      {isValidElement(children)
        ? cloneElement(children as ReactElement<any>, { id, invalid: !!error || undefined })
        : children}
      {error ? (
        <p role="alert" className="text-xs font-medium text-bad-600">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-steel-500">{hint}</p>
      ) : null}
    </div>
  );
}

function GoogleBtn({ returnTo }: { returnTo: string }) {
  const cfg = useGet<{ enabled: boolean }>('/auth/google/config', undefined, { staleTime: 300_000 });
  if (!cfg.data?.enabled) return null;
  const originParam = typeof window !== 'undefined' ? window.location.origin : '';
  const buildHref = () => `${BASE}/auth/google/start?returnTo=${encodeURIComponent(returnTo)}&origin=${encodeURIComponent(originParam)}`;
  return (
    <>
      <div className="my-5 flex items-center gap-3 text-xs text-steel-400">
        <span className="h-px flex-1 bg-steel-200" />
        <span>hoặc</span>
        <span className="h-px flex-1 bg-steel-200" />
      </div>
      <a
        href={buildHref()}
        onClick={(e) => {
          e.currentTarget.href = buildHref();
        }}
        className="flex h-11 w-full items-center justify-center gap-3 rounded-xl border border-steel-300 bg-white text-[14px] font-semibold text-ink-900 transition hover:border-ink-900 hover:bg-paper/60 active:translate-y-px"
      >
        <GoogleEmblem className="size-5" />
        <span>Tiếp tục với Google</span>
      </a>
    </>
  );
}

/* ───────────────────────── 1. Login ───────────────────────── */

export function Login() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const { status, roles, login } = useAuth();
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const rt = safeReturn(sp.get('returnTo'));
  const oauthErr = sp.get('error');

  if (status === 'authed') return <Navigate to={rt ?? topWorkspace(roles)} replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const s = await login(email.trim(), pw);
      nav(rt ?? s.workspace ?? '/app', { replace: true });
    } catch (x) {
      setErr(
        x instanceof ApiError
          ? x.status === 429
            ? `Bạn thử quá nhiều lần. Vui lòng đợi ${(x.details as any)?.retryAfter ?? 60} giây.`
            : x.message
          : 'Không thể đăng nhập',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthFrame
      mode="login"
      switcher="login"
      returnTo={rt}
      title="Đăng nhập"
      sub="Nhập email và mật khẩu để tiếp tục."
    >
      {oauthErr && (
        <div className="mb-4">
          <Alert tone="bad">{OAUTH_ERR_MSG[oauthErr] ?? oauthErr}</Alert>
        </div>
      )}

      <form onSubmit={submit} className="space-y-4" noValidate>
        <VaultField label="Email" required>
          <VaultInput
            type="email"
            autoComplete="username"
            placeholder="ban@email.com"
            icon={<Mail className="size-4" />}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
          />
        </VaultField>

        <VaultField
          label="Mật khẩu"
          required
          labelRight={
            <Link
              className="text-xs font-medium text-steel-500 transition hover:text-ink-950 hover:underline"
              to="/forgot-password"
            >
              Quên mật khẩu?
            </Link>
          }
        >
          <VaultInput
            type="password"
            autoComplete="current-password"
            placeholder="Nhập mật khẩu"
            icon={<Lock className="size-4" />}
            passwordToggle
            value={pw}
            onChange={(e) => setPw(e.target.value)}
          />
        </VaultField>

        {err && <Alert tone="bad">{err}</Alert>}

        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="h-11 w-full rounded-xl text-[14.5px] font-bold"
          loading={busy}
          disabled={!email || !pw || busy}
        >
          <span>Đăng nhập</span>
          <ArrowRight className="size-4" />
        </Button>
      </form>

      <GoogleBtn returnTo={rt ?? '/'} />
    </AuthFrame>
  );
}

/* ───────────────────────── 2. Register ───────────────────────── */

export function Register() {
  const [sp] = useSearchParams();
  const [f, setF] = useState({ fullName: '', email: '', phone: '', password: '', confirm: '', terms: false });
  const [err, setErr] = useState<Record<string, string>>({});
  const [top, setTop] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const rt = safeReturn(sp.get('returnTo'));
  const set = (k: string, v: any) => setF((s) => ({ ...s, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (f.fullName.trim().length < 2) er.fullName = 'Nhập họ tên';
    if (!/.+@.+\..+/.test(f.email)) er.email = 'Email không hợp lệ';
    if (f.phone && !/^(\+?84|0)\d{9,10}$/.test(f.phone.replace(/\s/g, ''))) er.phone = 'Số điện thoại không hợp lệ';
    if (f.password.length < 5) er.password = pwHint;
    if (f.password !== f.confirm) er.confirm = 'Mật khẩu nhập lại không khớp';
    if (!f.terms) er.terms = 'Cần đồng ý điều khoản';
    setErr(er);
    if (Object.keys(er).length) return;
    setBusy(true);
    setTop(null);
    try {
      await post('/auth/register', {
        fullName: f.fullName.trim(),
        email: f.email.trim(),
        phone: f.phone || undefined,
        password: f.password,
        acceptTerms: true,
      });
      setDone(true);
    } catch (x) {
      if (x instanceof ApiError && Array.isArray(x.details)) {
        setErr(Object.fromEntries((x.details as any[]).map((d) => [d.field, d.message])));
      } else {
        setTop((x as Error).message);
      }
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <AuthFrame
        mode="register"
        title="Kiểm tra hộp thư của bạn"
        sub="Mở liên kết trong email để hoàn tất kích hoạt tài khoản."
      >
        <div className="rounded-xl border border-steel-200 bg-paper/55 p-5 text-center">
          <div className="mx-auto grid size-12 place-items-center rounded-xl bg-ink-950 text-brass-400">
            <MailCheck className="size-6" />
          </div>
          <p className="mt-3 text-sm text-ink-800">Đã gửi email xác minh tới:</p>
          <p data-no-translate className="mt-1 font-mono text-sm font-semibold text-ink-950">
            {f.email}
          </p>
          <p className="mt-2 text-xs text-steel-500">
            Liên kết có hiệu lực trong 24 giờ. Kiểm tra thêm mục Spam nếu chưa thấy thư.
          </p>
          <div className="mt-4 border-t border-steel-200 pt-3">
            <ResendVerification email={f.email} />
          </div>
        </div>
        <Link to={`/login${rt ? `?returnTo=${encodeURIComponent(rt)}` : ''}`} className="mt-4 block">
          <Button variant="dark" size="lg" className="h-11 w-full rounded-xl">
            <ArrowLeft className="size-4" />
            <span>Về trang đăng nhập</span>
          </Button>
        </Link>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame
      mode="register"
      switcher="register"
      returnTo={rt}
      title="Tạo tài khoản"
      sub="Điền thông tin để đặt kho và ký hợp đồng trực tuyến."
    >
      <form onSubmit={submit} className="space-y-3.5" noValidate>
        <div className="grid gap-3.5 sm:grid-cols-2">
          <VaultField label="Họ và tên" required error={err.fullName}>
            <VaultInput
              placeholder="Nguyễn Văn An"
              icon={<User className="size-4" />}
              value={f.fullName}
              onChange={(e) => set('fullName', e.target.value)}
              autoComplete="name"
            />
          </VaultField>

          <VaultField label="Số điện thoại" error={err.phone}>
            <VaultInput
              type="tel"
              placeholder="0912 345 678"
              icon={<Phone className="size-4" />}
              value={f.phone}
              onChange={(e) => set('phone', e.target.value)}
              autoComplete="tel"
            />
          </VaultField>
        </div>

        <VaultField label="Email" required error={err.email}>
          <VaultInput
            type="email"
            placeholder="ban@email.com"
            icon={<Mail className="size-4" />}
            value={f.email}
            onChange={(e) => set('email', e.target.value)}
            autoComplete="email"
          />
        </VaultField>

        <div className="grid gap-3.5 sm:grid-cols-2">
          <VaultField label="Mật khẩu" required error={err.password}>
            <VaultInput
              type="password"
              placeholder="Tối thiểu 5 ký tự"
              icon={<Lock className="size-4" />}
              passwordToggle
              value={f.password}
              onChange={(e) => set('password', e.target.value)}
              autoComplete="new-password"
            />
          </VaultField>

          <VaultField label="Nhập lại mật khẩu" required error={err.confirm}>
            <VaultInput
              type="password"
              placeholder="Xác nhận mật khẩu"
              icon={<Lock className="size-4" />}
              passwordToggle
              value={f.confirm}
              onChange={(e) => set('confirm', e.target.value)}
              autoComplete="new-password"
            />
          </VaultField>
        </div>

        <div className="pt-1">
          <Checkbox
            checked={f.terms}
            onChange={(v) => set('terms', v)}
            label={
              <span className="text-[13px] text-steel-600">
                Tôi đồng ý với{' '}
                <Link className="font-semibold text-ink-900 hover:underline" target="_blank" to="/terms">
                  Điều khoản sử dụng
                </Link>{' '}
                và{' '}
                <Link className="font-semibold text-ink-900 hover:underline" target="_blank" to="/privacy">
                  Chính sách bảo mật
                </Link>
                .
              </span>
            }
          />
          {err.terms && <p className="mt-1 text-xs font-medium text-bad-600">{err.terms}</p>}
        </div>

        {top && <Alert tone="bad">{top}</Alert>}

        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="h-11 w-full rounded-xl text-[14.5px] font-bold"
          loading={busy}
        >
          <span>Tạo tài khoản</span>
          <ArrowRight className="size-4" />
        </Button>
      </form>

      <GoogleBtn returnTo={rt ?? '/'} />
    </AuthFrame>
  );
}

function ResendVerification({ email }: { email: string }) {
  const [s, setS] = useState<'idle' | 'sending' | 'sent'>('idle');
  if (s === 'sent') {
    return (
      <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-ok-600">
        <Check className="size-3.5" />
        Đã gửi lại liên kết xác minh.
      </p>
    );
  }
  return (
    <button
      type="button"
      disabled={s === 'sending'}
      className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-900 transition hover:underline disabled:opacity-50"
      onClick={async () => {
        setS('sending');
        await post('/auth/resend-verification', { email }).catch(() => undefined);
        setS('sent');
      }}
    >
      <RefreshCw className={cn('size-3.5', s === 'sending' && 'animate-spin')} />
      <span>Gửi lại email xác minh</span>
    </button>
  );
}

/* ───────────────────────── 3. Verify Email ───────────────────────── */

export function VerifyEmail() {
  const [sp] = useSearchParams();
  const token =
    sp.get('token') ??
    new URLSearchParams(typeof window !== 'undefined' ? window.location.hash.replace(/^#/, '') : '').get('token');
  const [st, setSt] = useState<'busy' | 'ok' | 'bad'>('busy');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!token) {
      setSt('bad');
      setMsg('Liên kết không hợp lệ.');
      return;
    }
    post('/auth/verify-email', { token })
      .then(() => setSt('ok'))
      .catch((e) => {
        setSt('bad');
        setMsg(e.message);
      });
  }, [token]);

  return (
    <AuthFrame mode="recovery" title="Xác minh email">
      {st === 'busy' ? (
        <div className="flex flex-col items-center py-8 text-center">
          <Loader2 className="size-7 animate-spin text-brass-600" />
          <p className="mt-3 text-sm font-medium text-steel-600">Đang kiểm tra liên kết xác minh…</p>
        </div>
      ) : st === 'ok' ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-ok-600/20 bg-ok-100/60 p-5 text-center">
            <ShieldCheck className="mx-auto size-7 text-ok-600" />
            <p className="mt-2 text-sm font-bold text-ink-950">Email đã được xác minh</p>
            <p className="mt-1 text-xs text-steel-600">Tài khoản của bạn đã sẵn sàng để đăng nhập.</p>
          </div>
          <Link to="/login" className="block">
            <Button variant="primary" size="lg" className="h-11 w-full rounded-xl font-bold">
              <span>Đăng nhập</span>
              <ArrowRight className="size-4" />
            </Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          <Alert tone="bad" title="Không xác minh được email">
            {msg || 'Liên kết xác minh đã hết hạn hoặc đã được sử dụng.'}
          </Alert>
          <Link to="/login" className="block">
            <Button variant="dark" size="lg" className="h-11 w-full rounded-xl">
              <ArrowLeft className="size-4" />
              <span>Về trang đăng nhập</span>
            </Button>
          </Link>
        </div>
      )}
    </AuthFrame>
  );
}

/* ───────────────────────── 4. Forgot Password ───────────────────────── */

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <AuthFrame
      mode="recovery"
      title="Quên mật khẩu"
      sub="Nhập email đã đăng ký để nhận liên kết đặt lại mật khẩu."
    >
      {done ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-steel-200 bg-paper/60 p-4 text-sm text-steel-600">
            Nếu <span data-no-translate className="font-mono font-semibold text-ink-900">{email}</span> tồn tại trong hệ thống, liên kết đặt lại mật khẩu đã được gửi tới hộp thư của bạn.
          </div>
          <button
            type="button"
            onClick={() => {
              setDone(false);
              setErr(null);
            }}
            className="text-xs font-semibold text-ink-900 hover:underline"
          >
            Nhập lại email khác
          </button>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setErr(null);
            setBusy(true);
            try {
              await post('/auth/forgot-password', { email: email.trim() });
              setDone(true);
            } catch (x) {
              setErr((x as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <VaultField label="Email đăng ký" required>
            <VaultInput
              type="email"
              placeholder="ban@email.com"
              icon={<Mail className="size-4" />}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
            />
          </VaultField>

          {err && <Alert tone="bad">{err}</Alert>}

          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="h-11 w-full rounded-xl font-bold"
            loading={busy}
            disabled={!/.+@.+\..+/.test(email)}
          >
            <span>Gửi liên kết đặt lại</span>
            <ArrowRight className="size-4" />
          </Button>
        </form>
      )}

      <div className="mt-6 border-t border-steel-200 pt-4">
        <Link
          to="/login"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-steel-600 transition hover:text-ink-950"
        >
          <ArrowLeft className="size-4" />
          <span>Quay lại đăng nhập</span>
        </Link>
      </div>
    </AuthFrame>
  );
}

/* ───────────────────────── 5 & 6. ResetPassword & AcceptInvite ───────────────────────── */

function SetPassword({
  title,
  sub,
  path,
  cta,
}: {
  title: string;
  sub: string;
  path: string;
  cta: string;
}) {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const token =
    sp.get('token') ??
    new URLSearchParams(typeof window !== 'undefined' ? window.location.hash.replace(/^#/, '') : '').get('token') ??
    '';
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const reload = useAuth((s) => s.applySession);
  const bad = pw.length > 0 && pw.length < 5 ? pwHint : pw2 && pw !== pw2 ? 'Mật khẩu nhập lại không khớp' : null;

  return (
    <AuthFrame mode="recovery" title={title} sub={sub}>
      {!token ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-bad-600/30 bg-bad-100/75 p-4 text-sm text-ink-900">
            <ShieldAlert className="mt-0.5 size-5 shrink-0 text-bad-600" />
            <div>
              <p className="font-bold">Liên kết không hợp lệ hoặc đã hết hạn</p>
              <p className="mt-0.5 text-[13px] text-steel-600">
                Vui lòng yêu cầu gửi lại liên kết mới.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <Link to="/forgot-password">
              <Button variant="outline" className="h-10 w-full rounded-xl">
                Gửi lại liên kết
              </Button>
            </Link>
            <Link to="/login">
              <Button variant="dark" className="h-10 w-full rounded-xl">
                Về đăng nhập
              </Button>
            </Link>
          </div>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setErr(null);
            setBusy(true);
            try {
              const r = await post(path, { token, password: pw });
              if (r?.accessToken) {
                reload(r);
                nav(r.workspace ?? '/', { replace: true });
              } else {
                nav('/login', { replace: true });
              }
            } catch (x) {
              setErr((x as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <VaultField label="Mật khẩu mới" required>
            <VaultInput
              type="password"
              placeholder="Tối thiểu 5 ký tự"
              icon={<Lock className="size-4" />}
              passwordToggle
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              autoComplete="new-password"
              autoFocus
            />
          </VaultField>

          <VaultField label="Nhập lại mật khẩu mới" required error={bad ?? undefined}>
            <VaultInput
              type="password"
              placeholder="Xác nhận mật khẩu mới"
              icon={<Lock className="size-4" />}
              passwordToggle
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              autoComplete="new-password"
            />
          </VaultField>

          {err && <Alert tone="bad">{err}</Alert>}

          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="h-11 w-full rounded-xl font-bold"
            loading={busy}
            disabled={!!bad || !pw || !pw2}
          >
            <span>{cta}</span>
            <ArrowRight className="size-4" />
          </Button>
        </form>
      )}

      <div className="mt-6 border-t border-steel-200 pt-4">
        <Link
          to="/login"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-steel-600 transition hover:text-ink-950"
        >
          <ArrowLeft className="size-4" />
          <span>Về trang đăng nhập</span>
        </Link>
      </div>
    </AuthFrame>
  );
}

export const ResetPassword = () => (
  <SetPassword
    title="Đặt lại mật khẩu"
    sub="Tạo mật khẩu mới cho tài khoản của bạn."
    path="/auth/reset-password"
    cta="Lưu mật khẩu mới"
  />
);

export const AcceptInvite = () => (
  <SetPassword
    title="Kích hoạt tài khoản"
    sub="Thiết lập mật khẩu để bắt đầu làm việc."
    path="/auth/accept-invite"
    cta="Kích hoạt & đăng nhập"
  />
);

/* ───────────────────────── 7. OAuth Callback (Worker-Free Exchange) ───────────────────────── */

export function OAuthCallback() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const { status, workspace, roles, bootstrap, applySession } = useAuth();
  const [failed, setFailed] = useState(false);
  const exchanged = useRef(false);

  const code = sp.get('code');
  const state = sp.get('state');
  const oauthError = sp.get('error');

  useEffect(() => {
    if (oauthError && !code) {
      const mapped = oauthError === 'access_denied' ? 'OAUTH_CANCELLED' : oauthError;
      nav(`/login?error=${encodeURIComponent(mapped)}`, { replace: true });
      return;
    }
    if (!code || !state) return;
    if (exchanged.current) return;
    exchanged.current = true;

    post('/auth/google/exchange', { code, state })
      .then((r: any) => {
        if (r?.redirectTo) {
          const path = String(r.redirectTo).replace(/^https?:\/\/[^/]+/, '') || '/app/account?tab=security';
          nav(path, { replace: true });
          return;
        }
        if (r?.refreshToken) setStoredRt(r.refreshToken);
        if (r?.accessToken) {
          applySession(r);
          const rt = safeReturn(r.returnTo ?? sp.get('returnTo'));
          nav(rt && rt !== '/' ? rt : (r.workspace ?? topWorkspace(r.roles ?? [])), { replace: true });
          return;
        }
        nav('/login?error=OAUTH_ERROR', { replace: true });
      })
      .catch((e) => {
        const errCode = e instanceof ApiError && e.code ? e.code : 'OAUTH_ERROR';
        nav(`/login?error=${encodeURIComponent(errCode)}`, { replace: true });
      });
  }, [code, state, oauthError, nav, applySession, sp]);

  useEffect(() => {
    if (code && state) return;
    const hp = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const rtFromUrl = hp.get('rt') ?? sp.get('rt');
    if (rtFromUrl) setStoredRt(rtFromUrl);
  }, [sp, code, state]);

  useEffect(() => {
    if (code && state) return;
    const returnTo = safeReturn(sp.get('returnTo'));
    if (status === 'authed') {
      nav(returnTo && returnTo !== '/' ? returnTo : (workspace ?? topWorkspace(roles)), { replace: true });
      return;
    }
    if (status === 'anon' && !failed) {
      let cancelled = false;
      bootstrap().then(() => {
        if (!cancelled && useAuth.getState().status !== 'authed') {
          setFailed(true);
        }
      });
      return () => {
        cancelled = true;
      };
    }
    if (status === 'anon' && failed) {
      nav('/login?error=OAUTH_ERROR', { replace: true });
    }
  }, [status, workspace, roles, bootstrap, nav, sp, failed, code, state]);

  return (
    <AuthFrame mode="recovery" title="Đang đăng nhập…" sub="Vui lòng đợi trong giây lát.">
      <div className="flex flex-col items-center py-8 text-center">
        <Loader2 className="size-7 animate-spin text-brass-600" />
        <p className="mt-3 text-sm text-steel-500">Đang xác thực tài khoản Google của bạn…</p>
      </div>
    </AuthFrame>
  );
}

/* ───────────────────────── 8. Link Google Account ───────────────────────── */

export function LinkGoogle() {
  const [sp] = useSearchParams();
  const hashParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.hash.replace(/^#/, '') : '');
  const token = sp.get('token') ?? hashParams.get('token') ?? '';
  const nav = useNavigate();
  const apply = useAuth((s) => s.applySession);
  const [pw, setPw] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const hasPw = sp.get('hasPassword') !== 'false';

  const confirm = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await post('/auth/google/link/confirm', hasPw ? { token, password: pw } : { token, code });
      apply(r);
      nav(r.workspace ?? '/', { replace: true });
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const sendOtp = async () => {
    setSendingCode(true);
    setErr(null);
    try {
      await post('/auth/google/link/send-code', { token });
      setSent(true);
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setSendingCode(false);
    }
  };

  return (
    <AuthFrame
      mode="recovery"
      title="Liên kết tài khoản Google"
      sub="Email này đã có tài khoản Vaultra. Xác nhận một lần để đăng nhập bằng Google cho các lần sau."
    >
      <form onSubmit={confirm} className="space-y-4">
        {hasPw ? (
          <VaultField label="Mật khẩu hiện tại" required>
            <VaultInput
              type="password"
              placeholder="Nhập mật khẩu hiện có"
              icon={<Lock className="size-4" />}
              passwordToggle
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              autoComplete="current-password"
              autoFocus
            />
          </VaultField>
        ) : (
          <div className="space-y-3">
            {!sent ? (
              <div className="rounded-xl border border-steel-200 bg-paper/55 p-4 text-center">
                <p className="text-[13px] text-steel-600">
                  Nhận mã 6 chữ số qua email để xác nhận quyền sở hữu tài khoản.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-3 h-10 w-full rounded-xl"
                  loading={sendingCode}
                  onClick={sendOtp}
                >
                  <Mail className="size-4" />
                  <span>Gửi mã xác nhận</span>
                </Button>
              </div>
            ) : (
              <VaultField
                label="Mã xác nhận 6 chữ số"
                required
                labelRight={
                  <button
                    type="button"
                    disabled={sendingCode}
                    onClick={sendOtp}
                    className="text-xs font-semibold text-ink-900 hover:underline disabled:opacity-50"
                  >
                    Gửi lại mã
                  </button>
                }
              >
                <VaultInput
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="000000"
                  icon={<KeyRound className="size-4" />}
                  className="font-mono text-base tracking-[0.35em]"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  autoFocus
                />
              </VaultField>
            )}
          </div>
        )}

        {err && <Alert tone="bad">{err}</Alert>}

        <Button
          type="submit"
          className="h-11 w-full rounded-xl font-bold"
          variant="primary"
          size="lg"
          loading={busy}
          disabled={hasPw ? !pw : code.length !== 6}
        >
          <span>Liên kết & đăng nhập</span>
          <ArrowRight className="size-4" />
        </Button>
      </form>

      <div className="mt-6 border-t border-steel-200 pt-4">
        <Link
          to="/login"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-steel-600 transition hover:text-ink-950"
        >
          <ArrowLeft className="size-4" />
          <span>Quay về đăng nhập</span>
        </Link>
      </div>
    </AuthFrame>
  );
}
