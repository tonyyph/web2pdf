/**
 * The extension mark: a sheet with the download arrow knocked out of it.
 * Kept in sync with `assets/icon.svg`.
 */
export function Logo({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 128 128" fill="none" aria-hidden="true">
      <defs>
        <linearGradient
          id="w2p-logo-bg"
          x1="8"
          y1="0"
          x2="120"
          y2="128"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#FFC24A" />
          <stop offset="0.55" stopColor="#FB8B1E" />
          <stop offset="1" stopColor="#EE4E0B" />
        </linearGradient>
        <mask id="w2p-logo-cut">
          <rect width="128" height="128" fill="#000" />
          <path
            d="M38 24h34l22 22v58a8 8 0 0 1-8 8H38a8 8 0 0 1-8-8V32a8 8 0 0 1 8-8Z"
            fill="#fff"
          />
          <path d="M62 44v22" stroke="#000" strokeWidth="12" strokeLinecap="round" />
          <path d="M44 68h36L62 90Z" fill="#000" />
        </mask>
      </defs>

      <rect width="128" height="128" rx="30" fill="url(#w2p-logo-bg)" />
      <rect width="128" height="128" mask="url(#w2p-logo-cut)" fill="#fff" />
      <path d="M72 24v16a6 6 0 0 0 6 6h16Z" fill="#FFE2BC" />
    </svg>
  );
}
