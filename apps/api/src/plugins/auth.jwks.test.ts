import { describe, expect, it } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { verifySupabaseJwtAsync, JwksCache } from './auth.js';
import { HttpError } from '../types.js';
import { TEST_JWT_SECRET, makeToken, ORG_A } from '../testing/fakes.js';

/**
 * The asymmetric (ES256) path — current Supabase/GoTrue default. Proves the API
 * verifies a real JWKS-signed token, selects the key by `kid`, and still honours
 * the HS256 fallback through the same entrypoint.
 */
const KID = 'test-ec-key-1';

function makeEcToken(claims: Record<string, unknown>, opts: { kid?: string } = {}): {
  token: string;
  jwk: Record<string, unknown>;
} {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = { ...(publicKey.export({ format: 'jwk' }) as object), kid: KID, alg: 'ES256', use: 'sig' };
  const token = jwt.sign(claims, privateKey, {
    algorithm: 'ES256',
    keyid: opts.kid ?? KID,
    expiresIn: 3600,
  });
  return { token, jwk: jwk as Record<string, unknown> };
}

function jwksReturning(jwk: Record<string, unknown>): JwksCache {
  const cache = new JwksCache('http://jwks.local/keys');
  // Stub the network with a per-cache fetch override.
  (globalThis as { fetch: typeof fetch }).fetch = (async () =>
    ({ ok: true, json: async () => ({ keys: [jwk] }) }) as unknown as Response) as typeof fetch;
  return cache;
}

describe('verifySupabaseJwtAsync — ES256 (JWKS) path', () => {
  it('verifies an ES256 token against the JWKS key named by kid', async () => {
    const { token, jwk } = makeEcToken({
      sub: 'u-es',
      app_metadata: { org_id: ORG_A, role: 'member' },
    });
    const jwks = jwksReturning(jwk);
    const id = await verifySupabaseJwtAsync(token, { secret: 'unused', jwks });
    expect(id).toEqual({ userId: 'u-es', orgId: ORG_A, role: 'member' });
  });

  it('hoisted top-level org_id + app_role also resolve (custom access token hook shape)', async () => {
    const { token, jwk } = makeEcToken({
      sub: 'u-es2',
      org_id: ORG_A,
      app_role: 'org_admin',
      role: 'authenticated', // reserved PostgREST role — must be ignored for app role
    });
    const jwks = jwksReturning(jwk);
    const id = await verifySupabaseJwtAsync(token, { secret: 'unused', jwks });
    expect(id).toEqual({ userId: 'u-es2', orgId: ORG_A, role: 'org_admin' });
  });

  it('rejects an ES256 token whose kid is not in the JWKS', async () => {
    const { token, jwk } = makeEcToken(
      { sub: 'u', app_metadata: { org_id: ORG_A, role: 'member' } },
      { kid: 'some-other-kid' },
    );
    // Publish a DIFFERENT kid so the token's kid is unknown.
    const jwks = jwksReturning({ ...jwk, kid: KID });
    await expect(verifySupabaseJwtAsync(token, { secret: 'unused', jwks })).rejects.toThrow(
      HttpError,
    );
  });

  it('still accepts an HS256 token through the same entrypoint (legacy/test)', async () => {
    const token = makeToken({ orgId: ORG_A, role: 'member', sub: 'u-hs' });
    const jwks = new JwksCache('http://unused.local/keys');
    const id = await verifySupabaseJwtAsync(token, { secret: TEST_JWT_SECRET, jwks });
    expect(id).toEqual({ userId: 'u-hs', orgId: ORG_A, role: 'member' });
  });
});
