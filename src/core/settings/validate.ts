import {
  MARGIN_MAX_MM,
  MARGIN_PRESET_IDS,
  ORIENTATIONS,
  PAPER_SIZE_IDS,
  SCALE_MAX,
  SCALE_MIN,
} from '../constants';
import { clamp, MAX_PAPER_INCHES, MIN_PAPER_INCHES, mmToInches } from '../units';
import { DEFAULT_SETTINGS } from './defaults';
import type {
  CleanupSettings,
  CustomMargins,
  CustomPaper,
  HeaderFooterSettings,
  PageSettings,
  Settings,
  ThemeId,
} from './schema';
import { SETTINGS_SCHEMA_VERSION } from './schema';

const THEMES: readonly ThemeId[] = ['system', 'light', 'dark'];

const MIN_PAPER_MM = MIN_PAPER_INCHES * 25.4;
const MAX_PAPER_MM = MAX_PAPER_INCHES * 25.4;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pickBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function pickNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return clamp(value, min, max);
}

function pickEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function pickString(value: unknown, fallback: string, maxLength: number): string {
  if (typeof value !== 'string') return fallback;
  return value.slice(0, maxLength);
}

/**
 * Page range syntax accepted by CDP: comma-separated single pages and ranges,
 * 1-based, e.g. "1-5, 8, 11-13". Empty means "all pages".
 */
const PAGE_RANGE_PATTERN = /^\s*\d+\s*(-\s*\d+\s*)?(,\s*\d+\s*(-\s*\d+\s*)?)*$/;

export function isValidPageRanges(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed === '') return true;
  if (!PAGE_RANGE_PATTERN.test(trimmed)) return false;
  return trimmed.split(',').every((part) => {
    const bounds = part.split('-').map((n) => Number.parseInt(n.trim(), 10));
    if (bounds.some((n) => !Number.isInteger(n) || n < 1)) return false;
    if (bounds.length === 2) {
      const [from, to] = bounds as [number, number];
      return from <= to;
    }
    return bounds.length === 1;
  });
}

function validateCustomPaper(value: unknown, fallback: CustomPaper): CustomPaper {
  const raw = isRecord(value) ? value : {};
  return {
    widthMm: pickNumber(raw.widthMm, fallback.widthMm, MIN_PAPER_MM, MAX_PAPER_MM),
    heightMm: pickNumber(raw.heightMm, fallback.heightMm, MIN_PAPER_MM, MAX_PAPER_MM),
  };
}

function validateCustomMargins(value: unknown, fallback: CustomMargins): CustomMargins {
  const raw = isRecord(value) ? value : {};
  return {
    topMm: pickNumber(raw.topMm, fallback.topMm, 0, MARGIN_MAX_MM),
    rightMm: pickNumber(raw.rightMm, fallback.rightMm, 0, MARGIN_MAX_MM),
    bottomMm: pickNumber(raw.bottomMm, fallback.bottomMm, 0, MARGIN_MAX_MM),
    leftMm: pickNumber(raw.leftMm, fallback.leftMm, 0, MARGIN_MAX_MM),
  };
}

export function validatePageSettings(value: unknown): PageSettings {
  const fallback = DEFAULT_SETTINGS.page;
  const raw = isRecord(value) ? value : {};
  const pageRanges = pickString(raw.pageRanges, fallback.pageRanges, 200);
  return {
    paperSize: pickEnum(raw.paperSize, PAPER_SIZE_IDS, fallback.paperSize),
    customPaper: validateCustomPaper(raw.customPaper, fallback.customPaper),
    orientation: pickEnum(raw.orientation, ORIENTATIONS, fallback.orientation),
    marginPreset: pickEnum(raw.marginPreset, MARGIN_PRESET_IDS, fallback.marginPreset),
    customMargins: validateCustomMargins(raw.customMargins, fallback.customMargins),
    scale: pickNumber(raw.scale, fallback.scale, SCALE_MIN, SCALE_MAX),
    preferCssPageSize: pickBoolean(raw.preferCssPageSize, fallback.preferCssPageSize),
    pageRanges: isValidPageRanges(pageRanges) ? pageRanges.trim() : '',
  };
}

export function validateHeaderFooter(value: unknown): HeaderFooterSettings {
  const fallback = DEFAULT_SETTINGS.headerFooter;
  const raw = isRecord(value) ? value : {};
  return {
    enabled: pickBoolean(raw.enabled, fallback.enabled),
    showTitle: pickBoolean(raw.showTitle, fallback.showTitle),
    showUrl: pickBoolean(raw.showUrl, fallback.showUrl),
    showDate: pickBoolean(raw.showDate, fallback.showDate),
    showPageNumbers: pickBoolean(raw.showPageNumbers, fallback.showPageNumbers),
    customText: pickString(raw.customText, fallback.customText, 200),
  };
}

export function validateCleanup(value: unknown): CleanupSettings {
  const fallback = DEFAULT_SETTINGS.cleanup;
  const raw = isRecord(value) ? value : {};
  return {
    includeBackgrounds: pickBoolean(raw.includeBackgrounds, fallback.includeBackgrounds),
    hideAds: pickBoolean(raw.hideAds, fallback.hideAds),
    hideNavigation: pickBoolean(raw.hideNavigation, fallback.hideNavigation),
    hideCookieBanners: pickBoolean(raw.hideCookieBanners, fallback.hideCookieBanners),
    hideStickyElements: pickBoolean(raw.hideStickyElements, fallback.hideStickyElements),
    expandCollapsed: pickBoolean(raw.expandCollapsed, fallback.expandCollapsed),
    loadLazyContent: pickBoolean(raw.loadLazyContent, fallback.loadLazyContent),
    readerMode: pickBoolean(raw.readerMode, fallback.readerMode),
  };
}

/**
 * Total-function validator: any input, valid or hostile, yields usable
 * settings. Storage contents are never trusted.
 */
export function validateSettings(value: unknown): Settings {
  const raw = isRecord(value) ? value : {};
  return {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    page: validatePageSettings(raw.page),
    headerFooter: validateHeaderFooter(raw.headerFooter),
    cleanup: validateCleanup(raw.cleanup),
    filenameTemplate: pickString(raw.filenameTemplate, DEFAULT_SETTINGS.filenameTemplate, 200),
    theme: pickEnum(raw.theme, THEMES, DEFAULT_SETTINGS.theme),
  };
}

/** Custom paper, expressed in the inches CDP wants, already clamped. */
export function customPaperInches(paper: CustomPaper): { width: number; height: number } {
  return {
    width: clamp(mmToInches(paper.widthMm), MIN_PAPER_INCHES, MAX_PAPER_INCHES),
    height: clamp(mmToInches(paper.heightMm), MIN_PAPER_INCHES, MAX_PAPER_INCHES),
  };
}
