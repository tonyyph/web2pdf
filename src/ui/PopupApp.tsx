import { useCallback } from 'react';
import { APP_NAME, APP_TAGLINE } from '@/core/constants';
import { ContentControls } from './components/ContentControls';
import { ExportFooter } from './components/ExportFooter';
import { Logo } from './components/Logo';
import { PageCard } from './components/PageCard';
import { QuickSettings } from './components/QuickSettings';
import { useExportController } from './hooks/useExportController';
import { useTheme } from './hooks/useTheme';
import { useAppStore } from './store';

export function PopupApp() {
  const ready = useAppStore((state) => state.ready);
  const settings = useAppStore((state) => state.settings);
  const page = useAppStore((state) => state.page);
  const support = useAppStore((state) => state.support);
  const job = useAppStore((state) => state.job);
  const selection = useAppStore((state) => state.selection);
  const error = useAppStore((state) => state.error);
  const updateSettings = useAppStore((state) => state.updateSettings);

  useTheme(settings.theme);

  const controller = useExportController();

  const onChangeSettings = useCallback(
    (updater: (current: typeof settings) => typeof settings) => {
      void updateSettings(updater);
    },
    [updateSettings],
  );

  const openSettings = useCallback(() => {
    void chrome.runtime.openOptionsPage();
  }, []);

  const busy =
    job?.phase === 'preparing' ||
    job?.phase === 'loading-content' ||
    job?.phase === 'generating' ||
    job?.phase === 'downloading';

  return (
    <div className="flex h-full w-[400px] flex-col bg-slate-50 dark:bg-slate-950">
      <header className="flex items-center gap-2.5 px-3 pt-3 pb-2">
        <Logo />
        <div className="min-w-0 flex-1">
          <h1 className="text-[15px] leading-tight font-semibold text-slate-900 dark:text-slate-50">
            {APP_NAME}
          </h1>
          <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{APP_TAGLINE}</p>
        </div>
        <button
          type="button"
          className="w2p-btn-ghost px-2"
          onClick={openSettings}
          aria-label="Open settings"
          title="Settings"
        >
          <GearIcon />
        </button>
      </header>

      <main className="flex-1 space-y-2.5 overflow-y-auto px-3 pb-3">
        <PageCard page={page} support={support} />

        {ready ? (
          <>
            <QuickSettings
              settings={settings}
              onChange={onChangeSettings}
              disabled={busy || !support.supported}
            />
            <ContentControls
              settings={settings}
              onChange={onChangeSettings}
              selectionCount={selection.length}
              onStartSelection={() => void controller.startSelection()}
              onClearSelection={() => void controller.clearSelection()}
              disabled={busy || !support.supported}
            />
          </>
        ) : (
          <SettingsSkeleton />
        )}
      </main>

      <ExportFooter
        job={job}
        error={error}
        supported={support.supported}
        onExport={() => void controller.startExport()}
        onCancel={() => void controller.cancelExport()}
        onReset={controller.resetJob}
        onOpenSettings={openSettings}
        onPrintDialog={() => void controller.openPrintDialog()}
      />
    </div>
  );
}

function SettingsSkeleton() {
  return (
    <div className="space-y-2.5" aria-hidden="true">
      <div className="w2p-card h-40 animate-pulse" />
      <div className="w2p-card h-28 animate-pulse" />
    </div>
  );
}

function GearIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="2.25" />
      <path d="M8 1.5v1.6M8 12.9v1.6M14.5 8h-1.6M3.1 8H1.5m10.1-4.6-1.1 1.1M5.5 10.5l-1.1 1.1m0-7.2 1.1 1.1m5 5 1.1 1.1" />
    </svg>
  );
}
