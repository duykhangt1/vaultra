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

/**
 * A text form of an option, with functions compared by their source. Pages build their option again on every render, so comparing objects would
 * always say "changed"; comparing this text says whether the chart would really look different.
 */
function optionKey(option: unknown): string {
  return JSON.stringify(option, (_k, v) => (typeof v === 'function' ? `fn:${String(v)}` : v));
}

/** The structure of an option: which parts and which series it has. While it stays the same, new data is merged into the chart instead of rebuilding it. */
function shapeKey(option: any): string {
  const series = Array.isArray(option?.series) ? option.series : option?.series ? [option.series] : [];
  return JSON.stringify([Object.keys(option ?? {}).sort(), series.map((s: any) => [s?.type ?? null, s?.name ?? null, s?.id ?? null])]);
}

/** A hover box that stays inside the chart and wraps long lines instead of running off the screen. */
function withTooltipDefaults(tooltip: any) {
  if (!tooltip) return tooltip;
  const one = (t: any) => ({ confine: true, extraCssText: 'max-width:320px;white-space:normal;', ...t });
  return Array.isArray(tooltip) ? tooltip.map(one) : one(tooltip);
}

/**
 * Thin ECharts wrapper (tree-shaken); resizes with its container.
 *
 * The hover box of a chart is part of the chart's drawn state. Rebuilding the chart (setOption with notMerge) wipes it, and the pages re-render
 * whenever fresh data arrives, so a box the user was reading used to vanish after a couple of seconds. The chart is therefore only touched when
 * its option really changed, and then it is updated in place, which keeps a hover box that is open.
 */
export default function Chart({ option, style, ariaLabel }: { option: any; style?: React.CSSProperties; ariaLabel?: string }) {
  const el = useRef<HTMLDivElement>(null);
  const inst = useRef<echarts.ECharts>();
  const applied = useRef<{ key: string; shape: string } | null>(null);
  const locale = useI18n((s) => s.locale);
  useEffect(() => {
    if (!el.current) return;
    applied.current = null;
    inst.current = echarts.init(el.current, undefined, { renderer: 'canvas' });
    const ro = new ResizeObserver(() => inst.current?.resize());
    ro.observe(el.current);
    return () => { ro.disconnect(); inst.current?.dispose(); inst.current = undefined; };
  }, []);
  useEffect(() => {
    const chart = inst.current;
    if (!chart) return;
    const localized = locale === 'en' ? localizeOption(option) : option;
    const key = `${locale}|${optionKey(localized)}`;
    if (applied.current?.key === key) return;
    const shape = shapeKey(localized);
    const next = { textStyle: { fontFamily: 'inherit' }, ...localized, ...(localized?.tooltip ? { tooltip: withTooltipDefaults(localized.tooltip) } : {}) };
    if (applied.current?.shape === shape) chart.setOption(next, { replaceMerge: ['series', 'xAxis', 'yAxis', 'legend'] });
    else chart.setOption(next, true);
    applied.current = { key, shape };
  }, [option, locale]);
  return <div ref={el} style={style} role="img" aria-label={tr(ariaLabel ?? 'Biểu đồ')} />;
}
