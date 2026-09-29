/**
 * Client-safe environment access.
 *
 * Every value here is inlined into the browser bundle by Vite, so ONLY
 * public values may live behind a `VITE_` prefix (AGENTS.md §3.5,
 * ENVIRONMENT.md §2). The Cloudinary API secret and the Supabase service-role
 * key must NEVER be referenced from this app. The dashboard signs nothing and
 * lists nothing directly — it asks `@impact/api` for every URL and every row,
 * which resolves under RLS with the caller's JWT.
 */

function required(name: string, value: string | undefined): string {
  if (value && value.length > 0) {
    return value;
  }
  if (import.meta.env.DEV) {
    // Dev-only placeholder so the app boots before `.env.local` is filled.
    // A production build must fail loudly rather than silently misconfigure
    // (AGENTS.md §3.6, no silent degradation).
    return `dev-missing:${name}`;
  }
  throw new Error(`${name} is not set. Refusing to boot a misconfigured build (AGENTS.md §3.6).`);
}

export const env = {
  /** Base URL of `@impact/api`. Every product read goes here, never Cloudinary. */
  apiUrl: required('VITE_API_URL', import.meta.env.VITE_API_URL as string | undefined),
  /** Public Supabase project URL. */
  supabaseUrl: required('VITE_SUPABASE_URL', import.meta.env.VITE_SUPABASE_URL as string | undefined),
  /** Public, RLS-bound anon key. NEVER the service-role key (AGENTS.md §3.5). */
  supabaseAnonKey: required(
    'VITE_SUPABASE_ANON_KEY',
    import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
  ),
} as const;
