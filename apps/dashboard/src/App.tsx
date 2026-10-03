import { useState } from 'react';
import { NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { useAuthSession } from './hooks/useAuthSession';
import { useCurrentUser } from './hooks/useCurrentUser';
import { useCurrentWorkspace } from './hooks/useCurrentWorkspace';
import { useProjects } from './hooks/useProjects';
import { ClayCard } from './components/ClayCard';
import { DataBoundary } from './components/DataBoundary';
import { Icon, type IconName } from './components/Icon';
import { StatusBadge } from './components/StatusBadge';
import { LoginPage } from './features/auth/LoginPage';
import { ChangesPage } from './features/changes/ChangesPage';
import { EvidenceExplorerPage } from './features/evidence/EvidenceExplorerPage';
import { IntegrityPage } from './features/integrity/IntegrityPage';
import { OverviewPage } from './features/overview/OverviewPage';
import { ReportsPage } from './features/reports/ReportsPage';
import { signOut } from './lib/supabase/client';
import { UNKNOWN_COPY } from './lib/state';
import type { SyncHealth } from './lib/queries/projects';

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  end: boolean;
}

const NAV: NavItem[] = [
  { to: '/', label: 'Overview', icon: 'overview', end: true },
  { to: '/projects/:projectId/assets', label: 'Evidence', icon: 'evidence', end: false },
  { to: '/integrity', label: 'Integrity', icon: 'integrity', end: true },
  { to: '/projects/:projectId/change-events', label: 'Change events', icon: 'change', end: false },
  { to: '/reports', label: 'Reports', icon: 'report', end: true },
];

/** The session gate. It resolves identity before any workspace query is allowed to mount, so an
 *  unauthenticated visitor can never trigger an RLS-denied request or see shell chrome. `App`
 *  holds no workspace hooks itself — it hands off to `WorkspaceShell`, which mounts and unmounts
 *  as a unit so hook order stays stable across the transition. */
export function App() {
  const session = useAuthSession();

  if (session.status === 'loading') {
    return (
      <AuthGateScreen heading="Checking your session" body="One moment while we confirm who you are." />
    );
  }

  if (session.status === 'error') {
    return (
      <AuthGateScreen heading="Session unavailable" body={session.message} tone="fail" />
    );
  }

  if (session.status === 'anonymous') return <LoginPage unconfigured={false} />;

  /* Unconfigured is shown through the same screen as a failed sign-in, minus the form: this build
   * cannot authenticate anyone, and an inert form would read as a working one. */
  if (session.status === 'unconfigured') return <LoginPage unconfigured />;

  return <WorkspaceShell />;
}

function AuthGateScreen({
  heading,
  body,
  tone = 'unknown',
}: {
  heading: string;
  body: string;
  tone?: 'unknown' | 'fail';
}) {
  return (
    <div className="pn-auth-gate" role="status" aria-live="polite">
      <img className="pn-auth-gate-logo" src="/panchnama-wordmark.png" alt="Panchnama" />
      <h1 className="pn-auth-title">{heading}</h1>
      <p className="pn-auth-gate-text">{body}</p>
      {tone === 'fail' ? (
        <div className="pn-note pn-note-fail">
          <Icon name="warning" size={16} className="pn-badge-glyph" />
          <span>Reload the page to try again.</span>
        </div>
      ) : null}
    </div>
  );
}

function WorkspaceShell() {
  const user = useCurrentUser();
  const { org, sync } = useCurrentWorkspace();
  const { projects, projectId, setProjectId } = useProjects();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const navigate = useNavigate();

  /* Sign-out is server-authoritative: the local session is cleared by Supabase, and the gate
     re-mounts the workspace only once the resulting auth event reports no session. */
  async function handleSignOut(): Promise<void> {
    if (signingOut) return;
    setSigningOut(true);
    await signOut();
    setSigningOut(false);
    setDrawerOpen(false);
  }

  const activeProject = projects.find((entry) => entry.id === projectId) ?? null;

  return (
    <div className="pn-shell">
      <div className="pn-brand">
        <img className="pn-brand-logo" src="/logo.png" alt="" />
        <span>
          <span className="pn-brand-name">Panchnama</span>
          <span className="pn-evidence-meta"> AI · Media intelligence</span>
        </span>
      </div>

      <header className="pn-header">
        <div className="pn-header-left">
          <button
            type="button"
            className="pn-icon-btn"
            aria-expanded={drawerOpen}
            aria-label={drawerOpen === true ? 'Close navigation' : 'Open navigation'}
            onClick={() => setDrawerOpen((open) => !open)}
          >
            <Icon name={drawerOpen === true ? 'close' : 'layers'} size={16} />
          </button>
          <nav aria-label="Breadcrumb">
            <span className="pn-evidence-meta">
              Workspace · {org.status === 'ready' ? org.data.name : UNKNOWN_COPY} ·{' '}
              {activeProject === null ? 'All projects' : activeProject.name}
            </span>
          </nav>
        </div>
        <div className="pn-header-right">
          <SyncChip state={sync} />
          <DataBoundary
            state={user}
            onReady={(account) => (
              <>
                <span className="pn-chip" aria-label="Signed in user">
                  {account.email ?? UNKNOWN_COPY}
                </span>
                <span className="pn-chip">{account.role ?? 'role Unknown'}</span>
              </>
            )}
          />
          <button
            type="button"
            className="pn-btn pn-btn-sm"
            onClick={() => void handleSignOut()}
            disabled={signingOut}
          >
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </header>

      <nav
        className="pn-rail"
        aria-label="Primary"
        style={drawerOpen === true ? { display: 'flex' } : undefined}
      >
        <span className="pn-rail-label">Truth · Evidence · Impact</span>
        {NAV.map((item) => (
          <NavLink
            key={item.label}
            to={resolve(item.to, projectId)}
            end={item.end}
            className="pn-nav-link"
            onClick={() => setDrawerOpen(false)}
          >
            <Icon name={item.icon} size={18} className="pn-nav-icon" />
            <span>{item.label}</span>
          </NavLink>
        ))}
        <span className="pn-rail-label">Projects</span>
        <div className="pn-field" style={{ padding: '0 var(--pn-space-3)' }}>
          <label className="pn-label" htmlFor="shell-project">
            Active project
          </label>
          <select
            id="shell-project"
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
      </nav>

      <main className="pn-main" id="main">
        <div className="pn-main-inner">
          <Routes>
            <Route
              path="/"
              element={
                <OverviewPage
                  onOpenEvidence={() => navigate(resolve('/projects/:projectId/assets', projectId))}
                  onOpenProject={(openedId) => navigate(resolve('/projects/:projectId/assets', openedId))}
                />
              }
            />
            <Route path="/projects/:projectId/assets" element={<EvidenceExplorerPage />} />
            <Route path="/projects/:projectId/assets/:assetId" element={<EvidenceExplorerPage />} />
            <Route path="/integrity" element={<IntegrityPage />} />
            <Route path="/projects/:projectId/change-events" element={<ChangesPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

/** Routes carry a project id; with no project selected the app falls back to an unscoped list
 *  rather than inventing an id. */
function resolve(path: string, projectId: string | null): string {
  if (projectId !== null) return path.replace(':projectId', projectId);
  return path.replace('/projects/:projectId', '/projects/all');
}

function NotFound() {
  return (
    <ClayCard title="Page not found">
      <p className="pn-state-body">That route does not exist in this workspace.</p>
    </ClayCard>
  );
}

function SyncChip({ state }: { state: ReturnType<typeof useCurrentWorkspace>['sync'] }) {
  if (state.status !== 'ready') {
    return <StatusBadge label="Status unknown" tone="unknown" />;
  }
  const rows: SyncHealth[] = state.data;
  const failed = rows.some((row) => row.lastStatus === 'failed');
  const partial = rows.some((row) => row.lastStatus === 'partial');
  const never = rows.every((row) => row.lastRunAt === null);
  if (rows.length === 0 || never === true) return <StatusBadge label="Never synced" tone="unknown" />;
  if (failed === true) return <StatusBadge label="Sync failed" tone="fail" />;
  if (partial === true) return <StatusBadge label="Sync partial" tone="pending" />;
  return <StatusBadge label="Operational" tone="pass" />;
}