import { apiRequest } from '../../shared/api/client';
import type { SearchFilters, SearchResponse } from './types';

/**
 * Translate the seven facets into the `GET /v1/search` query string
 * (api-contracts.md §4). This is a pure function so each facet can be asserted
 * individually (BUILD_ORDER Phase 8 gate — "every facet is tested
 * individually"); an unset facet is omitted entirely rather than sent as an
 * empty string, so a blank field never becomes a filter that matches nothing.
 */
export function buildSearchQuery(
  filters: SearchFilters,
  page?: { readonly limit?: number; readonly cursor?: string },
): Record<string, string | number | undefined> {
  const query: Record<string, string | number | undefined> = {};

  if (filters.q !== undefined && filters.q.trim() !== '') {
    query['q'] = filters.q.trim();
  }
  if (filters.bbox !== undefined) {
    query['bbox'] = filters.bbox.join(',');
  }
  if (filters.dateFrom !== undefined && filters.dateFrom !== '') {
    query['date_from'] = filters.dateFrom;
  }
  if (filters.dateTo !== undefined && filters.dateTo !== '') {
    query['date_to'] = filters.dateTo;
  }
  if (filters.tags !== undefined && filters.tags.length > 0) {
    query['tags'] = filters.tags.join(',');
  }
  if (filters.gpsAccuracyMax !== undefined) {
    query['gps_accuracy_max'] = filters.gpsAccuracyMax;
  }
  if (filters.assetType !== undefined) {
    query['asset_type'] = filters.assetType;
  }
  if (filters.phase !== undefined) {
    query['phase'] = filters.phase;
  }
  if (page?.limit !== undefined) {
    query['limit'] = page.limit;
  }
  if (page?.cursor !== undefined) {
    query['cursor'] = page.cursor;
  }
  return query;
}

/** Run a search. The API resolves org scope from the JWT (AGENTS.md §3.4). */
export async function searchAssets(
  filters: SearchFilters,
  page?: { readonly limit?: number; readonly cursor?: string },
  signal?: AbortSignal,
): Promise<SearchResponse> {
  const options: Parameters<typeof apiRequest>[1] = { query: buildSearchQuery(filters, page) };
  if (signal) {
    (options as { signal?: AbortSignal }).signal = signal;
  }
  return apiRequest<SearchResponse>('/v1/search', options);
}
