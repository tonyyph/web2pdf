import { beforeEach, describe, expect, it } from 'vitest';
import {
  ensureSettingsMigrated,
  loadSettings,
  patchSettings,
  resetSettings,
  saveSettings,
} from '@/services/storage.service';
import { cloneDefaultSettings } from '@/core/settings/defaults';
import { SETTINGS_SCHEMA_VERSION, STORAGE_KEY_SETTINGS } from '@/core/settings/schema';
import {
  applyJobPatch,
  clearSelection,
  createJob,
  isCancelRequested,
  JOB_STALE_MS,
  readJob,
  readSelection,
  requestCancel,
  writeJob,
  writeSelection,
  clearTabState,
} from '@/services/job.store';
import { installChromeMock, type ChromeMock } from './setup';

let mock: ChromeMock;

beforeEach(() => {
  mock = installChromeMock();
});

describe('settings persistence', () => {
  it('returns defaults when nothing is stored', async () => {
    await expect(loadSettings()).resolves.toEqual(cloneDefaultSettings());
  });

  it('round-trips a saved value', async () => {
    const settings = cloneDefaultSettings();
    settings.page.paperSize = 'legal';
    settings.theme = 'dark';

    await saveSettings(settings);

    const loaded = await loadSettings();
    expect(loaded.page.paperSize).toBe('legal');
    expect(loaded.theme).toBe('dark');
  });

  it('validates on write, so invalid values never reach storage', async () => {
    const hostile = { ...cloneDefaultSettings(), theme: 'neon' } as never;
    await saveSettings(hostile);
    expect(mock.storage.local.data[STORAGE_KEY_SETTINGS]).toMatchObject({ theme: 'system' });
  });

  it('migrates and validates on read', async () => {
    mock.storage.local.data[STORAGE_KEY_SETTINGS] = {
      schemaVersion: 1,
      page: { marginMm: 8, scale: 500 },
    };

    const loaded = await loadSettings();

    expect(loaded.schemaVersion).toBe(SETTINGS_SCHEMA_VERSION);
    expect(loaded.page.customMargins.topMm).toBe(8);
    expect(loaded.page.scale).toBe(2);
  });

  it('survives a storage read failure', async () => {
    mock.storage.local.get.mockRejectedValue(new Error('storage unavailable'));
    await expect(loadSettings()).resolves.toEqual(cloneDefaultSettings());
  });

  it('patches without dropping other fields', async () => {
    const settings = cloneDefaultSettings();
    settings.page.paperSize = 'a3';
    await saveSettings(settings);

    const patched = await patchSettings({ theme: 'light' });

    expect(patched.theme).toBe('light');
    expect(patched.page.paperSize).toBe('a3');
  });

  it('resets to defaults', async () => {
    await saveSettings({ ...cloneDefaultSettings(), theme: 'dark' });
    await expect(resetSettings()).resolves.toEqual(cloneDefaultSettings());
    await expect(loadSettings()).resolves.toEqual(cloneDefaultSettings());
  });

  it('writes back the migrated blob at install time', async () => {
    mock.storage.local.data[STORAGE_KEY_SETTINGS] = { schemaVersion: 1, page: { marginMm: 3 } };
    await ensureSettingsMigrated();
    expect(mock.storage.local.data[STORAGE_KEY_SETTINGS]).toMatchObject({
      schemaVersion: SETTINGS_SCHEMA_VERSION,
    });
  });
});

describe('job store', () => {
  it('round-trips a job through session storage', async () => {
    const job = createJob(3);
    await writeJob(job);
    await expect(readJob(3)).resolves.toEqual(job);
  });

  it('returns null for an unknown tab', async () => {
    await expect(readJob(99)).resolves.toBeNull();
  });

  it('never moves progress backwards mid-run', async () => {
    const job = applyJobPatch(createJob(1), { phase: 'generating' });
    const next = applyJobPatch(job, { phase: 'preparing' });
    expect(next.progress).toBe(job.progress);
  });

  it('zeroes progress on a terminal failure', () => {
    const job = applyJobPatch(createJob(1), { phase: 'generating' });
    expect(applyJobPatch(job, { phase: 'failed' }).progress).toBe(0);
    expect(applyJobPatch(job, { phase: 'cancelled' }).progress).toBe(0);
  });

  it('reaches 100 on completion', () => {
    const job = applyJobPatch(createJob(1), { phase: 'downloading' });
    expect(applyJobPatch(job, { phase: 'completed' }).progress).toBe(100);
  });

  it('recovers a job abandoned by a suspended worker', async () => {
    const stale = { ...createJob(4), updatedAt: Date.now() - JOB_STALE_MS - 1000 };
    await writeJob(stale);

    const recovered = await readJob(4);

    expect(recovered?.phase).toBe('failed');
    expect(recovered?.error?.code).toBe('TIMEOUT');
  });

  it('leaves a finished job alone however old it is', async () => {
    const done = applyJobPatch(createJob(5), { phase: 'completed' });
    await writeJob({ ...done, updatedAt: Date.now() - JOB_STALE_MS * 10 });

    const read = await readJob(5);

    expect(read?.phase).toBe('completed');
  });

  it('tracks cancellation as durable storage state', async () => {
    await expect(isCancelRequested('job_1')).resolves.toBe(false);
    await requestCancel('job_1');
    await expect(isCancelRequested('job_1')).resolves.toBe(true);
  });

  it('stores and clears per-tab selections', async () => {
    await writeSelection(2, ['#a', '#b']);
    await expect(readSelection(2)).resolves.toEqual(['#a', '#b']);
    await clearSelection(2);
    await expect(readSelection(2)).resolves.toEqual([]);
  });

  it('ignores non-string selection entries read back from storage', async () => {
    mock.storage.session.data['web2pdf:selection:9'] = ['#a', 42, null];
    await expect(readSelection(9)).resolves.toEqual(['#a']);
  });

  it('drops both job and selection when a tab goes away', async () => {
    await writeJob(createJob(8));
    await writeSelection(8, ['#x']);

    await clearTabState(8);

    await expect(readJob(8)).resolves.toBeNull();
    await expect(readSelection(8)).resolves.toEqual([]);
  });
});
