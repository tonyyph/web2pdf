import type { ReactNode } from 'react';

export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="w2p-label block" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint ? <p className="text-[11px] text-slate-500 dark:text-slate-400">{hint}</p> : null}
    </div>
  );
}

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  disabled,
}: {
  value: T;
  options: readonly SegmentOption<T>[];
  onChange: (value: T) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <div className="w2p-segment" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className="w2p-segment-item"
          aria-pressed={value === option.value}
          disabled={disabled}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex items-start gap-2.5 ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
    >
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input
          type="checkbox"
          className="peer sr-only"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span
          aria-hidden="true"
          className="h-4 w-7 rounded-full bg-slate-300 transition-colors duration-150
            peer-checked:bg-brand-600 peer-focus-visible:outline-2
            peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-500
            dark:bg-slate-600"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-0.5 left-0.5 h-3 w-3 rounded-full bg-white
            shadow transition-transform duration-150 ease-[var(--ease-snap)]
            peer-checked:translate-x-3"
        />
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] leading-tight font-medium text-slate-800 dark:text-slate-200">
          {label}
        </span>
        {description ? (
          <span className="mt-0.5 block text-[11px] leading-snug text-slate-500 dark:text-slate-400">
            {description}
          </span>
        ) : null}
      </span>
    </label>
  );
}

export function Select<T extends string>({
  id,
  value,
  options,
  onChange,
  disabled,
  ariaLabel,
}: {
  id?: string;
  value: T;
  options: readonly SegmentOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <select
      id={id}
      className="w2p-input"
      value={value}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(event) => onChange(event.target.value as T)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function NumberInput({
  id,
  value,
  min,
  max,
  step = 1,
  suffix,
  onChange,
  disabled,
  ariaLabel,
}: {
  id?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <div className="relative">
      <input
        id={id}
        type="number"
        className="w2p-input"
        value={Number.isFinite(value) ? value : min}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(event) => {
          const next = Number.parseFloat(event.target.value);
          onChange(Number.isFinite(next) ? next : min);
        }}
      />
      {suffix ? (
        <span className="pointer-events-none absolute top-1/2 right-7 -translate-y-1/2 text-[11px] text-slate-400">
          {suffix}
        </span>
      ) : null}
    </div>
  );
}

export function Disclosure({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details className="group" open={defaultOpen}>
      <summary
        className="flex cursor-pointer list-none items-center justify-between rounded-lg px-1 py-1.5
          text-[13px] font-medium text-slate-700 transition-colors hover:text-slate-900
          dark:text-slate-300 dark:hover:text-slate-100"
      >
        {title}
        <svg
          className="h-3.5 w-3.5 transition-transform duration-150 group-open:rotate-90"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden="true"
        >
          <path d="M6 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      <div className="mt-2 space-y-3 px-1 pb-1">{children}</div>
    </details>
  );
}
