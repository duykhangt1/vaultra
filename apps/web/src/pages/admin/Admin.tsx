import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Plus,
  Pencil,
  Trash2,
  ShieldAlert,
  ShieldCheck,
  Users,
  KeyRound,
  Lock,
  ScrollText,
  Settings,
  Activity,
  Database,
  Mail,
  Clock,
  Search,
  Laptop,
  Building2,
} from 'lucide-react';
import { useGet, useAct } from '@/lib/hooks';
import { post, patch, put, del } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import {
  Async,
  Card,
  CardHead,
  Badge,
  Button,
  DataTable,
  EmptyState,
  Tabs,
  Drawer,
  Modal,
  Field,
  Input,
  Textarea,
  Select,
  Checkbox,
  Switch,
  Alert,
  PagedTable,
  FilterBar,
  Avatar,
  Progress,
  HelpTip,
  Tip,
  cn,
} from '@/ui';
import { fmtDateTime, enumLabel, relTime, todayVn, shiftYmd } from '@/lib/format';
import Chart from '@/widgets/Chart';
import { Titled } from '@/widgets/Titled';
import { ActBtn, REASON } from '../kit';

const ROLE_L: Record<string, string> = {
  CUSTOMER: 'Khách hàng',
  FACILITY_STAFF: 'Nhân viên cơ sở',
  FACILITY_MANAGER: 'Quản lý cơ sở',
  BUSINESS_OPS_MANAGER: 'Vận hành kinh doanh',
  SYSTEM_ADMIN: 'Quản trị hệ thống',
};
const FAC_ROLES = ['FACILITY_STAFF', 'FACILITY_MANAGER'];
const INTERNAL = ['FACILITY_STAFF', 'FACILITY_MANAGER', 'BUSINESS_OPS_MANAGER', 'SYSTEM_ADMIN'];

function AdminHero({
  title,
  sub,
  icon,
  actions,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  sub?: React.ReactNode;
  icon: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="grain blueprint-dark relative overflow-hidden rounded-2xl border border-ink-800 bg-ink-950 p-5 text-white shadow-[var(--shadow-card)] sm:p-6">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brass-600 via-brass-400 to-brass-600" />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-brass-400/35 bg-brass-500/15 text-brass-400">
            {icon}
          </span>
          <div>
            <h1 className="display text-2xl text-white sm:text-3xl">{title}</h1>
            {sub && <p className="mt-1 max-w-2xl text-sm text-steel-300">{sub}</p>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

function SecurityMetric({
  label,
  value,
  sub,
  icon,
  tone,
  help,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon: React.ReactNode;
  tone?: 'ok' | 'bad' | 'warn';
  help?: string;
}) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border bg-white p-4 shadow-[var(--shadow-card)]',
        tone === 'bad' ? 'border-bad-600/35' : tone === 'warn' ? 'border-warn-600/35' : 'hairline',
      )}
    >
      <div
        className={cn(
          'pointer-events-none absolute inset-x-0 top-0 h-1',
          tone === 'bad'
            ? 'bg-bad-600'
            : tone === 'warn'
              ? 'bg-warn-600'
              : 'bg-gradient-to-r from-ink-900 via-brass-500 to-ink-900',
        )}
      />
      <div className="flex items-start justify-between gap-2">
        <p className="flex items-center text-xs font-bold uppercase tracking-wider text-steel-500">
          {label}
          {help && <HelpTip text={help} label={`Giải thích: ${label}`} />}
        </p>
        <span
          className={cn(
            'grid size-8 shrink-0 place-items-center rounded-lg',
            tone === 'bad'
              ? 'bg-bad-100 text-bad-600'
              : tone === 'warn'
                ? 'bg-warn-100 text-warn-600'
                : 'bg-paper text-ink-900',
          )}
        >
          {icon}
        </span>
      </div>
      <p
        className={cn(
          'mt-2 text-2xl font-extrabold leading-none tracking-tight num sm:text-3xl',
          tone === 'bad' ? 'text-bad-600' : tone === 'warn' ? 'text-warn-600' : 'text-ink-950',
        )}
      >
        {value}
      </p>
      {sub && <p className="mt-1.5 text-xs font-medium text-steel-500">{sub}</p>}
    </div>
  );
}

/* ───────────── security overview ───────────── */
const SEC_RANGES: { key: string; label: string; help: string }[] = [
  { key: '24h', label: '24 giờ qua', help: '24 giờ gần nhất tính đến lúc này, vẽ theo từng giờ.' },
  { key: '7d', label: '7 ngày', help: '7 ngày dương lịch gần nhất tính cả hôm nay, vẽ theo từng ngày.' },
  { key: '30d', label: '30 ngày', help: '30 ngày dương lịch gần nhất tính cả hôm nay, vẽ theo từng ngày.' },
  { key: '90d', label: '90 ngày', help: '90 ngày dương lịch gần nhất tính cả hôm nay, vẽ theo từng ngày.' },
  { key: 'custom', label: 'Tùy chọn', help: 'Tự chọn ngày bắt đầu và ngày kết thúc (tối đa 366 ngày). Chọn đúng một ngày thì vẽ theo từng giờ của ngày đó.' },
];

/** The security overview answer. A server that predates the period filter sends logins24h / hourly / tokenReuse7d only, so both shapes are read. */
function readSecurity(raw: any) {
  if (!raw) return raw;
  return {
    ...raw,
    logins: raw.logins ?? raw.logins24h ?? { success: 0, failed: 0 },
    tokenReuse: raw.tokenReuse ?? raw.tokenReuse7d ?? 0,
    period: raw.period ?? { label: '24 giờ gần nhất', bucket: 'hour', from: new Date(Date.now() - 86400000).toISOString(), to: new Date().toISOString() },
    series: raw.series ?? (raw.hourly ?? []).map((h: any) => ({ label: String(h.hour).slice(11, 16), ok: h.ok, fail: h.fail })),
  };
}

export function AdminDashboard() {
  const today = todayVn();
  const [range, setRange] = useState('24h');
  const [from, setFrom] = useState(() => shiftYmd(today, -6));
  const [to, setTo] = useState(today);
  const q = useGet<any>('/admin/dashboard', range === 'custom' ? { range, from, to } : { range }, { keepPrevious: true });
  const live = readSecurity(q.data);
  const cleanPosture = live && live.tokenReuse7d === 0 && live.lockedAccounts === 0;

  return (
    <div className="space-y-6">
      <div className="grain blueprint-dark relative overflow-hidden rounded-2xl border border-ink-800 bg-ink-950 p-5 text-white shadow-[var(--shadow-card)] sm:p-7">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brass-600 via-brass-400 to-brass-600" />
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="display inline-flex items-center text-2xl text-white sm:text-3xl">
                An ninh &amp; Điều hành hệ thống
                <HelpTip onDark text={'Tổng quan an ninh: lượt đăng nhập, tài khoản bị khóa, dấu hiệu tái sử dụng token và cơ cấu phân quyền.\nChọn khoảng thời gian ở khung bên dưới để xem lưu lượng đăng nhập của khoảng đó; tài khoản bị khóa luôn là tình trạng ngay lúc xem.'} />
              </h1>
              {live && (
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                    cleanPosture
                      ? 'border-white/15 bg-white/10 text-steel-200'
                      : 'border-warn-600/40 bg-warn-100/15 text-brass-400',
                  )}
                >
                  <span className={cn('size-2 rounded-full', cleanPosture ? 'bg-brass-400' : 'bg-bad-600')} />
                  {cleanPosture ? 'Trạng thái an toàn' : 'Cần rà soát cảnh báo'}
                  <HelpTip onDark text={'An toàn khi không có tài khoản nào đang bị khóa và không có lần tái sử dụng refresh token nào trong 7 ngày qua. Ngược lại hệ thống báo cần rà soát.'} />
                </span>
              )}
            </div>
            <p className="max-w-2xl text-sm text-steel-300">
              Giám sát xác thực phiên đăng nhập, phân quyền RBAC, nhật ký kiểm toán bất biến và sức khỏe dịch vụ nền.
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              <Tip text="Tạo, khóa, mở khóa tài khoản và cấp vai trò.">
                <Link to="/admin/users">
                  <Button size="xs" variant="glass" icon={<Users className="size-3.5 text-brass-400" />}>
                    Quản lý tài khoản
                  </Button>
                </Link>
              </Tip>
              <Tip text="Xem lịch sử đăng nhập đáng ngờ và chặn địa chỉ IP.">
                <Link to="/admin/security">
                  <Button size="xs" variant="glass" icon={<Lock className="size-3.5 text-brass-400" />}>
                    Bảo mật &amp; Chặn IP
                  </Button>
                </Link>
              </Tip>
              <Tip text="Tra cứu nhật ký ghi lại mọi thao tác thay đổi dữ liệu; không sửa hay xóa được.">
                <Link to="/admin/audit">
                  <Button size="xs" variant="glass" icon={<ScrollText className="size-3.5 text-brass-400" />}>
                    Nhật ký kiểm toán
                  </Button>
                </Link>
              </Tip>
              <Tip text="Xem tình trạng các dịch vụ nền, hàng đợi thông báo và các tác vụ định kỳ.">
                <Link to="/admin/health">
                  <Button size="xs" variant="glass" icon={<Activity className="size-3.5 text-brass-400" />}>
                    Sức khỏe hệ thống
                  </Button>
                </Link>
              </Tip>
            </div>
          </div>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
          <div className="space-y-1.5">
            <p className="flex items-center text-xs font-bold uppercase tracking-wider text-steel-500">
              Khoảng thời gian
              <HelpTip text={'Chọn khoảng thời gian để xem số lượt đăng nhập, lượt thất bại, tái sử dụng token và biểu đồ lưu lượng.\nTất cả giờ và ngày tính theo giờ Việt Nam.'} />
            </p>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Khoảng thời gian">
              {SEC_RANGES.map((r) => (
                <Tip key={r.key} text={r.help}>
                  <Button size="xs" variant={range === r.key ? 'dark' : 'outline'} aria-pressed={range === r.key} onClick={() => setRange(r.key)}>
                    {r.label}
                  </Button>
                </Tip>
              ))}
            </div>
          </div>
          {range === 'custom' && (
            <>
              <Field label={<Titled label="Từ ngày" help="Ngày đầu tiên của khoảng cần xem (tính cả ngày này)." />}>
                <Input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} />
              </Field>
              <Field label={<Titled label="Đến ngày" help="Ngày cuối cùng của khoảng cần xem (tính cả ngày này). Không chọn quá hôm nay." />}>
                <Input type="date" value={to} min={from} max={today} onChange={(e) => e.target.value && setTo(e.target.value)} />
              </Field>
            </>
          )}
          {live && (
            <p className="ml-auto text-xs text-steel-600">
              Đang xem: <b className="text-ink-950">{live.period.label}</b>
              {live.period.bucket === 'hour' ? ' · theo giờ' : ' · theo ngày'}
            </p>
          )}
        </div>
        {q.error && <p role="alert" className="mt-2 text-xs font-medium text-bad-600">{(q.error as Error).message}</p>}
      </Card>

      <Async q={q}>
        {(raw) => {
          const d = readSecurity(raw);
          const totalUsers = (d.usersByRole ?? []).reduce((a: number, r: any) => a + Number(r.count || 0), 0);
          const spanDays = Math.max(1, Math.round((new Date(d.period.to).getTime() - new Date(d.period.from).getTime()) / 86400000));
          // the usual ceiling is 20 failed sign-ins a day, so a longer period is allowed proportionally more
          const failedLimit = 20 * spanDays;
          const failedHigh = d.logins.failed > failedLimit;
          return (
            <div className="space-y-6">
              {(d.tokenReuse7d > 0 || d.lockedAccounts > 0) && (
                <Alert
                  tone="warn"
                  title="Cảnh báo bảo mật cần chú ý"
                  action={
                    <Link to="/admin/security">
                      <Button size="sm" variant="dark">
                        Kiểm tra ngay
                      </Button>
                    </Link>
                  }
                >
                  {d.tokenReuse7d > 0 && `${d.tokenReuse7d} lần tái sử dụng refresh token trong 7 ngày qua. `}
                  {d.lockedAccounts > 0 && `${d.lockedAccounts} tài khoản hiện đang bị khóa.`}
                </Alert>
              )}

              <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
                <SecurityMetric
                  label="Đăng nhập thành công"
                  help="Số lượt đăng nhập đúng mật khẩu (hoặc đúng mã xác thực) trong khoảng thời gian đã chọn. Tổng các cột xanh đậm của biểu đồ bên dưới bằng đúng số này."
                  value={String(d.logins.success)}
                  sub={d.period.label}
                  icon={<ShieldCheck className="size-4" />}
                  tone="ok"
                />
                <SecurityMetric
                  label="Đăng nhập thất bại"
                  help={`Số lượt đăng nhập bị từ chối (sai mật khẩu, tài khoản bị khóa, token bị tái sử dụng…) trong khoảng đã chọn. Vượt ${failedLimit} lượt (20 lượt mỗi ngày của khoảng) thì coi là lưu lượng bất thường. Tổng các cột đỏ của biểu đồ bằng đúng số này.`}
                  value={String(d.logins.failed)}
                  sub={failedHigh ? `Lưu lượng bất thường (ngưỡng ${failedLimit})` : `${d.period.label} · trong ngưỡng an toàn`}
                  icon={<ShieldAlert className="size-4" />}
                  tone={failedHigh ? 'bad' : undefined}
                />
                <SecurityMetric
                  label="Tài khoản bị khóa"
                  help="Số tài khoản đang bị khóa ngay lúc xem (khóa thủ công hoặc tự động do đăng nhập sai nhiều lần). Không phụ thuộc khoảng thời gian đã chọn."
                  value={String(d.lockedAccounts)}
                  sub={d.lockedAccounts ? 'Cần xem xét mở khóa / điều tra' : 'Không có tài khoản bị khóa'}
                  icon={<Lock className="size-4" />}
                  tone={d.lockedAccounts ? 'bad' : 'ok'}
                />
                <SecurityMetric
                  label="Tái sử dụng token"
                  help={'Số lần một refresh token đã dùng rồi bị mang ra dùng lại, dấu hiệu token bị đánh cắp. Hệ thống tự thu hồi cả phiên khi gặp trường hợp này.\nSố lớn đo trong khoảng đã chọn; cảnh báo ở đầu trang luôn dùng 7 ngày gần nhất.'}
                  value={String(d.tokenReuse)}
                  sub={`${d.period.label} · 7 ngày qua: ${d.tokenReuse7d}`}
                  icon={<KeyRound className="size-4" />}
                  tone={d.tokenReuse ? 'bad' : 'ok'}
                />
              </div>

              <div className="grid gap-6 lg:grid-cols-3">
                <Card className="lg:col-span-2">
                  <CardHead
                    title={<Titled label={d.period.bucket === 'hour' ? 'Lưu lượng xác thực theo giờ' : 'Lưu lượng xác thực theo ngày'} help={'Mỗi cột là một giờ hoặc một ngày (giờ Việt Nam): phần xanh đậm là đăng nhập thành công, phần đỏ là bị từ chối.\nGiờ hoặc ngày không có lượt nào vẫn hiện cột rỗng để thấy rõ quãng yên tĩnh.\nDi chuột vào cột để xem số chính xác; hộp số liệu giữ nguyên cho đến khi bạn rời chuột.'} />}
                    sub={`${d.period.label} · đối chiếu phiên đăng nhập hợp lệ và các lần từ chối truy cập`}
                  />
                  <div className="p-3">
                    <Chart
                      style={{ height: 255 }}
                      ariaLabel="Lưu lượng đăng nhập"
                      option={{
                        grid: { left: 36, right: 16, top: 30, bottom: 28 },
                        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
                        legend: { top: 0 },
                        xAxis: { type: 'category', data: d.series.map((h: any) => h.label) },
                        yAxis: { type: 'value', minInterval: 1 },
                        series: [
                          {
                            name: 'Thành công',
                            type: 'bar',
                            stack: 'a',
                            data: d.series.map((h: any) => h.ok),
                            itemStyle: { color: '#0e1b2c' },
                            barMaxWidth: 20,
                          },
                          {
                            name: 'Thất bại',
                            type: 'bar',
                            stack: 'a',
                            data: d.series.map((h: any) => h.fail),
                            itemStyle: { color: '#b3362b', borderRadius: [3, 3, 0, 0] },
                            barMaxWidth: 20,
                          },
                        ],
                      }}
                    />
                  </div>
                </Card>

                <Card>
                  <CardHead
                    title={<Titled label="Cơ cấu tài khoản theo vai trò" help="Số phân quyền đang có hiệu lực của từng vai trò. Một người có thể giữ nhiều vai trò nên tổng có thể lớn hơn số người. Không phụ thuộc khoảng thời gian đã chọn." />}
                    sub={`Tổng cộng ${totalUsers} phân quyền đã cấp`}
                    action={
                      <Tip text="Mở danh sách tài khoản để xem và chỉnh vai trò.">
                        <Link to="/admin/users" className="text-xs font-bold text-info-600 hover:underline">
                          Danh sách
                        </Link>
                      </Tip>
                    }
                  />
                  <ul className="space-y-3.5 p-5 text-sm">
                    {d.usersByRole.map((r: any) => {
                      const share = totalUsers ? (Number(r.count) / totalUsers) * 100 : 0;
                      return (
                        <li key={r.role} className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-ink-900">{ROLE_L[r.role] ?? r.role}</span>
                            <b className="font-extrabold text-ink-950 num">{r.count}</b>
                          </div>
                          <Progress value={share} tone="brass" />
                        </li>
                      );
                    })}
                  </ul>
                </Card>
              </div>
            </div>
          );
        }}
      </Async>
    </div>
  );
}

/* ───────────── users ───────────── */
const US: Record<string, [any, string]> = {
  ACTIVE: ['ok', 'Hoạt động'],
  INVITED: ['info', 'Chờ kích hoạt'],
  LOCKED: ['bad', 'Bị khóa'],
  DISABLED: ['neutral', 'Vô hiệu'],
  PENDING_VERIFICATION: ['warn', 'Chờ xác minh'],
};

export function UsersPage({ limited }: { limited?: boolean } = {}) {
  const assignable = limited ? FAC_ROLES : INTERNAL;
  const [sp, setSp] = useSearchParams();
  const group = (['internal', 'customers', 'all'].includes(sp.get('group') ?? '') ? sp.get('group') : 'internal') as
    | 'internal'
    | 'customers'
    | 'all';
  const setGroup = (g: string) => {
    setSp(
      (p) => {
        const n = new URLSearchParams(p);
        g === 'internal' ? n.delete('group') : n.set('group', g);
        return n;
      },
      { replace: true },
    );
    setRole('');
  };
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [qs, setQs] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const groupRoles = group === 'internal' ? INTERNAL.join(',') : group === 'customers' ? 'CUSTOMER' : undefined;
  const fac = useGet<any[]>('/facilities');
  const inv = ['/admin/users'];

  return (
    <div className="space-y-6">
      <AdminHero
        eyebrow="Identity & Access Management"
        title="Quản lý tài khoản & Nhân sự"
        sub="Quản trị hồ sơ định danh nhân sự nội bộ, khách thuê kho, phân công cơ sở và kiểm soát trạng thái truy cập."
        icon={<Users className="size-5" />}
        actions={
          <ActBtn
            label="Mời nhân sự"
            variant="primary"
            size="md"
            icon={<Plus className="size-4" />}
            title="Mời tài khoản nội bộ"
            description="Người được mời nhận email để đặt mật khẩu hoặc liên kết Google."
            fields={[
              { name: 'email', label: 'Email', type: 'email', required: true },
              { name: 'fullName', label: 'Họ tên', required: true, maxLength: 150 },
              { name: 'phone', label: 'Điện thoại', maxLength: 20 },
              {
                name: 'role',
                label: 'Vai trò',
                type: 'select',
                required: true,
                options: assignable.map((r) => ({ value: r, label: ROLE_L[r] })),
              },
              {
                name: 'facilityId',
                label: 'Cơ sở',
                type: 'select',
                show: (v) => FAC_ROLES.includes(v.role),
                required: true,
                options: (fac.data ?? []).map((f) => ({ value: f.id, label: f.name })),
              },
            ]}
            run={(v) =>
              post('/admin/users', {
                email: v.email,
                fullName: v.fullName,
                phone: v.phone || undefined,
                roles: [{ role: v.role, facilityId: FAC_ROLES.includes(v.role) ? v.facilityId : undefined }],
              })
            }
            ok="Đã gửi lời mời"
            invalidate={inv}
          />
        }
      />

      <Card className="overflow-hidden">
        <PagedTable
          path="/admin/users"
          query={{ role: role || groupRoles, status: status || undefined, q: qs || undefined }}
          rowKey={(u: any) => u.id}
          onRow={(u: any) => setOpen(u.id)}
          toolbar={
            <FilterBar>
              <div className="overflow-x-auto">
                <Tabs
                  value={group}
                  onChange={setGroup}
                  tabs={[
                    { value: 'internal', label: 'Nhân sự nội bộ' },
                    { value: 'customers', label: 'Khách hàng' },
                    { value: 'all', label: 'Tất cả' },
                  ]}
                />
              </div>
              <div className="relative w-60">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-steel-400" />
                <Input
                  aria-label="Tìm kiếm"
                  className="w-60 pl-9"
                  placeholder="Tìm email, tên, SĐT…"
                  value={qs}
                  onChange={(e) => setQs(e.target.value)}
                />
              </div>
              <Select
                aria-label="Vai trò"
                className="w-48"
                value={role}
                onChange={(e) => setRole(e.target.value)}
              >
                <option value="">{group === 'internal' ? 'Mọi vai trò nội bộ' : 'Mọi vai trò'}</option>
                {Object.entries(ROLE_L)
                  .filter(([k]) => group === 'all' || (group === 'internal') === INTERNAL.includes(k))
                  .map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
              </Select>
              <Select
                aria-label="Trạng thái"
                className="w-44"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="">Mọi trạng thái</option>
                {Object.entries(US).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v[1]}
                  </option>
                ))}
              </Select>
            </FilterBar>
          }
          cols={[
            {
              key: 'n',
              header: 'Tài khoản',
              cell: (u: any) => (
                <div className="flex items-center gap-3">
                  <Avatar name={u.full_name} size={34} />
                  <div className="min-w-0">
                    <b className="block truncate text-ink-950">{u.full_name}</b>
                    <span className="block truncate text-xs text-steel-500">{u.email}</span>
                  </div>
                </div>
              ),
            },
            {
              key: 'r',
              header: 'Vai trò & Cơ sở',
              hideBelow: 'sm',
              cell: (u: any) =>
                u.roles?.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {u.roles.map((r: any, idx: number) => (
                      <Badge key={r.id ?? idx} tone={INTERNAL.includes(r.role.code) ? 'brass' : 'neutral'}>
                        {ROLE_L[r.role.code] ?? r.role.code}
                        {r.facility ? ` · ${r.facility.code ?? r.facility.name}` : ''}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <Badge tone="neutral">Khách hàng</Badge>
                ),
            },
            {
              key: 'l',
              header: 'Đăng nhập cuối',
              hideBelow: 'md',
              cell: (u: any) =>
                u.last_login_at ? (
                  <span className="whitespace-nowrap text-xs text-steel-600">{fmtDateTime(u.last_login_at)}</span>
                ) : (
                  <span className="text-steel-400">—</span>
                ),
            },
            {
              key: 's',
              header: 'Trạng thái',
              cell: (u: any) => (
                <Badge tone={US[u.status]?.[0]} dot>
                  {US[u.status]?.[1] ?? u.status}
                </Badge>
              ),
            },
          ]}
        />
      </Card>
      <UserDrawer id={open} onClose={() => setOpen(null)} facilities={fac.data ?? []} limited={limited} />
    </div>
  );
}

function UserDrawer({
  id,
  onClose,
  facilities,
  limited,
}: {
  id: string | null;
  onClose: () => void;
  facilities: any[];
  limited?: boolean;
}) {
  const assignable = limited ? FAC_ROLES : INTERNAL;
  const q = useGet<any>(id ? `/admin/users/${id}` : null, undefined, { staleTime: 0 });
  const inv = ['/admin/users'];
  const u = q.data;
  const R = REASON;

  return (
    <Drawer open={!!id} onClose={onClose} title={u?.full_name ?? 'Hồ sơ tài khoản'} width={620}>
      {u && (
        <div className="space-y-5">
          <div className="grain rounded-2xl border border-ink-800 bg-ink-950 p-4 text-white">
            <div className="flex items-center gap-3.5">
              <Avatar name={u.full_name} size={46} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-extrabold text-white">{u.full_name}</p>
                <p className="truncate text-xs text-steel-300">
                  {u.email}
                  {u.phone ? ` · ${u.phone}` : ''}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge tone={US[u.status]?.[0]} dot>
                    {US[u.status]?.[1] ?? u.status}
                  </Badge>
                  {u.oauth?.map((o: any) => (
                    <Badge key={o.provider} tone="info">
                      {o.provider}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {u.status === 'LOCKED' ? (
              <ActBtn
                label="Mở khóa"
                variant="primary"
                title="Mở khóa"
                fields={[R]}
                run={(v) => post(`/admin/users/${u.id}/unlock`, v)}
                ok="Đã mở khóa"
                invalidate={inv}
              />
            ) : (
              u.status === 'ACTIVE' && (
                <ActBtn
                  label="Khóa"
                  title="Khóa tài khoản"
                  fields={[R]}
                  run={(v) => post(`/admin/users/${u.id}/lock`, v)}
                  ok="Đã khóa"
                  invalidate={inv}
                />
              )
            )}
            {u.status === 'DISABLED' ? (
              <ActBtn
                label="Kích hoạt lại"
                title="Kích hoạt lại"
                fields={[R]}
                run={(v) => post(`/admin/users/${u.id}/enable`, v)}
                ok="Đã kích hoạt"
                invalidate={inv}
              />
            ) : (
              <ActBtn
                label="Vô hiệu hóa"
                danger
                title="Vô hiệu hóa tài khoản"
                description="Mọi phiên đăng nhập sẽ bị thu hồi ngay."
                fields={[R]}
                run={(v) => post(`/admin/users/${u.id}/disable`, v)}
                ok="Đã vô hiệu hóa"
                invalidate={inv}
              />
            )}
            <ActBtn
              label="Gửi email đặt lại mật khẩu"
              run={() => post(`/admin/users/${u.id}/reset-password`, {})}
              ok="Đã gửi email"
            />
            {!limited && (
              <ActBtn
                label="Thu hồi mọi phiên"
                title="Thu hồi phiên"
                description="Người dùng sẽ bị đăng xuất khỏi mọi thiết bị."
                run={() => del(`/admin/users/${u.id}/sessions`)}
                ok="Đã thu hồi"
                invalidate={inv}
              />
            )}
          </div>

          <Card>
            <CardHead
              title="Phân quyền vai trò"
              action={
                u.roles && (
                  <ActBtn
                    label="Gán vai trò"
                    size="xs"
                    variant="primary"
                    icon={<Plus className="size-3" />}
                    title="Gán vai trò"
                    fields={[
                      {
                        name: 'role',
                        label: 'Vai trò',
                        type: 'select',
                        required: true,
                        options: assignable.map((r) => ({ value: r, label: ROLE_L[r] })),
                      },
                      {
                        name: 'facilityId',
                        label: 'Cơ sở',
                        type: 'select',
                        required: true,
                        show: (v) => FAC_ROLES.includes(v.role),
                        options: facilities.map((f) => ({ value: f.id, label: f.name })),
                      },
                      R,
                    ]}
                    run={(v) =>
                      post(`/admin/users/${u.id}/roles`, {
                        role: v.role,
                        facilityId: FAC_ROLES.includes(v.role) ? v.facilityId : undefined,
                        reason: v.reason,
                      })
                    }
                    ok="Đã gán"
                    invalidate={inv}
                  />
                )
              }
            />
            <ul className="divide-y hairline">
              {u.roles.length === 0 && (
                <li className="p-4 text-sm text-steel-500">Không có vai trò nội bộ.</li>
              )}
              {u.roles.map((r: any) => (
                <li key={r.id} className="flex items-center justify-between gap-2 px-5 py-3 text-sm">
                  <span className="flex flex-wrap items-center gap-2">
                    <b className="text-ink-950">{ROLE_L[r.role.code] ?? r.role.code}</b>
                    {r.facility && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-paper px-2.5 py-0.5 text-xs font-medium text-steel-600">
                        <Building2 className="size-3 text-brass-600" />
                        {r.facility.name}
                      </span>
                    )}
                  </span>
                  <ActBtn
                    label="Gỡ"
                    size="xs"
                    danger
                    title="Gỡ vai trò"
                    description={`Người dùng sẽ bị đăng xuất để áp dụng quyền mới.${u.roles.length <= 1 ? ' Đây là vai trò cuối cùng nên tài khoản sẽ trở về vai trò Khách hàng.' : ''}`}
                    fields={[R]}
                    run={(v) => del(`/admin/users/${u.id}/roles/${r.id}?reason=${encodeURIComponent(v.reason)}`)}
                    ok="Đã gỡ"
                    invalidate={inv}
                  />
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHead title={`Phiên đang hoạt động (${u.sessions.length})`} />
            <ul className="divide-y hairline">
              {u.sessions.length === 0 && <li className="p-4 text-sm text-steel-500">Không có phiên hoạt động.</li>}
              {u.sessions.map((s: any) => (
                <li key={s.id} className="flex items-center gap-3 px-5 py-2.5 text-xs text-steel-600">
                  <Laptop className="size-4 shrink-0 text-steel-400" />
                  <span className="min-w-0 flex-1 truncate">
                    {s.device_label ?? s.user_agent?.slice(0, 60)} ·{' '}
                    <span className="code rounded bg-paper px-1.5 py-0.5 text-ink-900">{s.ip_address ?? '—'}</span>
                    {s.country ? ` (${s.country})` : ''} · {fmtDateTime(s.last_seen_at)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHead title="Đăng nhập gần đây" />
            <ul className="divide-y hairline">
              {u.loginHistory.map((l: any) => (
                <li key={l.id} className="flex items-center justify-between gap-2 px-5 py-2.5 text-xs">
                  <span>
                    {fmtDateTime(l.created_at)} ·{' '}
                    <span className="code rounded bg-paper px-1.5 py-0.5 text-ink-900">{l.ip_address ?? '—'}</span>
                    {l.country ? ` (${l.country})` : ''}
                  </span>
                  <Badge tone={l.success ? 'ok' : 'bad'} dot>
                    {l.success ? 'Thành công' : l.failure_reason ?? 'Thất bại'}
                  </Badge>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </Drawer>
  );
}

/* ───────────── roles & permissions ───────────── */
const PERM_ROLES = ['CUSTOMER', 'FACILITY_STAFF', 'FACILITY_MANAGER', 'BUSINESS_OPS_MANAGER', 'SYSTEM_ADMIN'] as const;
type PermScope = '' | 'OWN' | 'FACILITY' | 'GLOBAL';
type RoleGrantDraft = Record<string, { scope: PermScope; readOnly: boolean }>;

function buildGrantDraft(perm?: any): RoleGrantDraft {
  const out: RoleGrantDraft = {};
  for (const r of PERM_ROLES) {
    const g = perm?.grants?.[r];
    if (g?.scope) {
      out[r] = { scope: g.scope as PermScope, readOnly: !!g.readOnly };
    } else if (perm?.byRole?.[r] && perm.byRole[r] !== '—') {
      const raw = String(perm.byRole[r]);
      const scope = (raw.split(' ')[0] as PermScope) || '';
      out[r] = { scope, readOnly: raw.includes('(read)') };
    } else {
      out[r] = { scope: perm ? '' : r === 'SYSTEM_ADMIN' ? 'GLOBAL' : '', readOnly: false };
    }
  }
  return out;
}

function PermissionModal({
  open,
  perm,
  modules,
  onClose,
}: {
  open: boolean;
  perm: any | null;
  modules: string[];
  onClose: () => void;
}) {
  const isEdit = !!perm;
  const [code, setCode] = useState('');
  const [moduleName, setModuleName] = useState('');
  const [description, setDescription] = useState('');
  const [reason, setReason] = useState('');
  const [grants, setGrants] = useState<RoleGrantDraft>(() => buildGrantDraft(null));

  useEffect(() => {
    if (!open) return;
    setCode(perm?.code ?? '');
    setModuleName(perm?.module ?? '');
    setDescription(perm?.description ?? '');
    setReason('');
    setGrants(buildGrantDraft(perm));
  }, [open, perm]);

  const save = useAct(
    async () => {
      const grantsPayload = Object.fromEntries(
        PERM_ROLES.map((r) => {
          const g = grants[r];
          return [r, g?.scope ? { scope: g.scope, readOnly: !!g.readOnly } : null];
        }),
      );
      if (isEdit) {
        return put(`/admin/permissions/${encodeURIComponent(perm.code)}`, {
          module: moduleName.trim().toLowerCase(),
          description: description.trim(),
          grants: grantsPayload,
          reason: reason.trim() || undefined,
        });
      }
      return post('/admin/permissions', {
        code: code.trim().toLowerCase(),
        module: moduleName.trim().toLowerCase(),
        description: description.trim(),
        grants: grantsPayload,
      });
    },
    {
      ok: isEdit ? 'Đã cập nhật phân bổ quyền hạn' : 'Đã thêm loại quyền mới',
      invalidate: ['/admin/permissions', '/admin/roles', '/admin/audit-logs'],
      onSuccess: () => {
        useAuth.getState().reload().catch(() => undefined);
        onClose();
      },
    },
  );

  const canSubmit =
    moduleName.trim().length >= 2 &&
    description.trim().length >= 2 &&
    (isEdit || code.trim().length >= 3);

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={isEdit ? `Phân bổ quyền: ${perm.code}` : 'Thêm loại quyền mới'}
      description={
        isEdit
          ? 'Điều chỉnh mô tả và phạm vi dữ liệu (OWN / FACILITY / GLOBAL / Chỉ xem) cho từng vai trò. Thay đổi có hiệu lực ngay mà không cần can thiệp cơ sở dữ liệu.'
          : 'Định nghĩa mã quyền mới cho tính năng mở rộng và phân bổ phạm vi truy cập cho từng vai trò.'
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Hủy
          </Button>
          <Button
            variant="primary"
            loading={save.isPending}
            disabled={!canSubmit}
            onClick={() => save.mutate(undefined)}
          >
            {isEdit ? 'Lưu phân bổ quyền' : 'Tạo loại quyền'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Field
            label="Mã quyền (Permission Code)"
            required
            hint={isEdit ? 'Mã định danh quyền cố định' : 'Chữ thường, số, dấu chấm/gạch dưới (vd: iot.sensor.manage)'}
          >
            <Input
              value={code}
              disabled={isEdit}
              onChange={(e) => setCode(e.target.value)}
              placeholder="vd: iot.sensor.manage"
              className="code"
              maxLength={64}
            />
          </Field>
          <Field
            label="Phân hệ (Module)"
            required
            hint="Chọn phân hệ sẵn có hoặc nhập phân hệ mới (vd: billing, ops, iot)"
          >
            <div>
              <Input
                list="vaultra-perm-modules"
                value={moduleName}
                onChange={(e) => setModuleName(e.target.value)}
                placeholder="vd: ops"
                maxLength={40}
              />
              <datalist id="vaultra-perm-modules">
                {modules.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </div>
          </Field>
        </div>

        <Field label="Mô tả chức năng" required>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Mô tả rõ hành động mà mã quyền này cho phép thực hiện…"
            className="min-h-[68px]"
            maxLength={255}
          />
        </Field>

        <div>
          <p className="mb-2 text-[13px] font-semibold text-ink-900">
            Phân bổ phạm vi dữ liệu theo từng vai trò
          </p>
          <div className="overflow-hidden rounded-xl border hairline">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b hairline bg-[#faf8f4] text-[11px] font-bold uppercase tracking-wider text-steel-500">
                  <th className="px-3.5 py-2.5">Vai trò</th>
                  <th className="px-3.5 py-2.5">Phạm vi cấp phát (Scope)</th>
                  <th className="px-3.5 py-2.5">Chế độ chỉ đọc</th>
                </tr>
              </thead>
              <tbody className="divide-y hairline bg-white">
                {PERM_ROLES.map((r) => {
                  const g = grants[r] ?? { scope: '', readOnly: false };
                  const lockAdminCritical =
                    isEdit &&
                    r === 'SYSTEM_ADMIN' &&
                    (perm?.code === 'role.assign' || perm?.code === 'user.manage');
                  return (
                    <tr key={r} className="hover:bg-[#faf8f4]/60">
                      <td className="px-3.5 py-2.5">
                        <b className="block text-[13px] text-ink-950">{ROLE_L[r]}</b>
                        <span className="code text-[11px] text-steel-400">{r}</span>
                      </td>
                      <td className="px-3.5 py-2.5">
                        <Select
                          aria-label={`Phạm vi cho ${ROLE_L[r]}`}
                          value={g.scope}
                          disabled={lockAdminCritical}
                          onChange={(e) => {
                            const nextScope = e.target.value as PermScope;
                            setGrants((prev) => ({
                              ...prev,
                              [r]: {
                                scope: nextScope,
                                readOnly: nextScope ? prev[r]?.readOnly ?? false : false,
                              },
                            }));
                          }}
                          className="h-9 text-xs font-semibold"
                        >
                          <option value="">— Không cấp quyền —</option>
                          <option value="OWN">OWN · Dữ liệu cá nhân</option>
                          <option value="FACILITY">FACILITY · Trong cơ sở phụ trách</option>
                          <option value="GLOBAL">GLOBAL · Toàn hệ thống</option>
                        </Select>
                      </td>
                      <td className="px-3.5 py-2.5">
                        <Checkbox
                          checked={!!g.scope && g.readOnly}
                          disabled={!g.scope || lockAdminCritical}
                          onChange={(v) =>
                            setGrants((prev) => ({
                              ...prev,
                              [r]: { ...prev[r], readOnly: v },
                            }))
                          }
                          label={<span className="text-xs text-ink-800">Chỉ xem (read)</span>}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {isEdit && (perm?.code === 'role.assign' || perm?.code === 'user.manage') && (
            <p className="mt-1.5 text-xs text-warn-600">
              Quyền quản trị cốt lõi ({perm.code}) luôn được giữ ở mức GLOBAL đầy đủ cho Quản trị hệ thống để tránh tự khóa quyền quản trị.
            </p>
          )}
        </div>

        {isEdit && (
          <Field label="Ghi chú kiểm toán (tùy chọn)">
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Lý do điều chỉnh phân quyền (lưu vào Nhật ký kiểm toán)…"
              maxLength={255}
            />
          </Field>
        )}
      </div>
    </Modal>
  );
}

export function RolesPage() {
  const q = useGet<any[]>('/admin/permissions');
  const isAdmin = useAuth((s) => s.hasRole('SYSTEM_ADMIN'));
  const [mod, setMod] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPerm, setEditingPerm] = useState<any | null>(null);
  const roles = PERM_ROLES;
  const mods = [...new Set((q.data ?? []).map((p) => p.module).filter(Boolean))];
  const rows = (q.data ?? []).filter((p) => !mod || p.module === mod);

  return (
    <div className="space-y-6">
      <AdminHero
        eyebrow="RBAC Permission Matrix"
        title="Vai trò &amp; Ma trận phân quyền"
        sub="Ma trận quyền hạn × phạm vi dữ liệu (OWN / FACILITY / GLOBAL). Quản trị viên có thể thêm loại quyền cho tính năng mới và phân bổ lại quyền hạn cho từng vai trò trực tiếp trên giao diện."
        icon={<KeyRound className="size-5" />}
        actions={
          <>
            <Select
              aria-label="Module"
              className="w-48 border-white/20 bg-white text-ink-900"
              value={mod}
              onChange={(e) => setMod(e.target.value)}
            >
              <option value="">Mọi phân hệ ({mods.length})</option>
              {mods.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
            {isAdmin && (
              <Button
                variant="primary"
                icon={<Plus className="size-4" />}
                onClick={() => {
                  setEditingPerm(null);
                  setModalOpen(true);
                }}
              >
                Thêm loại quyền
              </Button>
            )}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-3 rounded-xl border hairline bg-white px-4 py-3 text-xs shadow-2xs">
        <span className="font-bold uppercase tracking-wider text-steel-500">Chú giải phạm vi:</span>
        <span className="inline-flex items-center gap-1.5">
          <Badge tone="info">GLOBAL</Badge>
          <span className="text-steel-600">Toàn hệ thống Vaultra</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Badge tone="warn">FACILITY</Badge>
          <span className="text-steel-600">Giới hạn trong cơ sở phụ trách</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Badge tone="neutral">OWN</Badge>
          <span className="text-steel-600">Chỉ dữ liệu cá nhân của tài khoản</span>
        </span>
        <span className="inline-flex items-center gap-1.5 text-steel-500">
          · Hậu tố <code className="rounded bg-paper px-1 py-0.5 font-mono text-[11px] text-ink-900">(read)</code> = Chỉ xem, không được ghi/sửa
        </span>
      </div>

      <Card className="overflow-hidden">
        <CardHead
          title="Bảng đặc tả quyền truy cập"
          sub={`Hiển thị ${rows.length} mã quyền hạn${mod ? ` thuộc phân hệ ${mod}` : ''}`}
        />
        <DataTable
          rows={rows}
          loading={q.isLoading}
          error={q.error}
          onRetry={q.refetch}
          rowKey={(p: any) => p.code}
          dense
          cols={[
            {
              key: 'c',
              header: 'Mã quyền & Mô tả',
              cell: (p: any) => (
                <div className="py-0.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="code rounded border hairline bg-paper px-2 py-0.5 text-xs font-bold text-ink-950">
                      {p.code}
                    </span>
                    {p.module && (
                      <span className="text-[10.5px] font-bold uppercase tracking-wider text-brass-700">
                        {p.module}
                      </span>
                    )}
                    {p.isCustom && <Badge tone="purple">Tùy chỉnh</Badge>}
                  </div>
                  <span className="mt-0.5 block text-xs text-steel-500">{p.description}</span>
                </div>
              ),
            },
            ...roles.map((r) => ({
              key: r,
              header: ROLE_L[r],
              cell: (p: any) => {
                const val = p.byRole?.[r];
                return val && val !== '—' ? (
                  <Badge
                    tone={
                      String(val).startsWith('GLOBAL')
                        ? 'info'
                        : String(val).startsWith('FACILITY')
                          ? 'warn'
                          : 'neutral'
                    }
                  >
                    {val}
                  </Badge>
                ) : (
                  <span className="text-steel-300">—</span>
                );
              },
            })),
            ...(isAdmin
              ? [
                  {
                    key: 'act',
                    header: 'Thao tác',
                    className: 'text-right',
                    cell: (p: any) => (
                      <div className="inline-flex items-center justify-end gap-1.5">
                        <Button
                          size="xs"
                          variant="outline"
                          icon={<Pencil className="size-3" />}
                          onClick={() => {
                            setEditingPerm(p);
                            setModalOpen(true);
                          }}
                        >
                          Sửa
                        </Button>
                        {p.isCustom && (
                          <ActBtn
                            label="Xóa"
                            size="xs"
                            danger
                            icon={<Trash2 className="size-3" />}
                            title={`Xóa quyền ${p.code}`}
                            description="Quyền tùy chỉnh này và toàn bộ phân bổ vai trò của nó sẽ bị gỡ khỏi hệ thống."
                            fields={[REASON]}
                            run={(v) =>
                              del(`/admin/permissions/${encodeURIComponent(p.code)}`, { reason: v.reason })
                            }
                            ok="Đã xóa loại quyền"
                            invalidate={['/admin/permissions', '/admin/roles', '/admin/audit-logs']}
                          />
                        )}
                      </div>
                    ),
                  },
                ]
              : []),
          ]}
        />
      </Card>

      <PermissionModal
        open={modalOpen}
        perm={editingPerm}
        modules={mods}
        onClose={() => {
          setModalOpen(false);
          setEditingPerm(null);
        }}
      />
    </div>
  );
}

/* ───────────── security: login history + IP blocks ───────────── */
const LOGIN_METHOD: Record<string, string> = {
  PASSWORD: 'Mật khẩu',
  GOOGLE: 'Google',
  REFRESH: 'Làm mới phiên',
  OTP: 'Mã OTP',
};
const FAIL_L: Record<string, string> = {
  BAD_PASSWORD: 'Sai mật khẩu',
  INVALID_CREDENTIALS: 'Sai email hoặc mật khẩu',
  ACCOUNT_LOCKED: 'Tài khoản đang bị khóa',
  ACCOUNT_DISABLED: 'Tài khoản bị vô hiệu',
  EMAIL_NOT_VERIFIED: 'Chưa xác minh email',
  IP_BLOCKED: 'IP bị chặn',
  RATE_LIMITED: 'Vượt giới hạn thử',
  NO_PASSWORD: 'Tài khoản chưa có mật khẩu',
};

export function SecurityPage() {
  const [tab, setTab] = useState('logins');
  const [ok, setOk] = useState('');
  const [email, setEmail] = useState('');
  const ips = useGet<any[]>('/admin/ip-blocks');
  const inv = ['/admin/ip-blocks'];

  return (
    <div className="space-y-6">
      <AdminHero
        eyebrow="Threat & Access Control"
        title="Bảo mật đăng nhập &amp; Chặn IP"
        sub="Theo dõi toàn bộ lịch sử xác thực trên hệ thống và chủ động cô lập các dải IP / CIDR có dấu hiệu tấn công vét cạn."
        icon={<Lock className="size-5" />}
        actions={
          tab === 'ips' ? (
            <ActBtn
              label="Chặn IP / CIDR"
              variant="primary"
              size="md"
              icon={<ShieldAlert className="size-4" />}
              title="Chặn IP / CIDR"
              fields={[
                { name: 'cidr', label: 'IP hoặc CIDR', required: true, placeholder: '203.0.113.0/24' },
                { name: 'reason', label: 'Lý do', maxLength: 255 },
                { name: 'expiresAt', label: 'Hết hạn (tùy chọn)', type: 'datetime' },
              ]}
              run={(v) =>
                post('/admin/ip-blocks', {
                  cidr: v.cidr,
                  reason: v.reason || undefined,
                  expiresAt: v.expiresAt ? new Date(v.expiresAt).toISOString() : undefined,
                })
              }
              ok="Đã chặn"
              invalidate={inv}
            />
          ) : undefined
        }
      />

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'logins', label: 'Lịch sử đăng nhập' },
          { value: 'ips', label: 'Danh sách IP bị chặn', count: ips.data?.length },
        ]}
      />

      {tab === 'logins' ? (
        <Card className="overflow-hidden">
          <PagedTable
            path="/admin/login-history"
            query={{ success: ok || undefined, email: email || undefined }}
            rowKey={(l: any) => l.id}
            toolbar={
              <FilterBar>
                <div className="relative w-64">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-steel-400" />
                  <Input
                    aria-label="Email"
                    className="w-64 pl-9"
                    placeholder="Lọc theo địa chỉ email…"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <Select aria-label="Kết quả" className="w-44" value={ok} onChange={(e) => setOk(e.target.value)}>
                  <option value="">Mọi kết quả</option>
                  <option value="true">Thành công</option>
                  <option value="false">Thất bại</option>
                </Select>
              </FilterBar>
            }
            cols={[
              {
                key: 't',
                header: 'Thời gian',
                cell: (l: any) => <span className="whitespace-nowrap text-xs">{fmtDateTime(l.created_at)}</span>,
              },
              {
                key: 'e',
                header: 'Tài khoản Email',
                cell: (l: any) => <b className="text-ink-950">{l.user?.email ?? l.email_attempted}</b>,
              },
              {
                key: 'i',
                header: 'Địa chỉ IP',
                cell: (l: any) => (
                  <span className="code rounded bg-paper px-2 py-0.5 text-xs text-ink-900">
                    {l.ip_address ?? '—'}
                    {l.country ? ` (${l.country})` : ''}
                  </span>
                ),
              },
              {
                key: 'm',
                header: 'Phương thức',
                hideBelow: 'md',
                cell: (l: any) => <Badge tone="neutral">{LOGIN_METHOD[l.method] ?? l.method}</Badge>,
              },
              {
                key: 'r',
                header: 'Kết quả',
                cell: (l: any) => (
                  <Badge tone={l.success ? 'ok' : 'bad'} dot>
                    {l.success
                      ? 'Thành công'
                      : FAIL_L[l.failure_reason] ?? (l.failure_reason ? enumLabel(l.failure_reason) : 'Thất bại')}
                  </Badge>
                ),
              },
              {
                key: 'x',
                header: '',
                hideBelow: 'sm',
                cell: (l: any) =>
                  !l.success && l.ip_address ? (
                    <ActBtn
                      label="Chặn IP"
                      size="xs"
                      danger
                      title={`Chặn ${l.ip_address}`}
                      description="Mọi đăng nhập từ địa chỉ này sẽ bị từ chối cho đến khi bạn gỡ chặn ở tab IP bị chặn."
                      fields={[
                        { name: 'reason', label: 'Lý do', maxLength: 255, def: 'Đăng nhập thất bại liên tiếp' },
                        { name: 'expiresAt', label: 'Hết hạn (tùy chọn)', type: 'datetime' },
                      ]}
                      run={(v) =>
                        post('/admin/ip-blocks', {
                          cidr: l.ip_address,
                          reason: v.reason || undefined,
                          expiresAt: v.expiresAt ? new Date(v.expiresAt).toISOString() : undefined,
                        })
                      }
                      ok="Đã chặn IP"
                      invalidate={['/admin/ip-blocks']}
                    />
                  ) : null,
              },
            ]}
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <CardHead
            title="Danh sách dải IP / CIDR đang bị cô lập"
            action={
              <ActBtn
                label="Thêm quy tắc chặn"
                size="xs"
                variant="primary"
                icon={<ShieldAlert className="size-3.5" />}
                title="Chặn IP / CIDR"
                fields={[
                  { name: 'cidr', label: 'IP hoặc CIDR', required: true, placeholder: '203.0.113.0/24' },
                  { name: 'reason', label: 'Lý do', maxLength: 255 },
                  { name: 'expiresAt', label: 'Hết hạn (tùy chọn)', type: 'datetime' },
                ]}
                run={(v) =>
                  post('/admin/ip-blocks', {
                    cidr: v.cidr,
                    reason: v.reason || undefined,
                    expiresAt: v.expiresAt ? new Date(v.expiresAt).toISOString() : undefined,
                  })
                }
                ok="Đã chặn"
                invalidate={inv}
              />
            }
          />
          <DataTable
            rows={ips.data}
            loading={ips.isLoading}
            error={ips.error}
            rowKey={(i: any) => String(i.id)}
            empty={<EmptyState title="Chưa chặn địa chỉ IP nào" hint="Các địa chỉ IP bị chặn thủ công hoặc từ nhật ký đăng nhập sẽ xuất hiện tại đây." />}
            cols={[
              {
                key: 'c',
                header: 'IP / CIDR',
                cell: (i: any) => (
                  <b className="code rounded border hairline bg-paper px-2 py-0.5 text-ink-950">{i.cidr}</b>
                ),
              },
              { key: 'r', header: 'Lý do', hideBelow: 'sm', cell: (i: any) => i.reason ?? '—' },
              {
                key: 'e',
                header: 'Hết hạn',
                hideBelow: 'md',
                cell: (i: any) =>
                  i.expires_at ? fmtDateTime(i.expires_at) : <Badge tone="bad">Vĩnh viễn</Badge>,
              },
              {
                key: 'x',
                header: '',
                cell: (i: any) => (
                  <ActBtn
                    label="Gỡ chặn"
                    size="xs"
                    run={() => del(`/admin/ip-blocks/${i.id}`)}
                    ok="Đã gỡ chặn"
                    invalidate={inv}
                  />
                ),
              },
            ]}
          />
        </Card>
      )}
    </div>
  );
}

/* ───────────── audit ───────────── */
const CAT_TONE: Record<string, any> = { SECURITY: 'bad', CONFIG: 'warn', BUSINESS: 'info', DATA: 'neutral' };
const AUDIT_CAT_L: Record<string, string> = {
  SECURITY: 'Bảo mật',
  CONFIG: 'Cấu hình',
  BUSINESS: 'Nghiệp vụ',
  DATA: 'Dữ liệu',
};
const cellText = (v: unknown) =>
  v === null || v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v);

/** Changed fields of one audit entry as "field · before → after" (falls back to raw JSON for non-object payloads). */
function AuditDiff({ before, after }: { before: any; after: any }) {
  const isObj = (x: any) => x && typeof x === 'object' && !Array.isArray(x);
  if (isObj(before) && isObj(after)) {
    const keys = Object.keys(after).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
    return keys.length ? (
      <div className="overflow-hidden rounded-xl border hairline">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="bg-paper text-left text-[11px] uppercase tracking-wider text-steel-500">
              <th className="px-3 py-2 font-bold">Trường dữ liệu</th>
              <th className="px-3 py-2 font-bold">Trước</th>
              <th className="px-3 py-2 font-bold">Sau</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k} className="border-t hairline bg-white">
                <td className="px-3 py-2 code text-xs font-semibold text-ink-900">{k}</td>
                <td className="max-w-[170px] break-words px-3 py-2 text-xs text-steel-500">
                  {cellText(before[k])}
                </td>
                <td className="max-w-[170px] break-words px-3 py-2 text-xs font-bold text-ink-950">
                  {cellText(after[k])}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <p className="text-steel-500">Không có trường nào thay đổi.</p>
    );
  }
  return (
    <div className="space-y-2.5">
      {[
        ['Trước', before],
        ['Sau', after],
      ]
        .filter(([, v]) => v !== null && v !== undefined)
        .map(([l, v]) => (
          <div key={l as string}>
            <p className="mb-1 text-xs font-bold uppercase text-steel-500">{l as string}</p>
            <pre className="max-h-48 overflow-auto rounded-xl border hairline bg-paper p-3 text-xs">
              {JSON.stringify(v, null, 2)}
            </pre>
          </div>
        ))}
    </div>
  );
}

export function AuditPage({ business }: { business?: boolean }) {
  const [cat, setCat] = useState('');
  const [action, setAction] = useState('');
  const [open, setOpen] = useState<any>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const active = [cat, action, from, to].filter(Boolean).length;

  return (
    <div className="space-y-6">
      <AdminHero
        eyebrow="Immutable Audit Ledger"
        title="Nhật ký kiểm toán hệ thống"
        sub="Sổ cái bất biến ghi nhận toàn bộ tác động quan trọng. Chạm vào một bản ghi để đối chiếu dữ liệu trước và sau thay đổi."
        icon={<ScrollText className="size-5" />}
      />

      <Card className="overflow-hidden">
        <PagedTable
          path="/admin/audit-logs"
          query={{
            category: cat || undefined,
            action: action || undefined,
            from: from ? new Date(`${from}T00:00:00`).toISOString() : undefined,
            to: to ? new Date(`${to}T23:59:59.999`).toISOString() : undefined,
          }}
          rowKey={(a: any) => String(a.id)}
          onRow={setOpen}
          toolbar={
            <FilterBar>
              <div className="relative w-60">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-steel-400" />
                <Input
                  aria-label="Hành động"
                  className="w-60 pl-9"
                  placeholder="Hành động (vd. user.lock)…"
                  value={action}
                  onChange={(e) => setAction(e.target.value)}
                />
              </div>
              {!business && (
                <Select aria-label="Nhóm" className="w-40" value={cat} onChange={(e) => setCat(e.target.value)}>
                  <option value="">Mọi phân nhóm</option>
                  {Object.entries(AUDIT_CAT_L).map(([c, l]) => (
                    <option key={c} value={c}>
                      {l}
                    </option>
                  ))}
                </Select>
              )}
              <label className="flex items-center gap-1.5 text-xs font-semibold text-steel-500">
                Từ
                <Input
                  type="date"
                  className="w-40"
                  aria-label="Từ ngày"
                  value={from}
                  max={to || undefined}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </label>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-steel-500">
                Đến
                <Input
                  type="date"
                  className="w-40"
                  aria-label="Đến ngày"
                  value={to}
                  min={from || undefined}
                  onChange={(e) => setTo(e.target.value)}
                />
              </label>
              {active > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setCat('');
                    setAction('');
                    setFrom('');
                    setTo('');
                  }}
                >
                  Xóa bộ lọc ({active})
                </Button>
              )}
            </FilterBar>
          }
          empty={<EmptyState title="Không có bản ghi phù hợp" hint="Mở rộng khoảng ngày hoặc xóa bộ lọc hành động." />}
          cols={[
            {
              key: 't',
              header: 'Thời gian',
              cell: (a: any) => <span className="whitespace-nowrap text-xs">{fmtDateTime(a.occurred_at)}</span>,
            },
            {
              key: 'a',
              header: 'Hành động & Đối tượng',
              cell: (a: any) => (
                <div>
                  <b className="code rounded border hairline bg-paper px-2 py-0.5 text-xs text-ink-950">
                    {a.action}
                  </b>
                  <span className="mt-0.5 block text-xs text-steel-500">
                    {a.entity_type} {a.entity_ref ?? ''}
                  </span>
                </div>
              ),
            },
            {
              key: 'u',
              header: 'Người thực hiện',
              hideBelow: 'sm',
              cell: (a: any) => (
                <div>
                  <span className="font-semibold text-ink-950">{a.actor?.full_name ?? 'Hệ thống'}</span>
                  {a.actor_role && (
                    <span className="block text-xs text-steel-500">{ROLE_L[a.actor_role] ?? a.actor_role}</span>
                  )}
                </div>
              ),
            },
            {
              key: 'c',
              header: 'Phân nhóm',
              hideBelow: 'md',
              cell: (a: any) => <Badge tone={CAT_TONE[a.category]}>{AUDIT_CAT_L[a.category] ?? a.category}</Badge>,
            },
          ]}
        />
      </Card>

      <Drawer open={!!open} onClose={() => setOpen(null)} title={open?.action ?? 'Chi tiết kiểm toán'} width={580}>
        {open && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-2xl border hairline bg-paper p-4 text-[13px]">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-steel-500">Thời gian</p>
                <p className="mt-0.5 font-semibold text-ink-950">{fmtDateTime(open.occurred_at)}</p>
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-steel-500">Người thực hiện</p>
                <p className="mt-0.5 font-semibold text-ink-950">
                  {open.actor?.full_name ?? 'Hệ thống'}
                  {open.actor_role ? ` · ${ROLE_L[open.actor_role] ?? open.actor_role}` : ''}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-steel-500">Đối tượng</p>
                <p className="mt-0.5 font-semibold text-ink-950">
                  {open.entity_type} {open.entity_ref ?? ''}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-steel-500">Địa chỉ IP</p>
                <p className="code mt-0.5 font-semibold text-ink-950">{open.ip_address ?? '—'}</p>
              </div>
              {open.request_id && (
                <div className="col-span-2">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-steel-500">Mã yêu cầu (Request ID)</p>
                  <span className="code text-xs text-ink-900">{open.request_id}</span>
                </div>
              )}
              {open.user_agent && (
                <div className="col-span-2">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-steel-500">Thiết bị / User-Agent</p>
                  <span className="break-words text-xs text-steel-600">{open.user_agent}</span>
                </div>
              )}
            </div>
            {open.reason && (
              <Alert tone="info" title="Lý do thực hiện">
                {open.reason}
              </Alert>
            )}
            {open.before || open.after ? (
              <div>
                <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-steel-500">
                  Đối chiếu thay đổi dữ liệu
                </h4>
                <AuditDiff before={open.before} after={open.after} />
              </div>
            ) : (
              <p className="text-steel-500">Hành động này không kèm dữ liệu trước/sau.</p>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}

/* ───────────── settings ───────────── */
const CAT_L: Record<string, string> = {
  SECURITY: 'Bảo mật',
  BRANDING: 'Thương hiệu',
  FEATURE_FLAG: 'Tính năng',
  INTEGRATION: 'Tích hợp',
  AI: 'Trợ lý AI',
  EMAIL: 'Email',
  NOTIFICATION: 'Thông báo',
  STORAGE: 'Lưu trữ',
  GENERAL: 'Chung',
};

export function SettingsPage() {
  const q = useGet<any[]>('/admin/settings');
  const [edits, setEdits] = useState<Record<string, any>>({});
  const [cat, setCat] = useState('');
  const rows = q.data ?? [];
  const cats = [...new Set(rows.map((r) => r.category))];
  const active = cat || cats[0] || '';
  const save = useAct((key: string) => patch(`/admin/settings/${key}`, { value: edits[key] }), {
    ok: 'Đã lưu cấu hình',
    invalidate: ['/admin/settings'],
  });
  const draft = (r: any) => (r.key in edits ? edits[r.key] : r.value);

  return (
    <div className="space-y-6">
      <AdminHero
        eyebrow="Runtime Configuration"
        title="Cấu hình tham số hệ thống"
        sub="Mọi thay đổi tham số vận hành có hiệu lực tức thì và tự động được ghi vết vào sổ cái kiểm toán."
        icon={<Settings className="size-5" />}
      />

      {cats.length > 0 && (
        <Tabs
          value={active}
          onChange={setCat}
          tabs={cats.map((c) => ({
            value: c,
            label: CAT_L[c] ?? enumLabel(c),
            count: rows.filter((r) => r.category === c).length,
          }))}
        />
      )}

      <Async q={q}>
        {() => (
          <Card className="overflow-hidden">
            <CardHead
              title={`Tham số nhóm ${CAT_L[active] ?? (active ? enumLabel(active) : 'hệ thống')}`}
              sub="Chỉnh sửa giá trị và bấm Lưu ở từng dòng để áp dụng"
            />
            <ul className="divide-y hairline">
              {rows
                .filter((r) => r.category === active)
                .map((r) => {
                  const v = draft(r);
                  const dirty = r.key in edits && JSON.stringify(edits[r.key]) !== JSON.stringify(r.value);
                  const badJson = r.value_type === 'JSON' && r.key in edits && typeof edits[r.key] === 'string';
                  return (
                    <li
                      key={r.key}
                      className={cn(
                        'flex flex-wrap items-center gap-4 px-5 py-4 transition',
                        dirty && 'bg-brass-100/20',
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-bold text-ink-950">{r.description || r.key}</p>
                          {r.is_secret && <Badge tone="warn">Bí mật</Badge>}
                          {dirty && <Badge tone="brass">Chưa lưu</Badge>}
                        </div>
                        <p className="code mt-0.5 text-xs text-steel-500">{r.key}</p>
                        {badJson && (
                          <p className="mt-1 text-xs font-semibold text-bad-600">
                            JSON không hợp lệ, ví dụ [15,60,240]
                          </p>
                        )}
                      </div>
                      <div className="w-64">
                        {r.value_type === 'BOOLEAN' ? (
                          <Switch
                            checked={!!v}
                            onChange={(x) => setEdits({ ...edits, [r.key]: x })}
                            label={v ? 'Đang bật' : 'Đang tắt'}
                          />
                        ) : r.value_type === 'NUMBER' ? (
                          <Input
                            type="number"
                            aria-label={r.key}
                            value={v ?? ''}
                            onChange={(e) =>
                              setEdits({ ...edits, [r.key]: e.target.value === '' ? '' : +e.target.value })
                            }
                          />
                        ) : r.value_type === 'JSON' ? (
                          <Input
                            aria-label={r.key}
                            className="code text-xs"
                            value={typeof v === 'string' ? v : JSON.stringify(v)}
                            onChange={(e) => {
                              try {
                                setEdits({ ...edits, [r.key]: JSON.parse(e.target.value) });
                              } catch {
                                setEdits({ ...edits, [r.key]: e.target.value });
                              }
                            }}
                          />
                        ) : (
                          <Input
                            aria-label={r.key}
                            type={r.is_secret ? 'password' : 'text'}
                            value={v ?? ''}
                            onChange={(e) => setEdits({ ...edits, [r.key]: e.target.value })}
                          />
                        )}
                      </div>
                      <Button
                        variant={dirty ? 'primary' : 'dark'}
                        size="sm"
                        disabled={!dirty || v === '' || badJson}
                        loading={save.isPending && save.variables === r.key}
                        onClick={() => save.mutate(r.key)}
                      >
                        Lưu
                      </Button>
                    </li>
                  );
                })}
            </ul>
          </Card>
        )}
      </Async>
    </div>
  );
}

/* ───────────── system health ───────────── */
export function HealthPage() {
  const q = useGet<any>('/admin/system-health', undefined, { refetchInterval: 15000 });
  const live = q.data;

  return (
    <div className="space-y-6">
      <AdminHero
        eyebrow="Infrastructure Telemetry · 15s Auto-Refresh"
        title="Sức khỏe hạ tầng &amp; Tác vụ nền"
        sub="Giám sát kết nối cơ sở dữ liệu, hàng đợi sự kiện Outbox, bộ điều phối Email và tiến trình Cron nền."
        icon={<Activity className="size-5" />}
        actions={
          live ? (
            <span
              className={cn(
                'inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-bold',
                live.db === 'ok'
                  ? 'border-brass-400/40 bg-brass-500/15 text-brass-400'
                  : 'border-bad-600/40 bg-bad-100 text-bad-600',
              )}
            >
              <span className="size-2 rounded-full bg-current" />
              {live.db === 'ok' ? 'Hệ thống vận hành ổn định' : 'Cảnh báo kết nối hạ tầng'}
            </span>
          ) : undefined
        }
      />

      <Async q={q}>
        {(d) => (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
              <SecurityMetric
                label="Cơ sở dữ liệu"
                value={d.db === 'ok' ? 'Hoạt động' : d.db}
                sub="Kết nối truy vấn chính"
                icon={<Database className="size-4" />}
                tone={d.db === 'ok' ? 'ok' : 'bad'}
              />
              <SecurityMetric
                label="Outbox chờ / lỗi"
                value={`${d.outbox.pending} / ${d.outbox.failed}`}
                sub="Hàng đợi sự kiện bất đồng bộ"
                icon={<Activity className="size-4" />}
                tone={d.outbox.failed ? 'bad' : undefined}
              />
              <SecurityMetric
                label="Email chờ / lỗi"
                value={`${d.email.pending} / ${d.email.failed}`}
                sub="Dịch vụ gửi thông báo SMTP"
                icon={<Mail className="size-4" />}
                tone={d.email.failed ? 'bad' : undefined}
              />
              <SecurityMetric
                label="Giờ máy chủ"
                value={new Date(d.time).toLocaleTimeString('vi-VN')}
                sub="Đồng bộ NTP chuẩn"
                icon={<Clock className="size-4" />}
              />
            </div>

            <Card className="overflow-hidden">
              <CardHead
                title="Tiến trình tác vụ nền (Background Workers)"
                sub={`${d.jobSummary?.length ?? 0} tác vụ đăng ký · Thống kê chu kỳ 24 giờ gần nhất`}
              />
              <DataTable
                rows={[...(d.jobSummary ?? [])].sort(
                  (x: any, y: any) => Number(y.failed24h > 0) - Number(x.failed24h > 0) || x.job.localeCompare(y.job),
                )}
                rowKey={(j: any) => j.job}
                empty={<EmptyState title="Chưa có tác vụ nào chạy" />}
                cols={[
                  {
                    key: 'n',
                    header: 'Tên tác vụ',
                    cell: (j: any) => (
                      <div>
                        <b className="code rounded border hairline bg-paper px-2 py-0.5 text-xs text-ink-950">
                          {j.job}
                        </b>
                        {j.lastError && (
                          <span
                            className="mt-1 block max-w-xs truncate text-xs font-medium text-bad-600"
                            title={j.lastError}
                          >
                            {j.lastError}
                          </span>
                        )}
                      </div>
                    ),
                  },
                  {
                    key: 'l',
                    header: 'Lần chạy cuối',
                    cell: (j: any) => (
                      <span className="whitespace-nowrap text-xs text-steel-600">
                        {j.lastStartedAt ? relTime(j.lastStartedAt) : '—'}
                      </span>
                    ),
                  },
                  {
                    key: 'r',
                    header: 'Trạng thái cuối',
                    cell: (j: any) => (
                      <Badge
                        tone={
                          j.lastStatus === 'SUCCEEDED'
                            ? 'ok'
                            : j.lastStatus === 'FAILED'
                              ? 'bad'
                              : j.lastStatus === 'RUNNING'
                                ? 'info'
                                : 'neutral'
                        }
                        dot
                      >
                        {{
                          SUCCEEDED: 'Thành công',
                          FAILED: 'Lỗi',
                          RUNNING: 'Đang chạy',
                          SKIPPED: 'Bỏ qua',
                        }[j.lastStatus as string] ??
                          j.lastStatus ??
                          '—'}
                      </Badge>
                    ),
                  },
                  {
                    key: 'c',
                    header: 'Tần suất 24h',
                    hideBelow: 'sm',
                    cell: (j: any) => (
                      <span className="text-xs font-semibold text-ink-900 num">
                        {j.runs24h} lần
                        {j.failed24h > 0 && <b className="ml-1.5 text-bad-600">· {j.failed24h} lỗi</b>}
                      </span>
                    ),
                  },
                  {
                    key: 'p',
                    header: 'Hiệu năng xử lý',
                    hideBelow: 'md',
                    cell: (j: any) => (
                      <span className="text-xs text-steel-600 num">
                        {j.lastProcessed} mục
                        {j.lastDurationMs !== null
                          ? ` · ${j.lastDurationMs < 1000 ? `${j.lastDurationMs} ms` : `${(j.lastDurationMs / 1000).toFixed(1)} s`}`
                          : ''}
                      </span>
                    ),
                  },
                ]}
              />
            </Card>
          </div>
        )}
      </Async>
    </div>
  );
}
