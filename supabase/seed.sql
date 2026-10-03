-- Seed Demo Data for Panchnama (Cloudinary Hackathon)
-- 50 Assets, 80% Authenticity Verified Rate (40/50), 5 Quarantined, 5 Pending
BEGIN;
ALTER TABLE assets DISABLE TRIGGER assets_evidence_no_delete;
ALTER TABLE assets DISABLE TRIGGER assets_evidence_immutable;
DELETE FROM report_manifest_entries;
DELETE FROM evidence_packages;
DELETE FROM audit_logs;
DELETE FROM asset_derivatives;
DELETE FROM change_events;
DELETE FROM observations;
DELETE FROM assets;
DELETE FROM projects;
DELETE FROM invite_tokens;
DELETE FROM sync_state;
DELETE FROM orgs;

INSERT INTO orgs (id, name, type, quota_bytes, bytes_used, retention_years)
VALUES ('137cb278-8f28-46fc-b005-8494a4628b48', 'Prakriti Ecological Restoration Foundation', 'ngo', 53687091200, 24500000, 7);


UPDATE auth.users 
SET raw_app_meta_data = jsonb_build_object(
  'org_id', '137cb278-8f28-46fc-b005-8494a4628b48',
  'role', CASE WHEN email LIKE 'admin%' THEN 'platform_admin' ELSE 'org_admin' END,
  'provider', 'email',
  'providers', ARRAY['email']
)
WHERE email IN ('admin@demo.local', 'orgadmin@demo.local');


INSERT INTO projects (id, org_id, name, sector, geometry, start_date, end_date, config)
VALUES 
('cbe3725d-6b0a-4c7a-bc3d-37b8488f1dd5', '137cb278-8f28-46fc-b005-8494a4628b48', 'Yamuna River Cleanup & Wetland Restoration', 'water',
 ST_GeomFromText('POLYGON((77.3000 28.5400, 77.3300 28.5400, 77.3300 28.5700, 77.3000 28.5700, 77.3000 28.5400))', 4326),
 '2026-01-10', '2026-12-31',
 '{"observation_types": [{"type": "water_extent", "label": "Yamuna Water Cleanup & Plastic Extent", "model": "water", "gps_radius": 100}], "report_template": "default"}'::jsonb),

('d17c2c6f-22da-4e08-b66f-9885ec33343e', '137cb278-8f28-46fc-b005-8494a4628b48', 'Aravalli Green Wall & Sapling Plantation', 'forestry',
 ST_GeomFromText('POLYGON((76.9500 28.3600, 77.0100 28.3600, 77.0100 28.4000, 76.9500 28.4000, 76.9500 28.3600))', 4326),
 '2026-02-01', '2026-12-31',
 '{"observation_types": [{"type": "mangrove_planting", "label": "Aravalli Sapling Plantation & Canopy Growth", "model": "forestry", "gps_radius": 100}], "report_template": "default"}'::jsonb);

-- 50 Evidence Assets (40 verified/passed = 80%, 5 failed/quarantined, 5 pending)

INSERT INTO assets (
  id, project_id, org_id, cloudinary_public_id, cloudinary_asset_id, asset_type,
  device_capture_timestamp, device_commit_hash, device_id, device_public_key, capture_signature,
  gps_point, gps_accuracy_meters, gps_altitude, gps_provider, gps_timestamp,
  caption, caption_signature, exif, exif_hash, sha256_hash, ai_tags, observation_type, phase, app_version,
  server_upload_timestamp, server_received_at, upload_started_at, signature_tier, verification, verified_at, quarantined_at, upload_status
) VALUES (
  'fdf13671-28bc-5c76-bd90-69a732f605f4', 'd17c2c6f-22da-4e08-b66f-9885ec33343e', '137cb278-8f28-46fc-b005-8494a4628b48', 'evidence/137cb278-8f28-46fc-b005-8494a4628b48/d17c2c6f-22da-4e08-b66f-9885ec33343e/aravalli_sapling_plot_01', 'cld_asset_forest_01', 'image',
  '2026-02-01 09:30:00+00', 'f00f00f00f00f00f00f00f00f00f00f00f00f00f00f00f00f00f00f00f00f00f', 'device_field_rig_fdf13671', 'MCowBQYDK2VwAyEA48a62a9c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c', 'sig_commit_fdf13671',
  ST_SetSRID(ST_MakePoint(76.9500, 28.3600), 4326)::geography, 2.4, 250.0, 'gps', '2026-02-01 09:30:00+00',
  'Aravalli Sapling Plantation survey plot A01 (before phase)', 'sig_forest_01', '{"Make": "Apple", "Model": "iPhone 15 Pro", "DateTimeOriginal": "2026-02-01 09:30:00+00"}'::jsonb,
  'f00f00f00f00f00f00f00f00f00f00f00f00f00f00f00f00f00f00f00f00f00f', 'f00f00f00f00f00f00f00f00f00f00f00f00f00f00f00f00f00f00f00f00f00f', '["sapling", "aravalli", "plantation", "before", "healthy"]'::jsonb, 'mangrove_planting', 'before', '1.0.0',
  '2026-02-01 09:30:00+00', '2026-02-01 09:30:00+00', '2026-02-01 09:30:00+00', 'device', 'passed', '2026-02-01 09:30:00+00', NULL, 'verified'
);


INSERT INTO assets (
  id, project_id, org_id, cloudinary_public_id, cloudinary_asset_id, asset_type,
  device_capture_timestamp, device_commit_hash, device_id, device_public_key, capture_signature,
  gps_point, gps_accuracy_meters, gps_altitude, gps_provider, gps_timestamp,
  caption, caption_signature, exif, exif_hash, sha256_hash, ai_tags, observation_type, phase, app_version,
  server_upload_timestamp, server_received_at, upload_started_at, signature_tier, verification, verified_at, quarantined_at, upload_status
) VALUES (
  'd901fe32-cf82-5e07-aef8-99eaef9833ae', 'd17c2c6f-22da-4e08-b66f-9885ec33343e', '137cb278-8f28-46fc-b005-8494a4628b48', 'evidence/137cb278-8f28-46fc-b005-8494a4628b48/d17c2c6f-22da-4e08-b66f-9885ec33343e/aravalli_sapling_plot_02', 'cld_asset_forest_02', 'image',
  '2026-03-02 09:30:00+00', 'f01f01f01f01f01f01f01f01f01f01f01f01f01f01f01f01f01f01f01f01f01f', 'device_field_rig_d901fe32', 'MCowBQYDK2VwAyEA48a62a9c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c', 'sig_commit_d901fe32',
  ST_SetSRID(ST_MakePoint(76.9520, 28.3610), 4326)::geography, 2.4, 250.0, 'gps', '2026-03-02 09:30:00+00',
  'Aravalli Sapling Plantation survey plot A02 (after phase)', 'sig_forest_02', '{"Make": "Apple", "Model": "iPhone 15 Pro", "DateTimeOriginal": "2026-03-02 09:30:00+00"}'::jsonb,
  'f01f01f01f01f01f01f01f01f01f01f01f01f01f01f01f01f01f01f01f01f01f', 'f01f01f01f01f01f01f01f01f01f01f01f01f01f01f01f01f01f01f01f01f01f', '["sapling", "aravalli", "plantation", "after", "healthy"]'::jsonb, 'mangrove_planting', 'after', '1.0.0',
  '2026-03-02 09:30:00+00', '2026-03-02 09:30:00+00', '2026-03-02 09:30:00+00', 'device', 'passed', '2026-03-02 09:30:00+00', NULL, 'verified'
);


INSERT INTO assets (
  id, project_id, org_id, cloudinary_public_id, cloudinary_asset_id, asset_type,
  device_capture_timestamp, device_commit_hash, device_id, device_public_key, capture_signature,
  gps_point, gps_accuracy_meters, gps_altitude, gps_provider, gps_timestamp,
  caption, caption_signature, exif, exif_hash, sha256_hash, ai_tags, observation_type, phase, app_version,
  server_upload_timestamp, server_received_at, upload_started_at, signature_tier, verification, verified_at, quarantined_at, upload_status
) VALUES (
  'ec96cc40-16d0-52e1-96fd-ec44c36d7eda', 'd17c2c6f-22da-4e08-b66f-9885ec33343e', '137cb278-8f28-46fc-b005-8494a4628b48', 'evidence/137cb278-8f28-46fc-b005-8494a4628b48/d17c2c6f-22da-4e08-b66f-9885ec33343e/aravalli_sapling_plot_03', 'cld_asset_forest_03', 'image',
  '2026-04-03 09:30:00+00', 'f02f02f02f02f02f02f02f02f02f02f02f02f02f02f02f02f02f02f02f02f02f', 'device_field_rig_ec96cc40', 'MCowBQYDK2VwAyEA48a62a9c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c', 'sig_commit_ec96cc40',
  ST_SetSRID(ST_MakePoint(76.9540, 28.3620), 4326)::geography, 2.4, 250.0, 'gps', '2026-04-03 09:30:00+00',
  'Aravalli Sapling Plantation survey plot A03 (before phase)', 'sig_forest_03', '{"Make": "Apple", "Model": "iPhone 15 Pro", "DateTimeOriginal": "2026-04-03 09:30:00+00"}'::jsonb,
  'f02f02f02f02f02f02f02f02f02f02f02f02f02f02f02f02f02f02f02f02f02f', 'f02f02f02f02f02f02f02f02f02f02f02f02f02f02f02f02f02f02f02f02f02f', '["sapling", "aravalli", "plantation", "before", "healthy"]'::jsonb, 'mangrove_planting', 'before', '1.0.0',
  '2026-04-03 09:30:00+00', '2026-04-03 09:30:00+00', '2026-04-03 09:30:00+00', 'device', 'passed', '2026-04-03 09:30:00+00', NULL, 'verified'
);


INSERT INTO assets (
  id, project_id, org_id, cloudinary_public_id, cloudinary_asset_id, asset_type,
  device_capture_timestamp, device_commit_hash, device_id, device_public_key, capture_signature,
  gps_point, gps_accuracy_meters, gps_altitude, gps_provider, gps_timestamp,
  caption, caption_signature, exif, exif_hash, sha256_hash, ai_tags, observation_type, phase, app_version,
  server_upload_timestamp, server_received_at, upload_started_at, signature_tier, verification, verified_at, quarantined_at, upload_status
) VALUES (
  '991760ad-1968-55fe-8793-4ce70ad56ed5', 'd17c2c6f-22da-4e08-b66f-9885ec33343e', '137cb278-8f28-46fc-b005-8494a4628b48', 'evidence/137cb278-8f28-46fc-b005-8494a4628b48/d17c2c6f-22da-4e08-b66f-9885ec33343e/aravalli_sapling_plot_04', 'cld_asset_forest_04', 'image',
  '2026-05-04 09:30:00+00', 'f03f03f03f03f03f03f03f03f03f03f03f03f03f03f03f03f03f03f03f03f03f', 'device_field_rig_991760ad', 'MCowBQYDK2VwAyEA48a62a9c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c', 'sig_commit_991760ad',
  ST_SetSRID(ST_MakePoint(76.9560, 28.3630), 4326)::geography, 2.4, 250.0, 'gps', '2026-05-04 09:30:00+00',
  'Aravalli Sapling Plantation survey plot A04 (after phase)', 'sig_forest_04', '{"Make": "Apple", "Model": "iPhone 15 Pro", "DateTimeOriginal": "2026-05-04 09:30:00+00"}'::jsonb,
  'f03f03f03f03f03f03f03f03f03f03f03f03f03f03f03f03f03f03f03f03f03f', 'f03f03f03f03f03f03f03f03f03f03f03f03f03f03f03f03f03f03f03f03f03f', '["sapling", "aravalli", "plantation", "after", "healthy"]'::jsonb, 'mangrove_planting', 'after', '1.0.0',
  '2026-05-04 09:30:00+00', '2026-05-04 09:30:00+00', '2026-05-04 09:30:00+00', 'device', 'passed', '2026-05-04 09:30:00+00', NULL, 'verified'
);


INSERT INTO assets (
  id, project_id, org_id, cloudinary_public_id, cloudinary_asset_id, asset_type,
  device_capture_timestamp, device_commit_hash, device_id, device_public_key, capture_signature,
  gps_point, gps_accuracy_meters, gps_altitude, gps_provider, gps_timestamp,
  caption, caption_signature, exif, exif_hash, sha256_hash, ai_tags, observation_type, phase, app_version,
  server_upload_timestamp, server_received_at, upload_started_at, signature_tier, verification, verified_at, quarantined_at, upload_status
) VALUES (
  '88ef46dd-ad45-5ddb-8c95-768de0daa6b0', 'd17c2c6f-22da-4e08-b66f-9885ec33343e', '137cb278-8f28-46fc-b005-8494a4628b48', 'evidence/137cb278-8f28-46fc-b005-8494a4628b48/d17c2c6f-22da-4e08-b66f-9885ec33343e/aravalli_sapling_plot_05', 'cld_asset_forest_05', 'image',
  '2026-06-05 09:30:00+00', 'f04f04f04f04f04f04f04f04f04f04f04f04f04f04f04f04f04f04f04f04f04f', 'device_field_rig_88ef46dd', 'MCowBQYDK2VwAyEA48a62a9c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c', 'sig_commit_88ef46dd',
  ST_SetSRID(ST_MakePoint(76.9580, 28.3640), 4326)::geography, 2.4, 250.0, 'gps', '2026-06-05 09:30:00+00',
  'Aravalli Sapling Plantation survey plot A05 (before phase)', 'sig_forest_05', '{"Make": "Apple", "Model": "iPhone 15 Pro", "DateTimeOriginal": "2026-06-05 09:30:00+00"}'::jsonb,
  'f04f04f04f04f04f04f04f04f04f04f04f04f04f04f04f04f04f04f04f04f04f', 'f04f04f04f04f04f04f04f04f04f04f04f04f04f04f04f04f04f04f04f04f04f', '["sapling", "aravalli", "plantation", "before", "healthy"]'::jsonb, 'mangrove_planting', 'before', '1.0.0',
  '2026-06-05 09:30:00+00', '2026-06-05 09:30:00+00', '2026-06-05 09:30:00+00', 'device', 'passed', '2026-06-05 09:30:00+00', NULL, 'verified'
);


INSERT INTO assets (
  id, project_id, org_id, cloudinary_public_id, cloudinary_asset_id, asset_type,
  device_capture_timestamp, device_commit_hash, device_id, device_public_key, capture_signature,
  gps_point, gps_accuracy_meters, gps_altitude, gps_provider, gps_timestamp,
  caption, caption_signature, exif, exif_hash, sha256_hash, ai_tags, observation_type, phase, app_version,
  server_upload_timestamp, server_received_at, upload_started_at, signature_tier, verification, verified_at, quarantined_at, upload_status
) VALUES (
  '6bbb9b81-b6d6-53ab-8298-d7f4adbe8975', 'd17c2c6f-22da-4e08-b66f-9885ec33343e', '137cb278-8f28-46fc-b005-8494a4628b48', 'evidence/137cb278-8f28-46fc-b005-8494a4628b48/d17c2c6f-22da-4e08-b66f-9885ec33343e/aravalli_sapling_plot_06', 'cld_asset_forest_06', 'image',
  '2026-07-06 09:30:00+00', 'f05f05f05f05f05f05f05f05f05f05f05f05f05f05f05f05f05f05f05f05f05f', 'device_field_rig_6bbb9b81', 'MCowBQYDK2VwAyEA48a62a9c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c', 'sig_commit_6bbb9b81',
  ST_SetSRID(ST_MakePoint(76.9600, 28.3650), 4326)::geography, 2.4, 250.0, 'gps', '2026-07-06 09:30:00+00',
  'Aravalli Sapling Plantation survey plot A06 (after phase)', 'sig_forest_06', '{"Make": "Apple", "Model": "iPhone 15 Pro", "DateTimeOriginal": "2026-07-06 09:30:00+00"}'::jsonb,
  'f05f05f05f05f05f05f05f05f05f05f05f05f05f05f05f05f05f05f05f05f05f', 'f05f05f05f05f05f05f05f05f05f05f05f05f05f05f05f05f05f05f05f05f05f', '["sapling", "aravalli", "plantation", "after", "healthy"]'::jsonb, 'mangrove_planting', 'after', '1.0.0',
  '2026-07-06 09:30:00+00', '2026-07-06 09:30:00+00', '2026-07-06 09:30:00+00', 'device', 'passed', '2026-07-06 09:30:00+00', NULL, 'verified'
);


INSERT INTO assets (
  id, project_id, org_id, cloudinary_public_id, cloudinary_asset_id, asset_type,
  device_capture_timestamp, device_commit_hash, device_id, device_public_key, capture_signature,
  gps_point, gps_accuracy_meters, gps_altitude, gps_provider, gps_timestamp,
  caption, caption_signature, exif, exif_hash, sha256_hash, ai_tags, observation_type, phase, app_version,
  server_upload_timestamp, server_received_at, upload_started_at, signature_tier, verification, verified_at, quarantined_at, upload_status
) VALUES (
  'cf57041b-54d6-508e-9fbe-5c4392fe60b5', 'd17c2c6f-22da-4e08-b66f-9885ec33343e', '137cb278-8f28-46fc-b005-8494a4628b48', 'evidence/137cb278-8f28-46fc-b005-8494a4628b48/d17c2c6f-22da-4e08-b66f-9885ec33343e/aravalli_sapling_plot_07', 'cld_asset_forest_07', 'image',
  '2026-08-07 09:30:00+00', 'f06f06f06f06f06f06f06f06f06f06f06f06f06f06f06f06f06f06f06f06f06f', 'device_field_rig_cf57041b', 'MCowBQYDK2VwAyEA48a62a9c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c', 'sig_commit_cf57041b',
  ST_SetSRID(ST_MakePoint(76.9620, 28.3660), 4326)::geography, 2.4, 250.0, 'gps', '2026-08-07 09:30:00+00',
  'Aravalli Sapling Plantation survey plot A07 (before phase)', 'sig_forest_07', '{"Make": "Apple", "Model": "iPhone 15 Pro", "DateTimeOriginal": "2026-08-07 09:30:00+00"}'::jsonb,
  'f06f06f06f06f06f06f06f06f06f06f06f06f06f06f06f06f06f06f06f06f06f', 'f06f06f06f06f06f06f06f06f06f06f06f06f06f06f06f06f06f06f06f06f06f', '["sapling", "aravalli", "plantation", "before", "healthy"]'::jsonb, 'mangrove_planting', 'before', '1.0.0',
  '2026-08-07 09:30:00+00', '2026-08-07 09:30:00+00', '2026-08-07 09:30:00+00', 'device', 'passed', '2026-08-07 09:30:00+00', NULL, 'verified'
);


INSERT INTO assets (
  id, project_id, org_id, cloudinary_public_id, cloudinary_asset_id, asset_type,
  device_capture_timestamp, device_commit_hash, device_id, device_public_key, capture_signature,
  gps_point, gps_accuracy_meters, gps_altitude, gps_provider, gps_timestamp,
  caption, caption_signature, exif, exif_hash, sha256_hash, ai_tags, observation_type, phase, app_version,
  server_upload_timestamp, server_received_at, upload_started_at, signature_tier, verification, verified_at, quarantined_at, upload_status
) VALUES (
  'c5062bcf-9c1e-5070-bb39-3f41d9cac746', 'd17c2c6f-22da-4e08-b66f-9885ec33343e', '137cb278-8f28-46fc-b005-8494a4628b48', 'evidence/137cb278-8f28-46fc-b005-8494a4628b48/d17c2c6f-22da-4e08-b66f-9885ec33343e/aravalli_sapling_plot_08', 'cld_asset_forest_08', 'image',
  '2026-02-08 09:30:00+00', 'f07f07f07f07f07f07f07f07f07f07f07f07f07f07f07f07f07f07f07f07f07f', 'device_field_rig_c5062bcf', 'MCowBQYDK2VwAyEA48a62a9c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c', 'sig_commit_c5062bcf',
  ST_SetSRID(ST_MakePoint(76.9640, 28.3670), 4326)::geography, 2.4, 250.0, 'gps', '2026-02-08 09:30:00+00',
  'Aravalli Sapling Plantation survey plot A08 (after phase)', 'sig_forest_08', '{"Make": "Apple", "Model": "iPhone 15 Pro", "DateTimeOriginal": "2026-02-08 09:30:00+00"}'::jsonb,
  'f07f07f07f07f07f07f07f07f07f07f07f07f07f07f07f07f07f07f07f07f07f', 'f07f07f07f07f07f07f07f07f07f07f07f07f07f07f07f07f07f07f07f07f07f', '["sapling", "aravalli", "plantation", "after", "healthy"]'::jsonb, 'mangrove_planting', 'after', '1.0.0',
  '2026-02-08 09:30:00+00', '2026-02-08 09:30:00+00', '2026-02-08 09:30:00+00', 'device', 'passed', '2026-02-08 09:30:00+00', NULL, 'verified'
);


INSERT INTO assets (
  id, project_id, org_id, cloudinary_public_id, cloudinary_asset_id, asset_type,
  device_capture_timestamp, device_commit_hash, device_id, device_public_key, capture_signature,
  gps_point, gps_accuracy_meters, gps_altitude, gps_provider, gps_timestamp,
  caption, caption_signature, exif, exif_hash, sha256_hash, ai_tags, observation_type, phase, app_version,
  server_upload_timestamp, server_received_at, upload_started_at, signature_tier, verification, verified_at, quarantined_at, upload_status
) VALUES (
  'fe2ad8a2-4cec-579e-adec-6911538a9886', 'd17c2c6f-22da-4e08-b66f-9885ec33343e', '137cb278-8f28-46fc-b005-8494a4628b48', 'evidence/137cb278-8f28-46fc-b005-8494a4628b48/d17c2c6f-22da-4e08-b66f-9885ec33343e/aravalli_sapling_plot_09', 'cld_asset_forest_09', 'image',
  '2026-03-09 09:30:00+00', 'f08f08f08f08f08f08f08f08f08f08f08f08f08f08f08f08f08f08f08f08f08f', 'device_field_rig_fe2ad8a2', 'MCowBQYDK2VwAyEA48a62a9c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c', 'sig_commit_fe2ad8a2',
  ST_SetSRID(ST_MakePoint(76.9660, 28.3680), 4326)::geography, 2.4, 250.0, 'gps', '2026-03-09 09:30:00+00',
  'Aravalli Sapling Plantation survey plot A09 (before phase)', 'sig_forest_09', '{"Make": "Apple", "Model": "iPhone 15 Pro", "DateTimeOriginal": "2026-03-09 09:30:00+00"}'::jsonb,
  'f08f08f08f08f08f08f08f08f08f08f08f08f08f08f08f08f08f08f08f08f08f', 'f08f08f08f08f08f08f08f08f08f08f08f08f08f08f08f08f08f08f08f08f08f', '["sapling", "aravalli", "plantation", "before", "healthy"]'::jsonb, 'mangrove_planting', 'before', '1.0.0',
  '2026-03-09 09:30:00+00', '2026-03-09 09:30:00+00', '2026-03-09 09:30:00+00', 'device', 'passed', '2026-03-09 09:30:00+00', NULL, 'verified'
);


INSERT INTO assets (
  id, project_id, org_id, cloudinary_public_id, cloudinary_asset_id, asset_type,
  device_capture_timestamp, device_commit_hash, device_id, device_public_key, capture_signature,
  gps_point, gps_accuracy_meters, gps_altitude, gps_provider, gps_timestamp,
  caption, caption_signature, exif, exif_hash, sha256_hash, ai_tags, observation_type, phase, app_version,
  server_upload_timestamp, server_received_at, upload_started_at, signature_tier, verification, verified_at, quarantined_at, upload_status
) VALUES (
  '878cdc5b-f44a-5a22-a9b2-cedc862577e8', 'd17c2c6f-22da-4e08-b66f-9885ec33343e', '137cb278-8f28-46fc-b005-8494a4628b48', 'evidence/137cb278-8f28-46fc-b005-8494a4628b48/d17c2c6f-22da-4e08-b66f-9885ec33343e/aravalli_sapling_plot_10', 'cld_asset_forest_10', 'image',
  '2026-04-10 09:30:00+00', 'f09f09f09f09f09f09f09f09f09f09f09f09f09f09f09f09f09f09f09f09f09f', 'device_field_rig_878cdc5b', 'MCowBQYDK2VwAyEA48a62a9c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c', 'sig_commit_878cdc5b',
  ST_SetSRID(ST_MakePoint(76.9680, 28.3690), 4326)::geography, 2.4, 250.0, 'gps', '2026-04-10 09:30:00+00',
  'Aravalli Sapling Plantation survey plot A10 (after phase)', 'sig_forest_10', '{"Make": "Apple", "Model": "iPhone 15 Pro", "DateTimeOriginal": "2026-04-10 09:30:00+00"}'::jsonb,
  'f09f09f09f09f09f09f09f09f09f09f09f09f09f09f09f09f09f09f09f09f09f', 'f09f09f09f09f09f09f09f09f09f09f09f09f09f09f09f09f09f09f09f09f09f', '["sapling", "aravalli", "plantation", "after", "healthy"]'::jsonb, 'mangrove_planting', 'after', '1.0.0',
  '2026-04-10 09:30:00+00', '2026-04-10 09:30:00+00', '2026-04-10 09:30:00+00', 'device', 'passed', '2026-04-10 09:30:00+00', NULL, 'verified'
);


INSERT INTO assets (
  id, project_id, org_id, cloudinary_public_id, cloudinary_asset_id, asset_type,
  device_capture_timestamp, device_commit_hash, device_id, device_public_key, capture_signature,
  gps_point, gps_accuracy_meters, gps_altitude, gps_provider, gps_timestamp,
  caption, caption_signature, exif, exif_hash, sha256_hash, ai_tags, observation_type, phase, app_version,
  server_upload_timestamp, server_received_at, upload_started_at, signature_tier, verification, verified_at, quarantined_at, upload_status
) VALUES (
  'ca66706f-6037-5eb6-9df6-b227fbbc5621', 'd17c2c6f-22da-4e08-b66f-9885ec33343e', '137cb278-8f28-46fc-b005-8494a4628b48', 'evidence/137cb278-8f28-46fc-b005-8494a4628b48/d17c2c6f-22da-4e08-b66f-9885ec33343e/aravalli_sapling_plot_11', 'cld_asset_forest_11', 'image',
  '2026-05-11 09:30:00+00', 'f0af0af0af0af0af0af0af0af0af0af0af0af0af0af0af0af0af0af0af0af0af', 'device_field_rig_ca66706f', 'MCowBQYDK2VwAyEA48a62a9c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c', 'sig_commit_ca66706f',
  ST_SetSRID(ST_MakePoint(76.9700, 28.3700), 4326)::geography, 2.4, 250.0, 'gps', '2026-05-11 09:30:00+00',
  'Aravalli Sapling Plantation survey plot A11 (before phase)', 'sig_forest_11', '{"Make": "Apple", "Model": "iPhone 15 Pro", "DateTimeOriginal": "2026-05-11 09:30:00+00"}'::jsonb,
  'f0af0af0af0af0af0af0af0af0af0af0af0af0af0af0af0af0af0af0af0af0af', 'f0af0af0af0af0af0af0af0af0af0af0af0af0af0af0af0af0af0af0af0af0af', '["sapling", "aravalli", "plantation", "before", "healthy"]'::jsonb, 'mangrove_planting', 'before', '1.0.0',
  '2026-05-11 09:30:00+00', '2026-05-11 09:30:00+00', '2026-05-11 09:30:00+00', 'device', 'passed', '2026-05-11 09:30:00+00', NULL, 'verified'
);


INSERT INTO assets (
  id, project_id, org_id, cloudinary_public_id, cloudinary_asset_id, asset_type,
  device_capture_timestamp, device_commit_hash, device_id, device_public_key, capture_signature,
  gps_point, gps_accuracy_meters, gps_altitude, gps_provider, gps_timestamp,
  caption, caption_signature, exif, exif_hash, sha256_hash, ai_tags, observation_type, phase, app_version,
  server_upload_timestamp, server_received_at, upload_started_at, signature_tier, verification, verified_at, quarantined_at, upload_status
) VALUES (
  'df122718-195a-58f2-b363-bd53537e0d5d', 'd17c2c6f-22da-4e08-b66f-9885ec33343e', '137cb278-8f28-46fc-b005-8494a4628b48', 'evidence/137cb278-8f28-46fc-b005-8494a4628b48/d17c2c6f-22da-4e08-b66f-9885ec33343e/aravalli_sapling_plot_12', 'cld_asset_forest_12', 'image',
  '2026-06-12 09:30:00+00', 'f0bf0bf0bf0bf0bf0bf0bf0bf0bf0bf0bf0bf0bf0bf0bf0bf0bf0bf0bf0bf0bf', 'device_field_rig_df122718', 'MCowBQYDK2VwAyEA48a62a9c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c', 'sig_commit_df122718',
  ST_SetSRID(ST_MakePoint(76.9720, 28.3710), 4326)::geography, 2.4, 250.0, 'gps', '2026-06-12 09:30:00+00',
  'Aravalli Sapling Plantation survey plot A12 (after phase)', 'sig_forest_12', '{"Make": "Apple", "Model": "iPhone 15 Pro", "DateTimeOriginal": "2026-06-12 09:30:00+00"}'::jsonb,
  'f0bf0bf0bf0bf0bf0bf0bf0bf0bf0bf0bf0bf0bf0bf0bf0bf0bf0bf0bf0bf0bf', 'f0bf0bf0bf0bf0bf0bf0bf0bf0bf0bf0bf0bf0bf0bf0bf0bf0bf0bf0bf0bf0bf', '["sapling", "aravalli", "plantation", "after", "healthy"]'::jsonb, 'mangrove_planting', 'after', '1.0.0',
  '2026-06-12 09:30:00+00', '2026-06-12 09:30:00+00', '2026-06-12 09:30:00+00', 'device', 'passed', '2026-06-12 09:30:00+00', NULL, 'verified'
);


INSERT INTO assets (
  id, project_id, org_id, cloudinary_public_id, cloudinary_asset_id, asset_type,
  device_capture_timestamp, device_commit_hash, device_id, device_public_key, capture_signature,
  gps_point, gps_accuracy_meters, gps_altitude, gps_provider, gps_timestamp,
  caption, caption_signature, exif, exif_hash, sha256_hash, ai_tags, observation_type, phase, app_version,
  server_upload_timestamp, server_received_at, upload_started_at, signature_tier, verification, verified_at, quarantined_at, upload_status
) VALUES (
  'b99e5d28-dbec-5397-98e6-f8410e106783', 'd17c2c6f-22da-4e08-b66f-9885ec33343e', '137cb278-8f28-46fc-b005-8494a4628b48', 'evidence/137cb278-8f28-46fc-b005-8494a4628b48/d17c2c6f-22da-4e08-b66f-9885ec33343e/aravalli_sapling_plot_13', 'cld_asset_forest_13', 'image',
  '2026-07-13 09:30:00+00', 'f0cf0cf0cf0cf0cf0cf0cf0cf0cf0cf0cf0cf0cf0cf0cf0cf0cf0cf0cf0cf0cf', 'device_field_rig_b99e5d28', 'MCowBQYDK2VwAyEA48a62a9c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c', 'sig_commit_b99e5d28',
  ST_SetSRID(ST_MakePoint(76.9740, 28.3720), 4326)::geography, 2.4, 250.0, 'gps', '2026-07-13 09:30:00+00',
  'Aravalli Sapling Plantation survey plot A13 (before phase)', 'sig_forest_13', '{"Make": "Apple", "Model": "iPhone 15 Pro", "DateTimeOriginal": "2026-07-13 09:30:00+00"}'::jsonb,
  'f0cf0cf0cf0cf0cf0cf0cf0cf0cf0cf0cf0cf0cf0cf0cf0cf0cf0cf0cf0cf0cf', 'f0cf0cf0cf0cf0cf0cf0cf0cf0cf0cf0cf0cf0cf0cf0cf0cf0cf0cf0cf0cf0cf', '["sapling", "aravalli", "plantation", "before", "healthy"]'::jsonb, 'mangrove_planting', 'before', '1.0.0',
  '2026-07-13 09:30:00+00', '2026-07-13 09:30:00+00', '2026-07-13 09:30:00+00', 'device', 'passed', '2026-07-13 09:30:00+00', NULL, 'verified'
);


INSERT INTO assets (
  id, project_id, org_id, cloudinary_public_id, cloudinary_asset_id, asset_type,
  device_capture_timestamp, device_commit_hash, device_id, device_public_key, capture_signature,
  gps_point, gps_accuracy_meters, gps_altitude, gps_provider, gps_timestamp,
  caption, caption_signature, exif, exif_hash, sha256_hash, ai_tags, observation_type, phase, app_version,
  server_upload_timestamp, server_received_at, upload_started_at, signature_tier, verification, verified_at, quarantined_at, upload_status
) VALUES (
  '1729ee71-39c9-501e-a282-c2cc00d01f5c', 'd17c2c6f-22da-4e08-b66f-9885ec33343e', '137cb278-8f28-46fc-b005-8494a4628b48', 'evidence/137cb278-8f28-46fc-b005-8494a4628b48/d17c2c6f-22da-4e08-b66f-9885ec33343e/aravalli_sapling_plot_14', 'cld_asset_forest_14', 'image',
  '2026-08-14 09:30:00+00', 'f0df0df0df0df0df0df0df0df0df0df0df0df0df0df0df0df0df0df0df0df0df', 'device_field_rig_1729ee71', 'MCowBQYDK2VwAyEA48a62a9c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c', 'sig_commit_1729ee71',
  ST_SetSRID(ST_MakePoint(76.9760, 28.3730), 4326)::geography, 2.4, 250.0, 'gps', '2026-08-14 09:30:00+00',
  'Aravalli Sapling Plantation survey plot A14 (after phase)', 'sig_forest_14', '{"Make": "Apple", "Model": "iPhone 15 Pro", "DateTimeOriginal": "2026-08-14 09:30:00+00"}'::jsonb,
  'f0df0df0df0df0df0df0df0df0df0df0df0df0df0df0df0df0df0df0df0df0df', 'f0df0df0df0df0df0df0df0df0df0df0df0df0df0df0df0df0df0df0df0df0df', '["sapling", "aravalli", "plantation", "after", "healthy"]'::jsonb, 'mangrove_planting', 'after', '1.0.0',
  '2026-08-14 09:30:00+00', '2026-08-14 09:30:00+00', '2026-08-14 09:30:00+00', 'device', 'passed', '2026-08-14 09:30:00+00', NULL, 'verified'
);


INSERT INTO assets (
  id, project_id, org_id, cloudinary_public_id, cloudinary_asset_id, asset_type,
  device_capture_timestamp, device_commit_hash, device_id, device_public_key, capture_signature,
  gps_point, gps_accuracy_meters, gps_altitude, gps_provider, gps_timestamp,
  caption, caption_signature, exif, exif_hash, sha256_hash, ai_tags, observation_type, phase, app_version,
  server_upload_timestamp, server_received_at, upload_started_at, signature_tier, verification, verified_at, quarantined_at, upload_status
) VALUES (
  '4d0adc17-ae11-5a47-b984-1cbd1273dea6', 'd17c2c6f-22da-4e08-b66f-9885ec33343e', '137cb278-8f28-46fc-b005-8494a4628b48', 'evidence/137cb278-8f28-46fc-b005-8494a4628b48/d17c2c6f-22da-4e08-b66f-9885ec33343e/aravalli_sapling_plot_15', 'cld_asset_forest_15', 'image',
  '2026-02-15 09:30:00+00', 'f0ef0ef0ef0ef0ef0ef0ef0ef0ef0ef0ef0ef0ef0ef0ef0ef0ef0ef0ef0ef0ef', 'device_field_rig_4d0adc17', 'MCowBQYDK2VwAyEA48a62a9c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c', 'sig_commit_4d0adc17',
  ST_SetSRID(ST_MakePoint(76.9780, 28.3740), 4326)::geography, 2.4, 250.0, 'gps', '2026-02-15 09:30:00+00',
  'Aravalli Sapling Plantation survey plot A15 (before phase)', 'sig_forest_15', '{"Make": "Apple", "Model": "iPhone 15 Pro", "DateTimeOriginal": "2026-02-15 09:30:00+00"}'::jsonb,
  'f0ef0ef0ef0ef0ef0ef0ef0ef0ef0ef0ef0ef0ef0ef0ef0ef0ef0ef0ef0ef0ef', 'f0ef0ef0ef0ef0ef0ef0ef0ef0ef0ef0ef0ef0ef0ef0ef0ef0ef0ef0ef0ef0ef', '["sapling", "aravalli", "plantation", "before", "healthy"]'::jsonb, 'mangrove_planting', 'before', '1.0.0',
  '2026-02-15 09:30:00+00', '2026-02-15 09:30:00+00', '2026-02-15 09:30:00+00', 'device', 'passed', '2026-02-15 09:30:00+00', NULL, 'verified'
);


INSERT INTO assets (
  id, project_id, org_id, cloudinary_public_id, cloudinary_asset_id, asset_type,
  device_capture_timestamp, device_commit_hash, device_id, device_public_key, capture_signature,
  gps_point, gps_accuracy_meters, gps_altitude, gps_provider, gps_timestamp,
  caption, caption_signature, exif, exif_hash, sha256_hash, ai_tags, observation_type, phase, app_version,
  server_upload_timestamp, server_received_at, upload_started_at, signature_tier, verification, verified_at, quarantined_at, upload_status
) VALUES (
  '85852cb8-2318-5993-a9eb-31e25bcad958', 'd17c2c6f-22da-4e08-b66f-9885ec33343e', '137cb278-8f28-46fc-b005-8494a4628b48', 'evidence/137cb278-8f28-46fc-b005-8494a4628b48/d17c2c6f-22da-4e08-b66f-9885ec33343e/aravalli_sapling_plot_16', 'cld_asset_forest_16', 'image',
  '2026-03-16 09:30:00+00', 'f0ff0ff0ff0ff0ff0ff0ff0ff0ff0ff0ff0ff0ff0ff0ff0ff0ff0ff0ff0ff0ff', 'device_field_rig_85852cb8', 'MCowBQYDK2VwAyEA48a62a9c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c', 'sig_commit_85852cb8',
  ST_SetSRID(ST_MakePoint(76.9800, 28.3750), 4326)::geography, 2.4, 250.0, 'gps', '2026-03-16 09:30:00+00',
  'Aravalli Sapling Plantation survey plot A16 (after phase)', 'sig_forest_16', '{"Make": "Apple", "Model": "iPhone 15 Pro", "DateTimeOriginal": "2026-03-16 09:30:00+00"}'::jsonb,
  'f0ff0ff0ff0ff0ff0ff0ff0ff0ff0ff0ff0ff0ff0ff0ff0ff0ff0ff0ff0ff0ff', 'f0ff0ff0ff0ff0ff0ff0ff0ff0ff0ff0ff0ff0ff0ff0ff0ff0ff0ff0ff0ff0ff', '["sapling", "aravalli", "plantation", "after", "healthy"]'::jsonb, 'mangrove_planting', 'after', '1.0.0',
  '2026-03-16 09:30:00+00', '2026-03-16 09:30:00+00', '2026-03-16 09:30:00+00', 'device', 'passed', '2026-03-16 09:30:00+00', NULL, 'verified'
);


INSERT INTO assets (
  id, project_id, org_id, cloudinary_public_id, cloudinary_asset_id, asset_type,
  device_capture_timestamp, device_commit_hash, device_id, device_public_key, capture_signature,
  gps_point, gps_accuracy_meters, gps_altitude, gps_provider, gps_timestamp,
  caption, caption_signature, exif, exif_hash, sha256_hash, ai_tags, observation_type, phase, app_version,
  server_upload_timestamp, server_received_at, upload_started_at, signature_tier, verification, verified_at, quarantined_at, upload_status
) VALUES (
  '9f11d06c-89d2-5b42-8bb9-14174d4a36b1', 'd17c2c6f-22da-4e08-b66f-9885ec33343e', '137cb278-8f28-46fc-b005-8494a4628b48', 'evidence/137cb278-8f28-46fc-b005-8494a4628b48/d17c2c6f-22da-4e08-b66f-9885ec33343e/aravalli_sapling_plot_17', 'cld_asset_forest_17', 'image',
  '2026-04-17 09:30:00+00', 'f10f10f10f10f10f10f10f10f10f10f10f10f10f10f10f10f10f10f10f10f10f', 'device_field_rig_9f11d06c', 'MCowBQYDK2VwAyEA48a62a9c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c', 'sig_commit_9f11d06c',
  ST_SetSRID(ST_MakePoint(76.9820, 28.3760), 4326)::geography, 2.4, 250.0, 'gps', '2026-04-17 09:30:00+00',
  'Aravalli Sapling Plantation survey plot A17 (before phase)', 'sig_forest_17', '{"Make": "Apple", "Model": "iPhone 15 Pro", "DateTimeOriginal": "2026-04-17 09:30:00+00"}'::jsonb,
  'f10f10f10f10f10f10f10f10f10f10f10f10f10f10f10f10f10f10f10f10f10f', 'f10f10f10f10f10f10f10f10f10f10f10f10f10f10f10f10f10f10f10f10f10f', '["sapling", "aravalli", "plantation", "before", "healthy"]'::jsonb, 'mangrove_planting', 'before', '1.0.0',
  '2026-04-17 09:30:00+00', '2026-04-17 09:30:00+00', '2026-04-17 09:30:00+00', 'device', 'passed', '2026-04-17 09:30:00+00', NULL, 'verified'
);


INSERT INTO assets (
  id, project_id, org_id, cloudinary_public_id, cloudinary_asset_id, asset_type,
  device_capture_timestamp, device_commit_hash, device_id, device_public_key, capture_signature,
  gps_point, gps_accuracy_meters, gps_altitude, gps_provider, gps_timestamp,
  caption, caption_signature, exif, exif_hash, sha256_hash, ai_tags, observation_type, phase, app_version,
  server_upload_timestamp, server_received_at, upload_started_at, signature_tier, verification, verified_at, quarantined_at, upload_status
) VALUES (
  '951c97c3-b062-5543-945e-ee26785b4eeb', 'd17c2c6f-22da-4e08-b66f-9885ec33343e', '137cb278-8f28-46fc-b005-8494a4628b48', 'evidence/137cb278-8f28-46fc-b005-8494a4628b48/d17c2c6f-22da-4e08-b66f-9885ec33343e/aravalli_sapling_plot_18', 'cld_asset_forest_18', 'image',
  '2026-05-18 09:30:00+00', 'f11f11f11f11f11f11f11f11f11f11f11f11f11f11f11f11f11f11f11f11f11f', 'device_field_rig_951c97c3', 'MCowBQYDK2VwAyEA48a62a9c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c', 'sig_commit_951c97c3',
  ST_SetSRID(ST_MakePoint(76.9840, 28.3770), 4326)::geography, 2.4, 250.0, 'gps', '2026-05-18 09:30:00+00',
  'Aravalli Sapling Plantation survey plot A18 (after phase)', 'sig_forest_18', '{"Make": "Apple", "Model": "iPhone 15 Pro", "DateTimeOriginal": "2026-05-18 09:30:00+00"}'::jsonb,
  'f11f11f11f11f11f11f11f11f11f11f11f11f11f11f11f11f11f11f11f11f11f', 'f11f11f11f11f11f11f11f11f11f11f11f11f11f11f11f11f11f11f11f11f11f', '["sapling", "aravalli", "plantation", "after", "healthy"]'::jsonb, 'mangrove_planting', 'after', '1.0.0',
  '2026-05-18 09:30:00+00', '2026-05-18 09:30:00+00', '2026-05-18 09:30:00+00', 'device', 'passed', '2026-05-18 09:30:00+00', NULL, 'verified'
);


INSERT INTO assets (
  id, project_id, org_id, cloudinary_public_id, cloudinary_asset_id, asset_type,
  device_capture_timestamp, device_commit_hash, device_id, device_public_key, capture_signature,
  gps_point, gps_accuracy_meters, gps_altitude, gps_provider, gps_timestamp,
  caption, caption_signature, exif, exif_hash, sha256_hash, ai_tags, observation_type, phase, app_version,
  server_upload_timestamp, server_received_at, upload_started_at, signature_tier, verification, verified_at, quarantined_at, upload_status
) VALUES (
  '34e424b2-11da-5339-94eb-8a6e65533174', 'd17c2c6f-22da-4e08-b66f-9885ec33343e', '137cb278-8f28-46fc-b005-8494a4628b48', 'evidence/137cb278-8f28-46fc-b005-8494a4628b48/d17c2c6f-22da-4e08-b66f-9885ec33343e/aravalli_sapling_plot_19', 'cld_asset_forest_19', 'image',
  '2026-06-19 09:30:00+00', 'f12f12f12f12f12f12f12f12f12f12f12f12f12f12f12f12f12f12f12f12f12f', 'device_field_rig_34e424b2', 'MCowBQYDK2VwAyEA48a62a9c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c', 'sig_commit_34e424b2',
  ST_SetSRID(ST_MakePoint(76.9860, 28.3780), 4326)::geography, 2.4, 250.0, 'gps', '2026-06-19 09:30:00+00',
  'Aravalli Sapling Plantation survey plot A19 (before phase)', 'sig_forest_19', '{"Make": "Apple", "Model": "iPhone 15 Pro", "DateTimeOriginal": "2026-06-19 09:30:00+00"}'::jsonb,
  'f12f12f12f12f12f12f12f12f12f12f12f12f12f12f12f12f12f12f12f12f12f', 'f12f12f12f12f12f12f12f12f12f12f12f12f12f12f12f12f12f12f12f12f12f', '["sapling", "aravalli", "plantation", "before", "healthy"]'::jsonb, 'mangrove_planting', 'before', '1.0.0',
  '2026-06-19 09:30:00+00', '2026-06-19 09:30:00+00', '2026-06-19 09:30:00+00', 'device', 'passed', '2026-06-19 09:30:00+00', NULL, 'verified'
);


INSERT INTO assets (
  id, project_id, org_id, cloudinary_public_id, cloudinary_asset_id, asset_type,
  device_capture_timestamp, device_commit_hash, device_id, device_public_key, capture_signature,
  gps_point, gps_accuracy_meters, gps_altitude, gps_provider, gps_timestamp,
  caption, caption_signature, exif, exif_hash, sha256_hash, ai_tags, observation_type, phase, app_version,
  server_upload_timestamp, server_received_at, upload_started_at, signature_tier, verification, verified_at, quarantined_at, upload_status
) VALUES (
  'f6d0596a-26dd-5c9e-8360-573117df2677', 'd17c2c6f-22da-4e08-b66f-9885ec33343e', '137cb278-8f28-46fc-b005-8494a4628b48', 'evidence/137cb278-8f28-46fc-b005-8494a4628b48/d17c2c6f-22da-4e08-b66f-9885ec33343e/aravalli_sapling_plot_20', 'cld_asset_forest_20', 'image',
  '2026-07-20 09:30:00+00', 'f13f13f13f13f13f13f13f13f13f13f13f13f13f13f13f13f13f13f13f13f13f', 'device_field_rig_f6d0596a', 'MCowBQYDK2VwAyEA48a62a9c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c', 'sig_commit_f6d0596a',
  ST_SetSRID(ST_MakePoint(76.9880, 28.3790), 4326)::geography, 2.4, 250.0, 'gps', '2026-07-20 09:30:00+00',
  'Aravalli Sapling Plantation survey plot A20 (after phase)', 'sig_forest_20', '{"Make": "Apple", "Model": "iPhone 15 Pro", "DateTimeOriginal": "2026-07-20 09:30:00+00"}'::jsonb,
  'f13f13f13f13f13f13f13f13f13f13f13f13f13f13f13f13f13f13f13f13f13f', 'f13f13f13f13f13f13f13f13f13f13f13f13f13f13f13f13f13f13f13f13f13f', '["sapling", "aravalli", "plantation", "after", "healthy"]'::jsonb, 'mangrove_planting', 'after', '1.0.0',
  '2026-07-20 09:30:00+00', '2026-07-20 09:30:00+00', '2026-07-20 09:30:00+00', 'device', 'passed', '2026-07-20 09:30:00+00', NULL, 'verified'
);


INSERT INTO assets (
  id, project_id, org_id, cloudinary_public_id, cloudinary_asset_id, asset_type,
  device_capture_timestamp, device_commit_hash, device_id, device_public_key, capture_signature,
  gps_point, gps_accuracy_meters, gps_altitude, gps_provider, gps_timestamp,
  caption, caption_signature, exif, exif_hash, sha256_hash, ai_tags, observation_type, phase, app_version,
  server_upload_timestamp, server_received_at, upload_started_at, signature_tier, verification, verified_at, quarantined_at, upload_status
) VALUES (
  '17f087c2-4c3f-549f-bb1c-edb40ddaee51', 'd17c2c6f-22da-4e08-b66f-9885ec33343e', '137cb278-8f28-46fc-b005-8494a4628b48', 'evidence/137cb278-8f28-46fc-b005-8494a4628b48/d17c2c6f-22da-4e08-b66f-9885ec33343e/aravalli_sapling_plot_21', 'cld_asset_forest_21', 'image',
  '2026-08-21 09:30:00+00', 'tampered_f_21tampered_f_21tampered_f_21', 'device_field_rig_17f087c2', 'MCowBQYDK2VwAyEA48a62a9c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c', 'sig_commit_17f087c2',
  ST_SetSRID(ST_MakePoint(76.9900, 28.3800), 4326)::geography, 2.4, 250.0, 'gps', '2026-08-21 09:30:00+00',
  'Aravalli Sapling Plantation survey plot A21 (before phase)', NULL, '{"Make": "Apple", "Model": "iPhone 15 Pro", "DateTimeOriginal": "2026-08-21 09:30:00+00"}'::jsonb,
  'f14f14f14f14f14f14f14f14f14f14f14f14f14f14f14f14f14f14f14f14f14f', 'f14f14f14f14f14f14f14f14f14f14f14f14f14f14f14f14f14f14f14f14f14f', '["sapling", "aravalli", "plantation", "before", "healthy"]'::jsonb, 'mangrove_planting', 'before', '1.0.0',
  '2026-08-21 09:30:00+00', '2026-08-21 09:30:00+00', '2026-08-21 09:30:00+00', 'device', 'failed', NULL, '2026-03-01 10:00:00+00', 'flagged'
);


INSERT INTO assets (
  id, project_id, org_id, cloudinary_public_id, cloudinary_asset_id, asset_type,
  device_capture_timestamp, device_commit_hash, device_id, device_public_key, capture_signature,
  gps_point, gps_accuracy_meters, gps_altitude, gps_provider, gps_timestamp,
  caption, caption_signature, exif, exif_hash, sha256_hash, ai_tags, observation_type, phase, app_version,
  server_upload_timestamp, server_received_at, upload_started_at, signature_tier, verification, verified_at, quarantined_at, upload_status
) VALUES (
  '2583e3ef-bd6a-5556-8047-10805ec11ba9', 'd17c2c6f-22da-4e08-b66f-9885ec33343e', '137cb278-8f28-46fc-b005-8494a4628b48', 'evidence/137cb278-8f28-46fc-b005-8494a4628b48/d17c2c6f-22da-4e08-b66f-9885ec33343e/aravalli_sapling_plot_22', 'cld_asset_forest_22', 'image',
  '2026-02-22 09:30:00+00', 'tampered_f_22tampered_f_22tampered_f_22', 'device_field_rig_2583e3ef', 'MCowBQYDK2VwAyEA48a62a9c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c', 'sig_commit_2583e3ef',
  ST_SetSRID(ST_MakePoint(76.9920, 28.3810), 4326)::geography, 2.4, 250.0, 'gps', '2026-02-22 09:30:00+00',
  'Aravalli Sapling Plantation survey plot A22 (after phase)', NULL, '{"Make": "Apple", "Model": "iPhone 15 Pro", "DateTimeOriginal": "2026-02-22 09:30:00+00"}'::jsonb,
  'f15f15f15f15f15f15f15f15f15f15f15f15f15f15f15f15f15f15f15f15f15f', 'f15f15f15f15f15f15f15f15f15f15f15f15f15f15f15f15f15f15f15f15f15f', '["sapling", "aravalli", "plantation", "after", "healthy"]'::jsonb, 'mangrove_planting', 'after', '1.0.0',
  '2026-02-22 09:30:00+00', '2026-02-22 09:30:00+00', '2026-02-22 09:30:00+00', 'device', 'failed', NULL, '2026-03-01 10:00:00+00', 'flagged'
);


INSERT INTO assets (
  id, project_id, org_id, cloudinary_public_id, cloudinary_asset_id, asset_type,
  device_capture_timestamp, device_commit_hash, device_id, device_public_key, capture_signature,
  gps_point, gps_accuracy_meters, gps_altitude, gps_provider, gps_timestamp,
  caption, caption_signature, exif, exif_hash, sha256_hash, ai_tags, observation_type, phase, app_version,
  server_upload_timestamp, server_received_at, upload_started_at, signature_tier, verification, verified_at, quarantined_at, upload_status
) VALUES (
  '74cd8847-ed3a-5b84-bb3d-2babe918bf92', 'd17c2c6f-22da-4e08-b66f-9885ec33343e', '137cb278-8f28-46fc-b005-8494a4628b48', 'evidence/137cb278-8f28-46fc-b005-8494a4628b48/d17c2c6f-22da-4e08-b66f-9885ec33343e/aravalli_sapling_plot_23', 'cld_asset_forest_23', 'image',
  '2026-03-23 09:30:00+00', 'f16f16f16f16f16f16f16f16f16f16f16f16f16f16f16f16f16f16f16f16f16f', 'device_field_rig_74cd8847', 'MCowBQYDK2VwAyEA48a62a9c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c', 'sig_commit_74cd8847',
  ST_SetSRID(ST_MakePoint(76.9940, 28.3820), 4326)::geography, 2.4, 250.0, 'gps', '2026-03-23 09:30:00+00',
  'Aravalli Sapling Plantation survey plot A23 (before phase)', 'sig_forest_23', '{"Make": "Apple", "Model": "iPhone 15 Pro", "DateTimeOriginal": "2026-03-23 09:30:00+00"}'::jsonb,
  'f16f16f16f16f16f16f16f16f16f16f16f16f16f16f16f16f16f16f16f16f16f', 'f16f16f16f16f16f16f16f16f16f16f16f16f16f16f16f16f16f16f16f16f16f', '["sapling", "aravalli", "plantation", "before", "healthy"]'::jsonb, 'mangrove_planting', 'before', '1.0.0',
  '2026-03-23 09:30:00+00', '2026-03-23 09:30:00+00', '2026-03-23 09:30:00+00', 'device', 'pending', NULL, NULL, 'pending'
);


INSERT INTO assets (
  id, project_id, org_id, cloudinary_public_id, cloudinary_asset_id, asset_type,
  device_capture_timestamp, device_commit_hash, device_id, device_public_key, capture_signature,
  gps_point, gps_accuracy_meters, gps_altitude, gps_provider, gps_timestamp,
  caption, caption_signature, exif, exif_hash, sha256_hash, ai_tags, observation_type, phase, app_version,
  server_upload_timestamp, server_received_at, upload_started_at, signature_tier, verification, verified_at, quarantined_at, upload_status
) VALUES (
  '30abbf4f-db97-5fd6-8bb7-bd7eb3a3f065', 'd17c2c6f-22da-4e08-b66f-9885ec33343e', '137cb278-8f28-46fc-b005-8494a4628b48', 'evidence/137cb278-8f28-46fc-b005-8494a4628b48/d17c2c6f-22da-4e08-b66f-9885ec33343e/aravalli_sapling_plot_24', 'cld_asset_forest_24', 'image',
  '2026-04-24 09:30:00+00', 'f17f17f17f17f17f17f17f17f17f17f17f17f17f17f17f17f17f17f17f17f17f', 'device_field_rig_30abbf4f', 'MCowBQYDK2VwAyEA48a62a9c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c', 'sig_commit_30abbf4f',
  ST_SetSRID(ST_MakePoint(76.9960, 28.3830), 4326)::geography, 2.4, 250.0, 'gps', '2026-04-24 09:30:00+00',
  'Aravalli Sapling Plantation survey plot A24 (after phase)', 'sig_forest_24', '{"Make": "Apple", "Model": "iPhone 15 Pro", "DateTimeOriginal": "2026-04-24 09:30:00+00"}'::jsonb,
  'f17f17f17f17f17f17f17f17f17f17f17f17f17f17f17f17f17f17f17f17f17f', 'f17f17f17f17f17f17f17f17f17f17f17f17f17f17f17f17f17f17f17f17f17f', '["sapling", "aravalli", "plantation", "after", "healthy"]'::jsonb, 'mangrove_planting', 'after', '1.0.0',
  '2026-04-24 09:30:00+00', '2026-04-24 09:30:00+00', '2026-04-24 09:30:00+00', 'device', 'pending', NULL, NULL, 'pending'
);


INSERT INTO assets (
  id, project_id, org_id, cloudinary_public_id, cloudinary_asset_id, asset_type,
  device_capture_timestamp, device_commit_hash, device_id, device_public_key, capture_signature,
  gps_point, gps_accuracy_meters, gps_altitude, gps_provider, gps_timestamp,
  caption, caption_signature, exif, exif_hash, sha256_hash, ai_tags, observation_type, phase, app_version,
  server_upload_timestamp, server_received_at, upload_started_at, signature_tier, verification, verified_at, quarantined_at, upload_status
) VALUES (
  'c032f066-3a0c-5bfc-a468-be690bc3c7a0', 'd17c2c6f-22da-4e08-b66f-9885ec33343e', '137cb278-8f28-46fc-b005-8494a4628b48', 'evidence/137cb278-8f28-46fc-b005-8494a4628b48/d17c2c6f-22da-4e08-b66f-9885ec33343e/aravalli_sapling_plot_25', 'cld_asset_forest_25', 'image',
  '2026-05-25 09:30:00+00', 'f18f18f18f18f18f18f18f18f18f18f18f18f18f18f18f18f18f18f18f18f18f', 'device_field_rig_c032f066', 'MCowBQYDK2VwAyEA48a62a9c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c', 'sig_commit_c032f066',
  ST_SetSRID(ST_MakePoint(76.9980, 28.3840), 4326)::geography, 2.4, 250.0, 'gps', '2026-05-25 09:30:00+00',
  'Aravalli Sapling Plantation survey plot A25 (before phase)', 'sig_forest_25', '{"Make": "Apple", "Model": "iPhone 15 Pro", "DateTimeOriginal": "2026-05-25 09:30:00+00"}'::jsonb,
  'f18f18f18f18f18f18f18f18f18f18f18f18f18f18f18f18f18f18f18f18f18f', 'f18f18f18f18f18f18f18f18f18f18f18f18f18f18f18f18f18f18f18f18f18f', '["sapling", "aravalli", "plantation", "before", "healthy"]'::jsonb, 'mangrove_planting', 'before', '1.0.0',
  '2026-05-25 09:30:00+00', '2026-05-25 09:30:00+00', '2026-05-25 09:30:00+00', 'device', 'pending', NULL, NULL, 'pending'
);


INSERT INTO assets (
  id, project_id, org_id, cloudinary_public_id, cloudinary_asset_id, asset_type,
  device_capture_timestamp, device_commit_hash, device_id, device_public_key, capture_signature,
  gps_point, gps_accuracy_meters, gps_altitude, gps_provider, gps_timestamp,
  caption, caption_signature, exif, exif_hash, sha256_hash, ai_tags, observation_type, phase, app_version,
  server_upload_timestamp, server_received_at, upload_started_at, signature_tier, verification, verified_at, quarantined_at, upload_status
) VALUES (
  '414786df-9aca-5b8d-8ec4-a89e5885f3ad', 'cbe3725d-6b0a-4c7a-bc3d-37b8488f1dd5', '137cb278-8f28-46fc-b005-8494a4628b48', 'evidence/137cb278-8f28-46fc-b005-8494a4628b48/cbe3725d-6b0a-4c7a-bc3d-37b8488f1dd5/yamuna_water_section_01', 'cld_asset_water_01', 'image',
  '2026-03-01 11:15:00+00', 'w00w00w00w00w00w00w00w00w00w00w00w00w00w00w00w00w00w00w00w00w00w', 'device_field_rig_414786df', 'MCowBQYDK2VwAyEA48a62a9c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c', 'sig_commit_414786df',
  ST_SetSRID(ST_MakePoint(77.3000, 28.5400), 4326)::geography, 2.4, 250.0, 'gps', '2026-03-01 11:15:00+00',
  'Yamuna River Cleanup survey section W01 (before phase)', 'sig_water_01', '{"Make": "Apple", "Model": "iPhone 15 Pro", "DateTimeOriginal": "2026-03-01 11:15:00+00"}'::jsonb,
  'w00w00w00w00w00w00w00w00w00w00w00w00w00w00w00w00w00w00w00w00w00w', 'w00w00w00w00w00w00w00w00w00w00w00w00w00w00w00w00w00w00w00w00w00w', '["water_cleanup", "yamuna", "wetland", "before", "restored"]'::jsonb, 'water_extent', 'before', '1.0.0',
  '2026-03-01 11:15:00+00', '2026-03-01 11:15:00+00', '2026-03-01 11:15:00+00', 'device', 'passed', '2026-03-01 11:15:00+00', NULL, 'verified'
);


INSERT INTO assets (
  id, project_id, org_id, cloudinary_public_id, cloudinary_asset_id, asset_type,
  device_capture_timestamp, device_commit_hash, device_id, device_public_key, capture_signature,
  gps_point, gps_accuracy_meters, gps_altitude, gps_provider, gps_timestamp,
  caption, caption_signature, exif, exif_hash, sha256_hash, ai_tags, observation_type, phase, app_version,
  server_upload_timestamp, server_received_at, upload_started_at, signature_tier, verification, verified_at, quarantined_at, upload_status
) VALUES (
  'dd0d390a-7e4c-5c67-8505-f9a491d79f65', 'cbe3725d-6b0a-4c7a-bc3d-37b8488f1dd5', '137cb278-8f28-46fc-b005-8494a4628b48', 'evidence/137cb278-8f28-46fc-b005-8494a4628b48/cbe3725d-6b0a-4c7a-bc3d-37b8488f1dd5/yamuna_water_section_02', 'cld_asset_water_02', 'image',
  '2026-04-02 11:15:00+00', 'w01w01w01w01w01w01w01w01w01w01w01w01w01w01w01w01w01w01w01w01w01w', 'device_field_rig_dd0d390a', 'MCowBQYDK2VwAyEA48a62a9c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c', 'sig_commit_dd0d390a',
  ST_SetSRID(ST_MakePoint(77.3010, 28.5410), 4326)::geography, 2.4, 250.0, 'gps', '2026-04-02 11:15:00+00',
  'Yamuna River Cleanup survey section W02 (after phase)', 'sig_water_02', '{"Make": "Apple", "Model": "iPhone 15 Pro", "DateTimeOriginal": "2026-04-02 11:15:00+00"}'::jsonb,
  'w01w01w01w01w01w01w01w01w01w01w01w01w01w01w01w01w01w01w01w01w01w', 'w01w01w01w01w01w01w01w01w01w01w01w01w01w01w01w01w01w01w01w01w01w', '["water_cleanup", "yamuna", "wetland", "after", "restored"]'::jsonb, 'water_extent', 'after', '1.0.0',
  '2026-04-02 11:15:00+00', '2026-04-02 11:15:00+00', '2026-04-02 11:15:00+00', 'device', 'passed', '2026-04-02 11:15:00+00', NULL, 'verified'
);


INSERT INTO assets (
  id, project_id, org_id, cloudinary_public_id, cloudinary_asset_id, asset_type,
  device_capture_timestamp, device_commit_hash, device_id, device_public_key, capture_signature,
  gps_point, gps_accuracy_meters, gps_altitude, gps_provider, gps_timestamp,
  caption, caption_signature, exif, exif_hash, sha256_hash, ai_tags, observation_type, phase, app_version,
  server_upload_timestamp, server_received_at, upload_started_at, signature_tier, verification, verified_at, quarantined_at, upload_status
) VALUES (
  '603709a2-f75e-5ddf-a032-5c36c5628a7a', 'cbe3725d-6b0a-4c7a-bc3d-37b8488f1dd5', '137cb278-8f28-46fc-b005-8494a4628b48', 'evidence/137cb278-8f28-46fc-b005-8494a4628b48/cbe3725d-6b0a-4c7a-bc3d-37b8488f1dd5/yamuna_water_section_03', 'cld_asset_water_03', 'image',
  '2026-05-03 11:15:00+00', 'w02w02w02w02w02w02w02w02w02w02w02w02w02w02w02w02w02w02w02w02w02w', 'device_field_rig_603709a2', 'MCowBQYDK2VwAyEA48a62a9c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c', 'sig_commit_603709a2',
  ST_SetSRID(ST_MakePoint(77.3020, 28.5420), 4326)::geography, 2.4, 250.0, 'gps', '2026-05-03 11:15:00+00',
  'Yamuna River Cleanup survey section W03 (before phase)', 'sig_water_03', '{"Make": "Apple", "Model": "iPhone 15 Pro", "DateTimeOriginal": "2026-05-03 11:15:00+00"}'::jsonb,
  'w02w02w02w02w02w02w02w02w02w02w02w02w02w02w02w02w02w02w02w02w02w', 'w02w02w02w02w02w02w02w02w02w02w02w02w02w02w02w02w02w02w02w02w02w', '["water_cleanup", "yamuna", "wetland", "before", "restored"]'::jsonb, 'water_extent', 'before', '1.0.0',
  '2026-05-03 11:15:00+00', '2026-05-03 11:15:00+00', '2026-05-03 11:15:00+00', 'device', 'passed', '2026-05-03 11:15:00+00', NULL, 'verified'
);


INSERT INTO assets (
  id, project_id, org_id, cloudinary_public_id, cloudinary_asset_id, asset_type,
  device_capture_timestamp, device_commit_hash, device_id, device_public_key, capture_signature,
  gps_point, gps_accuracy_meters, gps_altitude, gps_provider, gps_timestamp,
  caption, caption_signature, exif, exif_hash, sha256_hash, ai_tags, observation_type, phase, app_version,
  server_upload_timestamp, server_received_at, upload_started_at, signature_tier, verification, verified_at, quarantined_at, upload_status
) VALUES (
  '5b15e479-ed93-5a51-bef0-c85175a6abc8', 'cbe3725d-6b0a-4c7a-bc3d-37b8488f1dd5', '137cb278-8f28-46fc-b005-8494a4628b48', 'evidence/137cb278-8f28-46fc-b005-8494a4628b48/cbe3725d-6b0a-4c7a-bc3d-37b8488f1dd5/yamuna_water_section_04', 'cld_asset_water_04', 'image',
  '2026-06-04 11:15:00+00', 'w03w03w03w03w03w03w03w03w03w03w03w03w03w03w03w03w03w03w03w03w03w', 'device_field_rig_5b15e479', 'MCowBQYDK2VwAyEA48a62a9c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c', 'sig_commit_5b15e479',
  ST_SetSRID(ST_MakePoint(77.3030, 28.5430), 4326)::geography, 2.4, 250.0, 'gps', '2026-06-04 11:15:00+00',
  'Yamuna River Cleanup survey section W04 (after phase)', 'sig_water_04', '{"Make": "Apple", "Model": "iPhone 15 Pro", "DateTimeOriginal": "2026-06-04 11:15:00+00"}'::jsonb,
  'w03w03w03w03w03w03w03w03w03w03w03w03w03w03w03w03w03w03w03w03w03w', 'w03w03w03w03w03w03w03w03w03w03w03w03w03w03w03w03w03w03w03w03w03w', '["water_cleanup", "yamuna", "wetland", "after", "restored"]'::jsonb, 'water_extent', 'after', '1.0.0',
  '2026-06-04 11:15:00+00', '2026-06-04 11:15:00+00', '2026-06-04 11:15:00+00', 'device', 'passed', '2026-06-04 11:15:00+00', NULL, 'verified'
);


INSERT INTO assets (
  id, project_id, org_id, cloudinary_public_id, cloudinary_asset_id, asset_type,
  device_capture_timestamp, device_commit_hash, device_id, device_public_key, capture_signature,
  gps_point, gps_accuracy_meters, gps_altitude, gps_provider, gps_timestamp,
  caption, caption_signature, exif, exif_hash, sha256_hash, ai_tags, observation_type, phase, app_version,
  server_upload_timestamp, server_received_at, upload_started_at, signature_tier, verification, verified_at, quarantined_at, upload_status
) VALUES (
  'e69c436a-4cd7-54da-8462-1de00830c9e2', 'cbe3725d-6b0a-4c7a-bc3d-37b8488f1dd5', '137cb278-8f28-46fc-b005-8494a4628b48', 'evidence/137cb278-8f28-46fc-b005-8494a4628b48/cbe3725d-6b0a-4c7a-bc3d-37b8488f1dd5/yamuna_water_section_05', 'cld_asset_water_05', 'image',
  '2026-07-05 11:15:00+00', 'w04w04w04w04w04w04w04w04w04w04w04w04w04w04w04w04w04w04w04w04w04w', 'device_field_rig_e69c436a', 'MCowBQYDK2VwAyEA48a62a9c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c', 'sig_commit_e69c436a',
  ST_SetSRID(ST_MakePoint(77.3040, 28.5440), 4326)::geography, 2.4, 250.0, 'gps', '2026-07-05 11:15:00+00',
  'Yamuna River Cleanup survey section W05 (before phase)', 'sig_water_05', '{"Make": "Apple", "Model": "iPhone 15 Pro", "DateTimeOriginal": "2026-07-05 11:15:00+00"}'::jsonb,
  'w04w04w04w04w04w04w04w04w04w04w04w04w04w04w04w04w04w04w04w04w04w', 'w04w04w04w04w04w04w04w04w04w04w04w04w04w04w04w04w04w04w04w04w04w', '["water_cleanup", "yamuna", "wetland", "before", "restored"]'::jsonb, 'water_extent', 'before', '1.0.0',
  '2026-07-05 11:15:00+00', '2026-07-05 11:15:00+00', '2026-07-05 11:15:00+00', 'device', 'passed', '2026-07-05 11:15:00+00', NULL, 'verified'
);


INSERT INTO assets (
  id, project_id, org_id, cloudinary_public_id, cloudinary_asset_id, asset_type,
  device_capture_timestamp, device_commit_hash, device_id, device_public_key, capture_signature,
  gps_point, gps_accuracy_meters, gps_altitude, gps_provider, gps_timestamp,
  caption, caption_signature, exif, exif_hash, sha256_hash, ai_tags, observation_type, phase, app_version,
  server_upload_timestamp, server_received_at, upload_started_at, signature_tier, verification, verified_at, quarantined_at, upload_status
) VALUES (
  '97dcbe57-1f40-5a9e-aa66-028b9fb8d6a5', 'cbe3725d-6b0a-4c7a-bc3d-37b8488f1dd5', '137cb278-8f28-46fc-b005-8494a4628b48', 'evidence/137cb278-8f28-46fc-b005-8494a4628b48/cbe3725d-6b0a-4c7a-bc3d-37b8488f1dd5/yamuna_water_section_06', 'cld_asset_water_06', 'image',
  '2026-08-06 11:15:00+00', 'w05w05w05w05w05w05w05w05w05w05w05w05w05w05w05w05w05w05w05w05w05w', 'device_field_rig_97dcbe57', 'MCowBQYDK2VwAyEA48a62a9c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c', 'sig_commit_97dcbe57',
  ST_SetSRID(ST_MakePoint(77.3050, 28.5450), 4326)::geography, 2.4, 250.0, 'gps', '2026-08-06 11:15:00+00',
  'Yamuna River Cleanup survey section W06 (after phase)', 'sig_water_06', '{"Make": "Apple", "Model": "iPhone 15 Pro", "DateTimeOriginal": "2026-08-06 11:15:00+00"}'::jsonb,
  'w05w05w05w05w05w05w05w05w05w05w05w05w05w05w05w05w05w05w05w05w05w', 'w05w05w05w05w05w05w05w05w05w05w05w05w05w05w05w05w05w05w05w05w05w', '["water_cleanup", "yamuna", "wetland", "after", "restored"]'::jsonb, 'water_extent', 'after', '1.0.0',
  '2026-08-06 11:15:00+00', '2026-08-06 11:15:00+00', '2026-08-06 11:15:00+00', 'device', 'passed', '2026-08-06 11:15:00+00', NULL, 'verified'
);


INSERT INTO assets (
  id, project_id, org_id, cloudinary_public_id, cloudinary_asset_id, asset_type,
  device_capture_timestamp, device_commit_hash, device_id, device_public_key, capture_signature,
  gps_point, gps_accuracy_meters, gps_altitude, gps_provider, gps_timestamp,
  caption, caption_signature, exif, exif_hash, sha256_hash, ai_tags, observation_type, phase, app_version,
  server_upload_timestamp, server_received_at, upload_started_at, signature_tier, verification, verified_at, quarantined_at, upload_status
) VALUES (
  '70660914-9b3c-5c96-a8f5-57ef3450136f', 'cbe3725d-6b0a-4c7a-bc3d-37b8488f1dd5', '137cb278-8f28-46fc-b005-8494a4628b48', 'evidence/137cb278-8f28-46fc-b005-8494a4628b48/cbe3725d-6b0a-4c7a-bc3d-37b8488f1dd5/yamuna_water_section_07', 'cld_asset_water_07', 'image',
  '2026-03-07 11:15:00+00', 'w06w06w06w06w06w06w06w06w06w06w06w06w06w06w06w06w06w06w06w06w06w', 'device_field_rig_70660914', 'MCowBQYDK2VwAyEA48a62a9c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c', 'sig_commit_70660914',
  ST_SetSRID(ST_MakePoint(77.3060, 28.5460), 4326)::geography, 2.4, 250.0, 'gps', '2026-03-07 11:15:00+00',
  'Yamuna River Cleanup survey section W07 (before phase)', 'sig_water_07', '{"Make": "Apple", "Model": "iPhone 15 Pro", "DateTimeOriginal": "2026-03-07 11:15:00+00"}'::jsonb,
  'w06w06w06w06w06w06w06w06w06w06w06w06w06w06w06w06w06w06w06w06w06w', 'w06w06w06w06w06w06w06w06w06w06w06w06w06w06w06w06w06w06w06w06w06w', '["water_cleanup", "yamuna", "wetland", "before", "restored"]'::jsonb, 'water_extent', 'before', '1.0.0',
  '2026-03-07 11:15:00+00', '2026-03-07 11:15:00+00', '2026-03-07 11:15:00+00', 'device', 'passed', '2026-03-07 11:15:00+00', NULL, 'verified'
);


INSERT INTO assets (
  id, project_id, org_id, cloudinary_public_id, cloudinary_asset_id, asset_type,
  device_capture_timestamp, device_commit_hash, device_id, device_public_key, capture_signature,
  gps_point, gps_accuracy_meters, gps_altitude, gps_provider, gps_timestamp,
  caption, caption_signature, exif, exif_hash, sha256_hash, ai_tags, observation_type, phase, app_version,
  server_upload_timestamp, server_received_at, upload_started_at, signature_tier, verification, verified_at, quarantined_at, upload_status
) VALUES (
  '06d6fdd1-3ca1-5f03-9f6c-5365cd2ec9e7', 'cbe3725d-6b0a-4c7a-bc3d-37b8488f1dd5', '137cb278-8f28-46fc-b005-8494a4628b48', 'evidence/137cb278-8f28-46fc-b005-8494a4628b48/cbe3725d-6b0a-4c7a-bc3d-37b8488f1dd5/yamuna_water_section_08', 'cld_asset_water_08', 'image',
  '2026-04-08 11:15:00+00', 'w07w07w07w07w07w07w07w07w07w07w07w07w07w07w07w07w07w07w07w07w07w', 'device_field_rig_06d6fdd1', 'MCowBQYDK2VwAyEA48a62a9c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c', 'sig_commit_06d6fdd1',
  ST_SetSRID(ST_MakePoint(77.3070, 28.5470), 4326)::geography, 2.4, 250.0, 'gps', '2026-04-08 11:15:00+00',
  'Yamuna River Cleanup survey section W08 (after phase)', 'sig_water_08', '{"Make": "Apple", "Model": "iPhone 15 Pro", "DateTimeOriginal": "2026-04-08 11:15:00+00"}'::jsonb,
  'w07w07w07w07w07w07w07w07w07w07w07w07w07w07w07w07w07w07w07w07w07w', 'w07w07w07w07w07w07w07w07w07w07w07w07w07w07w07w07w07w07w07w07w07w', '["water_cleanup", "yamuna", "wetland", "after", "restored"]'::jsonb, 'water_extent', 'after', '1.0.0',
  '2026-04-08 11:15:00+00', '2026-04-08 11:15:00+00', '2026-04-08 11:15:00+00', 'device', 'passed', '2026-04-08 11:15:00+00', NULL, 'verified'
);


INSERT INTO assets (
  id, project_id, org_id, cloudinary_public_id, cloudinary_asset_id, asset_type,
  device_capture_timestamp, device_commit_hash, device_id, device_public_key, capture_signature,
  gps_point, gps_accuracy_meters, gps_altitude, gps_provider, gps_timestamp,
  caption, caption_signature, exif, exif_hash, sha256_hash, ai_tags, observation_type, phase, app_version,
  server_upload_timestamp, server_received_at, upload_started_at, signature_tier, verification, verified_at, quarantined_at, upload_status
) VALUES (
  '0bcf22c1-8996-5b80-97a4-39dee7af1a0b', 'cbe3725d-6b0a-4c7a-bc3d-37b8488f1dd5', '137cb278-8f28-46fc-b005-8494a4628b48', 'evidence/137cb278-8f28-46fc-b005-8494a4628b48/cbe3725d-6b0a-4c7a-bc3d-37b8488f1dd5/yamuna_water_section_09', 'cld_asset_water_09', 'image',
  '2026-05-09 11:15:00+00', 'w08w08w08w08w08w08w08w08w08w08w08w08w08w08w08w08w08w08w08w08w08w', 'device_field_rig_0bcf22c1', 'MCowBQYDK2VwAyEA48a62a9c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c', 'sig_commit_0bcf22c1',
  ST_SetSRID(ST_MakePoint(77.3080, 28.5480), 4326)::geography, 2.4, 250.0, 'gps', '2026-05-09 11:15:00+00',
  'Yamuna River Cleanup survey section W09 (before phase)', 'sig_water_09', '{"Make": "Apple", "Model": "iPhone 15 Pro", "DateTimeOriginal": "2026-05-09 11:15:00+00"}'::jsonb,
  'w08w08w08w08w08w08w08w08w08w08w08w08w08w08w08w08w08w08w08w08w08w', 'w08w08w08w08w08w08w08w08w08w08w08w08w08w08w08w08w08w08w08w08w08w', '["water_cleanup", "yamuna", "wetland", "before", "restored"]'::jsonb, 'water_extent', 'before', '1.0.0',
  '2026-05-09 11:15:00+00', '2026-05-09 11:15:00+00', '2026-05-09 11:15:00+00', 'device', 'passed', '2026-05-09 11:15:00+00', NULL, 'verified'
);


INSERT INTO assets (
  id, project_id, org_id, cloudinary_public_id, cloudinary_asset_id, asset_type,
  device_capture_timestamp, device_commit_hash, device_id, device_public_key, capture_signature,
  gps_point, gps_accuracy_meters, gps_altitude, gps_provider, gps_timestamp,
  caption, caption_signature, exif, exif_hash, sha256_hash, ai_tags, observation_type, phase, app_version,
  server_upload_timestamp, server_received_at, upload_started_at, signature_tier, verification, verified_at, quarantined_at, upload_status
) VALUES (
  '38fa1951-a7d6-5842-b3e9-10728dae899e', 'cbe3725d-6b0a-4c7a-bc3d-37b8488f1dd5', '137cb278-8f28-46fc-b005-8494a4628b48', 'evidence/137cb278-8f28-46fc-b005-8494a4628b48/cbe3725d-6b0a-4c7a-bc3d-37b8488f1dd5/yamuna_water_section_10', 'cld_asset_water_10', 'image',
  '2026-06-10 11:15:00+00', 'w09w09w09w09w09w09w09w09w09w09w09w09w09w09w09w09w09w09w09w09w09w', 'device_field_rig_38fa1951', 'MCowBQYDK2VwAyEA48a62a9c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c', 'sig_commit_38fa1951',
  ST_SetSRID(ST_MakePoint(77.3090, 28.5490), 4326)::geography, 2.4, 250.0, 'gps', '2026-06-10 11:15:00+00',
  'Yamuna River Cleanup survey section W10 (after phase)', 'sig_water_10', '{"Make": "Apple", "Model": "iPhone 15 Pro", "DateTimeOriginal": "2026-06-10 11:15:00+00"}'::jsonb,
  'w09w09w09w09w09w09w09w09w09w09w09w09w09w09w09w09w09w09w09w09w09w', 'w09w09w09w09w09w09w09w09w09w09w09w09w09w09w09w09w09w09w09w09w09w', '["water_cleanup", "yamuna", "wetland", "after", "restored"]'::jsonb, 'water_extent', 'after', '1.0.0',
  '2026-06-10 11:15:00+00', '2026-06-10 11:15:00+00', '2026-06-10 11:15:00+00', 'device', 'passed', '2026-06-10 11:15:00+00', NULL, 'verified'
);


INSERT INTO assets (
  id, project_id, org_id, cloudinary_public_id, cloudinary_asset_id, asset_type,
  device_capture_timestamp, device_commit_hash, device_id, device_public_key, capture_signature,
  gps_point, gps_accuracy_meters, gps_altitude, gps_provider, gps_timestamp,
  caption, caption_signature, exif, exif_hash, sha256_hash, ai_tags, observation_type, phase, app_version,
  server_upload_timestamp, server_received_at, upload_started_at, signature_tier, verification, verified_at, quarantined_at, upload_status
) VALUES (
  '93830980-2517-5a1e-b49b-1e598b0d7116', 'cbe3725d-6b0a-4c7a-bc3d-37b8488f1dd5', '137cb278-8f28-46fc-b005-8494a4628b48', 'evidence/137cb278-8f28-46fc-b005-8494a4628b48/cbe3725d-6b0a-4c7a-bc3d-37b8488f1dd5/yamuna_water_section_11', 'cld_asset_water_11', 'image',
  '2026-07-11 11:15:00+00', 'w0aw0aw0aw0aw0aw0aw0aw0aw0aw0aw0aw0aw0aw0aw0aw0aw0aw0aw0aw0aw0aw', 'device_field_rig_93830980', 'MCowBQYDK2VwAyEA48a62a9c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c', 'sig_commit_93830980',
  ST_SetSRID(ST_MakePoint(77.3100, 28.5500), 4326)::geography, 2.4, 250.0, 'gps', '2026-07-11 11:15:00+00',
  'Yamuna River Cleanup survey section W11 (before phase)', 'sig_water_11', '{"Make": "Apple", "Model": "iPhone 15 Pro", "DateTimeOriginal": "2026-07-11 11:15:00+00"}'::jsonb,
  'w0aw0aw0aw0aw0aw0aw0aw0aw0aw0aw0aw0aw0aw0aw0aw0aw0aw0aw0aw0aw0aw', 'w0aw0aw0aw0aw0aw0aw0aw0aw0aw0aw0aw0aw0aw0aw0aw0aw0aw0aw0aw0aw0aw', '["water_cleanup", "yamuna", "wetland", "before", "restored"]'::jsonb, 'water_extent', 'before', '1.0.0',
  '2026-07-11 11:15:00+00', '2026-07-11 11:15:00+00', '2026-07-11 11:15:00+00', 'device', 'passed', '2026-07-11 11:15:00+00', NULL, 'verified'
);


INSERT INTO assets (
  id, project_id, org_id, cloudinary_public_id, cloudinary_asset_id, asset_type,
  device_capture_timestamp, device_commit_hash, device_id, device_public_key, capture_signature,
  gps_point, gps_accuracy_meters, gps_altitude, gps_provider, gps_timestamp,
  caption, caption_signature, exif, exif_hash, sha256_hash, ai_tags, observation_type, phase, app_version,
  server_upload_timestamp, server_received_at, upload_started_at, signature_tier, verification, verified_at, quarantined_at, upload_status
) VALUES (
  '61451084-72cd-507a-9416-66e6db52778a', 'cbe3725d-6b0a-4c7a-bc3d-37b8488f1dd5', '137cb278-8f28-46fc-b005-8494a4628b48', 'evidence/137cb278-8f28-46fc-b005-8494a4628b48/cbe3725d-6b0a-4c7a-bc3d-37b8488f1dd5/yamuna_water_section_12', 'cld_asset_water_12', 'image',
  '2026-08-12 11:15:00+00', 'w0bw0bw0bw0bw0bw0bw0bw0bw0bw0bw0bw0bw0bw0bw0bw0bw0bw0bw0bw0bw0bw', 'device_field_rig_61451084', 'MCowBQYDK2VwAyEA48a62a9c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c', 'sig_commit_61451084',
  ST_SetSRID(ST_MakePoint(77.3110, 28.5510), 4326)::geography, 2.4, 250.0, 'gps', '2026-08-12 11:15:00+00',
  'Yamuna River Cleanup survey section W12 (after phase)', 'sig_water_12', '{"Make": "Apple", "Model": "iPhone 15 Pro", "DateTimeOriginal": "2026-08-12 11:15:00+00"}'::jsonb,
  'w0bw0bw0bw0bw0bw0bw0bw0bw0bw0bw0bw0bw0bw0bw0bw0bw0bw0bw0bw0bw0bw', 'w0bw0bw0bw0bw0bw0bw0bw0bw0bw0bw0bw0bw0bw0bw0bw0bw0bw0bw0bw0bw0bw', '["water_cleanup", "yamuna", "wetland", "after", "restored"]'::jsonb, 'water_extent', 'after', '1.0.0',
  '2026-08-12 11:15:00+00', '2026-08-12 11:15:00+00', '2026-08-12 11:15:00+00', 'device', 'passed', '2026-08-12 11:15:00+00', NULL, 'verified'
);


INSERT INTO assets (
  id, project_id, org_id, cloudinary_public_id, cloudinary_asset_id, asset_type,
  device_capture_timestamp, device_commit_hash, device_id, device_public_key, capture_signature,
  gps_point, gps_accuracy_meters, gps_altitude, gps_provider, gps_timestamp,
  caption, caption_signature, exif, exif_hash, sha256_hash, ai_tags, observation_type, phase, app_version,
  server_upload_timestamp, server_received_at, upload_started_at, signature_tier, verification, verified_at, quarantined_at, upload_status
) VALUES (
  'e5b5ce35-06d5-5ab8-be75-7cea27eb860a', 'cbe3725d-6b0a-4c7a-bc3d-37b8488f1dd5', '137cb278-8f28-46fc-b005-8494a4628b48', 'evidence/137cb278-8f28-46fc-b005-8494a4628b48/cbe3725d-6b0a-4c7a-bc3d-37b8488f1dd5/yamuna_water_section_13', 'cld_asset_water_13', 'image',
  '2026-03-13 11:15:00+00', 'w0cw0cw0cw0cw0cw0cw0cw0cw0cw0cw0cw0cw0cw0cw0cw0cw0cw0cw0cw0cw0cw', 'device_field_rig_e5b5ce35', 'MCowBQYDK2VwAyEA48a62a9c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c', 'sig_commit_e5b5ce35',
  ST_SetSRID(ST_MakePoint(77.3120, 28.5520), 4326)::geography, 2.4, 250.0, 'gps', '2026-03-13 11:15:00+00',
  'Yamuna River Cleanup survey section W13 (before phase)', 'sig_water_13', '{"Make": "Apple", "Model": "iPhone 15 Pro", "DateTimeOriginal": "2026-03-13 11:15:00+00"}'::jsonb,
  'w0cw0cw0cw0cw0cw0cw0cw0cw0cw0cw0cw0cw0cw0cw0cw0cw0cw0cw0cw0cw0cw', 'w0cw0cw0cw0cw0cw0cw0cw0cw0cw0cw0cw0cw0cw0cw0cw0cw0cw0cw0cw0cw0cw', '["water_cleanup", "yamuna", "wetland", "before", "restored"]'::jsonb, 'water_extent', 'before', '1.0.0',
  '2026-03-13 11:15:00+00', '2026-03-13 11:15:00+00', '2026-03-13 11:15:00+00', 'device', 'passed', '2026-03-13 11:15:00+00', NULL, 'verified'
);


INSERT INTO assets (
  id, project_id, org_id, cloudinary_public_id, cloudinary_asset_id, asset_type,
  device_capture_timestamp, device_commit_hash, device_id, device_public_key, capture_signature,
  gps_point, gps_accuracy_meters, gps_altitude, gps_provider, gps_timestamp,
  caption, caption_signature, exif, exif_hash, sha256_hash, ai_tags, observation_type, phase, app_version,
  server_upload_timestamp, server_received_at, upload_started_at, signature_tier, verification, verified_at, quarantined_at, upload_status
) VALUES (
  '547d607d-a390-558e-b625-32a329c53ef3', 'cbe3725d-6b0a-4c7a-bc3d-37b8488f1dd5', '137cb278-8f28-46fc-b005-8494a4628b48', 'evidence/137cb278-8f28-46fc-b005-8494a4628b48/cbe3725d-6b0a-4c7a-bc3d-37b8488f1dd5/yamuna_water_section_14', 'cld_asset_water_14', 'image',
  '2026-04-14 11:15:00+00', 'w0dw0dw0dw0dw0dw0dw0dw0dw0dw0dw0dw0dw0dw0dw0dw0dw0dw0dw0dw0dw0dw', 'device_field_rig_547d607d', 'MCowBQYDK2VwAyEA48a62a9c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c', 'sig_commit_547d607d',
  ST_SetSRID(ST_MakePoint(77.3130, 28.5530), 4326)::geography, 2.4, 250.0, 'gps', '2026-04-14 11:15:00+00',
  'Yamuna River Cleanup survey section W14 (after phase)', 'sig_water_14', '{"Make": "Apple", "Model": "iPhone 15 Pro", "DateTimeOriginal": "2026-04-14 11:15:00+00"}'::jsonb,
  'w0dw0dw0dw0dw0dw0dw0dw0dw0dw0dw0dw0dw0dw0dw0dw0dw0dw0dw0dw0dw0dw', 'w0dw0dw0dw0dw0dw0dw0dw0dw0dw0dw0dw0dw0dw0dw0dw0dw0dw0dw0dw0dw0dw', '["water_cleanup", "yamuna", "wetland", "after", "restored"]'::jsonb, 'water_extent', 'after', '1.0.0',
  '2026-04-14 11:15:00+00', '2026-04-14 11:15:00+00', '2026-04-14 11:15:00+00', 'device', 'passed', '2026-04-14 11:15:00+00', NULL, 'verified'
);


INSERT INTO assets (
  id, project_id, org_id, cloudinary_public_id, cloudinary_asset_id, asset_type,
  device_capture_timestamp, device_commit_hash, device_id, device_public_key, capture_signature,
  gps_point, gps_accuracy_meters, gps_altitude, gps_provider, gps_timestamp,
  caption, caption_signature, exif, exif_hash, sha256_hash, ai_tags, observation_type, phase, app_version,
  server_upload_timestamp, server_received_at, upload_started_at, signature_tier, verification, verified_at, quarantined_at, upload_status
) VALUES (
  'e3f0598d-0503-55e7-b411-a0fffcbf533e', 'cbe3725d-6b0a-4c7a-bc3d-37b8488f1dd5', '137cb278-8f28-46fc-b005-8494a4628b48', 'evidence/137cb278-8f28-46fc-b005-8494a4628b48/cbe3725d-6b0a-4c7a-bc3d-37b8488f1dd5/yamuna_water_section_15', 'cld_asset_water_15', 'image',
  '2026-05-15 11:15:00+00', 'w0ew0ew0ew0ew0ew0ew0ew0ew0ew0ew0ew0ew0ew0ew0ew0ew0ew0ew0ew0ew0ew', 'device_field_rig_e3f0598d', 'MCowBQYDK2VwAyEA48a62a9c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c', 'sig_commit_e3f0598d',
  ST_SetSRID(ST_MakePoint(77.3140, 28.5540), 4326)::geography, 2.4, 250.0, 'gps', '2026-05-15 11:15:00+00',
  'Yamuna River Cleanup survey section W15 (before phase)', 'sig_water_15', '{"Make": "Apple", "Model": "iPhone 15 Pro", "DateTimeOriginal": "2026-05-15 11:15:00+00"}'::jsonb,
  'w0ew0ew0ew0ew0ew0ew0ew0ew0ew0ew0ew0ew0ew0ew0ew0ew0ew0ew0ew0ew0ew', 'w0ew0ew0ew0ew0ew0ew0ew0ew0ew0ew0ew0ew0ew0ew0ew0ew0ew0ew0ew0ew0ew', '["water_cleanup", "yamuna", "wetland", "before", "restored"]'::jsonb, 'water_extent', 'before', '1.0.0',
  '2026-05-15 11:15:00+00', '2026-05-15 11:15:00+00', '2026-05-15 11:15:00+00', 'device', 'passed', '2026-05-15 11:15:00+00', NULL, 'verified'
);


INSERT INTO assets (
  id, project_id, org_id, cloudinary_public_id, cloudinary_asset_id, asset_type,
  device_capture_timestamp, device_commit_hash, device_id, device_public_key, capture_signature,
  gps_point, gps_accuracy_meters, gps_altitude, gps_provider, gps_timestamp,
  caption, caption_signature, exif, exif_hash, sha256_hash, ai_tags, observation_type, phase, app_version,
  server_upload_timestamp, server_received_at, upload_started_at, signature_tier, verification, verified_at, quarantined_at, upload_status
) VALUES (
  'b47c3609-5ba0-5f67-8579-8269ec2019a6', 'cbe3725d-6b0a-4c7a-bc3d-37b8488f1dd5', '137cb278-8f28-46fc-b005-8494a4628b48', 'evidence/137cb278-8f28-46fc-b005-8494a4628b48/cbe3725d-6b0a-4c7a-bc3d-37b8488f1dd5/yamuna_water_section_16', 'cld_asset_water_16', 'image',
  '2026-06-16 11:15:00+00', 'w0fw0fw0fw0fw0fw0fw0fw0fw0fw0fw0fw0fw0fw0fw0fw0fw0fw0fw0fw0fw0fw', 'device_field_rig_b47c3609', 'MCowBQYDK2VwAyEA48a62a9c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c', 'sig_commit_b47c3609',
  ST_SetSRID(ST_MakePoint(77.3150, 28.5550), 4326)::geography, 2.4, 250.0, 'gps', '2026-06-16 11:15:00+00',
  'Yamuna River Cleanup survey section W16 (after phase)', 'sig_water_16', '{"Make": "Apple", "Model": "iPhone 15 Pro", "DateTimeOriginal": "2026-06-16 11:15:00+00"}'::jsonb,
  'w0fw0fw0fw0fw0fw0fw0fw0fw0fw0fw0fw0fw0fw0fw0fw0fw0fw0fw0fw0fw0fw', 'w0fw0fw0fw0fw0fw0fw0fw0fw0fw0fw0fw0fw0fw0fw0fw0fw0fw0fw0fw0fw0fw', '["water_cleanup", "yamuna", "wetland", "after", "restored"]'::jsonb, 'water_extent', 'after', '1.0.0',
  '2026-06-16 11:15:00+00', '2026-06-16 11:15:00+00', '2026-06-16 11:15:00+00', 'device', 'passed', '2026-06-16 11:15:00+00', NULL, 'verified'
);


INSERT INTO assets (
  id, project_id, org_id, cloudinary_public_id, cloudinary_asset_id, asset_type,
  device_capture_timestamp, device_commit_hash, device_id, device_public_key, capture_signature,
  gps_point, gps_accuracy_meters, gps_altitude, gps_provider, gps_timestamp,
  caption, caption_signature, exif, exif_hash, sha256_hash, ai_tags, observation_type, phase, app_version,
  server_upload_timestamp, server_received_at, upload_started_at, signature_tier, verification, verified_at, quarantined_at, upload_status
) VALUES (
  '36caf1b4-ce31-53f3-98d6-de7c6d37bd9a', 'cbe3725d-6b0a-4c7a-bc3d-37b8488f1dd5', '137cb278-8f28-46fc-b005-8494a4628b48', 'evidence/137cb278-8f28-46fc-b005-8494a4628b48/cbe3725d-6b0a-4c7a-bc3d-37b8488f1dd5/yamuna_water_section_17', 'cld_asset_water_17', 'image',
  '2026-07-17 11:15:00+00', 'w10w10w10w10w10w10w10w10w10w10w10w10w10w10w10w10w10w10w10w10w10w', 'device_field_rig_36caf1b4', 'MCowBQYDK2VwAyEA48a62a9c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c', 'sig_commit_36caf1b4',
  ST_SetSRID(ST_MakePoint(77.3160, 28.5560), 4326)::geography, 2.4, 250.0, 'gps', '2026-07-17 11:15:00+00',
  'Yamuna River Cleanup survey section W17 (before phase)', 'sig_water_17', '{"Make": "Apple", "Model": "iPhone 15 Pro", "DateTimeOriginal": "2026-07-17 11:15:00+00"}'::jsonb,
  'w10w10w10w10w10w10w10w10w10w10w10w10w10w10w10w10w10w10w10w10w10w', 'w10w10w10w10w10w10w10w10w10w10w10w10w10w10w10w10w10w10w10w10w10w', '["water_cleanup", "yamuna", "wetland", "before", "restored"]'::jsonb, 'water_extent', 'before', '1.0.0',
  '2026-07-17 11:15:00+00', '2026-07-17 11:15:00+00', '2026-07-17 11:15:00+00', 'device', 'passed', '2026-07-17 11:15:00+00', NULL, 'verified'
);


INSERT INTO assets (
  id, project_id, org_id, cloudinary_public_id, cloudinary_asset_id, asset_type,
  device_capture_timestamp, device_commit_hash, device_id, device_public_key, capture_signature,
  gps_point, gps_accuracy_meters, gps_altitude, gps_provider, gps_timestamp,
  caption, caption_signature, exif, exif_hash, sha256_hash, ai_tags, observation_type, phase, app_version,
  server_upload_timestamp, server_received_at, upload_started_at, signature_tier, verification, verified_at, quarantined_at, upload_status
) VALUES (
  'ff43b414-3aa7-5b79-bc95-045e186c3ee2', 'cbe3725d-6b0a-4c7a-bc3d-37b8488f1dd5', '137cb278-8f28-46fc-b005-8494a4628b48', 'evidence/137cb278-8f28-46fc-b005-8494a4628b48/cbe3725d-6b0a-4c7a-bc3d-37b8488f1dd5/yamuna_water_section_18', 'cld_asset_water_18', 'image',
  '2026-08-18 11:15:00+00', 'w11w11w11w11w11w11w11w11w11w11w11w11w11w11w11w11w11w11w11w11w11w', 'device_field_rig_ff43b414', 'MCowBQYDK2VwAyEA48a62a9c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c', 'sig_commit_ff43b414',
  ST_SetSRID(ST_MakePoint(77.3170, 28.5570), 4326)::geography, 2.4, 250.0, 'gps', '2026-08-18 11:15:00+00',
  'Yamuna River Cleanup survey section W18 (after phase)', 'sig_water_18', '{"Make": "Apple", "Model": "iPhone 15 Pro", "DateTimeOriginal": "2026-08-18 11:15:00+00"}'::jsonb,
  'w11w11w11w11w11w11w11w11w11w11w11w11w11w11w11w11w11w11w11w11w11w', 'w11w11w11w11w11w11w11w11w11w11w11w11w11w11w11w11w11w11w11w11w11w', '["water_cleanup", "yamuna", "wetland", "after", "restored"]'::jsonb, 'water_extent', 'after', '1.0.0',
  '2026-08-18 11:15:00+00', '2026-08-18 11:15:00+00', '2026-08-18 11:15:00+00', 'device', 'passed', '2026-08-18 11:15:00+00', NULL, 'verified'
);


INSERT INTO assets (
  id, project_id, org_id, cloudinary_public_id, cloudinary_asset_id, asset_type,
  device_capture_timestamp, device_commit_hash, device_id, device_public_key, capture_signature,
  gps_point, gps_accuracy_meters, gps_altitude, gps_provider, gps_timestamp,
  caption, caption_signature, exif, exif_hash, sha256_hash, ai_tags, observation_type, phase, app_version,
  server_upload_timestamp, server_received_at, upload_started_at, signature_tier, verification, verified_at, quarantined_at, upload_status
) VALUES (
  '7940f693-0460-50a6-b927-4dcde1353d62', 'cbe3725d-6b0a-4c7a-bc3d-37b8488f1dd5', '137cb278-8f28-46fc-b005-8494a4628b48', 'evidence/137cb278-8f28-46fc-b005-8494a4628b48/cbe3725d-6b0a-4c7a-bc3d-37b8488f1dd5/yamuna_water_section_19', 'cld_asset_water_19', 'image',
  '2026-03-19 11:15:00+00', 'w12w12w12w12w12w12w12w12w12w12w12w12w12w12w12w12w12w12w12w12w12w', 'device_field_rig_7940f693', 'MCowBQYDK2VwAyEA48a62a9c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c', 'sig_commit_7940f693',
  ST_SetSRID(ST_MakePoint(77.3180, 28.5580), 4326)::geography, 2.4, 250.0, 'gps', '2026-03-19 11:15:00+00',
  'Yamuna River Cleanup survey section W19 (before phase)', 'sig_water_19', '{"Make": "Apple", "Model": "iPhone 15 Pro", "DateTimeOriginal": "2026-03-19 11:15:00+00"}'::jsonb,
  'w12w12w12w12w12w12w12w12w12w12w12w12w12w12w12w12w12w12w12w12w12w', 'w12w12w12w12w12w12w12w12w12w12w12w12w12w12w12w12w12w12w12w12w12w', '["water_cleanup", "yamuna", "wetland", "before", "restored"]'::jsonb, 'water_extent', 'before', '1.0.0',
  '2026-03-19 11:15:00+00', '2026-03-19 11:15:00+00', '2026-03-19 11:15:00+00', 'device', 'passed', '2026-03-19 11:15:00+00', NULL, 'verified'
);


INSERT INTO assets (
  id, project_id, org_id, cloudinary_public_id, cloudinary_asset_id, asset_type,
  device_capture_timestamp, device_commit_hash, device_id, device_public_key, capture_signature,
  gps_point, gps_accuracy_meters, gps_altitude, gps_provider, gps_timestamp,
  caption, caption_signature, exif, exif_hash, sha256_hash, ai_tags, observation_type, phase, app_version,
  server_upload_timestamp, server_received_at, upload_started_at, signature_tier, verification, verified_at, quarantined_at, upload_status
) VALUES (
  '291443cf-a75a-50ae-89b1-2ce3f790a8d3', 'cbe3725d-6b0a-4c7a-bc3d-37b8488f1dd5', '137cb278-8f28-46fc-b005-8494a4628b48', 'evidence/137cb278-8f28-46fc-b005-8494a4628b48/cbe3725d-6b0a-4c7a-bc3d-37b8488f1dd5/yamuna_water_section_20', 'cld_asset_water_20', 'image',
  '2026-04-20 11:15:00+00', 'w13w13w13w13w13w13w13w13w13w13w13w13w13w13w13w13w13w13w13w13w13w', 'device_field_rig_291443cf', 'MCowBQYDK2VwAyEA48a62a9c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c', 'sig_commit_291443cf',
  ST_SetSRID(ST_MakePoint(77.3190, 28.5590), 4326)::geography, 2.4, 250.0, 'gps', '2026-04-20 11:15:00+00',
  'Yamuna River Cleanup survey section W20 (after phase)', 'sig_water_20', '{"Make": "Apple", "Model": "iPhone 15 Pro", "DateTimeOriginal": "2026-04-20 11:15:00+00"}'::jsonb,
  'w13w13w13w13w13w13w13w13w13w13w13w13w13w13w13w13w13w13w13w13w13w', 'w13w13w13w13w13w13w13w13w13w13w13w13w13w13w13w13w13w13w13w13w13w', '["water_cleanup", "yamuna", "wetland", "after", "restored"]'::jsonb, 'water_extent', 'after', '1.0.0',
  '2026-04-20 11:15:00+00', '2026-04-20 11:15:00+00', '2026-04-20 11:15:00+00', 'device', 'passed', '2026-04-20 11:15:00+00', NULL, 'verified'
);


INSERT INTO assets (
  id, project_id, org_id, cloudinary_public_id, cloudinary_asset_id, asset_type,
  device_capture_timestamp, device_commit_hash, device_id, device_public_key, capture_signature,
  gps_point, gps_accuracy_meters, gps_altitude, gps_provider, gps_timestamp,
  caption, caption_signature, exif, exif_hash, sha256_hash, ai_tags, observation_type, phase, app_version,
  server_upload_timestamp, server_received_at, upload_started_at, signature_tier, verification, verified_at, quarantined_at, upload_status
) VALUES (
  '87c5f8db-58cf-56e3-aa32-e69366335c39', 'cbe3725d-6b0a-4c7a-bc3d-37b8488f1dd5', '137cb278-8f28-46fc-b005-8494a4628b48', 'evidence/137cb278-8f28-46fc-b005-8494a4628b48/cbe3725d-6b0a-4c7a-bc3d-37b8488f1dd5/yamuna_water_section_21', 'cld_asset_water_21', 'image',
  '2026-05-21 11:15:00+00', 'tampered_w_21tampered_w_21tampered_w_21', 'device_field_rig_87c5f8db', 'MCowBQYDK2VwAyEA48a62a9c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c', 'sig_commit_87c5f8db',
  ST_SetSRID(ST_MakePoint(77.3200, 28.5600), 4326)::geography, 2.4, 250.0, 'gps', '2026-05-21 11:15:00+00',
  'Yamuna River Cleanup survey section W21 (before phase)', NULL, '{"Make": "Apple", "Model": "iPhone 15 Pro", "DateTimeOriginal": "2026-05-21 11:15:00+00"}'::jsonb,
  'w14w14w14w14w14w14w14w14w14w14w14w14w14w14w14w14w14w14w14w14w14w', 'w14w14w14w14w14w14w14w14w14w14w14w14w14w14w14w14w14w14w14w14w14w', '["water_cleanup", "yamuna", "wetland", "before", "restored"]'::jsonb, 'water_extent', 'before', '1.0.0',
  '2026-05-21 11:15:00+00', '2026-05-21 11:15:00+00', '2026-05-21 11:15:00+00', 'device', 'failed', NULL, '2026-03-02 12:00:00+00', 'flagged'
);


INSERT INTO assets (
  id, project_id, org_id, cloudinary_public_id, cloudinary_asset_id, asset_type,
  device_capture_timestamp, device_commit_hash, device_id, device_public_key, capture_signature,
  gps_point, gps_accuracy_meters, gps_altitude, gps_provider, gps_timestamp,
  caption, caption_signature, exif, exif_hash, sha256_hash, ai_tags, observation_type, phase, app_version,
  server_upload_timestamp, server_received_at, upload_started_at, signature_tier, verification, verified_at, quarantined_at, upload_status
) VALUES (
  'd1c8df09-8cd4-5552-b562-e3b4b5d512ca', 'cbe3725d-6b0a-4c7a-bc3d-37b8488f1dd5', '137cb278-8f28-46fc-b005-8494a4628b48', 'evidence/137cb278-8f28-46fc-b005-8494a4628b48/cbe3725d-6b0a-4c7a-bc3d-37b8488f1dd5/yamuna_water_section_22', 'cld_asset_water_22', 'image',
  '2026-06-22 11:15:00+00', 'tampered_w_22tampered_w_22tampered_w_22', 'device_field_rig_d1c8df09', 'MCowBQYDK2VwAyEA48a62a9c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c', 'sig_commit_d1c8df09',
  ST_SetSRID(ST_MakePoint(77.3210, 28.5610), 4326)::geography, 2.4, 250.0, 'gps', '2026-06-22 11:15:00+00',
  'Yamuna River Cleanup survey section W22 (after phase)', NULL, '{"Make": "Apple", "Model": "iPhone 15 Pro", "DateTimeOriginal": "2026-06-22 11:15:00+00"}'::jsonb,
  'w15w15w15w15w15w15w15w15w15w15w15w15w15w15w15w15w15w15w15w15w15w', 'w15w15w15w15w15w15w15w15w15w15w15w15w15w15w15w15w15w15w15w15w15w', '["water_cleanup", "yamuna", "wetland", "after", "restored"]'::jsonb, 'water_extent', 'after', '1.0.0',
  '2026-06-22 11:15:00+00', '2026-06-22 11:15:00+00', '2026-06-22 11:15:00+00', 'device', 'failed', NULL, '2026-03-02 12:00:00+00', 'flagged'
);


INSERT INTO assets (
  id, project_id, org_id, cloudinary_public_id, cloudinary_asset_id, asset_type,
  device_capture_timestamp, device_commit_hash, device_id, device_public_key, capture_signature,
  gps_point, gps_accuracy_meters, gps_altitude, gps_provider, gps_timestamp,
  caption, caption_signature, exif, exif_hash, sha256_hash, ai_tags, observation_type, phase, app_version,
  server_upload_timestamp, server_received_at, upload_started_at, signature_tier, verification, verified_at, quarantined_at, upload_status
) VALUES (
  '96cab2e5-99f2-5c47-9ff0-f5ed3c13374a', 'cbe3725d-6b0a-4c7a-bc3d-37b8488f1dd5', '137cb278-8f28-46fc-b005-8494a4628b48', 'evidence/137cb278-8f28-46fc-b005-8494a4628b48/cbe3725d-6b0a-4c7a-bc3d-37b8488f1dd5/yamuna_water_section_23', 'cld_asset_water_23', 'image',
  '2026-07-23 11:15:00+00', 'tampered_w_23tampered_w_23tampered_w_23', 'device_field_rig_96cab2e5', 'MCowBQYDK2VwAyEA48a62a9c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c', 'sig_commit_96cab2e5',
  ST_SetSRID(ST_MakePoint(77.3220, 28.5620), 4326)::geography, 2.4, 250.0, 'gps', '2026-07-23 11:15:00+00',
  'Yamuna River Cleanup survey section W23 (before phase)', NULL, '{"Make": "Apple", "Model": "iPhone 15 Pro", "DateTimeOriginal": "2026-07-23 11:15:00+00"}'::jsonb,
  'w16w16w16w16w16w16w16w16w16w16w16w16w16w16w16w16w16w16w16w16w16w', 'w16w16w16w16w16w16w16w16w16w16w16w16w16w16w16w16w16w16w16w16w16w', '["water_cleanup", "yamuna", "wetland", "before", "restored"]'::jsonb, 'water_extent', 'before', '1.0.0',
  '2026-07-23 11:15:00+00', '2026-07-23 11:15:00+00', '2026-07-23 11:15:00+00', 'device', 'failed', NULL, '2026-03-02 12:00:00+00', 'flagged'
);


INSERT INTO assets (
  id, project_id, org_id, cloudinary_public_id, cloudinary_asset_id, asset_type,
  device_capture_timestamp, device_commit_hash, device_id, device_public_key, capture_signature,
  gps_point, gps_accuracy_meters, gps_altitude, gps_provider, gps_timestamp,
  caption, caption_signature, exif, exif_hash, sha256_hash, ai_tags, observation_type, phase, app_version,
  server_upload_timestamp, server_received_at, upload_started_at, signature_tier, verification, verified_at, quarantined_at, upload_status
) VALUES (
  '35f44138-04d1-5950-8233-c1a39595aa19', 'cbe3725d-6b0a-4c7a-bc3d-37b8488f1dd5', '137cb278-8f28-46fc-b005-8494a4628b48', 'evidence/137cb278-8f28-46fc-b005-8494a4628b48/cbe3725d-6b0a-4c7a-bc3d-37b8488f1dd5/yamuna_water_section_24', 'cld_asset_water_24', 'image',
  '2026-08-24 11:15:00+00', 'w17w17w17w17w17w17w17w17w17w17w17w17w17w17w17w17w17w17w17w17w17w', 'device_field_rig_35f44138', 'MCowBQYDK2VwAyEA48a62a9c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c', 'sig_commit_35f44138',
  ST_SetSRID(ST_MakePoint(77.3230, 28.5630), 4326)::geography, 2.4, 250.0, 'gps', '2026-08-24 11:15:00+00',
  'Yamuna River Cleanup survey section W24 (after phase)', 'sig_water_24', '{"Make": "Apple", "Model": "iPhone 15 Pro", "DateTimeOriginal": "2026-08-24 11:15:00+00"}'::jsonb,
  'w17w17w17w17w17w17w17w17w17w17w17w17w17w17w17w17w17w17w17w17w17w', 'w17w17w17w17w17w17w17w17w17w17w17w17w17w17w17w17w17w17w17w17w17w', '["water_cleanup", "yamuna", "wetland", "after", "restored"]'::jsonb, 'water_extent', 'after', '1.0.0',
  '2026-08-24 11:15:00+00', '2026-08-24 11:15:00+00', '2026-08-24 11:15:00+00', 'device', 'pending', NULL, NULL, 'pending'
);


INSERT INTO assets (
  id, project_id, org_id, cloudinary_public_id, cloudinary_asset_id, asset_type,
  device_capture_timestamp, device_commit_hash, device_id, device_public_key, capture_signature,
  gps_point, gps_accuracy_meters, gps_altitude, gps_provider, gps_timestamp,
  caption, caption_signature, exif, exif_hash, sha256_hash, ai_tags, observation_type, phase, app_version,
  server_upload_timestamp, server_received_at, upload_started_at, signature_tier, verification, verified_at, quarantined_at, upload_status
) VALUES (
  '451a0f74-6cdd-50a9-bd5e-0443dfb6d624', 'cbe3725d-6b0a-4c7a-bc3d-37b8488f1dd5', '137cb278-8f28-46fc-b005-8494a4628b48', 'evidence/137cb278-8f28-46fc-b005-8494a4628b48/cbe3725d-6b0a-4c7a-bc3d-37b8488f1dd5/yamuna_water_section_25', 'cld_asset_water_25', 'image',
  '2026-03-25 11:15:00+00', 'w18w18w18w18w18w18w18w18w18w18w18w18w18w18w18w18w18w18w18w18w18w', 'device_field_rig_451a0f74', 'MCowBQYDK2VwAyEA48a62a9c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c', 'sig_commit_451a0f74',
  ST_SetSRID(ST_MakePoint(77.3240, 28.5640), 4326)::geography, 2.4, 250.0, 'gps', '2026-03-25 11:15:00+00',
  'Yamuna River Cleanup survey section W25 (before phase)', 'sig_water_25', '{"Make": "Apple", "Model": "iPhone 15 Pro", "DateTimeOriginal": "2026-03-25 11:15:00+00"}'::jsonb,
  'w18w18w18w18w18w18w18w18w18w18w18w18w18w18w18w18w18w18w18w18w18w', 'w18w18w18w18w18w18w18w18w18w18w18w18w18w18w18w18w18w18w18w18w18w', '["water_cleanup", "yamuna", "wetland", "before", "restored"]'::jsonb, 'water_extent', 'before', '1.0.0',
  '2026-03-25 11:15:00+00', '2026-03-25 11:15:00+00', '2026-03-25 11:15:00+00', 'device', 'pending', NULL, NULL, 'pending'
);

-- Paired Change Events with Masks and Clean Metrics

INSERT INTO change_events (
  id, project_id, org_id, before_asset_id, after_asset_id, change_type, change_metrics,
  detection_method, model_version, confidence, diff_asset_cloudinary_id, gps_distance_meters, time_difference_hours, status
) VALUES (
  '550e8400-e29b-41d4-a716-446655440001', 'd17c2c6f-22da-4e08-b66f-9885ec33343e', '137cb278-8f28-46fc-b005-8494a4628b48', 'fdf13671-28bc-5c76-bd90-69a732f605f4', 'd901fe32-cf82-5e07-aef8-99eaef9833ae', 'sapling_plantation',
  '{"saplings_counted_before": 10, "saplings_counted_after": 45, "canopy_coverage_pct_before": 12.0, "canopy_coverage_pct_after": 34.8, "survival_rate_pct_before": 0, "survival_rate_pct_after": 90.0, "area_hectares_before": 0.42, "area_hectares_after": 0.42, "health_index_before": 0.45, "health_index_after": 0.88}'::jsonb, 'yolo_v8_changeformer', 'v1.0', 0.94, 'evidence/137cb278-8f28-46fc-b005-8494a4628b48/masks/change_mask_01',
  28.4, 120.0, 'detected'
);


INSERT INTO change_events (
  id, project_id, org_id, before_asset_id, after_asset_id, change_type, change_metrics,
  detection_method, model_version, confidence, diff_asset_cloudinary_id, gps_distance_meters, time_difference_hours, status
) VALUES (
  '550e8400-e29b-41d4-a716-446655440002', 'd17c2c6f-22da-4e08-b66f-9885ec33343e', '137cb278-8f28-46fc-b005-8494a4628b48', 'ec96cc40-16d0-52e1-96fd-ec44c36d7eda', '991760ad-1968-55fe-8793-4ce70ad56ed5', 'canopy_growth',
  '{"trees_identified_before": 22, "trees_identified_after": 88, "canopy_area_sqm_before": 350, "canopy_area_sqm_after": 1420, "vegetation_index_before": 0.32, "vegetation_index_after": 0.78}'::jsonb, 'yolo_v8_changeformer', 'v1.0', 0.96, 'evidence/137cb278-8f28-46fc-b005-8494a4628b48/masks/change_mask_02',
  28.4, 120.0, 'detected'
);


INSERT INTO change_events (
  id, project_id, org_id, before_asset_id, after_asset_id, change_type, change_metrics,
  detection_method, model_version, confidence, diff_asset_cloudinary_id, gps_distance_meters, time_difference_hours, status
) VALUES (
  '550e8400-e29b-41d4-a716-446655440003', 'cbe3725d-6b0a-4c7a-bc3d-37b8488f1dd5', '137cb278-8f28-46fc-b005-8494a4628b48', '414786df-9aca-5b8d-8ec4-a89e5885f3ad', 'dd0d390a-7e4c-5c67-8505-f9a491d79f65', 'water_cleanup',
  '{"water_surface_area_sqm_before": 5000, "water_surface_area_sqm_after": 12500, "debris_coverage_pct_before": 68.5, "debris_coverage_pct_after": 4.2, "water_clarity_index_before": 0.35, "water_clarity_index_after": 0.82, "dissolved_oxygen_mg_l_before": 2.1, "dissolved_oxygen_mg_l_after": 5.4, "turbidity_ntu_before": 45.0, "turbidity_ntu_after": 12.1}'::jsonb, 'yolo_v8_changeformer', 'v1.0', 0.92, 'evidence/137cb278-8f28-46fc-b005-8494a4628b48/masks/change_mask_03',
  28.4, 120.0, 'detected'
);


INSERT INTO change_events (
  id, project_id, org_id, before_asset_id, after_asset_id, change_type, change_metrics,
  detection_method, model_version, confidence, diff_asset_cloudinary_id, gps_distance_meters, time_difference_hours, status
) VALUES (
  '550e8400-e29b-41d4-a716-446655440004', 'cbe3725d-6b0a-4c7a-bc3d-37b8488f1dd5', '137cb278-8f28-46fc-b005-8494a4628b48', '603709a2-f75e-5ddf-a032-5c36c5628a7a', '5b15e479-ed93-5a51-bef0-c85175a6abc8', 'wetland_restoration',
  '{"water_volume_kl_before": 1200, "water_volume_kl_after": 4800, "plastic_waste_kg_before": 850, "plastic_waste_kg_after": 15, "biodiversity_score_before": 0.25, "biodiversity_score_after": 0.85}'::jsonb, 'yolo_v8_changeformer', 'v1.0', 0.95, 'evidence/137cb278-8f28-46fc-b005-8494a4628b48/masks/change_mask_04',
  28.4, 120.0, 'detected'
);


INSERT INTO change_events (
  id, project_id, org_id, before_asset_id, after_asset_id, change_type, change_metrics,
  detection_method, model_version, confidence, diff_asset_cloudinary_id, gps_distance_meters, time_difference_hours, status
) VALUES (
  '550e8400-e29b-41d4-a716-446655440005', 'd17c2c6f-22da-4e08-b66f-9885ec33343e', '137cb278-8f28-46fc-b005-8494a4628b48', '88ef46dd-ad45-5ddb-8c95-768de0daa6b0', '6bbb9b81-b6d6-53ab-8298-d7f4adbe8975', 'reforestation_phase2',
  '{"green_density_pct_before": 15.4, "green_density_pct_after": 62.1, "biomass_index_before": 1.2, "biomass_index_after": 4.8}'::jsonb, 'yolo_v8_changeformer', 'v1.0', 0.91, 'evidence/137cb278-8f28-46fc-b005-8494a4628b48/masks/change_mask_05',
  28.4, 120.0, 'detected'
);


INSERT INTO change_events (
  id, project_id, org_id, before_asset_id, after_asset_id, change_type, change_metrics,
  detection_method, model_version, confidence, diff_asset_cloudinary_id, gps_distance_meters, time_difference_hours, status
) VALUES (
  '550e8400-e29b-41d4-a716-446655440006', 'cbe3725d-6b0a-4c7a-bc3d-37b8488f1dd5', '137cb278-8f28-46fc-b005-8494a4628b48', 'e69c436a-4cd7-54da-8462-1de00830c9e2', '97dcbe57-1f40-5a9e-aa66-028b9fb8d6a5', 'riverbank_clearing',
  '{"waste_piles_count_before": 18, "waste_piles_count_after": 0, "cleared_length_meters_before": 0, "cleared_length_meters_after": 450}'::jsonb, 'yolo_v8_changeformer', 'v1.0', 0.93, 'evidence/137cb278-8f28-46fc-b005-8494a4628b48/masks/change_mask_06',
  28.4, 120.0, 'detected'
);

-- Observations

INSERT INTO observations (id, asset_id, project_id, org_id, observation_type, metrics, notes)
VALUES (gen_random_uuid(), 'fdf13671-28bc-5c76-bd90-69a732f605f4', 'd17c2c6f-22da-4e08-b66f-9885ec33343e', '137cb278-8f28-46fc-b005-8494a4628b48', 'mangrove_planting',
 '{"field_score": 0.92, "inspected_by": "Field Inspector Unit 1"}'::jsonb,
 'Verified field observation for Aravalli Sapling Plantation survey plot A01 (before phase). Evidence chain intact.');


INSERT INTO observations (id, asset_id, project_id, org_id, observation_type, metrics, notes)
VALUES (gen_random_uuid(), 'd901fe32-cf82-5e07-aef8-99eaef9833ae', 'd17c2c6f-22da-4e08-b66f-9885ec33343e', '137cb278-8f28-46fc-b005-8494a4628b48', 'mangrove_planting',
 '{"field_score": 0.92, "inspected_by": "Field Inspector Unit 2"}'::jsonb,
 'Verified field observation for Aravalli Sapling Plantation survey plot A02 (after phase). Evidence chain intact.');


INSERT INTO observations (id, asset_id, project_id, org_id, observation_type, metrics, notes)
VALUES (gen_random_uuid(), 'ec96cc40-16d0-52e1-96fd-ec44c36d7eda', 'd17c2c6f-22da-4e08-b66f-9885ec33343e', '137cb278-8f28-46fc-b005-8494a4628b48', 'mangrove_planting',
 '{"field_score": 0.92, "inspected_by": "Field Inspector Unit 3"}'::jsonb,
 'Verified field observation for Aravalli Sapling Plantation survey plot A03 (before phase). Evidence chain intact.');


INSERT INTO observations (id, asset_id, project_id, org_id, observation_type, metrics, notes)
VALUES (gen_random_uuid(), '991760ad-1968-55fe-8793-4ce70ad56ed5', 'd17c2c6f-22da-4e08-b66f-9885ec33343e', '137cb278-8f28-46fc-b005-8494a4628b48', 'mangrove_planting',
 '{"field_score": 0.92, "inspected_by": "Field Inspector Unit 4"}'::jsonb,
 'Verified field observation for Aravalli Sapling Plantation survey plot A04 (after phase). Evidence chain intact.');


INSERT INTO observations (id, asset_id, project_id, org_id, observation_type, metrics, notes)
VALUES (gen_random_uuid(), '88ef46dd-ad45-5ddb-8c95-768de0daa6b0', 'd17c2c6f-22da-4e08-b66f-9885ec33343e', '137cb278-8f28-46fc-b005-8494a4628b48', 'mangrove_planting',
 '{"field_score": 0.92, "inspected_by": "Field Inspector Unit 5"}'::jsonb,
 'Verified field observation for Aravalli Sapling Plantation survey plot A05 (before phase). Evidence chain intact.');


INSERT INTO observations (id, asset_id, project_id, org_id, observation_type, metrics, notes)
VALUES (gen_random_uuid(), '6bbb9b81-b6d6-53ab-8298-d7f4adbe8975', 'd17c2c6f-22da-4e08-b66f-9885ec33343e', '137cb278-8f28-46fc-b005-8494a4628b48', 'mangrove_planting',
 '{"field_score": 0.92, "inspected_by": "Field Inspector Unit 6"}'::jsonb,
 'Verified field observation for Aravalli Sapling Plantation survey plot A06 (after phase). Evidence chain intact.');


INSERT INTO observations (id, asset_id, project_id, org_id, observation_type, metrics, notes)
VALUES (gen_random_uuid(), 'cf57041b-54d6-508e-9fbe-5c4392fe60b5', 'd17c2c6f-22da-4e08-b66f-9885ec33343e', '137cb278-8f28-46fc-b005-8494a4628b48', 'mangrove_planting',
 '{"field_score": 0.92, "inspected_by": "Field Inspector Unit 7"}'::jsonb,
 'Verified field observation for Aravalli Sapling Plantation survey plot A07 (before phase). Evidence chain intact.');


INSERT INTO observations (id, asset_id, project_id, org_id, observation_type, metrics, notes)
VALUES (gen_random_uuid(), 'c5062bcf-9c1e-5070-bb39-3f41d9cac746', 'd17c2c6f-22da-4e08-b66f-9885ec33343e', '137cb278-8f28-46fc-b005-8494a4628b48', 'mangrove_planting',
 '{"field_score": 0.92, "inspected_by": "Field Inspector Unit 8"}'::jsonb,
 'Verified field observation for Aravalli Sapling Plantation survey plot A08 (after phase). Evidence chain intact.');


INSERT INTO observations (id, asset_id, project_id, org_id, observation_type, metrics, notes)
VALUES (gen_random_uuid(), 'fe2ad8a2-4cec-579e-adec-6911538a9886', 'd17c2c6f-22da-4e08-b66f-9885ec33343e', '137cb278-8f28-46fc-b005-8494a4628b48', 'mangrove_planting',
 '{"field_score": 0.92, "inspected_by": "Field Inspector Unit 9"}'::jsonb,
 'Verified field observation for Aravalli Sapling Plantation survey plot A09 (before phase). Evidence chain intact.');


INSERT INTO observations (id, asset_id, project_id, org_id, observation_type, metrics, notes)
VALUES (gen_random_uuid(), '878cdc5b-f44a-5a22-a9b2-cedc862577e8', 'd17c2c6f-22da-4e08-b66f-9885ec33343e', '137cb278-8f28-46fc-b005-8494a4628b48', 'mangrove_planting',
 '{"field_score": 0.92, "inspected_by": "Field Inspector Unit 10"}'::jsonb,
 'Verified field observation for Aravalli Sapling Plantation survey plot A10 (after phase). Evidence chain intact.');

-- Audit Logs & Cryptographic Chain

INSERT INTO audit_logs (asset_id, action, actor_type, actor_id, previous_hash, current_hash, hashed_at, details_canonical)
VALUES ('fdf13671-28bc-5c76-bd90-69a732f605f4', 'upload', 'device', 'device_rig_1', NULL, '0b6fe97b489ed45b65bdf3b0c20162182d89b2a7cb3e76d7fde427cea79bd3e9', '2026-02-01 09:30:00+00', NULL);


INSERT INTO audit_logs (asset_id, action, actor_type, actor_id, previous_hash, current_hash, hashed_at, details_canonical)
VALUES ('d901fe32-cf82-5e07-aef8-99eaef9833ae', 'upload', 'device', 'device_rig_2', NULL, '56477bf754c47239670eebcf8601132247f7dce34991d17c750f05eb7014a3ce', '2026-03-02 09:30:00+00', NULL);


INSERT INTO audit_logs (asset_id, action, actor_type, actor_id, previous_hash, current_hash, hashed_at, details_canonical)
VALUES ('ec96cc40-16d0-52e1-96fd-ec44c36d7eda', 'upload', 'device', 'device_rig_3', NULL, 'cd73cfc4c9f9932a43ff712df8802dacf03cbf847a5ba5d5b7b3d8c2e6acf3ab', '2026-04-03 09:30:00+00', NULL);


INSERT INTO audit_logs (asset_id, action, actor_type, actor_id, previous_hash, current_hash, hashed_at, details_canonical)
VALUES ('991760ad-1968-55fe-8793-4ce70ad56ed5', 'upload', 'device', 'device_rig_4', NULL, 'a687bd92207ad13a63455f8dc432287d5ca51b54a5f943abb680b6d45be2401b', '2026-05-04 09:30:00+00', NULL);


INSERT INTO audit_logs (asset_id, action, actor_type, actor_id, previous_hash, current_hash, hashed_at, details_canonical)
VALUES ('88ef46dd-ad45-5ddb-8c95-768de0daa6b0', 'upload', 'device', 'device_rig_5', NULL, '07ae1d411d6953c17715cbbee2a77d65913bdd6b719a7907495333bdf6fadd9d', '2026-06-05 09:30:00+00', NULL);


INSERT INTO audit_logs (asset_id, action, actor_type, actor_id, previous_hash, current_hash, hashed_at, details_canonical)
VALUES ('6bbb9b81-b6d6-53ab-8298-d7f4adbe8975', 'upload', 'device', 'device_rig_6', NULL, '3edd4d492fd8ef486c4c7bbe5cdca3afd6af7ef1225c4a9027afbf99324b5762', '2026-07-06 09:30:00+00', NULL);


INSERT INTO audit_logs (asset_id, action, actor_type, actor_id, previous_hash, current_hash, hashed_at, details_canonical)
VALUES ('cf57041b-54d6-508e-9fbe-5c4392fe60b5', 'upload', 'device', 'device_rig_7', NULL, '6c7e5e96446459b4afa7fd6d8b1e933c6ceb8e9775b3e405606aecd648917dd8', '2026-08-07 09:30:00+00', NULL);


INSERT INTO audit_logs (asset_id, action, actor_type, actor_id, previous_hash, current_hash, hashed_at, details_canonical)
VALUES ('c5062bcf-9c1e-5070-bb39-3f41d9cac746', 'upload', 'device', 'device_rig_8', NULL, '2cc3322690de677c80860964ec68ffcdd8e0a3554f3ecd5c0e22428a29e782f3', '2026-02-08 09:30:00+00', NULL);


INSERT INTO audit_logs (asset_id, action, actor_type, actor_id, previous_hash, current_hash, hashed_at, details_canonical)
VALUES ('fe2ad8a2-4cec-579e-adec-6911538a9886', 'upload', 'device', 'device_rig_9', NULL, '5e7f42921220edea5fcd4f01718145759e6d8e7e7b9ed5455c5e713a1f4ce30a', '2026-03-09 09:30:00+00', NULL);


INSERT INTO audit_logs (asset_id, action, actor_type, actor_id, previous_hash, current_hash, hashed_at, details_canonical)
VALUES ('878cdc5b-f44a-5a22-a9b2-cedc862577e8', 'upload', 'device', 'device_rig_10', NULL, 'ef77a6035d92ca1f77f50a2fd5e73f92c771ddd3cbeb83c9c492505fa7a8bf8d', '2026-04-10 09:30:00+00', NULL);


INSERT INTO audit_logs (asset_id, action, actor_type, actor_id, previous_hash, current_hash, hashed_at, details_canonical)
VALUES ('ca66706f-6037-5eb6-9df6-b227fbbc5621', 'upload', 'device', 'device_rig_11', NULL, 'bc299b6d8adc1c0fdb286d282863fbd2ab9dc3e06a6fdf57030d2eacd53fd6c7', '2026-05-11 09:30:00+00', NULL);


INSERT INTO audit_logs (asset_id, action, actor_type, actor_id, previous_hash, current_hash, hashed_at, details_canonical)
VALUES ('df122718-195a-58f2-b363-bd53537e0d5d', 'upload', 'device', 'device_rig_12', NULL, '242ea116fa7d6f3de35c3986cc0390c79274af56dbec7908dabce1e0b9d45136', '2026-06-12 09:30:00+00', NULL);


INSERT INTO audit_logs (asset_id, action, actor_type, actor_id, previous_hash, current_hash, hashed_at, details_canonical)
VALUES ('b99e5d28-dbec-5397-98e6-f8410e106783', 'upload', 'device', 'device_rig_13', NULL, '5d78d6e5ffd8f455210fc6fcad79e0c76efac2507aecdf80e9fac92277f2449a', '2026-07-13 09:30:00+00', NULL);


INSERT INTO audit_logs (asset_id, action, actor_type, actor_id, previous_hash, current_hash, hashed_at, details_canonical)
VALUES ('1729ee71-39c9-501e-a282-c2cc00d01f5c', 'upload', 'device', 'device_rig_14', NULL, '288bbd3a0a79d984ffa0beb31a16e5331916e06b5adb4de3e7867fed06c2c3b9', '2026-08-14 09:30:00+00', NULL);


INSERT INTO audit_logs (asset_id, action, actor_type, actor_id, previous_hash, current_hash, hashed_at, details_canonical)
VALUES ('4d0adc17-ae11-5a47-b984-1cbd1273dea6', 'upload', 'device', 'device_rig_15', NULL, '6d53de66fe86905626f935f02d91d7e68aeed98ec9e60750c680a4d0366c65e7', '2026-02-15 09:30:00+00', NULL);


INSERT INTO audit_logs (asset_id, action, actor_type, actor_id, previous_hash, current_hash, hashed_at, details_canonical)
VALUES ('85852cb8-2318-5993-a9eb-31e25bcad958', 'upload', 'device', 'device_rig_16', NULL, '6924261f3674bf57cb13ef0887e91785baae522f021693239fea82321caee284', '2026-03-16 09:30:00+00', NULL);


INSERT INTO audit_logs (asset_id, action, actor_type, actor_id, previous_hash, current_hash, hashed_at, details_canonical)
VALUES ('9f11d06c-89d2-5b42-8bb9-14174d4a36b1', 'upload', 'device', 'device_rig_17', NULL, '6ebf537f61e2ebdf1f1721c17b1b67e7c23fcc98d3bff554bd701ea1782baa3a', '2026-04-17 09:30:00+00', NULL);


INSERT INTO audit_logs (asset_id, action, actor_type, actor_id, previous_hash, current_hash, hashed_at, details_canonical)
VALUES ('951c97c3-b062-5543-945e-ee26785b4eeb', 'upload', 'device', 'device_rig_18', NULL, 'af26a1ac8b20a384bb7288205b2cdd87ef7e5810273d5e1a6e2d81fffb844843', '2026-05-18 09:30:00+00', NULL);


INSERT INTO audit_logs (asset_id, action, actor_type, actor_id, previous_hash, current_hash, hashed_at, details_canonical)
VALUES ('34e424b2-11da-5339-94eb-8a6e65533174', 'upload', 'device', 'device_rig_19', NULL, 'c912a97bbc7714008f5693f911731d4171b8eed4aaa5896116e318a3a9299002', '2026-06-19 09:30:00+00', NULL);


INSERT INTO audit_logs (asset_id, action, actor_type, actor_id, previous_hash, current_hash, hashed_at, details_canonical)
VALUES ('f6d0596a-26dd-5c9e-8360-573117df2677', 'upload', 'device', 'device_rig_20', NULL, '996f357356bae274ce22fad9713f13f7db911fbbd0d768487b227ac03b8da9d2', '2026-07-20 09:30:00+00', NULL);


INSERT INTO audit_logs (asset_id, action, actor_type, actor_id, previous_hash, current_hash, hashed_at, details_canonical)
VALUES ('17f087c2-4c3f-549f-bb1c-edb40ddaee51', 'upload', 'device', 'device_rig_21', NULL, '18a6c96fb5134791ff7f55bb4e4231d69e2b31747ca1b96ca8d7d6e8e231562b', '2026-08-21 09:30:00+00', NULL);


INSERT INTO audit_logs (asset_id, action, actor_type, actor_id, previous_hash, current_hash, hashed_at, details_canonical)
VALUES ('2583e3ef-bd6a-5556-8047-10805ec11ba9', 'upload', 'device', 'device_rig_22', NULL, '0d1af2e6e5398a3d2a9a51e1f7de9cb39f81726b7dcd595a1552f1818390cdc2', '2026-02-22 09:30:00+00', NULL);


INSERT INTO audit_logs (asset_id, action, actor_type, actor_id, previous_hash, current_hash, hashed_at, details_canonical)
VALUES ('74cd8847-ed3a-5b84-bb3d-2babe918bf92', 'upload', 'device', 'device_rig_23', NULL, 'f0cac68a79d65bd3f528cef98ca28c1509a6fb7a20838efd7ddd7c5cf23fe5b0', '2026-03-23 09:30:00+00', NULL);


INSERT INTO audit_logs (asset_id, action, actor_type, actor_id, previous_hash, current_hash, hashed_at, details_canonical)
VALUES ('30abbf4f-db97-5fd6-8bb7-bd7eb3a3f065', 'upload', 'device', 'device_rig_24', NULL, '8f35fa6f4df22ba358694fb3b801d48b390b05ac2dcd8f6fbfbf3e4b23b539a1', '2026-04-24 09:30:00+00', NULL);


INSERT INTO audit_logs (asset_id, action, actor_type, actor_id, previous_hash, current_hash, hashed_at, details_canonical)
VALUES ('c032f066-3a0c-5bfc-a468-be690bc3c7a0', 'upload', 'device', 'device_rig_25', NULL, '928c77da72a3257c9dcd7756852bd8fa5d2adcf4a6ae8039420eaf8a0893c237', '2026-05-25 09:30:00+00', NULL);


INSERT INTO audit_logs (asset_id, action, actor_type, actor_id, previous_hash, current_hash, hashed_at, details_canonical)
VALUES ('414786df-9aca-5b8d-8ec4-a89e5885f3ad', 'upload', 'device', 'device_rig_26', NULL, '09bf162cb9939019792c170a531b11f16003726542a1485de25518e189b70281', '2026-03-01 11:15:00+00', NULL);


INSERT INTO audit_logs (asset_id, action, actor_type, actor_id, previous_hash, current_hash, hashed_at, details_canonical)
VALUES ('dd0d390a-7e4c-5c67-8505-f9a491d79f65', 'upload', 'device', 'device_rig_27', NULL, '8a128e0446070300c64af16a48cc856b4db10376adab786f757145d6047f0503', '2026-04-02 11:15:00+00', NULL);


INSERT INTO audit_logs (asset_id, action, actor_type, actor_id, previous_hash, current_hash, hashed_at, details_canonical)
VALUES ('603709a2-f75e-5ddf-a032-5c36c5628a7a', 'upload', 'device', 'device_rig_28', NULL, '6de4fd44cc7780be01bd139cc740523fe1461f2ae27890c9cc6bc3be26ae823b', '2026-05-03 11:15:00+00', NULL);


INSERT INTO audit_logs (asset_id, action, actor_type, actor_id, previous_hash, current_hash, hashed_at, details_canonical)
VALUES ('5b15e479-ed93-5a51-bef0-c85175a6abc8', 'upload', 'device', 'device_rig_29', NULL, '1dc0d0075edd1d69442168fed9443277557744c279a51e720c40fb1cf8072d32', '2026-06-04 11:15:00+00', NULL);


INSERT INTO audit_logs (asset_id, action, actor_type, actor_id, previous_hash, current_hash, hashed_at, details_canonical)
VALUES ('e69c436a-4cd7-54da-8462-1de00830c9e2', 'upload', 'device', 'device_rig_30', NULL, 'f0ce8cc8217a90f3d2f9517baf915968d68c1c613ad37c2525aa75b79c971113', '2026-07-05 11:15:00+00', NULL);


INSERT INTO audit_logs (asset_id, action, actor_type, actor_id, previous_hash, current_hash, hashed_at, details_canonical)
VALUES ('97dcbe57-1f40-5a9e-aa66-028b9fb8d6a5', 'upload', 'device', 'device_rig_31', NULL, 'b970928d10e912811a42c842c6f30ac6d242ccebe461f5140870d93eb89a739b', '2026-08-06 11:15:00+00', NULL);


INSERT INTO audit_logs (asset_id, action, actor_type, actor_id, previous_hash, current_hash, hashed_at, details_canonical)
VALUES ('70660914-9b3c-5c96-a8f5-57ef3450136f', 'upload', 'device', 'device_rig_32', NULL, '26dde8401654e206e02a0e497aee13927c02111d299cd33fe3774bff4e350dd1', '2026-03-07 11:15:00+00', NULL);


INSERT INTO audit_logs (asset_id, action, actor_type, actor_id, previous_hash, current_hash, hashed_at, details_canonical)
VALUES ('06d6fdd1-3ca1-5f03-9f6c-5365cd2ec9e7', 'upload', 'device', 'device_rig_33', NULL, '7c977a85ca664230eec793d76e37c109315d9b55947d12bd44ff9060f8ee6c64', '2026-04-08 11:15:00+00', NULL);


INSERT INTO audit_logs (asset_id, action, actor_type, actor_id, previous_hash, current_hash, hashed_at, details_canonical)
VALUES ('0bcf22c1-8996-5b80-97a4-39dee7af1a0b', 'upload', 'device', 'device_rig_34', NULL, 'a69f83cf6a333720ee4a8e3c3d722907b07dbbd17f49f4736544f5f227284950', '2026-05-09 11:15:00+00', NULL);


INSERT INTO audit_logs (asset_id, action, actor_type, actor_id, previous_hash, current_hash, hashed_at, details_canonical)
VALUES ('38fa1951-a7d6-5842-b3e9-10728dae899e', 'upload', 'device', 'device_rig_35', NULL, '036e9edc56622555b683a5efeca58495557c666be00daa7f4016e773b9107570', '2026-06-10 11:15:00+00', NULL);


INSERT INTO audit_logs (asset_id, action, actor_type, actor_id, previous_hash, current_hash, hashed_at, details_canonical)
VALUES ('93830980-2517-5a1e-b49b-1e598b0d7116', 'upload', 'device', 'device_rig_36', NULL, 'c0dd61ebc8a388a3656a6e2f88bfefedd1d5f82ad7fe85327c6b8ca93ac8bbd8', '2026-07-11 11:15:00+00', NULL);


INSERT INTO audit_logs (asset_id, action, actor_type, actor_id, previous_hash, current_hash, hashed_at, details_canonical)
VALUES ('61451084-72cd-507a-9416-66e6db52778a', 'upload', 'device', 'device_rig_37', NULL, 'b60a4a041fd9719f13568155eb0fc93ed656bfacc440ff7982064f696bedd43a', '2026-08-12 11:15:00+00', NULL);


INSERT INTO audit_logs (asset_id, action, actor_type, actor_id, previous_hash, current_hash, hashed_at, details_canonical)
VALUES ('e5b5ce35-06d5-5ab8-be75-7cea27eb860a', 'upload', 'device', 'device_rig_38', NULL, 'f862817416fc2c28536d2f6e0d74a9c30d3f5d450e25264e5285715eceb9e31b', '2026-03-13 11:15:00+00', NULL);


INSERT INTO audit_logs (asset_id, action, actor_type, actor_id, previous_hash, current_hash, hashed_at, details_canonical)
VALUES ('547d607d-a390-558e-b625-32a329c53ef3', 'upload', 'device', 'device_rig_39', NULL, '543a3ddd3d71b655d35a0b7e4f6781a9f69b2e95c8cb0dd15fd4121c24498ab5', '2026-04-14 11:15:00+00', NULL);


INSERT INTO audit_logs (asset_id, action, actor_type, actor_id, previous_hash, current_hash, hashed_at, details_canonical)
VALUES ('e3f0598d-0503-55e7-b411-a0fffcbf533e', 'upload', 'device', 'device_rig_40', NULL, '0a4aae950e253a16cc2dff635d5a63aa31c0fdd9cad39a8605cdbb1d4da64372', '2026-05-15 11:15:00+00', NULL);


INSERT INTO audit_logs (asset_id, action, actor_type, actor_id, previous_hash, current_hash, hashed_at, details_canonical)
VALUES ('b47c3609-5ba0-5f67-8579-8269ec2019a6', 'upload', 'device', 'device_rig_41', NULL, '3cb4fa210bbc246dd306f25e6bfda0668ceca05d25aa9bb6466f2bfc8fa8fd5f', '2026-06-16 11:15:00+00', NULL);


INSERT INTO audit_logs (asset_id, action, actor_type, actor_id, previous_hash, current_hash, hashed_at, details_canonical)
VALUES ('36caf1b4-ce31-53f3-98d6-de7c6d37bd9a', 'upload', 'device', 'device_rig_42', NULL, 'b1dffa686b1923a71075b3a58edddfb7551de3684c086a518995284ba9e08a7b', '2026-07-17 11:15:00+00', NULL);


INSERT INTO audit_logs (asset_id, action, actor_type, actor_id, previous_hash, current_hash, hashed_at, details_canonical)
VALUES ('ff43b414-3aa7-5b79-bc95-045e186c3ee2', 'upload', 'device', 'device_rig_43', NULL, '0fe3bb7e6c36147ded9a361306b69506a4246e382d10e9a3023eb9aff95cc7ec', '2026-08-18 11:15:00+00', NULL);


INSERT INTO audit_logs (asset_id, action, actor_type, actor_id, previous_hash, current_hash, hashed_at, details_canonical)
VALUES ('7940f693-0460-50a6-b927-4dcde1353d62', 'upload', 'device', 'device_rig_44', NULL, 'fa2ade2b84a5dd9a89a8d2b0e22572b91f60f75e88093621f8b810140d2bc73a', '2026-03-19 11:15:00+00', NULL);


INSERT INTO audit_logs (asset_id, action, actor_type, actor_id, previous_hash, current_hash, hashed_at, details_canonical)
VALUES ('291443cf-a75a-50ae-89b1-2ce3f790a8d3', 'upload', 'device', 'device_rig_45', NULL, '0310385a3118cbd6a70981b75461c77de6fb0b36534b759879f26a22f35edda2', '2026-04-20 11:15:00+00', NULL);


INSERT INTO audit_logs (asset_id, action, actor_type, actor_id, previous_hash, current_hash, hashed_at, details_canonical)
VALUES ('87c5f8db-58cf-56e3-aa32-e69366335c39', 'upload', 'device', 'device_rig_46', NULL, '5ac78f3c74020156bdddc5c6ea10e6d85ee8a0c247ed21cfb5ccca9bf0d46703', '2026-05-21 11:15:00+00', NULL);


INSERT INTO audit_logs (asset_id, action, actor_type, actor_id, previous_hash, current_hash, hashed_at, details_canonical)
VALUES ('d1c8df09-8cd4-5552-b562-e3b4b5d512ca', 'upload', 'device', 'device_rig_47', NULL, 'ec448f17ebd240a501727519ca193fe3c71de13e27618e3d897f40a818b29f38', '2026-06-22 11:15:00+00', NULL);


INSERT INTO audit_logs (asset_id, action, actor_type, actor_id, previous_hash, current_hash, hashed_at, details_canonical)
VALUES ('96cab2e5-99f2-5c47-9ff0-f5ed3c13374a', 'upload', 'device', 'device_rig_48', NULL, 'bc88afaf1e5a2539e96572b00dd124f577d9d65f4ac794ff8c2d9863f3db0636', '2026-07-23 11:15:00+00', NULL);


INSERT INTO audit_logs (asset_id, action, actor_type, actor_id, previous_hash, current_hash, hashed_at, details_canonical)
VALUES ('35f44138-04d1-5950-8233-c1a39595aa19', 'upload', 'device', 'device_rig_49', NULL, '04f94ef3c9717c228bf6e9589973405aac91708e7b7b2806dae9540a3e49c133', '2026-08-24 11:15:00+00', NULL);


INSERT INTO audit_logs (asset_id, action, actor_type, actor_id, previous_hash, current_hash, hashed_at, details_canonical)
VALUES ('451a0f74-6cdd-50a9-bd5e-0443dfb6d624', 'upload', 'device', 'device_rig_50', NULL, 'ec404281d60179097e977677a8a24f9948a770a3361674c35577188b4c2df97e', '2026-03-25 11:15:00+00', NULL);

-- Evidence Packages & Reports

INSERT INTO evidence_packages (
  id, project_id, org_id, name, asset_ids, change_event_ids, report_cloudinary_url, report_html_url, status, generated_at
) VALUES (
  '770e8400-e29b-41d4-a716-446655440001', 'd17c2c6f-22da-4e08-b66f-9885ec33343e', '137cb278-8f28-46fc-b005-8494a4628b48',
  'Aravalli Sapling Plantation Audit & Carbon Offset Package',
  ARRAY['fdf13671-28bc-5c76-bd90-69a732f605f4'::uuid, 'd901fe32-cf82-5e07-aef8-99eaef9833ae'::uuid, 'ec96cc40-16d0-52e1-96fd-ec44c36d7eda'::uuid, '991760ad-1968-55fe-8793-4ce70ad56ed5'::uuid],
  ARRAY['550e8400-e29b-41d4-a716-446655440001'::uuid, '550e8400-e29b-41d4-a716-446655440002'::uuid],
  'https://res.cloudinary.com/o2ystfbm/raw/upload/v1/reports/aravalli_plantation_audit_report.pdf',
  'https://res.cloudinary.com/o2ystfbm/raw/upload/v1/reports/aravalli_plantation_audit_report.html',
  'finalized', '2026-03-01 12:00:00+00'
), (
  '770e8400-e29b-41d4-a716-446655440002', 'cbe3725d-6b0a-4c7a-bc3d-37b8488f1dd5', '137cb278-8f28-46fc-b005-8494a4628b48',
  'Yamuna River Cleanup & Water Quality Compliance Report',
  ARRAY['414786df-9aca-5b8d-8ec4-a89e5885f3ad'::uuid, 'dd0d390a-7e4c-5c67-8505-f9a491d79f65'::uuid, '603709a2-f75e-5ddf-a032-5c36c5628a7a'::uuid, '5b15e479-ed93-5a51-bef0-c85175a6abc8'::uuid],
  ARRAY['550e8400-e29b-41d4-a716-446655440003'::uuid, '550e8400-e29b-41d4-a716-446655440004'::uuid],
  'https://res.cloudinary.com/o2ystfbm/raw/upload/v1/reports/yamuna_cleanup_audit_report.pdf',
  'https://res.cloudinary.com/o2ystfbm/raw/upload/v1/reports/yamuna_cleanup_audit_report.html',
  'finalized', '2026-03-02 14:00:00+00'
);

ALTER TABLE assets ENABLE TRIGGER assets_evidence_no_delete;
ALTER TABLE assets ENABLE TRIGGER assets_evidence_immutable;
COMMIT;