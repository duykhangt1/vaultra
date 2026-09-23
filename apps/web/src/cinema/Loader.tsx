import * as React from 'react';
import { gsap, prefersReduced } from './motion';
import { onProgress, track } from './preload';
import BoxStage from './BoxStage';
import { initialBoxState, type BoxState } from './boxState';

import { SEEN, wantsIntro, markIntroDone } from './intro';
const CAP_MS = 3200; // never hold the page longer than this; late assets keep loading underneath
const MIN_SHOW_MS = 720; // brief enough to feel snappy, long enough to read the carton
