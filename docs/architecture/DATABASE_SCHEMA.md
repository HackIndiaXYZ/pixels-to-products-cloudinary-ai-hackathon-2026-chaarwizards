# Database Schema (Supabase/PostgreSQL)

---

## Extensions

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

---

## Core Tables

### Organizations

```sql
CREATE TABLE orgs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT CHECK (type IN ('government', 'ngo', 'partner', 'funder')),
  settings JSONB DEFAULT '{}',
  -- Cost guardrail. 50 GB per org, warn at 80%, reject new uploads at 100%.
  quota_bytes BIGINT NOT NULL DEFAULT 53687091200,
  bytes_used BIGINT NOT NULL DEFAULT 0,
  -- Earliest automatic deletion. 7 years from created_at.
  -- Enforced by the reconciliation job, not by a Postgres trigger.
  retention_years INT NOT NULL DEFAULT 7,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**Role model** — carried in the JWT, resolved by Postgres. Never read from a request body.

| Role | Scope | Can |
|---|---|---|
| `platform_admin` | All orgs | Provision orgs, invite the first `org_admin` of each |
| `org_admin` | Own org only | Manage members, projects, templates, quota |
| `member` | Own org only | Upload, annotate, request reports |
| `viewer` | Own org only | Read and download reports, no writes |

```sql
-- RLS. Note the split: platform_admin is a platform role, org_admin is scoped
-- to its own org. Conflating them would let any org admin read every org.
ALTER TABLE orgs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orgs_select_own" ON orgs FOR SELECT
  USING (
    id = (auth.jwt() ->> 'org_id')::uuid
    OR (auth.jwt() ->> 'role') = 'platform_admin'
  );

-- UPDATE needs BOTH USING (which rows you may touch) and WITH CHECK (what the
-- row may become). A FOR ALL policy with only USING is a write-escalation bug.
CREATE POLICY "orgs_admin_update" ON orgs FOR UPDATE
  USING (
    ((auth.jwt() ->> 'org_id')::uuid = id AND (auth.jwt() ->> 'role') = 'org_admin')
    OR (auth.jwt() ->> 'role') = 'platform_admin'
  )
  WITH CHECK (
    ((auth.jwt() ->> 'org_id')::uuid = id AND (auth.jwt() ->> 'role') = 'org_admin')
    OR (auth.jwt() ->> 'role') = 'platform_admin'
  );

-- No INSERT policy: orgs are provisioned by platform_admin through the API
-- using the service role. There is no self-service signup (AGENTS.md §3.10).
```

> **Why the trigger, not the grant, is the real protection.** The `service_role` bypasses RLS
> *and* holds full table grants, so column-level `REVOKE`s cannot restrain it. A `BEFORE UPDATE`
> trigger, however, fires for **every** role including superusers. Evidence immutability therefore
> rests on the trigger; column grants are defence in depth for `anon` and `authenticated` only.

### Invite Tokens

Single-use, address-bound, 72-hour tokens. There is no self-service signup: `platform_admin`
provisions the org, then issues the first `org_admin` invite. See `api-contracts.md` §Invites.

```sql
CREATE TABLE invite_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  -- Binds the token to one recipient. Without this a token can be forwarded
  -- and redeemed by anyone, including as org_admin.
  email CITEXT NOT NULL,
  -- The role granted on redemption. Never 'platform_admin': that role is
  -- assigned out of band, not by redeeming a link.
  role TEXT NOT NULL CHECK (role IN ('org_admin', 'member', 'viewer')),
  -- SHA-256 of the raw token. The raw token is returned once, at creation,
  -- and is never stored or logged (AGENTS.md §3.10).
  token_hash TEXT NOT NULL UNIQUE,
  -- 72 hours from issue. Enforced on redemption, not by a cron.
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,       -- set on successful redemption
  redeemed_by UUID,          -- auth.users.id of whoever redeemed it
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_invites_org ON invite_tokens (org_id);
CREATE INDEX idx_invites_email ON invite_tokens (email);
```

```sql
ALTER TABLE invite_tokens ENABLE ROW LEVEL SECURITY;

-- Redemption reads by hash. This is deliberately NOT org-scoped: the
-- recipient is not authenticated yet when they redeem. Isolation comes from
-- the token being unguessable, single-use, and 256-bit random.
CREATE POLICY "invites_redeem_by_hash" ON invite_tokens FOR SELECT
  USING (token_hash = current_setting('request.jwt.claim.token_hash', true));

-- No INSERT policy: platform_admin issues invites through the API using the
-- service role. No UPDATE policy: redemption is a service-role UPDATE, so a
-- client cannot mark a token used or extend its own expiry.
```

> **Redemption must re-verify three conditions in one transaction**, not just look the row up:
> `used_at IS NULL`, `expires_at > now()`, and `lower(email) = lower(auth.jwt() ->> 'email')`.
> A lookup that checks only the hash will happily accept a forwarded, expired,
> or already-redeemed token.

> **On redemption, `org_id` and `role` are written into the new user's
> `app_metadata`** with `auth.admin.updateUserById()`. That is the only place
> `org_id` enters a JWT — see `ARCHITECTURE.md` §Row isolation. No
> `org_members` table exists because each user belongs to exactly one org. If
> that ever changes, this table plus a Custom Access Token Hook become necessary.

### Projects

```sql
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES orgs(id) NOT NULL,
  name TEXT NOT NULL,
  sector TEXT, -- 'forestry', 'water', 'infrastructure', 'education', etc. (primary sector for simple projects)
  geometry GEOMETRY(POLYGON, 4326),
  start_date DATE,
  end_date DATE,
  config JSONB DEFAULT '{}', -- Sector config: {
  --   "observation_types": [
  --     {"type": "ganga_cleanup", "model": "water", "gps_radius": 10, "phase_field": "cleanup_phase"},
  --     {"type": "road_construction", "model": "infrastructure", "gps_radius": 5, "phase_field": "build_phase"}
  --   ],
  --   "metrics_schema": {"water_quality_index": "number", "debris_removed_kg": "number"},
  --   "report_template": "integrated_restoration_report"
  -- }
  parent_project_id UUID REFERENCES projects(id), -- Sub-project hierarchy (Option 1)
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_projects_org ON projects(org_id);
CREATE INDEX idx_projects_geometry ON projects USING GIST(geometry);
CREATE INDEX idx_projects_parent ON projects(parent_project_id);
CREATE INDEX idx_projects_parent_sector ON projects(parent_project_id, sector);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "projects_org_read" ON projects FOR SELECT
  USING (org_id = (auth.jwt() ->> 'org_id')::uuid);
CREATE POLICY "projects_org_write" ON projects FOR ALL
  USING      (org_id = (auth.jwt() ->> 'org_id')::uuid)
  WITH CHECK (org_id = (auth.jwt() ->> 'org_id')::uuid);
```

### Assets (Photos/Videos from Capture App)

```sql
CREATE TABLE assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) NOT NULL,
  org_id UUID REFERENCES orgs(id) NOT NULL,
  
  -- Cloudinary identifiers
  cloudinary_public_id TEXT UNIQUE NOT NULL,
  cloudinary_asset_id TEXT,
  asset_type TEXT CHECK (asset_type IN ('image', 'video')),
  
  -- Device capture timestamps (immutable after insert)
  device_capture_timestamp TIMESTAMPTZ NOT NULL,
  device_commit_hash TEXT NOT NULL,           -- SHA-256 = commitId from app
  device_id TEXT NOT NULL,
  device_public_key TEXT NOT NULL,            -- Ed25519 public key
  capture_signature TEXT NOT NULL,            -- Ed25519 signature of commit
  
  -- GPS with accuracy
  gps_point GEOGRAPHY(POINT, 4326),
  gps_accuracy_meters FLOAT,                  -- Horizontal accuracy (meters)
  gps_altitude FLOAT,
  gps_provider TEXT,                          -- 'gps' | 'network' | 'fused' | 'passive'
  gps_timestamp TIMESTAMPTZ,                  -- GPS satellite time
  
  -- Caption (optional, signed)
  caption TEXT,
  caption_signature TEXT,                     -- Ed25519(caption + caption_created_at)
  caption_language TEXT,
  caption_created_at TIMESTAMPTZ,
  
  -- EXIF (frozen at capture, PascalCase keys)
  exif JSONB,
  exif_hash TEXT NOT NULL,                    -- SHA-256 of frozen EXIF
  
  -- SHA-256 of original file
  sha256_hash TEXT NOT NULL,
  
  -- Video-specific fields
  duration_seconds FLOAT,                     -- Video duration
  keyframe_timestamps FLOAT[],                -- Extracted keyframe timestamps (seconds)
  keyframe_cloudinary_ids TEXT[],             -- Cloudinary public_ids for keyframes
  thumbnail_cloudinary_id TEXT,               -- Auto-generated thumbnail
  
  -- AI enrichment
  ai_tags JSONB DEFAULT '[]',
  custom_metadata JSONB DEFAULT '{}',

  -- Signals harvested ONCE from Cloudinary at ingest, then owned by Postgres.
  -- We never query these back from Cloudinary (AGENTS.md §3.7).
  phash TEXT,                                 -- perceptual hash; near-duplicate + "same site, later" search
  dominant_colors TEXT[],                     -- Cloudinary derived_metadata.colors
  cloudinary_quality_score FLOAT,             -- derived_metadata.quality_score
  face_count INT,                             -- derived_metadata.faces
  cloudinary_metadata_at TIMESTAMPTZ,         -- when the harvest ran, for provenance

  -- Observation context
  observation_type TEXT,
  phase TEXT CHECK (phase IN ('before', 'after')),
  app_version TEXT,

  -- Timezone policy: all TIMESTAMPTZ values are stored UTC. Org-local rendering
  -- happens in the dashboard using orgs.settings.timezone. No local-time columns.
  
  -- Server timestamps (immutable after insert)
  server_upload_timestamp TIMESTAMPTZ,        -- Cloudinary server time (created_at)
  server_received_at TIMESTAMPTZ DEFAULT now(), -- Our API receipt time
  
  upload_status TEXT DEFAULT 'pending' CHECK (upload_status IN ('pending', 'verified', 'flagged')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_assets_project_time ON assets(project_id, device_capture_timestamp);
CREATE INDEX idx_assets_gps ON assets USING GIST(gps_point);
CREATE INDEX idx_assets_gps_accuracy ON assets(gps_accuracy_meters) WHERE gps_accuracy_meters IS NOT NULL;
CREATE INDEX idx_assets_commit_hash ON assets(device_commit_hash);
CREATE INDEX idx_assets_status ON assets(upload_status);
CREATE INDEX idx_assets_observation ON assets(project_id, observation_type, phase);

-- RLS. The API connects as a dedicated NON-superuser role (api_app), not
-- service_role, so that RLS and column grants actually apply to application code.
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "assets_org_scope" ON assets FOR SELECT
  USING (org_id = (auth.jwt() ->> 'org_id')::uuid);

-- There is deliberately NO insert policy for assets. Uploads are ingested by the
-- webhook handler through the service role, which bypasses RLS by design.
-- An earlier draft had `WITH CHECK (true)`, which granted every caller -- including
-- `anon` -- the right to insert an asset row into any org. Never do that.
--
-- The webhook must derive org_id from the verified signature's org claim, never
-- from the request body's context field (AGENTS.md §3.4).
```

**Legitimate asset updates.** Only mutable columns may ever change, and only via the API:

| Column | Mutable | By whom |
|---|---|---|
| `verification`, `upload_status`, `verified_at` | Yes | webhook handler / verification worker |
| `caption`, `phase`, `notes` | Yes, invalidates the signature | API, records an audit entry |
| `sha256`, `exif_hash`, `device_*`, `gps_*`, `server_*`, `cloudinary_*` | **Never** | — |

`REVOKE UPDATE (sha256, exif_hash, device_capture_timestamp, device_monotonic_ms,
gps_lat, gps_lon, gps_accuracy, server_upload_timestamp, server_received_at,
cloudinary_public_id, cloudinary_version) ON assets FROM anon, authenticated;`

### Observations (Structured Field Notes)

```sql
CREATE TABLE observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID REFERENCES assets(id),
  project_id UUID REFERENCES projects(id),
  org_id UUID REFERENCES orgs(id),
  observer_id UUID, -- User ID
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
```

### Change Events (Before/After Pairs)

```sql
CREATE TABLE change_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id),
  org_id UUID REFERENCES orgs(id),
  
  before_asset_id UUID REFERENCES assets(id),
  after_asset_id UUID REFERENCES assets(id),
  
  change_type TEXT, -- 'sapling_planting', 'canopy_growth', 'construction_progress', etc.
  change_metrics JSONB NOT NULL, -- {hectares: 2.3, saplings: 49, density: 0.041, ...}
  detection_method TEXT, -- 'cv_model_forestry_v3', 'manual'
  confidence FLOAT,
  
  -- Cloudinary diff visualization
  diff_asset_cloudinary_id TEXT,
  
  -- GPS clustering info
  gps_distance_meters FLOAT,
  time_difference_hours FLOAT,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_change_project ON change_events(project_id);
CREATE INDEX idx_change_assets ON change_events(before_asset_id, after_asset_id);

ALTER TABLE change_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "change_events_org_read" ON change_events FOR SELECT
  USING (org_id = (auth.jwt() ->> 'org_id')::uuid);
CREATE POLICY "change_events_org_write" ON change_events FOR ALL
  USING      (org_id = (auth.jwt() ->> 'org_id')::uuid)
  WITH CHECK (org_id = (auth.jwt() ->> 'org_id')::uuid);
```

### Evidence Packages (Compiled for Donors/Audits)

```sql
CREATE TABLE evidence_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id),
  org_id UUID REFERENCES orgs(id),
  name TEXT,
  asset_ids UUID[],
  change_event_ids UUID[],
  report_cloudinary_url TEXT,
  audit_trail JSONB, -- Hash chain, signatures, transformations
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'finalized', 'exported')),
  generated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE evidence_packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "packages_org_scope" ON evidence_packages FOR SELECT
  USING (org_id = (auth.jwt() ->> 'org_id')::uuid);
CREATE POLICY "packages_org_write" ON evidence_packages FOR ALL
  USING      (org_id = (auth.jwt() ->> 'org_id')::uuid)
  WITH CHECK (org_id = (auth.jwt() ->> 'org_id')::uuid);
```

#### Report Media Manifest

A finalized report must render identically forever, offline. That is only true if the media is
**inside** the artifact. The manifest records what was inlined, so the report stays verifiable
back to Postgres long after the fact.

```sql
CREATE TABLE report_manifest_entries (
  id BIGSERIAL PRIMARY KEY,
  evidence_package_id UUID NOT NULL REFERENCES evidence_packages(id),
  -- Denormalized from evidence_packages so the RLS policy reads a column
  -- directly, like every other org-scoped table. It is NOT independently
  -- writable: the trigger below forces it to match the parent, so it can never
  -- disagree. Do not set it by hand on insert.
  org_id UUID NOT NULL REFERENCES orgs(id),
  ordinal INT NOT NULL,                        -- position in the document
  role TEXT NOT NULL CHECK (role IN ('photo', 'diff', 'map', 'chart', 'video_clip', 'qr')),
  -- What was inlined. null for QR codes and generated charts.
  cloudinary_public_id TEXT,
  derivative_public_id TEXT,
  sha256_hash TEXT,                            -- SHA-256 of the bytes as embedded
  byte_size BIGINT,
  -- Every non-null row must be reproduced byte-for-byte from this source.
  -- Verified by re-fetching the derivative and comparing sha256.
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (evidence_package_id, ordinal)
);

CREATE INDEX idx_manifest_package ON report_manifest_entries(evidence_package_id);
CREATE INDEX idx_manifest_org ON report_manifest_entries(org_id);
```

```sql
ALTER TABLE report_manifest_entries ENABLE ROW LEVEL SECURITY;

-- org_id is a cache of the parent's org, never an independent fact. This
-- trigger makes that structural: it fires for every role including
-- service_role, so the column cannot be set to another org's id even by a
-- bug in a SECURITY DEFINER writer.
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
```

**How this is used.** `evidence_packages.report_cloudinary_url` points at the finalized PDF/HTML,
which is self-contained: images are inlined at generation time (base64 data URIs for HTML,
embedded binaries for PDF). A reader needs no network and no valid token. The manifest travels
with the report as its integrity appendix, so any embedded image can be traced to a
`public_id` + `sha256` and re-verified against Postgres later.

> **Tradeoff, accepted:** a 30-page report with inlined full-resolution photos runs 40–80 MB.
> Report generation therefore inlines a `report_full`-resolution derivative (capped 1920px,
> `q_auto:good`), never the original. A report large enough to be a delivery problem is a
> template bug, not a reason to fall back to live URLs.

### Audit Logs (Immutable Traceability)

```sql
CREATE TABLE audit_logs (
  id BIGSERIAL PRIMARY KEY,
  asset_id UUID REFERENCES assets(id),
  change_event_id UUID REFERENCES change_events(id),
  evidence_package_id UUID REFERENCES evidence_packages(id),
  
  action TEXT NOT NULL, -- 'upload', 'transform', 'tag', 'pair', 'detect', 'package', 'export', 'verify'
  actor_type TEXT CHECK (actor_type IN ('system', 'user', 'ml_model', 'device')),
  actor_id TEXT, -- user_id, device_id, 'cloudinary', 'ml_model_v3', etc.
  details JSONB,
  
  -- Hash chain for tamper evidence
  previous_hash TEXT,
  current_hash TEXT NOT NULL,

  -- The exact timestamp fed into the hash. Verification MUST use this column,
  -- never clock_timestamp(), or recomputation can never match.
  hashed_at TIMESTAMPTZ NOT NULL,

  -- RFC 8785 canonical JSON of `details`, computed by the API and stored so the
  -- chain is independently reproducible without re-serializing jsonb (AGENTS.md §3.9).
  details_canonical TEXT,

  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_audit_asset ON audit_logs(asset_id);
CREATE INDEX idx_audit_chain ON audit_logs(current_hash);

-- Near-duplicate and same-location search. Trigram index so `phash <-> $1 < 0.1`
-- stays index-assisted; a plain btree cannot answer a distance predicate.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_assets_phash ON assets USING GIN (phash gin_trgm_ops);

-- Volume control. audit_logs is append-only and the fastest-growing table in the
-- schema. Declare partitioning up front so retention is a detach, not a bulk DELETE.
-- Convert to a partitioned table before 1M rows; do not retrofit this later.
--   PARTITION BY RANGE (hashed_at)
--   monthly partitions; detach (not drop) any partition older than 7 years.

-- Append-only: no UPDATE/DELETE policies
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_select_org" ON audit_logs FOR SELECT
  USING (
    asset_id IN (SELECT id FROM assets WHERE org_id = (auth.jwt() ->> 'org_id')::uuid)
    OR change_event_id IN (SELECT id FROM change_events WHERE org_id = (auth.jwt() ->> 'org_id')::uuid)
    OR evidence_package_id IN (SELECT id FROM evidence_packages WHERE org_id = (auth.jwt() ->> 'org_id')::uuid)
  );
```

### Report Templates

```sql
CREATE TABLE report_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES orgs(id),
  sector TEXT, -- 'forestry', 'water', etc.
  name TEXT NOT NULL,
  description TEXT,
  handlebars_template TEXT NOT NULL, -- Template content
  config JSONB DEFAULT '{}', -- Required metrics, sections, branding
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE report_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "templates_org_scope" ON report_templates FOR SELECT
  USING (org_id = (auth.jwt() ->> 'org_id')::uuid);
CREATE POLICY "templates_org_write" ON report_templates FOR ALL
  USING      (org_id = (auth.jwt() ->> 'org_id')::uuid)
  WITH CHECK (org_id = (auth.jwt() ->> 'org_id')::uuid);
```

---

## Helper Functions

### Hash Chain Append

Three properties make this correct or useless, so all three are load-bearing:

1. **Serialized per asset** — a bare `SELECT ... ORDER BY id DESC LIMIT 1` lets two
   concurrent calls read the same `previous_hash` and both append, forking the chain
   permanently. `pg_advisory_xact_lock` fixes that.
2. **Canonical JSON** — hashing `p_details::text` violates AGENTS.md §3.9. Postgres `jsonb`
   output is not RFC 8785, so the API passes the canonical string in and we store it.
3. **The hashed timestamp is stored** — hashing `clock_timestamp()` while inserting
   `created_at DEFAULT now()` means a verifier recomputing the hash gets a different
   timestamp and the chain can never validate.

```sql
CREATE OR REPLACE FUNCTION append_audit_log(
  p_asset_id UUID,
  p_action TEXT,
  p_actor_type TEXT,
  p_actor_id TEXT,
  p_details JSONB,
  p_details_canonical TEXT   -- RFC 8785, computed by the API
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_previous_hash TEXT;
  v_current_hash TEXT;
  v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
  -- Serialize concurrent appends for this asset. Released at transaction end.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_asset_id::text, 0));

  SELECT current_hash INTO v_previous_hash
  FROM audit_logs
  WHERE asset_id = p_asset_id
  ORDER BY id DESC
  LIMIT 1;

  v_current_hash := encode(
    sha256(
      convert_to(
        COALESCE(v_previous_hash, 'genesis')
        || '|' || p_action
        || '|' || p_actor_type
        || '|' || COALESCE(p_actor_id, '')
        || '|' || COALESCE(p_details_canonical, 'null')
        || '|' || to_char(v_now AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
        'UTF8'
      )
    ),
    'hex'
  );

  INSERT INTO audit_logs (
    asset_id, action, actor_type, actor_id, details,
    previous_hash, current_hash, hashed_at, details_canonical
  )
  VALUES (
    p_asset_id, p_action, p_actor_type, p_actor_id, p_details,
    v_previous_hash, v_current_hash, v_now, p_details_canonical
  );
END;
$$;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Verify Asset Integrity

Returns a **three-state** result per check: `pass` / `fail` / `unknown`. Only `fail` blocks a
report. `unknown` must never be reported as `pass`.

Two checks cannot be performed in Postgres and are marked `unknown` here — they are verified in
the API layer and the result is written back to `assets.verification`:

- `exif_hash_match` — the client hashes RFC 8785 (JCS) canonical JSON. Postgres `jsonb::text`
  differs from JavaScript in whitespace, escaping and number formatting, so it **cannot**
  reproduce the client's hash. Attempting it guarantees false mismatches. Verified in the API.
- `caption_signature` — Ed25519 verification needs the device public key and a crypto library.
  Verified in the API.

```sql
CREATE TYPE integrity_state AS ENUM ('pass', 'fail', 'unknown');

CREATE OR REPLACE FUNCTION verify_asset_integrity(p_asset_id UUID)
RETURNS TABLE (
  check_name TEXT,
  state      integrity_state,
  details    JSONB
) AS $$
DECLARE
  v_asset       assets%rowtype;
  v_sync_delay  NUMERIC;
BEGIN
  SELECT * INTO v_asset FROM assets WHERE id = p_asset_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'asset % not found', p_asset_id;
  END IF;

  -- Check 1: EXIF hash — verified in the API with RFC 8785 (JCS). Not reproducible in SQL.
  RETURN QUERY SELECT
    'exif_hash_match'::text,
    'unknown'::integrity_state,
    jsonb_build_object(
      'reason',   'requires RFC 8785 canonicalization; verified in API layer',
      'stored',   v_asset.exif_hash,
      'verified', v_asset.exif_verified_at
    );

  -- Check 2: content hash equals the device commit hash
  RETURN QUERY SELECT
    'sha256_matches_commit'::text,
    CASE
      WHEN v_asset.sha256_hash IS NULL OR v_asset.device_commit_hash IS NULL
        THEN 'unknown'::integrity_state
      WHEN v_asset.sha256_hash = v_asset.device_commit_hash
        THEN 'pass'::integrity_state
      ELSE 'fail'::integrity_state
    END,
    jsonb_build_object(
      'sha256',     v_asset.sha256_hash,
      'commit_hash', v_asset.device_commit_hash
    );

  -- Check 3: caption signature — verified in the API (Ed25519 needs the device public key)
  RETURN QUERY SELECT
    'caption_signature'::text,
    CASE
      WHEN v_asset.caption IS NULL              THEN 'pass'::integrity_state  -- nothing to verify
      WHEN v_asset.caption_signature IS NULL    THEN 'fail'::integrity_state
      ELSE 'unknown'::integrity_state                                      -- API decides
    END,
    jsonb_build_object(
      'has_caption',      v_asset.caption IS NOT NULL,
      'has_signature',    v_asset.caption_signature IS NOT NULL,
      'signature_tier',   v_asset.signature_tier,
      'verified',         v_asset.caption_verified_at
    );

  -- Check 4: OFFLINE DWELL — server_received_at - upload_started_at.
  -- This isolates dwell. It is NOT a clock-skew measurement.
  v_sync_delay := EXTRACT(EPOCH FROM (v_asset.server_received_at - v_asset.upload_started_at));
  RETURN QUERY SELECT
    'sync_delay'::text,
    CASE
      WHEN v_asset.upload_started_at IS NULL OR v_asset.server_received_at IS NULL
        THEN 'unknown'::integrity_state
      WHEN v_sync_delay < 0   THEN 'fail'::integrity_state   -- receipt before upload: impossible
      WHEN v_sync_delay <= 900 THEN 'pass'::integrity_state  -- <= 15 min
      ELSE 'fail'::integrity_state
    END,
    jsonb_build_object(
      'upload_started_at',  v_asset.upload_started_at,
      'server_received_at', v_asset.server_received_at,
      'sync_delay_seconds', v_sync_delay
    );

  -- Check 5: CLOCK SKEW — requires a signed NTP offset sampled at capture.
  -- Without one this is 'unknown', NEVER 'pass'.
  -- NOTE: (server_received_at - device_capture_timestamp) is NOT usable here: it sums
  -- offline dwell + clock skew + network latency, so it cannot isolate skew.
  RETURN QUERY SELECT
    'clock_skew'::text,
    CASE
      WHEN v_asset.ntp_offset_seconds IS NULL THEN 'unknown'::integrity_state
      WHEN ABS(v_asset.ntp_offset_seconds) <= 300 THEN 'pass'::integrity_state  -- <= 5 min
      ELSE 'fail'::integrity_state
    END,
    jsonb_build_object(
      'ntp_offset_seconds', v_asset.ntp_offset_seconds,
      'device_capture_timestamp', v_asset.device_capture_timestamp,
      'note', 'raw delta vs server is not a skew measurement; see sync_delay check'
    );

  -- Check 6: audit chain integrity
  RETURN QUERY SELECT
    'audit_chain_intact'::text,
    CASE WHEN verify_audit_chain(p_asset_id) THEN 'pass'::integrity_state
         ELSE 'fail'::integrity_state END,
    jsonb_build_object('chain_verified', verify_audit_chain(p_asset_id));
END;
$$ LANGUAGE plpgsql;
```

**New columns required** (add to `assets` in a new migration):

| Column | Type | Purpose |
|--------|------|---------|
| `upload_started_at` | `timestamptz` | Client clock immediately before upload begins — isolates dwell |
| `device_monotonic_ms` | `bigint` | Monotonic counter since app launch, inside the signed payload |
| `ntp_offset_seconds` | `numeric` | Signed NTP offset at capture; NULL means skew is `unknown` |
| `signature_tier` | `text` | `device` or `server` — never mislabel a server fallback |
| `exif_verified_at` | `timestamptz` | When the API confirmed the JCS EXIF hash |
| `caption_verified_at` | `timestamptz` | When the API confirmed the Ed25519 caption signature |

### Verify Audit Chain

```sql
CREATE OR REPLACE FUNCTION verify_audit_chain(p_asset_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_log audit_logs%rowtype;
  v_expected_hash TEXT;
  v_previous_hash TEXT := 'genesis';
BEGIN
  FOR v_log IN 
    SELECT * FROM audit_logs WHERE asset_id = p_asset_id ORDER BY id ASC
  LOOP
    v_expected_hash := encode(
      sha256(concat(
        v_previous_hash,
        v_log.action,
        v_log.actor_type,
        v_log.actor_id,
        v_log.details::text,
        v_log.created_at::text
      )::bytea),
      'hex'
    );
    
    IF v_log.current_hash != v_expected_hash THEN
      RETURN FALSE;
    END IF;
    
    v_previous_hash := v_log.current_hash;
  END LOOP;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;
```

---

## Supabase Edge Functions

### Delivery URL Generator

**Delivery model (decided).** Two distinct mechanisms, because they solve different problems.

| Asset kind | Cloudinary type | Access | Why |
|---|---|---|---|
| Originals (photos, video) | `authenticated` | `auth_token` carrying a real `exp` | A leaked URL alone is useless, and the CDN enforces expiry |
| Derivatives (thumbnails, diffs, report copies) | `upload` | signed URL, **no expiry** — acceptable because these are not sensitive | CDN-cacheable and fast. If a derivative ever becomes sensitive, promote it to `authenticated` rather than assuming the signature expires. |

> **Do not hand-roll the signature.** An earlier draft in this file built an HMAC-**SHA-256**
> token and used the `v{version}` path segment as an expiry. Both were wrong: Cloudinary URL
> signing uses HMAC-**SHA1** over a different payload shape, so the signature was rejected; and
> URL signatures have **no built-in TTL at all** — the version segment is a cache-busting
> counter, not a deadline. The code appeared to implement expiring access and implemented
> nothing. Use the official SDK helpers below, and verify one URL against the live account in
> Phase 0 before building on it.

```typescript
// apps/api/src/cloudinary/delivery.ts
// Node SDK v2 ONLY (AGENTS.md §4).
import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET, // server-only, never returned
});

/** Derivative: signed delivery URL. Fast, CDN-cacheable, not sensitive. */
export function signedDerivativeUrl(
  publicId: string,
  transformation?: string,
): string {
  return cloudinary.url(publicId, {
    secure: true,
    resource_type: 'image',
    type: 'upload',
    sign_url: true,               // SDK computes the HMAC-SHA1; do not hand-roll
    transformation,
  });
}

/** Original: authenticated asset, gated by a token with a genuine exp. */
export function originalUrl(publicId: string, ttlSeconds = 300): string {
  return cloudinary.url(publicId, {
    secure: true,
    resource_type: 'image',
    type: 'authenticated',
    sign_url: true,
  }) + tokenFor(publicId, ttlSeconds);
}
```

`tokenFor` must come from the Cloudinary SDK's auth-token helper or the Admin API's
`generate_auth_token` endpoint — **not** from hand-written HMAC. Confirm the exact helper name
and token shape against the live account in Phase 0; the token carries `stp` (start), `exp`
(expiry), the URL path, and an HMAC over those fields, keyed by the token key configured in
the Cloudinary console.

**Cache-busting and immutability.** Public IDs are content-addressed
(`{org_id}/{project_id}/{sha256}`) and uploads use `invalidate: false`, so the URL for a given
`public_id` always resolves to the same bytes. Do not bump the version segment to "refresh" a
media URL — there is nothing to refresh, and doing so would suggest the bytes can change.

---

## RLS Policy Summary

| Table | Select Policy | Insert Policy | Update Policy |
|-------|---------------|---------------|---------------|
| `orgs` | Own org, or any if `platform_admin` | Service role only (no self-signup) | `org_admin` own org / `platform_admin` — needs `USING` **and** `WITH CHECK` |
| `invite_tokens` | Redeem-by-hash. **Deliberately not org-scoped** — the recipient is unauthenticated at redemption; isolation comes from an unguessable, single-use, 72h token | Service role only (`platform_admin` issues) | Service role only (redemption). A client must not mark a token used or extend its own expiry |
| `projects` | Org scope | Org scope | Org scope |
| `assets` | Org scope | Service role only (webhook; `org_id` from the verified org claim) | Legitimate columns only; evidence columns `REVOKE`d + trigger |
| `observations` | Org scope | Org scope | Org scope |
| `change_events` | Org scope | Service role | Service role |
| `evidence_packages` | Org scope | Org scope | Org scope |
| `report_manifest_entries` | Org scope on the denormalized `org_id`, which a `BEFORE INSERT OR UPDATE` trigger forces to match the parent package | Service role only (report worker) | Org scope — needs `USING` **and** `WITH CHECK`, so a row cannot be moved into another org |
| `audit_logs` | Org scope (via joins) | Service role | **None (append-only)** |
| `report_templates` | Org scope | Org scope | Org scope — needs `USING` **and** `WITH CHECK` |

Two rules this table exists to enforce:

- **Never write a policy with `WITH CHECK (true)`.** On `assets` that granted every caller,
  `anon` included, the right to insert a row into any org. A policy that cannot fail is not a
  policy.
- **Every `FOR UPDATE` / `FOR ALL` policy needs `USING` and `WITH CHECK`.** `USING` alone lets a
  row you may read be rewritten into a row you may not, which is privilege escalation by
  omission. `report_templates` was still missing this; fixed.

> **`invite_tokens` is the one table that is not org-scoped on SELECT.** That is intentional, not
> an oversight. The person redeeming an invite has no JWT yet, so an org-scoped `USING` clause
> would make redemption impossible. The token is 256-bit random, single-use, expires in 72 hours,
> and is stored only as a SHA-256 hash — so the redemption policy's blast radius is a single
> unusable-after-first-read row. The compensating control is that redemption re-verifies
> `used_at IS NULL`, `expires_at > now()`, and email match, in one transaction.

---

## Migration Order

```bash
# 1. Extensions
supabase db push --include-all

# 2. Core tables (orgs, projects)
# 3. Assets (with all integrity columns)
# 4. Observations, change_events, evidence_packages, audit_logs
# 5. Report templates
# 6. Functions (append_audit_log, verify_asset_integrity, verify_audit_chain)
# 7. RLS policies
# 8. Indexes
# 9. Edge functions
```

---

## Notes on Key Design Decisions

### org_id Flow
- **Webhook** (service role): Reads `context.org_id` from Cloudinary upload → inserts into `assets.org_id`
- **Dashboard/API** (user JWT): RLS enforces `org_id = auth.jwt() ->> 'org_id'` on all reads/writes
- **No org_id from JWT in webhook** — webhook uses service role, trusts Cloudinary context

### GPS Provider Values
- `gps` — Native GPS hardware
- `network` — Cell tower/WiFi triangulation
- `fused` — Google Play Services Fused Location Provider (Android) / Core Location (iOS) — **what `expo-location` uses**
- `passive` — Passive listener

### phase Constraint
- `CHECK (phase IN ('before', 'after'))` on `assets.phase`
- `observation_type` is free text but validated against `projects.config.observation_types` in API

### server_upload_timestamp Source
- From Cloudinary webhook `info.created_at` — when Cloudinary finished processing the upload
- May differ from actual network upload completion by seconds
- `server_received_at` = our API receipt time (more accurate for audit)

### Cloudinary EXIF Preservation
- Upload preset MUST have `preserve_exif: true` (default in Cloudinary)
- EXIF sent in `metadata.exif` — Cloudinary stores and returns it in webhook
- `exif_hash` verified against `metadata.exif` in webhook