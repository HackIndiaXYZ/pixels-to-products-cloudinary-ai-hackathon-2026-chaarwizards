import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import type { AppClaims, Role } from '../../types/database';
import { unauthorized } from '../state';

const env: Record<string, string | undefined> = import.meta.env;

const supabaseUrl: string | null = env.VITE_SUPABASE_URL ?? null;
const supabaseAnonKey: string | null = env.VITE_SUPABASE_ANON_KEY ?? null;

/* The service-role key must never reach the browser. Supabase exposes only VITE_-prefixed
   variables to the bundle, and these guards fail loudly if a privileged key is ever pasted
   into the public slot. */
const SERVICE_ROLE_MARKERS = ['service_role', 'sb_secret_'];

export function isServiceRoleKey(key: string): boolean {
  const lowered = key.toLowerCase();
  return SERVICE_ROLE_MARKERS.some((marker) => lowered.includes(marker));
}

export const backendConfigured: boolean = Boolean(supabaseUrl && supabaseAnonKey);

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!backendConfigured) return null;
  if (client) return client;
  if (isServiceRoleKey(supabaseAnonKey ?? '')) {
    throw new Error(
      'VITE_SUPABASE_ANON_KEY looks like a service-role key. The browser must use the anon or publishable key only.',
    );
  }
  client = createClient(supabaseUrl as string, supabaseAnonKey as string, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  return client;
}

/* ── documented third-party adapter ────────────────────────────────────────────
   `@supabase/supabase-js` resolves its default generic to `any`, so every result is funnelled
   through this narrow, explicitly-typed surface and narrowed again by the parse helpers in
   src/lib/queries before it reaches application code. Nothing downstream touches an untyped
   value, and the service-role key is not referenced anywhere on this side of the boundary. */

export interface PostgrestFailure {
  message: string;
  code?: string;
}

export interface PostgrestEnvelope {
  data: unknown;
  error: PostgrestFailure | null;
}

export interface CountEnvelope {
  count: number | null;
  error: PostgrestFailure | null;
}

/** Awaiting a query yields its envelope, exactly as a real PostgREST builder does. The query layer
 *  reads `data` and `error` off the awaited result, so this must be a thenable rather than a plain
 *  fluent object — otherwise `await` hands back the builder and every read is `undefined`. */
export interface TableQuery extends PromiseLike<PostgrestEnvelope> {
  select(columns?: string): TableQuery;
  eq(column: string, value: unknown): TableQuery;
  neq(column: string, value: unknown): TableQuery;
  is(column: string, value: null): TableQuery;
  notNull(column: string): TableQuery;
  in(column: string, values: readonly unknown[]): TableQuery;
  gte(column: string, value: unknown): TableQuery;
  lte(column: string, value: unknown): TableQuery;
  gt(column: string, value: unknown): TableQuery;
  lt(column: string, value: unknown): TableQuery;
  order(column: string, ascending: boolean, nullsFirst?: boolean): TableQuery;
  limit(count: number): TableQuery;
  range(from: number, to: number): PromiseLike<PostgrestEnvelope>;
  maybeSingle(): PromiseLike<PostgrestEnvelope>;
  countExact(): PromiseLike<CountEnvelope>;
}

type FluentBuilder = Record<string, (...args: unknown[]) => unknown>;

function toEnvelope(value: unknown): PostgrestEnvelope {
  if (typeof value !== 'object' || value === null) return { data: value, error: null };
  const record = value as Record<string, unknown>;
  const rawError = record.error;
  if (typeof rawError === 'object' && rawError !== null) {
    const failure = rawError as Record<string, unknown>;
    return {
      data: record.data ?? null,
      error: {
        message: typeof failure.message === 'string' ? failure.message : 'query failed',
        code: typeof failure.code === 'string' ? failure.code : undefined,
      },
    };
  }
  return { data: record.data ?? null, error: null };
}

function adapt(builder: unknown): TableQuery {
  const call = (method: string, args: unknown[]): TableQuery => {
    const fn = (builder as FluentBuilder)[method];
    return adapt(typeof fn === 'function' ? fn.apply(builder, args) : builder);
  };
/* PostgREST returns the exact row count in `Content-Range` when `count: 'exact'` is requested.
      A `head: true` select asks for the count without transferring any rows. A failed count is
      *resolved* rather than rejected, so the failure has to be read off the settled envelope:
      returning `error: null` alongside a null count makes a broken query indistinguishable from
      "the backend returned no exact number", and every `if (envelope.error) return failed()` guard
      in the query services becomes unreachable. */
    const countExact = (): Promise<CountEnvelope> => {
      const select = (builder as FluentBuilder).select;
      if (typeof select !== 'function') {
        return Promise.resolve({ count: null, error: { message: 'count is unsupported by this query' } });
      }
      const counted = select.apply(builder, ['*', { count: 'exact', head: true }]);
      return Promise.resolve(counted as PromiseLike<unknown>).then((value): CountEnvelope => {
        const envelope = toEnvelope(value);
        if (envelope.error !== null) return { count: null, error: envelope.error };
        const record = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
        const count =
          record !== null && typeof record.count === 'number' && Number.isFinite(record.count)
            ? record.count
            : null;
        return { count, error: null };
      });
    };
  return {
    select: (columns) => (columns === undefined ? adapt(builder) : call('select', [columns])),
    eq: (column, value) => call('eq', [column, value]),
    neq: (column, value) => call('neq', [column, value]),
    is: (column, value) => call('is', [column, value]),
    notNull: (column) => call('not', [column, 'is', null]),
    in: (column, values) => call('in', [column, [...values]]),
    gte: (column, value) => call('gte', [column, value]),
    lte: (column, value) => call('lte', [column, value]),
    gt: (column, value) => call('gt', [column, value]),
    lt: (column, value) => call('lt', [column, value]),
    order: (column, ascending, nullsFirst) => call('order', [column, ascending, nullsFirst]),
    limit: (count) => call('limit', [count]),
    /* Adopting the real builder executes the query and normalises the result through `toEnvelope`,
       which is what makes `await table(x).select(…).eq(…)` yield `{ data, error }` instead of this
       object. Without it every fluent read silently sees `undefined` and takes the success path. */
    then<TResult1 = PostgrestEnvelope, TResult2 = never>(
      onfulfilled?: ((value: PostgrestEnvelope) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): PromiseLike<TResult1 | TResult2> {
      return Promise.resolve(builder as PromiseLike<unknown>)
        .then(toEnvelope)
        .then(onfulfilled, onrejected);
    },
    /* A PostgREST builder is thenable, so it must be awaited before `toEnvelope` reads `data` and
       `error` off it. Reading the builder itself yields neither, which would report every query as
       a successful empty result instead of surfacing a real failure. */
    range: (from, to) => {
      const fn = (builder as FluentBuilder).range;
      const target = typeof fn === 'function' ? fn.call(builder, from, to) : builder;
      return Promise.resolve(target as PromiseLike<unknown>).then(toEnvelope);
    },
    maybeSingle: () => {
      const fn = (builder as FluentBuilder).maybeSingle;
      const target = typeof fn === 'function' ? fn.call(builder) : builder;
      return Promise.resolve(target as PromiseLike<unknown>).then(toEnvelope);
    },
    countExact,
  };
}

export function table(name: string): TableQuery | null {
  const supabase = getSupabase();
  if (!supabase) return null;
  return adapt(supabase.from(name));
}

export function rpc(fn: string, args: Record<string, unknown> = {}): Promise<PostgrestEnvelope> {
  const supabase = getSupabase();
  if (!supabase) return Promise.resolve({ data: null, error: { message: 'backend not configured' } });
  const invoke = supabase.rpc as unknown as (f: string, a: Record<string, unknown>) => unknown;
  return Promise.resolve(invoke.call(supabase, fn, args) as PromiseLike<unknown>).then(toEnvelope);
}

/* ── API-route access (media + receipts) ────────────────────────────────────
   A client never supplies a `public_id`. It asks by `asset_id` and the API resolves the
   resource under RLS, so every media request is an authenticated fetch of a private route. */

const apiBase: string | null = env.VITE_PANCHNAMA_API_BASE ?? null;

export const apiConfigured: boolean = Boolean(apiBase);

export async function apiFetch<T>(path: string, parse: (raw: unknown) => T | null): Promise<T | null> {
  const base = apiBase;
  const supabase = getSupabase();
  if (!base || !supabase) return null;
  const session = await supabase.auth.getSession();
  const token = session.data.session?.access_token;
  if (!token) return null;
  const response = await fetch(`${base}${path}`, {
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
  });
  if (!response.ok) return null;
  return parse(await response.json());
}

/* ── authentication ──────────────────────────────────────────────────────────────
   Identity comes from the Supabase session alone. This boundary exposes sign-in, sign-out and
   session access and nothing else: no signup, no password reset, no OTP, because organisation
   membership is provisioned server-side by a platform_admin. Nothing here accepts an `org_id`
   or a role from the caller, and neither helper ever returns or stores the password. */

export const AUTH_UNCONFIGURED =
  'Sign-in is unavailable: this build has no Supabase URL and anon key configured.';

export interface AuthFailure {
  message: string;
  code?: string;
}

export interface AuthSessionResult {
  session: Session | null;
  error: AuthFailure | null;
}

/** Maps transport and provider failures onto calm copy that does not reveal whether an account
 *  exists. The provider's own message is kept as the fallback so nothing is silently hidden. */
function authFailure(raw: { message: string; code?: string | null }): AuthFailure {
  const code = typeof raw.code === 'string' ? raw.code : undefined;
  switch (code) {
    case 'invalid_credentials':
      return { message: 'That email and password combination was not recognised.', code };
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
    case 'too_many_requests':
      return { message: 'Too many attempts. Wait a moment, then try again.', code };
    default:
      return { message: raw.message || 'Sign-in failed. Try again.', code };
  }
}

export async function signInWithPassword(
  email: string,
  password: string,
): Promise<AuthSessionResult> {
  const supabase = getSupabase();
  if (!supabase) return { session: null, error: { message: AUTH_UNCONFIGURED } };
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { session: null, error: authFailure(error) };
  return { session: data.session ?? null, error: null };
}

export async function signOut(): Promise<AuthFailure | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { error } = await supabase.auth.signOut();
  return error ? authFailure(error) : null;
}

/* ── authorisation claims ──────────────────────────────────────────────────────
   `app_role` is the hoisted authorisation claim. `role` is a reserved PostgREST claim and is
   deliberately never read. */

const ROLES: readonly string[] = ['platform_admin', 'org_admin', 'member', 'viewer'];

export function readAppRole(raw: unknown): Role | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const candidate = (raw as Record<string, unknown>).app_role;
  return typeof candidate === 'string' && ROLES.includes(candidate) ? (candidate as Role) : null;
}

export function readOrgId(raw: unknown): string | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const candidate = (raw as Record<string, unknown>).org_id;
  return typeof candidate === 'string' ? candidate : null;
}

export function hasRole(role: Role | null, required: Role): boolean {
  if (role === null) return false;
  if (role === 'platform_admin' || role === 'org_admin') return true;
  if (role === 'member') return required === 'member' || required === 'viewer';
  return required === 'viewer';
}

export function claimsOrUnauthorized(
  raw: unknown,
  required: Role,
): AppClaims | ReturnType<typeof unauthorized<AppClaims>> {
  const role = readAppRole(raw);
  if (!hasRole(role, required)) return unauthorized<AppClaims>(required);
  const record = raw as Record<string, unknown>;
  return {
    org_id: readOrgId(raw),
    app_role: role,
    sub: typeof record.sub === 'string' ? record.sub : null,
    exp: typeof record.exp === 'number' ? record.exp : null,
  };
}
