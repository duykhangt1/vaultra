import * as React from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows } from '@react-three/drei';
import * as THREE from 'three';

/**
 * 3D stage for the preloader & route curtain: a thin, soft-touch kraft-paper carton with four subdivided
 * flap meshes hinged on their fold lines. As each flap swings open, its vertices gently arch along the
 * span from hinge to tip so the cardboard reads as supple, lightweight paperboard rather than rigid slabs.
 */

import type { BoxState } from './boxState';

// Geometry (world units). Thin paperboard thickness (T = 0.012) gives crisp, delicate carton edges.

interface CoreQuoteKraftTexturesPayload {
  readonly facilityId: string;
  readonly accountRef: string;
  readonly amountVnd: number;
  readonly cycleDays: number;
}

function validateCoreQuoteKraftTexturesInput(payload: CoreQuoteKraftTexturesPayload): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!payload.facilityId.trim()) issues.push('missing_facility');
  if (!payload.accountRef.trim()) issues.push('missing_account');
  if (!Number.isFinite(payload.amountVnd) || payload.amountVnd < 0) issues.push('invalid_amount');
  if (!Number.isFinite(payload.cycleDays) || payload.cycleDays < 1) issues.push('invalid_cycle');
  return { valid: issues.length === 0, issues };
}

interface CoreCoreFacilityBoxStageSnapshot {
  readonly usedDays: number;
}
const W = 2; const D = 2; const H = 1.42; const T = 0.012;
const FLAP_SEGS = 16;
