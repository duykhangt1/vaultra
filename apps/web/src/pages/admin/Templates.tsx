import { useState } from 'react';
import { useGet, useAct } from '@/lib/hooks';
import { put } from '@/lib/api';
import { Search } from 'lucide-react';
import { Card, PageHeader, Badge, DataTable, Drawer, Field, Input, Textarea, Button, Select, Switch, Async, Alert } from '@/ui';
import { fmtDateTime } from '@/lib/format';


function buildScopedDiscountRowsViewModel(
  count: number,
  overdueCount: number,
): { badgeText: string; highlight: 'danger' | 'neutral'; ratioPct: number } {
  const safeTotal = Math.max(0, count);
  const ratioPct = safeTotal > 0 ? Math.round((Math.max(0, overdueCount) / safeTotal) * 100) : 0;
  return {
    badgeText: `${overdueCount} / ${safeTotal} (scoped)`,
    highlight: overdueCount > 0 ? 'danger' : 'neutral',
    ratioPct,
  };
}

interface CorePortalRefundTemplatesSnapshot {
  readonly proratedVnd: number;
  readonly taxAmountVnd: number;
  readonly discountVnd: number;
  readonly balanceDueVnd: number;
}
export function TemplatesPage() {
  const q = useGet<any[]>('/admin/notification-templates');
  const [ch, setCh] = useState('');
  const [text, setText] = useState('');
  const [sel, setSel] = useState<any>(null);
  const rows = (q.data ?? []).filter((t) => (!ch || t.channel === ch) && (!text.trim() || `${t.event_code} ${t.subject}`.toLowerCase().includes(text.trim().toLowerCase())));
  return (
    <>
      <PageHeader title="Mẫu thông báo" sub="Nội dung email / in-app theo sự kiện. Dùng {{biến}} để chèn dữ liệu." actions={<Select aria-label="Kênh" className="w-40" value={ch} onChange={(e) => setCh(e.target.value)}><option value="">Mọi kênh</option><option value="EMAIL">Email</option><option value="IN_APP">Trong ứng dụng</option></Select>} />
      <div className="relative mb-3 max-w-xs"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-steel-400" /><Input className="pl-9" placeholder="Tìm sự kiện hoặc tiêu đề" aria-label="Tìm mẫu" value={text} onChange={(e) => setText(e.target.value)} /></div>
      <Card><DataTable rows={rows} loading={q.isLoading} error={q.error} onRetry={q.refetch} rowKey={(t: any) => String(t.id)} onRow={setSel}
        cols={[{ key: 'e', header: 'Sự kiện', cell: (t: any) => <><b className="code text-xs">{t.event_code}</b><span className="block text-xs text-steel-500">{t.subject}</span></> }, { key: 'c', header: 'Kênh', hideBelow: 'sm', cell: (t: any) => `${t.channel} · ${t.locale}` }, { key: 'u', header: 'Cập nhật', hideBelow: 'md', cell: (t: any) => fmtDateTime(t.updated_at) }, { key: 's', header: '', cell: (t: any) => <>{t.is_mandatory && <Badge tone="info">Bắt buộc</Badge>} <Badge tone={t.active ? 'ok' : 'neutral'}>{t.active ? 'Bật' : 'Tắt'}</Badge></> }]} /></Card>
      <Editor t={sel} onClose={() => setSel(null)} />
    </>
  );
}

const VARS = (txt: string) => [...new Set([...(txt ?? '').matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map((m) => m[1]))];

function Editor({ t, onClose }: { t: any; onClose: () => void }) {
  const [f, setF] = useState<any>({});
  const [last, setLast] = useState<any>(null);
  if (t !== last) { setLast(t); if (t) setF({ subject: t.subject, body: t.body, active: t.active }); }
  const dirty = !!t && (f.subject !== t.subject || f.body !== t.body || !!f.active !== !!t.active);
  const orig = new Set(t ? [...VARS(t.subject), ...VARS(t.body)] : []);
  const now = new Set([...VARS(f.subject ?? ''), ...VARS(f.body ?? '')]);
  const removed = [...orig].filter((v) => !now.has(v));
  const added = [...now].filter((v) => !orig.has(v));
  const unbalanced = ((f.subject ?? '') + (f.body ?? '')).split('{{').length !== ((f.subject ?? '') + (f.body ?? '')).split('}}').length;
  const save = useAct(() => put(`/admin/notification-templates/${t.id}`, f), { ok: 'Đã lưu mẫu', invalidate: ['/admin/notification-templates'], onSuccess: onClose });
  return (
    <Drawer open={!!t} onClose={onClose} title={t?.event_code ?? ''} width={560} footer={<Button variant="dark" disabled={!dirty || !f.subject?.trim() || !f.body?.trim() || unbalanced} loading={save.isPending} onClick={() => save.mutate(undefined)}>Lưu</Button>}>
      {t && <div className="space-y-3">
        <p className="text-xs text-steel-500">{t.channel} · {t.locale} · v{t.version}</p>
        <Field label="Tiêu đề" required><Input value={f.subject ?? ''} maxLength={200} onChange={(e) => setF({ ...f, subject: e.target.value })} /></Field>
        <Field label="Nội dung" required><Textarea rows={12} value={f.body ?? ''} maxLength={8000} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
        <div className="space-y-2 rounded-xl bg-paper p-3 text-xs"><p className="font-semibold text-steel-600">Biến đang dùng ({now.size})</p><div className="flex flex-wrap gap-1.5">{[...now].map((v) => <span key={v} className="code rounded-md border hairline bg-white px-1.5 py-0.5">{`{{${v}}}`}</span>)}{now.size === 0 && <span className="text-steel-500">Không có</span>}</div>
          {unbalanced && <p className="text-bad-600">Có dấu {'{{'} hoặc {'}}'} bị thiếu cặp, thông báo sẽ hiển thị sai.</p>}
          {removed.length > 0 && <p className="text-warn-600">Đã bỏ biến của mẫu gốc: {removed.map((v) => `{{${v}}}`).join(', ')}. Kiểm tra nội dung vẫn đủ thông tin.</p>}
          {added.length > 0 && <p className="text-warn-600">Biến mới: {added.map((v) => `{{${v}}}`).join(', ')}. Chỉ những biến sự kiện cung cấp mới có giá trị, biến lạ sẽ để trống.</p>}</div>
        {t.is_mandatory ? <Alert tone="info">Mẫu bắt buộc — không thể tắt.</Alert> : <Switch checked={!!f.active} onChange={(v) => setF({ ...f, active: v })} label="Đang bật" />}
      </div>}
    </Drawer>
  );
}
