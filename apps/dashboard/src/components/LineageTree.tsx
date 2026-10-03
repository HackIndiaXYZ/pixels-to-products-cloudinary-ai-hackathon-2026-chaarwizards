import type { AssetDerivative } from '../types/database';
import { toLineageForest } from '../lib/models';
import { UNKNOWN_COPY, fieldLabel } from '../lib/state';
import { ClayCard } from './ClayCard';
import { StatusBadge } from './StatusBadge';

export interface LineageTreeProps {
  assetId: string;
  derivatives: AssetDerivative[];
}

/** `asset_derivatives` is the append-only lineage graph: edges run parent → derivative and are
 *  unique on (parent_asset_id, transformation). The tree is drawn from those stored edges; nothing
 *  is inferred about transformations that are not present. */
export function LineageTree({ assetId, derivatives }: LineageTreeProps) {
  const forest = toLineageForest(assetId, derivatives);

  return (
    <ClayCard
      title="Lineage"
      subtitle={
        derivatives.length === 0
          ? 'No derivatives recorded for this asset.'
          : `${derivatives.length} derivative${derivatives.length === 1 ? '' : 's'} recorded.`
      }
    >
      <ol className="pn-lineage" role="list">
        <li className="pn-lineage-node">
          <span className="pn-lineage-rail" aria-hidden="true">
            <span className="pn-lineage-dot pn-lineage-dot-root" />
          </span>
          <div className="pn-lineage-body">
            <p className="pn-evidence-name">Original asset</p>
            <p className="pn-evidence-meta pn-mono">{assetId}</p>
            <p className="pn-evidence-meta pn-unknown">
              Original is stored as Cloudinary type: authenticated and delivered through a signed URL.
            </p>
          </div>
        </li>
        {forest.children.map((node, index) => (
          <li key={node.id} className="pn-lineage-node">
            <span className="pn-lineage-rail" aria-hidden="true">
              <span className="pn-lineage-dot" />
              {index === forest.children.length - 1 ? null : <span className="pn-lineage-stem" />}
            </span>
            <div className="pn-lineage-body">
              <p className="pn-evidence-name pn-mono">{fieldLabel(node.transformation, UNKNOWN_COPY)}</p>
              <p className="pn-evidence-meta pn-mono">{fieldLabel(node.publicId, UNKNOWN_COPY)}</p>
              <div className="pn-cluster pn-cluster-tight">
                <span className="pn-chip">{node.kind.state === 'value' && node.kind.value !== null ? node.kind.value : 'Kind Unknown'}</span>
                {node.isGenerative.state === 'value' && node.isGenerative.value === true ? (
                  <StatusBadge label="Generative" tone="info" glyph="layers" />
                ) : null}
                <span className="pn-chip pn-mono">{fieldLabel(node.byteSize, UNKNOWN_COPY)} bytes</span>
              </div>
              {node.sha256Hash.state === 'value' && node.sha256Hash.value !== null ? (
                <p className="pn-evidence-meta pn-mono">{node.sha256Hash.value}</p>
              ) : (
                <p className="pn-evidence-meta pn-unknown pn-mono">Derivative hash Unknown</p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </ClayCard>
  );
}