import type { ReactNode } from 'react';
import { LoginForm } from '../features/auth/components/LoginForm';

/** Centred card shell for the unauthenticated login screen. */
export function AuthLayout({ children }: { readonly children?: ReactNode }) {
  return (
    <main className="auth-layout" data-testid="auth-layout">
      <div className="auth-card">
        <h1>Panchnama</h1>
        <p className="auth-tagline">A written record of inspection, signed by a witness.</p>
        {children ?? <LoginForm />}
      </div>
    </main>
  );
}
