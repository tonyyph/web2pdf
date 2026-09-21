import {
  FONT_READY_TIMEOUT_MS,
  IMAGE_READY_TIMEOUT_MS,
  LAZY_LOAD_MAX_DURATION_MS,
  LAZY_LOAD_MAX_STEPS,
  LAZY_LOAD_STEP_DELAY_MS,
  LONG_PAGE_WARN_PX,
} from '../core/constants';
import { isUsableSelector, normalizeCleanup } from '../core/cleanup';
import type { PreparePageOptions, PreparePageResult } from '../core/messages';

/**
 * Page preparation, executed inside the page by the content script.
 *
 * Every mutation is recorded and reverted by `restorePage`. Nothing is
 * removed from the DOM - elements are hidden with an inline style override, so
 * a web app's own state and event handlers stay intact.
 */

export const OVERLAY_ATTR = 'data-web2pdf-overlay';
const HIDDEN_ATTR = 'data-web2pdf-hidden';
const STYLE_ELEMENT_ID = 'web2pdf-print-style';

interface StyleSnapshot {
  element: HTMLElement;
  /** `null` means the element had no inline `style` attribute at all. */
  previous: string | null;
}

interface PrepareSession {
  styleSnapshots: StyleSnapshot[];
  injectedStyle: HTMLStyleElement | null;
  scrollX: number;
  scrollY: number;
  openedDetails: HTMLDetailsElement[];
}

let session: PrepareSession | null = null;
let cancelled = false;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function snapshotStyle(element: HTMLElement, current: PrepareSession): void {
  current.styleSnapshots.push({
    element,
    previous: element.hasAttribute('style') ? element.getAttribute('style') : null,
  });
}

function hideElement(element: HTMLElement, current: PrepareSession): void {
  if (element.hasAttribute(HIDDEN_ATTR)) return;
  // Never touch the extension's own UI.
  if (element.hasAttribute(OVERLAY_ATTR) || element.closest(`[${OVERLAY_ATTR}]`)) return;
  // Password fields and their containers are left completely alone.
  if (element.querySelector('input[type="password"]')) return;
  if (element instanceof HTMLInputElement && element.type === 'password') return;

  snapshotStyle(element, current);
  element.setAttribute(HIDDEN_ATTR, '');
  element.style.setProperty('display', 'none', 'important');
}

/** The print stylesheet we inject for the duration of the export. */
function buildPrintCss(readerMode: boolean): string {
  const base = `
    [${HIDDEN_ATTR}] { display: none !important; }
    [${OVERLAY_ATTR}] { display: none !important; }
    html, body {
      height: auto !important;
      max-height: none !important;
      overflow: visible !important;
    }
    * {
      animation: none !important;
      transition: none !important;
      scroll-behavior: auto !important;
    }
  `;

  if (!readerMode) return base;

  return `${base}
    body {
      background: #ffffff !important;
      color: #111827 !important;
    }
    main, article, [role="main"] {
      max-width: 100% !important;
      margin: 0 auto !important;
      float: none !important;
    }
    aside, [role="complementary"] { display: none !important; }
    img, figure, table, pre { break-inside: avoid; page-break-inside: avoid; }
  `;
}

function injectStyle(css: string, current: PrepareSession): void {
  const style = document.createElement('style');
  style.id = STYLE_ELEMENT_ID;
  style.setAttribute(OVERLAY_ATTR, 'style');
  style.textContent = css;
  document.documentElement.appendChild(style);
  current.injectedStyle = style;
}

function hideComputedStickyElements(current: PrepareSession): void {
  const candidates = document.body?.querySelectorAll<HTMLElement>('*') ?? [];
  let inspected = 0;
  for (const element of candidates) {
    // Bound the scan: pathological DOMs must not stall the export.
    if (++inspected > 4000) break;
    if (element.hasAttribute(OVERLAY_ATTR)) continue;
    const position = getComputedStyle(element).position;
    if (position !== 'fixed' && position !== 'sticky') continue;
    // A sticky wrapper around the whole article would blank the page.
    if (element.contains(document.querySelector('main'))) continue;
    hideElement(element, current);
  }
}

function expandCollapsedSections(current: PrepareSession): void {
  for (const details of document.querySelectorAll('details')) {
    if (details.open) continue;
    details.open = true;
    current.openedDetails.push(details);
  }
}

async function waitForFonts(): Promise<void> {
  if (!('fonts' in document)) return;
  await Promise.race([document.fonts.ready, sleep(FONT_READY_TIMEOUT_MS)]);
}

async function waitForImages(timeoutMs = IMAGE_READY_TIMEOUT_MS): Promise<void> {
  const pending = [...document.images].filter((image) => !image.complete && image.src !== '');
  if (pending.length === 0) return;

  const settled = pending.map(
    (image) =>
      new Promise<void>((resolve) => {
        const done = (): void => {
          image.removeEventListener('load', done);
          image.removeEventListener('error', done);
          resolve();
        };
        image.addEventListener('load', done, { once: true });
        image.addEventListener('error', done, { once: true });
      }),
  );

  await Promise.race([Promise.all(settled), sleep(timeoutMs)]);
}

function documentHeight(): number {
  const body = document.body;
  const html = document.documentElement;
  return Math.max(
    body?.scrollHeight ?? 0,
    body?.offsetHeight ?? 0,
    html.clientHeight,
    html.scrollHeight,
    html.offsetHeight,
  );
}

/**
 * Scroll the page in viewport-sized steps to trigger lazy loading, then
 * return to the top. Bounded by step count, wall-clock time and a stable-height
 * check, so it always terminates.
 */
async function loadLazyContent(): Promise<{ steps: number; timedOut: boolean }> {
  const startedAt = Date.now();
  const viewport = Math.max(200, window.innerHeight);
  let steps = 0;
  let position = 0;
  let lastHeight = documentHeight();
  let stableRounds = 0;

  while (steps < LAZY_LOAD_MAX_STEPS) {
    if (cancelled) return { steps, timedOut: false };
    if (Date.now() - startedAt > LAZY_LOAD_MAX_DURATION_MS) {
      return { steps, timedOut: true };
    }

    position += viewport;
    const height = documentHeight();
    if (position >= height) position = Math.max(0, height - viewport);

    window.scrollTo({ top: position, behavior: 'auto' });
    steps += 1;
    await sleep(LAZY_LOAD_STEP_DELAY_MS);

    const newHeight = documentHeight();
    if (newHeight === lastHeight) {
      stableRounds += 1;
      // Two stable rounds at the bottom means nothing more is loading.
      if (stableRounds >= 2 && position + viewport >= newHeight) break;
    } else {
      stableRounds = 0;
      lastHeight = newHeight;
    }
  }

  return { steps, timedOut: steps >= LAZY_LOAD_MAX_STEPS };
}

export function cancelPreparation(): void {
  cancelled = true;
}

export function isPreparationCancelled(): boolean {
  return cancelled;
}

export async function preparePage(options: PreparePageOptions): Promise<PreparePageResult> {
  // A leftover session (e.g. a previous export that errored) is reverted first.
  if (session) restorePage();
  cancelled = false;

  const plan = normalizeCleanup(options.cleanup, options.hiddenSelectors);
  const current: PrepareSession = {
    styleSnapshots: [],
    injectedStyle: null,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    openedDetails: [],
  };
  session = current;

  injectStyle(buildPrintCss(plan.readerMode), current);

  let hiddenCount = 0;
  for (const selector of plan.selectors) {
    if (!isUsableSelector(selector)) continue;
    let matches: NodeListOf<HTMLElement>;
    try {
      matches = document.querySelectorAll<HTMLElement>(selector);
    } catch {
      continue;
    }
    for (const element of matches) {
      hideElement(element, current);
      hiddenCount += 1;
    }
  }

  if (plan.hideComputedSticky) hideComputedStickyElements(current);
  if (plan.expandCollapsed) expandCollapsedSections(current);

  let lazyLoadSteps = 0;
  let timedOut = false;

  if (plan.loadLazyContent && !cancelled) {
    const lazy = await loadLazyContent();
    lazyLoadSteps = lazy.steps;
    timedOut = lazy.timedOut;
  }

  if (!cancelled) {
    await waitForFonts();
    await waitForImages();
  }

  // printToPDF renders from the top regardless, but restoring the offset here
  // keeps the visible page stable for the user while the PDF is produced.
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' });

  return {
    documentHeight: documentHeight(),
    hiddenCount,
    lazyLoadSteps,
    timedOut,
  };
}

/** Revert every mutation made by `preparePage`. Safe to call repeatedly. */
export function restorePage(): void {
  const current = session;
  cancelled = false;
  if (!current) return;
  session = null;

  for (const snapshot of current.styleSnapshots) {
    snapshot.element.removeAttribute(HIDDEN_ATTR);
    // An empty `style=""` is indistinguishable from no style attribute, so it
    // is normalised away rather than written back. Without this, a snapshot
    // that captured an empty attribute leaves inert markup behind and makes
    // restoration non-idempotent across repeated exports.
    if (snapshot.previous === null || snapshot.previous === '') {
      snapshot.element.removeAttribute('style');
    } else {
      snapshot.element.setAttribute('style', snapshot.previous);
    }
  }

  for (const details of current.openedDetails) {
    details.open = false;
  }

  current.injectedStyle?.remove();
  document.getElementById(STYLE_ELEMENT_ID)?.remove();

  window.scrollTo({ top: current.scrollY, left: current.scrollX, behavior: 'auto' });
}

export function isPageVeryLong(height: number): boolean {
  return height > LONG_PAGE_WARN_PX;
}
