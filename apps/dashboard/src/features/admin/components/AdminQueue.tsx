import { AsyncView } from '../../../shared/components/QueryBoundary';
import type { AssetSearchResultRow } from '../../search/types';
import { selectQuarantined } from '../selectors';

/**
 * Admin quarantine queue (BUILD_ORDER Phase 8 gate — "a quarantined asset is
 * visible in an admin queue and absent from report selection"). Renders only
 * flagged assets, with the three async states. Report builders use
 * `selectReportSelectable`, which excludes exactly these rows.
 */
export interface AdminQueueProps {
  readonly status: 'pending' | 'error' | 'success';
  readonly data: readonly AssetSearchResultRow[] | undefined;
  readonly error?: unknown;
  readonly onRetry?: () => void;
}

export function AdminQueue({ status, data, error, onRetry }: AdminQueueProps) {
  return (
    <AsyncView<readonly AssetSearchResultRow[]>
      status={status}
      data={data}
      error={error}
      isEmpty={(d) => selectQuarantined(d).length === 0}
      loadingLabel="Loading queue…"
      emptyLabel="No quarantined assets."
      {...(onRetry ? { onRetry } : {})}
    >
      {(d) => (
        <ul aria-label="Quarantine queue">
          {selectQuarantined(d).map((asset) => (
            <li key={asset.id} data-testid="quarantine-row">
              <span>{asset.cloudinary_public_id}</span>
              <span className="status status-flagged">flagged</span>
            </li>
          ))}
        </ul>
      )}
    </AsyncView>
  );
}
