import type { ReactNode } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../shared/auth/AuthContext';

/** SVG icons — inline to avoid build deps. */
function IconGrid() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v18"/><path d="M3 12h18"/>
      <rect x="3" y="3" width="18" height="18" rx="2"/>
    </svg>
  );
}
function IconImage() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
      <circle cx="9" cy="9" r="2"/>
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
    </svg>
  );
}
function IconMap() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/>
      <line x1="9" x2="9" y1="3" y2="18"/><line x1="15" x2="15" y1="6" y2="21"/>
    </svg>
  );
}
function IconSearch() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8"/><path d="m21 21-4.34-4.34"/>
    </svg>
  );
}
function IconAlert() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/>
      <path d="M12 9v4"/><path d="M12 17h.01"/>
    </svg>
  );
}
function IconBell() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10.268 21a2 2 0 0 0 3.464 0"/>
      <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/>
    </svg>
  );
}
function IconChevronRight() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{width:'12px',height:'12px'}}>
      <path d="m9 18 6-6-6-6"/>
    </svg>
  );
}
function IconTreePine({ color }: { color?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{width:'20px',height:'20px',color}}>
      <path d="m17 14 3 3.3a1 1 0 0 1-.7 1.7H4.7a1 1 0 0 1-.7-1.7L7 14h-.3a1 1 0 0 1-.7-1.7L9 9h-.2A1 1 0 0 1 8 7.3L12 3l4 4.3a1 1 0 0 1-.8 1.7H15l3 3.3a1 1 0 0 1-.7 1.7H17Z"/>
      <path d="M12 22v-3"/>
    </svg>
  );
}

const NAV_ITEMS = [
  { to: '/',       label: 'Projects',   icon: <IconGrid /> },
  { to: '/search', label: 'Field evidence', icon: <IconSearch /> },
  { to: '/map',    label: 'Map view',   icon: <IconMap /> },
  { to: '/admin',  label: 'Quarantine queue', icon: <IconAlert /> },
];

/** Sidebar + header shell for the authenticated app. */
export function MainLayout({ children }: { readonly children?: ReactNode }) {
  const { orgId, role, signOut } = useAuth();
  const location = useLocation();

  const initials = role ? role.slice(0, 2).toUpperCase() : 'U';

  return (
    <div className="app-shell" data-testid="main-layout">
      {/* ── TOP HEADER ─────────────────────────────── */}
      <header className="app-header">
        {/* Brand */}
        <div className="header-brand">
          <div className="brand-icon" aria-hidden="true">
            <span className="brand-icon-bar" />
            <span className="brand-icon-bar" />
            <span className="brand-icon-bar" />
          </div>
          <div className="brand-text">
            <div className="brand-name">Panchnama <span>AI</span></div>
            <div className="brand-tagline">Media intelligence platform</div>
          </div>
        </div>

        <div className="header-divider" />

        {/* Workspace breadcrumb */}
        <div className="header-workspace">
          <span className="header-workspace-label">Workspace</span>
          <IconChevronRight />
          <span className="header-workspace-name" data-testid="org-context">
            {orgId ?? 'No workspace'}
          </span>
        </div>

        {/* Right actions */}
        <div className="header-actions">
          <span className="header-status-dot">
            <span className="status-pulse" />
            Operational
          </span>
          <div className="header-divider-v" />
          <button type="button" className="icon-btn" aria-label="Notifications">
            <IconBell />
          </button>
          <div className="header-divider-v" />
          <div className="header-avatar" aria-label={`Role: ${role ?? 'user'}`}>
            {initials}
          </div>
          <div className="header-user-info">
            <span className="header-user-name" data-testid="role-context">{role ?? '—'}</span>
            <span className="header-user-role">
              {orgId ? 'Authenticated' : 'No org'}
            </span>
          </div>
          <button type="button" className="btn-ghost" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </header>

      {/* ── SIDEBAR ────────────────────────────────── */}
      <aside className="app-sidebar">
        <div className="sidebar-body">
          {/* Projects header */}
          <div className="sidebar-section-title">
            <span className="sidebar-section-label">Projects</span>
          </div>

          {/* Search */}
          <div className="sidebar-search">
            <svg className="sidebar-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.34-4.34"/>
            </svg>
            <input placeholder="Search projects…" aria-label="Search projects" />
          </div>

          {/* Active projects */}
          <div className="sidebar-group-label">Active projects</div>
          <div className="sidebar-projects">
            <button type="button" className="sidebar-project-item active">
              <IconTreePine color="var(--color-primary)" />
              <div style={{flex:1,minWidth:0}}>
                <div className="sidebar-project-name">Sundarbans Forestry</div>
                <div className="sidebar-project-location">Kolkata, West Bengal</div>
              </div>
              <IconChevronRight />
            </button>
            <button type="button" className="sidebar-project-item">
              <IconTreePine color="var(--color-success)" />
              <div style={{flex:1,minWidth:0}}>
                <div className="sidebar-project-name">Ganga Water Cleanup</div>
                <div className="sidebar-project-location">Varanasi, Uttar Pradesh</div>
              </div>
              <IconChevronRight />
            </button>
          </div>

          {/* Navigation */}
          <nav aria-label="Primary">
            <ul className="sidebar-nav">
              {NAV_ITEMS.map(({ to, label, icon }) => {
                const active = to === '/'
                  ? location.pathname === '/'
                  : location.pathname.startsWith(to);
                return (
                  <li key={to}>
                    <Link
                      to={to}
                      className={`sidebar-nav-link${active ? ' active' : ''}`}
                      aria-current={active ? 'page' : undefined}
                    >
                      <span className="sidebar-nav-icon">{icon}</span>
                      <span>{label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>

        <div className="sidebar-footer">
          <div className="sidebar-tagline">
            Truth<br />Evidence<br />Impact
          </div>
        </div>
      </aside>

      {/* ── MAIN ───────────────────────────────────── */}
      <main className="app-main">
        <div className="main-content">
          {children ?? <Outlet />}
        </div>
      </main>
    </div>
  );
}
