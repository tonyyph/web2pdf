import {
  PHASE_PROGRESS,
  type ExportJobState,
  type ExportPhase,
  isExportJobState,
} from '../core/messages';
import type { AppError } from '../core/errors';

/**
 * Export job state lives in `chrome.storage.session`, not in a worker
 * variable: an MV3 service worker can be suspended mid-export, and the popup
 * can be closed and reopened. Session storage is cleared when the browser
 * closes, so no export state outlives the browsing session.
 */

const JOB_KEY_PREFIX = 'web2pdf:job:';
const SELECTION_KEY_PREFIX = 'web2pdf:selection:';
const CANCEL_KEY_PREFIX = 'web2pdf:cancel:';

/** A job older than this is treated as abandoned (worker died mid-export). */
export const JOB_STALE_MS = 3 * 60 * 1000;

function jobKey(tabId: number): string {
  return `${JOB_KEY_PREFIX}${tabId}`;
}

function selectionKey(tabId: number): string {
  return `${SELECTION_KEY_PREFIX}${tabId}`;
}

function cancelKey(jobId: string): string {
  return `${CANCEL_KEY_PREFIX}${jobId}`;
}

export function createJobId(): string {
  return `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createJob(tabId: number): ExportJobState {
  const now = Date.now();
  return {
    jobId: createJobId(),
    tabId,
    phase: 'preparing',
    startedAt: now,
    updatedAt: now,
    progress: PHASE_PROGRESS.preparing,
  };
}

export async function readJob(tabId: number): Promise<ExportJobState | null> {
  const key = jobKey(tabId);
  const stored = await chrome.storage.session.get(key);
  const value = stored[key];
  if (!isExportJobState(value)) return null;

  const isTerminal =
    value.phase === 'completed' || value.phase === 'failed' || value.phase === 'cancelled';

  // A non-terminal job that stopped being updated means the worker was
  // suspended or crashed; report it as failed rather than hanging forever.
  if (!isTerminal && Date.now() - value.updatedAt > JOB_STALE_MS) {
    const recovered: ExportJobState = {
      ...value,
      phase: 'failed',
      progress: 0,
      updatedAt: Date.now(),
      error: {
        code: 'TIMEOUT',
        message: 'Job abandoned: no update within the stale window',
        userMessage: 'The export stopped unexpectedly. Please try again.',
        actions: ['retry'],
      },
    };
    await writeJob(recovered);
    return recovered;
  }

  return value;
}

export async function writeJob(job: ExportJobState): Promise<void> {
  await chrome.storage.session.set({ [jobKey(job.tabId)]: job });
}

export async function clearJob(tabId: number): Promise<void> {
  await chrome.storage.session.remove(jobKey(tabId));
}

export interface JobPatch {
  phase?: ExportPhase;
  filename?: string;
  warning?: string;
  error?: AppError;
  progress?: number;
}

export function applyJobPatch(job: ExportJobState, patch: JobPatch): ExportJobState {
  const phase = patch.phase ?? job.phase;
  const progress = patch.progress ?? PHASE_PROGRESS[phase];
  return {
    ...job,
    ...patch,
    phase,
    // Progress never goes backwards within a running job.
    progress: phase === 'failed' || phase === 'cancelled' ? 0 : Math.max(job.progress, progress),
    updatedAt: Date.now(),
  };
}

/* ---------------------------- cancellation ---------------------------- */

/**
 * Cancellation is a storage flag rather than an in-memory AbortController so
 * that a cancel issued after a worker restart is still observed.
 */
export async function requestCancel(jobId: string): Promise<void> {
  await chrome.storage.session.set({ [cancelKey(jobId)]: true });
}

export async function isCancelRequested(jobId: string): Promise<boolean> {
  const key = cancelKey(jobId);
  const stored = await chrome.storage.session.get(key);
  return stored[key] === true;
}

export async function clearCancel(jobId: string): Promise<void> {
  await chrome.storage.session.remove(cancelKey(jobId));
}

/* ------------------------- element selection -------------------------- */

export async function readSelection(tabId: number): Promise<string[]> {
  const key = selectionKey(tabId);
  const stored = await chrome.storage.session.get(key);
  const value = stored[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

export async function writeSelection(tabId: number, selectors: string[]): Promise<void> {
  await chrome.storage.session.set({ [selectionKey(tabId)]: selectors });
}

export async function clearSelection(tabId: number): Promise<void> {
  await chrome.storage.session.remove(selectionKey(tabId));
}

/** Drop everything tied to a tab when it is closed or navigates away. */
export async function clearTabState(tabId: number): Promise<void> {
  await chrome.storage.session.remove([jobKey(tabId), selectionKey(tabId)]);
}
