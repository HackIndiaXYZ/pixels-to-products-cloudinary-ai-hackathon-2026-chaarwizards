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

async function harness(): Promise<{ app: FastifyInstance; db: FakeDb }> {
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

describe('GET /v1/projects/:id/change-events', () => {
  it('lists a project change events for the caller org', async () => {
    const { app, db } = await harness();
    const p = db.seedProject({ org_id: ORG_A });
    const before = db.seedAsset({ org_id: ORG_A, project_id: p.id, phase: 'before' });
    const after = db.seedAsset({ org_id: ORG_A, project_id: p.id, phase: 'after' });
    await db.changeEvents.insert({
      project_id: p.id,
      org_id: ORG_A,
      before_asset_id: before.id,
      after_asset_id: after.id,
      change_type: 'sapling_planting',
      change_metrics: { saplings_planted: 49 },
      detection_method: 'cv_model_forestry',
      model_version: 'v1-placeholder',
      confidence: 0.9,
      diff_asset_cloudinary_id: null,
      gps_distance_meters: 2.1,
      time_difference_hours: 3,
      status: 'detected',
      failure_reason: null,
    });

    const res = await app.inject({
      method: 'GET',
      url: `/v1/projects/${p.id}/change-events`,
      headers: { authorization: `Bearer ${memberA()}` },
    });
    expect(res.statusCode).toBe(200);
    const body = (res.json() as { data: { data: { model_version: string }[] } }).data;
    expect(body.data).toHaveLength(1);
    // §3.2: every metric row carries its model_version.
    expect(body.data[0]?.model_version).toBe('v1-placeholder');
  });

  it("returns 404 for a project in another org (no leak)", async () => {
    const { app, db } = await harness();
    const pb = db.seedProject({ org_id: ORG_B });
    const res = await app.inject({
      method: 'GET',
      url: `/v1/projects/${pb.id}/change-events`,
      headers: { authorization: `Bearer ${memberA()}` },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /v1/assets/:id/derivatives', () => {
  it('returns the append-only lineage with transformation + is_generative', async () => {
    const { app, db } = await harness();
    const p = db.seedProject({ org_id: ORG_A });
    const asset = db.seedAsset({ org_id: ORG_A, project_id: p.id });
    db.seedDerivative({
      parent_asset_id: asset.id,
      org_id: ORG_A,
      transformation: 'c_lfill,g_auto,w_400,h_300,f_auto,q_auto:eco',
      kind: 'report_thumb',
      is_generative: false,
    });

    const res = await app.inject({
      method: 'GET',
      url: `/v1/assets/${asset.id}/derivatives`,
      headers: { authorization: `Bearer ${memberA()}` },
    });
    expect(res.statusCode).toBe(200);
    const body = (res.json() as { data: { data: { transformation: string; is_generative: boolean }[] } }).data;
    expect(body.data).toHaveLength(1);
    expect(body.data[0]?.transformation).toBe('c_lfill,g_auto,w_400,h_300,f_auto,q_auto:eco');
    expect(body.data[0]?.is_generative).toBe(false);
  });

  it("returns 404 for an asset in another org (no leak)", async () => {
    const { app, db } = await harness();
    const pb = db.seedProject({ org_id: ORG_B });
    const other = db.seedAsset({ org_id: ORG_B, project_id: pb.id });
    const res = await app.inject({
      method: 'GET',
      url: `/v1/assets/${other.id}/derivatives`,
      headers: { authorization: `Bearer ${memberA()}` },
    });
    expect(res.statusCode).toBe(404);
  });
});
