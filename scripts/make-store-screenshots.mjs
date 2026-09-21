#!/usr/bin/env node
/**
 * Compose Chrome Web Store screenshots at the required 1280x800.
 *
 * The raw popup captures are 400x600 - the popup's true size, right for the
 * README but not a valid store asset. This places each one over a real page
 * backdrop, roughly where the popup actually appears, so the listing shows the
 * extension in use rather than a UI cut-out on a blank field.
 *
 * Run with: pnpm screenshots:store
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = join(ROOT, 'docs/screenshots');
const OUT = join(ROOT, 'docs/screenshots/store');

const W = 1280;
const H = 800;
const POPUP_W = 400;
const POPUP_H = 600;
/** Where the real popup sits: under the toolbar, inset from the right edge. */
const POPUP_X = W - POPUP_W - 72;
const POPUP_Y = 64;
const RADIUS = 14;

/** Round the popup's corners so it reads as a floating panel. */
function roundedMask(width, height, radius) {
  return Buffer.from(
    `<svg width="${width}" height="${height}"><rect x="0" y="0" width="${width}" height="${height}" rx="${radius}" ry="${radius}" fill="#fff"/></svg>`,
  );
}

/** Soft drop shadow, drawn as its own blurred layer behind the popup. */
async function shadowLayer() {
  const pad = 40;
  const svg = Buffer.from(
    `<svg width="${POPUP_W + pad * 2}" height="${POPUP_H + pad * 2}">
       <rect x="${pad}" y="${pad + 6}" width="${POPUP_W}" height="${POPUP_H}"
             rx="${RADIUS}" ry="${RADIUS}" fill="rgba(2,6,23,0.55)"/>
     </svg>`,
  );
  return sharp(svg).blur(18).png().toBuffer();
}

async function compose({ popup, backdrop, out, dark }) {
  const popupPng = await sharp(await readFile(join(SHOTS, popup)))
    .resize(POPUP_W, POPUP_H, { fit: 'cover' })
    .composite([{ input: roundedMask(POPUP_W, POPUP_H, RADIUS), blend: 'dest-in' }])
    .png()
    .toBuffer();

  // Backdrop: the real article, softened so it frames rather than competes.
  const base = sharp(await readFile(join(SHOTS, backdrop)))
    .resize(W, H, { fit: 'cover', position: 'top' })
    .blur(2.5)
    .modulate(dark ? { brightness: 0.42, saturation: 0.75 } : { brightness: 0.94 });

  const tint = Buffer.from(
    `<svg width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="${
      dark ? 'rgba(2,6,23,0.55)' : 'rgba(248,250,252,0.35)'
    }"/></svg>`,
  );

  const shadow = await shadowLayer();

  const png = await base
    .composite([
      { input: tint, top: 0, left: 0 },
      { input: shadow, top: POPUP_Y - 40, left: POPUP_X - 40 },
      { input: popupPng, top: POPUP_Y, left: POPUP_X },
    ])
    .png({ compressionLevel: 9 })
    .toBuffer();

  await writeFile(join(OUT, out), png);
  const { width, height } = await sharp(png).metadata();
  console.log(`wrote store/${out}  ${width}x${height}  ${(png.length / 1024).toFixed(0)}KB`);
}

async function passthrough(name) {
  const png = await sharp(await readFile(join(SHOTS, name)))
    .resize(W, H, { fit: 'cover', position: 'top' })
    .png({ compressionLevel: 9 })
    .toBuffer();
  await writeFile(join(OUT, name), png);
  const { width, height } = await sharp(png).metadata();
  console.log(`wrote store/${name}  ${width}x${height}  ${(png.length / 1024).toFixed(0)}KB`);
}

await mkdir(OUT, { recursive: true });

await compose({
  popup: 'popup-light.png',
  backdrop: 'source-page.png',
  out: 'store-1-popup-light.png',
  dark: false,
});
await compose({
  popup: 'popup-dark.png',
  backdrop: 'source-page.png',
  out: 'store-2-popup-dark.png',
  dark: true,
});
await compose({
  popup: 'popup-success.png',
  backdrop: 'source-page.png',
  out: 'store-3-export-complete.png',
  dark: false,
});
await compose({
  popup: 'popup-unsupported.png',
  backdrop: 'source-page.png',
  out: 'store-5-unsupported-page.png',
  dark: false,
});

// Already the right size - copied through so every store asset sits together.
await passthrough('selection-mode.png');
await passthrough('options.png');

console.log('\nStore assets ready in docs/screenshots/store/');
