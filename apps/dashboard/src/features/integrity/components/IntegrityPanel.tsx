import type { VerificationState } from '@impact/shared/rn';
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
    { label: 'EXIF hash', verdict: toVerdict(integrity.exif_hash_verified) },
    { label: 'Caption signature', verdict: toVerdict(integrity.caption_signature_verified) },
    { label: 'Audit chain', verdict: toVerdict(integrity.audit_chain_intact) },
    { label: 'SHA-256 matches commit', verdict: toVerdict(integrity.sha256_matches_commit) },
  ];

  const anyFail = checks.some((c) => c.verdict === 'fail');
  const anyUnknown = checks.some((c) => c.verdict === 'unknown');
  const overall: VerificationState = anyFail ? 'fail' : anyUnknown ? 'unknown' : 'pass';

  return (
    <section aria-label="Integrity" data-testid="integrity-panel">
      <header>
        <span>Integrity</span>
        <VerdictBadge verdict={overall} />
      </header>
      <dl>
        {checks.map((check) => (
          <div key={check.label} data-testid="integrity-check">
            <dt>{check.label}</dt>
            <dd>
              <VerdictBadge verdict={check.verdict} />
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
