import type { AssetDerivative } from '@panchnama/shared/rn';
import { apiRequest } from '../../shared/api/client';
import type { AssetSearchResultRow } from '../search/types';

/** Filters accepted by `GET /v1/projects/:id/assets` (api-contracts.md §4). */
export interface AssetListFilters {
  readonly bbox?: readonly [number, number, number, number];
  readonly dateFrom?: string;
  readonly dateTo?: string;
  readonly tags?: readonly string[];
  readonly observationType?: string;
  readonly phase?: 'before' | 'after';
  readonly gpsAccuracyMax?: number;
}

export interface AssetListResponse {
  readonly data: readonly AssetSearchResultRow[];
  readonly total?: number;
  readonly next_cursor?: string;
}

/**
 * The three-state integrity verdict for an asset
 * (`GET /v1/assets/:id/integrity`, api-contracts.md §4). Booleans here map to
 * `pass`/`fail`; a `null` is surfaced as `unknown` in the UI and must never be
 * shown as `pass` (AGENTS.md §3.7).
 */
export interface AssetIntegrity {
  readonly asset_id: string;
  readonly device_capture_timestamp: string;
  readonly server_upload_timestamp: string | null;
  readonly server_received_at: string | null;
  readonly clock_drift_seconds: number | null;
  readonly gps_accuracy_meters: number | null;
  readonly gps_provider: string | null;
  readonly device_signature_verified: boolean | null;
  readonly exif_hash_verified: boolean | null;
  readonly caption_signature_verified: boolean | null;
  readonly audit_chain_intact: boolean | null;
  readonly sha256_matches_commit: boolean | null;
}

function listQuery(filters: AssetListFilters, page?: { limit?: number; cursor?: string }) {
  const query: Record<string, string | number | undefined> = {};
  if (filters.bbox) query['bbox'] = filters.bbox.join(',');
  if (filters.dateFrom) query['date_from'] = filters.dateFrom;
  if (filters.dateTo) query['date_to'] = filters.dateTo;
  if (filters.tags && filters.tags.length > 0) query['tags'] = filters.tags.join(',');
  if (filters.observationType) query['observation_type'] = filters.observationType;
  if (filters.phase) query['phase'] = filters.phase;
  if (filters.gpsAccuracyMax !== undefined) query['gps_accuracy_max'] = filters.gpsAccuracyMax;
  if (page?.limit !== undefined) query['limit'] = page.limit;
  if (page?.cursor !== undefined) query['cursor'] = page.cursor;
  return query;
}

export async function listAssets(
  projectId: string,
  filters: AssetListFilters = {},
  page?: { readonly limit?: number; readonly cursor?: string },
): Promise<AssetListResponse> {
  return apiRequest<AssetListResponse>(`/v1/projects/${projectId}/assets`, {
    query: listQuery(filters, page),
  });
}

export async function getAssetIntegrity(assetId: string): Promise<AssetIntegrity> {
  return apiRequest<AssetIntegrity>(`/v1/assets/${assetId}/integrity`);
}

/**
 * The append-only derivative lineage for an asset (`asset_derivatives`, §3.1).
 * Every row carries the exact `transformation` string and `is_generative`, so
 * the UI can show which bytes are original and which are derived.
 */
export async function getAssetDerivatives(
  assetId: string,
): Promise<{ readonly data: readonly AssetDerivative[] }> {
  return apiRequest<{ readonly data: readonly AssetDerivative[] }>(
    `/v1/assets/${assetId}/derivatives`,
  );
}

/** Ask the API for a short-TTL signed original URL (never a client public_id). */
export async function requestOriginalUrl(
  assetId: string,
  ttlSeconds = 300,
): Promise<{ readonly url: string; readonly expires_at: number }> {
  return apiRequest<{ readonly url: string; readonly expires_at: number }>(
    `/v1/assets/${assetId}/original-url`,
    { method: 'POST', body: { ttl_seconds: ttlSeconds } },
  );
}
