import { Injectable } from '@nestjs/common';

/**
 * Injectable clock (spec §19.1 "Thời gian — đồng hồ giả"). In non-production the offset can be
 * moved via POST /v1/internal/clock (service token) to exercise time-based flows (hold expiry,
 * overdue chain D+1…D+45, renewal reminders T−30…T−1).
 */
@Injectable()
export class ClockService {
  private offsetMs = 0;
  now(): Date {
    return new Date(Date.now() + this.offsetMs);
  }
  setOffset(ms: number) {
    this.offsetMs = ms;
  }
  getOffset() {
    return this.offsetMs;
  }
}
