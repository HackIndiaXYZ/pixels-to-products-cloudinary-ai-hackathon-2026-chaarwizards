import { useNavigate } from 'react-router-dom';
import { AsyncView } from '../shared/components/QueryBoundary';
import { useProjectTree } from '../features/projects/hooks/useProjects';
import { ProjectTree } from '../features/projects/components/ProjectTree';
import type { ProjectTreeNode } from '../features/projects/api';

/** Stat card icons */
function IconImage() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>;
}
function IconShieldCheck() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></svg>;
}
function IconGitCompare() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="5" cy="6" r="3"/><path d="M12 6h5a2 2 0 0 1 2 2v7"/><path d="m15 9-3-3 3-3"/><circle cx="19" cy="18" r="3"/><path d="M12 18H7a2 2 0 0 1-2-2V9"/><path d="m9 15 3 3-3 3"/></svg>;
}
function IconAlert() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>;
}
function IconActivity() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/></svg>;
}
function IconArrowRight() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{width:12,height:12}}><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>;
}

interface StatCardProps {
  index: string;
  label: string;
  value: string;
  sub: string;
  subVariant: 'success' | 'warning' | 'danger' | 'muted';
  icon: React.ReactNode;
  iconVariant: 'success' | 'warning' | 'danger' | 'primary';
}

function StatCard({ index, label, value, sub, subVariant, icon, iconVariant }: StatCardProps) {
  return (
    <section className="stat-card">
      <span className="stat-card-index">{index}</span>
      <div className="stat-card-body">
        <div className="stat-card-info">
          <div className="stat-card-label">{label}</div>
          <div className="stat-card-value">{value}</div>
          <div className={`stat-card-sub ${subVariant}`}>{sub}</div>
        </div>
        <div className={`stat-card-icon ${iconVariant}`}>{icon}</div>
      </div>
    </section>
  );
}

const ACTIVITY_ITEMS = [
  { time: '09:42', label: 'Photo verified',      meta: 'Varanasi · IMG_4821' },
  { time: '09:37', label: 'New change detected', meta: 'Plot C12 · +143 saplings' },
  { time: '09:21', label: 'Metadata validated',  meta: '6 assets · Sundarbans' },
  { time: '08:54', label: 'Asset quarantined',   meta: 'GPS accuracy · IMG_4798' },
];

const TABS = ['Recent activity', 'Evidence feed', 'Change events', 'Verification'];

/** Dashboard home: stat cards + map + activity feed + project picker. */
export function HomePage() {
  const navigate = useNavigate();
  const { status, data, error, refetch } = useProjectTree();

  return (
    <>
      {/* Page title */}
      <div className="page-header">
        <h1 className="page-title">Field intelligence overview</h1>
      </div>

      {/* ── Stat cards ─────────────────────────────── */}
      <div className="stat-grid">
        <StatCard
          index="01"
          label="Total evidence assets"
          value="1,240"
          sub="↑ 18 this week"
          subVariant="success"
          icon={<IconImage />}
          iconVariant="success"
        />
        <StatCard
          index="02"
          label="Authenticity verified"
          value="99.4%"
          sub="1,233 / 1,240 assets"
          subVariant="success"
          icon={<IconShieldCheck />}
          iconVariant="success"
        />
        <StatCard
          index="03"
          label="Paired change events"
          value="84"
          sub="12 awaiting review"
          subVariant="warning"
          icon={<IconGitCompare />}
          iconVariant="primary"
        />
        <StatCard
          index="04"
          label="Quarantine review"
          value="2"
          sub="Needs attention"
          subVariant="danger"
          icon={<IconAlert />}
          iconVariant="danger"
        />
      </div>

      {/* ── Map placeholder ─────────────────────────── */}
      <section className="map-section" aria-label="Map overview">
        <div className="map-placeholder">
          <span>MapLibre GL — Viewport data loads here</span>
        </div>
        <div className="map-controls" aria-label="Map style">
          <button type="button" className="map-btn active">Map</button>
          <button type="button" className="map-btn">Satellite</button>
        </div>
      </section>

      {/* ── Activity feed ───────────────────────────── */}
      <section className="card mt-3" aria-label="Activity feed">
        {/* Tabs */}
        <div className="tabs-bar" role="tablist">
          {TABS.map((tab, i) => (
            <button
              key={tab}
              type="button"
              role="tab"
              className={`tab-btn${i === 0 ? ' active' : ''}`}
              aria-selected={i === 0}
            >
              <IconActivity />
              {tab}
            </button>
          ))}
          <button type="button" className="tab-view-all">
            View all <IconArrowRight />
          </button>
        </div>

        {/* Feed rows */}
        <div className="activity-grid" role="tabpanel">
          {ACTIVITY_ITEMS.map((item) => (
            <div key={item.meta} className="activity-item">
              <span className="activity-time">{item.time}</span>
              <div
                className="activity-thumb"
                role="img"
                aria-label={item.label}
                style={{background: 'linear-gradient(135deg, var(--color-muted) 0%, var(--color-primary-soft) 100%)'}}
              />
              <div>
                <div className="activity-label">{item.label}</div>
                <div className="activity-meta">{item.meta}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Project picker ──────────────────────────── */}
      <section className="card mt-4" aria-label="Projects home">
        <div className="card-header">
          <h2 className="card-title">Projects</h2>
        </div>
        <div className="card-body">
          <AsyncView<readonly ProjectTreeNode[]>
            status={status}
            data={data}
            error={error}
            isEmpty={(d) => d.length === 0}
            emptyLabel="No projects yet."
            onRetry={() => void refetch()}
          >
            {(nodes) => (
              <ProjectTree
                nodes={nodes}
                onSelect={(project) => navigate(`/search?project=${project.id}`)}
              />
            )}
          </AsyncView>
        </div>
      </section>
    </>
  );
}
