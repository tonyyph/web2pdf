import { describe, expect, it } from 'vitest';
import { getPageSupport, isSupportedPage } from '@/core/page-support';

describe('getPageSupport', () => {
  it('supports ordinary http and https pages', () => {
    for (const url of [
      'https://example.com',
      'http://example.com/path?q=1#frag',
      'https://sub.domain.example.co.uk/a/b',
      'https://localhost:3000/app',
    ]) {
      expect(getPageSupport(url).supported).toBe(true);
    }
  });

  it('blocks browser internal pages', () => {
    for (const url of ['chrome://settings', 'edge://extensions', 'about:blank']) {
      const support = getPageSupport(url);
      expect(support.supported).toBe(false);
      expect(support.reason).toBe('browser-internal');
    }
  });

  it('blocks extension pages', () => {
    expect(getPageSupport('chrome-extension://abcdef/popup.html').reason).toBe('extension-page');
    expect(getPageSupport('moz-extension://abcdef/popup.html').reason).toBe('extension-page');
  });

  it('blocks the web stores', () => {
    expect(getPageSupport('https://chromewebstore.google.com/detail/x').reason).toBe('web-store');
    expect(getPageSupport('https://chrome.google.com/webstore/detail/x').reason).toBe('web-store');
    expect(getPageSupport('https://microsoftedge.microsoft.com/addons/detail/x').reason).toBe(
      'web-store',
    );
  });

  it('allows non-store pages on chrome.google.com', () => {
    expect(getPageSupport('https://chrome.google.com/intl/en/support').supported).toBe(true);
  });

  it('blocks view-source and other schemes', () => {
    expect(getPageSupport('view-source:https://example.com').reason).toBe('view-source');
    expect(getPageSupport('devtools://devtools/bundled/x.html').reason).toBe('unsupported-scheme');
    expect(getPageSupport('data:text/html,<p>hi</p>').reason).toBe('unsupported-scheme');
    expect(getPageSupport('ftp://example.com/file').reason).toBe('unsupported-scheme');
  });

  it('explains the local-file restriction', () => {
    const support = getPageSupport('file:///Users/me/notes.html');
    expect(support.reason).toBe('local-file');
    expect(support.explanation).toContain('file URLs');
  });

  it('detects PDFs', () => {
    expect(getPageSupport('https://example.com/report.pdf').reason).toBe('pdf-viewer');
    expect(getPageSupport('https://example.com/report.PDF?x=1').reason).toBe('pdf-viewer');
    expect(getPageSupport('file:///Users/me/report.pdf').reason).toBe('pdf-viewer');
    expect(getPageSupport('https://example.com/pdf-guide').supported).toBe(true);
  });

  it('handles missing and malformed URLs', () => {
    for (const url of [undefined, null, '', '   ', 'not a url']) {
      const support = getPageSupport(url);
      expect(support.supported).toBe(false);
      expect(support.reason).toBe('no-url');
    }
  });

  it('always carries an explanation when unsupported', () => {
    for (const url of ['chrome://x', 'file:///a', 'data:,', '']) {
      const support = getPageSupport(url);
      expect(support.explanation).toBeTruthy();
    }
  });

  it('exposes a boolean shorthand', () => {
    expect(isSupportedPage('https://example.com')).toBe(true);
    expect(isSupportedPage('chrome://settings')).toBe(false);
  });
});
