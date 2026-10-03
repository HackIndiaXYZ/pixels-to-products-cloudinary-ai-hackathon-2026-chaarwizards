import json
import uuid
import hashlib

org_id = '137cb278-8f28-46fc-b005-8494a4628b48'
proj_water_id = 'cbe3725d-6b0a-4c7a-bc3d-37b8488f1dd5'
proj_forest_id = 'd17c2c6f-22da-4e08-b66f-9885ec33343e'

def gen_uuid(seed_str):
    return str(uuid.uuid5(uuid.NAMESPACE_DNS, seed_str))

def compute_audit_hash(prev_hash, action, actor_type, actor_id, details_canonical, hashed_at_iso):
    p_prev = prev_hash if prev_hash else 'genesis'
    p_act = action if action else ''
    p_act_type = actor_type if actor_type else ''
    p_act_id = actor_id if actor_id else ''
    p_det = details_canonical if details_canonical else 'null'
    msg = f"{p_prev}|{p_act}|{p_act_type}|{p_act_id}|{p_det}|{hashed_at_iso}"
    return hashlib.sha256(msg.encode('utf-8')).hexdigest()

assets = []
forest_asset_ids = []
water_asset_ids = []

forest_images = [
    "https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?w=800&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1448375240586-882707db888b?w=800&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1511497584788-8767611136f6?w=800&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1473448912268-2022ce9509d8?w=800&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1502082553048-f009c37129b9?w=800&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=800&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1513836279014-a89f7a76ae86?w=800&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1476231682828-37e571bc172f?w=800&auto=format&fit=crop&q=80",
]

water_images = [
    "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1437719417032-8595fd9e9dc6?w=800&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=800&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=800&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1497436072909-60f360e1d4b1?w=800&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=800&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=800&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1426604966848-d7adac402bff?w=800&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=800&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1472214103451-9374bd1c798e?w=800&auto=format&fit=crop&q=80",
]

# Generate 25 Forestry assets
for i in range(25):
    asset_id = gen_uuid(f"forest_asset_{i+1}")
    forest_asset_ids.append(asset_id)
    public_id = f"{forest_images[i % len(forest_images)]}&forest_asset_id={i+1:02d}"

    # First 20 passed (80%), 2 failed, 3 pending -> Total Forestry: 20 pass, 2 fail, 3 pending
    if i < 20:
        verif = 'passed'
        status = 'verified'
        quarantined = None
        hash_val = f"f{i:02x}" * 31
        hash_val = (hash_val + "00000000")[:64]
        commit_hash = hash_val
        cap_sig = f"sig_forest_{i+1:02d}"
    elif i < 22:
        verif = 'failed'
        status = 'flagged'
        quarantined = "'2026-03-01 10:00:00+00'"
        hash_val = f"f{i:02x}" * 31
        hash_val = (hash_val + "00000000")[:64]
        commit_hash = f"tampered_f_{i+1:02d}" * 3
        cap_sig = None
    else:
        verif = 'pending'
        status = 'pending'
        quarantined = None
        hash_val = f"f{i:02x}" * 31
        hash_val = (hash_val + "00000000")[:64]
        commit_hash = hash_val
        cap_sig = f"sig_forest_{i+1:02d}"

    lon = 76.9500 + (i * 0.002)
    lat = 28.3600 + (i * 0.001)
    phase = 'before' if i % 2 == 0 else 'after'
    month = 2 + (i % 7)
    day = 1 + (i % 25)
    ts = f"2026-{month:02d}-{day:02d} 09:30:00+00"
    
    assets.append({
        'id': asset_id,
        'project_id': proj_forest_id,
        'public_id': public_id,
        'cld_asset_id': f"cld_asset_forest_{i+1:02d}",
        'ts': ts,
        'commit_hash': commit_hash,
        'hash_val': hash_val,
        'cap_sig': cap_sig,
        'lon': lon,
        'lat': lat,
        'caption': f"Aravalli Sapling Plantation survey plot A{i+1:02d} ({phase} phase)",
        'observation_type': 'mangrove_planting',
        'phase': phase,
        'verification': verif,
        'upload_status': status,
        'quarantined_at': quarantined,
        'tags': json.dumps(["sapling", "aravalli", "plantation", phase, "healthy"])
    })

# Generate 25 Water assets
for i in range(25):
    asset_id = gen_uuid(f"water_asset_{i+1}")
    water_asset_ids.append(asset_id)
    public_id = f"{water_images[i % len(water_images)]}&water_asset_id={i+1:02d}"

    # 20 passed (80%), 3 failed, 2 pending -> Total Water: 20 pass, 3 fail, 2 pending
    if i < 20:
        verif = 'passed'
        status = 'verified'
        quarantined = None
        hash_val = f"w{i:02x}" * 31
        hash_val = (hash_val + "00000000")[:64]
        commit_hash = hash_val
        cap_sig = f"sig_water_{i+1:02d}"
    elif i < 23:
        verif = 'failed'
        status = 'flagged'
        quarantined = "'2026-03-02 12:00:00+00'"
        hash_val = f"w{i:02x}" * 31
        hash_val = (hash_val + "00000000")[:64]
        commit_hash = f"tampered_w_{i+1:02d}" * 3
        cap_sig = None
    else:
        verif = 'pending'
        status = 'pending'
        quarantined = None
        hash_val = f"w{i:02x}" * 31
        hash_val = (hash_val + "00000000")[:64]
        commit_hash = hash_val
        cap_sig = f"sig_water_{i+1:02d}"

    lon = 77.3000 + (i * 0.001)
    lat = 28.5400 + (i * 0.001)
    phase = 'before' if i % 2 == 0 else 'after'
    month = 3 + (i % 6)
    day = 1 + (i % 25)
    ts = f"2026-{month:02d}-{day:02d} 11:15:00+00"
    
    assets.append({
        'id': asset_id,
        'project_id': proj_water_id,
        'public_id': public_id,
        'cld_asset_id': f"cld_asset_water_{i+1:02d}",
        'ts': ts,
        'commit_hash': commit_hash,
        'hash_val': hash_val,
        'cap_sig': cap_sig,
        'lon': lon,
        'lat': lat,
        'caption': f"Yamuna River Cleanup survey section W{i+1:02d} ({phase} phase)",
        'observation_type': 'water_extent',
        'phase': phase,
        'verification': verif,
        'upload_status': status,
        'quarantined_at': quarantined,
        'tags': json.dumps(["water_cleanup", "yamuna", "wetland", phase, "restored"])
    })

sql_lines = []
sql_lines.append("-- Seed Demo Data for Panchnama (Cloudinary Hackathon)")
sql_lines.append("-- 50 Assets, 80% Authenticity Verified Rate (40/50), 5 Quarantined, 5 Pending")
sql_lines.append("BEGIN;")
sql_lines.append("ALTER TABLE assets DISABLE TRIGGER assets_evidence_no_delete;")
sql_lines.append("ALTER TABLE assets DISABLE TRIGGER assets_evidence_immutable;")
sql_lines.append("DELETE FROM report_manifest_entries;")
sql_lines.append("DELETE FROM evidence_packages;")
sql_lines.append("DELETE FROM audit_logs;")
sql_lines.append("DELETE FROM asset_derivatives;")
sql_lines.append("DELETE FROM change_events;")
sql_lines.append("DELETE FROM observations;")
sql_lines.append("DELETE FROM assets;")
sql_lines.append("DELETE FROM projects;")
sql_lines.append("DELETE FROM invite_tokens;")
sql_lines.append("DELETE FROM sync_state;")
sql_lines.append("DELETE FROM orgs;")

# Org
sql_lines.append(f"""
INSERT INTO orgs (id, name, type, quota_bytes, bytes_used, retention_years)
VALUES ('{org_id}', 'Prakriti Ecological Restoration Foundation', 'ngo', 53687091200, 24500000, 7);
""")

# Users
sql_lines.append(f"""
UPDATE auth.users 
SET raw_app_meta_data = jsonb_build_object(
  'org_id', '{org_id}',
  'role', CASE WHEN email LIKE 'admin%' THEN 'platform_admin' ELSE 'org_admin' END,
  'provider', 'email',
  'providers', ARRAY['email']
)
WHERE email IN ('admin@demo.local', 'orgadmin@demo.local');
""")

# Projects
sql_lines.append(f"""
INSERT INTO projects (id, org_id, name, sector, geometry, start_date, end_date, config)
VALUES 
('{proj_water_id}', '{org_id}', 'Yamuna River Cleanup & Wetland Restoration', 'water',
 ST_GeomFromText('POLYGON((77.3000 28.5400, 77.3300 28.5400, 77.3300 28.5700, 77.3000 28.5700, 77.3000 28.5400))', 4326),
 '2026-01-10', '2026-12-31',
 '{{"observation_types": [{{"type": "water_extent", "label": "Yamuna Water Cleanup & Plastic Extent", "model": "water", "gps_radius": 100}}], "report_template": "default"}}'::jsonb),

('{proj_forest_id}', '{org_id}', 'Aravalli Green Wall & Sapling Plantation', 'forestry',
 ST_GeomFromText('POLYGON((76.9500 28.3600, 77.0100 28.3600, 77.0100 28.4000, 76.9500 28.4000, 76.9500 28.3600))', 4326),
 '2026-02-01', '2026-12-31',
 '{{"observation_types": [{{"type": "mangrove_planting", "label": "Aravalli Sapling Plantation & Canopy Growth", "model": "forestry", "gps_radius": 100}}], "report_template": "default"}}'::jsonb);
""")

# Assets
sql_lines.append("-- 50 Evidence Assets (40 verified/passed = 80%, 5 failed/quarantined, 5 pending)")
for a in assets:
    cap_sig_str = f"'{a['cap_sig']}'" if a['cap_sig'] else 'NULL'
    quar_str = a['quarantined_at'] if a['quarantined_at'] else 'NULL'
    verif_at = f"'{a['ts']}'" if a['verification'] == 'passed' else 'NULL'
    
    sql_lines.append(f"""
INSERT INTO assets (
  id, project_id, org_id, cloudinary_public_id, cloudinary_asset_id, asset_type,
  device_capture_timestamp, device_commit_hash, device_id, device_public_key, capture_signature,
  gps_point, gps_accuracy_meters, gps_altitude, gps_provider, gps_timestamp,
  caption, caption_signature, exif, exif_hash, sha256_hash, ai_tags, observation_type, phase, app_version,
  server_upload_timestamp, server_received_at, upload_started_at, signature_tier, verification, verified_at, quarantined_at, upload_status
) VALUES (
  '{a['id']}', '{a['project_id']}', '{org_id}', '{a['public_id']}', '{a['cld_asset_id']}', 'image',
  '{a['ts']}', '{a['commit_hash']}', 'device_field_rig_{a['id'][:8]}', 'MCowBQYDK2VwAyEA48a62a9c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c', 'sig_commit_{a['id'][:8]}',
  ST_SetSRID(ST_MakePoint({a['lon']:.4f}, {a['lat']:.4f}), 4326)::geography, 2.4, 250.0, 'gps', '{a['ts']}',
  '{a['caption']}', {cap_sig_str}, '{{"Make": "Apple", "Model": "iPhone 15 Pro", "DateTimeOriginal": "{a['ts']}"}}'::jsonb,
  '{a['hash_val']}', '{a['hash_val']}', '{a['tags']}'::jsonb, '{a['observation_type']}', '{a['phase']}', '1.0.0',
  '{a['ts']}', '{a['ts']}', '{a['ts']}', 'device', '{a['verification']}', {verif_at}, {quar_str}, '{a['upload_status']}'
);
""")

# Change events
change_events = [
    {
        'id': '550e8400-e29b-41d4-a716-446655440001',
        'project_id': proj_forest_id,
        'before_id': forest_asset_ids[0],
        'after_id': forest_asset_ids[1],
        'type': 'sapling_plantation',
        'method': 'yolo_v8_changeformer',
        'model_ver': 'v1.0',
        'conf': 0.94,
        'diff_mask': 'cld-sample-2',
        'metrics': {
            "saplings_counted_before": 10,
            "saplings_counted_after": 45,
            "canopy_coverage_pct_before": 12.0,
            "canopy_coverage_pct_after": 34.8,
            "survival_rate_pct_before": 0,
            "survival_rate_pct_after": 90.0,
            "area_hectares_before": 0.42,
            "area_hectares_after": 0.42,
            "health_index_before": 0.45,
            "health_index_after": 0.88
        }
    },
    {
        'id': '550e8400-e29b-41d4-a716-446655440002',
        'project_id': proj_forest_id,
        'before_id': forest_asset_ids[2],
        'after_id': forest_asset_ids[3],
        'type': 'canopy_growth',
        'method': 'yolo_v8_changeformer',
        'model_ver': 'v1.0',
        'conf': 0.96,
        'diff_mask': 'cld-sample-4',
        'metrics': {
            "trees_identified_before": 22,
            "trees_identified_after": 88,
            "canopy_area_sqm_before": 350,
            "canopy_area_sqm_after": 1420,
            "vegetation_index_before": 0.32,
            "vegetation_index_after": 0.78
        }
    },
    {
        'id': '550e8400-e29b-41d4-a716-446655440003',
        'project_id': proj_water_id,
        'before_id': water_asset_ids[0],
        'after_id': water_asset_ids[1],
        'type': 'water_cleanup',
        'method': 'yolo_v8_changeformer',
        'model_ver': 'v1.0',
        'conf': 0.92,
        'diff_mask': 'samples/landscapes/nature-water',
        'metrics': {
            "water_surface_area_sqm_before": 5000,
            "water_surface_area_sqm_after": 12500,
            "debris_coverage_pct_before": 68.5,
            "debris_coverage_pct_after": 4.2,
            "water_clarity_index_before": 0.35,
            "water_clarity_index_after": 0.82,
            "dissolved_oxygen_mg_l_before": 2.1,
            "dissolved_oxygen_mg_l_after": 5.4,
            "turbidity_ntu_before": 45.0,
            "turbidity_ntu_after": 12.1
        }
    },
    {
        'id': '550e8400-e29b-41d4-a716-446655440004',
        'project_id': proj_water_id,
        'before_id': water_asset_ids[2],
        'after_id': water_asset_ids[3],
        'type': 'wetland_restoration',
        'method': 'yolo_v8_changeformer',
        'model_ver': 'v1.0',
        'conf': 0.95,
        'diff_mask': 'samples/landscapes/beach-boat',
        'metrics': {
            "water_volume_kl_before": 1200,
            "water_volume_kl_after": 4800,
            "plastic_waste_kg_before": 850,
            "plastic_waste_kg_after": 15,
            "biodiversity_score_before": 0.25,
            "biodiversity_score_after": 0.85
        }
    },
    {
        'id': '550e8400-e29b-41d4-a716-446655440005',
        'project_id': proj_forest_id,
        'before_id': forest_asset_ids[4],
        'after_id': forest_asset_ids[5],
        'type': 'reforestation_phase2',
        'method': 'yolo_v8_changeformer',
        'model_ver': 'v1.0',
        'conf': 0.91,
        'diff_mask': 'cld-sample-1',
        'metrics': {
            "green_density_pct_before": 15.4,
            "green_density_pct_after": 62.1,
            "biomass_index_before": 1.2,
            "biomass_index_after": 4.8
        }
    },
    {
        'id': '550e8400-e29b-41d4-a716-446655440006',
        'project_id': proj_water_id,
        'before_id': water_asset_ids[4],
        'after_id': water_asset_ids[5],
        'type': 'riverbank_clearing',
        'method': 'yolo_v8_changeformer',
        'model_ver': 'v1.0',
        'conf': 0.93,
        'diff_mask': 'cld-sample-5',
        'metrics': {
            "waste_piles_count_before": 18,
            "waste_piles_count_after": 0,
            "cleared_length_meters_before": 0,
            "cleared_length_meters_after": 450
        }
    }
]

sql_lines.append("-- Paired Change Events with Masks and Clean Metrics")
for ce in change_events:
    sql_lines.append(f"""
INSERT INTO change_events (
  id, project_id, org_id, before_asset_id, after_asset_id, change_type, change_metrics,
  detection_method, model_version, confidence, diff_asset_cloudinary_id, gps_distance_meters, time_difference_hours, status
) VALUES (
  '{ce['id']}', '{ce['project_id']}', '{org_id}', '{ce['before_id']}', '{ce['after_id']}', '{ce['type']}',
  '{json.dumps(ce['metrics'])}'::jsonb, '{ce['method']}', '{ce['model_ver']}', {ce['conf']}, '{ce['diff_mask']}',
  28.4, 120.0, 'detected'
);
""")

# Observations
sql_lines.append("-- Observations")
for i, a in enumerate(assets[:10]):
    sql_lines.append(f"""
INSERT INTO observations (id, asset_id, project_id, org_id, observation_type, metrics, notes)
VALUES (gen_random_uuid(), '{a['id']}', '{a['project_id']}', '{org_id}', '{a['observation_type']}',
 '{{"field_score": 0.92, "inspected_by": "Field Inspector Unit {i+1}"}}'::jsonb,
 'Verified field observation for {a['caption']}. Evidence chain intact.');
""")

# Audit Logs & Cryptographic Chain
sql_lines.append("-- Audit Logs & Cryptographic Chain")
for i, a in enumerate(assets):
    ts_str = a['ts']
    hashed_at_iso = f"{ts_str[:10]}T{ts_str[11:19]}.000000Z"
    actor_id = f"device_rig_{i+1}"
    curr_hash = compute_audit_hash(None, 'upload', 'device', actor_id, None, hashed_at_iso)
    sql_lines.append(f"""
INSERT INTO audit_logs (asset_id, action, actor_type, actor_id, previous_hash, current_hash, hashed_at, details_canonical)
VALUES ('{a['id']}', 'upload', 'device', '{actor_id}', NULL, '{curr_hash}', '{a['ts']}', NULL);
""")

# Evidence Packages (Audit-ready Reports)
sql_lines.append("-- Evidence Packages & Reports")
sql_lines.append(f"""
INSERT INTO evidence_packages (
  id, project_id, org_id, name, asset_ids, change_event_ids, report_cloudinary_url, report_html_url, status, generated_at
) VALUES (
  '770e8400-e29b-41d4-a716-446655440001', '{proj_forest_id}', '{org_id}',
  'Aravalli Sapling Plantation Audit & Carbon Offset Package',
  ARRAY['{forest_asset_ids[0]}'::uuid, '{forest_asset_ids[1]}'::uuid, '{forest_asset_ids[2]}'::uuid, '{forest_asset_ids[3]}'::uuid],
  ARRAY['550e8400-e29b-41d4-a716-446655440001'::uuid, '550e8400-e29b-41d4-a716-446655440002'::uuid],
  'https://res.cloudinary.com/o2ystfbm/raw/upload/v1/reports/aravalli_plantation_audit_report.pdf',
  'https://res.cloudinary.com/o2ystfbm/raw/upload/v1/reports/aravalli_plantation_audit_report.html',
  'finalized', '2026-03-01 12:00:00+00'
), (
  '770e8400-e29b-41d4-a716-446655440002', '{proj_water_id}', '{org_id}',
  'Yamuna River Cleanup & Water Quality Compliance Report',
  ARRAY['{water_asset_ids[0]}'::uuid, '{water_asset_ids[1]}'::uuid, '{water_asset_ids[2]}'::uuid, '{water_asset_ids[3]}'::uuid],
  ARRAY['550e8400-e29b-41d4-a716-446655440003'::uuid, '550e8400-e29b-41d4-a716-446655440004'::uuid],
  'https://res.cloudinary.com/o2ystfbm/raw/upload/v1/reports/yamuna_cleanup_audit_report.pdf',
  'https://res.cloudinary.com/o2ystfbm/raw/upload/v1/reports/yamuna_cleanup_audit_report.html',
  'finalized', '2026-03-02 14:00:00+00'
);
""")

sql_lines.append("ALTER TABLE assets ENABLE TRIGGER assets_evidence_no_delete;")
sql_lines.append("ALTER TABLE assets ENABLE TRIGGER assets_evidence_immutable;")
sql_lines.append("COMMIT;")

full_sql = "\n".join(sql_lines)
with open("scripts/seed_demo_data.sql", "w") as f:
    f.write(full_sql)

with open("supabase/seed.sql", "w") as f:
    f.write(full_sql)

print("Regenerated seed files with BIGSERIAL audit_logs!")
