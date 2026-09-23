import { vnd, pct, num } from '@/lib/format';

/**
 * Hover-box and axis text for charts, by what the number measures. ECharts hands over the raw value, so without these a chart shows
 * 0.0994871948717949 for a rate and 13400248 for money. A month without data arrives as null/'-' and reads "Chưa có dữ liệu", not 0.
 */
const blank = (v: unknown) => v === null || v === undefined || v === '' || v === '-' || Number.isNaN(Number(v));
export const tipMoney = (v: unknown) => (blank(v) ? 'Chưa có dữ liệu' : vnd(Number(v)));
export const tipPct = (v: unknown) => (blank(v) ? 'Chưa có dữ liệu' : pct(Number(v), 1));
export const tipInt = (v: unknown) => (blank(v) ? 'Chưa có dữ liệu' : num(Number(v)));
/** Axis label for money: 13 400 000 → "13,4 tr". */
export const axisMillions = (v: number) => `${num(v / 1e6, 1)} tr`;
export const axisPct = (v: number) => `${Math.round(v * 100)}%`;
