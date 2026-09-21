/** Document outline with a downward arrow: "page, saved". */
export function Logo({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect x="1" y="1" width="30" height="30" rx="8" fill="url(#w2p-logo-gradient)" />
      <path
        d="M11 8h6.5L22 12.5V21a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2Z"
        fill="white"
        fillOpacity="0.95"
      />
      <path d="M17.5 8v3.5a1 1 0 0 0 1 1H22" fill="white" fillOpacity="0.6" />
      <path
        d="M16 14.5v4.2m0 0 2-2m-2 2-2-2"
        stroke="currentColor"
        className="text-brand-600"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <defs>
        <linearGradient id="w2p-logo-gradient" x1="0" y1="0" x2="32" y2="32">
          <stop stopColor="#6366f1" />
          <stop offset="1" stopColor="#4338ca" />
        </linearGradient>
      </defs>
    </svg>
  );
}
