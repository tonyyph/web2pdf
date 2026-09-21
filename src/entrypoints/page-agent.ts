import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script';
import { createError, toAppError } from '@/core/errors';
import { parseContentRequest, type ContentResponse } from '@/core/messages';
import { cancelPreparation, preparePage, restorePage } from '@/services/prepare.service';
import {
  enterSelectionMode,
  exitSelectionMode,
  getSelectedSelectors,
  isSelectionActive,
} from '@/services/selector.service';

/**
 * The page agent is an UNLISTED script, not a manifest content script.
 *
 * A declared content script - even one registered at runtime - makes WXT add
 * its match patterns to `host_permissions`, which would mean `<all_urls>`.
 * Building it unlisted keeps the manifest free of host permissions: the
 * background worker injects this file with `chrome.scripting.executeScript`
 * only after the user clicks in the popup, under the `activeTab` grant. The
 * extension therefore never runs on a page unprompted.
 */
export default defineUnlistedScript(() => {
  // Injecting twice (popup reopened) must not register a second listener.
  const guard = globalThis as typeof globalThis & { __web2pdfAgentReady?: boolean };
  if (guard.__web2pdfAgentReady) return;
  guard.__web2pdfAgentReady = true;

  const respond = (response: ContentResponse): ContentResponse => response;

  chrome.runtime.onMessage.addListener((rawMessage, _sender, sendResponse) => {
    const request = parseContentRequest(rawMessage);
    if (!request) {
      sendResponse(respond({ ok: false, error: createError('INVALID_MESSAGE') }));
      return false;
    }

    switch (request.type) {
      case 'PING':
        sendResponse(respond({ ok: true, type: 'PONG' }));
        return false;

      case 'PREPARE_PAGE': {
        // Selection UI must be gone before we measure or print the page.
        exitSelectionMode();
        preparePage(request.options).then(
          (result) => sendResponse(respond({ ok: true, type: 'PREPARED', result })),
          (error: unknown) => {
            restorePage();
            sendResponse(
              respond({ ok: false, error: toAppError(error, 'PAGE_PREPARATION_FAILED') }),
            );
          },
        );
        return true;
      }

      case 'RESTORE_PAGE':
        cancelPreparation();
        restorePage();
        sendResponse(respond({ ok: true, type: 'ACK' }));
        return false;

      case 'ENTER_SELECTION_MODE': {
        const publish = (selectors: string[]): void => {
          void chrome.runtime
            .sendMessage({ type: 'SELECTION_UPDATE', tabId: -1, selectors })
            .catch(() => undefined);
        };
        enterSelectionMode(
          {
            onChange: publish,
            onExit: () => publish(getSelectedSelectors()),
          },
          // Seeded by the background worker from this tab's stored selection,
          // so re-entering the mode shows what is already marked.
          request.selectors,
        );
        sendResponse(respond({ ok: true, type: 'ACK' }));
        return false;
      }

      case 'EXIT_SELECTION_MODE':
        exitSelectionMode();
        sendResponse(respond({ ok: true, type: 'ACK' }));
        return false;

      case 'GET_SELECTORS':
        sendResponse(
          respond({
            ok: true,
            type: 'SELECTORS',
            selectors: isSelectionActive() ? getSelectedSelectors() : [],
          }),
        );
        return false;

      case 'SET_SELECTORS':
        sendResponse(respond({ ok: true, type: 'ACK' }));
        return false;

      case 'PRINT_PAGE':
        // Fallback path when CDP is unavailable; must run in the page.
        setTimeout(() => window.print(), 0);
        sendResponse(respond({ ok: true, type: 'ACK' }));
        return false;
    }
  });

  // A navigation destroys this script; make sure nothing is left behind.
  window.addEventListener('pagehide', () => {
    exitSelectionMode();
    restorePage();
  });
});
