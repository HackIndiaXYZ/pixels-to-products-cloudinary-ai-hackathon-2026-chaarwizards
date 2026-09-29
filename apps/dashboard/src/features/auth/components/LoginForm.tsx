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
        Email
        <input
          type="email"
          autoComplete="email"
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
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </label>
      {error !== null ? (
        <p role="alert" data-testid="login-error">
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={busy}>
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
