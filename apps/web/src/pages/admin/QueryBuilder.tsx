import { useEffect, useMemo, useState } from 'react';
import { Copy, Link2, Pencil, Play, Plus, Trash2 } from 'lucide-react';
import { useGet } from '@/lib/hooks';
import { Badge, Button, Input, Select, Alert, cn } from '@/ui';
import { toast } from '@/ui/toast';
import { buildSql, describeSpec, emptySpec, isBool, needsValueFor, opLabel, opsFor, type Cond, type Op, type QCol, type Spec } from './query-builder';

type TableInfoLite = { table: string; columns: (QCol & { generated?: boolean })[]; rows: number };

/** Ready-made questions: pick one and the form fills itself in. */
const PRESETS: { label: string; hint: string; spec: Partial<Spec> & { table: string } }[] = [
  { label: 'Hợp đồng đang nợ', hint: 'Hợp đồng không ở trạng thái đúng hạn', spec: { table: 'contracts', conds: [{ id: 1, column: 'delinquency_status', op: 'ne', value: 'CURRENT' }], sortBy: 'updated_at' } },
  { label: 'Hóa đơn chưa thanh toán', hint: 'Đã phát hành hoặc mới trả một phần', spec: { table: 'invoices', conds: [{ id: 1, column: 'status', op: 'in', value: 'ISSUED, PARTIALLY_PAID' }], sortBy: 'due_date', sortDir: 'ASC' } },
  { label: 'Khách mới nhất', hint: '20 khách đăng ký gần đây', spec: { table: 'customers', sortBy: 'created_at', limit: 20 } },
  { label: 'Đặt chỗ đã hủy', hint: 'Mới nhất trước', spec: { table: 'reservations', conds: [{ id: 1, column: 'status', op: 'eq', value: 'CANCELLED' }], sortBy: 'id' } },
  { label: 'Kho đang khóa chặn', hint: 'Kho bị khóa vì nợ', spec: { table: 'units', conds: [{ id: 1, column: 'status', op: 'eq', value: 'OVERLOCKED' }], sortBy: 'code', sortDir: 'ASC' } },
  { label: 'Lịch sử chỉnh dữ liệu', hint: 'Các lần sửa/xóa trực tiếp ở tab này', spec: { table: 'audit_logs', conds: [{ id: 1, column: 'action', op: 'starts', value: 'db.' }], sortBy: 'id' } },
];

const PICK_DEFAULT = ['code', 'full_name', 'name', 'email'];

function Step({ n, title, hint, children }: { n: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border hairline bg-white p-3.5">
      <div className="mb-2.5 flex items-start gap-2.5">
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-ink-900 text-xs font-bold text-white">{n}</span>
        <div><p className="text-sm font-bold text-ink-950">{title}</p>{hint && <p className="text-xs text-steel-500">{hint}</p>}</div>
      </div>
      {children}
    </section>
  );
}
