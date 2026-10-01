import type { AssetPhase, AssetType } from '@panchnama/shared/rn';

/**
 * The seven search facets (BUILD_ORDER Phase 8 — "Search + facets"): free text,
 * a map bounding box, a date range, tags, a GPS-accuracy ceiling, asset type,
 * and capture phase. Every field is optional; an unset facet contributes no
 * query parameter, so the seven filters compose without one silently widening
 * another.
 */
export interface SearchFilters {
  /** Free-text query (`q`). */
  readonly q?: string;
  /** Viewport bounding box `[minLon, minLat, maxLon, maxLat]` for map-driven search. */
  readonly bbox?: readonly [number, number, number, number];
  /** Inclusive ISO date range. */
  readonly dateFrom?: string;
  readonly dateTo?: string;
  /** AI / observation tags; all must be present (AND). */
  readonly tags?: readonly string[];
  /** Reject fixes worse (larger) than this many metres. */
  readonly gpsAccuracyMax?: number;
  /** `image` | `video`. */
  readonly assetType?: AssetType;
  /** `before` | `after`. */
  readonly phase?: AssetPhase;
}

export interface AssetSearchResultRow {
  readonly id: string;
  readonly project_id: string;
  readonly cloudinary_public_id: string;
  readonly asset_type: AssetType | null;
  readonly device_capture_timestamp: string;
  readonly gps_point: { readonly type: 'Point'; readonly coordinates: [number, number] } | null;
  readonly gps_accuracy_meters: number | null;
  readonly gps_provider: string | null;
  readonly caption: string | null;
  readonly ai_tags: readonly string[];
  readonly observation_type: string | null;
  readonly phase: AssetPhase | null;
  readonly upload_status: 'pending' | 'verified' | 'flagged';
}

export interface SearchResponse {
  readonly data: readonly AssetSearchResultRow[];
  readonly truncated?: boolean;
  readonly total_matched?: number;
  readonly facet_counts?: Readonly<Record<string, Readonly<Record<string, number>>>>;
  readonly next_cursor?: string;
}
