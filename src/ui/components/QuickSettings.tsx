import {
  MARGIN_PRESET_IDS,
  PAPER_SIZES,
  PAPER_SIZE_IDS,
  SCALE_MAX,
  SCALE_MIN,
  SCALE_STEP,
  type MarginPresetId,
  type OrientationId,
  type PaperSizeId,
} from '@/core/constants';
import type { Settings } from '@/core/settings/schema';
import { Field, NumberInput, Segmented, Select, Toggle, type SegmentOption } from './primitives';

const PAPER_OPTIONS: readonly SegmentOption<PaperSizeId>[] = PAPER_SIZE_IDS.map((id) => ({
  value: id,
  label: id === 'custom' ? 'Custom' : PAPER_SIZES[id].label,
}));

const ORIENTATION_OPTIONS: readonly SegmentOption<OrientationId>[] = [
  { value: 'portrait', label: 'Portrait' },
  { value: 'landscape', label: 'Landscape' },
];

const MARGIN_OPTIONS: readonly SegmentOption<MarginPresetId>[] = MARGIN_PRESET_IDS.map((id) => ({
  value: id,
  label: id.charAt(0).toUpperCase() + id.slice(1),
}));

export interface QuickSettingsProps {
  settings: Settings;
  onChange: (updater: (settings: Settings) => Settings) => void;
  disabled?: boolean;
}

export function QuickSettings({ settings, onChange, disabled }: QuickSettingsProps) {
  const { page, cleanup } = settings;

  const setPage = (patch: Partial<Settings['page']>): void =>
    onChange((current) => ({ ...current, page: { ...current.page, ...patch } }));

  return (
    <div className="w2p-card space-y-3 p-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Paper size" htmlFor="paper-size">
          <Select
            id="paper-size"
            value={page.paperSize}
            options={PAPER_OPTIONS}
            disabled={disabled}
            onChange={(paperSize) => setPage({ paperSize })}
          />
        </Field>

        <Field label="Margins" htmlFor="margin-preset">
          <Select
            id="margin-preset"
            value={page.marginPreset}
            options={MARGIN_OPTIONS}
            disabled={disabled}
            onChange={(marginPreset) => setPage({ marginPreset })}
          />
        </Field>
      </div>

      {page.paperSize === 'custom' ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Width (mm)" htmlFor="paper-width">
            <NumberInput
              id="paper-width"
              value={page.customPaper.widthMm}
              min={10}
              max={2000}
              disabled={disabled}
              onChange={(widthMm) => setPage({ customPaper: { ...page.customPaper, widthMm } })}
            />
          </Field>
          <Field label="Height (mm)" htmlFor="paper-height">
            <NumberInput
              id="paper-height"
              value={page.customPaper.heightMm}
              min={10}
              max={2000}
              disabled={disabled}
              onChange={(heightMm) => setPage({ customPaper: { ...page.customPaper, heightMm } })}
            />
          </Field>
        </div>
      ) : null}

      {page.marginPreset === 'custom' ? (
        <div className="grid grid-cols-4 gap-2">
          {(
            [
              ['Top', 'topMm'],
              ['Right', 'rightMm'],
              ['Bottom', 'bottomMm'],
              ['Left', 'leftMm'],
            ] as const
          ).map(([label, key]) => (
            <Field key={key} label={label} htmlFor={`margin-${key}`}>
              <NumberInput
                id={`margin-${key}`}
                value={page.customMargins[key]}
                min={0}
                max={100}
                step={0.5}
                disabled={disabled}
                onChange={(value) =>
                  setPage({ customMargins: { ...page.customMargins, [key]: value } })
                }
              />
            </Field>
          ))}
        </div>
      ) : null}

      <Field label="Orientation">
        <Segmented
          label="Orientation"
          value={page.orientation}
          options={ORIENTATION_OPTIONS}
          disabled={disabled}
          onChange={(orientation) => setPage({ orientation })}
        />
      </Field>

      <Field label={`Scale — ${Math.round(page.scale * 100)}%`} htmlFor="scale">
        <input
          id="scale"
          type="range"
          className="w-full accent-brand-600"
          min={SCALE_MIN}
          max={SCALE_MAX}
          step={SCALE_STEP}
          value={page.scale}
          disabled={disabled}
          aria-valuetext={`${Math.round(page.scale * 100)} percent`}
          onChange={(event) => setPage({ scale: Number.parseFloat(event.target.value) })}
        />
      </Field>

      <Toggle
        label="Background graphics"
        description="Include colours and background images in the PDF"
        checked={cleanup.includeBackgrounds}
        disabled={disabled}
        onChange={(includeBackgrounds) =>
          onChange((current) => ({
            ...current,
            cleanup: { ...current.cleanup, includeBackgrounds },
          }))
        }
      />
    </div>
  );
}
