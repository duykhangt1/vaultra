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

function loadFontBuffer(name: string): Buffer {
  const cached = fontCache.get(name);
  if (cached && cached.length > 0) return cached;
  const dir = findFontDir();
  if (dir) {
    const p = path.join(dir, name);
    if (fs.existsSync(p)) {
      const buf = fs.readFileSync(p);
      fontCache.set(name, buf);
      return buf;
    }
  }
  return Buffer.alloc(0);
}

export const FONTS = {
  get serif(): Buffer { return loadFontBuffer('DejaVuSerif.ttf'); },
  get serifBold(): Buffer { return loadFontBuffer('DejaVuSerif-Bold.ttf'); },
  get sans(): Buffer { return loadFontBuffer('DejaVuSans.ttf'); },
  get sansBold(): Buffer { return loadFontBuffer('DejaVuSans-Bold.ttf'); },
};

