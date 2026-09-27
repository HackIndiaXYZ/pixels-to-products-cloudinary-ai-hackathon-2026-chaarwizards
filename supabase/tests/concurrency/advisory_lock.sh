#!/usr/bin/env bash
# Phase 1 gate — concurrent append_audit_log serializes into ONE linear chain.
#
# pgTAP is single-connection and cannot exercise true concurrency, so this check
# drives two independent psql sessions that each append 50 rows for the SAME
# asset, COMMITTING after every append (see test_helpers.hammer_appends). Every
# append therefore contends for the per-asset pg_advisory_xact_lock. Without the
# lock the sessions would read the same previous_hash and FORK the chain; with
# it, the result is exactly 100 rows, a strictly linear chain, and no shared
# previous_hash. This proves serialization by the advisory lock, not by luck.
#
# Usage: supabase/tests/concurrency/advisory_lock.sh [container] [db_url]
set -euo pipefail

CONTAINER="${1:-supabase_db_cloudinary}"
DB=(docker exec -i "$CONTAINER" psql -U postgres -d postgres -qAt)

run() { "${DB[@]}" -c "$1"; }

run "SELECT test_helpers.reset_all();" >/dev/null

ASSET=$(run "WITH o AS (SELECT test_helpers.make_org('Conc') g),
                  p AS (SELECT test_helpers.make_project((SELECT g FROM o),'PC') g)
             SELECT test_helpers.make_asset((SELECT g FROM p),(SELECT g FROM o));")
echo "asset under contention: $ASSET"

run "CALL test_helpers.hammer_appends('$ASSET'::uuid, 'A', 50);" &
P1=$!
run "CALL test_helpers.hammer_appends('$ASSET'::uuid, 'B', 50);" &
P2=$!
wait "$P1"; wait "$P2"

ROWS=$(run "SELECT count(*) FROM audit_logs WHERE asset_id='$ASSET'::uuid;")
VERIFIES=$(run "SELECT verify_audit_chain('$ASSET'::uuid);")
BROKEN=$(run "WITH ordered AS (
                SELECT id, previous_hash,
                       lag(current_hash) OVER (ORDER BY id) AS prior_current
                FROM audit_logs WHERE asset_id='$ASSET'::uuid)
              SELECT count(*) FROM ordered
              WHERE id <> (SELECT min(id) FROM ordered)
                AND previous_hash IS DISTINCT FROM prior_current;")
FORKS=$(run "SELECT count(*) FROM (
               SELECT previous_hash FROM audit_logs WHERE asset_id='$ASSET'::uuid
               GROUP BY previous_hash HAVING count(*) > 1) f;")

run "SELECT test_helpers.reset_all();" >/dev/null

echo "rows=$ROWS chain_verifies=$VERIFIES broken_links=$BROKEN forked_previous_hashes=$FORKS"

fail=0
[ "$ROWS" = "100" ]     || { echo "FAIL: expected 100 rows, got $ROWS"; fail=1; }
[ "$VERIFIES" = "t" ]   || { echo "FAIL: chain did not verify"; fail=1; }
[ "$BROKEN" = "0" ]     || { echo "FAIL: $BROKEN broken chain links"; fail=1; }
[ "$FORKS" = "0" ]      || { echo "FAIL: $FORKS forked previous_hash values"; fail=1; }

if [ "$fail" = "0" ]; then
  echo "PASS: concurrent appends serialized into one linear, verifiable chain"
else
  exit 1
fi
