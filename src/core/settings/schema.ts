import type { MarginPresetId, OrientationId, PaperSizeId } from '../constants';

/** Bump when the shape of `Settings` changes; add a step in `migrate.ts`. */
export const SETTINGS_SCHEMA_VERSION = 2;

export const STORAGE_KEY_SETTINGS = 'web2pdf:settings';

export type ThemeId = 'system' | 'light' | 'dark';

export interface CustomPaper {
  /** Always millimetres: one unit in storage avoids ambiguity on read-back. */
  widthMm: number;
  heightMm: number;
}

export interface CustomMargins {
  topMm: number;
  rightMm: number;
  bottomMm: number;
  leftMm: number;
}

export interface HeaderFooterSettings {
  enabled: boolean;
  showTitle: boolean;
  showUrl: boolean;
  showDate: boolean;
  showPageNumbers: boolean;
  customText: string;
}

export interface CleanupSettings {
  includeBackgrounds: boolean;
  hideAds: boolean;
  hideNavigation: boolean;
  hideCookieBanners: boolean;
  hideStickyElements: boolean;
  expandCollapsed: boolean;
  loadLazyContent: boolean;
  readerMode: boolean;
}

export interface PageSettings {
  paperSize: PaperSizeId;
  customPaper: CustomPaper;
  orientation: OrientationId;
  marginPreset: MarginPresetId;
  customMargins: CustomMargins;
  /** 0.5 - 2.0 */
  scale: number;
  preferCssPageSize: boolean;
  /** Empty string means "all pages". e.g. "1-5, 8, 11-13" */
  pageRanges: string;
}

export interface Settings {
  schemaVersion: number;
  page: PageSettings;
  headerFooter: HeaderFooterSettings;
  cleanup: CleanupSettings;
  filenameTemplate: string;
  theme: ThemeId;
}
