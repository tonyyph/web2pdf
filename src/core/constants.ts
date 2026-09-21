import { type LengthUnit, mmToInches } from './units';

export const APP_NAME = 'Web2PDF';
export const APP_TAGLINE = 'Save any webpage as a clean PDF';

export type PaperSizeId = 'a4' | 'a3' | 'letter' | 'legal' | 'custom';

export interface PaperSpec {
  readonly id: PaperSizeId;
  readonly label: string;
  /** Portrait dimensions in the spec's native unit. */
  readonly width: number;
  readonly height: number;
  readonly unit: LengthUnit;
}

export const PAPER_SIZES: Readonly<Record<Exclude<PaperSizeId, 'custom'>, PaperSpec>> = {
  a4: { id: 'a4', label: 'A4', width: 210, height: 297, unit: 'mm' },
  a3: { id: 'a3', label: 'A3', width: 297, height: 420, unit: 'mm' },
  letter: { id: 'letter', label: 'Letter', width: 8.5, height: 11, unit: 'in' },
  legal: { id: 'legal', label: 'Legal', width: 8.5, height: 14, unit: 'in' },
};

export const PAPER_SIZE_IDS: readonly PaperSizeId[] = ['a4', 'a3', 'letter', 'legal', 'custom'];

export type OrientationId = 'portrait' | 'landscape';
export const ORIENTATIONS: readonly OrientationId[] = ['portrait', 'landscape'];

export type MarginPresetId = 'none' | 'narrow' | 'normal' | 'custom';

export interface MarginSpec {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

/** Preset margins in millimetres; mirrors Chrome's own print presets. */
export const MARGIN_PRESETS_MM: Readonly<Record<Exclude<MarginPresetId, 'custom'>, MarginSpec>> = {
  none: { top: 0, right: 0, bottom: 0, left: 0 },
  narrow: { top: 6.35, right: 6.35, bottom: 6.35, left: 6.35 },
  normal: { top: 25.4, right: 25.4, bottom: 25.4, left: 25.4 },
};

export const MARGIN_PRESET_IDS: readonly MarginPresetId[] = ['none', 'narrow', 'normal', 'custom'];

export const MARGIN_PRESETS_IN: Readonly<Record<Exclude<MarginPresetId, 'custom'>, MarginSpec>> = {
  none: mapMargin(MARGIN_PRESETS_MM.none, mmToInches),
  narrow: mapMargin(MARGIN_PRESETS_MM.narrow, mmToInches),
  normal: mapMargin(MARGIN_PRESETS_MM.normal, mmToInches),
};

function mapMargin(spec: MarginSpec, fn: (value: number) => number): MarginSpec {
  return { top: fn(spec.top), right: fn(spec.right), bottom: fn(spec.bottom), left: fn(spec.left) };
}

export const SCALE_MIN = 0.5;
export const SCALE_MAX = 2;
export const SCALE_STEP = 0.05;

/** Maximum margin we accept from the UI, per side, in millimetres. */
export const MARGIN_MAX_MM = 100;

/** Guardrails for the lazy-loading scroll pass. */
export const LAZY_LOAD_MAX_STEPS = 60;
export const LAZY_LOAD_MAX_DURATION_MS = 20_000;
export const LAZY_LOAD_STEP_DELAY_MS = 180;
/** Pages taller than this get a "very long page" warning. */
export const LONG_PAGE_WARN_PX = 40_000;

export const FONT_READY_TIMEOUT_MS = 3_000;
export const IMAGE_READY_TIMEOUT_MS = 6_000;
export const PREPARE_TIMEOUT_MS = 45_000;
export const PRINT_TO_PDF_TIMEOUT_MS = 120_000;
export const DEBUGGER_PROTOCOL_VERSION = '1.3';

export const DEFAULT_FILENAME_TEMPLATE = '{title}_{date}';
export const MAX_FILENAME_LENGTH = 120;
export const FILENAME_FALLBACK_STEM = 'webpage';
