import type { ReactNode } from 'react';

/**
 * Explicit loading / empty / error rendering for any async view.
 *
 * BUILD_ORDER Phase 8 gate: "every async view has all three states" — a
 * component that renders nothing on error is a FAIL, because a silent blank
 * screen is how a broken filter ships. Search results, asset detail, and the
 * admin queue all route through this, so none of them can accidentally render
 * `null` on error or on an empty result set.
 */
export interface AsyncViewProps<T> {
  readonly status: 'pending' | 'error' | 'success';
  readonly data: T | undefined;
  readonly error?: unknown;
  /** Return true when `data` holds no rows, to render the empty state. */
  readonly isEmpty: (data: T) => boolean;
  readonly loadingLabel?: string;
  readonly emptyLabel?: string;
  readonly children: (data: T) => ReactNode;
  /** Optional retry handler surfaced on the error state. */
  readonly onRetry?: () => void;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return 'Something went wrong.';
}

export function AsyncView<T>({
  status,
  data,
  error,
  isEmpty,
  loadingLabel = 'Loading…',
  emptyLabel = 'Nothing here yet.',
  children,
  onRetry,
}: AsyncViewProps<T>) {
  if (status === 'pending') {
    return (
      <div className="state-container" role="status" aria-live="polite" data-testid="async-loading">
        <div className="spinner" aria-hidden="true" />
        <span className="state-label">{loadingLabel}</span>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="state-container" role="alert" data-testid="async-error">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-destructive)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/>
          <path d="M12 9v4"/><path d="M12 17h.01"/>
        </svg>
        <span className="state-label" style={{ color: 'var(--color-destructive)' }}>
          {errorMessage(error)}
        </span>
        {onRetry ? (
          <button type="button" className="btn-sm" onClick={onRetry}>
            Retry
          </button>
        ) : null}
      </div>
    );
  }

  if (data === undefined || isEmpty(data)) {
    return (
      <div className="state-container" data-testid="async-empty">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-fg-subtle)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
        </svg>
        <span className="state-label">{emptyLabel}</span>
      </div>
    );
  }

  return <>{children(data)}</>;
}
