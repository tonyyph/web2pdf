import { describe, expect, it } from 'vitest';
import {
  isCancellable,
  isExportJobState,
  MAX_SELECTORS,
  MAX_SELECTOR_LENGTH,
  parseBackgroundRequest,
  parseBroadcast,
  parseContentRequest,
  PHASE_LABELS,
  PHASE_PROGRESS,
  sanitizeSelectors,
  EXPORT_PHASES,
} from '@/core/messages';
import { cloneDefaultSettings } from '@/core/settings/defaults';
import { ERROR_CODES, createError, isAppError, toAppError } from '@/core/errors';

describe('parseBackgroundRequest', () => {
  it('accepts well-formed requests', () => {
    expect(parseBackgroundRequest({ type: 'GET_PAGE_INFO' })).toEqual({ type: 'GET_PAGE_INFO' });
    expect(parseBackgroundRequest({ type: 'GET_JOB_STATE', tabId: 7 })).toEqual({
      type: 'GET_JOB_STATE',
      tabId: 7,
    });
  });

  it('rejects unknown and malformed messages', () => {
    for (const value of [null, undefined, 'START_EXPORT', 42, {}, { type: 'NOPE' }, []]) {
      expect(parseBackgroundRequest(value)).toBeNull();
    }
  });

  it('rejects invalid tab ids', () => {
    for (const tabId of ['7', -1, 1.5, null, undefined, Number.NaN]) {
      expect(parseBackgroundRequest({ type: 'GET_JOB_STATE', tabId })).toBeNull();
    }
  });

  it('validates the settings payload of START_EXPORT', () => {
    const parsed = parseBackgroundRequest({
      type: 'START_EXPORT',
      tabId: 1,
      settings: { page: { paperSize: 'evil', scale: 999 }, theme: 'hacker' },
    });
    expect(parsed).not.toBeNull();
    if (parsed?.type !== 'START_EXPORT') throw new Error('wrong type');
    expect(parsed.settings.page.paperSize).toBe('a4');
    expect(parsed.settings.page.scale).toBe(2);
    expect(parsed.settings.theme).toBe('system');
  });

  it('substitutes defaults when settings are missing entirely', () => {
    const parsed = parseBackgroundRequest({ type: 'START_EXPORT', tabId: 1 });
    if (parsed?.type !== 'START_EXPORT') throw new Error('wrong type');
    expect(parsed.settings).toEqual(cloneDefaultSettings());
  });

  it('rejects an empty or over-long job id', () => {
    expect(parseBackgroundRequest({ type: 'CANCEL_EXPORT', jobId: '' })).toBeNull();
    expect(parseBackgroundRequest({ type: 'CANCEL_EXPORT', jobId: 'x'.repeat(65) })).toBeNull();
    expect(parseBackgroundRequest({ type: 'CANCEL_EXPORT', jobId: 'job_1' })).not.toBeNull();
  });
});

describe('sanitizeSelectors', () => {
  it('keeps plain selectors', () => {
    expect(sanitizeSelectors(['#a', '.b > .c', 'div:nth-of-type(2)'])).toEqual([
      '#a',
      '.b > .c',
      'div:nth-of-type(2)',
    ]);
  });

  it('drops non-strings, blanks and duplicates', () => {
    expect(sanitizeSelectors(['#a', '#a', '', '   ', 42, null, {}])).toEqual(['#a']);
  });

  it('drops selectors containing markup characters', () => {
    expect(sanitizeSelectors(['<script>', 'div{color:red}', '#ok'])).toEqual(['#ok']);
  });

  it('enforces the length and count limits', () => {
    expect(sanitizeSelectors(['x'.repeat(MAX_SELECTOR_LENGTH + 1)])).toEqual([]);
    const many = Array.from({ length: MAX_SELECTORS + 50 }, (_, i) => `#id${i}`);
    expect(sanitizeSelectors(many)).toHaveLength(MAX_SELECTORS);
  });

  it('returns an empty array for non-arrays', () => {
    expect(sanitizeSelectors('#a')).toEqual([]);
    expect(sanitizeSelectors(undefined)).toEqual([]);
  });
});

describe('parseContentRequest', () => {
  it('validates the PREPARE_PAGE payload', () => {
    const parsed = parseContentRequest({
      type: 'PREPARE_PAGE',
      jobId: 'job_1',
      options: { cleanup: { hideAds: 'nope' }, hiddenSelectors: ['#x', '<bad>'] },
    });
    if (parsed?.type !== 'PREPARE_PAGE') throw new Error('wrong type');
    expect(parsed.options.hiddenSelectors).toEqual(['#x']);
    expect(typeof parsed.options.cleanup.hideAds).toBe('boolean');
  });

  it('rejects unknown types', () => {
    expect(parseContentRequest({ type: 'DROP_TABLES' })).toBeNull();
    expect(parseContentRequest(null)).toBeNull();
  });

  it('accepts the simple commands', () => {
    for (const type of ['PING', 'GET_SELECTORS', 'PRINT_PAGE', 'EXIT_SELECTION_MODE'] as const) {
      expect(parseContentRequest({ type })).toEqual({ type });
    }
  });

  it('sanitises the selectors seeded into selection mode', () => {
    expect(
      parseContentRequest({ type: 'ENTER_SELECTION_MODE', selectors: ['#a', '<bad>', 7] }),
    ).toEqual({ type: 'ENTER_SELECTION_MODE', selectors: ['#a'] });
    expect(parseContentRequest({ type: 'ENTER_SELECTION_MODE' })).toEqual({
      type: 'ENTER_SELECTION_MODE',
      selectors: [],
    });
  });
});

describe('parseBroadcast', () => {
  const job = {
    jobId: 'job_1',
    tabId: 3,
    phase: 'generating',
    startedAt: 1,
    updatedAt: 2,
    progress: 50,
  };

  it('accepts a valid job update', () => {
    expect(parseBroadcast({ type: 'JOB_UPDATE', job })).toEqual({ type: 'JOB_UPDATE', job });
  });

  it('rejects a malformed job', () => {
    expect(parseBroadcast({ type: 'JOB_UPDATE', job: { jobId: 'x' } })).toBeNull();
    expect(parseBroadcast({ type: 'JOB_UPDATE', job: { ...job, phase: 'exploding' } })).toBeNull();
  });

  it('sanitises a selection update', () => {
    const parsed = parseBroadcast({ type: 'SELECTION_UPDATE', tabId: 3, selectors: ['#a', 42] });
    expect(parsed).toEqual({ type: 'SELECTION_UPDATE', tabId: 3, selectors: ['#a'] });
  });
});

describe('phase metadata', () => {
  it('covers every phase', () => {
    for (const phase of EXPORT_PHASES) {
      expect(PHASE_PROGRESS[phase]).toBeTypeOf('number');
      expect(PHASE_LABELS[phase]).toBeTruthy();
    }
  });

  it('only allows cancelling before the debugger attaches', () => {
    expect(isCancellable('preparing')).toBe(true);
    expect(isCancellable('loading-content')).toBe(true);
    expect(isCancellable('generating')).toBe(false);
    expect(isCancellable('downloading')).toBe(false);
    expect(isCancellable('completed')).toBe(false);
  });

  it('increases monotonically through the happy path', () => {
    const path = [
      'preparing',
      'loading-content',
      'generating',
      'downloading',
      'completed',
    ] as const;
    for (let i = 1; i < path.length; i += 1) {
      expect(PHASE_PROGRESS[path[i]!]).toBeGreaterThan(PHASE_PROGRESS[path[i - 1]!]);
    }
  });

  it('validates job state shape', () => {
    expect(
      isExportJobState({
        jobId: 'a',
        tabId: 1,
        phase: 'idle',
        startedAt: 0,
        updatedAt: 0,
        progress: 0,
      }),
    ).toBe(true);
    expect(isExportJobState({ jobId: 'a', tabId: 1, phase: 'idle' })).toBe(false);
    expect(isExportJobState(null)).toBe(false);
  });
});

describe('typed error mapping', () => {
  it('gives every code a user message and actions', () => {
    for (const code of ERROR_CODES) {
      const error = createError(code);
      expect(error.code).toBe(code);
      expect(error.userMessage.length).toBeGreaterThan(0);
      expect(error.actions.length).toBeGreaterThan(0);
      expect(isAppError(error)).toBe(true);
    }
  });

  it('keeps the developer message separate from the user message', () => {
    const error = createError('TIMEOUT', 'Page.printToPDF exceeded 120000ms');
    expect(error.message).toBe('Page.printToPDF exceeded 120000ms');
    expect(error.userMessage).not.toBe(error.message);
  });

  it('recognises the already-attached debugger message', () => {
    const mapped = toAppError(new Error('Another debugger is already attached to the tab'));
    expect(mapped.code).toBe('DEBUGGER_ALREADY_ATTACHED');
  });

  it('recognises unscriptable pages', () => {
    expect(toAppError(new Error('Cannot access contents of the page')).code).toBe(
      'UNSUPPORTED_PAGE',
    );
  });

  it('passes AppErrors through unchanged', () => {
    const original = createError('CANCELLED');
    expect(toAppError(original)).toBe(original);
  });

  it('falls back for non-error values', () => {
    expect(toAppError(undefined).code).toBe('UNKNOWN_ERROR');
    expect(toAppError('boom', 'DOWNLOAD_FAILED').code).toBe('DOWNLOAD_FAILED');
    expect(toAppError({ weird: true }).code).toBe('UNKNOWN_ERROR');
  });

  it('never exposes a stack trace in the user message', () => {
    const error = new Error('kaboom');
    error.stack = 'at someFile.ts:12:1';
    expect(toAppError(error).userMessage).not.toContain('someFile.ts');
  });
});
