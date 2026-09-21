import type { AppError } from './errors';
import type { CleanupSettings, Settings } from './settings/schema';
import { validateCleanup, validateSettings } from './settings/validate';

/**
 * Typed message contracts between popup, options page, background worker and
 * content script. Every inbound message is validated at the boundary - a
 * content script runs in a page the user does not control, so its messages are
 * treated as untrusted input.
 */

export const EXPORT_PHASES = [
  'idle',
  'preparing',
  'loading-content',
  'generating',
  'downloading',
  'completed',
  'cancelled',
  'failed',
] as const;

export type ExportPhase = (typeof EXPORT_PHASES)[number];

/** Phases before this point can still be cancelled by the user. */
export const CANCELLABLE_PHASES: readonly ExportPhase[] = ['preparing', 'loading-content'];

export interface ExportJobState {
  jobId: string;
  tabId: number;
  phase: ExportPhase;
  startedAt: number;
  updatedAt: number;
  /** 0-100, monotonic within a job. */
  progress: number;
  filename?: string;
  warning?: string;
  error?: AppError;
}

export interface PageInfo {
  tabId: number;
  url: string;
  title: string;
  favIconUrl?: string;
}

export interface PreparePageOptions {
  cleanup: CleanupSettings;
  hiddenSelectors: string[];
}

export interface PreparePageResult {
  /** Full document height in CSS pixels after preparation. */
  documentHeight: number;
  hiddenCount: number;
  lazyLoadSteps: number;
  timedOut: boolean;
}

/* ------------------------------------------------------------------ */
/* Popup / options  ->  background                                     */
/* ------------------------------------------------------------------ */

export type BackgroundRequest =
  | { type: 'GET_PAGE_INFO' }
  | { type: 'GET_JOB_STATE'; tabId: number }
  | { type: 'START_EXPORT'; tabId: number; settings: Settings }
  | { type: 'CANCEL_EXPORT'; jobId: string }
  | { type: 'START_SELECTION'; tabId: number }
  | { type: 'GET_SELECTION'; tabId: number }
  | { type: 'CLEAR_SELECTION'; tabId: number }
  | { type: 'OPEN_PRINT_DIALOG'; tabId: number };

export type BackgroundResponse =
  | { ok: true; type: 'PAGE_INFO'; page: PageInfo | null }
  | { ok: true; type: 'JOB_STATE'; job: ExportJobState | null }
  | { ok: true; type: 'EXPORT_STARTED'; jobId: string }
  | { ok: true; type: 'SELECTION'; selectors: string[] }
  | { ok: true; type: 'ACK' }
  | { ok: false; error: AppError };

/* ------------------------------------------------------------------ */
/* Background  ->  content script                                      */
/* ------------------------------------------------------------------ */

export type ContentRequest =
  | { type: 'PREPARE_PAGE'; jobId: string; options: PreparePageOptions }
  | { type: 'RESTORE_PAGE'; jobId: string }
  | { type: 'ENTER_SELECTION_MODE'; selectors: string[] }
  | { type: 'EXIT_SELECTION_MODE' }
  | { type: 'GET_SELECTORS' }
  | { type: 'SET_SELECTORS'; selectors: string[] }
  | { type: 'PRINT_PAGE' }
  | { type: 'PING' };

export type ContentResponse =
  | { ok: true; type: 'PREPARED'; result: PreparePageResult }
  | { ok: true; type: 'SELECTORS'; selectors: string[] }
  | { ok: true; type: 'PONG' }
  | { ok: true; type: 'ACK' }
  | { ok: false; error: AppError };

/* ------------------------------------------------------------------ */
/* Broadcasts                                                          */
/* ------------------------------------------------------------------ */

export type BroadcastMessage =
  | { type: 'JOB_UPDATE'; job: ExportJobState }
  | { type: 'SELECTION_UPDATE'; tabId: number; selectors: string[] }
  | { type: 'SETTINGS_UPDATED'; settings: Settings };

/* ------------------------------------------------------------------ */
/* Validators                                                          */
/* ------------------------------------------------------------------ */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTabId(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isJobId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 64;
}

/** Selector strings are only ever used with `querySelectorAll`, never eval'd. */
export const MAX_SELECTORS = 200;
export const MAX_SELECTOR_LENGTH = 500;

export function sanitizeSelectors(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    const selector = entry.trim();
    if (selector === '' || selector.length > MAX_SELECTOR_LENGTH) continue;
    // Reject markup and CSS-block characters. `>` is deliberately allowed:
    // it is the child combinator that every generated selector relies on.
    if (/[<{}]/.test(selector)) continue;
    seen.add(selector);
    if (seen.size >= MAX_SELECTORS) break;
  }
  return [...seen];
}

export function parseBackgroundRequest(value: unknown): BackgroundRequest | null {
  if (!isRecord(value) || typeof value.type !== 'string') return null;

  switch (value.type) {
    case 'GET_PAGE_INFO':
      return { type: 'GET_PAGE_INFO' };
    case 'GET_JOB_STATE':
      return isTabId(value.tabId) ? { type: 'GET_JOB_STATE', tabId: value.tabId } : null;
    case 'START_EXPORT':
      if (!isTabId(value.tabId)) return null;
      return {
        type: 'START_EXPORT',
        tabId: value.tabId,
        settings: validateSettings(value.settings),
      };
    case 'CANCEL_EXPORT':
      return isJobId(value.jobId) ? { type: 'CANCEL_EXPORT', jobId: value.jobId } : null;
    case 'START_SELECTION':
      return isTabId(value.tabId) ? { type: 'START_SELECTION', tabId: value.tabId } : null;
    case 'GET_SELECTION':
      return isTabId(value.tabId) ? { type: 'GET_SELECTION', tabId: value.tabId } : null;
    case 'CLEAR_SELECTION':
      return isTabId(value.tabId) ? { type: 'CLEAR_SELECTION', tabId: value.tabId } : null;
    case 'OPEN_PRINT_DIALOG':
      return isTabId(value.tabId) ? { type: 'OPEN_PRINT_DIALOG', tabId: value.tabId } : null;
    default:
      return null;
  }
}

export function parseContentRequest(value: unknown): ContentRequest | null {
  if (!isRecord(value) || typeof value.type !== 'string') return null;

  switch (value.type) {
    case 'PREPARE_PAGE': {
      if (!isJobId(value.jobId)) return null;
      const options = isRecord(value.options) ? value.options : {};
      return {
        type: 'PREPARE_PAGE',
        jobId: value.jobId,
        options: {
          cleanup: validateCleanup(options.cleanup),
          hiddenSelectors: sanitizeSelectors(options.hiddenSelectors),
        },
      };
    }
    case 'RESTORE_PAGE':
      return isJobId(value.jobId) ? { type: 'RESTORE_PAGE', jobId: value.jobId } : null;
    case 'ENTER_SELECTION_MODE':
      return { type: 'ENTER_SELECTION_MODE', selectors: sanitizeSelectors(value.selectors) };
    case 'EXIT_SELECTION_MODE':
      return { type: 'EXIT_SELECTION_MODE' };
    case 'GET_SELECTORS':
      return { type: 'GET_SELECTORS' };
    case 'SET_SELECTORS':
      return { type: 'SET_SELECTORS', selectors: sanitizeSelectors(value.selectors) };
    case 'PRINT_PAGE':
      return { type: 'PRINT_PAGE' };
    case 'PING':
      return { type: 'PING' };
    default:
      return null;
  }
}

export function parseBroadcast(value: unknown): BroadcastMessage | null {
  if (!isRecord(value) || typeof value.type !== 'string') return null;

  switch (value.type) {
    case 'JOB_UPDATE':
      return isExportJobState(value.job) ? { type: 'JOB_UPDATE', job: value.job } : null;
    case 'SELECTION_UPDATE':
      return isTabId(value.tabId)
        ? {
            type: 'SELECTION_UPDATE',
            tabId: value.tabId,
            selectors: sanitizeSelectors(value.selectors),
          }
        : null;
    case 'SETTINGS_UPDATED':
      return { type: 'SETTINGS_UPDATED', settings: validateSettings(value.settings) };
    default:
      return null;
  }
}

export function isExportPhase(value: unknown): value is ExportPhase {
  return typeof value === 'string' && (EXPORT_PHASES as readonly string[]).includes(value);
}

export function isExportJobState(value: unknown): value is ExportJobState {
  if (!isRecord(value)) return false;
  return (
    isJobId(value.jobId) &&
    isTabId(value.tabId) &&
    isExportPhase(value.phase) &&
    typeof value.startedAt === 'number' &&
    typeof value.updatedAt === 'number' &&
    typeof value.progress === 'number'
  );
}

export function isCancellable(phase: ExportPhase): boolean {
  return CANCELLABLE_PHASES.includes(phase);
}

export const PHASE_PROGRESS: Readonly<Record<ExportPhase, number>> = {
  idle: 0,
  preparing: 12,
  'loading-content': 38,
  generating: 68,
  downloading: 90,
  completed: 100,
  cancelled: 0,
  failed: 0,
};

export const PHASE_LABELS: Readonly<Record<ExportPhase, string>> = {
  idle: 'Ready',
  preparing: 'Preparing page',
  'loading-content': 'Loading content',
  generating: 'Generating PDF',
  downloading: 'Downloading',
  completed: 'Completed',
  cancelled: 'Cancelled',
  failed: 'Failed',
};
