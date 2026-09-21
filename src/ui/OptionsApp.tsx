import { useCallback, useEffect, useState } from 'react';
import { APP_NAME, DEFAULT_FILENAME_TEMPLATE } from '@/core/constants';
import { FILENAME_TOKENS, resolveFilename } from '@/core/filename';
import type { Settings, ThemeId } from '@/core/settings/schema';
import { loadSettings, resetSettings, saveSettings } from '@/services/storage.service';
import { ContentControls } from './components/ContentControls';
import { Logo } from './components/Logo';
import { QuickSettings } from './components/QuickSettings';
import { Field, Segmented, type SegmentOption } from './components/primitives';
import { useTheme } from './hooks/useTheme';
import { cloneDefaultSettings } from '@/core/settings/defaults';

const THEME_OPTIONS: readonly SegmentOption<ThemeId>[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

const PREVIEW_CONTEXT = {
  title: 'How browser extensions work',
  url: 'https://developer.chrome.com/docs/extensions',
};

export function OptionsApp() {
  const [settings, setSettings] = useState<Settings>(() => cloneDefaultSettings());
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState(false);

  useTheme(settings.theme);

  useEffect(() => {
    void loadSettings().then((loaded) => {
      setSettings(loaded);
      setReady(true);
    });
  }, []);

  const persist = useCallback((next: Settings) => {
    setSettings(next);
    void saveSettings(next).then((stored) => {
      setSettings(stored);
      setSaved(true);
      setTimeout(() => setSaved(false), 1600);
    });
  }, []);

  const onChange = useCallback((updater: (current: Settings) => Settings) => {
    setSettings((current) => {
      const next = updater(current);
      void saveSettings(next);
      return next;
    });
  }, []);

  const onReset = useCallback(() => {
    void resetSettings().then(setSettings);
  }, []);

  const filenamePreview = resolveFilename(settings.filenameTemplate, PREVIEW_CONTEXT);

  if (!ready) {
    return (
      <div className="mx-auto max-w-3xl p-8">
        <p className="text-sm text-slate-500">Loading settings…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="mx-auto max-w-3xl space-y-5 px-6 py-10">
        <header className="flex items-center gap-3">
          <Logo className="h-9 w-9" />
          <div className="flex-1">
            <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-50">
              {APP_NAME} settings
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Defaults for every export. Changes save automatically.
            </p>
          </div>
          {saved ? (
            <span
              className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700
                dark:bg-emerald-500/10 dark:text-emerald-400"
              role="status"
            >
              Saved
            </span>
          ) : null}
        </header>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Appearance</h2>
          <div className="w2p-card p-4">
            <Field label="Theme">
              <div className="max-w-xs">
                <Segmented
                  label="Theme"
                  value={settings.theme}
                  options={THEME_OPTIONS}
                  onChange={(theme) => persist({ ...settings, theme })}
                />
              </div>
            </Field>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Page setup</h2>
          <QuickSettings settings={settings} onChange={onChange} />
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Content and output
          </h2>
          <ContentControls
            settings={settings}
            onChange={onChange}
            selectionCount={0}
            onStartSelection={() => undefined}
            onClearSelection={() => undefined}
            disabled={false}
          />
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">File name</h2>
          <div className="w2p-card space-y-3 p-4">
            <Field
              label="Filename template"
              htmlFor="filename-template"
              hint={`Tokens: ${FILENAME_TOKENS.join(' ')}`}
            >
              <input
                id="filename-template"
                type="text"
                className="w2p-input"
                maxLength={200}
                value={settings.filenameTemplate}
                placeholder={DEFAULT_FILENAME_TEMPLATE}
                onChange={(event) =>
                  onChange((current) => ({ ...current, filenameTemplate: event.target.value }))
                }
              />
            </Field>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Preview:{' '}
              <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                {filenamePreview}
              </code>
            </p>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Privacy</h2>
          <div className="w2p-card space-y-2 p-4 text-sm text-slate-600 dark:text-slate-300">
            <p>
              Web2PDF converts pages entirely on this device. No page content, URL or generated PDF
              is ever sent to a server, and the extension makes no network requests of its own.
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              The <code className="font-mono">debugger</code> permission is what lets Chrome produce
              a real PDF of the live page. Web2PDF attaches only while an export runs and detaches
              immediately afterwards, which is why Chrome shows a banner on the tab during export.
            </p>
          </div>
        </section>

        <footer className="flex items-center justify-between border-t border-slate-200 pt-5 dark:border-slate-800">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Schema version {settings.schemaVersion}
          </p>
          <button type="button" className="w2p-btn-subtle" onClick={onReset}>
            Reset to defaults
          </button>
        </footer>
      </div>
    </div>
  );
}
