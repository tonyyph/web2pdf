import { useCallback, useEffect } from 'react';
import { parseBroadcast, type ExportJobState } from '@/core/messages';
import { onRuntimeMessage, sendToBackground } from '../messaging';
import { useAppStore } from '../store';

/**
 * Wires the popup to the background worker: loads the active tab, restores any
 * in-flight job (the popup may have been closed and reopened) and subscribes
 * to progress broadcasts.
 */
export function useExportController() {
  const page = useAppStore((state) => state.page);
  const job = useAppStore((state) => state.job);
  const settings = useAppStore((state) => state.settings);
  const setPage = useAppStore((state) => state.setPage);
  const setJob = useAppStore((state) => state.setJob);
  const setSelection = useAppStore((state) => state.setSelection);
  const setError = useAppStore((state) => state.setError);
  const hydrate = useAppStore((state) => state.hydrate);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async (): Promise<void> => {
      await hydrate();
      const info = await sendToBackground({ type: 'GET_PAGE_INFO' }, 'PAGE_INFO');
      if (cancelled) return;

      if (!info.ok) {
        setError(info.error);
        return;
      }

      const activePage = info.value.page;
      setPage(activePage);
      if (!activePage) return;

      const [existingJob, selection] = await Promise.all([
        sendToBackground({ type: 'GET_JOB_STATE', tabId: activePage.tabId }, 'JOB_STATE'),
        sendToBackground({ type: 'GET_SELECTION', tabId: activePage.tabId }, 'SELECTION'),
      ]);
      if (cancelled) return;

      if (existingJob.ok) setJob(existingJob.value.job);
      if (selection.ok) setSelection(selection.value.selectors);
    };

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [hydrate, setError, setJob, setPage, setSelection]);

  useEffect(() => {
    return onRuntimeMessage((message) => {
      const broadcastMessage = parseBroadcast(message);
      if (!broadcastMessage) return;

      if (broadcastMessage.type === 'JOB_UPDATE') {
        const current = useAppStore.getState().page;
        if (current && broadcastMessage.job.tabId === current.tabId) {
          setJob(broadcastMessage.job as ExportJobState);
        }
      }

      if (broadcastMessage.type === 'SELECTION_UPDATE') {
        const current = useAppStore.getState().page;
        if (current && broadcastMessage.tabId === current.tabId) {
          setSelection(broadcastMessage.selectors);
        }
      }
    });
  }, [setJob, setSelection]);

  const startExport = useCallback(async () => {
    if (!page) return;
    setError(null);
    setJob({
      jobId: 'pending',
      tabId: page.tabId,
      phase: 'preparing',
      startedAt: Date.now(),
      updatedAt: Date.now(),
      progress: 5,
    });

    const result = await sendToBackground(
      { type: 'START_EXPORT', tabId: page.tabId, settings },
      'EXPORT_STARTED',
    );

    if (!result.ok) {
      setJob(null);
      setError(result.error);
    }
  }, [page, settings, setError, setJob]);

  const cancelExport = useCallback(async () => {
    if (!job || job.jobId === 'pending') return;
    await sendToBackground({ type: 'CANCEL_EXPORT', jobId: job.jobId }, 'ACK');
  }, [job]);

  const resetJob = useCallback(() => {
    setJob(null);
    setError(null);
  }, [setError, setJob]);

  const startSelection = useCallback(async () => {
    if (!page) return;
    const result = await sendToBackground({ type: 'START_SELECTION', tabId: page.tabId }, 'ACK');
    if (!result.ok) {
      setError(result.error);
      return;
    }
    // The user must interact with the page, so the popup gets out of the way.
    window.close();
  }, [page, setError]);

  const clearSelection = useCallback(async () => {
    if (!page) return;
    await sendToBackground({ type: 'CLEAR_SELECTION', tabId: page.tabId }, 'ACK');
    setSelection([]);
  }, [page, setSelection]);

  const openPrintDialog = useCallback(async () => {
    if (!page) return;
    await sendToBackground({ type: 'OPEN_PRINT_DIALOG', tabId: page.tabId }, 'ACK');
    window.close();
  }, [page]);

  return {
    startExport,
    cancelExport,
    resetJob,
    startSelection,
    clearSelection,
    openPrintDialog,
  };
}
