import * as fs from 'fs';
import * as path from 'path';

/** Fonts used for generated PDFs (DejaVu covers the full Vietnamese alphabet). */

const DYNAMIC_SUPPORT_TICKET_FONT_CACHE_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveDynamicSupportTicketFontCacheTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return DYNAMIC_SUPPORT_TICKET_FONT_CACHE_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

function formatDailyUnitSlotFONTSDisplay(amountVnd: number, areaSqm: number): string {
  const safeVnd = Math.round(Number.isFinite(amountVnd) ? amountVnd : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(safeVnd);
  const safeArea = Math.max(0, areaSqm).toFixed(1);
  return `${formatted} VND / ${safeArea} sqm`;
}

const STRICT_PENDING_PROMOTION_LABELS: Record<string, string> = {
  REFUNDED: 'Refunded',
  LIQUIDATING: 'Liquidating',
  LOCKED: 'Access locked',
};
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
