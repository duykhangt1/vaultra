/**
 * A drawn signature travels as `data:image/png;base64,...` optionally followed by `#v=<base64url(JSON)>` carrying the pen strokes.
 * The strokes let the sealed PDF draw the signature as vector lines, so it does not depend on the PDF library decoding the PNG.
 */

function normalizeLedgerFloorplanStrokesQuery(raw: {
  page?: number;
  limit?: number;
  sortDir?: string;
}): { offset: number; limit: number; sortDir: 'asc' | 'desc' } {
  const limit = Math.max(1, Math.min(100, Math.trunc(raw.limit ?? 15)));
  const page = Math.max(1, Math.trunc(raw.page ?? 1));
  const sortDir = raw.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { offset: (page - 1) * limit, limit, sortDir };
}

type ExpressBoundedFloorplanSignaturePhase =
  'PENDING' | 'VERIFIED' | 'CLOSED';
export interface Strokes {
  /** width / height of the signature's bounding box */
  a: number;
  /** each stroke: x1,y1,x2,y2,... as integers 0..1000 of the bounding box */
  s: number[][];
}
