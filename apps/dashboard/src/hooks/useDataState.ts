import type { UseQueryResult } from '@tanstack/react-query';
import { failed, loading, ready, type DataState } from '../lib/state';

/** The single bridge from a TanStack Query result to the `DataState<T>` seam.
 *
 *  Every service in `lib/queries` already resolves to a `DataState<T>` — a refusal, an empty
 *  result, or a payload — so that state is handed to the component unchanged. It is deliberately
 *  NOT wrapped in `ready(...)`: re-wrapping hands a component a "ready" state whose payload is
 *  another state object, so `state.data.rows` is `undefined` and the screen dies on `.map`
 *  instead of showing the honest error or empty state the service actually returned. */
export function toDataState<T>(result: UseQueryResult<DataState<T>, unknown>): DataState<T> {
  const retry = (): void => {
    void result.refetch();
  };
  if (result.isPending) return loading<T>();
  if (result.isError || result.data === undefined) return failed<T>(retry);
  return result.data;
}

/** The same bridge for the one kind of query that resolves to a bare payload instead of a
 *  `DataState` — `resolveAssetMedia` reads an API route, not Supabase. `map` turns that payload into
 *  an honest state; a `null` payload is never dressed up as data. */
export function toRawDataState<TPayload, TState = TPayload>(
  result: UseQueryResult<TPayload, unknown>,
  map: (data: TPayload) => DataState<TState>,
): DataState<TState> {
  const retry = (): void => {
    void result.refetch();
  };
  if (result.isPending) return loading<TState>();
  if (result.isError || result.data === undefined) return failed<TState>(retry);
  return map(result.data);
}

/** Reads the rows out of a service state. They exist only when the service is `ready`; every other
 *  state — a refusal, a failure, a query that has not settled — contributes no rows rather than an
 *  absent array, so a caller can never map over `undefined`. */
export function rowsOf<T>(state: DataState<T[]> | undefined): T[] {
  return state !== undefined && state.status === 'ready' ? state.data : [];
}
