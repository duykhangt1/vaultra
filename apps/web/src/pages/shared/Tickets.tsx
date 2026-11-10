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

const OPEN_STATUSES = 'NEW,ASSIGNED,IN_PROGRESS,WAITING_CUSTOMER,REOPENED';
const CLOSED_STATUSES = 'RESOLVED,CLOSED,CANCELLED';

function categoryIcon(cat?: string) {
  switch (cat) {
    case 'ACCESS_CODE':
    case 'LOCK_KEY':
      return <KeyRound className="size-4" />;
    case 'UNIT_DAMAGE':
      return <Wrench className="size-4" />;
    case 'PAYMENT':
      return <Receipt className="size-4" />;
    case 'CONTRACT':
      return <FileText className="size-4" />;
    case 'STORED_ITEMS':
      return <Package className="size-4" />;
    default:
      return <LifeBuoy className="size-4" />;
  }
}

export function TicketList({ base, staff }: { base: string; staff?: boolean }) {
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams(); // the open/closed view survives Back from a ticket
  const view = (['open', 'closed', 'all'].includes(sp.get('view') ?? '') ? sp.get('view') : 'open') as
    | 'open'
    | 'closed'
    | 'all';
  const setView = (v: string) =>
    setSp(
      (p) => {
        const n = new URLSearchParams(p);
        v === 'open' ? n.delete('view') : n.set('view', v);
        return n;
      },
      { replace: true },
    );
  const breached = sp.get('breached') === '1';
  const [esc, setEsc] = useState(false);
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [assignee, setAssignee] = useState('');
  const [qs, setQs] = useState('');
  const [open, setOpen] = useState(false);
  const viewStatus = view === 'open' ? OPEN_STATUSES : view === 'closed' ? CLOSED_STATUSES : undefined;

  const handleStatusChange = (val: string) => {
    setStatus(val);
    if (!val) return;
    if (view === 'open' && CLOSED_STATUSES.split(',').includes(val)) setView('all');
    if (view === 'closed' && OPEN_STATUSES.split(',').includes(val)) setView('all');
  };

  return (
    <div className="space-y-6">
      <div className="grain blueprint-dark relative overflow-hidden rounded-2xl border border-ink-800 bg-ink-950 p-5 text-white shadow-[var(--shadow-card)] sm:p-6">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brass-600 via-brass-400 to-brass-600" />
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-brass-400/35 bg-brass-500/15 text-brass-400">
              <LifeBuoy className="size-5" />
            </span>
            <div>
              <h1 className="display text-2xl text-white sm:text-3xl">
                {staff ? 'Phiếu hỗ trợ kỹ thuật & Vận hành' : 'Yêu cầu hỗ trợ của tôi'}
              </h1>
              <p className="mt-1 text-sm text-steel-300">
                {staff
                  ? 'Tiếp nhận, phân công, theo dõi hạn xử lý và phản hồi khách thuê.'
                  : 'Gửi yêu cầu cấp lại mã PIN, kiểm tra kho, hóa đơn và theo dõi phản hồi trực tuyến.'}
              </p>
            </div>
          </div>
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setOpen(true)}>
            {staff ? 'Tạo phiếu mới' : 'Tạo yêu cầu'}
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden">
        <PagedTable
          path="/tickets"
          query={{
            status: status || viewStatus,
            category: category || undefined,
            assignee: assignee || undefined,
            escalated: esc ? '1' : undefined,
            breached: breached ? '1' : undefined,
            q: qs || undefined,
          }}
          onRow={(r: any) => nav(`${base}/${r.id}`)}
          empty={
            <EmptyState
              icon={<LifeBuoy className="size-6" />}
              title={
                status
                  ? `Không có phiếu nào ở trạng thái "${STATUS.ticket[status]?.[0] ?? status}"`
                  : view === 'open'
                    ? 'Không có phiếu nào đang mở'
                    : view === 'closed'
                      ? 'Chưa có phiếu nào đã xong'
                      : 'Chưa có phiếu hỗ trợ'
              }
              hint={
                staff
                  ? 'Phiếu mới của khách và phiếu bạn tạo sẽ hiện ở đây.'
                  : 'Mất mã PIN, hư hại kho, câu hỏi hóa đơn: tạo yêu cầu và theo dõi tiến độ tại đây.'
              }
              action={
                view !== 'closed' ? (
                  <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
                    {staff ? 'Tạo phiếu' : 'Tạo yêu cầu'}
                  </Button>
                ) : undefined
              }
            />
          }
          toolbar={
            <div className="flex flex-wrap items-center gap-2.5 border-b hairline bg-paper/55 px-4 py-3">
              <div className="overflow-x-auto">
                <Tabs
                  value={view}
                  onChange={(v) => {
                    setView(v);
                    setStatus('');
                  }}
                  tabs={[
                    { value: 'open', label: 'Đang mở' },
                    { value: 'closed', label: 'Đã xong' },
                    { value: 'all', label: 'Tất cả' },
                  ]}
                />
              </div>
              <div className="relative w-52">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-steel-400" />
                <Input
                  className="w-52 pl-9"
                  placeholder="Tìm mã / tiêu đề…"
                  value={qs}
                  onChange={(e) => setQs(e.target.value)}
                  aria-label="Tìm"
                />
              </div>
              <Select
                className="w-44"
                value={status}
                onChange={(e) => handleStatusChange(e.target.value)}
                aria-label="Trạng thái"
              >
                <option value="">Mọi trạng thái</option>
                {Object.entries(STATUS.ticket).map(([k, [l]]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </Select>
              <Select
                className="w-44"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                aria-label="Loại"
              >
                <option value="">Mọi loại vấn đề</option>
                {CATS.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </option>
                ))}
              </Select>
              {breached && (
                <button
                  type="button"
                  onClick={() =>
                    setSp(
                      (p) => {
                        const n = new URLSearchParams(p);
                        n.delete('breached');
                        return n;
                      },
                      { replace: true },
                    )
                  }
                  className="inline-flex items-center gap-1.5 rounded-full border border-bad-600/30 bg-bad-100 px-3 py-1.5 text-xs font-bold text-bad-600 transition hover:bg-bad-600 hover:text-white"
                >
                  <AlertTriangle className="size-3.5" />
                  Đang lọc: trễ SLA ✕
                </button>
              )}
              {staff && (
                <button
                  type="button"
                  onClick={() => setEsc((v) => !v)}
                  className={cn(
                    'inline-flex h-10 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition',
                    esc
                      ? 'border-warn-600 bg-warn-100 text-warn-600'
                      : 'border-steel-300 bg-white text-ink-900 hover:border-ink-900',
                  )}
                >
                  <AlertTriangle className="size-3.5" />
                  Đã leo thang
                </button>
              )}
              {staff && (
                <Select
                  className="w-44"
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                  aria-label="Phụ trách"
                >
                  <option value="">Mọi người phụ trách</option>
                  <option value="me">Của tôi</option>
                  <option value="none">Chưa phân công</option>
                </Select>
              )}
            </div>
          }
          cols={[
            {
              key: 'c',
              header: 'Mã phiếu',
              cell: (r: any) => (
                <span className="code inline-block rounded-md border hairline bg-paper px-2 py-0.5 font-bold text-ink-950">
                  {r.code}
                </span>
              ),
            },
            {
              key: 'sub',
              header: 'Nội dung & Phân loại',
              cell: (r: any) => (
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border hairline bg-paper text-ink-800">
                    {categoryIcon(r.category)}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {r.escalation_level > 0 && (
                        <Badge tone="warn">
                          {r.escalation_level >= 2 ? 'Leo thang BOM' : 'Leo thang FM'}
                        </Badge>
                      )}
                      <span className="line-clamp-1 font-bold text-ink-950">{r.subject}</span>
                    </div>
                    <span className="mt-0.5 block text-xs text-steel-500">
                      {CATEGORY_LABEL[r.category] ?? r.category}
                      {staff && r.customer?.full_name ? ` · Khách: ${r.customer.full_name}` : ''}
                    </span>
                  </div>
                </div>
              ),
            },
            {
              key: 'p',
              header: 'Ưu tiên',
              hideBelow: 'md',
              cell: (r: any) => <StatusBadge kind="priority" value={r.priority} />,
            },
            {
              key: 'sla',
              header: 'Hạn xử lý (SLA)',
              hideBelow: 'md',
              cell: (r: any) => {
                if (['RESOLVED', 'CLOSED', 'CANCELLED'].includes(r.status)) {
                  return <span className="text-steel-400">—</span>;
                }
                const resOverdue =
                  r.resolution_due_at && new Date(r.resolution_due_at).getTime() < Date.now();
                const bad = r.sla_breached || resOverdue;
                return (
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 text-xs',
                      bad ? 'font-bold text-bad-600' : 'font-medium text-steel-600',
                    )}
                  >
                    <Clock className="size-3.5 shrink-0" />
                    {resOverdue
                      ? `Trễ hạn · ${relTime(r.resolution_due_at)}`
                      : r.sla_breached
                        ? `${relTime(r.resolution_due_at)} · Trễ phản hồi`
                        : relTime(r.resolution_due_at)}
                  </span>
                );
              },
            },
            {
              key: 's',
              header: 'Trạng thái',
              cell: (r: any) => <StatusBadge kind="ticket" value={r.status} />,
            },
          ]}
        />
      </Card>
      <CreateTicket open={open} onClose={() => setOpen(false)} staff={staff} onCreated={(id) => nav(`${base}/${id}`)} />
    </div>
  );
}

function CreateTicket({
  open,
  onClose,
  staff,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  staff?: boolean;
  onCreated: (id: string) => void;
}) {
  const [f, setF] = useState({
    category: 'OTHER',
    subject: '',
    description: '',
    contractId: '',
    priority: 'MEDIUM',
  });
  const [photos, setPhotos] = useState<Photo[]>([]);
  const contracts = useGet<{ data: any[] }>(open ? '/contracts' : null, { 'page[size]': 50 });
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));
  const create = useAct(
    () =>
      post('/tickets', {
        ...f,
        contractId: f.contractId || undefined,
        priority: staff ? f.priority : undefined,
        attachmentIds: photos.map((p) => p.id),
      }),
    {
      ok: 'Đã tạo phiếu',
      invalidate: ['/tickets', '/notifications'],
      onSuccess: (t) => {
        setPhotos([]);
        onClose();
        onCreated(t.id);
      },
    },
  );
  const valid = f.subject.trim().length >= 4 && f.description.trim().length >= 10 && f.contractId;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Tạo yêu cầu hỗ trợ"
      description="Mô tả rõ tình trạng kho, mã truy cập hoặc hóa đơn để bộ phận vận hành xử lý nhanh nhất."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Đóng
          </Button>
          <Button variant="primary" disabled={!valid} loading={create.isPending} onClick={() => create.mutate(undefined)}>
            Gửi yêu cầu
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <Field label="Hợp đồng liên quan" required>
          <Select value={f.contractId} onChange={(e) => set('contractId', e.target.value)}>
            <option value="">— Chọn hợp đồng thuê kho —</option>
            {contracts.data?.data.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} · {c.unit?.code ?? ''} · {c.facility?.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className={cn('grid gap-3.5', staff && 'sm:grid-cols-2')}>
          <Field label="Loại vấn đề" required>
            <Select value={f.category} onChange={(e) => set('category', e.target.value)}>
              {CATS.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </Select>
          </Field>
          {staff && (
            <Field label="Mức độ ưu tiên">
              <Select value={f.priority} onChange={(e) => set('priority', e.target.value)}>
                {['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </Select>
            </Field>
          )}
        </div>
        <Field label="Tiêu đề" required hint="Tối thiểu 4 ký tự">
          <Input value={f.subject} maxLength={200} onChange={(e) => set('subject', e.target.value)} placeholder="VD: Xin cấp lại mã PIN mở kho" />
        </Field>
        <Field label="Mô tả chi tiết" required hint="Tối thiểu 10 ký tự">
          <Textarea
            rows={4}
            maxLength={4000}
            value={f.description}
            onChange={(e) => set('description', e.target.value)}
            placeholder="Nêu chi tiết vấn đề bạn đang gặp phải…"
          />
        </Field>
        <Field label="Ảnh đính kèm (tùy chọn)">
          <PhotoUpload value={photos} onChange={setPhotos} purpose="ticket" />
        </Field>
      </div>
    </Modal>
  );
}

const STAFF_QUICK_HINTS = [
  'báo khách đã cấp lại mã PIN mới trong mục Hợp đồng của tôi',
  'báo khách đã mở khóa kho và có thể ra vào bình thường',
  'đã kiểm tra camera và hiện trạng kho an toàn, nguyên vẹn',
  'hướng dẫn khách thanh toán hóa đơn qua VNPay hoặc tại quầy',
  'mời khách đặt lịch hẹn qua quầy lễ tân để nhân viên hỗ trợ trực tiếp',
];

export function TicketDetail({ back, staff }: { back: string; staff?: boolean }) {
  const { id } = useParams();
  const q = useGet<any>(`/tickets/${id}`);
  const can = useAuth((s) => s.can);
  const [body, setBody] = useState('');
  const [internal, setInternal] = useState(false);
  const [replyPhotos, setReplyPhotos] = useState<Photo[]>([]);
  const [summary, setSummary] = useState<string | null>(null);

  const send = useAct(
    () =>
      post(`/tickets/${id}/messages`, {
        body: body.trim() || 'Đã gửi hình ảnh đính kèm.',
        isInternal: internal,
        attachmentIds: replyPhotos.map((p) => p.id),
      }),
    {
      invalidate: ['/tickets'],
      onSuccess: () => {
        setBody('');
        setReplyPhotos([]);
      },
    },
  );

  const genSummary = useAct(() => post(`/tickets/${id}/assistant/summary`, {}), {
    onSuccess: (r: any) => setSummary(r.text),
  });

  const genReply = useAct(
    (customHint?: string) =>
      post(`/tickets/${id}/assistant/reply-draft`, {
        prompt: typeof customHint === 'string' ? customHint.trim() : body.trim(),
      }),
    {
      ok: 'AI đã viết xong phản hồi khách hàng!',
      onSuccess: (r: any) => {
        if (r?.text) setBody(r.text);
      },
    },
  );

  const act = (kind: string, extra?: any) => post(`/tickets/${id}/${kind}`, extra ?? {});

  return (
    <Async q={q}>
      {(t) => {
        const closed = ['CLOSED', 'CANCELLED'].includes(t.status);
        return (
          <div className="space-y-6">
            <div>
              <Link
                to={back}
                className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-steel-500 transition hover:text-ink-900"
              >
                <ArrowLeft className="size-4" />
                {staff ? 'Danh sách phiếu hỗ trợ' : 'Quay lại hỗ trợ'}
              </Link>

              {/* Executive Ticket Banner */}
              <div className="grain blueprint-dark relative overflow-hidden rounded-2xl border border-ink-800 bg-ink-950 p-5 text-white shadow-[var(--shadow-card)] sm:p-6">
                <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brass-600 via-brass-400 to-brass-600" />
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="code rounded-lg border border-brass-400/40 bg-brass-500/15 px-2.5 py-1 text-xs font-bold text-brass-400">
                        {t.code}
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/8 px-3 py-0.5 text-xs font-medium text-steel-200">
                        {categoryIcon(t.category)}
                        {CATEGORY_LABEL[t.category] ?? t.category}
                      </span>
                      {t.escalation_level > 0 && (
                        <Badge tone="warn">
                          {t.escalation_level >= 2 ? 'Đã leo thang lên BOM' : 'Đã leo thang lên quản lý cơ sở'}
                        </Badge>
                      )}
                    </div>
                    <h1 className="display text-xl text-white sm:text-2xl">{t.subject}</h1>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-steel-300">
                      <span>Tạo lúc {fmtDateTime(t.created_at)}</span>
                      {t.facility?.name && (
                        <span className="inline-flex items-center gap-1">
                          <Building2 className="size-3.5 text-brass-400" />
                          {t.facility.name}
                        </span>
                      )}
                      {t.contract && (
                        <span className="inline-flex items-center gap-1">
                          <FileText className="size-3.5 text-brass-400" />
                          {t.contract.code}
                          {t.contract.unit?.code ? ` · Kho ${t.contract.unit.code}` : ''}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge kind="priority" value={t.priority} />
                    <StatusBadge kind="ticket" value={t.status} />
                  </div>
                </div>
              </div>
            </div>

            {t.escalation_level > 0 && !closed && (
              <Alert
                tone="warn"
                title={
                  t.escalation_level >= 2
                    ? 'Phiếu đang chờ quản lý vận hành (BOM)'
                    : 'Phiếu đã được chuyển cho quản lý cơ sở'
                }
              >
                {(() => {
                  const e = [...(t.events ?? [])].reverse().find((x: any) => x.event === 'ESCALATED');
                  const why = e?.data?.reason;
                  return why ? `Lý do: ${why}` : 'Quản lý đã nhận thông báo và có thể xử lý phiếu này.';
                })()}
              </Alert>
            )}

            <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
              <div className="space-y-5">
                {/* Original Request Card */}
                <Card>
                  <CardHead
                    title={
                      <span className="inline-flex items-center gap-2">
                        <FileText className="size-4 text-brass-600" />
                        Nội dung yêu cầu ban đầu
                      </span>
                    }
                    action={
                      t.customer?.full_name ? (
                        <span className="inline-flex items-center gap-2 text-xs font-medium text-steel-500">
                          <Avatar name={t.customer.full_name} size={22} />
                          <span className="font-semibold text-ink-900">{t.customer.full_name}</span>
                        </span>
                      ) : undefined
                    }
                  />
                  <div className="p-5">
                    <div className="rounded-xl border hairline bg-paper/65 p-4 text-sm leading-relaxed text-ink-900">
                      <p className="whitespace-pre-wrap">{t.description}</p>
                    </div>
                    {t.attachments?.length > 0 && (
                      <div className="mt-4 border-t hairline pt-4">
                        <p className="mb-2.5 text-xs font-bold uppercase tracking-wider text-steel-500">
                          Hình ảnh / tệp đính kèm ({t.attachments.length})
                        </p>
                        <PhotoGallery photos={t.attachments} size="md" />
                      </div>
                    )}
                  </div>
                </Card>

                {/* Concierge Thread + AI Reply Studio */}
                <Card>
                  <CardHead
                    title={
                      <span className="inline-flex items-center gap-2">
                        <MessageSquare className="size-4 text-brass-600" />
                        Luồng trao đổi & Xử lý
                        {t.messages?.length > 0 && (
                          <span className="rounded-full bg-steel-100 px-2 py-0.5 text-xs font-bold text-steel-600 num">
                            {t.messages.length}
                          </span>
                        )}
                      </span>
                    }
                    sub="Lịch sử phản hồi giữa khách thuê và bộ phận vận hành cơ sở"
                    action={
                      staff ? (
                        <Button
                          size="xs"
                          variant="outline"
                          icon={<Sparkles className="size-3.5 text-brass-600" />}
                          loading={genSummary.isPending}
                          onClick={() => genSummary.mutate(undefined)}
                        >
                          Tóm tắt AI
                        </Button>
                      ) : undefined
                    }
                  />
                  <div className="space-y-4 p-5">
                    {summary && (
                      <div className="grain relative overflow-hidden rounded-xl border border-brass-500/45 bg-ink-950 p-4 text-white shadow-xs">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-brass-400">
                            <Sparkles className="size-3.5" />
                            Tóm tắt nhanh từ Trợ lý AI
                          </span>
                          <button
                            type="button"
                            onClick={() => setSummary(null)}
                            className="text-xs text-steel-400 hover:text-white"
                          >
                            Ẩn
                          </button>
                        </div>
                        <p className="whitespace-pre-line text-[13px] leading-relaxed text-steel-200">{summary}</p>
                      </div>
                    )}

                    {t.messages?.length ? (
                      <div className="space-y-3">
                        {t.messages.map((m: any) => {
                          const isInternal = Boolean(m.is_internal);
                          const isCustomer = Boolean(m.from_customer);
                          return (
                            <div
                              key={m.id}
                              className={cn(
                                'rounded-2xl p-4 text-sm transition',
                                isInternal
                                  ? 'border border-dashed border-warn-600/55 bg-warn-100/45'
                                  : isCustomer
                                    ? 'border hairline bg-paper/75'
                                    : 'border border-ink-900/15 border-l-[3px] border-l-brass-500 bg-gradient-to-br from-ok-100/55 via-white to-brass-100/20 shadow-2xs',
                              )}
                            >
                              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-steel-500">
                                <div className="flex flex-wrap items-center gap-2">
                                  <Avatar name={m.author?.full_name ?? 'Hệ thống'} size={24} />
                                  <b className="text-[13px] text-ink-950">{m.author?.full_name ?? 'Hệ thống'}</b>
                                  {m.author?.role_label ? (
                                    <Badge tone={isCustomer ? 'neutral' : 'brass'}>{m.author.role_label}</Badge>
                                  ) : !isCustomer && !isInternal ? (
                                    <Badge tone="brass">Ban vận hành</Badge>
                                  ) : null}
                                  {isInternal && (
                                    <Badge tone="warn">
                                      <Lock className="mr-1 size-3" />
                                      Ghi chú nội bộ
                                    </Badge>
                                  )}
                                </div>
                                <span className="font-medium text-steel-400">{relTime(m.created_at)}</span>
                              </div>
                              <p className="whitespace-pre-wrap leading-relaxed text-ink-900">{m.body}</p>
                              {m.attachments?.length > 0 && (
                                <div className="mt-3 border-t hairline pt-2.5">
                                  <PhotoGallery photos={m.attachments} size="md" />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed border-steel-300 bg-paper/50 px-4 py-8 text-center text-sm text-steel-500">
                        Chưa có phản hồi nào trong luồng trao đổi này.
                      </div>
                    )}

                    {!closed && (
                      <div className="space-y-3 border-t hairline pt-4">
                        {/* Prominent AI Quick-Reply Studio Bar for Staff */}
                        {staff && (
                          <div className="grain relative overflow-hidden rounded-2xl border border-brass-500/45 bg-gradient-to-br from-ink-950 via-ink-900 to-[#142842] p-4 text-white shadow-[var(--shadow-card)]">
                            <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-brass-600 via-brass-400 to-brass-600" />
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div className="flex items-start gap-2.5">
                                <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border border-brass-400/40 bg-brass-500/20 text-brass-400">
                                  <Sparkles className="size-4" />
                                </span>
                                <div>
                                  <p className="text-xs font-bold text-brass-400">
                                    Gợi ý soạn phản hồi nhanh
                                  </p>
                                  <p className="mt-0.5 text-xs text-steel-300">
                                    Nhập vài từ khóa ý chính vào ô bên dưới rồi bấm <b className="text-white">Gen phản hồi AI</b>, hoặc chọn kịch bản mẫu:
                                  </p>
                                </div>
                              </div>
                              <Button
                                size="sm"
                                variant="primary"
                                icon={<Sparkles className="size-3.5" />}
                                loading={genReply.isPending}
                                onClick={() => genReply.mutate(body)}
                              >
                                Gen phản hồi AI
                              </Button>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-1.5">
                              {STAFF_QUICK_HINTS.map((h) => (
                                <button
                                  key={h}
                                  type="button"
                                  disabled={genReply.isPending}
                                  onClick={() => {
                                    setBody(h);
                                    genReply.mutate(h);
                                  }}
                                  className="rounded-full border border-white/15 bg-white/8 px-3 py-1 text-[11.5px] font-medium text-steel-200 transition hover:border-brass-400 hover:bg-brass-500/20 hover:text-white disabled:opacity-50"
                                >
                                  + {h}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        <div
                          className={cn(
                            'rounded-2xl border p-3.5 transition',
                            internal ? 'border-warn-600/50 bg-warn-100/25' : 'hairline bg-paper/45',
                          )}
                        >
                          <Textarea
                            rows={4}
                            value={body}
                            maxLength={4000}
                            onChange={(e) => setBody(e.target.value)}
                            placeholder={
                              staff
                                ? internal
                                  ? 'Nhập ghi chú nội bộ (chỉ nhân sự Vaultra nhìn thấy, không gửi cho khách thuê)…'
                                  : 'Gõ vài chữ ý chính (VD: "báo khách đã mở khóa kho và cấp lại mã pin") rồi bấm "Gen phản hồi AI" để bot viết hoàn chỉnh…'
                                : 'Nhập nội dung phản hồi gửi bộ phận hỗ trợ…'
                            }
                            aria-label="Nội dung"
                            className="bg-white"
                          />
                          <div className="mt-2.5">
                            <PhotoUpload value={replyPhotos} onChange={setReplyPhotos} purpose="ticket_message" label="Đính kèm ảnh" />
                          </div>
                          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t hairline pt-3">
                            <div className="flex items-center gap-3">
                              {staff && (
                                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border hairline bg-white px-3 py-1.5 text-xs font-semibold text-ink-900 transition hover:border-ink-900">
                                  <input
                                    type="checkbox"
                                    className="size-3.5 accent-ink-900"
                                    checked={internal}
                                    onChange={(e) => setInternal(e.target.checked)}
                                  />
                                  <Lock className="size-3.5 text-warn-600" />
                                  Ghi chú nội bộ
                                </label>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              {staff && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  icon={<Sparkles className="size-4 text-brass-600" />}
                                  loading={genReply.isPending}
                                  onClick={() => genReply.mutate(body)}
                                >
                                  Gen phản hồi AI
                                </Button>
                              )}
                              <Button
                                variant="primary"
                                size="sm"
                                icon={<Send className="size-4" />}
                                disabled={!body.trim() && replyPhotos.length === 0}
                                loading={send.isPending}
                                onClick={() => send.mutate(undefined)}
                              >
                                {internal ? 'Lưu ghi chú nội bộ' : 'Gửi phản hồi'}
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </Card>
              </div>

              {/* Right Sidebar: Metadata + SLA + Workflow Controls */}
              <aside className="space-y-4">
                <Card>
                  <CardHead
                    title="Hồ sơ & Cam kết SLA"
                    action={
                      t.sla_breached ? (
                        <Badge tone="bad" dot>
                          Quá hạn SLA
                        </Badge>
                      ) : !closed ? (
                        <Badge tone="ok" dot>
                          Trong hạn SLA
                        </Badge>
                      ) : undefined
                    }
                  />
                  <dl className="divide-y hairline px-5 py-2 text-sm">
                    {[
                      ['Khách thuê', t.customer?.full_name ?? '—'],
                      [
                        'Hợp đồng & Kho',
                        t.contract ? (
                          <span className="code font-semibold text-ink-950">
                            {t.contract.code}
                            {t.contract.unit?.code ? ` · ${t.contract.unit.code}` : ''}
                          </span>
                        ) : (
                          '—'
                        ),
                      ],
                      ['Cơ sở', t.facility?.name ?? '—'],
                      [
                        'Nhân sự phụ trách',
                        <span className="inline-flex items-center gap-1.5 font-medium">
                          <UserCheck className="size-3.5 text-brass-600" />
                          {t.assignee?.full_name ?? 'Chưa phân công'}
                        </span>,
                      ],
                      ['Hạn phản hồi đầu', fmtDateTime(t.first_response_due_at)],
                      ['Hạn giải quyết', fmtDateTime(t.resolution_due_at)],
                    ].map(([k, v], idx) => (
                      <div key={idx} className="flex items-start justify-between gap-3 py-2.5">
                        <dt className="text-xs font-semibold text-steel-500">{k}</dt>
                        <dd className="text-right text-xs font-semibold text-ink-950">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </Card>

                <Card>
                  <CardHead
                    title={
                      <span className="inline-flex items-center gap-2">
                        <CheckCircle2 className="size-4 text-brass-600" />
                        Thao tác xử lý
                      </span>
                    }
                    sub="Chuyển trạng thái quy trình phiếu"
                  />
                  <div className="flex flex-wrap gap-2 p-4">
                    {staff && can('support.handle') && (
                      <>
                        {!t.assignee && !closed && (
                          <ActBtn
                            label="Nhận xử lý"
                            variant="primary"
                            run={() => act('claim')}
                            ok="Đã nhận phiếu"
                            invalidate={['/tickets']}
                          />
                        )}
                        {['NEW', 'ASSIGNED'].includes(t.status) && (
                          <ActBtn label="Bắt đầu" run={() => act('start')} invalidate={['/tickets']} />
                        )}
                        {t.status === 'IN_PROGRESS' && (
                          <ActBtn label="Chờ khách" run={() => act('wait-customer')} invalidate={['/tickets']} />
                        )}
                        {!closed && (
                          <ActBtn
                            label="Leo thang"
                            title="Leo thang phiếu"
                            fields={[REASON]}
                            run={(v) => act('escalate', v)}
                            ok="Đã leo thang"
                            invalidate={['/tickets']}
                          />
                        )}
                        {!['RESOLVED', ...(closed ? ['x'] : [])].includes(t.status) && !closed && (
                          <ActBtn
                            label="Đã giải quyết"
                            variant="primary"
                            title="Đóng vấn đề"
                            fields={[
                              { name: 'resolutionCode', label: 'Kết quả', type: 'select', required: true, options: RES_CODES },
                              { name: 'resolutionNote', label: 'Ghi chú', type: 'textarea', required: true },
                              {
                                name: 'photoIds',
                                label:
                                  t.category === 'UNIT_DAMAGE'
                                    ? 'Ảnh sau khắc phục (bắt buộc cho hư hỏng kho)'
                                    : 'Ảnh minh chứng',
                                type: 'photos',
                                required: t.category === 'UNIT_DAMAGE',
                              },
                            ]}
                            run={(v) => act('resolve', v)}
                            ok="Đã giải quyết"
                            invalidate={['/tickets']}
                          />
                        )}
                        {t.status === 'RESOLVED' && (
                          <ActBtn label="Đóng phiếu" run={() => act('close')} invalidate={['/tickets']} />
                        )}
                      </>
                    )}
                    {t.status === 'RESOLVED' && !staff && (
                      <>
                        <ActBtn label="Đóng phiếu" run={() => act('close')} invalidate={['/tickets']} />
                        <ActBtn
                          label="Mở lại"
                          title="Mở lại phiếu"
                          fields={[REASON]}
                          run={(v) => act('reopen', v)}
                          invalidate={['/tickets']}
                        />
                      </>
                    )}
                    {['RESOLVED', 'CLOSED'].includes(t.status) && !t.rating && !staff && (
                      <ActBtn
                        label="Đánh giá"
                        title="Đánh giá hỗ trợ"
                        fields={[
                          { name: 'stars', label: 'Số sao (1–5)', type: 'number', min: 1, max: 5, required: true, def: 5 },
                          { name: 'note', label: 'Nhận xét', type: 'textarea' },
                        ]}
                        run={(v) => act('rate', v)}
                        ok="Cảm ơn bạn đã đánh giá"
                        invalidate={['/tickets']}
                      />
                    )}
                    {!closed && t.status !== 'RESOLVED' && !staff && (
                      <ActBtn
                        label="Hủy yêu cầu"
                        danger
                        title="Hủy yêu cầu"
                        fields={[REASON]}
                        run={(v) => act('cancel', v)}
                        ok="Đã hủy yêu cầu hỗ trợ"
                        invalidate={['/tickets', '/notifications']}
                      />
                    )}
                    {staff && t.status === 'CLOSED' && (
                      <ActBtn
                        label="Mở lại"
                        fields={[REASON]}
                        run={(v) => act('reopen', v)}
                        invalidate={['/tickets']}
                      />
                    )}
                  </div>
                </Card>
              </aside>
            </div>
          </div>
        );
      }}
    </Async>
  );
}
