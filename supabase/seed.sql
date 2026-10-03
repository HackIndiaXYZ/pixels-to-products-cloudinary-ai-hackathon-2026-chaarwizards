-- Seed Demo Data for Panchnama (Cloudinary Hackathon)
-- Single Organization: Prakriti Ecological Restoration Foundation
-- Two Projects: Yamuna Water Cleanup & Aravalli Sapling Plantation

BEGIN;

-- Temporarily disable evidence immutability triggers for administrative re-seeding
ALTER TABLE assets DISABLE TRIGGER assets_evidence_no_delete;
ALTER TABLE assets DISABLE TRIGGER assets_evidence_immutable;

-- 1. Clean up dependent tables first
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

-- 2. Create the single demo organization
INSERT INTO orgs (
  id,
  name,
  type,
  quota_bytes,
  bytes_used,
  retention_years
) VALUES (
  '137cb278-8f28-46fc-b005-8494a4628b48',
  'Prakriti Ecological Restoration Foundation',
  'ngo',
  53687091200,
  1197769,
  7
);

-- 3. Update auth.users so demo users belong to this organization
UPDATE auth.users 
SET raw_app_meta_data = jsonb_build_object(
  'org_id', '137cb278-8f28-46fc-b005-8494a4628b48',
  'role', CASE WHEN email LIKE 'admin%' THEN 'platform_admin' ELSE 'org_admin' END,
  'provider', 'email',
  'providers', ARRAY['email']
)
WHERE email IN ('admin@demo.local', 'orgadmin@demo.local');

-- 4. Create Project 1: Water Cleanup (Yamuna River, Kalindi Ghat, New Delhi)
INSERT INTO projects (
  id,
  org_id,
  name,
  sector,
  geometry,
  start_date,
  end_date,
  config
) VALUES (
  'cbe3725d-6b0a-4c7a-bc3d-37b8488f1dd5',
  '137cb278-8f28-46fc-b005-8494a4628b48',
  'Yamuna River Cleanup & Wetland Restoration',
  'water',
  ST_GeomFromText('POLYGON((77.3000 28.5400, 77.3150 28.5400, 77.3150 28.5520, 77.3000 28.5520, 77.3000 28.5400))', 4326),
  '2026-01-10',
  '2026-12-31',
  '{
    "observation_types": [
      { "type": "water_extent", "label": "Yamuna Water Cleanup & Plastic Extent", "model": "water", "gps_radius": 100 }
    ],
    "report_template": "default"
  }'::jsonb
);

-- 5. Create Project 2: Sapling Planting (Aravalli Range, Shikohpur Reserve, Gurugram)
INSERT INTO projects (
  id,
  org_id,
  name,
  sector,
  geometry,
  start_date,
  end_date,
  config
) VALUES (
  'd17c2c6f-22da-4e08-b66f-9885ec33343e',
  '137cb278-8f28-46fc-b005-8494a4628b48',
  'Aravalli Green Wall & Sapling Plantation',
  'forestry',
  ST_GeomFromText('POLYGON((76.9500 28.3600, 77.0000 28.3600, 77.0000 28.3900, 76.9500 28.3900, 76.9500 28.3600))', 4326),
  '2026-02-01',
  '2026-12-31',
  '{
    "observation_types": [
      { "type": "mangrove_planting", "label": "Aravalli Sapling Plantation & Canopy Growth", "model": "forestry", "gps_radius": 100 }
    ],
    "report_template": "default"
  }'::jsonb
);

-- 6. Assets for Project 2: Sapling Plantation (Aravalli Range)
-- Baseline asset (Before)
INSERT INTO assets (
  id,
  project_id,
  org_id,
  cloudinary_public_id,
  cloudinary_asset_id,
  asset_type,
  device_capture_timestamp,
  device_commit_hash,
  device_id,
  device_public_key,
  capture_signature,
  gps_point,
  gps_accuracy_meters,
  gps_altitude,
  gps_provider,
  gps_timestamp,
  caption,
  exif,
  exif_hash,
  sha256_hash,
  ai_tags,
  observation_type,
  phase,
  app_version,
  upload_status
) VALUES (
  'f62702ab-597c-40f3-9f75-1b0404644cf0',
  'd17c2c6f-22da-4e08-b66f-9885ec33343e',
  '137cb278-8f28-46fc-b005-8494a4628b48',
  'evidence/137cb278-8f28-46fc-b005-8494a4628b48/d17c2c6f-22da-4e08-b66f-9885ec33343e/aravalli_sapling_before_v2',
  'cld_asset_aravalli_sapling_before_v2',
  'image',
  '2026-02-15 09:30:00+00',
  'a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e',
  'device_aravalli_field_01',
  'MCowBQYDK2VwAyEA48a62a9c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c',
  'sig_aravalli_before_01',
  ST_SetSRID(ST_MakePoint(76.9745, 28.3748), 4326)::geography,
  3.2,
  284.5,
  'gps',
  '2026-02-15 09:30:00+00',
  'Pre-plantation degraded land baseline survey - Plot A1 (Aravalli Range)',
  '{"Make": "Apple", "Model": "iPhone 15 Pro", "DateTimeOriginal": "2026:02:15 09:30:00", "FocalLength": "6.86 mm", "FNumber": 1.78}'::jsonb,
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
  '["sapling_planting", "degraded_land", "bare_soil", "aravalli", "baseline"]'::jsonb,
  'mangrove_planting',
  'before',
  '1.0.0',
  'verified'
);

-- After asset (Post-plantation)
INSERT INTO assets (
  id,
  project_id,
  org_id,
  cloudinary_public_id,
  cloudinary_asset_id,
  asset_type,
  device_capture_timestamp,
  device_commit_hash,
  device_id,
  device_public_key,
  capture_signature,
  gps_point,
  gps_accuracy_meters,
  gps_altitude,
  gps_provider,
  gps_timestamp,
  caption,
  exif,
  exif_hash,
  sha256_hash,
  ai_tags,
  observation_type,
  phase,
  app_version,
  upload_status
) VALUES (
  '89200069-4dac-4626-b63d-c78cc48fc9a4',
  'd17c2c6f-22da-4e08-b66f-9885ec33343e',
  '137cb278-8f28-46fc-b005-8494a4628b48',
  'evidence/137cb278-8f28-46fc-b005-8494a4628b48/d17c2c6f-22da-4e08-b66f-9885ec33343e/aravalli_sapling_after_v2',
  'cld_asset_aravalli_sapling_after_v2',
  'image',
  '2026-09-20 11:15:00+00',
  'b2c3d4e5f60718293a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f',
  'device_aravalli_field_01',
  'MCowBQYDK2VwAyEA48a62a9c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c',
  'sig_aravalli_after_01',
  ST_SetSRID(ST_MakePoint(76.9748, 28.3751), 4326)::geography,
  2.8,
  285.1,
  'gps',
  '2026-09-20 11:15:00+00',
  'Post-plantation verification survey - 45 healthy native saplings established',
  '{"Make": "Apple", "Model": "iPhone 15 Pro", "DateTimeOriginal": "2026:09:20 11:15:00", "FocalLength": "6.86 mm", "FNumber": 1.78}'::jsonb,
  'f4c8996fb92427ae41e4649b934ca495991b7852b855e3b0c44298fc1c149afb',
  '8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e',
  '["sapling", "forest_canopy", "vegetation", "afforestation", "aravalli", "healthy"]'::jsonb,
  'mangrove_planting',
  'after',
  '1.0.0',
  'verified'
);

-- 7. Assets for Project 1: Water Cleanup (Yamuna River)
-- Baseline asset (Before)
INSERT INTO assets (
  id,
  project_id,
  org_id,
  cloudinary_public_id,
  cloudinary_asset_id,
  asset_type,
  device_capture_timestamp,
  device_commit_hash,
  device_id,
  device_public_key,
  capture_signature,
  gps_point,
  gps_accuracy_meters,
  gps_altitude,
  gps_provider,
  gps_timestamp,
  caption,
  exif,
  exif_hash,
  sha256_hash,
  ai_tags,
  observation_type,
  phase,
  app_version,
  upload_status
) VALUES (
  '2161618f-b5dc-4d17-bfeb-ea16cbcbfe3a',
  'cbe3725d-6b0a-4c7a-bc3d-37b8488f1dd5',
  '137cb278-8f28-46fc-b005-8494a4628b48',
  'evidence/137cb278-8f28-46fc-b005-8494a4628b48/cbe3725d-6b0a-4c7a-bc3d-37b8488f1dd5/yamuna_cleanup_before_v2',
  'cld_asset_yamuna_cleanup_before_v2',
  'image',
  '2026-03-01 08:45:00+00',
  'c3d4e5f60718293a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a',
  'device_yamuna_field_02',
  'MCowBQYDK2VwAyEA99b73b0d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d',
  'sig_yamuna_before_01',
  ST_SetSRID(ST_MakePoint(77.3082, 28.5462), 4326)::geography,
  2.5,
  210.0,
  'gps',
  '2026-03-01 08:45:00+00',
  'Heavy plastic debris and hyacinth accumulation at Kalindi Ghat outfall',
  '{"Make": "Samsung", "Model": "Galaxy S24 Ultra", "DateTimeOriginal": "2026:03:01 08:45:00", "FocalLength": "6.3 mm", "FNumber": 1.7}'::jsonb,
  '996fb92427ae41e4649b934ca495991b7852b855e3b0c44298fc1c149afbf4c8',
  'a3bf4f1b2b0b822cd15d6c15b0f00a089f86d081884c7d659a2feaa0c55ad015',
  '["water_body", "floating_debris", "plastic_waste", "yamuna", "pre_cleanup"]'::jsonb,
  'water_extent',
  'before',
  '1.0.0',
  'verified'
);

-- After asset (Post-cleanup)
INSERT INTO assets (
  id,
  project_id,
  org_id,
  cloudinary_public_id,
  cloudinary_asset_id,
  asset_type,
  device_capture_timestamp,
  device_commit_hash,
  device_id,
  device_public_key,
  capture_signature,
  gps_point,
  gps_accuracy_meters,
  gps_altitude,
  gps_provider,
  gps_timestamp,
  caption,
  exif,
  exif_hash,
  sha256_hash,
  ai_tags,
  observation_type,
  phase,
  app_version,
  upload_status
) VALUES (
  'ef2060df-49fe-4b4b-ac33-6cb967cef89c',
  'cbe3725d-6b0a-4c7a-bc3d-37b8488f1dd5',
  '137cb278-8f28-46fc-b005-8494a4628b48',
  'evidence/137cb278-8f28-46fc-b005-8494a4628b48/cbe3725d-6b0a-4c7a-bc3d-37b8488f1dd5/yamuna_cleanup_after_v2',
  'cld_asset_yamuna_cleanup_after_v2',
  'image',
  '2026-09-25 14:00:00+00',
  'd4e5f60718293a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b',
  'device_yamuna_field_02',
  'MCowBQYDK2VwAyEA99b73b0d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d',
  'sig_yamuna_after_01',
  ST_SetSRID(ST_MakePoint(77.3085, 28.5465), 4326)::geography,
  2.1,
  210.2,
  'gps',
  '2026-09-25 14:00:00+00',
  'Post-cleanup verification - 1.24 tonnes floating waste cleared, open water restored',
  '{"Make": "Samsung", "Model": "Galaxy S24 Ultra", "DateTimeOriginal": "2026:09:25 14:00:00", "FocalLength": "6.3 mm", "FNumber": 1.7}'::jsonb,
  '41e4649b934ca495991b7852b855e3b0c44298fc1c149afbf4c8996fb92427ae',
  '15d6c15b0f00a089f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd',
  '["clean_water", "restored_wetland", "open_water", "yamuna", "post_cleanup"]'::jsonb,
  'water_extent',
  'after',
  '1.0.0',
  'verified'
);

-- 8. Change Events
-- Change Event 1: Sapling Plantation (Forestry)
INSERT INTO change_events (
  id,
  project_id,
  org_id,
  before_asset_id,
  after_asset_id,
  change_type,
  change_metrics,
  detection_method,
  model_version,
  confidence,
  gps_distance_meters,
  time_difference_hours,
  status
) VALUES (
  '550e8400-e29b-41d4-a716-446655440001',
  'd17c2c6f-22da-4e08-b66f-9885ec33343e',
  '137cb278-8f28-46fc-b005-8494a4628b48',
  'f62702ab-597c-40f3-9f75-1b0404644cf0',
  '89200069-4dac-4626-b63d-c78cc48fc9a4',
  'sapling_planting',
  '{
    "saplings_counted": 45,
    "canopy_coverage_pct": 34.8,
    "survival_rate_pct": 90.0,
    "area_hectares": 0.42,
    "health_index": 0.88,
    "primary_species": ["Acacia catechu (Khair)", "Azadirachta indica (Neem)", "Prosopis cineraria (Khejri)"]
  }'::jsonb,
  'cv_model_forestry',
  'v1.0',
  0.94,
  35.4,
  5210.0,
  'detected'
);

-- Change Event 2: Water Cleanup (Water)
INSERT INTO change_events (
  id,
  project_id,
  org_id,
  before_asset_id,
  after_asset_id,
  change_type,
  change_metrics,
  detection_method,
  model_version,
  confidence,
  gps_distance_meters,
  time_difference_hours,
  status
) VALUES (
  '550e8400-e29b-41d4-a716-446655440002',
  'cbe3725d-6b0a-4c7a-bc3d-37b8488f1dd5',
  '137cb278-8f28-46fc-b005-8494a4628b48',
  '2161618f-b5dc-4d17-bfeb-ea16cbcbfe3a',
  'ef2060df-49fe-4b4b-ac33-6cb967cef89c',
  'water_cleanup',
  '{
    "water_surface_area_sqm": 12500,
    "debris_removed_kg": 1240,
    "water_clarity_index": 0.82,
    "dissolved_oxygen_mg_l": 5.4,
    "turbidity_ntu": 12.1
  }'::jsonb,
  'cv_model_water',
  'v1.0',
  0.91,
  41.2,
  4997.0,
  'detected'
);

-- 9. Observations
INSERT INTO observations (
  id,
  asset_id,
  project_id,
  org_id,
  observation_type,
  metrics,
  notes
) VALUES (
  gen_random_uuid(),
  '89200069-4dac-4626-b63d-c78cc48fc9a4',
  'd17c2c6f-22da-4e08-b66f-9885ec33343e',
  '137cb278-8f28-46fc-b005-8494a4628b48',
  'mangrove_planting',
  '{"sapling_count": 45, "average_height_cm": 65, "health": "excellent"}'::jsonb,
  'Field inspection verified 45 surviving saplings out of 50 planted. Irrigation drip lines functional.'
), (
  gen_random_uuid(),
  'ef2060df-49fe-4b4b-ac33-6cb967cef89c',
  'cbe3725d-6b0a-4c7a-bc3d-37b8488f1dd5',
  '137cb278-8f28-46fc-b005-8494a4628b48',
  'water_extent',
  '{"debris_cleared_tonnes": 1.24, "dissolved_oxygen": 5.4, "pH": 7.2}'::jsonb,
  'Floating barrier skimmers completed waste extraction. Water clarity improved significantly.'
);

-- 10. Evidence Packages (Audit-ready Reports)
INSERT INTO evidence_packages (
  id,
  project_id,
  org_id,
  name,
  asset_ids,
  change_event_ids,
  status
) VALUES (
  '770e8400-e29b-41d4-a716-446655440001',
  'd17c2c6f-22da-4e08-b66f-9885ec33343e',
  '137cb278-8f28-46fc-b005-8494a4628b48',
  'Aravalli Sapling Plantation Audit & Carbon Offset Package',
  ARRAY['f62702ab-597c-40f3-9f75-1b0404644cf0'::uuid, '89200069-4dac-4626-b63d-c78cc48fc9a4'::uuid],
  ARRAY['550e8400-e29b-41d4-a716-446655440001'::uuid],
  'finalized'
), (
  '770e8400-e29b-41d4-a716-446655440002',
  'cbe3725d-6b0a-4c7a-bc3d-37b8488f1dd5',
  '137cb278-8f28-46fc-b005-8494a4628b48',
  'Yamuna River Cleanup & Water Quality Compliance Report',
  ARRAY['2161618f-b5dc-4d17-bfeb-ea16cbcbfe3a'::uuid, 'ef2060df-49fe-4b4b-ac33-6cb967cef89c'::uuid],
  ARRAY['550e8400-e29b-41d4-a716-446655440002'::uuid],
  'finalized'
);

-- Re-enable immutability triggers
ALTER TABLE assets ENABLE TRIGGER assets_evidence_no_delete;
ALTER TABLE assets ENABLE TRIGGER assets_evidence_immutable;

COMMIT;
