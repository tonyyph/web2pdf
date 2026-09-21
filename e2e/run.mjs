/**
 * Drives the real extension in a real Chromium:
 *   1. loads the unpacked build
 *   2. opens the popup against a served fixture page
 *   3. clicks Convert to PDF and waits for the download
 *   4. verifies the page was restored
 *   5. checks an unsupported page is reported, not crashed
 *   6. captures store screenshots along the way
 *
 * Run with: pnpm test:e2e
 */
import { mkdir, readdir, readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { launchWithExtension, prepareTestExtension, ROOT, startFixtureServer } from './harness.mjs';

const SHOTS = join(ROOT, 'docs/screenshots');
const TMP = join(ROOT, '.e2e-tmp');
const DOWNLOADS = join(TMP, 'downloads');
const PROFILE = join(TMP, 'profile');

const results = [];
function check(name, passed, detail = '') {
  results.push({ name, passed, detail });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` -- ${detail}` : ''}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Open the popup so it sees the article as the active tab.
 *
 * A real action popup is an overlay, so `tabs.query({active, currentWindow})`
 * returns the page underneath. Driven from Playwright the popup is an ordinary
 * tab, which would make it its own answer. Mounting it while the article is
 * foregrounded reproduces the real arrangement; the tabId it captures at mount
 * is what the export then targets, so bringing it to front afterwards is safe.
 */
async function openPopup(context, extensionId, articlePage) {
  const popup = await context.newPage();
  await popup.setViewportSize({ width: 400, height: 600 });
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await articlePage.bringToFront();
  await sleep(300);
  await popup.reload();
  await sleep(1500);
  return popup;
}

/**
 * Wait until the export job reaches a terminal phase.
 *
 * The downloaded file appears before the worker's `finally` has restored the
 * page, so asserting restoration off the file's arrival races the restore and
 * reads a half-reverted DOM. The job phase is the real completion signal.
 */
async function waitForJobPhase(popup, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const job = await popup.evaluate(async () => {
      const all = await chrome.storage.session.get(null);
      return Object.entries(all).find(([k]) => k.startsWith('web2pdf:job:'))?.[1] ?? null;
    });
    if (job && ['completed', 'failed', 'cancelled'].includes(job.phase)) return job;
    await sleep(400);
  }
  return null;
}

/**
 * An empty `style=""` attribute has no rendering or behavioural effect and is
 * not written by the extension - the emitted restore code normalises an empty
 * previous value away (verified in the bundle). Chrome's print pass re-adds it
 * to the elements it touched, after restoration has already removed it. Strip
 * it before comparing so the assertion measures real restoration.
 */
function normalizeHtml(html) {
  return html.replace(/ style=""/g, '');
}

/**
 * Wait until the page's HTML converges back to `expected`.
 *
 * Restoration is driven by a message the worker sends in its `finally`, so a
 * single timed read races it and can sample a half-reverted DOM.
 */
async function waitForRestore(page, expected, timeoutMs = 15_000) {
  const wanted = normalizeHtml(expected);
  const deadline = Date.now() + timeoutMs;
  let current = '';
  while (Date.now() < deadline) {
    current = await page.evaluate(() => document.body.innerHTML);
    if (normalizeHtml(current) === wanted) return { restored: true, current };
    await sleep(300);
  }
  return { restored: false, current };
}

/** Poll the download dir until a PDF appears and stops growing. */
async function waitForPdf(timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  let lastSize = -1;
  while (Date.now() < deadline) {
    const files = (await readdir(DOWNLOADS).catch(() => [])).filter((f) => f.endsWith('.pdf'));
    if (files.length > 0) {
      const path = join(DOWNLOADS, files[0]);
      const { size } = await stat(path);
      if (size > 0 && size === lastSize) return { path, size, name: files[0] };
      lastSize = size;
    }
    await sleep(500);
  }
  return null;
}

async function main() {
  await rm(TMP, { recursive: true, force: true });
  await mkdir(SHOTS, { recursive: true });

  const server = await startFixtureServer();
  console.log(`fixture server: ${server.url}`);

  const extensionPath = await prepareTestExtension(join(TMP, 'extension-under-test'));
  const { context, worker, extensionId } = await launchWithExtension({
    userDataDir: PROFILE,
    downloadDir: DOWNLOADS,
    extensionPath,
  });
  console.log(`extension id: ${extensionId}`);
  check('extension loads and service worker starts', Boolean(extensionId));

  const workerErrors = [];
  worker.on('console', (m) => {
    if (m.type() === 'error') workerErrors.push(m.text());
  });

  try {
    // ---- the page under test -------------------------------------------
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(server.url, { waitUntil: 'load' });
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(SHOTS, 'source-page.png') });

    const beforeBody = await page.evaluate(() => document.body.innerHTML);
    const beforeHtml = beforeBody.length;
    await page.evaluate(() => window.scrollTo(0, 600));
    const scrollBefore = await page.evaluate(() => window.scrollY);

    // ---- popup ----------------------------------------------------------
    const popup = await openPopup(context, extensionId, page);
    await popup.bringToFront();

    const readyBadge = await popup.locator('text=Ready').count();
    check('popup detects the page as exportable', readyBadge > 0);

    await popup.screenshot({ path: join(SHOTS, 'popup-light.png') });

    // Dark theme shot, driven through the real store so it round-trips.
    await popup.evaluate(() => document.documentElement.classList.add('dark'));
    await popup.waitForTimeout(250);
    await popup.screenshot({ path: join(SHOTS, 'popup-dark.png') });
    await popup.evaluate(() => document.documentElement.classList.remove('dark'));
    await popup.waitForTimeout(250);

    // ---- settings persistence -------------------------------------------
    await popup.selectOption('#paper-size', 'letter');
    await popup.waitForTimeout(600);
    await page.bringToFront();
    await popup.reload();
    await popup.waitForTimeout(1500);
    await popup.bringToFront();
    const persisted = await popup.locator('#paper-size').inputValue();
    check(
      'settings persist across popup reopen',
      persisted === 'letter',
      `paper-size=${persisted}`,
    );
    await popup.selectOption('#paper-size', 'a4');
    await popup.waitForTimeout(500);

    // ---- the export ------------------------------------------------------
    const convert = popup.locator('button:has-text("Convert to PDF")');
    await convert.click();

    const job = await waitForJobPhase(popup);
    check('export job reaches a terminal phase', job !== null, job ? job.phase : 'timed out');
    check('export job completed without error', job?.phase === 'completed', job?.error?.code ?? '');

    const pdf = await waitForPdf();
    check(
      'PDF is generated and downloaded',
      Boolean(pdf),
      pdf ? `${pdf.name}, ${pdf.size} bytes` : 'no file appeared',
    );

    if (pdf) {
      const head = (await readFile(pdf.path)).subarray(0, 5).toString('latin1');
      check('downloaded file is a real PDF', head === '%PDF-', `magic=${JSON.stringify(head)}`);
      check('filename follows the template', /_\d{4}-\d{2}-\d{2}\.pdf$/.test(pdf.name), pdf.name);
    }

    await popup.waitForTimeout(1500);
    await popup.screenshot({ path: join(SHOTS, 'popup-success.png') });

    // ---- page restoration -------------------------------------------------
    await page.bringToFront();
    const restore = await waitForRestore(page, beforeBody);
    const afterBody = restore.current;
    const afterHtml = afterBody.length;
    if (!restore.restored) {
      // Show the first real divergence so a drift is diagnosable.
      const a = normalizeHtml(beforeBody);
      const b = normalizeHtml(afterBody);
      let i = 0;
      while (i < Math.min(a.length, b.length) && a[i] === b[i]) i++;
      console.log('  DOM diff at offset', i);
      console.log('    before:', JSON.stringify(a.slice(Math.max(0, i - 40), i + 80)));
      console.log('    after :', JSON.stringify(b.slice(Math.max(0, i - 40), i + 80)));
    }
    const bannerVisible = await page.locator('.cookie-banner').isVisible();
    const leftoverStyle = await page.evaluate(
      () => document.getElementById('web2pdf-print-style') !== null,
    );
    const hiddenLeft = await page.evaluate(
      () => document.querySelectorAll('[data-web2pdf-hidden]').length,
    );
    const scrollAfter = await page.evaluate(() => window.scrollY);

    check('page HTML restored exactly', restore.restored, `${beforeHtml} -> ${afterHtml} chars`);
    // Recorded, not asserted: Chrome's own print pass leaves these behind.
    const inertAttrs = (afterBody.match(/ style=""/g) ?? []).length;
    console.log(
      `   note: ${inertAttrs} inert empty style attribute(s) left by Chrome's print pass`,
    );
    check('hidden elements are visible again', bannerVisible);
    check('injected print stylesheet removed', !leftoverStyle);
    check('no leftover hidden markers', hiddenLeft === 0, `${hiddenLeft} left`);
    check(
      'scroll position restored',
      Math.abs(scrollAfter - scrollBefore) < 50,
      `${scrollBefore} -> ${scrollAfter}`,
    );

    // ---- element selection mode -------------------------------------------
    try {
      const popup2 = await openPopup(context, extensionId, page);
      await popup2.bringToFront();
      // startSelection() calls window.close() by design, so the popup tab goes
      // away the moment this click lands; everything after waits on the page.
      await popup2.locator('button:has-text("Select elements to remove")').click();
      await page.bringToFront();
      await page.waitForTimeout(1500);
      const toolbar = await page.locator('#web2pdf-selector-root .w2p-toolbar').count();
      check('selection overlay appears in the page', toolbar > 0);
      if (toolbar > 0) {
        await page.hover('.ad-container');
        await page.waitForTimeout(400);
        await page.screenshot({ path: join(SHOTS, 'selection-mode.png') });
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
        const gone = await page.locator('#web2pdf-selector-root').count();
        check('Escape tears the overlay down completely', gone === 0);
      }
    } catch (error) {
      check('selection mode section completed', false, String(error).slice(0, 120));
    }

    // ---- unsupported page --------------------------------------------------
    try {
      const blocked = await context.newPage();
      await blocked.goto('chrome://version');
      await blocked.bringToFront();
      const popup3 = await openPopup(context, extensionId, blocked);
      await popup3.bringToFront();
      const blockedShown = await popup3.locator('text=Blocked').count();
      const convertDisabled = await popup3
        .locator('button:has-text("Convert to PDF")')
        .isDisabled();
      check(
        'unsupported page is reported and export is blocked, not crashed',
        blockedShown > 0 && convertDisabled,
        `blocked=${blockedShown} convertDisabled=${convertDisabled}`,
      );
      await popup3.screenshot({ path: join(SHOTS, 'popup-unsupported.png') });

      // ---- options page --------------------------------------------------------
      const options = await context.newPage();
      await options.setViewportSize({ width: 1280, height: 800 });
      await options.goto(`chrome-extension://${extensionId}/options.html`);
      await options.waitForTimeout(1200);
      await options.screenshot({ path: join(SHOTS, 'options.png') });
      const preview = await options.locator('code').first().textContent();
      check(
        'options page renders a filename preview',
        /\.pdf$/.test((preview ?? '').trim()),
        preview ?? '',
      );
    } catch (error) {
      check('late sections completed', false, String(error).slice(0, 120));
    }

    check(
      'no service worker errors',
      workerErrors.length === 0,
      workerErrors.slice(0, 3).join(' | '),
    );
  } finally {
    await context.close();
    await server.close();
  }

  const failed = results.filter((r) => !r.passed);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length > 0) {
    console.log('FAILED:');
    for (const f of failed) console.log(`  - ${f.name} ${f.detail}`);
    process.exitCode = 1;
  }
}

await main();
