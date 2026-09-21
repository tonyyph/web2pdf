import type { Settings } from '@/core/settings/schema';
import { isValidPageRanges } from '@/core/settings/validate';
import { Disclosure, Field, Toggle } from './primitives';

export interface ContentControlsProps {
  settings: Settings;
  onChange: (updater: (settings: Settings) => Settings) => void;
  selectionCount: number;
  onStartSelection: () => void;
  onClearSelection: () => void;
  disabled?: boolean;
}

export function ContentControls({
  settings,
  onChange,
  selectionCount,
  onStartSelection,
  onClearSelection,
  disabled,
}: ContentControlsProps) {
  const { cleanup, headerFooter, page } = settings;

  const setCleanup = (patch: Partial<Settings['cleanup']>): void =>
    onChange((current) => ({ ...current, cleanup: { ...current.cleanup, ...patch } }));

  const setHeaderFooter = (patch: Partial<Settings['headerFooter']>): void =>
    onChange((current) => ({
      ...current,
      headerFooter: { ...current.headerFooter, ...patch },
    }));

  const rangesValid = isValidPageRanges(page.pageRanges);

  return (
    <div className="w2p-card space-y-3 p-3">
      <div className="space-y-2.5">
        <Toggle
          label="Clean page"
          description="Hide ads, cookie banners and floating bars"
          checked={cleanup.hideAds && cleanup.hideCookieBanners && cleanup.hideStickyElements}
          disabled={disabled}
          onChange={(enabled) =>
            setCleanup({
              hideAds: enabled,
              hideCookieBanners: enabled,
              hideStickyElements: enabled,
            })
          }
        />
        <Toggle
          label="Load lazy content"
          description="Scroll the page first so deferred images load"
          checked={cleanup.loadLazyContent}
          disabled={disabled}
          onChange={(loadLazyContent) => setCleanup({ loadLazyContent })}
        />
      </div>

      <div className="flex items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
        <button
          type="button"
          className="w2p-btn-subtle flex-1"
          onClick={onStartSelection}
          disabled={disabled}
        >
          <RemoveIcon />
          {selectionCount > 0 ? `Remove ${selectionCount} selected` : 'Select elements to remove'}
        </button>
        {selectionCount > 0 ? (
          <button
            type="button"
            className="w2p-btn-ghost"
            onClick={onClearSelection}
            disabled={disabled}
            aria-label="Clear selected elements"
          >
            Clear
          </button>
        ) : null}
      </div>

      <div className="border-t border-slate-100 pt-1 dark:border-slate-800">
        <Disclosure title="Advanced options">
          <Toggle
            label="Reader mode"
            description="Strip the page down to the article body"
            checked={cleanup.readerMode}
            disabled={disabled}
            onChange={(readerMode) => setCleanup({ readerMode })}
          />
          <Toggle
            label="Hide navigation"
            description="Remove headers, navs and footers"
            checked={cleanup.hideNavigation}
            disabled={disabled}
            onChange={(hideNavigation) => setCleanup({ hideNavigation })}
          />
          <Toggle
            label="Expand collapsed sections"
            description="Open every <details> block before exporting"
            checked={cleanup.expandCollapsed}
            disabled={disabled}
            onChange={(expandCollapsed) => setCleanup({ expandCollapsed })}
          />
          <Toggle
            label="Prefer CSS page size"
            description="Respect the site's own @page size rule"
            checked={page.preferCssPageSize}
            disabled={disabled}
            onChange={(preferCssPageSize) =>
              onChange((current) => ({
                ...current,
                page: { ...current.page, preferCssPageSize },
              }))
            }
          />
          <Toggle
            label="Header and footer"
            description="Print the title, URL and page numbers"
            checked={headerFooter.enabled}
            disabled={disabled}
            onChange={(enabled) => setHeaderFooter({ enabled })}
          />

          {headerFooter.enabled ? (
            <div className="ml-1 space-y-2 border-l border-slate-200 pl-3 dark:border-slate-700">
              <Toggle
                label="Page title"
                checked={headerFooter.showTitle}
                disabled={disabled}
                onChange={(showTitle) => setHeaderFooter({ showTitle })}
              />
              <Toggle
                label="Page URL"
                checked={headerFooter.showUrl}
                disabled={disabled}
                onChange={(showUrl) => setHeaderFooter({ showUrl })}
              />
              <Toggle
                label="Export date"
                checked={headerFooter.showDate}
                disabled={disabled}
                onChange={(showDate) => setHeaderFooter({ showDate })}
              />
              <Toggle
                label="Page numbers"
                checked={headerFooter.showPageNumbers}
                disabled={disabled}
                onChange={(showPageNumbers) => setHeaderFooter({ showPageNumbers })}
              />
              <Field label="Custom text" htmlFor="custom-text">
                <input
                  id="custom-text"
                  type="text"
                  className="w2p-input"
                  maxLength={200}
                  value={headerFooter.customText}
                  disabled={disabled}
                  placeholder="Confidential draft"
                  onChange={(event) => setHeaderFooter({ customText: event.target.value })}
                />
              </Field>
            </div>
          ) : null}

          <Field
            label="Page ranges"
            htmlFor="page-ranges"
            hint={rangesValid ? 'Leave empty for all pages. Example: 1-5, 8' : undefined}
          >
            <input
              id="page-ranges"
              type="text"
              className="w2p-input"
              value={page.pageRanges}
              disabled={disabled}
              placeholder="All pages"
              aria-invalid={!rangesValid}
              onChange={(event) =>
                onChange((current) => ({
                  ...current,
                  page: { ...current.page, pageRanges: event.target.value },
                }))
              }
            />
            {!rangesValid ? (
              <p className="text-[11px] text-red-600 dark:text-red-400">
                Use numbers and ranges, e.g. 1-5, 8, 11-13.
              </p>
            ) : null}
          </Field>
        </Disclosure>
      </div>
    </div>
  );
}

function RemoveIcon() {
  return (
    <svg
      className="h-3.5 w-3.5"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
    >
      <rect x="2.5" y="2.5" width="11" height="11" rx="2" strokeDasharray="2.5 2" />
      <path d="M6 8h4" strokeLinecap="round" />
    </svg>
  );
}
