import { DEFAULT_FILENAME_TEMPLATE } from '../constants';
import { SETTINGS_SCHEMA_VERSION, type Settings } from './schema';

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  schemaVersion: SETTINGS_SCHEMA_VERSION,
  page: {
    paperSize: 'a4',
    customPaper: { widthMm: 210, heightMm: 297 },
    orientation: 'portrait',
    marginPreset: 'narrow',
    customMargins: { topMm: 10, rightMm: 10, bottomMm: 10, leftMm: 10 },
    scale: 1,
    preferCssPageSize: false,
    pageRanges: '',
  },
  headerFooter: {
    enabled: false,
    showTitle: true,
    showUrl: true,
    showDate: false,
    showPageNumbers: true,
    customText: '',
  },
  cleanup: {
    includeBackgrounds: true,
    hideAds: true,
    hideNavigation: false,
    hideCookieBanners: true,
    hideStickyElements: true,
    expandCollapsed: false,
    loadLazyContent: true,
    readerMode: false,
  },
  filenameTemplate: DEFAULT_FILENAME_TEMPLATE,
  theme: 'system',
} satisfies Settings);

/** Deep clone so callers can never mutate the frozen default object. */
export function cloneDefaultSettings(): Settings {
  return structuredClone(DEFAULT_SETTINGS) as Settings;
}
