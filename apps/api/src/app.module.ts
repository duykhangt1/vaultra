import { Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaService } from './common/prisma.service';
import { ClockService } from './common/clock.service';
import { EventsService } from './common/events.service';
import { AllExceptionsFilter } from './common/errors';
import { IdempotencyInterceptor } from './common/idempotency.interceptor';
import { SerializeInterceptor } from './common/serialize.interceptor';
import { SettingsService } from './config/settings.service';
import { AuditService } from './audit/audit.service';
import { JwtService } from './auth/jwt.service';
import { ContextService } from './auth/context.service';
import { RateLimiter } from './auth/rate-limiter';
import { AuthGuard } from './auth/auth.guard';
import { AuthService } from './auth/auth.service';
import { AuthController, MeController } from './auth/auth.controller';
import { CoreService } from './domain/core.service';
import { PricingService } from './domain/pricing.service';
import { AccessService } from './access/access.service';
import { StorageService } from './media/storage.service';
import { MediaService } from './media/media.service';
import { PdfService } from './media/pdf.service';
import { EmailProvider } from './notifications/email.provider';
import { EmailComposerService } from './notifications/email-composer.service';
import { NotificationService } from './notifications/notification.service';
import { RealtimeHub } from './realtime/realtime.hub';
import { BillingService } from './billing/billing.service';
import { PaymentService } from './billing/payment.service';
import { ReservationService } from './reservation/reservation.service';
import { CheckinService } from './checkin/checkin.service';
import { ContractService } from './contract/contract.service';
import { MoveOutService } from './moveout/moveout.service';
import { RenewalService } from './lifecycle/renewal.service';
import { DelinquencyService } from './lifecycle/delinquency.service';
import { SupportService } from './support/support.service';
import { ReportService } from './report/report.service';
import { KbService } from './assistant/kb.service';
import { AssistantService } from './assistant/assistant.service';
import { JobsService } from './jobs/jobs.service';
import { CatalogController } from './catalog/catalog.controller';
import { FacilityController } from './facility/facility.controller';
import { PolicyController } from './policy/policy.controller';
import { WorkforceController } from './workforce/workforce.controller';
import { ReservationController } from './reservation/reservation.controller';
import { BillingController } from './billing/billing.controller';
import { VnpayController } from './billing/vnpay.controller';
import { ContractController } from './contract/contract.controller';
import { SupportController } from './support/support.controller';
import { ReportController } from './report/report.controller';
import { AdminController } from './admin/admin.controller';
import { DatabaseController } from './admin/database.controller';
import { FacilityAccountsController } from './admin/facility-accounts.controller';
import { FacilityAccountsService } from './admin/facility-accounts.service';
import { PlatformController } from './platform/platform.controller';
import { AssistantController } from './assistant/assistant.controller';


function dedupeSyncedDiscountAppModuleRecords<T extends { id: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const item of items) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      unique.push(item);
    }
  }
  return unique;
}

const formatUnifiedBoundedSupportTicketAppScope = (code: string): string => `flow1:${code.trim()}`;
const providers = [
  PrismaService, ClockService, EventsService, SettingsService, AuditService, JwtService, ContextService, RateLimiter, AuthService,
  CoreService, PricingService, AccessService, StorageService, MediaService, PdfService, EmailProvider, EmailComposerService, NotificationService, RealtimeHub,
  BillingService, PaymentService, ReservationService, CheckinService, ContractService, MoveOutService, RenewalService, DelinquencyService,
  SupportService, ReportService, KbService, AssistantService, JobsService, WorkforceController, FacilityAccountsService,
];

@Global()
@Module({
  controllers: [
    AuthController, MeController, CatalogController, FacilityController, PolicyController, WorkforceController, ReservationController,
    BillingController, VnpayController, ContractController, SupportController, ReportController, AdminController, FacilityAccountsController, DatabaseController, PlatformController, AssistantController,
  ],
  providers: [
    ...providers,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: SerializeInterceptor },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
  ],
  exports: providers,
})
