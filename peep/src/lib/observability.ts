type ErrorContext = Record<string, unknown>;

/**
 * Central error reporting — wire to Sentry/Datadog by setting window.__peepReportError.
 * Safe no-op in production until an SDK is configured.
 */
export function captureError(error: unknown, context: ErrorContext = {}): void {
  const err = error instanceof Error ? error : new Error(String(error));
  if (import.meta.env.DEV) {
    console.error("[peep]", err.message, context, err);
  }
  const reporter = (window as Window & { __peepReportError?: (e: Error, c: ErrorContext) => void }).__peepReportError;
  reporter?.(err, context);
}

export function captureMessage(message: string, context: ErrorContext = {}): void {
  if (import.meta.env.DEV) console.info("[peep]", message, context);
}
