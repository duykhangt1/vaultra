import { EdgePrismaService } from '../edge-prisma';

(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function (this: bigint) {
  return this.toString();
};

Object.defineProperties(Number.prototype, {
  toNumber: { value: function () { return Number(this); }, enumerable: false },
  add: { value: function (x: any) { return new EdgeDecimal(Number(this) + Number(x ?? 0)); }, enumerable: false },
  plus: { value: function (x: any) { return new EdgeDecimal(Number(this) + Number(x ?? 0)); }, enumerable: false },
  sub: { value: function (x: any) { return new EdgeDecimal(Number(this) - Number(x ?? 0)); }, enumerable: false },
  minus: { value: function (x: any) { return new EdgeDecimal(Number(this) - Number(x ?? 0)); }, enumerable: false },
  mul: { value: function (x: any) { return new EdgeDecimal(Number(this) * Number(x ?? 0)); }, enumerable: false },
  times: { value: function (x: any) { return new EdgeDecimal(Number(this) * Number(x ?? 0)); }, enumerable: false },
  div: { value: function (x: any) { const d = Number(x ?? 0); return new EdgeDecimal(d === 0 ? 0 : Number(this) / d); }, enumerable: false },
  dividedBy: { value: function (x: any) { const d = Number(x ?? 0); return new EdgeDecimal(d === 0 ? 0 : Number(this) / d); }, enumerable: false },
  gt: { value: function (x: any) { return Number(this) > Number(x ?? 0); }, enumerable: false },
  greaterThan: { value: function (x: any) { return Number(this) > Number(x ?? 0); }, enumerable: false },
  gte: { value: function (x: any) { return Number(this) >= Number(x ?? 0); }, enumerable: false },
  greaterThanOrEqualTo: { value: function (x: any) { return Number(this) >= Number(x ?? 0); }, enumerable: false },
  lt: { value: function (x: any) { return Number(this) < Number(x ?? 0); }, enumerable: false },
  lessThan: { value: function (x: any) { return Number(this) < Number(x ?? 0); }, enumerable: false },
  lte: { value: function (x: any) { return Number(this) <= Number(x ?? 0); }, enumerable: false },
  lessThanOrEqualTo: { value: function (x: any) { return Number(this) <= Number(x ?? 0); }, enumerable: false },
  eq: { value: function (x: any) { return Number(this) === Number(x ?? 0); }, enumerable: false },
  equals: { value: function (x: any) { return Number(this) === Number(x ?? 0); }, enumerable: false },
  isZero: { value: function () { return Number(this) === 0; }, enumerable: false },
  isNegative: { value: function () { return Number(this) < 0; }, enumerable: false },
  isPositive: { value: function () { return Number(this) > 0; }, enumerable: false },
  toDecimalPlaces: { value: function (dp = 0) { const f = 10 ** dp; return new EdgeDecimal(Math.round((Number(this) + Number.EPSILON) * f) / f); }, enumerable: false },
});

export type Tx = EdgePrismaService;

export class EdgeDecimal {
  static ROUND_UP = 0;
  static ROUND_DOWN = 1;
  static ROUND_CEIL = 2;
  static ROUND_FLOOR = 3;
  static ROUND_HALF_UP = 4;
  static ROUND_HALF_DOWN = 5;
  static ROUND_HALF_EVEN = 6;

  private val: number;

  constructor(v: number | string | EdgeDecimal | null | undefined) {
    if (v instanceof EdgeDecimal) {
      this.val = v.val;
    } else if (v === null || v === undefined || v === '') {
      this.val = 0;
    } else {
      const n = Number(v);
      this.val = Number.isFinite(n) ? n : 0;
    }
  }

  static isDecimal(v: unknown): boolean {
    return v instanceof EdgeDecimal;
  }

  static max(...args: (number | string | EdgeDecimal)[]): EdgeDecimal {
    return new EdgeDecimal(Math.max(...args.map((a) => new EdgeDecimal(a).val)));
  }

  static min(...args: (number | string | EdgeDecimal)[]): EdgeDecimal {
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
}

export const Prisma = {
  TransactionIsolationLevel: {
    RepeatableRead: 'RepeatableRead',
  },
  Decimal: EdgeDecimal,
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    sql: Array.isArray(strings) ? strings.join(' ? ') : String(strings),
    values,
  }),
  empty: { sql: '', values: [] },
  join: (values: unknown[], sep = ',') => ({ sql: values.map(() => '?').join(sep), values }),
  raw: (s: string) => ({ sql: s, values: [] }),
};

export class PrismaService extends EdgePrismaService {}

export function createStandalonePrisma() {
  return new EdgePrismaService();
}
