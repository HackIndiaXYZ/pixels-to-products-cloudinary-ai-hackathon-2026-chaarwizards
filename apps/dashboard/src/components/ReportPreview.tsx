import { useReportManifest, type ManifestBundle } from '../hooks/useReports';
import { boolToIntegrity } from '../lib/models';
import { UNKNOWN_COPY, fieldLabel } from '../lib/state';
import { ClayCard } from './ClayCard';
import { DataBoundary } from './DataBoundary';
import { IntegrityBadge } from './IntegrityBadge';
import { StatusBadge } from './StatusBadge';

export interface ReportPreviewProps {
  packageId: string | null;
}

/** The SHA-256 evidence manifest, byte-exact, plus the live re-verification receipt. The receipt
 *  references assets by ordinal only — the RPC never returns an asset id, caption, or GPS, and the
 *  UI does not try to reverse-map an ordinal onto an asset it was not given. */
export function ReportPreview({ packageId }: ReportPreviewProps) {
  const state = useReportManifest(packageId);

  if (packageId === null) {
    return (
      <ClayCard title="Manifest">
        <p className="pn-unknown">Open a package to read its manifest.</p>
      </ClayCard>
    );
  }

  return (
    <DataBoundary
      state={state}
      onReady={(data: ManifestBundle) => (
        <div className="pn-stack-4">
          <ClayCard
            title={data.packageRow.name}
            subtitle={
              <span>
                {data.packageRow.status} · template{' '}
                {data.packageRow.template_version ?? UNKNOWN_COPY} ·{' '}
                {data.rows.length} manifest entries
              </span>
            }
            action={
              data.packageRow.status === 'exported' ? (
                <StatusBadge label="Exported" tone="pass" />
              ) : data.packageRow.status === 'finalized' ? (
                <StatusBadge label="Finalized" tone="info" />
              ) : (
                <StatusBadge label="Draft" tone="pending" />
              )
            }
          >
            <dl className="pn-kv">
              <dt>Package ID</dt>
              <dd className="pn-mono">{data.packageRow.id}</dd>
              <dt>Assets</dt>
              <dd>{data.packageRow.asset_ids.length}</dd>
              <dt>Change events</dt>
              <dd>{data.packageRow.change_event_ids.length}</dd>
              <dt>Generated</dt>
              <dd>
                {data.packageRow.generated_at === null
                  ? UNKNOWN_COPY
                  : new Date(data.packageRow.generated_at).toLocaleString('en-US')}
              </dd>
              <dt>Report HTML</dt>
              <dd>{data.packageRow.report_html_url ?? 'Unavailable'}</dd>
            </dl>
          </ClayCard>

          <ClayCard
            title="SHA-256 manifest"
            subtitle="Every digest is shown in full. A shortened digest cannot be checked against the file."
          >
            {data.rows.length === 0 ? (
              <p className="pn-unknown">No manifest entries recorded for this package.</p>
            ) : (
              <div className="pn-table-scroll">
                <table className="pn-table">
                  <caption className="pn-visually-hidden">Report manifest entries</caption>
                  <thead>
                    <tr>
                      <th scope="col">#</th>
                      <th scope="col">Role</th>
                      <th scope="col">SHA-256</th>
                      <th scope="col">Size</th>
                      <th scope="col">Verified</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((row) => (
                      <tr key={`${row.ordinal.state === 'value' ? row.ordinal.value : 'row'}-${fieldLabel(row.publicId, 'id')}`}>
                        <td className="pn-mono">
                          {row.ordinal.state === 'value' ? row.ordinal.value : UNKNOWN_COPY}
                        </td>
                        <td>{fieldLabel(row.role, UNKNOWN_COPY)}</td>
                        <td className="pn-mono">{fieldLabel(row.sha256Hash, UNKNOWN_COPY)}</td>
                        <td className="pn-mono">{fieldLabel(row.byteSize, UNKNOWN_COPY)}</td>
                        <td className="pn-mono">
                          {row.verifiedAt.state === 'value' && row.verifiedAt.value !== null
                            ? new Date(row.verifiedAt.value).toLocaleString('en-US')
                            : 'Not verified'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </ClayCard>

          <ClayCard
            title="Verification receipt"
            subtitle="A real re-verification against Postgres, not a stored snapshot."
          >
            <DataBoundary
              state={data.receipt}
              onReady={(receipt) => (
                <div className="pn-stack-4">
                  <div className="pn-cluster">
                    {receipt.all_ok === null ? (
                      <StatusBadge label="Overall unknown" tone="unknown" />
                    ) : receipt.all_ok === true ? (
                      <StatusBadge label="All chains verified" tone="pass" />
                    ) : (
                      <StatusBadge label="Verification failed" tone="fail" />
                    )}
                    <span className="pn-card-sub">referenced by ordinal index only</span>
                  </div>
                  <div className="pn-table-scroll">
                    <table className="pn-table">
                      <caption className="pn-visually-hidden">Verification receipt entries</caption>
                      <thead>
                        <tr>
                          <th scope="col">Index</th>
                          <th scope="col">Chain</th>
                          <th scope="col">Length</th>
                          <th scope="col">Tip hash</th>
                        </tr>
                      </thead>
                      <tbody>
                        {receipt.entries.map((entry) => (
                          <tr key={entry.index}>
                            <td className="pn-mono">{entry.index}</td>
                            <td>
                              <IntegrityBadge state={boolToIntegrity(entry.chain_verified)} />
                            </td>
                            <td className="pn-mono">
                              {entry.chain_length === null ? UNKNOWN_COPY : entry.chain_length}
                            </td>
                            <td className="pn-mono">{entry.tip_hash ?? UNKNOWN_COPY}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            />
          </ClayCard>
        </div>
      )}
    />
  );
}