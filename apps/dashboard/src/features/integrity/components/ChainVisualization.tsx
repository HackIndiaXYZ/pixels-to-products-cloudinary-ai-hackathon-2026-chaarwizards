import type { ChainVerification } from '../api';

/**
 * Audit-chain visualization (BUILD_ORDER Phase 10 — "Chain visualization").
 *
 * Renders the chain as a verified/broken lineage: a green tip when every row
 * recomputed and every link held, or a named failure row when a value was
 * tampered (`hash_mismatch` / `details_tampered`) or an intermediate row was
 * deleted (`broken_link`). The failure is shown with the offending audit row id,
 * so a reviewer sees exactly where the chain broke rather than a bare "invalid".
 */
export interface ChainVisualizationProps {
  readonly chain: ChainVerification;
}

export function ChainVisualization({ chain }: ChainVisualizationProps) {
  const verdict = chain.ok ? 'pass' : 'fail';
  return (
    <section aria-label="Audit chain" data-testid="chain-visualization">
      <header>
        <span>Audit chain</span>
        <span className={`verdict verdict-${verdict}`} data-testid="chain-verdict" data-verdict={verdict}>
          {verdict}
        </span>
      </header>
      <dl>
        <div>
          <dt>Rows verified</dt>
          <dd data-testid="chain-checked">{chain.checked}</dd>
        </div>
        <div>
          <dt>Tip hash</dt>
          <dd data-testid="chain-tip">
            <code>{chain.tip_hash ?? '—'}</code>
          </dd>
        </div>
      </dl>
      {chain.failure !== null ? (
        <p role="alert" data-testid="chain-failure" data-failure-kind={chain.failure.kind}>
          Chain broken at audit row {chain.failure.audit_id} ({chain.failure.kind}): {chain.failure.reason}
        </p>
      ) : null}
    </section>
  );
}
