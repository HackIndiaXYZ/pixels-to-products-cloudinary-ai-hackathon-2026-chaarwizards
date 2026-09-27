-- Phase 1 — Test helpers (BUILD_ORDER Phase 1 "Test helper")
--
-- TEST-ONLY. These live in a dedicated `test_helpers` schema, not `public`, so
-- they are easy to identify and drop. They give the gate tests a concise way to
-- build org/project/asset fixtures and to set the JWT claims that RLS reads.
--
-- Role switching (SET LOCAL ROLE authenticated|anon) is done inline in the test
-- scripts, not here, so there is no ambiguity about SET LOCAL scope inside a
-- function. These helpers only build data and set claims.

CREATE SCHEMA IF NOT EXISTS test_helpers;

-- Set the Supabase JWT claims that auth.jwt() reads, local to the current txn.
CREATE OR REPLACE FUNCTION test_helpers.set_claims(
  p_org_id UUID,
  p_role   TEXT,
  p_email  TEXT DEFAULT 'user@example.com'
) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('org_id', p_org_id, 'role', p_role, 'email', p_email)::text,
    true
  );
END;
$$;

CREATE OR REPLACE FUNCTION test_helpers.clear_claims() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
END;
$$;

CREATE OR REPLACE FUNCTION test_helpers.make_org(p_name TEXT DEFAULT 'Test Org')
RETURNS UUID
LANGUAGE plpgsql AS $$
DECLARE v_id UUID;
BEGIN
  INSERT INTO orgs (name, type) VALUES (p_name, 'ngo') RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION test_helpers.make_project(
  p_org_id UUID,
  p_name   TEXT DEFAULT 'Test Project',
  p_config JSONB DEFAULT '{}'
) RETURNS UUID
LANGUAGE plpgsql AS $$
DECLARE v_id UUID;
BEGIN
  INSERT INTO projects (org_id, name, sector, config)
  VALUES (p_org_id, p_name, 'forestry', p_config)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Insert an asset fixture with valid values for every NOT NULL evidence column.
-- sha256 == device_commit_hash so verify_asset_integrity's content check passes.
CREATE OR REPLACE FUNCTION test_helpers.make_asset(
  p_project_id UUID,
  p_org_id     UUID,
  p_public_id  TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql AS $$
DECLARE
  v_id     UUID;
  v_hash   TEXT := encode(sha256(convert_to(gen_random_uuid()::text, 'UTF8')), 'hex');
  v_public TEXT := COALESCE(p_public_id, 'org/proj/' || v_hash);
BEGIN
  INSERT INTO assets (
    project_id, org_id, cloudinary_public_id, asset_type,
    device_capture_timestamp, device_commit_hash, device_id, device_public_key,
    capture_signature, exif_hash, sha256_hash,
    upload_started_at, server_received_at, signature_tier, verification
  ) VALUES (
    p_project_id, p_org_id, v_public, 'image',
    now() - interval '1 hour', v_hash, 'device-123', 'ed25519-pubkey',
    'ed25519-signature', encode(sha256('exif'::bytea), 'hex'), v_hash,
    now() - interval '30 minutes', now(), 'device', 'pending'
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- TRUNCATE orgs CASCADE + audit_logs. Clears all org-scoped data between tests.
CREATE OR REPLACE FUNCTION test_helpers.reset_all() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  TRUNCATE TABLE audit_logs CASCADE;
  TRUNCATE TABLE orgs CASCADE;
END;
$$;

-- Concurrency driver for the advisory-lock gate check. Appends p_n rows for one
-- asset, COMMITTING after each so every append is its own transaction. Two
-- CALLs running in parallel sessions therefore contend for the per-asset
-- pg_advisory_xact_lock on every single append — without that lock they would
-- read the same previous_hash and fork the chain. A PROCEDURE (not a function)
-- is required because it COMMITs mid-loop.
CREATE PROCEDURE test_helpers.hammer_appends(p_asset UUID, p_actor TEXT, p_n INT)
LANGUAGE plpgsql AS $$
DECLARE i INT;
BEGIN
  FOR i IN 1..p_n LOOP
    PERFORM append_audit_log(p_asset, 'tag', 'system', p_actor, '{}'::jsonb, '{}');
    COMMIT;
  END LOOP;
END;
$$;

-- These are TEST-ONLY fixtures. They are SECURITY INVOKER, so RLS and table
-- grants already block the obvious abuse from anon/authenticated (make_org
-- inserts into a policy-less orgs; reset_all TRUNCATEs). Revoke EXECUTE from
-- PUBLIC and the client roles anyway, as defence in depth — the gate runs as the
-- table owner (postgres via `supabase test db`), which retains access. If these
-- ever need to be kept out of a production deploy entirely, exclude this
-- migration from the prod chain rather than relying on the revoke alone.
REVOKE ALL ON SCHEMA test_helpers FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA test_helpers FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA test_helpers FROM anon, authenticated;
REVOKE EXECUTE ON ALL ROUTINES IN SCHEMA test_helpers FROM anon, authenticated;
