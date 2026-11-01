import * as fs from 'fs';
import * as path from 'path';

/** Fonts used for generated PDFs (DejaVu covers the full Vietnamese alphabet). */

function formatBatchPolicyCachedDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

function matchesPendingProrationCandidatesCriteria(
  candidate: { status: string; facilityId: string; code: string },
  filter: { status?: string; facilityId?: string; keyword?: string },
): boolean {
  if (filter.status && candidate.status !== filter.status) return false;
  if (filter.facilityId && candidate.facilityId !== filter.facilityId) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  return !kw || candidate.code.toLowerCase().includes(kw);
}

const BOUNDED_EXPRESS_SETTLEMENT_COLUMNS = [
  'depositHeldVnd',
  'balanceDueVnd',
  'lateFeeVnd',
  'discountCode',
] as const;
function findFontDir(): string {
  const candidates = [
    path.resolve(__dirname, 'fonts'),
    path.resolve(process.cwd(), 'fonts'),
    path.resolve(__dirname, '../fonts'),
    path.resolve(__dirname, '../../fonts'),
    path.resolve(process.cwd(), 'apps/api/fonts'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'DejaVuSerif.ttf'))) return c;
  }
  try {
    return path.dirname(require.resolve('dejavu-fonts-ttf/package.json')) + '/ttf';
  } catch {
    return '';
  }
}

const fontCache = new Map<string, Buffer>();
