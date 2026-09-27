-- Phase 1 — Observations & Change Events
-- Source: docs/architecture/DATABASE_SCHEMA.md §Observations, §Change Events

CREATE TABLE observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID REFERENCES assets(id),
  project_id UUID REFERENCES projects(id),
  org_id UUID REFERENCES orgs(id),
  observer_id UUID, -- user id
  observation_type TEXT,
  metrics JSONB,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_observations_asset ON observations(asset_id);
CREATE INDEX idx_observations_project ON observations(project_id);

ALTER TABLE observations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "observations_org_scope" ON observations FOR SELECT
  USING (org_id = (auth.jwt() ->> 'org_id')::uuid);
CREATE POLICY "observations_org_write" ON observations FOR ALL
  USING      (org_id = (auth.jwt() ->> 'org_id')::uuid)
  WITH CHECK (org_id = (auth.jwt() ->> 'org_id')::uuid);


-- Change Events (before/after pairs). change_metrics originate from a versioned
-- CV model; model_version records which one (AGENTS.md §3.2). It is NOT NULL: a
-- metric-bearing row with no model provenance is exactly what §3.2 forbids, and
-- BUILD_ORDER Phase 6 gates on "a change event with model_version = NULL is
-- rejected at the database level". detection_method stays as the human-readable
-- method label ('cv_model_forestry', 'manual'); model_version is the machine
-- fact that ties the number to a row in model_registry.
CREATE TABLE change_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id),
  org_id UUID REFERENCES orgs(id),

  before_asset_id UUID REFERENCES assets(id),
  after_asset_id UUID REFERENCES assets(id),

  change_type TEXT,
  change_metrics JSONB NOT NULL,
  detection_method TEXT,           -- 'cv_model_forestry', 'manual'
  model_version TEXT NOT NULL,     -- versioned model that produced the metric (AGENTS.md §3.2)
  confidence FLOAT,

  diff_asset_cloudinary_id TEXT,   -- Cloudinary diff visualization

  gps_distance_meters FLOAT,
  time_difference_hours FLOAT,

  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_change_project ON change_events(project_id);
CREATE INDEX idx_change_assets ON change_events(before_asset_id, after_asset_id);

-- change_events are written by the detect-change worker (service role). Reads are
-- org-scoped. FOR ALL policy carries USING and WITH CHECK; no WITH CHECK (true).
ALTER TABLE change_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "change_events_org_read" ON change_events FOR SELECT
  USING (org_id = (auth.jwt() ->> 'org_id')::uuid);
CREATE POLICY "change_events_org_write" ON change_events FOR ALL
  USING      (org_id = (auth.jwt() ->> 'org_id')::uuid)
  WITH CHECK (org_id = (auth.jwt() ->> 'org_id')::uuid);
