import { describe, expect, it } from 'vitest';
import {
  clamp,
  CSS_PX_PER_INCH,
  inchesToMm,
  inchesToPx,
  MM_PER_INCH,
  mmToInches,
  mmToPx,
  pxToInches,
  pxToMm,
  toInches,
} from '@/core/units';
import { MARGIN_PRESETS_IN, MARGIN_PRESETS_MM, PAPER_SIZES } from '@/core/constants';

describe('unit conversion', () => {
  it('uses the exact inch definition', () => {
    expect(MM_PER_INCH).toBe(25.4);
    expect(CSS_PX_PER_INCH).toBe(96);
  });

  it('converts millimetres to inches', () => {
    expect(mmToInches(25.4)).toBe(1);
    expect(mmToInches(210)).toBeCloseTo(8.2677, 4);
    expect(mmToInches(0)).toBe(0);
  });

  it('converts inches to millimetres', () => {
    expect(inchesToMm(1)).toBe(25.4);
    expect(inchesToMm(8.5)).toBeCloseTo(215.9, 4);
  });

  it('round-trips mm to inches and back', () => {
    for (const mm of [10, 105, 210, 297, 420]) {
      expect(inchesToMm(mmToInches(mm))).toBeCloseTo(mm, 2);
    }
  });

  it('converts CSS pixels at 96 per inch', () => {
    expect(pxToInches(96)).toBe(1);
    expect(inchesToPx(1)).toBe(96);
    expect(mmToPx(25.4)).toBeCloseTo(96, 2);
    expect(pxToMm(96)).toBeCloseTo(25.4, 2);
  });

  it('normalises any unit through toInches', () => {
    expect(toInches(25.4, 'mm')).toBe(1);
    expect(toInches(96, 'px')).toBe(1);
    expect(toInches(2.5, 'in')).toBe(2.5);
  });

  it('clamps, collapsing NaN to the minimum', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
    expect(clamp(Number.NaN, 2, 10)).toBe(2);
    expect(clamp(Number.POSITIVE_INFINITY, 2, 10)).toBe(2);
  });
});

describe('paper sizes', () => {
  it('matches the ISO and US standards in inches', () => {
    expect(toInches(PAPER_SIZES.a4.width, 'mm')).toBeCloseTo(8.2677, 3);
    expect(toInches(PAPER_SIZES.a4.height, 'mm')).toBeCloseTo(11.6929, 3);
    expect(toInches(PAPER_SIZES.a3.width, 'mm')).toBeCloseTo(11.6929, 3);
    expect(toInches(PAPER_SIZES.letter.width, 'in')).toBe(8.5);
    expect(toInches(PAPER_SIZES.legal.height, 'in')).toBe(14);
  });

  it('keeps A3 exactly twice the area of A4', () => {
    const a4 = PAPER_SIZES.a4.width * PAPER_SIZES.a4.height;
    const a3 = PAPER_SIZES.a3.width * PAPER_SIZES.a3.height;
    expect(a3 / a4).toBeCloseTo(2, 1);
  });
});

describe('margin presets', () => {
  it('converts every preset to inches consistently', () => {
    expect(MARGIN_PRESETS_IN.none).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
    expect(MARGIN_PRESETS_IN.narrow.top).toBeCloseTo(0.25, 3);
    expect(MARGIN_PRESETS_IN.normal.top).toBeCloseTo(1, 3);
  });

  it('keeps mm and inch presets in agreement', () => {
    for (const preset of ['none', 'narrow', 'normal'] as const) {
      for (const side of ['top', 'right', 'bottom', 'left'] as const) {
        expect(MARGIN_PRESETS_IN[preset][side]).toBeCloseTo(
          mmToInches(MARGIN_PRESETS_MM[preset][side]),
          6,
        );
      }
    }
  });
});
