import { createError, err, ok, toAppError, type AppError, type Result } from '@/core/errors';
import type { BackgroundRequest, BackgroundResponse } from '@/core/messages';

/**
 * Typed client for talking to the background worker from a React surface.
 * Every call is deadline-bounded: if the worker was suspended and cannot be
 * revived, the UI reports a timeout instead of spinning forever.
 */

const REQUEST_TIMEOUT_MS = 30_000;

type SuccessResponse = Extract<BackgroundResponse, { ok: true }>;
type ResponseType = SuccessResponse['type'];
type SuccessOf<T extends ResponseType> = Extract<SuccessResponse, { type: T }>;

export async function sendToBackground<T extends ResponseType>(
  request: BackgroundRequest,
  expected: T,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<Result<SuccessOf<T>, AppError>> {
  try {
    const response = await Promise.race([
      chrome.runtime.sendMessage(request) as Promise<BackgroundResponse | undefined>,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(createError('TIMEOUT', `${request.type} timed out`)), timeoutMs),
      ),
    ]);

    if (!response) return err(createError('UNKNOWN_ERROR', 'No response from background worker'));
    if (!response.ok) return err(response.error);
    if (response.type !== expected) {
      return err(createError('INVALID_MESSAGE', `Expected ${expected}, got ${response.type}`));
    }
    return ok(response as SuccessOf<T>);
  } catch (error) {
    return err(toAppError(error));
  }
}

export function onRuntimeMessage(listener: (message: unknown) => void): () => void {
  const handler = (message: unknown): undefined => {
    listener(message);
    return undefined;
  };
  chrome.runtime.onMessage.addListener(handler);
  return () => chrome.runtime.onMessage.removeListener(handler);
}
