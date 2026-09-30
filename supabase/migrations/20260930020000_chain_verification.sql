-- Phase 10 — Audit & Integrity Surfacing
--
-- Adds the range chain verifier and the public-safe report verification receipt
-- that back:
--   * GET /v1/assets/:id/verify-chain      (Chain verifier — verifyChain(from,to))
--   * GET /v1/reports/:id/verification     (Report verification — public receipt)
--
-- WHY THE VERIFIER LIVES IN SQL (AGENTS.md §3.8)
--
--   The audit hash is over the STORED hashed_at rendered with
--   to_char(... 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') — a microsecond UTC format that a
--   second serializer (JS Date has only millisecond precision) cannot reproduce
--   byte-for-byte. So the authoritative hash/link recomputation stays in Postgres,
--   using the exact append_audit_log formula. The API composes this with the
--   RFC 8785 canonical-consistency check of `details` (which Postgres cannot do —
--   jsonb::text is not JCS), so a tamper of the raw `details` column is caught too.
--
--   No evidence column is touched; these are read-only STABLE functions.

-- ---------------------------------------------------------------------------
-- verify_audit_chain_range — walk one asset's chain (optionally within an id
-- range) and return a STRUCTURED result that NAMES the first bad row.
--
--   Two distinct failure kinds, matching the Phase 10 gate:
--     * 'hash_mismatch' — a stored row's content (details_canonical / hashed_at /
--       action / actor) was mutated: the recomputed hash no longer equals the
--       stored current_hash. A link-only verifier would miss this, so we recompute
--       the CONTENT hash of every row, not just check the links.
--     * 'broken_link'   — a row's stored previous_hash does not equal the running
--       chain value. Deleting an intermediate row makes the SURVIVING next row's
--       previous_hash point at a hash that is no longer the predecessor, so a gap
--       is detected and named, never silently skipped.
--
--   Returns jsonb:
--     { ok, checked, first_id, last_id, tip_hash,
--       failure: null | { audit_id, kind, reason } }
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION verify_audit_chain_range(
  p_asset_id UUID,
  p_from_id  BIGINT DEFAULT NULL,
  p_to_id    BIGINT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_log           audit_logs%rowtype;
  v_expected_hash TEXT;
  v_previous_hash TEXT := NULL;   -- COALESCE(...,'genesis') matches append
  v_checked       INT  := 0;
  v_first_id      BIGINT := NULL;
  v_last_id       BIGINT := NULL;
  v_tip_hash      TEXT := NULL;
  v_anchored      BOOLEAN := (p_from_id IS NULL);
BEGIN
  FOR v_log IN
    SELECT * FROM audit_logs
    WHERE asset_id = p_asset_id
      AND (p_from_id IS NULL OR id >= p_from_id)
      AND (p_to_id   IS NULL OR id <= p_to_id)
    ORDER BY id ASC
  LOOP
    -- When a from-id is given, the first row in range is the anchor: adopt its
    -- stored previous_hash as the running value so a mid-chain range still checks
    -- its internal links and content, without a false broken_link at the boundary.
    IF NOT v_anchored THEN
      v_previous_hash := v_log.previous_hash;
      v_anchored := TRUE;
    END IF;

    IF v_first_id IS NULL THEN
      v_first_id := v_log.id;
    END IF;

    -- Link check FIRST so a deleted intermediate row (gap) is reported as a
    -- broken_link at the surviving successor, not misattributed as a hash tamper.
    IF v_log.previous_hash IS DISTINCT FROM v_previous_hash THEN
      RETURN jsonb_build_object(
        'ok', false,
        'checked', v_checked,
        'first_id', v_first_id,
        'last_id', v_last_id,
        'tip_hash', v_tip_hash,
        'failure', jsonb_build_object(
          'audit_id', v_log.id,
          'kind', 'broken_link',
          'reason', format(
            'row %s previous_hash does not chain to the preceding row (a prior row was deleted or reordered)',
            v_log.id)
        )
      );
    END IF;

    -- Content check: recompute the hash from the STORED fields, byte-identical to
    -- append_audit_log. A mutated details_canonical / hashed_at / action / actor
    -- makes this differ from the stored current_hash.
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
      RETURN jsonb_build_object(
        'ok', false,
        'checked', v_checked,
        'first_id', v_first_id,
        'last_id', v_last_id,
        'tip_hash', v_tip_hash,
        'failure', jsonb_build_object(
          'audit_id', v_log.id,
          'kind', 'hash_mismatch',
          'reason', format(
            'row %s content does not reproduce its stored current_hash (a stored value was tampered)',
            v_log.id)
        )
      );
    END IF;

    v_previous_hash := v_log.current_hash;
    v_tip_hash      := v_log.current_hash;
    v_last_id       := v_log.id;
    v_checked       := v_checked + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'checked', v_checked,
    'first_id', v_first_id,
    'last_id', v_last_id,
    'tip_hash', v_tip_hash,
    'failure', NULL
  );
END;
$$;

COMMENT ON FUNCTION verify_audit_chain_range(UUID, BIGINT, BIGINT) IS
  'Phase 10 chain verifier. Walks one asset''s audit chain (optionally within an id range), recomputing every row''s content hash (byte-identical to append_audit_log) and checking link continuity. Returns a structured result naming the first tampered row (hash_mismatch) or gap (broken_link). SECURITY INVOKER so RLS scopes audit_logs to the caller''s org.';

REVOKE EXECUTE ON FUNCTION verify_audit_chain_range(UUID, BIGINT, BIGINT) FROM anon;
GRANT  EXECUTE ON FUNCTION verify_audit_chain_range(UUID, BIGINT, BIGINT) TO authenticated;

-- ---------------------------------------------------------------------------
-- report_verification_receipt — PUBLIC-SAFE receipt for a report id.
--
--   Returns ONLY hashes, counts, timestamps, and verification verdicts. It never
--   emits org_id, any user/actor identity, a GPS coordinate, a caption, or a
--   Cloudinary public_id (public_ids embed the org_id as their first path
--   segment — AGENTS.md §3.4). The receipt is therefore safe to export and share
--   as standalone evidence, while access to it is still gated by RLS
--   (SECURITY INVOKER): a cross-org report id resolves to no row and the API 404s.
--
--   Per-asset chain verdicts come from verify_audit_chain_range, so the receipt
--   IS a re-verification against Postgres, not a decorative snapshot: running it
--   again over the same rows yields the same verdicts and tip hashes.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION report_verification_receipt(p_report_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_pkg    evidence_packages%rowtype;
  v_asset  UUID;
  v_idx    INT := 0;
  v_chain  JSONB;
  v_assets JSONB := '[]'::jsonb;
  v_manifest JSONB;
  v_all_ok BOOLEAN := TRUE;
BEGIN
  SELECT * INTO v_pkg FROM evidence_packages WHERE id = p_report_id;
  IF NOT FOUND THEN
    RETURN NULL;   -- absent, or invisible under RLS → the route 404s.
  END IF;

  -- Per-asset chain verification. Only hashes/counts/verdicts are surfaced; the
  -- asset is referenced by ordinal index, never by id, org, caption, or GPS.
  FOREACH v_asset IN ARRAY COALESCE(v_pkg.asset_ids, ARRAY[]::uuid[])
  LOOP
    v_chain := verify_audit_chain_range(v_asset, NULL, NULL);
    IF NOT (v_chain->>'ok')::boolean THEN
      v_all_ok := FALSE;
    END IF;
    v_assets := v_assets || jsonb_build_object(
      'index', v_idx,
      'chain_verified', (v_chain->>'ok')::boolean,
      'chain_length', (v_chain->>'checked')::int,
      'tip_hash', v_chain->'tip_hash',
      'failure', v_chain->'failure'
    );
    v_idx := v_idx + 1;
  END LOOP;

  -- Manifest hashes only: role, ordinal, sha256 of embedded bytes, byte size,
  -- and whether it was verified at generation. NO public_id (embeds org_id).
  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             'ordinal', m.ordinal,
             'role', m.role,
             'sha256_hash', m.sha256_hash,
             'byte_size', m.byte_size,
             'verified', m.verified_at IS NOT NULL
           ) ORDER BY m.ordinal
         ), '[]'::jsonb)
    INTO v_manifest
    FROM report_manifest_entries m
   WHERE m.evidence_package_id = p_report_id;

  RETURN jsonb_build_object(
    'report_id', v_pkg.id,
    'status', v_pkg.status,
    'template_version', v_pkg.template_version,
    'generated_at', v_pkg.generated_at,
    'byte_size', v_pkg.byte_size,
    'chains_verified', v_all_ok,
    'asset_chains', v_assets,
    'manifest', v_manifest
  );
END;
$$;

COMMENT ON FUNCTION report_verification_receipt(UUID) IS
  'Phase 10 public-safe verification receipt for a report id. Returns only hashes, counts, timestamps, and per-asset chain verdicts (via verify_audit_chain_range); never org_id, user/actor identity, GPS, caption, or public_id. SECURITY INVOKER so RLS still gates access (cross-org → no row → 404).';

REVOKE EXECUTE ON FUNCTION report_verification_receipt(UUID) FROM anon;
GRANT  EXECUTE ON FUNCTION report_verification_receipt(UUID) TO authenticated;
