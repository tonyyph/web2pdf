import { create } from 'zustand';
import type { AppError } from '@/core/errors';
import type { ExportJobState, PageInfo } from '@/core/messages';
import { getPageSupport, type PageSupport } from '@/core/page-support';
import { cloneDefaultSettings } from '@/core/settings/defaults';
import type { Settings } from '@/core/settings/schema';
import { loadSettings, saveSettings } from '@/services/storage.service';

/**
 * UI state only. All business logic lives in `src/core` and `src/services`;
 * this store just coordinates what the React tree renders.
 */

interface AppState {
  ready: boolean;
  settings: Settings;
  page: PageInfo | null;
  support: PageSupport;
  job: ExportJobState | null;
  selection: string[];
  error: AppError | null;

  setSettings: (settings: Settings) => void;
  updateSettings: (updater: (settings: Settings) => Settings) => Promise<void>;
  setPage: (page: PageInfo | null) => void;
  setJob: (job: ExportJobState | null) => void;
  setSelection: (selectors: string[]) => void;
  setError: (error: AppError | null) => void;
  hydrate: () => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  ready: false,
  settings: cloneDefaultSettings(),
  page: null,
  support: { supported: false, reason: 'no-url' },
  job: null,
  selection: [],
  error: null,

  setSettings: (settings) => set({ settings }),

  updateSettings: async (updater) => {
    const next = updater(get().settings);
    // Optimistic: the popup stays responsive, storage catches up.
    set({ settings: next });
    const persisted = await saveSettings(next);
    set({ settings: persisted });
  },

  setPage: (page) => set({ page, support: getPageSupport(page?.url) }),
  setJob: (job) => set({ job }),
  setSelection: (selection) => set({ selection }),
  setError: (error) => set({ error }),

  hydrate: async () => {
    const settings = await loadSettings();
    set({ settings, ready: true });
  },
}));
