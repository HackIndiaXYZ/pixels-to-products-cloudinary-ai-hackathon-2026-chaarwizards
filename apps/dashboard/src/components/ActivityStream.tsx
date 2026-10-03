import { useActivityStream, type ActivitySource } from '../hooks/useActivityStream';
import type { ActivityEntryModel } from '../lib/models';
import { EMPTY_COPY, UNKNOWN_COPY, fieldLabel } from '../lib/state';
import { AssetMedia } from './AssetMedia';
import { ClayCard } from './ClayCard';
import { DataBoundary } from './DataBoundary';
import { Icon, type IconName } from './Icon';
import { StatusBadge } from './StatusBadge';
import type { BadgeTone } from './StatusBadge';

/** `audit_logs.action` is the only vocabulary here. The status shown is derived from that stored
 *  action — no status is invented, and "Quarantined" is never claimed from this table because
 *  quarantine lives on `assets.quarantined_at`, not on the audit action. */
const ACTION_STATUS: Record<string, { label: string; tone: BadgeTone; glyph: IconName }> = {
  upload: { label: 'Processed', tone: 'info', glyph: 'layers' },
  transform: { label: 'Processed', tone: 'info', glyph: 'layers' },
  tag: { label: 'Processed', tone: 'info', glyph: 'layers' },
  pair: { label: 'Change event', tone: 'info', glyph: 'change' },
  detect: { label: 'Change detected', tone: 'info', glyph: 'change' },
  package: { label: 'Reported', tone: 'info', glyph: 'report' },
  export: { label: 'Exported', tone: 'info', glyph: 'report' },
  verify: { label: 'Verified', tone: 'pass', glyph: 'check' },
};

export interface ActivityStreamProps {
  assetId: string | null;
  onSelect: (assetId: string) => void;
}

export function ActivityStream({ assetId, onSelect }: ActivityStreamProps) {
  const { feed, source } = useActivityStream(assetId);

  return (
    <ClayCard
      title="Recent activity"
      subtitle={
        <span className="pn-row pn-row-wrap">
          Real <code>audit_logs</code> rows, each with its own <code>hashed_at</code> timestamp. Live
          over {source === 'realtime' ? 'Realtime' : '20s polling'}.
        </span>
      }
      action={
        <span className="pn-chip">
          <Icon name={source === 'realtime' ? 'check' : 'clock'} size={12} />
          {source === 'realtime' ? 'Live' : 'Polling'}
        </span>
      }
    >
      <DataBoundary
        state={feed}
        emptyTitle={EMPTY_COPY.activity}
        skeleton={
          <div className="pn-stack-3" aria-busy="true">
            <div className="pn-skeleton" />
            <div className="pn-skeleton" />
            <div className="pn-skeleton" />
          </div>
        }
        onReady={(data) => (
          <ul className="pn-activity" role="list">
            {data.entries.map((entry, index) => (
              <li key={entry.id.state === 'value' ? entry.id.value : index} className="pn-activity-item">
                <span aria-hidden="true" style={{ color: 'var(--pn-text-faint)' }}>
                  <Icon name="clock" size={15} />
                </span>
                <Entry entry={entry} onSelect={onSelect} />
              </li>
            ))}
          </ul>
        )}
      />
    </ClayCard>
  );
}

function Entry({ entry, onSelect }: { entry: ActivityEntryModel; onSelect: (assetId: string) => void }) {
  const action = fieldLabel(entry.action, UNKNOWN_COPY);
  const status = ACTION_STATUS[action];
  const assetId = entry.assetId.state === 'value' && entry.assetId.value !== null ? entry.assetId.value : null;

  return (
    <div className="pn-activity-body">
      <div className="pn-row pn-row-wrap">
        <span className="pn-evidence-name">{action}</span>
        {status === undefined ? null : <StatusBadge label={status.label} tone={status.tone} glyph={status.glyph} />}
        {entry.actorType.state === 'value' && entry.actorType.value !== null ? (
          <span className="pn-chip">actor {entry.actorType.value}</span>
        ) : null}
      </div>
      <span className="pn-evidence-meta">
        {entry.hashedAt.state === 'value' && entry.hashedAt.value !== null
          ? new Date(entry.hashedAt.value).toLocaleString('en-US')
          : 'Timestamp Unknown'}
      </span>
      {assetId === null ? (
        <span className="pn-evidence-meta pn-unknown">No asset reference on this row</span>
      ) : (
        <div className="pn-row pn-row-wrap">
          <span style={{ width: 64 }}>
            <AssetMedia assetId={assetId} maxWidth={128} maxHeight={96} ratio="4 / 3" />
          </span>
          <button type="button" className="pn-btn pn-btn-sm" onClick={() => onSelect(assetId)}>
            Open evidence
          </button>
          <span className="pn-evidence-meta pn-mono">{assetId}</span>
        </div>
      )}
      {entry.currentHash.state === 'value' && entry.currentHash.value !== '' ? (
        <span className="pn-evidence-meta pn-mono">hash {entry.currentHash.value}</span>
      ) : null}
    </div>
  );
}