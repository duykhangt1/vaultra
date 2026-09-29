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
