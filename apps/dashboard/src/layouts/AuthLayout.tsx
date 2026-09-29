import type { ReactNode } from 'react';
import { LoginForm } from '../features/auth/components/LoginForm';

/** Centred card shell for the unauthenticated login screen. */
export function AuthLayout({ children }: { readonly children?: ReactNode }) {
  return (
    <main className="auth-layout" data-testid="auth-layout">
      <div className="auth-card">
        <h1>Impact Media Intelligence</h1>
        {children ?? <LoginForm />}
      </div>
    </main>
  );
}
