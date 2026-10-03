import { useState } from 'react';
import { BeforeAfterSlider } from '../../components/BeforeAfterSlider';
import { ClayCard } from '../../components/ClayCard';
import { DataBoundary } from '../../components/DataBoundary';
import { EmptyState } from '../../components/EmptyState';
import { MetricTable } from '../../components/MetricTable';
import { StatusBadge } from '../../components/StatusBadge';
import { Skeleton } from '../../components/Skeleton';
import { useChangeDetail, useChangeEvents } from '../../hooks/useChangeEvents';
import { useProjects } from '../../hooks/useProjects';
import { isPairedChangeEvent, type ChangeEvent, type ModelRegistryEntry, type Project } from '../../types/database';
import { EMPTY_COPY, UNKNOWN_COPY, UNSUPPORTED_SECTOR_COPY, UNAVAILABLE_COPY, fieldLabel } from '../../lib/state';

export function ChangesPage() {
  const { projectId, setProjectId, projects } = useProjects();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const feed = useChangeEvents(projectId);

  return (
    <div className="pn-stack-5">
      <header className="pn-page-head">
        <div>
          <h1 className="pn-page-title">Change events</h1>
          <p className="pn-page-lede">
            A change event is paired only when both <code>before_asset_id</code> and{' '}
            <code>after_asset_id</code> are present. Unpaired events are listed and explained, not
            silently rendered as a comparison.
          </p>
        </div>
        <div className="pn-field" style={{ minWidth: 220 }}>
          <label className="pn-label" htmlFor="changes-project">
            Project
          </label>
          <select
            id="changes-project"
            className="pn-select"
            value={projectId ?? ''}
            onChange={(event) => setProjectId(event.target.value === '' ? null : event.target.value)}
          >
            <option value="">All projects</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </div>
      </header>

      <div className="pn-split pn-split-wide">
        <DataBoundary
          state={feed}
          emptyTitle={EMPTY_COPY.changes}
          onReady={(data) => (
            <ClayCard title="Detected changes" subtitle={`${data.events.length} events returned.`}>
              <ul className="pn-queue" role="list">
                {data.events.map((event) => {
                  const paired = isPairedChangeEvent(event);
                  return (
                    <li key={event.id} className="pn-queue-item" style={{ borderColor: 'var(--pn-line)' }}>
                      <div className="pn-row pn-row-wrap">
                        <span className="pn-evidence-name">{event.change_type ?? 'Change type Unknown'}</span>
                        {paired ? (
                          <StatusBadge label="Paired" tone="pass" />
                        ) : (
                          <StatusBadge label="Unpaired" tone="unknown" />
                        )}
                        <span className="pn-evidence-meta">
                          {new Date(event.created_at).toLocaleString('en-US')}
                        </span>
                      </div>
                      <div className="pn-cluster">
                        <span className="pn-chip">model {event.model_version}</span>
                        <span className="pn-chip">{event.detection_method ?? 'method Unknown'}</span>
                        <span className="pn-chip pn-mono">
                          confidence{' '}
                          {event.confidence === null ? UNKNOWN_COPY : event.confidence.toFixed(3)}
                        </span>
                      </div>
                      <div className="pn-row">
                        <button
                          type="button"
                          className={selectedId === event.id ? 'pn-btn pn-btn-primary' : 'pn-btn'}
                          aria-pressed={selectedId === event.id}
                          onClick={() => setSelectedId(selectedId === event.id ? null : event.id)}
                        >
                          View evidence
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </ClayCard>
          )}
        />

        <ChangeDetailPanel
          selectedId={selectedId}
          events={feed.status === 'ready' ? feed.data.events : []}
          registry={feed.status === 'ready' ? feed.data.registry : []}
          projects={feed.status === 'ready' ? feed.data.projects : []}
          loading={feed.status === 'loading'}
        />
      </div>
    </div>
  );
}

function ChangeDetailPanel({
  selectedId,
  events,
  registry,
  projects,
  loading,
}: {
  selectedId: string | null;
  events: ChangeEvent[];
  registry: ModelRegistryEntry[];
  projects: Project[];
  loading: boolean;
}) {
  const event = selectedId === null ? null : (events.find((entry) => entry.id === selectedId) ?? null);
  const detail = useChangeDetail(event, registry, projects);

  if (selectedId === null) {
    return (
      <ClayCard title="Change detail">
        <EmptyState
          title="No change event open"
          body="Select an event to compare its before and after evidence, read its metrics, and check model provenance."
        />
      </ClayCard>
    );
  }

  return (
    <DataBoundary
      state={detail}
      skeleton={loading === true ? <Skeleton lines={6} /> : undefined}
      onReady={(model) => (
        <div className="pn-stack-4">
          <ClayCard
            title={model.event.change_type ?? 'Change type Unknown'}
            subtitle={`${model.paired === true ? 'Paired' : 'Unpaired'} · ${new Date(model.event.created_at).toLocaleString('en-US')}`}
          >
            <BeforeAfterSlider
              beforeAssetId={model.event.before_asset_id}
              afterAssetId={model.event.after_asset_id}
            />
            <dl className="pn-kv" style={{ marginTop: 'var(--pn-space-4)' }}>
              <dt>Confidence</dt>
              <dd>
                {model.event.confidence === null ? UNKNOWN_COPY : model.event.confidence.toFixed(4)}
              </dd>
              <dt>Change type</dt>
              <dd>{model.event.change_type ?? UNKNOWN_COPY}</dd>
              <dt>Detection method</dt>
              <dd>{model.event.detection_method ?? UNKNOWN_COPY}</dd>
              <dt>GPS distance</dt>
              <dd>
                {model.event.gps_distance_meters === null
                  ? UNKNOWN_COPY
                  : `${model.event.gps_distance_meters} m`}
              </dd>
              <dt>Time difference</dt>
              <dd>
                {model.event.time_difference_hours === null
                  ? UNKNOWN_COPY
                  : `${model.event.time_difference_hours} h`}
              </dd>
              <dt>Before asset</dt>
              <dd className="pn-mono">{model.event.before_asset_id ?? 'None'}</dd>
              <dt>After asset</dt>
              <dd className="pn-mono">{model.event.after_asset_id ?? 'None'}</dd>
              <dt>Change mask</dt>
              <dd className="pn-mono">{fieldLabel(model.diffPublicId, UNAVAILABLE_COPY)}</dd>
            </dl>
          </ClayCard>

          <MetricTable rows={model.metricRows} />

          <ClayCard title="Model provenance" subtitle="model_registry is reference data.">
            <div className="pn-stack-3">
              {model.provenance.supported === false ? (
                <p className="pn-note pn-note-warn">
                  <span>
                    <b>{UNSUPPORTED_SECTOR_COPY}.</b> Only the forestry sector is registered as
                    trained, so no model metrics or accuracy figures exist for this sector. That is
                    not a zero.
                  </span>
                </p>
              ) : null}
              <dl className="pn-kv">
                <dt>Model version</dt>
                <dd className="pn-mono">{fieldLabel(model.provenance.modelVersion, UNKNOWN_COPY)}</dd>
                <dt>Registry version</dt>
                <dd className="pn-mono">{fieldLabel(model.provenance.registryVersion, UNKNOWN_COPY)}</dd>
                <dt>Registry status</dt>
                <dd>{fieldLabel(model.provenance.status, UNKNOWN_COPY)}</dd>
                <dt>Weights</dt>
                <dd className={model.provenance.weightsUri.state === 'value' ? '' : 'pn-unknown'}>
                  {fieldLabel(model.provenance.weightsUri, 'Unavailable — weights_uri is NULL')}
                </dd>
                <dt>Sector</dt>
                <dd>{fieldLabel(model.provenance.sector, UNKNOWN_COPY)}</dd>
              </dl>
              {model.provenance.metrics.state === 'value' &&
              Object.keys(model.provenance.metrics.value).length === 0 ? (
                <p className="pn-unknown">Registry metrics for this sector are empty.</p>
              ) : null}
            </div>
          </ClayCard>
        </div>
      )}
    />
  );
}