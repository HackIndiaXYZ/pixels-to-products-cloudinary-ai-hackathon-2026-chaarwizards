import { serializeVerificationRecord } from '../verificationRecord';
import type { VerificationRecord } from '../verificationRecord';

/**
 * Export the verification record as a downloadable file (BUILD_ORDER Phase 10 —
 * "exportable verification record"). The file is the deterministic serialization
 * of the record, so re-fetching and re-exporting produces byte-identical bytes:
 * the export re-verifies against Postgres on a second run.
 *
 * `download` is injected so the action is unit-testable without a real DOM
 * anchor click; the default performs the browser download.
 */
export interface VerificationExportButtonProps {
  readonly record: VerificationRecord;
  readonly download?: ((filename: string, contents: string) => void) | undefined;
}

function browserDownload(filename: string, contents: string): void {
  const blob = new Blob([contents], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function VerificationExportButton({ record, download = browserDownload }: VerificationExportButtonProps) {
  const onClick = (): void => {
    download(`verification-${record.asset_id}.json`, serializeVerificationRecord(record));
  };
  return (
    <button type="button" onClick={onClick} data-testid="export-verification">
      Export verification record
    </button>
  );
}
