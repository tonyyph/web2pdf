import type { CleanupSettings } from './settings/schema';

/**
 * CSS selectors used to hide page furniture before export.
 *
 * These are heuristics, deliberately conservative: a false negative leaves a
 * banner in the PDF, but a false positive removes real content. Everything is
 * applied as a temporary `visibility`/`display` override and reverted after
 * the export, so nothing is ever destroyed.
 */

export type CleanupCategory = 'ads' | 'navigation' | 'cookieBanners' | 'sticky' | 'nonPrintable';

export const CLEANUP_SELECTORS: Readonly<Record<CleanupCategory, readonly string[]>> = {
  ads: [
    'ins.adsbygoogle',
    'iframe[src*="doubleclick.net"]',
    'iframe[src*="googlesyndication"]',
    'iframe[src*="adservice."]',
    'iframe[id^="google_ads"]',
    'div[id^="div-gpt-ad"]',
    'div[class*="advertisement"]',
    'div[class*="ad-banner"]',
    'div[class*="ad-container"]',
    'div[class*="sponsored-"]',
    '[data-ad-slot]',
    '[aria-label="Advertisement" i]',
  ],
  navigation: ['header[role="banner"]', 'nav', 'footer[role="contentinfo"]', '[role="navigation"]'],
  cookieBanners: [
    '#onetrust-consent-sdk',
    '#onetrust-banner-sdk',
    '#CybotCookiebotDialog',
    '#cookie-law-info-bar',
    '.cc-window',
    '.cookie-consent',
    '.cookie-banner',
    '.cookie-notice',
    '[id*="cookie-consent" i]',
    '[class*="cookie-consent" i]',
    '[class*="gdpr" i]',
    '[aria-label*="cookie" i][role="dialog"]',
  ],
  sticky: [],
  nonPrintable: ['video', 'audio', '[role="dialog"][aria-modal="true"]', '.modal-backdrop'],
};

/**
 * Collapse the user's cleanup toggles into the concrete work the content
 * script performs. Keeping this pure makes it directly testable.
 */
export interface NormalizedCleanupPlan {
  selectors: string[];
  /** Hide elements whose computed position is fixed or sticky. */
  hideComputedSticky: boolean;
  expandCollapsed: boolean;
  loadLazyContent: boolean;
  readerMode: boolean;
  printBackground: boolean;
}

export function normalizeCleanup(
  settings: CleanupSettings,
  extraSelectors: readonly string[] = [],
): NormalizedCleanupPlan {
  const selectors = new Set<string>();

  const add = (list: readonly string[]) => list.forEach((selector) => selectors.add(selector));

  if (settings.hideAds) add(CLEANUP_SELECTORS.ads);
  if (settings.hideNavigation) add(CLEANUP_SELECTORS.navigation);
  if (settings.hideCookieBanners) add(CLEANUP_SELECTORS.cookieBanners);
  // Reader mode is the strictest preset: everything that is not article body.
  if (settings.readerMode) {
    add(CLEANUP_SELECTORS.ads);
    add(CLEANUP_SELECTORS.navigation);
    add(CLEANUP_SELECTORS.cookieBanners);
    add(CLEANUP_SELECTORS.nonPrintable);
  }

  for (const selector of extraSelectors) {
    const trimmed = selector.trim();
    if (trimmed !== '') selectors.add(trimmed);
  }

  return {
    selectors: [...selectors],
    hideComputedSticky: settings.hideStickyElements || settings.readerMode,
    expandCollapsed: settings.expandCollapsed || settings.readerMode,
    loadLazyContent: settings.loadLazyContent,
    readerMode: settings.readerMode,
    printBackground: settings.includeBackgrounds,
  };
}

/** Guard against a selector string that would throw inside querySelectorAll. */
export function isUsableSelector(selector: string): boolean {
  if (typeof selector !== 'string' || selector.trim() === '') return false;
  try {
    document.createDocumentFragment().querySelector(selector);
    return true;
  } catch {
    return false;
  }
}
