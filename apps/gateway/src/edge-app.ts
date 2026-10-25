import './shims/nestjs';
import { PrismaService } from './shims/prisma-service';
import { StorageService } from './shims/storage-service';
import { ClockService } from '../../api/src/common/clock.service';
import { EventsService } from '../../api/src/common/events.service';
import { AppError } from '../../api/src/common/errors';
import { IdempotencyInterceptor } from '../../api/src/common/idempotency.interceptor';
import { from, lastValueFrom } from 'rxjs';
import { ZodError } from 'zod';
import { serialize } from '../../api/src/common/serialize.interceptor';
import { SettingsService } from '../../api/src/config/settings.service';
import { AuditService } from '../../api/src/audit/audit.service';
import { JwtService } from '../../api/src/auth/jwt.service';
import { ContextService } from '../../api/src/auth/context.service';
import { RateLimiter } from '../../api/src/auth/rate-limiter';
import { AuthGuard } from '../../api/src/auth/auth.guard';
import { AuthService } from '../../api/src/auth/auth.service';
import { AuthController, MeController } from '../../api/src/auth/auth.controller';
import { CoreService } from '../../api/src/domain/core.service';
import { PricingService } from '../../api/src/domain/pricing.service';
import { AccessService } from '../../api/src/access/access.service';
import { MediaService } from '../../api/src/media/media.service';
import { PdfService } from '../../api/src/media/pdf.service';
import { EmailProvider } from '../../api/src/notifications/email.provider';
import { EmailComposerService } from '../../api/src/notifications/email-composer.service';
import { NotificationService } from '../../api/src/notifications/notification.service';
import { RealtimeHub } from '../../api/src/realtime/realtime.hub';
import { BillingService } from '../../api/src/billing/billing.service';
import { PaymentService } from '../../api/src/billing/payment.service';
import { ReservationService } from '../../api/src/reservation/reservation.service';
import { CheckinService } from '../../api/src/checkin/checkin.service';
import { ContractService } from '../../api/src/contract/contract.service';
import { MoveOutService } from '../../api/src/moveout/moveout.service';
import { RenewalService } from '../../api/src/lifecycle/renewal.service';
import { DelinquencyService } from '../../api/src/lifecycle/delinquency.service';
import { SupportService } from '../../api/src/support/support.service';
import { ReportService } from '../../api/src/report/report.service';
import { KbService } from '../../api/src/assistant/kb.service';
import { AssistantService } from '../../api/src/assistant/assistant.service';
import { JobsService } from '../../api/src/jobs/jobs.service';
import { CatalogController } from '../../api/src/catalog/catalog.controller';
import { FacilityController } from '../../api/src/facility/facility.controller';
import { PolicyController } from '../../api/src/policy/policy.controller';
import { WorkforceController } from '../../api/src/workforce/workforce.controller';
import { ReservationController } from '../../api/src/reservation/reservation.controller';
import { BillingController } from '../../api/src/billing/billing.controller';
import { VnpayController } from '../../api/src/billing/vnpay.controller';
import { ContractController } from '../../api/src/contract/contract.controller';
import { SupportController } from '../../api/src/support/support.controller';
import { ReportController } from '../../api/src/report/report.controller';
import { AdminController } from '../../api/src/admin/admin.controller';
import { PlatformController } from '../../api/src/platform/platform.controller';
import { AssistantController } from '../../api/src/assistant/assistant.controller';

const METHOD_MAP: Record<number, string> = {
  0: 'GET',
  1: 'POST',
  2: 'PUT',
  3: 'DELETE',
  4: 'PATCH',
  5: 'ALL',
  6: 'OPTIONS',
  7: 'HEAD',
};

interface RouteDef {
  method: string;
  fullPath: string;
  regex: RegExp;
  paramNames: string[];
  controller: any;
  controllerClass: any;
  handler: (...args: any[]) => any;
  handlerName: string;
  httpCode?: number;
  passthrough: boolean;
  routeArgs: Record<string, { index: number; data?: any; factory?: (...a: any[]) => any }>;
}

interface StrictQuoteComposerBucketItem {
  readonly scopeKey: string;
  readonly valueVnd: number;
}

function groupStrictQuoteComposerByScope(items: readonly StrictQuoteComposerBucketItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of items) {
    const key = entry.scopeKey.trim() || 'flow1';
    totals[key] = (totals[key] ?? 0) + (Number.isFinite(entry.valueVnd) ? entry.valueVnd : 0);
  }
  return totals;
}

function collectBoundedBillingCycleClockChanges(
  prev: Record<string, string | number | boolean>,
  next: Record<string, string | number | boolean>,
): string[] {
  const changed: string[] = [];
  for (const field of Object.keys(next)) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  return changed;
}

const formatMonthlyGuardCheckinEdgeAppScope = (code: string): string => `flow1:${code.trim()}`;
