import { Fragment, useState } from 'react';
import { useGet, useAct } from '@/lib/hooks';
import { post, patch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Alert, Async, Card, CardHead, PageHeader, StatusBadge, Button, Select, Tabs, Badge, DataTable, Drawer, Timeline, EmptyState, Input, usePaged } from '@/ui';
import { vnd, fmtDate, fmtDateTime, enumLabel, statusOf } from '@/lib/format';
import { ActBtn, Info, Money, REASON, PhotoGallery } from '../kit';
import { useFacility } from '../shared/Ops';
import { DebtGuide, nextStep, useDebtPolicy } from './DebtGuide';

/** Names for the kinds of money a debt is made of (see debtBreakdown in the API). */
const DEBT_KIND: Record<string, string> = { RENT: 'Tiền thuê', LATE_FEE: 'Phí trễ hạn', OVERLOCK_FEE: 'Phí khóa chặn', DAMAGE: 'Bồi thường hư hại', FEE: 'Phí khác', ADJUSTMENT: 'Điều chỉnh', DISCOUNT: 'Giảm trừ', OTHER: 'Thuế & điều chỉnh khác', PAID: 'Đã thanh toán', CREDITED: 'Đã ghi có' };
const INV_TYPE: Record<string, string> = { RECURRING: 'Tiền thuê định kỳ', AD_HOC: 'Phí phát sinh', RESERVATION: 'Đặt chỗ', MOVE_IN: 'Nhận kho', RENEWAL: 'Gia hạn', SETTLEMENT: 'Quyết toán' };

/** "Tiền thuê 2.690.000 ₫ + Phí trễ hạn 269.000 ₫ − Đã thanh toán 300.000 ₫" — the sum that makes up Dư nợ. */
function DebtParts({ parts, className }: { parts?: { kind: string; amount: number }[]; className?: string }) {
  if (!parts?.length) return null;
  // each part is an inline-block, and the space between parts sits OUTSIDE it, so a long sum wraps between parts instead of running into the next column
  return <span className={className ?? 'block text-xs text-steel-500'}>{parts.map((p, i) => <Fragment key={p.kind}>{i > 0 && ' '}<span className="inline-block whitespace-nowrap">{i > 0 && (p.amount < 0 ? '− ' : '+ ')}{i === 0 && p.amount < 0 ? '− ' : ''}{DEBT_KIND[p.kind] ?? p.kind} <span className="num">{vnd(Math.abs(p.amount))}</span></span></Fragment>)}</span>;
}

/** Every unpaid invoice behind the debt, line by line, ending in the total. */
function DebtBreakdown({ c }: { c: any }) {
  const invs: any[] = c.debtInvoices ?? [];
  if (!invs.length) return <p className="text-xs text-steel-500">Hợp đồng này không còn hóa đơn nào chưa thanh toán.</p>;
  return (
    <div className="space-y-3">
      {invs.map((i) => (
        <div key={i.id} className="overflow-hidden rounded-xl border hairline text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 bg-paper px-3 py-2">
            <span><b className="code">{i.code}</b> <span className="text-xs text-steel-500">{INV_TYPE[i.type] ?? i.type}</span></span>
            <span className="text-xs text-steel-500">Hạn {fmtDate(i.dueDate)} · {i.daysOverdue > 0 ? <b className="text-bad-600">quá hạn {i.daysOverdue} ngày</b> : 'chưa đến hạn'}</span>
          </div>
          <table className="w-full text-[13px]"><tbody>
            {i.lines.map((l: any, k: number) => <tr key={k} className="border-t hairline"><td className="px-3 py-1.5">{l.description}</td><td className="whitespace-nowrap px-3 py-1.5 text-right num">{vnd(l.amount)}</td></tr>)}
            {i.otherAdjust !== 0 && <tr className="border-t hairline"><td className="px-3 py-1.5 text-steel-600">Thuế & điều chỉnh khác</td><td className="whitespace-nowrap px-3 py-1.5 text-right num">{vnd(i.otherAdjust)}</td></tr>}
            {i.paid > 0 && <tr className="border-t hairline"><td className="px-3 py-1.5 text-steel-600">Đã thanh toán</td><td className="whitespace-nowrap px-3 py-1.5 text-right num">− {vnd(i.paid)}</td></tr>}
            {i.credited > 0 && <tr className="border-t hairline"><td className="px-3 py-1.5 text-steel-600">Đã ghi có</td><td className="whitespace-nowrap px-3 py-1.5 text-right num">− {vnd(i.credited)}</td></tr>}
            <tr className="border-t hairline bg-paper font-semibold"><td className="px-3 py-1.5">Còn nợ hóa đơn này</td><td className="whitespace-nowrap px-3 py-1.5 text-right num">{vnd(i.outstanding)}</td></tr>
          </tbody></table>
        </div>
      ))}
      <div className="flex items-center justify-between rounded-xl bg-ink-900 px-4 py-3 text-white"><span className="text-sm font-semibold">Tổng dư nợ ({invs.length} hóa đơn)</span><b className="display text-xl num">{vnd(c.debt)}</b></div>
    </div>
  );
}
