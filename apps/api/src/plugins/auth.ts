/**
 * Supabase JWT verification and the caller identity it yields.
 *
 * The client is untrusted (AGENTS.md §3.4): the API verifies the bearer token
 * independently and reads `org_id`, `user_id`, and `role` ONLY from the verified
 * claims — never from a request body. `org_id` and `role` are written into
 * `app_metadata` at invite redemption (BUILD_ORDER carry-over decision), so they
 * are read from there first, with a top-level fallback for tokens that hoist the
 * claims. An absent or unverifiable token is a `401`; a token missing an
 * `org_id`/`role` is a `401` too, because a caller with no org has no scope.
 */
import jwt from 'jsonwebtoken';
import { ROLES, type Role } from '@impact/shared';
import { errors } from '../types.js';

function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

interface DecodedIdentity {
  userId: string;
  orgId: string;
  role: Role;
}

/**
 * Verify a Supabase HS256 JWT and extract the caller identity. Throws a `401`
 * `HttpError` on any failure (bad signature, expired, missing claim).
 */
export function verifySupabaseJwt(token: string, secret: string): DecodedIdentity {
  let payload: jwt.JwtPayload;
  try {
    const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] });
    if (typeof decoded === 'string') {
      throw errors.unauthorized('unexpected token payload');
    }
    payload = decoded;
  } catch (err) {
    if (err instanceof Error && err.name === 'TokenExpiredError') {
      throw errors.unauthorized('token expired');
    }
    throw errors.unauthorized('invalid token');
  }

  const sub = payload.sub;
  if (typeof sub !== 'string' || sub.length === 0) {
    throw errors.unauthorized('token missing sub');
  }

  const appMetadata =
    typeof payload.app_metadata === 'object' && payload.app_metadata !== null
      ? (payload.app_metadata as Record<string, unknown>)
      : {};

  const orgIdRaw = appMetadata.org_id ?? payload.org_id;
  const roleRaw = appMetadata.role ?? payload.role;

  if (typeof orgIdRaw !== 'string' || orgIdRaw.length === 0) {
    throw errors.forbidden('token has no org_id claim');
  }
  if (!isRole(roleRaw)) {
    throw errors.forbidden('token has no valid role claim');
  }

  return { userId: sub, orgId: orgIdRaw, role: roleRaw };
}

/** Extract the bearer token from an Authorization header value. */
export function extractBearer(header: string | undefined): string {
  if (header === undefined) {
    throw errors.unauthorized('missing Authorization header');
  }
  const match = /^Bearer (.+)$/.exec(header);
  if (match === null || match[1] === undefined) {
    throw errors.unauthorized('malformed Authorization header');
  }
  return match[1];
}
