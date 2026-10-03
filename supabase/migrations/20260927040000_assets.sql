-- Phase 1 — Assets (photos/videos from the capture app)
-- Source: docs/architecture/DATABASE_SCHEMA.md §Assets + §"New columns required".
--
-- SCHEMA ADDITIONS beyond the CREATE TABLE block in DATABASE_SCHEMA.md
-- (documented per system invariants — additive only, no evidence column mutated):
--   * verification / verified_at / quarantined_at / notes
--     The §Assets DDL block defines only `upload_status`, but the same doc's
--     "Legitimate asset updates" table, system invariants (`assets.verification =
--     'failed'`), ARCHITECTURE.md §329 (`verification != 'passed'`) and
--     Phase all reference a `verification` column plus `verified_at`.
--     `upload_status` is retained (api-contracts.md returns it) as the coarse
--     ingest state; `verification` is the three-state integrity result.
--   * The six "New columns required" fields (upload_started_at,
--     device_monotonic_ms, ntp_offset_seconds, signature_tier,
--     exif_verified_at, caption_verified_at) are folded into CREATE TABLE
--     rather than a follow-on ALTER, since this is the first migration to
--     create the table.

CREATE TABLE assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) NOT NULL,
  org_id UUID REFERENCES orgs(id) NOT NULL,

  -- Cloudinary identifiers
  cloudinary_public_id TEXT UNIQUE NOT NULL,
  cloudinary_asset_id TEXT,
  asset_type TEXT CHECK (asset_type IN ('image', 'video')),

  -- Device capture evidence (immutable after insert)
  device_capture_timestamp TIMESTAMPTZ NOT NULL,
  device_commit_hash TEXT NOT NULL,           -- SHA-256 = commitId from app
  device_id TEXT NOT NULL,
  device_public_key TEXT NOT NULL,            -- Ed25519 public key
  capture_signature TEXT NOT NULL,            -- Ed25519 signature of commit
  device_monotonic_ms BIGINT,                 -- monotonic counter in signed payload
  ntp_offset_seconds NUMERIC,                 -- signed NTP offset at capture; NULL => skew unknown

  -- GPS with accuracy
  gps_point GEOGRAPHY(POINT, 4326),
  gps_accuracy_meters FLOAT,
  gps_altitude FLOAT,
  gps_provider TEXT,                          -- 'gps' | 'network' | 'fused' | 'passive'
  gps_timestamp TIMESTAMPTZ,

  -- Caption (optional, signed) — mutable, but editing invalidates the signature
  caption TEXT,
  caption_signature TEXT,
  caption_language TEXT,
  caption_created_at TIMESTAMPTZ,

  -- EXIF (frozen at capture, PascalCase keys) — evidence
  exif JSONB,
  exif_hash TEXT NOT NULL,                    -- SHA-256 of frozen EXIF (JCS in API)

  -- SHA-256 of original file — evidence
  sha256_hash TEXT NOT NULL,

  -- Video-specific fields
  duration_seconds FLOAT,
  keyframe_timestamps FLOAT[],
  keyframe_cloudinary_ids TEXT[],
  thumbnail_cloudinary_id TEXT,

  -- AI enrichment
  ai_tags JSONB DEFAULT '[]',
  custom_metadata JSONB DEFAULT '{}',

  -- Signals harvested ONCE from Cloudinary at ingest, then owned by Postgres.
  -- Never queried back from Cloudinary .
  phash TEXT,
  dominant_colors TEXT[],
  cloudinary_quality_score FLOAT,
  face_count INT,
  cloudinary_metadata_at TIMESTAMPTZ,

  -- Observation context
  observation_type TEXT,
  phase TEXT CHECK (phase IN ('before', 'after')),
  app_version TEXT,
  notes TEXT,

  -- Server timestamps (immutable after insert)
  server_upload_timestamp TIMESTAMPTZ,        -- Cloudinary server time (created_at)
  server_received_at TIMESTAMPTZ DEFAULT now(), -- our API receipt time
  upload_started_at TIMESTAMPTZ,              -- client clock before upload — isolates dwell

  -- Verification lifecycle (mutable by webhook / verification worker)
  signature_tier TEXT CHECK (signature_tier IN ('device', 'server')),
  verification TEXT NOT NULL DEFAULT 'pending'
    CHECK (verification IN ('pending', 'passed', 'failed', 'unknown')),
  verified_at TIMESTAMPTZ,
  quarantined_at TIMESTAMPTZ,                 -- set on any integrity fail (Phase 3)
  exif_verified_at TIMESTAMPTZ,               -- when the API confirmed the JCS EXIF hash
  caption_verified_at TIMESTAMPTZ,            -- when the API confirmed the Ed25519 caption sig
  upload_status TEXT DEFAULT 'pending' CHECK (upload_status IN ('pending', 'verified', 'flagged')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_assets_project_time ON assets(project_id, device_capture_timestamp);
CREATE INDEX idx_assets_gps ON assets USING GIST(gps_point);
CREATE INDEX idx_assets_gps_accuracy ON assets(gps_accuracy_meters) WHERE gps_accuracy_meters IS NOT NULL;
CREATE INDEX idx_assets_commit_hash ON assets(device_commit_hash);
CREATE INDEX idx_assets_status ON assets(upload_status);
CREATE INDEX idx_assets_verification ON assets(verification);
CREATE INDEX idx_assets_observation ON assets(project_id, observation_type, phase);
-- Near-duplicate / same-site search: trigram GIN so `phash <-> $1 < 0.1` stays
-- index-assisted (DATABASE_SCHEMA.md §Audit Logs note).
CREATE INDEX idx_assets_phash ON assets USING GIN (phash gin_trgm_ops);

-- RLS. The API connects as a dedicated NON-superuser role, not service_role, so
-- RLS and column grants actually apply to application code.
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "assets_org_scope" ON assets FOR SELECT
  USING (org_id = (auth.jwt() ->> 'org_id')::uuid);

-- There is deliberately NO insert policy for assets. Uploads are ingested by the
-- webhook handler through the service role, which bypasses RLS by design. An
-- earlier draft had WITH CHECK (true), which granted every caller -- anon
-- included -- the right to insert into any org. Never do that .
--
-- The webhook derives org_id from the verified signature's org claim, never from
-- the request body's context field.

-- Column-level immutability (defence in depth for anon/authenticated).
-- REVOKE the table-wide UPDATE first: a column-level REVOKE does not subtract
-- from a table-level grant, so we must drop the broad grant and re-grant only
-- the mutable columns. The BEFORE UPDATE trigger below is the real control —
-- it fires for every role, including service_role .
REVOKE UPDATE ON assets FROM anon, authenticated;
GRANT UPDATE (
  caption, caption_signature, caption_language, caption_created_at, caption_verified_at,
  phase, notes, observation_type, app_version,
  ai_tags, custom_metadata,
  phash, dominant_colors, cloudinary_quality_score, face_count, cloudinary_metadata_at,
  keyframe_timestamps, keyframe_cloudinary_ids, thumbnail_cloudinary_id, duration_seconds,
  signature_tier, verification, verified_at, quarantined_at, exif_verified_at, upload_status
) ON assets TO authenticated;

-- Evidence immutability trigger. Fires BEFORE UPDATE for EVERY role including
-- service_role and superusers, which bypass RLS and column grants. This is the
-- authoritative control .
CREATE OR REPLACE FUNCTION assets_prevent_evidence_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.org_id                   IS DISTINCT FROM OLD.org_id
     OR NEW.project_id            IS DISTINCT FROM OLD.project_id
     OR NEW.asset_type            IS DISTINCT FROM OLD.asset_type
     OR NEW.cloudinary_public_id  IS DISTINCT FROM OLD.cloudinary_public_id
     OR NEW.cloudinary_asset_id   IS DISTINCT FROM OLD.cloudinary_asset_id
     OR NEW.sha256_hash           IS DISTINCT FROM OLD.sha256_hash
     OR NEW.exif_hash             IS DISTINCT FROM OLD.exif_hash
     OR NEW.exif                  IS DISTINCT FROM OLD.exif
     OR NEW.device_capture_timestamp IS DISTINCT FROM OLD.device_capture_timestamp
     OR NEW.device_commit_hash    IS DISTINCT FROM OLD.device_commit_hash
     OR NEW.device_id             IS DISTINCT FROM OLD.device_id
     OR NEW.device_public_key     IS DISTINCT FROM OLD.device_public_key
     OR NEW.device_monotonic_ms   IS DISTINCT FROM OLD.device_monotonic_ms
     OR NEW.capture_signature     IS DISTINCT FROM OLD.capture_signature
     OR NEW.ntp_offset_seconds    IS DISTINCT FROM OLD.ntp_offset_seconds
     OR NEW.gps_point             IS DISTINCT FROM OLD.gps_point
     OR NEW.gps_accuracy_meters   IS DISTINCT FROM OLD.gps_accuracy_meters
     OR NEW.gps_altitude          IS DISTINCT FROM OLD.gps_altitude
     OR NEW.gps_provider          IS DISTINCT FROM OLD.gps_provider
     OR NEW.gps_timestamp         IS DISTINCT FROM OLD.gps_timestamp
     OR NEW.server_upload_timestamp IS DISTINCT FROM OLD.server_upload_timestamp
     OR NEW.server_received_at    IS DISTINCT FROM OLD.server_received_at
     OR NEW.upload_started_at     IS DISTINCT FROM OLD.upload_started_at
  THEN
    RAISE EXCEPTION 'assets evidence columns are immutable (asset %)', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER assets_evidence_immutable
  BEFORE UPDATE ON assets
  FOR EACH ROW EXECUTE FUNCTION assets_prevent_evidence_update();

-- Source evidence is never DELETEd either . RLS has no DELETE policy, so anon/authenticated
-- are already blocked — but service_role and the table owner bypass RLS, and the
-- immutability story above is authoritative precisely because it fires for those
-- roles. A BEFORE DELETE trigger closes the matching hole: an original asset row,
-- with or without derivatives, can never be removed. A retention purge is a
-- deliberate, separate, audited operation — not an ad-hoc DELETE.
CREATE OR REPLACE FUNCTION assets_prevent_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'assets rows are immutable source evidence and cannot be deleted (asset %)', OLD.id
    USING ERRCODE = 'check_violation';
END;
$$;

CREATE TRIGGER assets_evidence_no_delete
  BEFORE DELETE ON assets
  FOR EACH ROW EXECUTE FUNCTION assets_prevent_delete();
