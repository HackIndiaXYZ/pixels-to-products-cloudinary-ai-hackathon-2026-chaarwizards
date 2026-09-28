-- Phase 7 — Pairing & Change Events: change_events lifecycle columns
--
-- AGENTS.md §8 requires a migration plus a documented reason for any schema
-- change not already in docs/architecture/DATABASE_SCHEMA.md. This is that
-- migration, and here is the reason:
--
--   The §Change Events DDL in DATABASE_SCHEMA.md ships no `status` column, yet
--   three documents require a persisted failure state on a change event:
--     * AGENTS.md §3.6  — "Every failure path writes a row or a log with a
--                          reason: change_events.status = 'failed' ..."
--     * BUILD_ORDER Phase 7 "Failure capture" — "status = 'failed' rows with a
--                          reason; never a silent drop"
--     * BUILD_ORDER Phase 7 gate — "an ML failure produces a `failed`
--                          change_event, not a missing row"
--
--   A detect-change run that cannot produce a metric (ML unreachable, or the
--   sector model is not `trained` → {"status":"unsupported"}, §3.3) MUST leave a
--   durable, reasoned row rather than dropping the pair. That needs a `status`
--   and a `failure_reason`. The spec was incomplete, not the design;
--   DATABASE_SCHEMA.md is updated to match in the same change.
--
-- WHY model_version STAYS NOT NULL (AGENTS.md §3.2)
--
--   Phase 1 made change_events.model_version NOT NULL so a metric can never
--   lack provenance. A `failed` row carries NO metric (change_metrics = '{}'),
--   so §3.2 is not in tension: there is no number to trace. NOT NULL still
--   demands a value, so failed/manual rows store an explicit, non-model
--   sentinel — 'none' for a failed detection, 'manual' for a human-declared
--   link — which, together with status and an empty change_metrics, is
--   unambiguously "no model produced anything here". The metric-schema gate in
--   the API (services/change-detection.ts) is the write-time §3.2 enforcement
--   for real detections: an off-schema key is refused before it is stored.
--
-- WHY change_events IS MUTABLE (unlike assets, §3.1)
--
--   §3.1 immutability protects SOURCE EVIDENCE — original asset rows and their
--   Cloudinary originals. A change_event is a DERIVED interpretation, not
--   evidence; a manual "split" flips its status and the audit chain records the
--   act. So no BEFORE UPDATE evidence trigger is added here.

ALTER TABLE change_events
  ADD COLUMN status TEXT NOT NULL DEFAULT 'detected'
    CHECK (status IN ('detected', 'failed', 'manual', 'split')),
  ADD COLUMN failure_reason TEXT;

-- A failed row must carry a reason; a non-failed row must not masquerade as one.
-- This makes "never a silent drop" (§3.6) a database-level guarantee, not a
-- convention the worker is trusted to follow.
ALTER TABLE change_events
  ADD CONSTRAINT change_events_failure_reason_ck
  CHECK (
    (status = 'failed' AND failure_reason IS NOT NULL)
    OR (status <> 'failed' AND failure_reason IS NULL)
  );

-- Idempotency (BUILD_ORDER Phase 7 gate: "Re-running the job over an unchanged
-- window creates no duplicate pairs"). At most one live pair per ordered
-- (before, after). A split pair is excluded so a subsequent, deliberate re-pair
-- of the same two assets is still possible. The pairing worker also guards with
-- findPair() before enqueueing, but this index is the authoritative backstop: a
-- retry that races two inserts hits the constraint rather than doubling a pair.
CREATE UNIQUE INDEX uq_change_events_pair
  ON change_events (before_asset_id, after_asset_id)
  WHERE status <> 'split';

CREATE INDEX idx_change_events_status ON change_events(status);

COMMENT ON COLUMN change_events.status IS
  'detected = CV metric produced; failed = detection could not run (reason in failure_reason, §3.6); manual = human-declared link (no CV metric); split = manual unlink.';
COMMENT ON COLUMN change_events.failure_reason IS
  'Human-readable reason a detection failed. Required iff status = failed (§3.6).';

-- ---------------------------------------------------------------------------
-- assets_for_pairing — service-role source for the pairing worker.
-- ---------------------------------------------------------------------------
--
-- The pure pairing algorithm needs plain lat/lon, but coordinates live in
-- `gps_point GEOGRAPHY(POINT,4326)` which PostgREST does not expose as numbers.
-- This function projects the pairing-relevant columns and extracts lat/lon with
-- ST_Y/ST_X. It returns ONLY `verified` assets with a location — the
-- architecture allows only ready assets to be paired ("Only `ready` assets are
-- selectable for pairing and reports"), and an asset with no fix cannot be
-- clustered. It is invoked by the worker through the service role; it is not a
-- product read (§3.9 concerns Cloudinary, not Postgres, which remains the system
-- of record).
CREATE OR REPLACE FUNCTION assets_for_pairing(p_project_id UUID)
RETURNS TABLE (
  id UUID,
  org_id UUID,
  project_id UUID,
  observation_type TEXT,
  phase TEXT,
  device_capture_timestamp TIMESTAMPTZ,
  gps_lat DOUBLE PRECISION,
  gps_lon DOUBLE PRECISION,
  cloudinary_public_id TEXT,
  asset_type TEXT
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    a.id,
    a.org_id,
    a.project_id,
    a.observation_type,
    a.phase,
    a.device_capture_timestamp,
    ST_Y(a.gps_point::geometry) AS gps_lat,
    ST_X(a.gps_point::geometry) AS gps_lon,
    a.cloudinary_public_id,
    a.asset_type
  FROM assets a
  WHERE a.project_id = p_project_id
    AND a.upload_status = 'verified'
    AND a.gps_point IS NOT NULL
  ORDER BY a.device_capture_timestamp ASC;
$$;

COMMENT ON FUNCTION assets_for_pairing(UUID) IS
  'Service-role pairing source: verified, located assets in a project with lat/lon projected from gps_point. Phase 7.';

