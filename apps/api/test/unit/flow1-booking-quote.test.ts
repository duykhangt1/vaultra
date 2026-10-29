import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canTransition,
  DEFAULT_POLICY_PARAMS,
  recommendSize,
  RESERVATION_TRANSITIONS,
  termRate,
} from '@vaultra/shared';
import '../../src/common/prisma.service';
import { PricingService } from '../../src/domain/pricing.service';
import { D } from '../../src/common/util';
import { addMonths, dateOnly } from '../../src/common/dates';

const basePolicy = {
  ...DEFAULT_POLICY_PARAMS,
  vat_rate: 10,
  prices_include_vat: false,
  admin_fee: 100_000,
  reservation_payment_mode: 'DEPOSIT_AND_FIRST_PERIOD' as const,
};

const unitTypeFixture = {
  id: 10n,
  name: 'Kho Tiêu Chuẩn 6m²',
  status: 'ACTIVE',
  is_bookable: true,
  deleted_at: null,
  list_price: D(2_200_000),
  online_price: D(2_000_000),
  deposit_override: null,
  facility: { id: 1n, timezone: 'Asia/Ho_Chi_Minh' },
};
