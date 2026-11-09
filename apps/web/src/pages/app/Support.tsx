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

const CAT_META: Record<
  string,
  { icon: JSX.Element; badgeCls: string; quickDesc: string }
> = {
  ACCESS_CODE: {
    icon: <KeyRound className="size-4" />,
    badgeCls: 'bg-[#091320] text-brass-400 border-brass-500/40',
    quickDesc: 'Quên PIN, lỗi mở cổng hoặc cấp lại mã truy cập',
  },
  LOCK_KEY: {
    icon: <Lock className="size-4" />,
    badgeCls: 'bg-brass-100/70 text-brass-700 border-brass-500/30',
    quickDesc: 'Kẹt chốt khóa từ xa, mất thẻ từ hoặc ổ khóa',
  },
  UNIT_DAMAGE: {
    icon: <AlertTriangle className="size-4" />,
    badgeCls: 'bg-bad-100 text-bad-600 border-bad-600/25',
    quickDesc: 'Báo cáo sự cố cửa cuốn, vách ngăn, ánh sáng kho',
  },
  STORED_ITEMS: {
    icon: <Package className="size-4" />,
    badgeCls: 'bg-info-100 text-info-600 border-info-600/25',
    quickDesc: 'Kiểm tra an toàn tài sản lưu trữ & camera',
  },
  PAYMENT: {
    icon: <CreditCard className="size-4" />,
    badgeCls: 'bg-ok-100 text-ok-600 border-ok-600/25',
    quickDesc: 'Tra soát giao dịch, hóa đơn VAT & hoàn cọc',
  },
  CONTRACT: {
    icon: <FileText className="size-4" />,
    badgeCls: 'bg-paper-2 text-ink-900 border-steel-300',
    quickDesc: 'Thủ tục gia hạn, đổi diện tích kho hoặc trả kho',
  },
  OTHER: {
    icon: <LifeBuoy className="size-4" />,
    badgeCls: 'bg-steel-100 text-steel-600 border-steel-200',
    quickDesc: 'Câu hỏi vận hành và hỗ trợ chung tại cơ sở',
  },
};

function CategoryIconBadge({ category }: { category: string }) {
  const meta = CAT_META[category] ?? CAT_META.OTHER;
  return (
    <span
      className={cn(
        'grid size-9 shrink-0 place-items-center rounded-xl border',
        meta.badgeCls,
      )}
    >
      {meta.icon}
    </span>
  );
}

export function Support() {
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const view = (
    ['open', 'closed', 'all'].includes(sp.get('view') ?? '')
      ? sp.get('view')
      : 'open'
  ) as 'open' | 'closed' | 'all';

  const setView = (v: string) =>
    setSp(
      (p) => {
        const n = new URLSearchParams(p);
        v === 'open' ? n.delete('view') : n.set('view', v);
        return n;
      },
      { replace: true },
    );

  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [qs, setQs] = useState('');
  const [open, setOpen] = useState(false);
  const [presetCat, setPresetCat] = useState('OTHER');

  const viewStatus =
    view === 'open'
      ? OPEN_STATUSES
      : view === 'closed'
        ? CLOSED_STATUSES
        : undefined;

  const handleStatusChange = (val: string) => {
    setStatus(val);
    if (!val) return;
    if (view === 'open' && CLOSED_STATUSES.split(',').includes(val))
      setView('all');
    if (view === 'closed' && OPEN_STATUSES.split(',').includes(val))
      setView('all');
  };

  const openWithCategory = (cat: string) => {
    setPresetCat(cat);
    setOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Executive Concierge Helpdesk Banner */}
      <section className="relative overflow-hidden rounded-[var(--radius-media)] border border-brass-500/25 bg-[#091320] p-6 text-white shadow-[var(--shadow-card)] sm:p-7">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brass-500 via-brass-400 to-transparent" />
        <div
          className="blueprint-dark pointer-events-none absolute inset-0 opacity-55"
          aria-hidden
        />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <h1 className="display text-[28px] text-white sm:text-[34px]">
              Hỗ trợ khách thuê
            </h1>
            <p className="mt-1.5 text-sm text-steel-300">
              Nhân viên vận hành cơ sở trực tiếp tiếp nhận, kiểm tra kho và phản hồi yêu cầu của bạn.
            </p>
          </div>
          <Button
            variant="primary"
            size="md"
            icon={<Plus className="size-4" />}
            onClick={() => openWithCategory('OTHER')}
          >
            Tạo yêu cầu hỗ trợ
          </Button>
        </div>

        {/* Quick Topic Launcher Cards */}
        <div className="relative mt-6 grid grid-cols-1 gap-2.5 border-t border-white/10 pt-5 sm:grid-cols-2 lg:grid-cols-4">
          {(['ACCESS_CODE', 'LOCK_KEY', 'PAYMENT', 'CONTRACT'] as const).map(
            (cat) => {
              const meta = CAT_META[cat];
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => openWithCategory(cat)}
                  className="group flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3.5 text-left transition hover:border-brass-400/50 hover:bg-white/[0.08]"
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brass-500/20 text-brass-400 transition group-hover:bg-brass-500 group-hover:text-ink-950">
                    {meta.icon}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-white">
                      {CATEGORY_LABEL[cat]}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-steel-400">
                      {meta.quickDesc}
                    </p>
                  </div>
                </button>
              );
            },
          )}
        </div>
      </section>

      <Card className="overflow-hidden">
        <PagedTable
          path="/tickets"
          query={{
            status: status || viewStatus,
            category: category || undefined,
            q: qs || undefined,
          }}
          onRow={(r: any) => nav(`/app/support/${r.id}`)}
          empty={
            <EmptyState
              icon={<LifeBuoy className="size-6" />}
              title={
                status
                  ? `Không có phiếu nào ở trạng thái "${STATUS.ticket[status]?.[0] ?? status}"`
                  : view === 'open'
                    ? 'Không có phiếu hỗ trợ nào đang mở'
                    : view === 'closed'
                      ? 'Chưa có phiếu hỗ trợ đã hoàn tất'
                      : 'Chưa có yêu cầu hỗ trợ nào'
              }
              hint="Cần cấp lại mã PIN, hỗ trợ khóa thông minh, kiểm tra kho hoặc giải đáp hóa đơn? Đội ngũ cơ sở luôn sẵn sàng hỗ trợ bạn."
              action={
                view !== 'closed' ? (
                  <Button
                    variant="primary"
                    size="sm"
                    icon={<Plus className="size-4" />}
                    onClick={() => openWithCategory('OTHER')}
                  >
                    Tạo yêu cầu mới
                  </Button>
                ) : undefined
              }
            />
          }
          toolbar={
            <div className="flex flex-wrap items-center gap-2.5 border-b hairline bg-paper/50 px-4 py-3">
              <div className="overflow-x-auto">
                <Tabs
                  value={view}
                  onChange={(v) => {
                    setView(v);
                    setStatus('');
                  }}
                  tabs={[
                    { value: 'open', label: 'Đang xử lý' },
                    { value: 'closed', label: 'Đã hoàn tất' },
                    { value: 'all', label: 'Tất cả' },
                  ]}
                />
              </div>
              <div className="relative ml-auto w-full sm:w-52">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-steel-400" />
                <Input
                  className="pl-9"
                  placeholder="Tìm mã hoặc tiêu đề…"
                  value={qs}
                  onChange={(e) => setQs(e.target.value)}
                  aria-label="Tìm phiếu hỗ trợ"
                />
              </div>
              <Select
                className="w-44"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                aria-label="Loại vấn đề"
              >
                <option value="">Mọi chủ đề</option>
                {CATS.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </option>
                ))}
              </Select>
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
            </div>
          }
          cols={[
            {
              key: 'sub',
              header: 'Yêu cầu hỗ trợ',
              cell: (r: any) => (
                <div className="flex items-center gap-3">
                  <CategoryIconBadge category={r.category} />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="code font-bold text-brass-700">
                        {r.code}
                      </span>
                      {r.escalation_level > 0 && (
                        <Badge tone="warn">
                          {r.escalation_level >= 2
                            ? 'Quản lý Vận hành'
                            : 'Quản lý Cơ sở'}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-0.5 line-clamp-1 font-bold text-ink-950">
                      {r.subject}
                    </p>
                    <p className="text-xs text-steel-500">
                      {CATEGORY_LABEL[r.category] ?? r.category}
                    </p>
                  </div>
                </div>
              ),
            },
            {
              key: 'p',
              header: 'Mức ưu tiên',
              hideBelow: 'md',
              cell: (r: any) => (
                <StatusBadge kind="priority" value={r.priority} />
              ),
            },
            {
              key: 'sla',
              header: 'Cam kết xử lý',
              hideBelow: 'md',
              cell: (r: any) => {
                if (['RESOLVED', 'CLOSED', 'CANCELLED'].includes(r.status))
                  return <span className="text-steel-400">Đã xong</span>;
                const resOverdue =
                  r.resolution_due_at &&
                  new Date(r.resolution_due_at).getTime() < Date.now();
                return (
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 text-xs font-medium',
                      r.sla_breached || resOverdue
                        ? 'font-bold text-bad-600'
                        : 'text-steel-600',
                    )}
                  >
                    <Clock className="size-3.5" />
                    {resOverdue
                      ? `Quá hạn · ${relTime(r.resolution_due_at)}`
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

      <CreateTicket
        open={open}
        initialCategory={presetCat}
        onClose={() => setOpen(false)}
        onCreated={(id) => nav(`/app/support/${id}`)}
      />
    </div>
  );
}

function CreateTicket({
  open,
  initialCategory = 'OTHER',
  onClose,
  onCreated,
}: {
  open: boolean;
  initialCategory?: string;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [f, setF] = useState({
    category: initialCategory,
    subject: '',
    description: '',
    contractId: '',
  });
  const [photos, setPhotos] = useState<Photo[]>([]);

  useEffect(() => {
    if (open) {
      setF((s) => ({ ...s, category: initialCategory }));
    }
  }, [open, initialCategory]);

  const contracts = useGet<{ data: any[] }>(open ? '/contracts' : null, {
    'page[size]': 50,
  });

  useEffect(() => {
    const list = contracts.data?.data ?? [];
    if (open && !f.contractId && list.length === 1) {
      setF((s) => ({ ...s, contractId: list[0].id }));
    }
  }, [open, contracts.data, f.contractId]);

  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));

  const create = useAct(
    () =>
      post('/tickets', {
        ...f,
        contractId: f.contractId || undefined,
        attachmentIds: photos.map((p) => p.id),
      }),
    {
      ok: 'Đã gửi yêu cầu hỗ trợ đến đội ngũ cơ sở',
      invalidate: ['/tickets', '/notifications'],
      onSuccess: (t) => {
        setPhotos([]);
        setF({
          category: 'OTHER',
          subject: '',
          description: '',
          contractId: '',
        });
        onClose();
        onCreated(t.id);
      },
    },
  );

  const valid =
    f.subject.trim().length >= 4 &&
    f.description.trim().length >= 10 &&
    Boolean(f.contractId);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Gửi yêu cầu hỗ trợ"
      description="Nhân viên vận hành tại cơ sở sẽ nhận thông báo và phản hồi trực tiếp trong phiếu này."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Đóng
          </Button>
          <Button
            variant="primary"
            icon={<Send className="size-4" />}
            disabled={!valid}
            loading={create.isPending}
            onClick={() => create.mutate(undefined)}
          >
            Gửi yêu cầu
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <Field label="Hợp đồng & Kho liên quan" required>
          <Select
            value={f.contractId}
            onChange={(e) => set('contractId', e.target.value)}
          >
            <option value="">— Chọn hợp đồng thuê kho —</option>
            {contracts.data?.data.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} · {c.unit?.code ? `Kho ${c.unit.code}` : ''} ·{' '}
                {c.facility?.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Chủ đề cần hỗ trợ" required>
          <Select
            value={f.category}
            onChange={(e) => set('category', e.target.value)}
          >
            {CATS.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Tiêu đề tóm tắt" required hint="Tối thiểu 4 ký tự">
          <Input
            value={f.subject}
            maxLength={200}
            placeholder="VD: Cần hỗ trợ mở khóa kho từ xa / kiểm tra cửa kho…"
            onChange={(e) => set('subject', e.target.value)}
          />
        </Field>
        <Field
          label="Mô tả chi tiết tình huống"
          required
          hint="Tối thiểu 10 ký tự để kỹ thuật viên nắm rõ sự việc"
        >
          <Textarea
            rows={4}
            maxLength={4000}
            placeholder="Mô tả chi tiết vấn đề bạn gặp phải…"
            value={f.description}
            onChange={(e) => set('description', e.target.value)}
          />
        </Field>
        <Field label="Hình ảnh đính kèm (không bắt buộc)">
          <PhotoUpload
            value={photos}
            onChange={setPhotos}
            purpose="ticket"
          />
        </Field>
      </div>
    </Modal>
  );
}

export function TicketDetail() {
  const { id } = useParams();
  const q = useGet<any>(`/tickets/${id}`);
  const [body, setBody] = useState('');
  const [replyPhotos, setReplyPhotos] = useState<Photo[]>([]);

  const send = useAct(
    () =>
      post(`/tickets/${id}/messages`, {
        body: body.trim() || 'Đã gửi hình ảnh đính kèm.',
        isInternal: false,
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

  const act = (kind: string, extra?: any) =>
    post(`/tickets/${id}/${kind}`, extra ?? {});

  return (
    <Async q={q}>
      {(t) => {
        const closed = ['CLOSED', 'CANCELLED'].includes(t.status);
        const visibleMessages = (t.messages ?? []).filter(
          (m: any) => !m.is_internal,
        );

        return (
          <div className="space-y-6">
            <div>
              <Link
                to="/app/support"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-steel-500 transition hover:text-ink-950"
              >
                <ArrowLeft className="size-4" />
                Trung tâm hỗ trợ
              </Link>
            </div>

            {/* Executive Ticket Header */}
            <section className="relative overflow-hidden rounded-[var(--radius-media)] border border-brass-500/30 bg-[#091320] p-6 text-white shadow-[var(--shadow-card)]">
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brass-500 via-brass-400 to-transparent" />
              <div
                className="door-lines pointer-events-none absolute inset-0 opacity-30"
                aria-hidden
              />
              <div className="relative flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-lg border border-brass-400/45 bg-brass-500/18 px-2.5 py-1 font-mono text-xs font-extrabold tracking-wider text-brass-400">
                      {t.code}
                    </span>
                    <span className="rounded-lg border border-white/12 bg-white/[0.06] px-2.5 py-1 text-xs font-medium text-steel-200">
                      {CATEGORY_LABEL[t.category] ?? t.category}
                    </span>
                    {t.escalation_level > 0 && (
                      <Badge tone="warn">
                        {t.escalation_level >= 2
                          ? 'Đã chuyển Quản lý Vận hành (BOM)'
                          : 'Đã chuyển Quản lý Cơ sở'}
                      </Badge>
                    )}
                  </div>
                  <h1 className="display text-2xl text-white sm:text-3xl">
                    {t.subject}
                  </h1>
                  <p className="text-xs text-steel-300">
                    Khởi tạo lúc {fmtDateTime(t.created_at)}
                    {t.facility?.name ? ` · ${t.facility.name}` : ''}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge kind="priority" value={t.priority} />
                  <StatusBadge kind="ticket" value={t.status} />
                </div>
              </div>
            </section>

            {t.escalation_level > 0 && !closed && (
              <Alert
                tone="warn"
                title={
                  t.escalation_level >= 2
                    ? 'Yêu cầu đang được Ban Vận hành (BOM) trực tiếp giám sát'
                    : 'Yêu cầu đã được chuyển lên Quản lý cơ sở ưu tiên xử lý'
                }
              >
                {(() => {
                  const e = [...(t.events ?? [])]
                    .reverse()
                    .find((x: any) => x.event === 'ESCALATED');
                  const why = e?.data?.reason;
                  return why
                    ? `Ghi chú chuyển cấp: ${why}`
                    : 'Quản lý đã nhận thông báo và đang phối hợp giải quyết sớm nhất cho bạn.';
                })()}
              </Alert>
            )}

            <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
              {/* Modern Concierge Messaging Thread */}
              <div className="space-y-5">
                <Card className="overflow-hidden">
                  <CardHead
                    title="Trao đổi với nhân viên hỗ trợ"
                    sub="Tin nhắn và hình ảnh được gửi trực tiếp tới nhân viên phụ trách cơ sở"
                    action={
                      <Badge tone={closed ? 'neutral' : 'ok'} dot>
                        {closed ? 'Đã đóng hội thoại' : 'Đang kết nối'}
                      </Badge>
                    }
                  />

                  <div className="space-y-5 bg-paper/45 p-4 sm:p-6">
                    {/* Pinned Initial Request Bubble */}
                    <div className="flex flex-col items-end">
                      <div className="mb-1.5 flex items-center gap-2 text-xs text-steel-500">
                        <span className="rounded-full bg-brass-100 px-2 py-0.5 text-[10.5px] font-bold text-brass-700">
                          Yêu cầu ban đầu
                        </span>
                        <span className="num">{fmtDateTime(t.created_at)}</span>
                        <b className="text-ink-900">
                          {t.customer?.full_name ?? 'Bạn'}
                        </b>
                        <Avatar
                          name={t.customer?.full_name ?? 'Khách'}
                          size={24}
                        />
                      </div>
                      <div className="w-full max-w-2xl rounded-2xl rounded-tr-sm border border-brass-500/40 bg-[#091320] p-4 text-sm text-white shadow-sm sm:p-5">
                        <p className="whitespace-pre-wrap leading-relaxed">
                          {t.description}
                        </p>
                        {t.attachments?.length > 0 && (
                          <div className="mt-3.5 border-t border-white/12 pt-3">
                            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-brass-400">
                              Hình ảnh đính kèm ({t.attachments.length})
                            </p>
                            <PhotoGallery photos={t.attachments} size="md" />
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Thread Messages */}
                    {visibleMessages.length > 0 ? (
                      visibleMessages.map((m: any) => {
                        const isMine = Boolean(m.from_customer);
                        if (isMine) {
                          return (
                            <div key={m.id} className="flex flex-col items-end">
                              <div className="mb-1.5 flex items-center gap-2 text-xs text-steel-500">
                                <span title={fmtDateTime(m.created_at)}>
                                  {relTime(m.created_at)}
                                </span>
                                <b className="text-ink-900">
                                  {m.author?.full_name ?? 'Bạn'}
                                </b>
                                <Avatar
                                  name={m.author?.full_name ?? 'Bạn'}
                                  size={24}
                                />
                              </div>
                              <div className="max-w-xl rounded-2xl rounded-tr-sm border border-brass-500/30 bg-ink-900 px-4 py-3.5 text-sm text-white shadow-xs">
                                <p className="whitespace-pre-wrap leading-relaxed">
                                  {m.body}
                                </p>
                                {m.attachments?.length > 0 && (
                                  <div className="mt-3 border-t border-white/12 pt-2.5">
                                    <PhotoGallery
                                      photos={m.attachments}
                                      size="md"
                                    />
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        }

                        return (
                          <div key={m.id} className="flex flex-col items-start">
                            <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs text-steel-500">
                              <Avatar
                                name={m.author?.full_name ?? 'Vaultra'}
                                size={26}
                              />
                              <b className="text-ink-950">
                                {m.author?.full_name ?? 'Đội ngũ Vaultra'}
                              </b>
                              <span className="rounded-full border border-brass-500/35 bg-brass-100/70 px-2 py-0.5 text-[10.5px] font-bold text-brass-700">
                                {m.author?.role_label ?? 'Nhân viên hỗ trợ'}
                              </span>
                              <span title={fmtDateTime(m.created_at)}>
                                {relTime(m.created_at)}
                              </span>
                            </div>
                            <div className="max-w-xl rounded-2xl rounded-tl-sm border border-steel-200 border-l-4 border-l-brass-500 bg-white px-4 py-3.5 text-sm text-ink-900 shadow-xs">
                              <p className="whitespace-pre-wrap leading-relaxed">
                                {m.body}
                              </p>
                              {m.attachments?.length > 0 && (
                                <div className="mt-3 border-t hairline pt-2.5">
                                  <PhotoGallery
                                    photos={m.attachments}
                                    size="md"
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="rounded-xl border border-dashed border-steel-300 bg-white/80 px-4 py-5 text-center text-xs text-steel-500">
                        Yêu cầu của bạn đã được chuyển tới nhân viên trực cơ sở. Bạn có thể bổ sung thêm thông tin hoặc hình ảnh bên dưới bất cứ lúc nào.
                      </div>
                    )}
                  </div>

                  {/* Sleek Reply Composer */}
                  {!closed ? (
                    <div className="border-t hairline bg-white p-4 sm:p-5">
                      <Textarea
                        rows={3}
                        value={body}
                        maxLength={4000}
                        onChange={(e) => setBody(e.target.value)}
                        placeholder="Nhập phản hồi hoặc bổ sung thông tin cho nhân viên hỗ trợ…"
                        aria-label="Nội dung tin nhắn"
                      />
                      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
                        <div>
                          <PhotoUpload
                            value={replyPhotos}
                            onChange={setReplyPhotos}
                            purpose="ticket_message"
                            label="Đính kèm ảnh"
                          />
                        </div>
                        <Button
                          variant="primary"
                          size="md"
                          icon={<Send className="size-4" />}
                          disabled={!body.trim() && replyPhotos.length === 0}
                          loading={send.isPending}
                          onClick={() => send.mutate(undefined)}
                        >
                          Gửi tin nhắn
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="border-t hairline bg-paper px-5 py-3.5 text-center text-xs text-steel-500">
                      Phiếu hỗ trợ này đã đóng. Nếu cần hỗ trợ tiếp, bạn có thể mở lại hoặc tạo phiếu mới.
                    </div>
                  )}
                </Card>
              </div>

              {/* Right Sidebar: Metadata, SLA & Actions */}
              <aside className="space-y-5">
                <Card className="overflow-hidden">
                  <CardHead title="Thông tin xử lý phiếu" />
                  <div className="space-y-3.5 p-5 text-sm">
                    {t.contract && (
                      <div className="rounded-xl border border-brass-500/30 bg-paper p-3.5">
                        <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-steel-500">
                          Hợp đồng &amp; Kho liên kết
                        </p>
                        <Link
                          to={`/app/contracts/${t.contract.public_id ?? t.contract.id}`}
                          className="mt-1 flex items-center justify-between font-bold text-ink-950 hover:text-brass-700"
                        >
                          <span className="inline-flex items-center gap-1.5">
                            <KeyRound className="size-4 text-brass-700" />
                            {t.contract.code}
                            {t.contract.unit?.code
                              ? ` · Kho ${t.contract.unit.code}`
                              : ''}
                          </span>
                          <span className="text-xs text-info-600">Xem →</span>
                        </Link>
                      </div>
                    )}

                    <div className="space-y-2.5 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 text-steel-500">
                          <Building2 className="size-3.5" /> Cơ sở
                        </span>
                        <b className="text-right text-ink-950">
                          {t.facility?.name ?? '—'}
                        </b>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 text-steel-500">
                          <UserCheck className="size-3.5" /> Phụ trách
                        </span>
                        <b className="text-right text-ink-950">
                          {t.assignee?.full_name ?? 'Đang phân công'}
                        </b>
                      </div>
                      <div className="flex items-center justify-between gap-2 border-t hairline pt-2.5">
                        <span className="text-steel-500">Hạn phản hồi đầu</span>
                        <span className="font-medium text-ink-900 num">
                          {fmtDateTime(t.first_response_due_at)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-steel-500">Hạn giải quyết</span>
                        <span className="font-medium text-ink-900 num">
                          {fmtDateTime(t.resolution_due_at)}
                        </span>
                      </div>
                    </div>

                    {t.sla_breached && (
                      <div className="pt-1">
                        <Badge tone="bad" dot>
                          Đang ưu tiên xử lý quá hạn SLA
                        </Badge>
                      </div>
                    )}
                  </div>
                </Card>

                {t.rating && (
                  <Card className="border-brass-500/35 bg-brass-100/20 p-5">
                    <p className="text-xs font-bold uppercase tracking-wider text-brass-700">
                      Đánh giá của bạn
                    </p>
                    <div className="mt-1.5 flex items-center gap-1 text-brass-500">
                      {Array.from({ length: 5 }).map((_, idx) => (
                        <Star
                          key={idx}
                          className={cn(
                            'size-4',
                            idx < Number(t.rating.stars ?? t.rating)
                              ? 'fill-brass-500 text-brass-500'
                              : 'text-steel-300',
                          )}
                        />
                      ))}
                    </div>
                    {t.rating.note && (
                      <p className="mt-2 text-xs text-steel-600">
                        “{t.rating.note}”
                      </p>
                    )}
                  </Card>
                )}

                <Card className="space-y-3 p-5">
                  <p className="text-xs font-bold uppercase tracking-wider text-steel-500">
                    Thao tác phiếu hỗ trợ
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {t.status === 'RESOLVED' && (
                      <>
                        <ActBtn
                          label="Xác nhận Đóng phiếu"
                          variant="primary"
                          run={() => act('close')}
                          ok="Đã đóng phiếu hỗ trợ"
                          invalidate={['/tickets']}
                        />
                        <ActBtn
                          label="Mở lại yêu cầu"
                          title="Mở lại phiếu hỗ trợ"
                          fields={[REASON]}
                          run={(v) => act('reopen', v)}
                          ok="Đã mở lại phiếu hỗ trợ"
                          invalidate={['/tickets']}
                        />
                      </>
                    )}

                    {['RESOLVED', 'CLOSED'].includes(t.status) && !t.rating && (
                      <ActBtn
                        label="Đánh giá chất lượng"
                        variant="outline"
                        icon={<Star className="size-4 text-brass-600" />}
                        title="Đánh giá chất lượng hỗ trợ"
                        fields={[
                          {
                            name: 'stars',
                            label: 'Mức độ hài lòng (1–5 sao)',
                            type: 'number',
                            min: 1,
                            max: 5,
                            required: true,
                            def: 5,
                          },
                          {
                            name: 'note',
                            label: 'Nhận xét thêm (tùy chọn)',
                            type: 'textarea',
                          },
                        ]}
                        run={(v) => act('rate', v)}
                        ok="Cảm ơn bạn đã đánh giá chất lượng phục vụ!"
                        invalidate={['/tickets']}
                      />
                    )}

                    {!closed && t.status !== 'RESOLVED' && (
                      <ActBtn
                        label="Hủy yêu cầu"
                        danger
                        title="Hủy yêu cầu hỗ trợ"
                        fields={[REASON]}
                        run={(v) => act('cancel', v)}
                        ok="Đã hủy yêu cầu hỗ trợ"
                        invalidate={['/tickets', '/notifications']}
                      />
                    )}
                  </div>
                  <p className="flex items-start gap-1.5 text-[11px] text-steel-500">
                    <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-ok-600" />
                    <span>
                      Toàn bộ lịch sử xử lý sự cố được lưu vết minh bạch theo hợp đồng của bạn.
                    </span>
                  </p>
                </Card>
              </aside>
            </div>
          </div>
        );
      }}
    </Async>
  );
}
