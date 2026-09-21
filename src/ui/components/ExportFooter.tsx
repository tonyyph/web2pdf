import type { AppError, RecoveryAction } from '@/core/errors';
import { isCancellable, PHASE_LABELS, type ExportJobState } from '@/core/messages';

export interface ExportFooterProps {
  job: ExportJobState | null;
  error: AppError | null;
  supported: boolean;
  onExport: () => void;
  onCancel: () => void;
  onReset: () => void;
  onOpenSettings: () => void;
  onPrintDialog: () => void;
}

/**
 * Sticky footer: the single primary action plus every terminal state the
 * export pipeline can end in.
 */
export function ExportFooter({
  job,
  error,
  supported,
  onExport,
  onCancel,
  onReset,
  onOpenSettings,
  onPrintDialog,
}: ExportFooterProps) {
  const activeError = error ?? job?.error ?? null;
  const phase = job?.phase ?? 'idle';
  const running =
    phase === 'preparing' ||
    phase === 'loading-content' ||
    phase === 'generating' ||
    phase === 'downloading';

  return (
    <div
      className="sticky bottom-0 space-y-2 border-t border-slate-200 bg-slate-50/95 px-3 py-3
        backdrop-blur dark:border-slate-800 dark:bg-slate-950/95"
    >
      {job?.warning && running ? (
        <p className="text-[11px] text-amber-700 dark:text-amber-400" role="status">
          {job.warning}
        </p>
      ) : null}

      {running ? <ProgressBar job={job!} /> : null}

      {phase === 'completed' ? (
        <StatusBanner tone="success" message={`Saved ${job?.filename ?? 'the PDF'}`} />
      ) : null}

      {phase === 'cancelled' && !activeError ? (
        <StatusBanner tone="neutral" message="Export cancelled." />
      ) : null}

      {activeError && activeError.code !== 'CANCELLED' ? (
        <StatusBanner tone="error" message={activeError.userMessage} />
      ) : null}

      {activeError && activeError.code === 'CANCELLED' && phase !== 'cancelled' ? (
        <StatusBanner tone="neutral" message={activeError.userMessage} />
      ) : null}

      <div className="flex gap-2">
        {running ? (
          <>
            <button
              type="button"
              className="w2p-btn-primary flex-1"
              disabled
              aria-live="polite"
              aria-busy="true"
            >
              <Spinner />
              {PHASE_LABELS[phase]}…
            </button>
            {isCancellable(phase) ? (
              <button type="button" className="w2p-btn-subtle" onClick={onCancel}>
                Cancel
              </button>
            ) : null}
          </>
        ) : (
          <button
            type="button"
            className="w2p-btn-primary flex-1"
            disabled={!supported}
            onClick={phase === 'idle' ? onExport : handleRetry(onReset, onExport)}
          >
            <DownloadIcon />
            {phase === 'completed' ? 'Convert again' : 'Convert to PDF'}
          </button>
        )}
      </div>

      {activeError && !running ? (
        <RecoveryActions
          actions={activeError.actions}
          onRetry={handleRetry(onReset, onExport)}
          onOpenSettings={onOpenSettings}
          onPrintDialog={onPrintDialog}
        />
      ) : null}
    </div>
  );
}

function handleRetry(onReset: () => void, onExport: () => void): () => void {
  return () => {
    onReset();
    onExport();
  };
}

function RecoveryActions({
  actions,
  onRetry,
  onOpenSettings,
  onPrintDialog,
}: {
  actions: readonly RecoveryAction[];
  onRetry: () => void;
  onOpenSettings: () => void;
  onPrintDialog: () => void;
}) {
  const buttons: Array<{ key: RecoveryAction; label: string; onClick: () => void }> = [];

  for (const action of actions) {
    if (action === 'retry') buttons.push({ key: action, label: 'Try again', onClick: onRetry });
    if (action === 'open-settings') {
      buttons.push({ key: action, label: 'Open settings', onClick: onOpenSettings });
    }
    if (action === 'use-print-dialog') {
      buttons.push({ key: action, label: 'Use print dialog', onClick: onPrintDialog });
    }
    if (action === 'reload-page') {
      buttons.push({
        key: action,
        label: 'Reload page',
        onClick: () => {
          void chrome.tabs.reload();
          window.close();
        },
      });
    }
  }

  if (buttons.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {buttons.map((button) => (
        <button
          key={button.key}
          type="button"
          className="w2p-btn-ghost text-xs"
          onClick={button.onClick}
        >
          {button.label}
        </button>
      ))}
    </div>
  );
}

function ProgressBar({ job }: { job: ExportJobState }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-medium text-slate-700 dark:text-slate-300">
          {PHASE_LABELS[job.phase]}
        </span>
        <span className="tabular-nums text-slate-500 dark:text-slate-400">{job.progress}%</span>
      </div>
      <div
        className="h-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
        role="progressbar"
        aria-valuenow={job.progress}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Export progress"
      >
        <div
          className="h-full rounded-full bg-brand-600 transition-[width] duration-250 ease-[var(--ease-snap)]"
          style={{ width: `${job.progress}%` }}
        />
      </div>
    </div>
  );
}

function StatusBanner({
  tone,
  message,
}: {
  tone: 'success' | 'error' | 'neutral';
  message: string;
}) {
  const toneClass = {
    success: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300',
    error: 'bg-red-50 text-red-800 dark:bg-red-500/10 dark:text-red-300',
    neutral: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  }[tone];

  return (
    <p
      className={`truncate rounded-lg px-2.5 py-2 text-[11px] leading-snug ${toneClass}`}
      role={tone === 'error' ? 'alert' : 'status'}
      title={message}
    >
      {message}
    </p>
  );
}

function Spinner() {
  return (
    <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
    >
      <path d="M8 2.5v7m0 0 3-3m-3 3-3-3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2.5 11.5v1a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-1" strokeLinecap="round" />
    </svg>
  );
}
