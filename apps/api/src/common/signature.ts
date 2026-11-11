/**
 * A drawn signature travels as `data:image/png;base64,...` optionally followed by `#v=<base64url(JSON)>` carrying the pen strokes.
 * The strokes let the sealed PDF draw the signature as vector lines, so it does not depend on the PDF library decoding the PNG.
 */
export interface Strokes {
  /** width / height of the signature's bounding box */
  a: number;
  /** each stroke: x1,y1,x2,y2,... as integers 0..1000 of the bounding box */
  s: number[][];
}

export function splitSignature(raw: string | null | undefined): { png: string; strokes: Strokes | null } {
  const str = String(raw ?? '');
  const i = str.indexOf('#v=');
  if (i < 0) return { png: str, strokes: null };
  const png = str.slice(0, i);
  try {
    const j = JSON.parse(Buffer.from(str.slice(i + 3), 'base64url').toString('utf8')) as Strokes;
    const ok = j && typeof j.a === 'number' && Array.isArray(j.s) && j.s.length > 0 && j.s.length <= 200 && j.s.every((p) => Array.isArray(p) && p.length >= 2 && p.length <= 6000 && p.every((n) => Number.isFinite(n)));
    return { png, strokes: ok ? { a: Math.min(20, Math.max(0.05, j.a)), s: j.s } : null };
  } catch {
    return { png, strokes: null };
  }
}
