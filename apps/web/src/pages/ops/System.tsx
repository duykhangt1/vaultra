import { useState } from 'react';
import { Plus, Trash2, RefreshCw, Edit3, Power, Sparkles, Search, BookOpen, CheckCircle2, HelpCircle } from 'lucide-react';
import { useGet, useAct } from '@/lib/hooks';
import { post, patch, del } from '@/lib/api';
import {
  Async,
  Card,
  CardHead,
  PageHeader,
  Badge,
  Button,
  DataTable,
  EmptyState,
  Drawer,
  Field,
  Input,
  Select,
  Textarea,
  Alert,
} from '@/ui';
import { fmtDate, fmtDateTime, vnd, pct } from '@/lib/format';
import { ActBtn, Money, KPI } from '../kit';

/* ───────────── finance: payment gateway reconciliation (F4) ───────────── */
const RES: Record<string, [any, string]> = {
  MATCHED: ['ok', 'Khớp'],
  MISSING_IN_SYSTEM: ['bad', 'Thiếu trong hệ thống'],
  MISSING_IN_PROVIDER: ['warn', 'Thiếu ở cổng'],
  AMOUNT_MISMATCH: ['bad', 'Lệch số tiền'],
};
const BS: Record<string, [any, string]> = {
  MATCHED: ['ok', 'Khớp'],
  HAS_MISMATCH: ['bad', 'Có chênh lệch'],
  RESOLVED: ['info', 'Đã giải trình'],
};

export function FinancePage() {
  const q = useGet<any[]>('/reconciliations');
  const [open, setOpen] = useState<string | null>(null);
  const inv = ['/reconciliations'];
  return (
    <>
      <PageHeader
        title="Đối soát thanh toán"
        sub="So khớp giao dịch của cổng thanh toán với hệ thống"
        actions={
          <ActBtn
            label="Chạy đối soát"
            variant="primary"
            icon={<Plus className="size-4" />}
            title="Đối soát theo ngày"
            description="Đối soát theo ngày: lấy sao kê từ cổng (hoặc từ sổ thu quầy với tiền mặt) rồi so khớp từng giao dịch với hệ thống. Có thể dán sao kê riêng (mã_giao_dịch,số_tiền mỗi dòng)."
            fields={[
              {
                name: 'provider',
                label: 'Cổng',
                type: 'select',
                required: true,
                def: 'VNPAY',
                options: [{ value: 'VNPAY', label: 'VNPay (thanh toán online)' }, { value: 'CASH', label: 'Tiền mặt / chuyển khoản tại quầy' }],
              },
              { name: 'periodDate', label: 'Ngày đối soát', type: 'date', required: true, def: new Date().toISOString().slice(0, 10) },
              { name: 'csv', label: 'Sao kê thủ công (không bắt buộc)', type: 'textarea', placeholder: 'Để trống để hệ thống tự lấy' },
            ]}
            run={(v) => {
              const rows = String(v.csv || '')
                .split(/\r?\n/)
                .map((l) => l.trim())
                .filter(Boolean)
                .map((l) => {
                  const [txnId, amt] = l.split(/[,;\t]/);
                  return { txnId: txnId.trim(), amount: Number(String(amt ?? '').replace(/[^\d.]/g, '')) };
                });
              if (rows.some((r) => !r.txnId || Number.isNaN(r.amount))) throw new Error('Dòng sao kê không hợp lệ');
              return post('/reconciliations', { provider: v.provider, periodDate: v.periodDate, ...(rows.length ? { rows } : {}) });
            }}
            ok="Đã chạy đối soát"
            invalidate={inv}
            onDone={(r) => setOpen(r.id)}
          />
        }
      />
      <Card>
        <DataTable
          pageSize={10}
          rows={q.data}
          loading={q.isLoading}
          error={q.error}
          onRetry={q.refetch}
          rowKey={(b: any) => b.id}
          onRow={(b: any) => setOpen(b.id)}
          empty={<EmptyState title="Chưa có đợt đối soát" />}
          cols={[
            { key: 'd', header: 'Ngày', cell: (b: any) => <b>{fmtDate(b.period_date)}</b> },
            { key: 'p', header: 'Cổng', hideBelow: 'sm', cell: (b: any) => b.provider },
            { key: 'a', header: 'Theo cổng', hideBelow: 'sm', cell: (b: any) => <Money v={b.total_provider} /> },
            { key: 'b', header: 'Theo hệ thống', cell: (b: any) => <Money v={b.total_system} /> },
            { key: 's', header: '', cell: (b: any) => <Badge tone={BS[b.status]?.[0]}>{BS[b.status]?.[1] ?? b.status}</Badge> },
          ]}
        />
      </Card>
      <Detail id={open} onClose={() => setOpen(null)} />
    </>
  );
}

function Detail({ id, onClose }: { id: string | null; onClose: () => void }) {
  const q = useGet<any>(id ? `/reconciliations/${id}` : null);
  return (
    <Drawer open={!!id} onClose={onClose} title="Chi tiết đối soát" width={640}>
      {q.data && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <KPI label="Theo cổng" value={vnd(q.data.total_provider)} />
            <KPI label="Theo hệ thống" value={vnd(q.data.total_system)} />
          </div>
          <DataTable
            rows={q.data.items}
            rowKey={(i: any) => String(i.id)}
            empty={<EmptyState title="Không có giao dịch" />}
            cols={[
              { key: 't', header: 'Mã giao dịch', cell: (i: any) => <span className="code text-xs">{i.provider_txn_id ?? '—'}</span> },
              { key: 'p', header: 'Cổng', hideBelow: 'sm', cell: (i: any) => (i.provider_amount != null ? vnd(i.provider_amount) : '—') },
              { key: 's', header: 'Hệ thống', hideBelow: 'sm', cell: (i: any) => (i.system_amount != null ? vnd(i.system_amount) : '—') },
              {
                key: 'r',
                header: 'Kết quả',
                cell: (i: any) => (
                  <>
                    <Badge tone={RES[i.result]?.[0]}>{RES[i.result]?.[1]}</Badge>
                    {i.resolution_note && <span className="mt-1 block text-xs text-steel-600">{i.resolution_note}</span>}
                  </>
                ),
              },
              {
                key: 'x',
                header: '',
                cell: (i: any) =>
                  i.result !== 'MATCHED' && !i.resolution_note ? (
                    <ActBtn
                      label="Giải trình"
                      size="xs"
                      title="Giải trình chênh lệch"
                      fields={[{ name: 'note', label: 'Nguyên nhân / xử lý', type: 'textarea', required: true, maxLength: 255 }]}
                      run={(v) => post(`/reconciliation-items/${i.id}`, v)}
                      ok="Đã ghi"
                      invalidate={['/reconciliations']}
                    />
                  ) : null,
              },
            ]}
          />
        </div>
      )}
    </Drawer>
  );
}

/* ───────────── SLA ───────────── */
const CAT_L: Record<string, string> = {
  ACCESS_CODE: 'Mã truy cập',
  LOCK_KEY: 'Khóa/chìa',
  UNIT_DAMAGE: 'Hư hỏng kho',
  STORED_ITEMS: 'Đồ lưu trữ',
  PAYMENT: 'Thanh toán',
  CONTRACT: 'Hợp đồng',
  OTHER: 'Khác',
};
const PRI_L: Record<string, string> = { LOW: 'Thấp', MEDIUM: 'Trung bình', HIGH: 'Cao', URGENT: 'Khẩn' };

const dur = (m: number) =>
  !m ? '—' : m < 60 ? `${m} phút` : m < 1440 ? `${+(m / 60).toFixed(1)} giờ` : `${+(m / 1440).toFixed(1)} ngày`;
const SLA_CATS = ['ACCESS_CODE', 'LOCK_KEY', 'UNIT_DAMAGE', 'STORED_ITEMS', 'PAYMENT', 'CONTRACT', 'OTHER'];
const SLA_PRIS = ['URGENT', 'HIGH', 'MEDIUM', 'LOW'];

export function SlaPage() {
  const q = useGet<any[]>('/sla-policies');
  const [edits, setEdits] = useState<Record<string, any>>({});
  const key = (r: any) => `${r.category}:${r.priority}`;
  const rows = (q.data ?? []).filter((r) => !r.facility_id);
  const byKey = new Map(rows.map((r) => [key(r), r]));
  const save = useAct(
    () =>
      patch(
        '/sla-policies',
        Object.values(edits).map((r: any) => ({
          facilityId: null,
          category: r.category,
          priority: r.priority,
          firstResponseMinutes: +r.first_response_minutes,
          resolutionMinutes: +r.resolution_minutes,
          businessHoursOnly: !!r.business_hours_only,
        })),
      ),
    { ok: 'Đã lưu SLA', invalidate: ['/sla-policies'], onSuccess: () => setEdits({}) },
  );
  const val = (r: any) => edits[key(r)] ?? r;
  const set = (r: any, k: string, v: any) => setEdits((e) => ({ ...e, [key(r)]: { ...val(r), [k]: v } }));
  const problem = (r: any) => {
    const v = val(r);
    const f = +v.first_response_minutes,
      x = +v.resolution_minutes;
    return !(f >= 5) ? 'Tối thiểu 5 phút' : !(x >= 15) ? 'Tối thiểu 15 phút' : x < f ? 'Phải ≥ thời gian phản hồi' : '';
  };
  const dirty = Object.keys(edits);
  const bad = dirty.some((k) => problem(edits[k]));
  const custom = rows.filter((r) => !r.is_default).length;
  return (
    <>
      <PageHeader
        title="SLA hỗ trợ"
        sub="Thời hạn phản hồi đầu và xử lý xong theo nhóm vấn đề và mức ưu tiên. Áp dụng cho mọi cơ sở, trừ cơ sở có cấu hình riêng."
        actions={
          <>
            {dirty.length > 0 && (
              <Button variant="ghost" onClick={() => setEdits({})}>
                Bỏ thay đổi
              </Button>
            )}
            <Button variant="primary" disabled={!dirty.length || bad} loading={save.isPending} onClick={() => save.mutate(undefined)}>
              Lưu thay đổi{dirty.length ? ` (${dirty.length})` : ''}
            </Button>
          </>
        }
      />
      <Async q={q}>
        {() => (
          <>
            {custom < rows.length && (
              <div className="mb-4">
                <Alert tone="info" title={`${rows.length - custom}/${rows.length} dòng đang dùng mức mặc định của hệ thống`}>
                  Đây là mức đang áp dụng thật cho phiếu hỗ trợ. Sửa và lưu một dòng để biến nó thành cấu hình riêng của doanh nghiệp.
                </Alert>
              </div>
            )}
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="whitespace-nowrap border-b hairline text-left text-xs uppercase tracking-wider text-steel-500">
                      <th className="px-4 py-2.5">Nhóm</th>
                      <th className="px-4 py-2.5">Ưu tiên</th>
                      <th className="px-4 py-2.5">Phản hồi đầu</th>
                      <th className="px-4 py-2.5">Xử lý xong</th>
                      <th className="hidden px-4 py-2.5 sm:table-cell">Chỉ giờ hành chính</th>
                      <th className="px-4 py-2.5">Nguồn</th>
                    </tr>
                  </thead>
                  <tbody>
                    {SLA_CATS.flatMap((c) =>
                      SLA_PRIS.map((p, i) => {
                        const r = byKey.get(`${c}:${p}`);
                        if (!r) return null;
                        const v = val(r);
                        const err = problem(r);
                        const changed = !!edits[key(r)];
                        return (
                          <tr
                            key={key(r)}
                            className={`border-b hairline last:border-0 ${i === 0 ? 'border-t-2 border-t-steel-100' : ''} ${changed ? 'bg-brass-50/60' : ''}`}
                          >
                            <td className="px-4 py-2 align-top font-semibold">{i === 0 ? CAT_L[c] : <span className="sr-only">{CAT_L[c]}</span>}</td>
                            <td className="px-4 py-2">
                              <Badge tone={p === 'URGENT' ? 'bad' : p === 'HIGH' ? 'warn' : p === 'MEDIUM' ? 'info' : 'neutral'}>{PRI_L[p]}</Badge>
                            </td>
                            <td className="px-4 py-2">
                              <div className="flex items-center gap-2">
                                <Input
                                  className="w-24 min-w-[88px]"
                                  type="number"
                                  min={5}
                                  invalid={!!err}
                                  value={v.first_response_minutes}
                                  onChange={(e) => set(r, 'first_response_minutes', e.target.value)}
                                  aria-label={`${CAT_L[c]} ${PRI_L[p]}: phản hồi đầu (phút)`}
                                />
                                <span className="whitespace-nowrap text-xs text-steel-500">{dur(+v.first_response_minutes)}</span>
                              </div>
                            </td>
                            <td className="px-4 py-2">
                              <div className="flex items-center gap-2">
                                <Input
                                  className="w-24 min-w-[88px]"
                                  type="number"
                                  min={15}
                                  invalid={!!err}
                                  value={v.resolution_minutes}
                                  onChange={(e) => set(r, 'resolution_minutes', e.target.value)}
                                  aria-label={`${CAT_L[c]} ${PRI_L[p]}: xử lý xong (phút)`}
                                />
                                <span className="whitespace-nowrap text-xs text-steel-500">{dur(+v.resolution_minutes)}</span>
                              </div>
                              {err && <p className="mt-1 text-xs text-bad-600">{err}</p>}
                            </td>
                            <td className="hidden px-4 py-2 sm:table-cell">
                              <input
                                type="checkbox"
                                className="size-4 accent-ink-900"
                                checked={!!v.business_hours_only}
                                onChange={(e) => set(r, 'business_hours_only', e.target.checked)}
                                aria-label={`${CAT_L[c]} ${PRI_L[p]}: chỉ tính giờ hành chính`}
                              />
                            </td>
                            <td className="px-4 py-2">
                              {changed ? (
                                <Badge tone="brass">Chưa lưu</Badge>
                              ) : r.is_default ? (
                                <Badge tone="neutral">Mặc định</Badge>
                              ) : (
                                <Badge tone="ok">Tùy chỉnh</Badge>
                              )}
                            </td>
                          </tr>
                        );
                      }),
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
            <p className="mt-3 text-xs text-steel-500">
              Khi đạt 80% thời hạn, phiếu được cảnh báo để nhân viên leo thang. Phiếu khẩn bỏ qua giờ làm việc và thông báo ngay cho quản lý cơ sở.
            </p>
          </>
        )}
      </Async>
    </>
  );
}

/* ───────────── RAG AI Chatbot & Knowledge Base Manager (D:\Website style) ───────────── */
const KB_CATEGORIES: { value: string; label: string; tone: 'info' | 'brass' | 'ok' | 'warn' | 'bad' | 'neutral' }[] = [
  { value: 'FACILITY_INFO', label: '🏢 Cơ sở & Giới thiệu Website', tone: 'info' },
  { value: 'SIZE_GUIDE', label: '📦 Bảng giá & Kích thước kho', tone: 'brass' },
  { value: 'POLICY', label: '📋 Chính sách thuê kho', tone: 'ok' },
  { value: 'FAQ', label: '❓ Hỏi đáp thường gặp (FAQ)', tone: 'neutral' },
  { value: 'RULES', label: '⚠️ Nội quy & Hàng cấm', tone: 'warn' },
  { value: 'SOP', label: '🛠️ Quy trình vận hành (SOP)', tone: 'neutral' },
];

const KB_CAT_MAP = Object.fromEntries(KB_CATEGORIES.map((c) => [c.value, c]));

export function KbPage({ manage }: { manage?: boolean }) {
  const [statusFilter, setStatusFilter] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [search, setSearch] = useState('');
  const [edit, setEdit] = useState<any>(null);

  const statsQ = useGet<any>('/kb/stats');
  const docsQ = useGet<any>('/kb/articles', {
    pageSize: 50,
    ...(statusFilter ? { 'filter[status]': statusFilter } : {}),
    ...(catFilter ? { 'filter[category]': catFilter } : {}),
    ...(search.trim() ? { q: search.trim() } : {}),
  });
  const fac = useGet<any[]>('/facilities');
  const inv = ['/kb/articles', '/kb/stats', '/kb'];

  const syncWebsite = useAct(() => post('/kb/sync-website', {}), {
    ok: 'Đã đồng bộ toàn bộ nội dung Website vào RAG AI!',
    invalidate: inv,
  });

  const toggleDoc = useAct((id: string) => patch(`/kb/articles/${id}/toggle`, {}), {
    ok: 'Đã cập nhật trạng thái tài liệu RAG',
    invalidate: inv,
  });

  const deleteDoc = useAct((id: string) => del(`/kb/articles/${id}`), {
    ok: 'Đã xóa tài liệu RAG',
    invalidate: inv,
  });

  const resolveQ = useAct((id: string) => post(`/kb/questions/${id}/resolve`, {}), {
    ok: 'Đã đánh dấu xử lý câu hỏi',
    invalidate: inv,
  });

  const stats = statsQ.data ?? {
    totalDocs: 0,
    activeDocs: 0,
    totalChunks: 0,
    totalConversations: 0,
    unansweredCount: 0,
    unansweredQuestions: [],
    apiKeysCount: 5,
    activeModel: 'gemini-3.5-flash-lite',
  };

  const rows: any[] = docsQ.data?.data ?? [];

  return (
    <>
      <PageHeader
        title="Quản lý RAG AI Chatbot & Nội dung Tri thức"
        sub="Chỉnh sửa trực tiếp dữ liệu huấn luyện (RAG) để AI trả lời khách hàng theo đúng nội dung Website của bạn"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              icon={<RefreshCw className="size-4" />}
              loading={syncWebsite.isPending}
              onClick={() => syncWebsite.mutate(undefined)}
            >
              Đồng bộ nội dung Website
            </Button>
            <Button
              variant="primary"
              icon={<Plus className="size-4" />}
              onClick={() => setEdit({ category: 'FAQ', audience: 'PUBLIC', locale: 'vi', status: 'PUBLISHED', title: '', body: '' })}
            >
              Thêm tài liệu mới
            </Button>
          </div>
        }
      />

      {/* 4 KPI Stat Cards */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KPI label="Tổng tài liệu RAG" value={String(stats.totalDocs)} sub="Tất cả bài viết tri thức" />
        <KPI label="Đang hoạt động (Bật)" value={String(stats.activeDocs)} sub="Đang nạp vào bộ não AI" />
        <KPI label="Tổng Chunks tìm kiếm" value={String(stats.totalChunks)} sub="Đoạn văn bản lập chỉ mục" />
        <KPI
          label="Cuộc hội thoại AI"
          value={String(stats.totalConversations)}
          sub={`${stats.apiKeysCount ?? 5} API Keys · ${stats.activeModel ?? 'gemini-3.5-flash-lite'}`}
        />
      </div>

      {/* Unanswered Questions Alert Section (like D:\Website AdminChatbot) */}
      {stats.unansweredQuestions?.length > 0 && (
        <Card className="mb-6 border-warn-500/40 bg-warn-50/30">
          <CardHead
            title={`⚠️ Câu hỏi khách hàng AI chưa trả lời được (${stats.unansweredQuestions.length})`}
            sub="Hệ thống tự động lưu lại các câu hỏi chưa có dữ liệu trong RAG. Bấm 'Soạn tài liệu trả lời' để bổ sung kiến thức cho AI."
          />
          <ul className="divide-y hairline">
            {stats.unansweredQuestions.map((q: any, i: number) => (
              <li key={q.id || i} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink-950">“{q.question}”</p>
                  {q.answer && <p className="mt-0.5 line-clamp-1 text-xs text-steel-600">Phản hồi lúc đó: {q.answer}</p>}
                  <p className="mt-0.5 text-xs text-steel-500">{fmtDateTime(q.at)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="xs"
                    variant="primary"
                    icon={<Plus className="size-3.5" />}
                    onClick={() =>
                      setEdit({
                        category: 'FAQ',
                        audience: 'PUBLIC',
                        locale: 'vi',
                        status: 'PUBLISHED',
                        title: q.question,
                        body: `Câu hỏi: ${q.question}\n\nTrả lời chi tiết:\n`,
                        resolveQuestionId: q.id,
                      })
                    }
                  >
                    Soạn tài liệu trả lời
                  </Button>
                  {q.id && (
                    <Button size="xs" variant="ghost" icon={<CheckCircle2 className="size-3.5" />} onClick={() => resolveQ.mutate(q.id)}>
                      Đã xử lý
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Search & Category Filter Bar */}
      <Card className="mb-4 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-steel-400" />
            <Input
              className="pl-9"
              placeholder="Tìm kiếm tiêu đề hoặc nội dung tài liệu RAG..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select aria-label="Nhóm tài liệu" className="w-56" value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
              <option value="">Tất cả danh mục ({stats.totalDocs})</option>
              {KB_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
            <Select aria-label="Trạng thái" className="w-44" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">Mọi trạng thái</option>
              <option value="PUBLISHED">🟢 Đang bật (Active)</option>
              <option value="ARCHIVED">⚪ Đã tắt (Archived)</option>
              <option value="DRAFT">📝 Bản nháp</option>
            </Select>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setCatFilter('')}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
              !catFilter ? 'bg-ink-900 text-white' : 'bg-steel-100 text-steel-700 hover:bg-steel-200'
            }`}
          >
            Tất cả
          </button>
          {KB_CATEGORIES.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setCatFilter(c.value === catFilter ? '' : c.value)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                catFilter === c.value ? 'bg-ink-900 text-white' : 'bg-steel-100 text-steel-700 hover:bg-steel-200'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </Card>

      {/* RAG Documents List */}
      <div className="space-y-3">
        {docsQ.isLoading && (
          <Card className="p-8 text-center text-sm text-steel-500">Đang tải danh sách tài liệu RAG AI...</Card>
        )}
        {!docsQ.isLoading && rows.length === 0 && (
          <Card className="p-8">
            <EmptyState
              title="Chưa có tài liệu RAG nào khớp bộ lọc"
              hint="Bấm 'Đồng bộ nội dung Website' để nạp toàn bộ dữ liệu cơ sở, bảng giá và chính sách từ website, hoặc bấm 'Thêm tài liệu mới'."
            />
          </Card>
        )}
        {rows.map((doc: any) => {
          const isActive = doc.status === 'PUBLISHED';
          const catInfo = KB_CAT_MAP[doc.category] ?? { label: doc.category, tone: 'neutral' };
          return (
            <Card
              key={doc.id}
              className={`p-4 transition hover:border-ink-400 ${!isActive ? 'opacity-65 bg-steel-50/50' : ''}`}
            >
              <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                <div className="min-w-0 flex-1 cursor-pointer" onClick={() => setEdit({ ...doc, initialTab: 'body' })}>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-bold text-ink-950 hover:text-brass-700">{doc.title}</h3>
                    <Badge tone={catInfo.tone}>{catInfo.label}</Badge>
                    <Badge tone={isActive ? 'ok' : 'neutral'}>{isActive ? '🟢 Đang bật' : '⚪ Đã tắt'}</Badge>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEdit({ ...doc, initialTab: 'chunks' });
                      }}
                      className="rounded-md bg-brass-100 px-2 py-0.5 text-xs font-semibold text-brass-800 hover:bg-brass-200"
                    >
                      🧩 {doc.chunkCount ?? doc.chunks?.length ?? 1} chunks · Xem / Thêm chunk
                    </button>
                    <span className="text-xs text-steel-400">
                      · Cập nhật {fmtDateTime(doc.updated_at)}
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-3 whitespace-pre-line text-sm leading-relaxed text-steel-600">
                    {doc.body}
                  </p>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    icon={<Plus className="size-3.5" />}
                    onClick={() => setEdit({ ...doc, initialTab: 'chunks', addNewChunk: true })}
                  >
                    + Thêm Chunk
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    icon={<Power className="size-3.5" />}
                    loading={toggleDoc.isPending}
                    onClick={() => toggleDoc.mutate(doc.id)}
                  >
                    {isActive ? 'Tắt' : 'Bật'}
                  </Button>
                  <Button
                    size="sm"
                    variant="primary"
                    icon={<Edit3 className="size-3.5" />}
                    onClick={() => setEdit({ ...doc, initialTab: 'body' })}
                  >
                    Chỉnh sửa
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-bad-600 hover:bg-bad-50"
                    icon={<Trash2 className="size-4" />}
                    onClick={() => {
                      if (window.confirm(`Bạn có chắc muốn xóa tài liệu "${doc.title}" khỏi bộ nhớ AI?`)) {
                        deleteDoc.mutate(doc.id);
                      }
                    }}
                  />
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <ArticleDrawer a={edit} onClose={() => setEdit(null)} facilities={fac.data ?? []} manage={manage} inv={inv} />
    </>
  );
}

function splitIntoChunksClient(body: string, max = 600): string[] {
  const out: string[] = [];
  let cur = '';
  for (const para of (body || '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)) {
    if (cur && cur.length + para.length + 2 > max) {
      out.push(cur);
      cur = '';
    }
    cur = cur ? `${cur}\n\n${para}` : para;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.length ? out : body.trim() ? [body.trim()] : [''];
}

function ArticleDrawer({
  a,
  onClose,
  facilities,
  manage,
  inv,
}: {
  a: any;
  onClose: () => void;
  facilities: any[];
  manage?: boolean;
  inv: string[];
}) {
  const isNew = !!a && !a.id;
  const [f, setF] = useState<any>({});
  const [tab, setTab] = useState<'body' | 'chunks'>('body');
  const [chunks, setChunks] = useState<string[]>(['']);
  const [last, setLast] = useState<any>(null);

  if (a !== last) {
    setLast(a);
    if (a) {
      const initChunks: string[] =
        Array.isArray(a.chunks) && a.chunks.length
          ? a.chunks.map((c: any) => (typeof c === 'string' ? c : String(c.content ?? '')))
          : splitIntoChunksClient(a.body || '');
      if (a.addNewChunk) {
        initChunks.push('');
      }
      setChunks(initChunks.length ? initChunks : ['']);
      setTab(a.initialTab === 'chunks' ? 'chunks' : 'body');
      setF(
        isNew
          ? {
              category: a.category || (manage ? 'FACILITY_INFO' : 'FAQ'),
              audience: a.audience || 'PUBLIC',
              locale: a.locale || 'vi',
              status: a.status || 'PUBLISHED',
              title: a.title || '',
              body: a.body || '',
              facilityId: '',
              resolveQuestionId: a.resolveQuestionId || undefined,
            }
          : {
              category: a.category,
              audience: a.audience,
              locale: a.locale,
              status: a.status || 'PUBLISHED',
              title: a.title,
              body: a.body,
            },
      );
    }
  }

  const set = (k: string, v: any) => setF((s: any) => ({ ...s, [k]: v }));

  const handleBodyChange = (val: string) => {
    set('body', val);
    setChunks(splitIntoChunksClient(val));
  };

  const handleChunkChange = (idx: number, val: string) => {
    const next = chunks.map((c, i) => (i === idx ? val : c));
    setChunks(next);
    set('body', next.map((c) => c.trim()).filter(Boolean).join('\n\n'));
  };

  const addChunkRow = () => {
    setTab('chunks');
    setChunks((prev) => [...prev, '']);
  };

  const removeChunkRow = (idx: number) => {
    const next = chunks.filter((_, i) => i !== idx);
    const safe = next.length ? next : [''];
    setChunks(safe);
    set('body', safe.map((c) => c.trim()).filter(Boolean).join('\n\n'));
  };

  const cleanChunks = chunks.map((c) => c.trim()).filter(Boolean);
  const finalBody = (f.body?.trim() || cleanChunks.join('\n\n')).trim();

  const save = useAct(
    () => {
      const b = {
        category: f.category,
        audience: f.audience,
        locale: f.locale,
        status: f.status,
        title: f.title,
        body: finalBody,
        chunks: cleanChunks.length ? cleanChunks : undefined,
        facilityId: f.facilityId || undefined,
        resolveQuestionId: f.resolveQuestionId || undefined,
      };
      return isNew ? post('/kb/articles', b) : patch(`/kb/articles/${a.id}`, b);
    },
    {
      ok: isNew ? 'Đã thêm tài liệu & huấn luyện RAG thành công!' : 'Đã cập nhật nội dung & Chunks RAG thành công!',
      invalidate: inv,
      onSuccess: onClose,
    },
  );

  const valid = (f.title?.trim().length ?? 0) >= 2 && finalBody.length >= 3;

  return (
    <Drawer
      open={!!a}
      onClose={onClose}
      title={isNew ? '➕ Thêm Tài liệu / Chunk RAG Mới' : `✏️ Chỉnh sửa RAG & Chunks: ${a?.title ?? ''}`}
      width={720}
      footer={
        a ? (
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              {!isNew && (
                <ActBtn
                  label="Xóa tài liệu"
                  danger
                  title="Xóa tài liệu RAG"
                  run={() => del(`/kb/articles/${a.id}`)}
                  ok="Đã xóa tài liệu"
                  invalidate={inv}
                  onDone={onClose}
                />
              )}
              <span className="text-xs text-steel-500">
                🧩 Tổng cộng <b>{Math.max(1, cleanChunks.length)} chunks</b> tìm kiếm
              </span>
            </span>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={onClose}>
                Hủy
              </Button>
              <Button variant="primary" disabled={!valid} loading={save.isPending} onClick={() => save.mutate(undefined)}>
                <Sparkles className="mr-1.5 size-4" />
                {isNew ? 'Lưu & Huấn luyện AI' : 'Lưu cập nhật RAG'}
              </Button>
            </div>
          </div>
        ) : undefined
      }
    >
      {a && (
        <div className="space-y-4">
          <Alert tone="info" title="Chỉnh sửa trực tiếp bộ não RAG AI & Chunks">
            Mọi dữ liệu hoặc chunk bạn thêm/sửa tại đây sẽ lập tức được lập chỉ mục từ khóa tiếng Việt và nạp trực tiếp vào AI Chatbot ngay khi bấm Lưu.
          </Alert>

          <Field label="Tiêu đề tài liệu / Chủ đề *" required>
            <Input
              placeholder="VD: Bảng giá các loại kho Quận 7 hoặc Chính sách hoàn tiền cọc..."
              value={f.title ?? ''}
              maxLength={250}
              onChange={(e) => set('title', e.target.value)}
            />
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Danh mục">
              <Select value={f.category ?? 'FAQ'} onChange={(e) => set('category', e.target.value)}>
                {KB_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Trạng thái nạp vào AI">
              <Select value={f.status ?? 'PUBLISHED'} onChange={(e) => set('status', e.target.value)}>
                <option value="PUBLISHED">🟢 Đang bật (AI sử dụng)</option>
                <option value="ARCHIVED">⚪ Tạm tắt (Không nạp AI)</option>
              </Select>
            </Field>
            <Field label="Phạm vi hiển thị">
              <Select value={f.audience ?? 'PUBLIC'} onChange={(e) => set('audience', e.target.value)}>
                <option value="PUBLIC">Công khai (Mọi khách hàng)</option>
                <option value="CUSTOMER">Khách đang thuê kho</option>
                <option value="INTERNAL">Nội bộ nhân viên</option>
              </Select>
            </Field>
          </div>

          {isNew && facilities.length > 0 && (
            <Field label="Áp dụng cho cơ sở (Để trống = Toàn hệ thống Vaultra)">
              <Select value={f.facilityId ?? ''} onChange={(e) => set('facilityId', e.target.value)}>
                <option value="">— Toàn hệ thống Vaultra —</option>
                {facilities.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          {/* Switch between Full Text and Individual Chunks Editor */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b hairline pb-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setTab('body')}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                  tab === 'body' ? 'bg-ink-900 text-white' : 'bg-steel-100 text-steel-700 hover:bg-steel-200'
                }`}
              >
                📝 Soạn văn bản liền mạch
              </button>
              <button
                type="button"
                onClick={() => setTab('chunks')}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                  tab === 'chunks' ? 'bg-ink-900 text-white' : 'bg-steel-100 text-steel-700 hover:bg-steel-200'
                }`}
              >
                🧩 Quản lý từng Chunk ({chunks.length})
              </button>
            </div>
            <Button size="xs" variant="outline" icon={<Plus className="size-3.5" />} onClick={addChunkRow}>
              Thêm Chunk mới
            </Button>
          </div>

          {tab === 'body' ? (
            <Field
              label="Nội dung chi tiết cho AI học *"
              required
              hint="Mẹo: Mỗi đoạn cách nhau 1 dòng trống sẽ được tách thành 1 chunk độc lập. Bạn cũng có thể chuyển sang tab 'Quản lý từng Chunk' để thêm/sửa từng chunk."
            >
              <Textarea
                rows={16}
                placeholder="Nhập nội dung kiến thức, bảng giá, địa chỉ, chính sách hoặc câu trả lời mẫu..."
                value={f.body ?? ''}
                maxLength={50000}
                onChange={(e) => handleBodyChange(e.target.value)}
                className="font-mono text-[13px] leading-relaxed"
              />
            </Field>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-steel-600">
                  Mỗi <b>Chunk</b> là một đơn vị kiến thức độc lập được AI tìm kiếm và ghép vào câu trả lời.
                </p>
                <button
                  type="button"
                  onClick={() => setChunks(splitIntoChunksClient(f.body || ''))}
                  className="text-xs font-semibold text-brass-700 hover:underline"
                >
                  Tách lại tự động theo đoạn
                </button>
              </div>
              {chunks.map((chunk, idx) => (
                <div key={idx} className="rounded-xl border border-steel-200 bg-steel-50/50 p-3">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="rounded bg-ink-900 px-2 py-0.5 text-[11px] font-bold text-white">
                      Chunk #{idx + 1}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-steel-500">{chunk.length} ký tự</span>
                      {chunks.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeChunkRow(idx)}
                          className="text-xs font-semibold text-bad-600 hover:underline"
                        >
                          Xóa chunk
                        </button>
                      )}
                    </div>
                  </div>
                  <Textarea
                    rows={4}
                    placeholder={`Nhập nội dung dữ liệu cho Chunk #${idx + 1}...`}
                    value={chunk}
                    onChange={(e) => handleChunkChange(idx, e.target.value)}
                    className="bg-white font-mono text-[13px] leading-relaxed"
                  />
                </div>
              ))}
              <Button variant="outline" size="sm" className="w-full" icon={<Plus className="size-4" />} onClick={addChunkRow}>
                + Thêm Chunk dữ liệu mới
              </Button>
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}

export function AssistantAnalytics() {
  const [days, setDays] = useState(30);
  const q = useGet<any>('/assistant/analytics', { days });
  return (
    <>
      <PageHeader
        title="Hiệu quả trợ lý AI"
        sub="Chất lượng trả lời, chuyển người và chi phí"
        actions={
          <Select aria-label="Khoảng thời gian" className="w-40" value={days} onChange={(e) => setDays(+e.target.value)}>
            <option value={7}>7 ngày</option>
            <option value={30}>30 ngày</option>
            <option value={90}>90 ngày</option>
          </Select>
        }
      />
      <Async q={q}>
        {(d) => (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <KPI label="Hội thoại" value={String(d.conversations)} sub={`${d.feedback.up} 👍 · ${d.feedback.down} 👎`} />
              <KPI label="Chuyển nhân viên" value={pct(d.handoffRate, 1)} />
              <KPI
                label="Trả lời dự phòng"
                value={pct(d.fallbackRate, 1)}
                sub="Không có câu trả lời từ tri thức/AI"
                tone={d.fallbackRate > 0.3 ? 'bad' : undefined}
              />
              <KPI label="Chi phí ước tính" value={`$${d.costUsd.toFixed(2)}`} />
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHead title="Câu hỏi chưa trả lời được" sub="Gợi ý bổ sung bài tri thức" />
                <ul className="divide-y hairline">
                  {d.unansweredQuestions.length === 0 && <li className="p-5 text-sm text-steel-500">Không có.</li>}
                  {d.unansweredQuestions.map((x: any, i: number) => (
                    <li key={i} className="px-5 py-3 text-sm">
                      {x.question}
                      <span className="block text-xs text-steel-500">{fmtDateTime(x.at)}</span>
                    </li>
                  ))}
                </ul>
              </Card>
              <Card>
                <CardHead title="Câu trả lời bị đánh giá kém" />
                <ul className="divide-y hairline">
                  {d.recentWrong.length === 0 && <li className="p-5 text-sm text-steel-500">Không có.</li>}
                  {d.recentWrong.map((x: any, i: number) => (
                    <li key={i} className="px-5 py-3 text-sm">
                      <span className="line-clamp-3">{x.answer}</span>
                      <span className="block text-xs text-steel-500">
                        {x.reason ?? ''} {x.comment ?? ''} · {fmtDateTime(x.at)}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          </div>
        )}
      </Async>
    </>
  );
}
