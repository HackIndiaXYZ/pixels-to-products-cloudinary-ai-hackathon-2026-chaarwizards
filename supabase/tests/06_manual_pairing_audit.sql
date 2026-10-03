-- Phase 7 gate — manual relink appends to the audit chain (architecture specification §Phase 7,
-- "Deferred to user review": "manual relink appends to the audit chain").
--
-- routes/pairs.ts appends to the per-asset hash chain on BOTH manual operations:
--   POST /v1/pairs          -> action 'pair'  (details.method = 'manual_link')
--   POST /v1/pairs/:id/split -> action 'split' (details.method = 'manual_split')
-- Both go through the same append_audit_log the ML/ingest paths use, so the
-- chain must still reproduce from the STORED hashed_at after a manual override,
-- and tampering with a manual row must break verification .
--
-- This drives the SQL layer directly (append_audit_log + verify_audit_chain),
-- the same RPCs plugins/supabase.ts calls, so it exercises the real hash chain
-- rather than an in-memory fake.

BEGIN;
SELECT plan(6);

SELECT test_helpers.reset_all();
SELECT test_helpers.make_org('Org Manual Pair')            AS org_m  \gset
SELECT test_helpers.make_project(:'org_m', 'PM')           AS proj_m \gset
SELECT test_helpers.make_asset(:'proj_m', :'org_m')        AS before_a \gset
SELECT test_helpers.make_asset(:'proj_m', :'org_m')        AS after_a  \gset

-- An existing chain on the "after" asset (its ingest/verify history) before any
-- manual override touches it. The manual pair/split rows must extend THIS chain.
SELECT append_audit_log(:'after_a'::uuid, 'upload', 'device', 'device-1', '{"step":1}'::jsonb, '{"step":1}');
SELECT append_audit_log(:'after_a'::uuid, 'verify', 'system', 'api',      '{"step":2}'::jsonb, '{"step":2}');

-- Manual relink: mirrors routes/pairs.ts POST /v1/pairs (actor_type 'user').
SELECT append_audit_log(
  :'after_a'::uuid, 'pair', 'user', 'reviewer-1',
  '{"method":"manual_link"}'::jsonb, '{"method":"manual_link"}'
);

SELECT ok(
  verify_audit_chain(:'after_a'::uuid),
  'chain verifies after a manual relink (pair) append'
);

-- Manual split: mirrors routes/pairs.ts POST /v1/pairs/:id/split.
SELECT append_audit_log(
  :'after_a'::uuid, 'split', 'user', 'reviewer-1',
  '{"method":"manual_split"}'::jsonb, '{"method":"manual_split"}'
);

SELECT ok(
  verify_audit_chain(:'after_a'::uuid),
  'chain still verifies after a manual split append'
);

-- Both manual operations landed as real, distinct audit rows.
SELECT is(
  (SELECT count(*)::int FROM audit_logs
     WHERE asset_id = :'after_a'::uuid AND action IN ('pair', 'split')),
  2,
  'the manual relink and split each appended one audit row'
);

-- The manual rows are attributed to a 'user' actor, never to a model — a manual
-- link carries no CV metric (routes/pairs.ts, system invariants).
SELECT is(
  (SELECT actor_type FROM audit_logs
     WHERE asset_id = :'after_a'::uuid AND action = 'pair' LIMIT 1),
  'user',
  'the manual pair row is recorded with a user actor'
);

-- The split row records the manual_split method in its canonical details.
SELECT is(
  (SELECT details_canonical FROM audit_logs
     WHERE asset_id = :'after_a'::uuid AND action = 'split' LIMIT 1),
  '{"method":"manual_split"}',
  'the split row stores its canonical manual_split details'
);

-- Tamper with the stored manual-pair row: verification must now fail, so a
-- forged manual override cannot pass off as an intact chain (§3.8).
UPDATE audit_logs
   SET details_canonical = '{"method":"manual_link_TAMPERED"}'
 WHERE asset_id = :'after_a'::uuid
   AND action = 'pair';

SELECT ok(
  NOT verify_audit_chain(:'after_a'::uuid),
  'tampering with the manual-pair row breaks chain verification'
);

SELECT * FROM finish();
ROLLBACK;
