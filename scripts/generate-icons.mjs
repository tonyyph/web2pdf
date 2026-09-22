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
 * 48 and 128 come from the supplied artwork (`assets/icon-source.png`, a 1024
 * master trimmed and squared from the original export). 16 and 32 come from a
 * simplified SVG: the full artwork's two stacked elements merge into a smudge
 * below 48, so those sizes show only the output document, on the same tile and
 * palette.
 */
const SOURCES = {
  16: resolve(ROOT, 'assets/icon-small.svg'),
  32: resolve(ROOT, 'assets/icon-small.svg'),
  48: resolve(ROOT, 'assets/icon-source.png'),
  128: resolve(ROOT, 'assets/icon-source.png'),
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
