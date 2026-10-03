import { useQuarantineQueue } from '../hooks/useQuarantineQueue';
import type { QuarantineItemModel } from '../lib/models';
import { EMPTY_COPY, UNKNOWN_COPY, fieldLabel } from '../lib/state';
import { AssetMedia } from './AssetMedia';
import { ClayCard } from './ClayCard';
import { DataBoundary } from './DataBoundary';
import { IntegrityBadge } from './IntegrityBadge';
import { StatusBadge } from './StatusBadge';

export interface QuarantineQueueProps {
  onSelect: (assetId: string) => void;
}

/** Quarantine is `assets.quarantined_at IS NOT NULL` — there is no quarantine table. There is also
 *  no stored reason, so the reason is derived only from real integrity results and reads
 *  "Reason unavailable" whenever nothing actually failed. */
export function QuarantineQueue({ onSelect }: QuarantineQueueProps) {
  const state = useQuarantineQueue();

  return (
    <ClayCard
      title="Quarantine review"
      subtitle="Assets held out of verified evidence until a reviewer clears them."
    >
      <DataBoundary
        state={state}
        emptyTitle={EMPTY_COPY.quarantine}
        skeleton={
          <div className="pn-stack-3" aria-busy="true">
            <div className="pn-skeleton" />
            <div className="pn-skeleton" />
          </div>
        }
        onReady={(data) => (
          <div className="pn-stack-4">
            <p className="pn-card-sub">
              {data.returned} row{data.returned === 1 ? '' : 's'} returned.{' '}
              {data.returned >= data.sampled
                ? 'Reasons derived for every returned row.'
                : `Reasons derived for the first ${data.sampled} rows only.`}
            </p>
            <ul className="pn-queue" role="list">
              {data.items.map((item) => (
                <QueueItem key={item.asset.id} item={item} onSelect={onSelect} />
              ))}
            </ul>
          </div>
        )}
      />
    </ClayCard>
  );
}

function QueueItem({ item, onSelect }: { item: QuarantineItemModel; onSelect: (assetId: string) => void }) {
  const checks = item.failedChecks;
  return (
    <li className="pn-queue-item">
      <div className="pn-row pn-row-wrap">
        <span style={{ width: 88 }}>
          <AssetMedia assetId={item.asset.id} maxWidth={176} maxHeight={132} ratio="4 / 3" />
        </span>
        <div className="pn-stack-3">
          <span className="pn-evidence-name pn-mono">{item.asset.id}</span>
          <span className="pn-evidence-meta">{item.asset.observation_type ?? UNKNOWN_COPY}</span>
          <span className="pn-evidence-meta">
            quarantined_at {item.asset.quarantined_at === null ? 'Unknown' : new Date(item.asset.quarantined_at).toLocaleString('en-US')}
          </span>
          <div className="pn-cluster pn-cluster-tight">
            <StatusBadge label="Quarantined" tone="flagged" glyph="warning" />
            {item.asset.verification === 'passed' ? (
              <StatusBadge label="Verified" tone="pass" />
            ) : (
              <StatusBadge label={`Verification ${item.asset.verification}`} tone={item.asset.verification === 'failed' ? 'fail' : item.asset.verification === 'unknown' ? 'unknown' : 'pending'} />
            )}
          </div>
        </div>
      </div>
      <div className="pn-stack-3">
        <span className="pn-metric-label">Reason</span>
        <span className="pn-evidence-name">{fieldLabel(item.reason, 'Reason unavailable')}</span>
      </div>
      {checks.length === 0 ? (
        <p className="pn-note pn-note-warn">
          <span>No integrity result was available for this asset, so no reason can be stated.</span>
        </p>
      ) : (
        <ul className="pn-cluster" role="list">
          {checks.map((check) => (
            <li key={check.id} className="pn-cluster pn-cluster-tight">
              <IntegrityBadge state={check.state} />
              <span className="pn-evidence-meta">{check.label}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="pn-row">
        <button type="button" className="pn-btn pn-btn-sm" onClick={() => onSelect(item.asset.id)}>
          Open evidence
        </button>
      </div>
    </li>
  );
}