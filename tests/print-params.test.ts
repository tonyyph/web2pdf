import { describe, expect, it } from 'vitest';
import { buildPrintParams, resolveMarginsInches, resolvePaperInches } from '@/core/print-params';
import { cloneDefaultSettings } from '@/core/settings/defaults';
import type { Settings } from '@/core/settings/schema';
import { EMPTY_TEMPLATE } from '@/core/header-footer';

const CONTEXT = { title: 'Doc', url: 'https://example.com/a' };

function withSettings(patch: (settings: Settings) => void): Settings {
  const settings = cloneDefaultSettings();
  patch(settings);
  return settings;
}

describe('resolvePaperInches', () => {
  it('resolves the named sizes', () => {
    expect(resolvePaperInches(withSettings((s) => (s.page.paperSize = 'a4')))).toEqual({
      width: 8.2677,
      height: 11.6929,
    });
    expect(resolvePaperInches(withSettings((s) => (s.page.paperSize = 'letter')))).toEqual({
      width: 8.5,
      height: 11,
    });
    expect(resolvePaperInches(withSettings((s) => (s.page.paperSize = 'legal'))).height).toBe(14);
  });

  it('resolves custom paper from millimetres', () => {
    const settings = withSettings((s) => {
      s.page.paperSize = 'custom';
      s.page.customPaper = { widthMm: 100, heightMm: 150 };
    });
    const paper = resolvePaperInches(settings);
    expect(paper.width).toBeCloseTo(3.937, 3);
    expect(paper.height).toBeCloseTo(5.9055, 3);
  });
});

describe('resolveMarginsInches', () => {
  it('uses the presets', () => {
    expect(resolveMarginsInches(withSettings((s) => (s.page.marginPreset = 'none'))).top).toBe(0);
    expect(
      resolveMarginsInches(withSettings((s) => (s.page.marginPreset = 'normal'))).top,
    ).toBeCloseTo(1, 3);
  });

  it('converts custom margins from millimetres', () => {
    const settings = withSettings((s) => {
      s.page.marginPreset = 'custom';
      s.page.customMargins = { topMm: 25.4, rightMm: 12.7, bottomMm: 0, leftMm: 50.8 };
    });
    const margins = resolveMarginsInches(settings);
    expect(margins.top).toBeCloseTo(1, 4);
    expect(margins.right).toBeCloseTo(0.5, 4);
    expect(margins.bottom).toBe(0);
    expect(margins.left).toBeCloseTo(2, 4);
  });
});

describe('buildPrintParams', () => {
  it('produces the CDP payload for the defaults', () => {
    const params = buildPrintParams(cloneDefaultSettings(), CONTEXT);
    expect(params.landscape).toBe(false);
    expect(params.printBackground).toBe(true);
    expect(params.scale).toBe(1);
    expect(params.transferMode).toBe('ReturnAsBase64');
    expect(params.paperWidth).toBeCloseTo(8.2677, 3);
    expect(params.displayHeaderFooter).toBe(false);
  });

  it('uses the landscape flag rather than swapping dimensions', () => {
    const params = buildPrintParams(
      withSettings((s) => (s.page.orientation = 'landscape')),
      CONTEXT,
    );
    expect(params.landscape).toBe(true);
    // Chrome rotates the portrait sheet itself.
    expect(params.paperWidth!).toBeLessThan(params.paperHeight!);
  });

  it('clamps the scale to what Chrome accepts', () => {
    expect(
      buildPrintParams(
        withSettings((s) => (s.page.scale = 9)),
        CONTEXT,
      ).scale,
    ).toBe(2);
    expect(
      buildPrintParams(
        withSettings((s) => (s.page.scale = 0.01)),
        CONTEXT,
      ).scale,
    ).toBe(0.5);
  });

  it('never lets margins consume the whole sheet', () => {
    const settings = withSettings((s) => {
      s.page.paperSize = 'custom';
      s.page.customPaper = { widthMm: 50, heightMm: 50 };
      s.page.marginPreset = 'custom';
      s.page.customMargins = { topMm: 100, rightMm: 100, bottomMm: 100, leftMm: 100 };
    });
    const params = buildPrintParams(settings, CONTEXT);
    const printableWidth = params.paperWidth! - params.marginLeft! - params.marginRight!;
    const printableHeight = params.paperHeight! - params.marginTop! - params.marginBottom!;
    expect(printableWidth).toBeGreaterThan(0);
    expect(printableHeight).toBeGreaterThan(0);
  });

  it('omits page ranges unless they are valid and non-empty', () => {
    expect(buildPrintParams(cloneDefaultSettings(), CONTEXT).pageRanges).toBeUndefined();
    expect(
      buildPrintParams(
        withSettings((s) => (s.page.pageRanges = '1-3, 7')),
        CONTEXT,
      ).pageRanges,
    ).toBe('1-3, 7');
    expect(
      buildPrintParams(
        withSettings((s) => (s.page.pageRanges = '9-1')),
        CONTEXT,
      ).pageRanges,
    ).toBeUndefined();
  });

  it('omits header/footer templates when the feature is off', () => {
    const params = buildPrintParams(cloneDefaultSettings(), CONTEXT);
    expect(params.headerTemplate).toBeUndefined();
    expect(params.footerTemplate).toBeUndefined();
  });

  it('includes templates when the feature is on', () => {
    const params = buildPrintParams(
      withSettings((s) => {
        s.headerFooter.enabled = true;
        s.headerFooter.showTitle = true;
        s.headerFooter.showPageNumbers = true;
      }),
      CONTEXT,
    );
    expect(params.displayHeaderFooter).toBe(true);
    expect(params.headerTemplate).toContain('class="title"');
    expect(params.footerTemplate).toContain('class="pageNumber"');
    expect(params.headerTemplate).not.toBe('');
  });

  it('uses a non-empty placeholder rather than an empty template string', () => {
    const params = buildPrintParams(
      withSettings((s) => {
        s.headerFooter.enabled = true;
        s.headerFooter.showTitle = false;
        s.headerFooter.showDate = false;
        s.headerFooter.customText = '';
      }),
      CONTEXT,
    );
    expect(params.headerTemplate).toBe(EMPTY_TEMPLATE);
  });

  it('mirrors the background-graphics toggle', () => {
    expect(
      buildPrintParams(
        withSettings((s) => (s.cleanup.includeBackgrounds = false)),
        CONTEXT,
      ).printBackground,
    ).toBe(false);
  });

  it('passes preferCSSPageSize through', () => {
    expect(
      buildPrintParams(
        withSettings((s) => (s.page.preferCssPageSize = true)),
        CONTEXT,
      ).preferCSSPageSize,
    ).toBe(true);
  });
});
