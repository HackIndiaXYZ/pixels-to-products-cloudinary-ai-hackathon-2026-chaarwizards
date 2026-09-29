import type { AssetSearchResultRow } from '../search/types';

/**
 * A quarantined (flagged) asset is one whose integrity verification failed
 * (`upload_status = 'flagged'`, AGENTS.md §3.6). It stays visible for review but
 * must be excluded from any report selection (§3.1 evidence integrity).
 */
export function isQuarantined(asset: AssetSearchResultRow): boolean {
  return asset.upload_status === 'flagged';
}

/** The admin review queue: only quarantined assets. */
export function selectQuarantined(
  assets: readonly AssetSearchResultRow[],
): readonly AssetSearchResultRow[] {
  return assets.filter(isQuarantined);
}

/**
 * Assets eligible for report selection: never a quarantined one. A flagged
 * asset silently slipping into a report is exactly the credibility failure the
 * quarantine path exists to prevent.
 */
export function selectReportSelectable(
  assets: readonly AssetSearchResultRow[],
): readonly AssetSearchResultRow[] {
  return assets.filter((a) => !isQuarantined(a));
}
