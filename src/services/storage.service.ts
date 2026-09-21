import { cloneDefaultSettings } from '../core/settings/defaults';
import { migrateSettings } from '../core/settings/migrate';
import { STORAGE_KEY_SETTINGS, type Settings } from '../core/settings/schema';
import { validateSettings } from '../core/settings/validate';

/**
 * Settings persistence. Everything read back from storage goes through
 * migration + validation: a stored blob is untrusted input, whether it was
 * written by an older version or tampered with.
 */

export async function loadSettings(): Promise<Settings> {
  try {
    const stored = await chrome.storage.local.get(STORAGE_KEY_SETTINGS);
    const raw = stored[STORAGE_KEY_SETTINGS];
    if (raw === undefined) return cloneDefaultSettings();
    return migrateSettings(raw);
  } catch (error) {
    console.warn('[Web2PDF] Falling back to default settings:', error);
    return cloneDefaultSettings();
  }
}

export async function saveSettings(settings: Settings): Promise<Settings> {
  const validated = validateSettings(settings);
  await chrome.storage.local.set({ [STORAGE_KEY_SETTINGS]: validated });
  return validated;
}

export async function patchSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await loadSettings();
  return saveSettings({ ...current, ...patch });
}

export async function resetSettings(): Promise<Settings> {
  const defaults = cloneDefaultSettings();
  await chrome.storage.local.set({ [STORAGE_KEY_SETTINGS]: defaults });
  return defaults;
}

/**
 * Run a stored blob through migration once at install/update time so the
 * first export never pays the migration cost.
 */
export async function ensureSettingsMigrated(): Promise<Settings> {
  const settings = await loadSettings();
  await chrome.storage.local.set({ [STORAGE_KEY_SETTINGS]: settings });
  return settings;
}

export function onSettingsChanged(listener: (settings: Settings) => void): () => void {
  const handler = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ): void => {
    if (areaName !== 'local') return;
    const change = changes[STORAGE_KEY_SETTINGS];
    if (!change) return;
    listener(migrateSettings(change.newValue));
  };

  chrome.storage.onChanged.addListener(handler);
  return () => chrome.storage.onChanged.removeListener(handler);
}
