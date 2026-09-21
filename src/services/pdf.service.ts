import { isPrintToPdfResult, type CdpCommandMap, type PrintToPdfParams } from '../core/cdp';
import { DEBUGGER_PROTOCOL_VERSION, PRINT_TO_PDF_TIMEOUT_MS } from '../core/constants';
import { createError, err, ok, toAppError, type AppError, type Result } from '../core/errors';

/**
 * PDF generation through the Chrome DevTools Protocol.
 *
 * `Page.printToPDF` is the only extension-reachable API that produces a real
 * vector PDF of the live page (text stays selectable, links stay live). It
 * requires the `debugger` permission, so Chrome shows an infobar on the tab
 * while we are attached - see README "Why the debugger permission".
 *
 * Contract: the debugger session lives strictly inside `withDebugger`. It is
 * attached immediately before the command and detached in `finally`, on every
 * path including cancellation and thrown errors.
 */

export interface DebuggerTarget {
  tabId: number;
}

function lastError(): Error | null {
  const message = chrome.runtime.lastError?.message;
  return message ? new Error(message) : null;
}

export function attachDebugger(target: DebuggerTarget): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.debugger.attach({ tabId: target.tabId }, DEBUGGER_PROTOCOL_VERSION, () => {
      const error = lastError();
      if (error) reject(error);
      else resolve();
    });
  });
}

export function detachDebugger(target: DebuggerTarget): Promise<void> {
  return new Promise((resolve) => {
    chrome.debugger.detach({ tabId: target.tabId }, () => {
      // Detach failures are non-actionable (usually "not attached"); swallow
      // them so they can never mask the original error.
      void chrome.runtime.lastError;
      resolve();
    });
  });
}

export function sendCommand<M extends keyof CdpCommandMap>(
  target: DebuggerTarget,
  method: M,
  params: CdpCommandMap[M]['params'],
): Promise<CdpCommandMap[M]['result']> {
  return new Promise((resolve, reject) => {
    // chrome's typings require an index signature; our CDP param types are
    // precise structs, so widen only at this boundary.
    const payload = params as unknown as Record<string, unknown>;
    chrome.debugger.sendCommand({ tabId: target.tabId }, method, payload, (result) => {
      const error = lastError();
      if (error) {
        reject(error);
        return;
      }
      resolve((result ?? {}) as CdpCommandMap[M]['result']);
    });
  });
}

/** Is a debugger (ours, DevTools, or another extension) already on this tab? */
export async function isDebuggerAttached(tabId: number): Promise<boolean> {
  const targets = await chrome.debugger.getTargets();
  return targets.some((target) => target.tabId === tabId && target.attached);
}

export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(createError('TIMEOUT', `${label} exceeded ${ms}ms`));
    }, ms);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Attach, run `work`, and detach - always. Callers never see a live session.
 */
export async function withDebugger<T>(
  target: DebuggerTarget,
  work: () => Promise<T>,
): Promise<Result<T, AppError>> {
  if (await isDebuggerAttached(target.tabId)) {
    return err(
      createError(
        'DEBUGGER_ALREADY_ATTACHED',
        `Tab ${target.tabId} already has a debugger client attached`,
      ),
    );
  }

  try {
    await attachDebugger(target);
  } catch (error) {
    const appError = toAppError(error, 'DEBUGGER_ATTACH_FAILED');
    return err(
      appError.code === 'DEBUGGER_ALREADY_ATTACHED'
        ? appError
        : createError('DEBUGGER_ATTACH_FAILED', appError.message),
    );
  }

  try {
    return ok(await work());
  } catch (error) {
    return err(toAppError(error, 'PDF_GENERATION_FAILED'));
  } finally {
    await detachDebugger(target);
  }
}

/**
 * Produce the PDF for a tab. Returns base64 PDF bytes; the caller is
 * responsible for turning them into a download and dropping the reference.
 */
export async function generatePdf(
  tabId: number,
  params: PrintToPdfParams,
): Promise<Result<string, AppError>> {
  const target: DebuggerTarget = { tabId };

  return withDebugger(target, async () => {
    await sendCommand(target, 'Page.enable', {});
    const result = await withTimeout(
      sendCommand(target, 'Page.printToPDF', params),
      PRINT_TO_PDF_TIMEOUT_MS,
      'Page.printToPDF',
    );

    if (!isPrintToPdfResult(result)) {
      throw createError('PDF_GENERATION_FAILED', 'printToPDF returned no data');
    }
    return result.data;
  });
}
