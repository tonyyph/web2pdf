import type { HeaderFooterSettings } from './settings/schema';

/**
 * Header/footer templates for `Page.printToPDF`.
 *
 * Chrome renders these as isolated HTML fragments and substitutes the classes
 * `title`, `url`, `date`, `pageNumber` and `totalPages` with live values. The
 * fragment is rendered by Chrome's own printing pipeline - scripts do not run -
 * but we still escape every interpolated value so a hostile page title cannot
 * break out of its element and distort the layout.
 */

const HTML_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

/** Chrome's default templates are 0 height unless styled; keep this tiny. */
const BASE_STYLE =
  'font-family: system-ui, -apple-system, "Segoe UI", sans-serif; font-size: 9px; ' +
  'color: #6b7280; width: 100%; padding: 0 12mm; display: flex; align-items: center; ' +
  'justify-content: space-between; gap: 8px;';

const CELL_STYLE = 'overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';

/** An empty element, not an empty string: CDP falls back to its own template for "". */
export const EMPTY_TEMPLATE = '<span></span>';

export interface HeaderFooterContext {
  title: string;
  url: string;
}

export function buildHeaderTemplate(
  settings: HeaderFooterSettings,
  context: HeaderFooterContext,
): string {
  if (!settings.enabled) return EMPTY_TEMPLATE;

  const left: string[] = [];
  const right: string[] = [];

  if (settings.showTitle) {
    left.push(`<span class="title" style="${CELL_STYLE} max-width: 60%;"></span>`);
  }
  if (settings.customText.trim() !== '') {
    left.push(`<span style="${CELL_STYLE}">${escapeHtml(settings.customText.trim())}</span>`);
  }
  if (settings.showDate) {
    right.push(`<span class="date" style="${CELL_STYLE}"></span>`);
  }

  if (left.length === 0 && right.length === 0) return EMPTY_TEMPLATE;

  // `context` is kept in the signature because Chrome only substitutes the
  // title of the printed document; a future custom-token feature needs it.
  void context;

  return wrap(left, right);
}

export function buildFooterTemplate(
  settings: HeaderFooterSettings,
  context: HeaderFooterContext,
): string {
  if (!settings.enabled) return EMPTY_TEMPLATE;

  const left: string[] = [];
  const right: string[] = [];

  if (settings.showUrl) {
    left.push(
      `<span style="${CELL_STYLE} max-width: 70%;">${escapeHtml(truncateUrl(context.url))}</span>`,
    );
  }
  if (settings.showPageNumbers) {
    right.push(
      '<span style="white-space: nowrap;">' +
        '<span class="pageNumber"></span> / <span class="totalPages"></span>' +
        '</span>',
    );
  }

  if (left.length === 0 && right.length === 0) return EMPTY_TEMPLATE;
  return wrap(left, right);
}

function wrap(left: string[], right: string[]): string {
  return (
    `<div style="${BASE_STYLE}">` +
    `<div style="${CELL_STYLE} flex: 1 1 auto; display: flex; gap: 8px;">${left.join('')}</div>` +
    `<div style="flex: 0 0 auto; display: flex; gap: 8px;">${right.join('')}</div>` +
    `</div>`
  );
}

/** Long URLs would otherwise push the page number off the footer. */
export function truncateUrl(url: string, maxLength = 90): string {
  const value = String(url ?? '');
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}…`;
}
