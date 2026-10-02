import type { AssetDerivative } from '@panchnama/shared/rn';

/**
 * Derivative lineage tree (BUILD_ORDER Phase 8 gate — Asset detail).
 *
 * Shows the original asset at the root and every `asset_derivatives` row beneath
 * it, each labelled with its exact `transformation` string and flagged when
 * `is_generative` (AGENTS.md §3.1). This is how a reviewer sees which bytes are
 * the pristine original and which are derived — the original is never mutated,
 * every transform is a new child row.
 */
export interface DerivativeLineageProps {
  readonly originalPublicId: string;
  readonly derivatives: readonly AssetDerivative[];
}

export function DerivativeLineage({ originalPublicId, derivatives }: DerivativeLineageProps) {
  return (
    <section className="integrity-section" aria-label="Derivative lineage" data-testid="lineage-tree">
      <div className="integrity-header">
        <span>Derivative lineage</span>
        <span className="badge">{derivatives.length} derivative{derivatives.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="lineage-tree">
        <div className="lineage-node original" data-testid="lineage-original">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>
          {originalPublicId}
          <span className="badge" style={{ marginLeft: 'auto' }}>original</span>
        </div>
        {derivatives.length > 0 ? (
          <div style={{ paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
            {derivatives.map((d) => (
              <div key={d.id} className="lineage-node" data-testid="lineage-derivative" style={{ gap: '8px' }}>
                <code className="mono" data-testid="lineage-transformation" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {d.transformation}
                </code>
                {d.is_generative ? (
                  <span className="badge warning" data-testid="lineage-generative">generative</span>
                ) : null}
                <span style={{ fontSize: '0.625rem', color: 'var(--color-fg-subtle)', marginLeft: 'auto', flexShrink: 0 }}>{d.public_id}</span>
              </div>
            ))}
          </div>
        ) : (
          <p data-testid="lineage-empty" style={{ padding: '12px 16px', fontSize: '0.8125rem', color: 'var(--color-fg-muted)' }}>
            No derivatives — original only.
          </p>
        )}
      </div>
    </section>
  );
}
