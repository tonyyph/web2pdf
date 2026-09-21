import { createError, err, ok, toAppError, type AppError, type Result } from '../core/errors';

/**
 * Saving the generated PDF.
 *
 * MV3 service workers have no `URL.createObjectURL` (no DOM), so the base64
 * payload is handed to `chrome.downloads.download` as a `data:` URL. The URL
 * is built inside this function and never stored, logged, or kept past the
 * call, so the page content does not linger in memory or in storage.
 */

export const PDF_MIME_TYPE = 'application/pdf';

/** Chrome refuses download URLs beyond roughly this size. */
export const MAX_DATA_URL_BYTES = 200 * 1024 * 1024;

export function buildPdfDataUrl(base64: string): string {
  return `data:${PDF_MIME_TYPE};base64,${base64}`;
}

/** Approximate decoded byte length of a base64 string, without decoding it. */
export function base64ByteLength(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

export interface DownloadOptions {
  base64: string;
  filename: string;
  /** Show the browser's "Save as" dialog instead of saving silently. */
  saveAs?: boolean;
}

export async function downloadPdf(options: DownloadOptions): Promise<Result<number, AppError>> {
  const { base64, filename, saveAs = false } = options;

  if (typeof base64 !== 'string' || base64.length === 0) {
    return err(createError('DOWNLOAD_FAILED', 'Empty PDF payload'));
  }
  if (base64ByteLength(base64) > MAX_DATA_URL_BYTES) {
    return err(
      createError('DOWNLOAD_FAILED', 'Generated PDF is too large to hand to the download API'),
    );
  }

  try {
    const downloadId = await chrome.downloads.download({
      // Built inline: the data URL is never bound to a variable, so the only
      // reference to the PDF bytes dies with this call.
      url: buildPdfDataUrl(base64),
      filename,
      saveAs,
      conflictAction: 'uniquify',
    });

    if (typeof downloadId !== 'number') {
      const message = chrome.runtime.lastError?.message ?? 'downloads.download returned no id';
      return err(createError('DOWNLOAD_FAILED', message));
    }

    return ok(downloadId);
  } catch (error) {
    return err(toAppError(error, 'DOWNLOAD_FAILED'));
  }
}

/** Resolve once the download reaches a terminal state, or time out quietly. */
export function waitForDownload(downloadId: number, timeoutMs = 15_000): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;

    const finish = (success: boolean): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      chrome.downloads.onChanged.removeListener(listener);
      resolve(success);
    };

    const listener = (delta: chrome.downloads.DownloadDelta): void => {
      if (delta.id !== downloadId) return;
      if (delta.state?.current === 'complete') finish(true);
      if (delta.state?.current === 'interrupted') finish(false);
      if (delta.error?.current) finish(false);
    };

    const timer = setTimeout(() => finish(true), timeoutMs);
    chrome.downloads.onChanged.addListener(listener);
  });
}
