import { AsyncView } from '../../../shared/components/QueryBoundary';
import type { SearchResponse, AssetSearchResultRow } from '../types';

/**
 * Search results list with explicit loading / empty / error states
 * (BUILD_ORDER Phase 8 gate). Rows carry only data the API returned under RLS;
 * selecting one opens the asset detail, which fetches a signed URL by
 * `asset_id` (never a client-side Cloudinary lookup, AGENTS.md §3.11).
 */
export interface SearchResultsProps {
  readonly status: 'pending' | 'error' | 'success';
  readonly data: SearchResponse | undefined;
  readonly error?: unknown;
  readonly onOpenAsset: (asset: AssetSearchResultRow) => void;
  readonly onRetry?: () => void;
}

export function SearchResults({ status, data, error, onOpenAsset, onRetry }: SearchResultsProps) {
  return (
    <AsyncView<SearchResponse>
      status={status}
      data={data}
      error={error}
      isEmpty={(d) => d.data.length === 0}
      loadingLabel="Searching…"
      emptyLabel="No assets match these filters."
      {...(onRetry ? { onRetry } : {})}
    >
      {(d) => (
        <div>
          {d.total_matched !== undefined ? (
            <p data-testid="result-count">
              Showing {d.data.length} of {d.total_matched}
              {d.truncated ? ' (truncated)' : ''}
            </p>
          ) : null}
          <ul>
            {d.data.map((asset) => (
              <li key={asset.id}>
                <button type="button" onClick={() => onOpenAsset(asset)} data-testid="result-row">
                  <span>{asset.caption ?? asset.cloudinary_public_id}</span>
                  <span className={`status status-${asset.upload_status}`}>
                    {asset.upload_status}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </AsyncView>
  );
}
