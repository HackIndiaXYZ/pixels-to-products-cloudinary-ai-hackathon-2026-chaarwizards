import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiRequest, ApiRequestError } from './client';

// The API client must not touch real env or Supabase; stub the session so it
// yields a deterministic bearer token.
vi.mock('../supabase/client', () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: { access_token: 'jwt-abc' } } }),
    },
  },
}));

vi.mock('../env', () => ({ env: { apiUrl: 'https://api.test/v1/' } }));

afterEach(() => {
  vi.restoreAllMocks();
});

function mockFetch(response: unknown, status = 200): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => response,
    })) as unknown as typeof fetch,
  );
}

describe('apiRequest — auth boundary (§3.4)', () => {
  it('sends the verified JWT as a Bearer token and no org_id', async () => {
    mockFetch({ data: { ok: true }, error: null });
    await apiRequest('/v1/search', { query: { q: 'x' } });

    const call = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const [url, init] = call;
    const headers = init.headers as Record<string, string>;

    expect(headers['Authorization']).toBe('Bearer jwt-abc');
    // Org scope is the JWT, never a query param the client can forge.
    expect(url).not.toContain('org_id');
    expect(url).not.toContain('user_id');
  });

  it('unwraps a success envelope to its data', async () => {
    mockFetch({ data: { hello: 'world' }, error: null });
    const data = await apiRequest<{ hello: string }>('/v1/thing');
    expect(data).toEqual({ hello: 'world' });
  });

  it('throws a typed ApiRequestError on a failure envelope (never returns error as data)', async () => {
    mockFetch({ data: null, error: { code: 'NOT_FOUND', message: 'asset not found' } }, 404);
    await expect(apiRequest('/v1/assets/other-org-asset/integrity')).rejects.toMatchObject({
      code: 'NOT_FOUND',
      status: 404,
    });
  });

  it('throws on a non-2xx even without an envelope', async () => {
    mockFetch('not json', 500);
    await expect(apiRequest('/v1/thing')).rejects.toBeInstanceOf(ApiRequestError);
  });
});
