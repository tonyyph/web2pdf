/**
 * The extension mark.
 *
 * Renders the supplied artwork itself (`public/icon/128.png`, served from the
 * extension root) rather than a redrawn SVG, so the popup, the toolbar and the
 * store listing all show exactly the same image.
 */
export function Logo({ className = 'h-6 w-6' }: { className?: string }) {
  return <img src="/icon/128.png" alt="" aria-hidden="true" className={className} />;
}
