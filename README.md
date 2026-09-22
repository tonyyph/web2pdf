# Web2PDF

**Save any webpage as a clean PDF.**

A Chrome and Microsoft Edge extension (Manifest V3) that turns the page you are looking
at into a real, text-selectable PDF — with control over paper size, margins, scale,
headers and footers, and with the option to strip ads, cookie banners and anything else
you point at before exporting.

Everything happens on your device. There is no backend and no network request.

---

## Screenshots

`pnpm build && pnpm test:e2e` generates these into `docs/screenshots/` from a real
browser run. Regenerate them whenever the UI changes:

| File                                  | What to capture                                                                         | Size     |
| ------------------------------------- | --------------------------------------------------------------------------------------- | -------- |
| `docs/screenshots/popup-light.png`    | The popup on a content-rich article, light theme                                        | 1280×800 |
| `docs/screenshots/popup-dark.png`     | The same popup in dark theme                                                            | 1280×800 |
| `docs/screenshots/selection-mode.png` | "Select elements to remove" active, with an element highlighted and the toolbar visible | 1280×800 |
| `docs/screenshots/options.png`        | The settings page, scrolled to the filename template with its live preview              | 1280×800 |
| `docs/screenshots/popup-success.png`  | The popup after a completed export                                                      | 400×600  |
| `docs/screenshots/source-page.png`    | The fixture article the export runs against                                             | 1280×800 |

The Web Store accepts 1280×800 or 640×400 and needs at least one. The 400×600 popup
shots are for the README; capture or pad a 1280×800 variant for the listing itself.

---

## Features

**Export**

- One-click **Convert to PDF** with per-phase progress: Preparing → Loading content →
  Generating → Downloading → Completed.
- Cancellable while the page is still being prepared.
- Automatic download when finished.

**Page setup**

- Paper: A4, A3, Letter, Legal, or a custom size in millimetres.
- Orientation: portrait or landscape.
- Margins: none, narrow, normal, or custom per side.
- Scale from 50% to 200%.
- Print background graphics on/off.
- Prefer the site's own CSS `@page` size.
- Page ranges (`1-5, 8, 11-13`).

**Headers and footers**

- Optional page title, URL, export date, page numbers and custom text.
- Custom text is HTML-escaped before it reaches Chrome's print template.

**Content cleanup**

- Hide ads, navigation, cookie banners and sticky/fixed elements.
- Expand collapsed `<details>` sections.
- Scroll the page first so lazy-loaded images appear in the PDF.
- Reader mode: strip everything but the article body.
- **Select elements to remove** — hover to highlight, click to mark, with undo, reset and
  Escape to exit.

**Filenames**

- Template with `{title}`, `{domain}`, `{date}` and `{time}` tokens.
- Sanitised against illegal characters, path traversal and Windows reserved names, always
  ending in `.pdf`, with a `webpage_YYYY-MM-DD.pdf` fallback.

**Interface**

- 400px popup, light and dark themes, following the system by default.
- Full keyboard navigation, visible focus rings, ARIA labels, `prefers-reduced-motion`
  support.

---

## Tech stack

| Layer               | Choice                                      | Why                                                                                 |
| ------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------- |
| Extension framework | [WXT](https://wxt.dev) 0.21                 | MV3 manifest generation, entrypoint conventions, Chrome/Edge targets, zip packaging |
| UI                  | React 19                                    | —                                                                                   |
| Language            | TypeScript 5.9, `strict`                    | 5.9 rather than 7.x because `typescript-eslint` 8.x supports `<6.1.0`               |
| Styling             | Tailwind CSS 4                              | CSS-first config via `@theme`, no JS config file                                    |
| State               | Zustand 5                                   | The popup's state is small; a store beats prop drilling without a framework         |
| Build               | Vite 8                                      | Required by `@vitejs/plugin-react` 6                                                |
| Tests               | Vitest 5 + jsdom + Testing Library          | —                                                                                   |
| Lint/format         | ESLint 10 + typescript-eslint 8, Prettier 3 | —                                                                                   |

No runtime dependency is added for anything a browser API already does.

---

## Architecture

### Why `chrome.debugger` + `Page.printToPDF`

An extension cannot produce a PDF of a live page any other way. The alternatives and why
they were rejected:

| Approach                                         | Problem                                                                                                                                                                   |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `window.print()`                                 | Cannot be scripted to a file — it always shows the system print dialog and the user must click through it. Kept as an explicit **fallback**, never as the silent default. |
| Canvas screenshot → PDF                          | Produces a picture of the page. Text is not selectable, not searchable, and links are dead. Also memory-hungry on long pages.                                             |
| Client-side HTML→PDF libraries (jsPDF, html2pdf) | Re-implement layout imperfectly; complex pages render wrong. Would also add a large runtime dependency.                                                                   |

`Page.printToPDF` uses Chrome's own print pipeline, so the PDF matches what Chrome would
print: real text, real vectors, working links.

**The cost** is the `debugger` permission, which Chrome warns loudly about. The
mitigations are structural, not promises:

- `withDebugger()` in `src/services/pdf.service.ts` is the only place a session is ever
  opened. It attaches, runs the work, and detaches in `finally` — success, failure,
  timeout and cancellation all go through the same path.
- It refuses to attach at all if another client (DevTools, another extension) already
  holds the tab, reporting `DEBUGGER_ALREADY_ATTACHED` instead of fighting for it.
- Only `Page.enable` and `Page.printToPDF` are ever sent. No domain that reads page
  content, network traffic or storage is enabled.
- Attaching happens only in direct response to your click.

### Why no host permissions

The page-preparation script is built as an **unlisted script**, not a declared content
script. A declared content script — even one registered at runtime — makes the build add
its match patterns to `host_permissions`, which would mean `<all_urls>`. Instead the
background worker injects `page-agent.js` with `chrome.scripting.executeScript` under the
`activeTab` grant, which Chrome issues only for the tab you just acted on. The shipped
manifest contains no `host_permissions` key at all.

### Export flow

```
Popup                    Background worker              Page agent (in the tab)
  │                             │                              │
  ├── START_EXPORT ────────────►│                              │
  │                             ├─ check page is exportable    │
  │◄── EXPORT_STARTED (jobId) ──┤                              │
  │                             ├─ inject agent (activeTab) ──►│
  │                             ├─ PREPARE_PAGE ──────────────►│
  │                             │                              ├─ hide selected elements
  │                             │                              ├─ scroll for lazy content
  │                             │                              ├─ await fonts + images
  │◄── JOB_UPDATE broadcasts ───┤◄──────────── PREPARED ───────┤
  │                             ├─ attach debugger             │
  │                             ├─ Page.printToPDF             │
  │                             ├─ detach (finally)            │
  │                             ├─ downloads.download(data:)   │
  │                             ├─ RESTORE_PAGE ──────────────►│
  │                             │                              ├─ revert every mutation
  │◄── JOB_UPDATE (completed) ──┤                              ├─ restore scroll position
```

### Surviving a suspended service worker

MV3 workers are killed aggressively, and the popup closes whenever it loses focus.
Neither is treated as an error:

- Job state lives in `chrome.storage.session`, never in a worker variable. A reopened
  popup calls `GET_JOB_STATE` and picks the export back up mid-flight.
- Cancellation is a storage flag, not an in-memory `AbortController`, so a cancel issued
  after a worker restart is still observed.
- `readJob` ages out any non-terminal job that has not been updated within three minutes
  and reports it as a timeout, so a worker that died mid-export cannot leave the UI
  spinning forever.
- Progress broadcasts are fire-and-forget: "no receiver" is the normal case, not an error.

### Page restoration

Nothing is ever removed from the DOM. Hidden elements get an inline `display: none`
override, and the previous `style` attribute — including its absence — is recorded and
restored afterwards. `<details>` elements that were opened get closed again, the injected
stylesheet is removed, and the scroll position is put back. `restorePage()` runs in the
export's `finally`, so a failed export leaves the page exactly as it found it.

---

## Project structure

```
web2pdf/
├── src/
│   ├── entrypoints/
│   │   ├── background.ts          # Orchestrates the export pipeline
│   │   ├── page-agent.ts          # Unlisted script injected on demand
│   │   ├── popup/                 # index.html + main.tsx
│   │   └── options/               # index.html + main.tsx
│   ├── core/                      # Pure logic, no Chrome APIs, fully unit-tested
│   │   ├── cdp.ts                 # Typed Page.printToPDF request/response
│   │   ├── cleanup.ts             # Cleanup selectors and plan normalisation
│   │   ├── constants.ts           # Paper sizes, margins, limits
│   │   ├── errors.ts              # Typed error model + Result pattern
│   │   ├── filename.ts            # Sanitisation and template resolution
│   │   ├── header-footer.ts       # Escaped print templates
│   │   ├── messages.ts            # Typed message contracts + validators
│   │   ├── page-support.ts        # Which URLs can be exported
│   │   ├── print-params.ts        # Settings → CDP parameters
│   │   ├── units.ts               # mm / inch / CSS px conversion
│   │   └── settings/              # schema, defaults, validate, migrate
│   ├── services/                  # Chrome API boundaries
│   │   ├── pdf.service.ts         # Debugger lifecycle + printToPDF
│   │   ├── download.service.ts    # data: URL → chrome.downloads
│   │   ├── prepare.service.ts     # In-page preparation and restoration
│   │   ├── selector.service.ts    # Element-picking overlay
│   │   ├── storage.service.ts     # Settings persistence
│   │   └── job.store.ts           # Session-backed job state
│   └── ui/                        # React components, store, hooks, styles
├── tests/                         # Vitest suites + Chrome mock
├── public/icon/                   # Generated PNGs
├── assets/icon.svg                # Icon source
└── scripts/generate-icons.mjs     # SVG → PNG
```

Business logic lives in `core/` and is pure: no `chrome.*`, no DOM, directly testable.
`services/` is the only place Chrome APIs are touched. `ui/` renders and delegates.

---

## Requirements

- Node.js 20.19+ (built and tested on 22.14)
- pnpm 10+ (`corepack enable` if you don't have it)
- Chrome 116+ or Edge 116+

---

## Getting started

```bash
pnpm install          # also runs `wxt prepare` to generate types
pnpm dev              # launches Chrome with the extension loaded and hot-reloading
pnpm dev:edge         # same, for Microsoft Edge
```

### Loading it unpacked

```bash
pnpm build
```

Then in Chrome:

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked**.
4. Select `.output/chrome-mv3/`.
5. Pin Web2PDF to the toolbar and open any article to try it.

For Edge: `pnpm build:edge`, then the same steps at `edge://extensions` selecting
`.output/edge-mv3/`.

### Building and packaging

```bash
pnpm build            # Chrome build   → .output/chrome-mv3/
pnpm build:edge       # Edge build     → .output/edge-mv3/
pnpm build:all        # both
pnpm zip              # Chrome zip     → .output/web2pdf-1.0.0-chrome.zip
pnpm zip:edge         # Edge zip       → .output/web2pdf-1.0.0-edge.zip
pnpm package          # builds both and produces both zips
```

### Quality gates

```bash
pnpm typecheck        # wxt prepare && tsc --noEmit
pnpm lint             # eslint .
pnpm format           # prettier --write
pnpm test             # vitest run
pnpm test:watch       # vitest
pnpm test:e2e         # drives the built extension in a real Chromium
pnpm screenshots:store # compose 1280x800 Web Store assets from the captures
pnpm promo            # render the 440x280 and 1400x560 promo tiles
pnpm icons            # regenerate PNGs from assets/icon.svg
```

### End-to-end tests

`pnpm build && pnpm test:e2e` loads the built extension into a real (headed) Chromium,
serves a fixture article locally, and drives the popup through a full export: PDF
generated and downloaded, filename template applied, page restored, selection overlay
opened and torn down, unsupported page reported, settings persisted. It also regenerates
the screenshots in `docs/screenshots/`.

Two things worth knowing about the harness:

- **It loads a patched build.** The shipped extension holds only `activeTab`, which Chrome
  grants solely on a real toolbar click - browser chrome Playwright cannot reach
  (`chrome.action.openPopup()` grants nothing, and `executeScript` is refused). The
  harness copies the build and adds one host permission scoped to `http://127.0.0.1/*`.
  That is the only difference from the shipped artifact.
- **Playwright's download interception is overridden.** With `acceptDownloads` on it
  redirects files into its own artifact store; with it off it cancels them as
  `USER_CANCELED`. The harness sets `Browser.setDownloadBehavior` explicitly so
  `chrome.downloads` writes land where the test can inspect them.

One cosmetic artifact is recorded rather than asserted: Chrome's print pass re-adds an
empty `style=""` attribute to the elements it touched, after Web2PDF has already removed
it. The attribute is inert, and the emitted restore code normalises an empty value away,
so the comparison strips it.

CI (`.github/workflows/ci.yml`) runs typecheck, lint, test and build on every push and
pull request, and uploads the packaged zips as artifacts.

---

## Permissions

| Permission  | Why it is needed                                                            | What it is not used for                            |
| ----------- | --------------------------------------------------------------------------- | -------------------------------------------------- |
| `activeTab` | Temporary access to the single tab you are exporting, granted by your click | Not a standing grant; expires                      |
| `scripting` | Injects `page-agent.js` into that tab on demand                             | Never injected without a click                     |
| `debugger`  | `Page.printToPDF` via CDP — the only way to make a real PDF                 | No content, network or storage domains are enabled |
| `downloads` | Saves the finished PDF                                                      | No access to your download history is used         |
| `storage`   | Remembers your export preferences                                           | `storage.local` only, never `storage.sync`         |

**No host permissions are requested.** See the "Why no host permissions" section above.

### The debugger warning

On install, Chrome says Web2PDF can _"Read and change all your data on all websites"_,
and during an export it shows a bar on the tab saying Web2PDF started debugging it. Both
are Chrome describing the `debugger` permission's theoretical ceiling, not what this
extension does. The permission is unavoidable for `Page.printToPDF`; the narrowness of
its use is documented above and enforced by `withDebugger()`.

---

## Privacy

Fully documented in [PRIVACY.md](./PRIVACY.md). In short: local-only processing, no
network requests, no analytics, no PDF or page content written to storage, password
fields never touched.

---

## Technical limitations

These are real constraints, documented rather than papered over:

1. **The debugger warning cannot be avoided.** Any extension using `Page.printToPDF`
   needs `debugger`, and Chrome warns about it. If that is unacceptable for your use,
   the **Use print dialog** fallback needs no such permission.
2. **One export at a time per tab.** Chrome allows a single debugger client per tab.
   Starting an export on a tab that already has one returns the existing job rather than
   racing it.
3. **Another debugger client can block exports.** Chrome sometimes refuses a second
   debugger attach (typically with DevTools open on that tab). Web2PDF does not
   pre-refuse on `getTargets()` - verified against Chrome, a target can report
   `attached: true` and still accept a second client - so it attempts the attach and
   maps a genuine refusal to `DEBUGGER_ALREADY_ATTACHED` with a print-dialog fallback.
4. **Only the top frame is exported.** `Page.printToPDF` prints the main frame; content
   inside cross-origin iframes renders as the browser would print it, which may differ
   from what you see.
5. **Lazy loading is heuristic.** The scroll pass is bounded to 60 steps and 20 seconds.
   Infinite-scroll feeds will not be captured in full — by design, since they have no end.
6. **Very long pages.** Past ~40,000 CSS pixels the popup warns you. Generation stays
   correct but gets slow, and the PDF can run to hundreds of pages.
7. **Cleanup selectors are heuristics.** Ad and cookie-banner patterns cover the common
   networks and consent platforms, not every site. "Select elements to remove" is the
   escape hatch for anything missed.
8. **Cancellation window.** Once `Page.printToPDF` is in flight, Chrome offers no way to
   abort it. The Cancel button is therefore hidden from the "Generating" phase onward
   rather than being shown and doing nothing.
9. **Reader mode is CSS-based**, not a content-extraction algorithm like Readability. It
   suppresses furniture rather than re-flowing the article.
10. **Firefox is not supported.** `chrome.debugger` has no Firefox equivalent. See the
    roadmap.

## Unsupported pages

Web2PDF detects these before doing anything and explains why, rather than failing
mid-export:

| Page                                            | Reason                                                                   |
| ----------------------------------------------- | ------------------------------------------------------------------------ |
| `chrome://`, `edge://`, `about:`                | Browsers block all extension access to internal pages                    |
| Chrome Web Store, Edge Add-ons, AMO             | Vendors block extensions on their own stores                             |
| `chrome-extension://` pages                     | Extensions cannot script each other                                      |
| `view-source:`, `devtools://`, `data:`, `blob:` | Not scriptable                                                           |
| `file://` URLs                                  | Need "Allow access to file URLs" enabled manually on the extensions page |
| PDFs already open in the viewer                 | Use the viewer's own save button                                         |
| Tabs with no page loaded                        | Nothing to export yet                                                    |

---

## Troubleshooting

**"Another tool is already attached to this tab"**
DevTools is open on that tab, or another extension holds the debugger. Close DevTools and
retry, or use **Use print dialog**.

**The PDF is missing images**
Turn on **Load lazy content** so the page is scrolled before printing. Some sites load
images only on intersection and need the extra pass.

**Background colours are missing**
Turn on **Background graphics**. Chrome's print pipeline omits backgrounds by default.

**The PDF has the wrong page size**
If the site ships its own `@page` rule, **Prefer CSS page size** (Advanced) makes that
rule win over your chosen paper size. Turn it off to force your setting.

**The export is stuck on "Preparing page"**
The tab was probably navigated or closed mid-export. The job is aged out after three
minutes; reopen the popup and retry.

**The page looks wrong after an export**
It shouldn't — restoration runs in a `finally`. If it happens, reload the tab and please
file an issue with the URL; that is a bug.

**Settings are not saved**
Check that the extension has storage access and that you are not in a profile where
extension storage is restricted. Try **Reset to defaults** on the settings page.

**Nothing happens when clicking Convert**
Check the page is supported (the popup card says Ready or Blocked). If it says Ready,
open the service worker console from `chrome://extensions` → Web2PDF → "service worker"
and check for errors.

---

## Chrome Web Store release checklist

- [ ] Bump `version` in `wxt.config.ts` (and `package.json` to match).
- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all green.
- [ ] `pnpm package` produces both zips.
- [ ] Load `.output/chrome-mv3/` unpacked and manually verify: a normal article exports;
      filename tokens resolve; margins/scale/orientation take effect; the page is restored;
      a `chrome://` page shows the blocked message.
- [ ] Capture the five screenshots listed above at 1280×800.
- [ ] Prepare a 128×128 store icon (`public/icon/128.png`) and a 440×280 small promo tile.
- [ ] Write the store description; lead with the local-only processing.
- [ ] **Justify every permission in the dashboard.** `debugger` in particular: state that
      it is used solely for `Page.printToPDF` and detached immediately.
- [ ] Declare the single purpose: "Convert the current webpage to a PDF file."
- [ ] Complete the data-usage disclosure: no data collected, no data sold, no data
      transferred. Link `PRIVACY.md`.
- [ ] Confirm no remote code: the CSP is `script-src 'self'` and nothing loads from a CDN.
- [ ] Upload `.output/web2pdf-<version>-chrome.zip`.
- [ ] Expect extra review time — `debugger` triggers manual review.
- [ ] For Edge: submit `.output/web2pdf-<version>-edge.zip` to Partner Center.

---

## Roadmap

Deliberately **not** in the MVP: cloud sync, accounts, payments, OCR, Drive/Dropbox
upload, batch URL conversion, server-side rendering, AI summarisation.

Planned next, in rough priority order:

1. **Keyboard shortcut** (`commands` API) and a **context-menu action** — cheap, and the
   two most requested affordances for a converter.
2. **Per-domain presets** — key stored settings by hostname, resolved at export time with
   the global default as fallback.
3. **Batch convert open tabs** — a job queue in the worker; exports must stay serialised
   because Chrome allows one debugger client per tab.
4. **Local conversion history** — metadata only (title, URL, timestamp, settings). Never
   the PDF, to keep the privacy model intact.
5. **Full-page screenshot to PDF** — `Page.captureScreenshot` beyond the viewport, for
   pages where print CSS breaks the layout.
6. **Advanced reader mode** — bundle a Readability-style extractor instead of CSS
   suppression.
7. **Scheduled capture** via `chrome.alarms`.
8. **Firefox support** — no `chrome.debugger` equivalent, so it would need a genuinely
   different engine (likely `window.print()` plus a print-stylesheet path) behind the
   same UI.

---

## License

MIT
