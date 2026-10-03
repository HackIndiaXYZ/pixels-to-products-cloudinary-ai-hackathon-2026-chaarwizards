/**
 * Minimal API client for the capture app (Phase carry-over: wire
 * the capture app to the real API). Platform-agnostic and dependency-injected —
 * the base URL, bearer token, and `fetch` are all passed in — so it runs under
 * Node/vitest exactly as it does on device, matching the capture pipeline's
 * ports+fakes pattern.
 *
 * `org_id` and role are NEVER sent by the client. The API resolves them from the
 * verified Supabase JWT ; this client only forwards that JWT as
 * a bearer token.
 */
import { ProjectSchema, type Project } from '@panchnama/shared/rn';

export interface FetchProjectsInput {
  /** Base URL of the running `@panchnama/api`, e.g. `https://api.example.com`. */
  readonly baseUrl: string;
  /** The verified Supabase session JWT. Required — there is no anonymous read. */
  readonly token: string;
  /** Injected fetch (global `fetch` on device / in Node 20). */
  readonly fetchFn?: typeof fetch;
}

export interface LoginInput {
  readonly email: string;
  readonly password: string;
  readonly supabaseUrl?: string;
  readonly anonKey?: string;
  readonly fetchFn?: typeof fetch;
}

interface ProjectsEnvelope {
  readonly data?: unknown[];
  readonly error?: { readonly code?: string; readonly message?: string } | null;
}

/**
 * Authenticate directly against the deployed Supabase Auth service to receive a live verified JWT token.
 */
export async function loginWithSupabase(input: LoginInput): Promise<{ token: string; userEmail: string }> {
  const url = input.supabaseUrl ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = input.anonKey ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error('Supabase Auth configuration missing (EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY)');
  }

  const doFetch = input.fetchFn ?? fetch;
  const response = await doFetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': key,
    },
    body: JSON.stringify({
      email: input.email,
      password: input.password,
    }),
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => ({}))) as { error_description?: string; msg?: string; error?: string };
    const errorMsg = errorBody.error_description || errorBody.msg || errorBody.error || `Authentication failed: HTTP ${response.status}`;
    throw new Error(errorMsg);
  }

  const data = (await response.json()) as { access_token?: string; user?: { email?: string } };
  if (!data.access_token) {
    throw new Error('Supabase Auth response missing access_token');
  }

  return {
    token: data.access_token,
    userEmail: data.user?.email ?? input.email,
  };
}

/**
 * Load the caller's projects from `GET /v1/projects`. Throws on a non-2xx
 * response or a malformed row rather than silently degrading .
 */
export async function fetchProjects(input: FetchProjectsInput): Promise<Project[]> {
  if (input.token.length === 0) {
    throw new Error('fetchProjects requires a session token ');
  }
  const doFetch = input.fetchFn ?? fetch;
  const response = await doFetch(`${input.baseUrl}/v1/projects`, {
    method: 'GET',
    headers: {
      // The API derives org/user/role from this JWT — never from the body.
      Authorization: `Bearer ${input.token}`,
      Accept: 'application/json',
    },
  });
  if (!response.ok) {
    throw new Error(`GET /v1/projects failed: ${response.status}`);
  }
  const body = (await response.json()) as ProjectsEnvelope;
  const rows = body.data ?? [];
  // Validate at the trust boundary; a malformed row is an error, not a shrug.
  return rows.map((r) => ProjectSchema.parse(r));
}
