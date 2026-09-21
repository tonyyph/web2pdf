import { describe, expect, it } from 'vitest';
import {
  buildFooterTemplate,
  buildHeaderTemplate,
  EMPTY_TEMPLATE,
  escapeHtml,
  truncateUrl,
} from '@/core/header-footer';
import { DEFAULT_SETTINGS } from '@/core/settings/defaults';
import type { HeaderFooterSettings } from '@/core/settings/schema';

const CONTEXT = { title: 'A Page', url: 'https://example.com/article' };

function settings(patch: Partial<HeaderFooterSettings> = {}): HeaderFooterSettings {
  return { ...DEFAULT_SETTINGS.headerFooter, enabled: true, ...patch };
}

describe('escapeHtml', () => {
  it('escapes every HTML-significant character', () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;',
    );
    expect(escapeHtml("it's & more")).toBe('it&#39;s &amp; more');
  });

  it('escapes ampersands before other entities', () => {
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
  });

  it('handles non-string input safely', () => {
    expect(escapeHtml(undefined as unknown as string)).toBe('');
    expect(escapeHtml(null as unknown as string)).toBe('');
  });
});

describe('buildHeaderTemplate', () => {
  it('returns an empty element when disabled', () => {
    expect(buildHeaderTemplate(settings({ enabled: false }), CONTEXT)).toBe(EMPTY_TEMPLATE);
  });

  it('returns an empty element when nothing is selected', () => {
    const result = buildHeaderTemplate(
      settings({ showTitle: false, showDate: false, customText: '' }),
      CONTEXT,
    );
    expect(result).toBe(EMPTY_TEMPLATE);
  });

  it('includes the title placeholder Chrome substitutes', () => {
    expect(buildHeaderTemplate(settings({ showTitle: true }), CONTEXT)).toContain('class="title"');
  });

  it('includes the date placeholder', () => {
    expect(buildHeaderTemplate(settings({ showDate: true }), CONTEXT)).toContain('class="date"');
  });

  it('escapes custom text so it cannot break out of its element', () => {
    const result = buildHeaderTemplate(
      settings({ customText: '</span><img src=x onerror=alert(1)>' }),
      CONTEXT,
    );
    expect(result).not.toContain('<img');
    expect(result).not.toContain('</span><img');
    expect(result).toContain('&lt;img');
    expect(result).toContain('&lt;/span&gt;');
  });

  it('ignores whitespace-only custom text', () => {
    const result = buildHeaderTemplate(
      settings({ showTitle: false, showDate: false, customText: '   ' }),
      CONTEXT,
    );
    expect(result).toBe(EMPTY_TEMPLATE);
  });
});

describe('buildFooterTemplate', () => {
  it('returns an empty element when disabled', () => {
    expect(buildFooterTemplate(settings({ enabled: false }), CONTEXT)).toBe(EMPTY_TEMPLATE);
  });

  it('includes the page number placeholders', () => {
    const result = buildFooterTemplate(settings({ showPageNumbers: true }), CONTEXT);
    expect(result).toContain('class="pageNumber"');
    expect(result).toContain('class="totalPages"');
  });

  it('escapes a hostile URL', () => {
    const result = buildFooterTemplate(settings({ showUrl: true }), {
      title: 'x',
      url: 'https://evil.test/"><script>alert(1)</script>',
    });
    expect(result).not.toContain('<script>');
    expect(result).toContain('&lt;script&gt;');
  });

  it('returns an empty element when both parts are off', () => {
    const result = buildFooterTemplate(
      settings({ showUrl: false, showPageNumbers: false }),
      CONTEXT,
    );
    expect(result).toBe(EMPTY_TEMPLATE);
  });
});

describe('truncateUrl', () => {
  it('leaves short URLs alone', () => {
    expect(truncateUrl('https://example.com')).toBe('https://example.com');
  });

  it('truncates long URLs with an ellipsis', () => {
    const long = `https://example.com/${'a'.repeat(200)}`;
    const result = truncateUrl(long, 40);
    expect(result).toHaveLength(40);
    expect(result.endsWith('…')).toBe(true);
  });
});
