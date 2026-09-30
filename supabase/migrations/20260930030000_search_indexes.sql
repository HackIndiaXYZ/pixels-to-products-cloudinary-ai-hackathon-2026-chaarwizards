-- Phase 11 (Hardening) — search index coverage for GET /v1/search.
--
-- SCHEMA ADDITION beyond DATABASE_SCHEMA.md, documented per AGENTS.md §8:
-- additive, non-destructive, index-only. No table, column, evidence field, RLS
-- policy, or trigger is touched — these are pure read-path accelerators.
--
-- MVP exit criterion 3 ("search 1 000 assets by tag, location, date, GPS
-- accuracy, or asset type in under 500 ms") requires every documented filter
-- path in `search_assets` to be index-assisted at scale. The Phase 1 asset
-- indexes covered location (`idx_assets_gps` GIST) and GPS accuracy
-- (`idx_assets_gps_accuracy`), but three of the five filter paths had no usable
-- index:
--
--   * tag        — `ai_tags @> to_jsonb($tags)` had no GIN index → seq scan.
--   * asset_type — `asset_type = $type` had no index → seq scan.
--   * date       — a GLOBAL `device_capture_timestamp` range (no project_id)
--                  could not use the composite `idx_assets_project_time`
--                  (project_id leads), so a cross-project date search seq-scanned.
--
-- These three indexes close that gap. `jsonb_path_ops` is the smaller, faster GIN
-- variant and is sufficient for the containment (`@>`) operator search uses.

-- tag search: ai_tags @> to_jsonb($tags)
CREATE INDEX IF NOT EXISTS idx_assets_ai_tags
  ON assets USING GIN (ai_tags jsonb_path_ops);

-- asset_type facet: asset_type = 'image' | 'video'
CREATE INDEX IF NOT EXISTS idx_assets_asset_type
  ON assets (asset_type) WHERE asset_type IS NOT NULL;

-- date facet: global device_capture_timestamp range, newest-first ordering.
CREATE INDEX IF NOT EXISTS idx_assets_capture_time
  ON assets (device_capture_timestamp DESC);
