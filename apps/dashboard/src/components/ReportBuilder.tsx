import { useMemo, useState } from 'react';
import { useReports, type ReportWorkspace } from '../hooks/useReports';
import { EMPTY_COPY } from '../lib/state';
import { ClayCard } from './ClayCard';
import { DataBoundary } from './DataBoundary';
import { Icon } from './Icon';

export interface ReportBuilderProps {
  onOpenPackage: (packageId: string) => void;
}

/** Step 7 of the reports surface: choose verified assets, then build the evidence manifest plan.
 *  Only `verification = 'passed'` assets that are not quarantined are selectable — that exclusion
 *  happens server-side in `listVerifiedAssets`. Every hash in the plan is copied from the real
 *  `assets.sha256_hash` column; nothing is computed or invented here. */
export function ReportBuilder({ onOpenPackage }: ReportBuilderProps) {
  const [projectId, setProjectId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [packageName, setPackageName] = useState('');
  const [copied, setCopied] = useState(false);
  const workspace = useReports(projectId);

  const plan = useMemo(() => buildManifestPlan(workspace, selected), [workspace, selected]);

  const toggle = (assetId: string): void => {
    setSelected((current) =>
      current.includes(assetId) ? current.filter((entry) => entry !== assetId) : [...current, assetId],
    );
  };

  const copyPlan = (): void => {
    void navigator.clipboard
      ?.writeText(JSON.stringify(plan, null, 2))
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      })
      .catch(() => setCopied(false));
  };

  return (
    <DataBoundary
      state={workspace}
      onReady={(data: ReportWorkspace) => (
        <div className="pn-stack-4">
          <ClayCard title="Evidence package" subtitle="A package is the report record — there is no reports table.">
            <div className="pn-stack-4">
              <div className="pn-filters">
                <div className="pn-field">
                  <label className="pn-label" htmlFor="report-project">
                    Project
                  </label>
                  <select
                    id="report-project"
                    className="pn-select"
                    value={projectId ?? ''}
                    onChange={(event) => {
                      setProjectId(event.target.value === '' ? null : event.target.value);
                      setSelected([]);
                    }}
                  >
                    <option value="">All projects</option>
                    {data.projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="pn-field">
                  <label className="pn-label" htmlFor="report-name">
                    Package name
                    <span className="pn-label-required"> required</span>
                  </label>
                  <input
                    id="report-name"
                    className="pn-input"
                    value={packageName}
                    maxLength={160}
                    required
                    aria-describedby="report-name-help"
                    onChange={(event) => setPackageName(event.target.value)}
                  />
                  <p className="pn-help" id="report-name-help">
                    Stored as <code>evidence_packages.name</code>.
                  </p>
                </div>
                <div className="pn-field">
                  <span className="pn-label">Template</span>
                  <DataBoundary
                    state={data.templates}
                    emptyTitle={EMPTY_COPY.templates}
                    onReady={(templates) => (
                      <select className="pn-select" defaultValue={templates[0]?.id ?? ''}>
                        {templates.map((template) => (
                          <option key={template.id} value={template.id}>
                            {template.id}
                          </option>
                        ))}
                      </select>
                    )}
                  />
                  <p className="pn-help">
                    <code>report_templates</code> ships with no seed rows, so an empty picker is the
                    correct state here.
                  </p>
                </div>
              </div>

              <div className="pn-stack-3">
                <span className="pn-metric-label">Verified assets · quarantined assets excluded</span>
                <DataBoundary
                  state={data.selectableAssets}
                  emptyTitle="No verified assets available for this project."
                  onReady={(assets) => (
                    <ul className="pn-queue" role="list">
                      {assets.map((asset) => (
                        <li key={asset.id} className="pn-row pn-row-wrap">
                          <label className="pn-row">
                            <input
                              type="checkbox"
                              checked={selected.includes(asset.id)}
                              onChange={() => toggle(asset.id)}
                            />
                            <span className="pn-mono">{asset.id}</span>
                          </label>
                          <span className="pn-chip">{asset.observation_type ?? 'Observation type Unknown'}</span>
                          <span className="pn-evidence-meta pn-mono">{asset.sha256_hash}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                />
              </div>

              <div className="pn-stack-3">
                <span className="pn-metric-label">Manifest plan · {plan.length} entries</span>
                {plan.length === 0 ? (
                  <p className="pn-unknown">Select at least one verified asset to build a manifest.</p>
                ) : (
                  <div className="pn-table-scroll">
                    <table className="pn-table">
                      <caption className="pn-visually-hidden">Planned manifest entries</caption>
                      <thead>
                        <tr>
                          <th scope="col">Ordinal</th>
                          <th scope="col">Role</th>
                          <th scope="col">SHA-256 (from assets.sha256_hash)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {plan.map((entry) => (
                          <tr key={entry.ordinal}>
                            <td className="pn-mono">{entry.ordinal}</td>
                            <td>{entry.role}</td>
                            <td className="pn-mono">{entry.sha256_hash}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="pn-row pn-row-wrap">
                  <button type="button" className="pn-btn" disabled={plan.length === 0} onClick={copyPlan}>
                    <Icon name={copied === true ? 'check' : 'report'} size={15} />
                    {copied === true ? 'Copied' : 'Copy manifest plan'}
                  </button>
                  <span className="pn-card-sub">
                    Packaging itself runs server-side; this plan is the payload it consumes.
                  </span>
                </div>
              </div>
            </div>
          </ClayCard>

          <ClayCard title="Existing packages" subtitle="evidence_packages rows for this org.">
            <DataBoundary
              state={data.packages}
              emptyTitle={EMPTY_COPY.packages}
              onReady={(packages) => (
                <div className="pn-table-scroll">
                  <table className="pn-table">
                    <caption className="pn-visually-hidden">Evidence packages</caption>
                    <thead>
                      <tr>
                        <th scope="col">Name</th>
                        <th scope="col">Status</th>
                        <th scope="col">Assets</th>
                        <th scope="col">Generated</th>
                        <th scope="col">Manifest</th>
                      </tr>
                    </thead>
                    <tbody>
                      {packages.map((entry) => (
                        <tr key={entry.id}>
                          <th scope="row">{entry.name}</th>
                          <td>{entry.status}</td>
                          <td className="pn-table-num">{entry.asset_ids.length}</td>
                          <td>
                            {entry.generated_at === null
                              ? 'Unknown'
                              : new Date(entry.generated_at).toLocaleString('en-US')}
                          </td>
                          <td>
                            <button
                              type="button"
                              className="pn-btn pn-btn-sm"
                              onClick={() => onOpenPackage(entry.id)}
                            >
                              Open
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            />
          </ClayCard>
        </div>
      )}
    />
  );
}

interface ManifestPlanEntry {
  ordinal: number;
  role: 'photo';
  asset_id: string;
  sha256_hash: string;
}

/** The plan is built only from columns that exist: `ordinal`, `role`, the selected asset id, and
 *  `assets.sha256_hash`. `byte_size` is not an `assets` column, so it is left to the server rather
 *  than estimated. */
function buildManifestPlan(workspace: ReportWorkspace, selected: string[]): ManifestPlanEntry[] {
  if (workspace.status !== 'ready') return [];
  const rows = workspace.data.selectableAssets;
  if (rows.status !== 'ready') return [];
  return selected
    .map((assetId) => rows.data.find((asset) => asset.id === assetId))
    .filter((asset): asset is NonNullable<typeof asset> => asset !== undefined)
    .map((asset, index) => ({
      ordinal: index + 1,
      role: 'photo' as const,
      asset_id: asset.id,
      sha256_hash: asset.sha256_hash,
    }));
}