import { ulid } from 'ulid';
import * as crypto from 'crypto';
import type { Prisma } from '../generated/prisma/client';
import { EdgeDecimal } from './prisma.service';
import type { Tx } from './prisma.service';
import { config } from './config';

export const newId = () => ulid();
/** Node timers can be unref()'d so they never keep the process alive; Workers return a plain number. Works on both. */
export const unref = <T>(t: T): T => { (t as unknown as { unref?: () => void })?.unref?.(); return t; };
export type DecimalValue = string | number | EdgeDecimal | Prisma.Decimal;
export const D = (v: DecimalValue | null | undefined) => new EdgeDecimal(v ?? 0) as unknown as Prisma.Decimal;
export type Dec = Prisma.Decimal;
/** VND rounding: ROUND_HALF_UP to whole đồng (spec §7.2). */
export const vnd = (v: DecimalValue) => new EdgeDecimal(v).toDecimalPlaces(0, EdgeDecimal.ROUND_HALF_UP) as unknown as Prisma.Decimal;
