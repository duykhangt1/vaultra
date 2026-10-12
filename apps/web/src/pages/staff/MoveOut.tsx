import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { INSPECTION_ITEMS, INSPECTION_ITEM_LABEL } from '@vaultra/shared';
import { useAuth } from '@/lib/auth';
import { useGet, useAct } from '@/lib/hooks';
import { get, post, newIdemKey } from '@/lib/api';
import { Async, Card, CardHead, PageHeader, PagedTable, DataTable, EmptyState, StatusBadge, Button, Alert, Field, Input, Select, Tabs, Badge, Stepper, MoneyInput, Textarea } from '@/ui';
import { vnd, fmtDate } from '@/lib/format';
import { ActBtn, Info, Money, REASON, PhotoGallery } from '../kit';
import { SignaturePad } from '@/widgets/SignaturePad';
import { PhotoUpload, Photo } from '@/widgets/PhotoUpload';
import { InspectionForm } from './Checkin';
import { ContractInspectionsCard } from '../app/Contracts';

export function getMoveOutStatusBadge(r: any, matchedRefund?: any, settlement?: any) {
  if (!r) return null;
  if (r.status === 'SCHEDULED') return <Badge tone="info" dot>Chờ kiểm tra kho</Badge>;
  if (r.status === 'INSPECTED') return <Badge tone="warn" dot>Chờ ký quyết toán</Badge>;
  if (r.status === 'DISPUTED') return <Badge tone="bad" dot>Đang khiếu nại</Badge>;
  if (r.status === 'CANCELLED') return <Badge tone="neutral" dot>Đã hủy</Badge>;
  if (r.status === 'COMPLETED') {
    const st = settlement ?? r.settlement;
    const refund = matchedRefund ?? r.refund;
    const net = Number(st?.net_amount ?? st?.netAmount ?? r.estimated_settlement?.net ?? 0);
    if (!isNaN(net) && net > 0) {
      if (refund?.status === 'SUCCEEDED') {
        return <Badge tone="ok" dot>Đã hoàn tiền & Hoàn tất</Badge>;
      }
      if (st?.status === 'FINALIZED' || refund?.status === 'APPROVED' || refund?.status === 'MANUAL_REQUIRED') {
        return <Badge tone="warn" dot>Chưa hoàn tiền (Chờ chi tiền mặt)</Badge>;
      }
      return <Badge tone="warn" dot>Chưa hoàn tiền</Badge>;
    }
    return <Badge tone="ok" dot>Hoàn tất</Badge>;
  }
  return <StatusBadge kind="generic" value={r.status} />;
}

export function isMoveOutFullyDone(r: any, matchedRefund?: any, settlement?: any): boolean {
  if (!r || r.status !== 'COMPLETED') return false;
  const st = settlement ?? r.settlement;
  const refund = matchedRefund ?? r.refund;
  const net = Number(st?.net_amount ?? st?.netAmount ?? r.estimated_settlement?.net ?? 0);
  if (!isNaN(net) && net > 0) {
    return refund?.status === 'SUCCEEDED';
  }
  return true;
}
