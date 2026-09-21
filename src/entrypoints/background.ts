import { defineBackground } from 'wxt/utils/define-background';
import { PREPARE_TIMEOUT_MS } from '@/core/constants';
import { createError, toAppError, type AppError } from '@/core/errors';
import { resolveFilename } from '@/core/filename';
import {
  parseBackgroundRequest,
  sanitizeSelectors,
  type BackgroundResponse,
  type ContentRequest,
  type ContentResponse,
  type ExportJobState,
  type PageInfo,
  type PreparePageResult,
} from '@/core/messages';
import { getPageSupport } from '@/core/page-support';
import { buildPrintParams } from '@/core/print-params';
import type { Settings } from '@/core/settings/schema';
import { downloadPdf } from '@/services/download.service';
import {
  applyJobPatch,
  clearCancel,
  clearJob,
  clearSelection,
  clearTabState,
  createJob,
  isCancelRequested,
  readJob,
  readSelection,
  requestCancel,
  writeJob,
  writeSelection,
  type JobPatch,
} from '@/services/job.store';
import { generatePdf } from '@/services/pdf.service';
import { ensureSettingsMigrated } from '@/services/storage.service';
import { isPageVeryLong } from '@/services/prepare.service';

/** Built page-agent path, as emitted by WXT. */
const PAGE_AGENT_FILE = 'page-agent.js';

export default defineBackground(() => {
  chrome.runtime.onInstalled.addListener(() => {
    void ensureSettingsMigrated();
  });

  // Page state is per-tab and must not survive a navigation or a closed tab.
  chrome.tabs.onRemoved.addListener((tabId) => void clearTabState(tabId));
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'loading' && changeInfo.url) void clearTabState(tabId);
  });

  chrome.runtime.onMessage.addListener((rawMessage, sender, sendResponse) => {
    // The content script reports selection changes without knowing its tab id.
    if (
      typeof rawMessage === 'object' &&
      rawMessage !== null &&
      (rawMessage as { type?: unknown }).type === 'SELECTION_UPDATE'
    ) {
      const tabId = sender.tab?.id;
      if (typeof tabId === 'number') {
        const selectors = sanitizeSelectors((rawMessage as { selectors?: unknown }).selectors);
        void writeSelection(tabId, selectors).then(() => {
          broadcast({ type: 'SELECTION_UPDATE', tabId, selectors });
        });
      }
      sendResponse({ ok: true, type: 'ACK' } satisfies BackgroundResponse);
      return false;
    }

    const request = parseBackgroundRequest(rawMessage);
    if (!request) {
      sendResponse({
        ok: false,
        error: createError('INVALID_MESSAGE'),
      } satisfies BackgroundResponse);
      return false;
    }

    handleRequest(request).then(sendResponse, (error: unknown) => {
      sendResponse({ ok: false, error: toAppError(error) } satisfies BackgroundResponse);
    });
    return true;
  });
});

function broadcast(message: unknown): void {
  // No receiver (popup closed) is the normal case, not an error.
  void chrome.runtime.sendMessage(message).catch(() => undefined);
}

async function handleRequest(
  request: NonNullable<ReturnType<typeof parseBackgroundRequest>>,
): Promise<BackgroundResponse> {
  switch (request.type) {
    case 'GET_PAGE_INFO':
      return { ok: true, type: 'PAGE_INFO', page: await getActivePage() };

    case 'GET_JOB_STATE':
      return { ok: true, type: 'JOB_STATE', job: await readJob(request.tabId) };

    case 'START_EXPORT':
      return startExport(request.tabId, request.settings);

    case 'CANCEL_EXPORT':
      await requestCancel(request.jobId);
      return { ok: true, type: 'ACK' };

    case 'START_SELECTION': {
      // Re-entering selection mode must show what is already marked, or the
      // popup's count and the page would disagree.
      const selectors = await readSelection(request.tabId);
      const result = await sendToContent(request.tabId, {
        type: 'ENTER_SELECTION_MODE',
        selectors,
      });
      return result.ok ? { ok: true, type: 'ACK' } : { ok: false, error: result.error };
    }

    case 'GET_SELECTION':
      return { ok: true, type: 'SELECTION', selectors: await readSelection(request.tabId) };

    case 'CLEAR_SELECTION':
      await clearSelection(request.tabId);
      await sendToContent(request.tabId, { type: 'EXIT_SELECTION_MODE' });
      broadcast({ type: 'SELECTION_UPDATE', tabId: request.tabId, selectors: [] });
      return { ok: true, type: 'ACK' };

    case 'OPEN_PRINT_DIALOG': {
      const result = await sendToContent(request.tabId, { type: 'PRINT_PAGE' });
      return result.ok ? { ok: true, type: 'ACK' } : { ok: false, error: result.error };
    }
  }
}

async function getActivePage(): Promise<PageInfo | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || typeof tab.id !== 'number') return null;
  return {
    tabId: tab.id,
    url: tab.url ?? '',
    title: tab.title ?? '',
    ...(tab.favIconUrl ? { favIconUrl: tab.favIconUrl } : {}),
  };
}

/* ----------------------- content-script plumbing ----------------------- */

type ContentResult =
  { ok: true; response: Extract<ContentResponse, { ok: true }> } | { ok: false; error: AppError };

/**
 * Inject the content script on demand. `activeTab` makes this legal only for
 * a tab the user just acted on, which is exactly when we do it. Injecting an
 * already-present script is a no-op because the script guards its own setup.
 */
async function ensureContentScript(tabId: number): Promise<boolean> {
  const ping = await rawSendToContent(tabId, { type: 'PING' });
  if (ping.ok) return true;

  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: [PAGE_AGENT_FILE] });
  } catch {
    return false;
  }

  const retry = await rawSendToContent(tabId, { type: 'PING' });
  return retry.ok;
}

function rawSendToContent(tabId: number, message: ContentRequest): Promise<ContentResult> {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (response: unknown) => {
      if (chrome.runtime.lastError) {
        resolve({
          ok: false,
          error: createError('PAGE_PREPARATION_FAILED', chrome.runtime.lastError.message ?? ''),
        });
        return;
      }
      if (typeof response !== 'object' || response === null) {
        resolve({ ok: false, error: createError('INVALID_MESSAGE', 'Empty content response') });
        return;
      }
      const typed = response as ContentResponse;
      if (typed.ok) resolve({ ok: true, response: typed });
      else resolve({ ok: false, error: typed.error });
    });
  });
}

async function sendToContent(tabId: number, message: ContentRequest): Promise<ContentResult> {
  const ready = await ensureContentScript(tabId);
  if (!ready) {
    return {
      ok: false,
      error: createError('PAGE_PREPARATION_FAILED', 'Content script could not be injected'),
    };
  }
  return rawSendToContent(tabId, message);
}

function withDeadline<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(createError('TIMEOUT', `${label} exceeded ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/* ---------------------------- export pipeline --------------------------- */

class CancelledError extends Error {
  constructor() {
    super('Export cancelled by user');
    this.name = 'CancelledError';
  }
}

async function startExport(tabId: number, settings: Settings): Promise<BackgroundResponse> {
  const existing = await readJob(tabId);
  if (existing && !isTerminal(existing)) {
    return { ok: true, type: 'EXPORT_STARTED', jobId: existing.jobId };
  }

  const tab = await chrome.tabs.get(tabId).catch(() => null);
  const support = getPageSupport(tab?.url);
  if (!support.supported) {
    const error = createError('UNSUPPORTED_PAGE', support.explanation ?? 'Page is not exportable');
    await writeJob(applyJobPatch(createJob(tabId), { phase: 'failed', error }));
    return { ok: false, error };
  }

  const job = createJob(tabId);
  await clearCancel(job.jobId);
  await writeJob(job);
  broadcast({ type: 'JOB_UPDATE', job });

  // Run detached: the popup gets its jobId immediately and follows progress
  // through broadcasts and session storage, so closing it is harmless.
  void runExport(job, settings, tab?.url ?? '', tab?.title ?? '');

  return { ok: true, type: 'EXPORT_STARTED', jobId: job.jobId };
}

function isTerminal(job: ExportJobState): boolean {
  return job.phase === 'completed' || job.phase === 'failed' || job.phase === 'cancelled';
}

async function runExport(
  initialJob: ExportJobState,
  settings: Settings,
  url: string,
  title: string,
): Promise<void> {
  const { tabId, jobId } = initialJob;
  let job = initialJob;
  let preparationStarted = false;

  const update = async (patch: JobPatch): Promise<void> => {
    job = applyJobPatch(job, patch);
    await writeJob(job);
    broadcast({ type: 'JOB_UPDATE', job });
  };

  const checkCancelled = async (): Promise<void> => {
    if (await isCancelRequested(jobId)) throw new CancelledError();
  };

  try {
    await checkCancelled();

    const hiddenSelectors = await readSelection(tabId);
    await update({ phase: 'preparing' });

    preparationStarted = true;
    const prepared = await withDeadline(
      sendToContent(tabId, {
        type: 'PREPARE_PAGE',
        jobId,
        options: { cleanup: settings.cleanup, hiddenSelectors },
      }),
      PREPARE_TIMEOUT_MS,
      'Page preparation',
    );

    if (!prepared.ok) throw prepared.error;
    if (prepared.response.type !== 'PREPARED') {
      throw createError('PAGE_PREPARATION_FAILED', 'Unexpected content response');
    }

    const result: PreparePageResult = prepared.response.result;
    await update({
      phase: 'loading-content',
      ...(isPageVeryLong(result.documentHeight)
        ? { warning: 'This page is very long - the PDF may take a while and run to many pages.' }
        : {}),
    });

    await checkCancelled();

    // Past this point the debugger is attached and the export is no longer
    // cancellable; the UI disables Cancel for exactly this reason.
    await update({ phase: 'generating' });

    const params = buildPrintParams(settings, { title, url });
    const pdf = await generatePdf(tabId, params);
    if (!pdf.ok) throw pdf.error;

    await update({ phase: 'downloading' });

    const filename = resolveFilename(settings.filenameTemplate, { title, url });
    const download = await downloadPdf({ base64: pdf.value, filename });
    if (!download.ok) throw download.error;

    await update({ phase: 'completed', filename, progress: 100 });
  } catch (error) {
    const appError = error instanceof CancelledError ? createError('CANCELLED') : toAppError(error);
    await update(
      appError.code === 'CANCELLED'
        ? { phase: 'cancelled', error: appError }
        : { phase: 'failed', error: appError },
    );
  } finally {
    // Restore the page whatever happened; `generatePdf` has already detached
    // the debugger in its own `finally`.
    if (preparationStarted) {
      await sendToContent(tabId, { type: 'RESTORE_PAGE', jobId }).catch(() => undefined);
    }
    await clearCancel(jobId);
    scheduleJobCleanup(tabId);
  }
}

/**
 * Clear a finished job shortly after it settles so a reopened popup shows a
 * fresh state. `chrome.alarms` would be the durable choice, but this cleanup
 * is cosmetic - `readJob` already ages out stale jobs on read.
 */
function scheduleJobCleanup(tabId: number): void {
  setTimeout(() => {
    void readJob(tabId).then((job) => {
      if (job && isTerminal(job) && Date.now() - job.updatedAt >= 30_000) {
        void clearJob(tabId);
      }
    });
  }, 30_000);
}
