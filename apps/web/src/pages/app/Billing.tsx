import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Download,
  CreditCard,
  Receipt,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ShieldCheck,
  KeyRound,
  Building2,
  ArrowLeft,
  Wallet,
  Search,
  X,
} from 'lucide-react';
import { useGet, useAct, useDebounced } from '@/lib/hooks';
import { post, newIdemKey } from '@/lib/api';
import { openAuthed } from '@/lib/download';
import {
  Async,
  Card,
  CardHead,
  PagedTable,
  StatusBadge,
  Button,
  Alert,
  Tabs,
  Select,
  Input,
  Badge,
  EmptyState,
  cn,
} from '@/ui';
import {
  vnd,
  fmtDate,
  fmtDateTime,
  INVOICE_TYPE_LABEL,
  ITEM_TYPE_LABEL,
} from '@/lib/format';
import { Money } from '../kit';

const UNPAID_SET = new Set(['ISSUED', 'PARTIALLY_PAID', 'OVERDUE']);

function isPastDue(dueDate?: string | null, status?: string): boolean {
  if (!status || !UNPAID_SET.has(status)) return false;
  if (status === 'OVERDUE') return true;
  if (!dueDate) return false;
  const dueEnd = new Date(dueDate);
  dueEnd.setHours(23, 59, 59, 999);
  return dueEnd.getTime() < Date.now();
}

function StatementStamp({ status, overdue }: { status?: string; overdue?: boolean }) {
  if (status === 'PAID') {
    return (
      <div className="inline-flex -rotate-2 items-center gap-1.5 rounded-lg border-2 border-brass-400 bg-brass-500/15 px-3.5 py-1.5 font-mono text-xs font-extrabold uppercase tracking-[0.18em] text-brass-400 shadow-xs">
        <CheckCircle2 className="size-4" />
        ĐÃ THANH TOÁN
      </div>
    );
  }
  if (overdue || status === 'OVERDUE') {
    return (
      <div className="inline-flex -rotate-2 items-center gap-1.5 rounded-lg border-2 border-bad-600 bg-bad-100 px-3.5 py-1.5 font-mono text-xs font-extrabold uppercase tracking-[0.16em] text-bad-600 shadow-xs">
        <AlertTriangle className="size-4" />
        QUÁ HẠN THANH TOÁN
      </div>
    );
  }
  if (status && UNPAID_SET.has(status)) {
    return (
      <div className="inline-flex -rotate-2 items-center gap-1.5 rounded-lg border-2 border-brass-500 bg-brass-100 px-3.5 py-1.5 font-mono text-xs font-extrabold uppercase tracking-[0.16em] text-brass-700 shadow-xs">
        <Clock className="size-4" />
        CHỜ THANH TOÁN
      </div>
    );
  }
  return <StatusBadge kind="invoice" value={status} />;
}

export function Billing() {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const [tab, setTab] = useState('invoices');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const searchTerm = useDebounced(search.trim(), 350);
  const [sel, setSel] = useState<string[]>([]);
  const [payingOneId, setPayingOneId] = useState<string | null>(null);

  const summaryQ = useGet<{ data: any[] }>('/invoices', { 'page[size]': 100 });
  const allInvoices = Array.isArray(summaryQ.data)
    ? summaryQ.data
    : summaryQ.data?.data ?? [];

  const unpaidInvoices = allInvoices.filter((inv: any) =>
    UNPAID_SET.has(inv.status),
  );
  const overdueInvoices = unpaidInvoices.filter((inv: any) =>
    isPastDue(inv.due_date, inv.status),
  );
  const paidInvoices = allInvoices.filter((inv: any) => inv.status === 'PAID');

  const totalDue = unpaidInvoices.reduce(
    (sum: number, inv: any) => sum + Number(inv.balance_due ?? inv.total ?? 0),
    0,
  );
  const totalPaid = paidInvoices.reduce(
    (sum: number, inv: any) => sum + Number(inv.amount_paid ?? inv.total ?? 0),
    0,
  );

  const pay = useAct(
    (ids?: string[]) =>
      post(
        '/invoices/pay',
        { invoiceIds: ids && ids.length ? ids : sel, returnPath: '/app/billing' },
        newIdemKey(),
      ),
    {
      onSuccess: (r) => {
        setPayingOneId(null);
        window.location.href = r.redirectUrl;
      },
      onError: () => setPayingOneId(null),
    },
  );

  const gwStatus = sp.get('status');

  return (
    <div className="space-y-6">
      {/* Executive Header Banner */}
      <section className="relative overflow-hidden rounded-[var(--radius-media)] border border-brass-500/25 bg-[#091320] p-6 text-white shadow-[var(--shadow-card)] sm:p-7">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brass-500 via-brass-400 to-transparent" />
        <div
          className="blueprint-dark pointer-events-none absolute inset-0 opacity-55"
          aria-hidden
        />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <h1 className="display text-[28px] text-white sm:text-[34px]">
              Hóa đơn &amp; Thanh toán
            </h1>
            <p className="mt-1.5 text-sm text-steel-300">
              Tra cứu hóa đơn định kỳ, thanh toán trực tuyến và tải biên nhận điện tử.
            </p>
          </div>
          {unpaidInvoices.length > 0 && (
            <Button
              variant="primary"
              size="md"
              loading={pay.isPending && !payingOneId}
              icon={<CreditCard className="size-4" />}
              onClick={() =>
                pay.mutate(
                  unpaidInvoices.slice(0, 20).map((inv: any) => inv.id),
                )
              }
            >
              Thanh toán tất cả ({vnd(totalDue)})
            </Button>
          )}
        </div>
      </section>

      {gwStatus && (
        <Alert
          tone={
            gwStatus === 'SUCCEEDED'
              ? 'ok'
              : gwStatus === 'PENDING'
                ? 'info'
                : 'bad'
          }
          title={
            gwStatus === 'SUCCEEDED'
              ? 'Thanh toán thành công'
              : gwStatus === 'PENDING'
                ? 'Giao dịch đang được cổng thanh toán xử lý'
                : 'Thanh toán chưa hoàn tất'
          }
        >
          {gwStatus === 'SUCCEEDED'
            ? 'Hệ thống đã gạch nợ hóa đơn tự động. Biên nhận PDF có sẵn trong tab Lịch sử thanh toán.'
            : 'Bạn có thể kiểm tra lại trạng thái hoặc bấm Thanh toán ngay để thực hiện lại giao dịch.'}
        </Alert>
      )}

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="relative overflow-hidden rounded-2xl border hairline bg-white p-5 shadow-[var(--shadow-card)]">
          <div
            className={cn(
              'absolute inset-x-0 top-0 h-1',
              overdueInvoices.length > 0
                ? 'bg-bad-600'
                : totalDue > 0
                  ? 'bg-brass-500'
                  : 'bg-ok-600',
            )}
          />
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-steel-500">
                Tổng cần thanh toán
              </p>
              <p
                className={cn(
                  'mt-2 text-2xl font-extrabold tracking-tight num sm:text-3xl',
                  overdueInvoices.length > 0 ? 'text-bad-600' : 'text-ink-950',
                )}
              >
                {summaryQ.isLoading ? '—' : vnd(totalDue)}
              </p>
            </div>
            <span
              className={cn(
                'grid size-11 shrink-0 place-items-center rounded-xl',
                overdueInvoices.length > 0
                  ? 'bg-bad-100 text-bad-600'
                  : 'bg-[#091320] text-brass-400',
              )}
            >
              <Wallet className="size-5" />
            </span>
          </div>
          <p className="mt-2.5 text-xs text-steel-500">
            {totalDue > 0
              ? 'Thanh toán đúng hạn để duy trì quyền mở kho 24/7'
              : 'Tài khoản không có công nợ tồn đọng'}
          </p>
        </div>

        <div className="relative overflow-hidden rounded-2xl border hairline bg-white p-5 shadow-[var(--shadow-card)]">
          <div className="absolute inset-x-0 top-0 h-1 bg-brass-500" />
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-steel-500">
                Hóa đơn chờ thanh toán
              </p>
              <p className="mt-2 text-2xl font-extrabold tracking-tight text-ink-950 num sm:text-3xl">
                {summaryQ.isLoading ? '—' : unpaidInvoices.length}
              </p>
            </div>
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brass-100 text-brass-700">
              <Clock className="size-5" />
            </span>
          </div>
          <p className="mt-2.5 text-xs text-steel-500">
            {overdueInvoices.length > 0 ? (
              <span className="font-semibold text-bad-600">
                Có {overdueInvoices.length} hóa đơn đã quá hạn thanh toán
              </span>
            ) : unpaidInvoices.length > 0 ? (
              'Đang trong thời hạn thanh toán tiêu chuẩn'
            ) : (
              'Mọi hóa đơn kỳ này đã hoàn tất'
            )}
          </p>
        </div>

        <div className="relative overflow-hidden rounded-2xl border hairline bg-white p-5 shadow-[var(--shadow-card)]">
          <div className="absolute inset-x-0 top-0 h-1 bg-ok-600" />
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-steel-500">
                Đã thanh toán
              </p>
              <p className="mt-2 text-2xl font-extrabold tracking-tight text-ink-950 num sm:text-3xl">
                {summaryQ.isLoading ? '—' : paidInvoices.length}
              </p>
            </div>
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-ok-100 text-ok-600">
              <CheckCircle2 className="size-5" />
            </span>
          </div>
          <p className="mt-2.5 text-xs text-steel-500">
            Tổng giá trị đã tất toán:{' '}
            <b className="text-ink-900 num">
              {summaryQ.isLoading ? '—' : vnd(totalPaid)}
            </b>
          </p>
        </div>
      </div>

      {/* Main Card with Tabs */}
      <Card className="overflow-hidden">
        <div className="border-b hairline bg-paper/40 px-4 pt-1">
          <Tabs
            className="!border-b-0"
            value={tab}
            onChange={setTab}
            tabs={[
              {
                value: 'invoices',
                label: 'Danh sách hóa đơn',
                count: unpaidInvoices.length || undefined,
              },
              { value: 'payments', label: 'Lịch sử thanh toán & Biên nhận' },
            ]}
          />
        </div>

        {tab === 'invoices' ? (
          <PagedTable
            path="/invoices"
            query={{ status: status || undefined, q: searchTerm || undefined }}
            onRow={(r: any) => nav(`/app/billing/invoices/${r.id}`)}
            toolbar={
              <div className="flex flex-wrap items-center justify-between gap-3 border-b hairline bg-paper/50 px-4 py-3">
                <div className="relative w-full">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-steel-400" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Escape') setSearch(''); }}
                    placeholder="Tìm hóa đơn: mã hóa đơn, mã kho, mã hợp đồng, tên cơ sở, nội dung hoặc số tiền…"
                    aria-label="Tìm hóa đơn"
                    className="h-10 pl-10 pr-10"
                  />
                  {search && (
                    <button type="button" aria-label="Xóa tìm kiếm" onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 grid size-7 -translate-y-1/2 cursor-pointer place-items-center rounded-md text-steel-500 hover:bg-steel-100">
                      <X className="size-4" />
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {[
                    { v: '', l: 'Tất cả' },
                    { v: 'ISSUED,PARTIALLY_PAID,OVERDUE', l: 'Cần thanh toán' },
                    { v: 'PAID', l: 'Đã thanh toán' },
                    { v: 'VOID', l: 'Đã hủy' },
                  ].map((f) => (
                    <button
                      key={f.v}
                      type="button"
                      onClick={() => setStatus(f.v)}
                      className={cn(
                        'rounded-lg px-3 py-1.5 text-xs font-semibold transition',
                        status === f.v
                          ? 'bg-[#091320] text-brass-400 shadow-xs'
                          : 'border hairline bg-white text-steel-600 hover:border-ink-900 hover:text-ink-950',
                      )}
                    >
                      {f.l}
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {sel.length > 0 && (
                    <Button
                      variant="primary"
                      size="sm"
                      loading={pay.isPending && !payingOneId}
                      icon={<CreditCard className="size-4" />}
                      onClick={() => pay.mutate(sel)}
                    >
                      Thanh toán {sel.length} hóa đơn đã chọn
                    </Button>
                  )}
                  <Select
                    className="w-48"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    aria-label="Lọc trạng thái"
                  >
                    <option value="">Mọi trạng thái</option>
                    <option value="ISSUED,PARTIALLY_PAID,OVERDUE">
                      Cần thanh toán
                    </option>
                    <option value="PAID">Đã trả</option>
                    <option value="VOID">Đã hủy</option>
                  </Select>
                </div>
              </div>
            }
            cols={[
              {
                key: 'k',
                header: '',
                className: 'w-9',
                cell: (r: any) =>
                  UNPAID_SET.has(r.status) ? (
                    <input
                      type="checkbox"
                      aria-label={`Chọn ${r.code}`}
                      className="size-4 rounded accent-ink-900"
                      checked={sel.includes(r.id)}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) =>
                        setSel((s) =>
                          e.target.checked
                            ? [...s, r.id]
                            : s.filter((x) => x !== r.id),
                        )
                      }
                    />
                  ) : null,
              },
              {
                key: 'c',
                header: 'Mã hóa đơn & Kho',
                cell: (r: any) => (
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="code font-bold text-ink-950">
                        {r.code}
                      </span>
                      {r.contract?.unit?.code && (
                        <span className="rounded bg-[#091320] px-1.5 py-0.5 font-mono text-[10.5px] font-bold text-brass-400">
                          {r.contract.unit.code}
                        </span>
                      )}
                    </div>
                    <span className="mt-0.5 block text-xs text-steel-500">
                      {INVOICE_TYPE_LABEL[r.type] ?? r.type}
                      {r.facility?.name ? ` · ${r.facility.name}` : ''}
                    </span>
                  </div>
                ),
              },
              {
                key: 'd',
                header: 'Hạn thanh toán',
                hideBelow: 'sm',
                cell: (r: any) => {
                  const late = isPastDue(r.due_date, r.status);
                  return (
                    <div>
                      <span
                        className={cn(
                          'font-medium num',
                          late ? 'font-bold text-bad-600' : 'text-ink-900',
                        )}
                      >
                        {fmtDate(r.due_date)}
                      </span>
                      {late && (
                        <span className="block text-[11px] font-bold text-bad-600">
                          Quá hạn
                        </span>
                      )}
                    </div>
                  );
                },
              },
              {
                key: 't',
                header: 'Tổng cộng',
                hideBelow: 'md',
                cell: (r: any) => <Money v={r.total} />,
              },
              {
                key: 'b',
                header: 'Còn phải trả',
                cell: (r: any) => (
                  <span
                    className={cn(
                      'font-mono num',
                      UNPAID_SET.has(r.status)
                        ? 'font-extrabold text-ink-950'
                        : 'text-steel-500',
                    )}
                  >
                    {vnd(r.balance_due)}
                  </span>
                ),
              },
              {
                key: 's',
                header: 'Trạng thái',
                cell: (r: any) => (
                  <StatusBadge kind="invoice" value={r.status} />
                ),
              },
              {
                key: 'act',
                header: 'Thao tác',
                cell: (r: any) =>
                  UNPAID_SET.has(r.status) ? (
                    <Button
                      size="sm"
                      variant="primary"
                      icon={<CreditCard className="size-3.5" />}
                      loading={pay.isPending && payingOneId === r.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        setPayingOneId(r.id);
                        pay.mutate([r.id]);
                      }}
                    >
                      Thanh toán ngay
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Download className="size-3.5" />}
                      onClick={(e) => {
                        e.stopPropagation();
                        void openAuthed(`/invoices/${r.id}/pdf`, `${r.code}.pdf`);
                      }}
                    >
                      PDF
                    </Button>
                  ),
              },
            ]}
            empty={
              <EmptyState
                icon={<Receipt className="size-6" />}
                title={searchTerm ? 'Không tìm thấy hóa đơn phù hợp' : 'Không có hóa đơn nào'}
                hint={searchTerm ? `Không có hóa đơn nào khớp "${searchTerm}"${status ? ' trong bộ lọc trạng thái đang chọn' : ''}. Thử từ khóa khác hoặc xóa bộ lọc.` : 'Hóa đơn tiền thuê kho và đặt chỗ của bạn sẽ xuất hiện tại đây.'}
              />
            }
          />
        ) : (
          <PagedTable
            path="/payments"
            cols={[
              {
                key: 'c',
                header: 'Mã biên nhận',
                cell: (r: any) => (
                  <span className="code font-bold text-ink-950">{r.code}</span>
                ),
              },
              {
                key: 'd',
                header: 'Thời gian giao dịch',
                hideBelow: 'sm',
                cell: (r: any) => (
                  <span className="num">
                    {fmtDateTime(r.paid_at ?? r.created_at)}
                  </span>
                ),
              },
              {
                key: 'm',
                header: 'Phương thức',
                hideBelow: 'md',
                cell: (r: any) => (
                  <Badge tone="neutral">
                    {r.method === 'GATEWAY'
                      ? 'Cổng thanh toán trực tuyến'
                      : r.method === 'CASH'
                        ? 'Tiền mặt tại quầy'
                        : r.method}
                  </Badge>
                ),
              },
              {
                key: 'a',
                header: 'Số tiền',
                cell: (r: any) => <Money v={r.amount} strong />,
              },
              {
                key: 's',
                header: 'Trạng thái',
                cell: (r: any) => (
                  <StatusBadge kind="payment" value={r.status} />
                ),
              },
              {
                key: 'x',
                header: 'Chứng từ',
                cell: (r: any) =>
                  r.status === 'SUCCEEDED' && (
                    <Button
                      size="sm"
                      variant="outline"
                      icon={<Receipt className="size-3.5 text-brass-700" />}
                      onClick={() =>
                        void openAuthed(`/payments/${r.id}/receipt`, `${r.code}.pdf`)
                      }
                    >
                      Tải biên nhận
                    </Button>
                  ),
              },
            ]}
            empty={
              <EmptyState
                icon={<CreditCard className="size-6" />}
                title="Chưa có giao dịch thanh toán"
                hint="Lịch sử thanh toán và biên nhận PDF sẽ lưu tự động sau mỗi lần giao dịch."
              />
            }
          />
        )}
      </Card>
    </div>
  );
}

export function InvoiceDetail() {
  const { id } = useParams();
  const q = useGet<any>(`/invoices/${id}`);
  const pay = useAct(
    () =>
      post(
        '/invoices/pay',
        { invoiceIds: [id], returnPath: `/app/billing/invoices/${id}` },
        newIdemKey(),
      ),
    {
      onSuccess: (r) => {
        window.location.href = r.redirectUrl;
      },
    },
  );

  return (
    <Async q={q}>
      {(i) => {
        const unpaid = UNPAID_SET.has(i.status);
        const late = isPastDue(i.due_date, i.status);
        const paymentRows: any[] =
          i.payments ??
          (Array.isArray(i.allocations)
            ? i.allocations.map((al: any) => ({
                id: al.id ?? al.payment?.public_id,
                code: al.payment?.code ?? 'PAY',
                amount: al.amount,
                paid_at: al.payment?.paid_at,
                receiptId: al.payment?.public_id,
              }))
            : []);

        return (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Link
                to="/app/billing"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-steel-500 transition hover:text-ink-950"
              >
                <ArrowLeft className="size-4" />
                Quay lại Hóa đơn &amp; Thanh toán
              </Link>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  icon={<Download className="size-4" />}
                  onClick={() =>
                    void openAuthed(`/invoices/${i.id}/pdf`, `${i.code}.pdf`)
                  }
                >
                  Tải bản PDF ({i.code})
                </Button>
                {unpaid && (
                  <Button
                    variant="primary"
                    size="sm"
                    loading={pay.isPending}
                    icon={<CreditCard className="size-4" />}
                    onClick={() => pay.mutate(undefined)}
                  >
                    Thanh toán ngay
                  </Button>
                )}
              </div>
            </div>

            {i.dispute_hold && (
              <Alert
                tone="warn"
                title="Hóa đơn đang trong diện xem xét khiếu nại"
              >
                Phí trễ hạn được tạm hoãn tự động trong suốt thời gian Quản lý cơ sở kiểm tra và xử lý.
              </Alert>
            )}

            <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
              {/* Digital VAT / Rental Statement Document */}
              <Card className="overflow-hidden border-brass-500/35 shadow-[var(--shadow-card)]">
                {/* Executive Dark Navy Masthead */}
                <div className="relative bg-[#091320] p-6 text-white sm:p-8">
                  <div
                    className="door-lines pointer-events-none absolute inset-0 opacity-30"
                    aria-hidden
                  />
                  <div className="relative flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h1 className="display text-2xl text-white sm:text-3xl">
                        Hóa đơn{' '}
                        <span className="font-mono text-brass-400">
                          {i.code}
                        </span>
                      </h1>
                      <p className="mt-1.5 text-xs text-steel-300 sm:text-sm">
                        {INVOICE_TYPE_LABEL[i.type] ?? i.type}
                        {i.period_start
                          ? ` · Kỳ dịch vụ ${fmtDate(i.period_start)} – ${fmtDate(i.period_end)}`
                          : ''}
                      </p>
                    </div>
                    <StatementStamp status={i.status} overdue={late} />
                  </div>

                  {/* Parties & Reference Band */}
                  <div className="relative mt-6 grid gap-4 rounded-xl border border-white/12 bg-white/[0.05] p-4 text-xs sm:grid-cols-3">
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-wider text-steel-400">
                        Đơn vị cung cấp
                      </p>
                      <p className="mt-1 flex items-center gap-1.5 font-bold text-white">
                        <Building2 className="size-3.5 text-brass-400" />
                        {i.facility?.name ?? 'Vaultra Self-Storage'}
                      </p>
                    </div>
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-wider text-steel-400">
                        Khách hàng thanh toán
                      </p>
                      <p className="mt-1 font-bold text-white">
                        {i.customer?.full_name ?? 'Khách thuê'}
                      </p>
                      {i.customer?.code && (
                        <p className="font-mono text-[11px] text-steel-300">
                          Mã KH: {i.customer.code}
                        </p>
                      )}
                    </div>
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-wider text-steel-400">
                        Hợp đồng &amp; Kho
                      </p>
                      {i.contract ? (
                        <Link
                          to={`/app/contracts/${i.contract.public_id ?? i.contract.id}`}
                          className="mt-1 inline-flex items-center gap-1.5 font-mono font-bold text-brass-400 hover:underline"
                        >
                          <KeyRound className="size-3.5" />
                          {i.contract.code}
                          {i.contract.unit?.code
                            ? ` · Kho ${i.contract.unit.code}`
                            : ''}
                        </Link>
                      ) : (
                        <p className="mt-1 text-steel-300">Theo đơn đặt chỗ</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Statement Line Items */}
                <div className="p-6 sm:p-8">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b-2 border-ink-950/12 text-left font-mono text-[11px] font-bold uppercase tracking-wider text-steel-500">
                          <th className="pb-3 pr-3">#</th>
                          <th className="pb-3 pr-4">Nội dung khoản mục</th>
                          <th className="hidden pb-3 pr-4 sm:table-cell">
                            Phân loại
                          </th>
                          <th className="pb-3 text-right">Thành tiền</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-steel-100">
                        {i.items?.map((it: any, idx: number) => (
                          <tr key={it.id ?? idx}>
                            <td className="py-3.5 pr-3 font-mono text-xs text-steel-400 num">
                              {String(idx + 1).padStart(2, '0')}
                            </td>
                            <td className="py-3.5 pr-4">
                              <p className="font-semibold text-ink-950">
                                {it.description}
                              </p>
                              {it.quantity > 1 && (
                                <p className="text-xs text-steel-500">
                                  Số lượng: {it.quantity}
                                </p>
                              )}
                            </td>
                            <td className="hidden py-3.5 pr-4 sm:table-cell">
                              <Badge tone="neutral">
                                {ITEM_TYPE_LABEL[it.item_type] ?? it.item_type}
                              </Badge>
                            </td>
                            <td className="py-3.5 text-right font-mono font-semibold text-ink-950 num">
                              {vnd(it.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Statement Totals Box */}
                  <div className="mt-6 flex flex-col items-end border-t-2 border-ink-950/12 pt-5">
                    <div className="w-full max-w-sm space-y-2 text-sm">
                      <div className="flex justify-between text-steel-600">
                        <span>Thuế GTGT / VAT (đã bao gồm)</span>
                        <span className="font-mono num">{vnd(i.tax_total)}</span>
                      </div>
                      <div className="flex justify-between font-bold text-ink-950">
                        <span>Tổng giá trị hóa đơn</span>
                        <span className="font-mono num">{vnd(i.total)}</span>
                      </div>
                      <div className="flex justify-between text-steel-600">
                        <span>Đã thanh toán</span>
                        <span className="font-mono text-ok-600 num">
                          {vnd(i.amount_paid)}
                        </span>
                      </div>
                      {i.amount_credited > 0 && (
                        <div className="flex justify-between text-steel-600">
                          <span>Đã giảm trừ / Ghi có</span>
                          <span className="font-mono num">
                            −{vnd(i.amount_credited)}
                          </span>
                        </div>
                      )}
                      <div className="flex items-baseline justify-between rounded-xl border border-brass-500/35 bg-paper px-4 py-3 pt-3">
                        <span className="font-bold text-ink-950">
                          Còn phải thanh toán
                        </span>
                        <span
                          className={cn(
                            'font-mono text-xl font-extrabold num',
                            late
                              ? 'text-bad-600'
                              : unpaid
                                ? 'text-ink-950'
                                : 'text-ok-600',
                          )}
                        >
                          {vnd(i.balance_due)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>

              {/* Right Sidebar: Payment Gateway Panel & Transaction History */}
              <div className="space-y-5">
                <Card className="overflow-hidden border-brass-500/40">
                  <div className="border-b hairline bg-paper/70 px-5 py-4">
                    <h3 className="text-base font-extrabold text-ink-950">
                      Thông tin thanh toán
                    </h3>
                  </div>
                  <div className="space-y-4 p-5">
                    <dl className="grid grid-cols-2 gap-3 rounded-xl border hairline bg-paper/50 p-3.5 text-xs">
                      <div>
                        <dt className="text-steel-500">Ngày phát hành</dt>
                        <dd className="mt-0.5 font-bold text-ink-950 num">
                          {fmtDate(i.issue_date)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-steel-500">Hạn thanh toán</dt>
                        <dd
                          className={cn(
                            'mt-0.5 font-bold num',
                            late ? 'text-bad-600' : 'text-ink-950',
                          )}
                        >
                          {fmtDate(i.due_date)}
                        </dd>
                      </div>
                    </dl>

                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-steel-500">
                        Số tiền cần thanh toán
                      </p>
                      <p
                        className={cn(
                          'mt-1 font-mono text-3xl font-extrabold tracking-tight num',
                          late ? 'text-bad-600' : 'text-ink-950',
                        )}
                      >
                        {vnd(i.balance_due)}
                      </p>
                    </div>

                    {unpaid ? (
                      <div className="space-y-3">
                        <Button
                          variant="primary"
                          size="lg"
                          className="w-full"
                          loading={pay.isPending}
                          icon={<CreditCard className="size-5" />}
                          onClick={() => pay.mutate(undefined)}
                        >
                          Thanh toán ngay
                        </Button>
                        <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-steel-500">
                          <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-ok-600" />
                          <span>
                            Hỗ trợ thẻ ATM nội địa, QR ngân hàng &amp; thẻ quốc tế. Tự động gạch nợ và mở khóa kho ngay sau khi giao dịch thành công.
                          </span>
                        </p>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-ok-600/20 bg-ok-100/60 p-3.5 text-xs font-medium text-ok-600">
                        ✓ Hóa đơn này đã được tất toán đầy đủ. Bạn có thể tải bản PDF lưu trữ ở góc trên.
                      </div>
                    )}
                  </div>
                </Card>

                {paymentRows.length > 0 && (
                  <Card className="overflow-hidden">
                    <CardHead title="Lịch sử giao dịch gạch nợ" />
                    <ul className="divide-y divide-steel-100 text-sm">
                      {paymentRows.map((p: any, idx: number) => (
                        <li
                          key={p.id ?? idx}
                          className="flex items-center justify-between gap-2 px-5 py-3"
                        >
                          <div>
                            <span className="code font-bold text-ink-950">
                              {p.code}
                            </span>
                            {p.paid_at && (
                              <span className="block text-xs text-steel-500 num">
                                {fmtDateTime(p.paid_at)}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-ok-600 num">
                              {vnd(p.amount)}
                            </span>
                            {p.receiptId && (
                              <Button
                                size="xs"
                                variant="ghost"
                                icon={<Receipt className="size-3.5" />}
                                onClick={() =>
                                  void openAuthed(
                                    `/payments/${p.receiptId}/receipt`,
                                    `${p.code}.pdf`,
                                  )
                                }
                              >
                                PDF
                              </Button>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}
              </div>
            </div>
          </div>
        );
      }}
    </Async>
  );
}
