-- Phase 1 gate — schema completeness (BUILD_ORDER Phase 1 gate item 10).
--
-- `supabase db reset` only fails when something *references* a missing object,
-- so an unreferenced table or column disappears silently (AGENTS.md §7.1). This
-- test asserts, against the live catalog, that every table and column the phase
-- task table names actually exists — including the two the earlier gate missed:
-- `asset_derivatives` and `assets.cloudinary_created_at`.

BEGIN;
SELECT plan(37);

-- ---- The 13 tables the phase must ship (BUILD_ORDER Phase 1 "Migrations") ----
SELECT has_table('orgs',                    'table orgs exists');
SELECT has_table('invite_tokens',           'table invite_tokens exists');
SELECT has_table('projects',                'table projects exists');
SELECT has_table('assets',                  'table assets exists');
SELECT has_table('asset_derivatives',       'table asset_derivatives exists');
SELECT has_table('observations',            'table observations exists');
SELECT has_table('change_events',           'table change_events exists');
SELECT has_table('evidence_packages',       'table evidence_packages exists');
SELECT has_table('report_manifest_entries', 'table report_manifest_entries exists');
SELECT has_table('report_templates',        'table report_templates exists');
SELECT has_table('audit_logs',              'table audit_logs exists');
SELECT has_table('model_registry',          'table model_registry exists');
SELECT has_table('sync_state',              'table sync_state exists');

-- ---- Derivative lineage (BUILD_ORDER Phase 1 "Derivative lineage") ----
SELECT has_column('asset_derivatives', 'parent_asset_id', 'asset_derivatives.parent_asset_id exists');
SELECT has_column('asset_derivatives', 'transformation',  'asset_derivatives.transformation exists');
SELECT has_column('asset_derivatives', 'public_id',       'asset_derivatives.public_id exists');
SELECT has_column('asset_derivatives', 'is_generative',   'asset_derivatives.is_generative exists');

-- ---- Asset integrity columns (BUILD_ORDER Phase 1 "Asset integrity columns") ----
SELECT has_column('assets', 'sha256_hash',              'assets.sha256_hash exists');
SELECT has_column('assets', 'exif_hash',                'assets.exif_hash exists');
SELECT has_column('assets', 'capture_signature',        'assets.capture_signature exists');
SELECT has_column('assets', 'device_capture_timestamp', 'assets.device_capture_timestamp exists');
SELECT has_column('assets', 'device_monotonic_ms',      'assets.device_monotonic_ms exists');
SELECT has_column('assets', 'device_public_key',        'assets.device_public_key exists');
SELECT has_column('assets', 'upload_started_at',        'assets.upload_started_at exists');
SELECT has_column('assets', 'server_received_at',       'assets.server_received_at exists');
SELECT has_column('assets', 'verification',             'assets.verification exists');
SELECT has_column('assets', 'signature_tier',           'assets.signature_tier exists');

-- ---- Cloudinary signal columns (BUILD_ORDER Phase 1 "Cloudinary signal harvest") ----
SELECT has_column('assets', 'cloudinary_created_at',     'assets.cloudinary_created_at exists (was missing)');
SELECT has_column('assets', 'phash',                     'assets.phash exists');
SELECT has_column('assets', 'dominant_colors',           'assets.dominant_colors exists');
SELECT has_column('assets', 'cloudinary_quality_score',  'assets.cloudinary_quality_score exists');
SELECT has_column('assets', 'face_count',                'assets.face_count exists');
SELECT has_column('assets', 'cloudinary_metadata_at',    'assets.cloudinary_metadata_at exists');

-- ---- PostGIS (BUILD_ORDER Phase 1 "PostGIS") ----
SELECT has_extension('postgis', 'PostGIS extension is installed');
SELECT is(
  (SELECT format_type(atttypid, atttypmod)
     FROM pg_attribute
    WHERE attrelid = 'public.assets'::regclass AND attname = 'gps_point'),
  'geography(Point,4326)',
  'assets.gps_point is geography(Point,4326)'
);

-- ---- orgs quota + retention defaults (BUILD_ORDER Phase 1 "Quota + retention") ----
SELECT test_helpers.reset_all();
SELECT test_helpers.make_org('Defaults Org') AS org_d \gset

SELECT is(
  (SELECT quota_bytes FROM orgs WHERE id = :'org_d'::uuid),
  53687091200::bigint,
  'orgs.quota_bytes defaults to 50 GB (53687091200)'
);
SELECT is(
  (SELECT retention_years FROM orgs WHERE id = :'org_d'::uuid),
  7,
  'orgs.retention_years defaults to 7'
);

SELECT * FROM finish();
ROLLBACK;
