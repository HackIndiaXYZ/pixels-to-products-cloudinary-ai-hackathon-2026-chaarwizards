-- Phase 1 gate — evidence columns are immutable via the BEFORE UPDATE trigger,
-- which fires even for the owner/superuser (bypassing RLS and column grants).

BEGIN;
SELECT plan(5);

SELECT test_helpers.reset_all();
SELECT test_helpers.make_org('Org Imm') AS org_i \gset
SELECT test_helpers.make_project(:'org_i', 'PI') AS proj_i \gset
SELECT test_helpers.make_asset(:'proj_i', :'org_i') AS asset_i \gset

SELECT format('UPDATE assets SET sha256_hash = %L WHERE id = %L', 'deadbeef', :'asset_i')
  AS mutate_sha \gset
SELECT format('UPDATE assets SET gps_accuracy_meters = 999 WHERE id = %L', :'asset_i')
  AS mutate_gps \gset
SELECT format('UPDATE assets SET cloudinary_created_at = %L WHERE id = %L', now()::text, :'asset_i')
  AS mutate_cloudinary_created \gset
SELECT format('UPDATE assets SET caption = %L WHERE id = %L', 'a new caption', :'asset_i')
  AS mutate_caption \gset
SELECT format('DELETE FROM assets WHERE id = %L', :'asset_i')
  AS delete_asset \gset

-- Runs as the table owner/superuser: the trigger must STILL raise .
SELECT throws_ok(
  :'mutate_sha',
  NULL,
  NULL,
  'UPDATE assets SET sha256_hash raises even for the superuser (immutability trigger)'
);

SELECT throws_ok(
  :'mutate_gps',
  NULL,
  NULL,
  'UPDATE of an evidence GPS column raises'
);

SELECT throws_ok(
  :'mutate_cloudinary_created',
  NULL,
  NULL,
  'UPDATE assets SET cloudinary_created_at raises (new evidence column is covered by the trigger)'
);

SELECT lives_ok(
  :'mutate_caption',
  'UPDATE of a mutable column (caption) is allowed'
);

-- §3.1 forbids DELETE of an original asset row, not just UPDATE. Runs as the
-- owner/superuser: the BEFORE DELETE trigger must still raise, since service_role
-- and the owner bypass RLS.
SELECT throws_ok(
  :'delete_asset',
  NULL,
  NULL,
  'DELETE of an original asset row raises (evidence rows cannot be deleted)'
);

SELECT * FROM finish();
ROLLBACK;
