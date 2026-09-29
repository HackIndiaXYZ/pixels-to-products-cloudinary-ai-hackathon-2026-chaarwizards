/**
 * Phase 8 E2E seed (NOT production). Provisions, against the LOCAL Supabase
 * stack, exactly what the two gate flows need:
 *
 *   Flow 1 (search → asset → integrity pass): an org, a project, and a genuinely
 *   device-signed, `verified` asset tagged `planting`. The asset is signed with a
 *   real Ed25519 key over the RFC 8785 canonical payload, and its EXIF hash is a
 *   real JCS hash, so the API's independent checks pass HONESTLY — no verdict is
 *   fabricated (AGENTS.md §3.7).
 *
 *   Flow 2 (quarantine admin queue): a second, `flagged` asset in the same org.
 *
 * Plus a member user whose app_metadata carries the org_id (the custom access
 * token hook then hoists it to a top-level claim so RLS can see it).
 *
 * Writes ids + credentials to scripts/.e2e-seed.json for Playwright.
 */
import { createClient } from '@supabase/supabase-js';
import { generateKeyPairSync, sign as edSign } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildSigningPayload, sha256Canonical } from '@impact/shared';

const SUPABASE_URL = 'http://127.0.0.1:54321';
const SERVICE_KEY = process.env['E2E_SERVICE_KEY'] as string;

const svc = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function die(msg: string, err: unknown): never {
  // eslint-disable-next-line no-console
  console.error(msg, err);
  process.exit(1);
}

// --- org + project ---------------------------------------------------------
const { data: org, error: orgErr } = await svc
  .from('orgs')
  .insert({ name: 'E2E Org', type: 'ngo' })
  .select('id')
  .single();
if (orgErr) die('org insert', orgErr);
const orgId = (org as { id: string }).id;

const { data: project, error: projErr } = await svc
  .from('projects')
  .insert({
    org_id: orgId,
    name: 'E2E Project',
    sector: 'forestry',
    config: {
      observation_types: [
        { type: 'planting', model: 'forestry_v1', gps_radius: 50, label: 'Planting' },
      ],
    },
  })
  .select('id')
  .single();
if (projErr) die('project insert', projErr);
const projectId = (project as { id: string }).id;

// --- a genuinely signed, verified asset ------------------------------------
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const der = publicKey.export({ format: 'der', type: 'spki' }) as Buffer;
const rawPub = der.subarray(der.length - 32).toString('base64');

const capturedAtMs = 1705311000000; // 2024-01-15T09:30:00.000Z, whole second
const deviceMonotonicMs = 123456;
const sha256Hex = 'a'.repeat(64); // stands in for the file hash; == commit hash
const exif = { Make: 'Canon', Model: 'EOS', Orientation: 1 };
const exifHash = sha256Canonical(exif);
const latE7 = Math.round(19.1234 * 1e7);
const lonE7 = Math.round(72.8765 * 1e7);

const payload = {
  v: 1 as const,
  sha256: sha256Hex,
  exif_hash: exifHash,
  captured_at_ms: capturedAtMs,
  device_monotonic_ms: deviceMonotonicMs,
  gps: { lat_e7: latE7, lon_e7: lonE7, accuracy_m: 3.2, provider: 'fused' as const },
  project_id: projectId,
  observation_type: 'planting',
  phase: 'before' as const,
  caption: null,
};
const signature = edSign(null, Buffer.from(buildSigningPayload(payload), 'utf8'), privateKey).toString('base64');

const { data: verified, error: vErr } = await svc
  .from('assets')
  .insert({
    project_id: projectId,
    org_id: orgId,
    cloudinary_public_id: `${orgId}/${projectId}/verified`,
    asset_type: 'image',
    device_capture_timestamp: new Date(capturedAtMs).toISOString(),
    device_commit_hash: sha256Hex,
    device_id: 'e2e-device',
    device_public_key: rawPub,
    capture_signature: signature,
    device_monotonic_ms: deviceMonotonicMs,
    gps_point: `SRID=4326;POINT(72.8765 19.1234)`,
    gps_accuracy_meters: 3.2,
    gps_provider: 'fused',
    exif,
    exif_hash: exifHash,
    sha256_hash: sha256Hex,
    ai_tags: ['planting', 'tree'],
    observation_type: 'planting',
    phase: 'before',
    upload_started_at: new Date(capturedAtMs + 1000).toISOString(),
    server_received_at: new Date(capturedAtMs + 2000).toISOString(),
    signature_tier: 'device',
    verification: 'passed',
    upload_status: 'verified',
  })
  .select('id')
  .single();
if (vErr) die('verified asset insert', vErr);
const verifiedAssetId = (verified as { id: string }).id;

// --- a flagged asset for the admin queue -----------------------------------
const { error: fErr } = await svc.from('assets').insert({
  project_id: projectId,
  org_id: orgId,
  cloudinary_public_id: `${orgId}/${projectId}/flagged`,
  asset_type: 'image',
  device_capture_timestamp: new Date(capturedAtMs).toISOString(),
  device_commit_hash: 'b'.repeat(64),
  device_id: 'e2e-device',
  device_public_key: rawPub,
  capture_signature: 'unverifiable',
  exif_hash: 'c'.repeat(64),
  sha256_hash: 'd'.repeat(64), // != commit hash → content check fails
  ai_tags: ['planting'],
  observation_type: 'planting',
  phase: 'after',
  verification: 'failed',
  upload_status: 'flagged',
});
if (fErr) die('flagged asset insert', fErr);

// --- member user (app_metadata.org_id → hoisted to a top-level claim) -------
const email = 'e2e-member@example.com';
const password = 'E2ePassword!123';
// Delete any prior run's user so the seed is idempotent.
const { data: existing } = await svc.auth.admin.listUsers();
const prior = existing?.users.find((u) => u.email === email);
if (prior) await svc.auth.admin.deleteUser(prior.id);

const { error: userErr } = await svc.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  app_metadata: { org_id: orgId, role: 'member' },
});
if (userErr) die('user create', userErr);

const out = { orgId, projectId, verifiedAssetId, email, password };
const seedPath = join(dirname(fileURLToPath(import.meta.url)), '.e2e-seed.json');
writeFileSync(seedPath, JSON.stringify(out, null, 2));
// eslint-disable-next-line no-console
console.log('seeded', JSON.stringify({ orgId, projectId, verifiedAssetId, email }));
