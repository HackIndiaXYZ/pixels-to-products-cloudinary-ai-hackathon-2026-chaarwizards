/**
 * Phase 5 carry-over — capture-app API client. Verifies the client forwards the
 * Supabase JWT as a bearer token (never org_id/role in the body, §3.4), fails
 * loudly on a non-2xx response, and validates rows at the boundary.
 */
import { describe, expect, it, vi } from 'vitest';
import { fetchProjects } from './api.js';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const PROJECT = {
  id: '00000000-0000-4000-8000-000000000001',
  org_id: '00000000-0000-4000-8000-0000000000aa',
  name: 'Riverside',
  sector: 'forestry',
  config: { observation_types: [] },
  parent_project_id: null,
  created_at: new Date().toISOString(),
};

describe('fetchProjects', () => {
  it('sends Authorization: Bearer <jwt> and no org in the body', async () => {
    const fetchFn = vi.fn(async () => jsonResponse(200, { data: [PROJECT] }));
    const rows = await fetchProjects({
      baseUrl: 'https://api.example.com',
      token: 'jwt-123',
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    expect(rows).toHaveLength(1);
    expect(fetchFn).toHaveBeenCalledWith(
      'https://api.example.com/v1/projects',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Authorization: 'Bearer jwt-123' }),
      }),
    );
    // No request body is sent — org/user/role come from the verified JWT (§3.4).
    const [, init] = fetchFn.mock.calls[0]!;
    expect((init as RequestInit).body).toBeUndefined();
  });

  it('throws without a token (§3.4: no anonymous project read)', async () => {
    await expect(
      fetchProjects({ baseUrl: 'https://api.example.com', token: '' }),
    ).rejects.toThrow(/session token/);
  });

  it('throws on a non-2xx response rather than degrading silently (§3.6)', async () => {
    const fetchFn = vi.fn(async () => jsonResponse(401, { error: { code: 'UNAUTHORIZED' } }));
    await expect(
      fetchProjects({
        baseUrl: 'https://api.example.com',
        token: 'jwt-123',
        fetchFn: fetchFn as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/401/);
  });
});
