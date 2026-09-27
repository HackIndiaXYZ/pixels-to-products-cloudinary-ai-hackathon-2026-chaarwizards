-- Phase 1 — Integrity & audit-chain functions
-- Source: docs/architecture/DATABASE_SCHEMA.md §Helper Functions
--
-- NOTE (AGENTS.md §3.8): the verify_audit_chain shown in DATABASE_SCHEMA.md is a
-- stale draft — it hashes `details::text` and `created_at`, which do NOT match
-- append_audit_log (which hashes `details_canonical` and the stored `hashed_at`).
-- Reproducing the draft would make every chain fail to verify. This file makes
-- verify_audit_chain byte-identical to append_audit_log: same field order, same
-- '|' separators, same UTC microsecond timestamp format, reading the STORED
-- hashed_at, never clock_timestamp().

CREATE TYPE integrity_state AS ENUM ('pass', 'fail', 'unknown');

-- ---------------------------------------------------------------------------
-- append_audit_log — serialized, canonical, stored-timestamp hash chain append.
-- ---------------------------------------------------------------------------
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
  v_current_hash  TEXT;
  v_now           TIMESTAMPTZ := clock_timestamp();
BEGIN
  -- Serialize concurrent appends for this asset. Released at transaction end.
  -- Without this, two callers read the same previous_hash and fork the chain.
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

-- ---------------------------------------------------------------------------
-- verify_audit_chain — recompute every hash from STORED fields (AGENTS.md §3.8).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION verify_audit_chain(p_asset_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql AS $$
DECLARE
  v_log           audit_logs%rowtype;
  v_expected_hash TEXT;
  v_previous_hash TEXT := NULL;   -- COALESCE(...,'genesis') matches append
BEGIN
  FOR v_log IN
    SELECT * FROM audit_logs WHERE asset_id = p_asset_id ORDER BY id ASC
  LOOP
    -- The stored previous_hash must equal the running chain value.
    IF v_log.previous_hash IS DISTINCT FROM v_previous_hash THEN
      RETURN FALSE;
    END IF;

    v_expected_hash := encode(
      sha256(
        convert_to(
          COALESCE(v_previous_hash, 'genesis')
          || '|' || v_log.action
          || '|' || v_log.actor_type
          || '|' || COALESCE(v_log.actor_id, '')
          || '|' || COALESCE(v_log.details_canonical, 'null')
          || '|' || to_char(v_log.hashed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
          'UTF8'
        )
      ),
      'hex'
    );

    IF v_log.current_hash <> v_expected_hash THEN
      RETURN FALSE;
    END IF;

    v_previous_hash := v_log.current_hash;
  END LOOP;

  RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- verify_asset_integrity — three-state per-check result. Only 'fail' blocks a
-- report; 'unknown' is never reported as 'pass' (AGENTS.md §3.7).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION verify_asset_integrity(p_asset_id UUID)
RETURNS TABLE (
  check_name TEXT,
  state      integrity_state,
  details    JSONB
)
LANGUAGE plpgsql AS $$
DECLARE
  v_asset      assets%rowtype;
  v_sync_delay NUMERIC;
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
      'sha256',      v_asset.sha256_hash,
      'commit_hash', v_asset.device_commit_hash
    );

  -- Check 3: caption signature — verified in the API (Ed25519 needs device key)
  RETURN QUERY SELECT
    'caption_signature'::text,
    CASE
      WHEN v_asset.caption IS NULL              THEN 'pass'::integrity_state
      WHEN v_asset.caption_signature IS NULL    THEN 'fail'::integrity_state
      ELSE 'unknown'::integrity_state
    END,
    jsonb_build_object(
      'has_caption',    v_asset.caption IS NOT NULL,
      'has_signature',  v_asset.caption_signature IS NOT NULL,
      'signature_tier', v_asset.signature_tier,
      'verified',       v_asset.caption_verified_at
    );

  -- Check 4: OFFLINE DWELL — server_received_at - upload_started_at. NOT a skew check.
  v_sync_delay := EXTRACT(EPOCH FROM (v_asset.server_received_at - v_asset.upload_started_at));
  RETURN QUERY SELECT
    'sync_delay'::text,
    CASE
      WHEN v_asset.upload_started_at IS NULL OR v_asset.server_received_at IS NULL
        THEN 'unknown'::integrity_state
      WHEN v_sync_delay < 0    THEN 'fail'::integrity_state    -- receipt before upload: impossible
      WHEN v_sync_delay <= 900 THEN 'pass'::integrity_state    -- <= 15 min
      ELSE 'fail'::integrity_state
    END,
    jsonb_build_object(
      'upload_started_at',  v_asset.upload_started_at,
      'server_received_at', v_asset.server_received_at,
      'sync_delay_seconds', v_sync_delay
    );

  -- Check 5: CLOCK SKEW — needs a signed NTP offset. NULL => 'unknown', NEVER 'pass'.
  RETURN QUERY SELECT
    'clock_skew'::text,
    CASE
      WHEN v_asset.ntp_offset_seconds IS NULL      THEN 'unknown'::integrity_state
      WHEN ABS(v_asset.ntp_offset_seconds) <= 300  THEN 'pass'::integrity_state   -- <= 5 min
      ELSE 'fail'::integrity_state
    END,
    jsonb_build_object(
      'ntp_offset_seconds',       v_asset.ntp_offset_seconds,
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
$$;
