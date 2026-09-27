-- Phase 1 gate — RLS isolation, no-permissive-insert, WITH CHECK, config schema.
-- Run by `supabase test db` (pgTAP). Wrapped in a rolled-back transaction.

BEGIN;
SELECT plan(8);

SELECT test_helpers.reset_all();

-- Fixtures (as the owner/superuser: RLS is bypassed for setup).
SELECT test_helpers.make_org('Org A') AS org_a \gset
SELECT test_helpers.make_org('Org B') AS org_b \gset
SELECT test_helpers.make_project(:'org_a', 'PA') AS proj_a \gset
SELECT test_helpers.make_project(:'org_b', 'PB') AS proj_b \gset

-- Pre-build statements that need real ids, so throws_ok/anon runs get a literal.
SELECT format('UPDATE projects SET org_id = %L WHERE id = %L', :'org_b', :'proj_a')
  AS move_sql \gset
SELECT format(
  'INSERT INTO assets (project_id, org_id, cloudinary_public_id, asset_type, '
  'device_capture_timestamp, device_commit_hash, device_id, device_public_key, '
  'capture_signature, exif_hash, sha256_hash) '
  'VALUES (%L, %L, %L, %L, now(), %L, %L, %L, %L, %L, %L)',
  :'proj_a', :'org_a', 'anon/attempt', 'image',
  'h', 'd', 'k', 's', 'eh', 'sh'
) AS anon_insert_sql \gset

-- ---- projects.config JSON schema (trigger fires for every role) ----
SELECT throws_ok(
  $$ INSERT INTO projects (org_id, name, config)
     SELECT id, 'no-model',
            '{"observation_types":[{"type":"t","gps_radius":10}]}'::jsonb
     FROM orgs LIMIT 1 $$,
  NULL,
  NULL,
  'config with an observation_type missing "model" is rejected'
);

SELECT throws_ok(
  $$ INSERT INTO projects (org_id, name, config)
     SELECT id, 'no-radius',
            '{"observation_types":[{"type":"t","model":"forestry"}]}'::jsonb
     FROM orgs LIMIT 1 $$,
  NULL,
  NULL,
  'config with an observation_type missing "gps_radius" is rejected'
);

SELECT lives_ok(
  $$ INSERT INTO projects (org_id, name, config)
     SELECT id, 'valid-cfg',
            '{"observation_types":[{"type":"t","model":"forestry","gps_radius":10,"phase_field":"p"}]}'::jsonb
     FROM orgs LIMIT 1 $$,
  'config with type + model + gps_radius is accepted'
);

-- ---- RLS as an Org A member ----
SELECT test_helpers.set_claims(:'org_a', 'member');
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT count(*)::int FROM projects WHERE id = :'proj_b'::uuid),
  0,
  'Org A member cannot SELECT an Org B project (RLS)'
);

SELECT is(
  (SELECT count(*)::int FROM projects WHERE id = :'proj_a'::uuid),
  1,
  'Org A member can SELECT its own project (sanity)'
);

-- Attempt to overwrite an Org B row: RLS USING hides it, so this touches 0 rows
-- and does not error. We confirm below (as superuser) the row is unchanged.
UPDATE projects SET name = 'hijack' WHERE id = :'proj_b'::uuid;

SELECT throws_ok(
  :'move_sql',
  NULL,
  NULL,
  'moving an own project into another org violates the UPDATE WITH CHECK'
);

RESET ROLE;

SELECT is(
  (SELECT name FROM projects WHERE id = :'proj_b'::uuid),
  'PB',
  'Org B project is unchanged by the Org A UPDATE attempt (RLS USING)'
);

-- ---- anon has no permissive INSERT policy on assets ----
SELECT test_helpers.clear_claims();
SET LOCAL ROLE anon;

SELECT throws_ok(
  :'anon_insert_sql',
  NULL,
  NULL,
  'anon cannot INSERT into assets (no permissive insert policy)'
);

RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
