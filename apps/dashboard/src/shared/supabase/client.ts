import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '../env';

/**
 * The single Supabase client for the dashboard.
 *
 * Authenticated with the **anon key only** (AGENTS.md §3.5) — RLS is the real
 * isolation boundary, so this key can safely ship in the client bundle. It is
 * used for auth (login/session) and for Realtime subscriptions. All *data*
 * reads go through `@impact/api`, never a direct table select here, because the
 * API owns delivery-URL signing and cross-cutting authorization.
 */
export const supabase: SupabaseClient = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
