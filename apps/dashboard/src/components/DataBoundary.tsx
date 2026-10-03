import type { ReactNode } from 'react';
import type { DataState } from '../lib/state';
import { LOADING_COPY, UNKNOWN_COPY } from '../lib/state';
import { ErrorState } from './ErrorState';
import { Skeleton } from './Skeleton';
import { StateBlock } from './StateBlock';

export interface DataBoundaryProps<T> {
  state: DataState<T>;
  onReady: (data: T) => ReactNode;
  skeleton?: ReactNode;
  emptyTitle?: string;
  unauthorizedTitle?: string;
}

/** The one place a `DataState<T>` becomes markup. Because every database-driven component takes a
 *  `DataState<T>` instead of raw data, loading, error, unauthorized, empty, unknown, and ready are
 *  all reachable and none of them can be skipped by accident. */
export function DataBoundary<T>({
  state,
  onReady,
  skeleton,
  emptyTitle,
  unauthorizedTitle,
}: DataBoundaryProps<T>) {
  switch (state.status) {
    case 'loading':
      return <>{skeleton ?? <Skeleton lines={3} label={LOADING_COPY} />}</>;
    case 'error':
      return <ErrorState message={state.message} onRetry={state.retry} />;
    case 'unauthorized':
      return (
        <StateBlock
          title={unauthorizedTitle ?? 'Access restricted'}
          body={
            state.requiredRole === undefined
              ? 'Your role does not have access to this data.'
              : `This view requires the ${state.requiredRole.replace(/_/g, ' ')} role. Hiding the control is not authorization — every read is enforced by row-level security.`
          }
          tone="fail"
        />
      );
    case 'empty':
      return <StateBlock title={state.reason ?? emptyTitle ?? 'Nothing to show.'} />;
    case 'unknown':
      return (
        <StateBlock
          title={UNKNOWN_COPY}
          body="The backend could not determine this value, so it is not shown as a number."
        />
      );
    case 'ready':
      return <>{onReady(state.data)}</>;
  }
}
