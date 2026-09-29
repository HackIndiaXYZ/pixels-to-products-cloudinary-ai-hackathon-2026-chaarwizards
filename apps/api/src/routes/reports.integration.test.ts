import { describe, it, expect } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import {
  makeFakeDb,
  makeFakeCloudinary,
  makeFakeQueue,
  makeFakeRenderer,
  makeFakeMl,
  makeToken,
  testConfig,
  ORG_A,
  type FakeDb,
} from '../testing/fakes.js';

async function harness(): Promise<{ app: FastifyInstance; db: FakeDb; ctxIds: { projectId: string; changeEventId: string } }> {
  const db = makeFakeDb();
  const project = db.seedProject({ org_id: ORG_A, name: 'Rainforest Alpha', sector: 'forestry' });
  const before = db.seedAsset({
    org_id: ORG_A,
    project_id: project.id,
    cloudinary_public_id: `${ORG_A}/${project.id}/before`,
    upload_status: 'verified',
    phase: 'before',
  });
  const after = db.seedAsset({
    org_id: ORG_A,
    project_id: project.id,
    cloudinary_public_id: `${ORG_A}/${project.id}/after`,
    upload_status: 'verified',
    phase: 'after',
  });
  await db.audit.append({ assetId: before.id, action: 'upload', actorType: 'system', actorId: 'c', details: { a: 1 } });
  await db.audit.append({ assetId: after.id, action: 'upload', actorType: 'system', actorId: 'c', details: { a: 2 } });
  const event = db.seedChangeEvent({
    org_id: ORG_A,
    project_id: project.id,
    before_asset_id: before.id,
    after_asset_id: after.id,
  });

  const app = await buildApp({
    config: testConfig(),
    db,
    cloudinary: makeFakeCloudinary(),
    queue: makeFakeQueue(),
    ml: makeFakeMl(),
    renderer: makeFakeRenderer(),
    fetchBytes: (url) => Promise.resolve(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from(url)])),
    rateLimitEnabled: false,
  });
  return { app, db, ctxIds: { projectId: project.id, changeEventId: event.id } };
}

const member = (): string => makeToken({ orgId: ORG_A, role: 'member' });
const viewer = (): string => makeToken({ orgId: ORG_A, role: 'viewer' });

describe('POST /v1/reports/generate', () => {
  it('generates a report and returns a manifest (member+)', async () => {
    const { app, ctxIds } = await harness();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/reports/generate',
      headers: { authorization: `Bearer ${member()}` },
      payload: {
        project_id: ctxIds.projectId,
        template_id: 'forestry_donor',
        change_event_ids: [ctxIds.changeEventId],
        include_integrity_appendix: true,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: { self_contained: boolean; manifest: unknown[]; pdf_url: string; html_url: string; template_version: string } };
    expect(body.data.self_contained).toBe(true);
    expect(body.data.manifest.length).toBeGreaterThan(0);
    expect(body.data.pdf_url).toContain('.pdf');
    expect(body.data.html_url).toContain('.html');
    expect(body.data.template_version).toBe('forestry_donor@1');
    await app.close();
  });

  it('is forbidden for a viewer (read-only role §3.10)', async () => {
    const { app, ctxIds } = await harness();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/reports/generate',
      headers: { authorization: `Bearer ${viewer()}` },
      payload: {
        project_id: ctxIds.projectId,
        template_id: 'forestry_donor',
        change_event_ids: [ctxIds.changeEventId],
      },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('401s without a bearer token', async () => {
    const { app, ctxIds } = await harness();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/reports/generate',
      payload: { project_id: ctxIds.projectId, template_id: 'forestry_donor', change_event_ids: [ctxIds.changeEventId] },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('GET /v1/report-templates', () => {
  it('lists the built-in forestry template', async () => {
    const { app } = await harness();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/report-templates?sector=forestry',
      headers: { authorization: `Bearer ${member()}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: { data: { id: string; built_in: boolean }[] } };
    expect(body.data.data.some((t) => t.id === 'forestry_donor' && t.built_in)).toBe(true);
    await app.close();
  });
});
