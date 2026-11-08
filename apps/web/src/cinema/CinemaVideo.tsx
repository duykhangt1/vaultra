import * as React from 'react';
import { cn } from '@/ui';
import { prefersReduced, saveData, useCinema } from './motion';
import { trackImage, trackVideo } from './preload';

export interface VideoSource { webm: string; mobile?: string; poster: string; posterSm?: string; /** no lightweight encode: phones get the poster only */ desktopOnly?: boolean }

/**
 * Cinematic background video. Poster first (no layout shift), video attached only near the viewport,
 * played muted + looped, paused off-screen, when the user pauses motion, with reduced motion or
 * Data Saver. Mobile gets the 360p encode. Fails silently back to the poster.
 */
export function CinemaVideo({ src, className, priority, brightness = 1, contrast = 1, saturate = 1, label }: { src: VideoSource; className?: string; priority?: boolean; brightness?: number; contrast?: number; saturate?: number; label?: string }) {
  const box = React.useRef<HTMLDivElement>(null);
  const vid = React.useRef<HTMLVideoElement>(null);
  const tracked = React.useRef(false);
  const paused = useCinema((s) => s.paused);
  const [near, setNear] = React.useState(!!priority);
  const [playing, setPlaying] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const mobile = React.useMemo(() => typeof window !== 'undefined' && window.innerWidth < 768, []);
  const [allowed] = React.useState(() => !prefersReduced() && !saveData() && !(mobile && src.desktopOnly));
  const file = mobile && src.mobile ? src.mobile : src.webm;
  const poster = mobile && src.posterSm ? src.posterSm : src.poster;

  // priority posters count towards the intro progress
  React.useEffect(() => { if (priority) void trackImage(poster); }, [priority, poster]);

  React.useEffect(() => {
    const el = box.current; if (!el || !('IntersectionObserver' in window)) { setNear(true); return; }
    const io = new IntersectionObserver(([e]) => setNear(e.isIntersecting), { rootMargin: '35% 0px' });
    io.observe(el); return () => io.disconnect();
  }, []);

  const attached = allowed && !failed && (near || priority);
  React.useEffect(() => {
    const v = vid.current; if (!v || !attached) return;
    if (priority && !tracked.current) { tracked.current = true; void trackVideo(v); }
    if (near && !paused) { const p = v.play(); if (p) p.catch(() => setPlaying(false)); }
    else v.pause();
  }, [attached, near, paused, priority]);

  return (
    <div ref={box} className={cn('absolute inset-0 overflow-hidden', className)} aria-hidden={!label} role={label ? 'img' : undefined} aria-label={label}>
      <img src={poster} alt="" className="absolute inset-0 size-full object-cover" {...({ fetchpriority: priority ? 'high' : 'auto' } as object)} loading={priority ? 'eager' : 'lazy'} decoding="async" style={{ filter: `brightness(${brightness}) contrast(${contrast}) saturate(${saturate})` }} />
      {attached && (
        <video
          ref={vid}
          className={cn('absolute inset-0 size-full object-cover transition-opacity duration-[1200ms] ease-out', playing ? 'opacity-100' : 'opacity-0')}
          style={{ filter: `brightness(${brightness}) contrast(${contrast}) saturate(${saturate})` }}
          muted
          loop
          playsInline
          autoPlay={!paused}
          preload={priority ? 'auto' : 'metadata'}
          poster={poster}
          onPlaying={() => setPlaying(true)}
          onError={() => setFailed(true)}
          disablePictureInPicture
          disableRemotePlayback
        >
          <source src={file} type="video/webm" onError={() => setFailed(true)} />
        </video>
      )}
    </div>
  );
}
