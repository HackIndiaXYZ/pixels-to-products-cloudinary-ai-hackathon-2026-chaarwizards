-- Phase 1 — Asset Derivatives (Cloudinary lineage) + assets.cloudinary_created_at
--
-- AGENTS.md §8 requires a migration plus a documented reason for any schema
-- change not already in docs/architecture/DATABASE_SCHEMA.md. This is that
-- migration, and here is the reason:
--
--   DATABASE_SCHEMA.md did not carry an `asset_derivatives` DDL block, so the
--   table did not exist. But six documents depend on it:
--     * AGENTS.md §3.1        — "any resize, crop, re-encode, caption, or
--                                generative edit creates a new row in
--                                asset_derivatives with a parent_asset_id and
--                                the exact transformation string"
--     * AGENTS.md §6          — "any new Cloudinary transformation is recorded
--                                in asset_derivatives with is_generative set
--                                correctly"
--     * ARCHITECTURE.md:66    — table listed in the Postgres layer
--     * ARCHITECTURE.md:194   — the BullMQ job "writes an asset_derivatives row
--                                on success"
--     * BUILD_ORDER.md        — Phase 1 "Derivative lineage" task and Phase 5
--                                createDerivative(parentAssetId, transformation,
--                                kind, isGenerative)
--     * CLOUDINARY_TRANSFORMATIONS.md:171 — "each is a string stored in
--                                asset_derivatives.transformation"
--
--   The spec was incomplete, not the design. The table below is the DDL the
--   existing documents already describe; DATABASE_SCHEMA.md is updated to match
--   in the same change, so spec and database agree again.
--
--   Separately, `assets.cloudinary_created_at` had zero references anywhere and
--   did not exist. It is the Cloudinary-side creation time, needed as the
--   reconciliation baseline: comparing our ingest time against Cloudinary's own
--   clock is what makes a nightly one-way integrity check meaningful. It is a
--   server timestamp and therefore evidence, so it joins the immutable set.

-- ---------------------------------------------------------------------------
-- 1. assets.cloudinary_created_at
-- ---------------------------------------------------------------------------

-- Cloudinary's own created_at for the upload. Distinct from
-- server_upload_timestamp (which the existing column comment attributes to
-- Cloudinary too) — this one is the value the webhook re-reads at reconciliation
-- time, so a mismatch against server_received_at is detectable.
ALTER TABLE assets ADD COLUMN IF NOT EXISTS cloudinary_created_at TIMESTAMPTZ;

COMMENT ON COLUMN assets.cloudinary_created_at IS
  'Cloudinary-side created_at, re-read during nightly reconciliation. Evidence: immutable.';

-- The existing immutability trigger does not know this column, so a write would
-- slip past it. Recreate the function with the column added and re-arm the
-- trigger. This is the authoritative control (AGENTS.md §3.1) — it fires for
-- every role including service_role, which bypasses both RLS and column grants.
CREATE OR REPLACE FUNCTION assets_prevent_evidence_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.org_id                   IS DISTINCT FROM OLD.org_id
     OR NEW.project_id            IS DISTINCT FROM OLD.project_id
     OR NEW.asset_type            IS DISTINCT FROM OLD.asset_type
     OR NEW.cloudinary_public_id  IS DISTINCT FROM OLD.cloudinary_public_id
     OR NEW.cloudinary_asset_id   IS DISTINCT FROM OLD.cloudinary_asset_id
     OR NEW.cloudinary_created_at IS DISTINCT FROM OLD.cloudinary_created_at
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

DROP TRIGGER IF EXISTS assets_evidence_immutable ON assets;
CREATE TRIGGER assets_evidence_immutable
  BEFORE UPDATE ON assets
  FOR EACH ROW EXECUTE FUNCTION assets_prevent_evidence_update();

-- ---------------------------------------------------------------------------
-- 2. asset_derivatives
-- ---------------------------------------------------------------------------

CREATE TABLE asset_derivatives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The original this was derived from. Deleting an asset cascades, because a
  -- derivative with no parent has no provenance and must not outlive it.
  parent_asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,

  -- Denormalized from the parent asset by trigger below. Never an independent
  -- fact: a derivative filed under the wrong org would be readable by that org
  -- under RLS, which is a cross-tenant leak.
  org_id UUID NOT NULL REFERENCES orgs(id),

  -- The exact transformation string, per AGENTS.md §3.1. Not a description, not
  -- a reference to a template — the literal that was sent to Cloudinary, so the
  -- bytes can be re-derived and audited later.
  transformation TEXT NOT NULL,

  -- Coarse family, used by Phase 5's createDerivative(parentAssetId,
  -- transformation, kind, isGenerative). Deliberately unconstrained: the
  -- vocabulary is Phase 5's to define against the 47 documented transforms, and
  -- a CHECK here would either guess wrong or need loosening later. The one
  -- property that must never be loose is is_generative, and that is enforced.
  kind TEXT,

  -- Cloudinary public_id of the derived asset.
  public_id TEXT NOT NULL,

  -- True when generative transforms were used. Generative edits are allowed only
  -- on report copies, never on originals (AGENTS.md §3.1), so this column is what
  -- a later gate reads to prove that rule held.
  is_generative BOOLEAN NOT NULL DEFAULT false,

  cloudinary_asset_id TEXT,
  cloudinary_version TEXT,

  -- Cloudinary reports the derived byte size at transform time, so this is known
  -- without fetching the bytes. sha256_hash is only knowable by fetching them,
  -- so it stays nullable — and NULL is a terminal state, not a pending one,
  -- because the row is append-only and could never be backfilled.
  byte_size BIGINT,
  sha256_hash TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One Cloudinary asset is one derivative. Cloudinary dedupes identical
  -- transformations, so re-requesting one returns the same public_id; without
  -- this a retry would write a second row for the same bytes.
  CONSTRAINT asset_derivatives_public_id_key UNIQUE (public_id),

  -- And one parent is not derived twice by the same transformation.
  CONSTRAINT asset_derivatives_parent_transformation_key
    UNIQUE (parent_asset_id, transformation)
);

COMMENT ON TABLE asset_derivatives IS
  'Cloudinary derivative lineage. Append-only: the row IS the evidence that a transform happened. See AGENTS.md §3.1.';
COMMENT ON COLUMN asset_derivatives.transformation IS
  'Exact transformation string sent to Cloudinary, not a template reference.';
COMMENT ON COLUMN asset_derivatives.is_generative IS
  'True iff a generative transform was used. Generative edits are permitted only on report copies (AGENTS.md §3.1).';
COMMENT ON COLUMN asset_derivatives.org_id IS
  'Forced to the parent asset org_id by trigger. Never set independently.';

CREATE INDEX idx_derivatives_parent ON asset_derivatives(parent_asset_id);
CREATE INDEX idx_derivatives_org    ON asset_derivatives(org_id);
-- The reconciliation job asks "which derivatives came from this Cloudinary
-- asset", so public_id needs its own index rather than relying on the unique
-- constraint alone for a different column ordering.
CREATE INDEX idx_derivatives_cloudinary ON asset_derivatives(cloudinary_asset_id)
  WHERE cloudinary_asset_id IS NOT NULL;
CREATE INDEX idx_derivatives_generative ON asset_derivatives(parent_asset_id)
  WHERE is_generative;

-- org_id is never an independent fact. Same pattern as
-- report_manifest_entries_sync_org: fires for every role including service_role,
-- so even a SECURITY DEFINER writer with a bug cannot file a derivative under
-- another org.
CREATE OR REPLACE FUNCTION sync_derivative_org_id() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  parent_org UUID;
BEGIN
  SELECT org_id INTO parent_org FROM assets WHERE id = NEW.parent_asset_id;
  IF parent_org IS NULL THEN
    RAISE EXCEPTION 'parent asset % does not exist', NEW.parent_asset_id;
  END IF;
  IF NEW.org_id IS DISTINCT FROM parent_org THEN
    NEW.org_id := parent_org;   -- corrected, not rejected: the parent is authoritative
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER asset_derivatives_sync_org
  BEFORE INSERT OR UPDATE ON asset_derivatives
  FOR EACH ROW EXECUTE FUNCTION sync_derivative_org_id();

-- Append-only. There is no legitimate UPDATE: a derivative is a record that a
-- transform happened, and "fixing" one would falsify that record. A changed
-- transform is a different derivative, which is a new row.
ALTER TABLE asset_derivatives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "derivatives_org_scope" ON asset_derivatives FOR SELECT
  USING (
    org_id = (auth.jwt() ->> 'org_id')::uuid
    OR (auth.jwt() ->> 'role') = 'platform_admin'
  );

-- No INSERT, UPDATE, or DELETE policy. Derivatives are written by the
-- transformation worker through the service role, which bypasses RLS by design.
-- Clients never create them: a client asks for a URL by asset_id and the API
-- resolves the asset under RLS (AGENTS.md §3.11). Adding a permissive INSERT
-- policy here would let any caller mint a derivative row pointing at another
-- org's asset id, which is precisely the WITH CHECK (true) mistake the assets
-- table already documents at length.
REVOKE INSERT, UPDATE, DELETE ON asset_derivatives FROM anon, authenticated;

-- Belt and braces alongside the missing grants: if a future migration regrants
-- UPDATE, this trigger still refuses. Mirrors assets_evidence_immutable.
CREATE OR REPLACE FUNCTION asset_derivatives_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'asset_derivatives is append-only; create a new derivative instead of updating %', OLD.id
    USING ERRCODE = 'check_violation';
END;
$$;

CREATE TRIGGER asset_derivatives_append_only
  BEFORE UPDATE OR DELETE ON asset_derivatives
  FOR EACH ROW EXECUTE FUNCTION asset_derivatives_append_only();
