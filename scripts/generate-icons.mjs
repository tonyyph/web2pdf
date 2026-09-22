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
 * Every size is rasterised from the supplied artwork
 * (`assets/icon-source.png`, a 1024 master trimmed and squared from the
 * original export), unmodified and by explicit request.
 *
 * Note for whoever tunes this later: the artwork carries a browser window, a
 * document, text lines and an arrow. That resolves well at 128 and holds at
 * 48, but the two stacked elements merge around 32 and little is readable at
 * 16. Lanczos with a light sharpen recovers as much edge definition as the
 * downscale allows.
 */
const SOURCE = resolve(ROOT, 'assets/icon-source.png');
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

  const master = await readFile(SOURCE);

  for (const size of SIZES) {
    let pipeline = sharp(master).resize(size, size, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      kernel: 'lanczos3',
    });
    // Small sizes lose their edges to the downscale; a light unsharp mask puts
    // some definition back without introducing halos.
    if (size <= 32) pipeline = pipeline.sharpen({ sigma: 0.6, m1: 0.5, m2: 0.6 });

    const png = await pipeline.png({ compressionLevel: 9, palette: false }).toBuffer();

    const target = resolve(OUT_DIR, `${size}.png`);
    await writeFile(target, png);
    console.log(`wrote public/icon/${size}.png (${png.length} bytes)`);
  }
}

await main();
