/**
 * The extension mark, drawn to match `assets/icon-small.svg`.
 *
 * The supplied artwork is a raster whose two stacked elements merge below
 * about 48px; the popup renders this at 24px, so it uses the simplified
 * document form for the same reason the 16 and 32 PNGs do.
 */
export function Logo({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 128 128" fill="none" aria-hidden="true">
      <defs>
        <linearGradient
          id="w2p-logo-bg"
          x1="10"
          y1="4"
          x2="118"
          y2="124"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#F97316" />
          <stop offset="1" stopColor="#EA580C" />
        </linearGradient>
      </defs>

      <rect width="128" height="128" rx="30" fill="url(#w2p-logo-bg)" />
      <path d="M28 30a8 8 0 0 1 8-8h40l24 24v52a8 8 0 0 1-8 8H36a8 8 0 0 1-8-8Z" fill="#FFFFFF" />
      <path d="M76 22v16a8 8 0 0 0 8 8h16Z" fill="#FED7AA" />
      <rect x="42" y="62" width="48" height="10" rx="5" fill="#F97316" />
      <rect x="42" y="80" width="48" height="10" rx="5" fill="#F97316" />
      <rect x="42" y="98" width="30" height="10" rx="5" fill="#FDBA74" />
    </svg>
  );
}
