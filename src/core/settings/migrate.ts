import { SETTINGS_SCHEMA_VERSION, type Settings } from './schema';
import { validateSettings } from './validate';

type Migration = (input: Record<string, unknown>) => Record<string, unknown>;

/**
 * Migration steps keyed by the version they upgrade FROM.
 * `MIGRATIONS[1]` turns a v1 blob into a v2 blob.
 */
const MIGRATIONS: Readonly<Record<number, Migration>> = {
  // v1 stored margins as a flat `marginMm` number and had no `pageRanges`.
  1: (input) => {
    const page = (
      typeof input.page === 'object' && input.page !== null ? input.page : {}
    ) as Record<string, unknown>;
    const legacyMargin = typeof page.marginMm === 'number' ? page.marginMm : 10;
    const { marginMm: _dropped, ...restPage } = page;
    return {
      ...input,
      page: {
        ...restPage,
        customMargins: page.customMargins ?? {
          topMm: legacyMargin,
          rightMm: legacyMargin,
          bottomMm: legacyMargin,
          leftMm: legacyMargin,
        },
        pageRanges: typeof page.pageRanges === 'string' ? page.pageRanges : '',
      },
      schemaVersion: 2,
    };
  },
};

function readVersion(input: unknown): number {
  if (typeof input !== 'object' || input === null) return 0;
  const version = (input as { schemaVersion?: unknown }).schemaVersion;
  return typeof version === 'number' && Number.isInteger(version) && version > 0 ? version : 1;
}

/**
 * Upgrade a stored blob to the current schema, then validate it. Anything
 * unrecognisable falls back to defaults rather than throwing - a corrupt
 * preference must never block an export.
 */
export function migrateSettings(stored: unknown): Settings {
  if (typeof stored !== 'object' || stored === null) {
    return validateSettings(undefined);
  }

  let current = { ...(stored as Record<string, unknown>) };
  let version = readVersion(current);

  // Bounded loop: each step must advance the version or we stop.
  while (version < SETTINGS_SCHEMA_VERSION) {
    const migration = MIGRATIONS[version];
    if (!migration) break;
    const next = migration(current);
    const nextVersion = readVersion(next);
    if (nextVersion <= version) break;
    current = next;
    version = nextVersion;
  }

  return validateSettings(current);
}

export function needsMigration(stored: unknown): boolean {
  return readVersion(stored) !== SETTINGS_SCHEMA_VERSION;
}
