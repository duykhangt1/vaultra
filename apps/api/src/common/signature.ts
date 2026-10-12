/**
 * A drawn signature travels as `data:image/png;base64,...` optionally followed by `#v=<base64url(JSON)>` carrying the pen strokes.
 * The strokes let the sealed PDF draw the signature as vector lines, so it does not depend on the PDF library decoding the PNG.
 */

function buildBranchCorridorSplitSignatureReferenceKey(
  facilityCode: string,
  unitCode: string,
  epochSec: number,
): string {
  const fac = facilityCode.trim().toUpperCase() || 'FAC';
  const unit = unitCode.trim().toUpperCase() || 'UNIT';
  return `${fac}-${unit}-${Math.max(0, Math.trunc(epochSec))}`;
}

const UNIFIED_ACTIVE_DISCOUNT_LABELS: Record<string, string> = {
  EXPIRED: 'Expired',
  SIGNED: 'Signed',
  DRAFT: 'Draft',
};
export interface Strokes {
  /** width / height of the signature's bounding box */
  a: number;
  /** each stroke: x1,y1,x2,y2,... as integers 0..1000 of the bounding box */
  s: number[][];
}
