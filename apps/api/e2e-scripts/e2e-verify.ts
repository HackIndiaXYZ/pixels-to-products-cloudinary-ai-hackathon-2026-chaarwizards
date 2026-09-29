/**
 * Phase 8 live self-check (NOT production). Boots the real Fastify app in-process
 * against the LOCAL Supabase stack, signs in as the seeded member (a real GoTrue
 * ES256 token), drives the dashboard's endpoints, prints the results, then shuts
 * down. One foreground process — no detached server to reap — so it runs to
 * completion in constrained execution environments.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildApp } from '../src/app.js';
import { createSupabaseDb } from '../src/plugins/supabase.js';
import type { CloudinaryPort, QueuePort } from '../src/ports.js';
import type { Config } from '../src/config.js';

const ANON = process.env['E2E_ANON_KEY'] as string;
const SERVICE = process.env['E2E_SERVICE_KEY'] as string;
const seedPath = join(dirname(fileURLToPath(import.meta.url)), '.e2e-seed.json');
const seed = JSON.parse(readFileSync(seedPath, 'utf8')) as {
  orgId: string;
  projectId: string;
  verifiedAssetId: string;
  email: string;
  password: string;
};

const config: Config = {
  NODE_ENV: 'development',
  HOST: '127.0.0.1',
  PORT: 8080,
  LOG_LEVEL: 'error',
  SUPABASE_URL: 'http://127.0.0.1:54321',
  SUPABASE_ANON_KEY: ANON,
  SUPABASE_SERVICE_KEY: SERVICE,
  SUPABASE_JWT_SECRET: 'super-secret-jwt-token-with-at-least-32-characters-long',
  CLOUDINARY_CLOUD_NAME: 'demo',
  CLOUDINARY_API_KEY: 'key',
  CLOUDINARY_API_SECRET: 'secret',
  CLOUDINARY_UPLOAD_PRESET: 'verified_capture',
  INTERNAL_JWT_SECRET: 'internal-secret-internal-secret-internal',
  REDIS_URL: 'redis://localhost:6379',
  ML_SERVICE_URL: 'http://localhost:9000',
  DASHBOARD_URL: 'http://localhost:5173',
};

const queue: QueuePort = {
  async enqueueAiEnrich() {},
  async enqueuePairAssets() {},
  async enqueueDetectChange() {},
  async ping() {},
  async close() {},
};
const cloudinary: CloudinaryPort = {
  verifyNotificationSignature: () => false,
  signedDerivativeUrl: (p, t) => `https://res.cloudinary.com/demo/image/upload/${t}/v1/${p}`,
  originalUrl: (p, ttl) => ({ url: `https://res.cloudinary.com/demo/${p}`, expiresAt: Date.now() / 1000 + ttl }),
  async createEagerDerivative() { throw new Error('unused'); },
  signRequest: () => 'stub',
};

const app = await buildApp({
  config,
  db: createSupabaseDb(config),
  cloudinary,
  queue,
  ml: { async detectChange() { throw new Error('unused'); } },
  renderer: { async htmlToPdf() { throw new Error('reports not used in E2E'); } },
  rateLimitEnabled: false,
});
await app.listen({ host: '127.0.0.1', port: 8080 });

let failures = 0;
function check(label: string, ok: boolean, detail: unknown): void {
  // eslint-disable-next-line no-console
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  ${JSON.stringify(detail)}`);
  if (!ok) failures += 1;
}

try {
  const signin = await fetch('http://127.0.0.1:54321/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: seed.email, password: seed.password }),
  });
  const tok = (await signin.json()) as { access_token?: string };
  const at = tok.access_token ?? '';
  const alg = at ? JSON.parse(Buffer.from(at.split('.')[0] as string, 'base64url').toString()).alg : 'none';
  check('login yields an ES256 token', signin.status === 200 && alg === 'ES256', { status: signin.status, alg });

  const H = { Authorization: `Bearer ${at}` };
  const base = 'http://127.0.0.1:8080';

  const pj = await (await fetch(`${base}/v1/projects`, { headers: H })).json();
  const projRows = pj.data?.data ?? [];
  check('GET /v1/projects (ES256 accepted, RLS-scoped)', Array.isArray(projRows) && projRows.length === 1, {
    names: projRows.map?.((p: { name: string }) => p.name),
  });

  const sr = await (await fetch(`${base}/v1/search?tags=planting`, { headers: H })).json();
  const rows = sr.data?.data ?? [];
  check('GET /v1/search?tags=planting returns the org rows', rows.length === 2 && sr.data.total_matched === 2, {
    rows: rows.length,
    total: sr.data?.total_matched,
    facets: sr.data?.facet_counts,
  });

  const verified = rows.find((r: { upload_status: string }) => r.upload_status === 'verified');
  const ig = (await (await fetch(`${base}/v1/assets/${verified.id}/integrity`, { headers: H })).json()).data;
  const verdictPass =
    ig?.device_signature_verified === true &&
    ig?.exif_hash_verified === true &&
    ig?.caption_signature_verified === true &&
    ig?.audit_chain_intact === true &&
    ig?.sha256_matches_commit === true;
  check('GET /v1/assets/:id/integrity → overall pass (all checks true)', verdictPass, {
    sig: ig?.device_signature_verified,
    exif: ig?.exif_hash_verified,
    caption: ig?.caption_signature_verified,
    audit: ig?.audit_chain_intact,
    sha: ig?.sha256_matches_commit,
  });

  const ce = await fetch(`${base}/v1/projects/${seed.projectId}/change-events`, { headers: H });
  check('GET /v1/projects/:id/change-events', ce.status === 200, { status: ce.status });

  const dv = await fetch(`${base}/v1/assets/${verified.id}/derivatives`, { headers: H });
  check('GET /v1/assets/:id/derivatives', dv.status === 200, { status: dv.status });

  // No token → 401.
  const noauth = await fetch(`${base}/v1/search`);
  check('unauthenticated /v1/search → 401', noauth.status === 401, { status: noauth.status });
} finally {
  await app.close();
}

// eslint-disable-next-line no-console
console.log(failures === 0 ? '\nALL LIVE CHECKS PASSED' : `\n${failures} LIVE CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
