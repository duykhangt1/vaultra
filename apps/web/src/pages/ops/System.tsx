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
