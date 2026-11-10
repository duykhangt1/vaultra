import { Injectable, Logger } from '@nestjs/common';
import { REPORT_SUMMARY } from '@vaultra/shared';
import ExcelJS from 'exceljs';
import { PrismaService } from '../common/prisma.service';
import { AppError, forbidden, notFound, validation } from '../common/errors';
import { D, maskEmail, maskPhone, newId } from '../common/util';
import { addDays, dateOnly, diffDays, ymd } from '../common/dates';
import { CoreService, fmt } from '../domain/core.service';
import { PdfService } from '../media/pdf.service';
import { MediaService } from '../media/media.service';
import { NotificationService } from '../notifications/notification.service';
import { AuditService } from '../audit/audit.service';
import type { AccessContext } from '../auth/access-context';
import {
  STOCK_FACILITY_STATUSES, NON_RENTABLE_UNIT_STATUSES, OCCUPIED_UNIT_STATUSES, LIVE_CONTRACT_STATUSES,
  emptyOcc, occRates, sumOcc, emptyAging, agingBucket, agingTotals, sumAging, sumRevenue, facilitySnapshots, sumSnapshots, dayKey, bucketOf,
  localDayStart, localDayEnd, localRange, buildCsv, resolveAdminPeriod, adminBucketKey, emptyAdminSeries,
} from './metrics';
import type { OccCounts, RevenueParts, AgingBuckets, Snapshot } from './metrics';
import { label } from './labels';
import { decorateReport } from './report-docs';
import type { ReportColumn } from './report-docs';

export interface ReportParams {
  from: Date;
  to: Date;
  facilityIds: bigint[] | null; // null = all (BOM)
  groupBy: 'day' | 'month' | 'year';
  unitTypeId?: bigint | null;
}

/** The summary tiles of a report as label / value lines for the PDF: numbers formatted like on screen, grouped tiles spelled out in one line. */
function summaryLines(summary?: Record<string, unknown>): [string, string][] {
  if (!summary) return [];
  const money = (n: unknown) => `${Math.round(Number(n)).toLocaleString('vi-VN')} ₫`;
  const out: [string, string][] = [];
  for (const [k, v] of Object.entries(summary)) {
    const m = REPORT_SUMMARY[k];
    const name = m?.label ?? k;
    if (v === null || v === undefined) out.push([name, '—']);
    else if (Array.isArray(v)) {
      const parts = v.map((x: { label?: string; type?: string; count?: number; amount?: number }) =>
        x.label !== undefined ? `${x.label}: ${x.count}${Number(x.amount) > 0 ? ` (${money(x.amount)})` : ''}` : `${label('fee', x.type)}: ${money(x.amount)}`);
      out.push([name, parts.join(' · ') || 'Không có dữ liệu']);
    } else if (typeof v === 'object') {
      const parts = Object.entries(v as Record<string, number>).map(([c, n]) => `${label('unit', c)}: ${n}`);
      out.push([name, parts.join(' · ') || 'Không có dữ liệu']);
    } else out.push([name, m?.kind === 'pct' ? `${(Number(v) * 100).toFixed(1)}%` : m?.kind === 'money' ? money(v) : typeof v === 'number' ? v.toLocaleString('vi-VN') : String(v)]);
  }
  return out;
}

interface Table {
  title: string;
  description?: string;
  notes?: string[];
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  /** One bottom row that stands for the whole table (e.g. the system-wide occupancy), shown instead of adding the columns up. */
  totalRow?: Record<string, unknown>;
  summary?: Record<string, unknown>;
  series?: { label: string; points: { x: string; y: number }[] }[];
}

export const REPORT_CODES = ['occupancy', 'revenue', 'rent-roll', 'receivables-aging', 'delinquency', 'renewals', 'cancellations', 'move-activity', 'staff-performance', 'support-sla', 'facility-comparison', 'promotions', 'reconciliation', 'refunds', 'abandoned-goods'] as const;

const REFUND_REASON_VI: Record<string, string> = { DEPOSIT_RETURN: 'Hoàn cọc khi trả kho', PREPAID_RETURN: 'Hoàn tiền thuê trả trước', CANCELLATION: 'Hoàn tiền hủy đặt kho', OVERPAYMENT: 'Hoàn tiền đóng thừa', DUPLICATE_CHARGE: 'Hoàn tiền thu trùng', GOODWILL: 'Hoàn hỗ trợ thiện chí', LATE_WEBHOOK: 'Hoàn giao dịch trễ' };
const REFUND_STATUS_VI: Record<string, string> = { PENDING_APPROVAL: 'Chờ duyệt', APPROVED: 'Đã duyệt, chờ chi tiền', MANUAL_REQUIRED: 'Đã duyệt, chờ chi tiền', PROCESSING: 'Đang xử lý', SUCCEEDED: 'Đã hoàn tiền', REJECTED: 'Đã từ chối', FAILED: 'Lỗi xử lý' };
const REFUND_METHOD_VI: Record<string, string> = { CASH: 'Tiền mặt tại quầy', BANK_TRANSFER: 'Chuyển khoản', ORIGINAL_METHOD: 'Phương thức gốc' };
const APPROVER_VI: Record<string, string> = { FACILITY_MANAGER: 'Quản lý cơ sở', BUSINESS_OPS_MANAGER: 'Quản lý vận hành (BOM)' };
const DISPOSITION_VI: Record<string, string> = { PENDING: 'Chờ quyết định', RETURNED_TO_TENANT: 'Trả lại khách', DISPOSED: 'Tiêu hủy', SOLD: 'Thanh lý' };

export type DetailLine = { label: string; value: unknown; type?: 'money' | 'date' | 'int' };

/** Counts and money per group, for the summary tiles of the refund / abandoned-goods reports. */
export function groupTotals<T>(rows: T[], keyOf: (r: T) => string, amountOf: (r: T) => number) {
  const m = new Map<string, { label: string; count: number; amount: number }>();
  for (const r of rows) {
    const label = keyOf(r);
    const g = m.get(label) ?? { label, count: 0, amount: 0 };
    g.count += 1;
    g.amount += amountOf(r);
    m.set(label, g);
  }
  return [...m.values()].sort((a, b) => b.amount - a.amount || b.count - a.count);
}

/** Metric definitions in one place (spec §17.1) — dashboards and reports read from here. */
@Injectable()
export class ReportService {
  private readonly logger = new Logger('Reports');
  constructor(private prisma: PrismaService, private core: CoreService, private pdf: PdfService, private media: MediaService, private notify: NotificationService, private audit: AuditService) {}

  private fIn(ids: bigint[] | null, col = 'facility_id') {
    return ids ? { [col]: { in: ids } } : {};
  }

  // ---------------------------------------------------------------- core metrics
  // Every dashboard and report builds on the functions in this block, so a number cannot be worked out two ways on two screens.

  /** Facilities that count toward occupancy: open for business (not a draft, not closed for good). */
  async stockFacilityIds(): Promise<bigint[]> {
    return (await this.prisma.facility.findMany({ where: { deleted_at: null, status: { in: STOCK_FACILITY_STATUSES as never } }, select: { id: true } })).map((f) => f.id);
  }

  /** Facilities whose money counts: everything that has traded (not a draft). */
  async moneyFacilityIds(): Promise<bigint[]> {
    return (await this.prisma.facility.findMany({ where: { deleted_at: null, status: { not: 'DRAFT' } }, select: { id: true } })).map((f) => f.id);
  }

  /** Raw unit and rent counts for some facilities (null = every facility that has rentable stock). Rates are derived from these with `occRates`. */
  async occupancyCounts(facilityIds: bigint[] | null, unitTypeId?: bigint | null): Promise<OccCounts> {
    const scope = facilityIds ?? (await this.stockFacilityIds());
    if (!scope.length) return emptyOcc();
    const units = await this.prisma.unit.findMany({
      where: { deleted_at: null, facility_id: { in: scope }, ...(unitTypeId ? { unit_type_id: unitTypeId } : {}) },
      select: { id: true, status: true, unit_type: { select: { area_m2: true, list_price: true } } },
    });
    const c = emptyOcc();
    const rentable = new Set<string>();
    for (const u of units) {
      c.total += 1;
      c.byStatus[u.status] = (c.byStatus[u.status] ?? 0) + 1;
      if (NON_RENTABLE_UNIT_STATUSES.includes(u.status)) continue;
      c.rentable += 1;
      rentable.add(u.id.toString());
      const area = Number(u.unit_type?.area_m2 ?? 0);
      c.areaRentable += area;
      c.potentialRent += Number(u.unit_type?.list_price ?? 0);
      if (OCCUPIED_UNIT_STATUSES.includes(u.status)) {
        c.occupied += 1;
        c.areaOccupied += area;
      }
    }
    // rent only counts for contracts whose unit is part of the rentable stock above, so the economic rate and the unit rate describe the same units
    const contracts = await this.prisma.contract.findMany({
      where: { status: { in: LIVE_CONTRACT_STATUSES as never }, facility_id: { in: scope }, ...(unitTypeId ? { unit_type_id: unitTypeId } : {}) },
      select: { unit_id: true, monthly_rent: true },
    });
    for (const k of contracts) {
      if (!rentable.has(k.unit_id.toString())) continue;
      c.actualRent += Number(k.monthly_rent ?? 0);
      c.activeContracts += 1;
    }
    c.areaRentable = Math.round(c.areaRentable * 100) / 100;
    c.areaOccupied = Math.round(c.areaOccupied * 100) / 100;
    return c;
  }

  async occupancyNow(facilityIds: bigint[] | null, unitTypeId?: bigint | null) {
    const c = await this.occupancyCounts(facilityIds, unitTypeId);
    return { ...c, ...occRates(c) };
  }

  /** The rent / discount / proration lines that belong to the period, each with the share of it that falls on the period's days. */
  private async recognizedRentLines(facilityIds: bigint[], from: Date, to: Date) {
    if (!facilityIds.length) return [] as { amount: number; contractId: bigint | null; reservationId: bigint | null }[];
    const rent = await this.prisma.invoiceItem.findMany({
      where: { item_type: { in: ['RENT', 'DISCOUNT', 'PRORATION'] }, service_period_start: { lte: to }, service_period_end: { gte: from }, invoice: { status: { notIn: ['VOID'] }, facility_id: { in: facilityIds } } },
      select: { amount: true, service_period_start: true, service_period_end: true, invoice: { select: { reservation_id: true, contract_id: true } } },
    });
    const lines: { amount: number; contractId: bigint | null; reservationId: bigint | null }[] = [];
    for (const r of rent) {
      const s = r.service_period_start!;
      const e = r.service_period_end!;
      const days = diffDays(e, s) + 1;
      const ov = diffDays(e < to ? e : to, s > from ? s : from) + 1;
      if (ov > 0 && days > 0) lines.push({ amount: Number(D(r.amount).mul(ov).div(days)), contractId: r.invoice?.contract_id ?? null, reservationId: r.invoice?.reservation_id ?? null });
    }
    return lines;
  }

  /** One facility's money for a period. Everything larger (a chain, a month series, a total row) is the sum of these, so totals always add up. */
  private async revenueOne(facilityId: bigint, from: Date, to: Date): Promise<RevenueParts> {
    const fac = { facility_id: { in: [facilityId] } };
    const when = localRange(from, to);
    const items = await this.prisma.invoiceItem.findMany({ where: { item_type: { not: 'DEPOSIT' }, invoice: { status: { not: 'VOID' }, issue_date: { gte: from, lte: to }, ...fac } }, select: { amount: true } });
    const billed = items.reduce((s, i) => s.add(i.amount), D(0));
    const pays = await this.prisma.payment.aggregate({ where: { status: { in: ['SUCCEEDED', 'PARTIALLY_REFUNDED', 'REFUNDED'] }, method: { not: 'CREDIT_BALANCE' }, paid_at: when, ...fac }, _sum: { amount: true } });
    const refunds = await this.prisma.refund.aggregate({ where: { status: 'SUCCEEDED', processed_at: when, ...fac }, _sum: { amount: true } });
    const collected = D(pays._sum.amount ?? 0).sub(refunds._sum.amount ?? 0);
    const rentLines = await this.recognizedRentLines([facilityId], from, to);
    const rentRecognized = rentLines.reduce((s, l) => s + l.amount, 0);
    const fees = await this.prisma.invoiceItem.aggregate({ where: { item_type: { in: ['FEE', 'DAMAGE', 'ADJUSTMENT'] }, invoice: { status: { notIn: ['VOID'] }, issue_date: { gte: from, lte: to }, ...fac } }, _sum: { amount: true } });
    const credits = await this.prisma.creditNote.aggregate({ where: { issued_at: when, invoice: fac }, _sum: { amount: true } });
    const forfeited = await this.prisma.deposit.aggregate({ where: { updated_at: when, forfeited_amount: { gt: 0 }, reservation: fac }, _sum: { forfeited_amount: true } });
    const recognized = D(rentRecognized).add(fees._sum.amount ?? 0).sub(credits._sum.amount ?? 0).add(forfeited._sum.forfeited_amount ?? 0);
    return { billed: Math.round(Number(billed)), collected: Math.round(Number(collected)), recognized: Math.round(Number(recognized)), refunded: Number(refunds._sum.amount ?? 0), rentRecognized: Math.round(rentRecognized) };
  }

  /** Billed (excl. deposits), collected (payments − refunds), recognized (rent by service days + fees − credits), refunded. null = every facility that has traded. */
  async revenue(facilityIds: bigint[] | null, from: Date, to: Date): Promise<RevenueParts> {
    const ids = facilityIds ?? (await this.moneyFacilityIds());
    return sumRevenue(await Promise.all(ids.map((id) => this.revenueOne(id, from, to))));
  }

  /** Recognized rent of the period split by unit size (XS, S, M…). The sizes add up to `rentRecognized` of the same period. */
  async rentBySize(facilityIds: bigint[] | null, from: Date, to: Date): Promise<{ size: string; amount: number }[]> {
    const ids = facilityIds ?? (await this.moneyFacilityIds());
    const lines = await this.recognizedRentLines(ids, from, to);
    if (!lines.length) return [];
    const cIds = [...new Set(lines.map((l) => l.contractId).filter((x): x is bigint => x != null))];
    const rIds = [...new Set(lines.map((l) => l.reservationId).filter((x): x is bigint => x != null))];
    const [contracts, reservations, unitTypes] = await Promise.all([
      cIds.length ? this.prisma.contract.findMany({ where: { id: { in: cIds } }, select: { id: true, unit_type_id: true } }) : [],
      rIds.length ? this.prisma.reservation.findMany({ where: { id: { in: rIds } }, select: { id: true, unit_type_id: true } }) : [],
      this.prisma.unitType.findMany({ select: { id: true, size_category: true } }),
    ]);
    const sizeOfType = new Map(unitTypes.map((u) => [u.id.toString(), String(u.size_category)]));
    const typeOfContract = new Map(contracts.map((c) => [c.id.toString(), c.unit_type_id.toString()]));
    const typeOfReservation = new Map(reservations.map((r) => [r.id.toString(), r.unit_type_id.toString()]));
    const by = new Map<string, number>();
    for (const l of lines) {
      const t = (l.contractId != null ? typeOfContract.get(l.contractId.toString()) : undefined) ?? (l.reservationId != null ? typeOfReservation.get(l.reservationId.toString()) : undefined);
      const size = (t && sizeOfType.get(t)) || 'Khác';
      by.set(size, (by.get(size) ?? 0) + l.amount);
    }
    return [...by.entries()].map(([size, amount]) => ({ size, amount: Math.round(amount) })).sort((a, b) => b.amount - a.amount);
  }

  /** Open invoice balances by age. null = every facility that has traded. */
  async agingBuckets(facilityIds: bigint[] | null): Promise<AgingBuckets> {
    const today = this.core.today();
    const ids = facilityIds ?? (await this.moneyFacilityIds());
    if (!ids.length) return emptyAging();
    const open = await this.prisma.invoice.findMany({ where: { status: { in: ['ISSUED', 'PARTIALLY_PAID'] }, facility_id: { in: ids } }, select: { total: true, amount_paid: true, amount_credited: true, due_date: true } });
    const b = emptyAging();
    for (const i of open) b[agingBucket(diffDays(today, i.due_date))] += Number(D(i.total).sub(i.amount_paid).sub(i.amount_credited));
    return b;
  }

  async aging(facilityIds: bigint[] | null) {
    const b = await this.agingBuckets(facilityIds);
    return { ...b, ...agingTotals(b) };
  }

  /** Stored daily facility snapshots in a range, facility level only (null-safe against the older duplicated rows). */
  private async metricRows(facilityIds: bigint[], from: Date, to: Date) {
    if (!facilityIds.length) return [];
    return this.prisma.dailyFacilityMetric.findMany({ where: { unit_type_key: 0, facility_id: { in: facilityIds }, metric_date: { gte: addDays(from, -1), lte: addDays(to, 1) } } });
  }

  /** Each facility's latest stored snapshot inside [from, to]. */
  private async lastSnapshots(facilityIds: bigint[], from: Date, to: Date) {
    const lo = ymd(from)!;
    const hi = ymd(to)!;
    const last = new Map<string, Snapshot>();
    for (const s of facilitySnapshots((await this.metricRows(facilityIds, from, to)) as never).values()) {
      if (s.day < lo || s.day > hi) continue;
      const prev = last.get(s.facility);
      if (!prev || s.day > prev.day) last.set(s.facility, s);
    }
    return [...last.values()];
  }

  /**
   * The last `months` months. Money of every month is worked out from invoices and payments (never from stored daily sums), and the
   * occupancy of the current month is live, so the last point always equals the headline figures. Earlier months use the last stored
   * snapshot of that month, or nothing when none was kept.
   */
  async monthlyTrend(facilityIds: bigint[] | null, months = 12) {
    const today = this.core.today();
    const moneyIds = facilityIds ?? (await this.moneyFacilityIds());
    const stockIds = facilityIds ?? (await this.stockFacilityIds());
    const out: Array<RevenueParts & { month: string; asOf: string | null; rentable: number | null; occupied: number | null; unitRate: number | null; areaRate: number | null; economicRate: number | null }> = [];
    for (let i = months - 1; i >= 0; i -= 1) {
      const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i, 1));
      const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0));
      const to = last > today ? today : last;
      const rev = await this.revenue(moneyIds, first, to);
      let occ: ReturnType<typeof sumSnapshots> | null = null;
      let asOf: string | null = null;
      if (i === 0) {
        const c = await this.occupancyCounts(stockIds);
        occ = { rentable: c.rentable, occupied: c.occupied, areaRentable: c.areaRentable, areaOccupied: c.areaOccupied, potentialRent: c.potentialRent, actualRent: c.actualRent, activeContracts: c.activeContracts };
        asOf = ymd(today);
      } else {
        const snaps = await this.lastSnapshots(stockIds, first, last);
        if (snaps.length) {
          occ = sumSnapshots(snaps);
          asOf = snaps.map((s) => s.day).sort().pop() ?? null;
        }
      }
      const r = occ ? occRates(occ) : null;
      out.push({ month: ymd(first)!.slice(0, 7), ...rev, asOf, rentable: occ?.rentable ?? null, occupied: occ?.occupied ?? null, unitRate: occ && occ.rentable ? r!.unitRate : null, areaRate: occ && occ.areaRentable ? r!.areaRate : null, economicRate: occ && occ.potentialRent ? r!.economicRate : null });
    }
    // months before anything happened would only draw an empty stretch
    while (out.length > 1 && out[0].billed === 0 && out[0].collected === 0 && out[0].recognized === 0 && out[0].unitRate === null) out.shift();
    return out;
  }

  /** Cohort of contract terms that end in the range, and how many of them were renewed. */
  async renewalStats(facilityIds: bigint[] | null, from: Date, to: Date) {
    const fac = facilityIds ? { facility_id: { in: facilityIds } } : {};
    const terms = await this.prisma.contractTerm.findMany({
      where: { end_date: { gte: from, lte: to }, status: { not: 'CANCELLED' }, contract: { status: { in: ['ACTIVE', 'MOVE_OUT_SCHEDULED', 'EXPIRED', 'ENDED', 'CLOSED'] }, ...fac } },
      select: { contract_id: true, sequence_no: true },
    });
    if (!terms.length) return { ending: 0, renewed: 0, rate: null as number | null };
    const later = await this.prisma.contractTerm.findMany({ where: { contract_id: { in: [...new Set(terms.map((t) => t.contract_id))] }, type: 'RENEWAL', status: { not: 'CANCELLED' } }, select: { contract_id: true, sequence_no: true } });
    const renewed = terms.filter((t) => later.some((l) => l.contract_id === t.contract_id && l.sequence_no > t.sequence_no)).length;
    return { ending: terms.length, renewed, rate: renewed / terms.length };
  }

  /** Reservations created in the range and how many were cancelled or never showed; quotes created in the range and how many became a reservation. */
  async cancellationStats(facilityIds: bigint[] | null, from: Date, to: Date) {
    const fac = facilityIds ? { facility_id: { in: facilityIds } } : {};
    const when = localRange(from, to);
    const created = await this.prisma.reservation.findMany({ where: { created_at: when, ...fac }, select: { status: true } });
    const cancelled = created.filter((r) => ['CANCELLED', 'NO_SHOW'].includes(r.status)).length;
    const quotes = await this.prisma.quote.findMany({ where: { created_at: when, purpose: 'NEW_RENTAL', ...fac }, select: { id: true } });
    const converted = quotes.length ? await this.prisma.reservation.count({ where: { quote_id: { in: quotes.map((q) => q.id) } } }) : 0;
    return { created: created.length, cancelled, rate: created.length ? cancelled / created.length : null, quotes: quotes.length, converted, conversion: quotes.length ? converted / quotes.length : null };
  }

  /** Tickets resolved or closed in the range and how many of them stayed within SLA. */
  async slaStats(facilityIds: bigint[] | null, from: Date, to: Date) {
    const fac = facilityIds ? { facility_id: { in: facilityIds } } : {};
    const closed = await this.prisma.supportTicket.findMany({ where: { status: { in: ['CLOSED', 'RESOLVED'] }, resolved_at: localRange(from, to), ...fac }, select: { sla_breached: true } });
    const ok = closed.filter((t) => !t.sla_breached).length;
    return { closed: closed.length, ok, rate: closed.length ? ok / closed.length : null };
  }

  // ---------------------------------------------------------------- dashboards (§17.2)
  async customerDashboard(ctx: AccessContext) {
    if (!ctx.customerId) throw forbidden();
    const cid = ctx.customerId;
    const contracts = await this.prisma.contract.findMany({ where: { customer_id: cid, status: { in: ['SIGNED', 'ACTIVE', 'MOVE_OUT_SCHEDULED', 'EXPIRED', 'ENDED'] } }, include: { unit: { include: { zone: true } }, unit_type: true, facility: { select: { public_id: true, name: true, slug: true, access_hours: true } } }, orderBy: { start_date: 'desc' } });
    const reservations = await this.prisma.reservation.findMany({ where: { customer_id: cid, status: { in: ['PENDING_PAYMENT', 'CONFIRMED', 'UNIT_ASSIGNED', 'MOVE_IN_SCHEDULED'] } }, include: { unit_type: true, facility: { select: { name: true, public_id: true } }, appointments: { where: { status: 'BOOKED' } } }, orderBy: { id: 'desc' } });
    const invoices = await this.prisma.invoice.findMany({ where: { customer_id: cid, status: { in: ['ISSUED', 'PARTIALLY_PAID'] } }, orderBy: { due_date: 'asc' } });
    const appts = await this.prisma.appointment.findMany({ where: { customer_id: cid, status: 'BOOKED', scheduled_start: { gte: this.core.now() } }, include: { facility: { select: { name: true, address_line: true } }, reservation: { select: { public_id: true, code: true } } }, orderBy: { scheduled_start: 'asc' }, take: 5 });
    const tickets = await this.prisma.supportTicket.count({ where: { customer_id: cid, status: { notIn: ['CLOSED', 'CANCELLED'] } } });
    const facIds = [...new Set(contracts.map((c) => c.facility_id))];
    const now = this.core.now();
    const notices = await this.prisma.facilityNotice.findMany({ where: { facility_id: { in: facIds }, starts_at: { lte: now }, OR: [{ ends_at: null }, { ends_at: { gt: now } }] }, include: { facility: { select: { name: true } } } });
    const balance = await this.core.balance(cid);
    const todo: { kind: string; label: string; link: string; priority: number }[] = [];
    for (const i of invoices) todo.push({ kind: 'PAY', label: `Thanh toán ${i.code} — ${fmt(D(i.total).sub(i.amount_paid).sub(i.amount_credited))}`, link: `/app/billing/invoices/${i.public_id}`, priority: i.due_date < this.core.today() ? 1 : 3 });
    for (const r of reservations) {
      if (r.status === 'PENDING_PAYMENT') todo.push({ kind: 'PAY', label: `Hoàn tất thanh toán đơn ${r.code}`, link: `/app/reservations/${r.public_id}`, priority: 1 });
      else if (!r.appointments.length) todo.push({ kind: 'BOOK', label: `Đặt lịch nhận kho cho ${r.code}`, link: `/app/reservations/${r.public_id}`, priority: 2 });
    }
    todo.sort((a, b) => a.priority - b.priority);
    return {
      balance: Number(balance),
      nextDue: invoices[0] ? { code: invoices[0].code, dueDate: invoices[0].due_date, amount: Number(D(invoices[0].total).sub(invoices[0].amount_paid).sub(invoices[0].amount_credited)) } : null,
      units: contracts.filter((c) => c.status !== 'ENDED').map((c) => ({ id: c.public_id, code: c.code, status: c.status, delinquency: c.delinquency_status, unit: { code: c.unit.code, zone: c.unit.zone.name, floor: c.unit.zone.floor }, unitType: { name: c.unit_type.name, size: c.unit_type.size_category, area: Number(c.unit_type.area_m2 ?? 0) }, facility: c.facility, endDate: addDays(c.current_end_date, -1), daysLeft: diffDays(c.current_end_date, this.core.today()), holdover: c.is_holdover, monthlyRent: Number(c.monthly_rent) })),
      reservations,
      appointments: appts,
      openTickets: tickets,
      notices,
      todo,
    };
  }

  /** GET /ops/today — staff "Today" board (FR-S07), strictly scoped to the staff member's assigned facility. */
  async today(ctx: AccessContext) {
    ctx.require('task.read', false);
    const facs = ctx.facilitiesFor('task.read');
    const now = this.core.now();
    const start = new Date(now.getTime() - 3 * 3600000);
    const end = addDays(dateOnly(now.toISOString().slice(0, 10)), 1);
    const dayEnd = new Date(end.getTime() + 17 * 3600000); // covers local day in UTC+7
    const facilities = await this.prisma.facility.findMany({
      where: { id: { in: facs } },
      select: { public_id: true, code: true, name: true, slug: true, address_line: true, district: true, province: true },
    });
    const appts = await this.prisma.appointment.findMany({
      where: { facility_id: { in: facs }, status: { in: ['BOOKED', 'ARRIVED'] } },
      include: {
        reservation: { select: { public_id: true, code: true, status: true, channel: true } },
        contract: { select: { public_id: true, code: true, unit: { select: { code: true } } } },
        customer: { select: { full_name: true, phone: true, email: true } },
        facility: { select: { name: true, code: true } },
      },
      orderBy: { scheduled_start: 'asc' },
      take: 50,
    });
    const reservations = await this.prisma.reservation.findMany({
      where: {
        facility_id: { in: facs },
        status: { in: ['PENDING_PAYMENT', 'CONFIRMED', 'MOVE_IN_SCHEDULED', 'UNIT_ASSIGNED'] },
      },
      include: {
        customer: { select: { public_id: true, full_name: true, phone: true, email: true } },
        unit_type: { select: { public_id: true, name: true, code: true, area_m2: true, climate_controlled: true } },
        facility: { select: { public_id: true, name: true, code: true } },
        quote: { select: { due_now_total: true, monthly_rent: true } },
        appointments: { where: { status: { in: ['BOOKED', 'ARRIVED'] } }, orderBy: { scheduled_start: 'asc' } },
        allocations: { where: { status: 'ACTIVE' }, include: { unit: { select: { public_id: true, code: true } } } },
      },
      orderBy: { id: 'desc' },
      take: 50,
    });
    const moveOutReqs = await this.prisma.moveOutRequest.findMany({ where: { appointment_id: { in: appts.map((a) => a.id) } }, select: { appointment_id: true, public_id: true, status: true } });
    // move-outs due today (or overdue): requests booked with a slot AND those without one (those only have a task, no appointment)
    const dueMoveOuts = await this.prisma.moveOutRequest.count({ where: { status: { in: ['SCHEDULED', 'INSPECTED'] }, requested_date: { lt: dayEnd }, contract: { facility_id: { in: facs } } } });
    const tasks = await this.prisma.workTask.findMany({ where: { facility_id: { in: facs }, status: { in: ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'BLOCKED'] }, OR: [{ assignee_id: ctx.userId }, { assignee_id: null }] }, orderBy: [{ priority: 'desc' }, { due_at: 'asc' }], take: 50 });
    const tickets = await this.prisma.supportTicket.findMany({ where: { facility_id: { in: facs }, status: { in: ['NEW', 'ASSIGNED', 'IN_PROGRESS', 'REOPENED'] }, OR: [{ assignee_id: ctx.userId }, { assignee_id: null }] }, orderBy: [{ priority: 'desc' }, { resolution_due_at: 'asc' }], take: 30, select: { public_id: true, code: true, subject: true, priority: true, status: true, resolution_due_at: true, sla_breached: true, category: true } });
    const shift = await this.prisma.staffShift.findFirst({ where: { user_id: ctx.userId, status: 'PUBLISHED', starts_at: { lte: now }, ends_at: { gt: now } }, include: { facility: { select: { name: true } } } });
    const toInspect = await this.prisma.unit.findMany({ where: { facility_id: { in: facs }, OR: [{ status: 'PENDING_INSPECTION' }, { operational_flag: { in: ['INSPECTION_DUE', 'ISSUE_REPORTED'] } }] }, select: { public_id: true, code: true, status: true, operational_flag: true }, take: 30 });
    const urgent = tickets.filter((t) => t.priority === 'URGENT');
    return {
      facilities,
      reservations,
      appointments: appts.map((a) => ({ ...a, moveOutRequest: moveOutReqs.find((m) => m.appointment_id === a.id) ?? null })),
      tasks,
      tickets,
      shift,
      unitsToInspect: toInspect,
      counters: { moveIns: reservations.length, moveOuts: Math.max(dueMoveOuts, appts.filter((a) => a.type === 'MOVE_OUT').length), myOpenTasks: tasks.filter((t) => t.assignee_id === ctx.userId).length, overdueTasks: tasks.filter((t) => t.is_overdue).length, tickets: tickets.length },
      urgent,
      window: { start, end: dayEnd },
    };
  }

  /** Money figures follow the chosen period (default: this month so far) and are compared with the period of the same length right before it. */
  async facilityDashboard(ctx: AccessContext, facilityId: bigint, from?: Date, to?: Date) {
    ctx.assertScope('report.facility', { facility_id: facilityId }, 'Cơ sở');
    const today = this.core.today();
    const now = this.core.now();
    const y = today.getUTCFullYear();
    const m = today.getUTCMonth();
    const custom = !!(from && to);
    const monthStart = custom ? from! : new Date(Date.UTC(y, m, 1));
    const end = custom ? (to! > today ? today : to!) : today;
    const prevLast = custom ? addDays(monthStart, -1) : new Date(Date.UTC(y, m, 0));
    const prevStart = custom ? addDays(monthStart, -(Math.round((end.getTime() - monthStart.getTime()) / 86400000) + 1)) : new Date(Date.UTC(y, m - 1, 1));
    // compare like with like: the first N days of this month against the first N days of the previous one
    const prevSameEnd = custom ? prevLast : new Date(Date.UTC(y, m - 1, Math.min(today.getUTCDate(), prevLast.getUTCDate())));
    const [occ, rev, revPrev, revPrevFull, aging, trend] = await Promise.all([
      this.occupancyNow([facilityId]),
      this.revenue([facilityId], monthStart, end),
      this.revenue([facilityId], prevStart, prevSameEnd),
      this.revenue([facilityId], prevStart, prevLast),
      this.aging([facilityId]),
      this.monthlyTrend([facilityId]),
    ]);
    const delinquency = await this.prisma.contract.groupBy({ by: ['delinquency_status'], where: { facility_id: facilityId, status: { in: ['ACTIVE', 'MOVE_OUT_SCHEDULED', 'EXPIRED'] } }, _count: true });
    const approvals = {
      refunds: await this.prisma.refund.count({ where: { facility_id: facilityId, status: 'PENDING_APPROVAL', required_approver_role: 'FACILITY_MANAGER' } }),
      waivers: await this.prisma.feeWaiver.count({ where: { facility_id: facilityId, status: 'PENDING', required_approver_role: 'FACILITY_MANAGER' } }),
      damages: await this.prisma.damageItem.count({ where: { approval_status: 'PENDING', inspection: { unit: { facility_id: facilityId } } } }),
      swaps: await this.prisma.shiftSwapRequest.count({ where: { status: 'PENDING', shift: { facility_id: facilityId } } }),
      allocations: await this.prisma.workTask.count({ where: { facility_id: facilityId, type: 'ALLOCATE_UNIT', status: { notIn: ['DONE', 'CANCELLED'] } } }),
      terminations: await this.prisma.terminationRequest.count({ where: { bom_decision: 'PENDING', fm_confirmed_at: null, contract_id: { in: (await this.prisma.contract.findMany({ where: { facility_id: facilityId, delinquency_status: 'DEFAULT_PENDING' }, select: { id: true } })).map((c) => c.id) } } }),
    };
    const ticketsBySla = await this.prisma.supportTicket.groupBy({ by: ['priority'], where: { facility_id: facilityId, status: { notIn: ['CLOSED', 'CANCELLED', 'RESOLVED'] } }, _count: true });
    const breached = await this.prisma.supportTicket.count({ where: { facility_id: facilityId, status: { notIn: ['CLOSED', 'CANCELLED', 'RESOLVED'] }, sla_breached: true } });
    const overdueTasks = await this.prisma.workTask.count({ where: { facility_id: facilityId, is_overdue: true, status: { notIn: ['DONE', 'CANCELLED'] } } });
    const expiring = await this.prisma.contract.count({ where: { facility_id: facilityId, status: 'ACTIVE', current_end_date: { lte: addDays(today, 30) } } });
    const onShift = await this.prisma.staffShift.findMany({ where: { facility_id: facilityId, status: 'PUBLISHED', starts_at: { lte: now }, ends_at: { gt: now } }, include: { user: { select: { full_name: true, public_id: true } } } });
    // "7 days" = today and the six days before it, counted from local midnight
    const weekStart = custom ? localDayStart(monthStart) : localDayStart(addDays(today, -6));
    const weekEnd = custom ? localDayEnd(end) : localDayEnd(today);
    const moveIns = await this.prisma.contract.count({ where: { facility_id: facilityId, activated_at: { gte: weekStart, lt: weekEnd } } });
    const moveOuts = await this.prisma.contract.count({ where: { facility_id: facilityId, ended_at: { gte: weekStart, lt: weekEnd } } });
    const todayAppts = await this.prisma.appointment.findMany({ where: { facility_id: facilityId, status: { in: ['BOOKED', 'ARRIVED'] }, scheduled_start: { gte: localDayStart(today), lt: localDayEnd(today) } }, include: { customer: { select: { full_name: true } } }, orderBy: { scheduled_start: 'asc' } });
    return {
      asOf: ymd(today),
      generatedAt: now.toISOString(),
      occupancy: occ,
      revenue: { month: rev, prevMonth: revPrev, prevMonthFull: revPrevFull, period: { from: monthStart, to: end, prevFrom: prevStart, prevTo: prevSameEnd, custom } },
      aging,
      trend,
      delinquencyFunnel: Object.fromEntries(delinquency.map((d) => [d.delinquency_status, d._count])),
      approvals,
      tickets: { byPriority: Object.fromEntries(ticketsBySla.map((t) => [t.priority, t._count])), breached },
      overdueTasks,
      expiring30d: expiring,
      onShift: onShift.map((s) => ({ user: s.user, until: s.ends_at, role: s.role_on_shift })),
      moveActivity: { moveIns, moveOuts, net: moveIns - moveOuts, from: weekStart, to: weekEnd, custom },
      todayAppointments: todayAppts,
    };
  }

  async portfolio(ctx: AccessContext, from?: Date, to?: Date) {
    ctx.require('report.system', false);
    const today = this.core.today();
    const f = from ?? new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    const t = to ?? today;
    const facilities = await this.prisma.facility.findMany({ where: { deleted_at: null, status: { not: 'DRAFT' } }, orderBy: { name: 'asc' } });
    const parts = [];
    for (const fac of facilities) {
      const [occ, rev, buckets, renewals, cancels, sla] = await Promise.all([
        this.occupancyCounts([fac.id]),
        this.revenue([fac.id], f, t),
        this.agingBuckets([fac.id]),
        this.renewalStats([fac.id], f, t),
        this.cancellationStats([fac.id], f, t),
        this.slaStats([fac.id], f, t),
      ]);
      parts.push({ fac, occ, rev, buckets, renewals, cancels, sla });
    }
    const comparison = parts.map(({ fac, occ, rev, buckets, renewals, cancels, sla }) => {
      const rates = occRates(occ);
      const ag = agingTotals(buckets);
      return {
        facility: { id: fac.public_id, name: fac.name, code: fac.code, status: fac.status, province: fac.province, latitude: Number(fac.latitude ?? 0), longitude: Number(fac.longitude ?? 0) },
        stock: STOCK_FACILITY_STATUSES.includes(fac.status),
        units: occ.total, rentable: occ.rentable, occupied: occ.occupied, areaRentable: occ.areaRentable, areaOccupied: occ.areaOccupied, potentialRent: occ.potentialRent, actualRent: occ.actualRent,
        ...rates,
        revenuePerM2: occ.areaRentable ? rev.recognized / occ.areaRentable : 0,
        ...rev,
        overdue: ag.overdue, receivable: ag.total, overdueRatio: ag.overdueRatio,
        renewalRate: renewals.rate, cancellationRate: cancels.rate, slaRate: sla.rate,
      };
    });
    // the headline numbers are the sum of the rows above, so they can never disagree with the table below them
    const stock = parts.filter((x) => STOCK_FACILITY_STATUSES.includes(x.fac.status));
    const occAll = sumOcc(stock.map((x) => x.occ));
    const revAll = sumRevenue(parts.map((x) => x.rev));
    const agAll = agingTotals(sumAging(parts.map((x) => x.buckets)));
    const [trend, revenueBySize, p] = await Promise.all([this.monthlyTrend(null), this.rentBySize(null, f, t), this.core.activePolicy(null)]);
    const occT = p.params.occupancy_alert_pct;
    const delT = p.params.delinquency_alert_pct;
    const alerts = comparison
      .filter((c) => c.facility.status === 'ACTIVE')
      .flatMap((c) => [
        ...(c.rentable > 0 && c.unitRate < occT / 100 ? [{ facility: c.facility.name, kind: 'OCCUPANCY', value: c.unitRate, threshold: occT, message: `Lấp đầy ${(c.unitRate * 100).toFixed(1)}% thấp hơn ngưỡng ${occT}%` }] : []),
        ...(c.receivable > 0 && c.overdueRatio > delT / 100 ? [{ facility: c.facility.name, kind: 'DELINQUENCY', value: c.overdueRatio, threshold: delT, message: `Nợ quá hạn ${(c.overdueRatio * 100).toFixed(1)}% vượt ngưỡng ${delT}%` }] : []),
      ]);
    return {
      period: { from: f, to: t },
      asOf: ymd(today),
      generatedAt: this.core.now().toISOString(),
      thresholds: { occupancy: occT, delinquency: delT },
      kpi: { ...occAll, ...occRates(occAll), ...revAll, overdue: agAll.overdue, receivable: agAll.total, overdueRatio: agAll.overdueRatio, facilities: stock.length, facilitiesTotal: parts.length },
      comparison,
      trend,
      revenueBySize,
      alerts,
      approvals: {
        refunds: await this.prisma.refund.count({ where: { status: 'PENDING_APPROVAL', required_approver_role: 'BUSINESS_OPS_MANAGER' } }),
        waivers: await this.prisma.feeWaiver.count({ where: { status: 'PENDING', required_approver_role: 'BUSINESS_OPS_MANAGER' } }),
        terminations: await this.prisma.terminationRequest.count({ where: { bom_decision: 'PENDING', fm_confirmed_at: { not: null } } }),
        priceRequests: await this.prisma.priceChangeRequest.count({ where: { status: 'PENDING' } }),
        abandonedGoods: await this.prisma.abandonedGoodsRecord.count({ where: { disposition: 'PENDING' } }),
        escalated: await this.prisma.supportTicket.count({ where: { escalation_level: 2, status: { notIn: ['CLOSED', 'CANCELLED', 'RESOLVED'] } } }),
      },
    };
  }

  /** Security overview of a chosen period. Defaults to the last 24 hours, in hourly bars; longer periods are drawn day by day. */
  async adminDashboard(q: { range?: string; from?: string; to?: string } = {}) {
    const now = this.core.now();
    let period: ReturnType<typeof resolveAdminPeriod>;
    try {
      period = resolveAdminPeriod(q, now, this.core.today());
    } catch (e) {
      throw validation((e as Error).message);
    }
    const when = { gte: period.from, lt: period.to };
    const [locked, reuse7d, byRole, jobs, outbox, deliveries, logins] = await Promise.all([
      this.prisma.user.count({ where: { OR: [{ status: 'LOCKED' }, { locked_until: { gt: now } }] } }),
      this.prisma.loginHistory.count({ where: { failure_reason: 'TOKEN_REUSE', created_at: { gte: addDays(now, -7) } } }),
      this.prisma.userRole.groupBy({ by: ['role_id'], where: { revoked_at: null }, _count: true }),
      this.prisma.jobRun.findMany({ orderBy: { started_at: 'desc' }, take: 30 }),
      this.prisma.outboxEvent.groupBy({ by: ['status'], _count: true }),
      this.prisma.notificationDelivery.groupBy({ by: ['status'], _count: true }),
      this.prisma.loginHistory.findMany({ where: { created_at: when }, select: { created_at: true, success: true, failure_reason: true } }),
    ]);
    const roles = await this.prisma.role.findMany();
    const series = emptyAdminSeries(period);
    const index = new Map(series.map((s, i) => [s.key, i]));
    let success = 0;
    let failed = 0;
    let reuse = 0;
    for (const l of logins) {
      const i = index.get(adminBucketKey(l.created_at, period.bucket));
      if (l.success) success += 1;
      else failed += 1;
      if (l.failure_reason === 'TOKEN_REUSE') reuse += 1;
      if (i === undefined) continue;
      if (l.success) series[i].ok += 1;
      else series[i].fail += 1;
    }
    return {
      period: { key: period.key, label: period.label, from: period.from, to: period.to, bucket: period.bucket },
      logins: { success, failed },
      lockedAccounts: locked,
      tokenReuse: reuse,
      tokenReuse7d: reuse7d,
      usersByRole: byRole.map((r) => ({ role: roles.find((x) => x.id === r.role_id)?.code, count: r._count })),
      series,
      anomalies: [],
      jobs,
      outbox: Object.fromEntries(outbox.map((o) => [o.status, o._count])),
      deliveries: Object.fromEntries(deliveries.map((o) => [o.status, o._count])),
    };
  }

  // ---------------------------------------------------------------- reports (§17.3)
  resolveParams(ctx: AccessContext, code: string, q: Record<string, string>, facilityIds: bigint[] | null): ReportParams {
    if (!REPORT_CODES.includes(code as never)) throw notFound('Báo cáo');
    const sys = ctx.can('report.system', false);
    if (!sys && !ctx.can('report.facility', false)) throw forbidden();
    if (['facility-comparison', 'promotions', 'reconciliation'].includes(code) && !sys) throw forbidden('Báo cáo dành cho Business Operations Manager');
    const today = this.core.today();
    const from = q.from ? dateOnly(q.from) : addDays(today, -30);
    const to = q.to ? dateOnly(q.to) : today;
    if (to < from) throw validation('Khoảng thời gian không hợp lệ');
    let fac = facilityIds;
    if (!sys) {
      const allowed = ctx.facilitiesFor('report.facility');
      fac = fac ? fac.filter((f) => allowed.includes(f)) : allowed;
      if (!fac.length) throw forbidden();
    }
    if (q.groupBy && !['day', 'month', 'year'].includes(q.groupBy)) throw validation('Cách nhóm theo kỳ không hợp lệ (day, month hoặc year)');
    return { from, to, facilityIds: fac, groupBy: (q.groupBy || 'month') as 'day' | 'month' | 'year' };
  }

  async run(ctx: AccessContext, code: string, p: ReportParams): Promise<Table> {
    return decorateReport(code, await this.buildReport(ctx, code, p));
  }

  private async buildReport(ctx: AccessContext, code: string, p: ReportParams): Promise<Table> {
    const maskPii = !ctx.hasRole('FACILITY_MANAGER') && !ctx.hasRole('FACILITY_STAFF');
    const facNames = new Map((await this.prisma.facility.findMany({ select: { id: true, name: true } })).map((f) => [f.id.toString(), f.name]));
    const when = localRange(p.from, p.to);
    switch (code) {
      case 'occupancy':
        return this.occupancyReport(p, facNames);
      case 'revenue':
        return this.revenueReport(p, facNames);
      case 'rent-roll': {
        const cs = await this.prisma.contract.findMany({ where: { status: { in: ['ACTIVE', 'MOVE_OUT_SCHEDULED', 'EXPIRED'] }, ...this.fIn(p.facilityIds) }, include: { unit: true, unit_type: true, customer: true, facility: { select: { name: true } } }, orderBy: [{ facility_id: 'asc' }, { unit_id: 'asc' }] });
        const rows = [];
        for (const c of cs) {
          const open = await this.prisma.invoice.findMany({ where: { contract_id: c.id, status: { in: ['ISSUED', 'PARTIALLY_PAID'] } } });
          rows.push({ facility: c.facility.name, unit: c.unit.code, unitType: c.unit_type.name, contract: c.code, customer: c.customer.full_name, phone: maskPii ? maskPhone(c.customer.phone) : c.customer.phone, rent: Number(c.monthly_rent), start: ymd(c.start_date), end: c.is_holdover ? 'Cuốn chiếu' : ymd(addDays(c.current_end_date, -1)), status: label('contract', c.status), delinquency: label('delinquency', c.delinquency_status), balance: open.reduce((s, i) => s + Number(D(i.total).sub(i.amount_paid).sub(i.amount_credited)), 0) });
        }
        return {
          title: 'Hợp đồng đang thuê (danh sách hợp đồng đang chạy)',
          columns: [{ key: 'facility', label: 'Cơ sở' }, { key: 'unit', label: 'Kho' }, { key: 'unitType', label: 'Loại kho' }, { key: 'contract', label: 'Hợp đồng' }, { key: 'customer', label: 'Khách' }, { key: 'phone', label: 'SĐT' }, { key: 'rent', label: 'Giá thuê / tháng', type: 'money' }, { key: 'start', label: 'Bắt đầu', type: 'date' }, { key: 'end', label: 'Hết hạn' }, { key: 'status', label: 'Trạng thái hợp đồng' }, { key: 'delinquency', label: 'Giai đoạn nợ' }, { key: 'balance', label: 'Còn nợ', type: 'money' }],
          rows,
          summary: { contracts: rows.length, monthlyRent: rows.reduce((s, r) => s + r.rent, 0), outstanding: rows.reduce((s, r) => s + r.balance, 0) },
        };
      }
      case 'receivables-aging': {
        const today = this.core.today();
        const ids = p.facilityIds ?? (await this.moneyFacilityIds());
        const open = await this.prisma.invoice.findMany({ where: { status: { in: ['ISSUED', 'PARTIALLY_PAID'] }, facility_id: { in: ids } }, include: { customer: true, facility: { select: { name: true } } } });
        const by = new Map<string, { facility: string; customer: string; email: string | null; b: AgingBuckets }>();
        for (const i of open) {
          const k = `${i.facility_id}|${i.customer_id}`;
          const r = by.get(k) ?? { facility: i.facility.name, customer: i.customer.full_name, email: maskPii ? maskEmail(i.customer.email) : i.customer.email, b: emptyAging() };
          r.b[agingBucket(diffDays(today, i.due_date))] += Number(D(i.total).sub(i.amount_paid).sub(i.amount_credited));
          by.set(k, r);
        }
        const rows = [...by.values()].map((r) => ({ facility: r.facility, customer: r.customer, email: r.email, ...r.b, total: r.b.current + r.b.d0_30 + r.b.d31_60 + r.b.d61_90 + r.b.d90_plus })).sort((a, b) => b.total - a.total);
        const b = sumAging(rows.map((r) => ({ current: r.current, d0_30: r.d0_30, d31_60: r.d31_60, d61_90: r.d61_90, d90_plus: r.d90_plus })));
        return {
          title: 'Công nợ theo tuổi nợ',
          columns: [{ key: 'facility', label: 'Cơ sở' }, { key: 'customer', label: 'Khách' }, { key: 'email', label: 'Email' }, { key: 'current', label: 'Chưa đến hạn', type: 'money' }, { key: 'd0_30', label: 'Quá hạn 1–30 ngày', type: 'money' }, { key: 'd31_60', label: 'Quá hạn 31–60 ngày', type: 'money' }, { key: 'd61_90', label: 'Quá hạn 61–90 ngày', type: 'money' }, { key: 'd90_plus', label: 'Quá hạn trên 90 ngày', type: 'money' }, { key: 'total', label: 'Tổng còn nợ', type: 'money' }],
          rows,
          summary: { ...b, ...agingTotals(b) },
        };
      }
      case 'delinquency': {
        const cs = await this.prisma.contract.findMany({ where: { delinquency_status: { not: 'CURRENT' }, ...this.fIn(p.facilityIds) }, include: { unit: true, customer: true, facility: { select: { name: true } }, delinquency_events: { orderBy: { created_at: 'desc' }, take: 5 } } });
        const rows = [];
        for (const c of cs) {
          const open = await this.prisma.invoice.findMany({ where: { contract_id: c.id, status: { in: ['ISSUED', 'PARTIALLY_PAID'] } }, orderBy: { due_date: 'asc' } });
          rows.push({ facility: c.facility.name, contract: c.code, unit: c.unit.code, customer: c.customer.full_name, contractStatus: label('contract', c.status), stage: label('delinquency', c.delinquency_status), live: LIVE_CONTRACT_STATUSES.includes(c.status) && ['GRACE', 'LATE', 'LOCKED_OUT', 'FINAL_NOTICE', 'DEFAULT_PENDING'].includes(c.delinquency_status), daysOverdue: open[0] ? diffDays(this.core.today(), open[0].due_date) : 0, debt: open.reduce((s, i) => s + Number(D(i.total).sub(i.amount_paid).sub(i.amount_credited)), 0), history: c.delinquency_events.map((e) => `${label('delinquency', e.from_stage)} → ${label('delinquency', e.to_stage)}`).join('; ') });
        }
        rows.sort((a, b) => b.debt - a.debt || b.daysOverdue - a.daysOverdue);
        const liveRows = rows.filter((r) => r.live);
        return {
          title: 'Hợp đồng quá hạn theo giai đoạn',
          columns: [{ key: 'facility', label: 'Cơ sở' }, { key: 'contract', label: 'Hợp đồng' }, { key: 'unit', label: 'Kho' }, { key: 'customer', label: 'Khách' }, { key: 'contractStatus', label: 'Trạng thái hợp đồng' }, { key: 'stage', label: 'Giai đoạn' }, { key: 'daysOverdue', label: 'Ngày quá hạn', type: 'int' }, { key: 'debt', label: 'Còn nợ', type: 'money' }, { key: 'history', label: 'Lịch sử chuyển giai đoạn' }],
          rows: rows.map(({ live, ...r }) => r),
          summary: { delinquentContracts: liveRows.length, delinquentDebt: liveRows.reduce((s, r) => s + r.debt, 0), delinquencyByStage: groupTotals(rows, (r) => r.stage, (r) => r.debt) },
        };
      }
      case 'renewals': {
        const due = await this.prisma.contract.findMany({ where: { current_end_date: { gte: p.from, lte: addDays(p.to, 60) }, ...this.fIn(p.facilityIds) }, include: { unit: true, customer: true, facility: { select: { name: true } }, renewal_offers: { orderBy: { id: 'desc' }, take: 1 } } });
        const stats = await this.renewalStats(p.facilityIds, p.from, p.to);
        return {
          title: 'Gia hạn hợp đồng',
          columns: [{ key: 'facility', label: 'Cơ sở' }, { key: 'contract', label: 'Hợp đồng' }, { key: 'unit', label: 'Kho' }, { key: 'customer', label: 'Khách' }, { key: 'end', label: 'Ngày hết hạn', type: 'date' }, { key: 'offer', label: 'Đề nghị gia hạn' }, { key: 'rent', label: 'Giá thuê / tháng', type: 'money' }, { key: 'autoRenew', label: 'Tự gia hạn' }],
          rows: due.map((c) => ({ facility: c.facility.name, contract: c.code, unit: c.unit.code, customer: c.customer.full_name, end: ymd(addDays(c.current_end_date, -1)), offer: c.renewal_offers[0] ? label('offer', c.renewal_offers[0].status) : 'Chưa có', rent: Number(c.renewal_offers[0]?.offered_monthly_rent ?? c.monthly_rent), autoRenew: c.auto_renew ? 'Có' : 'Không' })).sort((a, b) => String(a.end).localeCompare(String(b.end))),
          summary: { renewalEnding: stats.ending, renewalDone: stats.renewed, renewalRate: stats.rate },
        };
      }
      case 'cancellations': {
        const fac = this.fIn(p.facilityIds);
        const rs = await this.prisma.reservation.findMany({ where: { status: { in: ['CANCELLED', 'NO_SHOW', 'EXPIRED'] }, ...fac }, include: { unit_type: true, facility: { select: { name: true } } } });
        const inRange = rs
          .map((r) => ({ r, at: r.status === 'EXPIRED' ? r.updated_at : (r.cancelled_at ?? r.updated_at) }))
          .filter((x) => x.at >= when.gte && x.at < when.lt)
          .sort((a, b) => b.at.getTime() - a.at.getTime());
        const stats = await this.cancellationStats(p.facilityIds, p.from, p.to);
        return {
          title: 'Hủy đặt chỗ, không đến và hết hạn giữ chỗ',
          columns: [{ key: 'facility', label: 'Cơ sở' }, { key: 'code', label: 'Đơn đặt' }, { key: 'unitType', label: 'Loại kho' }, { key: 'status', label: 'Kết quả' }, { key: 'reason', label: 'Lý do' }, { key: 'date', label: 'Ngày', type: 'date' }],
          rows: inRange.map(({ r, at }) => ({ facility: r.facility.name, code: r.code, unitType: r.unit_type.name, status: label('reservation', r.status), reason: r.cancel_reason ?? (r.status === 'EXPIRED' ? 'Hết hạn giữ chỗ' : ''), date: dayKey(at) })),
          summary: { reservationsCreated: stats.created, reservationsCancelled: stats.cancelled, cancellationRate: stats.rate, quotesCreated: stats.quotes, quotesConverted: stats.converted, quoteConversion: stats.conversion },
        };
      }
      case 'move-activity': {
        const ins = await this.prisma.contract.findMany({ where: { activated_at: when, ...this.fIn(p.facilityIds) }, select: { activated_at: true, facility_id: true } });
        const outs = await this.prisma.contract.findMany({ where: { ended_at: when, ...this.fIn(p.facilityIds) }, select: { ended_at: true, facility_id: true, activated_at: true } });
        const g = new Map<string, { ins: number; outs: number }>();
        for (const c of ins) { const k = `${bucketOf(dayKey(c.activated_at!), p.groupBy)}|${c.facility_id}`; const x = g.get(k) ?? { ins: 0, outs: 0 }; x.ins += 1; g.set(k, x); }
        for (const c of outs) { const k = `${bucketOf(dayKey(c.ended_at!), p.groupBy)}|${c.facility_id}`; const x = g.get(k) ?? { ins: 0, outs: 0 }; x.outs += 1; g.set(k, x); }
        const durations = outs.filter((o) => o.activated_at).map((o) => diffDays(o.ended_at!, o.activated_at!));
        return {
          title: 'Nhận kho và trả kho',
          columns: [{ key: 'period', label: 'Kỳ' }, { key: 'facility', label: 'Cơ sở' }, { key: 'ins', label: 'Nhận kho', type: 'int' }, { key: 'outs', label: 'Trả kho', type: 'int' }, { key: 'net', label: 'Tăng ròng', type: 'int' }],
          rows: [...g.entries()].sort().map(([k, x]) => { const [period, fid] = k.split('|'); return { period, facility: facNames.get(fid), ins: x.ins, outs: x.outs, net: x.ins - x.outs }; }),
          summary: { moveIns: ins.length, moveOuts: outs.length, moveNet: ins.length - outs.length, avgStayDays: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null },
        };
      }
      case 'staff-performance': {
        const staff = await this.prisma.userRole.findMany({ where: { revoked_at: null, role: { code: { in: ['FACILITY_STAFF', 'FACILITY_MANAGER'] } }, ...this.fIn(p.facilityIds) }, include: { user: true, facility: { select: { name: true } } } });
        const rows = [];
        const seen = new Set<string>();
        for (const s of staff) {
          if (seen.has(`${s.user_id}`)) continue;
          seen.add(`${s.user_id}`);
          const tasks = await this.prisma.workTask.findMany({ where: { assignee_id: s.user_id, completed_at: when, status: 'DONE' }, select: { is_overdue: true, started_at: true, completed_at: true } });
          const mins = tasks.filter((t) => t.started_at).map((t) => (t.completed_at!.getTime() - t.started_at!.getTime()) / 60000).sort((a, b) => a - b);
          const checkins = await this.prisma.checkinSession.count({ where: { staff_user_id: s.user_id, status: 'COMPLETED', completed_at: when } });
          const moveouts = await this.prisma.handoverRecord.count({ where: { staff_user_id: s.user_id, type: 'MOVE_OUT', signed_at: when } });
          const tickets = await this.prisma.supportTicket.findMany({ where: { assignee_id: s.user_id, resolved_at: when }, include: { rating: true } });
          const rated = tickets.filter((t) => t.rating);
          rows.push({ facility: s.facility?.name, staff: s.user.full_name, tasksDone: tasks.length, onTimePct: tasks.length ? tasks.filter((t) => !t.is_overdue).length / tasks.length : null, medianMinutes: mins.length ? Math.round(mins[Math.floor(mins.length / 2)]) : null, checkins, moveouts, ticketsResolved: tickets.length, slaPct: tickets.length ? tickets.filter((t) => !t.sla_breached).length / tickets.length : null, csat: rated.length ? Math.round((rated.reduce((a, t) => a + t.rating!.score, 0) / rated.length) * 10) / 10 : null });
        }
        return {
          title: 'Hiệu suất nhân viên',
          columns: [{ key: 'facility', label: 'Cơ sở' }, { key: 'staff', label: 'Nhân viên' }, { key: 'tasksDone', label: 'Việc đã xong', type: 'int' }, { key: 'onTimePct', label: 'Đúng hạn', type: 'pct' }, { key: 'medianMinutes', label: 'Thời gian xử lý trung vị (phút)', type: 'int' }, { key: 'checkins', label: 'Lượt nhận kho', type: 'int' }, { key: 'moveouts', label: 'Lượt trả kho', type: 'int' }, { key: 'ticketsResolved', label: 'Phiếu đã giải quyết', type: 'int' }, { key: 'slaPct', label: 'Đúng SLA', type: 'pct' }, { key: 'csat', label: 'Điểm hài lòng' }],
          rows,
        };
      }
      case 'support-sla': {
        const ts = await this.prisma.supportTicket.findMany({ where: { created_at: when, ...this.fIn(p.facilityIds) }, include: { rating: true } });
        const now = this.core.now();
        const g = new Map<string, { n: number; due: number; first: number; closed: number; ok: number; rated: number; score: number }>();
        for (const t of ts) {
          const k = `${t.category}|${t.priority}`;
          const x = g.get(k) ?? { n: 0, due: 0, first: 0, closed: 0, ok: 0, rated: 0, score: 0 };
          x.n += 1;
          // a ticket counts for the first-response rate once it was answered or its answer deadline has passed
          if (t.first_response_at || (t.first_response_due_at && t.first_response_due_at < now)) { x.due += 1; if (t.first_response_at && t.first_response_at <= t.first_response_due_at) x.first += 1; }
          if (['RESOLVED', 'CLOSED'].includes(t.status)) { x.closed += 1; if (!t.sla_breached) x.ok += 1; }
          if (t.rating) { x.rated += 1; x.score += t.rating.score; }
          g.set(k, x);
        }
        const tot = [...g.values()].reduce((a, x) => ({ n: a.n + x.n, due: a.due + x.due, first: a.first + x.first, closed: a.closed + x.closed, ok: a.ok + x.ok, rated: a.rated + x.rated, score: a.score + x.score }), { n: 0, due: 0, first: 0, closed: 0, ok: 0, rated: 0, score: 0 });
        return {
          title: 'SLA hỗ trợ và mức hài lòng',
          columns: [{ key: 'category', label: 'Nhóm vấn đề' }, { key: 'priority', label: 'Mức ưu tiên' }, { key: 'tickets', label: 'Số phiếu', type: 'int' }, { key: 'firstPct', label: 'Phản hồi đúng hạn', type: 'pct' }, { key: 'resolvePct', label: 'Giải quyết đúng hạn', type: 'pct' }, { key: 'csat', label: 'Điểm hài lòng' }],
          rows: [...g.entries()].map(([k, x]) => { const [category, priority] = k.split('|'); return { category: label('category', category), priority: label('priority', priority), tickets: x.n, firstPct: x.due ? x.first / x.due : null, resolvePct: x.closed ? x.ok / x.closed : null, csat: x.rated ? Math.round((x.score / x.rated) * 10) / 10 : null }; }),
          summary: { slaTickets: tot.n, slaFirstRate: tot.due ? tot.first / tot.due : null, slaResolveRate: tot.closed ? tot.ok / tot.closed : null, csatAvg: tot.rated ? Math.round((tot.score / tot.rated) * 10) / 10 : null },
        };
      }
      case 'facility-comparison': {
        const pf = await this.portfolio(ctx, p.from, p.to);
        return {
          title: 'So sánh các cơ sở',
          columns: [{ key: 'facility', label: 'Cơ sở' }, { key: 'status', label: 'Trạng thái' }, { key: 'rentable', label: 'Kho khai thác được', type: 'int' }, { key: 'occupied', label: 'Đang thuê', type: 'int' }, { key: 'unitRate', label: 'Lấp đầy theo kho', type: 'pct' }, { key: 'areaRate', label: 'Lấp đầy theo m²', type: 'pct' }, { key: 'economicRate', label: 'Lấp đầy kinh tế', type: 'pct' }, { key: 'recognized', label: 'Doanh thu ghi nhận', type: 'money' }, { key: 'revenuePerM2', label: 'Doanh thu / m²', type: 'money' }, { key: 'avgRent', label: 'Đơn giá trung bình', type: 'money' }, { key: 'overdueRatio', label: 'Tỷ lệ nợ quá hạn', type: 'pct' }, { key: 'renewalRate', label: 'Tỷ lệ gia hạn', type: 'pct' }, { key: 'cancellationRate', label: 'Tỷ lệ hủy', type: 'pct' }, { key: 'slaRate', label: 'Giải quyết đúng SLA', type: 'pct' }],
          rows: pf.comparison.map((c) => ({ ...c, facility: c.facility.name, status: label('facility', c.facility.status), unitRate: c.stock ? c.unitRate : null, areaRate: c.stock ? c.areaRate : null, economicRate: c.stock ? c.economicRate : null })),
        };
      }
      case 'promotions': {
        const ps = await this.prisma.promotion.findMany({ where: { deleted_at: null } });
        const rows = [];
        for (const pr of ps) {
          const reds = await this.prisma.promotionRedemption.findMany({ where: { promotion_id: pr.id, status: 'CONSUMED', created_at: when } });
          const cs = await this.prisma.contract.findMany({ where: { reservation_id: { in: reds.map((r) => r.reservation_id) } }, select: { id: true, status: true } });
          const rev = await this.prisma.invoiceItem.aggregate({ where: { item_type: 'RENT', invoice: { contract_id: { in: cs.map((c) => c.id) }, status: { not: 'VOID' } } }, _sum: { amount: true } });
          rows.push({ name: pr.name, code: pr.code ?? '(tự áp dụng)', status: label('promotion', pr.status), redemptions: reds.length, discount: reds.reduce((s, r) => s + Number(r.discount_amount), 0), revenue: Number(rev._sum.amount ?? 0), retained: cs.length ? cs.filter((c) => ['ACTIVE', 'MOVE_OUT_SCHEDULED'].includes(c.status)).length / cs.length : null });
        }
        return {
          title: 'Hiệu quả khuyến mãi',
          columns: [{ key: 'name', label: 'Chương trình' }, { key: 'code', label: 'Mã' }, { key: 'status', label: 'Trạng thái' }, { key: 'redemptions', label: 'Lượt dùng', type: 'int' }, { key: 'discount', label: 'Tổng tiền giảm', type: 'money' }, { key: 'revenue', label: 'Tiền thuê đã phát hành', type: 'money' }, { key: 'retained', label: 'Khách còn thuê', type: 'pct' }],
          rows,
          summary: { promoRedemptions: rows.reduce((s, r) => s + r.redemptions, 0), promoDiscount: rows.reduce((s, r) => s + r.discount, 0) },
        };
      }
      case 'refunds':
        return this.refundsReport(p, facNames);
      case 'abandoned-goods':
        return this.abandonedGoodsReport(p, facNames);
      case 'reconciliation': {
        const bs = await this.prisma.reconciliationBatch.findMany({ where: { period_date: { gte: p.from, lte: p.to } }, include: { items: true }, orderBy: { period_date: 'desc' } });
        return {
          title: 'Đối soát cổng thanh toán',
          columns: [{ key: 'date', label: 'Ngày đối soát', type: 'date' }, { key: 'provider', label: 'Cổng' }, { key: 'provider_total', label: 'Theo cổng', type: 'money' }, { key: 'system_total', label: 'Theo hệ thống', type: 'money' }, { key: 'gap', label: 'Chênh lệch', type: 'money' }, { key: 'status', label: 'Kết quả' }, { key: 'mismatches', label: 'Số giao dịch lệch', type: 'int' }],
          rows: bs.map((b) => ({ date: ymd(b.period_date), provider: label('provider', b.provider), provider_total: Number(b.total_provider), system_total: Number(b.total_system), gap: Number(b.total_system) - Number(b.total_provider), status: label('recon', b.status), mismatches: b.items.filter((i) => i.result !== 'MATCHED').length })),
        };
      }
    }
    throw notFound('Báo cáo');
  }

  /**
   * Occupancy at the end of each period, one row per facility. The current period is live; earlier periods use the last snapshot the system
   * stored in them. The total row adds the facilities up the same way, so it equals the headline occupancy on the overview.
   */
  private async occupancyReport(p: ReportParams, facNames: Map<string, string>): Promise<Table> {
    const today = this.core.today();
    const scope = p.facilityIds ?? (await this.stockFacilityIds());
    const lo = ymd(p.from)!;
    const hi = ymd(p.to)!;
    const snaps = new Map<string, Snapshot & { facility: string }>();
    for (const [k, s] of facilitySnapshots((await this.metricRows(scope, p.from, p.to)) as never)) if (s.day >= lo && s.day <= hi) snaps.set(k, s);
    if (p.from <= today && today <= p.to) {
      for (const id of scope) {
        const c = await this.occupancyCounts([id]);
        snaps.set(`${ymd(today)}|${id}`, { day: ymd(today)!, facility: String(id), rentable: c.rentable, occupied: c.occupied, areaRentable: c.areaRentable, areaOccupied: c.areaOccupied, potentialRent: c.potentialRent, actualRent: c.actualRent });
      }
    }
    const last = new Map<string, Snapshot & { facility: string }>();
    for (const s of snaps.values()) {
      const k = `${bucketOf(s.day, p.groupBy)}|${s.facility}`;
      const prev = last.get(k);
      if (!prev || s.day > prev.day) last.set(k, s);
    }
    const rowOf = (period: string, facility: string, s: { day: string; rentable: number; occupied: number; areaRentable: number; areaOccupied: number; potentialRent: number; actualRent: number }) => {
      const r = occRates({ ...s, activeContracts: 0 });
      return { period, facility, asOf: s.day, units: s.rentable, occupied: s.occupied, unitRate: s.rentable ? r.unitRate : null, areaRate: s.areaRentable ? r.areaRate : null, economicRate: s.potentialRent ? r.economicRate : null };
    };
    const entries = [...last.entries()]
      .map(([k, s]) => ({ period: k.split('|')[0], s }))
      .sort((a, b) => a.period.localeCompare(b.period) || (facNames.get(a.s.facility) ?? '').localeCompare(facNames.get(b.s.facility) ?? '', 'vi'));
    const rows = entries.map(({ period, s }) => rowOf(period, facNames.get(s.facility) ?? '', s));
    let totalRow: Record<string, unknown> | undefined;
    const latest = entries.length ? entries[entries.length - 1].period : null;
    const inLatest = entries.filter((e) => e.period === latest);
    if (latest && inLatest.length > 1) {
      const sum = sumSnapshots(inLatest.map((e) => e.s));
      const day = inLatest.map((e) => e.s.day).sort().pop()!;
      totalRow = rowOf(latest, 'Tổng cộng', { day, ...sum });
    }
    const live = await this.occupancyCounts(scope);
    return {
      title: 'Báo cáo lấp đầy',
      columns: [{ key: 'period', label: 'Kỳ' }, { key: 'facility', label: 'Cơ sở' }, { key: 'asOf', label: 'Ngày số liệu', type: 'date' }, { key: 'units', label: 'Kho khai thác được', type: 'int' }, { key: 'occupied', label: 'Đang thuê', type: 'int' }, { key: 'unitRate', label: 'Lấp đầy theo kho', type: 'pct' }, { key: 'areaRate', label: 'Lấp đầy theo m²', type: 'pct' }, { key: 'economicRate', label: 'Lấp đầy kinh tế', type: 'pct' }],
      rows,
      totalRow,
      summary: { byStatus: live.byStatus },
    };
  }

  /** Billed, collected, recognized and refunded money per facility and period; the summary is the sum of the rows. */
  private async revenueReport(p: ReportParams, facNames: Map<string, string>): Promise<Table> {
    const ids = p.facilityIds ?? (await this.moneyFacilityIds());
    const rows: Record<string, unknown>[] = [];
    const parts: RevenueParts[] = [];
    const series = { billed: [] as { x: string; y: number }[], collected: [] as { x: string; y: number }[], recognized: [] as { x: string; y: number }[] };
    let cursor = p.from;
    while (cursor <= p.to) {
      const end = p.groupBy === 'day' ? cursor : p.groupBy === 'month' ? addDays(new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1)), -1) : new Date(Date.UTC(cursor.getUTCFullYear(), 11, 31));
      const e = end > p.to ? p.to : end;
      const period = bucketOf(ymd(cursor)!, p.groupBy);
      const here: RevenueParts[] = [];
      for (const fid of ids) {
        const r = await this.revenueOne(fid, cursor, e);
        here.push(r);
        // a facility with no money at all in the period would only add an empty line
        if (r.billed || r.collected || r.recognized || r.refunded || ids.length === 1) rows.push({ period, facility: facNames.get(fid.toString()), billed: r.billed, collected: r.collected, recognized: r.recognized, refunded: r.refunded });
      }
      const tot = sumRevenue(here);
      parts.push(tot);
      series.billed.push({ x: period, y: tot.billed });
      series.collected.push({ x: period, y: tot.collected });
      series.recognized.push({ x: period, y: tot.recognized });
      cursor = addDays(e, 1);
      if (rows.length > 5000) break;
    }
    const all = sumRevenue(parts);
    // billed lines by fee type: they add up to "billed" (deposits are not revenue and are left out, like in "billed")
    const items = await this.prisma.invoiceItem.findMany({ where: { item_type: { not: 'DEPOSIT' }, invoice: { status: { not: 'VOID' }, issue_date: { gte: p.from, lte: p.to }, facility_id: { in: ids } } }, select: { amount: true, item_type: true, fee_type_id: true } });
    const feeTypes = new Map((await this.prisma.feeType.findMany({ select: { id: true, code: true } })).map((f) => [f.id.toString(), f.code]));
    const byFee = new Map<string, number>();
    for (const i of items) {
      const k = (i.fee_type_id != null ? feeTypes.get(i.fee_type_id.toString()) : undefined) ?? i.item_type;
      byFee.set(k, (byFee.get(k) ?? 0) + Number(i.amount));
    }
    return {
      title: 'Doanh thu phát hành, thực thu và ghi nhận',
      columns: [{ key: 'period', label: 'Kỳ' }, { key: 'facility', label: 'Cơ sở' }, { key: 'billed', label: 'Phát hành', type: 'money' }, { key: 'collected', label: 'Thực thu', type: 'money' }, { key: 'recognized', label: 'Ghi nhận', type: 'money' }, { key: 'refunded', label: 'Đã hoàn', type: 'money' }],
      rows,
      series: [{ label: 'Phát hành', points: series.billed }, { label: 'Thực thu', points: series.collected }, { label: 'Ghi nhận', points: series.recognized }],
      summary: { billed: all.billed, collected: all.collected, recognized: all.recognized, refunded: all.refunded, byFeeType: [...byFee.entries()].map(([type, amount]) => ({ type, amount: Math.round(amount) })).sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)) },
    };
  }

  // ---------------------------------------------------------------- money going back out
  /** Every refund asked for in the period, one row each, with the full story of the refund in `detail`. */
  private async refundsReport(p: ReportParams, facNames: Map<string, string>): Promise<Table> {
    const all = await this.prisma.refund.findMany({ where: { created_at: localRange(p.from, p.to), ...this.fIn(p.facilityIds) }, orderBy: { id: 'desc' } });
    const idsOf = (pick: (r: (typeof all)[number]) => bigint | null | undefined) => [...new Set(all.map(pick).filter((x): x is bigint => x != null))];
    const [contracts, reservations, customers, users, settlements] = await Promise.all([
      this.prisma.contract.findMany({ where: { id: { in: idsOf((r) => r.contract_id) } }, select: { id: true, code: true, unit_id: true } }),
      this.prisma.reservation.findMany({ where: { id: { in: idsOf((r) => r.reservation_id) } }, select: { id: true, code: true } }),
      this.prisma.customer.findMany({ where: { id: { in: idsOf((r) => r.customer_id) } }, select: { id: true, full_name: true } }),
      this.prisma.user.findMany({ where: { id: { in: [...new Set([...idsOf((r) => r.requested_by), ...idsOf((r) => r.approved_by)])] } }, select: { id: true, full_name: true } }),
      this.prisma.depositSettlement.findMany({ where: { refund_id: { in: all.map((r) => r.id) } } }),
    ]);
    const units = await this.prisma.unit.findMany({ where: { id: { in: contracts.map((c) => c.unit_id) } }, select: { id: true, code: true } });
    const nm = (list: { id: bigint; full_name: string }[]) => new Map(list.map((x) => [x.id.toString(), x.full_name]));
    const contractBy = new Map(contracts.map((c) => [c.id.toString(), c]));
    const unitBy = new Map(units.map((u) => [u.id.toString(), u.code]));
    const resBy = new Map(reservations.map((r) => [r.id.toString(), r.code]));
    const custBy = nm(customers);
    const userBy = nm(users);
    const settleBy = new Map(settlements.map((s) => [s.refund_id!.toString(), s]));
    const date = (d: Date | null | undefined) => (d ? dayKey(d) : null);
    const rows = all.map((r) => {
      const c = r.contract_id ? contractBy.get(r.contract_id.toString()) : undefined;
      const s = settleBy.get(r.id.toString());
      const row = {
        created: date(r.created_at),
        facility: facNames.get(r.facility_id.toString()) ?? '',
        code: `HT-${String(r.id).padStart(6, '0')}`,
        contract: c?.code ?? '',
        reservation: r.reservation_id ? resBy.get(r.reservation_id.toString()) ?? '' : '',
        customer: custBy.get(r.customer_id.toString()) ?? '',
        reason: REFUND_REASON_VI[r.reason] ?? r.reason,
        status: REFUND_STATUS_VI[r.status] ?? r.status,
        method: REFUND_METHOD_VI[r.method] ?? r.method,
        amount: Number(r.amount),
        depositPortion: Number(r.deposit_portion),
        requestedBy: r.requested_by ? userBy.get(r.requested_by.toString()) ?? '' : 'Hệ thống',
        approvedBy: r.approved_by ? userBy.get(r.approved_by.toString()) ?? '' : r.approved_at ? 'Tự động duyệt' : '',
        approvedAt: date(r.approved_at),
        processedAt: date(r.processed_at),
        reference: r.manual_reference ?? '',
        note: r.note ?? '',
      };
      const detail: DetailLine[] = [
        { label: 'Mã khoản hoàn', value: row.code },
        { label: 'Trạng thái', value: row.status },
        { label: 'Lý do hoàn', value: row.reason },
        { label: 'Số tiền hoàn', value: row.amount, type: 'money' },
        { label: 'Trong đó tiền cọc', value: row.depositPortion, type: 'money' },
        { label: 'Hình thức chi', value: row.method },
        { label: 'Cơ sở', value: row.facility },
        { label: 'Khách hàng', value: row.customer },
        { label: 'Hợp đồng', value: row.contract || null },
        { label: 'Kho', value: c ? unitBy.get(c.unit_id.toString()) ?? null : null },
        { label: 'Đơn đặt kho', value: row.reservation || null },
        { label: 'Người đề xuất', value: row.requestedBy || null },
        { label: 'Cấp phải duyệt', value: APPROVER_VI[r.required_approver_role] ?? r.required_approver_role },
        { label: 'Người duyệt', value: row.approvedBy || null },
        { label: 'Ngày đề xuất', value: row.created, type: 'date' },
        { label: 'Ngày duyệt', value: row.approvedAt, type: 'date' },
        { label: 'Ngày chi tiền', value: row.processedAt, type: 'date' },
        { label: 'Tham chiếu chi tiền', value: row.reference || null },
        { label: 'Ghi chú', value: row.note || null },
        ...(s
          ? ([
              { label: 'Quyết toán: tiền cọc ban đầu', value: Number(s.deposit_amount), type: 'money' },
              { label: 'Quyết toán: khấu trừ nợ tiền thuê', value: Number(s.outstanding_applied), type: 'money' },
              { label: 'Quyết toán: chi phí hư hại', value: Number(s.damage_total), type: 'money' },
              { label: 'Quyết toán: chi phí dọn dẹp', value: Number(s.cleaning_total), type: 'money' },
              { label: 'Quyết toán: hoàn tiền trả trước', value: Number(s.prepaid_refund), type: 'money' },
              { label: 'Quyết toán: số tiền hoàn cho khách', value: Number(s.net_amount), type: 'money' },
            ] as DetailLine[])
          : []),
      ];
      return { ...row, detail };
    });
    const open = ['PENDING_APPROVAL', 'APPROVED', 'MANUAL_REQUIRED', 'PROCESSING'];
    const sum = (list: typeof all) => list.reduce((a, r) => a + Number(r.amount), 0);
    return {
      title: 'Hoàn tiền (từng khoản)',
      columns: [
        { key: 'created', label: 'Ngày đề xuất', type: 'date' }, { key: 'facility', label: 'Cơ sở' }, { key: 'code', label: 'Mã khoản hoàn' }, { key: 'contract', label: 'Hợp đồng' }, { key: 'reservation', label: 'Đơn đặt kho' }, { key: 'customer', label: 'Khách' },
        { key: 'reason', label: 'Lý do' }, { key: 'status', label: 'Trạng thái' }, { key: 'method', label: 'Hình thức' }, { key: 'amount', label: 'Số tiền', type: 'money' }, { key: 'depositPortion', label: 'Trong đó cọc', type: 'money' },
        { key: 'requestedBy', label: 'Người đề xuất' }, { key: 'approvedBy', label: 'Người duyệt' }, { key: 'approvedAt', label: 'Ngày duyệt', type: 'date' }, { key: 'processedAt', label: 'Ngày chi', type: 'date' }, { key: 'reference', label: 'Tham chiếu chi' }, { key: 'note', label: 'Ghi chú' },
      ],
      rows,
      summary: {
        refundCount: all.length,
        refundSucceeded: sum(all.filter((r) => r.status === 'SUCCEEDED')),
        refundOpen: sum(all.filter((r) => open.includes(r.status))),
        refundRejected: all.filter((r) => r.status === 'REJECTED' || r.status === 'FAILED').length,
        refundByReason: groupTotals(all, (r) => REFUND_REASON_VI[r.reason] ?? r.reason, (r) => Number(r.amount)),
        refundByStatus: groupTotals(all, (r) => REFUND_STATUS_VI[r.status] ?? r.status, (r) => Number(r.amount)),
        refundByFacility: groupTotals(all, (r) => facNames.get(r.facility_id.toString()) ?? '', (r) => Number(r.amount)),
      },
    };
  }

  /** Every abandoned-goods record (inventory, decision, proceeds), one row each. A record is in the period when it was opened or decided then. */
  private async abandonedGoodsReport(p: ReportParams, facNames: Map<string, string>): Promise<Table> {
    const lo = localDayStart(p.from).getTime();
    const hi = localDayEnd(p.to).getTime();
    const inRange = (d: Date | null | undefined) => !!d && d.getTime() >= lo && d.getTime() < hi;
    const records = (await this.prisma.abandonedGoodsRecord.findMany({ orderBy: { id: 'desc' } })).filter((r) => inRange(r.created_at) || inRange(r.disposition_at));
    const contracts = await this.prisma.contract.findMany({ where: { id: { in: [...new Set(records.map((r) => r.contract_id))] } }, select: { id: true, code: true, facility_id: true, customer_id: true } });
    const contractBy = new Map(contracts.map((c) => [c.id.toString(), c]));
    const scoped = records.filter((r) => { const c = contractBy.get(r.contract_id.toString()); return !!c && (!p.facilityIds || p.facilityIds.some((f) => f === c.facility_id)); });
    const [customers, units, users] = await Promise.all([
      this.prisma.customer.findMany({ where: { id: { in: [...new Set(contracts.map((c) => c.customer_id))] } }, select: { id: true, full_name: true } }),
      this.prisma.unit.findMany({ where: { id: { in: [...new Set(scoped.map((r) => r.unit_id))] } }, select: { id: true, code: true } }),
      this.prisma.user.findMany({ where: { id: { in: [...new Set(scoped.flatMap((r) => [r.witness_1_user_id, r.witness_2_user_id, r.disposition_approved_by]).filter((x): x is bigint => x != null))] } }, select: { id: true, full_name: true } }),
    ]);
    const custBy = new Map(customers.map((c) => [c.id.toString(), c.full_name]));
    const unitBy = new Map(units.map((u) => [u.id.toString(), u.code]));
    const userBy = new Map(users.map((u) => [u.id.toString(), u.full_name]));
    const today = this.core.today();
    const rows = scoped.map((r) => {
      const c = contractBy.get(r.contract_id.toString())!;
      const items = (Array.isArray(r.inventory_list) ? r.inventory_list : []) as { item?: string; qty?: number }[];
      const itemsText = items.map((x) => `${x.item ?? '?'} (x${x.qty ?? 1})`).join('; ');
      const overdue = r.disposition === 'PENDING' && r.hold_until < today;
      const row = {
        created: dayKey(r.created_at),
        facility: facNames.get(c.facility_id.toString()) ?? '',
        contract: c.code,
        unit: unitBy.get(r.unit_id.toString()) ?? '',
        customer: custBy.get(c.customer_id.toString()) ?? '',
        itemCount: items.reduce((a, x) => a + Number(x.qty ?? 1), 0),
        items: itemsText,
        location: r.stored_location ?? '',
        holdUntil: ymd(r.hold_until),
        status: DISPOSITION_VI[r.disposition] ?? r.disposition,
        holdState: r.disposition !== 'PENDING' ? '' : overdue ? 'Quá hạn lưu giữ' : 'Đang lưu giữ',
        proceeds: r.proceeds_amount == null ? null : Number(r.proceeds_amount),
        decidedBy: r.disposition_approved_by ? userBy.get(r.disposition_approved_by.toString()) ?? '' : '',
        decidedAt: r.disposition_at ? dayKey(r.disposition_at) : null,
      };
      const detail: DetailLine[] = [
        { label: 'Hợp đồng', value: row.contract },
        { label: 'Kho', value: row.unit },
        { label: 'Cơ sở', value: row.facility },
        { label: 'Khách hàng', value: row.customer },
        { label: 'Ngày kiểm kê', value: row.created, type: 'date' },
        { label: 'Nơi lưu giữ', value: row.location || null },
        { label: 'Giữ đến', value: row.holdUntil, type: 'date' },
        { label: 'Tình trạng lưu giữ', value: row.holdState || null },
        { label: 'Người làm chứng 1', value: userBy.get(r.witness_1_user_id.toString()) ?? null },
        { label: 'Người làm chứng 2', value: userBy.get(r.witness_2_user_id.toString()) ?? null },
        ...items.map((x, i) => ({ label: `Tài sản ${i + 1}`, value: `${x.item ?? '?'} · số lượng ${x.qty ?? 1}` }) as DetailLine),
        { label: 'Quyết định xử lý', value: row.status },
        { label: 'Người quyết định (BOM)', value: row.decidedBy || null },
        { label: 'Ngày quyết định', value: row.decidedAt, type: 'date' },
        { label: 'Tiền thu được (thanh lý)', value: row.proceeds, type: 'money' },
      ];
      return { ...row, detail };
    });
    return {
      title: 'Tài sản tồn đọng (từng hồ sơ)',
      columns: [
        { key: 'created', label: 'Ngày kiểm kê', type: 'date' }, { key: 'facility', label: 'Cơ sở' }, { key: 'contract', label: 'Hợp đồng' }, { key: 'unit', label: 'Kho' }, { key: 'customer', label: 'Khách' },
        { key: 'itemCount', label: 'Số món', type: 'int' }, { key: 'items', label: 'Danh mục tài sản' }, { key: 'location', label: 'Nơi lưu giữ' }, { key: 'holdUntil', label: 'Giữ đến', type: 'date' },
        { key: 'status', label: 'Xử lý' }, { key: 'holdState', label: 'Lưu giữ' }, { key: 'proceeds', label: 'Tiền thu được', type: 'money' }, { key: 'decidedBy', label: 'Người quyết định' }, { key: 'decidedAt', label: 'Ngày quyết định', type: 'date' },
      ],
      rows,
      summary: {
        agCount: scoped.length,
        agPending: scoped.filter((r) => r.disposition === 'PENDING').length,
        agOverdue: scoped.filter((r) => r.disposition === 'PENDING' && r.hold_until < today).length,
        agProceeds: scoped.reduce((a, r) => a + Number(r.proceeds_amount ?? 0), 0),
        agByDisposition: groupTotals(scoped, (r) => DISPOSITION_VI[r.disposition] ?? r.disposition, (r) => Number(r.proceeds_amount ?? 0)),
        agByFacility: groupTotals(scoped, (r) => facNames.get(contractBy.get(r.contract_id.toString())!.facility_id.toString()) ?? '', (r) => Number(r.proceeds_amount ?? 0)),
      },
    };
  }

  // ---------------------------------------------------------------- exports
  async requestExport(ctx: AccessContext, code: string, q: Record<string, string>, format: 'CSV' | 'XLSX' | 'PDF', facilityIds: bigint[] | null) {
    ctx.require('report.export', false);
    const params = this.resolveParams(ctx, code, q, facilityIds);
    const rec = await this.prisma.reportExport.create({ data: { public_id: newId(), requested_by: ctx.userId, report_code: code, params: { ...q, facilityIds: params.facilityIds?.map(String) ?? null }, format, status: 'QUEUED' } });
    await this.audit.log(ctx, { action: 'report.export', entityType: 'report_export', entityId: rec.id, entityRef: rec.public_id, after: { code, format, q } });
    // Built before answering: a Worker drops work still running after the response (and the data snapshot is saved at that moment), so a
    // background export never finished there. Reports are small, so the wait is short.
    await this.runExport(ctx, rec.id, code, params, format);
    return this.prisma.reportExport.findUniqueOrThrow({ where: { id: rec.id } });
  }

  private async runExport(ctx: AccessContext, id: bigint, code: string, p: ReportParams, format: 'CSV' | 'XLSX' | 'PDF') {
    try {
      await this.prisma.reportExport.update({ where: { id }, data: { status: 'RUNNING' } });
      const t = await this.run(ctx, code, p);
      // the bottom row of a report (for example the system-wide occupancy) goes into the file too, as its last line
      const exportRows = t.totalRow ? [...t.rows, t.totalRow] : t.rows;
      const fmtCell = (v: unknown, type?: string) => (v === null || v === undefined ? '' : type === 'pct' ? `${(Number(v) * 100).toFixed(1)}%` : type === 'money' ? Math.round(Number(v)).toLocaleString('vi-VN') : v);
      let buf: Buffer;
      let mime: string;
      let ext: string;
      if (format === 'CSV') {
        buf = buildCsv(t.columns, exportRows);
        mime = 'text/csv';
        ext = 'csv';
      } else if (format === 'XLSX') {
        const wb = new ExcelJS.Workbook();
        wb.creator = 'Vaultra';
        const ws = wb.addWorksheet(t.title.replace(/[*?:\/[\]]/g, ' ').slice(0, 31));
        ws.columns = t.columns.map((c) => ({ header: c.label, key: c.key, width: Math.max(12, Math.min(48, c.label.length + 4)), style: c.type === 'money' ? { numFmt: '#,##0 "₫"' } : c.type === 'pct' ? { numFmt: '0.0%' } : {} }));
        ws.getRow(1).font = { bold: true };
        for (const r of exportRows) ws.addRow(Object.fromEntries(t.columns.map((c) => [c.key, c.type === 'money' || c.type === 'pct' || c.type === 'int' ? (r[c.key] === null || r[c.key] === undefined ? null : Number(r[c.key])) : r[c.key]])));
        if (t.totalRow) ws.getRow(ws.rowCount).font = { bold: true };
        const pw = wb.addWorksheet('Tham số');
        pw.addRows([['Báo cáo', t.title], ['Từ ngày', ymd(p.from)], ['Đến ngày', ymd(p.to)], ['Nhóm theo', p.groupBy], ['Cơ sở', p.facilityIds ? p.facilityIds.length + ' cơ sở' : 'Tất cả'], ['Xuất lúc', new Date().toISOString()]]);
        buf = Buffer.from(await wb.xlsx.writeBuffer());
        mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        ext = 'xlsx';
      } else {
        const cols = t.columns.slice(0, 7);
        const cut = t.columns.length > cols.length || exportRows.length > 300;
        buf = await this.pdf.render(t.title, `${ymd(p.from)} → ${ymd(p.to)}`, [
          ...(summaryLines(t.summary).length ? [{ heading: 'Tóm tắt', rows: summaryLines(t.summary) }] : []),
          { heading: 'Chi tiết', table: { headers: cols.map((c) => c.label), rows: exportRows.slice(0, 300).map((r) => cols.map((c) => String(fmtCell(r[c.key], c.type)))) } },
          ...(cut ? [{ heading: 'Lưu ý', paragraphs: ['Bản PDF chỉ hiển thị 7 cột đầu và tối đa 300 dòng. Hãy tải CSV hoặc Excel để có đầy đủ mọi cột và mọi dòng.'] }] : []),
        ]);
        mime = 'application/pdf';
        ext = 'pdf';
      }
      const m = await this.media.storeServerFile(this.prisma, { purpose: 'REPORT_EXPORT', buffer: buf, mime, ext, relatedType: 'report_export', relatedId: id, uploadedBy: ctx.userId });
      await this.prisma.reportExport.update({ where: { id }, data: { status: 'READY', media_file_id: m.id, row_count: t.rows.length, expires_at: new Date(Date.now() + 86400000) } });
      await this.notify.notify({ users: [ctx.userId], event: 'report.export_ready', vars: { report: t.title, format, rowCount: t.rows.length, from: ymd(p.from), to: ymd(p.to) }, link: ctx.hasRole('BUSINESS_OPS_MANAGER') ? '/ops/exports' : '/manage/reports', related: { type: 'report_export', id }, email: true });
    } catch (e) {
      this.logger.error(e);
      await this.prisma.reportExport.update({ where: { id }, data: { status: 'FAILED', error: String((e as Error).message).slice(0, 500) } });
    }
  }

  async exportStatus(ctx: AccessContext, publicId: string) {
    const r = await this.prisma.reportExport.findUnique({ where: { public_id: publicId } });
    if (!r || r.requested_by !== ctx.userId) throw notFound('File xuất');
    let url: string | null = null;
    if (r.status === 'READY' && r.media_file_id) {
      if (r.expires_at && r.expires_at < new Date()) return { ...r, status: 'EXPIRED', url: null };
      const m = await this.prisma.mediaFile.findUniqueOrThrow({ where: { id: r.media_file_id } });
      url = await this.media.urlFor(m, `${r.report_code}.${m.object_key.split('.').pop()}`);
    }
    const ext = r.format ? String(r.format).toLowerCase() : 'csv';
    return { ...r, url, fileName: `vaultra-${r.report_code}-${ymd(this.core.today())}.${ext}` };
  }

  // ---------------------------------------------------------------- nightly metrics (§6.4 4D step 1)
  async computeDailyMetrics(day?: Date) {
    const d = day ?? this.core.today();
    const facilities = await this.prisma.facility.findMany({ where: { deleted_at: null } });
    for (const f of facilities) {
      const types = await this.prisma.unitType.findMany({ where: { facility_id: f.id } });
      for (const key of [null, ...types.map((t) => t.id)]) {
        const occ = await this.occupancyNow([f.id], key);
        const rev = key ? { billed: 0, collected: 0, recognized: 0, refunded: 0 } : await this.revenue([f.id], d, d);
        const ag = key ? null : await this.aging([f.id]);
        const data = {
          units_total: occ.total, units_available: occ.byStatus.AVAILABLE ?? 0, units_reserved: occ.byStatus.RESERVED ?? 0, units_occupied: occ.byStatus.OCCUPIED ?? 0, units_overlocked: occ.byStatus.OVERLOCKED ?? 0,
          units_unavailable: (occ.byStatus.OUT_OF_SERVICE ?? 0) + (occ.byStatus.RETIRED ?? 0), area_total_m2: occ.areaRentable, area_occupied_m2: occ.areaOccupied, potential_rent: occ.potentialRent, actual_rent: occ.actualRent,
          billed_amount: rev.billed, collected_amount: rev.collected, refunded_amount: rev.refunded, recognized_revenue: rev.recognized,
          ar_0_30: ag?.d0_30 ?? 0, ar_31_60: ag?.d31_60 ?? 0, ar_61_90: ag?.d61_90 ?? 0, ar_90_plus: ag?.d90_plus ?? 0,
          move_ins: key ? 0 : await this.prisma.contract.count({ where: { facility_id: f.id, activated_at: { gte: d, lt: addDays(d, 1) } } }),
          move_outs: key ? 0 : await this.prisma.contract.count({ where: { facility_id: f.id, ended_at: { gte: d, lt: addDays(d, 1) } } }),
          reservations_created: key ? 0 : await this.prisma.reservation.count({ where: { facility_id: f.id, created_at: { gte: d, lt: addDays(d, 1) } } }),
          reservations_cancelled: key ? 0 : await this.prisma.reservation.count({ where: { facility_id: f.id, cancelled_at: { gte: d, lt: addDays(d, 1) } } }),
          delinquent_contracts: key ? 0 : await this.prisma.contract.count({ where: { facility_id: f.id, delinquency_status: { not: 'CURRENT' }, status: { in: ['ACTIVE', 'MOVE_OUT_SCHEDULED', 'EXPIRED'] } } }),
          tickets_opened: key ? 0 : await this.prisma.supportTicket.count({ where: { facility_id: f.id, created_at: { gte: d, lt: addDays(d, 1) } } }),
          tickets_breached: key ? 0 : await this.prisma.supportTicket.count({ where: { facility_id: f.id, sla_breached: true, created_at: { gte: d, lt: addDays(d, 1) } } }),
        };
        await this.prisma.dailyFacilityMetric.upsert({ where: { metric_date_facility_id_unit_type_key: { metric_date: d, facility_id: f.id, unit_type_key: key ?? BigInt(0) } }, update: data, create: { metric_date: d, facility_id: f.id, unit_type_key: key ?? BigInt(0), ...data } });
      }
    }
    // alerts (§6.4 4D step 4)
    const p = await this.core.activePolicy(null);
    const boms = await this.core.businessOpsManagers(this.prisma);
    for (const f of facilities.filter((x) => x.status === 'ACTIVE')) {
      const occ = await this.occupancyNow([f.id]);
      const ag = await this.aging([f.id]);
      const msgs: string[] = [];
      if (occ.rentable && occ.unitRate < p.params.occupancy_alert_pct / 100) msgs.push(`Tỷ lệ lấp đầy ${(occ.unitRate * 100).toFixed(1)}% thấp hơn ngưỡng ${p.params.occupancy_alert_pct}%`);
      if (ag.overdueRatio > p.params.delinquency_alert_pct / 100) msgs.push(`Tỷ lệ nợ quá hạn ${(ag.overdueRatio * 100).toFixed(1)}% vượt ngưỡng ${p.params.delinquency_alert_pct}%`);
      const week = await this.revenue([f.id], addDays(d, -7), d);
      const prev4 = await this.revenue([f.id], addDays(d, -35), addDays(d, -8));
      if (prev4.recognized > 0 && week.recognized < (prev4.recognized / 4) * 0.85) msgs.push('Doanh thu tuần giảm hơn 15% so với trung bình 4 tuần');
      if (msgs.length) await this.notify.notify({ users: [...boms, ...(await this.core.facilityManagers(this.prisma, f.id))], event: 'metrics.alert', vars: { facility: f.name, message: msgs.join('; ') }, link: '/ops', dedupeKey: `metrics.alert:${f.id}:${ymd(d)}` });
    }
    return facilities.length;
  }

  AppError = AppError;
}
