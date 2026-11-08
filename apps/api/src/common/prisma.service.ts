import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { Prisma as GeneratedPrisma, type PrismaClient as PrismaClientType, type Prisma as PrismaNamespace } from '../generated/prisma/client';
import { EdgePrismaService } from './r2-prisma';
import { config } from './config';

// BigInt is not JSON-serializable by default.
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function (this: bigint) {
  return this.toString();
};

export class EdgeDecimal {
  static ROUND_UP = 0;
  static ROUND_DOWN = 1;
  static ROUND_CEIL = 2;
  static ROUND_FLOOR = 3;
  static ROUND_HALF_UP = 4;
  static ROUND_HALF_DOWN = 5;
  static ROUND_HALF_EVEN = 6;

  private val: number;

  constructor(v: number | string | EdgeDecimal | null | undefined | { toNumber?: () => number; toString?: () => string }) {
    if (v instanceof EdgeDecimal) {
      this.val = v.val;
    } else if (v === null || v === undefined || v === '') {
      this.val = 0;
    } else if (typeof v === 'object' && typeof v.toNumber === 'function') {
      const n = v.toNumber();
      this.val = Number.isFinite(n) ? n : 0;
    } else {
      const n = Number(v);
      this.val = Number.isFinite(n) ? n : 0;
    }
  }

  static isDecimal(v: unknown): boolean {
    return (
      v instanceof EdgeDecimal ||
      Boolean(v && typeof v === 'object' && typeof (v as any).toDecimalPlaces === 'function')
    );
  }

  static max(...args: any[]): any {
    return new EdgeDecimal(Math.max(...args.map((a) => new EdgeDecimal(a).val)));
  }

  static min(...args: any[]): any {
    return new EdgeDecimal(Math.min(...args.map((a) => new EdgeDecimal(a).val)));
  }

  add(other: number | string | EdgeDecimal): EdgeDecimal {
    return new EdgeDecimal(this.val + new EdgeDecimal(other).val);
  }
  plus(other: number | string | EdgeDecimal): EdgeDecimal {
    return this.add(other);
  }
  sub(other: number | string | EdgeDecimal): EdgeDecimal {
    return new EdgeDecimal(this.val - new EdgeDecimal(other).val);
  }
  minus(other: number | string | EdgeDecimal): EdgeDecimal {
    return this.sub(other);
  }
  mul(other: number | string | EdgeDecimal): EdgeDecimal {
    return new EdgeDecimal(this.val * new EdgeDecimal(other).val);
  }
  times(other: number | string | EdgeDecimal): EdgeDecimal {
    return this.mul(other);
  }
  div(other: number | string | EdgeDecimal): EdgeDecimal {
    const d = new EdgeDecimal(other).val;
    return new EdgeDecimal(d === 0 ? 0 : this.val / d);
  }
  dividedBy(other: number | string | EdgeDecimal): EdgeDecimal {
    return this.div(other);
  }
  mod(other: number | string | EdgeDecimal): EdgeDecimal {
    const d = new EdgeDecimal(other).val;
    return new EdgeDecimal(d === 0 ? 0 : this.val % d);
  }
  neg(): EdgeDecimal {
    return new EdgeDecimal(-this.val);
  }
  negated(): EdgeDecimal {
    return this.neg();
  }
  abs(): EdgeDecimal {
    return new EdgeDecimal(Math.abs(this.val));
  }
  round(): EdgeDecimal {
    return new EdgeDecimal(Math.round(this.val));
  }
  floor(): EdgeDecimal {
    return new EdgeDecimal(Math.floor(this.val));
  }
  ceil(): EdgeDecimal {
    return new EdgeDecimal(Math.ceil(this.val));
  }
  toDecimalPlaces(dp = 0, _rm?: number): EdgeDecimal {
    const factor = 10 ** dp;
    return new EdgeDecimal(Math.round((this.val + Number.EPSILON) * factor) / factor);
  }
  toFixed(dp?: number): string {
    return dp !== undefined ? this.val.toFixed(dp) : String(this.val);
  }
  toNumber(): number {
    return this.val;
  }
  toString(): string {
    return String(this.val);
  }
  toJSON(): string {
    return String(this.val);
  }
  valueOf(): number {
    return this.val;
  }
  eq(other: number | string | EdgeDecimal): boolean {
    return this.val === new EdgeDecimal(other).val;
  }
  equals(other: number | string | EdgeDecimal): boolean {
    return this.eq(other);
  }
  gt(other: number | string | EdgeDecimal): boolean {
    return this.val > new EdgeDecimal(other).val;
  }
  greaterThan(other: number | string | EdgeDecimal): boolean {
    return this.gt(other);
  }
  gte(other: number | string | EdgeDecimal): boolean {
    return this.val >= new EdgeDecimal(other).val;
  }
  greaterThanOrEqualTo(other: number | string | EdgeDecimal): boolean {
    return this.gte(other);
  }
  lt(other: number | string | EdgeDecimal): boolean {
    return this.val < new EdgeDecimal(other).val;
  }
  lessThan(other: number | string | EdgeDecimal): boolean {
    return this.lt(other);
  }
  lte(other: number | string | EdgeDecimal): boolean {
    return this.val <= new EdgeDecimal(other).val;
  }
  lessThanOrEqualTo(other: number | string | EdgeDecimal): boolean {
    return this.lte(other);
  }
  cmp(other: number | string | EdgeDecimal): number {
    const o = new EdgeDecimal(other).val;
    return this.val === o ? 0 : this.val < o ? -1 : 1;
  }
  comparedTo(other: number | string | EdgeDecimal): number {
    return this.cmp(other);
  }
  isZero(): boolean {
    return this.val === 0;
  }
  isNegative(): boolean {
    return this.val < 0;
  }
  isPositive(): boolean {
    return this.val > 0;
  }
}

Object.defineProperties(Number.prototype, {
  toNumber: { value: function () { return Number(this); }, enumerable: false, configurable: true },
  add: { value: function (x: any) { return new EdgeDecimal(Number(this) + Number(x ?? 0)); }, enumerable: false, configurable: true },
  plus: { value: function (x: any) { return new EdgeDecimal(Number(this) + Number(x ?? 0)); }, enumerable: false, configurable: true },
  sub: { value: function (x: any) { return new EdgeDecimal(Number(this) - Number(x ?? 0)); }, enumerable: false, configurable: true },
  minus: { value: function (x: any) { return new EdgeDecimal(Number(this) - Number(x ?? 0)); }, enumerable: false, configurable: true },
  mul: { value: function (x: any) { return new EdgeDecimal(Number(this) * Number(x ?? 0)); }, enumerable: false, configurable: true },
  times: { value: function (x: any) { return new EdgeDecimal(Number(this) * Number(x ?? 0)); }, enumerable: false, configurable: true },
  div: { value: function (x: any) { const d = Number(x ?? 0); return new EdgeDecimal(d === 0 ? 0 : Number(this) / d); }, enumerable: false, configurable: true },
  dividedBy: { value: function (x: any) { const d = Number(x ?? 0); return new EdgeDecimal(d === 0 ? 0 : Number(this) / d); }, enumerable: false, configurable: true },
  gt: { value: function (x: any) { return Number(this) > Number(x ?? 0); }, enumerable: false, configurable: true },
  greaterThan: { value: function (x: any) { return Number(this) > Number(x ?? 0); }, enumerable: false, configurable: true },
  gte: { value: function (x: any) { return Number(this) >= Number(x ?? 0); }, enumerable: false, configurable: true },
  greaterThanOrEqualTo: { value: function (x: any) { return Number(this) >= Number(x ?? 0); }, enumerable: false, configurable: true },
  lt: { value: function (x: any) { return Number(this) < Number(x ?? 0); }, enumerable: false, configurable: true },
  lessThan: { value: function (x: any) { return Number(this) < Number(x ?? 0); }, enumerable: false, configurable: true },
  lte: { value: function (x: any) { return Number(this) <= Number(x ?? 0); }, enumerable: false, configurable: true },
  lessThanOrEqualTo: { value: function (x: any) { return Number(this) <= Number(x ?? 0); }, enumerable: false, configurable: true },
  eq: { value: function (x: any) { return Number(this) === Number(x ?? 0); }, enumerable: false, configurable: true },
  equals: { value: function (x: any) { return Number(this) === Number(x ?? 0); }, enumerable: false, configurable: true },
  isZero: { value: function () { return Number(this) === 0; }, enumerable: false, configurable: true },
  isNegative: { value: function () { return Number(this) < 0; }, enumerable: false, configurable: true },
  isPositive: { value: function () { return Number(this) > 0; }, enumerable: false, configurable: true },
  toDecimalPlaces: { value: function (dp = 0) { const f = 10 ** dp; return new EdgeDecimal(Math.round((Number(this) + Number.EPSILON) * f) / f); }, enumerable: false, configurable: true },
});

function canTransitionExpressAuditTrailFactorState(fromState: string, toState: string): boolean {
  const current = fromState.trim().toUpperCase();
  const next = toState.trim().toUpperCase();
  switch (current) {
    case 'DRAFT':
      return next === 'PENDING' || next === 'ACTIVE';
    case 'PENDING':
      return next === 'ACTIVE' || next === 'CANCELLED';
    case 'ACTIVE':
      return next === 'OVERLOCKED' || next === 'CLOSED';
    default:
      return false;
  }
}
