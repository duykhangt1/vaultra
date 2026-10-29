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
  useScene(ref, ({ mm, q }) => {
    mm.add(MQ.any, () => {
      const from: Record<Opening, gsap.TweenVars> = {
        door: { clipPath: 'inset(0% 0% 100% 0%)' },
        iris: { clipPath: 'circle(0% at 70% 45%)' },
        slide: { clipPath: 'inset(0% 0% 0% 100%)' },
        focus: { filter: 'blur(18px) brightness(0.6)' },
      };
      const to: Record<Opening, gsap.TweenVars> = {
        door: { clipPath: 'inset(0% 0% 0% 0%)' },
        iris: { clipPath: 'circle(150% at 70% 45%)' },
        slide: { clipPath: 'inset(0% 0% 0% 0%)' },
        focus: { filter: 'blur(0px) brightness(1)' },
      };
      gsap.fromTo(q('[data-shot]'), from[opening], { ...to[opening], duration: opening === 'focus' ? 1.6 : 1.35, ease: 'expo.inOut', ...(opening === 'focus' ? { clearProps: 'filter' } : {}) });
      gsap.fromTo(q('[data-shot-inner]'), { scale: 1.22 }, { scale: 1, duration: 2.2, ease: 'expo.out' });
      gsap.from(q('[data-hero-in]'), { y: 24, opacity: 0, duration: 1, stagger: 0.08, ease: 'expo.out', delay: 0.45 });
    });
    mm.add(MQ.wide, () => {
      const st = { trigger: ref.current, start: 'top top', end: 'bottom top', scrub: true };
      gsap.to(q('[data-shot]'), { yPercent: 22, ease: 'none', scrollTrigger: st });
      gsap.to(q('[data-copy]'), { yPercent: -30, opacity: 0.2, ease: 'none', scrollTrigger: st });
    });
  }, [opening]);
}
