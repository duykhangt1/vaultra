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

try {
  Object.defineProperty(GeneratedPrisma, 'Decimal', {
    value: EdgeDecimal,
    writable: true,
    configurable: true,
  });
} catch {
  // ignore if namespace is frozen
}

export const Prisma = {
  TransactionIsolationLevel: {
    RepeatableRead: 'RepeatableRead',
  },
  Decimal: EdgeDecimal,
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    sql: Array.isArray(strings) ? strings.join(' ? ') : String(strings),
    strings: Array.isArray(strings) ? Array.from(strings) : [String(strings)],
    values,
  }),
  empty: { sql: '', strings: [''], values: [] },
  join: (values: unknown[], sep = ',') => ({ sql: values.map(() => '?').join(sep), strings: values.map(() => ''), values }),
  raw: (s: string) => ({ sql: s, strings: [s], values: [] }),
} as unknown as typeof PrismaNamespace;

export type Tx = PrismaNamespace.TransactionClient;

const R2_STATE_KEY = '_db/vaultra-diff-v1.json';
const BaseEngine = EdgePrismaService as unknown as typeof PrismaClientType;

@Injectable()
export class PrismaService extends BaseEngine implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('R2Database');
  private s3: S3Client | null = null;
  private r2Bucket = config.storage.r2PublicBucket || 'vaultra';
  private cacheFile = path.resolve(config.storage.localDir, 'r2-db-backup.json');
  private syncTimer: ReturnType<typeof setTimeout> | null = null;
  private rtTimer: ReturnType<typeof setTimeout> | null = null;
  private syncing = false;
  private syncPending = false;
  private isLoaded = false;
  private loadPromise: Promise<void> | null = null;
  public lastSyncedAt: Date | null = null;
  public onRealtimeMutate?: () => void;

  constructor() {
    super(undefined as any);
    if (config.storage.r2AccountId && config.storage.r2AccessKeyId && config.storage.r2SecretAccessKey) {
      this.s3 = new S3Client({
        region: 'auto',
        endpoint: `https://${config.storage.r2AccountId}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: config.storage.r2AccessKeyId,
          secretAccessKey: config.storage.r2SecretAccessKey,
        },
      });
    }
    const self = this as unknown as EdgePrismaService;
    self.onMutate = () => this.scheduleSync();
  }

  async onModuleInit() {
    await this.ensureLoaded();
  }

  async ensureLoaded(): Promise<void> {
    if (this.isLoaded) return;
    if (!this.loadPromise) {
      this.loadPromise = this.loadFromR2();
    }
    await this.loadPromise;
  }

  async loadFromR2() {
    const self = this as unknown as EdgePrismaService;
    const t0 = Date.now();
    let r2Parsed: Record<string, any[]> | null = null;
    let r2Raw: string | null = null;

    if (this.s3) {
      try {
        const res = await this.s3.send(new GetObjectCommand({ Bucket: this.r2Bucket, Key: R2_STATE_KEY }));
        const raw = await res.Body?.transformToString();
        if (raw) {
          r2Parsed = JSON.parse(raw);
          r2Raw = raw;
        }
      } catch (e: any) {
        this.logger.warn(`Could not fetch R2 snapshot (${e?.message ?? e}), checking local backup...`);
      }
    }

    let localParsed: Record<string, any[]> | null = null;
    if (fs.existsSync(this.cacheFile)) {
      try {
        const raw = fs.readFileSync(this.cacheFile, 'utf8');
        localParsed = JSON.parse(raw);
      } catch (e: any) {
        this.logger.error(`Failed to parse local backup: ${e?.message ?? e}`);
      }
    }

    const r2Contracts = (r2Parsed?.contract ?? []).length;
    const localContracts = (localParsed?.contract ?? []).length;
    const r2Tables = r2Parsed ? Object.keys(r2Parsed).length : 0;
    const localTables = localParsed ? Object.keys(localParsed).length : 0;

    if (localParsed && (!r2Parsed || localContracts > r2Contracts || localTables > r2Tables)) {
      self.loadSnapshot(localParsed);
      this.isLoaded = true;
      this.logger.log(`Loaded fuller database snapshot from local backup ${this.cacheFile} (${localTables} tables, ${localContracts} contracts)`);
      this.scheduleSync();
    } else if (r2Parsed && r2Raw) {
      self.loadSnapshot(r2Parsed);
      this.isLoaded = true;
      this.lastSyncedAt = new Date();
      fs.mkdirSync(path.dirname(this.cacheFile), { recursive: true });
      fs.writeFileSync(this.cacheFile, r2Raw, 'utf8');
      this.logger.log(`Loaded R2 database snapshot (${(r2Raw.length / 1024 / 1024).toFixed(2)} MB, ${r2Tables} tables) from ${this.r2Bucket}/${R2_STATE_KEY} in ${Date.now() - t0}ms`);
    } else {
      this.isLoaded = true;
    }

    if (self.repairIntegrity()) {
      this.scheduleSync();
    }
  }

  private scheduleSync() {
    if (!this.rtTimer) {
      this.rtTimer = setTimeout(() => {
        this.rtTimer = null;
        try {
          this.onRealtimeMutate?.();
        } catch {
          // ignore
        }
      }, 100);
    }

    this.syncPending = true;
    if (!this.isLoaded) return;
    if (this.syncTimer) clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => {
      this.syncTimer = null;
      void this.flushToR2();
    }, 350);
  }

  async flushToR2(): Promise<void> {
    if (!this.isLoaded) return;
    if (!this.syncPending) return;
    if (this.syncing) return;
    this.syncing = true;
    this.syncPending = false;

    try {
      const self = this as unknown as EdgePrismaService;
      const payload = self.exportSnapshot();
      try {
        fs.mkdirSync(path.dirname(this.cacheFile), { recursive: true });
        const tmp = `${this.cacheFile}.tmp`;
        fs.writeFileSync(tmp, payload, 'utf8');
        fs.renameSync(tmp, this.cacheFile);
      } catch {
        // ignore local cache write error
      }
      if (this.s3) {
        await this.s3.send(
          new PutObjectCommand({
            Bucket: this.r2Bucket,
            Key: R2_STATE_KEY,
            Body: payload,
            ContentType: 'application/json',
          }),
        );
        this.lastSyncedAt = new Date();
      }
    } catch (e: any) {
      this.logger.error(`R2 snapshot sync failed: ${e?.message ?? e}`);
    } finally {
      this.syncing = false;
      if (this.syncPending) {
        void this.flushToR2();
      }
    }
  }

  async onModuleDestroy() {
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
      this.syncTimer = null;
    }
    await this.flushToR2();
  }

  tx<T>(fn: (tx: Tx) => Promise<T>, timeout = 20000): Promise<T> {
    return EdgePrismaService.prototype.tx.call(this, fn as any, timeout) as Promise<T>;
  }
}

export function createStandalonePrisma() {
  return new PrismaService();
}
