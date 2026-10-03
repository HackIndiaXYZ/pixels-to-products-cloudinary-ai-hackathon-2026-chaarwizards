import { useMemo, useState } from 'react';
import { useCurrentWorkspace } from '../../hooks/useCurrentWorkspace';
import { useOverviewMetrics } from '../../hooks/useOverviewMetrics';
import { useProjectsState } from '../../hooks/useProjects';
import { UNKNOWN_COPY } from '../../lib/state';
import { ClayCard } from '../../components/ClayCard';
import { DataBoundary } from '../../components/DataBoundary';
import { EvidenceInspector } from '../../components/EvidenceInspector';
import { MapView } from '../../components/MapView';
import { MetricCard } from '../../components/MetricCard';
import { ActivityStream } from '../../components/ActivityStream';
import { StatusBadge } from '../../components/StatusBadge';
import type { SyncHealth } from '../../lib/queries/projects';

export interface OverviewPageProps {
  onOpenEvidence: () => void;
  onOpenProject: (projectId: string) => void;
}

const PAGE_SIZE = 100;

export function OverviewPage({ onOpenEvidence, onOpenProject }: OverviewPageProps) {
  const metrics = useOverviewMetrics();
  const { org, sync } = useCurrentWorkspace();
  /* The same `['projects']` read the shell's project switcher uses, so the switcher options and the
     map's waypoints come from one request. */
  const projectState = useProjectsState();
  const [selected, setSelected] = useState<string | null>(null);

  const project = useMemo(
    () =>
      org.status === 'ready'
        ? { name: org.data.name, type: org.data.type }
        : { name: null, type: null },
    [org],
  );

  return (
    <div className="pn-stack-5">
      <header className="pn-page-head">
        <div>
          <h1 className="pn-page-title">{project.name ?? UNKNOWN_COPY}</h1>
          <p className="pn-page-lede">
            Media intelligence and cryptographic field verification. Every figure on this page is a
            real count from Postgres under row-level security.
          </p>
        </div>
        <div className="pn-cluster">
          {project.type === null ? null : <span className="pn-chip">org {project.type}</span>}
          <StatusBadge label="TRUTH · EVIDENCE · IMPACT" tone="info" glyph="layers" />
        </div>
      </header>

      <section className="pn-grid-metrics" aria-label="Key indicators">
        <DataBoundary state={metrics.totalAssets} onReady={(value) => (
          <MetricCard label="Total evidence assets" metric={value} source="assets · Content-Range" />
        )} />
        <DataBoundary state={metrics.verifiedRate} onReady={(value) => (
          <MetricCard label="Authenticity verified rate" metric={value} source="assets.verification" />
        )} />
        <DataBoundary state={metrics.pairedChangeEvents} onReady={(value) => (
          <MetricCard label="Paired change events" metric={value} source="change_events · both asset ids" />
        )} />
        <DataBoundary state={metrics.quarantineItems} onReady={(value) => (
          <MetricCard label="Quarantine review items" metric={value} source="assets.quarantined_at" />
        )} />
      </section>

      <ClayCard
        title="Projects and evidence map"
        subtitle="Project tags are centroids of projects.geometry. Dots are real gps_point values from the first page of search_assets."
        action={
          <button type="button" className="pn-btn pn-btn-sm" onClick={onOpenEvidence}>
            Open evidence explorer
          </button>
        }
      >
        <MapView
          evidence={metrics.evidence}
          projects={projectState}
          selectedAssetId={selected}
          onSelect={setSelected}
          onOpenProject={onOpenProject}
        />
        <p className="pn-card-sub" style={{ marginTop: 'var(--pn-space-3)' }}>
          Showing at most {PAGE_SIZE} of {metrics.evidence.status === 'ready' ? metrics.evidence.data.totalMatched : UNKNOWN_COPY}{' '}
          matched assets. Narrow the filters in the evidence explorer to reach the rest.
        </p>
      </ClayCard>

      <div className="pn-split pn-split-wide">
        <ActivityStream assetId={selected} onSelect={setSelected} />
        <SystemStatus state={sync} />
      </div>

      {selected === null ? null : (
        <>
          <div className="pn-scrim" onClick={() => setSelected(null)} aria-hidden="true" />
          <EvidenceInspector assetId={selected} onClose={() => setSelected(null)} />
        </>
      )}
    </div>
  );
}

function SystemStatus({ state }: { state: ReturnType<typeof useCurrentWorkspace>['sync'] }) {
  return (
    <ClayCard title="System status" subtitle="sync_state.last_status, per scope.">
      <DataBoundary
        state={state}
        onReady={(rows: SyncHealth[]) =>
          rows.length === 0 ? (
            <p className="pn-unknown">No sync_state rows recorded.</p>
          ) : (
            <ul className="pn-queue" role="list">
              {rows.map((row) => (
                <li key={row.scope} className="pn-row pn-row-wrap">
                  <span className="pn-evidence-name">{row.scope}</span>
                  {row.lastStatus === 'ok' ? (
                    <StatusBadge label="ok" tone="pass" />
                  ) : row.lastStatus === 'partial' ? (
                    <StatusBadge label="partial" tone="pending" />
                  ) : row.lastStatus === 'failed' ? (
                    <StatusBadge label="failed" tone="fail" />
                  ) : (
                    <StatusBadge label="status Unknown" tone="unknown" />
                  )}
                  <span className="pn-evidence-meta">
                    {row.lastRunAt === null ? 'never run' : new Date(row.lastRunAt).toLocaleString('en-US')}
                  </span>
                </li>
              ))}
            </ul>
          )
        }
      />
    </ClayCard>
  );
}