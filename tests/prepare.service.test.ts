import { beforeEach, describe, expect, it } from 'vitest';
import { normalizeCleanup, isUsableSelector, CLEANUP_SELECTORS } from '@/core/cleanup';
import { DEFAULT_SETTINGS } from '@/core/settings/defaults';
import type { CleanupSettings } from '@/core/settings/schema';
import { isPageVeryLong, preparePage, restorePage, OVERLAY_ATTR } from '@/services/prepare.service';
import { LONG_PAGE_WARN_PX } from '@/core/constants';
import { buildSelector } from '@/services/selector.service';

function cleanup(patch: Partial<CleanupSettings> = {}): CleanupSettings {
  return { ...DEFAULT_SETTINGS.cleanup, ...patch };
}

describe('normalizeCleanup', () => {
  it('includes ad selectors only when the toggle is on', () => {
    const on = normalizeCleanup(cleanup({ hideAds: true }));
    const off = normalizeCleanup(cleanup({ hideAds: false, readerMode: false }));
    expect(on.selectors).toEqual(expect.arrayContaining([...CLEANUP_SELECTORS.ads]));
    expect(off.selectors).not.toEqual(expect.arrayContaining([...CLEANUP_SELECTORS.ads]));
  });

  it('reader mode implies the strictest cleanup', () => {
    const plan = normalizeCleanup(
      cleanup({
        readerMode: true,
        hideAds: false,
        hideNavigation: false,
        hideStickyElements: false,
      }),
    );
    expect(plan.readerMode).toBe(true);
    expect(plan.hideComputedSticky).toBe(true);
    expect(plan.expandCollapsed).toBe(true);
    expect(plan.selectors).toEqual(expect.arrayContaining([...CLEANUP_SELECTORS.navigation]));
  });

  it('merges user selectors and de-duplicates', () => {
    const plan = normalizeCleanup(cleanup({ hideAds: false, readerMode: false }), [
      '#custom',
      '#custom',
      '  ',
    ]);
    expect(plan.selectors.filter((s) => s === '#custom')).toHaveLength(1);
    expect(plan.selectors).not.toContain('  ');
  });

  it('mirrors the background-graphics flag', () => {
    expect(normalizeCleanup(cleanup({ includeBackgrounds: false })).printBackground).toBe(false);
  });
});

describe('isUsableSelector', () => {
  it('accepts valid CSS selectors', () => {
    expect(isUsableSelector('#a')).toBe(true);
    expect(isUsableSelector('div > .b:nth-of-type(2)')).toBe(true);
  });

  it('rejects invalid or empty selectors', () => {
    expect(isUsableSelector(':::')).toBe(false);
    expect(isUsableSelector('')).toBe(false);
    expect(isUsableSelector('   ')).toBe(false);
  });
});

describe('isPageVeryLong', () => {
  it('warns past the threshold', () => {
    expect(isPageVeryLong(LONG_PAGE_WARN_PX - 1)).toBe(false);
    expect(isPageVeryLong(LONG_PAGE_WARN_PX + 1)).toBe(true);
  });
});

describe('preparePage / restorePage', () => {
  beforeEach(() => {
    document.documentElement.innerHTML = '<head></head><body></body>';
    restorePage();
  });

  it('hides matched elements and restores them exactly', async () => {
    document.body.innerHTML = `
      <div class="cookie-banner" style="color: red">Cookies</div>
      <nav id="nav">Nav</nav>
      <p id="keep">Content</p>
    `;

    const banner = document.querySelector<HTMLElement>('.cookie-banner')!;
    const keep = document.querySelector<HTMLElement>('#keep')!;

    await preparePage({
      cleanup: cleanup({ hideCookieBanners: true, loadLazyContent: false }),
      hiddenSelectors: [],
    });

    expect(banner.style.display).toBe('none');
    expect(keep.style.display).toBe('');

    restorePage();

    expect(banner.getAttribute('style')).toBe('color: red');
    expect(banner.hasAttribute('data-web2pdf-hidden')).toBe(false);
  });

  it('removes the style attribute entirely if the element had none', async () => {
    document.body.innerHTML = '<div class="cookie-banner">x</div>';
    const banner = document.querySelector<HTMLElement>('.cookie-banner')!;

    await preparePage({
      cleanup: cleanup({ hideCookieBanners: true, loadLazyContent: false }),
      hiddenSelectors: [],
    });
    restorePage();

    expect(banner.hasAttribute('style')).toBe(false);
  });

  it('hides user-selected elements', async () => {
    document.body.innerHTML = '<div id="unwanted">x</div><div id="wanted">y</div>';

    const result = await preparePage({
      cleanup: cleanup({ hideAds: false, hideCookieBanners: false, loadLazyContent: false }),
      hiddenSelectors: ['#unwanted'],
    });

    expect(result.hiddenCount).toBe(1);
    expect(document.querySelector<HTMLElement>('#unwanted')!.style.display).toBe('none');
    expect(document.querySelector<HTMLElement>('#wanted')!.style.display).toBe('');
  });

  it('never hides a container holding a password field', async () => {
    document.body.innerHTML = '<div class="cookie-banner"><input type="password" id="pw" /></div>';

    await preparePage({
      cleanup: cleanup({ hideCookieBanners: true, loadLazyContent: false }),
      hiddenSelectors: [],
    });

    expect(document.querySelector<HTMLElement>('.cookie-banner')!.style.display).not.toBe('none');
  });

  it('never hides the extension overlay', async () => {
    document.body.innerHTML = `<div class="cookie-banner" ${OVERLAY_ATTR}="root">ui</div>`;

    await preparePage({
      cleanup: cleanup({ hideCookieBanners: true, loadLazyContent: false }),
      hiddenSelectors: [],
    });

    expect(document.querySelector<HTMLElement>('.cookie-banner')!.style.display).not.toBe('none');
  });

  it('injects and then removes the print stylesheet', async () => {
    await preparePage({
      cleanup: cleanup({ loadLazyContent: false }),
      hiddenSelectors: [],
    });
    expect(document.getElementById('web2pdf-print-style')).not.toBeNull();

    restorePage();
    expect(document.getElementById('web2pdf-print-style')).toBeNull();
  });

  it('expands and re-collapses details elements', async () => {
    document.body.innerHTML = '<details id="d"><summary>s</summary>body</details>';
    const details = document.querySelector<HTMLDetailsElement>('#d')!;

    await preparePage({
      cleanup: cleanup({ expandCollapsed: true, loadLazyContent: false }),
      hiddenSelectors: [],
    });
    expect(details.open).toBe(true);

    restorePage();
    expect(details.open).toBe(false);
  });

  it('ignores a selector that would throw', async () => {
    document.body.innerHTML = '<div id="a">x</div>';

    const result = await preparePage({
      cleanup: cleanup({ hideAds: false, hideCookieBanners: false, loadLazyContent: false }),
      hiddenSelectors: [':::bad', '#a'],
    });

    expect(result.hiddenCount).toBe(1);
  });

  it('restores the scroll position', async () => {
    window.scrollTo(0, 0);
    await preparePage({ cleanup: cleanup({ loadLazyContent: false }), hiddenSelectors: [] });
    restorePage();
    expect(window.scrollY).toBe(0);
  });

  it('is idempotent when restored twice', async () => {
    document.body.innerHTML = '<div class="cookie-banner">x</div>';
    await preparePage({
      cleanup: cleanup({ hideCookieBanners: true, loadLazyContent: false }),
      hiddenSelectors: [],
    });
    restorePage();
    expect(() => restorePage()).not.toThrow();
  });
});

describe('buildSelector', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('prefers a unique id', () => {
    document.body.innerHTML = '<div id="unique">x</div>';
    expect(buildSelector(document.querySelector('#unique')!)).toBe('#unique');
  });

  it('falls back to a structural path', () => {
    document.body.innerHTML = '<section><p>a</p><p class="target">b</p></section>';
    const selector = buildSelector(document.querySelector('.target')!);
    expect(document.querySelectorAll(selector)).toHaveLength(1);
    expect(document.querySelector(selector)).toBe(document.querySelector('.target'));
  });

  it('disambiguates identical siblings', () => {
    document.body.innerHTML = '<ul><li>a</li><li>b</li><li>c</li></ul>';
    const third = document.querySelectorAll('li')[2]!;
    const selector = buildSelector(third);
    expect(document.querySelector(selector)).toBe(third);
  });

  it('produces a selector that is safe to query', () => {
    document.body.innerHTML = '<div class="a b c d e"><span>x</span></div>';
    const selector = buildSelector(document.querySelector('span')!);
    expect(() => document.querySelectorAll(selector)).not.toThrow();
  });
});
