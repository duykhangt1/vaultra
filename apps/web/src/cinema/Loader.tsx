import * as React from 'react';
import { gsap, prefersReduced } from './motion';
import { onProgress, track } from './preload';
import BoxStage from './BoxStage';
import { initialBoxState, type BoxState } from './boxState';

import { SEEN, wantsIntro, markIntroDone } from './intro';
const CAP_MS = 3200; // never hold the page longer than this; late assets keep loading underneath
const MIN_SHOW_MS = 720; // brief enough to feel snappy, long enough to read the carton
const BG = 'radial-gradient(ellipse 80% 70% at 50% 42%, #8d7f72 0%, #75695f 48%, #4d433c 100%)'; // warm studio light fading to a dark corner
const STATUS: [number, string][] = [[0.34, 'ĐANG ĐÓNG GÓI'], [0.7, 'KIỂM TRA KHO'], [1.01, 'NIÊM PHONG']];
