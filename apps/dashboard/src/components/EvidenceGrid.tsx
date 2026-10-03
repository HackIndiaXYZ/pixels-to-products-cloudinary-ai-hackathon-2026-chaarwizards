import type { EvidencePage } from '../lib/queries/evidence';
import { toEvidenceCardModel } from '../lib/models';
import { useEvidenceAssets } from '../hooks/useEvidenceAssets';
import type { EvidenceFilters } from '../lib/queries/evidence';
import { EMPTY_COPY } from '../lib/state';
import { DataBoundary } from './DataBoundary';
import { EvidenceCard } from './EvidenceCard';
import { Icon } from './Icon';
import { Skeleton } from './Skeleton';

export interface EvidenceGridProps {
  filters: EvidenceFilters;
  page: number;
  pageSize: number;
  selectedAssetId: string | null;
  onSelect: (assetId: string) => void;
  onPageChange: (page: number) => void;
}

/** Filtering, sorting, and pagination happen inside `search_assets` on the server. This component
 *  never filters in JavaScript, and it always reports what the server said about the result set. */
export function EvidenceGrid({
  filters,
  page,
  pageSize,
  selectedAssetId,
  onSelect,
  onPageChange,
}: EvidenceGridProps) {
  const state = useEvidenceAssets(filters, page, pageSize);

  return (
    <DataBoundary
      state={state}
      emptyTitle={EMPTY_COPY.evidence}
      skeleton={
        <div className="pn-grid-evidence" aria-busy="true">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} lines={4} />
          ))}
        </div>
      }
      onReady={(result: EvidencePage) => (
        <div className="pn-stack-4">
          <ResultBanner result={result} page={page} pageSize={pageSize} />
          <ul className="pn-grid-evidence" role="list">
            {result.rows.map((row) => (
              <li key={row.id}>
                <EvidenceCard
                  model={toEvidenceCardModel(row, null)}
                  selected={selectedAssetId === row.id}
                  onSelect={onSelect}
                />
              </li>
            ))}
          </ul>
          <Pagination result={result} page={page} pageSize={pageSize} onPageChange={onPageChange} />
        </div>
      )}
    />
  );
}

function ResultBanner({ result, page, pageSize }: { result: EvidencePage; page: number; pageSize: number }) {
  const from = result.rows.length === 0 ? 0 : page * pageSize + 1;
  const to = page * pageSize + result.rows.length;
  return (
    <div className="pn-stack-3">
      <p className="pn-card-sub">
        Showing {from}–{to} of {result.totalMatched} matching assets
        {result.truncated === true ? ' (result set capped at 1000 rows)' : ''}.
      </p>
      {result.truncated === true ? (
        <p className="pn-note pn-note-warn" role="status">
          <Icon name="warning" size={16} />
          <span>
            <b>Result set truncated.</b> The server caps this query at 1000 rows, so{' '}
            {result.totalMatched} is the full match count while the pages you can open are limited.
            Narrow the filters to reach the remainder.
          </span>
        </p>
      ) : null}
      {result.excludesUngeotaggedAssets === true ? (
        <p className="pn-note pn-note-warn" role="status">
          <Icon name="pin" size={16} />
          <span>
            <b>Un-geotagged assets are excluded.</b> A GPS-accuracy filter omits every row whose{' '}
            <code>gps_accuracy_meters</code> is NULL, so assets without a GPS fix are missing from
            these results rather than filtered out.
          </span>
        </p>
      ) : null}
      {Object.keys(result.phaseFacets).length === 0 ? null : (
        <div className="pn-cluster">
          <span className="pn-metric-label">Phase · full result set</span>
          {Object.entries(result.phaseFacets).map(([phase, count]) => (
            <span key={phase} className="pn-chip">
              {phase} · {count}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Pagination({
  result,
  page,
  pageSize,
  onPageChange,
}: {
  result: EvidencePage;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}) {
  const canGoBack = page > 0;
  const canGoForward = result.nextCursor !== null;
  return (
    <div className="pn-row pn-row-wrap">
      <button
        type="button"
        className="pn-btn"
        disabled={!canGoBack}
        onClick={() => onPageChange(page - 1)}
      >
        <Icon name="chevron-left" size={16} />
        Previous
      </button>
      <span className="pn-card-sub">Page {page + 1}</span>
      <button
        type="button"
        className="pn-btn"
        disabled={!canGoForward}
        onClick={() => onPageChange(page + 1)}
      >
        Next
        <Icon name="chevron-right" size={16} />
      </button>
      <span className="pn-card-sub pn-mono">offset {page * pageSize}</span>
    </div>
  );
}