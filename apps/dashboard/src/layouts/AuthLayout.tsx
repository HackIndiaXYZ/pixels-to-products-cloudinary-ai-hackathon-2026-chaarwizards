import type { ReactNode } from 'react';
import { LoginForm } from '../features/auth/components/LoginForm';

/** Centred card shell for the unauthenticated login screen. */
export function AuthLayout({ children }: { readonly children?: ReactNode }) {
  return (
    <main className="auth-layout" data-testid="auth-layout">
      <div className="auth-card">
        {/* Brand logo */}
        <div className="auth-brand">
          <div className="brand-icon" aria-hidden="true" style={{ width: 36, height: 36 }}>
            <span className="brand-icon-bar" />
            <span className="brand-icon-bar" />
            <span className="brand-icon-bar" />
          </div>
          <div className="auth-name">Panchnama <span>AI</span></div>
        </div>

        <p className="auth-tagline">
          A written record of inspection, signed by a witness.
        </p>

        {children ?? <LoginForm />}
      </div>
    </main>
  );
}
