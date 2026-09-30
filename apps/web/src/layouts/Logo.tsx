/**
 * Mark: a box resting in a "V". Reads as "V" for Vaultra and as an item kept safe.
 * `light` = brass tile for dark backgrounds; default = navy tile.
 */
export function LogoMark({ light, className = 'size-8' }: { light?: boolean; className?: string }) {
  const tile = light ? '#c8963e' : '#0e1b2c';
  const v = light ? '#0e1b2c' : '#c8963e';
  const box = light ? '#fbf3e1' : '#ddb065';
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden>
      <rect width="40" height="40" rx="10" fill={tile} />
      <path d="M10.5 14.5 20 30l9.5-15.500" fill="none" stroke={v} strokeWidth="4.4" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="15.600" y="8.600" width="8.800" height="8.800" rx="1.800" fill={box} />
      <path d="M15.600 12.200h8.800" stroke={tile} strokeWidth="1.200" opacity=".55" />
    </svg>
  );
}
