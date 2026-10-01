import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { sha256Canonical, type SigningPayloadInput } from '@panchnama/shared';
import { buildApp } from '../app.js';
import { toE7 } from '../services/verification.js';
import {
  ORG_A,
  ORG_B,
  makeToken,
  makeFakeDb,
  makeFakeCloudinary,
  makeFakeQueue,
  makeFakeMl,
  makeFakeRenderer,
  makeDeviceKeys,
  signCapture,
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
    renderer: makeFakeRenderer(),
    rateLimitEnabled: false,
  });
  return { app, db };
}

const memberA = (): string => makeToken({ orgId: ORG_A, role: 'member' });

describe('GET /v1/assets/:id/integrity (Phase 11 coverage of the §3.7 contract)', () => {
  it('returns the flat contract for a verified asset, crypto checks honestly unknown', async () => {
    const { app, db } = await harness();
    const p = db.seedProject({ org_id: ORG_A });
    const asset = db.seedAsset({ org_id: ORG_A, project_id: p.id, upload_status: 'verified' });
    const res = await app.inject({
      method: 'GET',
      url: `/v1/assets/${asset.id}/integrity`,
      headers: { authorization: `Bearer ${memberA()}` },
    });
    expect(res.statusCode).toBe(200);
    const c = res.json().data;
    expect(c.asset_id).toBe(asset.id);
    expect(c.sha256_matches_commit).toBe(true);
    // Ed25519 / EXIF checks are unknown in the fake — never rounded up to pass.
    expect(c.device_signature_verified).toBeNull();
  });

  it('reports fail states for a flagged (quarantined) asset', async () => {
    const { app, db } = await harness();
    const p = db.seedProject({ org_id: ORG_A });
    const asset = db.seedAsset({ org_id: ORG_A, project_id: p.id, upload_status: 'flagged' });
    const res = await app.inject({
      method: 'GET',
      url: `/v1/assets/${asset.id}/integrity`,
      headers: { authorization: `Bearer ${memberA()}` },
    });
    expect(res.statusCode).toBe(200);
    const c = res.json().data;
    expect(c.sha256_matches_commit).toBe(false);
    expect(c.device_signature_verified).toBe(false);
  });

  it('404s for an asset in another org, 401 without a token', async () => {
    const { app, db } = await harness();
    const pb = db.seedProject({ org_id: ORG_B });
    const other = db.seedAsset({ org_id: ORG_B, project_id: pb.id });
    const cross = await app.inject({
      method: 'GET',
      url: `/v1/assets/${other.id}/integrity`,
      headers: { authorization: `Bearer ${memberA()}` },
    });
    expect(cross.statusCode).toBe(404);

    const unauth = await app.inject({ method: 'GET', url: `/v1/assets/${other.id}/integrity` });
    expect(unauth.statusCode).toBe(401);
  });
});

describe('Project get / tree / config (Phase 11 coverage)', () => {
  it('gets a project, its tree, and updates its config', async () => {
    const { app, db } = await harness();
    const root = db.seedProject({ org_id: ORG_A, name: 'Root' });
    db.seedProject({ org_id: ORG_A, name: 'Child', parent_project_id: root.id });

    const get = await app.inject({
      method: 'GET',
      url: `/v1/projects/${root.id}`,
      headers: { authorization: `Bearer ${memberA()}` },
    });
    expect(get.statusCode).toBe(200);
    expect(get.json().data.id).toBe(root.id);

    const tree = await app.inject({
      method: 'GET',
      url: `/v1/projects/${root.id}/tree`,
      headers: { authorization: `Bearer ${memberA()}` },
    });
    expect(tree.statusCode).toBe(200);
    expect(tree.json().data.data.length).toBeGreaterThanOrEqual(1);

    const patch = await app.inject({
      method: 'PATCH',
      url: `/v1/projects/${root.id}/config`,
      headers: { authorization: `Bearer ${memberA()}` },
      payload: { observation_types: [{ type: 'planting', model: 'forestry', gps_radius: 25 }] },
    });
    expect(patch.statusCode).toBe(200);
  });

  it('404s a tree and a config update for a project in another org', async () => {
    const { app, db } = await harness();
    const pb = db.seedProject({ org_id: ORG_B });
    const tree = await app.inject({
      method: 'GET',
      url: `/v1/projects/${pb.id}/tree`,
      headers: { authorization: `Bearer ${memberA()}` },
    });
    expect(tree.statusCode).toBe(404);

    const patch = await app.inject({
      method: 'PATCH',
      url: `/v1/projects/${pb.id}/config`,
      headers: { authorization: `Bearer ${memberA()}` },
      payload: { observation_types: [] },
    });
    expect(patch.statusCode).toBe(404);
  });
});

describe('Org provisioning edge (Phase 11 coverage)', () => {
  it('provisions an org with no type and no admin_email (no invite minted)', async () => {
    const { app } = await harness();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/orgs',
      headers: { authorization: `Bearer ${makeToken({ orgId: ORG_A, role: 'platform_admin' })}` },
      payload: { name: 'No-Invite Org' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.invite_url).toBeNull();
  });
});

describe('Asset list + original-url happy paths (Phase 11 coverage)', () => {
  it('lists a project assets and signs an authenticated original URL for an owned asset', async () => {
    const { app, db } = await harness();
    const p = db.seedProject({ org_id: ORG_A });
    const asset = db.seedAsset({ org_id: ORG_A, project_id: p.id });

    const list = await app.inject({
      method: 'GET',
      url: `/v1/projects/${p.id}/assets?limit=10`,
      headers: { authorization: `Bearer ${memberA()}` },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().data.data.length).toBe(1);

    const url = await app.inject({
      method: 'POST',
      url: `/v1/assets/${asset.id}/original-url`,
      headers: { authorization: `Bearer ${memberA()}` },
      payload: { ttl_seconds: 120 },
    });
    expect(url.statusCode).toBe(200);
    expect(typeof url.json().data.url).toBe('string');
    expect(typeof url.json().data.expires_at).toBe('number');
  });
});

describe('Webhook byte-hash fallback when bytes are not fetchable (§3.7)', () => {
  it('does not report a false pass when it cannot re-hash the delivered bytes', async () => {
    // No fetchBytes injected → the handler takes the structural fallback branch.
    const db = makeFakeDb();
    const app = await buildApp({
      config: testConfig(),
      db,
      cloudinary: makeFakeCloudinary(),
      queue: makeFakeQueue(),
      ml: makeFakeMl(),
      renderer: makeFakeRenderer(),
      rateLimitEnabled: false,
    });
    const project = db.seedProject({ org_id: ORG_A });

    const keys = makeDeviceKeys();
    const bytes = Buffer.from('image-bytes-here');
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const exif = { Make: 'Apple' };
    const exifHash = sha256Canonical(exif);
    const payload: SigningPayloadInput = {
      v: 1,
      sha256,
      exif_hash: exifHash,
      captured_at_ms: Date.parse('2024-02-01T00:00:00.000Z'),
      device_monotonic_ms: 1,
      gps: { lat_e7: toE7(1.1), lon_e7: toE7(2.2), accuracy_m: 5 },
      project_id: project.id,
      observation_type: 'planting',
      phase: 'before',
      caption: null,
    };
    const signature = signCapture(payload, keys.privateKey);
    const body = JSON.stringify({
      event: 'upload',
      info: {
        // public_id carries the same sha256 the device committed → structural
        // match, which the handler treats as `unknown`, never a false `pass`.
        public_id: `${ORG_A}/${project.id}/${sha256}`,
        asset_id: 'cld-1',
        resource_type: 'image',
        created_at: '2024-02-01T00:00:05Z',
        context: {
          capture_signature: signature,
          device_id: 'd1',
          device_public_key: keys.publicKeyB64,
          capture_timestamp: '2024-02-01T00:00:00.000Z',
          capture_commit_hash: sha256,
          device_monotonic_ms: 1,
          gps_lat: 1.1,
          gps_lon: 2.2,
          gps_accuracy: 5,
          project_id: project.id,
          observation_type: 'planting',
          phase: 'before',
          exif_hash: exifHash,
        },
        metadata: { sha256, exif },
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/cloudinary',
      headers: {
        'content-type': 'application/json',
        'x-cld-signature': 'valid-sig',
        'x-cld-timestamp': '1700000000',
      },
      payload: body,
    });
    expect(res.statusCode).toBe(200);
    // sha256 is `unknown` (structural only), so the overall verdict is not `passed`.
    expect(res.json().data.verification).not.toBe('passed');
  });
});
