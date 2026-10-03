import type { EvidenceCardModel } from '../lib/models';
import { UNAVAILABLE_COPY, fieldLabel } from '../lib/state';
import { AssetMedia } from './AssetMedia';
import { PhaseBadge, UploadStatusBadge } from './StatusBadge';
import { Icon } from './Icon';

export interface EvidenceCardProps {
  model: EvidenceCardModel;
  selected: boolean;
  onSelect: (assetId: string) => void;
}

function formatTimestamp(value: string | null): string {
  if (value === null) return UNAVAILABLE_COPY;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString('en-US');
}

/** `search_assets` does not return `verification`, so this card deliberately shows no verification
 *  badge — only `upload_status`, which is a separate vocabulary. The inspector shows `verification`
 *  from the full asset row. */
export function EvidenceCard({ model, selected, onSelect }: EvidenceCardProps) {
  const assetId = model.assetId.state === 'value' ? model.assetId.value : '';
  const title =
    model.caption.state === 'value' && model.caption.value !== null && model.caption.value.trim().length > 0
      ? model.caption.value
      : model.observationType.state === 'value' && model.observationType.value !== null
        ? model.observationType.value
        : assetId;

  return (
    <button
      type="button"
      className="pn-evidence-card"
      aria-pressed={selected}
      onClick={() => onSelect(assetId)}
      aria-label={`Open evidence ${title}`}
    >
      <div className="pn-media-frame" style={{ position: 'relative' }}>
        <AssetMedia
          assetId={assetId}
          assetType={model.assetType.state === 'value' ? model.assetType.value : undefined}
          maxWidth={640}
          maxHeight={480}
          alt={title}
          ratio="4 / 3"
        />
        <div className="pn-media-overlay">
          <PhaseBadge phase={model.phase.state === 'value' ? model.phase.value : null} />
          <UploadStatusBadge status={model.uploadStatus.state === 'value' ? model.uploadStatus.value : 'pending'} />
          {model.gpsPoint.state === 'value' && model.gpsPoint.value !== null ? (
            <span className="pn-chip">
              <Icon name="pin" size={12} />
              Geotagged
            </span>
          ) : (
            <span className="pn-chip pn-unknown">No GPS</span>
          )}
        </div>
      </div>
      <div className="pn-stack-3">
        <span className="pn-evidence-name">{title}</span>
        <span className="pn-evidence-meta pn-mono">{assetId}</span>
        <span className="pn-evidence-meta">{formatTimestamp(model.capturedAt.state === 'value' ? model.capturedAt.value : null)}</span>
        <span className="pn-evidence-meta">
          {model.gpsAccuracyMeters.state === 'value' && model.gpsAccuracyMeters.value !== null
            ? `GPS accuracy ${model.gpsAccuracyMeters.value} m · ${fieldLabel(model.gpsProvider, UNAVAILABLE_COPY)}`
            : 'GPS accuracy Unknown'}
        </span>
      </div>
    </button>
  );
}