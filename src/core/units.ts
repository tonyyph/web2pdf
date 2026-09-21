/**
 * Unit conversion helpers.
 *
 * Chrome DevTools Protocol's `Page.printToPDF` expresses every dimension in
 * INCHES, while the UI speaks millimetres for ISO paper and inches for US
 * paper. All conversion goes through this module so the rounding behaviour is
 * consistent and testable.
 */

/** Exact, by international definition since 1959. */
export const MM_PER_INCH = 25.4;

/** CSS reference pixel: 96 per inch (CSS Values & Units Level 4). */
export const CSS_PX_PER_INCH = 96;

/** CDP dimensions beyond this are rejected by Chrome as unreasonable. */
export const MAX_PAPER_INCHES = 200;
export const MIN_PAPER_INCHES = 0.1;

function round(value: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function mmToInches(mm: number): number {
  return round(mm / MM_PER_INCH);
}

export function inchesToMm(inches: number): number {
  return round(inches * MM_PER_INCH);
}

export function pxToInches(px: number): number {
  return round(px / CSS_PX_PER_INCH);
}

export function inchesToPx(inches: number): number {
  return round(inches * CSS_PX_PER_INCH);
}

export function mmToPx(mm: number): number {
  return round(inchesToPx(mmToInches(mm)));
}

export function pxToMm(px: number): number {
  return round(inchesToMm(pxToInches(px)));
}

export type LengthUnit = 'mm' | 'in' | 'px';

/** Normalise any supported unit to the inches that CDP expects. */
export function toInches(value: number, unit: LengthUnit): number {
  switch (unit) {
    case 'mm':
      return mmToInches(value);
    case 'px':
      return pxToInches(value);
    case 'in':
      return round(value);
  }
}

/** Clamp a value into [min, max]; NaN collapses to `min`. */
export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}
