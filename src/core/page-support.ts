/**
 * Which pages an extension may script and attach a debugger to.
 *
 * Chrome blocks content-script injection and `chrome.debugger` on its own
 * internal surfaces and on the Web Store, regardless of granted permissions.
 * Detecting this up front lets the popup explain the limitation instead of
 * failing at attach time.
 */

export type UnsupportedReason =
  | 'browser-internal'
  | 'extension-page'
  | 'web-store'
  | 'local-file'
  | 'pdf-viewer'
  | 'view-source'
  | 'no-url'
  | 'unsupported-scheme';

export interface PageSupport {
  supported: boolean;
  reason?: UnsupportedReason;
  /** Rendered in the popup when `supported` is false. */
  explanation?: string;
}

const BLOCKED_SCHEMES = new Set([
  'chrome:',
  'edge:',
  'about:',
  'brave:',
  'opera:',
  'vivaldi:',
  'devtools:',
  'chrome-untrusted:',
  'chrome-search:',
  'chrome-error:',
  'view-source:',
  'javascript:',
  'data:',
  'blob:',
]);

const EXTENSION_SCHEMES = new Set(['chrome-extension:', 'moz-extension:', 'extension:']);

const WEB_STORE_HOSTS = new Set([
  'chromewebstore.google.com',
  'chrome.google.com',
  'microsoftedge.microsoft.com',
  'addons.mozilla.org',
]);

const EXPLANATIONS: Readonly<Record<UnsupportedReason, string>> = {
  'browser-internal': 'Browser pages like chrome:// and edge:// are protected and cannot be read.',
  'extension-page': 'Extension pages cannot be exported by another extension.',
  'web-store': 'Browser vendors block extensions from running on the Web Store.',
  'local-file':
    'Local files need "Allow access to file URLs" enabled for Web2PDF on the extensions page.',
  'pdf-viewer': 'This is already a PDF. Use the browser save button instead.',
  'view-source': 'View-source pages cannot be exported.',
  'no-url': 'This tab has no page loaded yet.',
  'unsupported-scheme': 'This address cannot be exported by an extension.',
};

function unsupported(reason: UnsupportedReason): PageSupport {
  return { supported: false, reason, explanation: EXPLANATIONS[reason] };
}

export function getPageSupport(rawUrl: string | undefined | null): PageSupport {
  if (!rawUrl || rawUrl.trim() === '') return unsupported('no-url');

  if (rawUrl.toLowerCase().startsWith('view-source:')) return unsupported('view-source');

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return unsupported('no-url');
  }

  const protocol = url.protocol.toLowerCase();

  if (EXTENSION_SCHEMES.has(protocol)) return unsupported('extension-page');
  if (protocol === 'chrome:' || protocol === 'edge:' || protocol === 'about:') {
    return unsupported('browser-internal');
  }
  if (BLOCKED_SCHEMES.has(protocol)) return unsupported('unsupported-scheme');

  if (protocol === 'file:') {
    if (/\.pdf(\?|#|$)/i.test(url.pathname)) return unsupported('pdf-viewer');
    // Injection here needs the user-granted "Allow access to file URLs" flag,
    // which an extension cannot request programmatically.
    return unsupported('local-file');
  }

  if (protocol !== 'http:' && protocol !== 'https:') return unsupported('unsupported-scheme');

  const host = url.hostname.toLowerCase();
  if (WEB_STORE_HOSTS.has(host)) {
    // chrome.google.com hosts non-store content too; only /webstore is blocked.
    if (host === 'chrome.google.com' && !url.pathname.toLowerCase().startsWith('/webstore')) {
      return { supported: true };
    }
    return unsupported('web-store');
  }

  if (/\.pdf(\?|#|$)/i.test(url.pathname)) return unsupported('pdf-viewer');

  return { supported: true };
}

export function isSupportedPage(url: string | undefined | null): boolean {
  return getPageSupport(url).supported;
}
