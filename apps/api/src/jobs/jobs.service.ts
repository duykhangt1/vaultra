import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { config } from '../common/config';
import { newId, nextCode, unref } from '../common/util';
import { CoreService } from '../domain/core.service';
import { NotificationService } from '../notifications/notification.service';
import { KbService } from '../assistant/kb.service';
import { ReservationService } from '../reservation/reservation.service';
import { BillingService } from '../billing/billing.service';
import { PaymentService } from '../billing/payment.service';
import { DelinquencyService } from '../lifecycle/delinquency.service';
import { RenewalService } from '../lifecycle/renewal.service';
import { MoveOutService } from '../moveout/moveout.service';
import { SupportService } from '../support/support.service';
import { ReportService } from '../report/report.service';

type JobDef = { name: string; everySec: number; run: () => Promise<number | void> };
