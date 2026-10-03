import type {
  Asset,
  AssetDerivative,
  AssetType,
  Observation,
  ProjectPhase,
  SearchAssetsArgs,
  SearchAssetsRow,
} from '../../types/database';
import { SEARCH_ASSETS_HARD_ROW_CAP, SEARCH_ASSETS_LIMIT_MAX } from '../../types/database';
import type { AssetMediaRef } from '../media';
import { failed, ready, readyOrEmpty, undetermined, type DataState } from '../state';
import { apiFetch, rpc, table } from '../supabase/client';
import { asRecord, num, parseAsset, parseAssetDerivatives, parseSearchAssets, str, strArray } from './parse';

export interface EvidenceFilters {
  text: string;
  dateFrom: string;
  dateTo: string;
  tags: string[];
  gpsAccuracyMax: string;
  assetType: AssetType | null;
  phase: ProjectPhase | null;
}

export const EMPTY_FILTERS: EvidenceFilters = {
  text: '',
  dateFrom: '',
  dateTo: '',
  tags: [],
  gpsAccuracyMax: '',
  assetType: null,
  phase: null,
};

export interface EvidencePage {
  rows: SearchAssetsRow[];
  totalMatched: number;
  truncated: boolean;
  phaseFacets: Record<string, number>;
  nextCursor: number | null;
  cursor: number;
  pageSize: number;
  /** A GPS accuracy ceiling excludes rows where `gps_accuracy_meters IS NULL`, so un-geotagged
   *  assets are silently dropped by the server. The UI states this rather than hiding it. */
  excludesUngeotaggedAssets: boolean;
  /** `total_matched` and `facet_counts` are computed over the full filtered set, not the page. */
  countsWholeFilteredSet: true;
}

export function filtersEqual(a: EvidenceFilters, b: EvidenceFilters): boolean {
  return (
    a.text === b.text &&
    a.dateFrom === b.dateFrom &&
    a.dateTo === b.dateTo &&
    a.gpsAccuracyMax === b.gpsAccuracyMax &&
    a.assetType === b.assetType &&
    a.phase === b.phase &&
    a.tags.length === b.tags.length &&
    a.tags.every((tag, index) => tag === b.tags[index])
  );
}

function toRpcArgs(filters: EvidenceFilters, cursor: number, pageSize: number): SearchAssetsArgs {
  const accuracy = filters.gpsAccuracyMax.trim();
  return {
    p_q: filters.text.trim() === '' ? null : filters.text.trim(),
    p_date_from: filters.dateFrom === '' ? null : filters.dateFrom,
    p_date_to: filters.dateTo === '' ? null : filters.dateTo,
    p_tags: filters.tags.length === 0 ? null : filters.tags,
    p_gps_accuracy_max: accuracy === '' ? null : Number(accuracy),
    p_asset_type: filters.assetType,
    p_phase: filters.phase,
    p_limit: Math.min(Math.max(pageSize, 1), SEARCH_ASSETS_LIMIT_MAX),
    p_offset: cursor,
  };
}

/** Every filter runs through the `search_assets` RPC server-side. The client never downloads the
 *  table and filters in JavaScript. */
export async function searchEvidence(
  filters: EvidenceFilters,
  cursor: number,
  pageSize = 24,
): Promise<DataState<EvidencePage>> {
  const args = toRpcArgs(filters, cursor, pageSize);
  if (args.p_gps_accuracy_max !== null && !Number.isFinite(args.p_gps_accuracy_max)) return failed();
  const envelope = await rpc('search_assets', args as unknown as Record<string, unknown>);
  if (envelope.error) return failed();
  const parsed = parseSearchAssets(envelope.data);
  if (parsed === null) return failed();
  return ready<EvidencePage>({
    rows: parsed.data,
    totalMatched: parsed.total_matched,
    truncated: parsed.truncated,
    phaseFacets: parsed.facet_counts.phase,
    nextCursor: parsed.next_cursor,
    cursor,
    pageSize,
    excludesUngeotaggedAssets: args.p_gps_accuracy_max !== null,
    countsWholeFilteredSet: true,
  });
}

export function hitHardCap(page: EvidencePage): boolean {
  return page.truncated || page.totalMatched > SEARCH_ASSETS_HARD_ROW_CAP;
}

/** Exact row count for `assets`, taken from PostgREST's `Content-Range` rather than counted in
 *  the browser over a bounded page. */
export async function countAssets(): Promise<DataState<number>> {
  const assets = table('assets');
  if (assets === null) return failed();
  const envelope = await assets.select('*').countExact();
  if (envelope.error) return failed();
  return envelope.count === null ? undetermined() : ready(envelope.count);
}

/* ── one asset ───────────────────────────────────────────────────────────── */

export async function getAsset(assetId: string): Promise<DataState<Asset>> {
  const assets = table('assets');
  if (assets === null) return failed();
  const envelope = await assets.select('*').eq('id', assetId).limit(1);
  if (envelope.error) return failed();
  /* `select` resolves to a row array even for a single-row filter, so the first row is unwrapped
     before `parseAsset`, which only accepts one record — otherwise every asset resolved as
     undetermined and the detail view could never load. An absent or RLS-hidden row stays
     `unknown` rather than becoming a fabricated asset. */
  const record = Array.isArray(envelope.data) ? envelope.data[0] : envelope.data;
  const asset = parseAsset(record);
  return asset === null ? undetermined() : ready(asset);
}

export async function getAssetDerivatives(assetId: string): Promise<DataState<AssetDerivative[]>> {
  const derivatives = table('asset_derivatives');
  if (derivatives === null) return failed();
  const envelope = await derivatives
    .select('*')
    .eq('parent_asset_id', assetId)
    .order('created_at', true);
  if (envelope.error) return failed();
  return readyOrEmpty(parseAssetDerivatives(envelope.data));
}

export async function getObservations(assetId: string): Promise<DataState<Observation[]>> {
  const observations = table('observations');
  if (observations === null) return failed();
  const envelope = await observations.select('*').eq('asset_id', assetId).order('created_at', false);
  if (envelope.error) return failed();
  const rows = (Array.isArray(envelope.data) ? envelope.data : [])
    .map((row) => asRecord(row))
    .filter((row): row is Record<string, unknown> => row !== null)
    .map((row) => ({
      id: str(row.id) ?? '',
      asset_id: str(row.asset_id) ?? '',
      project_id: str(row.project_id) ?? '',
      org_id: str(row.org_id) ?? '',
      observer_id: str(row.observer_id),
      observation_type: str(row.observation_type),
      metrics: (asRecord(row.metrics) ?? {}) as Observation['metrics'],
      notes: str(row.notes),
      created_at: str(row.created_at) ?? '',
    }))
    .filter((row) => row.id !== '');
  return readyOrEmpty(rows);
}

/* ── media ────────────────────────────────────────────────────────────────────
   A client never supplies a `public_id`. It asks by `asset_id` and the API resolves the resource
   under RLS, so the media component takes an `assetId`, not a URL. */

function parseMediaRef(raw: unknown, assetId: string): AssetMediaRef | null {
  const record = asRecord(raw);
  if (record === null) return null;
  const declaredType = str(record.asset_type);
  return {
    assetId,
    assetType: declaredType === 'video' ? 'video' : 'image',
    publicId: str(record.public_id),
    signedDeliveryUrl: str(record.signed_delivery_url),
    authenticated: record.authenticated === true,
    width: num(record.width),
    height: num(record.height),
  };
}

export async function resolveAssetMedia(assetId: string): Promise<AssetMediaRef | null> {
  return apiFetch<AssetMediaRef>(`/v1/assets/${encodeURIComponent(assetId)}/media`, (raw) =>
    parseMediaRef(raw, assetId),
  );
}

export function observedTags(row: SearchAssetsRow): string[] {
  return strArray(row.ai_tags);
}
