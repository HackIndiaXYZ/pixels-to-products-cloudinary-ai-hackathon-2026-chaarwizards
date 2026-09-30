-- Phase 10 gate — chain verifier & public-safe receipt (real DB proof).
--
-- Proves the two named failure paths against real Postgres:
--   * tampering a stored value → verify_audit_chain_range returns hash_mismatch
--     naming that row (a link-only verifier would pass it wrongly);
--   * deleting an intermediate row → broken_link naming the surviving successor
--     (a gap-tolerant verifier would launder the deletion);
-- plus the intact-chain pass, and that report_verification_receipt is public-safe
-- (no org_id anywhere in its serialized output).

BEGIN;
SELECT plan(8);

SELECT test_helpers.reset_all();
SELECT test_helpers.make_org('Org Verify') AS org_v \gset
SELECT test_helpers.make_project(:'org_v', 'PV') AS proj_v \gset
SELECT test_helpers.make_asset(:'proj_v', :'org_v') AS asset_v \gset

SELECT append_audit_log(:'asset_v'::uuid, 'upload', 'device', 'device-123', '{"step":1}'::jsonb, '{"step":1}');
SELECT append_audit_log(:'asset_v'::uuid, 'verify', 'system', 'api',        '{"step":2}'::jsonb, '{"step":2}');
SELECT append_audit_log(:'asset_v'::uuid, 'tag',    'ml_model', 'ml_v1',    '{"step":3}'::jsonb, '{"step":3}');

-- 1. An intact chain verifies with ok=true and checked=3.
SELECT is(
  (verify_audit_chain_range(:'asset_v'::uuid, NULL, NULL)->>'ok')::boolean,
  true,
  'intact chain verifies (ok=true)'
);
SELECT is(
  (verify_audit_chain_range(:'asset_v'::uuid, NULL, NULL)->>'checked')::int,
  3,
  'intact chain reports 3 rows checked'
);

-- 2. Tamper the middle row's stored content. verify must FAIL with hash_mismatch
--    naming that exact row.
SELECT id AS mid_id FROM audit_logs WHERE asset_id = :'asset_v'::uuid ORDER BY id ASC OFFSET 1 LIMIT 1 \gset

UPDATE audit_logs SET details_canonical = '{"step":999}'
 WHERE id = :'mid_id' AND asset_id = :'asset_v'::uuid;

SELECT is(
  (verify_audit_chain_range(:'asset_v'::uuid, NULL, NULL)->>'ok')::boolean,
  false,
  'tampering a stored value fails verification'
);
SELECT is(
  (verify_audit_chain_range(:'asset_v'::uuid, NULL, NULL)->'failure'->>'kind'),
  'hash_mismatch',
  'a tampered value is reported as hash_mismatch, not a link error'
);
SELECT is(
  (verify_audit_chain_range(:'asset_v'::uuid, NULL, NULL)->'failure'->>'audit_id')::bigint,
  :'mid_id'::bigint,
  'the failure names the tampered row'
);

-- Undo the tamper, then delete the middle row to prove GAP detection.
UPDATE audit_logs SET details_canonical = '{"step":2}'
 WHERE id = :'mid_id' AND asset_id = :'asset_v'::uuid;

SELECT id AS last_id FROM audit_logs WHERE asset_id = :'asset_v'::uuid ORDER BY id DESC LIMIT 1 \gset

DELETE FROM audit_logs WHERE id = :'mid_id' AND asset_id = :'asset_v'::uuid;

SELECT is(
  (verify_audit_chain_range(:'asset_v'::uuid, NULL, NULL)->'failure'->>'kind'),
  'broken_link',
  'a deleted intermediate row is detected as a gap (broken_link), not skipped'
);
SELECT is(
  (verify_audit_chain_range(:'asset_v'::uuid, NULL, NULL)->'failure'->>'audit_id')::bigint,
  :'last_id'::bigint,
  'the gap is named at the surviving successor row'
);

-- 3. Public-safe receipt: build a package for the asset and assert its serialized
--    receipt contains no org_id.
SELECT test_helpers.make_asset(:'proj_v', :'org_v') AS asset_r \gset
INSERT INTO evidence_packages (project_id, org_id, name, asset_ids, status, template_version, byte_size)
VALUES (:'proj_v', :'org_v', 'Receipt Report', ARRAY[:'asset_r'::uuid], 'finalized', 'forestry_donor@1', 4096)
RETURNING id AS report_id \gset

SELECT ok(
  position(:'org_v' IN report_verification_receipt(:'report_id'::uuid)::text) = 0,
  'the verification receipt leaks no org_id'
);

SELECT * FROM finish();
ROLLBACK;
