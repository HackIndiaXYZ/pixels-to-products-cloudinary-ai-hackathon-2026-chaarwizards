import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { signInWithPassword } from '../../lib/supabase/client';
import { Icon } from '../../components/Icon';

type FormStatus = 'idle' | 'submitting' | 'failed';
type FieldName = 'email' | 'password';

interface LoginPageProps {
  /** True when the build has no Supabase URL/anon key, so sign-in is refused outright rather
   *  than appearing to succeed. */
  unconfigured: boolean;
}

type FieldErrors = Record<FieldName, string | null>;

const NO_ERRORS: FieldErrors = { email: null, password: null };

/** Local validation only. Each message names the cause and the remedy, and none of them imply the
 *  server was consulted — a field can be well-formed here and still be rejected on submit. */
function validate(field: FieldName, email: string, password: string): string | null {
  if (field === 'email') {
    const value = email.trim();
    if (value === '') return 'Enter the email address your administrator issued for this workspace.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      return 'That is not a complete email address. Check for a missing @ or a missing domain.';
    }
    return null;
  }
  /* Only emptiness is asserted. The schema states no password policy, so inventing a length or
     complexity rule here would reject valid credentials. */
  if (password === '') return 'Enter your password.';
  return null;
}

function validateAll(email: string, password: string): FieldErrors {
  return { email: validate('email', email, password), password: validate('password', email, password) };
}

function firstInvalid(errors: FieldErrors): FieldName | null {
  if (errors.email !== null) return 'email';
  if (errors.password !== null) return 'password';
  return null;
}

/** Password sign-in for invited operators. There is no signup, password reset, or magic-link
 *  path: organisation access is provisioned server-side by a platform_admin, and the account row
 *  is the only place a role is decided.
 *
 *  The password lives in this component's submit state alone. It is never stored, never placed in
 *  a URL or query key, never logged, and cleared the moment the attempt settles. */
export function LoginPage({ unconfigured }: LoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>(NO_ERRORS);
  const [status, setStatus] = useState<FormStatus>('idle');
  const [message, setMessage] = useState<string | null>(null);

  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const submitting = status === 'submitting';

  /** Validate one field and publish the result. Called on blur, and again on change only once a
   *  field is already showing an error, so a correction clears the message without nagging. */
  function settle(field: FieldName): void {
    setErrors((current) => ({ ...current, [field]: validate(field, email, password) }));
  }

  function update(field: FieldName, value: string): void {
    if (field === 'email') setEmail(value);
    else setPassword(value);
    if (errors[field] !== null) {
      setErrors((current) => ({
        ...current,
        [field]: validate(field, field === 'email' ? value : email, field === 'password' ? value : password),
      }));
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (submitting || unconfigured) return;

    const found = validateAll(email, password);
    setErrors(found);

    const invalid = firstInvalid(found);
    if (invalid !== null) {
      setMessage(null);
      setStatus('idle');
      if (invalid === 'email') emailRef.current?.focus();
      else passwordRef.current?.focus();
      return;
    }

    setStatus('submitting');
    setMessage(null);

    const { error } = await signInWithPassword(email.trim(), password);
    setPassword('');

    if (error) {
      setStatus('failed');
      setMessage(error.message);
      return;
    }

    /* On success the session hook drives the transition into the workspace, so this component
       deliberately does not navigate on its own. */
    setStatus('idle');
  }

  const describedBy = (field: FieldName): string | undefined =>
    errors[field] === null ? undefined : `pn-auth-${field}-error`;

  return (
    <main className="pn-auth">
      <section className="pn-auth-story" aria-label="About Panchnama">
        <div className="pn-auth-story-brand">
          <img className="pn-auth-wordmark" src="/panchnama-wordmark.png" alt="Panchnama" />
        </div>
        <div className="pn-auth-story-copy">
          <h2>Field evidence, ready to stand behind.</h2>
          <p>
            Bring captured media, integrity checks and project reviews together in one auditable
            workspace.
          </p>
        </div>
        <ol className="pn-auth-workflow">
          <li>
            <span className="pn-auth-step">01</span>
            <span>
              <strong>Capture</strong>
              <span>Record photos, video, location and time in the field.</span>
            </span>
          </li>
          <li>
            <span className="pn-auth-step">02</span>
            <span>
              <strong>Verify</strong>
              <span>Review hashes, signatures and the audit trail.</span>
            </span>
          </li>
          <li>
            <span className="pn-auth-step">03</span>
            <span>
              <strong>Review</strong>
              <span>Follow evidence and changes across projects.</span>
            </span>
          </li>
        </ol>
      </section>

      <section className="pn-auth-card" aria-labelledby="pn-auth-title">
        <h1 className="pn-auth-title" id="pn-auth-title">
          Sign in to Panchnama
        </h1>
        <p className="pn-auth-lede">
          Use the account issued by your organisation.
        </p>

        {unconfigured ? (
          <div className="pn-note pn-note-fail" role="alert">
            <Icon name="warning" size={16} className="pn-badge-glyph" />
            <span>
              This build has no Supabase connection configured, so sign-in is disabled. Set{' '}
              <code className="pn-mono">VITE_SUPABASE_URL</code> and{' '}
              <code className="pn-mono">VITE_SUPABASE_ANON_KEY</code> and reload.
            </span>
          </div>
        ) : (
          <form className="pn-auth-form" onSubmit={(event) => void handleSubmit(event)} noValidate>
            <div className="pn-field">
              <label className="pn-label" htmlFor="pn-auth-email">
                Work email
                <span className="pn-label-required" aria-hidden="true">
                  {' '}
                  *
                </span>
              </label>
              <input
                id="pn-auth-email"
                ref={emailRef}
                className="pn-input"
                type="email"
                name="email"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                required
                value={email}
                aria-required="true"
                aria-invalid={errors.email !== null}
                aria-describedby={describedBy('email')}
                onChange={(event) => update('email', event.target.value)}
                onBlur={() => settle('email')}
                disabled={submitting}
              />
              {errors.email !== null ? (
                <p className="pn-field-error" id="pn-auth-email-error">
                  <Icon name="warning" size={14} className="pn-badge-glyph" />
                  <span>{errors.email}</span>
                </p>
              ) : null}
            </div>

            <div className="pn-field">
              <label className="pn-label" htmlFor="pn-auth-password">
                Password
                <span className="pn-label-required" aria-hidden="true">
                  {' '}
                  *
                </span>
              </label>
              <input
                id="pn-auth-password"
                ref={passwordRef}
                className="pn-input"
                type="password"
                name="password"
                autoComplete="current-password"
                required
                value={password}
                aria-required="true"
                aria-invalid={errors.password !== null}
                aria-describedby={describedBy('password')}
                onChange={(event) => update('password', event.target.value)}
                onBlur={() => settle('password')}
                disabled={submitting}
              />
              {errors.password !== null ? (
                <p className="pn-field-error" id="pn-auth-password-error">
                  <Icon name="warning" size={14} className="pn-badge-glyph" />
                  <span>{errors.password}</span>
                </p>
              ) : null}
            </div>

            {status === 'failed' && message !== null ? (
              <div className="pn-note pn-note-fail" role="alert">
                <Icon name="cross" size={16} className="pn-badge-glyph" />
                <span>{message}</span>
              </div>
            ) : null}

            <button
              type="submit"
              className="pn-btn pn-btn-primary pn-auth-submit"
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <Icon name="clock" size={16} className="pn-badge-glyph" />
                  Signing in…
                </>
              ) : (
                <>
                  <Icon name="lock" size={16} className="pn-badge-glyph" />
                  Sign in
                </>
              )}
            </button>
          </form>
        )}

        <p className="pn-auth-foot">
          <Icon name="integrity" size={14} className="pn-badge-glyph" />
          Accounts are issued by your organisation administrator. There is no self-service signup.
        </p>
      </section>
    </main>
  );
}