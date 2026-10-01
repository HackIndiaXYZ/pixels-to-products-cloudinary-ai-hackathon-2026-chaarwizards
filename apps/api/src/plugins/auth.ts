/**
 * Supabase JWT verification and the caller identity it yields.
 *
 * The client is untrusted (AGENTS.md §3.4): the API verifies the bearer token
 * independently and reads `org_id`, `user_id`, and `role` ONLY from the verified
 * claims — never from a request body. `org_id` and `role` are written into
 * `app_metadata` at invite redemption (BUILD_ORDER carry-over decision), so they
 * are read from there first, with a top-level fallback for tokens that hoist the
 * claims (the custom access-token hook does exactly this). An absent or
 * unverifiable token is a `401`; a token missing an `org_id`/`role` is a `401`
 * too, because a caller with no org has no scope.
 *
 * Two signing schemes are supported, chosen by the token header `alg`:
 *  - **ES256 / RS256** — the current Supabase/GoTrue default, signed by an
 *    asymmetric key published at the project JWKS endpoint. Verified against the
 *    public key selected by `kid` (fetched + cached).
 *  - **HS256** — the legacy symmetric scheme, verified with the shared
 *    `SUPABASE_JWT_SECRET`. Kept for local/test tokens and older projects.
 */
import { createPublicKey, type KeyObject } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { ROLES, type Role } from '@panchnama/shared';
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
 * Pull the caller identity out of a set of verified claims. `org_id`/`role` come
 * from `app_metadata` first (where invite redemption writes them), then a
 * top-level fallback (where the custom access-token hook hoists `org_id`, and
 * the hook mirrors the app role to `app_role` to avoid clobbering the reserved
 * PostgREST `role`). A missing org/role is a hard failure, never a default.
 */
function extractIdentity(payload: jwt.JwtPayload): DecodedIdentity {
  const sub = payload.sub;
  if (typeof sub !== 'string' || sub.length === 0) {
    throw errors.unauthorized('token missing sub');
  }

  const appMetadata =
    typeof payload.app_metadata === 'object' && payload.app_metadata !== null
      ? (payload.app_metadata as Record<string, unknown>)
      : {};

  const orgIdRaw = appMetadata.org_id ?? payload.org_id;
  const roleRaw = appMetadata.role ?? payload.app_role ?? payload.role;

  if (typeof orgIdRaw !== 'string' || orgIdRaw.length === 0) {
    throw errors.forbidden('token has no org_id claim');
  }
  if (!isRole(roleRaw)) {
    throw errors.forbidden('token has no valid role claim');
  }

  return { userId: sub, orgId: orgIdRaw, role: roleRaw };
}

/**
 * Verify a Supabase **HS256** JWT and extract the caller identity. Throws a
 * `401`/`403` `HttpError` on any failure (bad signature, expired, missing claim).
 * Retained for the legacy symmetric scheme and for tests that mint HS256 tokens.
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
    if (err && typeof err === 'object' && 'code' in err) {
      throw err; // already an HttpError from extractIdentity
    }
    throw errors.unauthorized('invalid token');
  }
  return extractIdentity(payload);
}

/** One key from a JWKS document, in JWK form. */
interface Jwk {
  kid?: string;
  kty: string;
  alg?: string;
  [k: string]: unknown;
}

/**
 * Fetch-and-cache the project JWKS, resolving a public key by `kid`. Keys are
 * cached indefinitely once seen; an unknown `kid` triggers a single refetch
 * (covers key rotation) before the token is rejected. This never blocks on the
 * network for a `kid` already cached.
 */
export class JwksCache {
  private readonly keys = new Map<string, KeyObject>();
  private lastFetch = 0;
  private readonly minRefetchMs = 5_000;

  constructor(private readonly jwksUrl: string) {}

  private async refresh(): Promise<void> {
    const now = Date.now();
    if (now - this.lastFetch < this.minRefetchMs) return;
    this.lastFetch = now;
    const res = await fetch(this.jwksUrl);
    if (!res.ok) {
      throw errors.unauthorized('could not fetch signing keys');
    }
    const body = (await res.json()) as { keys?: Jwk[] };
    for (const jwk of body.keys ?? []) {
      if (typeof jwk.kid !== 'string') continue;
      try {
        this.keys.set(jwk.kid, createPublicKey({ key: jwk as never, format: 'jwk' }));
      } catch {
        // A malformed key is skipped, not fatal for the whole set.
      }
    }
  }

  async getKey(kid: string): Promise<KeyObject> {
    const cached = this.keys.get(kid);
    if (cached !== undefined) return cached;
    await this.refresh();
    const key = this.keys.get(kid);
    if (key === undefined) {
      throw errors.unauthorized('unknown token signing key');
    }
    return key;
  }
}

/**
 * Verify a Supabase JWT regardless of signing scheme and extract the identity.
 * ES256/RS256 tokens are checked against the JWKS public key named by the header
 * `kid`; HS256 tokens fall back to the shared secret. Async because a JWKS miss
 * may fetch keys.
 */
export async function verifySupabaseJwtAsync(
  token: string,
  opts: { secret: string; jwks: JwksCache },
): Promise<DecodedIdentity> {
  const decodedHeader = jwt.decode(token, { complete: true });
  if (decodedHeader === null || typeof decodedHeader === 'string') {
    throw errors.unauthorized('malformed token');
  }
  const alg = decodedHeader.header.alg;

  if (alg === 'HS256') {
    return verifySupabaseJwt(token, opts.secret);
  }

  if (alg === 'ES256' || alg === 'RS256') {
    const kid = decodedHeader.header.kid;
    if (typeof kid !== 'string') {
      throw errors.unauthorized('token missing key id');
    }
    const key = await opts.jwks.getKey(kid);
    let payload: jwt.JwtPayload;
    try {
      const verified = jwt.verify(token, key, { algorithms: ['ES256', 'RS256'] });
      if (typeof verified === 'string') {
        throw errors.unauthorized('unexpected token payload');
      }
      payload = verified;
    } catch (err) {
      if (err instanceof Error && err.name === 'TokenExpiredError') {
        throw errors.unauthorized('token expired');
      }
      if (err && typeof err === 'object' && 'code' in err) {
        throw err;
      }
      throw errors.unauthorized('invalid token');
    }
    return extractIdentity(payload);
  }

  throw errors.unauthorized(`unsupported token algorithm: ${String(alg)}`);
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
