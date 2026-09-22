#!/usr/bin/env node
/**
 * Rasterise assets/icon.svg into the PNG sizes the extension manifest needs.
 *
 * `sharp` is a devDependency only - nothing here is shipped in the extension.
 * Run with: pnpm icons
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const OUT_DIR = resolve(ROOT, 'public/icon');

/**
 * Small sizes use a simplified mark. The full sheet-and-fold silhouette holds
 * up at 48 and 128; at 16 and 32 the knocked-out arrow inside the sheet is too
 * few pixels wide to read, so those sizes get the arrow-only variant.
 */
const SOURCES = {
  16: resolve(ROOT, 'assets/icon-small.svg'),
  32: resolve(ROOT, 'assets/icon-small.svg'),
  48: resolve(ROOT, 'assets/icon.svg'),
  128: resolve(ROOT, 'assets/icon.svg'),
};
const SIZES = [16, 32, 48, 128];

async function main() {
  let sharp;
  try {
    ({ default: sharp } = await import('sharp'));
  } catch {
    console.error(
      'Could not load "sharp". Install dev dependencies first (pnpm install), then re-run pnpm icons.',
    );
    process.exitCode = 1;
    return;
  }

  await mkdir(OUT_DIR, { recursive: true });

  for (const size of SIZES) {
    const svg = await readFile(SOURCES[size]);
    const png = await sharp(svg, { density: 384 })
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9, palette: false })
      .toBuffer();

    const target = resolve(OUT_DIR, `${size}.png`);
    await writeFile(target, png);
    console.log(`wrote public/icon/${size}.png (${png.length} bytes)`);
  }
}

await main();
