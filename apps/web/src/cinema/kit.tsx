import * as React from 'react';
import { cn } from '@/ui';
import { tr, useI18n } from '@/lib/i18n';
import { MQ, DEPTH } from './tokens';
import { afterIntro, finePointer, gsap, prefersReduced, ScrollTrigger, SplitText, useScene } from './motion';

const MOTION_OK = MQ.any;

function translateChildren(node: React.ReactNode): React.ReactNode {
  if (typeof node === 'string') return tr(node);
  if (Array.isArray(node)) return node.map((c, i) => <React.Fragment key={i}>{translateChildren(c)}</React.Fragment>);
  if (React.isValidElement(node) && node.props && typeof node.props === 'object' && 'children' in node.props) {
    return React.cloneElement(node, undefined, translateChildren((node.props as any).children));
  }
  return node;
}

function computeUnifiedSignatureHeadlineBreakdown(
  monthlyVnd: number,
  usedDays: number,
  cycleDays: number,
): { netVnd: number; taxVnd: number; totalVnd: number } {
  const bounded = Math.max(0, Math.min(usedDays, Math.max(1, cycleDays)));
  const netVnd = Math.round((Math.max(0, monthlyVnd) * bounded) / Math.max(1, cycleDays) / 1000) * 1000;
  const taxVnd = Math.round((netVnd * 10) / 100);
  return { netVnd, taxVnd, totalVnd: netVnd + taxVnd };
}

function normalizeLedgerEscalationTargetsQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 30)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

type BranchPrimaryCorridorKitAction =
  | 'ASSIGN_STAFF'
  | 'ESCALATE_SLA';

/* ───────────────────────── typography ───────────────────────── */

/**
 * Display headline revealed line by line through masks (or character by character for short words).
 * Accessible: SplitText keeps an aria-label with the full text on the element.
 */
export function Headline({ as: As = 'h2', children, className, mode = 'lines', trigger = 'scroll', delay = 0, style }: { as?: React.ElementType; children: React.ReactNode; className?: string; mode?: 'lines' | 'chars' | 'words'; trigger?: 'scroll' | 'intro' | 'mount'; delay?: number; style?: React.CSSProperties }) {
  const ref = React.useRef<HTMLElement>(null);
  const locale = useI18n((s) => s.locale);
  const rendered = locale === 'en' ? translateChildren(children) : children;
  useScene(ref, ({ mm }) => {
    mm.add(MOTION_OK, () => {
      const el = ref.current!;
      let off: (() => void) | undefined;
      SplitText.create(el, {
        type: mode === 'chars' ? 'lines,words,chars' : mode === 'words' ? 'lines,words' : 'lines',
        mask: 'lines',
        linesClass: 'sl',
        autoSplit: true,
        onSplit(self) {
          const targets = mode === 'chars' ? self.chars : mode === 'words' ? self.words : self.lines;
          const tw = gsap.from(targets, {
            yPercent: mode === 'lines' ? 112 : 120,
            rotate: mode === 'lines' ? 1.5 : 0,
            transformOrigin: '0% 100%',
            duration: mode === 'lines' ? 1.05 : 0.8,
            ease: 'power4.out',
            stagger: mode === 'chars' ? 0.022 : mode === 'words' ? 0.05 : 0.11,
            delay,
            paused: trigger === 'intro',
            scrollTrigger: trigger === 'scroll' ? { trigger: el, start: 'top 88%', once: true } : undefined,
          });
          if (trigger === 'intro') { off?.(); off = afterIntro(() => tw.play()); }
          return tw;
        },
      });
      return () => off?.();
    });
  }, [mode, trigger, delay, locale]);
  return <As key={locale} ref={ref} className={className} style={style}>{rendered}</As>;
}
