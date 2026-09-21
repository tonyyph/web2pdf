import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';

/**
 * Minimal in-memory `chrome` mock. Only the surface Web2PDF touches is
 * implemented; anything else surfaces as an explicit failure instead of
 * silently returning undefined.
 */

export interface MockStorageArea {
  data: Record<string, unknown>;
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  clear: ReturnType<typeof vi.fn>;
}

function createStorageArea(): MockStorageArea {
  const data: Record<string, unknown> = {};

  const area: MockStorageArea = {
    data,
    get: vi.fn(async (keys?: string | string[] | null) => {
      if (keys === undefined || keys === null) return { ...data };
      const list = Array.isArray(keys) ? keys : [keys];
      const result: Record<string, unknown> = {};
      for (const key of list) {
        if (key in data) result[key] = data[key];
      }
      return result;
    }),
    set: vi.fn(async (items: Record<string, unknown>) => {
      Object.assign(data, items);
    }),
    remove: vi.fn(async (keys: string | string[]) => {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete data[key];
    }),
    clear: vi.fn(async () => {
      for (const key of Object.keys(data)) delete data[key];
    }),
  };

  return area;
}

export interface ChromeMock {
  runtime: {
    lastError: { message: string } | undefined;
    sendMessage: ReturnType<typeof vi.fn>;
    onMessage: { addListener: ReturnType<typeof vi.fn>; removeListener: ReturnType<typeof vi.fn> };
    openOptionsPage: ReturnType<typeof vi.fn>;
  };
  storage: {
    local: MockStorageArea;
    session: MockStorageArea;
    onChanged: { addListener: ReturnType<typeof vi.fn>; removeListener: ReturnType<typeof vi.fn> };
  };
  tabs: {
    query: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    sendMessage: ReturnType<typeof vi.fn>;
    reload: ReturnType<typeof vi.fn>;
    onRemoved: { addListener: ReturnType<typeof vi.fn> };
    onUpdated: { addListener: ReturnType<typeof vi.fn> };
  };
  scripting: { executeScript: ReturnType<typeof vi.fn> };
  downloads: {
    download: ReturnType<typeof vi.fn>;
    onChanged: { addListener: ReturnType<typeof vi.fn>; removeListener: ReturnType<typeof vi.fn> };
  };
  debugger: {
    attach: ReturnType<typeof vi.fn>;
    detach: ReturnType<typeof vi.fn>;
    sendCommand: ReturnType<typeof vi.fn>;
    getTargets: ReturnType<typeof vi.fn>;
  };
}

export function createChromeMock(): ChromeMock {
  return {
    runtime: {
      lastError: undefined,
      sendMessage: vi.fn(async () => undefined),
      onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
      openOptionsPage: vi.fn(),
    },
    storage: {
      local: createStorageArea(),
      session: createStorageArea(),
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    tabs: {
      query: vi.fn(async () => []),
      get: vi.fn(async () => ({})),
      sendMessage: vi.fn(),
      reload: vi.fn(async () => undefined),
      onRemoved: { addListener: vi.fn() },
      onUpdated: { addListener: vi.fn() },
    },
    scripting: { executeScript: vi.fn(async () => []) },
    downloads: {
      download: vi.fn(async () => 1),
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    debugger: {
      attach: vi.fn((_target: unknown, _version: string, callback?: () => void) => callback?.()),
      detach: vi.fn((_target: unknown, callback?: () => void) => callback?.()),
      sendCommand: vi.fn(
        (_target: unknown, _method: string, _params: unknown, callback?: (r: unknown) => void) =>
          callback?.({}),
      ),
      getTargets: vi.fn(async () => []),
    },
  };
}

/**
 * `@types/chrome` already declares the global, so the mock is assigned through
 * a cast rather than by redeclaring `chrome` (which would collide).
 */
export function installChromeMock(): ChromeMock {
  const mock = createChromeMock();
  (globalThis as { chrome?: unknown }).chrome = mock;
  return mock;
}

/** The installed mock, typed as the mock rather than the real API. */
export function getChromeMock(): ChromeMock {
  return (globalThis as unknown as { chrome: ChromeMock }).chrome;
}

installChromeMock();

// jsdom does not implement scrolling; the prepare service calls it freely.
Object.defineProperty(window, 'scrollTo', {
  writable: true,
  value: vi.fn((options?: number | ScrollToOptions, y?: number) => {
    const top = typeof options === 'number' ? (y ?? 0) : (options?.top ?? 0);
    const left = typeof options === 'number' ? options : (options?.left ?? 0);
    Object.defineProperty(window, 'scrollY', { writable: true, value: top });
    Object.defineProperty(window, 'scrollX', { writable: true, value: left });
  }),
});

afterEach(() => {
  installChromeMock();
  vi.clearAllTimers();
});
