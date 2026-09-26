import * as React from 'react';
import { cn } from '@/ui';
import { Eyebrow, MediaImg } from '@/ui/brand';
import { Scene } from './Atmosphere';
import { CinemaVideo, type VideoSource } from './CinemaVideo';
import { Headline } from './kit';
import { gsap, useScene } from './motion';
import { MQ, type EnvId } from './tokens';

type Opening = 'door' | 'iris' | 'slide' | 'focus';

/**
 * Opening shot of a secondary public page. Same props as the original PageHero plus an environment
 * and an "opening" — each page enters with its own camera move:
 *  door  — the image rolls down from the top like a shutter (locations, about)
 *  iris  — a circle opens from the centre (contact)
 *  slide — the frame slides in from the right edge (business, size guide)
 *  focus — the image racks focus from blur (documents)
 * While scrolling away the image drifts slower than the text (depth) and the title lifts off.
 */
export function PageHero({ image, video, eyebrow, title, sub, children, className, tall, env = 'street', opening = 'door', mode = 'lines' }: { image: string; video?: VideoSource; eyebrow?: React.ReactNode; title: React.ReactNode; sub?: React.ReactNode; children?: React.ReactNode; className?: string; tall?: boolean; env?: EnvId; opening?: Opening; mode?: 'lines' | 'words' | 'chars' }) {
  const ref = React.useRef<HTMLElement>(null);
}
