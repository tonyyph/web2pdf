import type { PageInfo } from '@/core/messages';
import type { PageSupport } from '@/core/page-support';
import { extractDomain } from '@/core/filename';

export function PageCard({ page, support }: { page: PageInfo | null; support: PageSupport }) {
  if (!page) {
    return (
      <div className="w2p-card p-3">
        <p className="text-[13px] text-slate-500 dark:text-slate-400">Reading the active tab…</p>
      </div>
    );
  }

  const domain = extractDomain(page.url) || 'Unknown site';

  return (
    <div className="w2p-card p-3">
      <div className="flex items-start gap-2.5">
        {page.favIconUrl ? (
          <img
            src={page.favIconUrl}
            alt=""
            className="mt-0.5 h-5 w-5 shrink-0 rounded"
            onError={(event) => {
              event.currentTarget.style.visibility = 'hidden';
            }}
          />
        ) : (
          <div className="mt-0.5 h-5 w-5 shrink-0 rounded bg-slate-200 dark:bg-slate-700" />
        )}

        <div className="min-w-0 flex-1">
          <p
            className="truncate text-[13px] font-medium text-slate-900 dark:text-slate-100"
            title={page.title}
          >
            {page.title || 'Untitled page'}
          </p>
          <p className="truncate text-[11px] text-slate-500 dark:text-slate-400" title={page.url}>
            {domain}
          </p>
        </div>

        <StatusPill supported={support.supported} />
      </div>

      {!support.supported && support.explanation ? (
        <p
          className="mt-2.5 rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] leading-snug text-amber-800
            dark:bg-amber-500/10 dark:text-amber-300"
          role="status"
        >
          {support.explanation}
        </p>
      ) : null}
    </div>
  );
}

function StatusPill({ supported }: { supported: boolean }) {
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
        supported
          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
          : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
      }`}
    >
      {supported ? 'Ready' : 'Blocked'}
    </span>
  );
}
