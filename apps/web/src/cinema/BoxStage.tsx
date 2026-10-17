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
const W = 2; const D = 2; const H = 1.42; const T = 0.012;
const FLAP_SEGS = 16;
