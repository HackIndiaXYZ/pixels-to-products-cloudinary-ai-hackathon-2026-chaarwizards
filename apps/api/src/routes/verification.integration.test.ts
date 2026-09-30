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
  makeFakeRenderer,
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

/** Seed an asset in ORG_A with a three-row audit chain. */
async function seedChainedAsset(db: FakeDb, overrides: Record<string, unknown> = {}) {
  const p = db.seedProject({ org_id: ORG_A });
  const asset = db.seedAsset({ org_id: ORG_A, project_id: p.id, ...overrides });
  for (let i = 0; i < 3; i += 1) {
    await db.audit.append({
      assetId: asset.id,
      action: 'verify',
      actorType: 'system',
      actorId: 'api',
      details: { step: i },
    });
  }
  return { project: p, asset };
}

describe('GET /v1/assets/:id/verify-chain', () => {
  it('verifies an intact chain', async () => {
    const { app, db } = await harness();
    const { asset } = await seedChainedAsset(db);
    const res = await app.inject({
      method: 'GET',
      url: `/v1/assets/${asset.id}/verify-chain`,
      headers: { authorization: `Bearer ${memberA()}` },
    });
    expect(res.statusCode).toBe(200);
    const body = (res.json() as { data: { ok: boolean; checked: number } }).data;
    expect(body.ok).toBe(true);
    expect(body.checked).toBe(3);
  });

  it('FAILURE PATH: a tampered value fails verification and names that row', async () => {
    const { app, db } = await harness();
    const { asset } = await seedChainedAsset(db);
    const middle = db._audit[1];
    if (middle === undefined) throw new Error('expected 3 rows');
    middle.details_canonical = '{"step":999}'; // tamper a value, not remove a row
    const res = await app.inject({
      method: 'GET',
      url: `/v1/assets/${asset.id}/verify-chain`,
      headers: { authorization: `Bearer ${memberA()}` },
    });
    const body = (res.json() as { data: { ok: boolean; failure: { audit_id: number } } }).data;
    expect(body.ok).toBe(false);
    expect(body.failure.audit_id).toBe(middle.id);
  });

  it('FAILURE PATH: a deleted intermediate row is detected as a gap', async () => {
    const { app, db } = await harness();
    const { asset } = await seedChainedAsset(db);
    const successorId = db._audit[2]?.id;
    db._audit.splice(1, 1); // delete an intermediate row
    const res = await app.inject({
      method: 'GET',
      url: `/v1/assets/${asset.id}/verify-chain`,
      headers: { authorization: `Bearer ${memberA()}` },
    });
    const body = (res.json() as { data: { ok: boolean; failure: { audit_id: number; kind: string } } }).data;
    expect(body.ok).toBe(false);
    expect(body.failure.kind).toBe('broken_link');
    expect(body.failure.audit_id).toBe(successorId);
  });

  it('returns 404 for an asset in another org (no leak)', async () => {
    const { app, db } = await harness();
    const pb = db.seedProject({ org_id: ORG_B });
    const other = db.seedAsset({ org_id: ORG_B, project_id: pb.id });
    const res = await app.inject({
      method: 'GET',
      url: `/v1/assets/${other.id}/verify-chain`,
      headers: { authorization: `Bearer ${memberA()}` },
    });
    expect(res.statusCode).toBe(404);
  });
});

/** Seed a finalized report package + manifest for the receipt tests. */
async function seedReport(db: FakeDb) {
  const { asset } = await seedChainedAsset(db, {
    caption: 'Villagers planting mango saplings near the river',
    gps_lat: 19.12345,
    gps_lon: 72.98765,
  });
  const report = await db.reports.createPackage({
    project_id: asset.project_id,
    org_id: ORG_A,
    name: 'Evidence Report',
    asset_ids: [asset.id],
    change_event_ids: [],
    template_id: null,
    template_version: 'forestry_donor@1',
    status: 'finalized',
    audit_trail: { template_version: 'forestry_donor@1' },
  });
  await db.reports.insertManifestEntry({
    evidence_package_id: report.id,
    ordinal: 1,
    role: 'photo',
    cloudinary_public_id: `${ORG_A}/${asset.project_id}/secret_public_id`,
    derivative_public_id: `${ORG_A}/${asset.project_id}/report_full/secret`,
    sha256_hash: '9f2c1d',
    byte_size: 1024,
    verified_at: new Date().toISOString(),
  });
  return { asset, report };
}

describe('GET /v1/reports/:id/verification (public-safe receipt)', () => {
  it('returns hashes, timestamps, and chain verdicts', async () => {
    const { app, db } = await harness();
    const { report } = await seedReport(db);
    const res = await app.inject({
      method: 'GET',
      url: `/v1/reports/${report.id}/verification`,
      headers: { authorization: `Bearer ${memberA()}` },
    });
    expect(res.statusCode).toBe(200);
    const body = (res.json() as {
      data: {
        report_id: string;
        chains_verified: boolean;
        asset_chains: { chain_verified: boolean; tip_hash: string | null }[];
        manifest: { sha256_hash: string }[];
      };
    }).data;
    expect(body.report_id).toBe(report.id);
    expect(body.chains_verified).toBe(true);
    expect(body.asset_chains[0]?.chain_verified).toBe(true);
    expect(body.asset_chains[0]?.tip_hash).toBeTruthy();
    expect(body.manifest[0]?.sha256_hash).toBe('9f2c1d');
  });

  it('is PUBLIC-SAFE: leaks no org_id, user identity, GPS, caption, or public_id', async () => {
    const { app, db } = await harness();
    const { report } = await seedReport(db);
    const res = await app.inject({
      method: 'GET',
      url: `/v1/reports/${report.id}/verification`,
      headers: { authorization: `Bearer ${memberA()}` },
    });
    const raw = res.body; // assert on the serialized bytes, not a parsed shape
    expect(raw).not.toContain(ORG_A); // org_id
    expect(raw).not.toContain('secret_public_id'); // public_id (embeds org_id)
    expect(raw).not.toContain('72.98'); // GPS longitude
    expect(raw).not.toContain('19.12'); // GPS latitude
    expect(raw.toLowerCase()).not.toContain('caption');
    expect(raw).not.toContain('mango saplings'); // caption text
    expect(raw.toLowerCase()).not.toContain('user_id');
    expect(raw.toLowerCase()).not.toContain('org_id');
  });

  it('re-verifies to the SAME result on a second run (evidence, not decoration)', async () => {
    const { app, db } = await harness();
    const { report } = await seedReport(db);
    const call = () =>
      app.inject({
        method: 'GET',
        url: `/v1/reports/${report.id}/verification`,
        headers: { authorization: `Bearer ${memberA()}` },
      });
    const first = await call();
    const second = await call();
    expect(first.body).toBe(second.body);
  });

  it('reflects a tampered chain: chains_verified turns false', async () => {
    const { app, db } = await harness();
    const { report } = await seedReport(db);
    const row = db._audit[1];
    if (row === undefined) throw new Error('expected chain rows');
    row.details_canonical = '{"step":999}';
    const res = await app.inject({
      method: 'GET',
      url: `/v1/reports/${report.id}/verification`,
      headers: { authorization: `Bearer ${memberA()}` },
    });
    const body = (res.json() as { data: { chains_verified: boolean } }).data;
    expect(body.chains_verified).toBe(false);
  });

  it('returns 404 for a report in another org (no leak)', async () => {
    const { app, db } = await harness();
    const pb = db.seedProject({ org_id: ORG_B });
    const other = await db.reports.createPackage({
      project_id: pb.id,
      org_id: ORG_B,
      name: 'Other',
      asset_ids: [],
      change_event_ids: [],
      template_id: null,
      template_version: 'x@1',
      status: 'finalized',
      audit_trail: null,
    });
    const res = await app.inject({
      method: 'GET',
      url: `/v1/reports/${other.id}/verification`,
      headers: { authorization: `Bearer ${memberA()}` },
    });
    expect(res.statusCode).toBe(404);
  });
});
