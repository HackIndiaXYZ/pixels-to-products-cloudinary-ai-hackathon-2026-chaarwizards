-- Phase 1 — Projects
-- Source: docs/architecture/DATABASE_SCHEMA.md §Projects
--
-- projects.config carries the sector configuration. observation_types[] is
-- validated by a BEFORE INSERT OR UPDATE trigger (see below): each entry MUST
-- carry a `type`, a `model`, and a numeric `gps_radius`. The pairing worker
-- (Phase 7) clusters by gps_radius; a missing model would let a wrong-sector
-- number reach a report .

CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES orgs(id) NOT NULL,
  name TEXT NOT NULL,
  sector TEXT, -- 'forestry', 'water', 'infrastructure', 'education', etc.
  geometry GEOMETRY(POLYGON, 4326),
  start_date DATE,
  end_date DATE,
  config JSONB DEFAULT '{}',
  parent_project_id UUID REFERENCES projects(id), -- sub-project hierarchy
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_projects_org ON projects(org_id);
CREATE INDEX idx_projects_geometry ON projects USING GIST(geometry);
CREATE INDEX idx_projects_parent ON projects(parent_project_id);
CREATE INDEX idx_projects_parent_sector ON projects(parent_project_id, sector);

-- Config schema enforcement for observation_types[].
-- Required per entry: type (text), model (text), gps_radius (number).
-- phase_field is validated when present; label is optional (the canonical
-- example in DATABASE_SCHEMA.md omits it, so requiring it would reject a
-- documented-valid config). See architecture specification.md Phase 1 "Config schema".
CREATE OR REPLACE FUNCTION validate_project_config() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_entry     JSONB;
  v_types     JSONB;
BEGIN
  IF NEW.config IS NULL THEN
    RETURN NEW;
  END IF;

  v_types := NEW.config -> 'observation_types';

  -- observation_types is optional, but if present it must be an array.
  IF v_types IS NULL OR jsonb_typeof(v_types) = 'null' THEN
    RETURN NEW;
  END IF;

  IF jsonb_typeof(v_types) <> 'array' THEN
    RAISE EXCEPTION 'projects.config.observation_types must be an array, got %',
      jsonb_typeof(v_types)
      USING ERRCODE = 'check_violation';
  END IF;

  FOR v_entry IN SELECT jsonb_array_elements(v_types)
  LOOP
    IF jsonb_typeof(v_entry) <> 'object' THEN
      RAISE EXCEPTION 'observation_types entries must be objects, got %',
        jsonb_typeof(v_entry)
        USING ERRCODE = 'check_violation';
    END IF;

    IF NOT (v_entry ? 'type') OR jsonb_typeof(v_entry -> 'type') <> 'string' THEN
      RAISE EXCEPTION 'observation_type entry missing required string "type": %', v_entry
        USING ERRCODE = 'check_violation';
    END IF;

    IF NOT (v_entry ? 'model') OR jsonb_typeof(v_entry -> 'model') <> 'string' THEN
      RAISE EXCEPTION 'observation_type "%" missing required string "model"',
        v_entry ->> 'type'
        USING ERRCODE = 'check_violation';
    END IF;

    IF NOT (v_entry ? 'gps_radius') OR jsonb_typeof(v_entry -> 'gps_radius') <> 'number' THEN
      RAISE EXCEPTION 'observation_type "%" missing required numeric "gps_radius"',
        v_entry ->> 'type'
        USING ERRCODE = 'check_violation';
    END IF;

    -- phase_field is optional but, when present, must be a string.
    IF (v_entry ? 'phase_field') AND jsonb_typeof(v_entry -> 'phase_field') <> 'string' THEN
      RAISE EXCEPTION 'observation_type "%" phase_field must be a string when present',
        v_entry ->> 'type'
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER projects_validate_config
  BEFORE INSERT OR UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION validate_project_config();

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "projects_org_read" ON projects FOR SELECT
  USING (org_id = (auth.jwt() ->> 'org_id')::uuid);
CREATE POLICY "projects_org_write" ON projects FOR ALL
  USING      (org_id = (auth.jwt() ->> 'org_id')::uuid)
  WITH CHECK (org_id = (auth.jwt() ->> 'org_id')::uuid);
