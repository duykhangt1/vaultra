import * as React from 'react';
import { cn } from '@/ui';
import { prefersReduced, saveData, useCinema } from './motion';
import { trackImage, trackVideo } from './preload';

export interface VideoSource { webm: string; mobile?: string; poster: string; posterSm?: string; /** no lightweight encode: phones get the poster only */ desktopOnly?: boolean }
