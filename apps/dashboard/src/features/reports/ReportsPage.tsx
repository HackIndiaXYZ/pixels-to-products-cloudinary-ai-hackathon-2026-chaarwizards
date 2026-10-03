import { useState } from 'react';
import { ReportBuilder } from '../../components/ReportBuilder';
import { ReportPreview } from '../../components/ReportPreview';

export function ReportsPage() {
  const [packageId, setPackageId] = useState<string | null>(null);

  return (
    <div className="pn-stack-5">
      <header className="pn-page-head">
        <div>
          <h1 className="pn-page-title">Evidence reports</h1>
          <p className="pn-page-lede">
            The report record is <code>evidence_packages</code>; its SHA-256 manifest lives in{' '}
            <code>report_manifest_entries</code>. Verification is a live re-run, never a stored
            snapshot, and <code>report_templates</code> is empty until an administrator seeds it.
          </p>
        </div>
      </header>

      <ReportBuilder onOpenPackage={setPackageId} />
      <ReportPreview packageId={packageId} />
    </div>
  );
}