import { beforeEach, describe, expect, it } from 'vitest';
import {
  base64ByteLength,
  buildPdfDataUrl,
  downloadPdf,
  MAX_DATA_URL_BYTES,
  PDF_MIME_TYPE,
} from '@/services/download.service';
import { installChromeMock, type ChromeMock } from './setup';

const FAKE_PDF_BASE64 = 'JVBERi0xLjQKJVBERi0xLjQK';

let mock: ChromeMock;

beforeEach(() => {
  mock = installChromeMock();
});

describe('buildPdfDataUrl', () => {
  it('produces a correctly typed data URL', () => {
    expect(buildPdfDataUrl('AAAA')).toBe(`data:${PDF_MIME_TYPE};base64,AAAA`);
  });
});

describe('base64ByteLength', () => {
  it('accounts for padding', () => {
    expect(base64ByteLength('AAAA')).toBe(3);
    expect(base64ByteLength('AAA=')).toBe(2);
    expect(base64ByteLength('AA==')).toBe(1);
    expect(base64ByteLength('')).toBe(0);
  });
});

describe('downloadPdf', () => {
  it('hands a data URL and the filename to chrome.downloads', async () => {
    mock.downloads.download.mockResolvedValue(77);

    const result = await downloadPdf({ base64: FAKE_PDF_BASE64, filename: 'report.pdf' });

    expect(result).toEqual({ ok: true, value: 77 });
    expect(mock.downloads.download).toHaveBeenCalledWith({
      url: `data:${PDF_MIME_TYPE};base64,${FAKE_PDF_BASE64}`,
      filename: 'report.pdf',
      saveAs: false,
      conflictAction: 'uniquify',
    });
  });

  it('honours saveAs when asked', async () => {
    mock.downloads.download.mockResolvedValue(1);
    await downloadPdf({ base64: FAKE_PDF_BASE64, filename: 'a.pdf', saveAs: true });
    expect(mock.downloads.download.mock.calls[0]![0]).toMatchObject({ saveAs: true });
  });

  it('rejects an empty payload without calling the API', async () => {
    const result = await downloadPdf({ base64: '', filename: 'a.pdf' });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.code).toBe('DOWNLOAD_FAILED');
    expect(mock.downloads.download).not.toHaveBeenCalled();
  });

  it('rejects a payload that exceeds the data-URL limit', async () => {
    const oversized = 'A'.repeat(Math.ceil((MAX_DATA_URL_BYTES + 1024) * (4 / 3)));
    const result = await downloadPdf({ base64: oversized, filename: 'a.pdf' });
    expect(result.ok).toBe(false);
    expect(mock.downloads.download).not.toHaveBeenCalled();
  });

  it('maps a rejected download to DOWNLOAD_FAILED', async () => {
    mock.downloads.download.mockRejectedValue(new Error('Download interrupted'));

    const result = await downloadPdf({ base64: FAKE_PDF_BASE64, filename: 'a.pdf' });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.code).toBe('DOWNLOAD_FAILED');
    expect(result.error.userMessage).not.toContain('Download interrupted');
  });

  it('treats a missing download id as a failure', async () => {
    mock.downloads.download.mockResolvedValue(undefined);
    mock.runtime.lastError = { message: 'User cancelled' };

    const result = await downloadPdf({ base64: FAKE_PDF_BASE64, filename: 'a.pdf' });

    expect(result.ok).toBe(false);
    mock.runtime.lastError = undefined;
  });
});
