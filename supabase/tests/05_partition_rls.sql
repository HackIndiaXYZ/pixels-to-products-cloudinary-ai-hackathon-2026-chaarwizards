-- Phase 1 gate — audit_logs PARTITION row-level security.
--
-- Regression test for a P0 cross-tenant leak plus unauthenticated audit-trail
-- forgery. `audit_logs` is PARTITION BY RANGE and its partitions do not inherit
-- the parent's RLS, so `audit_logs_default` was a fully-privileged, RLS-free
-- base table that PostgREST exposes at /rest/v1/audit_logs_default. Before the
-- fix, `anon` read every audit row and could INSERT forged ones.
--
-- Every assertion here reads the PARTITION DIRECTLY. Reading the parent is not
-- a substitute: the parent was always correct, and that is precisely why the
-- original suite passed while the partition leaked.
--
-- Fix: supabase/migrations/20260927130000_audit_logs_partition_rls.sql

BEGIN;
SELECT plan(17);

SELECT test_helpers.reset_all();

SELECT test_helpers.make_org('Org A') AS org_a \gset
SELECT test_helpers.make_org('Org B') AS org_b \gset
SELECT test_helpers.make_project(:'org_a', 'PA') AS proj_a \gset
SELECT test_helpers.make_project(:'org_b', 'PB') AS proj_b \gset
SELECT test_helpers.make_asset(:'proj_a', :'org_a') AS asset_a \gset
SELECT test_helpers.make_asset(:'proj_b', :'org_b') AS asset_b \gset

-- One audit row per org, so a leak is distinguishable from an empty table.
SELECT append_audit_log(:'asset_a', 'create', 'user', 'actor_a', '{"who":"a"}'::jsonb, '{}') AS r_a \gset
SELECT append_audit_log(:'asset_b', 'create', 'user', 'actor_b', '{"who":"b"}'::jsonb, '{}') AS r_b \gset

-- Both rows land in the DEFAULT partition, since no monthly partition exists yet.
SELECT is(
  (SELECT count(*)::int FROM audit_logs_default),
  2,
  'sanity: both orgs rows are present in audit_logs_default before the test'
);

-- ---- 1. RLS posture of the existing partition ----

SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'audit_logs_default'),
  'audit_logs_default has RLS enabled'
);

-- ---- 2. Unauthenticated caller: this is the exploit ----

SELECT test_helpers.clear_claims();
SET LOCAL ROLE anon;

SELECT is(
  (SELECT count(*)::int FROM audit_logs_default),
  0,
  'anon reads 0 rows from the partition (was: every orgs audit row)'
);

SELECT throws_ok(
  $$ INSERT INTO audit_logs_default (asset_id, action, actor_type, actor_id, details, details_canonical, current_hash, hashed_at)
     VALUES (NULL, 'forged', 'system', 'attacker', '{}'::jsonb, '{}', 'h', now()) $$,
  NULL,
  NULL,
  'anon cannot INSERT a forged audit row (RLS on, no INSERT policy)'
);

SELECT throws_ok(
  $$ UPDATE audit_logs_default SET action = 'tampered' $$,
  NULL,
  NULL,
  'anon cannot UPDATE the audit trail through the partition'
);

SELECT throws_ok(
  $$ DELETE FROM audit_logs_default $$,
  NULL,
  NULL,
  'anon cannot DELETE audit rows through the partition'
);

RESET ROLE;

SELECT is(
  (SELECT count(*)::int FROM audit_logs_default WHERE actor_id = 'forged'),
  0,
  'the forged row did not persist'
);

-- ---- 3. Cross-tenant read: Org A must not see Org B ----

SELECT test_helpers.set_claims(:'org_a', 'member');
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT count(*)::int FROM audit_logs_default WHERE actor_id = 'actor_b'),
  0,
  'Org A member cannot read Org B rows via the partition (the cross-tenant leak)'
);

SELECT is(
  (SELECT count(*)::int FROM audit_logs_default WHERE actor_id = 'actor_a'),
  1,
  'Org A member still reads its own row via the partition'
);

-- Regression guard on the fix itself: the parent path must keep working. A fix
-- that secures the partition by breaking legitimate reads is not a fix.
SELECT is(
  (SELECT count(*)::int FROM audit_logs),
  1,
  'Org A member still reads exactly its own row through the parent table'
);

RESET ROLE;

-- ---- 4. Client roles hold no write privilege on the partition ----

SELECT is(
  (SELECT count(*)::int
     FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name   = 'audit_logs_default'
      AND grantee      IN ('anon', 'authenticated')
      AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')),
  0,
  'anon and authenticated hold no write grant on the partition'
);

-- ---- 5. Future partitions are secured at creation, not afterwards ----
--
-- Without this, next month's partition re-opens the identical hole, because
-- add_audit_log_month used to create a bare partition and stop.

SELECT add_audit_log_month(DATE '2026-10-01');

SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'audit_logs_202610'),
  'a partition created by add_audit_log_month has RLS enabled'
);

SELECT test_helpers.set_claims(:'org_b', 'member');
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT count(*)::int FROM audit_logs_202610),
  0,
  'Org B member reads 0 rows from the fresh partition (Org A row is not there)'
);

RESET ROLE;
SELECT test_helpers.clear_claims();

-- ---- 6. The helper refuses a table that is not an audit_logs partition ----
--
-- Guards the ordering bug this migration was written with: if validation ran
-- after the ALTER, the named table would have RLS switched on and the helper
-- would only then complain. So the probe table must start with RLS OFF, or a
-- change would be invisible.

CREATE TABLE zz_not_a_partition (id int);

SELECT is(
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'zz_not_a_partition'),
  false,
  'sanity: the probe table starts with RLS disabled'
);

SELECT throws_ok(
  $$ SELECT audit_logs_secure_partition('zz_not_a_partition') $$,
  NULL,
  NULL,
  'audit_logs_secure_partition refuses a non-partition table'
);

SELECT is(
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'zz_not_a_partition'),
  false,
  'the refused call did not enable RLS on the table it was handed'
);

SELECT throws_ok(
  $$ SELECT audit_logs_secure_partition('no_such_table_at_all') $$,
  NULL,
  NULL,
  'audit_logs_secure_partition refuses a relation that does not exist'
);

DROP TABLE zz_not_a_partition;

SELECT * FROM finish();
ROLLBACK;
