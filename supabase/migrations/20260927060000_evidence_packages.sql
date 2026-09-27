-- Phase 1 — Evidence Packages & Report Manifest
-- Source: docs/architecture/DATABASE_SCHEMA.md §Evidence Packages,
--         §Report Media Manifest

CREATE TABLE evidence_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id),
  org_id UUID REFERENCES orgs(id),
  name TEXT,
  asset_ids UUID[],
  change_event_ids UUID[],
  report_cloudinary_url TEXT,
  audit_trail JSONB,               -- hash chain, signatures, transformations
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'finalized', 'exported')),
  generated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE evidence_packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "packages_org_scope" ON evidence_packages FOR SELECT
  USING (org_id = (auth.jwt() ->> 'org_id')::uuid);
CREATE POLICY "packages_org_write" ON evidence_packages FOR ALL
  USING      (org_id = (auth.jwt() ->> 'org_id')::uuid)
  WITH CHECK (org_id = (auth.jwt() ->> 'org_id')::uuid);


-- Report Media Manifest. One row per element inlined into a finalized report so
-- the artifact stays verifiable back to Postgres. org_id is a cache of the
-- parent package's org, forced to match by the trigger below.
CREATE TABLE report_manifest_entries (
  id BIGSERIAL PRIMARY KEY,
  evidence_package_id UUID NOT NULL REFERENCES evidence_packages(id),
  org_id UUID NOT NULL REFERENCES orgs(id),
  ordinal INT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('photo', 'diff', 'map', 'chart', 'video_clip', 'qr')),
  cloudinary_public_id TEXT,
  derivative_public_id TEXT,
  sha256_hash TEXT,                -- SHA-256 of the bytes as embedded
  byte_size BIGINT,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (evidence_package_id, ordinal)
);

CREATE INDEX idx_manifest_package ON report_manifest_entries(evidence_package_id);
CREATE INDEX idx_manifest_org ON report_manifest_entries(org_id);

-- org_id is never an independent fact. This trigger fires for every role
-- including service_role, so the column cannot be set to another org's id even
-- by a bug in a SECURITY DEFINER writer.
CREATE OR REPLACE FUNCTION sync_manifest_org_id() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  parent_org UUID;
BEGIN
  SELECT org_id INTO parent_org FROM evidence_packages WHERE id = NEW.evidence_package_id;
  IF parent_org IS NULL THEN
    RAISE EXCEPTION 'evidence_package % does not exist', NEW.evidence_package_id;
  END IF;
  IF NEW.org_id IS DISTINCT FROM parent_org THEN
    NEW.org_id := parent_org;   -- corrected, not rejected: the parent is authoritative
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER report_manifest_entries_sync_org
  BEFORE INSERT OR UPDATE ON report_manifest_entries
  FOR EACH ROW EXECUTE FUNCTION sync_manifest_org_id();

ALTER TABLE report_manifest_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "manifest_select_own" ON report_manifest_entries FOR SELECT
  USING (
    org_id = (auth.jwt() ->> 'org_id')::uuid
    OR (auth.jwt() ->> 'role') = 'platform_admin'
  );

-- UPDATE needs USING and WITH CHECK. WITH CHECK re-validates the org after the
-- write, so a row cannot be moved into another org even if the trigger is
-- bypassed. No INSERT policy: manifests are written by the report worker
-- through the service role.
CREATE POLICY "manifest_update_own" ON report_manifest_entries FOR UPDATE
  USING (
    (org_id = (auth.jwt() ->> 'org_id')::uuid AND (auth.jwt() ->> 'role') IN ('org_admin', 'member'))
    OR (auth.jwt() ->> 'role') = 'platform_admin'
  )
  WITH CHECK (
    org_id = (auth.jwt() ->> 'org_id')::uuid
    OR (auth.jwt() ->> 'role') = 'platform_admin'
  );
