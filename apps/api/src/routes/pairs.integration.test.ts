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

function seedPair(db: FakeDb, orgId: string): { projectId: string; beforeId: string; afterId: string } {
  const project = db.seedProject({ org_id: orgId, sector: 'forestry' });
  const before = db.seedAsset({ org_id: orgId, project_id: project.id, phase: 'before' });
  const after = db.seedAsset({ org_id: orgId, project_id: project.id, phase: 'after' });
  return { projectId: project.id, beforeId: before.id, afterId: after.id };
}

const memberA = (): string => makeToken({ orgId: ORG_A, role: 'member' });

describe('POST /v1/pairs — manual link', () => {
  it('links two assets into a manual pair and appends an audit entry', async () => {
    const { app, db } = await harness();
    const { beforeId, afterId } = seedPair(db, ORG_A);

    const res = await app.inject({
      method: 'POST',
      url: '/v1/pairs',
      headers: { authorization: `Bearer ${memberA()}` },
      payload: { before_asset_id: beforeId, after_asset_id: afterId },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { data: { status: string; detection_method: string; model_version: string } };
    expect(body.data.status).toBe('manual');
    expect(body.data.detection_method).toBe('manual');
    expect(body.data.model_version).toBe('manual');
    expect(db._audit.some((a) => a.action === 'pair')).toBe(true);
  });

  it('rejects a link when an asset belongs to another org (404, no leak)', async () => {
    const { app, db } = await harness();
    const a = seedPair(db, ORG_A);
    const b = seedPair(db, ORG_B);
    // Org A caller tries to link its own before to org B's after.
    const res = await app.inject({
      method: 'POST',
      url: '/v1/pairs',
      headers: { authorization: `Bearer ${memberA()}` },
      payload: { before_asset_id: a.beforeId, after_asset_id: b.afterId },
    });
    expect(res.statusCode).toBe(404);
    expect(db._changeEvents.size).toBe(0);
  });

  it('rejects linking an asset to itself', async () => {
    const { app, db } = await harness();
    const { beforeId } = seedPair(db, ORG_A);
    const res = await app.inject({
      method: 'POST',
      url: '/v1/pairs',
      headers: { authorization: `Bearer ${memberA()}` },
      payload: { before_asset_id: beforeId, after_asset_id: beforeId },
    });
    expect(res.statusCode).toBe(400);
  });

  it('viewer cannot create a manual pair', async () => {
    const { app, db } = await harness();
    const { beforeId, afterId } = seedPair(db, ORG_A);
    const res = await app.inject({
      method: 'POST',
      url: '/v1/pairs',
      headers: { authorization: `Bearer ${makeToken({ orgId: ORG_A, role: 'viewer' })}` },
      payload: { before_asset_id: beforeId, after_asset_id: afterId },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('POST /v1/pairs/:id/split — gate: split outside the caller org is rejected (404)', () => {
  it('splits a pair the caller owns and appends an audit entry', async () => {
    const { app, db } = await harness();
    const { projectId, beforeId, afterId } = seedPair(db, ORG_A);
    const ev = await db.changeEvents.insert({
      project_id: projectId,
      org_id: ORG_A,
      before_asset_id: beforeId,
      after_asset_id: afterId,
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
      method: 'POST',
      url: `/v1/pairs/${ev.id}/split`,
      headers: { authorization: `Bearer ${memberA()}` },
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { data: { status: string } }).data.status).toBe('split');
    expect(db._audit.some((a) => a.action === 'split')).toBe(true);
  });

  it("returns 404 when the pair id belongs to another org (no privilege escalation)", async () => {
    const { app, db } = await harness();
    const a = seedPair(db, ORG_A);
    const b = seedPair(db, ORG_B);
    const bEvent = await db.changeEvents.insert({
      project_id: b.projectId,
      org_id: ORG_B,
      before_asset_id: b.beforeId,
      after_asset_id: b.afterId,
      change_type: 'sapling_planting',
      change_metrics: {},
      detection_method: 'cv_model_forestry',
      model_version: 'v1-placeholder',
      confidence: null,
      diff_asset_cloudinary_id: null,
      gps_distance_meters: null,
      time_difference_hours: null,
      status: 'detected',
      failure_reason: null,
    });
    void a;

    // Org A caller tries to split org B's pair.
    const res = await app.inject({
      method: 'POST',
      url: `/v1/pairs/${bEvent.id}/split`,
      headers: { authorization: `Bearer ${memberA()}` },
    });
    expect(res.statusCode).toBe(404);
    // Untouched.
    expect(db._changeEvents.get(bEvent.id)?.status).toBe('detected');
  });
});
