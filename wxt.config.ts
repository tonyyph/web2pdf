import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

// https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [tailwindcss()],
    build: {
      // Source maps only in development; keeps the published bundle small and
      // avoids shipping readable source to the Chrome Web Store package.
      sourcemap: process.env.NODE_ENV !== 'production' ? 'inline' : false,
    },
  }),
  manifest: {
    name: 'Web2PDF - Save any webpage as a clean PDF',
    short_name: 'Web2PDF',
    description:
      'Convert the current webpage into a clean, print-ready PDF. Runs entirely on your device - nothing is uploaded.',
    version: '1.0.0',
    // `debugger` is required for chrome.debugger + Page.printToPDF, which is the
    // only way an extension can produce a real vector PDF of the live page.
    // `activeTab` avoids a broad host permission: it is granted only for the tab
    // the user explicitly acted on.
    permissions: ['activeTab', 'scripting', 'storage', 'downloads', 'debugger'],
    action: {
      default_title: 'Web2PDF - Save page as PDF',
    },
    options_ui: {
      open_in_tab: true,
    },
    icons: {
      16: 'icon/16.png',
      32: 'icon/32.png',
      48: 'icon/48.png',
      128: 'icon/128.png',
    },
    // No remote code, no eval: satisfies Chrome Web Store MV3 CSP requirements.
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self';",
    },
  },
  zip: {
    excludeSources: ['**/*.map'],
  },
});
