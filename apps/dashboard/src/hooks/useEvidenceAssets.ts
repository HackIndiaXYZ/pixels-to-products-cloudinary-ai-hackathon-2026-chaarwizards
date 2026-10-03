import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  EMPTY_FILTERS,
  filtersEqual,
  searchEvidence,
  type EvidenceFilters,
  type EvidencePage,
} from '../lib/queries/evidence';
import { empty, type DataState } from '../lib/state';
import { toDataState } from './useDataState';

/** Every filter reaches the `search_assets` RPC server-side; nothing is filtered in JavaScript.
 *  The query key carries the whole filter set and the page cursor, so two filter states never
 *  share a cache entry. */
export function useEvidenceAssets(
  filters: EvidenceFilters = EMPTY_FILTERS,
  page = 0,
  pageSize = 24,
): DataState<EvidencePage> {
  const query = useQuery({
    queryKey: ['evidence', { filters, page, pageSize }],
    queryFn: () => searchEvidence(filters, page * pageSize, pageSize),
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  });
  const state = toDataState(query);
  if (state.status !== 'ready') return state;
  return state.data.rows.length === 0 ? empty<EvidencePage>() : state;
}

export function useEvidenceFilterChanges(
  applied: EvidenceFilters,
  draft: EvidenceFilters,
): boolean {
  return !filtersEqual(applied, draft);
}
