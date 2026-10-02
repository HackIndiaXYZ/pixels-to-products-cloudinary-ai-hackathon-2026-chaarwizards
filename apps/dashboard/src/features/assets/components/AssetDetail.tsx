import type { AssetDerivative } from '@panchnama/shared/rn';
import { AsyncView } from '../../../shared/components/QueryBoundary';
import { IntegrityPanel } from '../../integrity/components/IntegrityPanel';
import { DerivativeLineage } from './DerivativeLineage';
import type { AssetIntegrity } from '../api';
import type { AssetSearchResultRow } from '../../search/types';

/**
 * Asset detail (BUILD_ORDER Phase 8): media viewer, EXIF/GPS/timestamp panels,
 * the integrity panel, and the derivative lineage tree. The integrity and
 * lineage sections each carry their own loading / empty / error states so a
 * failed sub-fetch renders an explicit error, never a blank panel (gate —
 * "every async view has all three states").
 *
 * The original preview uses a URL the API signed by `asset_id`; this component
 * never constructs a Cloudinary URL from a `public_id` (AGENTS.md §3.11).
 */
export interface AssetDetailProps {
  readonly asset: AssetSearchResultRow;
  readonly originalUrl: string | null;

  readonly integrityStatus: 'pending' | 'error' | 'success';
  readonly integrity: AssetIntegrity | undefined;
  readonly integrityError?: unknown;

  readonly derivativesStatus: 'pending' | 'error' | 'success';
  readonly derivatives: { readonly data: readonly AssetDerivative[] } | undefined;
  readonly derivativesError?: unknown;
}

export function AssetDetail({
  asset,
  originalUrl,
  integrityStatus,
  integrity,
  integrityError,
  derivativesStatus,
  derivatives,
  derivativesError,
}: AssetDetailProps) {
  return (
    <article className="asset-detail" aria-label="Asset detail" data-testid="asset-detail">
      {/* Media preview */}
      <div className="media-viewer" data-testid="media-viewer">
        {originalUrl ? (
          asset.asset_type === 'video' ? (
            <video src={originalUrl} controls data-testid="media-video" />
          ) : (
            <img src={originalUrl} alt={asset.caption ?? 'Asset'} data-testid="media-image" />
          )
        ) : (
          <div data-testid="media-pending" style={{ color: 'var(--color-fg-muted)', fontSize: '0.8125rem' }}>
            Loading media…
          </div>
        )}
      </div>

      {/* Capture context metadata */}
      <section aria-label="Capture context" className="capture-context">
        <dl>
          <div>
            <dt>Observation</dt>
            <dd>{asset.observation_type ?? '—'}</dd>
          </div>
          <div>
            <dt>Phase</dt>
            <dd>{asset.phase ?? '—'}</dd>
          </div>
          <div>
            <dt>Captured</dt>
            <dd data-testid="device-timestamp">{asset.device_capture_timestamp}</dd>
          </div>
          <div>
            <dt>GPS accuracy</dt>
            <dd data-testid="gps-accuracy">
              {asset.gps_accuracy_meters !== null ? `±${asset.gps_accuracy_meters} m` : 'unknown'}
              {asset.gps_provider ? ` (${asset.gps_provider})` : ''}
            </dd>
          </div>
          <div>
            <dt>AI tags</dt>
            <dd>{asset.ai_tags.length > 0 ? asset.ai_tags.join(', ') : '—'}</dd>
          </div>
        </dl>
      </section>

      {/* Integrity panel */}
      <AsyncView<AssetIntegrity>
        status={integrityStatus}
        data={integrity}
        error={integrityError}
        isEmpty={() => false}
        loadingLabel="Verifying integrity…"
      >
        {(data) => <IntegrityPanel integrity={data} />}
      </AsyncView>

      {/* Derivative lineage */}
      <AsyncView<{ readonly data: readonly AssetDerivative[] }>
        status={derivativesStatus}
        data={derivatives}
        error={derivativesError}
        isEmpty={() => false}
        loadingLabel="Loading lineage…"
      >
        {(data) => (
          <DerivativeLineage
            originalPublicId={asset.cloudinary_public_id}
            derivatives={data.data}
          />
        )}
      </AsyncView>
    </article>
  );
}
