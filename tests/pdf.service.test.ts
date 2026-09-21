import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generatePdf, isDebuggerAttached, withDebugger } from '@/services/pdf.service';
import { buildPrintParams } from '@/core/print-params';
import { cloneDefaultSettings } from '@/core/settings/defaults';
import { installChromeMock, type ChromeMock } from './setup';

const CONTEXT = { title: 'Doc', url: 'https://example.com' };
const FAKE_PDF_BASE64 = 'JVBERi0xLjQKJVBERi0xLjQK';

let mock: ChromeMock;

beforeEach(() => {
  mock = installChromeMock();
});

/** Make `sendCommand` resolve `Page.printToPDF` with the given payload. */
function stubPrintToPdf(result: unknown): void {
  mock.debugger.sendCommand.mockImplementation(
    (_target: unknown, method: string, _params: unknown, callback?: (r: unknown) => void) => {
      callback?.(method === 'Page.printToPDF' ? result : {});
    },
  );
}

describe('isDebuggerAttached', () => {
  it('reports an existing attachment on the same tab', async () => {
    mock.debugger.getTargets.mockResolvedValue([{ tabId: 5, attached: true }]);
    await expect(isDebuggerAttached(5)).resolves.toBe(true);
    await expect(isDebuggerAttached(6)).resolves.toBe(false);
  });

  it('ignores detached targets', async () => {
    mock.debugger.getTargets.mockResolvedValue([{ tabId: 5, attached: false }]);
    await expect(isDebuggerAttached(5)).resolves.toBe(false);
  });
});

describe('withDebugger', () => {
  it('attaches, runs the work, then detaches', async () => {
    const order: string[] = [];
    mock.debugger.attach.mockImplementation((_t: unknown, _v: string, callback?: () => void) => {
      order.push('attach');
      callback?.();
    });
    mock.debugger.detach.mockImplementation((_t: unknown, callback?: () => void) => {
      order.push('detach');
      callback?.();
    });

    const result = await withDebugger({ tabId: 1 }, async () => {
      order.push('work');
      return 'value';
    });

    expect(result).toEqual({ ok: true, value: 'value' });
    expect(order).toEqual(['attach', 'work', 'detach']);
  });

  it('detaches even when the work throws', async () => {
    const result = await withDebugger({ tabId: 1 }, async () => {
      throw new Error('boom');
    });

    expect(result.ok).toBe(false);
    expect(mock.debugger.detach).toHaveBeenCalledTimes(1);
  });

  it('refuses to attach when another client already holds the tab', async () => {
    mock.debugger.getTargets.mockResolvedValue([{ tabId: 1, attached: true }]);

    const result = await withDebugger({ tabId: 1 }, async () => 'unreachable');

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.code).toBe('DEBUGGER_ALREADY_ATTACHED');
    expect(mock.debugger.attach).not.toHaveBeenCalled();
    expect(mock.debugger.detach).not.toHaveBeenCalled();
  });

  it('maps a failed attach to DEBUGGER_ATTACH_FAILED', async () => {
    mock.debugger.attach.mockImplementation((_t: unknown, _v: string, callback?: () => void) => {
      mock.runtime.lastError = { message: 'Cannot attach to this target' };
      callback?.();
      mock.runtime.lastError = undefined;
    });

    const result = await withDebugger({ tabId: 1 }, async () => 'unreachable');

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.code).toBe('DEBUGGER_ATTACH_FAILED');
    // Nothing was attached, so nothing needs detaching.
    expect(mock.debugger.detach).not.toHaveBeenCalled();
  });

  it('maps an "already attached" attach error to its own code', async () => {
    mock.debugger.attach.mockImplementation((_t: unknown, _v: string, callback?: () => void) => {
      mock.runtime.lastError = { message: 'Another debugger is already attached' };
      callback?.();
      mock.runtime.lastError = undefined;
    });

    const result = await withDebugger({ tabId: 1 }, async () => 'unreachable');
    if (result.ok) throw new Error('expected failure');
    expect(result.error.code).toBe('DEBUGGER_ALREADY_ATTACHED');
  });
});

describe('generatePdf', () => {
  it('sends Page.printToPDF with the built params and returns base64', async () => {
    stubPrintToPdf({ data: FAKE_PDF_BASE64 });
    const params = buildPrintParams(cloneDefaultSettings(), CONTEXT);

    const result = await generatePdf(42, params);

    expect(result).toEqual({ ok: true, value: FAKE_PDF_BASE64 });

    const call = mock.debugger.sendCommand.mock.calls.find((args) => args[1] === 'Page.printToPDF');
    expect(call).toBeDefined();
    expect(call![0]).toEqual({ tabId: 42 });
    expect(call![2]).toMatchObject({
      transferMode: 'ReturnAsBase64',
      landscape: false,
      printBackground: true,
    });
  });

  it('enables the Page domain before printing', async () => {
    stubPrintToPdf({ data: FAKE_PDF_BASE64 });
    await generatePdf(1, buildPrintParams(cloneDefaultSettings(), CONTEXT));

    const methods = mock.debugger.sendCommand.mock.calls.map((args) => args[1]);
    expect(methods.indexOf('Page.enable')).toBeLessThan(methods.indexOf('Page.printToPDF'));
  });

  it('detaches after a successful generation', async () => {
    stubPrintToPdf({ data: FAKE_PDF_BASE64 });
    await generatePdf(1, buildPrintParams(cloneDefaultSettings(), CONTEXT));
    expect(mock.debugger.detach).toHaveBeenCalledWith({ tabId: 1 }, expect.any(Function));
  });

  it('detaches after a failed generation', async () => {
    mock.debugger.sendCommand.mockImplementation(
      (_t: unknown, _m: string, _p: unknown, callback?: (r: unknown) => void) => {
        mock.runtime.lastError = { message: 'Printing failed' };
        callback?.(undefined);
        mock.runtime.lastError = undefined;
      },
    );

    const result = await generatePdf(1, buildPrintParams(cloneDefaultSettings(), CONTEXT));

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.code).toBe('PDF_GENERATION_FAILED');
    expect(mock.debugger.detach).toHaveBeenCalledTimes(1);
  });

  it('fails cleanly when printToPDF returns no data', async () => {
    stubPrintToPdf({ data: '' });

    const result = await generatePdf(1, buildPrintParams(cloneDefaultSettings(), CONTEXT));

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.code).toBe('PDF_GENERATION_FAILED');
    expect(mock.debugger.detach).toHaveBeenCalledTimes(1);
  });

  it('times out and still detaches when Chrome never responds', async () => {
    vi.useFakeTimers();
    mock.debugger.sendCommand.mockImplementation(
      (_t: unknown, method: string, _p: unknown, callback?: (r: unknown) => void) => {
        if (method === 'Page.enable') callback?.({});
        // Page.printToPDF deliberately never calls back.
      },
    );

    const pending = generatePdf(1, buildPrintParams(cloneDefaultSettings(), CONTEXT));
    await vi.advanceTimersByTimeAsync(130_000);
    const result = await pending;

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.code).toBe('TIMEOUT');
    expect(mock.debugger.detach).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
