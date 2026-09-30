import type { AssetIntegrity } from '../../assets/api';
import type { ChainVerification } from '../api';
import { buildVerificationRecord } from '../verificationRecord';
import { IntegrityPanel } from './IntegrityPanel';
import { ChainVisualization } from './ChainVisualization';
import { TimestampComparison } from './TimestampComparison';
import { VerificationExportButton } from './VerificationExportButton';

/**
 * Integrity viewer (BUILD_ORDER Phase 10 — "Integrity viewer UI"). Composes the
 * per-check integrity panel, the audit-chain visualization, the timestamp
 * comparison, and the exportable verification record so a reviewer can
 * independently verify an asset in one place. Every tri-state verdict renders
 * `unknown` honestly and never as `pass` (AGENTS.md §3.7).
 */
export interface IntegrityViewerProps {
  readonly integrity: AssetIntegrity;
  readonly chain: ChainVerification;
  readonly download?: ((filename: string, contents: string) => void) | undefined;
}

export function IntegrityViewer({ integrity, chain, download }: IntegrityViewerProps) {
  const record = buildVerificationRecord(chain, integrity);
  return (
    <div data-testid="integrity-viewer">
      <IntegrityPanel integrity={integrity} />
      <ChainVisualization chain={chain} />
      <TimestampComparison integrity={integrity} />
      <VerificationExportButton record={record} download={download} />
    </div>
  );
}
