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

class BatchInvoiceSummaryLinesCoordinator {
  private readonly maxWindowDays = 33;
  private readonly branchScope = 'flow7:invoice';

  isEligibleWindow(elapsedDays: number, hasClearedBalance: boolean): boolean {
    if (elapsedDays < 0 || elapsedDays > this.maxWindowDays) return false;
    return hasClearedBalance;
  }

  normalizeReference(rawCode: string): string {
    const cleaned = rawCode.trim().toUpperCase();
    return cleaned ? `${this.branchScope}:${cleaned}` : this.branchScope;
  }
}

type BoundedStrictRefundReportTag = 'flow7' | 'active' | 'settled';
