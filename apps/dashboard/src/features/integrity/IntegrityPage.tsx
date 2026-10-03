import { useState } from 'react';
import { EvidenceInspector } from '../../components/EvidenceInspector';
import { QuarantineQueue } from '../../components/QuarantineQueue';
import { ActivityStream } from '../../components/ActivityStream';
import { ClayCard } from '../../components/ClayCard';
import { DataBoundary } from '../../components/DataBoundary';
import { EmptyState } from '../../components/EmptyState';
import { IntegrityBadge } from '../../components/IntegrityBadge';
import { useIntegrityChecks } from '../../hooks/useIntegrityChecks';
import { UNKNOWN_COPY, UNAVAILABLE_COPY, fieldLabel } from '../../lib/state';
import { boolToIntegrity } from '../../lib/models';

export function IntegrityPage() {
  const [assetId, setAssetId] = useState<string | null>(null);
  const checks = useIntegrityChecks(assetId);

  return (
    <div className="pn-stack-5">
      <header className="pn-page-head">
        <div>
          <h1 className="pn-page-title">Verification</h1>
          <p className="pn-page-lede">
            Integrity comes from the <code>asset_integrity</code> RPC and the audit-chain
            verifiers. A NULL boolean means the backend cannot determine the result, and it reads
            as unknown — never as a pass.
          </p>
        </div>
      </header>

      <div className="pn-split pn-split-wide">
        <div className="pn-stack-4">
          <ClayCard
            title="Asset integrity"
            subtitle={
              assetId === null
                ? 'Paste an asset id, or open one from the activity stream, to check integrity.'
                : assetId
            }
          >
            <div className="pn-field">
              <label className="pn-label" htmlFor="integrity-asset">
                Asset id
                <span className="pn-label-required"> required</span>
              </label>
              <input
                id="integrity-asset"
                className="pn-input pn-mono"
                value={assetId ?? ''}
                placeholder="uuid"
                aria-describedby="integrity-help"
                onChange={(event) => setAssetId(event.target.value.trim() === '' ? null : event.target.value.trim())}
              />
              <p className="pn-help" id="integrity-help">
                Verified under row-level security for your organisation.
              </p>
            </div>
          </ClayCard>

          {assetId === null ? (
            <ClayCard title="Checks">
              <EmptyState
                title="No asset selected"
                body="Enter an asset id above, or open one from the activity stream, to read its integrity result."
              />
            </ClayCard>
          ) : (
            <DataBoundary
              state={checks}
              onReady={(report) => (
                <ClayCard title="Checks" subtitle="Each verdict names the exact RPC field behind it.">
                  <div className="pn-table-scroll">
                    <table className="pn-table">
                      <caption className="pn-visually-hidden">Integrity checks</caption>
                      <thead>
                        <tr>
                          <th scope="col">Check</th>
                          <th scope="col">Verdict</th>
                          <th scope="col">Source</th>
                          <th scope="col">Detail</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.checks.map((check) => (
                          <tr key={check.id}>
                            <th scope="row">{check.label}</th>
                            <td>
                              <IntegrityBadge state={check.state} />
                            </td>
                            <td className="pn-mono">{check.source}</td>
                            <td>{fieldLabel(check.detail, UNKNOWN_COPY)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </ClayCard>
              )}
            />
          )}

          {assetId === null ? null : (
            <ClayCard title="RPC facts" subtitle="Read from asset_integrity, without crypto_inputs.">
              <DataBoundary
                state={checks}
                onReady={(report) => (
                  <dl className="pn-kv">
                    <dt>Asset</dt>
                    <dd className="pn-mono">{report.integrity.asset_id}</dd>
                    <dt>Capture</dt>
                    <dd>{stamp(report.integrity.device_capture_timestamp)}</dd>
                    <dt>Server upload</dt>
                    <dd>{stamp(report.integrity.server_upload_timestamp)}</dd>
                    <dt>Server received</dt>
                    <dd>{stamp(report.integrity.server_received_at)}</dd>
                    <dt>Clock drift</dt>
                    <dd>
                      {report.integrity.clock_drift_seconds === null
                        ? 'Cannot determine'
                        : `${report.integrity.clock_drift_seconds} s`}
                    </dd>
                    <dt>GPS provider</dt>
                    <dd>{report.integrity.gps_provider ?? UNKNOWN_COPY}</dd>
                    <dt>Audit chain</dt>
                    <dd>
                      <IntegrityBadge state={boolToIntegrity(report.integrity.audit_chain_intact)} />
                    </dd>
                    <dt>SHA-256 vs commit</dt>
                    <dd>
                      <IntegrityBadge state={boolToIntegrity(report.integrity.sha256_matches_commit)} />
                    </dd>
                    <dt>crypto_inputs</dt>
                    <dd className="pn-unknown">Stripped at the API route and never sent to the browser.</dd>
                  </dl>
                )}
              />
            </ClayCard>
          )}
        </div>

        <div className="pn-stack-4">
          <ActivityStream assetId={assetId} onSelect={setAssetId} />
          <QuarantineQueue onSelect={setAssetId} />
        </div>
      </div>

      {assetId === null ? null : (
        <>
          <div className="pn-scrim" onClick={() => setAssetId(null)} aria-hidden="true" />
          <EvidenceInspector assetId={assetId} onClose={() => setAssetId(null)} />
        </>
      )}
    </div>
  );
}

function stamp(value: string | null): string {
  if (value === null) return UNAVAILABLE_COPY;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString('en-US');
}