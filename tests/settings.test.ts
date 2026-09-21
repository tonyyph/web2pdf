import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, cloneDefaultSettings } from '@/core/settings/defaults';
import { migrateSettings, needsMigration } from '@/core/settings/migrate';
import { SETTINGS_SCHEMA_VERSION } from '@/core/settings/schema';
import {
  customPaperInches,
  isValidPageRanges,
  validateCleanup,
  validateHeaderFooter,
  validatePageSettings,
  validateSettings,
} from '@/core/settings/validate';
import { SCALE_MAX, SCALE_MIN } from '@/core/constants';

describe('defaults', () => {
  it('is frozen and clones deeply', () => {
    expect(Object.isFrozen(DEFAULT_SETTINGS)).toBe(true);
    const clone = cloneDefaultSettings();
    clone.page.scale = 1.5;
    expect(DEFAULT_SETTINGS.page.scale).toBe(1);
  });
});

describe('validateSettings', () => {
  it('returns defaults for junk input', () => {
    for (const junk of [undefined, null, 42, 'settings', [], true]) {
      expect(validateSettings(junk)).toEqual(cloneDefaultSettings());
    }
  });

  it('always stamps the current schema version', () => {
    expect(validateSettings({ schemaVersion: 99 }).schemaVersion).toBe(SETTINGS_SCHEMA_VERSION);
  });

  it('keeps valid values', () => {
    const result = validateSettings({
      page: { paperSize: 'letter', orientation: 'landscape', scale: 1.25 },
      theme: 'dark',
      filenameTemplate: '{domain}',
    });
    expect(result.page.paperSize).toBe('letter');
    expect(result.page.orientation).toBe('landscape');
    expect(result.page.scale).toBe(1.25);
    expect(result.theme).toBe('dark');
    expect(result.filenameTemplate).toBe('{domain}');
  });

  it('rejects unknown enum values', () => {
    const result = validateSettings({
      page: { paperSize: 'a0', orientation: 'sideways', marginPreset: 'huge' },
      theme: 'neon',
    });
    expect(result.page.paperSize).toBe(DEFAULT_SETTINGS.page.paperSize);
    expect(result.page.orientation).toBe(DEFAULT_SETTINGS.page.orientation);
    expect(result.page.marginPreset).toBe(DEFAULT_SETTINGS.page.marginPreset);
    expect(result.theme).toBe('system');
  });

  it('clamps the scale into range', () => {
    expect(validatePageSettings({ scale: 0.01 }).scale).toBe(SCALE_MIN);
    expect(validatePageSettings({ scale: 99 }).scale).toBe(SCALE_MAX);
    // NaN is not a clampable number, so it falls back to the default.
    expect(validatePageSettings({ scale: Number.NaN }).scale).toBe(DEFAULT_SETTINGS.page.scale);
    expect(validatePageSettings({ scale: 'big' }).scale).toBe(DEFAULT_SETTINGS.page.scale);
  });

  it('clamps custom margins and paper', () => {
    const page = validatePageSettings({
      marginPreset: 'custom',
      customMargins: { topMm: -5, rightMm: 9999, bottomMm: 10, leftMm: 'x' },
      customPaper: { widthMm: 1, heightMm: 99999 },
    });
    expect(page.customMargins.topMm).toBe(0);
    expect(page.customMargins.rightMm).toBe(100);
    expect(page.customMargins.bottomMm).toBe(10);
    expect(page.customMargins.leftMm).toBe(DEFAULT_SETTINGS.page.customMargins.leftMm);
    expect(page.customPaper.widthMm).toBeGreaterThan(0);
    expect(page.customPaper.heightMm).toBeLessThanOrEqual(200 * 25.4);
  });

  it('truncates over-long strings', () => {
    const result = validateSettings({
      filenameTemplate: 'x'.repeat(500),
      headerFooter: { customText: 'y'.repeat(500) },
    });
    expect(result.filenameTemplate).toHaveLength(200);
    expect(result.headerFooter.customText).toHaveLength(200);
  });

  it('normalises booleans without coercing truthy junk', () => {
    const cleanup = validateCleanup({ hideAds: 'yes', hideNavigation: true, readerMode: 0 });
    expect(cleanup.hideAds).toBe(DEFAULT_SETTINGS.cleanup.hideAds);
    expect(cleanup.hideNavigation).toBe(true);
    expect(cleanup.readerMode).toBe(DEFAULT_SETTINGS.cleanup.readerMode);
  });

  it('validates header/footer flags', () => {
    const hf = validateHeaderFooter({ enabled: true, showTitle: false, customText: 'Draft' });
    expect(hf.enabled).toBe(true);
    expect(hf.showTitle).toBe(false);
    expect(hf.customText).toBe('Draft');
  });
});

describe('isValidPageRanges', () => {
  it('accepts empty and well-formed ranges', () => {
    for (const value of ['', '  ', '1', '1-5', '1-5, 8', '1-5,8,11-13', ' 2 - 4 ']) {
      expect(isValidPageRanges(value)).toBe(true);
    }
  });

  it('rejects malformed ranges', () => {
    for (const value of ['0', '5-1', 'a', '1--3', '1,,2', '-3', '1-', '1;2']) {
      expect(isValidPageRanges(value)).toBe(false);
    }
  });

  it('drops invalid ranges during validation', () => {
    expect(validatePageSettings({ pageRanges: '5-1' }).pageRanges).toBe('');
    expect(validatePageSettings({ pageRanges: ' 1-5, 8 ' }).pageRanges).toBe('1-5, 8');
  });
});

describe('customPaperInches', () => {
  it('converts and clamps', () => {
    expect(customPaperInches({ widthMm: 210, heightMm: 297 }).width).toBeCloseTo(8.2677, 3);
    expect(customPaperInches({ widthMm: 0, heightMm: 0 }).width).toBeGreaterThan(0);
    expect(customPaperInches({ widthMm: 1e6, heightMm: 1e6 }).width).toBeLessThanOrEqual(200);
  });
});

describe('migrateSettings', () => {
  it('upgrades a v1 blob with a flat margin', () => {
    const v1 = {
      schemaVersion: 1,
      page: { paperSize: 'letter', marginMm: 12, scale: 1.1 },
      theme: 'dark',
    };
    const result = migrateSettings(v1);
    expect(result.schemaVersion).toBe(SETTINGS_SCHEMA_VERSION);
    expect(result.page.paperSize).toBe('letter');
    expect(result.page.customMargins).toEqual({
      topMm: 12,
      rightMm: 12,
      bottomMm: 12,
      leftMm: 12,
    });
    expect(result.page.pageRanges).toBe('');
    expect(result.theme).toBe('dark');
  });

  it('treats a version-less blob as v1', () => {
    const result = migrateSettings({ page: { marginMm: 5 } });
    expect(result.schemaVersion).toBe(SETTINGS_SCHEMA_VERSION);
    expect(result.page.customMargins.topMm).toBe(5);
  });

  it('passes a current blob through untouched', () => {
    const current = cloneDefaultSettings();
    expect(migrateSettings(current)).toEqual(current);
  });

  it('falls back to defaults for unusable input', () => {
    expect(migrateSettings(null)).toEqual(cloneDefaultSettings());
    expect(migrateSettings('corrupt')).toEqual(cloneDefaultSettings());
  });

  it('does not loop on an unknown future version', () => {
    const future = { schemaVersion: 99, theme: 'light' };
    const result = migrateSettings(future);
    expect(result.schemaVersion).toBe(SETTINGS_SCHEMA_VERSION);
    expect(result.theme).toBe('light');
  });

  it('reports when migration is needed', () => {
    expect(needsMigration({ schemaVersion: 1 })).toBe(true);
    expect(needsMigration(cloneDefaultSettings())).toBe(false);
  });
});
