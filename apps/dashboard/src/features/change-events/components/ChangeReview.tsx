import { useState } from 'react';
import type { ChangeEvent } from '@impact/shared/rn';
import { MetricsTable } from './MetricsTable';

/**
 * Change review (BUILD_ORDER Phase 8): before/after side-by-side, an optional
 * diff overlay, and the metrics table with confidence and model version.
 *
 * Media is rendered from URLs the API has already signed and resolved by
 * `asset_id` under RLS — this component never builds a Cloudinary URL or holds
 * a `public_id` guess (AGENTS.md §3.11). The `model_version` is passed straight
 * through to `MetricsTable`, which shows it beside every metric (§3.2).
 */
export interface ChangeReviewProps {
  readonly changeEvent: ChangeEvent;
  readonly beforeUrl: string | null;
  readonly afterUrl: string | null;
  readonly diffUrl: string | null;
}

export function ChangeReview({ changeEvent, beforeUrl, afterUrl, diffUrl }: ChangeReviewProps) {
  const [showDiff, setShowDiff] = useState(false);

  return (
    <section aria-label="Change review" data-testid="change-review">
      <div className="change-review-media">
        <figure>
          <figcaption>Before</figcaption>
          {beforeUrl ? <img src={beforeUrl} alt="Before" /> : <div data-testid="before-missing">—</div>}
        </figure>
        <figure>
          <figcaption>After</figcaption>
          {afterUrl ? <img src={afterUrl} alt="After" /> : <div data-testid="after-missing">—</div>}
          {showDiff && diffUrl ? (
            <img
              src={diffUrl}
              alt="Change overlay"
              className="diff-overlay"
              data-testid="diff-overlay"
            />
          ) : null}
        </figure>
      </div>

      {diffUrl ? (
        <button type="button" onClick={() => setShowDiff((v) => !v)}>
          {showDiff ? 'Hide' : 'Show'} change overlay
        </button>
      ) : null}

      <p data-testid="change-type">{changeEvent.change_type ?? 'unclassified'}</p>

      <MetricsTable
        metrics={changeEvent.change_metrics}
        modelVersion={changeEvent.model_version}
        confidence={changeEvent.confidence ?? null}
      />
    </section>
  );
}
