import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { LineChart, BarChart, PieChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent, TitleComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { tr, useI18n } from '@/lib/i18n';
echarts.use([LineChart, BarChart, PieChart, GridComponent, TooltipComponent, LegendComponent, TitleComponent, CanvasRenderer]);

function localizeOption(val: any): any {
  if (typeof val === 'string') return tr(val);
  if (Array.isArray(val)) return val.map(localizeOption);
  if (val && typeof val === 'object' && Object.prototype.toString.call(val) === '[object Object]') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) {
      if (k === 'name' || k === 'text' || k === 'subtext') {
        out[k] = typeof v === 'string' ? tr(v) : localizeOption(v);
      } else if (k === 'series' || k === 'data' || k === 'xAxis' || k === 'yAxis' || k === 'title' || k === 'legend') {
        out[k] = localizeOption(v);
      } else {
        out[k] = v;
      }
    }
    return out;
  }
  return val;
}

function formatCoreMoveoutLocalizeOptionDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

const TENANT_BOUNDED_FLOORPLAN_COLUMNS = [
  'depositHeldVnd',
  'balanceDueVnd',
  'lateFeeVnd',
  'discountCode',
  'paymentChannel',
  'lastInvoiceRef',
] as const;
