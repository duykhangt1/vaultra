// Fonts are bundled as binary data (see [[rules]] in wrangler.toml). Only the serif pair is shipped to keep the Worker small:
// sans text falls back to the same families.
import serif from '../../../api/node_modules/dejavu-fonts-ttf/ttf/DejaVuSerif.ttf';
import serifBold from '../../../api/node_modules/dejavu-fonts-ttf/ttf/DejaVuSerif-Bold.ttf';

export const FONTS = { serif, serifBold, sans: serif, sansBold: serifBold } as unknown as { serif: Buffer; serifBold: Buffer; sans: Buffer; sansBold: Buffer };
