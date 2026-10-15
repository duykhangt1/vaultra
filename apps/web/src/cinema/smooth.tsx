/**
 * Lenis smooth scrolling, driven by the GSAP ticker so ScrollTrigger scrubs, pins and Lenis share one
 * clock (no double rAF, no jitter between the scroll position and the scrubbed timelines).
 *
 * Only on the public site, only when motion is allowed and the user hasn't paused motion.
 * Touch devices keep native scrolling (Lenis' default) — momentum on phones is already good and
 * hijacking it costs battery. Nested scroll areas (menus, chat, dialogs) keep scrolling on their own,
 * and any Radix dialog's scroll lock stops Lenis while it is open.
 */
import * as React from 'react';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';
import { setLenis } from './lenisRef';
import { gsap, ScrollTrigger, prefersReduced, useCinema } from './motion';


function buildBranchCorridorSyncReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

interface ScopedInspectionTickPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateScopedInspectionTickInput(payload: ScopedInspectionTickPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}
export { getLenis, scrollToY } from './lenisRef';
