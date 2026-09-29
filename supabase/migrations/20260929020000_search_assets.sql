-- Phase 8 (dashboard end-to-end) — search_assets: the query behind GET /v1/search.
--
-- Postgres is the system of record; every product read runs here, never against
-- the Cloudinary Search API (AGENTS.md §3.9). This function is SECURITY INVOKER
-- (the default), so it runs with the caller's role and the `assets` RLS policy
-- applies: a caller only ever sees its own org's rows. The API calls it through
-- the request-scoped client (anon key + the user's JWT), so org isolation is the
-- database's job, not a WHERE clause the API is trusted to remember.
--
-- It returns a single JSONB envelope so the seven facets, the full-match
-- `total_matched`/`facet_counts`, the 1000-row hard cap, and the opaque cursor
-- all travel together (api-contracts.md §4 "Global Search"). `total_matched` and
-- `facet_counts` are computed over the FULL filtered set, not the returned page,
-- so the UI can state the real number even when the page is truncated.

CREATE OR REPLACE FUNCTION search_assets(
  p_q                TEXT DEFAULT NULL,
  p_bbox             DOUBLE PRECISION[] DEFAULT NULL,  -- [minLon, minLat, maxLon, maxLat]
  p_date_from        TIMESTAMPTZ DEFAULT NULL,
  p_date_to          TIMESTAMPTZ DEFAULT NULL,
  p_tags             TEXT[] DEFAULT NULL,
  p_gps_accuracy_max DOUBLE PRECISION DEFAULT NULL,
  p_asset_type       TEXT DEFAULT NULL,
  p_phase            TEXT DEFAULT NULL,
  p_limit            INT DEFAULT 20,
  p_offset           INT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_hard_cap  CONSTANT INT := 1000;
  v_limit     INT := GREATEST(1, LEAST(COALESCE(p_limit, 20), 100));
  v_offset    INT := GREATEST(0, COALESCE(p_offset, 0));
  v_env       geometry;
  v_result    JSONB;
BEGIN
  IF p_bbox IS NOT NULL THEN
    IF array_length(p_bbox, 1) <> 4 THEN
      RAISE EXCEPTION 'bbox must have exactly four elements [minLon,minLat,maxLon,maxLat]'
        USING ERRCODE = 'invalid_parameter_value';
    END IF;
    v_env := ST_MakeEnvelope(p_bbox[1], p_bbox[2], p_bbox[3], p_bbox[4], 4326);
  END IF;

  -- One filtered CTE, reused for the page, the total, and the facet counts, so
  -- all three always agree. RLS on `assets` scopes it to the caller's org. The
  -- whole thing is a single statement (no temp table) so the function stays
  -- STABLE and read-only.
  WITH hits AS (
    SELECT a.id, a.project_id, a.cloudinary_public_id, a.asset_type,
           a.device_capture_timestamp, a.gps_point, a.gps_accuracy_meters,
           a.gps_provider, a.caption, a.ai_tags, a.observation_type, a.phase,
           a.upload_status
    FROM assets a
    WHERE (p_asset_type IS NULL OR a.asset_type = p_asset_type)
      AND (p_phase IS NULL OR a.phase = p_phase)
      AND (p_date_from IS NULL OR a.device_capture_timestamp >= p_date_from)
      AND (p_date_to IS NULL OR a.device_capture_timestamp <= p_date_to)
      AND (p_gps_accuracy_max IS NULL
           OR (a.gps_accuracy_meters IS NOT NULL AND a.gps_accuracy_meters <= p_gps_accuracy_max))
      AND (p_tags IS NULL OR a.ai_tags @> to_jsonb(p_tags))
      AND (v_env IS NULL
           OR (a.gps_point IS NOT NULL AND ST_Intersects(a.gps_point::geometry, v_env)))
      AND (
        p_q IS NULL OR p_q = ''
        OR a.caption ILIKE '%' || p_q || '%'
        OR a.observation_type ILIKE '%' || p_q || '%'
        OR a.ai_tags::text ILIKE '%' || p_q || '%'
      )
  ),
  total AS (SELECT count(*) AS n FROM hits),
  page AS (
    SELECT
      jsonb_build_object(
        'id', h.id,
        'project_id', h.project_id,
        'cloudinary_public_id', h.cloudinary_public_id,
        'asset_type', h.asset_type,
        'device_capture_timestamp', h.device_capture_timestamp,
        'gps_point',
          CASE WHEN h.gps_point IS NULL THEN NULL
               ELSE jsonb_build_object(
                 'type', 'Point',
                 'coordinates', jsonb_build_array(
                   ST_X(h.gps_point::geometry), ST_Y(h.gps_point::geometry))) END,
        'gps_accuracy_meters', h.gps_accuracy_meters,
        'gps_provider', h.gps_provider,
        'caption', h.caption,
        'ai_tags', COALESCE(h.ai_tags, '[]'::jsonb),
        'observation_type', h.observation_type,
        'phase', h.phase,
        'upload_status', h.upload_status
      ) AS row,
      h.device_capture_timestamp AS cap
    FROM hits h
    ORDER BY h.device_capture_timestamp DESC
    LIMIT v_limit OFFSET v_offset
  ),
  facets AS (
    SELECT COALESCE(jsonb_object_agg(g.phase, g.c), '{}'::jsonb) AS phase_counts
    FROM (SELECT h.phase, count(*) AS c FROM hits h WHERE h.phase IS NOT NULL GROUP BY h.phase) g
  )
  SELECT jsonb_build_object(
    'data', COALESCE((SELECT jsonb_agg(p.row ORDER BY p.cap DESC) FROM page p), '[]'::jsonb),
    'total_matched', (SELECT n FROM total),
    'truncated', (SELECT n FROM total) > v_hard_cap,
    'facet_counts', jsonb_build_object('phase', (SELECT phase_counts FROM facets)),
    'next_cursor',
      CASE WHEN (v_offset + v_limit) < (SELECT n FROM total)
             AND (v_offset + v_limit) < v_hard_cap
           THEN (v_offset + v_limit) ELSE NULL END
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION search_assets IS
  'GET /v1/search backing query. SECURITY INVOKER so assets RLS scopes results to the caller org (AGENTS.md §3.9). Returns a JSONB envelope with the page, full-set total_matched/facet_counts, the 1000-row truncation flag, and an opaque numeric next_cursor offset.';

-- The function is callable by authenticated users; RLS still gates every row it
-- reads. anon has no business searching.
REVOKE EXECUTE ON FUNCTION search_assets FROM anon;
GRANT EXECUTE ON FUNCTION search_assets TO authenticated;
