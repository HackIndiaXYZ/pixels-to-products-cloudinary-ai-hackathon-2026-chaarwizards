import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import type { Role } from '@panchnama/shared/rn';
import { supabase } from '../supabase/client';

/**
 * Auth context and gate.
 *
 * The session comes from Supabase; `org_id` and `role` are read from the
 * server-controlled `app_metadata` claims of the verified JWT, never from
 * anything the user can write (AGENTS.md §3.4, §3.10). This is display context
 * only — the real authorization boundary is the API + RLS, which re-derive the
 * same claims server-side on every request.
 */
export interface AuthState {
  readonly session: Session | null;
  readonly userId: string | null;
  readonly orgId: string | null;
  readonly role: Role | null;
  readonly loading: boolean;
  readonly signIn: (email: string, password: string) => Promise<void>;
  readonly signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

function claim(session: Session | null, key: string): string | null {
  const meta = session?.user.app_metadata as Record<string, unknown> | undefined;
  const value = meta?.[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function AuthProvider({ children }: { readonly children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) {
        setSession(data.session);
        setLoading(false);
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      session,
      userId: session?.user.id ?? null,
      orgId: claim(session, 'org_id'),
      role: (claim(session, 'role') as Role | null) ?? null,
      loading,
      signIn: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          throw error;
        }
      },
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [session, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (ctx === null) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
