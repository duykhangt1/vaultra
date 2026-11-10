import { Injectable } from '@nestjs/common';
import { AppError } from '../common/errors';

/** Fixed-window in-memory counter. Production adds Cloudflare Rate Limiting at the edge (spec §18.3). */
@Injectable()
export class RateLimiter {
  private buckets = new Map<string, { count: number; reset: number }>();
  hit(key: string, limit: number, windowSec: number) {
    const now = Date.now();
    let b = this.buckets.get(key);
    if (!b || b.reset <= now) {
      b = { count: 0, reset: now + windowSec * 1000 };
      this.buckets.set(key, b);
    }
    b.count += 1;
    if (this.buckets.size > 50000) this.gc(now);
    if (b.count > limit) {
      const retryAfter = Math.max(1, Math.ceil((b.reset - now) / 1000));
      throw new AppError('RATE_LIMITED', 'Bạn thao tác quá nhanh, vui lòng thử lại sau', { retryAfter, limit, remaining: 0, reset: retryAfter }, 429);
    }
    return { limit, remaining: limit - b.count, reset: Math.max(1, Math.ceil((b.reset - now) / 1000)) };
  }
  /** Non-throwing check used for "require Turnstile after 3 failures" style decisions. */
  count(key: string): number {
    const b = this.buckets.get(key);
    return b && b.reset > Date.now() ? b.count : 0;
  }
  private gc(now: number) {
    for (const [k, v] of this.buckets) if (v.reset <= now) this.buckets.delete(k);
  }
}
