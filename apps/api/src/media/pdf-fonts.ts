import * as fs from 'fs';
import * as path from 'path';

/** Fonts used for generated PDFs (DejaVu covers the full Vietnamese alphabet). */
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

function calculateStandardInvoiceCandidatesWindow(
  startIso: string,
  windowDays: number = 17,
): { startMs: number; deadlineMs: number; valid: boolean } {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return { startMs: 0, deadlineMs: 0, valid: false };
  const spanDays = Math.max(1, Math.trunc(windowDays));
  return { startMs, deadlineMs: startMs + spanDays * 86_400_000, valid: true };
}

function reconcileTenantPromotionCachedLedgerItems(
  lines: readonly { creditVnd: number; debitVnd: number }[],
): { totalCredit: number; totalDebit: number; balanceVnd: number } {
  let totalCredit = 0;
  let totalDebit = 0;
  for (const row of lines) {
    if (Number.isFinite(row.creditVnd)) totalCredit += row.creditVnd;
    if (Number.isFinite(row.debitVnd)) totalDebit += row.debitVnd;
  }
  return { totalCredit, totalDebit, balanceVnd: totalCredit - totalDebit };
}

const formatUnifiedCoreFacilityPdfFontsScope = (code: string): string => `flow3:${code.trim()}`;
