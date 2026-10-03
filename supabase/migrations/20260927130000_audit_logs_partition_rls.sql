-- Phase 1 — CRITICAL FIX: row-level security on audit_logs partitions
--
-- FINDING (P0, cross-tenant data leak + audit-trail forgery)
--
--   `audit_logs` is declared `PARTITION BY RANGE (hashed_at)` and
--   `audit_logs_default` is created as `PARTITION OF audit_logs DEFAULT` in
--   migration 070000. That migration then enabled RLS and added the
--   `audit_select_org` policy on the PARENT only.
--
--   In PostgreSQL a partition inherits the parent table's ACL — so
--   `anon` and `authenticated` received full SELECT/INSERT/UPDATE/DELETE/
--   TRUNCATE on `audit_logs_default` — but it does NOT inherit the parent's
--   RLS setting or its policies. The partition was therefore a real,
--   fully-privileged, RLS-free base table in the `public` schema, which
--   Supabase's PostgREST auto-exposes at /rest/v1/audit_logs_default.
--
--   Demonstrated against this schema before the fix:
--     * `anon`, with no JWT at all, read every audit row including the
--       `details` JSONB payload.
--     * `anon` INSERTED a forged row. RLS off means no INSERT policy is
--       required, so the append-only guarantee did not hold either.
--     * An Org A member read Org B's rows (2 rows via the partition vs the
--       1 row they correctly see through the parent).
--
--   Why the gate missed it: every test reads `audit_logs` through the parent,
--   where RLS works. Nothing queried a partition directly. A test suite that
--   only exercises the intended path cannot see a hole beside it.
--
--   Why it matters: audit_logs is the hash-chained evidence backbone
--   (append_audit_log / verify_audit_chain, system invariants). Readable across
--   tenants it leaks actor ids and change details. Writable by anyone it lets
--   an unauthenticated caller rewrite or extend the chain, which is the single
--   worst outcome for an audit product.
--
-- FIX
--
--   1. A helper that applies the parent's RLS posture to any partition.
--   2. Apply it to the existing `audit_logs_default`.
--   3. Rewrite `add_audit_log_month` so every *future* partition is secured at
--      creation. Without this, next month's partition silently re-opens the hole.
--   4. Regression tests in supabase/tests/05_partition_rls.sql, including a
--      negative case for a freshly created partition.

-- ---------------------------------------------------------------------------
-- 1. Helper
-- ---------------------------------------------------------------------------

-- Applies the same posture the parent has: RLS on, one org-scoped SELECT
-- policy, and no INSERT/UPDATE/DELETE policy at all (append-only, system specifications
-- §3.8). The parent is deliberately not granted UPDATE, so a partition must
-- not be either.
--
-- The policy body must stay byte-identical to the parent's or the two diverge.
-- Keeping it in one function is what stops that.
CREATE OR REPLACE FUNCTION audit_logs_secure_partition(p_partition TEXT) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  -- Validate FIRST. Checking after the ALTER would enable RLS on whatever it
  -- was handed and only then complain, so a typo in a caller's table name would
  -- quietly change that table's security posture.
  IF to_regclass(p_partition) IS NULL THEN
    RAISE EXCEPTION 'relation % does not exist', p_partition;
  END IF;
  IF NOT EXISTS (
    SELECT 1
      FROM pg_inherits h
      JOIN pg_class child  ON child.oid  = h.inhrelid
      JOIN pg_class parent ON parent.oid = h.inhparent
     WHERE child.relname  = p_partition
       AND parent.relname = 'audit_logs'
  ) THEN
    RAISE EXCEPTION '% is not a partition of audit_logs', p_partition;
  END IF;

  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', p_partition);

  EXECUTE format('DROP POLICY IF EXISTS audit_select_org ON %I', p_partition);
  EXECUTE format($pol$
    CREATE POLICY audit_select_org ON %I FOR SELECT
    USING (
      asset_id IN (SELECT id FROM assets WHERE org_id = (auth.jwt() ->> 'org_id')::uuid)
      OR change_event_id IN (SELECT id FROM change_events WHERE org_id = (auth.jwt() ->> 'org_id')::uuid)
      OR evidence_package_id IN (SELECT id FROM evidence_packages WHERE org_id = (auth.jwt() ->> 'org_id')::uuid)
    )
  $pol$, p_partition);

  -- Belt and braces: a partition must never carry write privileges for client
  -- roles, whatever a future migration grants on the parent. The RLS is the
  -- real control; this removes the capability as well.
  EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON %I FROM anon, authenticated', p_partition);
END;
$$;

COMMENT ON FUNCTION audit_logs_secure_partition(TEXT) IS
  'Apply parent RLS posture to an audit_logs partition. Idempotent. Must be called for every partition, including the DEFAULT one.';

-- ---------------------------------------------------------------------------
-- 2. Secure the existing default partition
-- ---------------------------------------------------------------------------

-- This is the live hole. audit_logs_default has been RLS-free since migration
-- 070000 applied.
SELECT audit_logs_secure_partition('audit_logs_default');

-- ---------------------------------------------------------------------------
-- 3. Secure every future partition at creation time
-- ---------------------------------------------------------------------------

-- The retention job calls this ahead of each month. The original body created a
-- bare partition and stopped, which is how the DEFAULT partition ended up
-- exposed. It now secures the partition in the same transaction, so there is no
-- window in which a new partition is world-readable.
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
    -- Immediately, same transaction. A partition must never exist unsecured,
    -- even briefly: an append landing in it during that window is unfiltered.
    PERFORM audit_logs_secure_partition(v_name);
  END IF;
END;
$$;

COMMENT ON FUNCTION add_audit_log_month(DATE) IS
  'Pre-create a monthly audit_logs partition and secure it in the same transaction. Idempotent.';
