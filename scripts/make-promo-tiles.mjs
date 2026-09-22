#!/usr/bin/env node
/**
 * Render the Chrome Web Store promo tiles.
 *
 * Rendered in Chromium rather than rasterised from SVG: sharp's SVG backend
 * resolves fonts through fontconfig and silently substitutes, which is exactly
 * the kind of thing you only notice after uploading. A real browser gives the
 * same text shaping the popup already uses.
 *
 *   small promo tile   440x280   (listing tile - what this is mainly for)
 *   marquee promo tile 1400x560  (only used if Google features the extension)
 *
 * Run with: pnpm promo
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs/screenshots/store');

/** The same document-with-arrow mark as the extension icon. */
const LOGO = `
<svg viewBox="0 0 128 128" class="logo" aria-hidden="true">
  <rect width="128" height="128" rx="28" fill="rgba(255,255,255,0.16)"/>
  <path d="M28 30a8 8 0 0 1 8-8h40l24 24v52a8 8 0 0 1-8 8H36a8 8 0 0 1-8-8Z" fill="#FFFFFF"/>
  <path d="M76 22v16a8 8 0 0 0 8 8h16Z" fill="#FED7AA"/>
  <rect x="42" y="62" width="48" height="10" rx="5" fill="#F97316"/>
  <rect x="42" y="80" width="48" height="10" rx="5" fill="#F97316"/>
  <rect x="42" y="98" width="30" height="10" rx="5" fill="#FDBA74"/>
</svg>`;

function page({ width, height, scale }) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${width}px; height: ${height}px; overflow: hidden; }
  body {
    display: flex; align-items: center; gap: ${24 * scale}px;
    padding: 0 ${30 * scale}px;
    font-family: ui-sans-serif, system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif;
    background:
      radial-gradient(120% 140% at 88% 8%, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 55%),
      linear-gradient(135deg, #F97316 0%, #F97316 40%, #EA580C 100%);
    position: relative;
  }
  /* Faint sheets fanned out behind the text - reads as "pages", not clip-art. */
  .sheets { position: absolute; inset: 0; overflow: hidden; }
  .sheet {
    position: absolute; right: ${-30 * scale}px;
    width: ${120 * scale}px; height: ${156 * scale}px;
    border-radius: ${10 * scale}px;
    background: rgba(255,255,255,0.10);
    border: ${1.5 * scale}px solid rgba(255,255,255,0.18);
  }
  .s1 { top: ${26 * scale}px;  right: ${-46 * scale}px; transform: rotate(9deg); }
  .s2 { top: ${64 * scale}px;  right: ${22 * scale}px; transform: rotate(-6deg);
        background: rgba(255,255,255,0.07); }
  .logo { width: ${84 * scale}px; height: ${84 * scale}px; flex: 0 0 auto;
          filter: drop-shadow(0 ${6 * scale}px ${16 * scale}px rgba(15,23,42,0.35)); }
  .copy { position: relative; z-index: 1; }
  h1 {
    color: #fff; font-size: ${42 * scale}px; line-height: 1.02; white-space: nowrap;
    letter-spacing: ${-1.2 * scale}px; font-weight: 700;
  }
  p {
    color: rgba(255,255,255,0.90); font-size: ${14.5 * scale}px; white-space: nowrap;
    margin-top: ${10 * scale}px; letter-spacing: ${-0.1 * scale}px; font-weight: 500;
  }
  .rule {
    width: ${44 * scale}px; height: ${3 * scale}px; border-radius: ${3 * scale}px;
    background: rgba(255,255,255,0.55); margin-top: ${14 * scale}px;
  }
</style></head>
<body>
  <div class="sheets"><div class="sheet s1"></div><div class="sheet s2"></div></div>
  ${LOGO}
  <div class="copy">
    <h1>Web2PDF</h1>
    <p>Save any webpage as a clean PDF</p>
    <div class="rule"></div>
  </div>
</body></html>`;
}

const TILES = [
  { name: 'promo-small-440x280.png', width: 440, height: 280, scale: 1 },
  { name: 'promo-marquee-1400x560.png', width: 1400, height: 560, scale: 2.6 },
];

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();

try {
  for (const tile of TILES) {
    const context = await browser.newContext({
      viewport: { width: tile.width, height: tile.height },
      deviceScaleFactor: 1,
    });
    const p = await context.newPage();
    await p.setContent(page(tile), { waitUntil: 'load' });
    const buf = await p.screenshot({ type: 'png' });
    await writeFile(join(OUT, tile.name), buf);
    await context.close();
    console.log(
      `wrote store/${tile.name}  ${tile.width}x${tile.height}  ${(buf.length / 1024).toFixed(0)}KB`,
    );
  }
} finally {
  await browser.close();
}

console.log('\nPromo tiles ready in docs/screenshots/store/');
