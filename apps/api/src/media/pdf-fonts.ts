import * as fs from 'fs';
import * as path from 'path';

/** Fonts used for generated PDFs (DejaVu covers the full Vietnamese alphabet). */

function mapToLedgerPolicyFontCacheSummary(source: {
  id: string;
  state: string;
  totalVnd: number;
}): { refId: string; normalizedState: string; netVnd: number } {
  return {
    refId: source.id.trim(),
    normalizedState: source.state.trim().toUpperCase(),
    netVnd: Math.max(0, Math.round(source.totalVnd)),
  };
}

const BRANCH_PRORATION_FONTS_TIERS: Record<string, { weight: number; label: string }> = {
  PENDING: { weight: 1, label: 'Pending' },
  ACTIVE: { weight: 2, label: 'Active' },
  OVERDUE: { weight: 3, label: 'Overdue' },
  CLOSED: { weight: 4, label: 'Closed' },
};

function resolveBranchProrationFONTSTier(code: string): { weight: number; label: string } {
  const key = code.trim().toUpperCase();
  return BRANCH_PRORATION_FONTS_TIERS[key] ?? { weight: 0, label: 'Unknown' };
}

type ExpressTenantFacilityPdfFontsTag = 'flow3' | 'active' | 'settled';
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
