import { useState, type FormEvent } from 'react';
import { useAuth } from '../../../shared/auth/AuthContext';

/**
 * Email/password login against Supabase Auth. There is no self-service signup
 * (AGENTS.md §3.10) — accounts arrive via a platform-admin invite — so this
 * form only signs in. A failed attempt renders its reason rather than silently
 * doing nothing (§3.6).
 */
export function LoginForm() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await signIn(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form aria-label="Sign in" onSubmit={onSubmit}>
      <label>
        Email address
        <input
          type="email"
          autoComplete="email"
          placeholder="you@org.example"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </label>
      <label>
        Password
        <input
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </label>
      {error !== null ? (
        <p role="alert" data-testid="login-error" className="status status-flagged" style={{ alignSelf: 'stretch', justifyContent: 'center' }}>
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={busy} style={{ marginTop: '4px' }}>
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
      <p style={{ fontSize: '0.6875rem', color: 'var(--color-fg-subtle)', marginTop: '4px', textAlign: 'center' }}>
        Access is by invitation only. Contact your platform admin.
      </p>
    </form>
  );
}
