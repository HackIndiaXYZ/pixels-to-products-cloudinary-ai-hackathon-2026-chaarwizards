-- Phase 1 — Audit Logs (immutable, append-only, hash-chained)
-- Source: docs/architecture/DATABASE_SCHEMA.md §Audit Logs
--
-- Declared PARTITION BY RANGE (hashed_at) up front so retention is a partition
-- detach, not a bulk DELETE (BUILD_ORDER Phase 1 "Audit partitioning"). The
-- primary key must include the partition key, hence (id, hashed_at). id is a
-- global BIGSERIAL, so ORDER BY id still yields insertion order across
-- partitions, which the hash-chain walk relies on.

CREATE TABLE audit_logs (
  id BIGSERIAL,
  asset_id UUID REFERENCES assets(id),
  change_event_id UUID REFERENCES change_events(id),
  evidence_package_id UUID REFERENCES evidence_packages(id),

  action TEXT NOT NULL,            -- 'upload','transform','tag','pair','detect','package','export','verify'
  actor_type TEXT CHECK (actor_type IN ('system', 'user', 'ml_model', 'device')),
  actor_id TEXT,                   -- user_id, device_id, 'cloudinary', 'ml_model_v3', etc.
  details JSONB,

  -- Hash chain for tamper evidence
  previous_hash TEXT,
  current_hash TEXT NOT NULL,

  -- The exact timestamp fed into the hash. Verification MUST use this column,
  -- never clock_timestamp(), or recomputation can never match (AGENTS.md §3.8).
  hashed_at TIMESTAMPTZ NOT NULL,

  -- RFC 8785 canonical JSON of `details`, computed by the API and stored so the
  -- chain is independently reproducible without re-serializing jsonb.
  details_canonical TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),

  PRIMARY KEY (id, hashed_at)
) PARTITION BY RANGE (hashed_at);

CREATE INDEX idx_audit_asset ON audit_logs(asset_id);
CREATE INDEX idx_audit_chain ON audit_logs(current_hash);

-- A DEFAULT partition guarantees every append lands somewhere even before a
-- monthly partition exists. Monthly range partitions are added ahead of time by
-- the retention job (add_audit_log_month below); anything not yet covered falls
-- through to the default. Detach (never DROP) a partition older than 7 years.
CREATE TABLE audit_logs_default PARTITION OF audit_logs DEFAULT;

-- Helper to pre-create a monthly range partition. Idempotent.
CREATE OR REPLACE FUNCTION add_audit_log_month(p_month DATE) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  v_start DATE := date_trunc('month', p_month)::date;
  v_end   DATE := (date_trunc('month', p_month) + INTERVAL '1 month')::date;
  v_name  TEXT := 'audit_logs_' || to_char(v_start, 'YYYYMM');
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = v_name) THEN
    EXECUTE format(
      'CREATE TABLE %I PARTITION OF audit_logs FOR VALUES FROM (%L) TO (%L)',
      v_name, v_start, v_end
    );
  END IF;
END;
$$;

-- Append-only: no UPDATE/DELETE policies (AGENTS.md §3.8).
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_select_org" ON audit_logs FOR SELECT
  USING (
    asset_id IN (SELECT id FROM assets WHERE org_id = (auth.jwt() ->> 'org_id')::uuid)
    OR change_event_id IN (SELECT id FROM change_events WHERE org_id = (auth.jwt() ->> 'org_id')::uuid)
    OR evidence_package_id IN (SELECT id FROM evidence_packages WHERE org_id = (auth.jwt() ->> 'org_id')::uuid)
  );


-- Report Templates
-- Source: docs/architecture/DATABASE_SCHEMA.md §Report Templates
CREATE TABLE report_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES orgs(id),
  sector TEXT,
  name TEXT NOT NULL,
  description TEXT,
  handlebars_template TEXT NOT NULL,
  config JSONB DEFAULT '{}',
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE report_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "templates_org_scope" ON report_templates FOR SELECT
  USING (org_id = (auth.jwt() ->> 'org_id')::uuid);
-- FOR ALL needs USING and WITH CHECK (DATABASE_SCHEMA.md RLS summary fix).
CREATE POLICY "templates_org_write" ON report_templates FOR ALL
  USING      (org_id = (auth.jwt() ->> 'org_id')::uuid)
  WITH CHECK (org_id = (auth.jwt() ->> 'org_id')::uuid);
