import { useEffect, useMemo, useState } from 'react';
import { Download, Search, ArrowUp, ArrowDown, ArrowUpDown, Camera } from 'lucide-react';
import { REPORT_SUMMARY } from '@vaultra/shared';
import { useGet, useAct } from '@/lib/hooks';
import { post } from '@/lib/api';
import { openAuthed } from '@/lib/download';
import { Async, Card, CardHead, PageHeader, Button, Select, Input, EmptyState, Tabs, Field, Badge, Drawer, HelpTip, Tip, cn } from '@/ui';
import { vnd, pct, fmtDate, STATUS, enumLabel } from '@/lib/format';
import { toast } from '@/ui/toast';
import { useAuth } from '@/lib/auth';
import { PeriodPicker, periodOf, periodLabel } from '@/widgets/PeriodPicker';
import type { Period } from '@/widgets/PeriodPicker';

export const REPORTS: [string, string][] = [['occupancy', 'Lấp đầy'], ['revenue', 'Doanh thu'], ['rent-roll', 'Hợp đồng đang thuê'], ['receivables-aging', 'Công nợ theo tuổi'], ['delinquency', 'Nợ quá hạn'], ['renewals', 'Gia hạn'], ['cancellations', 'Hủy đặt chỗ'], ['move-activity', 'Nhận/trả kho'], ['refunds', 'Hoàn tiền'], ['abandoned-goods', 'Tài sản tồn đọng'], ['staff-performance', 'Hiệu suất nhân viên'], ['support-sla', 'SLA hỗ trợ'], ['facility-comparison', 'So sánh cơ sở'], ['promotions', 'Khuyến mãi'], ['reconciliation', 'Đối soát']];
/** Reports only the head office (BOM) may open: a facility manager never sees these tabs. */
const BOM_ONLY = ['facility-comparison', 'promotions', 'reconciliation'];
/** Reports that are a picture of the moment you open them, so the date range does not change them. */
const SNAPSHOT = ['rent-roll', 'receivables-aging', 'delinquency'];
