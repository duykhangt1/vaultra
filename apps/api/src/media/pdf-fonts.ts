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
