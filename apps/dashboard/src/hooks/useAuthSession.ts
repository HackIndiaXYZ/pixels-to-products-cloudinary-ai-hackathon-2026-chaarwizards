import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { backendConfigured, getSupabase } from '../lib/supabase/client';

/** Auth session lifecycle as a discriminated union, so no screen has to infer meaning from a
 *  nullable session. `unconfigured` is deliberately distinct from `anonymous`: one means this
 *  build cannot sign anyone in, the other means nobody is signed in. */
export type AuthSessionState =
  | { status: 'unconfigured' }
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'ready'; session: Session }
  | { status: 'error'; message: string };

const INITIAL: AuthSessionState = backendConfigured
  ? { status: 'loading' }
  : { status: 'unconfigured' };

/** Reads the persisted session once, then follows Supabase's auth events for the lifetime of the
 *  component. Identity is never read from a route, a prop, or local storage: the session and the
 *  JWT claims it carries are the only source of truth, which is what keeps RLS authoritative. */
export function useAuthSession(): AuthSessionState {
  const [state, setState] = useState<AuthSessionState>(INITIAL);

  useEffect(() => {
    if (!backendConfigured) return;

    const supabase = getSupabase();
    if (!supabase) {
      setState({ status: 'unconfigured' });
      return;
    }

    let active = true;

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) {
        setState({ status: 'error', message: error.message });
        return;
      }
      const session = data.session ?? null;
      setState(session === null ? { status: 'anonymous' } : { status: 'ready', session });
    });

    /* The callback stays synchronous: awaiting other Supabase calls inside an auth-event handler
       is a documented deadlock, and every transition this app needs is a plain state update. */
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setState(session === null ? { status: 'anonymous' } : { status: 'ready', session });
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  return state;
}