/**
 * Shared harness: serves the fixture page and launches a real Chromium with
 * the built extension loaded.
 *
 * MV3 extensions need a persistent context and a real (non-headless-shell)
 * browser, so this launches headed Chromium. The service worker is what tells
 * us the generated extension id.
 */
import { createServer } from 'node:http';
import { readFile, mkdir, rm, writeFile, cp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, resolve, normalize, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

export const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
export const EXTENSION_PATH = join(ROOT, '.output/chrome-mv3');
export const FIXTURES = join(ROOT, 'e2e/fixtures');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
};

/** Static file server for the fixture page. Returns { url, close }. */
export async function startFixtureServer() {
  const server = createServer(async (req, res) => {
    const requested = decodeURIComponent((req.url ?? '/').split('?')[0]);
    const relative = requested === '/' ? '/article.html' : requested;
    // Contain every request inside the fixtures directory.
    const target = join(FIXTURES, normalize(relative).replace(/^(\.\.[/\\])+/, ''));

    if (!target.startsWith(FIXTURES) || !existsSync(target)) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
      return;
    }

    const body = await readFile(target);
    res.writeHead(200, { 'content-type': MIME[extname(target)] ?? 'application/octet-stream' });
    res.end(body);
  });

  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const { port } = server.address();

  return {
    url: `http://127.0.0.1:${port}/`,
    close: () => new Promise((done) => server.close(done)),
  };
}

/**
 * Launch Chromium with the extension loaded.
 *
 * `downloadDir` is written into the profile's Preferences before launch so the
 * extension's chrome.downloads calls land somewhere we can inspect, rather
 * than in the user's real Downloads folder.
 */
/**
 * Produce the build the harness drives.
 *
 * The shipped extension holds only `activeTab`, which Chrome grants solely on a
 * real toolbar click - browser chrome that Playwright cannot reach. Verified by
 * probe: `chrome.action.openPopup()` grants nothing, and `executeScript` is
 * refused with "Extension manifest must request permission to access the
 * respective host". So the automated build adds ONE host permission, scoped to
 * the local fixture server and nothing else.
 *
 * This is the only difference from the artifact that ships. Everything the test
 * then exercises - preparation, debugger attach, printToPDF, download, restore
 * - is the same code, reached the same way.
 */
export async function prepareTestExtension(targetDir) {
  if (!existsSync(EXTENSION_PATH)) {
    throw new Error(`Extension not built. Run "pnpm build" first (missing ${EXTENSION_PATH})`);
  }

  await rm(targetDir, { recursive: true, force: true });
  await cp(EXTENSION_PATH, targetDir, { recursive: true });

  const manifestPath = join(targetDir, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.host_permissions = ['http://127.0.0.1/*'];
  manifest.name = `${manifest.name} (e2e)`;
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

  return targetDir;
}

export async function launchWithExtension({ userDataDir, downloadDir, extensionPath }) {
  const loadPath = extensionPath ?? EXTENSION_PATH;
  if (!existsSync(loadPath)) {
    throw new Error(`Extension not built. Run "pnpm build" first (missing ${loadPath})`);
  }

  await rm(userDataDir, { recursive: true, force: true });
  await mkdir(join(userDataDir, 'Default'), { recursive: true });
  await mkdir(downloadDir, { recursive: true });

  await writeFile(
    join(userDataDir, 'Default', 'Preferences'),
    JSON.stringify({
      download: { default_directory: downloadDir, prompt_for_download: false },
      savefile: { default_directory: downloadDir },
    }),
  );

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    channel: 'chromium',
    viewport: { width: 1280, height: 800 },
    acceptDownloads: true,
    args: [
      `--disable-extensions-except=${loadPath}`,
      `--load-extension=${loadPath}`,
      '--no-first-run',
      '--no-default-browser-check',
    ],
  });

  const worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent('serviceworker', { timeout: 30_000 }));
  const extensionId = new URL(worker.url()).host;

  // Playwright installs its own CDP download behaviour: `allowAndName` (files
  // land in its artifact store under opaque names) with acceptDownloads on, and
  // `deny` with it off - which cancels the extension's chrome.downloads write
  // as USER_CANCELED. Override it so downloads land where we can inspect them.
  const page = context.pages()[0] ?? (await context.newPage());
  const cdp = await context.newCDPSession(page);
  await cdp.send('Browser.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: downloadDir,
    eventsEnabled: true,
  });
  await cdp.detach();

  return { context, worker, extensionId };
}
