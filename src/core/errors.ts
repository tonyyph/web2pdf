/**
 * Typed error model. Every failure surfaced to the UI is one of these codes,
 * so the popup can decide which recovery action to offer without parsing
 * strings or leaking a stack trace.
 */

export const ERROR_CODES = [
  'UNSUPPORTED_PAGE',
  'MISSING_PERMISSION',
  'DEBUGGER_ATTACH_FAILED',
  'DEBUGGER_ALREADY_ATTACHED',
  'PAGE_PREPARATION_FAILED',
  'PDF_GENERATION_FAILED',
  'DOWNLOAD_FAILED',
  'TIMEOUT',
  'CANCELLED',
  'INVALID_SETTINGS',
  'INVALID_MESSAGE',
  'UNKNOWN_ERROR',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export type RecoveryAction =
  'retry' | 'open-settings' | 'use-print-dialog' | 'reload-page' | 'none';

export interface AppError {
  readonly code: ErrorCode;
  /** Developer-facing detail. Logged, never rendered verbatim in the UI. */
  readonly message: string;
  /** Short, human sentence rendered in the UI. */
  readonly userMessage: string;
  readonly actions: readonly RecoveryAction[];
}

interface ErrorPresentation {
  readonly userMessage: string;
  readonly actions: readonly RecoveryAction[];
}

const PRESENTATION: Readonly<Record<ErrorCode, ErrorPresentation>> = {
  UNSUPPORTED_PAGE: {
    userMessage: 'This page cannot be exported. Open a regular website and try again.',
    actions: ['none'],
  },
  MISSING_PERMISSION: {
    userMessage: 'Web2PDF needs permission for this tab. Grant it and try again.',
    actions: ['retry', 'open-settings'],
  },
  DEBUGGER_ATTACH_FAILED: {
    userMessage: 'Could not start the PDF engine for this tab. You can print instead.',
    actions: ['retry', 'use-print-dialog'],
  },
  DEBUGGER_ALREADY_ATTACHED: {
    userMessage:
      'Another tool (usually DevTools) is already attached to this tab. Close it and try again.',
    actions: ['retry', 'use-print-dialog'],
  },
  PAGE_PREPARATION_FAILED: {
    userMessage: 'The page could not be prepared for export. Reload it and try again.',
    actions: ['retry', 'reload-page'],
  },
  PDF_GENERATION_FAILED: {
    userMessage: 'Generating the PDF failed. Try again, or use the print dialog.',
    actions: ['retry', 'use-print-dialog'],
  },
  DOWNLOAD_FAILED: {
    userMessage: 'The PDF was created but could not be saved. Check your download settings.',
    actions: ['retry', 'open-settings'],
  },
  TIMEOUT: {
    userMessage: 'This took too long and was stopped. Very long pages can time out.',
    actions: ['retry', 'use-print-dialog'],
  },
  CANCELLED: { userMessage: 'Export cancelled.', actions: ['retry'] },
  INVALID_SETTINGS: {
    userMessage: 'Some settings are invalid. Review them and try again.',
    actions: ['open-settings'],
  },
  INVALID_MESSAGE: {
    userMessage: 'Something went wrong talking to the page. Reload it and try again.',
    actions: ['retry', 'reload-page'],
  },
  UNKNOWN_ERROR: { userMessage: 'Something went wrong. Please try again.', actions: ['retry'] },
};

export function createError(code: ErrorCode, message?: string): AppError {
  const presentation = PRESENTATION[code];
  return {
    code,
    message: message ?? presentation.userMessage,
    userMessage: presentation.userMessage,
    actions: presentation.actions,
  };
}

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && (ERROR_CODES as readonly string[]).includes(value);
}

export function isAppError(value: unknown): value is AppError {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<AppError>;
  return (
    isErrorCode(candidate.code) &&
    typeof candidate.message === 'string' &&
    typeof candidate.userMessage === 'string' &&
    Array.isArray(candidate.actions)
  );
}

/** Coerce anything thrown (including Chrome's `lastError`) into an AppError. */
export function toAppError(value: unknown, fallback: ErrorCode = 'UNKNOWN_ERROR'): AppError {
  if (isAppError(value)) return value;
  if (value instanceof Error) {
    if (/already attached/i.test(value.message)) {
      return createError('DEBUGGER_ALREADY_ATTACHED', value.message);
    }
    if (
      /cannot access|chrome-extension|extension manifest|cannot be scripted/i.test(value.message)
    ) {
      return createError('UNSUPPORTED_PAGE', value.message);
    }
    return createError(fallback, value.message);
  }
  if (typeof value === 'string') return createError(fallback, value);
  return createError(fallback, 'Non-error value thrown');
}

/** Result pattern: business logic returns these instead of throwing. */
export type Result<T, E = AppError> = { ok: true; value: T } | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}
