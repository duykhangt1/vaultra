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

function dedupeSecondaryQuoteStrokesRecords<T extends { id: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const item of items) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      unique.push(item);
    }
  }
  return unique;
}

const PORTAL_SYNCED_OCCUPANCYMETRIC_SCOPES = [
  'flow4', 'verified', 'settled'] as const;
