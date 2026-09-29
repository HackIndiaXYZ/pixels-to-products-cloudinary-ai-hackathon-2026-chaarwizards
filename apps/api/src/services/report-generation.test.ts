import { describe, it, expect, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import {
  makeFakeDb,
  makeFakeCloudinary,
  makeFakeQueue,
  makeFakeRenderer,
  ORG_A,
  type FakeDb,
} from '../testing/fakes.js';
import { generateReport, type GenerateReportDeps } from './report-generation.js';
import type { AuthContext } from '../types.js';

const ctx: AuthContext = { userId: 'user-a', orgId: ORG_A, role: 'member', jwt: 'jwt' };

/** Deterministic per-URL bytes: a JPEG header + the URL, stable across runs. */
function fetchBytesFor(url: string): Promise<Buffer> {
  return Promise.resolve(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from(url, 'utf8')]));
}

interface Fixture {
  db: FakeDb;
  cloudinary: ReturnType<typeof makeFakeCloudinary>;
  queue: ReturnType<typeof makeFakeQueue>;
  deps: GenerateReportDeps;
  projectId: string;
  changeEventId: string;
  beforeAssetId: string;
  afterAssetId: string;
}

async function setup(opts: { afterVerified?: boolean } = {}): Promise<Fixture> {
  const db = makeFakeDb();
  const cloudinary = makeFakeCloudinary();
  const queue = makeFakeQueue();

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
    upload_status: opts.afterVerified === false ? 'flagged' : 'verified',
    phase: 'after',
  });
  // Genuine audit chain per asset so the appendix has a real tip hash to print.
  await db.audit.append({ assetId: before.id, action: 'upload', actorType: 'system', actorId: 'cloudinary', details: { a: 1 } });
  await db.audit.append({ assetId: after.id, action: 'upload', actorType: 'system', actorId: 'cloudinary', details: { a: 2 } });

  const event = db.seedChangeEvent({
    org_id: ORG_A,
    project_id: project.id,
    before_asset_id: before.id,
    after_asset_id: after.id,
    change_metrics: { saplings_planted: 49, area_covered_sqm: 1200.5 },
    model_version: 'v1-placeholder',
  });

  const deps: GenerateReportDeps = {
    db,
    cloudinary,
    renderer: makeFakeRenderer(),
    fetchBytes: fetchBytesFor,
    fontCss: '',
    queue,
    now: () => new Date('2024-06-01T00:00:00.000Z'),
  };

  return {
    db,
    cloudinary,
    queue,
    deps,
    projectId: project.id,
    changeEventId: event.id,
    beforeAssetId: before.id,
    afterAssetId: after.id,
  };
}

function lastHtml(cloudinary: ReturnType<typeof makeFakeCloudinary>): string {
  const html = cloudinary._artifacts.filter((a) => a.format === 'html');
  const latest = html[html.length - 1];
  if (latest === undefined) throw new Error('no html artifact uploaded');
  return latest.bytes.toString('utf8');
}

describe('generateReport (Phase 9 gate)', () => {
  let fx: Fixture;
  beforeEach(async () => {
    fx = await setup();
  });

  it('GATE: refuses generation when a selected asset is not verified (quarantined)', async () => {
    const q = await setup({ afterVerified: false });
    await expect(
      generateReport(q.deps, ctx, {
        projectId: q.projectId,
        templateId: 'forestry_donor',
        changeEventIds: [q.changeEventId],
        includeIntegrityAppendix: true,
      }),
    ).rejects.toMatchObject({
      statusCode: 422,
      details: { asset_id: q.afterAssetId, upload_status: 'flagged' },
    });
  });

  it('GATE: the appendix lists the same current_hash as the DB', async () => {
    await generateReport(fx.deps, ctx, {
      projectId: fx.projectId,
      templateId: 'forestry_donor',
      changeEventIds: [fx.changeEventId],
      includeIntegrityAppendix: true,
    });
    const html = lastHtml(fx.cloudinary);
    for (const assetId of [fx.beforeAssetId, fx.afterAssetId]) {
      const chain = await fx.db.audit.chainForAsset(assetId);
      const tip = chain[chain.length - 1];
      expect(tip).toBeDefined();
      expect(html).toContain(tip!.current_hash);
    }
  });

  it('GATE: regenerating from identical inputs produces a byte-identical artifact', async () => {
    const run = async (): Promise<string> => {
      await generateReport(fx.deps, ctx, {
        projectId: fx.projectId,
        templateId: 'forestry_donor',
        changeEventIds: [fx.changeEventId],
        includeIntegrityAppendix: true,
      });
      return lastHtml(fx.cloudinary);
    };
    const a = await run();
    const b = await run();
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });

  it('GATE: each manifest row sha256 matches the bytes embedded in the artifact', async () => {
    const result = await generateReport(fx.deps, ctx, {
      projectId: fx.projectId,
      templateId: 'forestry_donor',
      changeEventIds: [fx.changeEventId],
      includeIntegrityAppendix: true,
    });
    const html = lastHtml(fx.cloudinary);
    const dataUris = [...html.matchAll(/data:[^;]+;base64,([A-Za-z0-9+/=]+)/g)].map((m) => m[1] ?? '');
    const embedded = new Set(
      dataUris.map((b64) => createHash('sha256').update(Buffer.from(b64, 'base64')).digest('hex')),
    );
    // Every photo/diff/map manifest row (i.e. every inlined element) is embedded.
    for (const row of result.manifest) {
      expect(embedded.has(row.sha256_hash)).toBe(true);
    }
    expect(result.self_contained).toBe(true);
    expect(result.template_version).toBe('forestry_donor@1');
  });

  it('does NOT create a gen-AI derivative synchronously; it enqueues the async job', async () => {
    await generateReport(fx.deps, ctx, {
      projectId: fx.projectId,
      templateId: 'forestry_donor',
      changeEventIds: [fx.changeEventId],
      includeIntegrityAppendix: true,
    });
    // No generative eager call happened during the synchronous generate (§3.11).
    expect(fx.cloudinary._eagerCalls.some((c) => c.isGenerative)).toBe(false);
    // The gen-AI job was enqueued, targeting the after report copy, not blocking.
    expect(fx.queue._genAiJobs.length).toBe(1);
    expect(fx.queue._genAiJobs[0]?.edits.length).toBe(1);
    expect(fx.queue._genAiJobs[0]?.edits[0]?.parentAssetId).toBe(fx.afterAssetId);
  });

  it('rejects a change event that belongs to another project (RLS scope)', async () => {
    await expect(
      generateReport(fx.deps, ctx, {
        projectId: fx.projectId,
        templateId: 'forestry_donor',
        changeEventIds: ['00000000-0000-4000-8000-999999999999'],
        includeIntegrityAppendix: true,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
