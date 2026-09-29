import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../shared/queryKeys';
import { searchAssets } from '../api';
import type { SearchFilters } from '../types';

/**
 * Run a search keyed by the full filter set, so changing any facet produces a
 * distinct cache entry and a Realtime `['search']` invalidation refetches them
 * all (see `shared/realtime/invalidation.ts`).
 */
export function useSearch(filters: SearchFilters, enabled = true) {
  return useQuery({
    queryKey: queryKeys.search(filters as Readonly<Record<string, unknown>>),
    queryFn: ({ signal }) => searchAssets(filters, { limit: 100 }, signal),
    enabled,
  });
}
