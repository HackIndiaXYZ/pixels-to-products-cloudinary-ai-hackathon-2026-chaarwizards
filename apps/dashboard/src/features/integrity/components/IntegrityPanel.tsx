import type { VerificationState } from '@panchnama/shared/rn';
import type { AssetIntegrity } from '../../assets/api';
import { toVerdict } from '../verdict';

/**
 * Per-asset integrity panel (BUILD_ORDER Phase 8 — Asset detail "integrity
 * panel"). Renders every check as pass / fail / unknown. `unknown` is shown
 * explicitly and never collapsed into `pass` (AGENTS.md §3.7); the overall
 * badge reads `pass` only when no check failed and none is unknown.
 */
export interface IntegrityPanelProps {
  readonly integrity: AssetIntegrity;
}

interface Check {
  readonly label: string;
  readonly verdict: VerificationState;
}

function VerdictBadge({ verdict }: { readonly verdict: VerificationState }) {
  return (
    <span className={`verdict verdict-${verdict}`} data-testid="verdict" data-verdict={verdict}>
      {verdict}
    </span>
  );
}

export function IntegrityPanel({ integrity }: IntegrityPanelProps) {
  const checks: readonly Check[] = [
    { label: 'Device signature', verdict: toVerdict(integrity.device_signature_verified) },
    { label: 'EXIF hash',        verdict: toVerdict(integrity.exif_hash_verified) },
    { label: 'Caption signature',verdict: toVerdict(integrity.caption_signature_verified) },
    { label: 'Audit chain',      verdict: toVerdict(integrity.audit_chain_intact) },
    { label: 'SHA-256 matches',  verdict: toVerdict(integrity.sha256_matches_commit) },
  ];

  const anyFail    = checks.some((c) => c.verdict === 'fail');
  const anyUnknown = checks.some((c) => c.verdict === 'unknown');
  const overall: VerificationState = anyFail ? 'fail' : anyUnknown ? 'unknown' : 'pass';

  return (
    <section className="integrity-section" aria-label="Integrity" data-testid="integrity-panel">
      <div className="integrity-header">
        <span>Integrity verification</span>
        <VerdictBadge verdict={overall} />
      </div>
      <div className="integrity-checks" role="list">
        {checks.map((check) => (
          <div key={check.label} className="integrity-check-row" role="listitem" data-testid="integrity-check">
            <span className="integrity-check-label">{check.label}</span>
            <VerdictBadge verdict={check.verdict} />
          </div>
        ))}
      </div>
    </section>
  );
}
