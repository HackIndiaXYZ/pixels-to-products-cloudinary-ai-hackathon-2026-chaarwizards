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
      <div role="status" aria-live="polite" data-testid="async-loading">
        {loadingLabel}
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div role="alert" data-testid="async-error">
        <p>{errorMessage(error)}</p>
        {onRetry ? (
          <button type="button" onClick={onRetry}>
            Retry
          </button>
        ) : null}
      </div>
    );
  }

  if (data === undefined || isEmpty(data)) {
    return (
      <div data-testid="async-empty">
        <p>{emptyLabel}</p>
      </div>
    );
  }

  return <>{children(data)}</>;
}
