import type { AssetDerivative } from '@impact/shared/rn';

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
    <section aria-label="Derivative lineage" data-testid="lineage-tree">
      <ul>
        <li>
          <span data-testid="lineage-original">{originalPublicId}</span>
          <span className="badge badge-original">original</span>
          {derivatives.length > 0 ? (
            <ul>
              {derivatives.map((d) => (
                <li key={d.id} data-testid="lineage-derivative">
                  <code data-testid="lineage-transformation">{d.transformation}</code>
                  {d.is_generative ? (
                    <span className="badge badge-generative" data-testid="lineage-generative">
                      generative
                    </span>
                  ) : null}
                  <span className="lineage-public-id">{d.public_id}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p data-testid="lineage-empty">No derivatives — original only.</p>
          )}
        </li>
      </ul>
    </section>
  );
}
