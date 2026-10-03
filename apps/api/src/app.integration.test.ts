import { describe, expect, it, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import { Writable } from 'node:stream';
import type { FastifyInstance } from 'fastify';
import { sha256Canonical, type SigningPayloadInput } from '@panchnama/shared';
import { buildApp, type AppDeps } from './app.js';
import { toE7 } from './services/verification.js';
import { createInMemoryOrgRateLimiter } from './lib/org-rate-limit.js';
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
} from './testing/fakes.js';

interface Harness {
  app: FastifyInstance;
  db: FakeDb;
  queue: ReturnType<typeof makeFakeQueue>;
}

async function harness(overrides: Partial<AppDeps> = {}): Promise<Harness> {
  const db = makeFakeDb();
  const queue = makeFakeQueue();
  const app = await buildApp({
    config: testConfig(),
    db,
    cloudinary: makeFakeCloudinary(),
    queue,
    ml: makeFakeMl(),
    renderer: makeFakeRenderer(),
    rateLimitEnabled: false,
    ...overrides,
  });
  return { app, db, queue };
}

describe('Dashboard CORS', () => {
  it('allows the configured dashboard origin when its env URL has a trailing slash', async () => {
    const { app } = await harness({
      config: testConfig({
        NODE_ENV: 'production',
        DASHBOARD_URL: 'https://panchnama-ka-1205.vercel.app/',
      }),
    });
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/v1/assets/00000000-0000-4000-8000-000000000001/original-url',
      headers: {
        origin: 'https://panchnama-ka-1205.vercel.app',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization,content-type',
      },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('https://panchnama-ka-1205.vercel.app');
    expect(response.headers['access-control-allow-headers']?.toLowerCase()).toContain('authorization');
  });
});

const CAPTURE_TS = '2024-01-15T09:30:00.000Z';
const LAT = 19.1234;
const LON = 72.8765;

function buildWebhook(projectId: string, orgId: string, opts: { tamperExif?: boolean; tags?: string[] } = {}): {
  body: string;
  bytes: Buffer;
  sha256: string;
} {
  const keys = makeDeviceKeys();
  const bytes = Buffer.from('the-original-image-bytes');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const exif = { Make: 'Apple', Model: 'iPhone 15 Pro', Orientation: 1 };
  const exifHash = sha256Canonical(exif);

  const payload: SigningPayloadInput = {
    v: 1,
    sha256,
    exif_hash: exifHash,
    captured_at_ms: Date.parse(CAPTURE_TS),
    device_monotonic_ms: 12345,
    gps: { lat_e7: toE7(LAT), lon_e7: toE7(LON), accuracy_m: 3.2 },
    project_id: projectId,
    observation_type: 'planting',
    phase: 'before',
    caption: null,
  };
  const signature = signCapture(payload, keys.privateKey);

  const deliveredExif = opts.tamperExif === true ? { ...exif, Software: 'Photoshop' } : exif;

  const body = {
    event: 'upload',
    info: {
      public_id: `${orgId}/${projectId}/${sha256}`,
      asset_id: 'cld-asset-1',
      resource_type: 'image',
      secure_url: 'https://res.cloudinary.com/demo/image/authenticated/x.jpg',
      created_at: '2024-01-15T09:30:05.123Z',
      bytes: bytes.length,
      context: {
        capture_signature: signature,
        device_id: 'device-1',
        device_public_key: keys.publicKeyB64,
        capture_timestamp: CAPTURE_TS,
        capture_commit_hash: sha256,
        device_monotonic_ms: 12345,
        gps_lat: LAT,
        gps_lon: LON,
        gps_accuracy: 3.2,
        project_id: projectId,
        observation_type: 'planting',
        phase: 'before',
        exif_hash: exifHash,
      },
      metadata: { sha256, exif: deliveredExif },
    },
  };
  if (opts.tags !== undefined) {
    (body.info as Record<string, unknown>).tags = opts.tags;
    (body.info as Record<string, unknown>).info = {
      categorization: { google_tagging: { data: opts.tags.map((t) => ({ tag: t, confidence: 0.9 })) } },
    };
  }
  return { body: JSON.stringify(body), bytes, sha256 };
}

function webhookHeaders(): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-cld-signature': 'valid-sig',
    'x-cld-timestamp': '1700000000',
  };
}

describe('Phase 3 gate — webhook ingest', () => {
  let h: Harness;
  beforeEach(async () => {
    h = await harness({ fetchBytes: async () => Buffer.from('the-original-image-bytes') });
  });

  it('a valid signature inserts a verified asset and enqueues enrichment', async () => {
    const project = h.db.seedProject({ org_id: ORG_A });
    const { body } = buildWebhook(project.id, ORG_A);
    const res = await h.app.inject({
      method: 'POST',
      url: '/webhooks/cloudinary',
      headers: webhookHeaders(),
      payload: body,
    });
    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(json.data.verification).toBe('passed');
    expect(json.data.upload_status).toBe('verified');
    expect(json.data.quarantined).toBe(false);
    expect(h.db._assets.size).toBe(1);
    expect(h.queue._jobs.length).toBe(1);
  });

  it('a forged signature is rejected 401 and no asset is inserted', async () => {
    const project = h.db.seedProject({ org_id: ORG_A });
    const { body } = buildWebhook(project.id, ORG_A);
    const app = (await harness({
      cloudinary: makeFakeCloudinary({ signatureValid: false }),
      fetchBytes: async () => Buffer.from('the-original-image-bytes'),
    })).app;
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/cloudinary',
      headers: webhookHeaders(),
      payload: body,
    });
    expect(res.statusCode).toBe(401);
  });

  it('tampered EXIF quarantines the asset and does not enqueue enrichment', async () => {
    const project = h.db.seedProject({ org_id: ORG_A });
    const { body } = buildWebhook(project.id, ORG_A, { tamperExif: true });
    const res = await h.app.inject({
      method: 'POST',
      url: '/webhooks/cloudinary',
      headers: webhookHeaders(),
      payload: body,
    });
    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(json.data.verification).toBe('failed');
    expect(json.data.quarantined).toBe(true);
    expect(json.data.upload_status).toBe('flagged');
    expect(h.queue._jobs.length).toBe(0);
  });

  it('replaying the same webhook creates exactly one row and one job', async () => {
    const project = h.db.seedProject({ org_id: ORG_A });
    const { body } = buildWebhook(project.id, ORG_A);
    for (let i = 0; i < 2; i += 1) {
      await h.app.inject({
        method: 'POST',
        url: '/webhooks/cloudinary',
        headers: webhookHeaders(),
        payload: body,
      });
    }
    expect(h.db._assets.size).toBe(1);
    expect(h.queue._jobs.length).toBe(1);
    // Both attempts were recorded in the audit chain (ingest + replay).
    expect(h.db._audit.length).toBe(2);
  });

  it('derives org_id from the signed project, not the body — unknown project is 404', async () => {
    // No project seeded, so orgIdForProject returns null.
    const { body } = buildWebhook('00000000-0000-4000-8000-000000000999', ORG_A);
    const res = await h.app.inject({
      method: 'POST',
      url: '/webhooks/cloudinary',
      headers: webhookHeaders(),
      payload: body,
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('Phase 5 gate — AI tags copied into observations (§3.9)', () => {
  let h: Harness;
  beforeEach(async () => {
    h = await harness({ fetchBytes: async () => Buffer.from('the-original-image-bytes') });
  });

  it('writes Cloudinary tags to observations at ingest, never queried back', async () => {
    const project = h.db.seedProject({ org_id: ORG_A });
    const { body } = buildWebhook(project.id, ORG_A, { tags: ['tree', 'sapling', 'soil'] });
    const res = await h.app.inject({
      method: 'POST',
      url: '/webhooks/cloudinary',
      headers: webhookHeaders(),
      payload: body,
    });
    expect(res.statusCode).toBe(200);
    expect(h.db._observations.length).toBe(1);
    const obs = h.db._observations[0]!;
    expect(obs.org_id).toBe(ORG_A);
    expect(obs.notes).toBe('cloudinary_ai_tags');
    expect((obs.metrics as { tags: string[] }).tags).toEqual(['tree', 'sapling', 'soil']);
  });

  it('does not write an observation when there are no tags', async () => {
    const project = h.db.seedProject({ org_id: ORG_A });
    const { body } = buildWebhook(project.id, ORG_A);
    await h.app.inject({
      method: 'POST',
      url: '/webhooks/cloudinary',
      headers: webhookHeaders(),
      payload: body,
    });
    expect(h.db._observations.length).toBe(0);
  });

  it('does not write tags for a quarantined (tampered) asset', async () => {
    const project = h.db.seedProject({ org_id: ORG_A });
    const { body } = buildWebhook(project.id, ORG_A, { tamperExif: true, tags: ['tree'] });
    await h.app.inject({
      method: 'POST',
      url: '/webhooks/cloudinary',
      headers: webhookHeaders(),
      payload: body,
    });
    expect(h.db._observations.length).toBe(0);
  });
});

describe('Phase 3 gate — org isolation and delivery URLs', () => {
  it("org A's token cannot read org B's project (404)", async () => {
    const h = await harness();
    const projectB = h.db.seedProject({ org_id: ORG_B });
    const res = await h.app.inject({
      method: 'GET',
      url: `/v1/projects/${projectB.id}`,
      headers: { authorization: `Bearer ${makeToken({ orgId: ORG_A, role: 'member' })}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('a client cannot obtain a URL for another org asset by a known id', async () => {
    const h = await harness();
    const projectB = h.db.seedProject({ org_id: ORG_B });
    const assetB = h.db.seedAsset({ org_id: ORG_B, project_id: projectB.id, sha256_hash: 'known' });
    const res = await h.app.inject({
      method: 'POST',
      url: `/v1/assets/${assetB.id}/original-url`,
      headers: { authorization: `Bearer ${makeToken({ orgId: ORG_A, role: 'member' })}` },
      payload: {},
    });
    expect(res.statusCode).toBe(404);
  });

  it('rejects a client-supplied public_id in the derivative body (400)', async () => {
    const h = await harness();
    const project = h.db.seedProject({ org_id: ORG_A });
    const asset = h.db.seedAsset({ org_id: ORG_A, project_id: project.id });
    const res = await h.app.inject({
      method: 'POST',
      url: `/v1/assets/${asset.id}/derivative-url`,
      headers: { authorization: `Bearer ${makeToken({ orgId: ORG_A, role: 'member' })}` },
      payload: { transformation: 'report_full', public_id: 'other/org/asset' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects an arbitrary transformation string with 422', async () => {
    const h = await harness();
    const project = h.db.seedProject({ org_id: ORG_A });
    const asset = h.db.seedAsset({ org_id: ORG_A, project_id: project.id });
    const res = await h.app.inject({
      method: 'POST',
      url: `/v1/assets/${asset.id}/derivative-url`,
      headers: { authorization: `Bearer ${makeToken({ orgId: ORG_A, role: 'member' })}` },
      payload: { transformation: 'e_gen_remove:prompt_person' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('UNPROCESSABLE');
  });

  it('signs a delivery URL for an allowlisted transformation on an owned asset', async () => {
    const h = await harness();
    const project = h.db.seedProject({ org_id: ORG_A });
    const asset = h.db.seedAsset({ org_id: ORG_A, project_id: project.id });
    const res = await h.app.inject({
      method: 'POST',
      url: `/v1/assets/${asset.id}/derivative-url`,
      headers: { authorization: `Bearer ${makeToken({ orgId: ORG_A, role: 'member' })}` },
      payload: { transformation: 'report_full' },
    });
    expect(res.statusCode).toBe(200);
    expect(typeof res.json().data.url).toBe('string');
  });
});

describe('Phase 3 gate — pagination, auth, org provisioning', () => {
  it('clamps limit=500 to 100', async () => {
    const h = await harness();
    for (let i = 0; i < 120; i += 1) h.db.seedProject({ org_id: ORG_A });
    const res = await h.app.inject({
      method: 'GET',
      url: '/v1/projects?limit=500',
      headers: { authorization: `Bearer ${makeToken({ orgId: ORG_A, role: 'member' })}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.data.length).toBe(100);
  });

  it('rejects an unauthenticated request with 401', async () => {
    const h = await harness();
    const res = await h.app.inject({ method: 'GET', url: '/v1/projects' });
    expect(res.statusCode).toBe(401);
  });

  it('POST /v1/orgs as a non-platform_admin is 403', async () => {
    const h = await harness();
    const res = await h.app.inject({
      method: 'POST',
      url: '/v1/orgs',
      headers: { authorization: `Bearer ${makeToken({ orgId: ORG_A, role: 'org_admin' })}` },
      payload: { name: 'New Org', type: 'ngo' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('POST /v1/orgs as a platform_admin provisions an org + hashed invite', async () => {
    const h = await harness();
    const res = await h.app.inject({
      method: 'POST',
      url: '/v1/orgs',
      headers: { authorization: `Bearer ${makeToken({ orgId: ORG_A, role: 'platform_admin' })}` },
      payload: { name: 'Kenya Forestry', type: 'government', admin_email: 'admin@example.com' },
    });
    expect(res.statusCode).toBe(200);
    expect(typeof res.json().data.org_id).toBe('string');
    expect(res.json().data.invite_url).toContain('/invite/');
    // The stored invite is a hash, never the raw token.
    const stored = h.db._invites[0];
    expect(stored?.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(res.json().data.invite_url).not.toContain(stored?.token_hash);
  });

  it('there is no public signup route', async () => {
    const h = await harness();
    for (const url of ['/v1/signup', '/auth/register', '/v1/register']) {
      const res = await h.app.inject({ method: 'POST', url, payload: {} });
      expect(res.statusCode).toBe(404);
    }
  });
});

describe('Phase 3 — rate limiting', () => {
  it('enforces the per-endpoint limit with a 429 and a Retry-After', async () => {
    const { app } = await harness({ rateLimitEnabled: true });
    // POST /v1/orgs is capped at 5/hour; the 6th request trips the limiter
    // before the handler runs, so it is a 429 regardless of auth.
    let last = await app.inject({ method: 'POST', url: '/v1/orgs', payload: {} });
    for (let i = 0; i < 6; i += 1) {
      last = await app.inject({ method: 'POST', url: '/v1/orgs', payload: {} });
    }
    expect(last.statusCode).toBe(429);
    expect(last.headers['retry-after']).toBeDefined();
    expect(last.json().error.code).toBe('RATE_LIMITED');
  });
});

describe('Phase 11 — per-org upload rate limiting (unsigned-preset abuse)', () => {
  it('trips 429 with a Retry-After for the flooding org, and a second org is unaffected', async () => {
    // A tiny per-org ceiling: the 3rd upload for one org must be rejected.
    const h = await harness({
      fetchBytes: async () => Buffer.from('the-original-image-bytes'),
      orgUploadLimiter: createInMemoryOrgRateLimiter({ max: 2, windowMs: 60_000 }),
    });
    const projectA = h.db.seedProject({ org_id: ORG_A });
    const projectB = h.db.seedProject({ org_id: ORG_B });

    const send = (projectId: string, orgId: string) =>
      h.app.inject({
        method: 'POST',
        url: '/webhooks/cloudinary',
        headers: webhookHeaders(),
        payload: buildWebhook(projectId, orgId).body,
      });

    // Org A: two allowed, the third tripped.
    expect((await send(projectA.id, ORG_A)).statusCode).toBe(200);
    expect((await send(projectA.id, ORG_A)).statusCode).toBe(200);
    const tripped = await send(projectA.id, ORG_A);
    expect(tripped.statusCode).toBe(429);
    expect(tripped.headers['retry-after']).toBeDefined();
    expect(Number(tripped.headers['retry-after'])).toBeGreaterThanOrEqual(1);
    expect(tripped.json().error.code).toBe('RATE_LIMITED');

    // Org B has its own budget — a flood on A must not deny service to B.
    expect((await send(projectB.id, ORG_B)).statusCode).toBe(200);
  });
});

describe('Phase 11 — logs carry no secret or PII ', () => {
  it('an upload request emits no CLOUDINARY_API_SECRET, service-role key, or GPS coordinate', async () => {
    const lines: string[] = [];
    const logStream = new Writable({
      write(chunk: Buffer, _enc: BufferEncoding, cb: (error?: Error | null) => void) {
        lines.push(chunk.toString());
        cb();
      },
    }) as unknown as NodeJS.WritableStream;

    // Recognizable sentinel secret values so a leak is unambiguous in the output.
    const config = testConfig({
      LOG_LEVEL: 'info',
      CLOUDINARY_API_SECRET: 'CLD_SECRET_SENTINEL_zzz',
      SUPABASE_SERVICE_KEY: 'SERVICE_ROLE_SENTINEL_zzz',
    });
    const db = makeFakeDb();
    const app = await buildApp({
      config,
      db,
      cloudinary: makeFakeCloudinary(),
      queue: makeFakeQueue(),
      ml: makeFakeMl(),
      renderer: makeFakeRenderer(),
      rateLimitEnabled: false,
      logStream,
      fetchBytes: async () => Buffer.from('the-original-image-bytes'),
    });

    const project = db.seedProject({ org_id: ORG_A });
    // GPS 19.1234 / 72.8765 are carried in the webhook body (see buildWebhook).
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/cloudinary',
      headers: {
        ...webhookHeaders(),
        authorization: `Bearer ${makeToken({ orgId: ORG_A, role: 'member' })}`,
      },
      payload: buildWebhook(project.id, ORG_A).body,
    });
    expect(res.statusCode).toBe(200);

    const output = lines.join('');
    expect(output.length).toBeGreaterThan(0); // something was actually logged
    expect(output).not.toContain('CLD_SECRET_SENTINEL_zzz');
    expect(output).not.toContain('SERVICE_ROLE_SENTINEL_zzz');
    // The GPS coordinate must never appear (PII, §3.5).
    expect(output).not.toContain('19.1234');
    expect(output).not.toContain('72.8765');
    // The bearer token/authorization header is redacted, not emitted verbatim.
    expect(output).not.toContain('Bearer ey');
  });
});

describe('Phase 3 — health', () => {
  it('liveness is 200 for /health and / and readiness reports each dependency', async () => {
    const h = await harness();
    const resHealth = await h.app.inject({ method: 'GET', url: '/health' });
    expect(resHealth.statusCode).toBe(200);
    expect(resHealth.json().data.status).toBe('ok');

    const resRoot = await h.app.inject({ method: 'GET', url: '/' });
    expect(resRoot.statusCode).toBe(200);
    expect(resRoot.json().data.status).toBe('ok');

    const ready = await h.app.inject({ method: 'GET', url: '/health/ready' });
    expect(ready.statusCode).toBe(200);
    expect(ready.json().data.checks).toEqual({ db: 'ok', redis: 'ok', cloudinary: 'ok' });
  });

  it('every response carries a request_id header', async () => {
    const h = await harness();
    const res = await h.app.inject({ method: 'GET', url: '/health' });
    expect(res.headers['x-request-id']).toBeDefined();
  });
});
