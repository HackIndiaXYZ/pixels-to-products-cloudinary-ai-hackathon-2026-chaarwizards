import { useEvidenceAsset, type EvidenceAssetBundle } from '../hooks/useEvidenceAsset';
import { useIntegrityChecks } from '../hooks/useIntegrityChecks';
import { UNKNOWN_COPY, UNAVAILABLE_COPY, fieldLabel } from '../lib/state';
import { AssetMedia } from './AssetMedia';
import { ClayCard } from './ClayCard';
import { DataBoundary } from './DataBoundary';
import { HashDisplay } from './HashDisplay';
import { Icon } from './Icon';
import { IntegrityBadge } from './IntegrityBadge';
import { LineageTree } from './LineageTree';
import { PhaseBadge, QuarantineBadge, UploadStatusBadge, VerificationBadge } from './StatusBadge';

export interface EvidenceInspectorProps {
  assetId: string | null;
  onClose: () => void;
}

function timestamp(value: string | null): string {
  if (value === null) return UNAVAILABLE_COPY;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString('en-US');
}

function coordinates(value: { type: 'Point'; coordinates: [number, number] } | null): string {
  if (value === null) return 'Unknown';
  const [lon, lat] = value.coordinates;
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return UNKNOWN_COPY;
  return `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
}

/** Step 6 of the brief. `verification` is read from the full `assets` row because `search_assets`
 *  does not return it, and VERIFIED only appears when the column actually says `passed`. */
export function EvidenceInspector({ assetId, onClose }: EvidenceInspectorProps) {
  const bundle = useEvidenceAsset(assetId);
  const checks = useIntegrityChecks(assetId);

  return (
    <div className="pn-drawer" role="dialog" aria-modal="true" aria-label="Evidence detail">
      <div className="pn-drawer-head">
        <div>
          <p className="pn-metric-label">Evidence</p>
          <h2 className="pn-card-title pn-mono">{assetId ?? UNKNOWN_COPY}</h2>
        </div>
        <button type="button" className="pn-icon-btn" onClick={onClose} aria-label="Close evidence detail">
          <Icon name="close" size={16} />
        </button>
      </div>
      <div className="pn-drawer-body pn-stack-4">
        <DataBoundary
          state={bundle}
          skeleton={<div className="pn-stack-3"><div className="pn-media-frame" /><div className="pn-skeleton" /><div className="pn-skeleton" /></div>}
          onReady={(data: EvidenceAssetBundle) => <Detail data={data} />}
        />
        <DataBoundary
          state={checks}
          skeleton={<div className="pn-stack-3"><div className="pn-skeleton" /><div className="pn-skeleton" /></div>}
          onReady={(data) => (
            <ClayCard title="Integrity" subtitle="Each verdict names the RPC field it came from.">
              <ul className="pn-queue" role="list">
                {data.checks.map((check) => (
                  <li key={check.id} className="pn-cluster">
                    <IntegrityBadge state={check.state} />
                    <span className="pn-evidence-name">{check.label}</span>
                    <span className="pn-evidence-meta pn-mono">{check.source}</span>
                    <span className="pn-evidence-meta">{fieldLabel(check.detail, UNKNOWN_COPY)}</span>
                  </li>
                ))}
              </ul>
            </ClayCard>
          )}
        />
      </div>
    </div>
  );
}

function Detail({ data }: { data: EvidenceAssetBundle }) {
  const detail = data.detail;
  return (
    <>
      <AssetMedia
        assetId={detail.assetId.state === 'value' ? detail.assetId.value : ''}
        assetType={detail.assetType.state === 'value' ? detail.assetType.value : undefined}
        maxWidth={1200}
        maxHeight={900}
      />
      <div className="pn-cluster">
        <VerificationBadge verification={detail.verification.state === 'value' ? detail.verification.value : 'unknown'} />
        <UploadStatusBadge status={detail.uploadStatus.state === 'value' ? detail.uploadStatus.value : 'pending'} />
        <PhaseBadge phase={detail.phase.state === 'value' ? detail.phase.value : null} />
        <QuarantineBadge quarantinedAt={detail.quarantinedAt.state === 'value' ? detail.quarantinedAt.value : null} />
      </div>

      <ClayCard title="Metadata">
        <dl className="pn-kv">
          <dt>Asset ID</dt>
          <dd className="pn-mono">{fieldLabel(detail.assetId)}</dd>
          <dt>Capture time</dt>
          <dd>{timestamp(detail.capturedAt.state === 'value' ? detail.capturedAt.value : null)}</dd>
          <dt>Upload time</dt>
          <dd>{timestamp(detail.serverUploadTimestamp.state === 'value' ? detail.serverUploadTimestamp.value : null)}</dd>
          <dt>Received at</dt>
          <dd>{timestamp(detail.serverReceivedAt.state === 'value' ? detail.serverReceivedAt.value : null)}</dd>
          <dt>GPS</dt>
          <dd className="pn-mono">{coordinates(detail.gpsPoint.state === 'value' ? detail.gpsPoint.value : null)}</dd>
          <dt>GPS accuracy</dt>
          <dd>{detail.gpsAccuracyMeters.state === 'value' && detail.gpsAccuracyMeters.value !== null ? `${detail.gpsAccuracyMeters.value} m` : UNKNOWN_COPY}</dd>
          <dt>GPS provider</dt>
          <dd>{fieldLabel(detail.gpsProvider, UNKNOWN_COPY)}</dd>
          <dt>Device</dt>
          <dd className="pn-mono">{fieldLabel(detail.deviceId, UNKNOWN_COPY)}</dd>
          <dt>File type</dt>
          <dd>{fieldLabel(detail.assetType, UNKNOWN_COPY)}</dd>
          <dt>File size</dt>
          <dd className="pn-unknown">Unknown — assets has no size column</dd>
          <dt>Clock skew</dt>
          <dd>{detail.ntpOffsetSeconds.state === 'value' && detail.ntpOffsetSeconds.value !== null ? `${detail.ntpOffsetSeconds.value} s` : 'Cannot determine'}</dd>
        </dl>
      </ClayCard>

      <ClayCard title="Hashes" subtitle="Byte-exact. Never abbreviated, because a partial digest cannot be verified.">
        <div className="pn-stack-4">
          <HashDisplay label="SHA-256" value={detail.sha256Hash} />
          <HashDisplay label="EXIF hash" value={detail.exifHash} />
          <HashDisplay label="Device commit hash" value={detail.deviceCommitHash} />
          <HashDisplay label="Capture signature" value={detail.captureSignature} />
          {detail.phash.state === 'value' && detail.phash.value !== null ? (
            <HashDisplay label="Perceptual hash" value={detail.phash} />
          ) : (
            <p className="pn-unknown">Perceptual hash Unknown</p>
          )}
        </div>
      </ClayCard>

      <LineageTree assetId={detail.assetId.state === 'value' ? detail.assetId.value : ''} derivatives={data.derivatives} />

      {data.observations.length === 0 ? (
        <ClayCard title="Observations">
          <p className="pn-unknown">No observations recorded.</p>
        </ClayCard>
      ) : (
        <ClayCard title="Observations">
          <ul className="pn-queue" role="list">
            {data.observations.map((observation) => (
              <li key={observation.id} className="pn-cluster">
                <span className="pn-evidence-name">{observation.observation_type ?? UNKNOWN_COPY}</span>
                <span className="pn-evidence-meta">{timestamp(observation.created_at === '' ? null : observation.created_at)}</span>
                <span className="pn-evidence-meta">{observation.notes ?? UNKNOWN_COPY}</span>
              </li>
            ))}
          </ul>
        </ClayCard>
      )}
    </>
  );
}