# Privacy Policy — Web2PDF

**Last updated: 21 September 2026**

## The short version

Web2PDF converts webpages to PDF entirely on your own device. It has no backend, no
accounts and no analytics. Nothing you browse, convert or configure ever leaves your
computer.

## What Web2PDF does not do

- It does **not** send page content, page text, images, URLs or page titles anywhere.
- It does **not** upload, store or transmit the PDFs it generates.
- It does **not** contain analytics, telemetry, crash reporting or advertising SDKs.
- It does **not** make any network request of its own — there is no server to talk to.
- It does **not** load code from a CDN or any remote source. Every line that runs is
  contained in the extension package that Chrome verified at install time.
- It does **not** read or modify password fields. Page preparation explicitly skips any
  element that is, or contains, an `input[type="password"]`.
- It does **not** run in the background. It touches a page only after you click inside
  the extension popup.

## What Web2PDF stores, and where

| Data                                                                                                  | Where                                   | Lifetime                                 |
| ----------------------------------------------------------------------------------------------------- | --------------------------------------- | ---------------------------------------- |
| Your export preferences (paper size, margins, cleanup toggles, filename template, theme)              | `chrome.storage.local` on your device   | Until you reset them or uninstall        |
| The in-progress export's status (phase, progress, error)                                              | `chrome.storage.session` on your device | Cleared when the browser closes          |
| Elements you picked in "Select elements to remove" — stored as CSS selectors only, never page content | `chrome.storage.session` on your device | Cleared when the tab navigates or closes |

If you have Chrome Sync enabled, note that Web2PDF deliberately uses `storage.local`, not
`storage.sync`, so your preferences do not leave the device even through Chrome's own
sync channel.

**Generated PDFs are never written to extension storage.** The PDF bytes exist only in
memory, for the moment between Chrome producing them and the download API saving them to
the folder you chose. Web2PDF keeps no history of what you converted.

## Permissions and why each one is needed

| Permission  | Why                                                                                                                                                                                                                      |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `activeTab` | Temporary access to the one tab you are exporting, granted by your click on the extension. This is what lets Web2PDF avoid asking for access to every site you visit.                                                    |
| `scripting` | Injects the page-preparation script into that tab, on demand, to hide banners and load lazy content.                                                                                                                     |
| `debugger`  | Required to call `Page.printToPDF` through the Chrome DevTools Protocol, which is the only way an extension can produce a real PDF of the live page. Attached only during an export and detached immediately afterwards. |
| `downloads` | Saves the finished PDF to your download folder.                                                                                                                                                                          |
| `storage`   | Remembers your export preferences between sessions.                                                                                                                                                                      |

Web2PDF requests **no host permissions**. It cannot read any site until you explicitly
click Convert or Select elements on that tab.

## About the debugger permission

Chrome shows a warning on install ("Read and change all your data…") and a notification
bar on the tab while a debugger is attached. This is Chrome being appropriately loud
about a powerful permission. Web2PDF uses it narrowly:

- The debugger is attached only after you click **Convert to PDF**.
- Exactly one command is sent: `Page.printToPDF`.
- The session is detached in a `finally` block, so it is released on success, on failure,
  and on cancellation alike.
- No DevTools domain that reads page content, network traffic or storage is ever enabled.

## Children's privacy

Web2PDF collects no data from anyone, including children under 13.

## Changes to this policy

Any change to how Web2PDF handles data will be published in this file and reflected in
the extension's Chrome Web Store listing before the change ships.

## Contact

Please open an issue in the project repository for any privacy question.
