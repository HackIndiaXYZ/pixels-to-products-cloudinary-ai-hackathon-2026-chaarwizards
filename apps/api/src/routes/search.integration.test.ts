import { describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import {
  ORG_A,
  ORG_B,
  makeToken,
  makeFakeDb,
  makeFakeCloudinary,
  makeFakeQueue,
  makeFakeMl,
  testConfig,
  type FakeDb,
} from '../testing/fakes.js';

interface Harness {
  app: FastifyInstance;
  db: FakeDb;
}

async function harness(): Promise<Harness> {
  const db = makeFakeDb();
  const app = await buildApp({
    config: testConfig(),
    db,
    cloudinary: makeFakeCloudinary(),
    queue: makeFakeQueue(),
    ml: makeFakeMl(),
    rateLimitEnabled: false,
  });
  return { app, db };
}

const memberA = (): string => makeToken({ orgId: ORG_A, role: 'member' });

interface SearchBody {
  data: { id: string; upload_status: string; phase: string | null; ai_tags: string[] }[];
  total_matched: number;
  truncated: boolean;
  facet_counts: Record<string, Record<string, number>>;
}

async function search(app: FastifyInstance, qs: string, token = memberA()): Promise<SearchBody> {
  const res = await app.inject({
    method: 'GET',
    url: `/v1/search${qs}`,
    headers: { authorization: `Bearer ${token}` },
  });
  expect(res.statusCode).toBe(200);
  return (res.json() as { data: SearchBody }).data;
}

describe('GET /v1/search — every facet, tested individually', () => {
  it('q matches caption / observation_type / tags', async () => {
    const { app, db } = await harness();
    const p = db.seedProject({ org_id: ORG_A });
    db.seedAsset({ org_id: ORG_A, project_id: p.id, caption: 'sapling row' });
    db.seedAsset({ org_id: ORG_A, project_id: p.id, caption: 'road works' });
    const body = await search(app, '?q=sapling');
    expect(body.data).toHaveLength(1);
  });

  it('phase facet filters to before/after', async () => {
    const { app, db } = await harness();
    const p = db.seedProject({ org_id: ORG_A });
    db.seedAsset({ org_id: ORG_A, project_id: p.id, phase: 'before' });
    db.seedAsset({ org_id: ORG_A, project_id: p.id, phase: 'after' });
    const body = await search(app, '?phase=after');
    expect(body.data).toHaveLength(1);
    expect(body.data[0]?.phase).toBe('after');
  });

  it('asset_type facet filters image/video', async () => {
    const { app, db } = await harness();
    const p = db.seedProject({ org_id: ORG_A });
    db.seedAsset({ org_id: ORG_A, project_id: p.id, asset_type: 'image' });
    db.seedAsset({ org_id: ORG_A, project_id: p.id, asset_type: 'video' });
    const body = await search(app, '?asset_type=video');
    expect(body.data).toHaveLength(1);
  });

  it('tags facet requires every tag (AND)', async () => {
    const { app, db } = await harness();
    const p = db.seedProject({ org_id: ORG_A });
    db.seedAsset({ org_id: ORG_A, project_id: p.id, ai_tags: ['tree', 'sapling'] } as never);
    db.seedAsset({ org_id: ORG_A, project_id: p.id, ai_tags: ['tree'] } as never);
    const body = await search(app, '?tags=tree,sapling');
    expect(body.data).toHaveLength(1);
  });

  it('date_from / date_to bound the capture timestamp', async () => {
    const { app, db } = await harness();
    const p = db.seedProject({ org_id: ORG_A });
    db.seedAsset({ org_id: ORG_A, project_id: p.id, device_capture_timestamp: '2024-01-01T00:00:00.000Z' });
    db.seedAsset({ org_id: ORG_A, project_id: p.id, device_capture_timestamp: '2024-06-01T00:00:00.000Z' });
    const body = await search(app, '?date_from=2024-05-01&date_to=2024-07-01');
    expect(body.data).toHaveLength(1);
  });

  it('gps_accuracy_max rejects fixes worse than the ceiling', async () => {
    const { app, db } = await harness();
    const p = db.seedProject({ org_id: ORG_A });
    db.seedAsset({ org_id: ORG_A, project_id: p.id, gps_accuracy_meters: 5 });
    db.seedAsset({ org_id: ORG_A, project_id: p.id, gps_accuracy_meters: 50 });
    const body = await search(app, '?gps_accuracy_max=10');
    expect(body.data).toHaveLength(1);
  });

  it('bbox filters by the map viewport', async () => {
    const { app, db } = await harness();
    const p = db.seedProject({ org_id: ORG_A });
    db.seedAsset({ org_id: ORG_A, project_id: p.id, gps_lat: 19.15, gps_lon: 72.85 });
    db.seedAsset({ org_id: ORG_A, project_id: p.id, gps_lat: 40.0, gps_lon: -74.0 });
    const body = await search(app, '?bbox=72.8,19.1,72.9,19.2');
    expect(body.data).toHaveLength(1);
  });

  it('an invalid bbox is a 400, not a silent empty result', async () => {
    const { app } = await harness();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/search?bbox=1,2,3',
      headers: { authorization: `Bearer ${memberA()}` },
    });
    expect(res.statusCode).toBe(400);
  });

  it('computes facet_counts and total_matched over the full set', async () => {
    const { app, db } = await harness();
    const p = db.seedProject({ org_id: ORG_A });
    db.seedAsset({ org_id: ORG_A, project_id: p.id, phase: 'before' });
    db.seedAsset({ org_id: ORG_A, project_id: p.id, phase: 'before' });
    db.seedAsset({ org_id: ORG_A, project_id: p.id, phase: 'after' });
    const body = await search(app, '');
    expect(body.total_matched).toBe(3);
    expect(body.facet_counts['phase']).toEqual({ before: 2, after: 1 });
  });
});

describe('GET /v1/search — isolation (failure path: no leaking rows across orgs)', () => {
  it("never returns another org's assets", async () => {
    const { app, db } = await harness();
    const pa = db.seedProject({ org_id: ORG_A });
    const pb = db.seedProject({ org_id: ORG_B });
    db.seedAsset({ org_id: ORG_A, project_id: pa.id, caption: 'mine' });
    db.seedAsset({ org_id: ORG_B, project_id: pb.id, caption: 'theirs' });
    const body = await search(app, '?q=theirs', memberA());
    expect(body.data).toHaveLength(0);
    expect(body.total_matched).toBe(0);
  });

  it('rejects an unauthenticated request', async () => {
    const { app } = await harness();
    const res = await app.inject({ method: 'GET', url: '/v1/search' });
    expect(res.statusCode).toBe(401);
  });
});
