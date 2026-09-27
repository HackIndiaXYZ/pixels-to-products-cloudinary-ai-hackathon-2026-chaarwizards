-- Phase 1 — Model Registry & Sync State
--
-- model_registry: source of every metric-producing model (AGENTS.md §3.2/§3.3).
-- Columns per ARCHITECTURE.md §3.4 and docs/planning/FINE_TUNING_STRATEGY.md:
--   key, version, sector, weights_uri, status (trained|prebuilt|unsupported), metrics.
-- The ML service resolves observation_type.model -> a row here; status != 'trained'
-- returns {"status":"unsupported"} and never falls back to another sector.
CREATE TABLE model_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,        -- resolve_model(model_key) looks up by this
  version TEXT NOT NULL,
  sector TEXT NOT NULL,
  weights_uri TEXT,                -- private bucket URI; NULL for placeholders/prebuilt
  status TEXT NOT NULL CHECK (status IN ('trained', 'prebuilt', 'unsupported')),
  metrics JSONB DEFAULT '{}',      -- eval metrics for the trained weights
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Platform-wide reference data, not org-scoped. A SELECT policy with USING(true)
-- is read-only and safe; the prohibition in AGENTS.md §3.4 is on WITH CHECK(true)
-- for writes. No INSERT/UPDATE policy: the registry is curated via the service
-- role by a platform_admin.
ALTER TABLE model_registry ENABLE ROW LEVEL SECURITY;
CREATE POLICY "model_registry_read" ON model_registry FOR SELECT
  TO authenticated
  USING (true);


-- sync_state: SCHEMA ADDITION documented per AGENTS.md §8. BUILD_ORDER Phase 1
-- lists sync_state among the tables to create, but DATABASE_SCHEMA.md ships no
-- DDL for it. It records the nightly one-way Cloudinary->Postgres reconciliation
-- run per org (ARCHITECTURE.md §Nightly reconciliation): last cursor, last run,
-- and outcome. Kept minimal; extend when Phase 5 implements the job.
CREATE TABLE sync_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  scope TEXT NOT NULL DEFAULT 'cloudinary_reconciliation',
  cursor TEXT,                     -- opaque continuation cursor for the last run
  last_run_at TIMESTAMPTZ,
  last_status TEXT CHECK (last_status IN ('ok', 'partial', 'failed')),
  details JSONB DEFAULT '{}',      -- orphans found, missing rows, error reasons
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, scope)
);

CREATE INDEX idx_sync_state_org ON sync_state(org_id);

ALTER TABLE sync_state ENABLE ROW LEVEL SECURITY;
-- Read-only to org members; the reconciliation job writes via the service role.
CREATE POLICY "sync_state_org_read" ON sync_state FOR SELECT
  USING (org_id = (auth.jwt() ->> 'org_id')::uuid);
