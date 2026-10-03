import type { AppClaims, Org, Role } from '../../types/database';
import {
  empty,
  failed,
  ready,
  undetermined,
  unauthorized,
  type DataState,
} from '../state';
import { claimsOrUnauthorized, getSupabase, hasRole } from '../supabase/client';
import { parseOrg } from './parse';

export const READ_ROLE: Role = 'viewer';
export const WRITE_ROLE: Role = 'member';
export const ADMIN_ROLE: Role = 'org_admin';

/** There is no `users` or `members` table. Identity comes from the Supabase auth session and
 *  authorisation from the hoisted JWT claims — never from a request body. */
export interface CurrentUser {
  userId: string;
  email: string;
  orgId: string;
  role: Role;
  expiresAt: string;
}

export async function getCurrentClaims(): Promise<DataState<AppClaims>> {
  const supabase = getSupabase();
  if (!supabase) return failed();
  const session = await supabase.auth.getSession();
  const token = session.data.session?.access_token;
  if (!token) return unauthorized<AppClaims>();
  const claims = parseJwtPayload(token);
  const resolved = claimsOrUnauthorized(claims, READ_ROLE);
  if ('status' in resolved) return resolved;
  return ready(resolved);
}

export async function getCurrentUser(): Promise<DataState<CurrentUser>> {
  const claimsState = await getCurrentClaims();
  if (claimsState.status !== 'ready') return claimsState;
  const supabase = getSupabase();
  if (!supabase) return failed();
  const result = await supabase.auth.getUser();
  const user = result.data.user;
  const role = claimsState.data.app_role;
  if (!user || role === null) return undetermined();
  const email = typeof user.email === 'string' && user.email.length > 0 ? user.email : '';
  return ready({
    userId: claimsState.data.sub ?? user.id,
    email,
    orgId: claimsState.data.org_id ?? '',
    role,
    expiresAt: claimsState.data.exp === null ? '' : new Date(claimsState.data.exp * 1000).toISOString(),
  });
}

/** Orgs are provisioned by a `platform_admin` through `POST /v1/orgs`; the organisation the
 *  caller belongs to is the `org_id` claim, never a parameter supplied by the client. */
export async function getOwnOrg(): Promise<DataState<Org>> {
  const claimsState = await getCurrentClaims();
  if (claimsState.status !== 'ready') return claimsState;
  const orgId = claimsState.data.org_id;
  if (orgId === null) return undetermined();
  const supabase = getSupabase();
  if (!supabase) return failed();
  /* A `select` always resolves to a row array, even behind `.limit(1)`, and `parseOrg` only
     accepts a single record. Handing it the array makes `asRecord` reject the value and report
     every org as absent, so the first row is unwrapped before parsing. An RLS-hidden row still
     resolves to the empty state rather than a fabricated org. */
  const result = await supabase.from('orgs').select('*').eq('id', orgId).limit(1);
  if (result.error) return failed();
  const org = parseOrg(Array.isArray(result.data) ? result.data[0] : result.data);
  return org === null ? empty() : ready(org);
}

export function canWrite(role: Role | null): boolean {
  return hasRole(role, WRITE_ROLE);
}

export function isAdmin(role: Role | null): boolean {
  return hasRole(role, ADMIN_ROLE);
}

export function roleLabel(role: Role | null): string {
  return role === null ? 'Unknown' : role.replace(/_/g, ' ');
}

/** Decodes the caller's own access token so the hoisted claims can be read without a round trip.
 *  The signature is not verified here — verification is the gateway's job, and every query below
 *  still runs under RLS. */
function parseJwtPayload(token: string): Record<string, unknown> {
  const segment = token.split('.')[1];
  if (segment === undefined) return {};
  try {
    const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
    const decoded: unknown = JSON.parse(atob(padded));
    return typeof decoded === 'object' && decoded !== null ? (decoded as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
