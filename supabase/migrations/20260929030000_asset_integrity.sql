-- Phase 8 (dashboard end-to-end) — asset_integrity: the query behind the
-- documented GET /v1/assets/:id/integrity contract (api-contracts.md §4
-- "Get Asset with Integrity").
--
-- WHY THIS EXISTS
--
--   The Phase 3 integrity route returned an undocumented shape
--   ({asset_id, verification, blocked, checks[]}). The dashboard (Phase 8) and
--   api-contracts.md both use the FLAT contract:
--     device_signature_verified / exif_hash_verified / caption_signature_verified
--     / audit_chain_intact / sha256_matches_commit  (booleans, tri-state via null)
--   plus timing fields. The API and its own contract had diverged. This function
--   backs the corrected route.
--
--   Two checks (Ed25519 signature, RFC 8785 EXIF hash) cannot run in Postgres
--   (no Ed25519 primitive; JCS differs from jsonb::text — AGENTS.md §3.8), so this
--   function ALSO projects the exact stored inputs the API needs to re-derive the
--   signed payload and verify them in Node (services/verification.ts). The API
--   fills device_signature_verified / exif_hash_verified from those; a `null`
--   there is surfaced honestly as `unknown`, never laundered into `pass` (§3.7).
--
--   SECURITY INVOKER (default) so `assets` RLS scopes the row to the caller's org.

CREATE OR REPLACE FUNCTION asset_integrity(p_asset_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  a assets%rowtype;
BEGIN
  SELECT * INTO a FROM assets WHERE id = p_asset_id;
  IF NOT FOUND THEN
    RETURN NULL;   -- absent, or invisible under RLS → the route 404s.
  END IF;

  RETURN jsonb_build_object(
    -- Contract fields the DB can decide on its own.
    'asset_id', a.id,
    'device_capture_timestamp', a.device_capture_timestamp,
    'server_upload_timestamp', a.server_upload_timestamp,
    'server_received_at', a.server_received_at,
    'clock_drift_seconds',
      CASE WHEN a.server_received_at IS NULL OR a.device_capture_timestamp IS NULL THEN NULL
           ELSE round(extract(epoch FROM (a.server_received_at - a.device_capture_timestamp)))::bigint END,
    'gps_accuracy_meters', a.gps_accuracy_meters,
    'gps_provider', a.gps_provider,
    'upload_status', a.upload_status,
    -- caption_signature_verified: an unsigned/absent caption is `pass` (nothing to
    -- forge); a signed caption is verified in the API (Ed25519), reported there.
    'caption_present', a.caption IS NOT NULL,
    'caption_signature_present', a.caption_signature IS NOT NULL,
    'audit_chain_intact', verify_audit_chain(p_asset_id),
    'sha256_matches_commit',
      CASE WHEN a.sha256_hash IS NULL OR a.device_commit_hash IS NULL THEN NULL
           ELSE a.sha256_hash = a.device_commit_hash END,
    -- Raw inputs for the API-side Ed25519 + RFC 8785 checks. Never returned to
    -- the client; the route consumes them and drops them from the response.
    'crypto_inputs', jsonb_build_object(
      'exif', a.exif,
      'exif_hash', a.exif_hash,
      'sha256', a.sha256_hash,
      'capture_signature', a.capture_signature,
      'device_public_key', a.device_public_key,
      'captured_at_ms', round(extract(epoch FROM a.device_capture_timestamp) * 1000)::bigint,
      'device_monotonic_ms', a.device_monotonic_ms,
      'lat_e7', CASE WHEN a.gps_point IS NULL THEN NULL ELSE round(ST_Y(a.gps_point::geometry) * 1e7)::bigint END,
      'lon_e7', CASE WHEN a.gps_point IS NULL THEN NULL ELSE round(ST_X(a.gps_point::geometry) * 1e7)::bigint END,
      'accuracy_m', a.gps_accuracy_meters,
      'altitude_m', a.gps_altitude,
      'provider', a.gps_provider,
      'project_id', a.project_id,
      'observation_type', a.observation_type,
      'phase', a.phase,
      'caption', a.caption
    )
  );
END;
$$;

COMMENT ON FUNCTION asset_integrity(UUID) IS
  'Backs GET /v1/assets/:id/integrity (documented flat contract). SECURITY INVOKER so RLS scopes the row. Returns DB-decidable checks plus the raw inputs the API needs for the Ed25519 + RFC 8785 checks it must run in Node. Phase 8.';

REVOKE EXECUTE ON FUNCTION asset_integrity(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION asset_integrity(UUID) TO authenticated;
