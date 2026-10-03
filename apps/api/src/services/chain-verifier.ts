/**
 * Chain verifier (Phase — "Chain verifier: verifyChain(from, to)
 * walking audit_logs").
 *
 * The authoritative hash + link recomputation runs in Postgres
 * (`verify_audit_chain_range`), because the audit hash folds in the STORED
 * `hashed_at` rendered as microsecond UTC — a format a second serializer cannot
 * reproduce byte-for-byte . This module COMPOSES that with the
 * one check Postgres cannot do: that each row's raw `details` JSONB still
 * canonicalizes (RFC 8785) to its stored `details_canonical`. Together they
 * catch every tamper the gate names:
 *
 *   * a mutated `details_canonical` / `hashed_at` / `current_hash` → SQL
 *     `hash_mismatch`, naming the row;
 *   * a deleted intermediate row → SQL `broken_link` (gap), naming the survivor;
 *   * a mutated raw `details` column that leaves `details_canonical` intact →
 *     caught HERE by re-canonicalizing `details`, naming the row.
 *
 * A verifier that only checked chain links, or only the hash over
 * `details_canonical`, would pass a `details` tamper wrongly — so this check is
 * not optional decoration.
 */
import { canonicalize } from '@panchnama/shared';
import type { JsonValue } from '@panchnama/shared';
import type { AuditFullRow, ChainRangeResult, DbPort } from '../ports.js';
import type { AuthContext } from '../types.js';

export interface ChainVerificationFailure {
  readonly audit_id: number;
  readonly kind: 'broken_link' | 'hash_mismatch' | 'details_tampered';
  readonly reason: string;
}

export interface ChainVerificationResult {
  readonly asset_id: string;
  readonly ok: boolean;
  readonly checked: number;
  readonly first_id: number | null;
  readonly last_id: number | null;
  readonly tip_hash: string | null;
  readonly failure: ChainVerificationFailure | null;
}

/**
 * Pure RFC 8785 content-consistency check over already-fetched rows. Returns the
 * first row whose raw `details` does not re-canonicalize to its stored
 * `details_canonical`, or null if all rows are consistent. Exported for unit
 * tests; a `details` tamper is invisible to the SQL hash (which is over
 * `details_canonical`), so this is the check that catches it.
 */
export function findDetailsTamper(rows: readonly AuditFullRow[]): ChainVerificationFailure | null {
  for (const row of rows) {
    // A row with neither raw details nor a stored canonical has nothing to check.
    if (row.details === null && (row.details_canonical === null || row.details_canonical === undefined)) {
      continue;
    }
    const recomputed = canonicalize((row.details ?? null) as JsonValue);
    const stored = row.details_canonical ?? canonicalize(null as unknown as JsonValue);
    if (recomputed !== stored) {
      return {
        audit_id: row.id,
        kind: 'details_tampered',
        reason: `row ${row.id} raw details do not canonicalize (RFC 8785) to its stored details_canonical`,
      };
    }
  }
  return null;
}

/**
 * Merge the SQL hash/link result with the TS content-consistency result,
 * reporting the EARLIEST failing row so the verdict is deterministic regardless
 * of which check fired.
 */
export function mergeChainResults(
  assetId: string,
  range: ChainRangeResult,
  detailsFailure: ChainVerificationFailure | null,
): ChainVerificationResult {
  const rangeFailure: ChainVerificationFailure | null = range.failure;
  let failure: ChainVerificationFailure | null = null;
  if (rangeFailure !== null && detailsFailure !== null) {
    failure = detailsFailure.audit_id < rangeFailure.audit_id ? detailsFailure : rangeFailure;
  } else {
    failure = rangeFailure ?? detailsFailure;
  }
  return {
    asset_id: assetId,
    ok: failure === null,
    checked: range.checked,
    first_id: range.first_id,
    last_id: range.last_id,
    tip_hash: range.tip_hash,
    failure,
  };
}

/**
 * Verify one asset's audit chain over the inclusive `audit_logs.id` range
 * `[from, to]` (null = the chain end). Resolves under the caller's RLS scope, so
 * a cross-org asset yields an empty chain (`checked: 0`), never another org's
 * rows.
 */
export async function verifyChain(
  db: DbPort,
  ctx: AuthContext,
  assetId: string,
  from: number | null,
  to: number | null,
): Promise<ChainVerificationResult> {
  const range = await db.audit.verifyChainRange(ctx, assetId, from, to);
  const rows = await db.audit.fullChainForAsset(ctx, assetId, from, to);
  const detailsFailure = findDetailsTamper(rows);
  return mergeChainResults(assetId, range, detailsFailure);
}
