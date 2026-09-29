import type { ReactNode } from 'react';
import { Link, Outlet } from 'react-router-dom';
import { useAuth } from '../shared/auth/AuthContext';

/** Sidebar + header shell for the authenticated app. */
export function MainLayout({ children }: { readonly children?: ReactNode }) {
  const { orgId, role, signOut } = useAuth();
  return (
    <div className="main-layout" data-testid="main-layout">
      <header>
        <h1>Impact Media Intelligence</h1>
        <div>
          <span data-testid="org-context">{orgId ?? 'no org'}</span>
          <span data-testid="role-context">{role ?? '—'}</span>
          <button type="button" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </header>
      <nav aria-label="Primary">
        <Link to="/">Projects</Link>
        <Link to="/search">Search</Link>
        <Link to="/map">Map</Link>
        <Link to="/admin">Admin queue</Link>
      </nav>
      <main>{children ?? <Outlet />}</main>
    </div>
  );
}
