import { describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import { createMlClient, mintInternalJwt } from './ml-client.js';
import { testConfig } from '../testing/fakes.js';

/**
 * A stand-in ML endpoint that enforces the same contract the real Python service
 * does: a request with no valid internal JWT is rejected 401. This proves the
 * API client always mints and sends the token, never a bare shared secret
 * , and that the "no internal JWT" path is a rejection.
 */
function fakeMlEndpoint(secret: string): typeof fetch {
  return (async (_url: string | URL | Request, init?: RequestInit) => {
    const auth = (init?.headers as Record<string, string> | undefined)?.authorization;
    const bearer = typeof auth === 'string' ? /^Bearer (.+)$/.exec(auth)?.[1] : undefined;
    if (bearer === undefined) {
      return new Response('unauthorized', { status: 401 });
    }
    try {
      jwt.verify(bearer, secret, { algorithms: ['HS256'] });
    } catch {
      return new Response('unauthorized', { status: 401 });
    }
    return new Response(
      JSON.stringify({ change_type: 'sapling_planting', change_metrics: {}, confidence: 0.9 }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }) as unknown as typeof fetch;
}

const req = {
  before_url: 'https://res.cloudinary.com/demo/a.jpg',
  after_url: 'https://res.cloudinary.com/demo/b.jpg',
  sector: 'forestry',
  project_id: '00000000-0000-4000-8000-000000000001',
};

describe('ml client', () => {
  it('succeeds when the minted internal JWT is present', async () => {
    const config = testConfig();
    const client = createMlClient(config, fakeMlEndpoint(config.INTERNAL_JWT_SECRET));
    const res = await client.detectChange({ userId: 'u1', orgId: 'o1', jobId: 'j1' }, req);
    expect(res.change_type).toBe('sapling_planting');
  });

  it('a call with no internal JWT is rejected (the ML endpoint returns 401)', async () => {
    const config = testConfig();
    // A fetch impl that strips the Authorization header simulates a bare call.
    const stripAuth: typeof fetch = (async (url: string, init?: RequestInit) => {
      const endpoint = fakeMlEndpoint(config.INTERNAL_JWT_SECRET);
      return endpoint(url, { ...init, headers: {} });
    }) as unknown as typeof fetch;
    const client = createMlClient(config, stripAuth);
    await expect(
      client.detectChange({ userId: 'u1', orgId: 'o1', jobId: 'j1' }, req),
    ).rejects.toThrow();
  });

  it('rejects a token signed with the wrong secret', async () => {
    const config = testConfig();
    const wrongToken = mintInternalJwt('not-the-secret', { sub: 'u', org_id: 'o', job_id: 'j' });
    const forced: typeof fetch = (async (url: string, init?: RequestInit) => {
      const endpoint = fakeMlEndpoint(config.INTERNAL_JWT_SECRET);
      return endpoint(url, { ...init, headers: { authorization: `Bearer ${wrongToken}` } });
    }) as unknown as typeof fetch;
    const client = createMlClient(config, forced);
    await expect(
      client.detectChange({ userId: 'u1', orgId: 'o1', jobId: 'j1' }, req),
    ).rejects.toThrow();
  });
});
