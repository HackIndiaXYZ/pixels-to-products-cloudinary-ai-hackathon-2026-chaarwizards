-- Phase 1 gate — audit hash chain: 3 appends verify; the chain reproduces from
-- the STORED hashed_at (not clock_timestamp/created_at); tampering is detected.

BEGIN;
SELECT plan(5);

SELECT test_helpers.reset_all();
SELECT test_helpers.make_org('Org Chain') AS org_c \gset
SELECT test_helpers.make_project(:'org_c', 'PC') AS proj_c \gset
SELECT test_helpers.make_asset(:'proj_c', :'org_c') AS asset_c \gset

SELECT append_audit_log(:'asset_c'::uuid, 'upload', 'device', 'device-123', '{"step":1}'::jsonb, '{"step":1}');
SELECT append_audit_log(:'asset_c'::uuid, 'verify', 'system', 'api',        '{"step":2}'::jsonb, '{"step":2}');
SELECT append_audit_log(:'asset_c'::uuid, 'tag',    'ml_model', 'ml_v1',    '{"step":3}'::jsonb, '{"step":3}');

SELECT is(
  (SELECT count(*)::int FROM audit_logs WHERE asset_id = :'asset_c'::uuid),
  3,
  'three audit rows were appended'
);

SELECT ok(
  verify_audit_chain(:'asset_c'::uuid),
  'the 3-row chain verifies'
);

-- The first row's stored current_hash must reproduce from the STORED hashed_at.
SELECT is(
  (SELECT current_hash FROM audit_logs WHERE asset_id = :'asset_c'::uuid ORDER BY id ASC LIMIT 1),
  (SELECT encode(sha256(convert_to(
       'genesis'
       || '|' || action
       || '|' || actor_type
       || '|' || COALESCE(actor_id, '')
       || '|' || COALESCE(details_canonical, 'null')
       || '|' || to_char(hashed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
       'UTF8')), 'hex')
   FROM audit_logs WHERE asset_id = :'asset_c'::uuid ORDER BY id ASC LIMIT 1),
  'current_hash reproduces from the stored hashed_at'
);

-- Recomputing with created_at instead of hashed_at must NOT reproduce the hash,
-- proving hashed_at (clock_timestamp captured in-function) is the value hashed.
SELECT isnt(
  (SELECT current_hash FROM audit_logs WHERE asset_id = :'asset_c'::uuid ORDER BY id ASC LIMIT 1),
  (SELECT encode(sha256(convert_to(
       'genesis'
       || '|' || action
       || '|' || actor_type
       || '|' || COALESCE(actor_id, '')
       || '|' || COALESCE(details_canonical, 'null')
       || '|' || to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
       'UTF8')), 'hex')
   FROM audit_logs WHERE asset_id = :'asset_c'::uuid ORDER BY id ASC LIMIT 1),
  'created_at does NOT reproduce the hash (hashed_at is authoritative)'
);

-- Tamper with the middle row: the chain must now fail to verify.
UPDATE audit_logs
   SET details_canonical = '{"step":999}'
 WHERE asset_id = :'asset_c'::uuid
   AND id = (SELECT id FROM audit_logs WHERE asset_id = :'asset_c'::uuid ORDER BY id ASC OFFSET 1 LIMIT 1);

SELECT ok(
  NOT verify_audit_chain(:'asset_c'::uuid),
  'tampering with a stored row breaks chain verification'
);

SELECT * FROM finish();
ROLLBACK;
